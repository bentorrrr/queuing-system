import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectRabbitMQ, consumeEvent, EXCHANGE, ROUTING_KEYS } from '@queuing/shared';
import type { BaseEvent } from '@queuing/shared';
import { db } from './db.js';
import { ordersPlugin } from './routes/orders.js';
import { eventsPlugin } from './routes/events.js';
import { pushToOrder, pushToAll } from './sse.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

async function main() {
  const app = Fastify({
    logger: {
      level: 'info',
      formatters: {
        bindings: () => ({ service: 'order-service' }),
      },
    },
  });

  await app.register(cors, { origin: true });

  // Connect RabbitMQ
  const { channel } = await connectRabbitMQ(RABBITMQ_URL);

  // Register routes
  app.register(ordersPlugin(channel));
  app.register(eventsPlugin());

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'order-service' }));

  // Consume status events from other services → update order status + push SSE
  const STATUS_MAP: Record<string, string> = {
    [ROUTING_KEYS.INVENTORY_RESERVED]: 'CONFIRMED',
    [ROUTING_KEYS.PAYMENT_COMPLETED]: 'PAID',
    [ROUTING_KEYS.PAYMENT_FAILED]: 'FAILED',
    [ROUTING_KEYS.INVENTORY_RELEASED]: 'FAILED',
  };

  await consumeEvent<BaseEvent>(
    channel,
    'order-service-status-queue',
    EXCHANGE,
    [
      ROUTING_KEYS.PAYMENT_COMPLETED,
      ROUTING_KEYS.PAYMENT_FAILED,
      ROUTING_KEYS.INVENTORY_RESERVED,
      ROUTING_KEYS.INVENTORY_RELEASED,
    ],
    async (event, ack, nack) => {
      try {
        const orderId = (event.data as { orderId: string }).orderId;
        const newStatus = STATUS_MAP[event.type];

        if (newStatus) {
          await db.order.update({
            where: { id: orderId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { status: newStatus as any },
          });
        }

        pushToOrder(orderId, event);
        pushToAll(event);
        ack();
      } catch {
        nack(false);
      }
    },
  );

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info({ port: PORT }, 'order-service started');

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('shutting down order-service');
    await channel.close();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
