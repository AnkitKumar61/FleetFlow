# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React/Vite with modern JavaScript, Tailwind CSS, React Router, Axios, Socket.IO client and Recharts; Node.js/Express modular monolith with MongoDB/Mongoose, Redis/BullMQ, Socket.IO, Zod and Pino. The user explicitly selected this stack and excluded TypeScript, microservices and Kubernetes.

## Users

- Admins manage people, vehicles, permissions and system activity.
- Admins plan assignments, monitor exceptions and review operational analytics.
- Drivers execute only their assigned work and submit proof of delivery.
- Customers request and track only their own deliveries.
- A software-engineering interviewer is a secondary audience evaluating architecture, correctness and explainability.

## Product Purpose

FleetFlow makes the complete delivery lifecycle visible and enforceable, from customer request through assignment and proof of delivery. Success means each role can complete its work with clear authority boundaries and an auditable status history.

## Positioning

FleetFlow demonstrates that operational safety lives in backend invariants: assignment is transactional, delivery transitions are role-aware, and realtime messages always point clients back to authoritative persisted state.

## Operating Context

Dispatchers work from dense desktop dashboards, drivers often work from phones, and customers need a simple tracking view. The portfolio runs locally with synthetic demonstration accounts and can be deployed as a single web/API application with managed MongoDB and Redis.

## Capabilities and Constraints

The confirmed scope includes JWT authentication with refresh-session revocation, role and object authorization, driver and vehicle management, delivery lifecycle enforcement, atomic assignment, search and pagination, proof of delivery, permission-based live GPS with persisted last position, Socket.IO updates, a delayed-delivery BullMQ workflow, analytics, audit records, Docker, CI and tests. Secrets remain external. Proof images use local development storage; production deployments should use object storage. In-app delayed notifications are the implemented notification channel. Demo content must be labeled synthetic.

## Brand Commitments

The product name is FleetFlow. Its voice is concise, calm and operational—plain language over logistics theatre.

## Evidence on Hand

No customer logos, testimonials, production metrics or proprietary operational data were provided. Future work must not fabricate them. Seed records are synthetic and labeled as such.

## Product Principles

1. The server owns every business rule.
2. Make risky operational changes explicit and auditable.
3. Give each role only the data and actions it needs.
4. Prefer readable modules and direct control flow over clever abstractions.
5. Treat realtime and background jobs as resilient enhancements to persisted truth.

## Accessibility & Inclusion

Forms and navigation must be keyboard accessible, responsive, clearly labeled, and expose loading, empty, success and error states without relying on color alone.
