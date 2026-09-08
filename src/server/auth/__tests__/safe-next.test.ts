import { describe, expect, it } from "vitest";

import { safeNext } from "../safe-next";

describe("safeNext", () => {
  it("passes simple absolute paths through unchanged", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/maintenance/m-1001")).toBe("/maintenance/m-1001");
  });

  it("preserves query and fragment", () => {
    expect(safeNext("/foo?bar=baz")).toBe("/foo?bar=baz");
    expect(safeNext("/foo?bar=baz#qux")).toBe("/foo?bar=baz#qux");
  });

  it("falls back to / when the value is empty", () => {
    expect(safeNext("")).toBe("/");
  });

  it("rejects values that do not start with /", () => {
    expect(safeNext("foo")).toBe("/");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("rejects protocol-relative URLs (// → cross-origin)", () => {
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("//evil.test/foo")).toBe("/");
  });

  it("rejects /\\... which browsers may normalise to //", () => {
    expect(safeNext("/\\evil.test")).toBe("/");
  });

  it("rejects values containing CR, LF, NUL, or backslash anywhere", () => {
    expect(safeNext("/foo\r/bar")).toBe("/");
    expect(safeNext("/foo\n/bar")).toBe("/");
    expect(safeNext("/foo\0/bar")).toBe("/");
    expect(safeNext("/foo\\evil.test")).toBe("/");
    expect(safeNext("/?bar=baz\nx-injected: true")).toBe("/");
  });

  it("accepts a deeply nested path that contains a benign next param", () => {
    // The inner `?next=/x` is fine — it's just a query value, not a header.
    expect(safeNext("/?next=/x")).toBe("/?next=/x");
  });

  it("rejects a value that nests a protocol-relative URL but does not start with it", () => {
    // The outer string is "/foo" so it does NOT start with "//", but the
    // injected backslash still trips the CR/LF/NUL/backslash filter.
    expect(safeNext("/foo\\")).toBe("/");
  });
  /**
   * TAB is stripped by URL parsers exactly like CR, LF and NUL, so `/<TAB>//host`
   * is parsed as `//host` — protocol-relative — while a `startsWith("//")` check
   * never sees it. The character list this function used to carry named the
   * other three and missed this one, which is why the check is now a range plus
   * a resolution test rather than an enumeration.
   *
   * Reached from `/login?next=/%09//evil.test`, it produced an off-origin
   * redirect immediately after a successful sign-in.
   */
  it.each([
    ["tab between the slashes", "/\t//evil.test"],
    ["tab before the slashes", "\t//evil.test"],
    ["form feed", "/\f//evil.test"],
    ["vertical tab", "/\v//evil.test"],
    ["leading space", "/ //evil.test"],
    ["del", "/\u007f//evil.test"],
  ])("rejects %s", (_case, value) => {
    expect(safeNext(value)).toBe("/");
  });

  it("still returns ordinary destinations untouched", () => {
    expect(safeNext("/calendar?view=week#today")).toBe("/calendar?view=week#today");
  });
});
