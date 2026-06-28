import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'
import { lockSalesOrder } from '../../../common/utils/lock.util'
import { runTransaction } from '../../../common/utils/transaction.util'

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async createSO(orgId: string, data: {
    customerId: string; shopId?: string; orderDate: string;
    notes?: string; items: { productId: string; quantity: number; unitPrice: number }[]
  }) {
    return this.prisma.$transaction(async tx => {
      const orderNumber = `SO-${Date.now()}`
      let subtotal = 0
      const items = data.items.map(item => {
        const total = Number(item.quantity) * Number(item.unitPrice)
        subtotal += total
        return { productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: total }
      })

      return tx.salesOrder.create({
        data: {
          organizationId: orgId,
          orderNumber,
          customerId: data.customerId,
          shopId: data.shopId,
          orderDate: new Date(data.orderDate),
          notes: data.notes,
          subtotal,
          total: subtotal,
          status: 'DRAFT',
          items: { create: items },
        },
        include: { items: { include: { product: true } }, customer: true },
      })
    })
  }

  async findAll(orgId: string, params: {
    page?: number; limit?: number; status?: string; customerId?: string
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId, deletedAt: null }
    if (params.status) where.status = params.status
    if (params.customerId) where.customerId = params.customerId
    const [items, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where, skip, take, orderBy: { orderDate: 'desc' },
        include: { customer: true, items: { include: { product: true } } },
      }),
      this.prisma.salesOrder.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findById(orgId: string, id: string) {
    const so = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: true, items: { include: { product: true } } },
    })
    if (!so) throw new NotFoundException('Sales order not found')
    return so
  }

  async updateStatus(orgId: string, id: string, status: string, expectedVersion: number) {
    return runTransaction(this.prisma, async tx => {
      await lockSalesOrder(tx, id)
      const so = await tx.salesOrder.findUnique({ where: { id } })
      if (!so || so.organizationId !== orgId) throw new NotFoundException('Sales order not found')
      if (so.version !== expectedVersion) throw new BadRequestException(
        'Order was modified by another user. Refresh and retry.',
      )
      return tx.salesOrder.update({
        where: { id },
        data: { status: status as any, version: { increment: 1 } },
      })
    })
  }

  async recordPayment(orgId: string, orderId: string, amount: number) {
    return runTransaction(this.prisma, async tx => {
      await lockSalesOrder(tx, orderId)
      const so = await tx.salesOrder.findUnique({ where: { id: orderId } })
      if (!so || so.organizationId !== orgId) throw new NotFoundException('Sales order not found')

      const newPaid = Number(so.paidAmount) + amount
      if (newPaid > Number(so.total)) throw new BadRequestException('Payment exceeds total')

      const paymentStatus = newPaid >= Number(so.total) ? 'PAID' : 'PARTIAL'

      return tx.salesOrder.update({
        where: { id: orderId },
        data: {
          paidAmount: newPaid,
          paymentStatus: paymentStatus as any,
          version: { increment: 1 },
        },
      })
    }, { isolation: 'RepeatableRead', maxRetries: 3 })
  }
}
