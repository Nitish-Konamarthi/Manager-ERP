import { Module } from '@nestjs/common'
import { ProcurementService } from './application/procurement.service'
import { ProcurementController } from './presentation/procurement.controller'

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
