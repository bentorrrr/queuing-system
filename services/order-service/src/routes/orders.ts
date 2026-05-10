import type { FastifyPluginAsync } from 'fastify';
import type { Channel } from 'amqplib';
import { OrderStatus } from '@prisma/client';
import { createEvent, publishEvent, ROUTING_KEYS } from '@queuing/shared';
import type { OrderCreatedEvent } from '@queuing/shared';
import { db } from '../db.js';
import { pushToOrder } from '../sse.js';

interface OrderBody {
  customerEmail: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  totalAmount: number;
}

interface StatusBody {
  status: OrderStatus;
}

interface PaginationQuery {
  page?: number;
  limit?: number;
}

export function ordersPlugin(channel: Channel): FastifyPluginAsync {
  return async function (app) {
    app.post<{ Body: OrderBody }>('/orders', async (request, reply) => {
      const { customerEmail, items, totalAmount } = request.body ?? {};

      if (!items || items.length === 0 || !totalAmount || totalAmount <= 0) {
        return reply.code(400).send({ error: 'items must be non-empty and totalAmount must be positive' });
      }

      // Generate the correlationId first, then create the DB record so we can
      // include the real orderId in the published event without a second DB call.
      const correlationId = crypto.randomUUID();

      const order = await db.order.create({
        data: {
          customerEmail,
          items,
          totalAmount,
          status: 'PENDING',
          correlationId,
        },
      });

      const fullEvent = createEvent<OrderCreatedEvent>(
        'order.created',
        {
          orderId: order.id,
          customerEmail,
          items,
          totalAmount,
        },
        correlationId,
      );

      publishEvent(channel, ROUTING_KEYS.ORDER_CREATED, fullEvent);

      request.log.info({ correlationId: order.correlationId, orderId: order.id }, 'order created');

      return reply.code(201).send({
        id: order.id,
        status: order.status,
        correlationId: order.correlationId,
        createdAt: order.createdAt,
      });
    });

    app.get<{ Querystring: PaginationQuery }>('/orders', async (request, reply) => {
      const page = Math.max(1, Number(request.query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 20)));
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        db.order.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
        db.order.count(),
      ]);

      return reply.send({ data, total, page, limit });
    });

    app.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const order = await db.order.findUnique({ where: { id: request.params.id } });
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }
      return reply.send(order);
    });

    app.patch<{ Params: { id: string }; Body: StatusBody }>('/orders/:id/status', async (request, reply) => {
      const { status } = request.body ?? {};
      const { id } = request.params;

      const existing = await db.order.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const updated = await db.order.update({
        where: { id },
        data: { status },
      });

      pushToOrder(id, { type: 'status_update', orderId: id, status });

      return reply.send(updated);
    });
  };
}
