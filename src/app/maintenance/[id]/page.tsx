import { redirect } from "next/navigation";

type MaintenancePageProps = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Deep-link entry for `/maintenance/<id>` URLs. The product UX keeps the
 * details panel mounted on top of the calendar via `?maintenance=<id>`, so
 * we just rewrite to the canonical query-string form. This preserves
 * shareable links without forking the rendering path.
 */
export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { id } = await params;
  redirect(`/?maintenance=${encodeURIComponent(id)}`);
}
