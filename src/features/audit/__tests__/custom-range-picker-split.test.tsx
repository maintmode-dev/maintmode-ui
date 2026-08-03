// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Popover } from "@/shared/ui/shadcn/popover";

import { AuditCustomRangePicker } from "../audit-custom-range-picker";
import { GlobalAuditLogPage } from "../global-audit-log-page";

// jsdom lacks the layout APIs some Radix internals rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: vi.fn(() => new Promise(() => {})) };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * `react-day-picker` + `date-fns` (18.9 KB gzip) are code-split behind the
 * `Custom range` popover, which the median audit visit never opens. The split
 * runs through the popover's *content* only, so these guard the two halves of
 * that seam.
 *
 * ⚠️ The dynamic half cannot be driven from here: `next/dynamic` never resolves
 * under this vitest setup — verified with a trivial control component, which
 * also renders empty — because it depends on the bundler's loadable runtime
 * that vitest does not provide. So the body is asserted directly, mounted the
 * way the popover mounts it, rather than through `dynamic()`.
 */
describe("audit custom range picker — split across a dynamic boundary", () => {
  it("reaches the picker only through a lazy import, never a static one", async () => {
    // The load-bearing assertion. Everything else here would pass just as well
    // with a static import — as a mutation check confirmed — because rendering
    // cannot see the module graph, and it is the graph that decides whether the
    // 18.9 KB chunk splits. So read the source: a bare `import ... from` of the
    // picker would put `react-day-picker` back on this page's eager graph, no
    // matter how the component is rendered.
    const src = await readFile(
      resolve(process.cwd(), "src/features/audit/global-audit-log-page.tsx"),
      "utf8",
    );

    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("\.\/audit-custom-range-picker"\)/);
    // A type-only import is erased at compile time, so it is the one permitted
    // static mention; any value import is not.
    const staticValueImport = /^import\s+(?!type\s)[^;]*?from\s+"\.\/audit-custom-range-picker"/ms;
    expect(src).not.toMatch(staticValueImport);

    // And the prefetch keeps the click from paying for the chunk.
    expect(src).toContain('void import("./audit-custom-range-picker")');
  });

  it("keeps the trigger in the page's own graph, ahead of the picker's chunk", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <GlobalAuditLogPage />
      </QueryClientProvider>,
    );

    // Synchronous, no `findBy`: the trigger must be present in the first paint.
    // If it ever moved behind `dynamic()`, it would arrive a chunk late and the
    // preset chips beside it in the same flex row would reflow.
    expect(screen.getByRole("button", { name: "Set a custom date range" })).toBeTruthy();

    // ...and the calendar body must NOT be, or nothing was actually split.
    expect(screen.queryByText("Absolute time range")).toBeNull();
  });

  it("renders the extracted body with the calendar and a range-gated Apply", () => {
    const onApply = vi.fn();
    render(
      <Popover open>
        <AuditCustomRangePicker value={null} onApply={onApply} onCancel={() => {}} />
      </Popover>,
    );

    expect(screen.getByText("Absolute time range")).toBeTruthy();
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
    // An empty draft is not a valid range, so Apply starts disabled.
    expect((screen.getByRole("button", { name: "Apply time range" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("seeds its draft from the active range on mount, which is each open", () => {
    // Radix unmounts closed content, so the body's mount *is* the open event —
    // this initializer replaces the reset effect the inlined version needed.
    render(
      <Popover open>
        <AuditCustomRangePicker
          value={{ from: "2026-07-16", to: "2026-07-18" }}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </Popover>,
    );

    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-07-16");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-07-18");
    expect((screen.getByRole("button", { name: "Apply time range" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
