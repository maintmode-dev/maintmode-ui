import { AppShell } from "@/app/_components/app-shell";
import { ResourcesListPage } from "@/features/resources/resources-list-page";

export default function Page() {
  return (
    <AppShell>
      <ResourcesListPage />
    </AppShell>
  );
}
