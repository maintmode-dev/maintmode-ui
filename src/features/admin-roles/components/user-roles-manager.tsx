"use client";

import { useState } from "react";

import { ROLES, type Role } from "@/domain/admin/models/role";
import { BffError } from "@/features/_shared/api/bff-error";
import { useRolesCatalogQuery } from "@/features/admin-roles/queries/use-roles-catalog-query";
import { useUserRolesQuery } from "@/features/admin-roles/queries/use-user-roles-query";
import { useAssignRoleMutation } from "@/features/admin-roles/mutations/use-assign-role-mutation";
import { useRevokeRoleMutation } from "@/features/admin-roles/mutations/use-revoke-role-mutation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import { Badge } from "@/shared/ui/primitives/badge";
import { Button } from "@/shared/ui/primitives/button";
import { Select, SelectOption } from "@/shared/ui/primitives/select";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/shared/ui/primitives/state";

export type UserRolesManagerProps = {
  userId: string;
};

const FALLBACK_ROLES: Role[] = [...ROLES];

export function UserRolesManager({ userId }: UserRolesManagerProps) {
  const userRoles = useUserRolesQuery(userId);
  const catalog = useRolesCatalogQuery();
  const assign = useAssignRoleMutation();
  const revoke = useRevokeRoleMutation();

  const [revokeTarget, setRevokeTarget] = useState<Role | null>(null);
  const [pendingRole, setPendingRole] = useState<Role | "">("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (userRoles.isPending) {
    return <LoadingState title="Loading user roles">Fetching roles for user {userId}.</LoadingState>;
  }

  if (userRoles.isError) {
    const error = userRoles.error;
    if (error instanceof BffError && error.code === "FORBIDDEN") {
      return <ForbiddenState />;
    }
    if (error instanceof BffError && error.code === "NOT_FOUND") {
      return (
        <EmptyState title="User not found">
          No user with id <code>{userId}</code> exists.
        </EmptyState>
      );
    }
    return (
      <ErrorState title="Couldn’t load user roles">
        {error instanceof Error ? error.message : "Unknown error while loading user roles."}
      </ErrorState>
    );
  }

  const currentRoles = userRoles.data?.roles ?? [];
  const catalogRoles = catalog.data?.roles ?? FALLBACK_ROLES;
  const assignable = catalogRoles.filter((role) => !currentRoles.includes(role));

  async function onAssign() {
    if (!pendingRole) {
      return;
    }
    setActionError(null);
    try {
      await assign.mutateAsync({ user_id: userId, role: pendingRole });
      setPendingRole("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to assign role.");
    }
  }

  async function onConfirmRevoke() {
    if (!revokeTarget) {
      return;
    }
    setActionError(null);
    try {
      await revoke.mutateAsync({ user_id: userId, role: revokeTarget });
      setRevokeTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to revoke role.");
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">User roles</h1>
        <p className="text-sm text-[var(--muted)]">
          Managing roles for user <code data-testid="admin-roles-user-id">{userId}</code>.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Current roles
        </h2>
        {currentRoles.length === 0 ? (
          <EmptyState title="No roles assigned">
            This user has no roles. Assign one below.
          </EmptyState>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="admin-roles-current">
            {currentRoles.map((role) => (
              <li key={role} className="flex items-center gap-2">
                <Badge tone={role === "admin" ? "danger" : "info"}>{role}</Badge>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setRevokeTarget(role)}
                  disabled={revoke.isPending}
                  data-testid={`admin-roles-revoke-${role}`}
                  aria-label={`Revoke ${role}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Assign a role
        </h2>
        {assignable.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            All available roles are already assigned.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="admin-roles-assign-select" className="sr-only">
              Role to assign
            </label>
            <Select
              id="admin-roles-assign-select"
              value={pendingRole}
              onChange={(event) => setPendingRole(event.target.value as Role | "")}
              className="max-w-[200px]"
              data-testid="admin-roles-assign-select"
            >
              <SelectOption value="" disabled>
                Select role…
              </SelectOption>
              {assignable.map((role) => (
                <SelectOption key={role} value={role}>
                  {role}
                </SelectOption>
              ))}
            </Select>
            <Button
              variant="primary"
              onClick={onAssign}
              disabled={!pendingRole || assign.isPending}
              data-testid="admin-roles-assign-submit"
            >
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
          </div>
        )}
      </section>

      {actionError ? (
        <ErrorState title="Role change failed">{actionError}</ErrorState>
      ) : null}

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget ?? ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Revoke <strong>{revokeTarget}</strong> from user <code>{userId}</code>? They will lose
              the associated permissions immediately. This action is logged in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" disabled={revoke.isPending}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                onClick={onConfirmRevoke}
                disabled={revoke.isPending}
                data-testid="admin-roles-revoke-confirm"
              >
                {revoke.isPending ? "Revoking…" : "Revoke role"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
