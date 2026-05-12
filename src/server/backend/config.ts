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
