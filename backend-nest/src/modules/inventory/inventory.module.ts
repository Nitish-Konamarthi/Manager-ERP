import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'
import {
  StockBatch, StockMovement, StockReservation,
  InventoryAdjustment, DailyStockSnapshot,
} from '../../database/entities/inventory.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockBatch, StockMovement, StockReservation,
      InventoryAdjustment, DailyStockSnapshot,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
