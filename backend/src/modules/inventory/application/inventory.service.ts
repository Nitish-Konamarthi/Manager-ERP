import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'
import { runTransaction } from '../../../common/utils/transaction.util'
import { advisoryLock, hashProductId } from '../../../common/utils/lock.util'

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ── Batches ──

  async createBatch(orgId: string, userId: string, data: {
    shopId?: string; productId: string; batchCode: string; receivedDate: string;
    supplierId?: string; purchasePrice: number; sellingPrice?: number;
    receivedQty: number; unitCost: number; grade?: string; location?: string; notes?: string;
  }) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, organizationId: orgId, deletedAt: null },
    })
    if (!product) throw new NotFoundException('Product not found')

    const existing = await this.prisma.stockBatch.findFirst({
      where: { organizationId: orgId, batchCode: data.batchCode, deletedAt: null },
    })
    if (existing) throw new ConflictException('Batch code already exists')

    return this.prisma.stockBatch.create({
      data: {
        organizationId: orgId,
        shopId: data.shopId,
        productId: data.productId,
        batchCode: data.batchCode,
        receivedDate: new Date(data.receivedDate),
        supplierId: data.supplierId,
        purchasePrice: data.purchasePrice,
        sellingPrice: data.sellingPrice,
        receivedQty: data.receivedQty,
        availableQty: data.receivedQty,
        unitCost: data.unitCost,
        grade: data.grade,
        location: data.location,
        notes: data.notes,
        createdById: userId,
        status: data.receivedQty > 0 ? 'AVAILABLE' : 'COMPLETED',
      },
      include: { product: true, supplier: true, shop: true },
    })
  }

  async findBatches(orgId: string, params: {
    page?: number; limit?: number; search?: string; productId?: string;
    shopId?: string; status?: string; supplierId?: string; sort?: string; order?: 'asc' | 'desc'
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId, deletedAt: null }
    if (params.search) where.batchCode = { contains: params.search, mode: 'insensitive' }
    if (params.productId) where.productId = params.productId
    if (params.shopId) where.shopId = params.shopId
    if (params.status) where.status = params.status
    if (params.supplierId) where.supplierId = params.supplierId

    const orderBy: any = {}
    if (params.sort) {
      orderBy[params.sort] = params.order || 'desc'
    } else {
      orderBy.createdAt = 'desc'
    }

    const [items, total] = await Promise.all([
      this.prisma.stockBatch.findMany({
        where, skip, take, orderBy,
        include: { product: true, supplier: true, shop: true },
      }),
      this.prisma.stockBatch.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findBatchById(orgId: string, id: string) {
    const batch = await this.prisma.stockBatch.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { product: true, supplier: true, shop: true, movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
    })
    if (!batch) throw new NotFoundException('Batch not found')
    return batch
  }

  async updateBatch(orgId: string, id: string, data: {
    sellingPrice?: number; grade?: string; location?: string; notes?: string
  }) {
    const batch = await this.prisma.stockBatch.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    })
    if (!batch) throw new NotFoundException('Batch not found')
    return this.prisma.stockBatch.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: { product: true },
    })
  }

  // ── Stock Movements ──

  async findMovements(orgId: string, params: {
    page?: number; limit?: number; batchId?: string; productId?: string;
    movementType?: string; fromDate?: string; toDate?: string
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId }
    if (params.batchId) where.batchId = params.batchId
    if (params.productId) where.productId = params.productId
    if (params.movementType) where.movementType = params.movementType
    if (params.fromDate || params.toDate) {
      where.createdAt = {}
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate)
      if (params.toDate) where.createdAt.lte = new Date(params.toDate)
    }
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { batch: true, product: true },
      }),
      this.prisma.stockMovement.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  // ── Adjustments (with pessimistic locking) ──

  async adjustStock(orgId: string, userId: string, data: {
    batchId: string; adjustmentType: string; quantity: number; reason: string
  }) {
    return runTransaction(this.prisma, async tx => {
      const [batch] = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "stock_batches" WHERE id = $1 FOR UPDATE`,
        data.batchId,
      )
      if (!batch || batch.organizationId !== orgId) throw new NotFoundException('Batch not found')
      if (batch.deletedAt) throw new BadRequestException('Batch is deleted')

      const currentAvail = Number(batch.availableQty)
      const newQty = currentAvail + data.quantity
      if (newQty < 0) throw new BadRequestException('Insufficient stock')

      const movementType = data.quantity > 0 ? 'ADJUSTED' : 'WRITTEN_OFF'

      await tx.stockMovement.create({
        data: {
          organizationId: orgId,
          batchId: data.batchId,
          productId: batch.productId,
          movementType,
          quantity: data.quantity,
          unitCost: batch.unitCost,
          totalCost: Number(batch.unitCost) * Math.abs(data.quantity),
          notes: data.reason,
          createdById: userId,
        },
      })

      await tx.inventoryAdjustment.create({
        data: {
          organizationId: orgId,
          batchId: data.batchId,
          productId: batch.productId,
          adjustmentType: data.adjustmentType,
          quantity: data.quantity,
          previousQty: currentAvail,
          newQty,
          reason: data.reason,
          createdById: userId,
        },
      })

      return tx.stockBatch.update({
        where: { id: data.batchId },
        data: {
          availableQty: newQty,
          version: { increment: 1 },
          status: newQty <= 0 ? 'COMPLETED' : batch.status,
        },
      })
    }, { isolation: 'RepeatableRead', maxRetries: 3 })
  }

  // ── Reservations (FIFO with row locking) ──

  async reserveStock(orgId: string, userId: string, data: {
    productId: string; quantity: number; referenceType: string; referenceId: string
  }) {
    const productHash = hashProductId(data.productId)

    return runTransaction(this.prisma, async tx => {
      // Advisory lock per product — serializes all reservations for this product
      const locked = await advisoryLock(tx, 1, productHash)
      if (!locked) throw new ConflictException('Could not acquire lock. Try again.')

      const batches = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "stock_batches"
         WHERE organization_id = $1
           AND product_id = $2
           AND deleted_at IS NULL
           AND (available_qty - reserved_qty) > 0
           AND status IN ('AVAILABLE', 'PARTIALLY_RESERVED')
         ORDER BY received_date ASC, created_at ASC
         FOR UPDATE`,
        orgId, data.productId,
      )

      let remaining = data.quantity
      const reservations: any[] = []

      for (const batch of batches) {
        if (remaining <= 0) break
        const free = Number(batch.availableQty) - Number(batch.reservedQty)
        if (free <= 0) continue
        const allocate = Math.min(free, remaining)

        // Atomic update with guard condition — prevents overselling
        const updated = await tx.$executeRawUnsafe(
          `UPDATE "stock_batches"
           SET reserved_qty = reserved_qty + $1,
               status = CASE
                 WHEN (available_qty - reserved_qty - $1) <= 0 THEN 'FULLY_RESERVED'
                 ELSE 'PARTIALLY_RESERVED'
               END,
               version = version + 1
           WHERE id = $2
             AND (available_qty - reserved_qty) >= $1`,
          allocate, batch.id,
        )
        if (updated === 0) {
          throw new ConflictException('Stock changed during reservation — retry')
        }

        const reservation = await tx.stockReservation.create({
          data: {
            organizationId: orgId,
            batchId: batch.id,
            productId: data.productId,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            quantity: allocate,
            createdById: userId,
          },
        })
        reservations.push(reservation)

        await tx.stockMovement.create({
          data: {
            organizationId: orgId,
            batchId: batch.id,
            productId: data.productId,
            movementType: 'RESERVED',
            quantity: -allocate,
            unitCost: batch.unitCost,
            totalCost: Number(batch.unitCost) * allocate,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            createdById: userId,
          },
        })

        remaining -= allocate
      }

      if (remaining > 0) {
        throw new BadRequestException(
          `Insufficient stock. Only ${data.quantity - remaining} of ${data.quantity} available.`,
        )
      }

      return reservations
    }, { isolation: 'RepeatableRead', maxRetries: 5 })
  }

  async releaseReservation(orgId: string, reservationId: string) {
    return runTransaction(this.prisma, async tx => {
      const reservation = await tx.stockReservation.findUnique({
        where: { id: reservationId },
        include: { batch: true },
      })
      if (!reservation || reservation.organizationId !== orgId) {
        throw new NotFoundException('Reservation not found')
      }

      await tx.stockBatch.update({
        where: { id: reservation.batchId },
        data: {
          reservedQty: { decrement: Number(reservation.quantity) },
          status: 'AVAILABLE',
          version: { increment: 1 },
        },
      })

      await tx.stockMovement.create({
        data: {
          organizationId: orgId,
          batchId: reservation.batchId,
          productId: reservation.productId,
          movementType: 'RELEASED',
          quantity: Number(reservation.quantity),
          unitCost: reservation.batch.unitCost,
          totalCost: Number(reservation.batch.unitCost) * Number(reservation.quantity),
          referenceType: reservation.referenceType,
          referenceId: reservation.referenceId,
          createdById: reservation.createdById,
        },
      })

      await tx.stockReservation.delete({ where: { id: reservationId } })

      return { released: true, reservationId }
    }, { isolation: 'ReadCommitted', maxRetries: 3 })
  }

  // ── Valuation (read-only) ──

  async getValuation(orgId: string, productId?: string, shopId?: string) {
    const where: any = { organizationId: orgId, deletedAt: null, availableQty: { gt: 0 } }
    if (productId) where.productId = productId
    if (shopId) where.shopId = shopId

    const batches = await this.prisma.stockBatch.findMany({
      where,
      include: { product: true },
      orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    })

    let totalFifoValue = 0
    let totalQty = 0
    let totalWAValue = 0

    for (const b of batches) {
      const avail = Number(b.availableQty) - Number(b.reservedQty)
      if (avail <= 0) continue
      totalFifoValue += Number(b.unitCost) * Number(avail)
      totalQty += Number(avail)
      totalWAValue += Number(b.unitCost) * Number(avail)
    }
    const weightedAvg = totalQty > 0 ? totalWAValue / totalQty : 0

    return {
      fifoValue: totalFifoValue,
      weightedAverage: weightedAvg,
      totalQuantity: totalQty,
      batchCount: batches.length,
      details: batches.filter(b => Number(b.availableQty) - Number(b.reservedQty) > 0).map(b => ({
        id: b.id,
        batchCode: b.batchCode,
        product: b.product.name,
        availableQty: b.availableQty,
        reservedQty: b.reservedQty,
        unitCost: b.unitCost,
        fifoValue: Number(b.unitCost) * (Number(b.availableQty) - Number(b.reservedQty)),
        receivedDate: b.receivedDate,
        grade: b.grade,
      })),
    }
  }

  // ── Aging Analysis (read-only) ──

  async getAging(orgId: string, productId?: string, shopId?: string) {
    const where: any = { organizationId: orgId, deletedAt: null, availableQty: { gt: 0 } }
    if (productId) where.productId = productId
    if (shopId) where.shopId = shopId

    const batches = await this.prisma.stockBatch.findMany({
      where,
      include: { product: true },
      orderBy: { receivedDate: 'asc' },
    })

    const now = new Date()
    const buckets = [
      { label: '0-7 days', min: 0, max: 7, batches: [] as string[], qty: 0, value: 0 },
      { label: '8-15 days', min: 8, max: 15, batches: [] as string[], qty: 0, value: 0 },
      { label: '16-30 days', min: 16, max: 30, batches: [] as string[], qty: 0, value: 0 },
      { label: '31-60 days', min: 31, max: 60, batches: [] as string[], qty: 0, value: 0 },
      { label: '60+ days', min: 61, max: Infinity, batches: [] as string[], qty: 0, value: 0 },
    ]

    for (const b of batches) {
      const age = Math.floor((now.getTime() - new Date(b.receivedDate).getTime()) / (1000 * 86400))
      const avail = Number(b.availableQty) - Number(b.reservedQty)
      if (avail <= 0) continue
      const bucket = buckets.find(bk => age >= bk.min && age <= bk.max)
      if (bucket) {
        bucket.batches.push(b.id)
        bucket.qty += avail
        bucket.value += Number(b.unitCost) * avail
      }
    }

    return {
      asOf: now.toISOString(),
      buckets: buckets.filter(b => b.qty > 0),
      totalQty: buckets.reduce((s, b) => s + b.qty, 0),
      totalValue: buckets.reduce((s, b) => s + b.value, 0),
    }
  }

  // ── Daily Closing ──

  async closeDaily(orgId: string, date: string, shopId?: string) {
    const closeDate = new Date(date)
    const where: any = { organizationId: orgId, deletedAt: null }
    if (shopId) where.shopId = shopId

    const batches = await this.prisma.stockBatch.findMany({
      where,
      include: { product: true },
    })

    const productMap = new Map<string, { opening: number; received: number; sold: number; adjusted: number }>()

    for (const b of batches) {
      const key = `${b.productId}:${b.shopId || 'none'}`
      if (!productMap.has(key)) {
        productMap.set(key, { opening: 0, received: 0, sold: 0, adjusted: 0 })
      }
      const p = productMap.get(key)!

      const movements = await this.prisma.stockMovement.findMany({
        where: { batchId: b.id, createdAt: { lt: closeDate } },
      })

      let running = 0
      for (const m of movements) {
        if (m.movementType === 'RECEIVED') running += Number(m.quantity)
        else if (['SOLD', 'WRITTEN_OFF', 'TRANSFERRED_OUT'].includes(m.movementType)) running -= Math.abs(Number(m.quantity))
      }

      p.opening = running
      p.received += Number(
        movements.filter(m => m.movementType === 'RECEIVED').reduce((s, m) => s + Number(m.quantity), 0),
      )
      p.sold += Number(
        movements.filter(m => m.movementType === 'SOLD').reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
      )
      p.adjusted += Number(
        movements.filter(m => m.movementType === 'ADJUSTED').reduce((s, m) => s + Number(m.quantity), 0),
      )
    }

    const snapshots: any[] = []
    for (const [key, vals] of productMap) {
      const [productId, shop] = key.split(':')
      const shopIdVal = shop === 'none' ? null : shop
      const closing = vals.opening + vals.received - vals.sold + vals.adjusted

      snapshots.push({
        organizationId: orgId,
        shopId: shopIdVal,
        productId,
        snapshotDate: closeDate,
        openingQty: vals.opening,
        receivedQty: vals.received,
        soldQty: vals.sold,
        adjustedQty: vals.adjusted,
        closingQty: Math.max(0, closing),
      })
    }

    if (snapshots.length > 0) {
      for (const s of snapshots) {
        if (s.shopId) {
          await this.prisma.dailyStockSnapshot.upsert({
            where: {
              organizationId_shopId_productId_snapshotDate: {
                organizationId: s.organizationId,
                shopId: s.shopId,
                productId: s.productId,
                snapshotDate: s.snapshotDate,
              },
            },
            create: s,
            update: s,
          })
        } else {
          const existing = await this.prisma.dailyStockSnapshot.findFirst({
            where: {
              organizationId: s.organizationId,
              shopId: null,
              productId: s.productId,
              snapshotDate: s.snapshotDate,
            },
          })
          if (existing) {
            await this.prisma.dailyStockSnapshot.update({
              where: { id: existing.id },
              data: s,
            })
          } else {
            await this.prisma.dailyStockSnapshot.create({ data: s })
          }
        }
      }
    }

    return { message: `Daily closing complete for ${closeDate.toISOString().split('T')[0]}`, snapshots: snapshots.length }
  }

  // ── Dashboard Stats ──

  async getDashboard(orgId: string) {
    const [
      totalBatches,
      totalProducts,
      lowStockBatches,
      recentMovements,
      totalValue,
    ] = await Promise.all([
      this.prisma.stockBatch.count({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.product.count({ where: { organizationId: orgId, deletedAt: null, isActive: true } }),
      this.prisma.stockBatch.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { product: true },
      }),
      this.prisma.stockMovement.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { batch: true, product: true },
      }),
      this.getValuation(orgId),
    ])

    const lowStock = lowStockBatches.filter(b => {
      const avail = Number(b.availableQty) - Number(b.reservedQty)
      return avail > 0 && avail < 10
    })

    return {
      totalBatches,
      totalProducts,
      lowStockCount: lowStock.length,
      totalStockValue: totalValue.fifoValue,
      totalQuantity: totalValue.totalQuantity,
      recentMovements,
    }
  }
}
