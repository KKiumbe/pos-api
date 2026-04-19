# TableFlow API

Express + TypeScript backend for the TableFlow restaurant POS.

## Stack

- Node.js
- Express 5
- Prisma
- PostgreSQL
- JWT authentication

## Setup

1. Copy `.env.example` to `.env`.
2. Point `DATABASE_URL` at a PostgreSQL database.
3. Run:

```bash
npm install
npx prisma generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

The API starts on `http://localhost:4000`.

## Local Verified Database Setup

If you want the same local runtime used during verification in this workspace:

```bash
initdb -D /Volumes/softwares/pos/.local-postgres/data
pg_ctl -D /Volumes/softwares/pos/.local-postgres/data -l /Volumes/softwares/pos/.local-postgres/postgres.log -o "-p 5433 -k /Volumes/softwares/pos/.local-postgres/socket" start
createdb -h /Volumes/softwares/pos/.local-postgres/socket -p 5433 tableflow
```

Use this `DATABASE_URL`:

```env
DATABASE_URL="postgresql://apple@localhost:5433/tableflow?host=/Volumes/softwares/pos/.local-postgres/socket"
```

## Demo Accounts

- `manager@demo.tableflow.app` / `Admin@1234`
- `cashier@demo.tableflow.app` / `Admin@1234`
- `kitchen@demo.tableflow.app` / `Admin@1234`

## Core Routes

- `POST /auth/login`
- `GET /auth/me`
- `GET /dashboard/summary`
- `GET /menu/categories`
- `POST /menu/categories`
- `POST /menu/items`
- `GET /tables`
- `POST /tables`
- `GET /orders`
- `POST /orders`
- `PATCH /orders/:id/status`
- `PATCH /orders/:orderId/items/:itemId/status`
- `POST /payments`
- `GET /inventory/items`
- `POST /inventory/items`
- `POST /inventory/recipes`
- `GET /reports/daily`
- `GET /integrations/sms/messages`
- `POST /integrations/sms/messages`
- `GET /integrations/mpesa/transactions`

## Notes

- Tenant scope is enforced from the JWT payload.
- Payment recording marks orders as paid once the full amount is settled.
- Recipe-linked stock deduction happens on full payment.
- M-Pesa is modeled as a first-class payment method, with transaction visibility in place while live provider integration is still pending.
- SMS has a working mock dispatch log and is ready for a live provider adapter.
