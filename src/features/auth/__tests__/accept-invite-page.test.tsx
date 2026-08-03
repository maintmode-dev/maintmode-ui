// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage, type InvitationPreviewResult } from "../accept-invite-page";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

const noopAccept = vi.fn(async () => {});

function renderPage(preview: InvitationPreviewResult, token?: string) {
  render(<AcceptInvitePage token={token} preview={preview} acceptAction={noopAccept} />);
}

describe("AcceptInvitePage token states", () => {
  it("renders the sign-in affordance for a valid invite", () => {
    renderPage({ status: "valid" }, "tok-1");

    expect(screen.getByRole("heading").textContent).toContain("You've been invited");
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  it("renders the invalid copy for an unknown token, with no sign-in affordance", () => {
    renderPage({ status: "invalid" }, "tok-unknown");

    expect(screen.getByText("Invalid invitation link")).toBeTruthy();
    // The whole point of the invalid state: never offer to sign in.
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to login" })).toBeTruthy();
  });

  it("renders the incomplete-link copy when the URL carries no token", () => {
    renderPage({ status: "missing" }, undefined);

    expect(screen.getByText("Invitation link is incomplete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["accepted", "This invitation has already been claimed"],
    ["revoked", "This invitation has been revoked"],
  ] as const)("renders the terminal copy for %s", (status, title) => {
    renderPage({ status }, "tok-1");

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("offers a token-preserving retry link when the preview could not be verified", () => {
    renderPage({ status: "unknown_error" }, "tok abc&x");

    const retry = screen.getByRole("link", { name: /Try again/ });
    // Retrying must re-request THIS invite, and the token must survive encoding.
    expect(retry.getAttribute("href")).toBe("/accept-invite?token=tok%20abc%26x");
  });

  it("falls back to Go to login on an unverifiable preview with no token to retry", () => {
    renderPage({ status: "unknown_error" }, undefined);

    expect(screen.queryByRole("link", { name: /Try again/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to login" })).toBeTruthy();
  });

  it("never renders email, roles, or inviter even if the server widened the payload", () => {
    const leaky = {
      status: "valid",
      suggested_provider: "google",
      email: "victim@corp.test",
      roles: ["admin"],
    } as unknown as InvitationPreviewResult;

    renderPage(leaky, "tok-1");

    expect(document.body.textContent).not.toContain("victim@corp.test");
    expect(document.body.textContent).not.toContain("admin");
  });

  it("treats an unrecognized suggested_provider as the Google default", () => {
    renderPage({ status: "valid", suggested_provider: "saml-corp" }, "tok-1");

    const button = screen.getByRole("button", { name: /Continue with Google/ });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("disables the button and explains when the backend suggests GitHub", () => {
    renderPage({ status: "valid", suggested_provider: "github" }, "tok-1");

    const button = screen.getByRole("button", { name: /Continue with GitHub/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Other providers are coming soon/)).toBeTruthy();
  });
});
