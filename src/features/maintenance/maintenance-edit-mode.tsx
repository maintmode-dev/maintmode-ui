"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import type {
  MaintenanceDetail,
  MaintenanceDraftInput,
  MaintenanceImpact,
  MaintenanceScope,
} from "@/domain/maintenance/maintenance";

import { useAssignableUsersQuery } from "./queries/use-assignable-users-query";
import { useNotifyChannelsQuery } from "@/features/notify-channels/queries/use-notify-channels-query";
import {
  transportDisplayTitle,
  transportStatusCopy,
} from "@/features/notify-channels/transports";
import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";
import { useCreateMaintenance, useUpdateMaintenance } from "./queries/use-maintenance-draft";
import {
  emptyStep,
  MaintenanceStepEditor,
  MIN_STEP_MINUTES,
  type StepDraft,
} from "./maintenance-step-editor";

/** Backend cap on notify targets (TC-MAINT-02 #12). */
const MAX_CHANNELS = 10;

export interface MaintenanceEditModeProps {
  /** Existing maintenance to edit. Omit (with `creating`) for the create flow. */
  detail?: MaintenanceDetail;
  /** Create a new draft instead of editing an existing one. */
  creating?: boolean;
  /** Edit: return to view mode. Create: navigate away (e.g. back to calendar). */
  onClose: () => void;
}

function isoDateTimeLocal(iso: string): string {
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:MM"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM" (local) → ISO-8601 with offset for the wire. */
function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
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
 * Per RUK-163 the form collects a notify-channel picker (min 1, max 10) and an
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

  const [title, setTitle] = useState(detail?.title ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [impact, setImpact] = useState<MaintenanceImpact>(detail?.impact ?? "none");
  const [scope, setScope] = useState<MaintenanceScope>(detail?.scope ?? "resource");
  const [start, setStart] = useState(detail ? isoDateTimeLocal(detail.planned_period.start) : "");
  const [approverId, setApproverId] = useState<string | undefined>(undefined);
  const [resourceIds, setResourceIds] = useState<string[]>(() => detail?.resources.map((r) => r.id) ?? []);
  // Hydrate from the loaded draft's notify_targets so Edit pre-selects the
  // channels already attached (mirrors `resourceIds` above). Without this the
  // picker opened empty and Save was blocked by the "≥1 channel" rule even
  // though the draft had a channel — risking a silent loss of the binding.
  const [channelIds, setChannelIds] = useState<string[]>(() => detail?.notify_targets.map((c) => c.id) ?? []);
  const [steps, setSteps] = useState<StepDraft[]>(() => detailToSteps(detail));
  const [submitted, setSubmitted] = useState(false);

  const assignable = useAssignableUsersQuery();
  const channelsQuery = useNotifyChannelsQuery();
  const resourcesQuery = useResourcesQuery({ limit: 200 });

  const approverOptions = (assignable.data ?? []).map((u) => ({
    value: u.id,
    label: u.display_name,
    description: u.email,
  }));
  const resourceOptions: MultiSelectOption[] = (resourcesQuery.data?.resources ?? []).map((r) => ({
    value: r.id,
    label: r.name,
    description: r.external_id,
    searchValue: `${r.name} ${r.external_id ?? ""}`,
  }));
  // A channel whose transport integration is disabled / not configured /
  // unreadable will silently not deliver (RUK-199/RUK-200). Mark those options
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
  });

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
  // binding: this warns, it doesn't block save (RUK-198/199/200).
  const undeliverableChannels = useMemo(
    () => selectedChannels.filter((c) => transportStatusCopy(c.transportStatus) != null),
    [selectedChannels],
  );

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
  }, [title, description, start, scope, resourceIds, approverId, steps, channelIds, creating]);

  function buildInput(): MaintenanceDraftInput {
    return {
      title: title.trim(),
      description: description.trim(),
      planned_start: localToIso(start),
      scope,
      impact,
      resource_ids: scope === "resource" ? resourceIds : [],
      approver_user_id: approverId,
      notify_target_channel_ids: channelIds,
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
              onChange={setStart}
              aria-invalid={Boolean(show("start"))}
              aria-label="Planned start"
            />
          </Field>
          <Field label="Planned end" hint="Computed from start + step durations">
            {/* Derived server-side from the start + step durations; read-only here. */}
            <div className="flex h-9 items-center rounded-sm border border-border-subtle bg-bg-elev-2 px-3 text-sm text-fg-dim tabular-nums">
              {detail ? formatDateTime(detail.planned_period.end) : "Calculated on save"}
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
            emptyText={assignable.isPending ? "Loading…" : "No people found."}
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
          disabled={pending || (creating && !createReady)}
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
