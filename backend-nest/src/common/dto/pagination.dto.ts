import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsPositive, IsString, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(10000)
  page: number = 1

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(500)
  limit: number = 20

  @ApiPropertyOptional({ description: 'Sort fields (comma-separated, prefix - for DESC). e.g. name,-createdAt' })
  @IsOptional()
  @IsString()
  sort?: string

  @ApiPropertyOptional({ description: 'Search across all searchable fields' })
  @IsOptional()
  @IsString()
  q?: string
}

export class CursorPaginationDto {
  @ApiPropertyOptional({ description: 'Cursor token from previous response' })
  @IsOptional()
  @IsString()
  cursor?: string

  @ApiPropertyOptional({ description: 'Number of items to return', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(500)
  limit?: number = 20

  @ApiPropertyOptional({ description: 'Sort field for cursor' })
  @IsOptional()
  @IsString()
  sortField?: string = 'createdAt'

  @ApiPropertyOptional({ description: 'Sort direction' })
  @IsOptional()
  @IsString()
  sortDirection?: 'ASC' | 'DESC' = 'DESC'
}
