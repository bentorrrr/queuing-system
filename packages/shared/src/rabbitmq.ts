import amqplib, { type Channel, type ChannelModel } from 'amqplib';
import { EXCHANGE } from './events.js';

export async function connectRabbitMQ(
  url: string,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<{ connection: ChannelModel; channel: Channel }> {
  const { retries = 5, delayMs = 2000 } = opts;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqplib.connect(url);
      const channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      return { connection, channel };
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable — satisfies TypeScript exhaustiveness
  throw new Error('Failed to connect to RabbitMQ');
}

export function publishEvent(channel: Channel, routingKey: string, payload: unknown): void {
  const buffer = Buffer.from(JSON.stringify(payload));
  channel.publish(EXCHANGE, routingKey, buffer, { persistent: true });
}

export async function consumeEvent<T>(
  channel: Channel,
  queue: string,
  exchange: string,
  routingKeys: string[],
  handler: (payload: T, ack: () => void, nack: (requeue: boolean) => void) => Promise<void>,
): Promise<void> {
  await channel.assertQueue(queue, { durable: true });
  for (const key of routingKeys) {
    await channel.bindQueue(queue, exchange, key);
  }
  channel.prefetch(1);
  await channel.consume(
    queue,
    async (msg) => {
      if (!msg) return;
      const ack = () => channel.ack(msg);
      const nack = (requeue: boolean) => channel.nack(msg, false, requeue);
      try {
        const payload = JSON.parse(msg.content.toString()) as T;
        await handler(payload, ack, nack);
      } catch {
        nack(false);
      }
    },
    { noAck: false },
  );
}
