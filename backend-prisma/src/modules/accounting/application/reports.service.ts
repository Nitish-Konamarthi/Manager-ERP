import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getProfitAndLoss(orgId: string, fromDate: string, toDate: string) {
    const incomeAccounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, type: 'INCOME', deletedAt: null },
    })
    const expenseAccounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, type: 'EXPENSE', deletedAt: null },
    })

    const incomeItems = await Promise.all(
      incomeAccounts.map(async acc => {
        const total = await this.getTransactionTotal(orgId, acc.id, fromDate, toDate)
        return { account: acc.name, accountCode: acc.accountCode, total }
      }),
    )
    const expenseItems = await Promise.all(
      expenseAccounts.map(async acc => {
        const total = await this.getTransactionTotal(orgId, acc.id, fromDate, toDate)
        return { account: acc.name, accountCode: acc.accountCode, total }
      }),
    )

    const totalIncome = incomeItems.reduce((s, i) => s + i.total, 0)
    const totalExpense = expenseItems.reduce((s, i) => s + i.total, 0)

    return {
      period: { from: fromDate, to: toDate },
      income: { items: incomeItems, total: totalIncome },
      expense: { items: expenseItems, total: totalExpense },
      netProfit: totalIncome - totalExpense,
    }
  }

  async getCashFlow(orgId: string, fromDate: string, toDate: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, deletedAt: null },
    })

    const cashAccount = accounts.find(a => a.accountCode === '1001')
    const bankAccount = accounts.find(a => a.accountCode === '1002')

    const accountFlows = await Promise.all(
      accounts.map(async acc => {
        const debits = await this.getDebitTotal(orgId, acc.id, fromDate, toDate)
        const credits = await this.getCreditTotal(orgId, acc.id, fromDate, toDate)
        return {
          account: acc.name,
          accountCode: acc.accountCode,
          debits,
          credits,
          net: debits - credits,
        }
      }),
    )

    const openingCash = cashAccount ? Number(cashAccount.openingBalance) : 0
    const openingBank = bankAccount ? Number(bankAccount.openingBalance) : 0
    const cashFlow = accountFlows.find(f => f.accountCode === '1001')
    const bankFlow = accountFlows.find(f => f.accountCode === '1002')

    return {
      period: { from: fromDate, to: toDate },
      openingBalance: { cash: openingCash, bank: openingBank },
      cashFlow: cashFlow || { debits: 0, credits: 0, net: 0 },
      bankFlow: bankFlow || { debits: 0, credits: 0, net: 0 },
      closingBalance: {
        cash: openingCash + (cashFlow?.net || 0),
        bank: openingBank + (bankFlow?.net || 0),
      },
      accounts: accountFlows.filter(a => a.net !== 0),
    }
  }

  async getTrialBalance(orgId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { accountCode: 'asc' },
    })
    const items = accounts.map(a => ({
      code: a.accountCode,
      name: a.name,
      type: a.type,
      openingBalance: Number(a.openingBalance),
      currentBalance: Number(a.currentBalance),
    }))
    const totalDebits = items.filter(i => ['ASSET', 'EXPENSE'].includes(i.type))
      .reduce((s, i) => s + Math.abs(i.currentBalance), 0)
    const totalCredits = items.filter(i => ['LIABILITY', 'EQUITY', 'INCOME'].includes(i.type))
      .reduce((s, i) => s + Math.abs(i.currentBalance), 0)
    return { items, totalDebits, totalCredits, balanced: totalDebits === totalCredits }
  }

  private async getTransactionTotal(orgId: string, accountId: string, fromDate: string, toDate: string) {
    const result = await this.prisma.accountTransaction.aggregate({
      where: {
        organizationId: orgId,
        accountId,
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      _sum: { amount: true },
    })
    return Number(result._sum.amount || 0)
  }

  private async getDebitTotal(orgId: string, accountId: string, fromDate: string, toDate: string) {
    const result = await this.prisma.accountTransaction.aggregate({
      where: {
        organizationId: orgId,
        accountId,
        type: 'DEBIT',
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      _sum: { amount: true },
    })
    return Number(result._sum.amount || 0)
  }

  private async getCreditTotal(orgId: string, accountId: string, fromDate: string, toDate: string) {
    const result = await this.prisma.accountTransaction.aggregate({
      where: {
        organizationId: orgId,
        accountId,
        type: 'CREDIT',
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      _sum: { amount: true },
    })
    return Number(result._sum.amount || 0)
  }

  async getSummary(orgId: string) {
    const [accounts, recentTxns, income, expense] = await Promise.all([
      this.prisma.account.findMany({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.accountTransaction.findMany({
        where: { organizationId: orgId },
        orderBy: { transactionDate: 'desc' },
        take: 10,
        include: { account: true },
      }),
      this.prisma.account.aggregate({
        where: { organizationId: orgId, type: 'INCOME', deletedAt: null },
        _sum: { currentBalance: true },
      }),
      this.prisma.account.aggregate({
        where: { organizationId: orgId, type: 'EXPENSE', deletedAt: null },
        _sum: { currentBalance: true },
      }),
    ])
    const cashBalance = accounts.find(a => a.accountCode === '1001')?.currentBalance || 0
    const bankBalance = accounts.find(a => a.accountCode === '1002')?.currentBalance || 0
    return {
      totalAccounts: accounts.length,
      cashBalance: Number(cashBalance),
      bankBalance: Number(bankBalance),
      totalIncome: Number(income._sum.currentBalance || 0),
      totalExpense: Number(expense._sum.currentBalance || 0),
      recentTransactions: recentTxns,
    }
  }
}
