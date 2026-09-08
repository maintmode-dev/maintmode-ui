import { describe, expect, it } from "vitest";

import { parseRememberMe } from "@/server/auth/parse-remember-me";

/**
 * RUK-290, SPEC §3.2, AC 15 — the fail-closed decision itself.
 *
 * This exists because an earlier version of this check asserted on the *source
 * text* of `authorize` (`toContain('... === "true"')`), and that assertion was
 * not a guard at all: writing
 *
 *   const rememberMe = !(credentials?.rememberMe === "true");
 *
 * keeps the substring intact, inverts the meaning, and passed the entire
 * suite — 1453 unit tests and 219 contract tests green while every user who
 * unticked the box was granted a long session. A test that a semantic inversion
 * survives is decoration.
 *
 * So the parser was moved into its own NextAuth-free module and is called here.
 * The cases below are chosen to fail under each realistic wrong implementation
 * rather than to enumerate inputs:
 *
 *   - `Boolean(v)` / `!!v`      → the `"false"` and `"0"` cases fail
 *   - `!(v === "true")`         → every case fails
 *   - `v !== "false"`           → the `undefined` and junk cases fail
 *   - a case-insensitive compare → the `"TRUE"` case fails
 */
describe('parseRememberMe — only the exact string "true" is a yes', () => {
  it("accepts the one value the client is specified to send", () => {
    expect(parseRememberMe("true")).toBe(true);
  });

  it('reads "false" as no, where a Boolean() coercion would say yes', () => {
    // `Boolean("false") === true`. This is the case the whole function is for.
    expect(parseRememberMe("false")).toBe(false);
  });

  it.each([
    ["an absent value", undefined],
    ["a null", null],
    ["an empty string", ""],
    ["a numeric-looking truthy string", "1"],
    ["a differently-cased spelling", "TRUE"],
    ["whitespace padding", " true "],
    ["a real boolean rather than the string", true],
    ["an object", {}],
  ])("reads %s as no", (_label, value) => {
    expect(parseRememberMe(value)).toBe(false);
  });
});
