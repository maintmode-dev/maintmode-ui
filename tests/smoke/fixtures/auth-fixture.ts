import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

/**
 * Injects a valid NextAuth session cookie into the given browser context so
 * Playwright specs can land directly on authenticated routes (e.g. `/`,
 * `/maintenance/:id`) without going through the real Google OAuth flow.
 *
 * The cookie is encoded with the same `MAINTMODE_AUTH_SECRET` that the dev
 * server uses, so the NextAuth middleware accepts it. The encoded JWT
 * mirrors the production shape produced by `src/server/auth/auth-config.ts`
 * `jwt` callback: `accessToken`, `refreshToken`, `accessTokenExpiresAt`,
 * `user`.
 *
 * Networks bound for the real backend are intercepted by
 * `installMaintenanceBackendMocks`, so the access/refresh tokens are never
 * actually used.
 */

export type FixtureSessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export const FIXTURE_OPERATOR: FixtureSessionUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "operator@example.com",
  displayName: "Test Operator",
  roles: ["editor"],
};

export const FIXTURE_ADMIN: FixtureSessionUser = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "admin@example.com",
  displayName: "Test Admin",
  roles: ["admin", "editor"],
};

const COOKIE_NAME = "authjs.session-token";
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function signIn(
  context: BrowserContext,
  baseURL: string,
  user: FixtureSessionUser = FIXTURE_OPERATOR,
): Promise<void> {
  const secret = process.env.MAINTMODE_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "MAINTMODE_AUTH_SECRET must be set when running Playwright authenticated specs",
    );
  }

  const now = Date.now();
  const token = {
    accessToken: "fixture-access-token",
    refreshToken: "fixture-refresh-token",
    accessTokenExpiresAt: now + ONE_HOUR_MS,
    user,
  };

  const encoded = await encode({
    token: token as unknown as Record<string, unknown>,
    secret,
    salt: COOKIE_NAME,
    maxAge: THIRTY_DAYS_SECONDS,
  });

  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: encoded,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      // Never `secure` in tests — the dev server runs on http://localhost.
      secure: false,
      expires: Math.floor((now + THIRTY_DAYS_SECONDS * 1000) / 1000),
    },
  ]);
}
