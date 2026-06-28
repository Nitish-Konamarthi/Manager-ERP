import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async record(orgId: string, data: {
    accountId: string; transactionDate: string; type: 'DEBIT' | 'CREDIT';
    amount: number; description?: string; referenceType?: string; referenceId?: string
  }) {
    const account = await this.prisma.account.findFirst({
      where: { id: data.accountId, organizationId: orgId, deletedAt: null },
    })
    if (!account) throw new NotFoundException('Account not found')

    return this.prisma.$transaction(async tx => {
      const txn = await tx.accountTransaction.create({
        data: {
          organizationId: orgId,
          accountId: data.accountId,
          transactionDate: new Date(data.transactionDate),
          type: data.type,
          amount: data.amount,
          description: data.description,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        },
      })

      const balanceChange = data.type === 'DEBIT' ? data.amount : -data.amount
      await tx.account.update({
        where: { id: data.accountId },
        data: {
          currentBalance: Number(account.currentBalance) + balanceChange,
          version: { increment: 1 },
        },
      })

      return txn
    })
  }

  async findAll(orgId: string, params: {
    page?: number; limit?: number; accountId?: string;
    fromDate?: string; toDate?: string; type?: string
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId }
    if (params.accountId) where.accountId = params.accountId
    if (params.type) where.type = params.type
    if (params.fromDate || params.toDate) {
      where.transactionDate = {}
      if (params.fromDate) where.transactionDate.gte = new Date(params.fromDate)
      if (params.toDate) where.transactionDate.lte = new Date(params.toDate)
    }
    const [items, total] = await Promise.all([
      this.prisma.accountTransaction.findMany({
        where, skip, take, orderBy: { transactionDate: 'desc' },
        include: { account: true },
      }),
      this.prisma.accountTransaction.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async getCashBook(orgId: string, fromDate?: string, toDate?: string) {
    const cashAccount = await this.prisma.account.findFirst({
      where: { organizationId: orgId, accountCode: '1001', deletedAt: null },
    })
    if (!cashAccount) throw new NotFoundException('Cash account not found')
    return this.getAccountBook(orgId, cashAccount.id, fromDate, toDate)
  }

  async getBankBook(orgId: string, fromDate?: string, toDate?: string) {
    const bankAccount = await this.prisma.account.findFirst({
      where: { organizationId: orgId, accountCode: '1002', deletedAt: null },
    })
    if (!bankAccount) throw new NotFoundException('Bank account not found')
    return this.getAccountBook(orgId, bankAccount.id, fromDate, toDate)
  }

  private async getAccountBook(orgId: string, accountId: string, fromDate?: string, toDate?: string) {
    const where: any = { organizationId: orgId, accountId }
    if (fromDate || toDate) {
      where.transactionDate = {}
      if (fromDate) where.transactionDate.gte = new Date(fromDate)
      if (toDate) where.transactionDate.lte = new Date(toDate)
    }
    const transactions = await this.prisma.accountTransaction.findMany({
      where, orderBy: { transactionDate: 'asc' },
    })
    let runningBalance = 0
    const items = transactions.map(t => {
      runningBalance += t.type === 'DEBIT' ? Number(t.amount) : -Number(t.amount)
      return { ...t, balance: runningBalance }
    })
    return { transactions: items, balance: runningBalance }
  }
}
