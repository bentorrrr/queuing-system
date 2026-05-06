import { useParams } from 'react-router-dom';
import { useSSE } from '../hooks/useSSE';
import type { OrderStatus, OrderStatusValue } from '../types';

const STEPS: OrderStatusValue[] = ['PENDING', 'RESERVED', 'PAID', 'SHIPPED'];

function stepLabel(step: OrderStatusValue): string {
  return step.charAt(0) + step.slice(1).toLowerCase();
}

export default function OrderTracker() {
  const { id } = useParams<{ id: string }>();
  const { events, status, error } = useSSE<OrderStatus>(
    `/orders/${id}/stream`,
  );

  // Derive current state from the event stream (latest event wins per status).
  const latest = events[0] ?? null;
  const isFailed = latest?.status === 'FAILED';

  // Build a map of step → timestamp for completed steps
  const stepTimestamps = new Map<OrderStatusValue, string>();
  for (const ev of [...events].reverse()) {
    if (STEPS.includes(ev.status)) {
      stepTimestamps.set(ev.status, ev.timestamp);
    }
  }

  // Determine progress: index of the latest completed step
  const currentStepIndex = latest
    ? STEPS.indexOf(latest.status as OrderStatusValue)
    : -1;

  return (
    <div className="max-w-2xl mx-auto mt-12 p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-1">
        Order Tracker
      </h1>
      <p className="text-sm text-gray-500 mb-8 font-mono">{id}</p>

      {/* Connection status badge */}
      <div className="flex items-center gap-2 mb-8">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === 'open'
              ? 'bg-green-500'
              : status === 'connecting'
                ? 'bg-yellow-400'
                : 'bg-gray-400'
          }`}
        />
        <span className="text-xs text-gray-500 capitalize">{status}</span>
        {error && (
          <span className="text-xs text-red-500 ml-2">{error.message}</span>
        )}
      </div>

      {/* Step progress bar */}
      <div className="flex items-start gap-0">
        {STEPS.map((step, idx) => {
          const done = !isFailed && idx <= currentStepIndex;
          const failed = isFailed && idx === currentStepIndex;
          const ts = stepTimestamps.get(step);

          return (
            <div key={step} className="flex-1 flex flex-col items-center">
              {/* Connector line + circle */}
              <div className="flex items-center w-full">
                {/* Left connector */}
                <div
                  className={`h-0.5 flex-1 ${idx === 0 ? 'invisible' : done ? 'bg-green-500' : 'bg-gray-200'}`}
                />
                {/* Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${
                    failed
                      ? 'bg-red-100 border-red-500 text-red-600'
                      : done
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  {failed ? '✕' : done ? '✓' : idx + 1}
                </div>
                {/* Right connector */}
                <div
                  className={`h-0.5 flex-1 ${idx === STEPS.length - 1 ? 'invisible' : done && idx < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'}`}
                />
              </div>

              {/* Label */}
              <p
                className={`mt-2 text-xs font-medium ${
                  failed
                    ? 'text-red-600'
                    : done
                      ? 'text-green-700'
                      : 'text-gray-400'
                }`}
              >
                {stepLabel(step)}
              </p>

              {/* Timestamp */}
              {ts && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(ts).toLocaleTimeString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* FAILED message */}
      {isFailed && latest && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Order failed</strong> — reported by{' '}
          <span className="font-mono">{latest.service}</span> at{' '}
          {new Date(latest.timestamp).toLocaleString()}
        </div>
      )}

      {/* No events yet */}
      {events.length === 0 && status === 'open' && (
        <p className="mt-8 text-sm text-gray-400 text-center">
          Waiting for order updates…
        </p>
      )}
    </div>
  );
}
