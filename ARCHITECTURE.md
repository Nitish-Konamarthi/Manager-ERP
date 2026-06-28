# Manager ERP — Architecture

## Stack
Node 22 + TypeScript + NestJS + Prisma + PostgreSQL + Redis + BullMQ + Docker

## Principles
- Modular monolith. One deployable. Clean module boundaries.
- ACID transactions via Prisma interactive transactions.
- Database constraints (FKs, CHECK, UNIQUE, NOT NULL) enforced at DB level, not just app level.
- Optimistic locking on strategic aggregates (stock_batches, purchase_orders, sales_orders, invoices).
- Proper SQL indexes on all FK columns, query-filtered columns, and sort columns.
- Soft deletes (deleted_at timestamp) on all entity tables.
- Audit logs for every state change (who, what, when, old value, new value).
- Repository pattern via Prisma (extendable, testable).
- Validation: Zod at domain layer, class-validator at transport layer.
- Error handling: typed exception hierarchy, global filter.
- Clean OOP: proper encapsulation, single responsibility, dependency injection.

## What We Skip (until needed)
CQRS, Event Sourcing, Microservices, Kubernetes, Saga Patterns, BFF, API Gateway, Service Mesh, Feature Flags, Canary Deployments, Blue-Green, Polyglot Persistence, Materialized Views (app-level), Database Sharding.

## Module Map
`
iam/          auth, users, roles, permissions (shared kernel)
inventory/    batches, movements, reservations, adjustments, daily closing
procurement/  purchase orders, supplier management
sales/        sales orders, billing, customer management
accounting/   ledger, accounts, transactions, P&L, cash flow
expenses/     expense heads, claims, approvals
vehicles/     fleet tracking, trip expenses
reports/      aggregated views, exports
notifications/ email, SMS (BullMQ workers)
audit/        immutable event log
masterdata/   categories, products, units, taxes
organization/ multi-tenant org, shops, warehouses, branches
`

## Data Layer
- Every table: id (UUID), created_at, updated_at, deleted_at (soft delete)
- Every mutation table: version (int) for optimistic locking
- Every FK: indexed
- Audit table: immutable append-only log with serialized diff

## Deployment
- Docker Compose: api + postgres + redis
- Single dockerfile, single env file per environment
- Health check endpoint, graceful shutdown
