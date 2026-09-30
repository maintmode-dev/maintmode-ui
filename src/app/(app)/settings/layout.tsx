import type { ReactNode } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { SettingsFrame } from "@/app/_components/settings-frame";

/** Every Settings section shares the header and the side menu; pages render only their section. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <SettingsFrame>{children}</SettingsFrame>
    </AppShell>
  );
}
