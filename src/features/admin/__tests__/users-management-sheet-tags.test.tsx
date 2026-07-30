// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListUsersPage, User } from "@/domain/admin/user";

import { UsersManagementPage } from "../users-management-page";

// jsdom lacks the layout APIs some Radix internals rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const admin: User = {
  id: "me",
  email: "admin@maintmode",
  display_name: "Admin",
  roles: ["admin"],
  connected_providers: [],
  created_at: "2026-01-01T00:00:00Z",
  telegram_tag: null,
  slack_tag: null,
};

function user(id: string, over: Partial<User> = {}): User {
  return {
    ...admin,
    id,
    email: `${id}@maintmode`,
    display_name: id,
    roles: ["editor"],
    ...over,
  };
}

/**
 * Per-route BFF mock. `roleFail`/`tagFail` reject the respective write so a test
 * can drive one half of the sequenced save into failure while the other half
 * succeeds. `calls` records every write in the order it was ISSUED, which is
 * what proves roles finish before the tag PATCH goes out.
 */
function renderPage(
  users: User[],
  opts: { roleFail?: boolean; tagFail?: boolean; holdRoles?: boolean } = {},
) {
  const calls: { path: string; body: unknown }[] = [];
  let releaseRoles: (() => void) | null = null;
  const rolesHeld = new Promise<void>((resolve) => {
    releaseRoles = resolve;
  });

  bffFetchMock.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (typeof path !== "string") throw new Error(`unexpected bffFetch: ${String(path)}`);
    if (path === "/api/me") return admin;
    if (path.startsWith("/api/admin/roles/assign") || path.startsWith("/api/admin/roles/revoke")) {
      calls.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
      if (opts.holdRoles) await rolesHeld;
      if (opts.roleFail) throw new Error("role write failed");
      return {};
    }
    if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "reviewer", "editor", "guest"] };
    // The header's seats indicator queries this on every render. Answered
    // as "unlimited" so the block stays hidden and these assertions keep
    // describing the header they were written for.
    if (path.startsWith("/api/admin/seats")) {
      return { seats_purchased: null, seats_used: 0, seats_pending: 0, seats_occupied: 0, unlimited: true };
    }
    if (path.startsWith("/api/admin/invitations")) return { invitations: [] };
    if (init?.method === "PATCH") {
      calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
      if (opts.tagFail) throw new Error("tag write failed");
      return users[0];
    }
    if (path.startsWith("/api/admin/users")) {
      if (path.includes("active=true")) {
        return { users: [], limit: 1, offset: 0, total: users.length } satisfies ListUsersPage;
      }
      return { users, limit: 50, offset: 0, total: users.length } satisfies ListUsersPage;
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <UsersManagementPage />
    </QueryClientProvider>,
  );
  return { view, calls, releaseRoles: () => releaseRoles?.() };
}

function row(displayName: string): HTMLTableRowElement {
  const rows = Array.from(document.querySelectorAll("tbody tr"));
  const found = rows.find((r) => r.textContent?.includes(displayName));
  if (!found) throw new Error(`no row for ${displayName}`);
  return found as HTMLTableRowElement;
}

/** Open the sheet for a user by clicking their row, then wait for the fields. */
async function openSheet(displayName: string) {
  await waitFor(() => expect(row(displayName)).toBeTruthy());
  fireEvent.click(row(displayName));
  await waitFor(() => expect(telegramInput()).toBeTruthy());
}

/**
 * The handle inputs are id'd `{user.id}-telegram` / `{user.id}-slack`, so a
 * lookup by label text is what keeps this test honest about WHICH user's fields
 * are mounted — the sheet only ever holds one pair.
 */
function inputByLabel(label: string): HTMLInputElement {
  const labels = Array.from(document.querySelectorAll("label"));
  const found = labels.find((l) => l.textContent?.trim() === label);
  if (!found) throw new Error(`no label ${label}`);
  const input = document.getElementById(found.getAttribute("for") ?? "");
  if (!input) throw new Error(`no input for label ${label}`);
  return input as HTMLInputElement;
}
const telegramInput = () => inputByLabel("Telegram handle");
const slackInput = () => inputByLabel("Slack handle");

function footerText(): string {
  const footer = document.querySelector('[data-slot="sheet-footer"]');
  const p = footer?.querySelector("p");
  return p?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function saveButton(): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button"));
  const found = buttons.find((b) => b.textContent?.includes("Save changes"));
  if (!found) throw new Error("no Save button");
  return found as HTMLButtonElement;
}

/** The always-mounted banner inside the scrollable sheet body. */
function bannerText(): string {
  const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
  const banner = alerts.find((a) => a.className.includes("destructive-fg"));
  return banner?.textContent?.trim() ?? "";
}

function roleCheckbox(role: string): HTMLElement {
  const box = document.getElementById(`role-${role}`);
  if (!box) throw new Error(`no checkbox for ${role}`);
  return box;
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

const writePaths = (calls: { path: string }[]) => calls.map((c) => c.path);

describe("UserSheetBody handles editing", () => {
  it("re-seeds the drafts when the sheet switches user (regression: missing key)", async () => {
    // Without `key={user.id}` on UserSheetBody the component is NOT remounted
    // when the sheet swaps to another user: the drafts are seeded once in
    // `useState` while `user` is re-derived from the list, so B's sheet keeps
    // showing the text typed into A's. Verified: dropping the key alone turns
    // the assertion below into `@edited_but_not_saved`.
    //
    // The switch has to happen WITHOUT an intervening close — closing nulls
    // `activeUserId`, which unmounts the body and hides the bug. The rows stay
    // in the DOM and clickable behind the sheet, so this is the reachable path.
    renderPage([user("alpha", { telegram_tag: "@alpha_tg" }), user("bravo", { telegram_tag: "@bravo_tg" })]);

    await openSheet("alpha");
    expect(telegramInput().value).toBe("@alpha_tg");
    type(telegramInput(), "@edited_but_not_saved");
    expect(telegramInput().value).toBe("@edited_but_not_saved");

    fireEvent.click(row("bravo"));
    await waitFor(() => expect(document.getElementById("bravo-telegram")).toBeTruthy());

    expect(telegramInput().value).toBe("@bravo_tg");
    expect(telegramInput().value).not.toBe("@edited_but_not_saved");
  });

  it("re-seeds the drafts after closing and reopening on another user", async () => {
    // The same guarantee via the ordinary path (Cancel, then open B). Passes
    // without the key too — kept because it is the flow an operator actually
    // uses, and it would catch a future change that made close stop unmounting.
    const { view } = renderPage([
      user("alpha", { telegram_tag: "@alpha_tg" }),
      user("bravo", { telegram_tag: "@bravo_tg" }),
    ]);

    await openSheet("alpha");
    type(telegramInput(), "@edited_but_not_saved");
    fireEvent.click(view.getByText("Cancel"));
    await waitFor(() => expect(document.getElementById("alpha-telegram")).toBeNull());

    await openSheet("bravo");
    expect(telegramInput().value).toBe("@bravo_tg");
  });

  it("sends only role writes when only roles changed", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_sl" })]);
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    await waitFor(() => expect(footerText()).toBe("1 role change pending."));
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(writePaths(calls)).toEqual(["/api/admin/roles/assign"]);
    // Zero writes to the per-user endpoint — the tag PATCH must not fire.
    expect(calls.filter((c) => c.path === "/api/admin/users/alpha")).toEqual([]);
  });

  it("sends one PATCH carrying only the changed tag key when only handles changed", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_sl" })]);
    await openSheet("alpha");

    type(telegramInput(), "@new_tg");
    await waitFor(() => expect(footerText()).toBe("1 handle change pending."));
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].path).toBe("/api/admin/users/alpha");
    // Untouched keys must be ABSENT, not null: sending `slack_tag` here would
    // overwrite a handle this admin never edited.
    expect(Object.keys(calls[0].body as object)).toEqual(["telegram_tag"]);
    expect(calls[0].body).toEqual({ telegram_tag: "@new_tg" });
    expect(writePaths(calls).some((p) => p.startsWith("/api/admin/roles/"))).toBe(false);
  });

  it("clears a handle with an explicit null when the field is emptied", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_sl" })]);
    await openSheet("alpha");

    type(slackInput(), "   ");
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].body).toEqual({ slack_tag: null });
  });

  it("finishes the role writes before issuing the tag PATCH", async () => {
    // Order, not just counts: `holdRoles` parks the role request until we
    // release it, so a `Promise.all` across both resources would show the PATCH
    // already issued while the roles are still in flight.
    const { calls, releaseRoles } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })], {
      holdRoles: true,
    });
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    type(telegramInput(), "@new_tg");
    await waitFor(() => expect(footerText()).toBe("1 role change and 1 handle change pending."));
    fireEvent.click(saveButton());

    // Role write issued and still pending; the tag PATCH must not exist yet.
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].path).toBe("/api/admin/roles/assign");
    expect(calls.some((c) => c.path === "/api/admin/users/alpha")).toBe(false);

    releaseRoles();
    await waitFor(() => expect(calls.length).toBe(2));
    expect(writePaths(calls)).toEqual(["/api/admin/roles/assign", "/api/admin/users/alpha"]);
  });

  it("keeps the sheet open, rolls back the checkboxes and names the failure when roles fail", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })], { roleFail: true });
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    type(telegramInput(), "@new_tg");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(bannerText()).toBe("Handles saved. Roles didn't save — they've been reset. Try again."),
    );
    // Handles still went out (the roles failing must not cancel them).
    expect(calls.some((c) => c.path === "/api/admin/users/alpha")).toBe(true);
    // Roles reset to server state — a checked box for access that does not
    // exist would be a lie about permissions.
    expect(roleCheckbox("reviewer").getAttribute("data-state")).toBe("unchecked");
    expect(roleCheckbox("editor").getAttribute("data-state")).toBe("checked");
    // Sheet still open.
    expect(telegramInput()).toBeTruthy();
  });

  it("keeps the typed handle text when the tag PATCH fails", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })], { tagFail: true });
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    type(telegramInput(), "@typed_by_hand");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(bannerText()).toBe("Roles saved. Handles didn't save — your text is still here. Try again."),
    );
    // NEVER reset — losing hand-typed text to a network blip is data loss.
    expect(telegramInput().value).toBe("@typed_by_hand");
    expect(writePaths(calls)).toEqual(["/api/admin/roles/assign", "/api/admin/users/alpha"]);
  });

  it("reports a plain failure when both halves fail", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })], {
      roleFail: true,
      tagFail: true,
    });
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    type(telegramInput(), "@new_tg");
    fireEvent.click(saveButton());

    await waitFor(() => expect(bannerText()).toBe("Couldn't save changes. Try again."));
    expect(calls.length).toBe(2);
    expect(telegramInput().value).toBe("@new_tg");
  });

  it("mounts the alert banner before any failure so a repeat error is re-announced", async () => {
    renderPage([user("alpha", { telegram_tag: "@alpha_tg" })]);
    await openSheet("alpha");

    const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
    expect(alerts.some((a) => a.className.includes("destructive-fg"))).toBe(true);
    expect(bannerText()).toBe("");
  });

  it("never puts timezone in the request body", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_sl" })]);
    await openSheet("alpha");

    fireEvent.click(roleCheckbox("reviewer"));
    type(telegramInput(), "@new_tg");
    type(slackInput(), "@new_sl");
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.length).toBe(2));
    for (const call of calls) {
      expect(JSON.stringify(call.body)).not.toContain("timezone");
      expect(Object.keys((call.body ?? {}) as object)).not.toContain("timezone");
    }
  });

  it("disables Save and explains why while a handle is invalid", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })]);
    await openSheet("alpha");

    type(telegramInput(), "@here");
    fireEvent.blur(telegramInput());

    await waitFor(() => expect(footerText()).toBe("Fix the highlighted handle to save."));
    expect(saveButton().disabled).toBe(true);

    // Fixing it re-enables Save; nothing was ever sent while invalid.
    type(telegramInput(), "@fine");
    await waitFor(() => expect(footerText()).toBe("1 handle change pending."));
    expect(saveButton().disabled).toBe(false);
    expect(calls).toEqual([]);
  });

  // The blur-first test above stops at a DISABLED Save button, so it never
  // reaches the re-validation inside `save`. Typing without blurring leaves
  // Save live, and that guard is the only thing keeping `@here` out of the
  // PATCH — deleting it is invisible to every other test in this file.
  it("refuses to save a reserved handle typed but never blurred", async () => {
    const { calls } = renderPage([user("alpha", { telegram_tag: "@alpha_tg" })]);
    await openSheet("alpha");

    type(telegramInput(), "@here");

    // Reachability precondition: no blur means no error yet, so Save is live.
    await waitFor(() => expect(footerText()).toBe("1 handle change pending."));
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    // `save` is async, so the writes would leave on a later tick — the footer
    // assertion below doubles as the flush that lets them land if unguarded.
    await waitFor(() => expect(footerText()).toBe("Fix the highlighted handle to save."));
    expect(calls).toEqual([]);
    expect(telegramInput().value).toBe("@here");
  });

  it("validates on blur, never on keystroke", async () => {
    // `@r` mid-word must not flash an error — the message carries role="alert"
    // and would be announced on every key (SPEC §5.6).
    renderPage([user("alpha", { telegram_tag: null })]);
    await openSheet("alpha");

    type(telegramInput(), "@");
    expect(footerText()).toBe("1 handle change pending.");
    fireEvent.blur(telegramInput());
    await waitFor(() => expect(footerText()).toBe("Fix the highlighted handle to save."));
  });

  it("names units in the footer for every pending combination", async () => {
    renderPage([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_sl" })]);
    await openSheet("alpha");

    expect(footerText()).toBe("No changes.");

    fireEvent.click(roleCheckbox("reviewer"));
    await waitFor(() => expect(footerText()).toBe("1 role change pending."));
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(roleCheckbox("guest"));
    await waitFor(() => expect(footerText()).toBe("2 role changes pending."));

    fireEvent.click(roleCheckbox("guest"));
    type(telegramInput(), "@new_tg");
    await waitFor(() => expect(footerText()).toBe("1 role change and 1 handle change pending."));

    type(slackInput(), "@new_sl");
    await waitFor(() => expect(footerText()).toBe("1 role change and 2 handle changes pending."));

    // Roles back to server state → the handle clause stands alone.
    fireEvent.click(roleCheckbox("reviewer"));
    await waitFor(() => expect(footerText()).toBe("2 handle changes pending."));

    // Retyping the original values is not a change: the diff is BY VALUE.
    type(telegramInput(), "@alpha_tg");
    type(slackInput(), "@alpha_sl");
    await waitFor(() => expect(footerText()).toBe("No changes."));
    expect(saveButton().disabled).toBe(true);
  });

  /**
   * A role write invalidates the users query, so the list can refetch WHILE the
   * save is still running. Everything the save reads after that first await
   * therefore goes through a ref rather than the render closure it started in.
   *
   * HONEST LIMIT: this test does NOT kill that mutation. `invalidateQueries` is
   * fire-and-forget, so under jsdom the refetch has not landed by the time the
   * body is built, and reading the stale closure passes too. The race window is
   * real but not deterministically reproducible here. What this test does pin
   * is the property that matters either way — an untouched field is never sent.
   */
  it("sends only the touched handle when a role write refetches the list", async () => {
    const before = user("alpha", { roles: ["editor"], telegram_tag: "@old_tg", slack_tag: null });
    // What the refetch returns: the person changed their OWN telegram handle
    // between this list loading and the admin pressing Save.
    const after = user("alpha", { roles: ["reviewer"], telegram_tag: "@they_changed_it", slack_tag: null });

    let listServed = 0;
    const calls: { path: string; body: unknown }[] = [];
    bffFetchMock.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (typeof path !== "string") throw new Error(`unexpected bffFetch: ${String(path)}`);
      if (path === "/api/me") return admin;
      if (path.startsWith("/api/admin/roles/assign") || path.startsWith("/api/admin/roles/revoke")) {
        calls.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
        return {};
      }
      if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "reviewer", "editor", "guest"] };
      // The header's seats indicator queries this on every render. Answered
      // as "unlimited" so the block stays hidden and these assertions keep
      // describing the header they were written for.
      if (path.startsWith("/api/admin/seats")) {
        return { seats_purchased: null, seats_used: 0, seats_pending: 0, seats_occupied: 0, unlimited: true };
      }
      if (path.startsWith("/api/admin/invitations")) return { invitations: [] };
      if (init?.method === "PATCH") {
        calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
        return after;
      }
      if (path.startsWith("/api/admin/users")) {
        if (path.includes("active=true")) {
          return { users: [], limit: 1, offset: 0, total: 1 } satisfies ListUsersPage;
        }
        // First read serves the pre-edit row; every later read (i.e. the
        // refetch the role write triggers) serves the changed one.
        const body = listServed++ === 0 ? before : after;
        return { users: [body], limit: 50, offset: 0, total: 1 } satisfies ListUsersPage;
      }
      throw new Error(`unexpected bffFetch: ${path}`);
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <UsersManagementPage />
      </QueryClientProvider>,
    );

    await openSheet("alpha");
    // Touch ONLY the slack field. Telegram is left completely alone.
    fireEvent.change(slackInput(), { target: { value: "@admin_set_this" } });
    fireEvent.blur(slackInput());
    // Also change a role, so the save issues a role write first and the
    // invalidation lands before the tag PATCH is built.
    fireEvent.click(roleCheckbox("reviewer"));
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.some((c) => c.path.startsWith("/api/admin/users/alpha"))).toBe(true));
    const patch = calls.find((c) => c.path.startsWith("/api/admin/users/alpha"));
    const keys = Object.keys(patch?.body as Record<string, unknown>);

    // The admin never touched telegram. Diffed against the stale "@old_tg" it
    // would look changed and be sent, overwriting what the person just set for
    // themselves. Diffed against the refetched value it is correctly absent.
    expect(keys).not.toContain("telegram_tag");
    expect(keys).toEqual(["slack_tag"]);
  });
});
