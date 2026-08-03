import { AppShell } from "@/app/_components/app-shell";
import { MaintenanceCreateView } from "@/features/maintenance/maintenance-create-view";

/**
 * `/maintenance/new` — the calendar's "New maintenance" entry point. Visually
 * this is still the maintenance page in its create state (edit-mode with empty
 * fields), but it is a separate module from the detail page on purpose: sharing
 * one component and branching on a `creating` prop at runtime made both routes
 * ship the union of their dependencies.
 */
export default function Page() {
  return (
    <AppShell>
      <MaintenanceCreateView />
    </AppShell>
  );
}
