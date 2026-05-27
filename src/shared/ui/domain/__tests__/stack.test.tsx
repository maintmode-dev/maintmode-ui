// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stack } from "../stack";

describe("Stack", () => {
  it("renders title and caption", () => {
    render(<Stack title="Nothing here" caption="Try a different filter" />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeTruthy();
    expect(screen.getByText("Try a different filter")).toBeTruthy();
  });

  it("renders the CTA slot when provided", () => {
    render(<Stack title="Empty" cta={<button type="button">Create</button>} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });
});
