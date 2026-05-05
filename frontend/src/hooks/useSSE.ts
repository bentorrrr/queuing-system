import { useEffect, useRef, useState } from 'react';

type SSEStatus = 'connecting' | 'open' | 'closed';

interface SSEResult<T> {
  events: T[];
  status: SSEStatus;
  error: Error | null;
}

export function useSSE<T>(url: string): SSEResult<T> {
  const [events, setEvents] = useState<T[]>([]);
  const [status, setStatus] = useState<SSEStatus>('connecting');
  const [error, setError] = useState<Error | null>(null);
  // Keep a ref to the latest events array so the event listener closure
  // doesn't capture a stale value after re-renders.
  const eventsRef = useRef<T[]>([]);

  useEffect(() => {
    const source = new EventSource(url);

    source.onopen = () => {
      setStatus('open');
      setError(null);
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        const next = [parsed, ...eventsRef.current];
        eventsRef.current = next;
        setEvents(next);
      } catch {
        // ignore unparseable messages (e.g. heartbeat comments reach here only
        // if the server sends them as data lines, which they shouldn't)
      }
    };

    // Listen to both the default `message` event and the named `status_update`
    // event the backend emits.
    source.onmessage = handleMessage;
    source.addEventListener('status_update', handleMessage);

    source.onerror = () => {
      setStatus('closed');
      setError(new Error('SSE connection error'));
    };

    return () => {
      source.close();
      setStatus('closed');
    };
  }, [url]);

  return { events, status, error };
}
