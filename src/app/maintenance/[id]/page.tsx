import { MaintenanceDetailsPage } from "@/features/maintenance-details/components/maintenance-details-page";

type MaintenancePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { id } = await params;
  return <MaintenanceDetailsPage id={id} />;
}
