import { NestFactory, Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Logger, VersioningType } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import compression from 'compression'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { QueryFailedFilter } from './common/filters/query-failed.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { ValidationPipe } from './common/pipes/validation.pipe'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    bufferLogs: true,
  })

  const configService = app.get(ConfigService)
  const logger = new Logger('Bootstrap')

  // ── Security ──
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(compression())

  // ── CORS ──
  const corsOrigins = configService.get('CORS_ORIGINS', 'http://localhost:3043') as string
  app.enableCors({
    origin: corsOrigins.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
    maxAge: 3600,
  })

  // ── API Versioning ──
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  })

  // ── Global pipes, filters, interceptors ──
  app.useGlobalPipes(new ValidationPipe())
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  )

  // ── Swagger / OpenAPI ──
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Manager ERP API')
    .setDescription('Production-grade Enterprise Resource Planning API for vegetable retail + hotel supply business')
    .setVersion('2.0.0')
    .setContact('ERP Team', 'https://manager-erp.app', 'support@manager-erp.app')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
    .addTag('Authentication', 'User login, JWT tokens, password management')
    .addTag('Inventory', 'Stock batches, movements, adjustments, reservations, transfers, valuation, aging')
    .addTag('Sales', 'Retail transactions, hotel orders, delivery notes, invoices')
    .addTag('Procurement', 'Purchase orders, goods receipts, supplier management')
    .addTag('Finance', 'Invoices, payments, credit/debit notes, daily flash')
    .addTag('Accounting', 'Cash/bank book, income, expenses, ledgers, P&L, cash flow, cheques')
    .addTag('Master Data', 'Stores, produce, categories, units of measure')
    .addTag('IAM', 'Users, roles, permissions')
    .addTag('Reports', 'Pre-built reports and analytics')
    .addTag('Notifications', 'In-app notifications and alerts')
    .addTag('Settings', 'System configuration')
    .addTag('Audit', 'Activity audit log')
    .addServer(`http://localhost:${configService.get('PORT', 3042)}`)
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  })

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
    },
    customSiteTitle: 'Manager ERP API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  })

  // ── Start ──
  const port = configService.get('PORT', 3042) as number
  await app.listen(port, '0.0.0.0')
  logger.log(`Manager ERP API running on http://localhost:${port}`)
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`)
}

bootstrap()
