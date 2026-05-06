import { z } from 'zod';

const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
});

const inventoryItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const orderCreatedEventSchema = z.object({
  type: z.literal('order.created'),
  timestamp: z.string(),
  correlationId: z.string(),
  data: z.object({
    orderId: z.string(),
    customerEmail: z.string().email(),
    items: z.array(orderItemSchema).min(1),
    totalAmount: z.number().positive(),
  }),
});

export const paymentCompletedSchema = z.object({
  type: z.literal('payment.completed'),
  timestamp: z.string(),
  correlationId: z.string(),
  data: z.object({
    orderId: z.string(),
    amount: z.number().positive(),
  }),
});

export const paymentFailedSchema = z.object({
  type: z.literal('payment.failed'),
  timestamp: z.string(),
  correlationId: z.string(),
  data: z.object({
    orderId: z.string(),
    reason: z.string(),
  }),
});

export const inventoryReservedSchema = z.object({
  type: z.literal('inventory.reserved'),
  timestamp: z.string(),
  correlationId: z.string(),
  data: z.object({
    orderId: z.string(),
    items: z.array(inventoryItemSchema).min(1),
  }),
});

export const inventoryReleasedSchema = z.object({
  type: z.literal('inventory.released'),
  timestamp: z.string(),
  correlationId: z.string(),
  data: z.object({
    orderId: z.string(),
    items: z.array(inventoryItemSchema).min(1),
  }),
});

export function validateEvent<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): { success: true; data: T; error: null } | { success: false; data: null; error: string } {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  return { success: false, data: null, error: result.error.message };
}
