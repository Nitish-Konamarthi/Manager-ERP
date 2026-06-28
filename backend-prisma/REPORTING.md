# Reporting & Analytics — Design

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (ReportsController)             │
│  17 endpoints — all @UseGuards(jwt + roles)                 │
│                                                             │
│  GET /reports/daily-sales/:date                             │
│  GET /reports/purchases?from=&to=                           │
│  GET /reports/stock                                         │
│  GET /reports/fast-moving?days=30                           │
│  GET /reports/spoilage?from=&to=                            │
│  GET /reports/profit?from=&to=                              │
│  GET /reports/outstanding-customers                         │
│  GET /reports/supplier-ledger/:id?from=&to=                 │
│  GET /reports/customer-ledger/:id?from=&to=                 │
│  GET /reports/cash-book?from=&to=                           │
│  GET /reports/bank-book?from=&to=                           │
│  GET /reports/expenses?from=&to=                            │
│  GET /reports/top-customers?from=&to=&limit=10              │
│  GET /reports/top-suppliers?from=&to=&limit=10              │
│  GET /reports/product-profitability?from=&to=               │
│  GET /reports/monthly-trends?months=12                      │
│  GET /reports/yearly-trends?years=5                         │
│                                                             │
│   Admin (materialized view refresh):                        │
│  POST /admin/refresh-views/all                              │
│  POST /admin/refresh-views/:view                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Application Layer (ReportsService)             │
│  - Computes reports from Prisma queries in real time       │
│  - Falls back to materialized views for heavy aggregations │
│  - Helper: getAvgCost, getAvgSellingPrice, getTotalSales   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Materialized Views (8 total)                   │
│  mv_daily_sales_summary     ← daily by org                 │
│  mv_product_monthly_sales   ← monthly by product           │
│  mv_customer_summary        ← lifetime per customer        │
│  mv_supplier_summary        ← lifetime per supplier        │
│  mv_daily_profit            ← daily revenue - cogs         │
│  mv_current_stock           ← real-time stock position     │
│  mv_monthly_spoilage        ← monthly waste by reason      │
│  mv_stock_aging             ← stock by age bucket          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Refresh Strategy (MaterializedViewsService)   │
│                                                             │
│  1. API trigger: POST /admin/refresh-views/all              │
│  2. pg_cron:     SELECT refresh_reporting_views() daily     │
│  3. BullMQ:      Queue job every midnight (production)      │
│                                                             │
│  All views use CONCURRENTLY refresh for zero downtime       │
└─────────────────────────────────────────────────────────────┘
```

## Report Details

### 1. Daily Sales
- **Source**: `SalesOrder` + `SalesOrderItem` for the given date
- **Fields**: order count, revenue, cost (weighted avg from batches), margin %, quantity by product
- **Performance**: Uses composite index `idx_sales_order_org_date` (org + orderDate DESC)
- **MV**: `mv_daily_sales_summary` for quick dashboard load

### 2. Purchase Reports
- **Source**: `PurchaseOrder` + `PurchaseOrderItem` joined to `Supplier`
- **Fields**: total purchase value, top suppliers, top products purchased
- **Index**: `idx_purchase_order_org_date`, `idx_purchase_order_supplier`
- **No MV needed**: operational data, usually queried for date ranges < 90 days

### 3. Stock Reports
- **Source**: `StockBatch` with `availableQty > 0`
- **Fields**: total qty, total value (FIFO), by category, by shop, aging
- **MV**: `mv_current_stock` (pre-computed with weighted avg cost)
- **MV**: `mv_stock_aging` (buckets: 0-3, 4-7, 8-14, 15+ days)

### 4. Fast / Slow Moving
- **Source**: `StockMovement` (SOLD type) for last N days
- **Turnover**: `daily_sales_rate = sold_qty / days`; `turnover_days = current_stock / daily_sales_rate`
- **Thresholds**: fast = turnover ≤ 7 days; slow = turnover > 30 days
- **Index**: `idx_stock_movement_product` (org + productId + createdAt DESC)

### 5. Spoilage Report
- **Source**: `InventoryAdjustment` (WRITTEN_OFF, DAMAGED, EXPIRED types)
- **Rate**: `(spoil_value / (spoil_value + sales_value)) × 100`
- **By reason**: damage, expiry, theft, counting error
- **By age**: how old was the batch when it spoiled
- **Index**: `idx_inv_adjustment_org_date`
- **MV**: `mv_monthly_spoilage` (monthly aggregation by reason)

### 6. Profit Report
- **Revenue**: sum of `SalesOrder.total`
- **COGS**: sum of `StockBatch.unitCost × SalesOrderItem.quantity` using weighted average cost
- **Expenses**: sum of approved `ExpenseClaim` in period
- **Formula**: `Net = Revenue - COGS - Expenses`
- **MV**: `mv_daily_profit` pre-computes daily gross profit

### 7. Outstanding Customers
- **Source**: `Customer` LEFT JOIN `SalesOrder` WHERE `paymentStatus IN ('PENDING','PARTIAL')`
- **Fields**: customer name, total outstanding, credit limit, days since last order, overdue
- **Index**: `idx_sales_order_outstanding` (org + customerId, filtered to pending/partial)
- **MV**: `mv_customer_summary` (pre-computed total_purchases, outstanding, order_count, last_order_date)
- **Performance**: filters and sorts by outstanding amount descending

### 8. Supplier Ledger
- **Source**: All `PurchaseOrder` for a supplier in date range
- **Fields**: running balance, total purchased, outstanding
- **Index**: `idx_purchase_order_supplier`

### 9. Customer Ledger
- **Source**: `SalesOrder` + `CustomerLedger` (payments, credits, debits)
- **Fields**: running balance, sale amounts, payment amounts
- **Index**: `idx_customer_ledger_customer_date`

### 10. Cash Book
- **Source**: `AccountTransaction` where account = Cash (code: 1001)
- **Fields**: opening balance (from `Account.openingBalance`), running balance, total debits/credits
- **Index**: `idx_account_txn_account_date`

### 11. Bank Book
- **Source**: `AccountTransaction` where account = Bank (code: 1002)
- **Fields**: same structure as Cash Book
- **Index**: `idx_account_txn_account_date`

### 12. Expense Report
- **Source**: `ExpenseClaim` (APPROVED status) joined to `ExpenseHead`
- **Fields**: total by head, grand total, recent claims
- **Index**: `idx_expense_claim_org_date` (filtered to APPROVED)

### 13. Top Customers
- **Source**: `SalesOrder` grouped by customer for period
- **Sort**: revenue descending, limited to N
- **MV**: `mv_customer_summary`

### 14. Top Suppliers
- **Source**: `PurchaseOrder` grouped by supplier for period
- **Sort**: purchase amount descending, limited to N
- **MV**: `mv_supplier_summary`

### 15. Product Profitability
- **Source**: `SalesOrderItem` grouped by product, cost from `StockBatch` weighted average
- **Fields**: qty sold, revenue, cost, margin, margin %
- **Sort**: margin descending (highest profit first)
- **MV**: `mv_product_monthly_sales`

### 16. Monthly / Yearly Trends
- **Source**: `SalesOrder` + `PurchaseOrder` truncated to month/year
- **Fields**: total sales, total purchases, order count
- **MV**: `mv_daily_sales_summary` aggregated up (or create month-level MV)

## SQL Indexes (18 total)

| Table | Index | Purpose |
|-------|-------|---------|
| SalesOrder | `idx_sales_order_org_date` | Daily sales, trends |
| SalesOrder | `idx_sales_order_status` | Outstanding filtering |
| SalesOrder | `idx_sales_order_outstanding` | Customer outstanding drilldown |
| SalesOrderItem | `idx_so_item_product` | Product sales lookup |
| SalesOrderItem | `idx_so_item_order` | Order line join |
| PurchaseOrder | `idx_purchase_order_org_date` | Purchase reports |
| PurchaseOrder | `idx_purchase_order_supplier` | Supplier ledger |
| StockMovement | `idx_stock_movement_org_type_date` | Spoilage & fast-moving |
| StockMovement | `idx_stock_movement_product` | Product movement history |
| StockBatch | `idx_stock_batch_org_product_avail` | Current stock (filtered, partial) |
| StockBatch | `idx_stock_batch_received_date` | Aging calculation |
| InventoryAdjustment | `idx_inv_adjustment_org_date` | Spoilage trends |
| AccountTransaction | `idx_account_txn_account_date` | Cash/bank book |
| AccountTransaction | `idx_account_txn_org_date` | Org-level aggregation |
| CustomerLedger | `idx_customer_ledger_customer_date` | Customer ledger detail |
| SupplierLedger | `idx_supplier_ledger_supplier_date` | Supplier ledger detail |
| ExpenseClaim | `idx_expense_claim_org_date` | Expense reports |
| DailyStockSnapshot | `idx_daily_stock_snapshot_org_date` | Daily closing lookup |

## Materialized Views (8)

| View | Refresh | Size Estimate | Update Interval |
|------|---------|---------------|-----------------|
| mv_daily_sales_summary | CONCURRENTLY | ~365 rows/year/org | Daily at midnight |
| mv_product_monthly_sales | CONCURRENTLY | ~12 × productCount/year | Daily at midnight |
| mv_customer_summary | CONCURRENTLY | ~customerCount rows | Daily at midnight |
| mv_supplier_summary | CONCURRENTLY | ~supplierCount rows | Daily at midnight |
| mv_daily_profit | CONCURRENTLY | ~365 rows/year/org | Daily at midnight |
| mv_current_stock | CONCURRENTLY | ~productCount rows | Every 15 min OR on-demand |
| mv_monthly_spoilage | CONCURRENTLY | ~12 × reasonCount/year | Daily at midnight |
| mv_stock_aging | CONCURRENTLY | ~productCount × bucketCount | Every 15 min OR on-demand |

### Refresh Strategy

**Development**: `POST /admin/refresh-views/all` (manual trigger)

**Production options**:
1. **pg_cron** (PostgreSQL extension):
   ```sql
   SELECT cron.schedule('refresh-reporting', '0 0 * * *', 'SELECT refresh_reporting_views()');
   SELECT cron.schedule('refresh-stock', '*/15 * * * *', 
     'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_current_stock');
   ```

2. **BullMQ cron job**:
   ```ts
   // ChapterQueue scheduler
   @Processor('mv-refresh')
   async handle(cron: '0 0 * * *') { await this.mv.refreshAll() }
   ```

3. **External cron** (Linux crontab / Windows Task Scheduler):
   ```bash
   curl -X POST https://api.managererp.com/admin/refresh-views/all \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

## Aggregation Strategies

### Tier 1 — Immediate (real-time queries)
- Single-table lookups with existing indexes
- Daily sales (single date), customer/supplier ledger, cash/bank book
- Query pattern: `WHERE orgId = ? AND date BETWEEN ? AND ? ORDER BY date DESC`

### Tier 2 — Computed (runtime aggregation)
- Multi-table joins with aggregation
- Profit report: revenue from SalesOrder + cogs from StockBatch weighted avg
- Fast/slow moving: movement history + current stock
- Cache duration: none (computed per request, ~50-200ms for reasonable date ranges)

### Tier 3 — Materialized (pre-computed)
- Cross-table aggregations that are expensive to run on every request
- Daily sales summary, customer/supplier lifetime values, stock position
- Refreshed on schedule, not per request
- CRITICAL for performance once data exceeds ~50K rows

## Performance Considerations

### Query Optimization Rules
1. **Always filter by organizationId** — every query includes orgId in WHERE
2. **Use partial indexes** — filter on `deletedAt IS NULL` in the index itself
3. **Prefer date-range scans** — avoid `ORDER BY` without index support
4. **Avoid DISTINCT in hot paths** — use COUNT(DISTINCT ...) only in nightly MVs
5. **Limit result sets** — top N reports use `LIMIT` at the database level

### Materialized View Sizing
- 1 org × 500 products × 12 months = ~6,000 rows in `mv_product_monthly_sales`
- 5 orgs × 500 products = ~2,500 rows in `mv_current_stock`
- All 8 views combined: ~50,000 rows — fits entirely in 100MB of shared_buffers

### Cost Calculation Performance
**Problem**: Computing COGS requires scanning every StockBatch for every product
**Solution**: 
- `mv_current_stock` pre-computes `weighted_avg_cost` per product
- Profit report uses `weighted_avg_cost × sold_qty` instead of scanning batches
- Still accurate for weighted average (FIFO would need actual batch tracking)

### Spoilage Rate Performance
**Problem**: Rate calculation needs total sales + total spoilage in same period
**Solution**:
- Spoilage from `mv_monthly_spoilage` (pre-aggregated)
- Sales from `mv_daily_sales_summary` (pre-aggregated)
- Both are materialized, join on month

### Caching
- **HTTP**: `Cache-Control: max-age=300` for stock reports (change every 15 min)
- **No cache**: Sales, purchases, ledgers (must be real-time)
- **Redis**: Optional for dashboard aggregates (expire after 1 min)

## Deployment Commands

```bash
# Apply indexes and materialized views
psql -h localhost -d manager_erp -f prisma/migrations/20240701000000_reporting_analytics/migration.sql

# Refresh function
SELECT refresh_reporting_views();

# Check MV sizes
SELECT schemaname, matviewname, pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname))
FROM pg_matviews ORDER BY pg_total_relation_size(schemaname||'.'||matviewname) DESC;
```
