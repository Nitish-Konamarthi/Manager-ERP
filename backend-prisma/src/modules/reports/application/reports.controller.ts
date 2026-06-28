import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { ReportsService } from './reports.service'

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily-sales/:date')
  dailySales(@Param('date') date: string) {
    return this.reports.dailySales('org-fixed', date)
  }

  @Get('purchases')
  purchaseReport(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.purchaseReport('org-fixed', from, to)
  }

  @Get('stock')
  stockReport() {
    return this.reports.stockReport('org-fixed')
  }

  @Get('fast-moving')
  fastMoving(@Query('days') days?: string) {
    return this.reports.fastMovingProducts('org-fixed', days ? parseInt(days, 10) : 30)
  }

  @Get('spoilage')
  spoilageReport(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.spoilageReport('org-fixed', from, to)
  }

  @Get('profit')
  profitReport(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.profitReport('org-fixed', from, to)
  }

  @Get('outstanding-customers')
  outstandingCustomers() {
    return this.reports.outstandingCustomers('org-fixed')
  }

  @Get('supplier-ledger/:id')
  supplierLedger(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.supplierLedger('org-fixed', id, from, to)
  }

  @Get('customer-ledger/:id')
  customerLedger(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.customerLedger('org-fixed', id, from, to)
  }

  @Get('cash-book')
  cashBook(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.cashBook('org-fixed', from, to)
  }

  @Get('bank-book')
  bankBook(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.bankBook('org-fixed', from, to)
  }

  @Get('expenses')
  expenseReport(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.expenseReport('org-fixed', from, to)
  }

  @Get('top-customers')
  topCustomers(@Query('from') from: string, @Query('to') to: string, @Query('limit') limit?: string) {
    return this.reports.topCustomers('org-fixed', from, to, limit ? parseInt(limit, 10) : 10)
  }

  @Get('top-suppliers')
  topSuppliers(@Query('from') from: string, @Query('to') to: string, @Query('limit') limit?: string) {
    return this.reports.topSuppliers('org-fixed', from, to, limit ? parseInt(limit, 10) : 10)
  }

  @Get('product-profitability')
  productProfitability(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.productProfitability('org-fixed', from, to)
  }

  @Get('monthly-trends')
  monthlyTrends(@Query('months') months?: string) {
    return this.reports.monthlyTrends('org-fixed', months ? parseInt(months, 10) : 12)
  }

  @Get('yearly-trends')
  yearlyTrends(@Query('years') years?: string) {
    return this.reports.yearlyTrends('org-fixed', years ? parseInt(years, 10) : 5)
  }
}
