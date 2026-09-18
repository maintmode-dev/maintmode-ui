// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<AuthMethodsPage />, { wrapper: Wrapper });
}

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

  it("puts the switch back where it was", async () => {
    // Keyed on the METHOD, not the path: the list read and the toggle share a
    // prefix, so matching on path alone would reject the initial load too.
    bffFetchMock.mockImplementation((_path: string, init?: { method?: string }) => {
      if (!init?.method) return Promise.resolve({ methods: BOTH_ON });
      return Promise.reject(new BffError(409, REFUSAL, "last_auth_method"));
    });
    renderPage();

    const toggle = await screen.findByLabelText("Email code sign-in");
    fireEvent.click(toggle);

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
