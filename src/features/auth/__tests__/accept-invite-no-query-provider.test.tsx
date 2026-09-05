// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage } from "../accept-invite-page";
import { LoginPage } from "../login-page";

afterEach(() => cleanup());

const noopAccept = vi.fn(async () => {});

/**
 * T11↔T12 guard, extended to `/login` by RUK-288 (AC-8).
 *
 * T12 splits the root layout so public routes stop shipping the authenticated
 * provider stack, which means both `/accept-invite` and `/login` render with NO
 * `QueryClientProvider` above them. If either page ever calls `useQuery` again,
 * its users get a white screen ("No QueryClient set") — and for `/login` that
 * is every user of the product, on the cold-start route.
 *
 * These tests render the pages WITHOUT any provider. They are written so they
 * cannot pass vacuously: the first one asserts that the bare `useQuery` control
 * really does throw in this exact environment, which is what gives each page's
 * successful render its meaning.
 */
describe("public pages render without a QueryClientProvider", () => {
  it("CONTROL: useQuery without a provider throws in this environment", () => {
    function Bare() {
      useQuery({ queryKey: ["control"], queryFn: async () => "x" });
      return <p>unreachable</p>;
    }

    // React logs the error boundary-less throw; silence it for this one case.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Bare />)).toThrow(/No QueryClient set/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each(["valid", "invalid", "missing", "expired", "accepted", "revoked", "unknown_error"] as const)(
    "renders the %s state with no provider in the tree",
    (status) => {
      expect(() =>
        render(
          <AcceptInvitePage
            token={status === "missing" ? undefined : "tok-1"}
            preview={{ status }}
            acceptAction={noopAccept}
          />,
        ),
      ).not.toThrow();

      // Rendered real content, not an empty tree.
      expect(screen.getByRole("main")).toBeTruthy();
    },
  );

  it("renders /login with no provider in the tree", () => {
    // Same hazard as accept-invite: `(public)` mounts ThemeProvider only, so a
    // `useQuery` anywhere under the login page white-screens every sign-in.
    const inert = {
      signInAction: async () => {},
      requestOtpAction: async () => ({}),
      otpSignInAction: async () => ({}),
      passwordSignInAction: async () => ({}),
      changeEmailAction: async () => {},
    };

    expect(() =>
      render(
        <LoginPage
          methods={[
            { id: "email_password", type: "password", display_name: "Password" },
            { id: "email_otp", type: "code", display_name: "Email code" },
          ]}
          {...inert}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("reaches no @tanstack/react-query import anywhere in either page module graph", async () => {
    // A render-time assertion only proves the hook wasn't hit on THIS path. This
    // walks the transitive import graph of the page module instead, so a query
    // reintroduced behind a branch — or inside a module the page merely imports
    // — still fails the test.
    const { readFile } = await import("node:fs/promises");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const featureDir = dirname(fileURLToPath(import.meta.url));
    const srcRoot = resolve(featureDir, "../../..");
    // `/login` is guarded alongside `/accept-invite`: it is the cold-start route
    // for every session, and RUK-288 grew it two forms' worth of new modules —
    // exactly the change that could drag React Query back in (RUK-288 AC-8).
    const entries = [
      resolve(featureDir, "../accept-invite-page.tsx"),
      resolve(featureDir, "../login-page.tsx"),
    ];

    const importPattern = /(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
    const seen = new Set<string>();
    const offenders: string[] = [];

    async function resolveSpecifier(spec: string, fromFile: string) {
      const base = spec.startsWith("@/")
        ? resolve(srcRoot, spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(fromFile), spec)
          : null;
      if (!base) return null;

      for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
        try {
          await readFile(candidate, "utf8");
          return candidate;
        } catch {
          // try the next extension
        }
      }
      return null;
    }

    async function walk(file: string) {
      if (seen.has(file)) return;
      seen.add(file);

      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const spec = match[1];
        if (spec === "@tanstack/react-query") {
          offenders.push(`${file.slice(srcRoot.length + 1)} imports ${spec}`);
          continue;
        }
        const resolved = await resolveSpecifier(spec, file);
        if (resolved) await walk(resolved);
      }
    }

    for (const entry of entries) {
      await walk(entry);
    }

    // Sanity: the walk actually traversed something beyond the entry file. Without
    // this the test would pass just as happily on a broken resolver.
    expect(seen.size).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});
