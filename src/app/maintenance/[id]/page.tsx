import { MaintenanceDetailsRouteShell } from "@/features/maintenance-details/components/maintenance-details-route-shell";

type MaintenancePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { id } = await params;

  return <MaintenanceDetailsRouteShell maintenanceId={id} />;
}
