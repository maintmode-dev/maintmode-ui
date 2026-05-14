import { AppHeader } from "@/app/_components/app-header";
import { requirePageAdmin } from "@/app/_lib/require-page-admin";
import { AuditLogPage } from "@/features/audit-log/components/audit-log-page";
import { ForbiddenState } from "@/shared/ui/primitives/state";

export const metadata = {
  title: "Audit log — Maintmode",
};

export default async function AuditPage() {
  const gate = await requirePageAdmin("/audit");
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        {gate.kind === "forbidden" ? (
          <ForbiddenState roles={gate.roles} />
        ) : (
          <AuditLogPage />
        )}
      </main>
    </div>
  );
}
