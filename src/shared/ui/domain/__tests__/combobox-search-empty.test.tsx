// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox, type ComboboxOption } from "@/shared/ui/domain/combobox";

/**
 * RUK-272, `Combobox` half. The copy split itself is the same as the one proven
 * in `multi-select-search-empty.test.tsx`; what is specific to this component
 * is covered here and nowhere else:
 *
 * - AC-7, keyboard selection. Controlling the query touches cmdk's own store,
 *   and every other picker test in this repo selects by CLICK — so the whole
 *   existing suite would stay green with arrow-key navigation broken. This is
 *   the only case in the repo that exercises it.
 *
 *   Scope note, measured rather than assumed: wiring the query to the `Command`
 *   root instead of `CommandInput` is caught by AC-1, not by this case. Under
 *   that mutation the input falls back to uncontrolled, so cmdk still writes
 *   `state.search` itself and filtering survives; what breaks is the feature —
 *   our `search` state stays empty and the new string never renders. AC-7
 *   guards the keyboard path itself, which no other test covers.
 * - AC-4 twice, because this component has two close paths: the trigger (which
 *   goes through `onOpenChange`) and selecting a row (which calls `setOpen`
 *   directly and bypasses it).
 */

// jsdom lacks the layout APIs cmdk relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const PEOPLE: ComboboxOption[] = [
  { value: "u1", label: "Alice Smith" },
  { value: "u2", label: "Bob Jones" },
  // Third entry exists for AC-7: cmdk auto-highlights the first filtered row,
  // so a query matching a single row makes `ArrowDown` a no-op and the case
  // would pass with the key press deleted. "Bob" matches this and "Bob Jones",
  // so the arrow has somewhere to move and the assertion can tell the
  // difference.
  { value: "u3", label: "Bobby Tables" },
];

/** A lone space scores 0 against these; see the AC-10 note in the twin suite. */
const ZONES: ComboboxOption[] = [
  { value: "z1", label: "UTC" },
  { value: "z2", label: "Europe/Madrid" },
];

const EMPTY_TEXT = "No people found.";
const LOAD_FAILED = "Couldn't load people. Retry or check your access.";

function Harness({
  options,
  emptyText = EMPTY_TEXT,
  errorText,
  onChange,
}: {
  options: ComboboxOption[];
  emptyText?: string;
  errorText?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState<string>();
  return (
    <Combobox
      options={options}
      value={value}
      errorText={errorText}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      emptyText={emptyText}
      ariaLabel="Approver"
      searchPlaceholder="Search people"
    />
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Approver" });
const openPicker = () => fireEvent.click(trigger());
const searchBox = () => screen.getByPlaceholderText("Search people") as HTMLInputElement;
const type = (query: string) => fireEvent.change(searchBox(), { target: { value: query } });

afterEach(cleanup);

describe("Combobox — a search miss is not an empty list (RUK-272)", () => {
  it("AC-1: a non-matching query reads as a search miss, not as an empty roster", () => {
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("zzz");

    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("AC-2: an empty roster still reads as an empty roster", () => {
    render(<Harness options={[]} />);
    openPicker();

    expect(screen.getByText(EMPTY_TEXT)).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();
  });

  it("AC-3: clearing the query brings the rows back and leaves no empty state", () => {
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("zzz");
    type("");

    expect(screen.getByText("Alice Smith")).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("AC-4a: reopening after closing via the trigger starts from an empty box", () => {
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("zzz");
    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();

    fireEvent.click(trigger()); // close
    openPicker();

    expect(searchBox().value).toBe("");
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.getByText("Alice Smith")).toBeTruthy();
  });

  it("AC-4b: reopening after SELECTING a row also starts from an empty box", () => {
    // The path `onOpenChange` never sees: `onSelect` calls `setOpen(false)`
    // itself. Without the clear in `onSelect`, the stale query survives here
    // and is pushed back into the remounted store.
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("Alice");
    fireEvent.click(screen.getByText("Alice Smith")); // selects and closes

    openPicker();

    expect(searchBox().value).toBe("");
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.getByText("Bob Jones")).toBeTruthy();
  });

  it("AC-5: a failed load survives typing — it is not overwritten by a search miss", () => {
    render(<Harness options={[]} emptyText={LOAD_FAILED} />);
    openPicker();
    type("ann");

    expect(screen.getByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();
  });

  it("AC-6: with rows showing, no empty-state copy is rendered at all", () => {
    render(<Harness options={PEOPLE} />);
    openPicker();

    expect(screen.getByText("Alice Smith")).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("AC-7: arrow keys and Enter still select a filtered row", () => {
    // Nothing else in the repo selects a picker row by keyboard.
    //
    // "Bob" matches two rows, and cmdk auto-highlights the FIRST. So asserting
    // the second row's value is what makes the `ArrowDown` load-bearing: with
    // the key press removed this expects "u2" and gets "u3".
    const onChange = vi.fn();
    render(<Harness options={PEOPLE} onChange={onChange} />);
    openPicker();
    type("Bob");

    const input = searchBox();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("u3");
  });

  it("typing does not rebuild the option rows", () => {
    // Pins the memo in `combobox.tsx`. Lifting the query into React state made
    // every keystroke re-render the whole subtree, rebuilding all ~418 rows of
    // the timezone picker where cmdk's own store had rebuilt none; the memo put
    // that back to zero.
    //
    // Without this test the memo reads as a precautionary wrapper and is the
    // kind of thing a later refactor deletes as "unnecessary".
    //
    // What it catches, measured rather than assumed: removing the memo, and
    // adding `search` to its deps. It does NOT catch `onChange` going back into
    // the deps — typing re-renders only this component, so an inline arrow from
    // the caller keeps its identity across keystrokes and the memo survives.
    // The ref matters for parent-driven re-renders, which this case does not
    // simulate; see the note on it in `combobox.tsx`.
    let renders = 0;
    const counted: ComboboxOption[] = Array.from({ length: 20 }, (_, i) => ({
      value: `z${i}`,
      label: `Zone_${i}`,
      description: () => {
        renders++;
        return `GMT+${i}`;
      },
    }));
    // An INLINE arrow, as the real call sites pass — a stable `useCallback`
    // here would make the test pass even with `onChange` back in the deps.
    function Inline() {
      const [value, setValue] = useState<string>();
      return (
        <Combobox
          options={counted}
          value={value}
          onChange={(next) => setValue(next)}
          ariaLabel="Approver"
          searchPlaceholder="Search people"
        />
      );
    }
    render(<Inline />);
    openPicker();
    const afterOpen = renders;
    expect(afterOpen).toBe(20); // mounted once

    for (const query of ["Z", "Zo", "Zon"]) type(query);

    expect(renders - afterOpen).toBe(0);
  });

  it("moves the check mark to the selected row", () => {
    // The other direction of the same memo. The counter above catches
    // OVER-invalidation (rows rebuilt when they need not be); this catches
    // UNDER-invalidation, which is the user-visible half: the tick is computed
    // inside the memo from `value`, so dropping `value` from its deps leaves
    // every row unticked forever. That mutation passes all 1160 tests in this
    // repo without this case — neither picker suite asserted the tick at all,
    // and before the memo existed `value` was simply read on every render.
    render(<Harness options={PEOPLE} />);
    openPicker();
    fireEvent.click(screen.getByText("Bob Jones"));
    openPicker();

    // The tick is the only visual difference between rows, so find it by the
    // class the component toggles rather than by an accessible name.
    const ticked = Array.from(document.querySelectorAll("[cmdk-item]")).filter((row) =>
      row.querySelector("svg.opacity-100"),
    );
    expect(ticked).toHaveLength(1);
    expect(ticked[0].textContent).toContain("Bob Jones");
  });

  it("a failed load with stale rows still reports a genuine search miss", () => {
    // The one case where the visible copy and the sr-only alert say different
    // things on purpose, so pin it rather than leave it to be 'fixed' later.
    //
    // Reachable today: the transport picker falls back to a non-empty constant
    // when its query fails, so a failed load can leave real rows on screen.
    // R3a does not apply — `options` is not empty — and both statements are
    // true at once: the load DID fail (which the alert carries, and which a
    // sighted user cannot otherwise discover), and the filter genuinely matched
    // none of the rows that are visible. Suppressing the search miss here would
    // leave a sighted user staring at a populated list with no explanation.
    render(<Harness options={PEOPLE} errorText="Couldn't load people." emptyText={LOAD_FAILED} />);
    openPicker();
    type("zzz");

    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();
    expect(document.querySelector('[data-testid="combobox-error-live-approver"]')?.textContent).toBe(
      "Couldn't load people.",
    );
  });

  it("AC-10: a whitespace-only query does not quote apparent nothing", () => {
    render(<Harness options={ZONES} emptyText="No timezones available." />);
    openPicker();
    type(" ");

    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.getByText("No timezones available.")).toBeTruthy();
  });
});
