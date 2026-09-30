import { AppShell } from "@/app/_components/app-shell";
import { AuthenticationPage } from "@/features/admin/authentication/authentication-page";

export default async function Page() {
  return (
    <AppShell>
      <AuthenticationPage />
    </AppShell>
  );
}
