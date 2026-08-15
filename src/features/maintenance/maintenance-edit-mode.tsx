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
  AssignableUser,
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
import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";
import { useNotifyChannelsQuery } from "@/features/notify-channels/queries/use-notify-channels-query";
import { transportDisplayTitle, transportStatusCopy } from "@/features/notify-channels/transports";
import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";
import { useDebouncedValue } from "@/features/_shared/hooks/use-debounced-value";
import { useCreateMaintenance, useUpdateMaintenance } from "./queries/use-maintenance-draft";
import {
  emptyStep,
  MaintenanceStepEditor,
  MIN_STEP_MINUTES,
  type StepDraft,
} from "./maintenance-step-editor";

/** Backend cap on notify targets. */
const MAX_CHANNELS = 10;

/**
 * A selected channel as the chips and the inline warning need it.
 *
 * Not a `NotifyChannel`, and that is forced rather than stylistic: a channel the
 * current page no longer carries has no known delivery health, and
 * `NotifyChannel.transportStatus` is required with no value meaning "unknown" —
 * `normalizeTransportStatus` turns blank into `not_configured`, and
 * `transportStatusCopy` renders every value except `ok` as a warning. So any
 * status we could invent would either fake a clean bill of health or warn about
 * a channel that may be fine. Absent is the only honest third state.
 */
type SelectedChannel = Pick<NotifyChannel, "id" | "name" | "transport"> &
  Partial<Pick<NotifyChannel, "transportStatus">>;

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

  // Both user pickers search server-side too (RUK-266) — 4051 approvers and
  // 10203 mentionable people against a 200-row page. Separate search state per
  // picker: they are different popovers with their own boxes, and sharing one
  // would make typing in Mentions refetch Approver.
  const [approverSearch, setApproverSearch] = useState("");
  const debouncedApproverSearch = useDebouncedValue(approverSearch.trim(), 300);
  const [mentionSearch, setMentionSearch] = useState("");
  const debouncedMentionSearch = useDebouncedValue(mentionSearch.trim(), 300);

  // NOT gated on a non-empty search, unlike resources. These lists are small
  // enough at rest to be worth showing unprompted — an operator picking an
  // approver usually wants to browse, not to know a name in advance — and both
  // endpoints are already fetched on mount today. The search narrows what is
  // shown; it does not gate whether anything is.
  const assignable = useAssignableUsersQuery({ search: debouncedApproverSearch || undefined });
  // A separate hook from `assignable`, deliberately: that one re-filters to
  // approver roles, and mentions answer "who should be warned", not "who can
  // approve" — guests belong here. See `useMentionableUsersQuery`.
  //
  // Two hooks, two requests to `/api/users/assignable`, on purpose. They were
  // once deduped onto one unfiltered fetch; that made the approver list a
  // client-side filter over a truncated page and emptied the picker (SPEC §0.1).
  // The approver query must be narrowed by the SERVER, which means its own
  // request under its own key.
  const mentionable = useMentionableUsersQuery(debouncedMentionSearch || undefined);
  // Server-side search (RUK-274). The catalog reached 3617 rows against a picker
  // that filtered client-side, so every keystroke re-scored the whole list and
  // ~1.4 MB crossed the wire on every form open.
  //
  // NOT gated on a non-empty query, unlike resources: an operator picking a
  // notify channel browses rather than knowing the name in advance — the same
  // argument the approver picker above makes — and a 20-row page is cheap.
  // `|| undefined` so an empty box lands on the same cache key as mount.
  const [channelSearch, setChannelSearch] = useState("");
  const debouncedChannelSearch = useDebouncedValue(channelSearch.trim(), 300);
  const channelsQuery = useNotifyChannelsQuery({
    name: debouncedChannelSearch || undefined,
    limit: 20,
  });
  // Server-side search, debounced (RUK-266). A single `limit: 200` page used to
  // BE the searchable universe: cmdk filtered those rows client-side, so with
  // 5781 resources on the wire, 5581 of them could not be found by typing at
  // all. Reported live — an existing resource returned "No matches".
  //
  // `limit: 20` now, not 200: the server narrows first, so a page is a page of
  // MATCHES rather than a slice of the catalogue, and 20 is more than the
  // dropdown shows. That also retires the 200-row render cost per keystroke.
  const [resourceSearch, setResourceSearch] = useState("");
  const debouncedResourceSearch = useDebouncedValue(resourceSearch.trim(), 300);
  const resourcesQuery = useResourcesQuery(
    { name: debouncedResourceSearch, limit: 20 },
    // An empty box asks for nothing, so it costs nothing. On EDIT this also
    // means the catalogue is never fetched just to render chips for resources
    // already attached — `detail.resources` covers those.
    { enabled: debouncedResourceSearch.length > 0 },
  );

  // Names of resources the operator picked, captured at selection time.
  //
  // Required by the server search, not decorative: the catalogue page holds only
  // the current query's rows, so a chip picked under an earlier prefix has no
  // row left to read its name from. Never cleared on search — only on removal —
  // and additive, so `resourceIds` (which the submit payload uses) keeps its
  // shape.
  const [pickedNames, setPickedNames] = useState<Map<string, string>>(new Map());

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
  // Memoized for the same reason `mentionOptions` below is: a JSX element per
  // row, in a form whose Title/Description are `useState`, so every keystroke
  // would otherwise re-allocate the whole list.
  const channelOptions = useMemo<MultiSelectOption[]>(
    () =>
      (channelsQuery.data?.channels ?? []).map((c) => {
        const statusCopy = transportStatusCopy(c.transportStatus);
        const idLine = c.transportChannelId ? `${c.transport} · ${c.transportChannelId}` : c.transport;
        return {
          value: c.id,
          label: (
            <span className={cn("flex items-center gap-1.5", statusCopy && "text-fg-muted")}>
              {c.name}
              {statusCopy ? (
                <TriangleAlert
                  className="size-3 shrink-0 text-[var(--impact-partial-fg)]"
                  aria-hidden={true}
                />
              ) : null}
            </span>
          ),
          description: statusCopy ? statusCopy.badge : idLine,
          searchValue: `${c.name} ${c.transport} ${c.transportChannelId ?? ""}`,
        };
      }),
    [channelsQuery.data],
  );
  // Mirrors the channel options above: a person the backend knows has no
  // messenger handle is dimmed + flagged, but stays selectable — they are still
  // mentioned in the notification, just by name instead of a clickable ping.
  //
  // The email stays in the description in both branches — it is the only thing
  // that tells two people with the same display name apart, so the warning is
  // appended to it rather than replacing it.
  //
  // Memoized, unlike `resourceOptions` next to it — this one builds a JSX
  // element per row, and the form is a single `useState` component, so every
  // keystroke in Title or Description would otherwise re-allocate the whole
  // list. That neighbour is cheap because of its data (plain strings, and a
  // server-narrowed page), not because of its structure; this list grows with
  // the user table.
  //
  // What the memo does NOT buy, so nobody over-credits it: the picker re-maps
  // its options on every render regardless (it is not `React.memo`-wrapped),
  // and cmdk re-registers each item through a layout effect that has no
  // dependency array and dedupes on the item's string value, not on the array's
  // identity. The saving is the allocation here, and nothing downstream.
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
    // Order matters. `pickedNames` first, because with a server-side search the
    // catalogue page holds only the CURRENT query's rows — type a new prefix and
    // a previously picked resource is no longer in it. Falling straight through
    // to `id` there would replace the chip's name with a raw UUID.
    //
    // The other two remain as they were: `detail` covers a resource attached
    // before this form opened (edit mode), and `id` is the honest last resort.
    const fromCatalog = resourcesQuery.data?.resources.find((r) => r.id === id);
    const fromDetail = detail?.resources.find((r) => r.id === id);
    return { id, name: pickedNames.get(id) ?? fromCatalog?.name ?? fromDetail?.name ?? id };
  });
  // Every channel this picker has shown, accumulated as they were PICKED.
  //
  // Required once the search is server-side (RUK-274): `channelsQuery.data`
  // holds only the current query's page, so typing a new prefix drops a
  // previously-picked channel out of it. Without this the chip falls through to
  // its raw id and — worse — the undeliverable warning below silently stops
  // firing for a channel that is still in `channelIds` and still goes to the
  // backend.
  //
  // The whole record, not just the name (contrast `pickedNames` for resources):
  // `transportStatusCopy` needs `transportStatus`, and a name cannot produce it.
  //
  // Append-only, captured at selection time — the one moment the channel is
  // guaranteed to be on screen. Same shape and same reasoning as
  // `pickedMentions` below.
  const [pickedChannels, setPickedChannels] = useState<NotifyChannel[]>([]);

  const selectedChannels = useMemo<SelectedChannel[]>(() => {
    const page = channelsQuery.data?.channels ?? [];
    return channelIds.map((id) => {
      // Current page first so a freshly-loaded row wins: its `transportStatus`
      // is the newest the server said, so a repaired integration stops warning.
      // The capture is never rewritten — it is simply shadowed while the row is
      // on the page, which is what keeps this free of an effect.
      //
      // A miss here is a MISS, not an answer: while the query is pending or
      // failed the page is empty, and falling through to the capture is exactly
      // right. Treating "page has no rows" as truth would strip every warning at
      // the moment a refetch fails.
      const fromPage = page.find((c) => c.id === id);
      if (fromPage) return fromPage;

      const captured = pickedChannels.find((c) => c.id === id);
      if (captured) return captured;

      // Neither source knows it. Render the id and claim NOTHING about
      // delivery: `transportStatus` is deliberately absent rather than "ok"
      // (which would assert a health check nobody ran) or "not_configured"
      // (which would warn about a channel that may be perfectly healthy).
      // Mirrors `hasTag: undefined` in `mergeMentionChips`.
      return { id, name: id, transport: "" };
    });
  }, [channelsQuery.data, channelIds, pickedChannels]);

  // Selected channels whose integration won't deliver — surfaced inline so the
  // operator sees the risk after the picker closes, not only inside it. Weak
  // binding: this warns, it doesn't block save.
  //
  // Chips with no status are SKIPPED, not treated as healthy: "we never learned"
  // is neither a warning nor a clean bill of health.
  const undeliverableChannels = useMemo(
    () => selectedChannels.filter((c) => c.transportStatus && transportStatusCopy(c.transportStatus) != null),
    [selectedChannels],
  );
  // MERGE, not `filter` over the options: a selected person can legitimately be
  // absent from the options — blocked after the draft was saved, or beyond the
  // picker's limit. `filter` would hide them while they stay in `mentionIds`, and
  // the operator would then save or clear a list they were never shown. See
  // `mergeMentionChips`.
  //
  // The channel chips above used to be the counter-example here — they filtered.
  // They no longer do (RUK-274): once their search went server-side, filtering
  // the page would have dropped a selected channel the moment the query changed.
  // Everyone this picker has shown so far, accumulated across searches.
  //
  // Needed once the search is server-side (RUK-266): `mentionable.data` holds
  // only the CURRENT query's page, so typing a new prefix drops a
  // previously-tagged person out of the options and `mergeMentionChips` falls
  // through to its last resort — rendering the raw user id as the chip's name.
  // On create there is no `detail.mentions` to catch it.
  //
  // Captured at SELECTION time, in the picker's `onChange` below — not
  // accumulated from every page the query returns. Same shape as `pickedNames`
  // for resources, and the same reason to prefer it: the moment of selection is
  // the one moment the person is guaranteed to be on screen, so it needs no
  // effect and no synchronous setState inside one.
  const [pickedMentions, setPickedMentions] = useState<AssignableUser[]>([]);

  const selectedMentions = useMemo<MentionChip[]>(
    () =>
      mergeMentionChips(
        mentionIds,
        // Current page first so a freshly-loaded row wins (its `has_messenger_tag`
        // is the newest the server said), with the picked ones behind it as the
        // fallback for anyone the current search no longer returns.
        [...(mentionable.data ?? []), ...pickedMentions],
        detail?.mentions,
      ),
    [mentionIds, mentionable.data, pickedMentions, detail?.mentions],
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
            onSearchChange={setApproverSearch}
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
            // The screen-reader half, matching Mentions below. `emptyText`
            // lands in cmdk's `role="presentation"` node, so on its own the
            // ternary above is invisible to a screen reader and a failed load
            // still reads there as an empty roster.
            //
            // `isPending` is checked here for the same reason the ternary above
            // checks it FIRST, and the two must agree: a failed query that is
            // refetching reports `isPending` and `isError` together, and
            // announcing "couldn't load" under a popover that reads "Loading…"
            // tells the two audiences different things about the same moment.
            errorText={
              !assignable.isPending && assignable.isError
                ? "Couldn't load people. Retry or check your access."
                : undefined
            }
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
              onChange={(next) => {
                // Capture the names of anything newly picked while its row is
                // still on screen — the next keystroke replaces the page.
                setPickedNames((prev) => {
                  const merged = new Map(prev);
                  for (const id of next) {
                    if (merged.has(id)) continue;
                    const row = resourcesQuery.data?.resources.find((r) => r.id === id);
                    if (row) merged.set(id, row.name);
                  }
                  return merged;
                });
                setResourceIds(next);
              }}
              onSearchChange={setResourceSearch}
              placeholder="Select resources…"
              searchPlaceholder="Search resources…"
              // Four states now that the search is server-side. "Type to
              // search…" is the one the old client-side picker could not have:
              // an empty box no longer means "here is everything", it means
              // nothing has been asked for yet.
              emptyText={
                resourcesQuery.isPending && debouncedResourceSearch
                  ? "Loading…"
                  : resourcesQuery.isError
                    ? "Couldn't load resources. Retry or check your access."
                    : !debouncedResourceSearch
                      ? "Type to search resources…"
                      : "No resources found."
              }
              errorText={
                resourcesQuery.isError && !resourcesQuery.isPending ? "Couldn't load resources." : undefined
              }
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
            onChange={(next) => {
              // Capture the newly-picked channels before the search can move on
              // and take their rows off the page. Append-only: `pickedChannels`
              // is a display fallback, never the source of the submit payload,
              // which stays `channelIds`.
              setPickedChannels((prev) => {
                const known = new Set(prev.map((c) => c.id));
                const added = (channelsQuery.data?.channels ?? []).filter(
                  (c) => next.includes(c.id) && !known.has(c.id),
                );
                return added.length ? [...prev, ...added] : prev;
              });
              setChannelIds(next);
            }}
            onSearchChange={setChannelSearch}
            placeholder="Select channels…"
            searchPlaceholder="Search channels…"
            // Three states, three strings — the last of the three pickers to get
            // them. "No channels configured." is a *plausible admin state*, which
            // makes this instance of the defect costlier than the roster one: an
            // operator who sees it after a 500 goes and configures channels that
            // already exist, rather than merely believing the company has nobody
            // in it.
            emptyText={
              channelsQuery.isPending
                ? "Loading…"
                : channelsQuery.isError
                  ? "Couldn't load channels. Retry or check your access."
                  : "No channels configured."
            }
            // The screen-reader half. `emptyText` renders through cmdk's
            // `CommandEmpty`, which is `role="presentation"` — silent — so the
            // visible fix above does not reach assistive tech on its own.
            //
            // `isPending` is checked FIRST here, exactly as in the ternary above,
            // and the two must agree: a failed query that is refetching reports
            // `isPending` and `isError` together, so announcing "couldn't load"
            // under a popover reading "Loading…" would tell the two audiences
            // different things about the same moment.
            errorText={
              !channelsQuery.isPending && channelsQuery.isError
                ? "Couldn't load channels. Retry or check your access."
                : undefined
            }
            ariaLabel="Notify channels"
          />
          {selectedChannels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedChannels.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 px-2 py-[3px] text-xs text-fg"
                >
                  {/* Omitted rather than rendered empty for a channel neither
                      the page nor the capture knows: an empty span still costs
                      the flex gap, leaving a chip that looks mis-padded. */}
                  {c.transport ? <span className="text-fg-muted">{c.transport}</span> : null}
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
                  // `undeliverableChannels` already dropped the status-less
                  // chips; this keeps the narrowing visible to the type checker
                  // rather than asserting it.
                  const copy = c.transportStatus ? transportStatusCopy(c.transportStatus) : null;
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
              onChange={(next) => {
                // Remember whoever was just tagged while their row is still in
                // the current page — the next keystroke replaces it, and without
                // this the chip would fall back to rendering a raw user id.
                setPickedMentions((prev) => {
                  const known = new Set(prev.map((u) => u.id));
                  const added = (mentionable.data ?? []).filter(
                    (u) => next.includes(u.id) && !known.has(u.id),
                  );
                  return added.length ? [...prev, ...added] : prev;
                });
                setMentionIds(next);
              }}
              onSearchChange={setMentionSearch}
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
