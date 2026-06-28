import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiResponseDto } from '../dto/api-response.dto'

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponseDto<T>> {
    const request = context.switchToHttp().getRequest()
    return next.handle().pipe(
      map(data => {
        // If already wrapped, return as-is
        if (data?.success !== undefined && data?.data !== undefined) {
          return { ...data, timestamp: data.timestamp || new Date().toISOString(), path: request.url }
        }
        // Check if it's a paginated result
        if (data?.items !== undefined && data?.meta !== undefined) {
          return ApiResponseDto.paginated(data.items, data.meta)
        }
        return ApiResponseDto.ok(data, 'Success')
      }),
    )
  }
}
