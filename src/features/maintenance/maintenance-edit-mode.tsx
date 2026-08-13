"use client";

import { TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { Combobox } from "@/shared/ui/domain/combobox";
import { DateTimePicker } from "@/shared/ui/domain/date-time-picker";
import { MultiSelect, type MultiSelectOption } from "@/shared/ui/domain/multi-select";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { SectionCard } from "@/shared/ui/domain/section-card";
import { formatDateTime } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";
import { utcIsoToWallClock, wallClockToUtcIso } from "@/features/_shared/timezone/convert";
import type {
  MaintenanceDetail,
  MaintenanceDraftInput,
  MaintenanceImpact,
  MaintenanceScope,
} from "@/domain/maintenance/maintenance";

import { MAX_MENTIONS, mergeMentionChips, type MentionChip } from "@/domain/maintenance/mentions";
import { MAX_REMINDERS, offsetLabel, toFireAt, toOffsetFromFireAt } from "@/domain/maintenance/reminders";

import { MaintenanceRemindersField } from "./maintenance-reminders-field";
import { useAssignableUsersQuery } from "./queries/use-assignable-users-query";
import { useMentionableUsersQuery } from "./queries/use-mentionable-users-query";
import { useNotifyChannelsQuery } from "@/features/notify-channels/queries/use-notify-channels-query";
import { transportDisplayTitle, transportStatusCopy } from "@/features/notify-channels/transports";
import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";
import { useCreateMaintenance, useUpdateMaintenance } from "./queries/use-maintenance-draft";
import {
  emptyStep,
  MaintenanceStepEditor,
  MIN_STEP_MINUTES,
  type StepDraft,
} from "./maintenance-step-editor";

/** Backend cap on notify targets. */
const MAX_CHANNELS = 10;

export interface MaintenanceEditModeProps {
  /** Existing maintenance to edit. Omit (with `creating`) for the create flow. */
  detail?: MaintenanceDetail;
  /** Create a new draft instead of editing an existing one. */
  creating?: boolean;
  /** Edit: return to view mode. Create: navigate away (e.g. back to calendar). */
  onClose: () => void;
}

/**
 * Backend UTC instant → the wall-clock `YYYY-MM-DDTHH:MM` the picker shows, read
 * in the operator's `zone`. Was the read-back half of the "enter 18 → see 15"
 * bug (it used `getHours()`, i.e. the machine's zone); now it's zone-explicit.
 */
function isoDateTimeLocal(iso: string, zone: string): string {
  return utcIsoToWallClock(iso, zone);
}

/**
 * Picker wall-clock `YYYY-MM-DDTHH:MM` (interpreted in `zone`) → the UTC instant
 * the wire wants. Was the write half of the bug (`new Date(local).toISOString()`
 * parsed in the machine's zone); now the entered time means the same instant the
 * display shows.
 */
function localToIso(local: string, zone: string): string {
  return wallClockToUtcIso(local, zone);
}

/** Plain minute count → Go-duration string ("90" → "90m"). */
function minutesToGoDuration(minutes: string): string {
  return `${minutes.trim()}m`;
}

/** Seed the step editor from an existing maintenance (durations → minutes). */
function detailToSteps(detail: MaintenanceDetail | undefined): StepDraft[] {
  if (!detail || detail.steps.length === 0) return [emptyStep()];
  return detail.steps.map((s) => ({
    description: s.description ?? s.title,
    rollback_description: s.rollback_description ?? "",
    duration_minutes: durationToMinutes(s.duration),
  }));
}

/** Parse a Go/ISO duration string into a minute count for the editor input. */
function durationToMinutes(duration: string | undefined): string {
  if (!duration) return "";
  // Go's time.Duration always renders every nonzero-leading unit, so a
  // 2-hour step comes back as "2h0m0s" (not "2h"). Accept the trailing
  // seconds component and fold it into the minute count instead of failing
  // the match — otherwise the editor drops the duration on a loaded draft.
  const go = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (go && (go[1] || go[2] || go[3])) {
    const minutes = Number(go[1] ?? 0) * 60 + Number(go[2] ?? 0) + Number(go[3] ?? 0) / 60;
    return String(Math.round(minutes));
  }
  const iso = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (iso && (iso[1] || iso[2] || iso[3])) {
    const minutes = Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) + Number(iso[3] ?? 0) / 60;
    return String(Math.round(minutes));
  }
  return "";
}

/**
 * Unified create / edit form for a maintenance draft. Rendered inside
 * `MaintenanceDetailsPage`'s left pane — in edit mode over an existing
 * `detail`, or in the `creating` state (empty fields, "Create draft" footer)
 * launched from `/maintenance/new`.
 *
 * The form collects a notify-channel picker (min 1, max 10) and an
 * inline step editor (min 1 step, each ≥ 5 min with a rollback plan) — both
 * required by the backend — and validates client-side before submitting so the
 * obvious gaps surface inline rather than as a server 400. Channels also unblock
 * the long-standing `notify_targets: cannot be blank` failure on edit.
 */
export function MaintenanceEditMode({ detail, creating = false, onClose }: MaintenanceEditModeProps) {
  const router = useRouter();
  const create = useCreateMaintenance();
  const update = useUpdateMaintenance();
  const pending = creating ? create.isPending : update.isPending;
  const { zone, ready: zoneReady } = useTimezone();

  const [title, setTitle] = useState(detail?.title ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [impact, setImpact] = useState<MaintenanceImpact>(detail?.impact ?? "none");
  const [scope, setScope] = useState<MaintenanceScope>(detail?.scope ?? "resource");
  // Seed the picker from the loaded draft's UTC start, rendered as wall-clock in
  // the resolved zone. The seed runs in an effect (not `useState`) so it uses
  // the REAL zone once resolved, not the SSR fallback — otherwise an operator in
  // a non-UTC zone would open Edit on the UTC wall-clock and never see it
  // corrected. `startTouched` guards the re-seed from clobbering a user edit.
  const [start, setStart] = useState("");
  const [startTouched, setStartTouched] = useState(false);
  useEffect(() => {
    if (startTouched || !detail) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setStart(isoDateTimeLocal(detail.planned_period.start, zone));
  }, [detail, zone, startTouched]);
  const [approverId, setApproverId] = useState<string | undefined>(undefined);
  const [resourceIds, setResourceIds] = useState<string[]>(() => detail?.resources.map((r) => r.id) ?? []);
  // Hydrate from the loaded draft's notify_targets so Edit pre-selects the
  // channels already attached (mirrors `resourceIds` above). Without this the
  // picker opened empty and Save was blocked by the "≥1 channel" rule even
  // though the draft had a channel — risking a silent loss of the binding.
  const [channelIds, setChannelIds] = useState<string[]>(() => detail?.notify_targets.map((c) => c.id) ?? []);
  // People to tag in the notification (RUK-218). Hydrated from the loaded
  // draft's `mentions` so Edit pre-selects who is already tagged — load-bearing,
  // not convenience: on edit an empty selection is sent as `[]`, which
  // hard-deletes, so a picker that opened empty would silently drop the tags.
  // Deduped through a `Set` because the source is backend data, not just picker
  // clicks (same reasoning as `reminderOffsets` below); the DB's unique index
  // makes it a cheap belt-and-suspenders.
  const [mentionIds, setMentionIds] = useState<string[]>(() => [
    ...new Set(detail?.mentions?.map((m) => m.user_id) ?? []),
  ]);
  // Advance reminders, held as offsets in minutes (see `@/domain/maintenance/reminders`).
  // Hydrated on Edit by deriving each offset back out of the saved `fire_at`
  // (the backend stores instants, never the chosen preset). Seeded in an effect
  // rather than `useState` for the same reason as `start`: the derivation needs
  // the draft's real start, and `remindersTouched` keeps a later re-run from
  // clobbering the operator's edits.
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([]);
  const [remindersTouched, setRemindersTouched] = useState(false);
  useEffect(() => {
    if (remindersTouched || !detail) return;
    const start = detail.planned_period.start;
    const offsets = detail.reminders
      .map((r) => toOffsetFromFireAt(start, r.fire_at))
      .filter((m): m is number => m !== null);
    // Deduped: `toOffsetFromFireAt` rounds to the minute, so two saved instants
    // less than a minute apart collapse onto the same offset. The picker keys
    // rows by offset and toggles by value, so a duplicate would render twice and
    // delete both at once. The backend caps the count, not the spacing, so this
    // is reachable — collapse it here, at the boundary where it arises.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setReminderOffsets([...new Set(offsets)]);
  }, [detail, remindersTouched]);
  /** Submit-time "would fire in the past" error (see `pastReminders`). */
  const [reminderTimingError, setReminderTimingError] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepDraft[]>(() => detailToSteps(detail));
  const [submitted, setSubmitted] = useState(false);

  const assignable = useAssignableUsersQuery();
  // A separate hook from `assignable`, deliberately: that one re-filters to
  // approver roles, and mentions answer "who should be warned", not "who can
  // approve" — guests belong here. See `useMentionableUsersQuery`.
  //
  // Two hooks, two requests to `/api/users/assignable`, on purpose. They were
  // once deduped onto one unfiltered fetch; that made the approver list a
  // client-side filter over a truncated page and emptied the picker (SPEC §0.1).
  // The approver query must be narrowed by the SERVER, which means its own
  // request under its own key.
  const mentionable = useMentionableUsersQuery();
  const channelsQuery = useNotifyChannelsQuery();
  const resourcesQuery = useResourcesQuery({ limit: 200 });

  // Memoised for the same reason `mentionOptions` below is: this list now holds
  // up to 200 rows where before the fix it was routinely empty, and without this
  // every keystroke in Title/Description rebuilds all 200 objects.
  //
  // `searchValue` carries the email because cmdk matches on it: two people can
  // share a display name, and the email is the only thing that tells them apart
  // — it was visible in the description but not searchable. Mirrors
  // `resourceOptions` directly below. (Fuller server-side search: RUK-251.)
  const approverOptions = useMemo(
    () =>
      (assignable.data ?? []).map((u) => ({
        value: u.id,
        label: u.display_name,
        description: u.email,
        searchValue: `${u.display_name} ${u.email}`,
      })),
    [assignable.data],
  );
  const resourceOptions: MultiSelectOption[] = (resourcesQuery.data?.resources ?? []).map((r) => ({
    value: r.id,
    label: r.name,
    description: r.external_id,
    searchValue: `${r.name} ${r.external_id ?? ""}`,
  }));
  // A channel whose transport integration is disabled / not configured /
  // unreadable will silently not deliver. Mark those options
  // dimmed + warning icon, with the status badge as the description in place of
  // the channel id — but keep them selectable (weak binding, mirrors the
  // channel-create picker). A concrete non-ok binding is warned about inline
  // below the picker once selected.
  const channelOptions: MultiSelectOption[] = (channelsQuery.data ?? []).map((c) => {
    const statusCopy = transportStatusCopy(c.transportStatus);
    const idLine = c.transportChannelId ? `${c.transport} · ${c.transportChannelId}` : c.transport;
    return {
      value: c.id,
      label: (
        <span className={cn("flex items-center gap-1.5", statusCopy && "text-fg-muted")}>
          {c.name}
          {statusCopy ? (
            <TriangleAlert className="size-3 shrink-0 text-[var(--impact-partial-fg)]" aria-hidden={true} />
          ) : null}
        </span>
      ),
      description: statusCopy ? statusCopy.badge : idLine,
      searchValue: `${c.name} ${c.transport} ${c.transportChannelId ?? ""}`,
    };
  });
  // Mirrors the channel options above: a person the backend knows has no
  // messenger handle is dimmed + flagged, but stays selectable — they are still
  // mentioned in the notification, just by name instead of a clickable ping.
  //
  // The email stays in the description in both branches — it is the only thing
  // that tells two people with the same display name apart, so the warning is
  // appended to it rather than replacing it.
  //
  // Memoized, unlike the channel/resource option arrays next to it — this one
  // builds a JSX element per row, and the form is a single `useState` component,
  // so every keystroke in Title or Description would otherwise re-allocate the
  // whole list. Measured on 200 rows: 148 µs rebuilt vs 1.1 µs for a plain-string
  // label like `resourceOptions`. The neighbours are cheap because of their data,
  // not their structure, so matching them here would cost 130x, and it scales with
  // a user table that only `limit: 200` currently bounds.
  const mentionOptions = useMemo<MultiSelectOption[]>(
    () =>
      (mentionable.data ?? []).map((u) => {
        // Read once, named once: the tri-state comparison has to stay `=== false`
        // in all three places below, and a single `!u.has_messenger_tag` slip in
        // any one of them would warn on `undefined`.
        const noTag = u.has_messenger_tag === false;
        return {
          value: u.id,
          label: (
            <span className={cn("flex items-center gap-1.5", noTag && "text-fg-muted")}>
              {u.display_name}
              {noTag ? (
                <TriangleAlert
                  className="size-3 shrink-0 text-[var(--impact-partial-fg)]"
                  aria-hidden={true}
                />
              ) : null}
            </span>
          ),
          description: noTag ? `${u.email} · No messenger tag — will appear by name` : u.email,
          searchValue: `${u.display_name} ${u.email}`,
        };
      }),
    [mentionable.data],
  );

  const selectedResources = resourceIds.map((id) => {
    const fromCatalog = resourcesQuery.data?.resources.find((r) => r.id === id);
    const fromDetail = detail?.resources.find((r) => r.id === id);
    return { id, name: fromCatalog?.name ?? fromDetail?.name ?? id };
  });
  const selectedChannels = useMemo(
    () => (channelsQuery.data ?? []).filter((c) => channelIds.includes(c.id)),
    [channelsQuery.data, channelIds],
  );
  // Selected channels whose integration won't deliver — surfaced inline so the
  // operator sees the risk after the picker closes, not only inside it. Weak
  // binding: this warns, it doesn't block save.
  const undeliverableChannels = useMemo(
    () => selectedChannels.filter((c) => transportStatusCopy(c.transportStatus) != null),
    [selectedChannels],
  );
  // MERGE, not `filter` over the options (the channel chips above do filter, and
  // copying that here would be a bug): a selected person can legitimately be
  // absent from the options — blocked after the draft was saved, or beyond the
  // picker's limit. `filter` would hide them while they stay in `mentionIds`, and
  // the operator would then save or clear a list they were never shown. See
  // `mergeMentionChips`.
  const selectedMentions = useMemo<MentionChip[]>(
    () => mergeMentionChips(mentionIds, mentionable.data ?? [], detail?.mentions),
    [mentionIds, mentionable.data, detail?.mentions],
  );
  // A backend that predates mentions omits the key entirely (it otherwise always
  // sends an array), so `undefined` on an existing maintenance means "not
  // supported" — hide the field rather than let the operator pick people whose
  // selection would be accepted with a 200 and silently thrown away. On create
  // there is no detail to read the capability from, so the field always shows.
  const showMentions = creating || detail?.mentions !== undefined;

  const errors = useMemo<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required.";
    if (!description.trim()) e.description = "Description is required.";
    if (!start) e.start = "Planned start is required.";
    if (creating && !approverId) e.approver = "An approver is required.";
    if (scope === "resource" && resourceIds.length === 0) {
      e.resources = "Pick at least one resource for resource-scoped maintenance.";
    }
    if (channelIds.length === 0) e.channels = "Pick at least one notification channel.";
    if (channelIds.length > MAX_CHANNELS) e.channels = `At most ${MAX_CHANNELS} channels.`;
    if (mentionIds.length > MAX_MENTIONS) e.mentions = `At most ${MAX_MENTIONS} people.`;
    if (reminderOffsets.length > MAX_REMINDERS) e.reminders = `At most ${MAX_REMINDERS} reminders.`;
    const stepBad =
      steps.length === 0 ||
      steps.some((s) => {
        const mins = Number(s.duration_minutes);
        return (
          !s.description.trim() ||
          !s.rollback_description.trim() ||
          s.duration_minutes === "" ||
          !Number.isFinite(mins) ||
          mins < MIN_STEP_MINUTES
        );
      });
    if (stepBad) {
      e.steps = `Every step needs a description, a rollback plan, and a duration ≥ ${MIN_STEP_MINUTES} min.`;
    }
    return e;
  }, [
    title,
    description,
    start,
    scope,
    resourceIds,
    approverId,
    steps,
    channelIds,
    creating,
    mentionIds,
    reminderOffsets,
  ]);

  /**
   * Reminders that would fire in the past, evaluated against "now" at submit
   * time. Deliberately NOT part of the `errors` memo: `Date.now()` during render
   * is impure (unstable across re-renders), and a wall-clock comparison belongs
   * to the moment the operator actually submits. On approve the backend clamps
   * `fire_at - now` at zero, so a past reminder fires immediately — a surprise
   * blast worth blocking rather than shipping.
   *
   * On Edit this only judges what the operator actually touched. A draft saved
   * long enough ago can hold a reminder that has since fallen into the past;
   * blocking on it would trap them in a form they cannot save without first
   * deleting a reminder they never asked to change. Once they touch the picker
   * the full selection is theirs, so it is all fair game again.
   */
  function pastReminders(): number[] {
    if (!start || reminderOffsets.length === 0) return [];
    if (!creating && !remindersTouched) return [];
    const startIso = localToIso(start, zone);
    const now = Date.now();
    return reminderOffsets.filter((m) => {
      const fireAt = toFireAt(startIso, m);
      return fireAt != null && new Date(fireAt).getTime() <= now;
    });
  }

  function buildInput(): MaintenanceDraftInput {
    return {
      title: title.trim(),
      description: description.trim(),
      planned_start: localToIso(start, zone),
      scope,
      impact,
      resource_ids: scope === "resource" ? resourceIds : [],
      approver_user_id: approverId,
      notify_target_channel_ids: channelIds,
      mention_user_ids: mentionIds,
      reminder_offsets_minutes: reminderOffsets,
      steps: steps.map((s, i) => ({
        order: i + 1,
        description: s.description.trim(),
        rollback_description: s.rollback_description.trim(),
        duration: minutesToGoDuration(s.duration_minutes),
      })),
    };
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    // Guard: the wall-clock → UTC conversion must run in the operator's real
    // zone, not the SSR/first-render UTC fallback, or we'd persist an instant
    // offset by the zone (the exact RUK-201 bug, on the write side). The zone
    // resolves synchronously on mount, so this only ever blocks a submit fired
    // in the same tick as hydration — practically never for a human.
    if (!zoneReady) return;
    // Checked here (not in `errors`) because it compares against wall-clock now
    // — see `pastReminders`. Blocks the submit and surfaces in the field.
    const past = pastReminders();
    if (past.length > 0) {
      setReminderTimingError(
        `${past.map(offsetLabel).join(", ")} would fire in the past — move the start or drop the reminder.`,
      );
      return;
    }
    setReminderTimingError(null);
    const input = buildInput();

    if (creating) {
      create.mutate(input, {
        onSuccess: (res) => router.push(`/maintenance/${res.id}`),
      });
    } else if (detail) {
      update.mutate({ id: detail.id, input }, { onSuccess: () => onClose() });
    }
  }

  const show = (key: string) => (submitted ? errors[key] : undefined);

  // Create-flow gate (contract): `Create draft` stays disabled until the two
  // required fields — Title + planned start — are present, with a left hint
  // while disabled. (Full validation still runs on submit for the rest.)
  const createReady = Boolean(title.trim() && start);

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {/* Title leads, above the cards — mirrors the detail page where the title
          sits in the header. */}
      <Field label="Title" htmlFor="m-title" error={show("title")}>
        <Input
          id="m-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. DB index migration"
          aria-invalid={Boolean(show("title"))}
        />
      </Field>

      {/* Fields grouped into the same 3 semantic cards as the read-only detail
          page (Overview / Impact & targets / Plan) so create and view read as
          one screen in two modes. */}
      <SectionCard label="Overview">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Planned start" htmlFor="m-start" error={show("start")}>
            <DateTimePicker
              id="m-start"
              value={start}
              onChange={(v) => {
                setStartTouched(true);
                setStart(v);
                // Every reminder is relative to the start, so moving it can turn
                // a past reminder into a future one. Drop the stale error rather
                // than leaving a red warning about a problem just fixed.
                setReminderTimingError(null);
              }}
              aria-invalid={Boolean(show("start"))}
              aria-label="Planned start"
            />
          </Field>
          <Field label="Planned end" hint="Computed from start + step durations">
            {/* Derived server-side from the start + step durations; read-only here. */}
            <div className="flex h-9 items-center rounded-sm border border-border-subtle bg-bg-elev-2 px-3 text-sm text-fg-dim tabular-nums">
              {detail ? formatDateTime(detail.planned_period.end, zone) : "Calculated on save"}
            </div>
          </Field>
        </div>
        <Field label="Approver" error={show("approver")}>
          <Combobox
            options={approverOptions}
            value={approverId}
            onChange={setApproverId}
            placeholder={detail?.approver ? `Current: ${detail.approver}` : "Pick an approver…"}
            searchPlaceholder="Search people…"
            // Three states, three strings. `isError` used to be unread here, so
            // a 403 (the normal answer for a guest — the endpoint is permission
            // gated), a 500, and a genuinely empty roster all rendered "No
            // people found." That is the sentence this picker's outage hid
            // behind for its whole life, and it reads as a fact about the
            // company rather than a failure to load (SPEC §2.2).
            emptyText={
              assignable.isPending
                ? "Loading…"
                : assignable.isError
                  ? "Couldn't load people. Retry or check your access."
                  : "No people found."
            }
            // No `errorText` twin here, unlike Mentions below: that prop lives
            // on `MultiSelect` and this is a `Combobox`. So a screen-reader user
            // still hears an empty listbox when THIS load fails — and the
            // asymmetry runs backwards from operator risk, since approver is
            // required and mentions are optional. Porting the live region to
            // `Combobox` is real work rather than a drive-by, and is tracked as
            // RUK-269.
            ariaLabel="Approver"
          />
        </Field>
      </SectionCard>

      <SectionCard label="Impact & targets">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scope" htmlFor="m-scope">
            <Select value={scope} onValueChange={(v) => setScope(v as MaintenanceScope)}>
              <SelectTrigger id="m-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="resource">Resource</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Impact" htmlFor="m-impact">
            <Select value={impact} onValueChange={(v) => setImpact(v as MaintenanceImpact)}>
              <SelectTrigger id="m-impact">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No outage</SelectItem>
                <SelectItem value="partial_outage">Partial outage</SelectItem>
                <SelectItem value="full_outage">Full outage</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {scope === "resource" ? (
          <Field label="Resources" error={show("resources")}>
            <MultiSelect
              options={resourceOptions}
              value={resourceIds}
              onChange={setResourceIds}
              placeholder="Select resources…"
              searchPlaceholder="Search resources…"
              emptyText={resourcesQuery.isPending ? "Loading…" : "No resources found."}
              ariaLabel="Resources"
            />
            {selectedResources.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedResources.map((r) => (
                  <ResourceChip
                    key={r.id}
                    name={r.name}
                    onRemove={() => setResourceIds((ids) => ids.filter((id) => id !== r.id))}
                  />
                ))}
              </div>
            ) : null}
          </Field>
        ) : null}
        <Field label="Notify channels" hint={`At least one, up to ${MAX_CHANNELS}`} error={show("channels")}>
          <MultiSelect
            options={channelOptions}
            value={channelIds}
            onChange={setChannelIds}
            placeholder="Select channels…"
            searchPlaceholder="Search channels…"
            // Still two-state, and still wrong for the same reason the other two
            // pickers were: `isError` is unread, so a failed load renders as
            // "No channels configured." — which, unlike "no people", is a
            // plausible admin state, so an operator will go and configure
            // channels that already exist. Left deliberately (detection and
            // repair are separate changes) and tracked as RUK-268; this is a
            // `MultiSelect`, so it inherits `errorText` for free when done.
            emptyText={channelsQuery.isPending ? "Loading…" : "No channels configured."}
            ariaLabel="Notify channels"
          />
          {selectedChannels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedChannels.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 px-2 py-[3px] text-xs text-fg"
                >
                  <span className="text-fg-muted">{c.transport}</span>
                  <span className="font-medium">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => setChannelIds((ids) => ids.filter((id) => id !== c.id))}
                    aria-label={`Remove ${c.name}`}
                    className="ml-0.5 text-fg-muted hover:text-fg"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {undeliverableChannels.length > 0 ? (
            <Alert variant="warning" role="status" className="mt-2 px-3 py-2 text-xs [&>svg]:size-3.5">
              <TriangleAlert aria-hidden={true} />
              <AlertDescription className="gap-1.5 text-xs">
                {undeliverableChannels.map((c) => {
                  const copy = transportStatusCopy(c.transportStatus);
                  if (!copy) return null;
                  return (
                    <span key={c.id}>
                      <span className="font-medium text-fg">{c.name}</span>{" "}
                      {copy.detail(transportDisplayTitle(c.transport))}
                    </span>
                  );
                })}
              </AlertDescription>
            </Alert>
          ) : null}
        </Field>
        {/* Mentions sit between "where" (channels) and "when" (reminders): all
            three describe the same notification. Approver stays in Overview on
            purpose — it answers who *approves*, not who gets warned. */}
        {showMentions ? (
          <Field
            label="Mentions"
            hint={`Optional, up to ${MAX_MENTIONS} · tagged in the notification`}
            error={show("mentions")}
          >
            <MultiSelect
              options={mentionOptions}
              value={mentionIds}
              onChange={setMentionIds}
              placeholder="Pick people to tag…"
              searchPlaceholder="Search by name or email"
              // Three states, three strings — the same shape as the approver
              // combobox above, and for the same reason. `isError` went unread
              // here too, so a 403 (routine for a guest: the endpoint is
              // permission gated, and mentions deliberately do NOT filter by
              // role, so guests reach this picker), a 500, and a genuinely
              // empty roster all rendered "No people found." — a sentence that
              // reads as a fact about the company rather than a failed request.
              emptyText={
                mentionable.isPending
                  ? "Loading…"
                  : mentionable.isError
                    ? "Couldn't load people. Retry or check your access."
                    : "No people found."
              }
              // Same sentence, second channel: `emptyText` lands in a
              // `role="presentation"` node, so on its own the fix above is
              // invisible to a screen reader and a failed load still reads as
              // an empty roster there.
              //
              // `isPending` is checked here for the same reason the ternary
              // above checks it FIRST, and the two must agree: a failed query
              // that is refetching reports `isPending` and `isError` together,
              // and announcing "couldn't load" under a popover that reads
              // "Loading…" tells the two audiences different things about the
              // same moment.
              errorText={
                !mentionable.isPending && mentionable.isError
                  ? "Couldn't load people. Retry or check your access."
                  : undefined
              }
              ariaLabel="Mentions"
            />
            {selectedMentions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedMentions.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 px-2 py-[3px] text-xs text-fg"
                  >
                    {/* Same tri-state rule as the picker option: only an explicit
                        `false` earns the warning. */}
                    {m.hasTag === false ? (
                      <TriangleAlert
                        className="size-3 shrink-0 text-[var(--impact-partial-fg)]"
                        aria-hidden={true}
                      />
                    ) : null}
                    <span className="font-medium">{m.name}</span>
                    {/* A real icon in a grid-centred box, not a bare glyph —
                        the glyph gives a 9×16px hit target and leaks into page
                        search and copy-paste (see `MaintenanceRemindersField`). */}
                    <button
                      type="button"
                      onClick={() => setMentionIds((ids) => ids.filter((id) => id !== m.id))}
                      aria-label={`Remove ${m.name}`}
                      className="ml-0.5 inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs text-fg-muted hover:bg-bg-elev-4 hover:text-fg"
                    >
                      <X className="size-3" aria-hidden={true} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </Field>
        ) : null}
        <Field
          label="When to notify"
          hint={`Optional, up to ${MAX_REMINDERS}`}
          error={show("reminders") ?? reminderTimingError ?? undefined}
        >
          <MaintenanceRemindersField
            value={reminderOffsets}
            onChange={(next) => {
              setRemindersTouched(true);
              setReminderOffsets(next);
              // The stale timing error refers to a selection that no longer
              // exists; re-checked on the next submit.
              setReminderTimingError(null);
            }}
            plannedStart={start ? localToIso(start, zone) : ""}
            zone={zone}
          />
          <p className="pt-1 text-[10px] text-fg-muted">
            Reminders are scheduled once the maintenance is approved.
          </p>
        </Field>
      </SectionCard>

      <SectionCard label="Plan">
        <Field label="Description" htmlFor="m-desc" error={show("description")}>
          <Textarea
            id="m-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What's happening and why"
            aria-invalid={Boolean(show("description"))}
          />
        </Field>
        <Field label="Steps" hint="At least one, each ≥ 5 min with a rollback plan" error={show("steps")}>
          <MaintenanceStepEditor steps={steps} onChange={setSteps} disabled={pending} />
        </Field>
      </SectionCard>

      <footer className="flex items-center gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          {creating ? "Cancel" : "Discard"}
        </Button>
        {creating && !createReady ? (
          <span className="ml-auto mr-2 text-xs text-fg-dim">Enter a title and start time to continue</span>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={creating && !createReady ? "" : "ml-auto"}
          // Also gate on `!zoneReady`: the picker's wall-clock is converted to
          // UTC in the resolved zone, so submitting before the zone resolves
          // (the same-tick-as-hydration edge) would use the UTC fallback. The
          // handler still returns early as a backstop, but disabling the button
          // makes the guard visible instead of a silent no-op.
          disabled={pending || !zoneReady || (creating && !createReady)}
        >
          {creating ? (pending ? "Creating…" : "Create draft") : pending ? "Saving…" : "Save changes"}
        </Button>
      </footer>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
        >
          {label}
        </Label>
        {hint ? <span className="text-[10px] text-fg-muted">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className={cn("text-xs text-destructive")}>{error}</p> : null}
    </div>
  );
}
