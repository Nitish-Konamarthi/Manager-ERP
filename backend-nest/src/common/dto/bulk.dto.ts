import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayNotEmpty, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class BulkCreateDto<T> {
  @ApiProperty({ description: 'Array of items to create' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => Object)
  items: T[]

  @ApiPropertyOptional({ description: 'Skip validation for individual items' })
  @IsOptional()
  skipValidation?: boolean
}

export class BulkUpdateDto<T> {
  @ApiProperty({ description: 'Array of items with ids to update' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => Object)
  items: (T & { id: string })[]

  @ApiPropertyOptional({ description: 'Upsert (insert if not exists)' })
  @IsOptional()
  upsert?: boolean
}

export class BulkDeleteDto {
  @ApiProperty({ description: 'Array of record IDs to delete' })
  @IsArray()
  @ArrayNotEmpty()
  ids: string[]

  @ApiPropertyOptional({ description: 'Hard delete (permanent)' })
  @IsOptional()
  hard?: boolean
}

export class ImportDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'CSV or Excel file' })
  file: any

  @ApiPropertyOptional({ description: 'Strategy: insert, upsert, or replace' })
  @IsOptional()
  @IsString()
  strategy?: 'insert' | 'upsert' | 'replace' = 'insert'
}

export class ExportDto {
  @ApiPropertyOptional({ description: 'Format: csv or xlsx', default: 'csv' })
  @IsOptional()
  @IsString()
  format?: 'csv' | 'xlsx' = 'csv'

  @ApiPropertyOptional({ description: 'Fields to export (comma-separated)' })
  @IsOptional()
  @IsString()
  fields?: string

  @ApiPropertyOptional({ description: 'Filter conditions' })
  @IsOptional()
  filters?: Record<string, any>

  @ApiPropertyOptional({ description: 'Sort specification' })
  @IsOptional()
  @IsString()
  sort?: string
}
