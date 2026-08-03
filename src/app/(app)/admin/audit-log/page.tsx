import { AppShell } from "@/app/_components/app-shell";
import { GlobalAuditLogPage } from "@/features/audit/global-audit-log-page";

export default function Page() {
  return (
    <AppShell>
      <GlobalAuditLogPage />
    </AppShell>
  );
}
