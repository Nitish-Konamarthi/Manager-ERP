import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { ReportsService } from './reports.service'

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily-sales/:date')
  dailySales(@CurrentUser('orgId') orgId: string, @Param('date') date: string) {
    return this.reports.dailySales(orgId, date)
  }

  @Get('purchases')
  purchaseReport(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.purchaseReport(orgId, from, to)
  }

  @Get('stock')
  stockReport(@CurrentUser('orgId') orgId: string) {
    return this.reports.stockReport(orgId)
  }

  @Get('fast-moving')
  fastMoving(@CurrentUser('orgId') orgId: string, @Query('days') days?: string) {
    return this.reports.fastMovingProducts(orgId, days ? parseInt(days, 10) : 30)
  }

  @Get('spoilage')
  spoilageReport(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.spoilageReport(orgId, from, to)
  }

  @Get('profit')
  profitReport(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.profitReport(orgId, from, to)
  }

  @Get('outstanding-customers')
  outstandingCustomers(@CurrentUser('orgId') orgId: string) {
    return this.reports.outstandingCustomers(orgId)
  }

  @Get('supplier-ledger/:id')
  supplierLedger(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.supplierLedger(orgId, id, from, to)
  }

  @Get('customer-ledger/:id')
  customerLedger(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.customerLedger(orgId, id, from, to)
  }

  @Get('cash-book')
  cashBook(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.cashBook(orgId, from, to)
  }

  @Get('bank-book')
  bankBook(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.bankBook(orgId, from, to)
  }

  @Get('expenses')
  expenseReport(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.expenseReport(orgId, from, to)
  }

  @Get('top-customers')
  topCustomers(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string, @Query('limit') limit?: string) {
    return this.reports.topCustomers(orgId, from, to, limit ? parseInt(limit, 10) : 10)
  }

  @Get('top-suppliers')
  topSuppliers(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string, @Query('limit') limit?: string) {
    return this.reports.topSuppliers(orgId, from, to, limit ? parseInt(limit, 10) : 10)
  }

  @Get('product-profitability')
  productProfitability(@CurrentUser('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.productProfitability(orgId, from, to)
  }

  @Get('monthly-trends')
  monthlyTrends(@CurrentUser('orgId') orgId: string, @Query('months') months?: string) {
    return this.reports.monthlyTrends(orgId, months ? parseInt(months, 10) : 12)
  }

  @Get('yearly-trends')
  yearlyTrends(@CurrentUser('orgId') orgId: string, @Query('years') years?: string) {
    return this.reports.yearlyTrends(orgId, years ? parseInt(years, 10) : 5)
  }
}
