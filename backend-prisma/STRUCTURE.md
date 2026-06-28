# Project Structure

## Philosophy

Clean Architecture **without unnecessary abstraction**. Every folder and file exists for a
clear reason. No ports/adapters, no use-case classes, no repository interfaces — Prisma is
the repository, NestJS modules are the DI boundaries, Zod schemas are the DTOs.

### What we explicitly avoid

| Antipattern | Why |
|---|---|
| `IUserRepository` interface + `UserRepository` impl | Prisma already abstracts SQL; wrapping it is indirection for its own sake |
| `CreateUserUseCase` class | NestJS service IS the use case — name methods `createUser`, not `execute` |
| `UserModel` / `UserEntity` classes | Prisma schema IS the domain model — `Prisma.User` is the single source of truth |
| `application/` / `infrastructure/` / `domain/` folders per module | Every module ends up with 3 empty folders — Prisma merges infrastructure+domain into one |
| DTO classes with `class-validator` | Zod schemas are smaller, faster, composable, and type-inferrable |
| Barrel `index.ts` files everywhere | Explicit imports make refactoring safe and greppable |
| Abstract base services | Inheritance couples modules — inject what you need |

## Directory Tree

```
src/
├── main.ts                          # Bootstrap: ValidationPipe, Swagger, CORS, helmet, compression
├── app.module.ts                    # Root module: imports all feature modules + global providers
│
├── config/                          # Environment-based configuration
│   ├── env.config.ts                #   validated environment variables (Zod)
│   ├── database.config.ts           #   Prisma datasource URL builder
│   ├── jwt.config.ts                #   JWT secret + expiry configuration
│   ├── cors.config.ts               #   CORS origin lists per environment
│   └── throttler.config.ts          #   Rate-limit TTL + limit
│
├── prisma/                          # Database layer (single source of truth for data access)
│   ├── prisma.module.ts             #   @Global() module — one PrismaService for the whole app
│   ├── prisma.service.ts            #   Extends PrismaClient, lifecycle hooks, query logging
│   └── prisma.types.ts              #   Re-exports Prisma generated types, custom JSON types
│
├── common/                          # Shared infrastructure (framework-agnostic where possible)
│   ├── decorators/
│   │   ├── current-user.decorator.ts   #   @CurrentUser() — extracts user from JWT payload
│   │   ├── public.decorator.ts         #   @Public() — skips JWT auth for an endpoint
│   │   ├── roles.decorator.ts          #   @Roles('admin', 'manager')
│   │   └── permissions.decorator.ts    #   @RequirePermissions('inventory:write')
│   │
│   ├── guards/
│   │   ├── jwt-auth.guard.ts           #   JwtAuthGuard — validates access token
│   │   ├── jwt.strategy.ts             #   Passport strategy — extracts user + roles from DB
│   │   └── roles.guard.ts             #   RolesGuard — checks role + permission on endpoint
│   │
│   ├── interceptors/
│   │   └── transform.interceptor.ts    #   Wraps all responses in { success, data, meta }
│   │
│   ├── filters/
│   │   └── all-exceptions.filter.ts    #   Global exception → { statusCode, message, errors }
│   │
│   ├── interfaces/
│   │   ├── auth.interface.ts           #   AuthenticatedUser, TokenPair, JwtPayload
│   │   └── api-response.interface.ts   #   ApiResponse<T>, PaginatedResponse<T>
│   │
│   └── utils/
│       ├── pagination.util.ts          #   paginate(), getPaginationArgs()
│       └── decimal.util.ts             #   safeDecimal() — Prisma Decimal → number conversion
│
├── modules/                          # Feature modules (one directory per bounded context)
│   │
│   ├── iam/                          # Identity & Access Management
│   │   ├── iam.module.ts             #   Module: imports PrismaModule, provides services
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts    #   POST /auth/login, /auth/refresh, /auth/logout
│   │   │   ├── users.controller.ts   #   CRUD /users + PATCH /users/:id/change-password
│   │   │   └── roles.controller.ts   #   CRUD /roles + permission assignment
│   │   ├── services/
│   │   │   ├── auth.service.ts       #   login, refreshToken rotation, logout, changePassword
│   │   │   ├── users.service.ts      #   CRUD, paginate, search, soft-delete, role assignment
│   │   │   └── roles.service.ts      #   CRUD, granular permission assignment
│   │   └── schemas/
│   │       ├── auth.schema.ts        #   Zod: LoginDto, RefreshDto, ChangePasswordDto
│   │       ├── user.schema.ts        #   Zod: CreateUserDto, UpdateUserDto, UserFilterDto
│   │       └── role.schema.ts        #   Zod: CreateRoleDto, UpdateRoleDto
│   │
│   ├── masterdata/                   # Categories, Products, Units
│   │   ├── masterdata.module.ts
│   │   ├── controllers/
│   │   │   ├── categories.controller.ts
│   │   │   ├── products.controller.ts
│   │   │   └── units.controller.ts
│   │   ├── services/
│   │   │   ├── categories.service.ts
│   │   │   ├── products.service.ts
│   │   │   └── units.service.ts
│   │   └── schemas/
│   │       ├── category.schema.ts
│   │       ├── product.schema.ts
│   │       └── unit.schema.ts
│   │
│   ├── inventory/                    # Stock batches, movements, adjustments, daily closing
│   │   ├── inventory.module.ts
│   │   ├── controllers/
│   │   │   └── inventory.controller.ts
│   │   ├── services/
│   │   │   ├── inventory.service.ts          # CRUD, FIFO reservation, adjustments
│   │   │   ├── stock-valuation.service.ts    # Weighted average cost, FIFO cost, valuation
│   │   │   ├── stock-aging.service.ts        # Age bucketing, expiry alerts
│   │   │   └── daily-closing.service.ts      # Snapshot, reconciliation
│   │   └── schemas/
│   │       ├── batch.schema.ts
│   │       ├── movement.schema.ts
│   │       └── adjustment.schema.ts
│   │
│   ├── procurement/                  # Purchase orders, supplier returns
│   │   ├── procurement.module.ts
│   │   ├── controllers/
│   │   │   └── procurement.controller.ts
│   │   ├── services/
│   │   │   └── procurement.service.ts
│   │   └── schemas/
│   │       ├── purchase-order.schema.ts
│   │       └── purchase-return.schema.ts
│   │
│   ├── sales/                        # Sales orders, payments, customer returns
│   │   ├── sales.module.ts
│   │   ├── controllers/
│   │   │   ├── sales.controller.ts
│   │   │   └── payments.controller.ts
│   │   ├── services/
│   │   │   ├── sales.service.ts
│   │   │   └── payment.service.ts
│   │   └── schemas/
│   │       ├── sales-order.schema.ts
│   │       └── payment.schema.ts
│   │
│   ├── customers/                    # Customer CRUD + credit management
│   │   ├── customers.module.ts
│   │   ├── controllers/
│   │   │   └── customers.controller.ts
│   │   ├── services/
│   │   │   └── customers.service.ts
│   │   └── schemas/
│   │       └── customer.schema.ts
│   │
│   ├── suppliers/                    # Supplier CRUD
│   │   ├── suppliers.module.ts
│   │   ├── controllers/
│   │   │   └── suppliers.controller.ts
│   │   ├── services/
│   │   │   └── suppliers.service.ts
│   │   └── schemas/
│   │       └── supplier.schema.ts
│   │
│   ├── accounting/                   # Chart of accounts, journal entries, reports
│   │   ├── accounting.module.ts
│   │   ├── controllers/
│   │   │   ├── accounts.controller.ts
│   │   │   ├── transactions.controller.ts
│   │   │   └── reports.controller.ts
│   │   ├── services/
│   │   │   ├── accounts.service.ts
│   │   │   ├── transactions.service.ts
│   │   │   └── reports.service.ts
│   │   └── schemas/
│   │       ├── account.schema.ts
│   │       └── transaction.schema.ts
│   │
│   ├── expenses/                     # Expense heads, claims, approvals
│   │   ├── expenses.module.ts
│   │   ├── controllers/
│   │   │   ├── expense-heads.controller.ts
│   │   │   └── claims.controller.ts
│   │   ├── services/
│   │   │   └── expenses.service.ts
│   │   └── schemas/
│   │       ├── expense-head.schema.ts
│   │       └── expense-claim.schema.ts
│   │
│   ├── organization/                 # Org profile, shops, warehouses, branches
│   │   ├── organization.module.ts
│   │   ├── controllers/
│   │   │   └── organization.controller.ts
│   │   ├── services/
│   │   │   └── organization.service.ts
│   │   └── schemas/
│   │       ├── shop.schema.ts
│   │       └── warehouse.schema.ts
│   │
│   ├── vehicles/                     # Vehicle fleet, trip logs
│   │   ├── vehicles.module.ts
│   │   ├── controllers/
│   │   │   └── vehicles.controller.ts
│   │   ├── services/
│   │   │   └── vehicles.service.ts
│   │   └── schemas/
│   │       └── vehicle.schema.ts
│   │
│   ├── reports/                      # Analytics (reads only)
│   │   ├── reports.module.ts
│   │   ├── controllers/
│   │   │   ├── reports.controller.ts
│   │   │   └── mv-refresh.controller.ts
│   │   ├── services/
│   │   │   ├── reports.service.ts
│   │   │   └── materialized-views.service.ts
│   │   └── schemas/
│   │       └── report-params.schema.ts
│   │
│   ├── audit/                        # Immutable mutation log
│   │   ├── audit.module.ts
│   │   ├── controllers/
│   │   │   └── audit.controller.ts
│   │   └── services/
│   │       └── audit.service.ts
│   │
│   └── notifications/                # In-app + email notifications
│       ├── notifications.module.ts
│       ├── controllers/
│       │   └── notifications.controller.ts
│       └── services/
│           └── notifications.service.ts
│
└── tests/                            # Test suites mirror src structure
    ├── e2e/
    │   ├── auth.e2e-spec.ts
    │   ├── sales.e2e-spec.ts
    │   └── inventory.e2e-spec.ts
    ├── unit/
    │   ├── iam/
    │   │   └── auth.service.spec.ts
    │   ├── inventory/
    │   │   └── stock-valuation.service.spec.ts
    │   └── accounting/
    │       └── transactions.service.spec.ts
    └── helpers/
        ├── test-db.ts               #   In-memory PostgreSQL or testcontainers
        ├── test-factory.ts           #   Prisma factory functions for test data
        └── test-auth.ts              #   Generate JWT tokens for test requests
```

## Where Each Class Belongs and Why

### Controllers → `controllers/`
**Responsibility**: HTTP transport only. Parse request params/body, call service, return response.
**Must have**: `@Controller()`, `@Get/Post/Put/Patch/Delete()` decorators.
**Must NOT have**: Business logic, database calls, validation beyond param parsing.
**File naming**: Plural noun — `users.controller.ts`, `inventory.controller.ts`.

```ts
// ✅ Correct — thin controller, delegates to service
@Post()
async create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
  return this.users.create(dto, user.orgId)
}
```

### Services → `services/`
**Responsibility**: Application logic. Orchestrate Prisma calls, enforce business rules,
manage transactions, compute values.
**Must have**: `@Injectable()`, injected `PrismaService`.
**Must NOT have**: HTTP decorators, request/response serialization.
**File naming**: Singular noun — `auth.service.ts`, `stock-valuation.service.ts`.

```ts
// ✅ Correct — service owns the business logic
async create(dto: CreateUserDto, orgId: string) {
  const hash = await bcrypt.hash(dto.password, 12)
  return this.prisma.user.create({
    data: { ...dto, passwordHash: hash, organizationId: orgId },
  })
}
```

### Zod Schemas → `schemas/`
**Responsibility**: Define request shapes, validate at the boundary, infer TypeScript types.
**Must have**: `z.object({...})` — exported type and schema.
**Must NOT have**: Business logic, database queries, HTTP concerns.
**File naming**: Noun describing the validated entity — `user.schema.ts`.

```ts
// ✅ Correct — single source of truth for shape + type
export const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  roleIds: z.array(z.string().uuid()).optional(),
})
export type CreateUserDto = z.infer<typeof CreateUserSchema>
```

### Domain Models → Prisma Schema (`schema.prisma`)
**Responsibility**: Single source of truth for data shape, relations, constraints, indexes.
**There is no separate domain model file**. The Prisma schema generates `@prisma/client`
types that ARE the domain models. If you need a computed type (e.g., `StockValuation`),
define it as a Zod schema or a TypeScript type alongside the service that computes it.

```ts
// ✅ Correct — computed type lives next to its service
// services/stock-valuation.service.ts
export type StockValuation = {
  productId: string
  productName: string
  totalQty: number
  weightedAvgCost: number
  totalValue: number
}
```

### Value Objects → closest to where they're used
**Responsibility**: Wrap primitives with validation + behavior (e.g., `Email`, `Money`,
`Sku`, `Phone`).
**Rule**: Put them in the schema file if they're request-level validations. Put them in
`common/utils/` if they're truly shared. Do NOT create a `value-objects/` folder for a
single `Email` class — just use `z.string().email()`.

```ts
// ✅ Correct — value behavior in a shared utility
// common/utils/decimal.util.ts
export function safeDecimal(v: Prisma.Decimal | string | number): number {
  if (v instanceof Prisma.Decimal) return v.toNumber()
  return Number(v)
}
```

### Prisma Module → `prisma/`
**Responsibility**: Singleton PrismaClient with lifecycle management.
**Why**: `@Global()` decorator means every service injects `PrismaService` directly
without importing PrismaModule. No repository layer needed because PrismaClient
already provides `findMany`, `create`, `update`, `$transaction`, etc.

```ts
// ✅ Correct — one PrismaClient for the whole app
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Common Infrastructure → `common/`
**Responsibility**: Framework cross-cutting concerns — guards, interceptors, filters,
decorators, shared interfaces.
**Why**: Every feature module needs these, but they're not feature-specific. Placing
them here avoids circular imports and makes them discoverable.

### Config → `config/`
**Responsibility**: Validate environment variables at startup, export typed config objects.
**Why**: Fail fast on misconfiguration. Typed config prevents `process.env.X` scattered
across the codebase.

```ts
// ✅ Correct — validated at bootstrap, typed everywhere
export const EnvConfig = z.object({
  PORT: z.coerce.number().default(3042),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
})
export type EnvConfig = z.infer<typeof EnvConfig>
```

### Tests → `tests/`
**Responsibility**: Verify behavior without starting the full app (unit) or with a real
database (e2e).
**Structure**: Mirrors `src/` structure for easy navigation. Unit tests sit alongside
the service they test in the `tests/` tree (not in `src/` — avoids bloating the
runtime image).

```ts
// ✅ Correct — test file mirrors service location
// tests/unit/inventory/stock-valuation.service.spec.ts
import { StockValuationService } from '../../../src/modules/inventory/services/stock-valuation.service'
```

## Module Boundaries (Bounded Contexts)

Each module owns its database tables. Cross-module access goes through the service,
never directly through Prisma.

| Module | Owns | Accesses (via service) |
|--------|------|----------------------|
| iam | User, Role, Permission | — |
| masterdata | Category, Product, Unit | — |
| inventory | StockBatch, StockMovement, InventoryAdjustment, DailyStockSnapshot | masterdata.Product |
| procurement | PurchaseOrder, PurchaseOrderItem | masterdata.Product, suppliers.Supplier, inventory.StockBatch |
| sales | SalesOrder, SalesOrderItem | masterdata.Product, customers.Customer, inventory.StockBatch |
| customers | Customer | — |
| suppliers | Supplier | — |
| accounting | Account, AccountTransaction, CustomerLedger, SupplierLedger, ChequeRegistry | customers.Customer, suppliers.Supplier |
| expenses | ExpenseHead, ExpenseClaim | accounting.Account |
| organization | Organization, Shop, Warehouse, Branch | — |
| vehicles | Vehicle, VehicleTrip | — |
| reports | — (reads only — queries MVs + Prisma) | Everything (read-only) |
| audit | AuditLog | — (append-only) |
| notifications | Notification | — |

## Prisma: The Data Layer (Not a Repository Abstraction)

Prisma is chosen specifically to avoid writing repository classes. If you find yourself
writing:

```ts
// ❌ WRONG — unnecessary abstraction
interface IUserRepository { findById(id: string): Promise<User> }
class UserRepository implements IUserRepository { ... }
class UserService { constructor(private repo: IUserRepository) {} }
```

Instead, use:

```ts
// ✅ CORRECT — Prisma is the repository
class UsersService { constructor(private prisma: PrismaService) {} }
```

Exceptions where a thin wrapper makes sense:
- **Read-model queries** that involve complex joins across modules (e.g., daily sales
  report joining SalesOrder + SalesOrderItem + Customer + Product) — put the raw query
  in a dedicated `*query.ts` or `*reader.ts` file
- **External API clients** (e.g., SMS gateway, email provider) — wrap in an
  `*adapter.ts` or `*client.ts` to make the external dependency swappable

```ts
// ✅ ACCEPTABLE — wraps complex multi-table read query
// modules/sales/services/daily-sales.reader.ts
export class DailySalesReader {
  constructor(private prisma: PrismaService) {}

  async getDailySummary(orgId: string, date: Date) {
    // Raw SQL or Prisma with deep includes
  }
}
```

## Migration Strategy (Current → Target)

The current project has inconsistent structures across modules. The target structure
standardizes everything. Migration steps:

1. Create `services/`, `controllers/`, `schemas/` folders in modules that lack them
2. Move `.service.ts` files from `application/` → `services/`
3. Move `.controller.ts` files from `presentation/` → `controllers/`
4. Remove empty `application/`, `presentation/`, `domain/`, `infrastructure/` folders
5. Create `schemas/` files for every module that accepts request bodies
6. Update `*.module.ts` imports to new paths
7. Delete this file after restructuring

**Do not** rename existing classes or break the API — only move files. The module file
and `@Module()` decorator remain at the module root.
