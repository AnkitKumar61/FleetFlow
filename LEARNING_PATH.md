# Learning Path

## Three-day project understanding plan

### Day 1 — Trace one request

Run the app, sign in as each role, then trace registration from route → validation → controller → auth service → models → response. Explain access versus refresh tokens aloud. Read the error middleware and reproduce one 422 and one 403.

### Day 2 — Defend the domain

Draw the delivery state machine from `delivery.service.js`. Walk through assignment line by line and explain each transaction predicate. Run delivery tests, intentionally create an invalid transition, and inspect history/audit results.

### Day 3 — Understand distributed edges

Trace a status change through MongoDB and Socket.IO. Trace a delayed delivery through BullMQ and the notification upsert. Review indexes and analytics pipelines. Practice the 60-second introduction and answer “why a modular monolith?”

## Seven-day interview-readiness plan

1. **Product and architecture:** demo each role; redraw the system without notes.
2. **JavaScript/Express:** explain async error handling, middleware order, ES modules and graceful shutdown.
3. **Security:** rehearse JWT threats, cookie flags, hashing, rate limits, validation, CORS and object authorization.
4. **MongoDB:** explain embedding vs references, each important index, transactions, optimistic concurrency and aggregation.
5. **Redis/realtime:** explain queue retries/idempotency, Redis outage behavior, Socket.IO authentication and reconnection truth.
6. **React/testing:** trace auth context, Axios rotation, routing, state handling and one RTL/Supertest test; add one test yourself.
7. **Mock interview:** deliver a five-minute demo, answer the guide without notes, identify two trade-offs honestly, and propose a measured scaling sequence.

