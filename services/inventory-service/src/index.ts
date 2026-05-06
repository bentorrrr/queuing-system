import Fastify from 'fastify';
import {
  connectRabbitMQ,
  consumeEvent,
  publishEvent,
  createEvent,
  EXCHANGE,
  ROUTING_KEYS,
} from '@queuing/shared';
import type {
  OrderCreatedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  InventoryReservedEvent,
  InventoryReleasedEvent,
} from '@queuing/shared';
import { db } from './db.js';

const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

async function main() {
  const app = Fastify({
    logger: {
      level: 'info',
      formatters: { bindings: () => ({ service: 'inventory-service' }) },
    },
  });

  app.get('/health', async () => ({ status: 'ok', service: 'inventory-service' }));

  const { channel } = await connectRabbitMQ(RABBITMQ_URL);

  // Handle order.created → reserve stock
  await consumeEvent<OrderCreatedEvent>(
    channel,
    'inventory-order-queue',
    EXCHANGE,
    [ROUTING_KEYS.ORDER_CREATED],
    async (event, ack, nack) => {
      const log = app.log.child({ correlationId: event.correlationId, orderId: event.data.orderId });
      try {
        const existing = await db.stockReservation.findUnique({
          where: { orderId: event.data.orderId },
        });
        if (existing) {
          log.info('reservation already exists, skipping');
          ack();
          return;
        }

        // Reserve stock for each item (only if sufficient stock)
        for (const item of event.data.items) {
          const updated = await db.product.updateMany({
            where: { sku: item.productId, availableStock: { gte: item.quantity } },
            data: {
              availableStock: { decrement: item.quantity },
              reservedStock: { increment: item.quantity },
            },
          });
          if (updated.count === 0) {
            log.warn({ productId: item.productId, quantity: item.quantity }, 'insufficient stock, skipping item');
          }
        }

        await db.stockReservation.create({
          data: { orderId: event.data.orderId, items: event.data.items, status: 'RESERVED' },
        });

        publishEvent(
          channel,
          ROUTING_KEYS.INVENTORY_RESERVED,
          createEvent<InventoryReservedEvent>(
            'inventory.reserved',
            {
              orderId: event.data.orderId,
              items: event.data.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            },
            event.correlationId,
          ),
        );

        log.info({ items: event.data.items.length }, 'stock reserved');
        ack();
      } catch (err) {
        app.log.error({ err }, 'reservation error');
        nack(false);
      }
    },
  );

  // Handle payment.completed and payment.failed → confirm or release reservation
  await consumeEvent<PaymentCompletedEvent | PaymentFailedEvent>(
    channel,
    'inventory-payment-queue',
    EXCHANGE,
    [ROUTING_KEYS.PAYMENT_COMPLETED, ROUTING_KEYS.PAYMENT_FAILED],
    async (event, ack, nack) => {
      const log = app.log.child({ correlationId: event.correlationId, orderId: event.data.orderId });
      try {
        const reservation = await db.stockReservation.findUnique({
          where: { orderId: event.data.orderId },
        });

        if (!reservation || reservation.status !== 'RESERVED') {
          log.info('no active reservation to update, skipping');
          ack();
          return;
        }

        const items = reservation.items as Array<{ productId: string; quantity: number }>;

        if (event.type === 'payment.completed') {
          // Confirm: permanently deduct reserved stock
          for (const item of items) {
            await db.product.updateMany({
              where: { sku: item.productId },
              data: { reservedStock: { decrement: item.quantity } },
            });
          }
          await db.stockReservation.update({
            where: { orderId: event.data.orderId },
            data: { status: 'CONFIRMED' },
          });
          log.info('stock confirmed after payment');
        } else {
          // Release: move reserved stock back to available
          for (const item of items) {
            await db.product.updateMany({
              where: { sku: item.productId },
              data: {
                reservedStock: { decrement: item.quantity },
                availableStock: { increment: item.quantity },
              },
            });
          }
          await db.stockReservation.update({
            where: { orderId: event.data.orderId },
            data: { status: 'RELEASED' },
          });
          publishEvent(
            channel,
            ROUTING_KEYS.INVENTORY_RELEASED,
            createEvent<InventoryReleasedEvent>(
              'inventory.released',
              { orderId: event.data.orderId, items },
              event.correlationId,
            ),
          );
          log.info('stock released after payment failure');
        }

        ack();
      } catch (err) {
        app.log.error({ err }, 'inventory payment handler error');
        nack(false);
      }
    },
  );

  await app.listen({ port: 3002, host: '0.0.0.0' });

  const shutdown = async () => {
    app.log.info('shutting down inventory-service');
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
