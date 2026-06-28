import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PaginationMeta {
  @ApiProperty() page: number
  @ApiProperty() limit: number
  @ApiProperty() total: number
  @ApiProperty() totalPages: number
  @ApiProperty() hasNextPage: boolean
  @ApiProperty() hasPrevPage: boolean
}

export class CursorMeta {
  @ApiProperty() limit: number
  @ApiProperty() hasNext: boolean
  @ApiPropertyOptional() nextCursor?: string
  @ApiPropertyOptional() previousCursor?: string
}

export class ApiResponseDto<T = any> {
  @ApiProperty() success: boolean
  @ApiProperty() message: string
  @ApiPropertyOptional() data?: T
  @ApiPropertyOptional() meta?: PaginationMeta | CursorMeta
  @ApiPropertyOptional() timestamp?: string
  @ApiPropertyOptional() path?: string

  static ok<T>(data: T, message = 'Success', meta?: PaginationMeta | CursorMeta): ApiResponseDto<T> {
    return { success: true, message, data, meta, timestamp: new Date().toISOString() }
  }

  static created<T>(data: T, message = 'Created'): ApiResponseDto<T> {
    return { success: true, message, data, timestamp: new Date().toISOString() }
  }

  static paginated<T>(data: T, meta: PaginationMeta): ApiResponseDto<T> {
    return { success: true, message: 'Success', data, meta, timestamp: new Date().toISOString() }
  }

  static cursorPaginated<T>(data: T, meta: CursorMeta): ApiResponseDto<T> {
    return { success: true, message: 'Success', data, meta, timestamp: new Date().toISOString() }
  }

  static error(message: string, path?: string): ApiResponseDto<null> {
    return { success: false, message, data: null, timestamp: new Date().toISOString(), path }
  }
}

export class BulkOperationResult {
  @ApiProperty() total: number
  @ApiProperty() succeeded: number
  @ApiProperty() failed: number
  @ApiPropertyOptional({ type: [Object] }) errors?: Array<{ index: number; error: string }>
  @ApiPropertyOptional() data?: any[]
}

export class ApiErrorDto {
  @ApiProperty() statusCode: number
  @ApiProperty() message: string
  @ApiProperty() error: string
  @ApiPropertyOptional() details?: any
  @ApiPropertyOptional() path?: string
  @ApiPropertyOptional() timestamp?: string
}
