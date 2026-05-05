export type OrderStatusValue =
  | 'PENDING'
  | 'RESERVED'
  | 'PAID'
  | 'SHIPPED'
  | 'FAILED';

export interface OrderStatus {
  orderId: string;
  status: OrderStatusValue;
  timestamp: string;
  service: string;
}

export interface SystemEvent {
  id: string;
  type: string;
  service: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface Order {
  id: string;
  customerEmail: string;
  productId: string;
  quantity: number;
  price: number;
  status: OrderStatusValue;
  createdAt: string;
}
