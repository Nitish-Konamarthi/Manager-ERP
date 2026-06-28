import { PrismaService } from '../../../prisma/prisma.service'

export async function loadCostMap(
  prisma: PrismaService,
  orgId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(productIds)]
  if (uniqueIds.length === 0) return new Map()

  const batches = await prisma.stockBatch.groupBy({
    by: ['productId'],
    where: { organizationId: orgId, productId: { in: uniqueIds }, deletedAt: null },
    _sum: { receivedQty: true },
    _avg: { unitCost: true },
  })
  const map = new Map<string, number>()
  for (const b of batches) {
    const qty = Number(b._sum.receivedQty || 0)
    map.set(b.productId, qty > 0 ? Number(b._avg.unitCost || 0) : 0)
  }
  uniqueIds.forEach(id => { if (!map.has(id)) map.set(id, 0) })
  return map
}

export function safeDecimal(v: any): number {
  if (v == null) return 0
  if (typeof v === 'object' && 'toNumber' in v) return v.toNumber()
  return Number(v)
}
