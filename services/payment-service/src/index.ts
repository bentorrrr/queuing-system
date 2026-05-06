import Fastify from 'fastify';
import {
  connectRabbitMQ,
  consumeEvent,
  publishEvent,
  createEvent,
  EXCHANGE,
  ROUTING_KEYS,
} from '@queuing/shared';
import type { OrderCreatedEvent, PaymentCompletedEvent, PaymentFailedEvent } from '@queuing/shared';
import { db } from './db.js';

const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

async function main() {
  const app = Fastify({
    logger: {
      level: 'info',
      formatters: { bindings: () => ({ service: 'payment-service' }) },
    },
  });

  app.get('/health', async () => ({ status: 'ok', service: 'payment-service' }));

  const { channel } = await connectRabbitMQ(RABBITMQ_URL);

  await consumeEvent<OrderCreatedEvent>(
    channel,
    'payment-queue',
    EXCHANGE,
    [ROUTING_KEYS.ORDER_CREATED],
    async (event, ack, nack) => {
      const log = app.log.child({ correlationId: event.correlationId, orderId: event.data.orderId });
      try {
        // Idempotency check
        const existing = await db.payment.findUnique({ where: { orderId: event.data.orderId } });
        if (existing) {
          log.info('payment already processed, skipping');
          ack();
          return;
        }

        log.info('processing payment');

        // Simulate payment processing (800ms)
        await new Promise((resolve) => setTimeout(resolve, 800));

        // 80% success rate
        const success = Math.random() < 0.8;

        if (success) {
          await db.payment.create({
            data: {
              orderId: event.data.orderId,
              amount: event.data.totalAmount,
              status: 'COMPLETED',
            },
          });
          publishEvent(
            channel,
            ROUTING_KEYS.PAYMENT_COMPLETED,
            createEvent<PaymentCompletedEvent>(
              'payment.completed',
              { orderId: event.data.orderId, amount: event.data.totalAmount },
              event.correlationId,
            ),
          );
          log.info({ amount: event.data.totalAmount }, 'payment completed');
        } else {
          const reason = 'Insufficient funds';
          await db.payment.create({
            data: {
              orderId: event.data.orderId,
              amount: event.data.totalAmount,
              status: 'FAILED',
              reason,
            },
          });
          publishEvent(
            channel,
            ROUTING_KEYS.PAYMENT_FAILED,
            createEvent<PaymentFailedEvent>(
              'payment.failed',
              { orderId: event.data.orderId, reason },
              event.correlationId,
            ),
          );
          log.info({ reason }, 'payment failed');
        }

        ack();
      } catch (err) {
        app.log.error({ err }, 'payment processing error');
        nack(false);
      }
    },
  );

  await app.listen({ port: 3001, host: '0.0.0.0' });

  const shutdown = async () => {
    app.log.info('shutting down payment-service');
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
