import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock amqplib before the module under test is imported.
// connectRabbitMQ is expected to call amqplib.connect(url) internally.
vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn(),
  },
}));

import amqplib from 'amqplib';
import { connectRabbitMQ } from '../rabbitmq';

const mockConnect = vi.mocked(amqplib.connect);

// A minimal fake connection object — enough to satisfy any channel creation calls
const fakeConnection = { createChannel: vi.fn() } as any;

describe('connectRabbitMQ retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves immediately when the first connection attempt succeeds', async () => {
    mockConnect.mockResolvedValueOnce(fakeConnection);

    const conn = await connectRabbitMQ('amqp://localhost');

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(conn).toBe(fakeConnection);
  });

  it('retries after a failure and resolves on the third attempt', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(fakeConnection);

    // delayMs:0 keeps the test instant; the implementation must honour this option
    const conn = await connectRabbitMQ('amqp://localhost', { retries: 5, delayMs: 0 });

    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(conn).toBe(fakeConnection);
  });

  it('throws after exhausting all retries', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    // retries:2 means 1 initial attempt + 2 retries = 3 total calls
    await expect(
      connectRabbitMQ('amqp://localhost', { retries: 2, delayMs: 0 })
    ).rejects.toThrow('ECONNREFUSED');

    expect(mockConnect).toHaveBeenCalledTimes(3);
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
