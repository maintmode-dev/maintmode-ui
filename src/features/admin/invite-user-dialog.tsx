"use client";

import { useState } from "react";

import type { Role } from "@/domain/auth/permissions";
import { CreateDialog, CreateDialogBody, CreateDialogFooter } from "@/shared/ui/domain/create-dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Input } from "@/shared/ui/shadcn/input";

import { useInviteUser, useRolesQuery } from "./queries/use-users-queries";
import { Field, ROLE_DESCRIPTIONS, ROLE_ORDER, sortRoles } from "./roles-ui";

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Invite-user form, rendered in the shared `CreateDialog` shell (centered
 * 560px dialog — the canon for all entity-creation screens).
 *
 * NOTE: the contract's optional "Message" field is intentionally omitted —
 * the backend invite contract is `{ email, roles }` only (no message on the
 * wire yet). Tracked as a backend task; add the field once it's supported.
 */
export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const rolesQuery = useRolesQuery();
  const assignable = rolesQuery.data ?? ROLE_ORDER;
  const invite = useInviteUser();

  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>(["editor"]);

  const reset = () => {
    setEmail("");
    setRoles(["editor"]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit = email.trim().length > 0 && roles.length > 0 && !invite.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || roles.length === 0) return;
    invite.mutate({ email: trimmed, roles }, { onSuccess: () => handleOpenChange(false) });
  };

  return (
    <CreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Invite a user"
      description="They'll receive an email with a sign-in link."
      onSubmit={submit}
    >
      <CreateDialogBody className="space-y-5">
        <Field label="Email" htmlFor="invite-email">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            placeholder="name@maintmode"
            className="font-mono"
          />
          <p className="text-xs text-fg-dim">They&apos;ll sign in with the email they receive.</p>
        </Field>

        <Field label="Roles">
          <div className="rounded-md border border-border-subtle divide-y divide-border-subtle">
            {sortRoles(assignable).map((role) => {
              const checked = roles.includes(role);
              const id = `invite-role-${role}`;
              return (
                <div key={role} className="flex items-start gap-3 p-3">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(c) =>
                      setRoles((cur) => (c === true ? [...cur, role] : cur.filter((r) => r !== role)))
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm font-medium capitalize text-fg">{role}</span>
                    <span className="block text-xs text-fg-dim">{ROLE_DESCRIPTIONS[role]}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </Field>
      </CreateDialogBody>
      <CreateDialogFooter hint="Invitations expire in 7 days.">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOpenChange(false)}
          disabled={invite.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {invite.isPending ? "Sending…" : "Send invitation"}
        </Button>
      </CreateDialogFooter>
    </CreateDialog>
  );
}
