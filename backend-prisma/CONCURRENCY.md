# Concurrency Design

## The Problem

Five people working simultaneously on the same business data:

```
Father:    CREATE PurchaseOrder → INSERT StockBatch (available_qty += X)
Brother:   ADJUST StockBatch   → UPDATE StockBatch (available_qty -= Y)
You:       CREATE SalesOrder   → RESERVE StockBatch (reserved_qty += Z)
Hotel:     PAYMENT arrives     → UPDATE SalesOrder (paid_amount) + AccountTransaction
Brother:   WRITE OFF spoilage  → UPDATE StockBatch (available_qty -= W)
```

All operations touch **StockBatch** — the single contention point. Without proper
concurrency control, the result is:

| Problem | What happens | Consequence |
|---------|-------------|-------------|
| Lost update | Father reads qty=100, Brother reads qty=100. Father writes qty=90, Brother writes qty=80. | **5 units vanish** — Brother overwrote Father's change |
| Phantom stock | Two sales both see qty=100, both reserve 60. | **Stock oversold** — 60 + 60 > 100 |
| Dirty read | Sale reads qty=100 (uncommitted adjustment of -40), then adjustment rolls back. | **Stock understated** — missed revenue |
| Non-repeatable read | Report reads qty=100, then adjustment changes it to 80, report uses wrong number | **Inconsistent report** |
| Write skew | A reads batches 1+2, decides batch 2 is expiring. B reads batches 1+2, decides batch 1 is expiring. Both reserve from different batches. Neither sees the other. | Both work but combined outcome violates business rule |
| Deadlock | Tx1 locks batch A, needs batch B. Tx2 locks batch B, needs batch A. | Postgres kills one, application must retry |

## PostgreSQL's Built-in Guarantees

PostgreSQL provides these concurrency mechanisms out of the box:

| Mechanism | What it does | Where we use it |
|-----------|-------------|-----------------|
| **MVCC** | Every statement sees a snapshot of data as of the moment that statement begins. Readers never block writers, writers never block readers. | All read queries |
| **Row-level locks** | `SELECT ... FOR UPDATE` locks specific rows, preventing concurrent writes to those rows. | StockBatch operations |
| **SERIALIZABLE isolation** | True serializability + SSI (Serializable Snapshot Isolation). Detects serialization conflicts using predicate locks. Automatically aborts one conflicting transaction. | Financial transactions, payments |
| **`pg_advisory_lock()`** | Application-level locks that don't depend on table rows. | Queue-based ordering of contested operations |
| **`SAVEPOINT`** | Nested transaction — roll back to a savepoint without aborting the whole transaction. | Partial failures within batches |
| **`NOTIFY`** | Asynchronous notifications. | Real-time inventory alerts |

### Default isolation: READ COMMITTED

```sql
-- Every statement sees only committed data. No dirty reads.
-- But: non-repeatable reads and phantom reads ARE possible.
-- Fine for: reports, listings, dashboards.
```

### What we add on top

We do NOT change the default isolation level for all connections. Instead, we
selectively upgrade to higher guarantees only where needed:

| Operation | Isolation | Locking | Why |
|-----------|-----------|---------|-----|
| Stock reservation | REPEATABLE READ | `SELECT ... FOR UPDATE` on StockBatch | Prevent phantom stock + lost update |
| Stock adjustment | REPEATABLE READ | Optimistic lock (version) + `FOR UPDATE` | Prevent lost update on same batch |
| Purchase order creation | READ COMMITTED | None (new rows) | No contention — inserting new |
| Payment + ledger | SERIALIZABLE | None (SSI detects conflicts) | Must guarantee debit = credit |
| Report queries | READ COMMITTED | None | Read-only, MVCC is sufficient |

## Locking Strategy

### StockBatch: Pessimistic Locking with Row-Level Locks

StockBatch is the hottest table. Every sale, adjustment, and purchase touches it.
We use `SELECT ... FOR UPDATE` to prevent concurrent modifications.

```typescript
// Lock is acquired at the START of the transaction
const [batch] = await tx.$queryRaw<
  StockBatch[]
>`SELECT * FROM "stock_batches" WHERE id = ${batchId} FOR UPDATE`

// NOW update — guaranteed exclusive access
await tx.stockBatch.update({
  where: { id: batchId },
  data: { availableQty: newQty },
})
```

**Why FOR UPDATE instead of version check (optimistic):**
- Stock operations are high-contention (same product, same batch, multiple users)
- Optimistic locking causes retries, which causes failed invoices
- `FOR UPDATE` serializes access — second request waits, then proceeds
- Wait timeout is configurable via `lock_timeout` (default: 5s)

**Lock order**: Always lock batches in ascending `receivedDate` order to prevent
deadlocks during FIFO allocation.

```typescript
// ✅ SAFE — deterministic lock order
const batches = await tx.stockBatch.findMany({
  where: { productId, ... },
  orderBy: { receivedDate: 'asc' },  // ← THIS prevents deadlocks
})
for (const batch of batches) {
  await tx.$executeRaw`SELECT 1 FROM "stock_batches" WHERE id = ${batch.id} FOR UPDATE`
}
```

### Account/Balance Tables: SERIALIZABLE Isolation

Financial consistency requires that `DEBIT = CREDIT` and account balances never go
negative. SERIALIZABLE isolation detects write-skew that READ COMMITTED misses.

```typescript
// Two payments arrive simultaneously — both read balance=100
// Payment A debits 70 → balance should be 30
// Payment B debits 60 → balance should be 40
// With READ COMMITTED: both succeed → balance = 100-70-60 = -30 ❌
// With SERIALIZABLE: one succeeds, the other aborts → balance = 100-70 = 30 ✅
await prisma.$transaction(
  async (tx) => {
    // All reads and writes happen as if in a single serial execution
    return recordPayment(tx, paymentData)
  },
  { isolationLevel: 'Serializable' },
)
```

### Metadata Tables: Optimistic Locking (version column)

Tables like User, Product, Customer, Supplier, Account metadata (name, address, etc.)
use optimistic locking because:
- Contention is low (infrequent updates)
- Retries are cheap (quick single-row update)
- It prevents lost updates without locking

```typescript
// Optimistic lock — version check in WHERE clause
const result = await prisma.product.updateMany({
  where: { id: productId, version: expectedVersion },
  data: { name: newName, version: { increment: 1 } },
})
if (result.count === 0) {
  throw new ConflictException('Product was modified by another user')
}
```

## Idempotency

Payments MUST be idempotent — a network retry must not charge the customer twice.

```typescript
// Idempotency key pattern
async recordPayment(idempotencyKey: string, payment: PaymentDto) {
  // Check if already processed
  const existing = await this.prisma.idempotencyKey.findUnique({
    where: { key: idempotencyKey },
  })
  if (existing) return existing.response  // Return cached result

  // Process payment (runs at most once)
  const result = await this.prisma.$transaction(async (tx) => {
    // ... debit account, update sales order, record payment
    return { success: true, paymentId: payment.id }
  })

  // Cache result for future retries
  await this.prisma.idempotencyKey.create({
    data: { key: idempotencyKey, response: result, expiresAt: ... },
  })

  return result
}
```

**Business-level idempotency:** A SalesOrder has a unique `orderNumber`. Re-creating
the same order number fails at the database constraint level (`UNIQUE`). Similarly, a
PurchaseOrder's `orderNumber` is unique.

## Deadlock Prevention

### Lock ordering (the most important rule)

Always acquire locks in a **consistent, documented order**:

1. **Organization** (lowest contention)
2. **StockBatch** — by `receivedDate ASC` (oldest first)
3. **Account** — by `accountCode ASC`
4. **SalesOrder / PurchaseOrder** — by `orderNumber ASC`

### Lock timeout

Set a `lock_timeout` at the session level so deadlocked transactions don't wait
forever:

```sql
SET lock_timeout = '5s';
```

In Prisma, execute this at the start of every transaction that uses `FOR UPDATE`:

```typescript
await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`)
```

### Deadlock detection

PostgreSQL detects deadlocks automatically. The victim transaction is aborted and
the application receives error 40P01. Our retry mechanism catches this and retries:

```typescript
try {
  return await this.prisma.$transaction(async (tx) => { ... })
} catch (err) {
  if (err.code === '40P01') {  // deadlock detected
    await sleep(randomBetween(100, 500))  // jitter
    return await this.prisma.$transaction(async (tx) => { ... })  // retry
  }
  throw err
}
```

## Race Conditions

### Phantom Stock (overselling)

Without locking:
1. Tx1 reads `available_qty = 100` for batch A
2. Tx2 reads `available_qty = 100` for batch A
3. Tx1 reserves 60 → writes `reserved_qty = 60`
4. Tx2 reserves 70 → writes `reserved_qty = 70`
5. Both succeed, but 60 + 70 = 130 > 100

With `FOR UPDATE`:
1. Tx1 locks batch A (reads `available_qty = 100`)
2. Tx2 tries to lock batch A → **waits**
3. Tx1 reserves 60 → writes `reserved_qty = 60` → commits → **unlocks**
4. Tx2 acquires lock (reads `available_qty = 100, reserved_qty = 60`)
5. Tx2 computes `free = 100 - 60 = 40` → can only reserve 40
6. Tx2 reserves 40 → writes `reserved_qty = 100`

### Negative Stock (overselling continued)

Even with `FOR UPDATE`, there's a window between read and write where another
transaction can still see stale data if not using `FOR UPDATE`. The solution:

```typescript
// ✅ SAFE — atomic update with CHECK constraint
const result = await tx.$executeRaw`
  UPDATE stock_batches
  SET reserved_qty = reserved_qty + ${allocate},
      available_qty = available_qty - ${allocate},
      version = version + 1
  WHERE id = ${batch.id}
    AND (available_qty - reserved_qty) >= ${allocate}  -- ← Guard condition
`
if (result.count === 0) {
  throw new BadRequestException('Stock insufficient or changed')
}
```

**Database-level safety net:** The `CHECK (available_qty >= 0)` constraint in the
schema provides the ultimate guarantee — no code path can make stock negative.

### Concurrent Payment + Order Status

When a hotel payment arrives at the same moment an invoice is being created:

1. Invoice creates SalesOrder with `status = DRAFT`
2. Payment arrives, checks `paymentStatus = PENDING` ✓
3. Payment records `paidAmount = 5000`
4. Invoice confirms order → sets `status = CONFIRMED`
5. Result: order is confirmed but payment system thinks it's still pending

**Fix**: Include `paidAmount` update inside the same transaction as the SalesOrder
status change. Use `SELECT ... FOR UPDATE` on the SalesOrder row when recording
payment.

```typescript
// Atomic payment recording
async recordPayment(orderId: string, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    // Lock the order row — prevents concurrent status changes
    const [order] = await tx.$queryRaw<SalesOrder[]>`
      SELECT * FROM sales_orders WHERE id = ${orderId} FOR UPDATE
    `
    const newPaid = Number(order.paidAmount) + amount
    const newStatus = newPaid >= Number(order.total) ? 'PAID' : 'PARTIAL'

    await tx.salesOrder.update({
      where: { id: orderId },
      data: { paidAmount: newPaid, paymentStatus: newStatus, version: { increment: 1 } },
    })
    // Record transaction ...
  })
}
```

## Transaction Patterns

### Pattern 1: Read-Modify-Write (contended)

For stock reservations, adjustments, and any operation that reads a value, computes
a new value, and writes it back:

```typescript
@Transactional({ isolation: 'REPEATABLE READ' })
async reserveStock(productId: string, qty: number) {
  // Step 1: Lock all candidate rows (oldest first — prevents deadlocks)
  const batches = await this.prisma.$queryRaw<StockBatch[]>`
    SELECT * FROM stock_batches
    WHERE product_id = ${productId}
      AND deleted_at IS NULL
      AND (available_qty - reserved_qty) > 0
    ORDER BY received_date ASC
    FOR UPDATE
  `

  // Step 2: Compute allocation (in application memory — no more DB reads needed)
  let remaining = qty
  const allocations: Allocation[] = []

  for (const batch of batches) {
    if (remaining <= 0) break
    const free = Number(batch.availableQty) - Number(batch.reservedQty)
    const allocate = Math.min(free, remaining)
    allocations.push({ batchId: batch.id, allocate })
    remaining -= allocate
  }

  if (remaining > 0) throw new BadRequestException('Insufficient stock')

  // Step 3: Execute all updates (fast — rows are already locked)
  for (const a of allocations) {
    await this.prisma.$executeRaw`
      UPDATE stock_batches
      SET reserved_qty = reserved_qty + ${a.allocate},
          status = CASE
            WHEN (available_qty - reserved_qty - ${a.allocate}) <= 0 THEN 'FULLY_RESERVED'
            ELSE 'PARTIALLY_RESERVED'
          END,
          version = version + 1
      WHERE id = ${a.batchId}
    `
  }
}
```

### Pattern 2: Create-Only (no contention)

Purchase order creation, customer registration, product creation — these INSERT new
rows and don't contend with each other:

```typescript
// No locking needed — every INSERT goes to a new row
async createPurchaseOrder(dto: CreatePO, orgId: string) {
  return this.prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber()

    const order = await tx.purchaseOrder.create({
      data: { organizationId: orgId, orderNumber, ...dto },
    })

    for (const item of dto.items) {
      await tx.purchaseOrderItem.create({
        data: { orderId: order.id, ...item },
      })
    }

    return order
  })
}
```

### Pattern 3: Bulk Operations (batch of rows)

Daily closing, bulk stock adjustments — these touch many rows. Keep transactions
short by processing in batches of 100:

```typescript
async closeDaily(date: Date) {
  const BATCH_SIZE = 100
  let processed = 0

  while (true) {
    const batches = await this.prisma.stockBatch.findMany({
      where: { deletedAt: null, /* ... date criteria */ },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    })
    if (batches.length === 0) break

    await this.prisma.$transaction(async (tx) => {
      for (const batch of batches) {
        await tx.$executeRaw`SELECT * FROM stock_batches WHERE id = ${batch.id} FOR UPDATE`
        // ... closing logic
      }
    })

    processed += batches.length
  }
}
```

## Queue-Based Ordering

Some operations benefit from serial execution through a queue rather than concurrent
database access. We use this for:

| Operation | Queue | Why |
|-----------|-------|-----|
| Payment processing | Single-threaded consumer | Idempotency + prevent double-charge |
| Daily closing | Scheduled job (midnight) | Must run sequentially, never concurrent |
| Stock reconciliation | Single-threaded consumer | Must not overlap with adjustments |

```typescript
// BullMQ queue with concurrency=1 ensures serial execution
@Processor('payment-processing', { concurrency: 1 })
async processPayment(job: Job<PaymentJob>) {
  // Runs at most one at a time — no contention within queue
  return this.paymentService.recordPayment(job.data)
}
```

## Connection Pooling

### Pool configuration

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Connection pool is managed by PgBouncer or the built-in pool
  // connection_limit = 20  (set in connection string)
}
```

```bash
# .env — PgBouncer connection string for production
DATABASE_URL=postgresql://erp:erp123@localhost:5432/manager_erp?pool_timeout=30&connection_limit=20
```

### Pool sizing (20 connections)

| Usage | Connections | Why |
|-------|-------------|-----|
| API requests (10 concurrent) | 10 | Each request needs 1 connection |
| BullMQ workers (4 queues) | 4 | 1 per queue |
| Prisma Studio / migrations | 1 | Admin tools |
| Reserved (5) | 5 | Headroom for spikes, health checks |

**Critical rule**: Never use more connections than `max_connections` in PostgreSQL
(typically 100). Each `FOR UPDATE` lock holds a connection open — locked transactions
that wait consume connections. Set a short `lock_timeout` to prevent connection
starvation.

### Transaction timeout

```typescript
// Prisma's default transaction timeout is 5 seconds
// Long-running transactions hold locks and consume connections
await this.prisma.$transaction(async (tx) => {
  // Must complete within 5 seconds
}, { timeout: 5000 })
```

## Rollback Strategies

### Automatic rollback (Prisma default)

Any unhandled exception inside `$transaction()` triggers an automatic rollback:

```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.stockBatch.update(...)   // This succeeds
  throw new Error('Something wrong') // Rollback everything
  await tx.stockMovement.create(...) // Never executed
})
// Both the update AND the create are rolled back atomically
```

### Manual rollback with savepoint

For partial failures within a larger transaction:

```typescript
await this.prisma.$transaction(async (tx) => {
  // Step 1: try this
  await tx.stockBatch.update(...)

  // Step 2: set savepoint
  await tx.$executeRawUnsafe('SAVEPOINT after_stock_update')

  try {
    await tx.stockMovement.create(...)
  } catch (err) {
    // Rollback only the movement, keep the batch update
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT after_stock_update')
    // Log error, continue transaction
  }

  // Step 3: commit everything that succeeded
})
```

### Compensating transactions (Saga pattern)

For multi-step operations that span multiple services or external APIs, use
compensating actions instead of distributed transactions:

```typescript
async createSalesOrderWithReservation(dto: CreateSalesOrderDto) {
  let reservationIds: string[] = []

  try {
    // Step 1: Reserve stock
    reservationIds = await this.inventory.reserveStock(dto.items)

    // Step 2: Create order
    const order = await this.sales.createOrder(dto)

    return order
  } catch (err) {
    // Compensate: release any reservations made
    for (const id of reservationIds) {
      await this.inventory.releaseReservation(id).catch(() => {})
    }
    throw err
  }
}
```

## Performance Bottlenecks

### Index strategy for concurrent workloads

| Index | Table | Purpose | Concurrent-safe? |
|-------|-------|---------|-----------------|
| `idx_batch_product_avail` | `stock_batches` | Fast lookup of available stock per product | Yes (`CREATE INDEX CONCURRENTLY`) |
| `idx_batch_received_date` | `stock_batches` | FIFO ordering + lock ordering | Yes |
| `idx_order_outstanding` | `sales_orders` | Fast filter of unpaid orders | Yes |
| `idx_movement_created` | `stock_movements` | Fast lookup of recent movements | Yes |

### Hot row mitigation

StockBatch rows for fast-moving products (e.g., tomatoes daily) are updated
frequently. This creates "hot rows" that are locked most of the time.

**Strategy 1**: Split high-volume products into multiple batches. Instead of one
"Fresh Tomatoes" batch, create daily batches:

```
batch_code = 'TOMATO-2026-06-28'  (today's batch)
batch_code = 'TOMATO-2026-06-29'  (tomorrow's batch, pre-created)
```

**Strategy 2**: Reserve from the oldest batch first (FIFO). This distributes
writes across multiple rows rather than always hitting the latest batch.

**Strategy 3**: If contention is still too high (benchmark >100 ops/sec on same
product), use a **materialized counter** that batches updates:

```typescript
// Instead of updating StockBatch on every sale:
// 1. Accumulate sales in a fast, lock-free counter
await redis.incrby(`sales:counter:${productId}:${batchId}`, qty)
// 2. Flush to DB every 5 seconds via a scheduled job
```

### Query optimization for locked transactions

Keep locked transactions as short as possible:

```typescript
// ❌ SLOW — do work while holding locks
await tx.$executeRaw`SELECT ... FOR UPDATE`
await slowExternalApiCall()  // Lock held during HTTP call!
await tx.stockBatch.update(...)

// ✅ FAST — lock → update → release immediately
const computedValue = await slowExternalApiCall()  // No locks yet
await tx.$executeRaw`SELECT ... FOR UPDATE`
await tx.stockBatch.update(...)  // Lock held for milliseconds only
await anotherApiCall()  // No locks anymore
```

## Migration SQL

```sql
-- Lock timeout at session level
ALTER DATABASE manager_erp SET lock_timeout = '5s';

-- Partial index for availability lookups (fast path for stock queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_available_positive
  ON stock_batches (product_id, received_date ASC)
  WHERE deleted_at IS NULL AND (available_qty - reserved_qty) > 0;

-- Idempotency table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         VARCHAR(255) PRIMARY KEY,
  response    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at)
  WHERE expires_at < NOW();

-- Advisory locks namespace: 1 = inventory, 2 = payments, 3 = reconciliation
-- Usage: pg_advisory_xact_lock(1, product_id_hash)

-- CHECK constraint: stock cannot go negative (safety net)
ALTER TABLE stock_batches ADD CONSTRAINT chk_available_non_negative
  CHECK (available_qty >= 0);
-- Already in schema: CHECK constraints are applied at DB level
```

## Summary

| Problem | Solution | Mechanism |
|---------|----------|-----------|
| Lost update (stock) | `SELECT ... FOR UPDATE` | Row-level lock |
| Lost update (metadata) | Optimistic locking (version) | `WHERE version = ?` |
| Phantom stock (overselling) | Guard condition in UPDATE | `WHERE (avail - reserved) >= ?` |
| Negative stock (any path) | CHECK constraint | `CHECK (available_qty >= 0)` |
| Debit != Credit | SERIALIZABLE isolation | SSI conflict detection |
| Double payment | Idempotency key | Unique constraint + cache |
| Deadlock | Lock ordering + timeout | `ORDER BY received_date ASC`, `lock_timeout` |
| Hot rows | Batch splitting, FIFO distribution | Daily batches per product |
| Slow queries during lock | Move work outside transaction | Lock only for read-modify-write |
| Connection starvation | Pool limit + short timeout | 20 connections, 5s lock_timeout |

PostgreSQL handles all these correctly when we tell it what we need. We don't need
distributed locks, external coordinators, or multi-phase commits for a single-
database ERP system.
