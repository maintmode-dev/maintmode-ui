import { AppShell } from "@/app/_components/app-shell";
import { MaintenanceDetailsPage } from "@/features/maintenance/maintenance-details-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <MaintenanceDetailsPage id={id} />
    </AppShell>
  );
}
