// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IMPACT_LABEL, ImpactBadge, type ImpactLevel } from "../impact-badge";

const ALL_IMPACTS: ImpactLevel[] = ["none", "partial_outage", "full_outage"];

describe("ImpactBadge", () => {
  it.each(ALL_IMPACTS)("renders the label for %s", (impact) => {
    render(<ImpactBadge impact={impact} />);
    expect(screen.getByText(IMPACT_LABEL[impact])).toBeTruthy();
  });
});
