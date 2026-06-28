import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ReportsController } from './application/reports.controller'
import { ReportsService } from './application/reports.service'
import { MaterializedViewsService } from './infrastructure/materialized-views.service'
import { MvRefreshProcessor } from './infrastructure/mv-refresh.processor'
import { MvRefreshController } from './infrastructure/mv-refresh.controller'

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, MvRefreshController],
  providers: [ReportsService, MaterializedViewsService, MvRefreshProcessor],
  exports: [ReportsService, MaterializedViewsService],
})
export class ReportsModule {}
