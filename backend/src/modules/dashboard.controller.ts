import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard summary' })
  async summary(@CurrentUser('orgId') orgId: string) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() - 6)

    const [
      salesToday,
      salesOrdersToday,
      purchasesToday,
      lowStock,
      expiringStock,
      stockValue,
      outstandingCustomers,
      weeklyTrend,
      topProducts,
      recentNotifications,
    ] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { organizationId: orgId, orderDate: { gte: start, lt: end }, deletedAt: null },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.salesOrder.count({
        where: { organizationId: orgId, orderDate: { gte: start, lt: end }, deletedAt: null },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { organizationId: orgId, orderDate: { gte: start, lt: end }, deletedAt: null },
        _sum: { total: true },
      }),
      this.prisma.product.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          isActive: true,
          minStockLevel: { not: null },
          stockBatches: { some: { deletedAt: null, availableQty: { gt: 0 } } },
        },
      }),
      this.prisma.stockBatch.aggregate({
        where: {
          organizationId: orgId,
          deletedAt: null,
          expiryDate: { gte: start, lt: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) },
          availableQty: { gt: 0 },
        },
        _sum: { availableQty: true, unitCost: true },
      }),
      this.prisma.stockBatch.aggregate({
        where: { organizationId: orgId, deletedAt: null, availableQty: { gt: 0 } },
        _sum: { availableQty: true, unitCost: true },
      }),
      this.prisma.customer.aggregate({
        where: { organizationId: orgId, deletedAt: null, outstanding: { gt: 0 } },
        _sum: { outstanding: true },
        _count: true,
      }),
      this.prisma.$queryRaw<Array<{ date: Date; revenue: unknown }>>`
        SELECT DATE(order_date) AS date, COALESCE(SUM(total), 0) AS revenue
        FROM sales_orders
        WHERE organization_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND order_date >= ${weekStart}
          AND order_date < ${end}
        GROUP BY DATE(order_date)
        ORDER BY DATE(order_date)
      `,
      this.prisma.$queryRaw<Array<{ code: string; name: string; qty: unknown; revenue: unknown }>>`
        SELECT p.sku AS code, p.name, COALESCE(SUM(soi.quantity), 0) AS qty, COALESCE(SUM(soi.total_price), 0) AS revenue
        FROM sales_order_items soi
        JOIN sales_orders so ON so.id = soi.order_id
        JOIN products p ON p.id = soi.product_id
        WHERE so.organization_id = ${orgId}::uuid
          AND so.deleted_at IS NULL
          AND so.order_date >= ${start}
          AND so.order_date < ${end}
        GROUP BY p.sku, p.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
      this.prisma.notification.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    const trendByDate = new Map(weeklyTrend.map(row => [this.formatDate(row.date), this.toNumber(row.revenue)]))
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      const key = this.formatDate(date)
      return { date: key, revenue: trendByDate.get(key) || 0 }
    })

    return {
      today: {
        retail_sales: this.toNumber(salesToday._sum.total),
        retail_transactions: salesOrdersToday,
        hotel_sales: 0,
        hotel_orders: 0,
        purchases: this.toNumber(purchasesToday._sum.total),
        waste: 0,
        waste_records: 0,
        total_revenue: this.toNumber(salesToday._sum.total),
      },
      alerts: {
        expiring_stock: {
          qty: this.toNumber(expiringStock._sum.availableQty),
          value: this.toNumber(expiringStock._sum.availableQty) * this.toNumber(expiringStock._sum.unitCost),
        },
        low_stock: lowStock,
        overdue_invoices: outstandingCustomers._count,
        overdue_amount: this.toNumber(outstandingCustomers._sum.outstanding),
      },
      financial: {
        total_outstanding: this.toNumber(outstandingCustomers._sum.outstanding),
        stock_value: this.toNumber(stockValue._sum.availableQty) * this.toNumber(stockValue._sum.unitCost),
      },
      weekly_trend: trend,
      top_products: topProducts.map(row => ({
        code: row.code,
        name: row.name,
        qty: this.toNumber(row.qty),
        revenue: this.toNumber(row.revenue),
      })),
      store_sales: [],
      notifications: recentNotifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.body || '',
      })),
    }
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0
    return Number(value)
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10)
  }
}
