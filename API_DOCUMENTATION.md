# API Documentation

Base path: `/api/v1`. Successful responses are `{ "success": true, "data": ... }`. Errors are `{ "success": false, "error": { "code", "message", "details?" }, "requestId" }`.

Protected endpoints use `Authorization: Bearer <access-token>`. The refresh token is an HTTP-only cookie.

## Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a customer. |
| POST | `/auth/login` | Public | Start a session. |
| POST | `/auth/refresh` | Refresh cookie | Rotate session and access token. |
| POST | `/auth/logout` | Public | Revoke current refresh session. |
| GET | `/auth/me` | Authenticated | Current user. |

```json
POST /auth/login
{ "email": "admin@fleetflow.demo", "password": "Demo1234" }
```

## Deliveries

| Method | Path | Roles |
|---|---|---|
| GET | `/deliveries` | All; object scope applied |
| POST | `/deliveries` | Customer, Admin |
| GET | `/deliveries/:id` | Authorized owner/assignee or operations |
| POST | `/deliveries/:id/assign` | Admin |
| PATCH | `/deliveries/:id/status` | Driver, Customer or Admin; state rules apply |
| PATCH | `/deliveries/:id/location` | Assigned driver; accepted, picked up or in transit |
| POST | `/deliveries/:id/proof` | Assigned driver; multipart form |

List query: `search`, `status`, `priority`, `driver`, `from`, `to`, `cursor`, `limit` (max 100), `sort=newest|oldest`. The response `meta.nextCursor` is null on the final page.

```json
POST /deliveries/:id/assign
{ "driverId": "66a...", "vehicleId": "66b..." }

PATCH /deliveries/:id/status
{ "status": "picked_up", "note": "Collected from warehouse gate 2" }

PATCH /deliveries/:id/location
{ "sharing": true, "latitude": 18.5204, "longitude": 73.8567, "accuracyMeters": 12, "speedKph": 28 }
```

The assigned driver may stop sharing with `{ "sharing": false }`. The latest position is persisted and sent in realtime only to the delivery customer, assigned driver and Admin. Tracking updates are rejected before acceptance and after the delivery reaches a terminal state.

Proof fields are `recipientName`, numeric `otp`, optional `driverNotes`, and optional `image` (maximum 5 MB; image MIME types only).

## Operations

| Method | Path | Roles |
|---|---|---|
| GET/PATCH | `/users`, `/users/:id` | Admin |
| GET/POST/PATCH | `/drivers`, `/drivers/:id` | Admin |
| GET/POST/PATCH | `/vehicles`, `/vehicles/:id` | Admin |
| GET | `/analytics/overview` | Admin |
| GET | `/notifications` | Admin |
| GET | `/audit-logs` | Admin |

## Health

`GET /health` is a process liveness check. `GET /ready` checks MongoDB and Redis and returns 503 with dependency states when degraded.

Common status codes: 200/201 success, 400 invalid identifier, 401 invalid session, 403 forbidden object/role, 404 missing resource, 409 state/concurrency conflict, 422 validation failure, 429 sensitive-endpoint rate limit.
