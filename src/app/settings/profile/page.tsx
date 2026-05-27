import { AppShell } from "@/app/_components/app-shell";
import { UserSettingsPage } from "@/features/settings/user-settings-page";

export default function Page() {
  return (
    <AppShell>
      <UserSettingsPage />
    </AppShell>
  );
}
