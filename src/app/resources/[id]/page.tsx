import { AppHeader } from "@/app/_components/app-header";
import { requirePageAuth } from "@/app/_lib/require-page-admin";
import { ResourceDetail } from "@/features/resources-directory/components/resource-detail";

export const metadata = {
  title: "Resource — Maintmode",
};

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePageAuth(`/resources/${encodeURIComponent(id)}`);
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-6">
        <ResourceDetail id={id} />
      </main>
    </div>
  );
}
