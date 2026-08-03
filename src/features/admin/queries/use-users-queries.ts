"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type {
  CreateInvitationRequest,
  CreateInvitationResponse,
  Invitation,
  InvitationStatus,
  ListUsersPage,
  User,
} from "@/domain/admin/user";
import type { SeatsUsage } from "@/domain/admin/seats";
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
export function invitationsKey(status?: InvitationStatus) {
  return status ? (["invitations", status] as const) : (["invitations"] as const);
}
export function seatsKey() {
  return ["seats"] as const;
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
 *
 * `status` maps to the route's `?status=` filter (validated server-side against
 * `pending|expired|accepted|revoked`), and it also partitions the cache key, so
 * a filtered read never overwrites the unfiltered list or vice versa.
 *
 * `enabled` exists because the full, unfiltered list is only rendered on the
 * Invitations tab; the header needs a count, not the rows. A disabled query
 * still returns `isPending: true`, so callers must not treat pending as
 * "loading" without also checking that the query is on.
 *
 * **Invalidation note:** the mutations below invalidate `invitationsKey()` —
 * `["invitations"]` — which TanStack matches as a PREFIX, so every filtered
 * variant (`["invitations","pending"]`) is invalidated too. That is load-bearing:
 * the header's pending count must move when an invite is sent or revoked, and it
 * is the reason those call sites were left keyless rather than enumerated.
 */
export function useInvitationsQuery(options: { status?: InvitationStatus; enabled?: boolean } = {}) {
  const { status, enabled } = options;
  return useQuery({
    queryKey: invitationsKey(status),
    queryFn: async (): Promise<Invitation[]> => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await bffFetch<{ invitations: Invitation[] }>(`/api/admin/invitations${qs}`);
      return data.invitations ?? [];
    },
    enabled,
  });
}

/**
 * Licensed-seat counters for the page header (RUK-220). Independent of the
 * users list on purpose: a failure here hides the indicator without taking the
 * list down with it.
 *
 * `retry: false` — the two realistic failures are 403 (not an admin) and 500
 * (the backend fails closed rather than reporting zeroes, because a zero reads
 * as "plenty of room"). Neither is fixed by asking again.
 *
 * `staleTime` is **not** a free knob: it is the only thing that refreshes the
 * counters after an invite is *accepted*, which happens in the invitee's
 * browser and produces no mutation here. Raising it widens that window — see
 * the invalidation notes below before touching it.
 */
export function useSeatsQuery() {
  return useQuery({
    queryKey: seatsKey(),
    queryFn: (): Promise<SeatsUsage> => bffFetch<SeatsUsage>("/api/admin/seats"),
    staleTime: 30_000,
    retry: false,
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
      invalidateSeats(queryClient);
    },
    onError: (error: unknown) => {
      if (error instanceof BffError) {
        // Seats limit is a distinct, non-retryable failure (403
        // `seats_limit_exceeded`): retrying won't help, so give the admin a
        // clear reason and a way out instead of the generic "Try again."
        // fallback. Branch on the code, not the status — 403 is otherwise the
        // CSRF / suspended-org channel. We phrase the copy ourselves rather
        // than echoing `error.message`, so the raw backend string never leaks
        // to the user.
        if (error.code === "seats_limit_exceeded") {
          toast.error("You've used all your seats.", {
            description: "Free up a seat by blocking a user, or upgrade your plan to invite more.",
          });
          // This rejection is the server saying our seat numbers are stale —
          // the one response that reports the disagreement outright. Refresh
          // them, or the recovery the toast suggests ("free up a seat") leaves
          // the header frozen on the old count while the admin acts on it.
          invalidateSeats(queryClient);
          return;
        }
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
      invalidateSeats(queryClient);
    },
    onError: (error: unknown) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error("This invitation is no longer pending. Refreshing the list.");
        queryClient.invalidateQueries({ queryKey: invitationsKey() });
        invalidateSeats(queryClient);
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
      invalidateSeats(queryClient);
    },
    onError: (error: unknown) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error("This invitation was already accepted. Refreshing the list.");
        queryClient.invalidateQueries({ queryKey: invitationsKey() });
        invalidateSeats(queryClient);
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

/**
 * Refresh the seat counters after anything that can move them (RUK-220).
 *
 * Paired with **every** existing invalidation site, including the 409 branches
 * of resend/revoke: a 409 there means the invitation stopped being pending —
 * accepted, revoked or expired — which is precisely when a seat changed hands.
 * Skipping those would leave a stale counter next to a freshly refetched list.
 *
 * Called even when the numbers may not move — inviting a guest holds no seat,
 * but the role only becomes knowable server-side, and deciding here would mean
 * reimplementing "which role holds a seat" on the client. One extra GET is
 * cheaper than a second copy of that rule.
 */
function invalidateSeats(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: seatsKey() });
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
      invalidateSeats(queryClient);
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
      invalidateSeats(queryClient);
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
      invalidateSeats(queryClient);
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
      invalidateSeats(queryClient);
    },
    onError: (error: unknown) => {
      // Backend rejects revoking the last admin's role (is_last_admin); the
      // message propagates through the error envelope.
      const msg = error instanceof BffError ? error.message : "Couldn't revoke the role. Try again.";
      toast.error(msg);
    },
  });
}

/**
 * Which user to edit, plus the tag keys the caller actually changed. `userId`
 * is the hook's own field (camelCase, like `useAssignRole`'s) and travels in
 * the PATH; the tag fields are wire keys and travel in the BODY verbatim.
 */
export interface UpdateUserTagsArgs {
  userId: string;
  telegram_tag?: string | null;
  slack_tag?: string | null;
}

/**
 * Admin edit of ANOTHER user's messenger tags (RUK-217) via
 * `PATCH /api/admin/users/{id}`.
 *
 * **The caller decides which keys to send; this hook forwards exactly those**
 * — it never adds, defaults, or drops one (SPEC §1.1):
 *
 *  - key ABSENT → the backend leaves that tag alone;
 *  - key present as `null` → the backend CLEARS that tag;
 *  - key present with a stale value → it OVERWRITES the current tag, silently
 *    clobbering an edit the user made to their own profile.
 *
 * So the body is assembled key-by-key rather than spread from `args`: a spread
 * would smuggle `userId` into the payload, and a sheet that only touched
 * Telegram would start sending Slack too.
 *
 * **No toast here, deliberately.** The user sheet (T10) saves roles and tags in
 * one action and owns the messaging: a "saved" toast from this hook could land
 * next to a banner saying the roles did NOT save. Contrast `useBlockUser`,
 * which does toast — it is a standalone row action with nothing else to
 * coordinate. Failures propagate as `BffError` for the caller to catch.
 */
export function useUpdateUserTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateUserTagsArgs): Promise<User> => {
      const body: Omit<UpdateUserTagsArgs, "userId"> = {};
      if ("telegram_tag" in args) {
        body.telegram_tag = args.telegram_tag;
      }
      if ("slack_tag" in args) {
        body.slack_tag = args.slack_tag;
      }
      return bffFetch<User>(`/api/admin/users/${encodeURIComponent(args.userId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      // No `invalidateSeats` here, and that is deliberate rather than an
      // oversight: a messenger handle holds no licensed seat, so this is the
      // one mutation in the file that cannot move the counters.
      invalidateUsers(queryClient);
    },
  });
}
