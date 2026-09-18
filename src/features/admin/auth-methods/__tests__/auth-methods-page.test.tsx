// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bffFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BffError } from "@/features/_shared/api/bff-fetch";
import type { AuthMethod } from "@/domain/auth/auth-method-settings";

import { AuthMethodsPage } from "../auth-methods-page";

const BOTH_ON: AuthMethod[] = [
  { method: "email_otp", enabled: true, updated_at: "2026-09-18T00:00:00.000Z" },
  { method: "email_password", enabled: true, updated_at: "2026-09-18T00:00:00.000Z" },
];

function renderPage(clientOptions?: { retry?: boolean | number }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: clientOptions?.retry ?? false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<AuthMethodsPage />, { wrapper: Wrapper });
}

/**
 * Raised from RTL's 1000ms default.
 *
 * Every case here waits on a chain — query resolve, mutation, `onError`,
 * `setState`, re-render — and on a slow scheduling tick that overruns one
 * second and fails on a screen that is merely not-yet-updated. Two such
 * timeouts were observed in this suite. A rare red on an admin screen reads as
 * drift and costs someone an investigation, which is the opposite of what a
 * test is for.
 */
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => bffFetchMock.mockReset());
afterEach(() => cleanup());

describe("the list an admin sees", () => {
  it("shows both built-in methods with their state", async () => {
    bffFetchMock.mockResolvedValue({ methods: BOTH_ON });
    renderPage();

    expect((await screen.findByLabelText("Email code sign-in")).getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText("Password sign-in").getAttribute("data-state")).toBe("checked");
  });

  /**
   * AC-5, from the backend's security audit. The caveat is standing helper
   * text, not a tooltip and not dialog-only: an admin must read it before
   * deciding, and a toggle can be flipped without the dialog ever appearing.
   */
  it("states on the email_otp row that reset codes keep being sent", async () => {
    bffFetchMock.mockResolvedValue({ methods: BOTH_ON });
    renderPage();

    expect(await screen.findByText(/password reset still sends one-time codes/i)).toBeTruthy();
  });

  /**
   * AC-6. An empty list is a fault: the migration seeds both rows. Rendering a
   * friendly empty state would tell an admin no sign-in method is configured.
   */
  it("reports an empty list as a fault, not an empty screen", async () => {
    bffFetchMock.mockResolvedValue({ methods: [] });
    renderPage();

    expect(await screen.findByText(/unavailable/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  /**
   * Found in a browser, not here — and this suite is why it hid.
   *
   * Every case builds its own QueryClient with `retry: false`, which is
   * convenient and unrepresentative: the app's provider sets `retry: 1`. Against
   * a backend without the endpoint, React Query parked the query at
   * `fetchStatus: "paused"` rather than retrying, and a paused query reports
   * `isPending` — so the screen sat on a skeleton forever, showing "loading" for
   * a condition that never resolves, on the exact path every operator hits
   * before the backend merges.
   *
   * The hook now sets `retry: false` itself (see its docblock). That is NOT
   * pinned by a case here: jsdom does not reproduce the pause, so a test written
   * against `retry: 1` passes either way and would be evidence of nothing. The
   * guard is the comment on the hook plus this note; the behaviour was verified
   * in the browser against a `main` backend.
   */

  /** AC-7. A method this build does not know is a sign-in path in force. */
  it("renders a method it does not recognise, with a working switch", async () => {
    bffFetchMock.mockResolvedValue({
      methods: [...BOTH_ON, { method: "webauthn", enabled: true, updated_at: "x" }],
    });
    renderPage();

    const unknown = await screen.findByLabelText("webauthn sign-in");
    expect(unknown.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/not recognised by this version/i)).toBeTruthy();
  });
});

describe("while a change is in flight", () => {
  /**
   * The switch must be inert until the PATCH settles.
   *
   * Nothing observed this: `usePendingAuthMethods` returning an empty set, and
   * `disabled={busy}` becoming `disabled={false}`, both left the whole suite
   * green. On this screen that gap means an admin can click twice on the last
   * enabled method while the first request is still travelling — the one place
   * a double submit is least affordable.
   */
  it("disables the row's switch until the request settles, then re-enables it", async () => {
    let settle: (value: unknown) => void = () => {};
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").hasAttribute("disabled")).toBe(true),
    );
    // The other row stays usable: pending is keyed by method, not global.
    expect(screen.getByLabelText("Password sign-in").hasAttribute("disabled")).toBe(false);

    settle({ method: "email_otp", enabled: false, updated_at: "x" });

    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").hasAttribute("disabled")).toBe(false),
    );
  });
});

describe("a refused change", () => {
  /**
   * The 404 copy, which is the one an operator meets BEFORE the backend ships.
   *
   * It must not claim the method was removed: at that point the 404 means the
   * endpoint does not exist, and a row that was never there cannot have
   * vanished. Both causes are named because the screen genuinely cannot tell
   * them apart from one status.
   */
  it("names both causes of a 404 rather than guessing at one", async () => {
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return Promise.reject(new BffError(404, "Not Found", "NOT_FOUND"));
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    const alert = await screen.findByText(/did not recognise it/i);
    expect(alert.textContent).toMatch(/may not support sign-in method settings yet/i);
  });

  /** A lost role reads as a lost role, not as a generic failure. */
  it("says the admin role is gone on a 403", async () => {
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return Promise.reject(new BffError(403, "Admin role required", "FORBIDDEN"));
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    expect(await screen.findByText(/no longer have admin access/i)).toBeTruthy();
  });

  /**
   * A refusal is cleared when ITS OWN row is retried, and only then.
   *
   * With the last-method guard gone, every message this screen produces is a
   * claim about one row. A different method toggling successfully says nothing
   * about "the backend did not recognise it" — see the next case for that half.
   */
  it("clears a row's refusal when that row is retried successfully", async () => {
    let failNext = true;
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      if (failNext) {
        failNext = false;
        return Promise.reject(new BffError(404, "Not Found", "NOT_FOUND"));
      }
      return Promise.resolve({ method: "email_otp", enabled: false, updated_at: "x" });
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    await screen.findByText(/did not recognise it/i);

    fireEvent.click(screen.getByLabelText("Email code sign-in"));

    await waitFor(() => expect(screen.queryByText(/did not recognise it/i)).toBeNull());
  });

  /**
   * The other half of the clearing rule, and the case the two-method test
   * cannot see.
   *
   * Every message this screen can show is a claim about ONE row — "the backend
   * did not recognise it", "you no longer have admin access". An unrelated
   * method toggling successfully does not make either untrue, and clearing them
   * would leave the admin with a switch that snapped back and nothing saying
   * why.
   */
  it("keeps a per-row refusal when a different method succeeds", async () => {
    const THREE = [...BOTH_ON, { method: "webauthn", enabled: true, updated_at: "2026-09-18T00:00:00.000Z" }];
    bffFetchMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: THREE });
      if (path.endsWith("/email_otp")) {
        return Promise.reject(new BffError(403, "Admin role required", "FORBIDDEN"));
      }
      return Promise.resolve({ method: "webauthn", enabled: false, updated_at: "x" });
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    await screen.findByText(/no longer have admin access/i);

    fireEvent.click(screen.getByLabelText("webauthn sign-in"));

    // Wait for the success to have been processed — the PATCH resolving is what
    // triggers the clearing rule under test.
    await waitFor(() =>
      expect(
        bffFetchMock.mock.calls.some(
          ([path, init]) => String(path).endsWith("/webauthn") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );

    // Still true of that row, so still shown. Clearing it would leave a switch
    // that snapped back with nothing saying why.
    expect(screen.getByText(/no longer have admin access/i)).toBeTruthy();
  });

  it("moves the switch optimistically, then puts it back when refused", async () => {
    let settle: (value: unknown) => void = () => {};
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return new Promise((_resolve, reject) => {
        settle = () => reject(new BffError(404, "Not Found", "NOT_FOUND"));
      });
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    // FIRST the optimistic move, or this case is tautological: asserting only
    // the final "checked" passes when the switch never moved at all, which is
    // what a deleted optimistic write or a deleted rollback both look like.
    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").getAttribute("data-state")).toBe("unchecked"),
    );

    settle(undefined);

    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").getAttribute("data-state")).toBe("checked"),
    );
  });
});
