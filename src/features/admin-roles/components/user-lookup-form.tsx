"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import { userIdSchema, type UserIdInput } from "@/features/admin-roles/schemas/user-id-schema";

export function UserLookupForm() {
  const router = useRouter();
  const form = useForm<UserIdInput>({
    resolver: zodResolver(userIdSchema),
    defaultValues: { user_id: "" },
  });

  function onSubmit({ user_id }: UserIdInput) {
    router.push(`/admin/users/${encodeURIComponent(user_id)}/roles`);
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      data-testid="admin-user-lookup-form"
    >
      <Field
        error={form.formState.errors.user_id?.message}
        hint="Paste the maintmode user ID (UUID) you want to manage. There is no user-search endpoint yet."
      >
        <FieldLabel>User ID</FieldLabel>
        <FieldControl>
          <Input
            {...form.register("user_id")}
            autoComplete="off"
            placeholder="550e8400-e29b-41d4-a716-446655440000"
            data-testid="admin-user-id-input"
          />
        </FieldControl>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" data-testid="admin-user-lookup-submit">
          Open user
        </Button>
      </div>
    </form>
  );
}
