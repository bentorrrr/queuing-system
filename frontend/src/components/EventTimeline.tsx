import { useSSE } from '../hooks/useSSE';
import type { SystemEvent } from '../types';

const MAX_EVENTS = 50;

const SERVICE_COLOURS: Record<string, string> = {
  'payment-service': 'bg-blue-100 text-blue-800 border-blue-200',
  'inventory-service': 'bg-green-100 text-green-800 border-green-200',
  'notification-service': 'bg-orange-100 text-orange-800 border-orange-200',
};

const SERVICE_DOT: Record<string, string> = {
  'payment-service': 'bg-blue-500',
  'inventory-service': 'bg-green-500',
  'notification-service': 'bg-orange-500',
};

function serviceColour(service: string): string {
  return SERVICE_COLOURS[service] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

function serviceDot(service: string): string {
  return SERVICE_DOT[service] ?? 'bg-gray-400';
}

export default function EventTimeline() {
  const { events, status, error } = useSSE<SystemEvent>('/events/stream');

  // Cap at MAX_EVENTS (events are already newest-first from useSSE)
  const visible = events.slice(0, MAX_EVENTS);

  return (
    <div className="max-w-2xl mx-auto mt-12 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Event Timeline</h1>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-4">{error.message}</p>
      )}

      {visible.length === 0 && status === 'open' && (
        <p className="text-sm text-gray-400 text-center py-12">
          No events yet — waiting for system activity…
        </p>
      )}

      <ul className="space-y-3">
        {visible.map((ev) => (
          <li
            key={ev.id}
            className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg p-4 shadow-sm"
          >
            {/* Service colour dot */}
            <span
              className={`mt-1 shrink-0 w-2.5 h-2.5 rounded-full ${serviceDot(ev.service)}`}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Event type */}
                <span className="text-sm font-medium text-gray-800">
                  {ev.type}
                </span>
                {/* Service badge */}
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-mono ${serviceColour(ev.service)}`}
                >
                  {ev.service}
                </span>
              </div>

              {/* Data preview */}
              {Object.keys(ev.data).length > 0 && (
                <p className="text-xs text-gray-500 mt-1 truncate font-mono">
                  {JSON.stringify(ev.data)}
                </p>
              )}
            </div>

            {/* Timestamp */}
            <time className="shrink-0 text-xs text-gray-400">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </time>
          </li>
        ))}
      </ul>

      {events.length > MAX_EVENTS && (
        <p className="text-xs text-gray-400 text-center mt-4">
          Showing latest {MAX_EVENTS} of {events.length} events
        </p>
      )}
    </div>
  );
}
