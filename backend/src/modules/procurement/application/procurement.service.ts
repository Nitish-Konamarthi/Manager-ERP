import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

  async createPO(orgId: string, data: {
    supplierId: string; orderDate: string; expectedDate?: string;
    notes?: string; items: { productId: string; quantity: number; unitPrice: number }[]
  }) {
    return this.prisma.$transaction(async tx => {
      const orderNumber = `PO-${Date.now()}`
      let subtotal = 0
      const items = data.items.map(item => {
        const total = Number(item.quantity) * Number(item.unitPrice)
        subtotal += total
        return { productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: total }
      })

      return tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          orderNumber,
          supplierId: data.supplierId,
          orderDate: new Date(data.orderDate),
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
          notes: data.notes,
          subtotal,
          total: subtotal,
          status: 'DRAFT',
          items: { create: items },
        },
        include: { items: { include: { product: true } }, supplier: true },
      })
    })
  }

  async findAll(orgId: string, params: {
    page?: number; limit?: number; status?: string; supplierId?: string
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId, deletedAt: null }
    if (params.status) where.status = params.status
    if (params.supplierId) where.supplierId = params.supplierId
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip, take, orderBy: { orderDate: 'desc' },
        include: { supplier: true, items: { include: { product: true } } },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findById(orgId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: orgId },
      include: { supplier: true, items: { include: { product: true } } },
    })
    if (!po) throw new NotFoundException('Purchase order not found')
    return po
  }

  async updateStatus(orgId: string, id: string, status: string, expectedVersion: number) {
    return this.prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } })
      if (!po || po.organizationId !== orgId) throw new NotFoundException('Purchase order not found')
      if (po.version !== expectedVersion) throw new BadRequestException('Version conflict')
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: status as any, version: { increment: 1 } },
      })
    })
  }
}
