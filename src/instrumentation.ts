import type { Instrumentation } from "next";

import { logError, serializeError } from "@/server/observability/error-log";

/**
 * Server-side error logging to stdout — see `server/observability/error-log.ts`
 * for the log-collector contract.
 *
 * Scope: unhandled server errors only. Access logs are covered by Caddy and
 * client-side (browser) errors never reach container stdout.
 */

/**
 * Next calls `register` in every runtime and compiles this file for each, so
 * Node-only code is imported conditionally rather than guarded by an early
 * return: a positive `NEXT_RUNTIME === "nodejs"` test is what lets the edge
 * build drop the import altogether (Next's "Importing runtime-specific code").
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerProcessHooks } = await import("@/server/observability/process-hooks");
    registerProcessHooks();
  }
}

/** Errors thrown while handling a request (render, route handlers, etc.). */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  logError({
    level: "ERROR",
    msg: "unhandled request error",
    path: request.path,
    method: request.method,
    route: context.routePath,
    err: serializeError(err),
  });
};
