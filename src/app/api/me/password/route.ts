import { NextResponse } from "next/server";

import { changeBackendPassword } from "@/server/auth/backend-token-exchange";
import { readActiveSession } from "@/server/auth/session-token";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

interface ChangePasswordBody {
  /** Omitted when the account has no password yet — the backend rejects it then. */
  current_password?: string;
  new_password?: string;
}

/**
 * POST /api/me/password — proxy to backend `POST /api/v1/me/password`.
 *
 * This route deliberately does NOT use `authenticatedBackendRequest`, and does
 * not let a backend 401 reach `routeErrorResponse`. Both defaults are wrong
 * here in the same direction:
 *
 *  - the wrapper refreshes and RETRIES the mutation on a 401, but this endpoint
 *    takes a `refresh_token` in its body, so the retry would send the token the
 *    refresh just replaced — the backend answers 401 again and the password is
 *    never changed;
 *  - `routeErrorResponse` maps every `BackendUnauthorizedError` to
 *    `AUTH_REQUIRED`, which `bffFetch` answers by navigating to `/login` behind
 *    a never-resolving promise. A wrong current password is a 401, so the most
 *    common mistake on this form would sign the operator out with no message,
 *    indistinguishable from an expired session.
 *
 * So: read the session ONCE, send that exact token, never retry, and answer
 * every failure with a non-401 status the card can render in place.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // Read once. `readActiveSession` rotates the refresh token when the access
  // token is close to expiry, so calling it twice — or letting anything else
  // refresh between the read and the send — puts a superseded token in the body.
  const session = await readActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Sign-in is required", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  // Caught rather than left to propagate: `readJsonBody` throws a
  // `BffValidationError` on malformed JSON, and an uncaught throw out of a route
  // handler is a Next 500 whose body is not the `{error, code}` envelope
  // `bffFetch` parses — the card would print framework noise into the form. The
  // catch is scoped to the parse alone, so the deliberate hand-rolled handling
  // of the backend's own failures below still bypasses the generic mapper.
  let body: ChangePasswordBody | undefined;
  try {
    body = await readJsonBody<ChangePasswordBody>(request);
  } catch (error) {
    return routeErrorResponse(error);
  }

  const newPassword = body?.new_password;
  if (typeof newPassword !== "string" || !newPassword) {
    return NextResponse.json(
      { error: "A new password is required", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const outcome = await changeBackendPassword({
    accessToken: session.accessToken,
    currentPassword: body?.current_password || undefined,
    newPassword,
    // Keeps THIS session alive while the backend revokes the others. Without
    // it the backend revokes every session including the caller's, and the user
    // is signed out by their own success.
    refreshToken: session.refreshToken,
  });

  if (outcome.ok) {
    return new NextResponse(null, { status: 204 });
  }

  switch (outcome.kind) {
    case "wrong-current-password":
      // 422, not 401: the status is what decides whether `bffFetch` navigates
      // away, and this is a field the user can correct in place.
      return NextResponse.json(
        { error: "That current password isn't right", code: "WRONG_CURRENT_PASSWORD" },
        { status: 422 },
      );
    case "session-stale":
      // Also not a 401, for the same mechanical reason — but the meaning is
      // different and so is the copy: nothing the user typed was wrong, and
      // the password was NOT changed.
      return NextResponse.json(
        { error: "Your session expired before the change was saved", code: "SESSION_STALE" },
        { status: 409 },
      );
    case "rejected":
      // The backend's own message, passed through as an opaque string. Never
      // parsed: its three 400s share one code and differ only in prose.
      return NextResponse.json({ error: outcome.message, code: "INVALID_REQUEST" }, { status: 400 });
    default:
      return NextResponse.json(
        { error: "Password change is unavailable right now", code: "BACKEND_UNAVAILABLE" },
        { status: 503 },
      );
  }
}
