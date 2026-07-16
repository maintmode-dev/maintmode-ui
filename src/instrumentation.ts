import type { Instrumentation } from "next";

/**
 * Server-side error logging to stdout.
 *
 * Production runs as a container whose stdout is scraped by Promtail and
 * shipped to Loki (`service_name="ui"`). Promtail extracts `level` from the
 * JSON line and turns it into a Loki label, so every entry must be a single
 * JSON line with `level` set to exactly "ERROR" or "FATAL" (upper case).
 *
 * Scope: unhandled server errors only. Access logs are covered by Caddy and
 * client-side (browser) errors never reach container stdout.
 */

type ErrorLogEntry = {
  level: "ERROR" | "FATAL";
  msg: string;
  err: { name: string; message: string; stack?: string } | string;
  path?: string;
  method?: string;
  route?: string;
};

function serializeError(err: unknown): ErrorLogEntry["err"] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return String(err);
}

function logError(entry: ErrorLogEntry): void {
  // Single-line JSON on stdout — the contract with the log collector.
  console.error(JSON.stringify(entry));
}

/**
 * Process-level hooks, registered once at server startup. Node.js runtime
 * only: the edge runtime has no `process` event emitter.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  process.on("unhandledRejection", (reason) => {
    logError({
      level: "ERROR",
      msg: "unhandledRejection",
      err: serializeError(reason),
    });
  });

  // `uncaughtExceptionMonitor` observes the exception without cancelling
  // Node's default behavior (print to stderr and exit 1), so the process
  // still dies and the orchestrator restarts it with clean state. A plain
  // `uncaughtException` handler would suppress the exit and keep a
  // potentially corrupted process serving traffic.
  process.on("uncaughtExceptionMonitor", (err) => {
    logError({
      level: "FATAL",
      msg: "uncaughtException",
      err: serializeError(err),
    });
  });
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
