import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNumber, IsOptional, IsDateString, Min, Max, IsArray, ArrayNotEmpty, IsUUID, IsEnum, ValidateNested, IsBoolean } from 'class-validator'
import { Type } from 'class-transformer'

// ─── Batch ───
export class CreateBatchDto {
  @ApiProperty() @IsString() batchCode: string
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsUUID() storeId: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string
  @ApiProperty() @IsDateString() receivedDate: string
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string
  @ApiProperty() @IsNumber() @Min(0) receivedQty: number
  @ApiProperty() @IsNumber() @Min(0) costPrice: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string = 'A'
  @ApiPropertyOptional() @IsOptional() @IsString() locationZone?: string
}

export class UpdateBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) availableQty?: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costPrice?: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string
  @ApiPropertyOptional() @IsOptional() @IsString() locationZone?: string
  @ApiProperty() @IsNumber() version: number
}

export class BatchFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() storeId?: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() produceId?: string
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string
  @ApiPropertyOptional() @IsOptional() @IsString() age?: 'fresh' | 'expiring' | 'expired'
  @ApiPropertyOptional({ description: 'JSON filter string' }) @IsOptional() @IsString() filter?: string
}

// ─── Stock Movement ───
export class CreateMovementDto {
  @ApiProperty() @IsUUID() batchId: string
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsUUID() storeId: string
  @ApiProperty() @IsString() movementType: string
  @ApiProperty() @IsNumber() quantity: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitCost?: number
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string
}

// ─── Adjustment ───
export class CreateAdjustmentDto {
  @ApiProperty() @IsUUID() storeId: string
  @ApiProperty() @IsUUID() batchId: string
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsString() adjustmentType: string
  @ApiProperty() @IsNumber() @Min(0) quantity: number
  @ApiProperty() @IsString() reason: string
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitCost?: number
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string
}

// ─── Reservation ───
export class CreateReservationDto {
  @ApiProperty() @IsUUID() batchId: string
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsUUID() storeId: string
  @ApiProperty() @IsString() referenceType: string
  @ApiProperty() @IsString() referenceId: string
  @ApiProperty() @IsNumber() @Min(0) quantity: number
}

export class BestBatchReservationDto {
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsUUID() storeId: string
  @ApiProperty() @IsNumber() @Min(0) quantity: number
  @ApiProperty() @IsString() referenceType: string
  @ApiProperty() @IsString() referenceId: string
  @ApiPropertyOptional() @IsOptional() @IsString() gradeRequired?: string
}

export class ReleaseReservationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() reservationId?: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() batchId?: string
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string
}

// ─── Transfer ───
export class CreateTransferDto {
  @ApiProperty() @IsUUID() sourceStoreId: string
  @ApiProperty() @IsUUID() destStoreId: string
  @ApiProperty() @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => TransferItemDto)
  items: TransferItemDto[]
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string
}

export class TransferItemDto {
  @ApiProperty() @IsUUID() batchId: string
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsNumber() @Min(0) qty: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitCost?: number
}

// ─── Bulk ───
export class BulkCreateBatchDto {
  @ApiProperty({ type: [CreateBatchDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => CreateBatchDto)
  items: CreateBatchDto[]
}

export class BulkUpdateBatchDto {
  @ApiProperty({ type: [Object] })
  @IsArray() @ArrayNotEmpty()
  items: ({ id: string } & UpdateBatchDto)[]
}

// ─── Daily Closing ───
export class ComputeDailyClosingDto {
  @ApiProperty() @IsUUID() storeId: string
  @ApiProperty() @IsDateString() closingDate: string
}

// ─── Valuation ───
export class FifoCostQueryDto {
  @ApiProperty() @IsUUID() produceId: string
  @ApiProperty() @IsUUID() storeId: string
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) quantity?: number
}

// ─── Identifier / Scan ───
export class ScanIdentifierDto {
  @ApiProperty() @IsString() identifier: string
  @ApiPropertyOptional() @IsOptional() @IsString() identifierType?: string = 'barcode'
  @ApiPropertyOptional() @IsOptional() @IsUUID() produceId?: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() batchId?: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgUnitId?: string
}
