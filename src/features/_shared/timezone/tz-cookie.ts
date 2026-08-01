import { isValidZone } from "./convert";

/**
 * The `mm.tz` cookie — how the **server** learns the viewer's display zone so
 * the very first frame can be rendered in it instead of the UTC placeholder
 * (RUK-233). Plus the zone primitives every layer of the timezone stack needs.
 *
 * The primitives live here rather than in `use-timezone.ts` (their old home) to
 * break an import cycle: `timezone-provider.tsx` needs them, and
 * `use-timezone.ts` needs the provider's context. This module depends only on
 * the leaf `convert.ts`, which makes the chain acyclic:
 *
 *   convert.ts → tz-cookie.ts → timezone-provider.tsx → use-timezone.ts
 *
 * Must stay free of `next/headers` and `server-only`: `src/features/**` is
 * browser-owned per `scripts/check-boundaries.mjs`. The server reads the same
 * cookie via `cookies()` in `src/app/layout.tsx` — two APIs onto one cookie,
 * one validation rule (`isValidZone`).
 */

/** Name: same `mm.` prefix as the existing `mm.invite_token`. */
export const TZ_COOKIE = "mm.tz";

/** A year — this is a long-lived display preference, not a session artifact. */
export const TZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Last-resort zone when nothing else is known (matches the SSR container). */
export const FALLBACK_ZONE = "UTC";

/**
 * The browser's autodetected IANA zone, or {@link FALLBACK_ZONE} if the runtime
 * can't report one. Call only on the client (it reads `Intl`), which is why
 * `TimezoneProvider` defers it to an effect.
 */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
  } catch {
    return FALLBACK_ZONE;
  }
}

export interface ResolvedTimezone {
  /** IANA zone to render/convert in. */
  zone: string;
  /**
   * `false` during SSR and the first client render, `true` once a zone has been
   * resolved post-mount.
   *
   * Stays `false` even when the cookie already holds the right zone: the cookie
   * ranks **below** `me.timezone` and the two can legitimately disagree
   * (autodetected `Europe/Berlin` while travelling vs. a saved `Asia/Nicosia`).
   * The maintenance form gates *submit* on this flag, so trusting the cookie
   * there would write an instant shifted by the zone difference — data
   * corruption, not cosmetics.
   *
   * `true` means "resolved", NOT "authoritative": with `/api/me` still in
   * flight the resolved zone is the browser's autodetect and `ready` is already
   * `true`, so a submit in that window converts against autodetect rather than
   * the saved `me.timezone`. Narrow and pre-existing (this flag behaved the same
   * before RUK-233), but do not read it as a promise of authority.
   */
  ready: boolean;
}

/**
 * Read the zone out of a raw `Cookie:` header string (or `document.cookie`).
 *
 * Kept as a pure function of the string so it is testable in plain node with no
 * jsdom, and so one parser serves both the browser and any string-shaped server
 * input. The value is untrusted (the cookie is deliberately not httpOnly, since
 * the browser writes it), so anything `isValidZone` rejects degrades to `null` =
 * "zone unknown" and never reaches a converter.
 */
export function readTzCookie(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  // Match on the name's BOUNDARY: a plain `indexOf("mm.tz=")` also matches
  // `xmm.tz=` and `foo_mm.tz=` and would hand a foreign cookie's value to the
  // converters. Built from TZ_COOKIE for one source of truth, with the `.`
  // escaped — unescaped it would also match `mmXtz=`. Covered by AC-03 tests.
  const pattern = new RegExp(`(?:^|;\\s*)${TZ_COOKIE.replace(".", "\\.")}=([^;]*)`);
  const match = pattern.exec(cookieHeader);
  if (!match) return null;
  // NOT `decodeURIComponent`: it THROWS a URIError on malformed percent-encoding
  // (`mm.tz=%E0%A4%A`), and this value is attacker-writable because the cookie is
  // deliberately not httpOnly — so decoding turns a forged cookie into an
  // unhandled exception in whatever reads it. Nothing is lost: IANA zone ids only
  // use `[-/A-Za-z_]`, so any value needing a decode is not a zone anyway.
  const zone = match[1].trim();
  return isValidZone(zone) ? zone : null;
}

/**
 * Write the zone cookie from the browser. Client-only (`document.cookie`).
 *
 * `secure` is set **only** on https: adding it unconditionally would make the
 * browser drop the cookie on `http://localhost:3000`, so the whole mechanism
 * would silently do nothing in local dev.
 */
export function writeTzCookie(zone: string): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? ";secure" : "";
  document.cookie = `${TZ_COOKIE}=${zone};path=/;max-age=${TZ_COOKIE_MAX_AGE};samesite=lax${secure}`;
}
