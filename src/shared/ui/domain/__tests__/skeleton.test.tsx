// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("uses the shimmer animation by default", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain("animate-mm-shimmer");
  });

  it("applies width and height props", () => {
    const { container } = render(<Skeleton width={120} height={10} />);
    const el = container.firstElementChild as HTMLElement | null;
    expect(el?.style.width).toBe("120px");
    expect(el?.style.height).toBe("10px");
  });

  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});
