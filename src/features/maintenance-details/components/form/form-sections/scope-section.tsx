"use client";

import { Controller, useFormContext } from "react-hook-form";

import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Select, SelectOption } from "@/shared/ui/primitives/select";

export function ScopeSection({ disabled }: { disabled?: boolean }) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext<MaintenanceFormValues>();
  const scope = watch("scope");
  const resourcesQuery = useResourcesQuery();

  return (
    <section className="flex flex-col gap-3">
      <Field error={errors.impact?.message}>
        <FieldLabel>Impact</FieldLabel>
        <FieldControl>
          <Select disabled={disabled} {...register("impact")}>
            <SelectOption value="none">No impact</SelectOption>
            <SelectOption value="partial_outage">Partial outage</SelectOption>
            <SelectOption value="full_outage">Full outage</SelectOption>
          </Select>
        </FieldControl>
      </Field>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Scope
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="global" {...register("scope")} disabled={disabled} />
          Global
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="resource" {...register("scope")} disabled={disabled} />
          Resource
        </label>
        {errors.scope ? (
          <p role="alert" className="text-xs text-[var(--danger-fg)]">
            {errors.scope.message}
          </p>
        ) : null}
      </fieldset>

      {scope === "resource" ? (
        <Field error={errors.resource_ids?.message as string | undefined}>
          <FieldLabel>Resources</FieldLabel>
          <Controller
            control={control}
            name="resource_ids"
            render={({ field }) => (
              <div
                className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2"
                role="group"
                aria-label="Resources"
              >
                {resourcesQuery.isLoading ? (
                  <p className="text-xs text-[var(--muted)]">Loading resources…</p>
                ) : resourcesQuery.data?.resources.length ? (
                  resourcesQuery.data.resources.map((resource) => {
                    const checked = field.value.includes(resource.id);
                    return (
                      <label key={resource.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...field.value, resource.id]
                              : field.value.filter((id) => id !== resource.id);
                            field.onChange(next);
                          }}
                        />
                        <span>{resource.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-[var(--muted)]">No resources available.</p>
                )}
              </div>
            )}
          />
        </Field>
      ) : null}
    </section>
  );
}
