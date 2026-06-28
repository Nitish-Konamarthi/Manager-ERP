import { Prisma } from '@prisma/client'

export async function lockBatches(
  tx: Prisma.TransactionClient,
  batchIds: string[],
  orderByDate = true,
) {
  if (batchIds.length === 0) return

  if (orderByDate) {
    const sorted = [...batchIds]
    const batches = await tx.stockBatch.findMany({
      where: { id: { in: sorted } },
      select: { id: true, receivedDate: true },
      orderBy: { receivedDate: 'asc' },
    })
    for (const b of batches) {
      await tx.$executeRawUnsafe(`SELECT 1 FROM "stock_batches" WHERE id = $1 FOR UPDATE`, b.id)
    }
    return
  }

  for (const id of batchIds) {
    await tx.$executeRawUnsafe(`SELECT 1 FROM "stock_batches" WHERE id = $1 FOR UPDATE`, id)
  }
}

export async function lockSalesOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const [result] = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "sales_orders" WHERE id = $1 FOR UPDATE`,
    orderId,
  )
  return result
}

export async function lockAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
) {
  const [result] = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "accounts" WHERE id = $1 FOR UPDATE`,
    accountId,
  )
  return result
}

export async function advisoryLock(
  tx: Prisma.TransactionClient,
  lockId1: number,
  lockId2: number,
  timeoutMs = 3000,
): Promise<boolean> {
  try {
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${timeoutMs}ms'`)
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock($1, $2)`, lockId1, lockId2)
    return true
  } catch {
    return false
  }
}

export function hashProductId(productId: string): number {
  let hash = 0
  for (let i = 0; i < productId.length; i++) {
    const char = productId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}
