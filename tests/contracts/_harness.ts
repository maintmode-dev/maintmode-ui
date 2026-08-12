import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, vi } from "vitest";

/**
 * Shared contract-test harness — RUK-254.
 *
 * Every route contract test repeats the same preamble: read a recorded fixture,
 * stand up a mock for the backend client, reset it between cases, and pull the
 * query string back out of the call the route made. Eleven copies of that drifted
 * in small ways — one file reset the mock differently, another spelled the query
 * extraction slightly otherwise — and a helper that differs per file is a helper
 * nobody can reason about in aggregate.
 *
 * ## What this file deliberately does NOT own
 *
 * The `vi.mock(...)` call itself stays in each test file. `vi.mock` is hoisted to
 * the top of the module that calls it, so it cannot be issued from here on a
 * caller's behalf — and it must run before the route is imported, which is why
 * every file keeps the two-line factory next to its own `await import`. Moving it
 * here would silently leave routes talking to the real backend client.
 */

/** Read a recorded wire fixture. Path is relative to `tests/fixtures/wire/`. */
export function readWireFixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/wire", name), "utf8")) as T;
}

/** The mock standing in for `authenticatedBackendRequest`. */
export type BackendMock<T> = ReturnType<
  typeof vi.fn<(opts: { path: string; method?: string }) => Promise<T>>
>;

/**
 * Create the backend mock and register its per-test reset.
 *
 * `mockReset()` AND `mockClear()` are both required under vitest 4: `mockReset()`
 * alone leaves a queued-but-unconsumed `...Once` implementation in place, which
 * then fires inside whichever test runs next as an uncaught error. This was found
 * once per file and fixed once per file; it lives here now so it can only be got
 * right or wrong in one place.
 *
 * `resolved` seeds the default answer for every test. Pass it for the usual case
 * (the route sees the recorded fixture); omit it where the suite supplies a
 * different body per case, and call `mockResolvedValue` in the test itself.
 */
export function createBackendMock<T>(resolved?: Awaited<T>): BackendMock<T> {
  const backendRequest = vi.fn<(opts: { path: string; method?: string }) => Promise<T>>();

  beforeEach(() => {
    backendRequest.mockReset();
    backendRequest.mockClear();
    if (resolved !== undefined) backendRequest.mockResolvedValue(resolved);
  });

  return backendRequest;
}

/**
 * The query string the route actually sent to the backend, as `URLSearchParams`.
 *
 * Reads the FIRST call: every case that uses this invokes the route once, and
 * pinning the index keeps a route that fired twice from being read as if it had
 * behaved. Use `getAll` on the result for repeatable params — collapsing those to
 * `get` is the forwarding bug these tests exist to catch (SPEC §2.1).
 */
export function backendQuery<T>(backendRequest: BackendMock<T>): URLSearchParams {
  const path = backendRequest.mock.calls[0]?.[0].path ?? "";
  return new URLSearchParams(path.split("?")[1] ?? "");
}
