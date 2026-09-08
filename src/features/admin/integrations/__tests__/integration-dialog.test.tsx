// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Integration } from "@/domain/admin/integration";
import { BffError } from "@/features/_shared/api/bff-fetch";

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
  kind: "slack",
  enabled: true,
  config: { api_url: "https://slack.com/api/" },
  secrets_set: { bot_token: true },
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-09T00:00:00Z",
  updated_by: "admin@maintmode",
};

const EMAIL_CONFIGURED = (tls_policy: string): Integration => ({
  id: "i-2",
  kind: "email",
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
      <IntegrationDialog kind="slack" integration={null} open onOpenChange={onOpenChange} {...p} />
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

    view.rerender(element({ open: false, kind: null }));
    expect(document.body.innerHTML).not.toContain("xoxb-super-secret-draft");

    view.rerender(element({ open: true, kind: "slack" }));
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
    expect(body.kind).toBe("slack");
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

    const { view } = renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });
    expect(document.body.textContent).not.toContain(warning);

    view.unmount();
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("none") });
    expect(document.body.textContent).toContain(warning);
  });

  it("surfaces a stored tls_policy set outside the option list as a '(current)' choice", () => {
    // A value from an older free-text UI (or a future backend) isn't in the
    // option set; it must stay visible so a later pick doesn't silently drop it.
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("legacy_weird_value") });
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

  it("offers the probe for email only", () => {
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });
    expect(testButton()).toBeTruthy();

    cleanup();
    renderDialog({ kind: "slack", integration: SLACK_CONFIGURED });
    // Slack and Telegram have no equivalent endpoint on the backend.
    expect(testButton()).toBeNull();
  });

  it("stays disabled until a recipient is given", () => {
    // The backend infers no recipient from the token, so an empty field means a
    // guaranteed 400 — enabling the button would teach the operator nothing.
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });
    expect(testButton()!.hasAttribute("disabled")).toBe(true);

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    expect(testButton()!.hasAttribute("disabled")).toBe(false);
  });

  it("posts to the test route and saves nothing", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    const [url, init] = bffFetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/integrations/email/test");
    expect(init.method).toBe("POST");
    // A probe that issued a PATCH would persist settings the operator was only
    // trying out.
    expect(bffFetchMock.mock.calls.every(([u]) => String(u).endsWith("/test"))).toBe(true);
    expect(JSON.parse(init.body).to).toBe("admin@example.test");
  });

  it("reports success naming the mailbox to look in", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);

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
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("wasn't sent"));
    expect(screen.getByRole("status").textContent).toContain("connection refused");
  });

  it("clears a stale result when a config field changes", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);
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
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);
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
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "admin@example.test" } });
    fireEvent.click(testButton()!);
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
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    fireEvent.change(testTo(), { target: { value: "first@example.test" } });
    fireEvent.click(testButton()!);

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("first@example.test");
    expect(JSON.parse(bffFetchMock.mock.calls[0][1].body).to).toBe("first@example.test");
  });

  it("sends one message per press, not one per click", async () => {
    // `isPending` only lands on a re-render, so it cannot stop a second click in
    // the same tick — and every click here is a real message, doubled again by
    // the single 401 replay in `authenticatedBackendRequest`.
    bffFetchMock.mockReturnValue(new Promise<void>(() => {}));
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

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
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    expect(screen.getByText(/saved password isn't included/i)).toBeTruthy();
  });

  it("does not warn when the operator deliberately cleared the password", () => {
    // Testing an anonymous relay is a supported configuration, not a mistake.
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText(/saved password isn't included/i)).toBeNull();
  });

  it("leaves Save usable without ever running a test", async () => {
    // The two buttons are independent: no gate, in either direction.
    bffFetchMock.mockResolvedValue({ ...EMAIL_CONFIGURED("mandatory") });
    renderDialog({ kind: "email", integration: EMAIL_CONFIGURED("mandatory") });

    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(String(bffFetchMock.mock.calls[0][0])).not.toContain("/test");
  });
});
