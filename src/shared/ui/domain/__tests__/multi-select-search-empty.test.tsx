// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MultiSelect, type MultiSelectOption } from "@/shared/ui/domain/multi-select";

/**
 * RUK-272 — `emptyText` reaches cmdk's `CommandEmpty`, which mounts on
 * `filtered.count === 0`. That condition means "the filter matched nothing",
 * but every caller writes `emptyText` to mean "there is nothing here". This
 * suite pins the split between those two facts (SPEC §1) and, more importantly,
 * pins the case where they must NOT be split: an empty `options` array, where
 * `emptyText` is carrying a pending or failed load and must survive anything
 * the user types (SPEC §1.1 / R3a).
 *
 * Every case opens the popover first. `PopoverContent` is not force-mounted, so
 * a test that asserts without opening asserts against an unmounted subtree —
 * and every absence assertion here would pass for the wrong reason.
 */

// jsdom lacks the layout APIs cmdk relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const PEOPLE: MultiSelectOption[] = [
  { value: "u1", label: "Alice Smith" },
  { value: "u2", label: "Bob Jones" },
];

/**
 * AC-10 needs labels a lone space genuinely scores 0 against. cmdk's scorer
 * treats `-` as a word boundary, so a space *does* match "ops-alerts"; it scores
 * 0 against alphanumerics and against `@` / `/`. Timezone ids are the real
 * shape here — and `timezone-card` is an actual call site.
 */
const ZONES: MultiSelectOption[] = [
  { value: "z1", label: "UTC" },
  { value: "z2", label: "Europe/Madrid" },
];

const EMPTY_TEXT = "No people found.";
const LOAD_FAILED = "Couldn't load people. Retry or check your access.";

/** Wrapper so selections actually land — the component is controlled. */
function Harness({ options, emptyText = EMPTY_TEXT }: { options: MultiSelectOption[]; emptyText?: string }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <MultiSelect
      options={options}
      value={value}
      onChange={setValue}
      emptyText={emptyText}
      ariaLabel="People"
      searchPlaceholder="Search people"
    />
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole("combobox", { name: "People" }));
}

function searchBox() {
  return screen.getByPlaceholderText("Search people") as HTMLInputElement;
}

function type(query: string) {
  fireEvent.change(searchBox(), { target: { value: query } });
}

afterEach(cleanup);

describe("MultiSelect — a search miss is not an empty list (RUK-272)", () => {
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
    // Absence matters as much as presence: an always-`emptyText` build would
    // satisfy the line above on its own.
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

  it("AC-4: reopening starts from an empty search box, not a hidden filter", () => {
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("zzz");
    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();

    // Close, reopen.
    fireEvent.click(screen.getByRole("combobox", { name: "People" }));
    openPicker();

    // The input's value is the observable that discriminates: asserting only
    // "the rows are back" would pass without the reset, since the popover
    // unmounts on close and cmdk's own store starts fresh regardless.
    // `jest-dom` is not set up in this repo, so read the property directly.
    expect(searchBox().value).toBe("");
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.getByText("Alice Smith")).toBeTruthy();
  });

  it("AC-5: a failed load survives typing — it is not overwritten by a search miss", () => {
    // The regression guard. `options` is empty because the request failed, and
    // `emptyText` carries that failure. Typing must not claim the roster loaded.
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

  it("AC-10: a whitespace-only query does not quote apparent nothing", () => {
    // cmdk does not trim the query. A lone space scores 0 against these labels,
    // so `filtered.count` genuinely reaches 0 here — without `.trim()` this
    // renders `No matches for " "`, quote marks around apparent nothing.
    render(<Harness options={ZONES} emptyText="No timezones available." />);
    openPicker();
    type(" ");

    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.getByText("No timezones available.")).toBeTruthy();
  });

  it("keeps the filter and the popover open while toggling a match", () => {
    // `MultiSelect` deliberately stays open across toggles so several items can
    // be added in one pass. The reset added for RUK-272 fires on close, so it
    // must not disturb this: the popover never closes here, and the query has
    // to survive the selection.
    render(<Harness options={PEOPLE} />);
    openPicker();
    type("Alice");
    fireEvent.click(screen.getByText("Alice Smith"));

    expect(searchBox().value).toBe("Alice");
    expect(screen.getByRole("combobox", { name: "People" }).textContent).toContain("1 selected");
  });

  it("re-evaluates R3a when options arrive while the popover is open", () => {
    // AC-5 only ever sees options that were empty from the first render. This
    // is its dynamic form: the query resolves under an open popover with a
    // query already typed. An implementation that captured `options.length`
    // once at mount would pass every other case here and fail this one.
    function Loading() {
      const [options, setOptions] = useState<MultiSelectOption[]>([]);
      const [value, setValue] = useState<string[]>([]);
      return (
        <>
          <button onClick={() => setOptions(PEOPLE)}>resolve</button>
          <MultiSelect
            options={options}
            value={value}
            onChange={setValue}
            emptyText={LOAD_FAILED}
            ariaLabel="People"
            searchPlaceholder="Search people"
          />
        </>
      );
    }
    render(<Loading />);
    openPicker();
    type("zzz");

    // Empty options: the failure sentence wins, whatever was typed.
    expect(screen.getByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();

    fireEvent.click(screen.getByText("resolve"));

    // Options present and the filter matches none of them: now it is a real
    // search miss, and the sentence has to flip.
    expect(screen.getByText('No matches for "zzz"')).toBeTruthy();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });

  it("does not drop characters through the controlled input", () => {
    // A controlled `CommandInput` makes cmdk stop writing its own store from
    // `onChange` and sync from the prop in an effect instead. That is one hop
    // longer than the uncontrolled path, so prove the round trip is lossless
    // and still drives the filter.
    render(<Harness options={PEOPLE} />);
    openPicker();
    for (const chunk of ["A", "Al", "Ali", "Alic", "Alice"]) type(chunk);

    expect(searchBox().value).toBe("Alice");
    expect(screen.getByText("Alice Smith")).toBeTruthy();
    expect(screen.queryByText("Bob Jones")).toBeNull();
  });
});
