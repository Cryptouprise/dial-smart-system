import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialSmartApiError, DialSmartClient } from "../src/client.js";

/**
 * Unit tests for the DialSmartClient.
 *
 * We intercept global fetch so nothing touches the network. These tests
 * guard the reliability guarantees the MCP server depends on:
 *  - response unwrapping ({ success, data } -> data)
 *  - error mapping with status + path
 *  - GET retries on transient failures
 *  - POST not retried by default
 *  - explicit retry opt-in for POST
 *  - abort-based timeout
 */

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DialSmartClient", () => {
  const baseUrl = "https://example.test/functions/v1/api-gateway";
  let fetchMock: FetchMock;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("unwraps { success, data } responses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { hello: "world" } }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 1 });
    const result = await c.get<{ hello: string }>("/v1/me");
    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns payload as-is when there is no data wrapper", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, version: "0.2.0" }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 1 });
    const result = await c.get<{ ok: boolean }>("/v1/health");
    expect(result).toEqual({ ok: true, version: "0.2.0" });
  });

  it("throws DialSmartApiError with status + path on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { success: false, error: "Lead X not found" }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 1 });
    await expect(c.get("/v1/leads/00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      name: "DialSmartApiError",
      status: 404,
      path: "/v1/leads/00000000-0000-0000-0000-000000000000",
    });
  });

  it("retries GET on 503 and succeeds on second attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { success: false, error: "service unavailable" }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { retried: true } }));

    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 3 });
    const result = await c.get<{ retried: boolean }>("/v1/system/stats");
    expect(result).toEqual({ retried: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { success: false, error: "invalid key" }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 5 });
    await expect(c.get("/v1/me")).rejects.toBeInstanceOf(DialSmartApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry POST by default", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { success: false, error: "transient" }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 3 });
    await expect(c.post("/v1/calls", { lead_id: "abc" })).rejects.toBeInstanceOf(
      DialSmartApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries POST when the caller opts in", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { success: false, error: "transient" }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { queued: true } }));

    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 3 });
    const result = await c.post<{ queued: boolean }>("/v1/calls", { lead_id: "abc" }, { retry: true });
    expect(result).toEqual({ queued: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes the API key and user agent on every request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: {} }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_abcdef", maxRetries: 1 });
    await c.get("/v1/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dsk_live_abcdef");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/dialsmart-mcp/);
  });

  it("builds query strings from the query object", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { leads: [] } }),
    );
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 1 });
    await c.get("/v1/leads", { status: "new", limit: 25, skipped: undefined });

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("status=new");
    expect(calledUrl).toContain("limit=25");
    expect(calledUrl).not.toContain("skipped");
  });

  it("surfaces network errors as DialSmartApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const c = new DialSmartClient({ baseUrl, apiKey: "dsk_live_test", maxRetries: 1 });
    await expect(c.get("/v1/me")).rejects.toMatchObject({
      name: "DialSmartApiError",
      status: 0,
    });
  });
});
