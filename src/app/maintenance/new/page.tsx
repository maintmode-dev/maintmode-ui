import { AppShell } from "@/app/_components/app-shell";
import { MaintenanceDetailsPage } from "@/features/maintenance/maintenance-details-page";

/**
 * `/maintenance/new` — the calendar's "New maintenance" entry point. There is
 * no separate create screen: this renders MaintenanceDetailsPage in its
 * `creating` state (edit-mode with empty fields).
 */
export default function Page() {
  return (
    <AppShell>
      <MaintenanceDetailsPage creating />
    </AppShell>
  );
}
