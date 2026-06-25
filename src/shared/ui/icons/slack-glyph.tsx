import type { ComponentProps } from "react";

/**
 * Slack brand mark — the four-rounded-bar glyph, monochrome (`currentColor`).
 *
 * lucide-react does not ship a `Slack` icon, and the transport pill must show
 * the brand mark rather than a generic `#` hash (see channel-detail /
 * channels-list snapshots → "Transport pill" → `slack` = Slack four-bar glyph).
 * The path data is lifted verbatim from the design snapshot's
 * `design-snapshots/channel-detail/project/icons.jsx` so the implementation and
 * mockup share one source of truth.
 *
 * Drawn on the lucide 24×24 / `stroke-width:2` grid and styled like a lucide
 * icon (`fill: none; stroke: currentColor`) so it sits flush with the Send /
 * Bell transport glyphs in the same pill.
 */
export function SlackGlyph({ className, "aria-hidden": ariaHidden = true, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <rect width="3" height="8" x="13" y="2" rx="1.5" />
      <path d="M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5" />
      <rect width="3" height="8" x="8" y="14" rx="1.5" />
      <path d="M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5" />
      <rect width="8" height="3" x="14" y="13" rx="1.5" />
      <path d="M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5" />
      <rect width="8" height="3" x="2" y="8" rx="1.5" />
      <path d="M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5" />
    </svg>
  );
}
