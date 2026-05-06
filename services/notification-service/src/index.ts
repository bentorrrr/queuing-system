import Fastify from 'fastify';
import { connectRabbitMQ, consumeEvent, EXCHANGE, ROUTING_KEYS } from '@queuing/shared';
import type { BaseEvent } from '@queuing/shared';

const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

const MESSAGES: Record<string, (event: BaseEvent) => string> = {
  [ROUTING_KEYS.ORDER_CREATED]: (e) =>
    `Order confirmation email sent to ${(e.data as { customerEmail: string }).customerEmail}`,
  [ROUTING_KEYS.PAYMENT_COMPLETED]: (e) =>
    `Payment receipt sent for order ${(e.data as { orderId: string }).orderId}`,
  [ROUTING_KEYS.PAYMENT_FAILED]: (e) =>
    `Payment failure notification sent for order ${(e.data as { orderId: string }).orderId}`,
  [ROUTING_KEYS.INVENTORY_RESERVED]: (e) =>
    `Stock reservation confirmation for order ${(e.data as { orderId: string }).orderId}`,
  [ROUTING_KEYS.INVENTORY_RELEASED]: (e) =>
    `Stock release notification for order ${(e.data as { orderId: string }).orderId}`,
};

async function main() {
  const app = Fastify({
    logger: {
      level: 'info',
      formatters: { bindings: () => ({ service: 'notification-service' }) },
    },
  });

  app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));

  const { channel } = await connectRabbitMQ(RABBITMQ_URL);

  await consumeEvent<BaseEvent>(
    channel,
    'notification-queue',
    EXCHANGE,
    [
      ROUTING_KEYS.ORDER_CREATED,
      ROUTING_KEYS.PAYMENT_COMPLETED,
      ROUTING_KEYS.PAYMENT_FAILED,
      ROUTING_KEYS.INVENTORY_RESERVED,
      ROUTING_KEYS.INVENTORY_RELEASED,
    ],
    async (event, ack, nack) => {
      try {
        const message =
          MESSAGES[event.type]?.(event) ?? `Notification for ${event.type}`;
        app.log.info(
          {
            correlationId: event.correlationId,
            orderId: (event.data as { orderId?: string }).orderId,
            eventType: event.type,
          },
          message,
        );
        ack();
      } catch (err) {
        app.log.error({ err }, 'notification error');
        nack(false);
      }
    },
  );

  await app.listen({ port: 3003, host: '0.0.0.0' });

  const shutdown = async () => {
    app.log.info('shutting down notification-service');
    await channel.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
