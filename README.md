# FleetFlow

FleetFlow is a full-stack logistics operations platform for managing customers, drivers, vehicles and the complete delivery lifecycle. The project is intentionally structured as an interview-explainable modular monolith: business rules live in services, HTTP controllers stay thin, and MongoDB remains the source of truth.

The application includes role-aware dashboards, authenticated delivery APIs, transactional assignment, realtime update infrastructure, a delayed-delivery worker, analytics, audit records and automated tests.

## Workspace

- `client/` — React and Vite web application
- `server/` — Express API, Socket.IO, MongoDB and BullMQ worker
- `docs/` — architecture, database, API, deployment and interview documentation

## Quick start

Requirements: Node.js 22+, MongoDB 7+, and Redis 7+.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
npm install
npm run seed
npm run dev
```

Web: `http://localhost:5173` · API: `http://localhost:4000/api/v1` · health: `http://localhost:4000/health`

## Features

- Registration, login, rotating HTTP-only refresh sessions and logout revocation
- Admin, manager, driver and customer authorization with delivery-level isolation
- Driver/vehicle management and transaction-safe capacity-aware assignment
- Server-enforced delivery state machine and auditable status timeline
- Cursor pagination, full-text search and operational filters
- Authenticated Socket.IO rooms and authoritative refetch design
- BullMQ delayed-delivery alerts with deterministic idempotency
- MongoDB aggregation analytics and accessible responsive dashboards
- Delivery OTP/proof service with restricted optional image upload

## Demo accounts

After `npm run seed`, all use password `Demo1234`:

| Role | Email |
|---|---|
| Admin | `admin@fleetflow.demo` |
| Manager | `manager@fleetflow.demo` |
| Driver | `driver@fleetflow.demo` |
| Customer | `customer@fleetflow.demo` |

All seeded data is synthetic.

## Commands

```bash
npm run dev            # client and API
npm run start          # production API
npm run seed           # deterministic demo records
npm run lint
npm test
npm run build
npm run worker -w server
```

## Docker

Copy `server/.env.example` to `server/.env`, replace secrets, then run `docker compose up --build`. The client is at `http://localhost:8080`. Compose initializes the MongoDB replica set required for transactions.

## Environment

Server variables are documented in `server/.env.example`; client variables are in `client/.env.example`. Never commit the real files. The required production values are the MongoDB/Redis URLs, distinct JWT secrets, exact client origin and proxy setting.

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Database design](./DATABASE_DESIGN.md)
- [API reference](./API_DOCUMENTATION.md)
- [Interview guide](./INTERVIEW_GUIDE.md)
- [Learning plan](./LEARNING_PATH.md)
- [Deployment](./docs/DEPLOYMENT.md)

## Screenshots

Add verified desktop and mobile screenshots here after deploying with the synthetic seed dataset. No screenshot or performance claim is fabricated in this repository.

## Production notes

Use a managed MongoDB replica set and Redis, serve the client from a CDN, terminate TLS, and replace local proof uploads with private object storage. See the deployment guide for topology, readiness and rollback details.
