/**
 * Server-side error logging to stdout.
 *
 * Production runs as a container whose stdout is scraped by Promtail and
 * shipped to Loki (`service_name="ui"`). Promtail extracts `level` from the
 * JSON line and turns it into a Loki label, so every entry must be a single
 * JSON line with `level` set to exactly "ERROR" or "FATAL" (upper case).
 *
 * Runtime-neutral on purpose — `console` only — because `onRequestError` in
 * `src/instrumentation.ts` runs in the edge runtime as well as in Node.
 */

export type ErrorLogEntry = {
  level: "ERROR" | "FATAL";
  msg: string;
  err: { name: string; message: string; stack?: string } | string;
  path?: string;
  method?: string;
  route?: string;
};

export function serializeError(err: unknown): ErrorLogEntry["err"] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return String(err);
}

export function logError(entry: ErrorLogEntry): void {
  // Single-line JSON on stdout — the contract with the log collector.
  console.error(JSON.stringify(entry));
}
