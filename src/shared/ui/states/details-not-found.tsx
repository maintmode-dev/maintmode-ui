import { ArrowLeft, FileQuestion } from "lucide-react";
import type { ReactNode } from "react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface DetailsNotFoundProps {
  /** Click handler for the "Back to calendar" CTA. */
  onBack?: () => void;
  /** Pass a custom CTA (e.g. wrapped in a Next.js <Link>). */
  cta?: ReactNode;
}

/**
 * 404 state for MaintenanceDetailsPage.
 *
 * Frozen tone: read-only explanation. No "user fault" framing. Secondary CTA
 * navigates back to the calendar, not "retry".
 */
export function DetailsNotFound({ onBack, cta }: DetailsNotFoundProps) {
  return (
    <Stack
      icon={<FileQuestion aria-hidden="true" />}
      title="Maintenance not found"
      caption="This maintenance does not exist or has been deleted."
      cta={
        cta ?? (
          <Button onClick={onBack} variant="outline" size="sm">
            <ArrowLeft className="size-3" aria-hidden="true" /> Back to calendar
          </Button>
        )
      }
    />
  );
}
