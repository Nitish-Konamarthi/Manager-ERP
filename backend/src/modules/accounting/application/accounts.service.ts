import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    accountCode: string; name: string; type: string; parentId?: string; openingBalance?: number
  }) {
    const existing = await this.prisma.account.findFirst({
      where: { organizationId: orgId, accountCode: data.accountCode },
    })
    if (existing) throw new ConflictException('Account code already exists')
    return this.prisma.account.create({
      data: {
        organizationId: orgId,
        accountCode: data.accountCode,
        name: data.name,
        type: data.type as any,
        parentId: data.parentId,
        openingBalance: data.openingBalance || 0,
        currentBalance: data.openingBalance || 0,
      },
    })
  }

  async findAll(orgId: string, type?: string) {
    const where: any = { organizationId: orgId, deletedAt: null }
    if (type) where.type = type
    return this.prisma.account.findMany({
      where,
      include: { children: true },
      orderBy: { accountCode: 'asc' },
    })
  }

  async findById(orgId: string, id: string) {
    const acc = await this.prisma.account.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { children: true, transactions: { orderBy: { transactionDate: 'desc' }, take: 20 } },
    })
    if (!acc) throw new NotFoundException('Account not found')
    return acc
  }

  async update(orgId: string, id: string, data: { name?: string; isActive?: boolean }) {
    const acc = await this.prisma.account.findFirst({ where: { id, organizationId: orgId } })
    if (!acc) throw new NotFoundException('Account not found')
    return this.prisma.account.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    })
  }
}
