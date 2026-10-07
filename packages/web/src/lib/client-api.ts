import { retryAfterMs } from './retry';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAt = 0,
  ) {
    super(message);
  }
}

// A request paused locally has no endpoint-specific failure to report.
export class CooldownError extends ApiError {
  constructor(status: number, retryAt: number) {
    super('GitHub requests are paused. Please wait before trying again.', status, retryAt);
  }
}

// One in-memory cooldown per app instance, shared by session checks and markets.
// All request triggers (including manual refresh and repository changes) use it.
export function createApiClient(fetcher = fetch) {
  let blocked: ApiError | undefined;
  let failures = 0;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const getRetryAt = () => (blocked && Date.now() < blocked.retryAt ? blocked.retryAt : 0);

  function publish() {
    clearTimeout(timer);
    timer = undefined;
    const remaining = getRetryAt() - Date.now();
    if (listeners.size && remaining > 0)
      timer = setTimeout(publish, Math.min(remaining, 2_147_483_647));
    for (const listener of listeners) listener();
  }

  function backoff(message: string, status: number, minimumDelay = 0) {
    failures++;
    const retryAt =
      Date.now() + Math.max(minimumDelay, Math.min(300_000, 60_000 * 2 ** (failures - 1)));
    blocked = new ApiError(message, status, Math.max(retryAt, blocked?.retryAt ?? 0));
    publish();
    return blocked;
  }

  return {
    getRetryAt,
    subscribe(listener: () => void) {
      listeners.add(listener);
      publish();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) clearTimeout(timer);
      };
    },
    canRequest: () => !blocked || Date.now() >= blocked.retryAt,
    async request<T>(url: string, signal: AbortSignal): Promise<T> {
      if (blocked && Date.now() < blocked.retryAt)
        throw new CooldownError(blocked.status, blocked.retryAt);
      const previousBlock = blocked;
      let response: Response;
      let data: unknown;
      try {
        response = await fetcher(url, { signal, cache: 'no-store' });
      } catch (error) {
        if (signal.aborted) throw error;
        throw backoff('Unable to reach the market. Please try again.', 502);
      }
      try {
        data = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
        if (response.ok)
          throw backoff('Unable to read the market response. Please try again.', 502);
        // Proxy errors may be HTML. Still honor their status and retry headers.
      }
      if (!response.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to load the market.';
        if (response.status === 429 || response.status >= 500)
          throw backoff(
            message,
            response.status,
            retryAfterMs(response.headers.get('retry-after')),
          );
        throw new ApiError(message, response.status);
      }
      // A concurrent successful session check must not erase a newer market limit.
      if (blocked === previousBlock) {
        blocked = undefined;
        failures = 0;
        publish();
      }
      return data as T;
    },
  };
}
