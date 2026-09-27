// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { SignInMethodsCard, type SignInMethodsCardProps } from "@/features/settings/sign-in-methods-card";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { TooltipProvider } from "@/shared/ui/shadcn/tooltip";

const bffFetch = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetch(...args) };
});

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() },
}));

const assign = vi.fn();
const replaceState = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, pathname: "/settings/profile" },
  });
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceState);
});
afterEach(() => cleanup());

/**
 * GAP-2 (v0.2.0-rc). The card this replaces had Connect and Disconnect buttons
 * with no handlers over a hardcoded Google/GitHub list, and a "Current session"
 * pill naming the first-linked provider. These tests pin what the new one
 * promises: the list is the instance's, the buttons do something, and the one
 * rule that can lock a person out is right.
 */

const METHODS = {
  methods: [
    { id: "email_password", type: "password", display_name: "Password" },
    { id: "google", type: "redirect", display_name: "Google" },
    { id: "custom", type: "redirect", display_name: "Corporate SSO" },
  ],
};

function answer(routes: Record<string, unknown>) {
  bffFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected ${key}`);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

function renderCard(props: Partial<SignInMethodsCardProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SignInMethodsCard connectedProviders={["google"]} passwordSet={true} {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { invalidate };
}

const row = (id: string) => document.querySelector(`[data-provider-id="${id}"]`) as HTMLElement;

/**
 * The row once the instance's list has LOADED. Waits on the list, not on the
 * row: a linked provider is drawn before the list arrives (as "no longer
 * offered"), and `waitFor(() => row(id))` would not wait at all — it retries
 * only on a throw, and a missing row is a null.
 */
async function findRow(id: string): Promise<HTMLElement> {
  await screen.findByText("Corporate SSO");
  return waitFor(() => {
    const found = row(id);
    if (!found) throw new Error(`no row for ${id}`);
    return found;
  });
}

describe("the list is the instance's, not a hardcoded one", () => {
  it("draws every offered provider by the name the operator gave it", async () => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard();

    await screen.findByText("Corporate SSO");
    expect(row("google")).toBeTruthy();
    expect(row("custom")).toBeTruthy();
    // Built-in methods are not providers to link.
    expect(row("email_password")).toBeNull();
    // Nothing the instance does not offer, and no GitHub by default.
    expect(screen.queryByText(/GitHub/)).toBeNull();
  });

  it("keeps a linked provider the instance no longer offers, so it can still be removed", async () => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ connectedProviders: ["google", "github"] });

    await screen.findByText("Corporate SSO");
    expect(within(row("github")).getByText(/no longer offered/i)).toBeTruthy();
    expect(within(row("github")).getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("names no session method it cannot know", async () => {
    // `/me` reports the FIRST-linked provider, not how this session signed in.
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard();

    await screen.findByText("Corporate SSO");
    expect(screen.queryByText(/current session/i)).toBeNull();
    expect(within(row("google")).getByText("Connected")).toBeTruthy();
    expect(within(row("custom")).getByText("Not connected")).toBeTruthy();
  });

  it("says so when the list cannot be loaded, and still lists what is linked", async () => {
    answer({ "GET /api/sign-in-methods": new BffError(503, "down") });
    renderCard({ connectedProviders: ["google", "custom"] });

    await screen.findByText(/couldn't load/i);
    expect(row("google")).toBeTruthy();
    expect(row("custom")).toBeTruthy();
  });
});

describe("Connect leaves for the provider", () => {
  it("asks the BFF for the link of the provider clicked, then navigates to it", async () => {
    const url = "https://maintmode.example/auth/api/v1/login/oauth/custom/start?link=t";
    answer({ "GET /api/sign-in-methods": METHODS, "POST /api/me/providers/custom/connect": { url } });
    renderCard();

    fireEvent.click(await within(await findRow("custom")).findByRole("button", { name: /Connect/ }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(url));
  });

  it("does not repeat the backend's wording for a 409", async () => {
    // The message distinguishes "already yours" from "someone else's" —
    // not ours to say. The status decides the copy.
    answer({
      "GET /api/sign-in-methods": METHODS,
      "POST /api/me/providers/custom/connect": new BffError(
        409,
        "provider is linked to another user",
        "conflict",
      ),
    });
    renderCard();

    fireEvent.click(await within(await findRow("custom")).findByRole("button", { name: /Connect/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/may already be connected/);
    expect(document.body.textContent).not.toContain("another user");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("Disconnect — and the rule that can lock a person out", () => {
  it("unlinks the provider and refreshes the profile", async () => {
    answer({ "GET /api/sign-in-methods": METHODS, "DELETE /api/me/providers/google": undefined });
    const { invalidate } = renderCard({ connectedProviders: ["google", "custom"] });

    fireEvent.click(await within(await findRow("google")).findByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] }));
  });

  it("lets the only provider go when the account has a password", async () => {
    // The old card counted providers alone, so Google + a password could not
    // unlink Google.
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ connectedProviders: ["google"], passwordSet: true });

    const button = await within(await findRow("google")).findByRole("button", {
      name: "Disconnect",
    });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it.each([
    ["no password", false],
    ["an unknown password state", undefined],
  ])("holds on to the only provider with %s", async (_label, passwordSet) => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ connectedProviders: ["google"], passwordSet });

    const button = await within(await findRow("google")).findByRole("button", {
      name: "Disconnect",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("explains the backend's lockout refusal instead of failing silently", async () => {
    answer({
      "GET /api/sign-in-methods": METHODS,
      "DELETE /api/me/providers/google": new BffError(400, "cannot disconnect the only sign-in method"),
    });
    renderCard({ connectedProviders: ["google", "custom"], passwordSet: false });

    fireEvent.click(await within(await findRow("google")).findByRole("button", { name: "Disconnect" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/only way to sign in/);
  });

  it("does not tell someone who has a password to set one", async () => {
    // Found in QA: the backend's guard does not count passwords yet (BUG-10),
    // so it refuses even here — and "set a password first" sends a person who
    // already has one in a circle.
    answer({
      "GET /api/sign-in-methods": METHODS,
      "DELETE /api/me/providers/google": new BffError(400, "cannot disconnect the only sign-in method"),
    });
    renderCard({ connectedProviders: ["google"], passwordSet: true });

    fireEvent.click(await within(await findRow("google")).findByRole("button", { name: "Disconnect" }));

    const text = (await screen.findByRole("alert")).textContent ?? "";
    expect(text).toMatch(/refused to remove/);
    expect(text).not.toMatch(/set a password/i);
  });
});

describe("the outcome of a link that just came back", () => {
  it("brings the card into view, since the person arrives at the top of the page", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ linkOutcome: "link_conflict" });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("announces a completed link once, and clears it from the address bar", async () => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ linkOutcome: "linked" });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    // The id is what lets sonner collapse a second call — StrictMode runs the
    // effect twice in development, which QA saw as two identical toasts.
    expect(toastSuccess.mock.calls[0]?.[1]).toMatchObject({ id: "link-outcome" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/settings/profile");
  });

  it("explains a conflict without saying which of its three cases it was", async () => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ linkOutcome: "link_conflict" });

    const text = (await screen.findByRole("alert")).textContent ?? "";
    // All three named, none chosen — "linked to another user" alone would
    // reveal the case the backend folds in on purpose.
    expect(text).toMatch(/already be linked/);
    expect(text).toMatch(/this or another MaintMode account/);
    expect(text).toMatch(/different account from that provider/);
    expect(text).not.toMatch(/linked to another user/i);
  });

  it.each([
    ["denied", /cancelled, or the provider refused/],
    ["failed", /didn't complete/],
  ] as const)("explains a %s link", async (outcome, copy) => {
    answer({ "GET /api/sign-in-methods": METHODS });
    renderCard({ linkOutcome: outcome });

    expect((await screen.findByRole("alert")).textContent).toMatch(copy);
  });
});
