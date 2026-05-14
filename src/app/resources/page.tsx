import { AppHeader } from "@/app/_components/app-header";
import { requirePageAuth } from "@/app/_lib/require-page-admin";
import { isAdmin } from "@/domain/auth/permissions";
import { ResourceDirectoryList } from "@/features/resources-directory/components/resource-directory-list";

export const metadata = {
  title: "Resources — Maintmode",
};

export default async function ResourcesPage() {
  const { roles } = await requirePageAuth("/resources");
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <ResourceDirectoryList canCreate={isAdmin(roles)} />
      </main>
    </div>
  );
}
