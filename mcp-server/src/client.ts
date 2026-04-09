/**
 * Thin REST client for the Dial Smart api-gateway edge function.
 * All MCP tools call into this. Keeping it small means schema/endpoint
 * changes only need to be made in one place.
 */

export interface DialSmartClientOptions {
  baseUrl: string; // e.g. https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway
  apiKey: string;  // dsk_live_...
  timeoutMs?: number;
}

export class DialSmartApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
    public details?: unknown,
  ) {
    super(`[${status}] ${path}: ${message}`);
    this.name = "DialSmartApiError";
  }
}

export class DialSmartClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(opts: DialSmartClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "dialsmart-mcp/0.1.0",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new DialSmartApiError(
        0,
        path,
        err instanceof Error ? err.message : "network error",
      );
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

    if (!resp.ok) {
      throw new DialSmartApiError(
        resp.status,
        path,
        payload?.error ?? resp.statusText,
        payload?.details,
      );
    }

    // api-gateway wraps responses as { success, data, ... }
    if (payload && typeof payload === "object" && "data" in payload) {
      return payload.data as T;
    }
    return payload as T;
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, { body });
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, { body });
  }
  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
