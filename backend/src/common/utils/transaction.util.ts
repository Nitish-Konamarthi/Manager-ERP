import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'

type IsolationLevel = 'ReadCommitted' | 'RepeatableRead' | 'Serializable'
type TransactionOptions = {
  isolation?: IsolationLevel
  timeout?: number
  maxRetries?: number
}

const DEFAULT_OPTIONS: Required<TransactionOptions> = {
  isolation: 'ReadCommitted',
  timeout: 5000,
  maxRetries: 3,
}

export async function runTransaction<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`)
        return fn(tx)
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel[opts.isolation],
        timeout: opts.timeout,
      })
    } catch (err: any) {
      lastError = err

      const isRetryable =
        err.code === '40001' ||  // serialization failure
        err.code === '40P01' ||  // deadlock detected
        (err.code === '55P03' && opts.isolation !== 'Serializable')  // lock not available

      if (isRetryable && attempt < opts.maxRetries) {
        const jitter = Math.random() * 200
        const delay = attempt * 100 + jitter
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  throw lastError
}

export function withRetry(opts?: TransactionOptions) {
  return (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value
    descriptor.value = async function (...args: any[]) {
      const prisma: PrismaService = (this as any).prisma
      return runTransaction(prisma, (tx: Prisma.TransactionClient) => {
        return original.call(this, tx, ...args)
      }, opts)
    }
    return descriptor
  }
}
