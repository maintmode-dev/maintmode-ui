import { CalendarPlus, Plus } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface CalendarEmptyProps {
  /** Click handler for the primary "New maintenance" CTA. */
  onCreate?: () => void;
  /** Override the CTA, e.g. with a Next.js <Link> wrapped button. */
  cta?: React.ReactNode;
}

/**
 * Calendar empty state — frozen: render the centered Stack as an overlay on
 * top of a dimmed week grid (the parent route preserves the grid at
 * `opacity: 0.4` per design-plan; this component is just the overlay card).
 *
 * Copy is canonical from `design-snapshots/empty-states/project/states.jsx`.
 */
export function CalendarEmpty({ onCreate, cta }: CalendarEmptyProps) {
  return (
    <Stack
      icon={<CalendarPlus aria-hidden="true" />}
      title="No maintenance scheduled for this week"
      caption="Plan one to coordinate with your team."
      cta={
        cta ?? (
          <Button onClick={onCreate} size="sm">
            <Plus className="size-3" aria-hidden="true" /> New maintenance
          </Button>
        )
      }
    />
  );
}
