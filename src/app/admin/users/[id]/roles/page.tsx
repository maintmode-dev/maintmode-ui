import { AppHeader } from "@/app/_components/app-header";
import { requirePageAdmin } from "@/app/_lib/require-page-admin";
import { UserRolesManager } from "@/features/admin-roles/components/user-roles-manager";
import { ForbiddenState } from "@/shared/ui/primitives/state";

export const metadata = {
  title: "Admin · User roles — Maintmode",
};

export default async function UserRolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await requirePageAdmin(`/admin/users/${encodeURIComponent(id)}/roles`);
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-6">
        {gate.kind === "forbidden" ? (
          <ForbiddenState roles={gate.roles} />
        ) : (
          <UserRolesManager userId={id} />
        )}
      </main>
    </div>
  );
}
