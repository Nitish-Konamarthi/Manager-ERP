import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class MaterializedViewsService {
  private readonly logger = new Logger(MaterializedViewsService.name)
  private readonly views = [
    'mv_daily_sales_summary',
    'mv_product_monthly_sales',
    'mv_customer_summary',
    'mv_supplier_summary',
    'mv_daily_profit',
    'mv_current_stock',
    'mv_monthly_spoilage',
    'mv_stock_aging',
  ]

  constructor(private prisma: PrismaService) {}

  async refreshAll(): Promise<void> {
    for (const view of this.views) {
      try {
        await this.prisma.$executeRawUnsafe(
          `REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`
        )
        this.logger.log(`Refreshed ${view}`)
      } catch (err) {
        this.logger.error(`Failed to refresh ${view}: ${(err as Error).message}`)
      }
    }
  }

  async refreshOne(view: string): Promise<void> {
    if (!this.views.includes(view)) {
      throw new Error(`Unknown materialized view: ${view}`)
    }
    await this.prisma.$executeRawUnsafe(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`
    )
  }
}
