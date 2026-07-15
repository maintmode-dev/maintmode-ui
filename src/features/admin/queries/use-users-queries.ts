"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type {
  CreateInvitationRequest,
  CreateInvitationResponse,
  Invitation,
  ListUsersPage,
} from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";

/** Query parameters for the paginated users list (mirrors the BFF route). */
export interface UsersQueryParams {
  search?: string;
  roles?: Role[];
  limit?: number;
  offset?: number;
  /** When true, the backend hides blocked accounts. */
  active?: boolean;
}

export function usersKey(params?: UsersQueryParams) {
  return ["users", params ?? {}] as const;
}
export function rolesKey() {
  return ["roles"] as const;
}
export function invitationsKey() {
  return ["invitations"] as const;
}

function buildUsersQuery(params: UsersQueryParams): string {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  for (const role of params.roles ?? []) {
    qs.append("roles", role);
  }
  if (typeof params.limit === "number") {
    qs.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    qs.set("offset", String(params.offset));
  }
  if (params.active) {
    qs.set("active", "true");
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export function useUsersQuery(params: UsersQueryParams = {}) {
  return useQuery({
    queryKey: usersKey(params),
    queryFn: (): Promise<ListUsersPage> =>
      bffFetch<ListUsersPage>(`/api/admin/users${buildUsersQuery(params)}`),
    // Keep the current page visible while paging/searching refetches, instead
    // of unmounting the table to a skeleton on every keystroke / page turn.
    placeholderData: keepPreviousData,
  });
}

const FALLBACK_ROLES: Role[] = ["guest", "editor", "reviewer", "admin"];

export function useRolesQuery() {
  return useQuery({
    queryKey: rolesKey(),
    queryFn: async (): Promise<Role[]> => {
      const data = await bffFetch<{ roles: Role[] }>("/api/admin/roles");
      return data.roles.length > 0 ? data.roles : FALLBACK_ROLES;
    },
  });
}

/**
 * Admin invitations list. Wired to the auth BFF: the route proxies
 * `GET /api/v1/users/invitations` and returns the backend-shaped
 * `{ invitations: Invitation[] }` directly.
 */
export function useInvitationsQuery() {
  return useQuery({
    queryKey: invitationsKey(),
    queryFn: async (): Promise<Invitation[]> => {
      const data = await bffFetch<{ invitations: Invitation[] }>("/api/admin/invitations");
      return data.invitations ?? [];
    },
  });
}

/**
 * Create an invitation. Posts `{ email, roles[] }` to the BFF, which relays to
 * `POST /api/v1/users/invite`. A 409 (user already exists / active-invite
 * conflict) surfaces as a specific toast; the list is refetched on success so
 * the new pending invite appears.
 */
export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateInvitationRequest): Promise<CreateInvitationResponse> => {
      return bffFetch<CreateInvitationResponse>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_, { email }) => {
      toast.success(`Invitation sent to ${email}`);
      queryClient.invalidateQueries({ queryKey: invitationsKey() });
    },
    onError: (error: unknown) => {
      if (error instanceof BffError) {
        if (error.status === 409) {
          toast.error("That email already has an account or an active invitation.");
          return;
        }
        if (error.status === 400) {
          toast.error(`Couldn't send invitation: ${error.message}`);
          return;
        }
      }
      toast.error("Couldn't send invitation. Try again.");
    },
  });
}

/**
 * Resend a pending invitation. Backend rotates the token, extends expiry, and
 * re-sends the email; returns 204. A 409 means the invitation is no longer
 * pending (expired/accepted/revoked) — refetch so the row reflects reality.
 */
export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await bffFetch<void>(`/api/admin/invitations/${encodeURIComponent(id)}/resend`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast.success("Invitation resent");
      queryClient.invalidateQueries({ queryKey: invitationsKey() });
    },
    onError: (error: unknown) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error("This invitation is no longer pending. Refreshing the list.");
        queryClient.invalidateQueries({ queryKey: invitationsKey() });
        return;
      }
      toast.error("Couldn't resend the invitation. Try again.");
    },
  });
}

/**
 * Revoke a pending invitation (idempotent for already-revoked). Backend
 * returns 204; a 409 means it was already accepted. Either way we refetch.
 */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await bffFetch<void>(`/api/admin/invitations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: invitationsKey() });
    },
    onError: (error: unknown) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error("This invitation was already accepted. Refreshing the list.");
        queryClient.invalidateQueries({ queryKey: invitationsKey() });
        return;
      }
      toast.error("Couldn't revoke the invitation. Try again.");
    },
  });
}

/** Invalidate every cached users page after a mutation. */
function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["users"] });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      // Idempotent on the backend (EC-3): repeating block/unblock still 204s.
      await bffFetch(`/api/admin/users/${encodeURIComponent(id)}/block`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("User blocked");
      invalidateUsers(queryClient);
    },
    onError: (error: unknown) => {
      const msg = error instanceof BffError ? error.message : "Couldn't block the user. Try again.";
      toast.error(msg);
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await bffFetch(`/api/admin/users/${encodeURIComponent(id)}/unblock`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("User unblocked");
      invalidateUsers(queryClient);
    },
    onError: (error: unknown) => {
      const msg = error instanceof BffError ? error.message : "Couldn't unblock the user. Try again.";
      toast.error(msg);
    },
  });
}

interface RoleMutationArgs {
  userId: string;
  role: Role;
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: RoleMutationArgs) => {
      await bffFetch("/api/admin/roles/assign", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role }),
      });
    },
    onSuccess: (_, { role }) => {
      toast.success(`Assigned ${role}`);
      invalidateUsers(queryClient);
    },
    onError: (error: unknown) => {
      const msg = error instanceof BffError ? error.message : "Couldn't assign the role. Try again.";
      toast.error(msg);
    },
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: RoleMutationArgs) => {
      await bffFetch("/api/admin/roles/revoke", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role }),
      });
    },
    onSuccess: (_, { role }) => {
      toast.success(`Revoked ${role}`);
      invalidateUsers(queryClient);
    },
    onError: (error: unknown) => {
      // Backend rejects revoking the last admin's role (is_last_admin); the
      // message propagates through the error envelope.
      const msg = error instanceof BffError ? error.message : "Couldn't revoke the role. Try again.";
      toast.error(msg);
    },
  });
}
