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

import { AuthMethodsPage, wouldLeaveNoneEnabled } from "../auth-methods-page";
import { refusalMessage } from "../refusal-message";

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

describe("the last-method confirmation", () => {
  /** AC-3: the warning comes BEFORE the click reaches the backend. */
  it("asks first when the change would leave nothing enabled", async () => {
    bffFetchMock.mockResolvedValue({
      methods: [
        { method: "email_otp", enabled: true, updated_at: "x" },
        { method: "email_password", enabled: false, updated_at: "x" },
      ],
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    // Nothing travelled: the only call so far is the initial list read.
    expect(bffFetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not ask when another method stays enabled", async () => {
    bffFetchMock.mockResolvedValue({ methods: BOTH_ON });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    await waitFor(() =>
      expect(bffFetchMock).toHaveBeenCalledWith(
        "/api/admin/auth-methods/email_otp",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  /**
   * What happens AFTER the admin confirms — the part the whole last-method flow
   * exists for, and the part nothing asserted.
   *
   * Two mutations passed the entire suite before this: making the confirm
   * button a no-op, and making it send `enabled: true`. The second is an admin
   * clicking "turn off my last way in" and getting it turned ON.
   */
  it("sends the disable once the admin confirms", async () => {
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method)
        return Promise.resolve({
          methods: [
            { method: "email_otp", enabled: true, updated_at: "x" },
            { method: "email_password", enabled: false, updated_at: "x" },
          ],
        });
      return Promise.resolve({ method: "email_otp", enabled: false, updated_at: "x" });
    });
    renderPage();
    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    fireEvent.click(await screen.findByRole("button", { name: /turn it off/i }));

    await waitFor(() =>
      expect(bffFetchMock).toHaveBeenCalledWith(
        "/api/admin/auth-methods/email_otp",
        // The target state must be `false`. A confirm that sent `true` would
        // enable the method the admin just asked to close.
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: false }) }),
      ),
    );
  });

  it("sends nothing when the admin cancels", async () => {
    bffFetchMock.mockResolvedValue({
      methods: [
        { method: "email_otp", enabled: true, updated_at: "x" },
        { method: "email_password", enabled: false, updated_at: "x" },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    // Still only the initial list read.
    expect(bffFetchMock).toHaveBeenCalledTimes(1);
  });

  it("hedges rather than promising an outcome it cannot know", async () => {
    bffFetchMock.mockResolvedValue({
      methods: [
        { method: "email_otp", enabled: true, updated_at: "x" },
        { method: "email_password", enabled: false, updated_at: "x" },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    const dialog = await screen.findByRole("alertdialog");
    // "may", never "will": healthy SSO providers also satisfy the backend's
    // guard and are invisible to this screen.
    expect(dialog.textContent).toMatch(/may leave no way to sign in/i);
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
  const REFUSAL =
    "at least one sign-in method must remain enabled " +
    "(no break-glass credential is configured, so this would be unrecoverable)";

  it("shows the backend's own explanation and keeps it on screen", async () => {
    // Keyed on the METHOD, not the path: the list read and the toggle share a
    // prefix, so matching on path alone would reject the initial load too.
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return Promise.reject(new BffError(409, REFUSAL, "last_auth_method"));
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    // The break-glass clause is the sentence that tells an admin whether this
    // is recoverable, so it must survive to the screen verbatim.
    expect(await screen.findByText(new RegExp("break-glass", "i"))).toBeTruthy();
  });

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
   * A refusal describes the SCREEN ("this would leave no way to sign in"), not
   * one row. Once any toggle succeeds that claim is stale, and an alert still
   * asserting it contradicts the switches next to it.
   */
  it("clears a stale refusal once another toggle succeeds", async () => {
    let failNext = true;
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      if (failNext) {
        failNext = false;
        return Promise.reject(new BffError(409, REFUSAL, "last_auth_method"));
      }
      return Promise.resolve({ method: "email_password", enabled: false, updated_at: "x" });
    });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    await screen.findByText(new RegExp("break-glass", "i"));

    fireEvent.click(screen.getByLabelText("Password sign-in"));

    await waitFor(() => expect(screen.queryByText(new RegExp("break-glass", "i"))).toBeNull());
  });

  /**
   * The other half of the clearing rule, and the case the two-method test
   * cannot see.
   *
   * A 409 is a claim about the INSTANCE ("one method must remain enabled"), so
   * any success makes it stale. A 403 or 404 is a claim about ONE row, and an
   * unrelated method toggling successfully does not make it untrue. Clearing
   * those would leave the admin with a switch that snapped back and nothing
   * saying why.
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
        settle = () => reject(new BffError(409, REFUSAL, "last_auth_method"));
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

/**
 * The message whitelist, unit-tested away from React because the interesting
 * inputs are strings, not interactions.
 */
describe("which refusal text is worth showing", () => {
  it("shows a real message from the backend", () => {
    expect(refusalMessage("at least one sign-in method must remain enabled (…)")).toContain(
      "must remain enabled",
    );
  });

  it("replaces the BFF's unrelated 409 default", () => {
    // `defaultMessageForStatus(409)` is wording from the maintenance domain.
    expect(refusalMessage("Maintenance state conflict")).toBe(
      "The backend refused: this would leave no way to sign in.",
    );
  });

  it("replaces the message bffFetch synthesises when no body arrived", () => {
    expect(refusalMessage("BFF 409 Conflict")).toBe(
      "The backend refused: this would leave no way to sign in.",
    );
  });

  it("replaces an empty or whitespace message", () => {
    expect(refusalMessage("")).toContain("no way to sign in");
    expect(refusalMessage("   ")).toContain("no way to sign in");
    expect(refusalMessage(undefined)).toContain("no way to sign in");
  });
});

describe("the dialog trigger rule", () => {
  it("fires when the row being turned off is the only one on", () => {
    expect(
      wouldLeaveNoneEnabled(
        [
          { method: "email_otp", enabled: true, updated_at: "x" },
          { method: "email_password", enabled: false, updated_at: "x" },
        ],
        "email_otp",
      ),
    ).toBe(true);
  });

  it("does not fire while another method stays on", () => {
    expect(wouldLeaveNoneEnabled(BOTH_ON, "email_otp")).toBe(false);
  });

  /**
   * An unknown method counts. Written over the closed set the count would
   * exclude it — the natural implementation, and the one that would wave
   * through a change leaving only a method the build cannot name.
   */
  it("counts a method this build does not recognise", () => {
    expect(
      wouldLeaveNoneEnabled(
        [
          { method: "email_otp", enabled: true, updated_at: "x" },
          { method: "webauthn", enabled: true, updated_at: "x" },
        ],
        "email_otp",
      ),
    ).toBe(false);
  });
});
