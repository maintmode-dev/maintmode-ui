// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "@/domain/maintenance/maintenance";

/**
 * The grid's expensive props keep their identity (RUK-265 item 2, AC-6a/AC-6b).
 *
 * `eventContent` and `eventClick` are handed to FullCalendar, whose JSX adapter
 * calls `flushSync` when it re-renders events (see the notes in
 * calendar-grid.tsx). A new function reference on every render is therefore not
 * an idle allocation — it is a prop change on a consumer that flushes
 * synchronously.
 *
 * Both assertions go through a DIRECT `CalendarGrid` harness rather than through
 * `CalendarPage`. After the tick moved into the sidebar the page can no longer
 * force a grid re-render with unchanged `items`, and its `onSelect` is
 * `setSelectedId`, a stable `useState` setter — so a page-level test could not
 * distinguish `useCallback(fn, [onSelect])` from `useCallback(fn, [])`.
 */

/** Captures the props FullCalendar is handed on each render. */
const received: { eventContent?: unknown; eventClick?: unknown }[] = [];

vi.mock("@fullcalendar/react", () => ({
  default: (props: { eventContent?: unknown; eventClick?: unknown }) => {
    received.push({ eventContent: props.eventContent, eventClick: props.eventClick });
    return <div data-testid="fc" />;
  },
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/luxon3", () => ({ default: {} }));
vi.mock("../calendar-grid.css", () => ({}));

import { CalendarGrid } from "../calendar-grid";

const ITEMS: CalendarEvent[] = [];
const ANCHOR = new Date("2026-06-23T00:00:00Z");

beforeEach(() => {
  received.length = 0;
});

afterEach(() => cleanup());

describe("CalendarGrid prop stability", () => {
  it("keeps eventContent and eventClick identical across a re-render with unchanged props", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={onSelect} timeZone="UTC" />,
    );
    // A second render with every prop referentially unchanged — the case a
    // parent re-render produces.
    rerender(<CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={onSelect} timeZone="UTC" />);

    // Exactly two, so the comparison is render 1 against render 2. A looser
    // bound would compare render 1 against render N and could mask an
    // instability introduced only on the second render.
    expect(received).toHaveLength(2);
    const [first, second] = received;
    expect(second.eventContent).toBe(first.eventContent);
    expect(second.eventClick).toBe(first.eventClick);
  });

  it("gives eventClick a NEW identity when onSelect changes", () => {
    // The negative half. Without it, `[onSelect]` and `[]` are indistinguishable
    // and the dependency array is unpinned — a later edit could drop the dep and
    // no test would notice until a stale `onSelect` shipped.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={first} timeZone="UTC" />,
    );
    const beforeClick = received[received.length - 1].eventClick;
    const beforeContent = received[received.length - 1].eventContent;

    rerender(<CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={second} timeZone="UTC" />);

    const afterClick = received[received.length - 1].eventClick;
    expect(afterClick).not.toBe(beforeClick);
    // ...while the renderer, which closes over nothing, is untouched by it.
    expect(received[received.length - 1].eventContent).toBe(beforeContent);
  });

  it("routes a click through the CURRENT onSelect, not a captured stale one", () => {
    // Identity is a proxy for the thing that actually matters: the handler must
    // call the latest `onSelect`. Asserted directly so the dep array cannot be
    // "fixed" into staleness while the identity test still passes.
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = render(
      <CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={stale} timeZone="UTC" />,
    );
    rerender(<CalendarGrid view="day" anchor={ANCHOR} items={ITEMS} onSelect={fresh} timeZone="UTC" />);

    const handler = received[received.length - 1].eventClick as (arg: unknown) => void;
    handler({ jsEvent: { preventDefault: () => {} }, event: { id: "m-9" } });

    expect(fresh).toHaveBeenCalledWith("m-9");
    expect(stale).not.toHaveBeenCalled();
  });
});
