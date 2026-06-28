# Manager ERP

Full-stack ERP system for vegetable retail and hotel supply chain management. Built with a modular monolith backend, PostgreSQL, and a React SPA.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node 22, NestJS 11, TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL 17 |
| Cache & Queue | Redis 7 + BullMQ 5 |
| Frontend | React 18, Vite 5, Ant Design 5, ECharts 5 |
| Auth | JWT + refresh token rotation + RBAC |
| Container | Docker Compose |

## Prerequisites

- Node.js 22+
- Docker Desktop (for PostgreSQL + Redis)
- npm

## Quick Start

```bash
# 1. Start infrastructure (PostgreSQL + Redis)
cd backend
docker compose -f docker/docker-compose.yml up -d

# 2. Install dependencies, generate Prisma client, run migrations, seed data
npm install
npx prisma migrate dev
npx prisma seed

# 3. Start the backend
npm run start:dev

# 4. In a separate terminal — start the frontend
cd frontend
npm install
npm run dev
```

Backend: http://localhost:3042  
Frontend: http://localhost:3043  
API docs (Swagger): http://localhost:3042/api/docs  

### Default credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@managererp.com | Admin@123 |

## Project Structure

```
├── backend/           # NestJS API (modular monolith)
│   ├── prisma/        # Schema, migrations, seeds
│   ├── docker/        # Dockerfile + docker-compose.yml
│   ├── src/
│   │   ├── common/    # Guards, decorators, interceptors, utils
│   │   ├── modules/   # 15 feature modules
│   │   │   ├── iam/           # Auth, users, roles, permissions
│   │   │   ├── inventory/     # Stock batches, movements, reservations
│   │   │   ├── sales/         # Sales orders, billing
│   │   │   ├── procurement/   # Purchase orders
│   │   │   ├── accounting/    # Ledger, accounts, P&L
│   │   │   ├── masterdata/    # Categories, products, units
│   │   │   ├── customers/     # Customer management
│   │   │   ├── suppliers/     # Supplier management
│   │   │   ├── expenses/      # Expense claims
│   │   │   ├── organization/  # Shops, warehouses, branches
│   │   │   ├── reports/       # Analytics & materialized views
│   │   │   ├── vehicles/      # Fleet tracking
│   │   │   ├── notifications/ # BullMQ workers
│   │   │   ├── audit/         # Immutable event log
│   │   │   └── health.controller.ts
│   │   ├── prisma/    # Prisma module & service
│   │   └── main.ts    # Entry point
│   ├── CONCURRENCY.md # Locking & transaction design
│   ├── REVIEW.md      # Full codebase review
│   ├── SECURITY.md    # 18-layer security architecture
│   └── STRUCTURE.md   # Module conventions & guidelines
├── frontend/          # React SPA
│   └── src/
│       ├── pages/     # 17 page components
│       └── components/# Shared UI components
├── database/          # Standalone PostgreSQL schema
├── ARCHITECTURE.md    # Architecture overview
├── domain-model.md    # DDD domain analysis (9 bounded contexts)
└── workflows.md       # 14 business workflows (Mermaid diagrams)
```

## Features

- **Multi-tenant**: Organizations, shops, warehouses, branches
- **Inventory**: FIFO batch tracking, reservations, adjustments, daily closing
- **Sales**: POS billing (retail) + order management (hotel supply)
- **Procurement**: Purchase orders, supplier returns
- **Accounting**: Double-entry ledger, chart of accounts, P&L, cash flow
- **Expenses**: Claims, approval workflow
- **Reports**: 17+ reports with materialized views
- **RBAC**: Role-based access with granular resource:action permissions
- **Concurrency**: Optimistic locking + SELECT FOR UPDATE + advisory locks
- **Audit**: Immutable mutation log for every state change

## Free-tier Deployment

### Railway (easiest)

```bash
# 1. Push to GitHub
# 2. Create new project on railway.app → Deploy from GitHub repo
# 3. Add PostgreSQL plugin (free tier)
# 4. Set DATABASE_URL from the plugin credentials
# 5. Set JWT_SECRET to a random string
# 6. Root directory: backend/
# 7. Build command: npm install && npx prisma generate && npx prisma migrate deploy && npm run build
# 8. Start command: node dist/main.js
# 9. Deploy frontend as a separate service:
#    - Root directory: frontend/
#    - Build command: npm install && npm run build
#    - Start command: npx serve -s dist -l $PORT
```

### Render

```bash
# Backend web service:
#   1. Create "Web Service" → Connect GitHub repo
#   2. Root directory: backend/
#   3. Build command: npm install && npx prisma generate && npm run build
#   4. Start command: node dist/main.js
#   5. Add environment variables from .env
#   6. Create managed PostgreSQL → copy internal URL to DATABASE_URL
#   Note: Free tier sleeps after 15 min of inactivity

# Frontend (Static Site):
#   1. Create "Static Site" → Root: frontend/
#   2. Build command: npm install && npm run build
#   3. Publish directory: dist/
```

### Fly.io

```bash
# 1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl
# 2. cd backend
# 3. fly launch
# 4. fly postgres create --name erp-db
# 5. fly postgres attach --app <app-name> erp-db
# 6. fly secrets set JWT_SECRET=<random> NODE_ENV=production
# 7. fly deploy
# 8. cd frontend
# 9. fly launch (static site)
```

### Supabase + Render (best DB)

```bash
# 1. Create free Supabase project → go to Project Settings → Database
# 2. Copy connection string (URI format) → set as DATABASE_URL
# 3. Deploy backend on Render (see instructions above)
# 4. Deploy frontend on Vercel or Render Static Site
```

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start backend in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests |
| `npm run lint` | ESLint |
| `npx prisma studio` | Open Prisma data browser |
| `cd frontend && npm run dev` | Start frontend dev server |
| `cd frontend && npm run build` | Build frontend for production |

## Docs

| Document | Description |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Design principles, module map, data layer |
| [domain-model.md](domain-model.md) | DDD analysis — entities, aggregates, invariants |
| [workflows.md](workflows.md) | 14 business workflows with sequence diagrams |
| [backend/SECURITY.md](backend/SECURITY.md) | Authentication, RBAC, concurrency, audit |
| [backend/CONCURRENCY.md](backend/CONCURRENCY.md) | Locking strategies, deadlock prevention |
| [backend/REVIEW.md](backend/REVIEW.md) | Full codebase review with recommendations |
| [backend/STRUCTURE.md](backend/STRUCTURE.md) | Module conventions and directory layout |
| [backend/REPORTING.md](backend/REPORTING.md) | Report endpoints and materialized views |

## License

Private — internal business use
