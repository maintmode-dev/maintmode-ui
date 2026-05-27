import { AppShell } from "@/app/_components/app-shell";
import { UsersManagementPage } from "@/features/admin/users-management-page";

export default function Page() {
  return (
    <AppShell>
      <UsersManagementPage />
    </AppShell>
  );
}
