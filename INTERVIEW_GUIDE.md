# FleetFlow Interview Guide

## 60-second introduction

“FleetFlow is a logistics delivery-management platform for four roles: admins, managers, drivers and customers. I built it as a JavaScript modular monolith with React, Express, MongoDB, Redis/BullMQ and Socket.IO. Its most important engineering decisions are server-owned delivery transitions, object-level authorization, transactional driver/vehicle assignment, refresh-token rotation and idempotent delayed-delivery processing. I chose a modular monolith because it keeps deployment and debugging straightforward while still separating routes, controllers, services, models and infrastructure.”

## Main flow

A customer creates a pending request. A manager assigns one available driver and sufficiently capable vehicle in a MongoDB transaction. The driver accepts, picks up and moves it in transit. Proof with recipient and OTP completes it, releases both resources, records audit/history entries and emits a realtime hint. If the expected time passes first, a deterministic BullMQ job creates one manager notification.

## Questions to expect

### Why not microservices?

The domain is cohesive, the team/project is small and several operations need transactions. A modular monolith reduces network failure modes and operational cost. Queue workers can scale independently without splitting domain ownership prematurely.

### How do you prevent double assignment?

Inside one transaction, conditional `findOneAndUpdate` calls reserve a driver only when `available/currentDelivery:null` and a vehicle only when available, unassigned and sufficiently capable. A competing request fails its predicate; the transaction rolls back all earlier changes.

### Why is frontend status validation insufficient?

Clients are untrusted and can be outdated or bypassed. The service owns a transition table keyed by current status, target status and permitted role. It reloads the persisted delivery before applying a change.

### How is customer isolation enforced?

Lists add `customer = authenticatedUser.id`; detail access compares the persisted customer reference. Drivers similarly resolve their driver profile and compare the assigned driver. This is object-level authorization beyond route roles.

### What is the refresh flow?

The short access token lives in memory. A long-lived refresh JWT is in an HTTP-only, strict same-site cookie, while only its SHA-256 hash is stored. Refresh revokes the old session and creates a new one, preventing normal token replay. Logout revokes it.

### What if a refresh token is stolen?

Cookie protections reduce script access and cross-site sending. Rotation limits reuse: a second use finds a revoked session. A stronger production version would revoke the user's whole token family on detected reuse and add device/session management.

### Why MongoDB?

The delivery aggregate naturally embeds addresses, proof and an ordered status history. MongoDB also matches the requested skills. PostgreSQL becomes attractive as cross-entity constraints and analytical joins grow.

### How do Socket.IO updates stay correct?

They are invalidation/update hints, not state storage. Events identify a changed delivery. Pages fetch authoritative HTTP state on load and reconnection. Rooms limit fan-out but authorization still applies to subsequent API reads.

### How is the delayed job idempotent?

The BullMQ job ID is deterministic per delivery, and the notification has a unique deterministic key. The worker rechecks current persisted status/time before an atomic upsert, so retries cannot duplicate alerts.

### What happens without Redis?

Core API writes continue, scheduling failure is logged, and readiness returns degraded. A recovery scan should enqueue deterministic jobs for overdue active deliveries once Redis returns.

### How would you scale it?

Run stateless API replicas behind a load balancer, use the Redis Socket.IO adapter, scale workers independently, move proof images to object storage, add read replicas/analytics projections and archive old histories. Split a service only when ownership and load boundaries are demonstrated.

## Trade-offs and improvements

- Add refresh-token families and reuse alarms.
- Store proofs privately in object storage with signed URLs and malware scanning.
- Add a recovery scheduler for queue outages.
- Add geocoding and route/ETA providers behind explicit adapters.
- Use PostgreSQL if relational reporting and constraints become dominant.
- Add browser E2E tests against disposable Docker dependencies in CI.

