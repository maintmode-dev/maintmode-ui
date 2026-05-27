import { AlertTriangle, RefreshCw } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface CalendarErrorProps {
  onRetry?: () => void;
}

/**
 * Generic non-2xx error for the calendar fetch.
 *
 * Tone: no emoji, no "Oops", no HTTP code in copy. Single primary CTA = Retry.
 */
export function CalendarError({ onRetry }: CalendarErrorProps) {
  return (
    <Stack
      icon={<AlertTriangle aria-hidden="true" />}
      title="Couldn't load calendar"
      caption="The server didn't respond. Try again."
      cta={
        <Button onClick={onRetry} size="sm">
          <RefreshCw className="size-3" aria-hidden="true" /> Retry
        </Button>
      }
    />
  );
}
