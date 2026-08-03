import { AppShell } from "@/app/_components/app-shell";
import { NotifyChannelDetailPage } from "@/features/notify-channels/notify-channel-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <NotifyChannelDetailPage id={id} />
    </AppShell>
  );
}
