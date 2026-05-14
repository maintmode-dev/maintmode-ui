"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { BffError } from "@/features/_shared/api/bff-error";
import { useCreateResourceMutation } from "@/features/resources-directory/mutations/use-create-resource-mutation";
import {
  resourceCreateSchema,
  type ResourceCreateInput,
} from "@/features/resources-directory/schemas/resource-create-schema";
import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import { Textarea } from "@/shared/ui/primitives/textarea";
import { ErrorState } from "@/shared/ui/primitives/state";

export function ResourceCreateForm() {
  const router = useRouter();
  const mutation = useCreateResourceMutation();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const form = useForm<ResourceCreateInput>({
    resolver: zodResolver(resourceCreateSchema),
    defaultValues: { name: "", description: "", external_id: "" },
  });

  async function onSubmit(values: ResourceCreateInput) {
    setGlobalError(null);
    try {
      const created = await mutation.mutateAsync(values);
      router.push(`/resources/${encodeURIComponent(created.id)}`);
    } catch (error) {
      if (error instanceof BffError) {
        if (error.fieldErrors && error.fieldErrors.length > 0) {
          for (const field of error.fieldErrors) {
            const fieldName = field.field as keyof ResourceCreateInput;
            if (fieldName === "name" || fieldName === "description" || fieldName === "external_id") {
              form.setError(fieldName, { message: field.message });
            }
          }
          return;
        }
        if (error.code === "CONFLICT") {
          form.setError("name", { message: "A resource with this name or external ID already exists." });
          return;
        }
        setGlobalError(error.message);
        return;
      }
      setGlobalError(error instanceof Error ? error.message : "Failed to create resource.");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">New resource</h1>
        <p className="text-sm text-[var(--muted)]">
          Register a new resource in the maintmode directory. Required fields are marked with *.
        </p>
      </header>

      <form
        className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        data-testid="resource-create-form"
      >
        <Field error={form.formState.errors.name?.message}>
          <FieldLabel>Name *</FieldLabel>
          <FieldControl>
            <Input
              {...form.register("name")}
              autoComplete="off"
              data-testid="resource-create-name"
            />
          </FieldControl>
        </Field>

        <Field error={form.formState.errors.description?.message}>
          <FieldLabel>Description *</FieldLabel>
          <FieldControl>
            <Textarea
              {...form.register("description")}
              rows={4}
              data-testid="resource-create-description"
            />
          </FieldControl>
        </Field>

        <Field
          error={form.formState.errors.external_id?.message}
          hint="Optional. Used to link this resource to systems outside maintmode."
        >
          <FieldLabel>External ID</FieldLabel>
          <FieldControl>
            <Input
              {...form.register("external_id")}
              autoComplete="off"
              data-testid="resource-create-external-id"
            />
          </FieldControl>
        </Field>

        {globalError ? (
          <ErrorState title="Couldn’t create resource">{globalError}</ErrorState>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={form.formState.isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={form.formState.isSubmitting}
            data-testid="resource-create-submit"
          >
            {form.formState.isSubmitting ? "Creating…" : "Create resource"}
          </Button>
        </div>
      </form>
    </section>
  );
}
