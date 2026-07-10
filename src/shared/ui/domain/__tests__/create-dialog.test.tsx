// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateDialog, CreateDialogBody, CreateDialogFooter } from "../create-dialog";

// The dialog renders through a Radix portal into document.body, so leftovers
// from a previous test survive unless we clean up explicitly.
afterEach(cleanup);

function renderDialog(props: Partial<React.ComponentProps<typeof CreateDialog>> = {}) {
  const onOpenChange = vi.fn();
  const result = render(
    <CreateDialog open title="New resource" onOpenChange={onOpenChange} {...props}>
      <CreateDialogBody>
        <input aria-label="Name" />
      </CreateDialogBody>
      <CreateDialogFooter hint="Enter a name to continue.">
        <button type="button">Cancel</button>
        <button type="submit">Create</button>
      </CreateDialogFooter>
    </CreateDialog>,
  );
  return { onOpenChange, ...result };
}

describe("CreateDialog", () => {
  it("renders title, description, body, hint and actions", () => {
    renderDialog({ description: "Add a service MaintMode should track." });
    expect(screen.getByText("New resource")).toBeTruthy();
    expect(screen.getByText("Add a service MaintMode should track.")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByText("Enter a name to continue.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("omits the description node when not provided", () => {
    renderDialog();
    expect(document.querySelector('[data-slot="dialog-description"]')).toBeNull();
  });

  it("renders as a centered 560px dialog, not a side sheet (create-dialog canon)", () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toContain("sm:max-w-[560px]");
    expect(content?.className).toContain("top-[50%]");
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it("calls onOpenChange(false) when the close button is pressed", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("wraps children in a form and submits it when onSubmit is provided", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderDialog({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders no form when onSubmit is omitted", () => {
    renderDialog();
    expect(document.querySelector('[data-slot="dialog-content"] form')).toBeNull();
  });
});
