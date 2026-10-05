import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import nextConfig from "../../../../../../next.config";

const SRC = fileURLToPath(new URL("../../../../../", import.meta.url));

/** Every source file under `src/`, tests excluded. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

/**
 * The "Sign-in methods" tab moved into `/admin/authentication`. The old address
 * must keep working — bookmarks, the README's history, links pasted in chats —
 * and must say so permanently, so browsers and crawlers learn the new one.
 */
describe("/admin/auth-methods", () => {
  it("answers with a permanent (308) redirect to /admin/authentication", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects).toContainEqual({
      source: "/admin/auth-methods",
      destination: "/admin/authentication",
      // Next maps `permanent: true` to 308, which keeps the method; `false`
      // would be a 307 that browsers never learn from.
      permanent: true,
    });
  });

  it("has no page of its own left to shadow the redirect", () => {
    expect(() => statSync(join(SRC, "app/(app)/admin/auth-methods/page.tsx"))).toThrow();
  });

  /**
   * An in-app link to the old address still works, via one extra round trip —
   * which is exactly why nothing would notice it. The BFF routes under
   * `/api/admin/auth-methods` are a different thing and stay, and so does the
   * `features/admin/auth-methods` folder — hence matching a path that STARTS
   * a string or a URL, not any occurrence.
   */
  it("is not linked to from anywhere in the app", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /["'`(]\/admin\/auth-methods\b/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
