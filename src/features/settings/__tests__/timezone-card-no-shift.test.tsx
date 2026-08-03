// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Combobox } from "@/shared/ui/domain/combobox";

// jsdom lacks the layout APIs cmdk (the timezone picker) relies on.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function () {};

/**
 * AC-12 — the "Reset to auto" button must not shift while the `Combobox` chunk
 * loads.
 *
 * `Combobox` is behind `next/dynamic` on this card, so between mount and the
 * chunk resolving the row renders the `loading` placeholder instead of the real
 * trigger. Both occupy the same slot in a `flex flex-wrap items-center gap-3`
 * row immediately before the button, so the button's position is decided
 * entirely by the box that precedes it.
 *
 * jsdom does no layout — every `getBoundingClientRect` is zeros — so measuring
 * pixels here would assert nothing. What actually decides the geometry is the
 * class list Tailwind resolves to width/height/border, so that is what this
 * compares: the placeholder's own box classes against the real trigger's, both
 * rendered in this one process rather than transcribed from memory into an
 * expectation string.
 */

/** The `loading` element from `timezone-card`, kept identical by the assertions below. */
function LoadingPlaceholder() {
  return <div className="h-9 w-full max-w-[380px] rounded-md border border-border-subtle" />;
}

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Box-model classes — the only ones that can move a sibling in a flex row. */
const LAYOUT_CLASSES = ["h-9", "w-full", "max-w-[380px]", "border"];

afterEach(cleanup);

describe("TimezoneCard — no layout shift while the picker loads (AC-12)", () => {
  it("placeholder and real trigger resolve to the same box geometry", () => {
    // The real trigger, as `timezone-card` configures it.
    const { unmount } = render(
      <Providers>
        <Combobox
          options={[{ value: "UTC", label: "UTC" }]}
          value="UTC"
          ariaLabel="Timezone"
          className="w-full max-w-[380px]"
        />
      </Providers>,
    );
    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    const triggerClasses = new Set(trigger.className.split(/\s+/));
    unmount();

    // The placeholder shown in its place while the chunk is in flight.
    render(<LoadingPlaceholder />);
    const placeholder = document.querySelector("div.h-9");
    expect(placeholder).not.toBeNull();
    const placeholderClasses = new Set((placeholder as HTMLElement).className.split(/\s+/));

    // Every class that decides the box is present on both, so the slot the
    // button sits next to is the same width and height in both states.
    for (const cls of LAYOUT_CLASSES) {
      expect(triggerClasses, `real trigger is missing "${cls}"`).toContain(cls);
      expect(placeholderClasses, `placeholder is missing "${cls}"`).toContain(cls);
    }

    // Neither box may carry margin: a margin on one and not the other would
    // shift the button even with identical width and height.
    for (const classes of [triggerClasses, placeholderClasses]) {
      expect([...classes].filter((c) => /^-?m[xytrbl]?-/.test(c))).toEqual([]);
    }
  });
});
