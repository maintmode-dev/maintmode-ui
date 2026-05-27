import { AppShell } from "@/app/_components/app-shell";
import { ResourceDetailPage } from "@/features/resources/resource-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <ResourceDetailPage id={id} />
    </AppShell>
  );
}
