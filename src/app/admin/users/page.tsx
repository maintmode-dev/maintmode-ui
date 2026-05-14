import { AppHeader } from "@/app/_components/app-header";
import { requirePageAdmin } from "@/app/_lib/require-page-admin";
import { UserLookupForm } from "@/features/admin-roles/components/user-lookup-form";
import { ForbiddenState } from "@/shared/ui/primitives/state";

export const metadata = {
  title: "Admin · Users — Maintmode",
};

export default async function AdminUsersPage() {
  const gate = await requirePageAdmin("/admin/users");
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-6">
        {gate.kind === "forbidden" ? (
          <ForbiddenState roles={gate.roles} />
        ) : (
          <section className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">Admin · Users</h1>
              <p className="text-sm text-[var(--muted)]">
                Enter a user ID to view and manage their roles.
              </p>
            </header>
            <UserLookupForm />
          </section>
        )}
      </main>
    </div>
  );
}
