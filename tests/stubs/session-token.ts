/**
 * Vitest stub for `@/server/auth/session-token`.
 *
 * The real module reads cookies and decodes the NextAuth jwt, which is
 * unavailable inside route-handler unit tests. Route tests usually want a
 * happy-path session; opt out per-test with `vi.mocked(readActiveSession)`.
 */
import { vi } from "vitest";

import type { SessionPayload } from "@/server/auth/session-token";

export const TEST_SESSION_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "operator@example.com",
  displayName: "Test Operator",
  roles: ["editor"],
};

export const TEST_SESSION: SessionPayload = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  user: TEST_SESSION_USER,
};

export const readActiveSession = vi.fn(async (): Promise<SessionPayload | null> => TEST_SESSION);
export const forceSessionRefresh = vi.fn(async (): Promise<SessionPayload | null> => TEST_SESSION);
export const clearActiveSession = vi.fn(async (): Promise<void> => undefined);
