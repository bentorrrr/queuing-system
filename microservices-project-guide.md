# Microservices Order Processing System — Project Guide

> **Goal:** Build a small but realistic event-driven microservices system to demonstrate distributed systems skills on your CV.
>
> **Stack:** Node.js + TypeScript, RabbitMQ, PostgreSQL, React (Vite), SSE, Docker Compose
>
> **Time estimate:** 3–4 weeks (evenings/weekends)

---

## The System You're Building

An **Order Processing Pipeline** with 3 independent services:

```
┌──────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Order Form  │  │ Order Tracker│  │  Live Event Timeline   │  │
│  │ (REST POST) │  │ (SSE stream) │  │  (SSE stream)          │  │
│  └──────┬──────┘  └──────▲───────┘  └────────▲───────────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────────┘
          │ REST           │ SSE               │ SSE
          ▼                │                   │
┌─────────────────┐     publish      ┌─────────┴────┐
│  Order Service   │ ──────────────▶  │   RabbitMQ   │
│  (REST + SSE)    │                  │   (Broker)   │
└─────────────────┘                  └──────┬───────┘
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                              ▼             ▼             ▼
                     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
                     │   Payment    │ │ Inventory│ │ Notification │
                     │   Service   │ │  Service │ │   Service    │
                     └──────┬──────┘ └────┬─────┘ └──────────────┘
                            │             │
                            │  publish status updates back to RabbitMQ
                            │             │
                            ▼             ▼
                       [Payment DB]  [Inventory DB]
```

**The flow with SSE:** Client places an order via REST → Order Service saves it and publishes to RabbitMQ → Consumer services process and publish status updates back → Order Service listens for these updates and pushes them to the frontend in real-time via SSE.

**Why this project impresses:** It demonstrates that you can design service boundaries, handle async communication, deal with failure scenarios, and think beyond monolithic CRUD apps.

---

## Required Packages

### packages/shared (shared library)
| Package | What it's for |
|---------|--------------|
| `amqplib` | RabbitMQ client for Node.js |
| `@types/amqplib` | TypeScript types for amqplib |
| `zod` | Event schema validation — validate message payloads at service boundaries |
| `uuid` | Generate correlation IDs and order IDs |

### services/order-service
| Package | What it's for |
|---------|--------------|
| `fastify` | HTTP framework (handles REST + SSE) |
| `@fastify/cors` | CORS support for frontend requests |
| `@fastify/swagger` | Auto-generate OpenAPI/Swagger docs |
| `@fastify/swagger-ui` | Swagger UI for API documentation |
| `prisma` | ORM — migrations, schema management (dev dependency) |
| `@prisma/client` | Prisma query client |
| `pino` | Structured JSON logging (comes with Fastify, but you'll configure it) |
| `amqplib` | RabbitMQ client (or import from shared) |

### services/payment-service
| Package | What it's for |
|---------|--------------|
| `amqplib` | RabbitMQ consumer/publisher |
| `prisma` / `@prisma/client` | Payment records DB |
| `pino` | Structured logging |

### services/inventory-service
| Package | What it's for |
|---------|--------------|
| `amqplib` | RabbitMQ consumer/publisher |
| `prisma` / `@prisma/client` | Inventory/stock DB |
| `pino` | Structured logging |

### services/notification-service
| Package | What it's for |
|---------|--------------|
| `amqplib` | RabbitMQ consumer |
| `pino` | Structured logging |
| `nodemailer` | Send emails (optional — for stretch goal) |

### frontend (React dashboard)
| Package | What it's for |
|---------|--------------|
| `react` | UI library |
| `react-dom` | React DOM renderer |
| `react-router-dom` | Client-side routing (order form → tracker → timeline views) |
| `tailwindcss` | Utility-first CSS (you already know it) |
| `@tailwindcss/vite` | Tailwind v4 Vite plugin |

> **Note:** You do NOT need an SSE client library. The browser's native `EventSource` API handles everything — connection, auto-reconnect, event parsing. Just use `new EventSource(url)`.

### Shared dev dependencies (root workspace)
| Package | What it's for |
|---------|--------------|
| `typescript` | TypeScript compiler |
| `tsx` | Run TypeScript directly without compiling (great for dev) |
| `vitest` | Unit testing |
| `@testcontainers/rabbitmq` | Spin up real RabbitMQ in Docker for integration tests |
| `@testcontainers/postgresql` | Spin up real PostgreSQL in Docker for integration tests |
| `eslint` | Linting |
| `prettier` | Code formatting |

### Docker images (in docker-compose.yml)
| Image | What it's for |
|-------|--------------|
| `rabbitmq:3-management` | RabbitMQ broker + management UI on port 15672 |
| `postgres:16` | PostgreSQL database |
| `mailpit/mailpit` | Fake SMTP server for testing emails (optional stretch goal) |

---

## Phase 1: Foundation (Day 1–2)

### Step 1: Project Setup

Create a monorepo structure:

```
order-processing-system/
├── docker-compose.yml          # RabbitMQ + PostgreSQL + all services
├── packages/
│   └── shared/                 # Shared types, event schemas, RabbitMQ helpers
│       ├── src/
│       │   ├── events.ts       # Event type definitions
│       │   ├── rabbitmq.ts     # Connection & publish/consume helpers
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── services/
│   ├── order-service/          # REST API + event publisher
│   │   ├── src/
│   │   │   ├── index.ts        # Express/Fastify app entry
│   │   │   ├── routes/
│   │   │   ├── handlers/
│   │   │   ├── db/             # Prisma or Drizzle schema
│   │   │   └── publisher.ts    # Publishes events to RabbitMQ
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   ├── payment-service/        # Consumes order events, processes payment
│   ├── inventory-service/      # Consumes order events, updates stock
│   └── notification-service/   # Consumes events, sends email/webhook
├── frontend/                   # React dashboard (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   │   └── useSSE.ts       # Custom hook for SSE connections
│   │   ├── components/
│   │   │   ├── OrderForm.tsx
│   │   │   ├── OrderTracker.tsx
│   │   │   └── EventTimeline.tsx
│   │   └── types/
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.ts
├── package.json                # Workspace root (npm workspaces or turborepo)
└── README.md
```

**Things to learn/decide:**
- Use **npm workspaces** or **Turborepo** for the monorepo (npm workspaces is simpler to start)
- Pick your HTTP framework: **Fastify** (recommended — faster, better TS support) or Express
- Pick your ORM: **Drizzle** (lightweight, SQL-like) or Prisma (you already know it)

### Step 2: Docker Compose

Set up your infrastructure first. Your `docker-compose.yml` should spin up:

- **RabbitMQ** with management UI (image: `rabbitmq:3-management`, ports 5672 + 15672)
- **PostgreSQL** (one instance is fine — use separate databases per service)

**Milestone:** You can run `docker compose up`, open `localhost:15672` and see the RabbitMQ dashboard.

### Step 3: Shared RabbitMQ Helper

In `packages/shared`, build a small wrapper around the `amqplib` package:

- `connectRabbitMQ()` — connects with retry logic (RabbitMQ takes a few seconds to start)
- `publishEvent(exchange, routingKey, payload)` — publishes a JSON message
- `consumeEvent(queue, exchange, routingKey, handler)` — sets up a consumer

**Key concept:** Use a **topic exchange** (not the default exchange). This lets you route events like `order.created`, `payment.completed`, `order.failed` to different queues based on routing key patterns.

**Milestone:** You can publish a test message and see it appear in the RabbitMQ management UI.

---

## Phase 2: Order Service — The Publisher (Day 3–5)

### Step 4: Database Schema

The Order Service needs:

```
Order:
  - id (uuid)
  - customerEmail (string)
  - items (json array of { productId, quantity, price })
  - totalAmount (decimal)
  - status (enum: PENDING → CONFIRMED → PAID → SHIPPED → FAILED)
  - createdAt, updatedAt
```

### Step 5: REST API Endpoints

Build these routes:

| Method | Route | What it does |
|--------|-------|-------------|
| POST | /orders | Create a new order |
| GET | /orders/:id | Get order by ID |
| GET | /orders | List orders (with pagination) |
| PATCH | /orders/:id/status | Update order status (internal, called by other services via events) |
| GET | /orders/:id/stream | **SSE** — stream real-time status updates for a specific order |
| GET | /events/stream | **SSE** — stream all system events (for the live timeline) |

### Step 6: Event Publishing

When an order is created via `POST /orders`:

1. Save the order to the database with status `PENDING`
2. Publish an `order.created` event to RabbitMQ containing the full order data
3. Return the order to the client

**The event payload should look like:**
```typescript
interface OrderCreatedEvent {
  type: 'order.created';
  timestamp: string;
  data: {
    orderId: string;
    customerEmail: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    totalAmount: number;
  };
}
```

**Milestone:** You can POST an order via curl/Postman, see it saved in PostgreSQL, and see the event in RabbitMQ.

---

## Phase 3: Consumer Services (Day 6–10)

### Step 7: Payment Service

This service:
- Listens on queue `payment-queue` bound to routing key `order.created`
- When it receives an event, it **simulates** payment processing (random success/failure with a delay)
- On success: publishes `payment.completed` event
- On failure: publishes `payment.failed` event

**Important patterns to implement here:**
- **Idempotency** — if the same event is delivered twice (RabbitMQ can do this), don't charge twice. Use the `orderId` as an idempotency key and check if you've already processed it.
- **Manual acknowledgment** — don't auto-ack messages. Only ack after successful processing. If your service crashes mid-processing, RabbitMQ will redeliver.

### Step 8: Inventory Service

This service:
- Listens for `order.created` — reserves stock
- Listens for `payment.completed` — confirms the stock deduction
- Listens for `payment.failed` — releases the reserved stock

**Database schema:**
```
Product:
  - id (uuid)
  - name (string)
  - availableStock (int)
  - reservedStock (int)
```

**This teaches you:** Handling multiple event types in one service, and the concept of **stock reservation** (a real-world pattern in e-commerce).

### Step 9: Notification Service

The simplest service — no database needed:
- Listens for `order.created` → logs "Order confirmation email sent to {email}"
- Listens for `payment.completed` → logs "Payment receipt sent"
- Listens for `payment.failed` → logs "Payment failure notification sent"

For bonus points later, actually send emails via **Resend** or **Nodemailer** with a test SMTP server (like **Mailpit** — add it to Docker Compose).

**Milestone:** Create an order → see Payment Service process it → Inventory updates → Notification logs fire. The whole pipeline works end-to-end.

---

## Phase 4: Make It Production-Like (Day 11–15)

This is what separates a toy project from a CV-worthy one.

### Step 10: Dead Letter Queue (DLQ)

Configure RabbitMQ so that messages that fail processing N times get routed to a **dead letter queue** instead of being retried forever. Build a simple endpoint to view and retry dead-lettered messages.

**Why this matters:** Every interviewer who's worked with queues will ask "what happens when a message fails?"

### Step 11: Health Checks & Graceful Shutdown

Each service should have:
- `GET /health` endpoint that checks DB + RabbitMQ connection
- Graceful shutdown handler: when the process receives SIGTERM, stop consuming new messages, finish processing current ones, then exit

### Step 12: Structured Logging

Use **Pino** (the standard for Node.js). Every log line should include:
- `service` name
- `correlationId` (pass this through events so you can trace a request across services)
- `timestamp`
- Log level

**This is a mini intro to distributed tracing** — you can mention "implemented correlation-based request tracing across microservices" on your CV.

### Step 13: API Documentation

Add **Swagger/OpenAPI** docs to the Order Service using `@fastify/swagger` or `swagger-jsdoc`. This shows professionalism.

### Step 14: Dockerize Everything

Write a `Dockerfile` for each service. Update `docker-compose.yml` so the entire system starts with one command:

```bash
docker compose up --build
```

Include proper service dependencies (`depends_on` with health checks).

**Milestone:** Someone can clone your repo, run one command, and the entire system is running.

---

## Phase 5: SSE + Frontend Dashboard (Day 16–20)

This phase ties the whole system together visually and adds SSE — a real-time push pattern that's simpler than WebSocket but perfect for one-way server-to-client updates.

### Step 15: SSE in the Order Service

**How SSE works in this system:**

The Order Service needs to act as a bridge — it already publishes events to RabbitMQ, but now it also needs to *consume* status update events (like `payment.completed`, `inventory.reserved`) and push them to connected frontend clients.

**Set up an internal consumer in the Order Service:**

1. Create a new RabbitMQ queue (`order-status-updates`) that binds to routing keys: `payment.completed`, `payment.failed`, `inventory.reserved`, `inventory.released`
2. When a status update event arrives, update the order's status in the database
3. Push the update to any connected SSE clients watching that order

**Implementing the SSE endpoint:**

```typescript
// The key concept: maintain a Map of active SSE connections
// Map<orderId, Set<Response>> — multiple clients can watch the same order

interface SSEClient {
  id: string;
  orderId: string;
  res: FastifyReply; // or Response in Express
}

const clients = new Map<string, Set<SSEClient>>();
```

For the `/orders/:id/stream` endpoint:

1. Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
2. Send an initial event with the current order status (so the client doesn't start blank)
3. Register the client in the `clients` Map under the orderId
4. When a RabbitMQ event updates that order, iterate through the registered clients and write the SSE event
5. On client disconnect, clean up the connection from the Map

**SSE message format:**
```
event: status_update
data: {"orderId":"abc-123","status":"PAID","timestamp":"2026-04-05T10:30:00Z","service":"payment-service"}

event: status_update
data: {"orderId":"abc-123","status":"SHIPPED","timestamp":"2026-04-05T10:30:05Z","service":"inventory-service"}
```

For the `/events/stream` endpoint (the global timeline):

Same concept, but instead of filtering by orderId, push ALL events from all services. This gives the frontend a live view of the entire system's activity.

**Important things to handle:**
- **Heartbeat** — send a comment line (`: heartbeat\n\n`) every 15–30 seconds to keep the connection alive and detect dead clients
- **Reconnection** — SSE has built-in reconnection via `Last-Event-ID`. Send an `id:` field with each event (use an incrementing counter or timestamp). When a client reconnects, they send the last ID they received — you can replay missed events
- **Connection cleanup** — listen for the `close` event on the request to remove stale clients from your Map
- **Backpressure** — if a client is slow, don't buffer unlimited events. Keep a max buffer size per client

**Milestone:** Use curl to test SSE:
```bash
# In terminal 1: connect to SSE
curl -N http://localhost:3000/orders/abc-123/stream

# In terminal 2: create an order
curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" -d '...'

# You should see status updates streaming in terminal 1 as each service processes the order
```

### Step 16: Frontend — Project Setup

Create a React app with Vite:

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
```

Keep it simple — you're a backend engineer showing you can build a functional frontend, not a pixel-perfect UI. Use **Tailwind CSS** for quick styling (you already know it from the Warehouse ERP).

The frontend has 3 main views:

1. **Order Form** — a simple form to create orders (POST to Order Service)
2. **Order Tracker** — shows a single order's status updating in real-time via SSE
3. **Event Timeline** — a live feed of ALL events across the entire system

### Step 17: useSSE Custom Hook

This is the core of the frontend. Build a reusable React hook:

```typescript
// hooks/useSSE.ts
// This hook should:
// 1. Create an EventSource connection to the given URL
// 2. Parse incoming events and update state
// 3. Handle reconnection automatically (EventSource does this natively)
// 4. Clean up the connection on unmount
// 5. Expose: events array, connection status, error state

function useSSE<T>(url: string): {
  events: T[];
  status: 'connecting' | 'open' | 'closed';
  error: Error | null;
}
```

**Key thing:** `EventSource` is a browser API that handles SSE natively — it auto-reconnects, parses the event stream format, and fires events. You don't need a library. Just `new EventSource(url)` and listen to `onmessage` / `addEventListener('status_update', ...)`.

### Step 18: Order Form Component

A straightforward form that:

1. Has fields for customer email, product selection (dropdown from inventory), quantity
2. On submit, POSTs to `/orders`
3. On success, navigates to the Order Tracker for that order ID

Nothing fancy — it just needs to work.

### Step 19: Order Tracker Component

This is the showcase component:

1. Takes an `orderId` from the URL (React Router param)
2. Connects to `/orders/:id/stream` using the `useSSE` hook
3. Displays a **step progress bar** showing the order's journey:

```
[PENDING] → [RESERVED] → [PAID] → [SHIPPED]
    ✓           ✓          ⏳         ○
```

4. Each step lights up in real-time as SSE events arrive
5. If a step fails (e.g., `payment.failed`), show it in red with the error reason
6. Show timestamps for each step transition

**Bonus:** Add a subtle animation or pulse effect when a new status arrives. It makes the real-time nature feel tangible when you're demoing.

### Step 20: Event Timeline Component

A live-updating feed showing ALL events in the system:

1. Connects to `/events/stream` using the `useSSE` hook
2. Each event shows: timestamp, event type, service name, relevant data
3. Color-code by service (blue for Payment, green for Inventory, orange for Notification)
4. New events appear at the top with a fade-in
5. Auto-scroll or show a "New events" badge if the user has scrolled up

This component is your demo centerpiece — when you show the project in an interview or on GitHub, you'll open this view, fire off a few orders, and let the interviewer watch events cascade through the system in real-time.

### Step 21: CORS & Proxy Setup

Since frontend (Vite dev server on port 5173) and Order Service (port 3000) are different origins:

- **In development:** Configure Vite's proxy in `vite.config.ts` to forward `/api/*` and SSE endpoints to the Order Service
- **In production/Docker:** Use the Order Service to serve the frontend's static build, or put nginx in front

**Milestone:** Open the frontend, create an order, and watch the Order Tracker update step-by-step in real-time as the payment, inventory, and notification services process it.

---

## Phase 6: Testing (Day 21–23)

### Step 22: Unit Tests

Test your business logic (payment processing, inventory reservation) in isolation. Mock the RabbitMQ publisher. Use **Vitest** (you already know it).

For the SSE endpoint, test that:
- The response headers are correct (`text/event-stream`)
- Clients receive the initial order status on connect
- Status update events are pushed to connected clients
- Client disconnection cleans up properly

### Step 23: Integration Tests

Use **Testcontainers** to spin up real RabbitMQ + PostgreSQL in Docker during tests. Test the actual event flow: create order → verify payment event fires → verify inventory updates.

This is an advanced pattern that interviewers love to see.

---

## Phase 7: Stretch Goals (Optional but impressive)

Pick 1–2 of these if you have time:

- **Saga Pattern:** Implement a proper saga orchestrator that coordinates the order flow and handles rollbacks (e.g., if inventory check fails after payment succeeds, trigger a refund event)
- **CQRS:** Separate read and write models — write events to a log, project them into read-optimized views
- **Rate Limiting:** Add rate limiting to the Order Service API using Redis
- **Monitoring:** Add Prometheus metrics to each service + a Grafana dashboard in Docker Compose
- **CI/CD:** GitHub Actions pipeline that runs tests, builds Docker images, and pushes to a registry

---

## CV Bullet Points (When You're Done)

Use these on your resume:

> - Designed and built an **event-driven microservices system** with 4 independent services communicating via RabbitMQ topic exchanges, handling order processing, payments, inventory, and notifications
> - Implemented **real-time order tracking** using Server-Sent Events (SSE) — the Order Service bridges RabbitMQ events to connected frontend clients with heartbeat, reconnection via Last-Event-ID, and connection lifecycle management
> - Built a **React dashboard** (Vite + TypeScript) with a live event timeline and step-by-step order tracker, consuming SSE streams via a custom `useSSE` hook
> - Implemented **message reliability patterns** including manual acknowledgment, idempotency keys, dead letter queues, and graceful shutdown for fault-tolerant async processing
> - Built **correlation-based distributed tracing** with structured logging (Pino) to track requests across service boundaries
> - Containerized all services with Docker and orchestrated with Docker Compose, enabling one-command local development setup
> - Wrote **integration tests using Testcontainers** with real RabbitMQ and PostgreSQL instances for end-to-end event flow verification

---

## Key Concepts to Understand Along the Way

As you build, make sure you can explain these in an interview:

1. **Why microservices over monolith?** — Independent deployment, scaling, team ownership. But also: added complexity, network failures, eventual consistency.
2. **Why a message broker?** — Decouples services, handles backpressure, enables retry, supports multiple consumers.
3. **Topic exchange vs direct vs fanout** — Know when to use each.
4. **Idempotency** — Why it matters when messages can be delivered more than once.
5. **Eventual consistency** — The order status might be "PENDING" in the Order DB while the Payment Service is still processing. How do you handle that?
6. **Saga pattern** — How do you coordinate transactions across services? (Even if you don't implement it, know the concept.)
7. **SSE vs WebSocket vs Long Polling** — SSE is one-way (server → client), auto-reconnects, works over HTTP/1.1, and is natively supported by browsers via `EventSource`. WebSocket is bidirectional but more complex. Know when to pick which: SSE is ideal when you only need server push (dashboards, notifications, live feeds). WebSocket is better for chat, gaming, or anything requiring client-to-server streaming.
8. **Backpressure** — What happens when your SSE clients or message consumers can't keep up with the event rate? How do you handle slow consumers?

---

## Resources

- [RabbitMQ Tutorials (Official)](https://www.rabbitmq.com/tutorials) — Do tutorials 1-5 before starting
- [amqplib npm package](https://www.npmjs.com/package/amqplib) — The Node.js RabbitMQ client
- [Fastify docs](https://fastify.dev/docs/latest/) — Your HTTP framework
- [Testcontainers for Node.js](https://node.testcontainers.org/) — For integration tests
- [Pino logger](https://getpino.io/) — Structured logging

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — The best SSE reference
- [MDN: EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) — Browser-side SSE client
- [Vite docs](https://vitejs.dev/guide/) — Frontend build tool
- [Vite proxy config](https://vitejs.dev/config/server-options.html#server-proxy) — For proxying API/SSE requests in dev

Good luck! Build it step by step and don't rush — the learning is in the details.
