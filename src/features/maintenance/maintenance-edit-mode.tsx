"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { Combobox } from "@/shared/ui/domain/combobox";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { formatDateTime } from "@/shared/ui/lib/format";
import type {
  MaintenanceDetail,
  MaintenanceDraftInput,
  MaintenanceImpact,
  MaintenanceScope,
  MaintenanceStepInput,
} from "@/domain/maintenance/maintenance";

import { useAssignableUsersQuery } from "./queries/use-assignable-users-query";
import { useUpdateMaintenance } from "./queries/use-maintenance-draft";

export interface MaintenanceEditModeProps {
  detail: MaintenanceDetail;
  onClose: () => void;
}

function isoDateTimeLocal(iso: string): string {
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:MM"
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM" (local) → ISO-8601 with offset for the wire. */
function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

/** Carry the existing steps through edit unchanged (the step editor is RUK-42). */
function stepsToInput(detail: MaintenanceDetail): MaintenanceStepInput[] {
  return detail.steps.map((s, i) => ({
    order: s.order ?? i + 1,
    description: s.description ?? s.title,
    duration: s.duration,
    rollback_description: s.rollback_description,
  }));
}

export function MaintenanceEditMode({ detail, onClose }: MaintenanceEditModeProps) {
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [impact, setImpact] = useState<MaintenanceImpact>(detail.impact);
  const [scope, setScope] = useState<MaintenanceScope>(detail.scope);
  const [start, setStart] = useState(isoDateTimeLocal(detail.planned_period.start));
  const [approverId, setApproverId] = useState<string | undefined>(undefined);

  const update = useUpdateMaintenance();
  const assignable = useAssignableUsersQuery();
  const approverOptions = (assignable.data ?? []).map((u) => ({
    value: u.id,
    label: u.display_name,
    description: u.email,
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: MaintenanceDraftInput = {
      title,
      description: description || undefined,
      planned_start: localToIso(start),
      scope,
      impact,
      resource_ids: detail.resources.map((r) => r.id),
      steps: stepsToInput(detail),
      // Only set when the operator picks someone; left undefined (and dropped
      // by the mapper) to keep the existing approver — the detail view exposes
      // the approver's display name, not its id, so we can't preselect it.
      approver_user_id: approverId,
    };
    update.mutate({ id: detail.id, input }, { onSuccess: () => onClose() });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Field label="Title" htmlFor="m-title">
        <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Planned start" htmlFor="m-start">
          <Input
            id="m-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </Field>
        <Field label="Planned end">
          {/* Derived server-side from the start + step durations; read-only here. */}
          <div className="flex h-9 items-center rounded-sm border border-border-subtle bg-bg-elev-2 px-3 text-sm text-fg-dim tabular-nums">
            {formatDateTime(detail.planned_period.end)}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
      </div>
      <Field label="Approver">
        <Combobox
          options={approverOptions}
          value={approverId}
          onChange={setApproverId}
          placeholder={detail.approver ? `Current: ${detail.approver}` : "Pick an approver…"}
          searchPlaceholder="Search people…"
          emptyText={assignable.isPending ? "Loading…" : "No people found."}
          ariaLabel="Approver"
        />
      </Field>
      <Field label="Description" htmlFor="m-desc">
        <Textarea id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </Field>
      <Field label="Resources">
        <div className="flex flex-wrap gap-1.5">
          {detail.resources.map((r) => (
            <ResourceChip key={r.id} name={r.name} type={r.type} onRemove={() => undefined} />
          ))}
          <Button type="button" variant="outline" size="sm">
            + Add resource
          </Button>
        </div>
      </Field>
      <footer className="flex items-center gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={update.isPending}>
          Discard
        </Button>
        <Button type="submit" size="sm" className="ml-auto" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </footer>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
