import type { ReactNode } from "react";

import { AdminTabs } from "@/app/_components/admin-tabs";
import { AppShell } from "@/app/_components/app-shell";

/** Every Administration page shares the header and the tab row; pages render only their content. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <AdminTabs />
      {children}
    </AppShell>
  );
}
