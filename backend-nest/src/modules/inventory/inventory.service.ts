import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, SelectQueryBuilder, EntityManager } from 'typeorm'
import { v4 as uuid } from 'uuid'
import { StockBatch, StockMovement, StockReservation, InventoryAdjustment, DailyStockSnapshot } from '../../database/entities/inventory.entity'
import { PaginationUtil } from '../../common/utils/pagination.util'
import { FilteringUtil } from '../../common/utils/filtering.util'
import { SortingUtil } from '../../common/utils/sorting.util'
import {
  CreateBatchDto, UpdateBatchDto, BatchFilterDto, CreateMovementDto, CreateAdjustmentDto,
  CreateReservationDto, BestBatchReservationDto, ReleaseReservationDto,
  CreateTransferDto, BulkCreateBatchDto, BulkUpdateBatchDto, ComputeDailyClosingDto,
} from './dto/inventory.dto'
import { PaginatedResult, CursorResult, PaginationParams } from '../../common/interfaces/pagination.interface'
import { PaginationDto, CursorPaginationDto } from '../../common/dto/pagination.dto'

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name)
  private readonly ALLOWED_SORT = ['batchCode', 'receivedDate', 'expiryDate', 'availableQty', 'costPrice', 'grade', 'status', 'createdAt']

  constructor(
    @InjectRepository(StockBatch)
    private batchRepo: Repository<StockBatch>,
    @InjectRepository(StockMovement)
    private movementRepo: Repository<StockMovement>,
    @InjectRepository(StockReservation)
    private reservationRepo: Repository<StockReservation>,
    @InjectRepository(InventoryAdjustment)
    private adjustmentRepo: Repository<InventoryAdjustment>,
    @InjectRepository(DailyStockSnapshot)
    private snapshotRepo: Repository<DailyStockSnapshot>,
    private dataSource: DataSource,
  ) {}

  // ── BATCH CRUD ──

  async createBatch(dto: CreateBatchDto, userId: string): Promise<StockBatch> {
    return this.dataSource.transaction(async manager => {
      const batch = manager.create(StockBatch, {
        id: uuid(),
        batchCode: dto.batchCode,
        produceId: dto.produceId,
        storeId: dto.storeId,
        supplierId: dto.supplierId,
        receivedDate: dto.receivedDate,
        expiryDate: dto.expiryDate,
        receivedQty: dto.receivedQty,
        availableQty: dto.receivedQty,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        grade: dto.grade || 'A',
        locationZone: dto.locationZone,
        status: 'available',
        openingQty: dto.receivedQty,
        createdBy: userId,
      })
      const saved = await manager.save(StockBatch, batch)

      // Record initial movement
      await manager.save(StockMovement, {
        id: uuid(),
        batchId: saved.id,
        produceId: dto.produceId,
        storeId: dto.storeId,
        movementType: 'received',
        quantity: dto.receivedQty,
        quantityBefore: 0,
        quantityAfter: dto.receivedQty,
        unitCost: dto.costPrice,
        totalValue: dto.receivedQty * dto.costPrice,
        createdBy: userId,
      })

      this.logger.log(`Batch created: ${saved.batchCode} (${saved.id})`)
      return saved
    })
  }

  async getBatches(
    pagination: PaginationDto,
    filters: BatchFilterDto,
  ): Promise<PaginatedResult<StockBatch>> {
    const qb = this.batchRepo.createQueryBuilder('entity')
      .leftJoinAndSelect('entity.storeId', 'store')
      .leftJoinAndSelect('entity.produceId', 'produce')

    // Apply filters
    if (filters.storeId) qb.andWhere('entity.storeId = :storeId', { storeId: filters.storeId })
    if (filters.produceId) qb.andWhere('entity.produceId = :produceId', { produceId: filters.produceId })
    if (filters.status) qb.andWhere('entity.status = :status', { status: filters.status })
    if (filters.grade) qb.andWhere('entity.grade = :grade', { grade: filters.grade })
    if (filters.age === 'expiring') {
      qb.andWhere('entity.expiryDate IS NOT NULL AND entity.expiryDate >= date("now") AND entity.expiryDate <= date("now", "+2 days") AND entity.availableQty > 0')
    }
    if (filters.age === 'expired') {
      qb.andWhere('entity.expiryDate IS NOT NULL AND entity.expiryDate < date("now") AND entity.availableQty > 0')
    }
    if (filters.age === 'fresh') {
      qb.andWhere('(entity.expiryDate IS NULL OR entity.expiryDate > date("now", "+2 days")) AND entity.availableQty > 0')
    }

    // Apply advanced JSON filter
    if (filters.filter) {
      FilteringUtil.applyFilters(qb, FilteringUtil.parseFilterString(filters.filter))
    }

    qb.andWhere('entity.deletedAt IS NULL')

    const params: PaginationParams = { page: pagination.page || 1, limit: pagination.limit || 20, sort: pagination.sort, q: pagination.q }
    return PaginationUtil.paginate(qb, params, this.ALLOWED_SORT)
  }

  async getBatchById(id: string): Promise<StockBatch> {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: [],
    })
    if (!batch) throw new NotFoundException(`Batch ${id} not found`)
    return batch
  }

  async getBatchWithLifecycle(id: string): Promise<any> {
    const batch = await this.getBatchById(id)
    const movements = await this.movementRepo.find({
      where: { batchId: id },
      order: { createdAt: 'ASC' },
    })
    const reservations = await this.reservationRepo.find({
      where: { batchId: id, status: 'active' },
    })
    const adjustments = await this.adjustmentRepo.find({
      where: { batchId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    })
    return { ...batch, movements, reservations, adjustments }
  }

  async updateBatch(id: string, dto: UpdateBatchDto, userId: string): Promise<StockBatch> {
    return this.dataSource.transaction(async manager => {
      const batch = await manager.findOne(StockBatch, { where: { id } })
      if (!batch) throw new NotFoundException(`Batch ${id} not found`)

      // Optimistic locking check
      if (dto.version !== undefined && batch.version !== dto.version) {
        throw new ConflictException('Batch was modified by another user. Please refresh and retry.')
      }

      Object.assign(batch, {
        ...dto,
        updatedBy: userId,
      })
      return manager.save(StockBatch, batch)
    })
  }

  async deleteBatch(id: string, hard = false): Promise<void> {
    if (hard) {
      await this.batchRepo.delete(id)
    } else {
      await this.batchRepo.softDelete(id)
    }
  }

  // ── CURSOR-BASED BATCH LISTING ──

  async getBatchesCursor(cursorDto: CursorPaginationDto): Promise<CursorResult<StockBatch>> {
    const qb = this.batchRepo.createQueryBuilder('entity')
      .where('entity.deletedAt IS NULL')

    const cursorField = cursorDto.sortField || 'createdAt'
    return PaginationUtil.cursorPaginate(qb, {
      cursor: cursorDto.cursor,
      limit: cursorDto.limit || 20,
      sortField: cursorField,
      sortDirection: cursorDto.sortDirection || 'DESC',
    }, item => PaginationUtil.encodeCursor(item[cursorField], item.id))
  }

  // ── STOCK MOVEMENT ──

  async recordMovement(dto: CreateMovementDto, userId: string): Promise<StockMovement> {
    return this.dataSource.transaction(async manager => {
      const batch = await manager.findOne(StockBatch, { where: { id: dto.batchId } })
      if (!batch) throw new NotFoundException('Batch not found')

      const qtyBefore = batch.availableQty
      const qtyAfter = qtyBefore + dto.quantity

      if (qtyAfter < 0) throw new BadRequestException(`Insufficient stock. Available: ${qtyBefore}, movement: ${dto.quantity}`)

      const movement = manager.create(StockMovement, {
        id: uuid(),
        ...dto,
        quantityBefore: qtyBefore,
        quantityAfter: qtyAfter,
        totalValue: dto.unitCost ? Math.abs(dto.quantity) * dto.unitCost : undefined,
        createdBy: userId,
      })
      await manager.save(StockMovement, movement)

      await manager.update(StockBatch, dto.batchId, {
        availableQty: qtyAfter,
        status: qtyAfter <= 0 ? 'exhausted' : batch.status,
        updatedBy: userId,
      })

      return movement
    })
  }

  // ── ADJUSTMENT ──

  async createAdjustment(dto: CreateAdjustmentDto, userId: string): Promise<InventoryAdjustment> {
    return this.dataSource.transaction(async manager => {
      const batch = await manager.findOne(StockBatch, { where: { id: dto.batchId } })
      if (!batch) throw new NotFoundException('Batch not found')
      if (batch.availableQty < dto.quantity) {
        throw new BadRequestException(`Insufficient quantity. Available: ${batch.availableQty}, requested: ${dto.quantity}`)
      }

      const qtyBefore = batch.availableQty
      const qtyAfter = qtyBefore - dto.quantity

      const adj = manager.create(InventoryAdjustment, {
        id: uuid(),
        ...dto,
        quantityBefore: qtyBefore,
        quantityAfter: qtyAfter,
        unitCost: dto.unitCost || batch.costPrice,
        totalValue: (dto.unitCost || batch.costPrice) * dto.quantity,
        createdBy: userId,
      })
      await manager.save(InventoryAdjustment, adj)

      await manager.update(StockBatch, dto.batchId, {
        availableQty: qtyAfter,
        status: qtyAfter <= 0 ? 'exhausted' : batch.status,
        weightLossQty: () => `COALESCE(weight_loss_qty,0) + CASE WHEN '${dto.adjustmentType}' IN ('weight_loss','natural_shrinkage','moisture_loss') THEN ${dto.quantity} ELSE 0 END`,
        updatedBy: userId,
      })

      await manager.save(StockMovement, {
        id: uuid(),
        batchId: dto.batchId,
        produceId: dto.produceId,
        storeId: dto.storeId,
        movementType: 'adjusted',
        quantity: -dto.quantity,
        quantityBefore: qtyBefore,
        quantityAfter: qtyAfter,
        unitCost: adj.unitCost,
        totalValue: adj.totalValue,
        referenceId: adj.id,
        referenceType: 'adjustment',
        isWeightLoss: ['weight_loss', 'natural_shrinkage', 'moisture_loss'].includes(dto.adjustmentType) ? 1 : 0,
        notes: dto.reason,
        createdBy: userId,
      })

      return adj
    })
  }

  // ── RESERVATIONS ──

  async createReservation(dto: CreateReservationDto, userId: string): Promise<StockReservation> {
    return this.dataSource.transaction(async manager => {
      const batch = await manager.findOne(StockBatch, { where: { id: dto.batchId } })
      if (!batch) throw new NotFoundException('Batch not found')

      const freeQty = batch.availableQty - (batch.reservedQty || 0)
      if (freeQty < dto.quantity) {
        throw new BadRequestException(`Insufficient free stock. Free: ${freeQty}, requested: ${dto.quantity}`)
      }

      const reservation = manager.create(StockReservation, {
        id: uuid(),
        ...dto,
        createdBy: userId,
      })
      await manager.save(StockReservation, reservation)

      await manager.update(StockBatch, dto.batchId, {
        reservedQty: () => `COALESCE(reserved_qty,0) + ${dto.quantity}`,
      })

      return reservation
    })
  }

  async createBestBatchReservation(dto: BestBatchReservationDto, userId: string): Promise<any> {
    return this.dataSource.transaction(async manager => {
      const batches = await manager.find(StockBatch, {
        where: { produceId: dto.produceId, storeId: dto.storeId, status: 'available' },
        order: { receivedDate: 'ASC' },
      })

      let remaining = dto.quantity
      const reservations: any[] = []

      for (const batch of batches) {
        if (remaining <= 0) break
        const freeQty = batch.availableQty - (batch.reservedQty || 0)
        if (freeQty <= 0) continue

        const reserveQty = Math.min(freeQty, remaining)
        const res = manager.create(StockReservation, {
          id: uuid(), batchId: batch.id, produceId: dto.produceId,
          storeId: dto.storeId, referenceType: dto.referenceType,
          referenceId: dto.referenceId, quantity: reserveQty, createdBy: userId,
        })
        await manager.save(StockReservation, res)
        await manager.update(StockBatch, batch.id, {
          reservedQty: () => `COALESCE(reserved_qty,0) + ${reserveQty}`,
        })
        reservations.push({ batchId: batch.id, batchCode: batch.batchCode, quantity: reserveQty, costPrice: batch.costPrice })
        remaining -= reserveQty
      }

      return { reservations, shortfall: remaining }
    })
  }

  async releaseReservation(dto: ReleaseReservationDto): Promise<void> {
    return this.dataSource.transaction(async manager => {
      if (dto.reservationId) {
        const resv = await manager.findOne(StockReservation, { where: { id: dto.reservationId } })
        if (!resv) throw new NotFoundException('Reservation not found')
        await manager.update(StockReservation, dto.reservationId, { status: 'released', releasedAt: new Date().toISOString() })
        await manager.update(StockBatch, resv.batchId, { reservedQty: () => `MAX(0, COALESCE(reserved_qty,0) - ${resv.quantity})` })
      } else if (dto.batchId && dto.quantity && dto.referenceType && dto.referenceId) {
        await manager.update(StockReservation, {
          batchId: dto.batchId, referenceType: dto.referenceType, referenceId: dto.referenceId, status: 'active',
        }, { status: 'released', releasedAt: new Date().toISOString() })
        await manager.update(StockBatch, dto.batchId, { reservedQty: () => `MAX(0, COALESCE(reserved_qty,0) - ${dto.quantity})` })
      } else {
        throw new BadRequestException('Provide reservationId OR (batchId + quantity + referenceType + referenceId)')
      }
    })
  }

  async getReservations(storeId?: string, status?: string): Promise<StockReservation[]> {
    const where: any = {}
    if (storeId) where.storeId = storeId
    where.status = status || 'active'
    return this.reservationRepo.find({ where, order: { reservedAt: 'DESC' } })
  }

  // ── TRANSFER ──

  async createTransfer(dto: CreateTransferDto, userId: string): Promise<any> {
    return this.dataSource.transaction(async manager => {
      const transferId = uuid()
      const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`
      let totalValue = 0

      for (const item of dto.items) {
        const batch = await manager.findOne(StockBatch, { where: { id: item.batchId } })
        if (!batch) throw new NotFoundException(`Batch ${item.batchId} not found`)
        if (batch.availableQty < item.qty) {
          throw new BadRequestException(`Insufficient stock for batch ${batch.batchCode}. Available: ${batch.availableQty}`)
        }
        totalValue += item.qty * (item.unitCost || batch.costPrice)
      }

      // Insert transfer order
      await manager.query(
        `INSERT INTO transfer_orders (id, transfer_number, source_store_id, dest_store_id, transfer_date, status, total_items, total_value, initiated_by, notes, created_at)
         VALUES (?, ?, ?, ?, date('now'), 'draft', ?, ?, ?, ?, datetime('now'))`,
        [transferId, transferNumber, dto.sourceStoreId, dto.destStoreId, dto.items.length, totalValue, userId, dto.notes || null],
      )

      for (const item of dto.items) {
        await manager.query(
          `INSERT INTO transfer_order_items (id, transfer_id, batch_id, produce_id, transfer_qty, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), transferId, item.batchId, item.produceId, item.qty, item.unitCost || 0, item.qty * (item.unitCost || 0)],
        )
      }

      return { id: transferId, transferNumber }
    })
  }

  // ── BULK OPERATIONS ──

  async bulkCreate(dto: BulkCreateBatchDto, userId: string): Promise<any> {
    const results = { total: dto.items.length, succeeded: 0, failed: 0, errors: [] as any[], data: [] as StockBatch[] }
    for (let i = 0; i < dto.items.length; i++) {
      try {
        const batch = await this.createBatch(dto.items[i], userId)
        results.succeeded++
        results.data.push(batch)
      } catch (e) {
        results.failed++
        results.errors.push({ index: i, error: e.message })
      }
    }
    return results
  }

  async bulkUpdate(dto: BulkUpdateBatchDto, userId: string): Promise<any> {
    const results = { total: dto.items.length, succeeded: 0, failed: 0, errors: [] as any[] }
    for (let i = 0; i < dto.items.length; i++) {
      try {
        const { id, ...data } = dto.items[i]
        await this.updateBatch(id, data as UpdateBatchDto, userId)
        results.succeeded++
      } catch (e) {
        results.failed++
        results.errors.push({ index: i, error: e.message })
      }
    }
    return results
  }

  async bulkDelete(ids: string[], hard = false): Promise<any> {
    const results = { total: ids.length, succeeded: 0, failed: 0, errors: [] as any[] }
    for (let i = 0; i < ids.length; i++) {
      try {
        await this.deleteBatch(ids[i], hard)
        results.succeeded++
      } catch (e) {
        results.failed++
        results.errors.push({ index: i, error: e.message })
      }
    }
    return results
  }

  // ── DAILY CLOSING ──

  async computeDailyClosing(dto: ComputeDailyClosingDto): Promise<any> {
    return this.dataSource.transaction(async manager => {
      const { storeId, closingDate } = dto
      const prevDate = new Date(closingDate)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDateStr = prevDate.toISOString().slice(0, 10)

      const batches = await manager.find(StockBatch, {
        where: { storeId, status: 'available' },
      })

      let totalClosing = 0
      let totalValue = 0
      let count = 0

      for (const batch of batches) {
        const prevSnapshot = await manager.findOne(DailyStockSnapshot, {
          where: { storeId, snapshotDate: prevDateStr, batchId: batch.id },
        })
        const openingQty = prevSnapshot ? prevSnapshot.closingQty : batch.receivedQty

        const movements = await manager.find(StockMovement, {
          where: { batchId: batch.id, storeId },
        })
        const dateMovements = movements.filter(m =>
          m.createdAt.toISOString().slice(0, 10) === closingDate,
        )

        const salesQty = dateMovements
          .filter(m => ['sold_retail', 'sold_hotel'].includes(m.movementType))
          .reduce((s, m) => s + Math.abs(m.quantity), 0)
        const spoilageQty = dateMovements
          .filter(m => m.movementType === 'wasted')
          .reduce((s, m) => s + Math.abs(m.quantity), 0)

        const closingQty = openingQty - salesQty - spoilageQty
        const stockValue = closingQty * batch.costPrice

        const snapshot = manager.create(DailyStockSnapshot, {
          id: uuid(), storeId, snapshotDate: closingDate,
          batchId: batch.id, produceId: batch.produceId,
          openingQty, purchasesQty: 0, salesQty: spoilageQty,
          closingQty: Math.max(0, closingQty), costPrice: batch.costPrice,
        })
        await manager.save(DailyStockSnapshot, snapshot)

        totalClosing += Math.max(0, closingQty)
        totalValue += stockValue
        count++
      }

      return { date: closingDate, batches: count, totalClosingQty: totalClosing, totalStockValue: totalValue }
    })
  }

  // ── VALUATION ──

  async getValuation(storeId?: string, produceId?: string): Promise<any> {
    const qb = this.batchRepo.createQueryBuilder('entity')
      .select([
        'entity.storeId', 'entity.produceId',
        'SUM(entity.availableQty) as total_qty',
        'AVG(entity.costPrice) as avg_cost',
        'SUM(entity.availableQty * entity.costPrice) as fifo_value',
        'COUNT(entity.id) as batch_count',
      ])
      .where('entity.availableQty > 0 AND entity.status = :status', { status: 'available' })
      .groupBy('entity.storeId')
      .addGroupBy('entity.produceId')

    if (storeId) qb.andWhere('entity.storeId = :storeId', { storeId })
    if (produceId) qb.andWhere('entity.produceId = :produceId', { produceId })

    const items = await qb.getRawMany()
    const totals = {
      total_qty: items.reduce((s, r) => s + Number(r.total_qty || 0), 0),
      fifo_value: items.reduce((s, r) => s + Number(r.fifo_value || 0), 0),
    }
    return { items, totals }
  }

  async getFifoCost(produceId: string, storeId: string, quantity?: number): Promise<any> {
    const batches = await this.batchRepo.find({
      where: { produceId, storeId, status: 'available' },
      order: { receivedDate: 'ASC' },
    })

    let totalCost = 0
    let remainingQty = quantity || 0
      const layersUsed: any[] = []

    for (const batch of batches) {
      if (remainingQty <= 0) break
      const useQty = Math.min(batch.availableQty - (batch.reservedQty || 0), remainingQty)
      if (useQty <= 0) continue
      totalCost += useQty * batch.costPrice
      remainingQty -= useQty
      layersUsed.push({ batchId: batch.id, batchCode: batch.batchCode, qtyUsed: useQty, unitCost: batch.costPrice })
    }

    return {
      produceId, storeId, requestedQty: quantity || batches.reduce((s, b) => s + b.availableQty, 0),
      totalFifoCost: totalCost, avgFifoCost: quantity ? totalCost / quantity : 0,
      layersUsed, shortfall: Math.max(0, remainingQty),
    }
  }

  // ── AGING ──

  async getAging(storeId?: string): Promise<any> {
    const qb = this.batchRepo.createQueryBuilder('entity')
      .select([
        'entity.produceId', 'entity.storeId',
        'entity.availableQty', 'entity.costPrice',
        'entity.receivedDate', 'entity.expiryDate',
        `CASE 
          WHEN julianday('now') - julianday(entity.receivedDate) <= 1 THEN '0-1 days'
          WHEN julianday('now') - julianday(entity.receivedDate) <= 3 THEN '1-3 days'
          WHEN julianday('now') - julianday(entity.receivedDate) <= 7 THEN '3-7 days'
          ELSE '7+ days'
        END as age_bucket`,
        `CASE 
          WHEN entity.expiryDate IS NULL THEN 'unknown'
          WHEN julianday(entity.expiryDate) - julianday('now') < 0 THEN 'expired'
          WHEN julianday(entity.expiryDate) - julianday('now') <= 1 THEN 'critical'
          WHEN julianday(entity.expiryDate) - julianday('now') <= 3 THEN 'warning'
          ELSE 'fresh'
        END as freshness`,
      ])
      .where('entity.availableQty > 0 AND entity.status = :status', { status: 'available' })

    if (storeId) qb.andWhere('entity.storeId = :storeId', { storeId })

    const items = await qb.getRawMany()

    // Compute bucket summaries
    const bucketSummary: Record<string, { qty: number; value: number; count: number }> = {}
    const freshnessSummary: Record<string, { qty: number; value: number; count: number }> = {}

    for (const item of items) {
      const bucket = item.age_bucket || 'unknown'
      const freshness = item.freshness || 'unknown'
      const qty = Number(item.availableQty) || 0
      const value = qty * (Number(item.costPrice) || 0)

      if (!bucketSummary[bucket]) bucketSummary[bucket] = { qty: 0, value: 0, count: 0 }
      bucketSummary[bucket].qty += qty
      bucketSummary[bucket].value += value
      bucketSummary[bucket].count++

      if (!freshnessSummary[freshness]) freshnessSummary[freshness] = { qty: 0, value: 0, count: 0 }
      freshnessSummary[freshness].qty += qty
      freshnessSummary[freshness].value += value
      freshnessSummary[freshness].count++
    }

    return { items, bucket_summary: bucketSummary, freshness_summary: freshnessSummary }
  }

  // ── STOCK LEDGER ──

  async getStockLedger(storeId?: string, produceId?: string, from?: string, to?: string): Promise<any> {
    const qb = this.movementRepo.createQueryBuilder('entity')
      .leftJoinAndSelect('entity.batchId', 'batch')
      .where('1=1')

    if (storeId) qb.andWhere('entity.storeId = :storeId', { storeId })
    if (produceId) qb.andWhere('entity.produceId = :produceId', { produceId })
    if (from) qb.andWhere('entity.createdAt >= :from', { from })
    if (to) qb.andWhere('entity.createdAt <= :to', { to })

    qb.orderBy('entity.createdAt', 'ASC')

    const movements = await qb.getMany()
    let runningQty = 0
    const withBalance = movements.map(m => {
      const qty = m.quantityBefore !== undefined ? m.quantity : 0
      runningQty += qty
      return { ...m, runningBalance: runningQty }
    })

    const summary = {
      totalIn: movements.filter(m => m.quantity > 0).reduce((s, m) => s + m.quantity, 0),
      totalOut: movements.filter(m => m.quantity < 0).reduce((s, m) => s + Math.abs(m.quantity), 0),
      openingBalance: withBalance.length > 0 ? withBalance[0].runningBalance - (withBalance[0].quantity || 0) : 0,
      closingBalance: runningQty,
      transactionCount: movements.length,
    }

    return { summary, items: withBalance }
  }

  // ── TURNOVER ──

  async getTurnover(storeId?: string, days = 30): Promise<any> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const start = startDate.toISOString().slice(0, 10)

    const qb = this.movementRepo.createQueryBuilder('entity')
      .select([
        'entity.produceId',
        `SUM(CASE WHEN entity.movementType IN ('sold_retail','sold_hotel') THEN ABS(entity.quantity) ELSE 0 END) as total_sold`,
        `SUM(CASE WHEN entity.movementType IN ('sold_retail','sold_hotel') THEN ABS(entity.quantity) * entity.unitCost ELSE 0 END) as cogs`,
        `AVG(entity.unitCost) as avg_cost`,
      ])
      .where('entity.createdAt >= :start', { start })
      .andWhere("entity.movementType IN ('sold_retail','sold_hotel')")
      .groupBy('entity.produceId')

    if (storeId) qb.andWhere('entity.storeId = :storeId', { storeId })

    const results = await qb.getRawMany()
    return { periodDays: days, items: results }
  }

  // ── EXPORT ──

  async exportBatches(format: 'csv' | 'xlsx', filters?: any): Promise<{ data: any; contentType: string; filename: string }> {
    const qb = this.batchRepo.createQueryBuilder('entity')
      .where('entity.deletedAt IS NULL')
    FilteringUtil.applyFilters(qb, filters || {})
    const batches = await qb.getMany()

    const rows = batches.map(b => ({
      batchCode: b.batchCode, produceId: b.produceId, storeId: b.storeId,
      receivedDate: b.receivedDate, expiryDate: b.expiryDate || '',
      receivedQty: b.receivedQty, availableQty: b.availableQty,
      costPrice: b.costPrice, sellingPrice: b.sellingPrice || '',
      grade: b.grade, status: b.status,
    }))

    const contentType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const filename = `batches_export_${Date.now()}.${format}`
    return { data: rows, contentType, filename }
  }
}
