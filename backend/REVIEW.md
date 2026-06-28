# ERP System Review

## 1. Code Maintainability

### Strengths
- **Consistent naming**: services use `*Service`, controllers use `*Controller`, files named by entity
- **One concern per file**: controllers don't contain business logic, services don't handle HTTP
- **Explicit imports**: no barrel files (`index.ts`), making grep-safe refactoring
- **Prisma as single ORM**: no mix of raw SQL + query builder + ORM in different modules
- **Module boundaries clear**: each module's ownership of tables is documented in `STRUCTURE.md`

### Weaknesses
- **ReportsService (704 lines) is a god service**: 16+ report methods in one class with duplicated Prisma query patterns. Changes to one report risk breaking another. Helper methods (`getAvgCost`, `getAvgSellingPrice`) are duplicated between reports and inventory services.
- **InventoryService (401 lines) is borderline**: batch CRUD, movements, adjustments, FIFO reservations, valuation, aging, daily closing, and dashboard — eight distinct responsibilities in one class.
- **Empty modules**: `ExpensesModule`, `VehiclesModule`, `AuditModule`, `NotificationsModule` are `@Module({})` placeholders. They compile but serve no purpose.
- **No Zod schemas exist**: `STRUCTURE.md` describes a `schemas/` directory per module, but none have been created. Requests are validated ad-hoc in service methods rather than at the boundary.
- **`src/config/` is empty**: ConfigModule loads `.env` globally, but there's no typed config object. `process.env.JWT_SECRET` is scattered. A missing env var fails at runtime, not at bootstrap.
- **No DTO types**: Request shapes are defined as inline anonymous types in method signatures rather than reusable TypeScript types.

### Risks
- A 700-line service will grow as new reports are added, making it untestable and fragile.
- Empty modules create dead code paths that won't be caught until runtime if someone expects them to work.
- Ad-hoc validation means a missing check on one endpoint creates a bypass.

### Recommended Improvements
```
Now (high priority):
  - Split ReportsService into one file per report category:
      reports/daily-sales.report.ts, reports/profit.report.ts, reports/stock.report.ts, etc.
  - Extract inventory sub-services:
      inventory/batch.service.ts, inventory/reservation.service.ts, inventory/closing.service.ts
  - Delete empty placeholder modules (expenses, vehicles, audit, notifications) until implementation starts
  - Create typed EnvConfig with Zod validation in src/config/env.config.ts

Postpone:
  - Zod schemas for every endpoint — implement per module during normal development, not as a separate project
  - Migration to new folder layout (controllers/, services/, schemas/) — do it incrementally when touching each module
```

## 2. Scalability

### Strengths
- **Stateless API**: all state in PostgreSQL + Redis, no in-memory session data — horizontal scale by adding instances
- **Multi-tenant by discriminator**: every query filters by `organizationId`, making data isolation predictable even at scale
- **Read replicas supported**: reports and dashboard queries can be routed to a replica by changing `DATABASE_URL`
- **Materialized views**: heavy aggregation queries pre-computed, refreshed on schedule — dashboard loads don't scan millions of rows

### Weaknesses
- **No read/write splitting**: single `DATABASE_URL` means all queries hit the primary, increasing contention
- **Reports service queries Prisma directly**: the 704-line service does real-time aggregations on every call. A daily sales report for 1 year with 50,000 orders will be slow without MVs.
- **No caching strategy**: frequently accessed data (categories, products, stock positions) is fetched from DB on every request. No Redis cache layer implemented.
- **BullMQ installed but no queues wired**: Redis is available but only the mv-refresh processor references queues. Order processing, notifications, and audit logging should use async queues.

### Risks
- At 50 concurrent users generating reports during peak hours, the primary PostgreSQL connection pool (20 connections) will saturate.
- Materialized views have no automated refresh schedule — must rely on admin triggering or external cron, which isn't set up.

### Recommended Improvements
```
Now (high priority):
  - Add Redis caching for:
      - Stock positions (TTL: 30s — stale data is better than no data under load)
      - Product/category lists (TTL: 5min — rarely changes)
      - Report results with ?from=&to= (TTL: 2min — same params = same result)
  - Create a ReadReplicaPrismaService that routes read queries to the replica
  - Set up pg_cron or a BullMQ cron job for automatic MV refresh every midnight

Postpone:
  - Horizontal read replicas until you have >100 concurrent users
  - Queue-based order processing until manual order creation becomes a bottleneck
```

## 3. Readability

### Strengths
- **Clear file names**: `auth.service.ts`, `users.controller.ts` — you know what's inside without opening
- **Consistent method naming**: `create*`, `findAll`, `findById`, `update*`, `delete*` across all services
- **Short classes** (most modules): controllers average 40–80 lines, services 50–100 lines (except the two god services)
- **Decoupled imports**: no deep chains of re-exports, no barrel files obscuring dependencies

### Weaknesses
- **Inline types everywhere**: method signatures use `data: { ... }` anonymous objects instead of named interfaces. A `CreateBatchDto` interface would be more readable and reusable.
- **401-line inventory service has no internal sections**: it's one flat list of methods with no grouping comments or sub-service delegation. The long methods (`reserveStock`, `closeDaily`) are hard to scan.
- **No consistent error handling pattern**: some methods throw `NotFoundException`, others throw `BadRequestException`, some throw `ConflictException`. No error codes or standardized error response format across modules.
- **Decimal arithmetic without helpers**: `Number(b.availableQty) - Number(b.reservedQty)` repeated ~20 times across the codebase. A `available(batch)` helper would be cleaner.

### Recommended Improvements
```
Now (high priority):
  - Extract repeating decimal patterns into a shared helper:
      export function freeQty(batch: { availableQty: any; reservedQty: any }) {
        return Number(batch.availableQty) - Number(batch.reservedQty)
      }
  - Define named DTO interfaces at the top of each service file (exported from a types.ts):
      export interface CreateBatchDto { ... }
      export interface ReserveStockDto { ... }

Postpone:
  - Formal Zod schemas — start with TypeScript interfaces for readability, add Zod for runtime validation when needed
```

## 4. Performance

### Strengths
- **Partial indexes** on StockBatch: `WHERE deletedAt IS NULL AND (available_qty - reserved_qty) > 0` — index is small and fast
- **Composite indexes** on most foreign keys: `organizationId + entityId` patterns cover 95% of queries
- **Pagination everywhere**: no unbounded queries — every list endpoint takes `page` and `limit` (max 500)
- **Lock timeout**: 5-second limit prevents connection starvation from stuck locks
- **Prepared statements**: Prisma uses parameterized queries by default

### Weaknesses
- **N+1 queries in reports**: `getAvgCost()` and `getAvgSellingPrice()` are called PER LINE ITEM inside loops. A daily sales report with 5,000 items will execute 10,000 extra queries.
- **No query batching**: `closeDaily()` queries movements PER BATCH in a loop instead of one `GROUP BY` query
- **Materialized views lack UNIQUE indexes** for `CONCURRENTLY` refresh: without unique indexes, REFRESH MATERIALIZED VIEW CONCURRENTLY fails. Some views in `migration.sql` are missing them.
- **No limit on report date ranges**: a request to `/reports/daily-sales?date=2020-01-01` would scan 6+ years of data with no guard rail.

### Risks
- The N+1 issue in reports will cause 5-second+ response times for any report spanning more than 30 days of data
- Missing unique indexes on MVs means CONCURRENTLY refresh fails at runtime, forcing full table locks

### Recommended Improvements
```
Now (high priority):
  - Fix N+1 in reports: batch-load costs with a single query:
      SELECT product_id, SUM(unit_cost * received_qty) / SUM(received_qty) as avg_cost
      FROM stock_batches GROUP BY product_id
  - Limit date ranges: reject queries spanning >365 days:
      if (days(to, from) > 365) throw new BadRequestException('Max range is 365 days')
  - Add UNIQUE indexes to all materialized views (verify migration.sql)

Postpone:
  - Query result caching until the slow queries are identified by actual usage
  - Read replica routing until the primary shows signs of load
```

## 5. Database Design

### Strengths
- **Proper normalization**: all tables in 3NF, no denormalized redundancy (outstanding balance on Customer is the one intentional denormalization)
- **Consistent column naming**: `created_at`, `updated_at`, `deleted_at`, `organization_id` on every table
- **Named foreign keys**: Prisma's `@relation("Name")` disambiguates multiple relations between same tables
- **Index coverage**: every foreign key has an index, every filtered query has a partial index, every sort column has an index
- **Enum types**: PostgreSQL enums for status fields prevent invalid states at the database level
- **CHECK constraints**: `available_qty >= 0`, `reserved_qty <= available_qty` — the ultimate safety net against buggy code
- **UUID primary keys**: no auto-increment IDs, preventing enumeration attacks and simplifying multi-tenant sharding

### Weaknesses
- **`outstanding` denormalized on Customer/Supplier**: stored as a column but never updated by trigger or application code (no code sets `customer.outstanding`). The value will always be 0 unless a migration backfills it. This is a **data integrity bug**.
- **`currentBalance` on Account**: same problem as outstanding — stored in the Account table but only updated by `transactions.service.ts` via application code. A bug in the service causes silent financial inconsistency.
- **`@db.VarChar(20)` on status enums**: using VARCHAR instead of the actual enum type means invalid statuses aren't rejected by the database. The enums exist but aren't used for some columns.
- **`reservedQty` not in CHECK constraint**: `concurrency_setup.sql` defines `chk_reserved_not_exceed_available CHECK (reserved_qty <= available_qty)` but this constraint is only in the migration file, not enforced by Prisma schema — a `prisma db push` would skip it.

### Risks
- Outstanding balances being perpetually 0 means customer credit management is non-functional and financial reports are wrong.
- Account `currentBalance` drift: if a transaction creation fails after updating the balance, the balance update can't be rolled back because it's in a different transaction.

### Recommended Improvements
```
Now (critical):
  - Remove denormalized `outstanding` from Customer and Supplier models.
    Compute it via query: SELECT SUM(total - paidAmount) FROM sales_orders
    The materialized view mv_customer_summary already has this.
  - Same for Account.currentBalance: remove the column, compute from transactions.
    Or: add a trigger that updates it atomically.

Now (high priority):
  - Move CHECK constraints into schema.prisma using raw SQL in @@map blocks or a post-deploy hook:
      @@schema = "CHECK (available_qty >= 0)"
  - Fix AccountTransaction to use the AccountType/TransactionType enums instead of VARCHAR
```

## 6. Security

### Strengths
- **`SECURITY.md` covers 18 sections**: comprehensive design covering every layer from transport to backup
- **JWT with refresh token rotation**: each refresh invalidates the previous token family, preventing stolen token reuse
- **bcrypt cost 12**: computationally expensive hashing resists brute force
- **Default-deny auth**: all endpoints require JWT unless explicitly marked `@Public()`
- **Helmet + compression**: standard Express security headers
- **Rate limiting**: ThrottlerGuard at 100 requests/minute
- **Input validation**: global ValidationPipe with `forbidNonWhitelisted` strips unknown fields
- **SQL injection prevention**: Prisma parameterized queries, no raw SQL in application code (raw SQL only in migrations)
- **Soft deletes**: `deletedAt` on every table — data is never actually deleted

### Weaknesses
- **`forbidNonWhitelisted` with no DTOs**: the ValidationPipe strips unknown fields, but there are no DTOs defined with `class-validator` decorators. The result: ALL fields are "unknown" and get stripped. The pipe effectively blocks every request body.
- **Permissions decorator exists but is not enforced**: `@RequirePermissions('inventory:write')` is defined in `permissions.decorator.ts`, and `RolesGuard` imports it, but the guard only checks `@Roles()` — it never reads permissions metadata. The permission system is wired but non-functional.
- **CORS origins in env file but not parsed**: `CORS_ORIGINS` env var accepts a comma-separated string, but `main.ts` probably doesn't parse it into an array.
- **No CSRF protection**: JWT stored in header prevents CSRF, but if any endpoint uses cookies, it's vulnerable.

### Risks
- With `forbidNonWhitelisted` active and no whitelisted DTOs, the entire API silently rejects all request bodies. Every POST/PUT/PATCH endpoint returns 400 or ignores the payload.
- RolesGuard allows access when no roles are required (returns `true`), but combined with JwtAuthGuard, the user is still authenticated. The actual risk is low, but the guard should require at least one role on sensitive endpoints.

### Recommended Improvements
```
Now (critical):
  - Fix ValidationPipe: disable forbidNonWhitelisted until DTOs are created:
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    Remove forbidNonWhitelisted or add class-validator DTOs immediately.

Now (high priority):
  - Wire permissions into RolesGuard:
      const requiredPermissions = this.reflector.get<Permission[]>(PERMISSIONS_KEY, context.getHandler())
      if (requiredPermissions) { check user permissions }
  - Parse CORS_ORIGINS into an array in main.ts:
      const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || []

Postpone:
  - Rate limiting per-endpoint (currently global 100/min) — configure stricter limits on auth endpoints
```

## 7. Business Rules

### Strengths
- **FIFO inventory valuation**: oldest batches reserved first — correct for perishable vegetables where older stock must sell first
- **Credit check on outstanding customers**: `outstandingCustomers()` report compares outstanding vs credit limit
- **Order status transitions**: `DRAFT → CONFIRMED → PROCESSING → SHIPPED → DELIVERED` — proper workflow
- **Partial payment support**: `SalesOrder.paidAmount + paymentStatus` handles hotel customers who pay in installments
- **Spoilage tracking**: `InventoryAdjustment` with reason codes tracks waste by category (damage, expiry, theft)

### Weaknesses
- **No status transition validation**: the service accepts `updateStatus(orgId, id, 'SHIPPED', version)` but doesn't validate that `DRAFT → SHIPPED` is invalid. A DRAFT order can jump to SHIPPED without being confirmed.
- **No soft-delete prevention on used entities**: a customer with sales orders can be soft-deleted, making historical reports show "Unknown Customer".
- **Negative pricing allowed**: `unitPrice` and `unitCost` are `Decimal` without a `CHECK(price > 0)` constraint.
- **Payment recording doesn't update Customer.outstanding**: even if the column existed, recording a payment on a SalesOrder doesn't update the Customer's outstanding balance.
- **No minimum stock level enforcement**: `Product.minStockLevel` exists in the schema but no service method checks or alerts when stock falls below it. The `lowStock` filter in dashboard uses a hardcoded threshold of 10.

### Risks
- A DRAFT order can be marked DELIVERED without any goods movement, bypassing inventory tracking entirely.
- Customers with deleted records cause broken foreign key reports in the long tail.

### Recommended Improvements
```
Now (high priority):
  - Add status transition map:
      const VALID_TRANSITIONS: Record<string, string[]> = {
        DRAFT: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['PROCESSING', 'CANCELLED'],
        PROCESSING: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['DELIVERED', 'RETURNED'],
      }
  - Prevent soft-delete of entities with active references:
      const hasOrders = await this.prisma.salesOrder.count({ where: { customerId: id } })
      if (hasOrders > 0) throw new BadRequestException('Cannot delete customer with sales orders')

Postpone:
  - Min/max stock level alerts — implement when BullMQ notifications are set up
  - Negative pricing checks — unlikely to be a real-world issue for vegetables
```

## 8. Inventory Accuracy

### Strengths
- **Pessimistic locking with `SELECT ... FOR UPDATE`**: concurrent reservations can't oversell
- **Guard condition in UPDATE**: `WHERE (available_qty - reserved_qty) >= ?` — atomic check-and-update prevents phantom stock
- **CHECK constraint**: `available_qty >= 0` — database rejects negative stock at the storage level
- **FIFO allocation order**: `ORDER BY received_date ASC` — oldest stock is always consumed first
- **Full audit trail**: every stock change creates a `StockMovement` record — you can trace every unit from purchase to sale to write-off

### Weaknesses
- **`reserveStock` returns empty array**: the method creates reservations in a loop but never pushes to the `reservations` array. The return value is always `[]`. The reservation records ARE created (they have `create` calls), but the function loses the references.
- **`reserveStock` doesn't create StockMovement records**: the commented-out `StockMovement.create` block means reservations never appear in the movement ledger. A sale with reserved stock won't show in stock movement history until the goods are actually shipped.
- **Daily closing loops over every movement**: `closeDaily` queries `StockMovement` per batch in a loop instead of using `GROUP BY` — O(n) queries where n = number of batches.
- **No FIFO cost layer tracking**: when stock is sold, the COGS is calculated from weighted average (`getAvgCost`), not from the actual batch that was reserved. True FIFO accounting requires tracking which batch was sold and using that batch's unit cost.

### Risks
- An empty reservation response breaks the caller (procurement/sales) that expects to link line items to reserved batches.
- Missing movement records for reservations means the audit trail is incomplete — you can see stock was reserved but not when or by whom.
- Daily closing performance degrades linearly with the number of batches — at 10,000 batches, it's 10,000 queries.

### Recommended Improvements
```
Now (critical):
  - Fix reserveStock return value: push each created reservation to the array
  - Add StockMovement creation inside reserveStock:
      await tx.stockMovement.create({
        data: {
          organizationId, batchId: batch.id, productId,
          movementType: 'RESERVED', quantity: -allocate,
          unitCost: batch.unitCost, totalCost: Number(batch.unitCost) * allocate,
          referenceType, referenceId, createdById: userId,
        },
      })

Now (high priority):
  - Fix closeDaily to use a single GROUP BY query:
      SELECT batch_id, movement_type, SUM(quantity) as total_qty
      FROM stock_movements WHERE batch_id IN (...) GROUP BY batch_id, movement_type
  - Add explicit batch_id tracking on SalesOrderItem so COGS uses actual batch cost, not weighted average
```

## 9. Financial Accuracy

### Strengths
- **Double-entry accounting**: every `AccountTransaction` has a DEBIT and a CREDIT — total debits always equal total credits
- **Transaction isolation**: `runTransaction` with `SERIALIZABLE` isolation for payment recording detects write skew
- **Running balance on ledgers**: cash book and bank book compute running balance from opening + transactions
- **P&L, cash flow, trial balance**: three standard financial reports computed from transaction data

### Weaknesses
- **No DEBIT/CREDIT verification**: `transactions.service.ts` records individual transactions but doesn't enforce that a DEBIT has a matching CREDIT. A partial entry (DEBIT without CREDIT) breaks the accounting equation.
- **Account `currentBalance` is unreliable**: stored as a column and updated by the application, but any failed transaction after the balance update causes permanent drift. Should either be removed (computed from transactions) or updated via a database trigger.
- **No closing period**: daily closing only covers inventory, not accounting. There's no month-end or year-end closing that prevents edits to closed periods.
- **Cash/Bank book assumes single account**: `cashBook()` queries `findFirst` by `accountCode: '1001'`. If the organization has multiple cash accounts, only the first one is reported.

### Risks
- A bug in the transaction recording logic creates unbalanced entries that silently corrupt financial reports. No automated reconciliation detects this.
- Without period closing, someone can edit last year's transactions, changing historical P&L statements.

### Recommended Improvements
```
Now (critical):
  - Validate DEBIT/CREDIT balance in transaction recording:
      const totalDebit = entries.filter(e => e.type === 'DEBIT').reduce(...)
      const totalCredit = entries.filter(e => e.type === 'CREDIT').reduce(...)
      if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced transaction')

Now (high priority):
  - Remove Account.currentBalance or implement a DB trigger that updates it atomically
  - Add a "periods" table (year, month, closed_at) and reject transactions in closed periods
  - Support multiple cash/bank accounts in cash book and bank book reports

Postpone:
  - Automated reconciliation with bank statements (requires external bank API)
```

## 10. API Design

### Strengths
- **RESTful resource naming**: `/api/v1/auth/login`, `/api/v1/inventory/batches`, `/api/v1/sales/orders`
- **Consistent response format**: `{ success: true, data: ..., timestamp }` via TransformInterceptor
- **Consistent error format**: `{ success: false, message: "...", errors: [...], timestamp }` via AllExceptionsFilter
- **Paginated responses**: `{ items: [...], total, page, limit, totalPages }` via paginate()
- **Swagger documentation**: configured in main.ts at `/api/docs`

### Weaknesses
- **No versioning in URL or headers**: all endpoints at `/api/v1/` is fine, but there's no mechanism for v2 without breaking v1 clients
- **No rate limiting per endpoint**: ThrottlerGuard is global at 100 req/min. Auth endpoints (`/auth/login`) should have a stricter limit (e.g., 5/min per IP) to prevent brute force.
- **No response compression**: compression middleware is imported but response compression for large report payloads (daily sales with thousands of items) isn't configured.
- **Inconsistent error status codes**: some methods throw `BadRequestException` for conflicts (e.g., duplicate batch code should be `409 Conflict`, not `400 Bad Request`).

### Risks
- Brute force attacks on `/auth/login` are limited to 100 requests/minute globally — enough for 1,667 password attempts per hour across all users.

### Recommended Improvements
```
Now (high priority):
  - Add stricter ThrottlerGuard on auth endpoints:
      @Throttle({ default: { limit: 5, ttl: 60000 } })
  - Standardize error codes: duplicate = 409, not found = 404, validation = 400, auth = 401
  - Enable compression for responses >1KB:
      app.use(compression({ threshold: 1024 }))

Postpone:
  - API versioning (url prefix /api/v2/) until breaking changes are actually needed
```

## 11. Project Structure

### Strengths
- **Feature modules**: each business domain has its own module directory — easy to find related code
- **Single NestJS project**: no monorepo overhead, no shared package management, no cross-package versioning
- **Prisma module is global**: all services inject PrismaService directly without per-module imports
- **No unnecessary abstractions**: no repository layer, no use-case classes, no mediator pattern

### Weaknesses
- **Four different folder conventions**: some modules use `application/presentation/`, some use `controllers/services/schemas/`, some have no subfolders. This is confusing and undocumented.
- **Empty folders**: `src/config/` is an empty directory committed to the repo. `domain/` and `infrastructure/` folders in IAM and Inventory are also empty.
- **`common/guards/index.ts` exists but `common/` has an `index.ts` too**: barrel files exist inconsistently. Most modules don't have them, but common does.
- **`main.ts` has too many responsibilities**: bootstrap + CORS + helmet + compression + Swagger + ValidationPipe + interceptors + filters + listening. Should delegate Swagger setup to a helper file.

### Recommended Improvements
```
Now (high priority):
  - Delete empty folders: src/config/, domain/, infrastructure/ (if empty)
  - Standardize to three folders per module: controllers/, services/, (empty folders removed)
  - Extract Swagger setup from main.ts to swagger.setup.ts in src/
  - Remove barrel files (common/index.ts, common/guards/index.ts) — they hide dependencies

Postpone:
  - Monorepo split until the codebase exceeds 20,000 lines
```

## 12. Testing Strategy

### Strengths
- **Jest configured**: `package.json` has Jest config with ts-jest, though no tests exist yet
- **`test/` directory exists**: the empty directory is at least waiting for tests
- **Modular architecture supports unit testing**: each service injects PrismaService, making it mockable by replacing it with a test double
- **Prisma supports in-memory SQLite**: fast unit tests without a real PostgreSQL instance

### Weaknesses
- **Zero tests**: 66 TypeScript files, ~3,800 lines of code, 14 controllers, 22 services — not one test file. This is the single biggest quality risk in the project.
- **No E2E test infrastructure**: `test/jest-e2e.json` is referenced in `package.json` scripts but doesn't exist.
- **No test factories**: there's no `test/factories/` directory for creating test data (Prisma factories for Category, Product, Batch, etc.)
- **No CI pipeline**: no `.github/workflows/` or `.gitlab-ci.yml` — tests can't run automatically

### Risks
- Every deploy is blind. A simple refactor of `getAvgCost` in reports.service.ts could break 16 report types without anyone knowing until a user complains.
- The concurrency logic (advisory locks, FOR UPDATE, retry) is the most complex code in the project and has zero test coverage. A deadlock bug that only manifests under load will go undetected.

### Recommended Improvements
```
Now (critical — build these before adding any more features):
  - Write 3 immediate integration tests for the inventory reservation flow:
      1. Single reservation reduces available_qty by correct amount
      2. Two concurrent reservations don't oversell (requires running two transactions)
      3. Release reservation restores available_qty
  - Write 3 immediate integration tests for financial accuracy:
      1. Recording a transaction maintains DEBIT = CREDIT
      2. Payment updates SalesOrder.paidAmount atomically
      3. Cash book running balance matches transaction history
  - Write 1 E2E test for the auth flow:
      1. Login → get JWT → access protected endpoint → refresh → access with new token

Now (high priority):
  - Create test/lib/ with:
      test/lib/test-db.ts — PrismaClient connected to test database
      test/lib/test-factory.ts — createCategory(), createProduct(), createBatch() helpers
      test/lib/test-auth.ts — generateTestToken() for authenticated requests
  - Add test npm scripts: "test:cov": "jest --coverage", "test:e2e": "jest --config ./test/jest-e2e.json"

Postpone:
  - CI pipeline setup until tests exist and pass
  - 100% coverage goal — start with the critical paths (inventory, accounting, auth)
```

## 13. Deployment Simplicity

### Strengths
- **Docker Compose for local development**: single `docker compose up` starts PostgreSQL + Redis
- **Multi-stage Dockerfile**: builder stage (dev dependencies) + runner stage (production only) — small final image
- **Health check endpoint**: `GET /health` returns DB connectivity status — usable by orchestrator liveness probes
- **Single process architecture**: one NestJS process handles everything — no microservice orchestration needed
- **Prisma migrations**: declarative schema changes with rollback support via `prisma migrate`

### Weaknesses
- **No production docker-compose.yml**: the existing one is for development only (exposes ports, no volumes, no restart policy). Production needs a different compose file with proper volume mounts, secrets, and health checks.
- **No `.env` management**: `.env` is in `.gitignore` (good) but there's no documented process for managing secrets in production. No Vault, no Kubernetes secrets, no encrypted env files.
- **Dockerfile HEALTHCHECK uses `curl`**: `curl` is not installed in `node:22-alpine`. The HEALTHCHECK will fail unless `curl` is added via `apk add --no-cache curl`.
- **No init script**: first deployment requires running `prisma migrate deploy && prisma db seed` manually. No startup script or init container handles this.

### Risks
- HEALTHCHECK failing in production means the orchestrator (Docker Swarm / Kubernetes) restarts a healthy container, causing unnecessary downtime.
- Missing curl in the Docker image means the HEALTHCHECK command silently fails.

### Recommended Improvements
```
Now (high priority):
  - Fix Dockerfile: add curl to runner stage:
      RUN apk add --no-cache curl
  - Create docker/docker-compose.prod.yml with:
      - Persistent volumes for PostgreSQL and Redis
      - Restart: always policies
      - No exposed ports (use internal network)
      - Secrets via Docker secrets or env_file
  - Create a docker/init.sh script:
      npx prisma migrate deploy
      npx prisma db seed (only if empty)
      node dist/main.js
  - Document deployment steps in DEPLOY.md:
      1. docker compose -f docker/docker-compose.prod.yml up -d
      2. Initial setup runs automatically via init.sh

Postpone:
  - Kubernetes manifests until the deployment requires horizontal scaling
  - CI/CD pipeline until the testing strategy is established
```

## 14. Future Expansion

### Areas that will scale well
- **New modules**: adding a "HR" or "Payroll" module follows the same pattern — create module dir, add controllers/services, register in AppModule. No core changes needed.
- **Multi-warehouse, multi-shop**: schema already has `Shop`, `Warehouse`, `Branch` models. Inventory scoped by `shopId`. Adding a new shop is a single INSERT.
- **More report types**: the reports module pattern (controller + service + materialized view) is well-established. Adding a new report is a method + endpoint.
- **Custom fields / product attributes**: Product model has limited fields but Prisma's JSON type could extend it without schema migration.
- **Internationalization**: all currency amounts are `Decimal` with no hardcoded currency symbol — multi-currency support requires only adding a `currency` column.

### Areas that will NOT scale well
- **Single Prisma connection pool**: when the app grows to handle 500+ concurrent requests, a single PrismaClient with 20 connections will be the bottleneck. Each connection is held for the duration of a transaction.
- **Monolithic bull queue**: one Redis instance and one queue worker means queue processing is single-threaded. If notification sending blocks, payment processing waits.
- **Report performance at scale**: the current architecture computes reports on demand against the same database that handles transactions. At 10 million transactions, a P&L statement across all time will take minutes.
- **No event system**: cross-module communication is synchronous (Service A calls Service B directly). Adding a new feature that needs to react to "OrderConfirmed" requires modifying EventProcessingService or adding explicit calls. An event bus would decouple this.

### Recommended Improvements
```
Build now:
  - All the "critical" and "high priority" items listed above
  - These are blocking issues — the app doesn't work correctly without them

Build next (after tests + critical fixes):
  - Inventory FIFO cost tracking on SalesOrderItem (batchId population)
  - Period closing for accounting (prevent edits to closed months)
  - Automatic materialized view refresh via pg_cron or BullMQ
  - Low stock alerts via notifications (when BullMQ is wired)

Postpone (only if needed):
  - Event bus / message broker (NATS, Kafka) — the app has 14 modules and no module needs to react to another module's events yet. Add when the 15th module creates a circular dependency.
  - CQRS / read models — the materialized views already serve this purpose. Add Event Sourcing + CQRS only if audit requirements demand point-in-time reconstruction of every aggregate.
  - Microservices split — the modular monolith will serve 10-50 concurrent users comfortably. Split when:
      * The team has 3+ developers working on different modules simultaneously
      * Deployment takes >30 minutes due to build times
      * A single module needs to scale independently (e.g., inventory API needs 10 replicas but accounting needs 1)
  - GraphQL — REST is simpler for this type of ERP. Add GraphQL only if the frontend team requests it for complex multi-entity screens.
  - Real-time updates (WebSocket) — BullMQ events + polling every 30s is sufficient for an ERP. Add WebSockets only if the UI needs sub-second updates (e.g., a live stock dashboard).
  - Blockchain-based audit — unnecessary for a vegetable wholesale business. PostgreSQL audit logs with append-only access are sufficient.
```

## Priority Summary

### Critical — fix now (app doesn't work correctly)

| Issue | Area | Fix |
|-------|------|-----|
| `forbidNonWhitelisted` blocks all requests | Security | Remove or add DTOs |
| `reserveStock` returns empty array | Inventory | Push to array |
| Customer/Supplier `outstanding` always 0 | DB Design | Remove column, use query |
| No DEBIT/CREDIT balance check | Financial | Validate before insert |
| Zero tests | Testing | Write 3 integration tests for critical paths |

### High Priority — fix next (app works but has issues)

| Issue | Area | Fix |
|-------|------|-----|
| ReportsService 704 lines | Maintainability | Split into category files |
| InventoryService 401 lines | Maintainability | Extract sub-services |
| N+1 queries in reports | Performance | Batch-load costs |
| Permissions decorator not wired | Security | Connect to RolesGuard |
| No status transition validation | Business Rules | Add transition map |
| Daily closing loops per batch | Performance | Use GROUP BY |
| Materialized views lack unique indexes | Performance | Add for CONCURRENTLY |
| Empty placeholder modules | Maintainability | Delete or implement |
| No Redis caching | Scalability | Cache stock/products |
| Missing movement records for reservations | Inventory | Add StockMovement.create |
| Main.ts too long | Structure | Extract Swagger setup |
| Docker HEALTHCHECK broken | Deployment | Install curl in image |

### Low Priority — postpone

| Issue | When |
|-------|------|
| Zod schemas per module | During normal dev, not as a separate task |
| Read replica routing | When primary shows load |
| API versioning | When breaking changes are needed |
| Event bus / message broker | When 15th module creates cycle |
| Microservices split | When team has 3+ devs |
| GraphQL | When frontend team requests it |
| Real-time WebSockets | When 30s polling is insufficient |

### Never — unless business genuinely requires it

| Technology | Why not |
|------------|---------|
| Blockchain audit | PostgreSQL audit logs are immutable enough for vegetables |
| Event Sourcing + CQRS | Materialized views already serve read models |
| Saga pattern (distributed transactions) | Single PostgreSQL handles ACID for all modules |
| Kubernetes | Docker Compose + single VM serves <100 concurrent users |
| Multi-region deployment | Single-location vegetable business doesn't need it |
| Machine learning predictions | Unless you're predicting vegetable prices algorithmically |
| Micro frontends | The team is you — a single SPA is more productive |
