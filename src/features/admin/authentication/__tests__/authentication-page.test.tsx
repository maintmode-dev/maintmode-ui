// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bffFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { Integration } from "@/domain/admin/integration";
import type { AuthMethod } from "@/domain/auth/auth-method-settings";
import { BffError } from "@/features/_shared/api/bff-fetch";

import { AuthenticationPage } from "../authentication-page";

/** See the same note in the old auth-methods suite: every case waits on a chain. */
configure({ asyncUtilTimeout: 5000 });

const AT = "2026-09-18T00:00:00.000Z";

const BOTH_ON: AuthMethod[] = [
  { method: "email_otp", enabled: true, updated_at: AT },
  { method: "email_password", enabled: true, updated_at: AT },
];
const BOTH_OFF: AuthMethod[] = BOTH_ON.map((m) => ({ ...m, enabled: false }));
const PASSWORD_ONLY: AuthMethod[] = [
  { method: "email_otp", enabled: false, updated_at: AT },
  { method: "email_password", enabled: true, updated_at: AT },
];

function integration(over: Partial<Integration> & Pick<Integration, "kind" | "name">): Integration {
  return {
    id: `i-${over.kind}-${over.name}`,
    enabled: true,
    config: {},
    secrets_set: {},
    provisioned: false,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T14:21:00Z",
    ...over,
  };
}

const EMAIL_ON = integration({ kind: "notify", name: "email", secrets_set: { password: true } });
const GOOGLE_OK = integration({
  kind: "login",
  name: "google",
  health: "ok",
  config: { issuer_url: "https://accounts.google.com" },
  secrets_set: { client_secret: true },
});

type Wire = {
  methods?: AuthMethod[] | Error;
  integrations?: Integration[] | Error;
  signIn?: unknown[] | Error;
  /** `/api/me` — only `connected_providers` matters to this page. */
  me?: { connected_providers: string[] } | Error;
};

/**
 * Routes each BFF path to its answer. A write is answered by `onWrite`, and
 * every GET reads the CURRENT `wire`, so a case can change what the backend
 * says after a write and watch the page follow.
 */
function serve(wire: Wire, onWrite?: (path: string, init: { method: string; body?: string }) => unknown) {
  bffFetchMock.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (init?.method) {
      return Promise.resolve(onWrite ? onWrite(path, init as { method: string; body?: string }) : {});
    }
    const answer = (value: unknown, wrap: (v: unknown) => unknown) =>
      value instanceof Error ? Promise.reject(value) : Promise.resolve(wrap(value));
    switch (path) {
      case "/api/admin/auth-methods":
        return answer(wire.methods ?? BOTH_ON, (v) => ({ methods: v }));
      case "/api/admin/integrations":
        return answer(wire.integrations ?? [], (v) => ({ integrations: v }));
      case "/api/sign-in-methods":
        return answer(wire.signIn ?? [], (v) => ({ methods: v }));
      case "/api/me":
        return answer(wire.me ?? { connected_providers: [] }, (v) => v);
      default:
        return Promise.reject(new Error(`unexpected path ${path}`));
    }
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Object.assign(render(<AuthenticationPage />, { wrapper: Wrapper }), { client });
}

function callsTo(path: string): number {
  return bffFetchMock.mock.calls.filter(([p, init]) => p === path && !init?.method).length;
}

/** The provider row whose label matches, as a container to assert within. */
function rowFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest("div.flex.items-center");
  if (!row) throw new Error(`no row rendered for ${label}`);
  return row as HTMLElement;
}

/**
 * Settles `/login`'s list: waits for its request and lets the answer land. The
 * lockout cases assert an ABSENCE, which would hold vacuously before that list
 * arrived.
 */
async function signInListSettled(): Promise<void> {
  await waitFor(() => expect(callsTo("/api/sign-in-methods")).toBeGreaterThan(0));
  await act(async () => {});
}

// Braced: a function returned from `beforeEach` is run as a cleanup hook, and
// `mockReset()` returns the mock itself.
beforeEach(() => {
  bffFetchMock.mockReset();
});
afterEach(() => cleanup());

describe("AuthenticationPage — one page for every way in", () => {
  it("lays out the built-in methods and the providers, with anchors", async () => {
    serve({ integrations: [GOOGLE_OK] });
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Authentication" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Built-in methods" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign-in providers (SSO)" })).toBeTruthy();
    // Deep links from Integrations and docs land on these.
    expect(document.getElementById("methods")).not.toBeNull();
    expect(document.getElementById("providers")).not.toBeNull();

    expect(await screen.findByLabelText("Password sign-in")).toBeTruthy();
    expect(await screen.findByText("Google")).toBeTruthy();
  });

  it("draws providers only — never a transport", async () => {
    serve({ integrations: [EMAIL_ON, GOOGLE_OK] });
    renderPage();
    await screen.findByText("Google");

    expect(screen.queryByText("Slack")).toBeNull();
    expect(screen.queryByText("Telegram")).toBeNull();
    // Every registry name for sign-in is offered, set up or not.
    expect(within(rowFor("Custom OIDC")).getByText("Set up")).toBeTruthy();
    expect(within(rowFor("GitHub")).getByText("Set up")).toBeTruthy();
    expect(within(rowFor("Google")).getByText("Configure")).toBeTruthy();
  });
});

/**
 * UX-4, closed for real. The old screen could see only the built-in half and
 * so said "may". This page sees both, so it states the case — and the rule
 * behind it is pinned combination by combination in `sign-in-reachability`.
 * These cases check that the page wires the right data into it.
 */
describe("the lockout warning", () => {
  const LOCKOUT = /nobody can sign in except through break-glass/i;

  it("states it when every method is off and no provider works", async () => {
    serve({
      methods: BOTH_OFF,
      integrations: [
        EMAIL_ON,
        { ...GOOGLE_OK, health: "unresolved" },
        integration({ kind: "login", name: "github", enabled: false, health: "disabled" }),
      ],
    });
    renderPage();

    const notice = await screen.findByText(LOCKOUT);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).not.toMatch(/\bmay\b/);
    // A warning, never a block.
    expect(screen.getByLabelText("Password sign-in").hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText("Email code sign-in").hasAttribute("disabled")).toBe(false);
  });

  it("stays quiet when every method is off but /login offers a provider", async () => {
    serve({
      methods: BOTH_OFF,
      integrations: [GOOGLE_OK],
      signIn: [{ id: "google", type: "redirect", display_name: "Google" }],
    });
    renderPage();

    await signInListSettled();
    await screen.findByLabelText("Password sign-in");
    expect(screen.queryByText(LOCKOUT)).toBeNull();
  });

  /**
   * Rows the registry holds but `/login` never offers — test leftovers such as
   * `z-provider-…` / `unlinked-…` on a real local stack, or a provider this
   * build has no descriptor for. Enabled and "ok" as they claim to be, nobody
   * can sign in through them, so they must not silence the warning.
   */
  it("states it when the only enabled, healthy login rows are ones /login does not offer", async () => {
    const hidden = [
      integration({ kind: "login", name: "z-provider-01a0ef64-c37c-793b-901a-85065c713fea", health: "ok" }),
      integration({ kind: "login", name: "unlinked-01a0ef64-90de-71e0-8e9e-95bd4043e80d", health: "ok" }),
      integration({ kind: "login", name: "gitlab", health: "ok" }),
    ];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ methods: BOTH_OFF, integrations: hidden, signIn: [] });
      renderPage();

      expect(await screen.findByText(LOCKOUT)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  /** The same rows, with `/login`'s list unavailable: the registry fallback must not count them either. */
  it("still states it from the registry when /login's list cannot be read", async () => {
    const hidden = [
      integration({ kind: "login", name: "z-provider-01a0ef64-c37c-793b-901a-85065c713fea", health: "ok" }),
      integration({ kind: "login", name: "gitlab", health: "ok" }),
    ];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ methods: BOTH_OFF, integrations: hidden, signIn: new BffError(503, "down") });
      renderPage();

      expect(await screen.findByText(LOCKOUT)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to a working registry provider when /login's list cannot be read", async () => {
    serve({ methods: BOTH_OFF, integrations: [GOOGLE_OK], signIn: new BffError(503, "down") });
    renderPage();

    await screen.findByText("Google");
    await signInListSettled();
    expect(screen.queryByText(LOCKOUT)).toBeNull();
  });

  /**
   * The provider half comes from `/login`'s list, so switching off the last
   * provider must refetch it for the warning to appear. The toggle hook marks
   * that list stale (pinned in its own suite); this checks the page end to end.
   */
  it("appears once the last working provider is switched off", async () => {
    const wire: Wire = {
      methods: BOTH_OFF,
      integrations: [GOOGLE_OK],
      signIn: [{ id: "google", type: "redirect", display_name: "Google" }],
    };
    serve(wire, (path) => {
      expect(path).toBe("/api/admin/integrations/login/google/toggle");
      wire.integrations = [{ ...GOOGLE_OK, enabled: false, health: "disabled" }];
      wire.signIn = [];
      return wire.integrations[0];
    });
    renderPage();
    await screen.findByText("Google");
    await signInListSettled();
    expect(screen.queryByText(LOCKOUT)).toBeNull();

    fireEvent.click(within(rowFor("Google")).getByRole("switch"));

    expect(await screen.findByText(LOCKOUT)).toBeTruthy();
  });

  it("stays quiet while a built-in method is on, providers or not", async () => {
    serve({ methods: PASSWORD_ONLY, integrations: [] });
    renderPage();

    await screen.findByText("Google");
    expect(screen.queryByText(LOCKOUT)).toBeNull();
  });

  it("says what it cannot see when neither provider source loads", async () => {
    serve({
      methods: BOTH_OFF,
      integrations: new BffError(503, "down"),
      signIn: new BffError(503, "down"),
    });
    renderPage();

    expect(await screen.findByText(/couldn't load sign-in providers/i)).toBeTruthy();
    expect(screen.getByText(/can't confirm that anyone can still sign in/i)).toBeTruthy();
    expect(screen.queryByText(LOCKOUT)).toBeNull();
  });

  it("appears as soon as the last way in is switched off", async () => {
    const wire: Wire = { methods: PASSWORD_ONLY, integrations: [] };
    serve(wire, () => {
      wire.methods = BOTH_OFF;
      return BOTH_OFF[1];
    });
    renderPage();

    await screen.findByText("Google");
    expect(screen.queryByText(LOCKOUT)).toBeNull();
    fireEvent.click(await screen.findByLabelText("Password sign-in"));
    // This admin has no provider linked, so the switch asks first.
    fireEvent.click(await screen.findByRole("button", { name: "Turn it off" }));

    expect(await screen.findByText(LOCKOUT)).toBeTruthy();
    expect(screen.getByText(LOCKOUT).textContent).toContain("/login/recovery");
  });
});

/**
 * An admin switched off every built-in method with no provider linked and lost
 * their own way in. Switching off the last one now asks first — only when it
 * would leave THIS admin without a way in — and the page tells admins where
 * break-glass signs in.
 */
describe("the self-lockout confirmation", () => {
  const TITLE = /lose your own sign-in/i;
  const writes = () => bffFetchMock.mock.calls.filter(([, init]) => init?.method).length;

  it("asks before the last built-in method goes, and keeps it on when told to", async () => {
    serve({ methods: PASSWORD_ONLY, integrations: [GOOGLE_OK], me: { connected_providers: [] } });
    renderPage();

    fireEvent.click(await screen.findByLabelText("Password sign-in"));

    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.getByRole("alertdialog").textContent).toContain("/login/recovery");
    fireEvent.click(screen.getByRole("button", { name: "Keep it on" }));

    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(writes()).toBe(0);
  });

  it("switches it off once confirmed", async () => {
    serve({ methods: PASSWORD_ONLY, integrations: [], me: { connected_providers: [] } }, () => BOTH_OFF[1]);
    renderPage();

    fireEvent.click(await screen.findByLabelText("Password sign-in"));
    fireEvent.click(await screen.findByRole("button", { name: "Turn it off" }));

    await waitFor(() => expect(writes()).toBe(1));
  });

  it("does not ask when the admin is linked to a provider the sign-in page offers", async () => {
    serve(
      {
        methods: PASSWORD_ONLY,
        integrations: [GOOGLE_OK],
        signIn: [{ id: "google", type: "redirect", display_name: "Google" }],
        me: { connected_providers: ["google"] },
      },
      () => BOTH_OFF[1],
    );
    renderPage();
    await signInListSettled();
    await waitFor(() => expect(callsTo("/api/me")).toBeGreaterThan(0));
    await act(async () => {});

    fireEvent.click(await screen.findByLabelText("Password sign-in"));

    await waitFor(() => expect(writes()).toBe(1));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("does not ask while another built-in method stays on", async () => {
    serve({ methods: BOTH_ON, integrations: [] }, () => ({ ...BOTH_ON[1], enabled: false }));
    renderPage();

    fireEvent.click(await screen.findByLabelText("Password sign-in"));

    await waitFor(() => expect(writes()).toBe(1));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("shows admins where break-glass signs in", async () => {
    serve({});
    renderPage();

    const link = await screen.findByRole("link", { name: "/login/recovery" });
    expect(link.getAttribute("href")).toBe("/login/recovery");
  });
});

describe("the Email code hint", () => {
  const HINT = /email transport is/i;

  it("says the transport is missing, with a real link to it", async () => {
    serve({ methods: BOTH_ON, integrations: [GOOGLE_OK] });
    renderPage();

    expect(await screen.findByText(/email transport is not set up/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /set it up in integrations/i });
    expect(link.getAttribute("href")).toBe("/admin/integrations#transports");
  });

  it("says the transport is turned off", async () => {
    serve({ methods: BOTH_ON, integrations: [{ ...EMAIL_ON, enabled: false }] });
    renderPage();

    expect(await screen.findByText(/email transport is turned off/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /turn it on in integrations/i })).toBeTruthy();
  });

  it("is absent when the transport is enabled", async () => {
    serve({ methods: BOTH_ON, integrations: [EMAIL_ON] });
    renderPage();

    await screen.findByText("Google");
    await screen.findByLabelText("Email code sign-in");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("is absent while Email code itself is off", async () => {
    serve({ methods: PASSWORD_ONLY, integrations: [] });
    renderPage();

    await screen.findByText("Google");
    await screen.findByLabelText("Email code sign-in");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("does not guess when the registry could not be read", async () => {
    serve({ methods: BOTH_ON, integrations: new BffError(503, "down") });
    renderPage();

    await screen.findByText(/couldn't load sign-in providers/i);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("sits on the Email code row, not the Password row", async () => {
    serve({ methods: BOTH_ON, integrations: [] });
    renderPage();

    const hint = await screen.findByText(/email transport is not set up/i);
    const row = hint.closest("li");
    expect(row && within(row).queryByLabelText("Email code sign-in")).toBeTruthy();
  });
});

describe("the sign-in providers section", () => {
  it("shows health that is news on a login row", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, health: "unresolved" }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText("Not picked up yet")).toBeTruthy();
  });

  it("shows a login row with no health as unknown", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, health: undefined }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText(/unknown/i)).toBeTruthy();
  });

  it("drops a login provider this build does not know, and says so", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ integrations: [GOOGLE_OK, { ...GOOGLE_OK, id: "i-gl", name: "gitlab" }] });
      renderPage();
      await screen.findByText("Google");

      expect(screen.queryByText("gitlab")).toBeNull();
      expect(JSON.stringify(spy.mock.calls)).toContain("gitlab");
    } finally {
      spy.mockRestore();
    }
  });

  it("offers delete on a configured provider and not on an empty one", async () => {
    serve({ integrations: [GOOGLE_OK] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByRole("button", { name: /Delete/ })).toBeTruthy();
    expect(within(rowFor("Custom OIDC")).queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  /** Reused as is from Integrations, so config-declared rows stay read-only. */
  it("shows a provider declared in the server config file as read-only", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, provisioned: true, config: { display_name: "Google" } }] });
    renderPage();
    await screen.findByText("Managed by config");
    const row = rowFor("Google");

    expect(within(row).getByText("View")).toBeTruthy();
    expect(within(row).queryByText("Configure")).toBeNull();
    expect(within(row).queryByRole("button", { name: "Delete Google" })).toBeNull();
    expect(within(row).getByRole("switch", { name: "Google enabled" })).toHaveProperty("disabled", true);
  });

  it("names a provider by its configured display name", async () => {
    serve({
      integrations: [
        integration({
          kind: "login",
          name: "custom",
          health: "ok",
          config: { display_name: "Corporate SSO" },
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText("Corporate SSO")).toBeTruthy();
    expect(screen.queryByText("Custom OIDC")).toBeNull();
  });

  it("labels a healthy provider Configured", async () => {
    serve({ integrations: [GOOGLE_OK] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText("Configured")).toBeTruthy();
  });

  it("never labels a provider with no health as Configured", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, health: undefined }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).queryByText("Configured")).toBeNull();
  });

  /** UX-8: "Disabled · Turned off" said the same thing twice. */
  it("does not repeat 'Turned off' beside 'Disabled'", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, enabled: false, health: "disabled" }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText("Disabled")).toBeTruthy();
    expect(within(rowFor("Google")).queryByText("Turned off")).toBeNull();
  });

  it("still says 'Turned off' when the row claims to be enabled", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, enabled: true, health: "disabled" }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText("Turned off")).toBeTruthy();
  });

  it("still reports an unreadable secret on a disabled row", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, enabled: false, health: "unreadable" }] });
    renderPage();
    await screen.findByText("Google");

    expect(within(rowFor("Google")).getByText("Secret unreadable")).toBeTruthy();
  });

  it("ties the reason to a config-declared provider's locked switch", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, provisioned: true, config: { display_name: "Google" } }] });
    renderPage();
    await screen.findByText("Managed by config");

    const toggle = within(rowFor("Google")).getByRole("switch", { name: "Google enabled" });
    const description = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toMatch(/server config file/i);
  });

  /** View is the only way into a provisioned row. */
  it("opens the read-only view from a config-declared provider's View button", async () => {
    serve({ integrations: [{ ...GOOGLE_OK, provisioned: true, config: { display_name: "Google" } }] });
    renderPage();
    await screen.findByText("Managed by config");

    fireEvent.click(within(rowFor("Google")).getByText("View"));

    expect(await screen.findByText("View Google")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/server config file/i);
  });

  it("tells the admin where config-declared providers are changed", async () => {
    serve({});
    renderPage();

    expect(await screen.findByText(/providers declared in the server config file/i)).toBeTruthy();
  });
});

/** Carried over from the old Sign-in methods screen. */
describe("the built-in methods section", () => {
  it("shows each method with its state and its standing note", async () => {
    serve({ methods: PASSWORD_ONLY });
    renderPage();

    expect((await screen.findByLabelText("Password sign-in")).getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText("Email code sign-in").getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByText(/password reset still sends one-time codes/i)).toBeTruthy();
    expect(screen.getByText(/removes “Forgot password\?”/)).toBeTruthy();
  });

  it("reports an empty list as a fault, not an empty screen", async () => {
    serve({ methods: [] });
    renderPage();

    expect(await screen.findByText(/sign-in method settings are unavailable/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("renders a method it does not recognise, with a working switch", async () => {
    serve({ methods: [...BOTH_ON, { method: "webauthn", enabled: true, updated_at: "x" }] });
    renderPage();

    expect((await screen.findByLabelText("webauthn sign-in")).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/not recognised by this version/i)).toBeTruthy();
  });

  it("disables only the row in flight until its request settles", async () => {
    let settle: (value: unknown) => void = () => {};
    serve({ methods: BOTH_ON }, () => new Promise((resolve) => (settle = resolve)));
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").hasAttribute("disabled")).toBe(true),
    );
    expect(screen.getByLabelText("Password sign-in").hasAttribute("disabled")).toBe(false);

    settle({ method: "email_otp", enabled: false, updated_at: "x" });

    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").hasAttribute("disabled")).toBe(false),
    );
  });

  it("names both causes of a 404 and puts the switch back", async () => {
    serve({ methods: BOTH_ON }, () => Promise.reject(new BffError(404, "Not Found", "NOT_FOUND")));
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));

    const alert = await screen.findByText(/did not recognise it/i);
    expect(alert.textContent).toMatch(/may not support sign-in method settings yet/i);
    await waitFor(() =>
      expect(screen.getByLabelText("Email code sign-in").getAttribute("data-state")).toBe("checked"),
    );
  });

  it("says the admin role is gone on a 403, and keeps it when another row succeeds", async () => {
    serve({ methods: BOTH_ON }, (path) =>
      path.endsWith("/email_otp")
        ? Promise.reject(new BffError(403, "Admin role required", "FORBIDDEN"))
        : { method: "email_password", enabled: false, updated_at: "x" },
    );
    renderPage();

    fireEvent.click(await screen.findByLabelText("Email code sign-in"));
    await screen.findByText(/no longer have admin access/i);

    fireEvent.click(screen.getByLabelText("Password sign-in"));
    await waitFor(() =>
      expect(
        bffFetchMock.mock.calls.some(
          ([path, init]) => String(path).endsWith("/email_password") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );

    expect(screen.getByText(/no longer have admin access/i)).toBeTruthy();
  });
});

/**
 * AC7: the display name is the provider's name everywhere the admin meets it,
 * not only in the row title. `custom` makes it load-bearing — "Custom OIDC" is
 * the kind, and the operator never typed it.
 */
describe("a provider named by its display_name", () => {
  const NAMED_CUSTOM = integration({
    kind: "login",
    name: "custom",
    health: "ok",
    config: { display_name: "Corporate SSO" },
    secrets_set: { client_secret: true },
  });

  it("labels the row's delete button with it", async () => {
    serve({ integrations: [NAMED_CUSTOM] });
    renderPage();
    await screen.findByText("Corporate SSO");

    expect(
      within(rowFor("Corporate SSO")).getByRole("button", { name: "Delete Corporate SSO" }),
    ).toBeTruthy();
  });

  it("asks the delete confirmation for it", async () => {
    serve({ integrations: [NAMED_CUSTOM] });
    renderPage();
    await screen.findByText("Corporate SSO");

    fireEvent.click(within(rowFor("Corporate SSO")).getByRole("button", { name: "Delete Corporate SSO" }));

    expect(await screen.findByText("Delete Corporate SSO sign-in?")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Delete" });
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Custom OIDC" } });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Corporate SSO" } });
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("titles the edit dialog with it", async () => {
    serve({ integrations: [NAMED_CUSTOM] });
    renderPage();
    await screen.findByText("Corporate SSO");

    fireEvent.click(within(rowFor("Corporate SSO")).getByText("Configure"));

    expect(await screen.findByText("Configure Corporate SSO")).toBeTruthy();
  });
});

/**
 * AC5, the race: the row became config-declared while its dialog was open. The
 * refetched row carries `provisioned: true`, and the open dialog must turn into
 * the read-only view rather than keep offering Save for a row the backend will
 * refuse forever.
 */
describe("an open provider dialog after the row turns config-declared", () => {
  const PROVISIONED_GOOGLE = integration({
    kind: "login",
    name: "google",
    health: "ok",
    provisioned: true,
    config: { display_name: "Google", client_id: "local-mock.apps.googleusercontent.com" },
  });

  it("turns the create dialog into the view", async () => {
    const wire: Wire = { integrations: [] };
    serve(wire);
    const { client } = renderPage();
    await screen.findByText("Google");
    fireEvent.click(within(rowFor("Google")).getByText("Set up"));
    expect(await screen.findByText("Set up Google")).toBeTruthy();

    wire.integrations = [PROVISIONED_GOOGLE];
    await act(() => client.invalidateQueries());

    expect(await screen.findByText("View Google")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/declared in the server config file/i);
    expect(screen.getByRole("dialog").querySelectorAll("input, textarea").length).toBe(0);
  });

  it("turns the edit dialog into the view", async () => {
    const wire: Wire = { integrations: [{ ...PROVISIONED_GOOGLE, provisioned: false }] };
    serve(wire);
    const { client } = renderPage();
    await screen.findByText("Google");
    fireEvent.click(within(rowFor("Google")).getByText("Configure"));
    expect(await screen.findByText("Configure Google")).toBeTruthy();

    wire.integrations = [PROVISIONED_GOOGLE];
    await act(() => client.invalidateQueries());

    expect(await screen.findByText("View Google")).toBeTruthy();
    expect(screen.getByRole("dialog").querySelectorAll("input, textarea").length).toBe(0);
  });
});
