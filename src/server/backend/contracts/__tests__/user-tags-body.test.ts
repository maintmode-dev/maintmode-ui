import { describe, expect, it } from "vitest";

import { buildUserTagsBody } from "../user-tags-body";
import { readCappedJsonBody } from "@/server/backend/http/read-json-body";
import { BffValidationError } from "@/server/backend/errors/bff-error";

/**
 * Presence, not value, is the contract here: `{}` and `{telegram_tag: null}`
 * mean opposite things to the backend ("don't touch" vs "clear"). So every
 * assertion goes through `Object.keys` — `toEqual`/`JSON.stringify` drop
 * `undefined` values and would pass on an implementation that emits
 * `{telegram_tag: undefined}` for an absent key.
 */
describe("buildUserTagsBody", () => {
  it("forwards a present tag verbatim, keeping the leading @", () => {
    const body = buildUserTagsBody({ telegram_tag: "@x" });

    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBe("@x");
  });

  it("leaves an absent key absent", () => {
    const body = buildUserTagsBody({});

    expect(Object.keys(body)).toEqual([]);
  });

  it.each([
    ["null", null],
    ["empty string", ""],
    ["whitespace only", "   "],
  ])("emits the key with a null value to clear the tag (%s)", (_label, value) => {
    const body = buildUserTagsBody({ telegram_tag: value });

    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBeNull();
  });

  // Presence is the contract, and `undefined` is the one value where presence
  // and truthiness disagree. `{telegram_tag: undefined}` was WRITTEN by the
  // caller, so it means "clear", not "don't touch" — a `record[key] !==
  // undefined` check would silently downgrade the clear to a no-op and the tag
  // would survive a deletion the admin asked for.
  it("treats an explicitly-undefined value as a clear, not an absent key", () => {
    const body = buildUserTagsBody({ telegram_tag: undefined });

    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBeNull();
  });

  // The bare-`[]` case above is caught by `!parsed || typeof !== "object"`?
  // No — an array IS a truthy object, so only `Array.isArray` stops it. A bare
  // array has no `telegram_tag`, so it can never demonstrate that. Hanging the
  // key on the array as an own property is what makes the guard load-bearing.
  it("returns {} for an array carrying telegram_tag as an own property", () => {
    const arr: string[] & { telegram_tag?: string } = [];
    arr.telegram_tag = "@sneaky";

    const body = buildUserTagsBody(arr);

    expect(Object.keys(body)).toEqual([]);
    expect(body).not.toHaveProperty("telegram_tag");
  });

  // AC11 — the guarantee that makes the SPEC §1.3 trap unreachable.
  it("never forwards timezone alongside an allowed key", () => {
    const body = buildUserTagsBody({ timezone: "Asia/Nicosia", telegram_tag: "@x" });

    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body).not.toHaveProperty("timezone");
  });

  it("never forwards timezone on its own", () => {
    const body = buildUserTagsBody({ timezone: "Asia/Nicosia" });

    expect(Object.keys(body)).toEqual([]);
    expect(body).not.toHaveProperty("timezone");
  });

  it("drops every other unknown key", () => {
    const body = buildUserTagsBody({ id: "u-1", email: "a@b.c", roles: ["admin"], slack_tag: "s" });

    expect(Object.keys(body)).toEqual(["slack_tag"]);
  });

  it("carries both tags when both are present", () => {
    const body = buildUserTagsBody({ telegram_tag: "@tg", slack_tag: "@sl" });

    expect(Object.keys(body).sort()).toEqual(["slack_tag", "telegram_tag"]);
    expect(body.telegram_tag).toBe("@tg");
    expect(body.slack_tag).toBe("@sl");
  });

  it("trims outer whitespace without touching the leading @", () => {
    const body = buildUserTagsBody({ telegram_tag: " @ruslan " });

    expect(body.telegram_tag).toBe("@ruslan");
  });

  it.each([
    ["null", null],
    ["number", 42],
    ["string", "str"],
    ["array", []],
    ["undefined", undefined],
  ])("returns {} without throwing for non-object input (%s)", (_label, input) => {
    let body;
    expect(() => {
      body = buildUserTagsBody(input);
    }).not.toThrow();

    expect(Object.keys(body!)).toEqual([]);
  });

  // Documented choice: an explicitly-present key whose value isn't a string is
  // read as "clear", never as "don't touch" and never forwarded verbatim.
  it.each([
    ["number", 42],
    ["object", {}],
    ["array", []],
    ["boolean", true],
  ])("treats a non-string value on an allowed key as a clear (%s)", (_label, value) => {
    const body = buildUserTagsBody({ telegram_tag: value });

    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBeNull();
  });
});

function jsonRequest(raw: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/admin/users/u-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
}

describe("readCappedJsonBody", () => {
  const CAP = 4 * 1024;

  it("parses a valid small body", async () => {
    const parsed = await readCappedJsonBody<{ telegram_tag: string }>(
      jsonRequest(JSON.stringify({ telegram_tag: "@x" })),
      CAP,
    );

    expect(parsed.telegram_tag).toBe("@x");
  });

  it("rejects when the declared content-length exceeds the cap", async () => {
    // Header lies about a tiny body — the cheap check must fire before reading.
    const request = jsonRequest("{}", { "content-length": String(CAP + 1) });

    await expect(readCappedJsonBody(request, CAP)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it("rejects when the actual body exceeds the cap", async () => {
    const oversized = JSON.stringify({ telegram_tag: "x".repeat(CAP) });
    const request = jsonRequest(oversized);
    request.headers.delete("content-length");

    await expect(readCappedJsonBody(request, CAP)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  // Pins the comparison as `>`, not `>=`. The existing over-cap tests all sit
  // far from the edge, so flipping the operator rejects a body of EXACTLY
  // maxBytes — a legitimate request — while every other test stays green.
  it("accepts a body of exactly maxBytes and rejects one byte more", async () => {
    // `{"telegram_tag":"…"}` — pad the value so the serialized body lands on
    // the cap to the character.
    const envelope = JSON.stringify({ telegram_tag: "" }).length;
    const atCap = JSON.stringify({ telegram_tag: "x".repeat(CAP - envelope) });
    expect(atCap.length).toBe(CAP);

    const request = jsonRequest(atCap);
    request.headers.delete("content-length");
    const parsed = await readCappedJsonBody<{ telegram_tag: string }>(request, CAP);
    expect(parsed.telegram_tag.length).toBe(CAP - envelope);

    const overCap = JSON.stringify({ telegram_tag: "x".repeat(CAP - envelope + 1) });
    expect(overCap.length).toBe(CAP + 1);
    const tooBig = jsonRequest(overCap);
    tooBig.headers.delete("content-length");
    await expect(readCappedJsonBody(tooBig, CAP)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it("rejects invalid JSON as a validation error", async () => {
    await expect(readCappedJsonBody(jsonRequest("{not json"), CAP)).rejects.toBeInstanceOf(
      BffValidationError,
    );
    await expect(readCappedJsonBody(jsonRequest("{not json"), CAP)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("treats an empty body as 'change nothing'", async () => {
    const parsed = await readCappedJsonBody(jsonRequest(""), CAP);

    expect(Object.keys(buildUserTagsBody(parsed))).toEqual([]);
  });
});
