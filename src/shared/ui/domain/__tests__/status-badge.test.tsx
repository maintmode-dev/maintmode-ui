// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STATUS_LABEL, StatusBadge, type MaintenanceStatus } from "../status-badge";

const ALL_STATUSES: MaintenanceStatus[] = ["draft", "planned", "in_progress", "completed", "canceled"];

describe("StatusBadge", () => {
  it.each(ALL_STATUSES)("renders the label for %s", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_LABEL[status])).toBeTruthy();
  });

  it("renders the dot by default", () => {
    const { container } = render(<StatusBadge status="planned" />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("omits the dot when dot=false", () => {
    const { container } = render(<StatusBadge status="planned" dot={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("adds the is-canceled utility for canceled status", () => {
    const { container } = render(<StatusBadge status="canceled" />);
    expect(container.firstElementChild?.className).toContain("is-canceled");
  });
});
