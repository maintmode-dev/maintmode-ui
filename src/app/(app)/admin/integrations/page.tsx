import { AppShell } from "@/app/_components/app-shell";
import { IntegrationsPage } from "@/features/admin/integrations/integrations-page";

export default async function Page() {
  return (
    <AppShell>
      <IntegrationsPage />
    </AppShell>
  );
}
