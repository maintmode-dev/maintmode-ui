import { NextResponse } from "next/server";

import { backendRequest } from "@/server/backend/client/backend-client";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * The instance's sign-in methods, for the profile's "Sign-in methods" card
 * (GAP-2, v0.2.0-rc).
 *
 * Proxies the auth backend's public `GET /api/v1/auth/providers` — the same
 * list `/login` renders from — and passes it through as it stands. The card
 * needs the providers a person can link, with the names an operator gave them,
 * and this is the one list that says which are live.
 *
 * NOT `resolveAuthProviders()`: that resolver never throws and folds every
 * failure into `{ ok: false }`, which is right for a public page that must
 * render a fallback, and wrong for a BFF route, where a backend failure has to
 * stay a failure rather than degrade into an empty list the card would read as
 * "nothing to connect".
 *
 * Not under `/api/auth/*`: that prefix is NextAuth's catch-all.
 */
export async function GET() {
  try {
    const data = await backendRequest<unknown>({
      path: "/api/v1/auth/providers",
      method: "GET",
      useAuthBase: true,
      // Public, and identical for every caller — but never served from the data
      // cache, which would hand one instance's list to another.
      cache: "no-store",
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
