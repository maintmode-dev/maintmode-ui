import { AppShell } from "@/app/_components/app-shell";
import { MaintenanceAuditPage } from "@/features/audit/maintenance-audit-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <MaintenanceAuditPage id={id} />
    </AppShell>
  );
}
