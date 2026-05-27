// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepRow } from "../step-row";

describe("StepRow", () => {
  it("renders the number when pending", () => {
    render(<StepRow number={3} title="Drain pool" />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Drain pool")).toBeTruthy();
  });

  it("renders a check icon (not the number) when done", () => {
    const { container } = render(<StepRow number={3} title="Drain pool" state="done" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("frozen: NEVER renders a status badge", () => {
    // The whole point of the frozen decision is no badge; assert no element
    // with the badge utility classes is present.
    const { container } = render(<StepRow number={1} title="Notify ops" state="done" />);
    expect(container.querySelector(".mm-badge")).toBeNull();
  });
});
