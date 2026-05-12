# Calendar Feature

Owns the calendar composition, browser-safe hooks, query keys, and calendar-local state.

## Composition

- `components/calendar-page.tsx` — client component that mounts `CalendarTopPanel`,
  `MaintenanceCalendar`, and `CalendarFilterPanel`. Holds the `CalendarFilterState`
  (view, date, scope, statuses, resourceIds), syncs it into the URL via
  `useRouter().replace`, and opens `MaintenanceDetailsSheet` for selected events.
- `components/maintenance-calendar.tsx` — wraps FullCalendar (`dayGridMonth`,
  `timeGridWeek`, `timeGridDay`). Translates `MaintenanceSummary[]` into FullCalendar
  events, applies status colors from `domain/maintenance/rules/status`, and forwards
  event clicks to the details panel.
- `components/calendar-top-panel.tsx` — view switcher and date navigation.
- `components/calendar-filter-panel.tsx` — scope/status/resources filters. Reads
  resources via `useResourcesQuery`.

## Data layer

- `lib/calendar-navigation.ts` — pure helpers: `parseCalendarSearchParams`,
  `buildCalendarSearchParams`, `calendarRangeForView` (Monday-anchored grid
  per `calendar_month_packing.md`), and local-date formatting.
- `queries/query-keys.ts` — `calendarQueryKeys.all` is the single root key used
  by every mutation invalidator.
- `queries/use-calendar-query.ts` — hook that fetches `/api/maintenance` via
  `bffFetch`. Computes `from`/`to` from `view+date` and forwards
  `statuses`/`resource_ids` as multi-values, matching the BFF contract.

## Boundaries

- Browser code only ever calls `/api/**` via `bffFetch`. Backend tokens never
  reach the browser; they live in the NextAuth jwt cookie and are read
  server-side by `authenticatedBackendRequest`.
- After a maintenance mutation the calendar is invalidated centrally via
  `calendarQueryKeys.all` from the `useMaintenance*Mutation` hooks — do not
  call `queryClient.invalidateQueries` from feature components.
