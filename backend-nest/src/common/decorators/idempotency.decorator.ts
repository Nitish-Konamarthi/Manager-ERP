import { SetMetadata } from '@nestjs/common'

export const IDEMPOTENCY_KEY = 'idempotency'
export const Idempotent = (ttl?: number) => SetMetadata(IDEMPOTENCY_KEY, ttl || 86400000)
