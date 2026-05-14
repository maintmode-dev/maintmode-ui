import { AppHeader } from "@/app/_components/app-header";
import { requirePageAdmin } from "@/app/_lib/require-page-admin";
import { ResourceCreateForm } from "@/features/resources-directory/components/resource-create-form";
import { ForbiddenState } from "@/shared/ui/primitives/state";

export const metadata = {
  title: "New resource — Maintmode",
};

export default async function NewResourcePage() {
  const gate = await requirePageAdmin("/resources/new");
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-6">
        {gate.kind === "forbidden" ? (
          <ForbiddenState
            title="Creating resources requires admin"
            roles={gate.roles}
          >
            Ask a maintmode admin to grant your account the <code>admin</code> role.
          </ForbiddenState>
        ) : (
          <ResourceCreateForm />
        )}
      </main>
    </div>
  );
}
