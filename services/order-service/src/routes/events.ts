import type { FastifyPluginAsync } from 'fastify';
import {
  addOrderClient,
  removeOrderClient,
  addGlobalClient,
  removeGlobalClient,
} from '../sse.js';

export function eventsPlugin(): FastifyPluginAsync {
  return async function (app) {
    app.get<{ Params: { id: string } }>('/orders/:id/stream', async (request, reply) => {
      const { id } = request.params;
      const res = reply.raw;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(':ok\n\n');

      addOrderClient(id, res);

      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 30_000);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        removeOrderClient(id, res);
      });
    });

    app.get('/events/stream', async (request, reply) => {
      const res = reply.raw;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(':ok\n\n');

      addGlobalClient(res);

      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 30_000);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        removeGlobalClient(res);
      });
    });
  };
}
