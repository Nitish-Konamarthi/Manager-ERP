import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'

import { getTypeOrmConfig } from './config/database.config'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'

import { AuthModule } from './modules/auth/auth.module'
import { InventoryModule } from './modules/inventory/inventory.module'
// Module stubs — imported but empty shell
import { SalesModule } from './modules/sales/sales.module'
import { ProcurementModule } from './modules/procurement/procurement.module'
import { FinanceModule } from './modules/finance/finance.module'
import { AccountingModule } from './modules/accounting/accounting.module'
import { CustomersModule } from './modules/customers/customers.module'
import { SuppliersModule } from './modules/suppliers/suppliers.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { VehiclesModule } from './modules/vehicles/vehicles.module'
import { ReportsModule } from './modules/reports/reports.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { MasterDataModule } from './modules/masterdata/masterdata.module'
import { IamModule } from './modules/iam/iam.module'

@Module({
  imports: [
    // ── Configuration ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // ── Database ──
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),

    // ── Rate Limiting ──
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 60),
        }],
      }),
    }),

    // ── Static Files (SPA) ──
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/(.*)'],
    }),

    // ── Business Modules ──
    AuthModule,
    InventoryModule,
    SalesModule,
    ProcurementModule,
    FinanceModule,
    AccountingModule,
    CustomersModule,
    SuppliersModule,
    ExpensesModule,
    VehiclesModule,
    ReportsModule,
    NotificationsModule,
    MasterDataModule,
    IamModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
