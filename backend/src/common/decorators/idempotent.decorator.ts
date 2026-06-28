import { PrismaService } from '../../prisma/prisma.service'

const KEY_PREFIX = 'idempotent'

export function Idempotent(timeoutDays = 1) {
  return (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const prisma: PrismaService = (this as any).prisma
      const idempotencyKey = extractKey(args)
      if (!idempotencyKey) {
        return original.apply(this, args)
      }

      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      })
      if (existing && existing.response) {
        return existing.response
      }

      const result = await original.apply(this, args)

      await prisma.idempotencyKey.upsert({
        where: { key: idempotencyKey },
        create: {
          key: idempotencyKey,
          response: result,
          expiresAt: new Date(Date.now() + timeoutDays * 86400000),
        },
        update: {},
      })

      return result
    }

    return descriptor
  }
}

function extractKey(args: any[]): string | null {
  const last = args[args.length - 1]
  if (typeof last === 'object' && last !== null) {
    return last.idempotencyKey || last.idempotency_key || null
  }
  if (args.length >= 1 && typeof args[0] === 'string' && args[0].startsWith(KEY_PREFIX)) {
    return args[0]
  }
  return null
}
