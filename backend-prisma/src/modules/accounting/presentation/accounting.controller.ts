import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AccountsService } from '../application/accounts.service'
import { TransactionsService } from '../application/transactions.service'
import { ReportsService } from '../application/reports.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(
    private accountsService: AccountsService,
    private transactionsService: TransactionsService,
    private reportsService: ReportsService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get accounting dashboard summary' })
  async getSummary(@CurrentUser('orgId') orgId: string) {
    return this.reportsService.getSummary(orgId)
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Create a new account' })
  async createAccount(@CurrentUser('orgId') orgId: string, @Body() dto: {
    accountCode: string; name: string; type: string; parentId?: string; openingBalance?: number
  }) {
    return this.accountsService.create(orgId, dto)
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List all accounts' })
  async findAccounts(@CurrentUser('orgId') orgId: string, @Query('type') type?: string) {
    return this.accountsService.findAll(orgId, type)
  }

  @Get('accounts/:id')
  @ApiOperation({ summary: 'Get account detail' })
  async findAccount(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.accountsService.findById(orgId, id)
  }

  @Patch('accounts/:id')
  @ApiOperation({ summary: 'Update account' })
  async updateAccount(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: { name?: string; isActive?: boolean }) {
    return this.accountsService.update(orgId, id, dto)
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Record a transaction' })
  async recordTransaction(@CurrentUser('orgId') orgId: string, @Body() dto: {
    accountId: string; transactionDate: string; type: 'DEBIT' | 'CREDIT';
    amount: number; description?: string; referenceType?: string; referenceId?: string
  }) {
    return this.transactionsService.record(orgId, dto)
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List transactions' })
  async findTransactions(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('accountId') accountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('type') type?: string,
  ) {
    return this.transactionsService.findAll(orgId, { page, limit, accountId, fromDate, toDate, type })
  }

  @Get('cash-book')
  @ApiOperation({ summary: 'Get cash book with running balance' })
  async getCashBook(
    @CurrentUser('orgId') orgId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.transactionsService.getCashBook(orgId, fromDate, toDate)
  }

  @Get('bank-book')
  @ApiOperation({ summary: 'Get bank book with running balance' })
  async getBankBook(
    @CurrentUser('orgId') orgId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.transactionsService.getBankBook(orgId, fromDate, toDate)
  }

  @Get('reports/profit-loss')
  @ApiOperation({ summary: 'Get profit & loss statement' })
  async getProfitLoss(
    @CurrentUser('orgId') orgId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.reportsService.getProfitAndLoss(orgId, fromDate, toDate)
  }

  @Get('reports/cash-flow')
  @ApiOperation({ summary: 'Get cash flow statement' })
  async getCashFlow(
    @CurrentUser('orgId') orgId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.reportsService.getCashFlow(orgId, fromDate, toDate)
  }

  @Get('reports/trial-balance')
  @ApiOperation({ summary: 'Get trial balance' })
  async getTrialBalance(@CurrentUser('orgId') orgId: string) {
    return this.reportsService.getTrialBalance(orgId)
  }
}
