import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STATUSES,
  FILTERS_STORAGE_KEY,
  defaultFilterState,
  readStoredFilters,
  serializeFilters,
  type CalendarFilterState,
} from "../calendar-filters";

// Minimal in-memory localStorage on a global `window` — `readStoredFilters`
// only needs `typeof window !== "undefined"` and `window.localStorage`, so this
// keeps the suite in the fast `node` environment without depending on jsdom's
// (flaky here) Storage implementation.
beforeEach(() => {
  const store = new Map<string, string>();
  const localStorage: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { window?: { localStorage: Storage } }).window = { localStorage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const state = (over: Partial<CalendarFilterState> = {}): CalendarFilterState => ({
  ...defaultFilterState(),
  ...over,
});

describe("serializeFilters", () => {
  it("projects statuses (as array) + scope, dropping the resource selection", () => {
    const out = serializeFilters(
      state({
        statuses: new Set(["completed", "canceled"]),
        scope: "global",
        resources: new Map([["r-1", "db"]]),
      }),
    );
    expect(out).toEqual({ statuses: ["completed", "canceled"], scope: "global" });
    expect("resources" in out).toBe(false);
  });
});

describe("readStoredFilters", () => {
  it("returns the default state when nothing is stored", () => {
    const f = readStoredFilters();
    expect([...f.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
    expect(f.scope).toBe("all");
    expect(f.resources.size).toBe(0);
  });

  it("round-trips a persisted selection", () => {
    const original = state({ statuses: new Set(["draft", "completed"]), scope: "resource" });
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(serializeFilters(original)));

    const f = readStoredFilters();
    expect([...f.statuses].sort()).toEqual(["completed", "draft"]);
    expect(f.scope).toBe("resource");
    expect(f.resources.size).toBe(0); // never restored
  });

  it("drops unknown statuses and falls back when none remain", () => {
    window.localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({ statuses: ["planned", "bogus"], scope: "all" }),
    );
    expect([...readStoredFilters().statuses].sort()).toEqual(["planned"]);

    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ statuses: ["bogus"], scope: "all" }));
    // All-invalid → defaults, not an empty "show nothing" set.
    expect([...readStoredFilters().statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
  });

  it("ignores an empty status array (treats it as corruption, not 'hide all')", () => {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ statuses: [], scope: "all" }));
    expect([...readStoredFilters().statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
  });

  it("falls back to scope 'all' for an unknown scope value", () => {
    window.localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({ statuses: ["planned"], scope: "nonsense" }),
    );
    expect(readStoredFilters().scope).toBe("all");
  });

  it("returns defaults for malformed JSON instead of throwing", () => {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, "{not json");
    const f = readStoredFilters();
    expect([...f.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
    expect(f.scope).toBe("all");
  });

  it("returns defaults when statuses is present but not an array", () => {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ statuses: "planned", scope: "all" }));
    expect([...readStoredFilters().statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
  });

  it("returns defaults for valid-but-non-object JSON (e.g. null, a bare array)", () => {
    for (const raw of ["null", "true", "42", "[]", '"planned"']) {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, raw);
      const f = readStoredFilters();
      expect([...f.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
      expect(f.scope).toBe("all");
    }
  });

  it("returns defaults when localStorage.getItem throws (private mode / disabled)", () => {
    (window as unknown as { localStorage: Storage }).localStorage = {
      ...window.localStorage,
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    const f = readStoredFilters();
    expect([...f.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
    expect(f.scope).toBe("all");
  });
});

describe("readStoredFilters — SSR (no window)", () => {
  it("returns defaults without touching storage when window is undefined", () => {
    // The global stub is installed per-test in beforeEach; remove it to simulate
    // a server render, exercising the `typeof window === 'undefined'` guard.
    delete (globalThis as { window?: unknown }).window;
    const f = readStoredFilters();
    expect([...f.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
    expect(f.scope).toBe("all");
    expect(f.resources.size).toBe(0);
  });
});
