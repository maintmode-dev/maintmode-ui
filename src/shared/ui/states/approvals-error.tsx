import { AlertTriangle, RefreshCw } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface ApprovalsErrorProps {
  onRetry?: () => void;
}

/**
 * Generic non-2xx error for the approvals queue fetch.
 *
 * Tone follows the calendar's: no emoji, no "Oops", no HTTP code in the copy,
 * one primary CTA. The 403 case does NOT come here — it has its own state
 * (`DetailsForbidden`), because "try again" is false advice when the answer
 * will not change on retry.
 */
export function ApprovalsError({ onRetry }: ApprovalsErrorProps) {
  return (
    <Stack
      icon={<AlertTriangle aria-hidden="true" />}
      title="Couldn't load approvals"
      caption="The server didn't respond. Try again."
      cta={
        <Button onClick={onRetry} size="sm">
          <RefreshCw className="size-3" aria-hidden="true" /> Retry
        </Button>
      }
    />
  );
}
