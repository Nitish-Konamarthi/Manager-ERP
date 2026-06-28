import { Module } from '@nestjs/common'
import { AccountsService } from './application/accounts.service'
import { TransactionsService } from './application/transactions.service'
import { ReportsService } from './application/reports.service'
import { AccountingController } from './presentation/accounting.controller'

@Module({
  controllers: [AccountingController],
  providers: [AccountsService, TransactionsService, ReportsService],
  exports: [AccountsService, TransactionsService, ReportsService],
})
export class AccountingModule {}
