import { describe, expect, it } from "vitest";

import { validateTag } from "@/domain/admin/messenger-tag";

describe("validateTag", () => {
  it("treats empty and whitespace-only input as a clear, not an error", () => {
    expect(validateTag("")).toBeNull();
    expect(validateTag("   ")).toBeNull();
  });

  it("accepts real handles, with or without a leading @", () => {
    expect(validateTag("@username")).toBeNull();
    expect(validateTag("username")).toBeNull();
  });

  it("accepts handles that merely resemble broadcast words (exact match only)", () => {
    expect(validateTag("@admin")).toBeNull();
    expect(validateTag("@group")).toBeNull();
    expect(validateTag("@all")).toBeNull();
    expect(validateTag("@channels")).toBeNull();
    expect(validateTag("@here_now")).toBeNull();
  });

  it("refuses the three reserved words on both transports, ignoring case and @", () => {
    expect(validateTag("here")).toBe("reserved");
    expect(validateTag("@HERE")).toBe("reserved");
    expect(validateTag("channel")).toBe("reserved");
    expect(validateTag("@channel")).toBe("reserved");
    expect(validateTag("everyone")).toBe("reserved");
    expect(validateTag("@EveryOne")).toBe("reserved");
  });

  it("accepts a trailing newline, which trim() removes before any check", () => {
    // Verified against the backend: canonicalMessengerTag("username\n") returns
    // ("username", true) — Go's TrimSpace strips the trailing \n exactly as JS
    // trim() does, so the server stores it. Refusing it here would be a false
    // refusal on a common copy-paste artifact.
    expect(validateTag("username\n")).toBeNull();
  });

  it("refuses a newline inside the tag", () => {
    // The interior case is the one the backend rejects ("foo\nbar" → invalid),
    // and it is the newline case the ASCII pattern actually guards.
    expect(validateTag("foo\nbar")).toBe("invalid_format");
  });

  // Documents intent, and is HONEST about what it proves: TAG_PATTERN's ASCII
  // charset already rejects all three, so deleting the explicit line-separator
  // guard in validateTag leaves this test GREEN. The guard's stated value is
  // surviving a future widening of that charset — an interior line break is a
  // notification-injection vector — and that value is not expressible while the
  // pattern alone is this strict. Kept as executable documentation of the
  // requirement, not as a regression test for the guard.
  it("refuses U+2028/U+2029 line separators, which trim() does not remove", () => {
    expect(validateTag("foo\u2028bar")).toBe("invalid_format");
    expect(validateTag("foo\u2029bar")).toBe("invalid_format");
    expect(validateTag("foo\rbar")).toBe("invalid_format");
  });

  it("accepts a 63-character body and refuses a 64-character one", () => {
    expect(validateTag(`@${"a".repeat(63)}`)).toBeNull();
    expect(validateTag(`@${"a".repeat(64)}`)).toBe("invalid_format");
  });

  it("reports overlong Cyrillic as a format error, not a length error", () => {
    // Charset is checked before length, mirroring the backend's order.
    expect(validateTag("а".repeat(65))).toBe("invalid_format");
  });

  it("refuses a leading non-alphanumeric character", () => {
    expect(validateTag("-lead")).toBe("invalid_format");
    expect(validateTag(".lead")).toBe("invalid_format");
    expect(validateTag("_lead")).toBe("invalid_format");
    expect(validateTag("@")).toBe("invalid_format");
    expect(validateTag(".")).toBe("invalid_format");
  });

  it("refuses an @ or a space inside the tag", () => {
    expect(validateTag("ab@cd")).toBe("invalid_format");
    expect(validateTag("@@username")).toBe("invalid_format");
    expect(validateTag("rus lan")).toBe("invalid_format");
  });
});

describe("validateTag — whitespace parity with Go's TrimSpace", () => {
  // JS `trim()` and Go `strings.TrimSpace` strip DIFFERENT character sets, in
  // both directions. Verified by running both implementations over these exact
  // inputs; see the GO_SPACE comment in messenger-tag.ts.
  it("refuses a BOM, which trim() removes but the backend keeps", () => {
    // U+FEFF survives Go's TrimSpace, so the backend sees it, fails its own
    // pattern and answers 400 — an error the UI cannot attribute to a field,
    // since tag and timezone share one error code (SPEC §1.5). Refuse it here.
    expect(validateTag("﻿username")).toBe("invalid_format");
    expect(validateTag("username﻿")).toBe("invalid_format");
  });

  it("accepts a NEL-padded handle, which the backend trims and stores", () => {
    // U+0085 is whitespace to Go but not to JS trim(). Refusing it would be a
    // false refusal: the backend accepts it and stores "username".
    expect(validateTag("username")).toBeNull();
    expect(validateTag("username")).toBeNull();
  });

  it("treats NBSP-only input as a clear, matching the backend", () => {
    expect(validateTag(" ")).toBeNull();
  });
});
