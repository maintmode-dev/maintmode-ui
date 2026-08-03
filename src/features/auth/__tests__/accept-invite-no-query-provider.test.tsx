// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage } from "../accept-invite-page";

afterEach(() => cleanup());

const noopAccept = vi.fn(async () => {});

/**
 * T11↔T12 guard. T12 splits the root layout so public routes stop shipping the
 * authenticated provider stack, which means `/accept-invite` will render with
 * NO `QueryClientProvider` above it. If this page ever calls `useQuery` again,
 * every invited user gets a white screen ("No QueryClient set").
 *
 * These tests render the page WITHOUT any provider. Note that they are written
 * so they cannot pass vacuously: the first one asserts that the bare `useQuery`
 * control really does throw in this exact environment, which is what gives the
 * page's own successful render its meaning.
 */
describe("/accept-invite renders without a QueryClientProvider", () => {
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

  it("reaches no @tanstack/react-query import anywhere in the page module graph", async () => {
    // A render-time assertion only proves the hook wasn't hit on THIS path. This
    // walks the transitive import graph of the page module instead, so a query
    // reintroduced behind a branch — or inside a module the page merely imports
    // — still fails the test.
    const { readFile } = await import("node:fs/promises");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const featureDir = dirname(fileURLToPath(import.meta.url));
    const srcRoot = resolve(featureDir, "../../..");
    const entry = resolve(featureDir, "../accept-invite-page.tsx");

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

    await walk(entry);

    // Sanity: the walk actually traversed something beyond the entry file. Without
    // this the test would pass just as happily on a broken resolver.
    expect(seen.size).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});
