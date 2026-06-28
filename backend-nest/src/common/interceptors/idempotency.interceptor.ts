import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ConflictException, Logger } from '@nestjs/common'
import { Observable, of } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Reflector } from '@nestjs/core'
import { IDEMPOTENCY_KEY } from '../decorators/idempotency.decorator'

interface IdempotencyRecord {
  statusCode: number
  body: any
  createdAt: number
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Idempotency')
  private store = new Map<string, IdempotencyRecord>()

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()

    // Only apply to mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle()

    const idempotencyKey = request.headers['idempotency-key']
    if (!idempotencyKey) return next.handle()

    const ttl = this.reflector.getAllAndOverride<number>(IDEMPOTENCY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) || 86400000

    // Check existing record
    const existing = this.store.get(idempotencyKey)
    if (existing) {
      if (Date.now() - existing.createdAt > ttl) {
        this.store.delete(idempotencyKey)
      } else {
        this.logger.log(`Idempotency hit: ${idempotencyKey}`)
        const response = context.switchToHttp().getResponse()
        response.status(existing.statusCode)
        return of(existing.body)
      }
    }

    return next.handle().pipe(
      tap(result => {
        const response = context.switchToHttp().getResponse()
        const record: IdempotencyRecord = {
          statusCode: response.statusCode,
          body: result,
          createdAt: Date.now(),
        }
        this.store.set(idempotencyKey, record)

        // Cleanup old entries
        if (this.store.size > 10000) {
          const now = Date.now()
          for (const [key, rec] of this.store) {
            if (now - rec.createdAt > ttl) this.store.delete(key)
          }
        }
      }),
    )
  }
}
