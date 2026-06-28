import { Injectable, Logger } from '@nestjs/common'
import { MaterializedViewsService } from './materialized-views.service'

@Injectable()
export class MvRefreshProcessor {
  private readonly logger = new Logger(MvRefreshProcessor.name)

  constructor(private mv: MaterializedViewsService) {}

  async refreshAll(): Promise<void> {
    this.logger.log('Refreshing all materialized views')
    await this.mv.refreshAll()
  }

  async refreshOne(view: string): Promise<void> {
    await this.mv.refreshOne(view)
  }
}
