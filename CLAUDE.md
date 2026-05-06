# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An **event-driven microservices Order Processing System** built for CV/portfolio purposes. 4 independent backend services communicate via RabbitMQ, with a React frontend showing real-time order status via Server-Sent Events (SSE). See `microservices-project-guide.md` for the full phased build plan.

## Architecture

```
Frontend (React + Vite)
  └── REST POST → Order Service → publishes to RabbitMQ topic exchange
                                        ├── Payment Service (consumes order.created)
                                        ├── Inventory Service (consumes order.created / payment.*)
                                        └── Notification Service (consumes all events)
                  Order Service ← subscribes to status update events → pushes to frontend via SSE
```

## Tech Stack

**Backend services:** Node.js + TypeScript, Fastify, Prisma + PostgreSQL, amqplib (RabbitMQ), Pino logging

**Shared package:** Event type definitions, RabbitMQ connect/publish/consume helpers, Zod schema validation

**Frontend:** React + Vite + TypeScript, Tailwind CSS, native `EventSource` API (no SSE library needed)

**Infrastructure:** Docker Compose — `rabbitmq:3-management` (ports 5672 + 15672), `postgres:16`

**Testing:** Vitest (unit), Testcontainers (integration — real RabbitMQ + PostgreSQL in Docker)

**Monorepo:** npm workspaces

## Key Patterns

- **Topic exchange routing** — events like `order.created`, `payment.completed` routed by key pattern
- **Manual ack + idempotency** — each consumer uses orderId as idempotency key; only acks after successful processing
- **Dead Letter Queue** — failed messages after N retries route to DLQ with a retry endpoint
- **SSE bridge** — Order Service maintains `Map<orderId, Set<SSEClient>>`, consumes RabbitMQ status events, pushes to connected frontend clients; includes heartbeat and Last-Event-ID reconnection
- **Correlation IDs** — passed through all events for distributed tracing across services
- **Graceful shutdown** — each service handles SIGTERM: stops consuming, finishes in-flight, then exits

---

## Behavioral Guidelines

*Derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.*

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
