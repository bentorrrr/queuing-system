import { describe, it, expect } from 'vitest';
import { validateEvent, orderCreatedEventSchema } from '../schemas';

const validPayload = {
  type: 'order.created' as const,
  timestamp: new Date().toISOString(),
  correlationId: 'trace-xyz-456',
  data: {
    orderId: 'order-uuid-001',
    customerEmail: 'customer@example.com',
    items: [{ productId: 'prod-a', quantity: 2, price: 29.99 }],
    totalAmount: 59.98,
  },
};

describe('validateEvent — OrderCreatedEvent schema', () => {
  it('returns success:true for a fully valid payload', () => {
    const result = validateEvent(orderCreatedEventSchema, validPayload);
    expect(result.success).toBe(true);
  });

  it('returns success:false when orderId is missing', () => {
    const { orderId: _omit, ...dataWithout } = validPayload.data;
    const result = validateEvent(orderCreatedEventSchema, {
      ...validPayload,
      data: dataWithout,
    });
    expect(result.success).toBe(false);
  });

  it('returns success:false when customerEmail is missing', () => {
    const { customerEmail: _omit, ...dataWithout } = validPayload.data;
    const result = validateEvent(orderCreatedEventSchema, {
      ...validPayload,
      data: dataWithout,
    });
    expect(result.success).toBe(false);
  });

  it('returns success:false when items is not an array', () => {
    const result = validateEvent(orderCreatedEventSchema, {
      ...validPayload,
      data: { ...validPayload.data, items: 'not-an-array' },
    });
    expect(result.success).toBe(false);
  });

  it('returns success:false when totalAmount is missing', () => {
    const { totalAmount: _omit, ...dataWithout } = validPayload.data;
    const result = validateEvent(orderCreatedEventSchema, {
      ...validPayload,
      data: dataWithout,
    });
    expect(result.success).toBe(false);
  });

  it('returns success:false when top-level type field is missing', () => {
    const { type: _omit, ...payloadWithout } = validPayload;
    const result = validateEvent(orderCreatedEventSchema, payloadWithout);
    expect(result.success).toBe(false);
  });

  it('returns success:false when timestamp is not a string', () => {
    const result = validateEvent(orderCreatedEventSchema, {
      ...validPayload,
      timestamp: 1234567890,
    });
    expect(result.success).toBe(false);
  });
});
