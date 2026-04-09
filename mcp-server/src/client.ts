/**
 * Thin REST client for the Dial Smart api-gateway edge function.
 * All MCP tools call into this. Keeping it small means schema/endpoint
 * changes only need to be made in one place.
 *
 * Resilience:
 * - Abort-based timeout on every request (default 30s).
 * - Retries on network errors, 429, 502, 503, 504 with exponential backoff + jitter.
 * - POST/PATCH/DELETE are NOT retried by default (non-idempotent) unless the
 *   caller sets retry: true. GET is always retried.
 * - Errors surface as DialSmartApiError with status, path, message, details.
 */

export interface DialSmartClientOptions {
  baseUrl: string; // e.g. https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway
  apiKey: string;  // dsk_live_...
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

export class DialSmartApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(`[${status}] ${path}: ${message}`);
    this.name = "DialSmartApiError";
  }
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DialSmartClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private maxRetries: number;
  private userAgent: string;

  constructor(opts: DialSmartClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.userAgent = opts.userAgent ?? "dialsmart-mcp/0.2.0";
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: {
      query?: Record<string, unknown>;
      body?: unknown;
      retry?: boolean; // override for non-GET methods
    } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const shouldRetry = options.retry ?? method === "GET";
    const maxAttempts = shouldRetry ? this.maxRetries : 1;

    let lastErr: DialSmartApiError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let resp: Response;
      try {
        resp = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": this.userAgent,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        lastErr = new DialSmartApiError(
          0,
          path,
          err instanceof Error ? err.message : "network error",
        );
        if (attempt < maxAttempts) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw lastErr;
      }
      clearTimeout(timer);

      let payload: any = null;
      const text = await resp.text();
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
      }

      if (resp.ok) {
        // api-gateway wraps responses as { success, data, ... }
        if (payload && typeof payload === "object" && "data" in payload) {
          return payload.data as T;
        }
        return payload as T;
      }

      lastErr = new DialSmartApiError(
        resp.status,
        path,
        payload?.error ?? resp.statusText,
        payload?.details,
      );

      // Don't retry on auth / not found / validation. They won't fix themselves.
      if (!RETRYABLE_STATUSES.has(resp.status)) throw lastErr;
      if (attempt >= maxAttempts) throw lastErr;

      await sleep(this.backoff(attempt));
    }

    // Should be unreachable
    throw lastErr ?? new DialSmartApiError(0, path, "unknown");
  }

  private backoff(attempt: number): number {
    // Exponential with jitter: 500ms, 1.2s, 2.5s, 5s...
    const base = Math.min(500 * Math.pow(2, attempt - 1), 5000);
    const jitter = Math.random() * 300;
    return base + jitter;
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, opts: { retry?: boolean } = {}) {
    return this.request<T>("POST", path, { body, retry: opts.retry });
  }
  patch<T = unknown>(path: string, body?: unknown, opts: { retry?: boolean } = {}) {
    return this.request<T>("PATCH", path, { body, retry: opts.retry });
  }
  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
