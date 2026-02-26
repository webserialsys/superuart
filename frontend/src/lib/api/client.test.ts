import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "@/lib/api/client";

describe("apiRequest", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends json body and authorization header", async () => {
    const jsonMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jsonMock,
    } as unknown as Response);

    const result = await apiRequest<{ ok: boolean }>("/api/test", {
      method: "POST",
      body: { name: "uart" },
      token: "abc123",
    });

    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/api\/test$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(JSON.stringify({ name: "uart" }));

    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("returns undefined for 204 responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
    } as unknown as Response);

    const result = await apiRequest<void>("/api/empty");
    expect(result).toBeUndefined();
  });

  it("throws ApiError with server detail json", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: vi.fn().mockResolvedValue({ detail: "Validation failed" }),
    } as unknown as Response);

    await expect(apiRequest("/api/fail")).rejects.toEqual(new ApiError(400, "Validation failed"));
  });

  it("falls back to statusText when error body is not json", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: vi.fn().mockRejectedValue(new Error("parse failed")),
    } as unknown as Response);

    await expect(apiRequest("/api/fail")).rejects.toEqual(new ApiError(500, "Server Error"));
  });

  it("passes through non-json body without content-type", async () => {
    const formData = new FormData();
    formData.append("file", "x");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ uploaded: true }),
    } as unknown as Response);

    await apiRequest("/api/upload", { method: "POST", body: formData });

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBe(formData);
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBeNull();
  });
});
