/**
 * Vitest stub for `@/server/auth/auth-config`.
 *
 * The real module wires up NextAuth at module evaluation time and pulls
 * environment-dependent secrets/cookies. Route-handler tests only need the
 * exported helpers to be callable; behavior is mocked per-test where it
 * matters.
 */
import { vi } from "vitest";

export const auth = vi.fn(async () => null);
export const signIn = vi.fn(async () => undefined);
export const signOut = vi.fn(async () => undefined);
export const handlers = {
  GET: vi.fn(),
  POST: vi.fn(),
};
export const config = {} as Record<string, unknown>;
