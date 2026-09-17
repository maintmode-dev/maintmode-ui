// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Integration } from "@/domain/admin/integration";
import { BffError } from "@/features/_shared/api/bff-fetch";

// Registers the sign-in provider metadata, exactly as the gated section does.
import { IntegrationDialog } from "../integration-dialog";

// The dialog renders through a Radix portal into document.body; this config
// has no global testing-library auto-cleanup, so clean up explicitly.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
// Toasts fire from the mutation hooks; irrelevant here.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SLACK_CONFIGURED: Integration = {
  id: "i-1",
  kind: "notify",
  name: "slack",
  enabled: true,
  config: { api_url: "https://slack.com/api/" },
  secrets_set: { bot_token: true },
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-09T00:00:00Z",
  updated_by: "admin@maintmode",
};

const EMAIL_CONFIGURED = (tls_policy: string): Integration => ({
  id: "i-2",
  kind: "notify",
  name: "email",
  enabled: true,
  config: { host: "smtp.example.com", from: "noc@example.com", tls_policy },
  secrets_set: { password: true },
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-09T00:00:00Z",
  updated_by: "admin@maintmode",
});

function renderDialog(props: Partial<React.ComponentProps<typeof IntegrationDialog>> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (p: Partial<React.ComponentProps<typeof IntegrationDialog>>) => (
    <QueryClientProvider client={client}>
      <IntegrationDialog name="slack" integration={null} open onOpenChange={onOpenChange} {...p} />
    </QueryClientProvider>
  );
  const view = render(element(props));
  return { onOpenChange, view, element };
}

const secretInput = () => document.getElementById("integration-secret-bot_token") as HTMLInputElement | null;

describe("IntegrationDialog", () => {
  it("edit mode renders the stored secret as a locked Configured plate, never an input", () => {
    renderDialog({ integration: SLACK_CONFIGURED });
    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    expect(secretInput()).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("destroys a typed secret draft on close and reopen (write-only invariant)", () => {
    // Mirror the integrations-page wiring: closing nulls `kind`, which
    // unmounts the keyed body and its draft state.
    const { view, element } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-super-secret-draft" } });
    expect(secretInput()!.value).toBe("xoxb-super-secret-draft");

    view.rerender(element({ open: false, name: null }));
    expect(document.body.innerHTML).not.toContain("xoxb-super-secret-draft");

    view.rerender(element({ open: true, name: "slack" }));
    expect(secretInput()!.value).toBe("");
  });

  it("keeps the dialog open and shows an inline alert when save fails", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    bffFetchMock.mockRejectedValueOnce(new BffError(400, "bot_token is invalid"));

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("bot_token is invalid");
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(secretInput()!.value).toBe("xoxb-token");
  });

  it("posts the create payload and closes on success", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    bffFetchMock.mockResolvedValueOnce({ ...SLACK_CONFIGURED });

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [path, init] = bffFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/admin/integrations");
    const body = JSON.parse(String(init.body));
    // Both halves travel: `kind` is the category, `name` the system. Sending
    // the system in `kind` — the pre-b74a4536 shape — is a 400 at the backend.
    expect(body.kind).toBe("notify");
    expect(body.name).toBe("slack");
    expect(body.enabled).toBe(true);
    expect(body.secrets).toEqual({ bot_token: "xoxb-token" });
  });

  it("disables Connect while the required secret is missing", () => {
    renderDialog();
    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    expect(connect.disabled).toBe(false);
  });

  it("shows the no-encryption danger warning only when tls_policy is 'none'", () => {
    const warning = "Mail will be sent unencrypted";

    const { view } = renderDialog({ name: "email", integration: EMAIL_CONFIGURED("mandatory") });
    expect(document.body.textContent).not.toContain(warning);

    view.unmount();
    renderDialog({ name: "email", integration: EMAIL_CONFIGURED("none") });
    expect(document.body.textContent).toContain(warning);
  });

  it("surfaces a stored tls_policy set outside the option list as a '(current)' choice", () => {
    // A value from an older free-text UI (or a future backend) isn't in the
    // option set; it must stay visible so a later pick doesn't silently drop it.
    renderDialog({ name: "email", integration: EMAIL_CONFIGURED("legacy_weird_value") });
    const trigger = document.getElementById("integration-config-tls_policy");
    expect(trigger?.textContent).toContain("legacy_weird_value (current)");
  });
});

/**
 * RUK-290 §4 — the live probe.
 *
 * The button's whole value is that it reports the truth about what is on screen,
 * so most of these cases guard against it reporting something else: a stale
 * result under edited fields, a success that was really a failure, or a probe
 * that quietly saved.
 */
describe("IntegrationDialog — SMTP test config", () => {
  const testTo = () => document.getElementById("integration-test-to") as HTMLInputElement;
  const testButton = () => screen.queryByRole("button", { name: /Test config|Sending…/ });

  /** The subject of every case below: a configured SMTP integration in edit mode. */
  const renderEmailDialog = () => renderDialog({ name: "email", integration: EMAIL_CONFIGURED("mandatory") });

  /** Name a recipient and press the button — the two steps that precede a probe. */
  const pressTest = (to = "admin@example.test") => {
    fireEvent.change(testTo(), { target: { value: to } });
    fireEvent.click(testButton()!);
  };

  it("offers the probe for email only", () => {
    renderEmailDialog();
    expect(testButton()).toBeTruthy();

    cleanup();
    renderDialog({ name: "slack", integration: SLACK_CONFIGURED });
    // Slack and Telegram have no equivalent endpoint on the backend.
    expect(testButton()).toBeNull();
  });

  it("stays disabled until a recipient is given", () => {
    // The backend infers no recipient from the token, so an empty field means a
    // guaranteed 400 — enabling the button would teach the operator nothing.
    renderEmailDialog();
    expect(testButton()!.hasAttribute("disabled")).toBe(true);

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    expect(testButton()!.hasAttribute("disabled")).toBe(false);
  });

  it("posts to the test route and saves nothing", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderEmailDialog();

    pressTest();

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    const [url, init] = bffFetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/integrations/notify/email/test");
    expect(init.method).toBe("POST");
    // A probe that issued a PATCH would persist settings the operator was only
    // trying out.
    expect(bffFetchMock.mock.calls.every(([u]) => String(u).endsWith("/test"))).toBe(true);
    expect(JSON.parse(init.body).to).toBe("admin@example.test");
  });

  it("reports success naming the mailbox to look in", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderEmailDialog();

    pressTest();

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("sent"));
    expect(screen.getByRole("status").textContent).toContain("admin@example.test");
    // The dialog stays open: nothing was saved, so there is nothing to close on.
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("shows the backend's own text on failure, without inventing a cause", async () => {
    // The reason the endpoint exists. An earlier contract emitted a category
    // prefix and withdrew it — substring matching made a host called
    // `smtp.auth-relay.example` report a connection refusal as an auth failure.
    bffFetchMock.mockRejectedValue(
      new BffError(502, "integration probe failed: email send: dial tcp: connection refused"),
    );
    renderEmailDialog();

    pressTest();

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("wasn't sent"));
    expect(screen.getByRole("status").textContent).toContain("connection refused");
  });

  it("clears a stale result when a config field changes", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderEmailDialog();

    pressTest();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    // A green "sent" plate above a host the operator has since edited claims
    // something about a server that was never probed.
    fireEvent.change(document.getElementById("integration-config-host")!, {
      target: { value: "other.example.test" },
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears a stale result when a secret's MODE changes and its text does not", async () => {
    // The mode transition that a value-keyed rule cannot see: `cleared` → Undo
    // → `locked` moves between two modes whose draft value is `""` both before
    // and after. An implementation watching only values leaves the plate
    // standing over a request that would now carry something different.
    bffFetchMock.mockResolvedValue(undefined);
    renderEmailDialog();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    pressTest();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    // `cleared` → `locked` via Undo: no field's text changes, only the mode.
    //
    // Honest limit of this case: `onModeChange` passes `{ mode, value: "" }`, so
    // a rule keyed on `next.value !== undefined` fires here too and this test
    // cannot tell the two apart. It guards that mode transitions clear at all —
    // the reason the unconditional rule must stay is documented at
    // `invalidateTest`, not proven here.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("discards a response that lands after the operator edited a field", async () => {
    // A run in flight describes the form as it WAS. Clearing the plate on edit
    // is not enough — the late response would paint itself back on, claiming a
    // result for a server that was never probed.
    let release!: () => void;
    bffFetchMock.mockReturnValue(
      new Promise<void>((resolve) => {
        release = () => resolve();
      }),
    );
    renderEmailDialog();

    pressTest();
    fireEvent.change(document.getElementById("integration-config-host")!, {
      target: { value: "moved.example.test" },
    });

    release();
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("names the address the message was sent to", async () => {
    // Asserts the copy, not the pinning. `testResult.to` and `testTo` cannot
    // diverge while `invalidateTest` retires the run on every recipient edit, so
    // no test can distinguish reading one from the other — and one that claimed
    // to would be theatre. The pinning stays because it makes the copy correct
    // by construction rather than by depending on that invariant holding.
    bffFetchMock.mockResolvedValue(undefined);
    renderEmailDialog();

    pressTest("first@example.test");

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("first@example.test");
    expect(JSON.parse(bffFetchMock.mock.calls[0][1].body).to).toBe("first@example.test");
  });

  it("sends one message per press, not one per click", async () => {
    // `isPending` only lands on a re-render, so it cannot stop a second click in
    // the same tick — and every click here is a real message, doubled again by
    // the single 401 replay in `authenticatedBackendRequest`.
    bffFetchMock.mockReturnValue(new Promise<void>(() => {}));
    renderEmailDialog();

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    const button = testButton()!;
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // The three clicks land in one tick; the request is dispatched a microtask
    // later, so wait for the first before counting.
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock).toHaveBeenCalledTimes(1);
  });

  it("warns that a stored password is not part of the test", () => {
    // The default state of a configured integration: password stored, nothing
    // typed. Without the note a failure reads as a broken config.
    renderEmailDialog();

    expect(screen.getByText(/saved password isn't included/i)).toBeTruthy();
  });

  it("does not warn when the operator deliberately cleared the password", () => {
    // Testing an anonymous relay is a supported configuration, not a mistake.
    renderEmailDialog();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText(/saved password isn't included/i)).toBeNull();
  });

  it("leaves Save usable without ever running a test", async () => {
    // The two buttons are independent: no gate, in either direction.
    bffFetchMock.mockResolvedValue({ ...EMAIL_CONFIGURED("mandatory") });
    renderEmailDialog();

    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(String(bffFetchMock.mock.calls[0][0])).not.toContain("/test");
  });
});

// A distinctive value so an assertion can search the whole outgoing payload
// for it, rather than trusting one rendered attribute.
const SECRET = "s3cret-from-the-idp-console";

describe("sign-in provider kinds", () => {
  function renderDialog(name: "google" | "custom") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <IntegrationDialog name={name} integration={null} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
  }

  it("renders the OIDC fields", () => {
    renderDialog("custom");
    expect(screen.getByLabelText(/Issuer URL/)).toBeTruthy();
    expect(screen.getByLabelText(/Client ID/)).toBeTruthy();
    expect(screen.getByLabelText(/Scopes/)).toBeTruthy();
    expect(screen.getByLabelText(/Redirect URI/)).toBeTruthy();
  });

  /**
   * `redirect_uri` is required by the backend, which refuses a half-configured
   * provider at the edge rather than at someone's first sign-in attempt. The
   * previous descriptor called it optional and promised a default callback that
   * does not exist, so a form built from it invited a guaranteed 400.
   */
  // Unskipped by the commit that widens the save guard: `savingUnavailable`
  // still requires a notify name, so Save stays disabled here for a reason that
  // has nothing to do with the redirect URI.
  it.todo("keeps Save disabled until the redirect URI is filled in", () => {
    renderDialog("custom");
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: "Corp SSO" } });
    fireEvent.change(screen.getByLabelText(/Issuer URL/), {
      target: { value: "https://idp.example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Client ID/), { target: { value: "maintmode" } });
    fireEvent.change(screen.getByLabelText(/Client secret/), { target: { value: SECRET } });

    const save = () => screen.getByRole("button", { name: /Connect|Save changes/ });
    expect(save().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Redirect URI/), {
      target: { value: "https://maintmode.example.com/auth/callback" },
    });
    expect(save().hasAttribute("disabled")).toBe(false);
  });

  it("blocks a malformed issuer URL with a message naming the problem", () => {
    renderDialog("custom");
    fireEvent.change(screen.getByLabelText(/Issuer URL/), { target: { value: "not-a-url" } });
    expect(screen.getByText(/absolute URL/i)).toBeTruthy();
  });

  /**
   * The backend rejects a plain-http issuer outright — no loopback escape
   * hatch, because this is the field the client secret is bound to and sent to.
   * Warning instead of blocking would promise a save that cannot succeed.
   */
  // Unskipped by the commit that teaches `validateUrlFields` about `httpsOnly`.
  // The metadata declares it already; nothing reads it yet.
  it.todo("BLOCKS plain http on the issuer, rather than warning", () => {
    renderDialog("custom");
    fireEvent.change(screen.getByLabelText(/Issuer URL/), {
      target: { value: "http://keycloak.local" },
    });
    expect(screen.getByText(/must use https/i)).toBeTruthy();
    expect(screen.queryByText(/Not encrypted/i)).toBeNull();
  });

  /**
   * `redirect_uri` carries `is.URL` alone on the backend — no HTTPSURL — so a
   * local callback is legitimate and blocking it would refuse a save the
   * backend accepts.
   */
  it("allows a plain-http redirect URI, which the backend permits", () => {
    renderDialog("custom");
    fireEvent.change(screen.getByLabelText(/Redirect URI/), {
      target: { value: "http://localhost:3000/auth/callback" },
    });
    expect(screen.queryByText(/must use https/i)).toBeNull();
  });

  it("shows no notification-transport copy", () => {
    renderDialog("custom");
    expect(screen.queryByText(/deliver notifications/i)).toBeNull();
    expect(screen.queryByText(/through this transport/i)).toBeNull();
  });
});

describe("transport status copy is preserved verbatim", () => {
  function renderSlack() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <IntegrationDialog name="slack" integration={SLACK_CONFIGURED} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
  }

  // Both literals are quoted so a reword during the per-category refactor cannot
  // pass as compliance. SPEC §7.9 requires both; only the enabled one was pinned
  // until the ship review caught that rewording the other left every test green.
  it("keeps the enabled sentence", () => {
    renderSlack();
    expect(screen.getByText("Channels using this transport will deliver notifications.")).toBeTruthy();
  });

  it("keeps the disabled sentence", () => {
    renderSlack();
    fireEvent.click(screen.getByLabelText("Integration enabled"));
    expect(screen.getByText("Delivery through this transport is paused; settings are kept.")).toBeTruthy();
  });
});
