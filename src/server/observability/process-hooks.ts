import { logError, serializeError } from "./error-log";

/**
 * Process-level hooks, registered once at server startup. Node.js runtime
 * only: the edge runtime has no `process` event emitter.
 *
 * A module of its own, reached from `register()` through a conditional
 * `import()`, because Next compiles `instrumentation.ts` for the edge runtime
 * too. A runtime check with an early return kept the calls from running there,
 * but not from being compiled there — and Turbopack flagged `process.on` as an
 * unsupported Node API on every dev-server compile.
 */
export function registerProcessHooks(): void {
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
