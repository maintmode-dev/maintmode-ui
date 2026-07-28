import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { clearActiveSession } from "@/server/auth/session-token";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

interface UpdateMeBody {
  /** IANA identifier (e.g. "Asia/Nicosia"); null/empty resets to autodetect. */
  timezone?: string | null;
  /** Telegram handle, stored verbatim (leading `@` kept); null/empty clears. */
  telegram_tag?: string | null;
  /** Slack handle, stored verbatim (leading `@` kept); null/empty clears. */
  slack_tag?: string | null;
}

/**
 * GET /api/me — proxy to backend `GET /api/v1/me`. Returns the current
 * authenticated user with roles + connected_providers. AppShell and
 * UserSettingsPage consume this.
 *
 * A backend **404** here means the access token is valid JWT-wise but the
 * user no longer exists (deleted account / stale session) — the browser cookie
 * outlives the backend record. We treat that as an auth failure: clear this
 * browser's NextAuth + active-session cookies and return the same
 * `401 AUTH_REQUIRED` envelope a 401 would, so `bffFetch` redirects to /login
 * and the dead session can't linger or loop.
 */
export async function GET() {
  try {
    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/me",
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 404) {
      await signOut({ redirect: false });
      await clearActiveSession();
      return NextResponse.json(
        {
          error: "Sign-in is required",
          code: "AUTH_REQUIRED",
          hint: "The account for this session no longer exists. Re-authenticate via /login.",
        },
        { status: 401 },
      );
    }
    return routeErrorResponse(error);
  }
}

/**
 * PATCH /api/me — proxy to backend `PATCH /api/v1/me`, updating the caller's
 * own preferences: `timezone` (RUK-201) plus `telegram_tag` / `slack_tag`
 * (RUK-217). Body: `{ timezone?, telegram_tag?, slack_tag? }`.
 *
 * This is a **true patch**: an absent key leaves the stored value untouched,
 * while `null`/empty/whitespace clears it. Only keys actually present in the
 * incoming body are forwarded — sending a key the caller never touched would
 * overwrite the other fields. Tag values are forwarded verbatim (a leading `@`
 * is part of the handle and is never stripped); `timezone` is an IANA id.
 *
 * The backend validates both the identifier and the tags and returns 400 for an
 * invalid one — note it uses the same `invalid request` code for either, so the
 * offending field can't be told apart from the envelope. That envelope passes
 * straight through `routeErrorResponse`. Returns the updated user so the client
 * can refresh its `/me` cache from the response.
 */
export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const parsed = await readJsonBody<UpdateMeBody>(request);

    // Normalize the "reset to autodetect" signal to a single canonical `null`:
    // a present-but-empty/whitespace `timezone` (or an explicit null) all mean
    // "reset", so collapse them rather than forwarding an ambiguous `""`. A
    // non-empty value passes through for the backend to validate. Omitting the
    // field entirely sends `{}` (no change).
    // The three fields are handled by three explicit blocks on purpose. Do NOT
    // fold them into a loop or a spread of `parsed`: a spread forwards keys the
    // caller never touched, and on this true-patch endpoint that silently wipes
    // the other fields (SPEC §7 — changing a timezone would clear both tags).
    const body: UpdateMeBody = {};
    if ("timezone" in parsed) {
      const tz = parsed.timezone;
      body.timezone = typeof tz === "string" && tz.trim() ? tz : null;
    }
    if ("telegram_tag" in parsed) {
      const v = parsed.telegram_tag;
      body.telegram_tag = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    if ("slack_tag" in parsed) {
      const v = parsed.slack_tag;
      body.slack_tag = typeof v === "string" && v.trim() ? v.trim() : null;
    }

    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/me",
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
