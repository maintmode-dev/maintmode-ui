import "server-only";

import { parseMaintmodeBackendConfig } from "@/shared/config/runtime-config";

export function readMaintmodeBackendConfig() {
  return parseMaintmodeBackendConfig(process.env);
}

/**
 * Resolves an API path against a base URL while preserving any path prefix on
 * the base (e.g. `http://nginx:9000/auth` + `/api/v1/me` →
 * `http://nginx:9000/auth/api/v1/me`).
 *
 * The native `new URL("/foo", "http://h/p")` drops the `/p` prefix when the
 * path starts with `/`, which is the wrong behavior when nginx exposes
 * services under prefixes like `/auth/` and `/maintmode/`.
 *
 * Security: rejects absolute URLs (`http://`, `//`) and protocol-relative
 * paths so that a misconfigured caller cannot redirect a backend request to
 * an attacker-controlled host. The query string and hash on `path` are
 * preserved verbatim.
 *
 * Also rejects any dot segment (`.`, `..`, or their `%2e` spellings, which a
 * URL parser treats the same). `encodeURIComponent` leaves `..` as it is, so a
 * route parameter of `..` would otherwise move the request to a neighbouring
 * backend route under the user's token (security review 2026-10-07, L-3).
 * Checked here rather than in each route so a new route cannot forget it.
 */
export function resolveBackendUrl(baseUrl: string, path: string): URL {
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("resolveBackendUrl: path must be a non-empty string");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new TypeError(`resolveBackendUrl: absolute URLs are not allowed (got "${path}")`);
  }
  if (path.startsWith("//")) {
    throw new TypeError(`resolveBackendUrl: protocol-relative paths are not allowed (got "${path}")`);
  }
  if (hasDotSegment(path)) {
    throw new TypeError(`resolveBackendUrl: dot segments are not allowed (got "${path}")`);
  }
  const baseWithSlash = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const pathNoLeading = path.startsWith("/") ? path.slice(1) : path;
  const resolved = new URL(pathNoLeading, baseWithSlash);
  const baseOrigin = new URL(baseWithSlash).origin;
  if (resolved.origin !== baseOrigin) {
    throw new TypeError(
      `resolveBackendUrl: resolved URL escaped the base origin (base=${baseOrigin}, resolved=${resolved.origin})`,
    );
  }
  return resolved;
}

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

function hasDotSegment(path: string): boolean {
  // Read the path the way the WHATWG parser will: it trims leading and trailing
  // C0 controls and spaces, strips TAB/LF/CR anywhere, and for http(s) treats
  // `\` as a separator. Splitting on `/` alone let `..\..`, `.<TAB>.` or a
  // trailing `..<US>` through for a path built without encoding.
  const pathname = path
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "")
    .replace(/[\t\n\r]/g, "")
    .split(/[?#]/, 1)[0];
  return pathname.split(/[\/\\]/).some((segment) => DOT_SEGMENT.test(segment));
}
