# Acceptance Criteria — Order Processing System

Phase-by-phase pass/fail gates. Each phase is **done** only when every criterion in that section is met.

---

## Phase 1 — Foundation (Docker Compose + Shared Helpers)

### Infrastructure

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1.1 | `docker compose up` starts without errors | Run `docker compose up -d`; check `docker compose ps` shows all containers `Up` |
| 1.2 | RabbitMQ management UI is accessible | Open `http://localhost:15672` in browser; login with `guest` / `guest` |
| 1.3 | PostgreSQL is accepting connections | `docker compose exec postgres psql -U postgres -c '\l'` lists databases |

### Shared RabbitMQ Helper

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1.4 | `connectRabbitMQ` retries on failure and eventually connects | Unit test in `rabbitmq.test.ts` passes: mock rejects twice → resolves on third call |
| 1.5 | A test message published via `publishEvent` appears in RabbitMQ | Run the scratch script below; message appears in the `orders` exchange in the management UI |

**Scratch publish script** (run once, then delete):
```bash
npx tsx -e "
  import { connectRabbitMQ, publishEvent } from './packages/shared/src/index';
  const conn = await connectRabbitMQ('amqp://localhost');
  await publishEvent(conn, 'orders', 'order.created', { test: true });
  console.log('published');
  process.exit(0);
"
```

Expected: management UI → Exchanges → `orders` → Publish a Message shows the message; or Queues shows a message count of 1 if a queue is bound.

### Unit Test Gate

```bash
npx vitest run packages/shared/src/__tests__/rabbitmq.test.ts
```

**PASS** = all 4 tests green.

---

## Phase 2 — Order Service (REST API + Event Publishing)

### API behaviour

| # | Criterion | How to verify |
|---|-----------|---------------|
| 2.1 | `POST /orders` returns HTTP 201 with order JSON | `curl` command below returns `201` and body contains `id`, `status: "PENDING"` |
| 2.2 | Order is persisted in PostgreSQL with status `PENDING` | DB query below returns 1 row |
| 2.3 | `order.created` event is visible in RabbitMQ after POST | Management UI → Queues → `payment-queue` shows message count ≥ 1 |
| 2.4 | `GET /orders/:id` returns the order | `curl http://localhost:3000/orders/<id>` returns the same order body |
| 2.5 | `GET /orders` returns a paginated list | Response has `data: []` and `total` fields |

**Create an order:**
```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerEmail": "test@example.com",
    "items": [{ "productId": "prod-1", "quantity": 2, "price": 29.99 }],
    "totalAmount": 59.98
  }'
```

Expected response:
```json
{
  "id": "<uuid>",
  "customerEmail": "test@example.com",
  "status": "PENDING",
  "totalAmount": 59.98,
  "createdAt": "<ISO timestamp>"
}
```

**Verify DB row:**
```bash
docker compose exec postgres psql -U postgres -d orders_db \
  -c "SELECT id, status, \"customerEmail\" FROM \"Order\" ORDER BY \"createdAt\" DESC LIMIT 1;"
```

Expected: 1 row with `status = PENDING`.

**Verify RabbitMQ event:**

Management UI → Queues → `payment-queue` → Get messages → Body should be:
```json
{
  "type": "order.created",
  "timestamp": "<ISO>",
  "correlationId": "<uuid>",
  "data": { "orderId": "<uuid>", "customerEmail": "test@example.com", ... }
}
```

### Unit Test Gate

```bash
npx vitest run packages/shared/src/__tests__/events.test.ts \
                  packages/shared/src/__tests__/schemas.test.ts
```

**PASS** = all tests green.

---

## Phase 3 — Consumer Services (Full Pipeline)

### End-to-end flow

| # | Criterion | How to verify |
|---|-----------|---------------|
| 3.1 | Payment Service logs receipt of `order.created` | `docker compose logs payment-service` shows `[payment-service] received order.created` |
| 3.2 | Payment Service publishes `payment.completed` or `payment.failed` | Management UI → Exchanges → `orders` → Bindings shows a message routed to `inventory-queue` |
| 3.3 | Inventory Service reserves stock on `order.created` | DB query on inventory DB shows `reservedStock` incremented |
| 3.4 | Inventory Service releases stock on `payment.failed` | Trigger a failed payment; DB shows `reservedStock` decremented back |
| 3.5 | Inventory Service confirms stock on `payment.completed` | DB shows `availableStock` decremented and `reservedStock` decremented |
| 3.6 | Notification Service logs for every event type | `docker compose logs notification-service` shows all three log lines below |
| 3.7 | Full pipeline completes without manual intervention | POST one order; within 10 s all services have logged their steps |

**Expected Notification Service log lines** (after one order):
```
[notification-service] Order confirmation email sent to test@example.com
[notification-service] Payment receipt sent
```
(or if payment fails):
```
[notification-service] Payment failure notification sent
```

**Inventory DB verification:**
```bash
docker compose exec postgres psql -U postgres -d inventory_db \
  -c "SELECT id, name, \"availableStock\", \"reservedStock\" FROM \"Product\";"
```

### Idempotency check

Publish the same `order.created` event twice with identical `orderId`:

```bash
# Publish duplicate via management HTTP API
curl -s -u guest:guest -X POST http://localhost:15672/api/exchanges/%2F/orders/publish \
  -H "Content-Type: application/json" \
  -d '{
    "properties": { "content_type": "application/json" },
    "routing_key": "order.created",
    "payload": "{\"type\":\"order.created\",\"correlationId\":\"dup-test\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"data\":{\"orderId\":\"<existing-id>\",\"customerEmail\":\"test@example.com\",\"items\":[],\"totalAmount\":0}}",
    "payload_encoding": "string"
  }'
```

**PASS** = Payment DB still has exactly **1** row for that `orderId` (not 2).

---

## Phase 4 — Production-Like Features

### Dead Letter Queue

| # | Criterion | How to verify |
|---|-----------|---------------|
| 4.1 | A message that fails N times is routed to the DLQ | Procedure below; DLQ has 1 message |
| 4.2 | DLQ message is inspectable via management UI | Management UI → Queues → `orders.dlq` → Get messages shows the original payload |

**DLQ test procedure:**
1. Temporarily make the Payment Service throw on every message (env var or code change).
2. POST an order.
3. Wait for N nack cycles (watch logs: `[payment-service] nacking message, attempt N`).
4. Check: `docker compose exec rabbitmq rabbitmqctl list_queues name messages` — `orders.dlq` should show `1`.

### Health Checks

```bash
# Order Service
curl -s http://localhost:3000/health | jq .

# Payment Service
curl -s http://localhost:3001/health | jq .

# Inventory Service
curl -s http://localhost:3002/health | jq .

# Notification Service
curl -s http://localhost:3003/health | jq .
```

**PASS** = Each returns HTTP `200` with a body like:
```json
{ "status": "ok", "db": "ok", "rabbitmq": "ok" }
```

### One-command startup

```bash
docker compose down -v && docker compose up --build
```

**PASS** = All 4 services start without manual intervention; `docker compose ps` shows all `Up (healthy)` within 60 s.

### Structured Logging

Every log line from every service must include these fields (verified visually in `docker compose logs`):

| Field | Example |
|-------|---------|
| `service` | `"payment-service"` |
| `correlationId` | `"3f2a...c1"` |
| `timestamp` | `"2026-05-05T12:00:00.000Z"` |
| `level` | `"info"` |

---

## Phase 5 — SSE + Frontend Dashboard

### SSE Endpoint Behaviour

| # | Criterion | How to verify |
|---|-----------|---------------|
| 5.1 | Response has `Content-Type: text/event-stream` | `curl -v` output below shows correct header |
| 5.2 | Initial order status is pushed immediately on connect | First event in stream matches DB status for that order |
| 5.3 | Status update event is pushed when processing occurs | POST order in terminal 2; terminal 1 SSE stream shows update within 5 s |
| 5.4 | Heartbeat comment is sent every ≤ 30 s | Leave `curl -N` running; see `: heartbeat` line in stream |
| 5.5 | Disconnecting a client removes it from the SSE Map | Check service logs: `[order-service] SSE client disconnected, orderId=<id>` |

**Verify headers:**
```bash
curl -v -N http://localhost:3000/orders/<id>/stream 2>&1 | grep "content-type"
# Expected: content-type: text/event-stream
```

**Full SSE integration test — two terminals:**
```bash
# Terminal 1 — connect before the order exists
curl -N http://localhost:3000/orders/$(ORDER_ID=$(uuidgen); echo $ORDER_ID; \
  curl -s -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -d "{\"customerEmail\":\"sse@test.com\",\"items\":[{\"productId\":\"p1\",\"quantity\":1,\"price\":10}],\"totalAmount\":10}" \
  | jq -r .id)/stream
```

Expected stream output (one event per status transition):
```
event: status_update
data: {"orderId":"<id>","status":"PENDING","timestamp":"..."}

event: status_update
data: {"orderId":"<id>","status":"PAID","timestamp":"...","service":"payment-service"}

event: status_update
data: {"orderId":"<id>","status":"SHIPPED","timestamp":"...","service":"inventory-service"}
```

### Frontend Behaviour (manual browser check)

| # | Criterion | How to verify |
|---|-----------|---------------|
| 5.6 | Order Form submits successfully and navigates to Order Tracker | Fill form, click Submit; browser navigates to `/orders/<id>` |
| 5.7 | Order Tracker highlights the correct step for the current status | Steps light up one-by-one as SSE events arrive |
| 5.8 | Failed step is shown in red with reason | Trigger payment failure; tracker shows the FAILED step in red |
| 5.9 | Event Timeline receives all system events in real-time | Open `/timeline`; POST an order; all events appear at the top of the list |

---

## Phase 6 — Testing

### Unit tests

```bash
npx vitest run
```

**PASS** = 0 failures across all `packages/**/*.test.ts` and `services/**/*.test.ts`.

### Integration tests — full event flow

Each integration test file must:
- Start real RabbitMQ + PostgreSQL via `startRabbitMQ()` / `startPostgres()` helpers
- POST an order to the Order Service HTTP API
- Assert the order status in PostgreSQL transitions from `PENDING` → `PAID` (or `FAILED`) within 10 s
- Stop containers in `afterAll`

**PASS** criteria for each integration test:

| Test | Expected outcome |
|------|-----------------|
| Full pipeline (happy path) | Order status = `PAID` in DB; no DLQ messages |
| Payment failure path | Order status = `FAILED`; inventory `reservedStock` returned to 0 |
| Idempotency: duplicate `order.created` | Exactly 1 payment record in payment DB for that `orderId` |
| Graceful shutdown mid-processing | Service re-starts; message is redelivered and processed once |

### DLQ routing (integration)

```bash
npx vitest run services/payment-service/src/__tests__/dlq.integration.test.ts
```

**PASS** = Message appears in `orders.dlq` after 3 nacks; original payload is intact.

### SSE unit tests

```bash
npx vitest run services/order-service/src/__tests__/sse.test.ts
```

**PASS** criteria:

| Test | Expected |
|------|----------|
| GET `/orders/:id/stream` response headers | `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` |
| Connect to existing order | First event payload matches the order's current DB status |
| Broadcast on status update | All registered clients for that `orderId` receive the event |
| Client disconnect cleanup | After `close` event, client is removed from the SSE Map (size decrements) |

---

## Phase 7 — Stretch Goals

These are optional. Mark a stretch goal done when the criterion below is met.

### Saga Pattern

| # | Criterion |
|---|-----------|
| 7.1 | Inventory fails AFTER payment completes → a `refund.initiated` event is published and the order ends in `REFUNDED` status |
| 7.2 | Saga state is persisted so a service restart does not leave the saga stuck |

### CQRS

| # | Criterion |
|---|-----------|
| 7.3 | Write path (command) and read path (query) use separate handlers |
| 7.4 | Read model is populated by replaying events from the write log |

### Monitoring (Prometheus + Grafana)

```bash
curl -s http://localhost:3000/metrics | grep "http_requests_total"
```

**PASS** = metric is present; Grafana dashboard at `http://localhost:3001` (Grafana port) shows request rates.

### CI/CD (GitHub Actions)

| # | Criterion |
|---|-----------|
| 7.5 | `git push` triggers a workflow that runs `npx vitest run` |
| 7.6 | Workflow fails the PR if any test fails |
| 7.7 | On merge to `main`, Docker images are built and pushed to a registry |
