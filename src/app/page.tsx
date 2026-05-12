import { Suspense } from "react";

import { CalendarPage } from "@/features/calendar/components/calendar-page";
import { AppHeader } from "@/app/_components/app-header";

export default function HomePage() {
  return (
    <div className="app-shell">
      <AppHeader />
      <Suspense fallback={<div className="p-6 text-sm text-[var(--muted)]">Loading calendar…</div>}>
        <CalendarPage />
      </Suspense>
    </div>
  );
}
