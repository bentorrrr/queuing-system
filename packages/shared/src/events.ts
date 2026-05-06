import { v4 as uuidv4 } from 'uuid';

export const EXCHANGE = 'order-events';

export const ROUTING_KEYS = {
  ORDER_CREATED: 'order.created',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RELEASED: 'inventory.released',
} as const;

export interface OrderCreatedEvent {
  type: 'order.created';
  timestamp: string;
  correlationId: string;
  data: {
    orderId: string;
    customerEmail: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    totalAmount: number;
  };
}

export interface PaymentCompletedEvent {
  type: 'payment.completed';
  timestamp: string;
  correlationId: string;
  data: {
    orderId: string;
    amount: number;
  };
}

export interface PaymentFailedEvent {
  type: 'payment.failed';
  timestamp: string;
  correlationId: string;
  data: {
    orderId: string;
    reason: string;
  };
}

export interface InventoryReservedEvent {
  type: 'inventory.reserved';
  timestamp: string;
  correlationId: string;
  data: {
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

export interface InventoryReleasedEvent {
  type: 'inventory.released';
  timestamp: string;
  correlationId: string;
  data: {
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

export type BaseEvent =
  | OrderCreatedEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | InventoryReservedEvent
  | InventoryReleasedEvent;

export function createEvent<T extends BaseEvent>(
  type: T['type'],
  data: T['data'],
  correlationId?: string,
): T {
  return {
    type,
    timestamp: new Date().toISOString(),
    correlationId: correlationId ?? uuidv4(),
    data,
  } as T;
}
