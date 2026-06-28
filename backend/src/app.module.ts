import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { PrismaModule } from './prisma/prisma.module'
import { IamModule } from './modules/iam/iam.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { OrganizationModule } from './modules/organization/organization.module'
import { AuditModule } from './modules/audit/audit.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { MasterdataModule } from './modules/masterdata/masterdata.module'
import { ProcurementModule } from './modules/procurement/procurement.module'
import { SalesModule } from './modules/sales/sales.module'
import { AccountingModule } from './modules/accounting/accounting.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { VehiclesModule } from './modules/vehicles/vehicles.module'
import { CustomersModule } from './modules/customers/customers.module'
import { SuppliersModule } from './modules/suppliers/suppliers.module'
import { ReportsModule } from './modules/reports/reports.module'
import { HealthController } from './modules/health.controller'
import { DashboardController } from './modules/dashboard.controller'
import { CompatibilityController } from './modules/compatibility.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'api', ttl: 60000, limit: 100 }]),
    PrismaModule,
    IamModule,
    InventoryModule,
    OrganizationModule,
    AuditModule,
    NotificationsModule,
    MasterdataModule,
    ProcurementModule,
    SalesModule,
    AccountingModule,
    ExpensesModule,
    VehiclesModule,
    CustomersModule,
    SuppliersModule,
    ReportsModule,
  ],
  controllers: [HealthController, DashboardController, CompatibilityController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
