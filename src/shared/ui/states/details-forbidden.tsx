import { Lock } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";

/**
 * 403 state for MaintenanceDetailsPage.
 *
 * Frozen tone: explanation only — NO CTA. Admin-action workflows are
 * out of MVP scope; the user lacks anywhere to recover from this state.
 */
export function DetailsForbidden() {
  return (
    <Stack
      icon={<Lock aria-hidden="true" />}
      title="You don't have access"
      caption="This maintenance is restricted to specific roles."
    />
  );
}
