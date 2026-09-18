import { AppShell } from "@/app/_components/app-shell";
import { AuthMethodsPage } from "@/features/admin/auth-methods/auth-methods-page";

export default async function Page() {
  return (
    <AppShell>
      <AuthMethodsPage />
    </AppShell>
  );
}
