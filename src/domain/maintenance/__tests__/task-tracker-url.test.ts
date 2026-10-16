import { describe, expect, it } from "vitest";

import { MAX_TASK_TRACKER_URL_LENGTH, taskTrackerLink, taskTrackerUrlError } from "../task-tracker-url";

/**
 * The refused and accepted inputs are the backend's own table
 * (`internal/utils/xvalidation/http_link_url_test.go`, branch
 * `feature/maint-tracker-link`), copied as literals. The point of the client
 * copy is that it is never looser than the backend, so the backend's examples —
 * not this implementation's — are what it answers to.
 */
const BACKEND_REFUSES: Record<string, string> = {
  "longer than 2048 bytes": "https://x.io/" + "a".repeat(2048),
  "inner space": "https://x.io/a b",
  "inner control char": "https://x.io/a\tb",
  "bidi override": "https://x.io/‮txt",
  "zero-width space": "https://x.io/a​b",
  "raw non-ASCII host": "https://рф.com/t",
  "less-than": "https://x.io/<a",
  "greater-than": "https://x.io/a>",
  pipe: "https://x.io/a|Open",
  "double quote": 'https://x.io/"a',
  "unparseable port": "https://x.io:abc/",
  relative: "jira/ABC-1",
  "scheme without host": "https://",
  "port without host": "https://:443/x",
  "ftp scheme": "ftp://x.io/f",
  "javascript scheme": "javascript://x.io/%0aalert(1)",
  "percent-encoded host": "https://%D1%80%D1%84.com/t",
  "user and password": "https://u:p@x.io",
  "empty userinfo": "https://@x.io",
  "password alone": "https://:p@x.io",
  "no host and wrong scheme": "ftp:///f",
  "wrong scheme and userinfo": "ftp://u:p@x.io/f",
};

const BACKEND_ACCEPTS: Record<string, string> = {
  empty: "",
  "public https": "https://linear.app/team/issue/ENG-1",
  "plain http internal host": "http://jira.internal/browse/X-1",
  "private address": "https://10.0.0.5/issue/1",
  "query with entity-like key": "https://x.io/a?b=1&not=2",
  "punycode host": "https://xn--80ak6aa92e.com/t/1",
  "exactly 2048 bytes": "https://x.io/" + "a".repeat(2048 - "https://x.io/".length),
};

describe("taskTrackerUrlError", () => {
  it("caps the length where the backend does", () => {
    expect(MAX_TASK_TRACKER_URL_LENGTH).toBe(2048);
  });

  it.each(Object.entries(BACKEND_REFUSES))("refuses what the backend refuses: %s", (_name, raw) => {
    const error = taskTrackerUrlError(raw);

    expect(error).not.toBeNull();
    // Same rule as the backend's: a URL can carry a token, so the message never
    // repeats the value it refuses.
    expect(error).not.toContain("x.io");
  });

  it.each(Object.entries(BACKEND_ACCEPTS))("accepts what the backend accepts: %s", (_name, raw) => {
    expect(taskTrackerUrlError(raw)).toBeNull();
  });

  // The WHATWG parser repairs each of these into a valid URL; Go's does not.
  // Trusting `new URL()` alone would let the form pass a value the backend 400s.
  it.each([
    ["backslashes in place of slashes", "https:\\\\x.io/t"],
    ["a single slash after the scheme", "https:/x.io/t"],
    ["no slashes after the scheme", "https:x.io/t"],
  ])("refuses what the browser parser would repair: %s", (_name, raw) => {
    expect(taskTrackerUrlError(raw)).not.toBeNull();
  });

  it("does not trim — a padded value is refused, so callers must trim first", () => {
    expect(taskTrackerUrlError(" https://x.io/t ")).not.toBeNull();
  });

  it("accepts an upper-case scheme, as Go lower-cases it before checking", () => {
    expect(taskTrackerUrlError("HTTPS://x.io/t")).toBeNull();
  });
});

describe("taskTrackerLink", () => {
  it("splits the host from the rest so the page can show where the link really goes", () => {
    expect(taskTrackerLink("https://jira.example.com/browse/OPS-42")).toEqual({
      href: "https://jira.example.com/browse/OPS-42",
      host: "jira.example.com",
      rest: "/browse/OPS-42",
    });
  });

  it("names the real host of a link disguised as another", () => {
    expect(taskTrackerLink("https://evil.com#@jira.example.com")?.host).toBe("evil.com");
  });

  it("keeps the port, query and fragment", () => {
    expect(taskTrackerLink("http://jira.internal:8080/x?y=1#z")).toMatchObject({
      host: "jira.internal:8080",
      rest: "/x?y=1#z",
    });
  });

  it("shows nothing after the host for a bare origin", () => {
    expect(taskTrackerLink("https://x.io")?.rest).toBe("");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["a relative path", "/browse/OPS-1"],
    ["empty", ""],
    ["absent", undefined],
  ])("renders no link for %s", (_name, raw) => {
    expect(taskTrackerLink(raw)).toBeNull();
  });
});
