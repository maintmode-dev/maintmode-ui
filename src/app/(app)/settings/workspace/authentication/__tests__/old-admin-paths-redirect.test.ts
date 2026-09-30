import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import nextConfig from "../../../../../../../next.config";

const SRC = fileURLToPath(new URL("../../../../../../", import.meta.url));

/** Every source file under `src/`, tests excluded. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

/**
 * Workspace settings left the header for Settings. The old addresses must keep
 * working — bookmarks, docs, links pasted in chats — and say so permanently, so
 * browsers and crawlers learn the new ones. Each goes straight to its new page:
 * `/admin/auth-methods` does not chain through `/admin/authentication`.
 */
const MOVED = [
  ["/admin/auth-methods", "/settings/workspace/authentication"],
  ["/admin/authentication", "/settings/workspace/authentication"],
  ["/admin/integrations", "/settings/workspace/integrations"],
] as const;

describe("the old admin addresses", () => {
  it.each(MOVED)("%s answers with a permanent (308) redirect to %s", async (source, destination) => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    // Next maps `permanent: true` to 308, which keeps the method; `false` would
    // be a 307 that browsers never learn from.
    expect(redirects).toContainEqual({ source, destination, permanent: true });
  });

  it.each(MOVED)("%s has no page of its own left to shadow the redirect", (source) => {
    expect(() => statSync(join(SRC, `app/(app)${source}/page.tsx`))).toThrow();
  });

  /**
   * An in-app link to an old address still works, via one extra round trip —
   * which is exactly why nothing would notice it. The BFF routes under
   * `/api/admin/*` are a different thing and stay, and so do the
   * `features/admin/*` folders — hence matching a path that STARTS a string or a
   * URL, not any occurrence.
   */
  it("none of them is linked to from anywhere in the app", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /["'`(]\/admin\/(auth-methods|authentication|integrations)\b/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
