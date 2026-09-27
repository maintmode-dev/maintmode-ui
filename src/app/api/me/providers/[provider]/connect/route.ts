import { NextResponse } from "next/server";

import { parseMaintmodeAuthConfig } from "@/shared/config/auth-config";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

interface ConnectDanceWire {
  link_url?: unknown;
}

/**
 * Starts linking a sign-in provider to the signed-in account (GAP-2).
 *
 * Proxies `POST /api/v1/me/providers/{provider}/connect` in dance mode. The
 * backend links nothing here: it mints a single-use link ticket and answers 200
 * with a RELATIVE `link_url` into its own `/start`. The browser has to follow it
 * as a top-level navigation — the dance cookies are SameSite=Lax — so this
 * route answers `{ url }`, the same path made absolute against
 * `MAINTMODE_AUTH_PUBLIC_BASE_URL`, and the card assigns `window.location`.
 *
 * The absolute URL is built HERE because the public base is server config, and
 * because it is where the one check that matters can sit: `link_url` must be a
 * path on the auth origin. Anything else — absolute, protocol-relative, or not
 * a string — is refused as a bad gateway rather than handed to the browser to
 * navigate to, since it would carry a ticket that attaches a sign-in method to
 * this account.
 *
 * The ticket travels in the query string by the backend's design. It is not
 * logged here, and the `Referrer-Policy: strict-origin` header keeps it out of
 * the `Referer` of anything the next page loads.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { provider } = await params;
    const data = await authenticatedBackendRequest<ConnectDanceWire>({
      path: `/api/v1/me/providers/${encodeURIComponent(provider)}/connect`,
      method: "POST",
      useAuthBase: true,
      headers: { "content-type": "application/json" },
      // Dance mode only. The other mode posts an `id_token`, which this app no
      // longer has since the backend took over the OAuth dance.
      body: JSON.stringify({ mode: "dance" }),
    });

    const linkUrl = data?.link_url;
    if (typeof linkUrl !== "string" || !linkUrl.startsWith("/") || linkUrl.startsWith("//")) {
      return NextResponse.json(
        { error: "The backend did not return a usable link", code: "BAD_GATEWAY" },
        { status: 502 },
      );
    }

    const { authPublicBaseUrl } = parseMaintmodeAuthConfig(process.env);
    return NextResponse.json({ url: `${authPublicBaseUrl}${linkUrl}` });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
