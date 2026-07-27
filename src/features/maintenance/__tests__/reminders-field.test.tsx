// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MaintenanceRemindersField } from "../maintenance-reminders-field";

/**
 * RUK-216 "When to notify". The offset→instant math is unit-tested in
 * `@/domain/maintenance/__tests__/reminders`; this covers the interaction
 * contract the mapper depends on — what ends up in `value`, and the two guards
 * (backend cap of 10, no duplicates) that must hold before submit.
 */

const PLANNED_START = "2026-08-01T10:00:00.000Z";

/** Controlled harness: the field is presentational, the parent owns the state. */
function Harness({ initial = [] as number[] }) {
  const [offsets, setOffsets] = useState<number[]>(initial);
  return (
    <>
      <MaintenanceRemindersField
        value={offsets}
        onChange={setOffsets}
        plannedStart={PLANNED_START}
        zone="Europe/Belgrade"
      />
      <output data-testid="offsets">{JSON.stringify(offsets)}</output>
    </>
  );
}

const offsets = () => JSON.parse(screen.getByTestId("offsets").textContent ?? "[]") as number[];
const preset = (label: string) => screen.getByRole("button", { name: label });
const addCustom = (value: string) => {
  fireEvent.change(screen.getByLabelText("Custom reminder amount"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
};

afterEach(cleanup);

describe("MaintenanceRemindersField", () => {
  it("toggles presets on and off", () => {
    render(<Harness />);
    fireEvent.click(preset("1 day before"));
    expect(offsets()).toEqual([1_440]);
    fireEvent.click(preset("1 hour before"));
    expect(offsets()).toEqual([1_440, 60]);
    fireEvent.click(preset("1 day before"));
    expect(offsets()).toEqual([60]);
  });

  it("marks selected presets as pressed", () => {
    render(<Harness initial={[1_440]} />);
    expect(preset("1 day before").getAttribute("aria-pressed")).toBe("true");
    expect(preset("7 days before").getAttribute("aria-pressed")).toBe("false");
  });

  it("previews each reminder's absolute time in the operator's zone", () => {
    // 1 day before 10:00Z = 2026-07-31T10:00Z, which is 12:00 in UTC+2.
    render(<Harness initial={[1_440]} />);
    expect(screen.getByText(/Jul 31, 2026, 12:00/)).toBeTruthy();
  });

  it("lists reminders longest lead time first, whatever the selection order", () => {
    render(<Harness />);
    fireEvent.click(preset("15 minutes before"));
    fireEvent.click(preset("7 days before"));
    const labels = screen.getAllByRole("button", { name: /^Remove / }).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Remove 7 days before", "Remove 15 minutes before"]);
  });

  it("adds a custom offset scaled by its unit", () => {
    render(<Harness />);
    addCustom("90"); // default unit is hours
    expect(offsets()).toEqual([5_400]);
    expect(screen.getByText("90 hours before")).toBeTruthy();
  });

  it("rejects a custom value that is not a positive whole number", () => {
    render(<Harness />);
    addCustom("0");
    expect(offsets()).toEqual([]);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // The backend caps the reminder count, not how far ahead they sit, so a
  // fat-fingered "999999999 hours" would otherwise be stored and queued with a
  // delay measured in millennia.
  it("rejects an offset beyond the one-year horizon", () => {
    render(<Harness />);
    addCustom("999999999");
    expect(offsets()).toEqual([]);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // 8760 hours = 365 days, the exact horizon. Expressed in hours because the
  // unit picker is a shadcn Select, which `fireEvent.change` cannot drive.
  it("accepts an offset exactly on the horizon", () => {
    render(<Harness />);
    addCustom("8760");
    expect(offsets()).toEqual([365 * 24 * 60]);
  });

  it("rejects the first offset past the horizon", () => {
    render(<Harness />);
    addCustom("8761");
    expect(offsets()).toEqual([]);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("rejects a duplicate of an existing reminder", () => {
    render(<Harness initial={[60]} />);
    addCustom("1");
    expect(offsets()).toEqual([60]);
    expect(screen.getByText("1 hour before is already added.")).toBeTruthy();
  });

  it("stops at the backend cap of 10", () => {
    const ten = Array.from({ length: 10 }, (_, i) => (i + 1) * 60);
    render(<Harness initial={ten} />);
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    // An unselected preset can't push past the cap...
    expect((preset("15 minutes before") as HTMLButtonElement).disabled).toBe(true);
    // ...but an already-selected one stays clickable, or the operator could
    // never get back under the cap.
    expect((preset("1 hour before") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(preset("1 hour before"));
    expect(offsets()).toHaveLength(9);
  });

  it("removes a reminder from its list row", () => {
    render(<Harness initial={[1_440, 60]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 day before" }));
    expect(offsets()).toEqual([60]);
  });

  it("says so rather than showing a bogus time when the start is unset", () => {
    render(
      <MaintenanceRemindersField value={[60]} onChange={() => {}} plannedStart="" zone="UTC" />,
    );
    expect(screen.getByText("Set a start time")).toBeTruthy();
  });

  it("renders each offset's preview in the operator's zone, not UTC", () => {
    render(
      <MaintenanceRemindersField
        value={[60]}
        onChange={() => {}}
        plannedStart={PLANNED_START}
        zone="Asia/Tokyo"
      />,
    );
    // 1 hour before 10:00Z = 09:00Z = 18:00 in UTC+9, on the same date.
    expect(screen.getByText(/Aug 01, 2026, 18:00/)).toBeTruthy();
  });

  it("keeps a custom offset that duplicates nothing, alongside the presets", () => {
    render(<Harness initial={[1_440]} />);
    addCustom("2"); // 2 hours = 120, not a preset
    expect(offsets()).toEqual([1_440, 120]);
    expect(screen.getByText("2 hours before")).toBeTruthy();
  });

  // The cap guard is `value.length >= MAX_REMINDERS`, so a parent that hands
  // down MORE than 10 (the backend stores instants and the form derives offsets
  // from them) must still let the operator delete their way back under.
  it("lets the operator get back under the cap when handed an over-full selection", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => (i + 1) * 60);
    render(<Harness initial={eleven} />);
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 hour before" }));
    expect(offsets()).toHaveLength(10);
  });

  /**
   * Hydration derives offsets from stored instants, and two instants under a
   * minute apart round to the SAME offset (see `toOffsetFromFireAt` in the
   * domain suite). The backend can hold both — it caps the count, not the
   * spacing — so the field can legitimately be handed a duplicate.
   *
   * This documents what happens today rather than asserting it is desirable:
   * both rows render (React warns about the duplicated `key`), and removing
   * "one" drops both, because `toggle` filters by value. Deduplicating at the
   * hydration boundary would make this unreachable; see the report.
   */
  it("drops both rows at once when handed a duplicated offset (known collision)", () => {
    render(<Harness initial={[1_440, 1_440]} />);
    expect(screen.getAllByRole("button", { name: "Remove 1 day before" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove 1 day before" })[0]);
    expect(offsets()).toEqual([]);
  });

  it("clears a stale validation error once the operator retypes", () => {
    render(<Harness />);
    addCustom("0");
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Custom reminder amount"), { target: { value: "3" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Enter inside the custom input must add a reminder, never submit the
  // surrounding maintenance <form> — that would save a half-filled draft.
  it("adds on Enter without submitting the surrounding form", () => {
    let submitted = false;
    render(
      <form onSubmit={() => { submitted = true; }}>
        <Harness />
      </form>,
    );
    const input = screen.getByLabelText("Custom reminder amount");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(offsets()).toEqual([240]);
    expect(submitted).toBe(false);
  });
});
