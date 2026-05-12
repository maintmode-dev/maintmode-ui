import { BffError, type BffErrorPayload } from "@/features/_shared/api/bff-error";

export type BffFetchInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

/**
 * Thin browser-side fetch wrapper for BFF route handlers under `/api/**`.
 *
 * Responsibilities:
 *  - Always targets the same origin; access tokens stay server-side.
 *  - Serializes `init.body` as JSON unless it is already a `BodyInit` value.
 *  - Parses BFF error envelopes into a typed `BffError` so feature code can
 *    branch on `code` / `fieldErrors` without sniffing HTTP.
 *  - When the BFF replies with `401`, performs a hard redirect to
 *    `/login?next=<current path>` so the user re-authenticates. The original
 *    `BffError` is still thrown so React Query reports the failure cleanly.
 */
export async function bffFetch<TResponse>(path: string, init: BffFetchInit = {}): Promise<TResponse> {
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined;

  if (init.body !== undefined && init.body !== null) {
    if (isBodyInit(init.body)) {
      body = init.body;
    } else {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      body = JSON.stringify(init.body);
    }
  }

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: "same-origin",
  });

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const payload = isBffErrorPayload(parsed)
      ? parsed
      : { error: response.statusText || "Request failed", code: `HTTP_${response.status}` };
    const error = new BffError(response.status, payload);
    if (error.isAuthRequired && typeof window !== "undefined") {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
    throw error;
  }

  return (parsed ?? undefined) as TResponse;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isBffErrorPayload(value: unknown): value is BffErrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" && typeof record.code === "string";
}
