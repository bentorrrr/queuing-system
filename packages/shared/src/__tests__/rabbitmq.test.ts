import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock amqplib before the module under test is imported.
vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn(),
  },
}));

import amqplib from 'amqplib';
import { connectRabbitMQ } from '../rabbitmq';

const mockConnect = vi.mocked(amqplib.connect);

const fakeChannel = {
  assertExchange: vi.fn().mockResolvedValue(undefined),
  assertQueue: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn(),
  consume: vi.fn(),
} as any;

const fakeConnection = {
  createChannel: vi.fn().mockResolvedValue(fakeChannel),
} as any;

describe('connectRabbitMQ retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeConnection.createChannel.mockResolvedValue(fakeChannel);
    fakeChannel.assertExchange.mockResolvedValue(undefined);
  });

  it('resolves immediately when the first connection attempt succeeds', async () => {
    mockConnect.mockResolvedValueOnce(fakeConnection);

    const result = await connectRabbitMQ('amqp://localhost');

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(result.connection).toBe(fakeConnection);
    expect(result.channel).toBe(fakeChannel);
  });

  it('retries after a failure and resolves on the third attempt', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(fakeConnection);

    const result = await connectRabbitMQ('amqp://localhost', { retries: 5, delayMs: 0 });

    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(result.connection).toBe(fakeConnection);
  });

  it('throws after exhausting all retries', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    // retries:2 → 1 initial + 1 retry = 2 total calls
    await expect(
      connectRabbitMQ('amqp://localhost', { retries: 2, delayMs: 0 })
    ).rejects.toThrow('ECONNREFUSED');

    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('passes the url to amqplib.connect on every attempt', async () => {
    const url = 'amqp://user:pass@rabbitmq:5672';
    mockConnect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(fakeConnection);

    await connectRabbitMQ(url, { retries: 3, delayMs: 0 });

    expect(mockConnect).toHaveBeenCalledWith(url);
  });
});
