# Security Architecture — Manager ERP

## Defense in Depth

Every layer of the stack enforces security independently. If one layer fails, the next contains the damage.

```
Client → TLS → API Gateway → Guards → Validation → Service → Repository → Database
         (transport)   (rate/auth)    (input)  (logic)   (ORM)     (constraints)
```

---

## 1. Authentication

### Password-Based Login

```
Client                    Server                          Database
  │                         │                                │
  │  POST /auth/login       │                                │
  │  { email, password }    │                                │
  │────────────────────────►│                                │
  │                         │  SELECT user                   │
  │                         │───────────────────────────────►│
  │                         │◄───────────────────────────────│
  │                         │  bcrypt.compare(password, hash)│
  │                         │  if !match → 401              │
  │                         │  if status !== ACTIVE → 403    │
  │                         │  JWT.sign({ sub, orgId, ... }) │
  │                         │  store refresh_token (hash)    │
  │  { accessToken,         │                                │
  │    refreshToken }       │                                │
  │◄────────────────────────│                                │
```

**Password Storage**: bcrypt with cost factor 12. No plaintext ever stored. No logging of passwords or tokens.

**Account Lockout**: After 5 failed attempts within 15 minutes, account is locked for 30 minutes. Tracked in Redis with TTL.

**Rate Limit on Login**: 5 requests per minute per IP (ThrottlerGuard + Redis storage).

### JWT + Refresh Token Rotation

| Token | TTL | Storage | Contains | Rotation |
|-------|-----|---------|----------|----------|
| Access JWT | 15 min | Client memory (httpOnly) | sub, email, orgId, roles | Silent refresh via interceptor |
| Refresh JWT | 7 days | Redis hash per family | sub, familyId | Rotation: old revoked on use |

**Refresh Token Rotation (RTR)**: Every refresh issues a new pair and revokes the old. If a revoked token is reused, the entire family is invalidated — signals token theft. All active sessions for that user are force-logged-out.

**Blacklist**: On logout or password change, access tokens remain valid until natural expiry but refresh tokens are immediately invalidated from Redis. For high-security operations (password change, role change), a Redis blacklist entry (`blacklist:user:{userId}`) with TTL matching remaining access token lifetime forces re-authentication.

---

## 2. Authorization — RBAC

### Model

```
User ──1:N──► UserRole ──N:1──► Role ──1:N──► Permission
                                    │
                            resource: "inventory.batches"
                            action:   "create"
```

### Guard Chain (runs on every authenticated request)

```
  1. JwtAuthGuard       — Verify JWT signature + expiry. Populate req.user.
  2. TenantGuard        — Verify orgId matches token claim. Inject into Prisma middleware.
  3. RolesGuard         — Check role membership (fast path, optional).
  4. PermissionsGuard   — Check resource:action granular permissions (optional).
  5. ThrottlerGuard     — Apply rate limits per route.
```

### Implementation

```typescript
// Route-level role check
@Roles('admin')
@Post('users')
async createUser() { ... }

// Route-level permission check  
@RequirePermissions('inventory:adjust')
@Post('inventory/adjustments')
async adjustStock() { ... }

// Mixed
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin', 'manager')
@RequirePermissions('reports:read')
@Get('reports/profit-loss')
async profitLoss() { ... }
```

### Default-Deny Principle

Every endpoint is **denied by default**. Authentication is required unless explicitly marked `@Public()`. This prevents accidentally exposing sensitive endpoints.

---

## 3. Password Security

### Storage

- Algorithm: bcrypt
- Cost factor: 12 (~250ms per hash on modern hardware)
- Per-password unique salt (automatic with bcrypt)
- Never logged, never returned in API responses

### Policy (enforced at registration + change)

| Rule | Value |
|------|-------|
| Minimum length | 8 characters |
| Complexity | At least 1 uppercase, 1 lowercase, 1 digit, 1 special |
| History | Cannot reuse last 5 passwords |
| Max age | 90 days (configurable) |
| Lockout threshold | 5 failures in 15 minutes |

### Password Change Flow

```
1. Verify old password (bcrypt.compare)
2. Check new password against policy (Zod schema)
3. Check history against last 5 hashes stored in password_history table
4. Hash new password (bcrypt, cost 12)
5. Store new hash + push old hash to history
6. Invalidate all refresh tokens for user (force re-login)
7. Log event to audit
```

---

## 4. Input Validation

### Two-Layer Strategy

| Layer | Technology | Scope |
|-------|-----------|-------|
| Transport | class-validator + ValidationPipe | DTOs at controller boundary |
| Domain | Zod schemas | Business rules in services |

### Transport Layer (class-validator)

```typescript
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
  password: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string
}
```

Global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`:
- `whitelist`: strips unknown properties
- `forbidNonWhitelisted`: rejects requests with unknown properties (mass assignment prevention)
- `transform`: converts strings to numbers/booleans

### Domain Layer (Zod)

```typescript
const stockAdjustmentSchema = z.object({
  batchId: z.string().uuid(),
  adjustmentType: z.enum(['damage', 'spoilage', 'theft', 'correction', 'return']),
  quantity: z.number().refine(v => v !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1).max(500),
  expectedVersion: z.number().int().positive(),
})
```

---

## 5. SQL Injection Prevention

### Prisma ORM

All database queries go through Prisma, which uses parameterized queries exclusively. Raw SQL is never constructed via string concatenation.

```typescript
// SAFE: Prisma parameterized query
await prisma.user.findMany({
  where: { email: userInput },  // Always parameterized
})

// BLOCKED BY LINT: No raw SQL string interpolation
// await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${userInput}'`)
```

**Lint Rule**: `no-restricted-syntax` disallows `$queryRawUnsafe` and `$executeRawUnsafe` in production code. Raw queries must use `$queryRaw` with template literals (which Prisma parameterizes).

```typescript
// SAFE: Template literal raw query
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${userInput}`
```

### PostgreSQL Constraints

Even if SQL injection reaches the database, PostgreSQL's type system rejects invalid data:
- UUID columns reject non-UUID strings
- Integer columns reject strings
- Enum columns reject invalid enum values
- `CHECK` constraints on business rules

---

## 6. Mass Assignment Prevention

### Defense Layers

| Layer | Mechanism |
|-------|-----------|
| DTO | `forbidNonWhitelisted: true` rejects unknown fields |
| Service | Explicit property destructuring, never spreads `body` |
| Prisma | `select` / `include` explicitly lists returned fields |

### Prohibited Pattern

```typescript
// NEVER DO THIS:
const user = await prisma.user.create({ data: req.body })  // Mass assignment vulnerability

// ALWAYS DO THIS:
const user = await prisma.user.create({
  data: {
    email: dto.email,
    passwordHash: hash,
    name: dto.name,
    organizationId: orgId,  // From token, not from body
  },
})
```

### Field Exposure Prevention

API responses never return `passwordHash`, `refreshToken`, or internal fields. Prisma's `select` or response mapping ensures this:

```typescript
return {
  id: user.id,
  email: user.email,
  name: user.name,
  // passwordHash NEVER included
  // refreshToken NEVER included
}
```

---

## 7. Rate Limiting

### Multi-Layer Strategy

| Layer | Scope | Limit | Storage | Purpose |
|-------|-------|-------|---------|---------|
| Global | Per IP | 100 req/s | In-memory | Traffic smoothing |
| Auth | Per IP | 5 req/min | Redis | Prevent brute force |
| API | Per user | 1000 req/min | Redis | Fair usage |
| Critical | Per endpoint | 10 req/s | Redis | Inventory writes, PO creation |
| Import | Per org | 1 req/30s | Redis | Large file processing |

### Implementation

```typescript
// Global: app.module.ts
ThrottlerModule.forRoot([
  { name: 'api', ttl: 60000, limit: 100 },
])

// Auth: auth.controller.ts
@Throttle({ default: { ttl: 60000, limit: 5 } })
@Post('login')
async login() {}

// Critical: inventory.controller.ts
@Throttle({ default: { ttl: 1000, limit: 10 } })
@Post('adjustments')
async adjustStock() {}
```

### Distributed Rate Limiting

In production, all rate limiters use Redis as the storage backend: `ThrottlerStorageRedisService`. This ensures consistent limits across multiple instances.

---

## 8. Secure File Uploads

### Upload Flow

```
Client → Multer (memoryStorage) → File type validation → Scan → S3/disk
                                                          │
                                                     Virus total
                                                     (future)
```

### Restrictions

| Property | Setting |
|----------|---------|
| Max size | 5 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/gif`, `application/pdf` |
| Storage | `memoryStorage` (never write to disk directly) |
| File name | UUIDv4 + original extension (prevent path traversal) |
| Access control | Signed URLs with expiry for downloads |

### Implementation

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
    cb(allowed.includes(file.mimetype) ? null : new BadRequestException('Invalid file type'), false)
  },
}))
async upload(@UploadedFile() file: Express.Multer.File) {
  const key = `${uuidv4()}${path.extname(file.originalname)}`
  await s3.putObject({ Bucket: 'erp-uploads', Key: key, Body: file.buffer })
  return { url: `https://cdn.erp.com/${key}` }
}
```

---

## 9. Secrets Management

### Environment Variables

All secrets are environment variables. Never committed to version control.

```bash
# .env (in .gitignore)
JWT_SECRET=production-grade-256-bit-secret
DATABASE_URL=postgresql://user:password@host:5432/db
REDIS_URL=rediss://:password@cluster.redis.com:6379
S3_SECRET_KEY=...
```

### Secret Rotation

| Secret | Rotation | Mechanism |
|--------|----------|-----------|
| JWT signing key | Every 90 days | Dual-key overlap: verify with old, sign with new for 24h |
| Database password | Every 180 days | Zero-downtime: update app first, then DB |
| API keys | On compromise | Immediate regeneration |

### Production Secret Store

In production, secrets come from:
1. Docker secrets (Docker Swarm)
2. AWS Secrets Manager / Vault (Kubernetes)
3. Environment variables (fallback)

```typescript
// Secret retrieval
const secret = configService.get('JWT_SECRET')
// ConfigModule loads from: env file → container secrets → manager
```

---

## 10. Database Constraints

### Constraints as Security Controls

Every constraint enforces a business rule at the database level. The application must pass these constraints — they cannot be bypassed by any code path.

| Constraint | Example | Security Benefit |
|-----------|---------|-----------------|
| `NOT NULL` | `email VARCHAR(255) NOT NULL` | Prevents incomplete data |
| `UNIQUE` | `UNIQUE(organization_id, sku)` | Prevents duplicate records |
| `FOREIGN KEY` | `product_id → products(id)` | Prevents orphaned records |
| `CHECK` | `CHECK (available_qty >= 0)` | Prevents negative inventory |
| `ENUM` | `status VARCHAR(20) CHECK (status IN ('ACTIVE','BLOCKED'))` | Prevents invalid states |
| `PRIMARY KEY` | `id UUID DEFAULT gen_random_uuid()` | Guarantees row identity |

### Prisma Schema Enforces These

```prisma
model StockBatch {
  availableQty Decimal  @db.Decimal(12, 3)
  // Application enforces availableQty >= 0
  // Database enforces via CHECK constraint in migration SQL
}
```

### Additional Migration Constraints

```sql
-- Added manually in migration SQL beyond Prisma's capabilities
ALTER TABLE stock_batches ADD CONSTRAINT positive_available_qty 
  CHECK (available_qty >= 0);
ALTER TABLE stock_batches ADD CONSTRAINT valid_status 
  CHECK (status IN ('AVAILABLE','PARTIALLY_RESERVED','FULLY_RESERVED','COMPLETED','EXPIRED','WRITTEN_OFF'));
```

---

## 11. Transaction Safety

### ACID Via Prisma Interactive Transactions

All multi-step mutations use `prisma.$transaction()`. This ensures:

- **Atomic**: All steps succeed or all roll back
- **Consistent**: Constraints are validated at commit
- **Isolated**: Serializable isolation level prevents dirty reads
- **Durable**: Committed data survives crashes

```typescript
async transferStock(orgId: string, fromBatchId: string, toBatchId: string, quantity: number) {
  return this.prisma.$transaction(async tx => {
    const from = await tx.stockBatch.findUniqueOrThrow({ where: { id: fromBatchId } })
    const to = await tx.stockBatch.findUniqueOrThrow({ where: { id: toBatchId } })

    if (Number(from.availableQty) < quantity) {
      throw new BadRequestException('Insufficient stock')
    }

    await tx.stockBatch.update({
      where: { id: fromBatchId },
      data: { availableQty: Number(from.availableQty) - quantity },
    })
    await tx.stockBatch.update({
      where: { id: toBatchId },
      data: { availableQty: Number(to.availableQty) + quantity },
    })
    // If this throws, both updates roll back
    await tx.stockMovement.create({ ... })
  })
}
```

### What Transactions Protect Against

| Scenario | Without Transaction | With Transaction |
|----------|-------------------|-----------------|
| Server crash after debit, before credit | Lost inventory | Full rollback |
| Concurrent deduction from same batch | Double-spend | Serialized access |
| Partial failure in multi-step operation | Inconsistent state | Atomic commit/rollback |
| Foreign key violation on related insert | Orphaned record | Complete rollback |

---

## 12. Concurrency Handling

### Optimistic Locking

Strategic aggregates use a `version` column. Every update increments the version. Writes check that the version hasn't changed since read.

**Entities with optimistic locking:**

| Entity | Field | Update Strategy |
|--------|-------|-----------------|
| StockBatch | `version: Int` | `version: { increment: 1 }` + `where: { version: expectedVersion }` |
| PurchaseOrder | `version: Int` | Same pattern |
| SalesOrder | `version: Int` | Same pattern |
| Account | `version: Int` | Same pattern |
| Product | `version: Int` | Same pattern |
| Customer | `version: Int` | Same pattern |
| Supplier | `version: Int` | Same pattern |
| User | `version: Int` | Same pattern |

### Client-Side Flow

```
Client reads batch (version=5)     → Server returns { ..., version: 5 }
User edits quantity                → Client holds version=5
Client sends adjustment            → Server receives { ..., expectedVersion: 5 }
Server updates                     → UPDATE ... SET version = 6 WHERE id = X AND version = 5
                                    → If rows_affected === 0 → Conflict (409)
                                    → Server returns new version=6
Client must re-read and retry      → Or shows "Modified by another user"
```

### Implementation

```typescript
async adjustStock(dto: AdjustStockDto) {
  return this.prisma.$transaction(async tx => {
    const batch = await tx.stockBatch.findUnique({ where: { id: dto.batchId } })
    if (batch.version !== dto.expectedVersion) {
      throw new ConflictException(
        `Batch was modified by another user. Current version: ${batch.version}, expected: ${dto.expectedVersion}`
      )
    }
    // ... perform adjustment ...
    return tx.stockBatch.update({
      where: { id: dto.batchId, version: dto.expectedVersion },  // Double-check in WHERE
      data: {
        availableQty: newQty,
        version: { increment: 1 },
      },
    })
  })
}
```

### What Optimistic Locking Prevents

| Scenario | Without Locking | With Locking |
|----------|----------------|--------------|
| Two users adjust same batch simultaneously | Last write wins, first update lost | Second write fails with 409 |
| Customer pays twice due to double-click | Duplicate payment recorded | Version check prevents double-apply |
| Stock deducted after reservation check | Negative inventory | Conflict prevents overselling |

---

## 13. Audit Logs

### What Gets Logged

| Event | Logged Data | Retention |
|-------|-------------|-----------|
| Authentication | userId, IP, userAgent, success/failure, timestamp | 1 year |
| Data mutation | userId, entityType, entityId, oldValue (JSON), newValue (JSON), IP | 5 years |
| Authorization failure | userId, resource, action, IP | 1 year |
| Configuration change | userId, setting, oldValue, newValue | 5 years |
| Data export | userId, entityType, filter criteria, rowCount | 1 year |

### Audit Log Schema

```prisma
model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?
  action         String   // 'LOGIN', 'CREATE_BATCH', 'ADJUST_STOCK', 'CONFLICT', etc.
  entityType     String   // 'StockBatch', 'User', 'SalesOrder', etc.
  entityId       String
  oldValue       Json?    // Previous state (for mutations)
  newValue       Json?    // New state (for mutations)
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())
}
```

### Implementation

```typescript
// Audit interceptor — logs all state-changing mutations
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest()
    const method = request.method
    const user = request.user

    // Only log mutation methods
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle()
    }

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const entityId = request.params.id || responseData?.id
          const entityType = this.extractEntityType(request.route.path)

          await this.prisma.auditLog.create({
            data: {
              organizationId: user?.orgId || 'system',
              userId: user?.id,
              action: `${method}:${entityType}`,
              entityType,
              entityId: entityId || 'unknown',
              oldValue: request.body ? JSON.parse(JSON.stringify(request.body)) : null,
              newValue: responseData ? JSON.parse(JSON.stringify(responseData)).data || null : null,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            },
          })
        } catch (e) {
          // Audit failure must NOT break the request
          Logger.warn(`Audit log failed: ${e.message}`)
        }
      }),
    )
  }

  private extractEntityType(path: string): string {
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }
}
```

### Why Audit Logs Matter for Security

- **Detect breaches**: Unusual patterns (e.g., 1000 failed logins from one IP)
- **Forensics**: Trace exactly what an attacker did
- **Compliance**: Prove data handling meets regulatory requirements
- **Accountability**: Users know every action is traceable
- **Conflict resolution**: Determine who changed what and when

---

## 14. Soft Deletes

### Implementation

Every entity table has a `deletedAt` column. Records are never physically deleted.

```prisma
model Customer {
  deletedAt DateTime? @map("deleted_at")
}
```

### Query Filtering

All queries exclude soft-deleted records by default:

```typescript
// Every service method includes:
const where: any = { organizationId: orgId, deletedAt: null }

// Future: Prisma middleware to auto-append deletedAt: null
```

### Data Recovery

Soft-deleted records can be restored within 30 days:

```typescript
async restore(orgId: string, id: string) {
  const record = await this.prisma.customer.findFirst({
    where: { id, organizationId: orgId, deletedAt: { not: null } },
  })
  if (!record) throw new NotFoundException('Deleted record not found')
  if (record.deletedAt < new Date(Date.now() - 30 * 86400000)) {
    throw new BadRequestException('Recovery window expired (30 days)')
  }
  return this.prisma.customer.update({
    where: { id },
    data: { deletedAt: null },
  })
}
```

### Physical Deletion (Cleanup)

A scheduled job permanently deletes records that have been soft-deleted for more than 90 days. This runs during low-traffic hours and processes in batches of 100.

```typescript
async cleanup() {
  const cutoff = new Date(Date.now() - 90 * 86400000)
  await this.prisma.customer.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  })
}
```

---

## 15. Backup & Recovery Strategy

### Backup Types

| Backup | Frequency | Retention | Storage | Size Estimate |
|--------|-----------|-----------|---------|---------------|
| Full database | Daily (0200 UTC) | 30 days | S3 Glacier (encrypted) | ~500 MB |
| WAL archive | Continuous (every 60s) | 7 days | S3 Standard (encrypted) | ~100 MB/day |
| Configuration | On change | 90 days | Git + S3 | < 1 MB |

### Backup Encryption

All backups are encrypted with AES-256 before leaving the database server:

```bash
pg_dump --dbname=erp --format=custom \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file /etc/backup-key \
  | aws s3 cp - s3://erp-backups/daily/erp-$(date +%Y%m%d).dump.gpg
```

### Recovery Point Objectives

| Scenario | RPO | RTO | Method |
|----------|-----|-----|--------|
| Application crash | 0 (stateless) | < 2 min | Restart container |
| Database corruption | < 5 min | < 30 min | PITR from WAL |
| Accidental data deletion | < 24h | < 1 hour | Restore from daily backup |
| Full region failure | < 1 hour | < 4 hours | Cross-region restore |
| Ransomware | < 24h | < 2 hours | Immutable backup restore |

### Recovery Procedure

```bash
# 1. Stop application
docker compose down

# 2. Restore database from latest backup
aws s3 cp s3://erp-backups/daily/erp-20260627.dump.gpg /tmp/restore.dump.gpg
gpg --decrypt /tmp/restore.dump.gpg > /tmp/restore.dump
pg_restore --dbname=erp --clean --if-exists /tmp/restore.dump

# 3. Replay WAL to point of failure (PITR)
# Create recovery.conf:
#   restore_command = 'aws s3 cp s3://erp-backups/wal/%f %p'
#   recovery_target_time = '2026-06-27 14:23:00 UTC'

# 4. Verify data integrity
psql erp -c "SELECT count(*) FROM users"
psql erp -c "SELECT count(*) FROM stock_batches"

# 5. Start application
docker compose up -d
```

### Immutable Backups

Production backups are written to S3 with Object Lock enabled (Governance mode, 7-day retention). This prevents ransomware or malicious actors from deleting or encrypting backups.

---

## 16. Data Integrity Rules

### Entity-Level Rules (Enforced in Service + Database)

| Entity | Rule | Enforcement |
|--------|------|-------------|
| StockBatch | `availableQty >= 0` | Service check + DB CHECK constraint |
| StockBatch | `reservedQty <= receivedQty` | Service check |
| StockBatch | `status` transitions valid | Service enum mapping |
| PurchaseOrder | `total = sum(line items)` | Service calculation + DB trigger |
| SalesOrder | `paidAmount <= total` | Service check |
| AccountTransaction | `amount > 0` | Service check + DB CHECK |
| User | `email` unique per org | DB UNIQUE constraint |
| Product | `sku` unique per org | DB UNIQUE constraint |

### Referential Integrity (Database FK Constraints)

Every foreign key is enforced at the database level. Orphaned records are impossible.

```
stock_batches.organization_id → organizations.id
stock_batches.product_id → products.id
stock_batches.supplier_id → suppliers.id
stock_batches.shop_id → shops.id
stock_batches.created_by → users.id
stock_movements.batch_id → stock_batches.id
stock_reservations.batch_id → stock_batches.id
inventory_adjustments.batch_id → stock_batches.id
purchase_orders.supplier_id → suppliers.id
purchase_order_items.order_id → purchase_orders.id
sales_orders.customer_id → customers.id
sales_order_items.order_id → sales_orders.id
account_transactions.account_id → accounts.id
... (all FKs enforced)
```

### Data Type Integrity (PostgreSQL Type System)

| Data | PostgreSQL Type | Invalid Value Behavior |
|------|----------------|----------------------|
| UUID primary key | `uuid` | String "abc" → constraint violation error |
| Monetary values | `decimal(14, 2)` | String "xyz" → type error |
| Quantity | `decimal(12, 3)` | Negative value (if CHECK) → constraint error |
| Date | `timestamp` / `date` | Invalid format → type error |
| JSON | `jsonb` | Invalid JSON → parse error |
| Enum | `varchar` + CHECK | Invalid value → constraint error |

### Eventual Consistency for Cross-Aggregate Rules

Some rules span multiple aggregates. These use eventual consistency:

| Rule | Primary Aggregate | Async Check |
|------|-------------------|-------------|
| Customer credit limit not exceeded | SalesOrder | After order placement, queue checks + alerts |
| Stock not oversold across shops | StockBatch | Reservation system prevents overselling |
| Duplicate payment detection | Payment | Idempotency key + async duplicate check |

---

## 17. HTTP Security Headers (Helmet.js)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // For Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.erp.com"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
}))
```

### Response Headers (set by middleware)

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces TLS |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS filter |
| `Content-Security-Policy` | (see above) | XSS & data injection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |

---

## 18. Security Checklist Summary

### Pre-Deployment

- [ ] All secrets in environment variables, not code
- [ ] JWT signing key is 256-bit minimum, randomly generated
- [ ] bcrypt cost factor ≥ 12
- [ ] CORS whitelist configured (not `*` in production)
- [ ] Helmet.js enabled
- [ ] Rate limiting configured per endpoint
- [ ] Validation pipes enabled globally
- [ ] Audit interceptor registered
- [ ] All `@Public()` routes explicitly reviewed
- [ ] Mass assignment tests pass
- [ ] SQL injection penetration tests pass

### Monitoring (Production)

- [ ] Failed login rate alert (threshold: 10/min from any IP)
- [ ] 4xx error rate alert (threshold: > 5% of traffic)
- [ ] 5xx error rate alert (threshold: > 1% of traffic)
- [ ] Audit log anomaly detection (threshold: > 100 mutations/min by single user)
- [ ] DB connection pool usage alert (threshold: > 80%)
- [ ] Rate limit hit rate alert (threshold: > 100/min)
- [ ] Backup success/failure alerts
- [ ] Secrets rotation calendar reminders

### Incident Response

- [ ] Security contact defined and on-call rotation set
- [ ] Token blacklist procedure documented
- [ ] Database restore procedure tested quarterly
- [ ] Container restart procedure documented
- [ ] Security patch policy (within 7 days for critical CVEs)

---

## Summary

Every layer of the stack enforces security independently:

| Layer | Controls |
|-------|----------|
| **Transport** | TLS 1.3, HSTS, CSP, CORS |
| **API Gateway** | Rate limiting, IP filtering, request size limits |
| **Controllers** | Validation pipe, DTO whitelist, authentication guard, authorization guard |
| **Services** | Input sanitization, business rule validation, optimistic locking, parameterized queries |
| **ORM** | Prisma parameterized queries, no raw SQL, typed results |
| **Database** | FK constraints, CHECK constraints, UNIQUE constraints, NOT NULL, ENUM validation |
| **Storage** | Encrypted backups, immutable S3 Object Lock, signed URLs for file access |

A vulnerability in any single layer is contained by the layers above and below it.
