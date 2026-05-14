"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import { Select, SelectOption } from "@/shared/ui/primitives/select";
import {
  AUDIT_ACTIONS,
  type AuditLogFilters,
} from "@/features/audit-log/schemas/audit-filter-schema";

export type AuditLogFiltersFormProps = {
  value: AuditLogFilters;
  onApply: (next: AuditLogFilters) => void;
};

export function AuditLogFiltersForm({ value, onApply }: AuditLogFiltersFormProps) {
  const [draft, setDraft] = useState<AuditLogFilters>(value);

  function patch(partial: Partial<AuditLogFilters>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ ...draft, offset: 0 });
      }}
      data-testid="audit-log-filters"
    >
      <Field>
        <FieldLabel>Action</FieldLabel>
        <FieldControl>
          <Select
            value={draft.action ?? ""}
            onChange={(event) => patch({ action: event.target.value || undefined })}
            className="min-w-[160px]"
            data-testid="audit-log-action"
          >
            <SelectOption value="">Any</SelectOption>
            {AUDIT_ACTIONS.map((action) => (
              <SelectOption key={action} value={action}>
                {action}
              </SelectOption>
            ))}
          </Select>
        </FieldControl>
      </Field>

      <Field>
        <FieldLabel>Actor</FieldLabel>
        <FieldControl>
          <Input
            value={draft.actor ?? ""}
            onChange={(event) => patch({ actor: event.target.value || undefined })}
            placeholder="user-id or email"
            className="min-w-[200px]"
            data-testid="audit-log-actor"
          />
        </FieldControl>
      </Field>

      <Field hint="ISO 8601">
        <FieldLabel>From</FieldLabel>
        <FieldControl>
          <Input
            value={draft.createdFrom ?? ""}
            onChange={(event) => patch({ createdFrom: event.target.value || undefined })}
            placeholder="2026-05-01T00:00:00Z"
            className="min-w-[220px]"
            data-testid="audit-log-from"
          />
        </FieldControl>
      </Field>

      <Field hint="ISO 8601">
        <FieldLabel>To</FieldLabel>
        <FieldControl>
          <Input
            value={draft.createdTo ?? ""}
            onChange={(event) => patch({ createdTo: event.target.value || undefined })}
            placeholder="2026-05-14T23:59:59Z"
            className="min-w-[220px]"
            data-testid="audit-log-to"
          />
        </FieldControl>
      </Field>

      <Field>
        <FieldLabel>Limit</FieldLabel>
        <FieldControl>
          <Select
            value={String(draft.limit)}
            onChange={(event) => patch({ limit: Number(event.target.value) })}
            className="min-w-[100px]"
            data-testid="audit-log-limit"
          >
            <SelectOption value="10">10</SelectOption>
            <SelectOption value="25">25</SelectOption>
            <SelectOption value="50">50</SelectOption>
            <SelectOption value="100">100</SelectOption>
          </Select>
        </FieldControl>
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" data-testid="audit-log-apply">
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const reset: AuditLogFilters = {
              limit: 50,
              offset: 0,
              action: undefined,
              actor: undefined,
              createdFrom: undefined,
              createdTo: undefined,
            };
            setDraft(reset);
            onApply(reset);
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}
