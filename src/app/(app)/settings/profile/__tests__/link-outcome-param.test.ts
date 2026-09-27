import { describe, expect, it, vi } from "vitest";

/**
 * GAP-2 (v0.2.0-rc) — the profile page is where the OAuth receiver's link
 * outcome (`?linked=1` / `?link_error=<code>`) enters the UI, and the page's
 * check is the only thing between the address bar and the card.
 *
 * The receiver writes only the closed set, but anyone can type a URL. The
 * card words `link_error` from a lookup table and toasts success for
 * `"linked"`, so what this page must refuse is anything the receiver would not
 * have written — in particular `?link_error=linked`, which a check against the
 * wider `LinkOutcome` set would turn into a "connected" toast for a link that
 * never happened.
 *
 * The children are stubbed: the property is the prop the page hands down, and
 * rendering the shell would need a session.
 */

vi.mock("@/app/_components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/features/settings/user-settings-page", () => ({ UserSettingsPage: () => null }));

const { default: Page } = await import("@/app/(app)/settings/profile/page");

async function outcomeFor(params: { linked?: string; link_error?: string }): Promise<unknown> {
  const shell = (await Page({ searchParams: Promise.resolve(params) })) as {
    props: { children: { props: { linkOutcome?: unknown } } };
  };
  return shell.props.children.props.linkOutcome;
}

describe("the profile reads a link outcome from the address bar", () => {
  it("reads linked=1 as a completed link", async () => {
    expect(await outcomeFor({ linked: "1" })).toBe("linked");
  });

  it.each(["link_conflict", "denied", "failed"])("passes the failure %s through", async (code) => {
    expect(await outcomeFor({ link_error: code })).toBe(code);
  });

  it.each([
    ["an unknown code", { link_error: "<img src=x onerror=alert(1)>" }],
    ["the success value smuggled in as an error", { link_error: "linked" }],
    ["a linked flag other than 1", { linked: "true" }],
    ["nothing at all", {}],
  ])("hands down no outcome for %s", async (_label, params) => {
    expect(await outcomeFor(params)).toBeUndefined();
  });
});
