# Database Design

## Collections

- `users`: identity, role and activation state. Password hashes are excluded by default.
- `sessions`: hashed refresh token, expiry and revocation metadata; many sessions per user.
- `drivers`: one-to-one with a driver user; license, availability and current assignment.
- `vehicles`: registration, type, capacity, lifecycle and current assignment.
- `deliveries`: customer, embedded route addresses, package, assignment, status, embedded status history and proof.
- `auditlogs`: append-oriented privileged action records.
- `notifications`: idempotent operational alerts.

References are used where entities have independent lifecycles. Addresses and status history are embedded because they are read with, and owned by, the delivery.

## Important indexes

| Index | Why it exists |
|---|---|
| `users.email` unique | Fast login and duplicate account prevention. |
| `sessions.tokenHash` unique + `expiresAt` TTL | Refresh lookup and automatic expired-session cleanup. |
| `drivers(isActive,status)` | Available-driver dispatch query. |
| `vehicles(isActive,status,capacityKg)` | Available vehicle/capacity assignment query. |
| `deliveries.trackingNumber` unique | Direct customer tracking lookup. |
| `deliveries(customer,createdAt desc)` | Customer isolation and newest-first history. |
| `deliveries(status,priority,expectedDeliveryAt)` | Operations filters and overdue scan. |
| `deliveries(assignedDriver,status)` | Driver workload and assigned list. |
| delivery text index | Server-side tracking/package search. |
| `auditlogs(entityType,entityId,createdAt desc)` | Entity investigation timeline. |
| `notifications.key` unique | Delayed-job idempotency. |

## Transactions

Driver/vehicle assignment is the critical multi-document invariant, so it uses a transaction plus conditional writes. MongoDB document versioning protects delivery updates from silent lost writes.

## Why MongoDB

Delivery aggregates have embedded addresses, status events and proof that are normally read together; MongoDB maps naturally to that shape and matches the requested stack. Flexible metadata also supports audit evolution without frequent migrations.

PostgreSQL would be preferable when the reporting workload dominates, cross-entity constraints grow numerous, complex ad-hoc joins are common, or strict relational consistency is required across most operations. FleetFlow's assignment logic is relational enough that a production team should reconsider PostgreSQL as scope expands.

