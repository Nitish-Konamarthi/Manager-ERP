import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { BaseEntity } from './base.entity'

@Entity('stock_batches')
@Index(['storeId', 'produceId', 'status'])
@Index(['expiryDate'])
export class StockBatch extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'text', name: 'batch_code' })
  batchCode: string

  @ApiProperty()
  @Column({ type: 'text', name: 'produce_id' })
  produceId: string

  @ApiProperty()
  @Column({ type: 'text', name: 'store_id' })
  storeId: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'supplier_id', nullable: true })
  supplierId?: string

  @ApiProperty()
  @Column({ type: 'text', name: 'received_date' })
  receivedDate: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'expiry_date', nullable: true })
  expiryDate?: string

  @ApiProperty()
  @Column({ type: 'real', name: 'received_qty' })
  receivedQty: number

  @ApiProperty()
  @Column({ type: 'real', name: 'available_qty' })
  availableQty: number

  @ApiProperty()
  @Column({ type: 'real', name: 'cost_price' })
  costPrice: number

  @ApiPropertyOptional()
  @Column({ type: 'real', name: 'selling_price', nullable: true })
  sellingPrice?: number

  @ApiProperty()
  @Column({ type: 'text', default: 'A' })
  grade: string

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  location?: string

  @ApiProperty()
  @Column({ type: 'text', default: 'available' })
  status: string

  @ApiPropertyOptional()
  @Column({ type: 'real', name: 'opening_qty', default: 0 })
  openingQty: number

  @ApiPropertyOptional()
  @Column({ type: 'real', name: 'reserved_qty', default: 0 })
  reservedQty: number

  @ApiPropertyOptional()
  @Column({ type: 'real', name: 'weight_loss_qty', default: 0 })
  weightLossQty: number

  @ApiPropertyOptional()
  @Column({ type: 'real', name: 'shrinkage_pct', default: 0 })
  shrinkagePct: number

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'last_count_date', nullable: true })
  lastCountDate?: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'batch_owner', default: 'store' })
  batchOwner: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'location_zone', nullable: true })
  locationZone?: string
}

@Entity('stock_movements')
@Index(['batchId'])
@Index(['storeId', 'createdAt'])
export class StockMovement extends BaseEntity {
  @Column({ type: 'text', name: 'batch_id' })
  batchId: string

  @Column({ type: 'text', name: 'produce_id' })
  produceId: string

  @Column({ type: 'text', name: 'store_id' })
  storeId: string

  @Column({ type: 'text', name: 'movement_type' })
  movementType: string

  @Column({ type: 'real' })
  quantity: number

  @Column({ type: 'real', name: 'quantity_before', nullable: true })
  quantityBefore?: number

  @Column({ type: 'real', name: 'quantity_after', nullable: true })
  quantityAfter?: number

  @Column({ type: 'real', name: 'unit_cost', nullable: true })
  unitCost?: number

  @Column({ type: 'real', name: 'total_value', nullable: true })
  totalValue?: number

  @Column({ type: 'text', name: 'reference_id', nullable: true })
  referenceId?: string

  @Column({ type: 'text', name: 'reference_type', nullable: true })
  referenceType?: string

  @Column({ type: 'integer', name: 'is_weight_loss', default: 0 })
  isWeightLoss: number

  @Column({ type: 'text', nullable: true })
  notes?: string
}

@Entity('stock_reservations')
@Index(['batchId', 'status'])
@Index(['referenceType', 'referenceId'])
export class StockReservation extends BaseEntity {
  @Column({ type: 'text', name: 'batch_id' })
  batchId: string

  @Column({ type: 'text', name: 'produce_id' })
  produceId: string

  @Column({ type: 'text', name: 'store_id' })
  storeId: string

  @Column({ type: 'text', name: 'reference_type' })
  referenceType: string

  @Column({ type: 'text', name: 'reference_id' })
  referenceId: string

  @Column({ type: 'real' })
  quantity: number

  @Column({ type: 'text', default: 'active' })
  status: string

  @Column({ type: 'text', name: 'reserved_at', default: () => "datetime('now')" })
  reservedAt: string

  @Column({ type: 'text', name: 'fulfilled_at', nullable: true })
  fulfilledAt?: string

  @Column({ type: 'text', name: 'released_at', nullable: true })
  releasedAt?: string
}

@Entity('inventory_adjustments')
@Index(['storeId', 'createdAt'])
export class InventoryAdjustment extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId: string

  @Column({ type: 'text', name: 'batch_id' })
  batchId: string

  @Column({ type: 'text', name: 'produce_id' })
  produceId: string

  @Column({ type: 'text', name: 'adjustment_type' })
  adjustmentType: string

  @Column({ type: 'real' })
  quantity: number

  @Column({ type: 'real', name: 'quantity_before' })
  quantityBefore: number

  @Column({ type: 'real', name: 'quantity_after' })
  quantityAfter: number

  @Column({ type: 'real', name: 'unit_cost', nullable: true })
  unitCost?: number

  @Column({ type: 'real', name: 'total_value', nullable: true })
  totalValue?: number

  @Column({ type: 'text' })
  reason: string

  @Column({ type: 'text', name: 'reference_type', nullable: true })
  referenceType?: string

  @Column({ type: 'text', name: 'reference_id', nullable: true })
  referenceId?: string
}

@Entity('daily_stock_snapshots')
@Index(['storeId', 'snapshotDate'])
@Index(['batchId'])
export class DailyStockSnapshot extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId: string

  @Column({ type: 'text', name: 'snapshot_date' })
  snapshotDate: string

  @Column({ type: 'text', name: 'batch_id' })
  batchId: string

  @Column({ type: 'text', name: 'produce_id' })
  produceId: string

  @Column({ type: 'real', name: 'opening_qty', default: 0 })
  openingQty: number

  @Column({ type: 'real', name: 'purchases_qty', default: 0 })
  purchasesQty: number

  @Column({ type: 'real', name: 'sales_qty', default: 0 })
  salesQty: number

  @Column({ type: 'real', name: 'transfers_in_qty', default: 0 })
  transfersInQty: number

  @Column({ type: 'real', name: 'transfers_out_qty', default: 0 })
  transfersOutQty: number

  @Column({ type: 'real', name: 'spoilage_qty', default: 0 })
  spoilageQty: number

  @Column({ type: 'real', name: 'weight_loss_qty', default: 0 })
  weightLossQty: number

  @Column({ type: 'real', name: 'returns_qty', default: 0 })
  returnsQty: number

  @Column({ type: 'real', name: 'adjustments_qty', default: 0 })
  adjustmentsQty: number

  @Column({ type: 'real', name: 'closing_qty', default: 0 })
  closingQty: number

  @Column({ type: 'real', name: 'cost_price', nullable: true })
  costPrice?: number
}
