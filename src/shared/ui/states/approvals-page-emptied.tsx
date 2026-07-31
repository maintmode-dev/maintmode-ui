import { Inbox } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface ApprovalsPageEmptiedProps {
  /** Return to the first page of the queue. */
  onBackToStart?: () => void;
}

/**
 * A later page of the approvals queue that has emptied out — distinct from
 * {@link ApprovalsEmpty}, which means the whole queue is clear.
 *
 * This state exists because the rows can leave while the reviewer is standing
 * on them: approving happens from the quick-sheet, without navigating away. The
 * generic empty state would be a dead end here — it carries no controls, the
 * offset lives in component state rather than the URL, and the header would
 * read "N pending" directly above "nothing is waiting", leaving a manual reload
 * as the only escape. Hence the CTA.
 */
export function ApprovalsPageEmptied({ onBackToStart }: ApprovalsPageEmptiedProps) {
  return (
    <Stack
      icon={<Inbox aria-hidden="true" />}
      title="This page is empty now"
      caption="Everything here has been dealt with. The rest of the queue is still waiting."
      cta={
        <Button size="sm" onClick={onBackToStart}>
          Back to the first page
        </Button>
      }
    />
  );
}
