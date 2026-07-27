import { describe, expect, it } from "vitest";

import {
  MAX_REMINDERS,
  offsetLabel,
  REMINDER_PRESETS,
  toFireAt,
  toOffsetFromFireAt,
  toOffsetMinutes,
} from "../reminders";

describe("REMINDER_PRESETS", () => {
  it("carries the four offsets RUK-216 asks for", () => {
    expect(REMINDER_PRESETS.map((p) => p.minutes)).toEqual([10_080, 1_440, 60, 15]);
  });

  it("stays within the backend cap", () => {
    expect(REMINDER_PRESETS.length).toBeLessThanOrEqual(MAX_REMINDERS);
  });

  it("matches the backend's maxDeferredNotifications", () => {
    expect(MAX_REMINDERS).toBe(10);
  });
});

describe("toFireAt", () => {
  const start = "2026-08-01T10:00:00Z";

  it("resolves each preset against the planned start", () => {
    expect(toFireAt(start, 7 * 24 * 60)).toBe("2026-07-25T10:00:00.000Z");
    expect(toFireAt(start, 24 * 60)).toBe("2026-07-31T10:00:00.000Z");
    expect(toFireAt(start, 60)).toBe("2026-08-01T09:00:00.000Z");
    expect(toFireAt(start, 15)).toBe("2026-08-01T09:45:00.000Z");
  });

  it("handles custom offsets in minutes", () => {
    expect(toFireAt(start, 90)).toBe("2026-08-01T08:30:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(toFireAt("2027-01-01T00:30:00Z", 60)).toBe("2026-12-31T23:30:00.000Z");
  });

  it("subtracts a fixed instant across a DST transition", () => {
    // 2026-03-29 is the EU DST spring-forward. "1 day before" means 24h earlier
    // as an instant — the local wall clock shifts by an hour, which is correct
    // and is exactly why this is instant math, not calendar math.
    expect(toFireAt("2026-03-29T12:00:00Z", 24 * 60)).toBe("2026-03-28T12:00:00.000Z");
  });

  it("returns null for an unparseable start (half-typed date)", () => {
    expect(toFireAt("", 60)).toBeNull();
    expect(toFireAt("not-a-date", 60)).toBeNull();
  });

  /**
   * The DST case that actually bites. A "1 day before" reminder on a window
   * starting just after the EU spring-forward lands on a DIFFERENT wall-clock
   * hour in the operator's zone (03:00 → 02:00 local), because a fixed 24h
   * instant offset is not a calendar day. That is the intended semantic; this
   * pins the local rendering so a future switch to calendar arithmetic can't
   * slip in unnoticed.
   */
  it("shifts the local wall clock by an hour across the spring-forward", () => {
    // 2026-03-29 01:00Z is 03:00 in Europe/Belgrade (CEST, UTC+2, post-jump).
    const fireAt = toFireAt("2026-03-29T01:00:00Z", 24 * 60) as string;
    expect(fireAt).toBe("2026-03-28T01:00:00.000Z");
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Belgrade",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(fireAt));
    // Start is 03:00 local; 24h earlier reads 02:00 local, not 03:00.
    expect(local).toBe("02:00");
  });

  it("accepts an offset that lands exactly on the start (zero) without inventing a value", () => {
    expect(toFireAt(start, 0)).toBe("2026-08-01T10:00:00.000Z");
  });

  it("normalises a non-Z start offset to the same UTC instant", () => {
    // +02:00 local noon is 10:00Z, so both spellings must resolve identically.
    expect(toFireAt("2026-08-01T12:00:00+02:00", 60)).toBe(toFireAt(start, 60));
  });
});

describe("toOffsetMinutes", () => {
  it("scales by unit", () => {
    expect(toOffsetMinutes("30", "minutes")).toBe(30);
    expect(toOffsetMinutes("2", "hours")).toBe(120);
    expect(toOffsetMinutes("3", "days")).toBe(4_320);
  });

  it("tolerates surrounding whitespace", () => {
    expect(toOffsetMinutes("  45 ", "minutes")).toBe(45);
  });

  it("rejects values that are not positive whole numbers", () => {
    expect(toOffsetMinutes("", "hours")).toBeNull();
    expect(toOffsetMinutes("0", "hours")).toBeNull();
    expect(toOffsetMinutes("-3", "hours")).toBeNull();
    expect(toOffsetMinutes("1.5", "hours")).toBeNull();
    expect(toOffsetMinutes("abc", "hours")).toBeNull();
  });

  // `Number()` is lenient in ways a hand-rolled parser is not: it accepts these
  // spellings, and each one reaching the wire as a real offset is fine, but
  // silently coercing `Infinity` or a hex string into a fire_at is not.
  it("rejects the lenient-Number spellings that are not real offsets", () => {
    expect(toOffsetMinutes("Infinity", "hours")).toBeNull();
    expect(toOffsetMinutes("-Infinity", "hours")).toBeNull();
    expect(toOffsetMinutes("NaN", "hours")).toBeNull();
    // Whitespace-only is not zero.
    expect(toOffsetMinutes("   ", "hours")).toBeNull();
  });

  it("accepts alternative spellings of a whole number", () => {
    expect(toOffsetMinutes("1e2", "minutes")).toBe(100);
    expect(toOffsetMinutes("2.0", "hours")).toBe(120);
    expect(toOffsetMinutes("+5", "minutes")).toBe(5);
  });

  it("scales large values without losing precision", () => {
    expect(toOffsetMinutes("365", "days")).toBe(525_600);
  });
});

describe("toOffsetFromFireAt", () => {
  const start = "2026-08-01T10:00:00Z";

  it("inverts toFireAt for every preset", () => {
    for (const preset of REMINDER_PRESETS) {
      const fireAt = toFireAt(start, preset.minutes);
      expect(fireAt).not.toBeNull();
      expect(toOffsetFromFireAt(start, fireAt as string)).toBe(preset.minutes);
    }
  });

  it("snaps a seconds-drifted instant onto its preset", () => {
    expect(toOffsetFromFireAt(start, "2026-07-31T10:00:20Z")).toBe(1_440);
  });

  it("returns null for a reminder at or after the start", () => {
    expect(toOffsetFromFireAt(start, start)).toBeNull();
    expect(toOffsetFromFireAt(start, "2026-08-01T11:00:00Z")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(toOffsetFromFireAt("nope", "2026-07-31T10:00:00Z")).toBeNull();
    expect(toOffsetFromFireAt(start, "nope")).toBeNull();
  });

  // Hydration is offset-based, so two stored instants closer together than a
  // minute collapse onto one offset. The backend can hold both (it stores
  // instants and only caps the count), so the edit form must not assume the
  // derived offsets are distinct — see the collision test in the field suite.
  it("collapses two instants that round to the same minute onto one offset", () => {
    expect(toOffsetFromFireAt(start, "2026-07-31T10:00:10Z")).toBe(1_440);
    expect(toOffsetFromFireAt(start, "2026-07-31T09:59:55Z")).toBe(1_440);
  });

  it("round-trips a custom offset that is not a preset", () => {
    const fireAt = toFireAt(start, 5_400);
    expect(toOffsetFromFireAt(start, fireAt as string)).toBe(5_400);
  });

  // A reminder stored against an older start is re-derived against the CURRENT
  // one, so moving the window rewrites what "before" means. This is the
  // documented consequence of storing instants (SPEC §1.2), not a defect —
  // pinned so a future "preserve the original offset" change is deliberate.
  it("derives the offset from the start it is given, not the one it was saved against", () => {
    // Saved as "1 day before" a 10:00Z start; the start then moved 2h later.
    const savedFireAt = toFireAt(start, 1_440) as string;
    expect(toOffsetFromFireAt("2026-08-01T12:00:00Z", savedFireAt)).toBe(1_560);
  });

  it("survives an offset large enough to cross a year", () => {
    const yearIsh = 400 * 24 * 60;
    const fireAt = toFireAt(start, yearIsh);
    expect(fireAt).toBe("2025-06-27T10:00:00.000Z");
    expect(toOffsetFromFireAt(start, fireAt as string)).toBe(yearIsh);
  });
});

describe("offsetLabel", () => {
  it("uses the preset's own wording", () => {
    expect(offsetLabel(10_080)).toBe("7 days before");
    expect(offsetLabel(1_440)).toBe("1 day before");
    expect(offsetLabel(60)).toBe("1 hour before");
    expect(offsetLabel(15)).toBe("15 minutes before");
  });

  it("derives a label for custom offsets, with correct pluralisation", () => {
    expect(offsetLabel(2 * 1_440)).toBe("2 days before");
    expect(offsetLabel(3 * 60)).toBe("3 hours before");
    expect(offsetLabel(2)).toBe("2 minutes before");
    expect(offsetLabel(1)).toBe("1 minute before");
  });

  it("picks the largest exact unit", () => {
    expect(offsetLabel(90)).toBe("90 minutes before");
    expect(offsetLabel(120)).toBe("2 hours before");
  });
});
