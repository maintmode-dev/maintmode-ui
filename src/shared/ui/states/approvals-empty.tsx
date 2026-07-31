import { CheckCheck } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";

/**
 * Empty state for the "awaiting my approval" queue (RUK-215).
 *
 * Tone note: deliberately NOT congratulatory ("all caught up", "inbox zero").
 * Until the rework flow lands (RUK-224) a draft the reviewer neither wants to
 * approve nor to cancel has no way out of this queue, so an empty list is not
 * reliably an achievement — it is simply the current state. The copy describes
 * what the page holds instead of praising the reader for its being empty.
 */
export function ApprovalsEmpty() {
  return (
    <Stack
      icon={<CheckCheck aria-hidden="true" />}
      title="Nothing is waiting for your approval"
      caption="Maintenances assigned to you for review will appear here."
    />
  );
}
