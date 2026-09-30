import { afterEach, describe, expect, it, vi } from "vitest";

import { registerProcessHooks } from "../process-hooks";

/**
 * Production ships container stdout to Loki through Promtail, which lifts
 * `level` out of each JSON line into a label. So the contract is one JSON line
 * per event with `level` exactly "ERROR" or "FATAL".
 */
describe("registerProcessHooks", () => {
  const before = {
    rejection: process.listeners("unhandledRejection"),
    exception: process.listeners("uncaughtExceptionMonitor"),
  };

  afterEach(() => {
    for (const l of process.listeners("unhandledRejection")) {
      if (!before.rejection.includes(l)) process.off("unhandledRejection", l);
    }
    for (const l of process.listeners("uncaughtExceptionMonitor")) {
      if (!before.exception.includes(l)) process.off("uncaughtExceptionMonitor", l);
    }
    vi.restoreAllMocks();
  });

  type Hook = (...args: unknown[]) => void;
  const listenersOf = (event: string) => (process.listeners as (e: string) => Hook[])(event);

  function added(event: "unhandledRejection" | "uncaughtExceptionMonitor"): Hook[] {
    const known: unknown[] = event === "unhandledRejection" ? before.rejection : before.exception;
    return listenersOf(event).filter((l) => !known.includes(l));
  }

  it("logs an unhandled rejection as one ERROR line of JSON", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    registerProcessHooks();

    const [listener] = added("unhandledRejection");
    listener(new Error("boom"), Promise.resolve());

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({
      level: "ERROR",
      msg: "unhandledRejection",
      err: { name: "Error", message: "boom" },
    });
  });

  it("logs an uncaught exception as FATAL without swallowing it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    registerProcessHooks();

    // The monitor variant observes and lets Node still exit; a plain
    // `uncaughtException` handler would keep a corrupted process serving.
    expect(added("uncaughtExceptionMonitor")).toHaveLength(1);
    expect(process.listeners("uncaughtException")).not.toContain(added("uncaughtExceptionMonitor")[0]);

    added("uncaughtExceptionMonitor")[0](new Error("fatal"), "uncaughtException");

    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      level: "FATAL",
      msg: "uncaughtException",
    });
  });
});
