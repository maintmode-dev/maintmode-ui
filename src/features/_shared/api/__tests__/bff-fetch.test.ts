import { afterEach, describe, expect, it, vi } from "vitest";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { BffError } from "@/features/_shared/api/bff-error";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("bffFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { window?: unknown }).window;
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
    const result = await bffFetch<{ ok: boolean }>("/api/maintenance");
    expect(result.ok).toBe(true);
  });

  it("serializes a plain object body as JSON with content-type header", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchSpy);
    await bffFetch("/api/maintenance/m1/actions/cancel", {
      method: "POST",
      body: { reason: "incident" },
    });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ reason: "incident" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("returns undefined for 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const result = await bffFetch<unknown>("/api/auth/logout", { method: "POST" });
    expect(result).toBeUndefined();
  });

  it("throws BffError with normalized payload on 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Validation failed", code: "VALIDATION_ERROR" }, 400)),
    );
    await expect(bffFetch("/api/maintenance")).rejects.toMatchObject({
      name: "BffError",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("falls back to HTTP code when the response is not a BFF envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    try {
      await bffFetch("/api/maintenance");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BffError);
      expect((error as BffError).code).toBe("HTTP_500");
    }
  });

  it("redirects to /login on 401 when running in the browser", async () => {
    const assign = vi.fn();
    (globalThis as unknown as { window: object }).window = {
      location: {
        pathname: "/maintenance/m1",
        search: "?tab=details",
        assign,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Sign-in is required", code: "AUTH_REQUIRED" }, 401)),
    );

    await expect(bffFetch("/api/maintenance")).rejects.toBeInstanceOf(BffError);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fmaintenance%2Fm1%3Ftab%3Ddetails");
  });

  it("does not redirect on 401 outside the browser (server context)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Sign-in is required", code: "AUTH_REQUIRED" }, 401)),
    );
    await expect(bffFetch("/api/maintenance")).rejects.toBeInstanceOf(BffError);
    // No window means no navigation side-effect; the throw alone bubbles up.
  });
});
