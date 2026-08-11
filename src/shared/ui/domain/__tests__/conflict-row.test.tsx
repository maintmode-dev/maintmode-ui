// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConflictRow } from "../conflict-row";

/**
 * The quick sheet's conflict row (RUK-178).
 *
 * This file exists because the component had NO coverage for `unreviewed`: the
 * details-page test mocks the quick sheet out entirely, and the one test that
 * renders a real quick sheet uses a `conflicts: []` fixture, so the row never
 * rendered under test. Changing the badge copy to the forbidden phrasing, or
 * deleting the badge outright, left the whole suite green.
 */

afterEach(cleanup);

const MARKER = "Not seen at approval";

describe("ConflictRow — unreviewed badge", () => {
  it("labels an unreviewed row, without asserting a cause", () => {
    render(<ConflictRow title="Unreviewed neighbour" unreviewed />);

    expect(screen.getByText(MARKER)).toBeTruthy();
    // The backend cannot know WHY a conflict is unreviewed — the same `false`
    // arrives when its snapshot read fails — so the copy must not claim one.
    expect(screen.queryByText(/appeared after approval/i)).toBeNull();
  });

  it("leaves a reviewed row unbadged", () => {
    render(<ConflictRow title="Seen neighbour" unreviewed={false} />);
    expect(screen.queryByText(MARKER)).toBeNull();
  });

  it("omits the badge when the flag is absent entirely", () => {
    render(<ConflictRow title="Plain neighbour" />);
    expect(screen.queryByText(MARKER)).toBeNull();
  });

  it("keeps `trailing` content alongside the badge rather than replacing it", () => {
    // The badge composes with the slot; an implementation that renders one
    // INSTEAD of the other would drop caller-supplied content on the floor.
    render(<ConflictRow title="Unreviewed neighbour" unreviewed trailing={<span>12 min</span>} />);

    expect(screen.getByText(MARKER)).toBeTruthy();
    expect(screen.getByText("12 min")).toBeTruthy();
  });
});
