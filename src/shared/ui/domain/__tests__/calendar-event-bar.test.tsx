// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarEventBar } from "../calendar-event-bar";

describe("CalendarEventBar", () => {
  it("renders title and time", () => {
    render(<CalendarEventBar status="planned" title="Patch deploy" time="14:00" />);
    expect(screen.getByText("Patch deploy")).toBeTruthy();
    expect(screen.getByText("14:00")).toBeTruthy();
  });

  it("renders the conflict warning icon when conflict=true", () => {
    render(<CalendarEventBar status="planned" title="X" conflict />);
    // lucide renders the icon with the aria-label we pass.
    expect(screen.getByLabelText("Conflict on this event")).toBeTruthy();
  });

  it("omits the conflict icon by default (frozen: no stripes either)", () => {
    const { container } = render(<CalendarEventBar status="planned" title="X" />);
    expect(container.querySelector('[aria-label="Conflict on this event"]')).toBeNull();
    // Sanity: the bar must not ship the conflict-stripes utility on the event itself.
    expect(container.firstElementChild?.className).not.toContain("conflict-stripes");
  });

  it("adds is-canceled to the canceled variant", () => {
    const { container } = render(<CalendarEventBar status="canceled" title="X" />);
    expect(container.firstElementChild?.className).toContain("is-canceled");
  });
});
