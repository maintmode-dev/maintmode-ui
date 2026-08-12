import { CalendarPlus, Plus } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface CalendarEmptyProps {
  /** Click handler for the primary "New maintenance" CTA. */
  onCreate?: () => void;
  /** Override the CTA, e.g. with a Next.js <Link> wrapped button. */
  cta?: React.ReactNode;
  /** Override the title — e.g. the "hidden by filters" variant. */
  title?: React.ReactNode;
  /** Override the caption. */
  caption?: React.ReactNode;
}

/**
 * Calendar empty state — frozen: render the centered Stack as an overlay on
 * top of a dimmed week grid (the parent route preserves the grid at
 * `opacity: 0.4` per design-plan; this component is just the overlay card).
 *
 * Copy is canonical from `design-snapshots/empty-states/project/states.jsx`,
 * with ONE deliberate exception: the default `title` says "for this period"
 * where the snapshot still says "for this week". The snapshot is wrong — this
 * component renders in all three calendar views and takes no `view` prop
 * (RUK-262). Do NOT "restore" the snapshot wording; re-syncing the snapshot is
 * a separate ticket.
 *
 * `title`/`caption` are overridable for the "all hidden by filters" variant,
 * which is a distinct situation from "nothing scheduled".
 */
export function CalendarEmpty({ onCreate, cta, title, caption }: CalendarEmptyProps) {
  return (
    <Stack
      icon={<CalendarPlus aria-hidden="true" />}
      title={title ?? "No maintenance scheduled for this period"}
      caption={caption ?? "Plan one to coordinate with your team."}
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
