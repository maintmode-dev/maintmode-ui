"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import type {
  MaintenanceDetail,
  MaintenanceImpact,
  MaintenanceScope,
} from "@/domain/maintenance/maintenance";

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

export function MaintenanceEditMode({ detail, onClose }: MaintenanceEditModeProps) {
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [impact, setImpact] = useState<MaintenanceImpact>(detail.impact);
  const [scope, setScope] = useState<MaintenanceScope>(detail.scope);
  const [start, setStart] = useState(isoDateTimeLocal(detail.planned_period.start));
  const [end, setEnd] = useState(isoDateTimeLocal(detail.planned_period.end));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        // TODO: wire `PATCH /api/maintenance/{id}` mutation. The endpoint
        // exists on the backend (apimodels.UpdateMaintenanceRequest); the
        // BFF proxy + useMaintenanceUpdate hook land alongside RUK-42
        // edit polish. Until then this form closes without persisting.
        onClose();
      }}
    >
      <div
        role="note"
        className="rounded-sm border border-[var(--impact-partial-border)] bg-[var(--impact-partial-bg)] px-3 py-2 text-xs text-[var(--impact-partial-fg)]"
      >
        Edit mode is interactive but does not persist yet. Save changes will land with the follow-up ticket.
      </div>
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
        <Field label="Planned end" htmlFor="m-end">
          <Input
            id="m-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
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
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
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
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Discard
        </Button>
        <Button type="submit" size="sm" className="ml-auto">
          Save changes
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
