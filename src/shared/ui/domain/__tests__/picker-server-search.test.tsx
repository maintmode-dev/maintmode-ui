// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "../combobox";
import { MultiSelect } from "../multi-select";

/**
 * `onSearchChange` — the seam that lets a picker search the SERVER instead of
 * filtering the page it already holds (RUK-266).
 *
 * Why this matters enough to test at the component level: without it the search
 * text never left these components, so a picker was silently capped at its first
 * page. Measured on the maintenance form — 200 of 5781 resources and 200 of
 * 10203 people were reachable by typing, and the rest simply could not be found.
 * A user reported exactly that: an existing resource answering "No matches".
 *
 * The two halves below are what make the seam correct rather than merely
 * present. Passing `onSearchChange` must ALSO disable cmdk's own filter — the
 * server already decided what matches, and filtering its answer again can only
 * drop rows. And omitting the prop must leave the old client-side behaviour
 * untouched, because small fully-loaded lists (cancel reasons) still rely on it.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** cmdk renders its input with this attribute; there is no label to query by. */
const searchBox = () => document.querySelector("[cmdk-input]") as HTMLInputElement;
const rowTexts = () => [...document.querySelectorAll("[cmdk-item]")].map((i) => i.textContent?.trim());

function type(text: string) {
  const input = searchBox();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, text);
  fireEvent.input(input, { bubbles: true });
}

const OPTIONS = [
  { value: "a", label: "alpha" },
  { value: "b", label: "beta" },
];

describe.each([
  {
    name: "MultiSelect",
    open: () => fireEvent.click(screen.getByRole("combobox", { name: "Picker" })),
    render: (props: { onSearchChange?: (s: string) => void }) => (
      <MultiSelect options={OPTIONS} value={[]} onChange={() => {}} ariaLabel="Picker" {...props} />
    ),
  },
  {
    name: "Combobox",
    open: () => fireEvent.click(screen.getByRole("combobox", { name: "Picker" })),
    render: (props: { onSearchChange?: (s: string) => void }) => (
      <Combobox options={OPTIONS} value={undefined} onChange={() => {}} ariaLabel="Picker" {...props} />
    ),
  },
])("$name", ({ render: renderPicker, open }) => {
  it("reports the typed query to the caller", () => {
    const onSearchChange = vi.fn();
    render(renderPicker({ onSearchChange }));
    open();

    type("gamma");

    expect(onSearchChange).toHaveBeenCalledWith("gamma");
  });

  it("stops filtering locally once the caller searches server-side", async () => {
    // The server's answer arrives as `options`. Typing something that matches
    // NEITHER label must still show both rows: they are what the server
    // returned, and cmdk re-filtering them would hide rows it chose to send.
    render(renderPicker({ onSearchChange: vi.fn() }));
    open();

    type("zzzz-matches-no-label");

    await waitFor(() => expect(rowTexts()).toEqual(["alpha", "beta"]));
  });

  it("keeps filtering locally when the caller does not search server-side", async () => {
    // The other half: pickers with a small, fully-loaded list (cancel reasons)
    // must behave exactly as before this seam existed.
    render(renderPicker({}));
    open();

    type("alph");

    await waitFor(() => expect(rowTexts()).toEqual(["alpha"]));
  });

  it("tells a server-side miss apart from an idle box", async () => {
    // With cmdk's filter off, `CommandEmpty` never mounts (it keys off a match
    // count nobody computes), so the component renders its own line. Empty
    // options under a QUERY is a miss; under no query it is the caller's
    // `emptyText` — which is where loading and failure copy travels.
    const { rerender } = render(
      <MultiSelect
        options={[]}
        value={[]}
        onChange={() => {}}
        ariaLabel="Picker"
        emptyText="Type to search…"
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Picker" }));

    expect(screen.getByText("Type to search…")).toBeTruthy();

    type("nothing-like-this");

    await waitFor(() => expect(screen.getByText(/No matches for/)).toBeTruthy());
    expect(screen.queryByText("Type to search…")).toBeNull();

    rerender(
      <MultiSelect
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        ariaLabel="Picker"
        emptyText="Type to search…"
        onSearchChange={vi.fn()}
      />,
    );

    // Rows arrived: neither message may remain on screen.
    await waitFor(() => expect(screen.queryByText(/No matches for/)).toBeNull());
  });
});

describe("closing the picker clears the caller's query too", () => {
  it("MultiSelect reports the reset when the popover closes", () => {
    // Not cosmetic: the caller keeps fetching whatever it last heard. Clearing
    // only the visible box would leave the reopened picker showing results for
    // a query the operator can no longer see.
    const onSearchChange = vi.fn();
    render(
      <MultiSelect
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        ariaLabel="Picker"
        onSearchChange={onSearchChange}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Picker" });

    fireEvent.click(trigger);
    type("alpha");
    expect(onSearchChange).toHaveBeenLastCalledWith("alpha");

    fireEvent.click(trigger); // close

    expect(onSearchChange).toHaveBeenLastCalledWith("");
  });

  it("Combobox reports the reset when a row is picked", async () => {
    // The Combobox closes itself on select, so `onOpenChange` never runs on its
    // most common close path — the row handler has to clear the query as well.
    const onSearchChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={undefined}
        onChange={() => {}}
        ariaLabel="Picker"
        onSearchChange={onSearchChange}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Picker" }));
    type("alp");
    expect(onSearchChange).toHaveBeenLastCalledWith("alp");

    const row = [...document.querySelectorAll("[cmdk-item]")].find((i) => i.textContent === "alpha")!;
    fireEvent.click(row);

    await waitFor(() => expect(onSearchChange).toHaveBeenLastCalledWith(""));
  });
});
