import { AppShell } from "@/app/_components/app-shell";
import { CalendarPage } from "@/features/calendar/calendar-page";

export default function HomePage() {
  return (
    <AppShell>
      <CalendarPage />
    </AppShell>
  );
}
