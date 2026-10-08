import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectValueDomains, normalize } from "../../scripts/refresh-fixtures.mjs";

/**
 * The masking rules in `scripts/refresh-fixtures.mjs` — person names.
 *
 * The normaliser masked ids, timestamps and addresses but not names, so a
 * capture of the audit log committed a real person's Google display name in
 * `actor_display_name` and it had to be replaced by hand. `no-pii.test.ts`
 * cannot catch that class: a name has no shape a regex can tell from a title.
 * So the rule itself is pinned here, and every committed fixture is checked
 * against it at the end.
 *
 * Expectations are literal placeholders, never read back out of a fixture.
 */

const mask = (value: unknown) => normalize(value);

describe("person names are masked", () => {
  it.each([
    "actor_display_name",
    "target_display_name",
    "inviter_name",
    "invited_by_name",
    "inviterName",
    "first_name",
    "full_name",
  ])("by key alone: %s", (key) => {
    expect(mask({ [key]: "Jane Example" })).toEqual({ [key]: "<display-name-1>" });
  });

  it("by context: a generic name key on an object that carries an email", () => {
    expect(mask({ users: [{ email: "jane@example.test", display_name: "Jane Example" }] })).toEqual({
      users: [{ email: "<email-1>", display_name: "<display-name-1>" }],
    });
  });

  it.each(["created_by", "approver", "inviter", "actor"])(
    "by context: a generic name key under a person key (%s)",
    (parent) => {
      expect(mask({ [parent]: { id: "u", name: "Jane Example", displayName: "Jane Example" } })).toEqual({
        [parent]: { id: "u", name: "<display-name-1>", displayName: "<display-name-1>" },
      });
    },
  );

  it("leaves labels that are not people alone", () => {
    // Providers, integration config, resources and channels all use
    // `name` / `display_name` for a thing, not a person.
    const labels = {
      methods: [{ id: "google", type: "redirect", display_name: "Google" }],
      integrations: [{ name: "smtp", config: { display_name: "Corporate SSO", username: "noc" } }],
      resources: [{ id: "r-1", name: "db-primary" }],
    };
    expect(mask(labels)).toEqual(labels);
  });

  it("gives one person one placeholder, and two people two", () => {
    expect(
      mask({
        logs: [
          { actor_display_name: "Jane Example" },
          { actor_display_name: "John Sample" },
          { actor_display_name: "Jane Example" },
        ],
      }),
    ).toEqual({
      logs: [
        { actor_display_name: "<display-name-1>" },
        { actor_display_name: "<display-name-2>" },
        { actor_display_name: "<display-name-1>" },
      ],
    });
  });

  it("stamps a name that fell back to the address as that address", () => {
    expect(mask({ user: { email: "jane@example.test", display_name: "jane@example.test" } })).toEqual({
      user: { email: "<email-1>", display_name: "<email-1>" },
    });
  });

  it("keeps the backend's own constants, which are not anyone's name", () => {
    const constants = {
      logs: [{ actor_display_name: "Break-glass admin" }],
      created_by: { display_name: "Unknown user" },
    };
    expect(mask(constants)).toEqual(constants);
  });

  it("never turns a number, boolean, null or empty name into a string", () => {
    // A previous hole masked facet counts into strings; types are the contract.
    const typed = {
      total: 50,
      facets: { all: 3, users: 0, sign_in: 2 },
      user: { name: 7, display_name: null, full_name: "" },
      actor_display_name: false,
    };
    expect(mask(typed)).toEqual(typed);
  });

  it("is a no-op on its own output, so a committed fixture re-normalises identically", () => {
    const once = mask({
      users: [{ email: "jane@example.test", display_name: "Jane Example" }],
      logs: [{ actor_display_name: "John Sample" }],
    });
    expect(mask(once)).toEqual(once);
  });
});

describe("value domains carry no person names", () => {
  it("drops a contextual name from person rows and keeps the enum next to it", () => {
    const domains = collectValueDomains([
      { email: "a@example.test", display_name: "Jane Example", role: "admin" },
      { email: "b@example.test", display_name: "John Sample", role: "reviewer" },
    ]);
    expect(domains).not.toHaveProperty("display_name");
    expect(domains.role).toEqual(["admin", "reviewer"]);
  });

  it("masks a key-named name once the domain is normalised", () => {
    const domains = normalize(collectValueDomains([{ actor_display_name: "Jane Example" }]));
    expect(domains).toEqual({ actor_display_name: ["<display-name-1>"] });
  });
});

describe("committed wire fixtures carry no unmasked person name", () => {
  const dir = join(process.cwd(), "tests/fixtures/wire");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));

  /** Paths where the normaliser would replace a value with a name placeholder. */
  function unmaskedNames(before: unknown, after: unknown, path = "$"): string[] {
    if (typeof after === "string" && after.startsWith("<display-name-") && before !== after) {
      return [`${path} = ${JSON.stringify(before)}`];
    }
    if (before && after && typeof before === "object" && typeof after === "object") {
      return Object.keys(after).flatMap((k) =>
        unmaskedNames(
          (before as Record<string, unknown>)[k],
          (after as Record<string, unknown>)[k],
          `${path}.${k}`,
        ),
      );
    }
    return [];
  }

  it("finds fixtures to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s", (file) => {
    const body: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
    expect(unmaskedNames(body, normalize(body))).toEqual([]);
  });
});
