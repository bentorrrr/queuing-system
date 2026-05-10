import type { ServerResponse } from 'node:http';

const orderClients = new Map<string, Set<ServerResponse>>();
const globalClients = new Set<ServerResponse>();

export function addOrderClient(orderId: string, res: ServerResponse): void {
  let clients = orderClients.get(orderId);
  if (!clients) {
    clients = new Set();
    orderClients.set(orderId, clients);
  }
  clients.add(res);
}

export function removeOrderClient(orderId: string, res: ServerResponse): void {
  const clients = orderClients.get(orderId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    orderClients.delete(orderId);
  }
}

export function addGlobalClient(res: ServerResponse): void {
  globalClients.add(res);
}

export function removeGlobalClient(res: ServerResponse): void {
  globalClients.delete(res);
}

function writeSSE(res: ServerResponse, event: unknown): void {
  res.write(`event: status_update\ndata: ${JSON.stringify(event)}\n\n`);
}

export function pushToOrder(orderId: string, event: unknown): void {
  const clients = orderClients.get(orderId);
  if (!clients) return;
  for (const res of clients) {
    writeSSE(res, event);
  }
}

export function pushToAll(event: unknown): void {
  for (const res of globalClients) {
    writeSSE(res, event);
  }
}
