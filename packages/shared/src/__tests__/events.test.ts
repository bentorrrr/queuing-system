import { describe, it, expect } from 'vitest';
import { createEvent, ROUTING_KEYS } from '../events';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createEvent', () => {
  it('returns an event with the correct type', () => {
    const event = createEvent('order.created', { orderId: 'ord-1' });
    expect(event.type).toBe('order.created');
  });

  it('returns a valid ISO 8601 timestamp', () => {
    const event = createEvent('order.created', { orderId: 'ord-1' });
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  it('generates a uuid v4 correlationId when none is provided', () => {
    const event = createEvent('order.created', { orderId: 'ord-1' });
    expect(event.correlationId).toMatch(UUID_REGEX);
  });

  it('preserves a custom correlationId when provided', () => {
    const correlationId = 'trace-abc-123';
    const event = createEvent('order.created', { orderId: 'ord-1' }, correlationId);
    expect(event.correlationId).toBe(correlationId);
  });

  it('includes the provided data unchanged', () => {
    const data = { orderId: 'ord-2', customerEmail: 'buyer@example.com', totalAmount: 99.99 };
    const event = createEvent('order.created', data);
    expect(event.data).toEqual(data);
  });

  it('two events get distinct correlationIds', () => {
    const a = createEvent('order.created', { orderId: 'ord-1' });
    const b = createEvent('order.created', { orderId: 'ord-2' });
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});

describe('ROUTING_KEYS', () => {
  it('ORDER_CREATED equals "order.created"', () => {
    expect(ROUTING_KEYS.ORDER_CREATED).toBe('order.created');
  });

  it('PAYMENT_COMPLETED equals "payment.completed"', () => {
    expect(ROUTING_KEYS.PAYMENT_COMPLETED).toBe('payment.completed');
  });

  it('PAYMENT_FAILED equals "payment.failed"', () => {
    expect(ROUTING_KEYS.PAYMENT_FAILED).toBe('payment.failed');
  });

  it('INVENTORY_RESERVED equals "inventory.reserved"', () => {
    expect(ROUTING_KEYS.INVENTORY_RESERVED).toBe('inventory.reserved');
  });

  it('INVENTORY_RELEASED equals "inventory.released"', () => {
    expect(ROUTING_KEYS.INVENTORY_RELEASED).toBe('inventory.released');
  });
});
