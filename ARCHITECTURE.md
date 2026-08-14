# FleetFlow Architecture

## Shape

FleetFlow is a modular monolith deployed as a React static client, one Express/Socket.IO process, and one BullMQ worker. The API modules share MongoDB models and service code, which keeps transactions and authorization easy to understand while retaining clean module boundaries.

```text
Browser ── HTTP/JWT ──> Express routes → validation → controller → service → Mongoose
   │                         │                                      │
   └── Socket.IO ────────────┴── authenticated rooms <──────────────┘
                                    │
Redis <── BullMQ queue <── service  │  worker ──> notification + Socket.IO event
```

## Module responsibilities

- `routes/`: endpoint shape, validation middleware, role gates and upload policy.
- `controllers/`: translate HTTP input/output; no business rules.
- `services/`: authentication, delivery lifecycle, transaction, audit, queue and realtime rules.
- `models/`: persistence schemas and indexes.
- `validation/`: Zod request contracts.
- `middleware/`: token authentication, role authorization and centralized errors.
- `config/`: validated environment, database, Redis and structured logging.

## Request lifecycle

Helmet/CORS/body limits → request ID and structured log → route → authentication → role gate → Zod validation → controller → service → model → consistent response. Known operational errors use `AppError`; unknown errors are logged and returned without a stack trace.

## Authentication

Access JWTs are short-lived and held in browser memory. The refresh JWT is an `HttpOnly`, `SameSite=Strict` cookie scoped to authentication routes. The server stores only its SHA-256 hash. Refresh rotates the session: the old record is revoked before a new token is issued. Logout revokes the presented session.

Role middleware provides coarse authorization. Delivery services additionally check ownership: customer ID must match, and a driver's profile must match the assigned driver.

## Transactional assignment

Assignment runs in a MongoDB transaction. It reads an assignable delivery, conditionally changes an available driver's state, conditionally changes an available/capable vehicle, then records the delivery and audit entry. Conditional predicates are the concurrency guard. Any failed predicate aborts the transaction, so the earlier reservation rolls back.

MongoDB transactions require a replica set. Local Docker Compose starts a single-node replica set; managed MongoDB deployments normally provide this.

## Realtime flow

Socket.IO authenticates the access token at connection time and joins `user:<id>` and `role:<role>` rooms. Delivery updates target the Admin room plus the customer, assigned driver and delivery rooms. Messages contain identifiers and state hints, not a canonical record. Clients fetch HTTP state after load/reconnection.

## BullMQ flow

Creation schedules one job named `delay-<deliveryId>` for the expected timestamp. The worker rechecks MongoDB, then upserts a notification using `delivery-delayed:<id>` as a unique key. BullMQ retries and duplicate execution therefore cannot create duplicate notifications.

When Redis is unavailable, the delivery write still succeeds, queue scheduling is logged, and `/ready` returns degraded. A production recovery process should scan overdue active deliveries and enqueue missing deterministic jobs after Redis returns.

## Trade-offs and scaling

- A modular monolith is easier to deploy, trace and defend than premature services. Independent workers already isolate background load.
- MongoDB embeds addresses and history because they belong to one delivery aggregate. Large histories could later move to an event collection.
- Local uploads reduce demo setup; production should stream validated images to private object storage and save only an object key.
- At higher scale, add Socket.IO's Redis adapter, multiple API replicas, separate worker autoscaling, CDN-hosted client assets, cursor-only lists and archived audit/history collections.
