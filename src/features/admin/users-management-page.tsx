"use client";

import { Lock, Pencil, Plus, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/features/_shared/hooks/use-debounced-value";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";

import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Input } from "@/shared/ui/shadcn/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/shadcn/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { Chip } from "@/shared/ui/domain/chip";
import { SemanticPill, type SemanticTone } from "@/shared/ui/domain/semantic-pill";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import {
  useAssignRole,
  useBlockUser,
  useInvitationsQuery,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeRole,
  useUnblockUser,
  useUsersQuery,
} from "./queries/use-users-queries";
import { InviteUserDialog } from "./invite-user-dialog";
import { Field, ROLE_DESCRIPTIONS, ROLE_ORDER, sortRoles } from "./roles-ui";
import type { InvitationStatus } from "@/domain/admin/user";
import { inviterHandle, isUserBlocked } from "@/domain/admin/user";
import type { Invitation, User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";

const PAGE_SIZE = 50;

export function UsersManagementPage() {
  const [tab, setTab] = useState<"users" | "invitations">("users");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  // Invitation status chips live in the filter bar (inline with the toggle),
  // not inside InvitationsTable, so both views share the same row layout.
  const [inviteFilter, setInviteFilter] = useState<InvitationFilter>("pending");
  const [offset, setOffset] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Debounce search so we don't fire a BFF round-trip on every keystroke; the
  // input stays controlled by `query` while `debouncedQuery` drives the fetch.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const meQuery = useMeQuery();
  const selfId = meQuery.data?.id ?? null;

  const usersQuery = useUsersQuery({ search: debouncedQuery || undefined, limit: PAGE_SIZE, offset });
  const invitationsQuery = useInvitationsQuery();

  const page = usersQuery.data;
  const users = useMemo(() => page?.users ?? [], [page]);
  const total = page?.total ?? users.length;
  const allInvitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data]);

  // Header caption counts: active = non-blocked loaded users; pending = invites
  // awaiting acceptance. Both come from the same queries feeding the toggle.
  const activeUserCount = useMemo(() => users.filter((u) => !isUserBlocked(u)).length, [users]);
  const pendingInviteCount = useMemo(
    () => allInvitations.filter((i) => i.status === "pending").length,
    [allInvitations],
  );

  // Role chips filter the loaded page client-side (server search is name/email).
  const visibleUsers = useMemo(
    () => (roleFilter === "all" ? users : users.filter((u) => u.roles.includes(roleFilter))),
    [users, roleFilter],
  );

  // Keep the open sheet in sync with refetched data (status/roles change after
  // a mutation), looking the user up by id rather than holding a stale copy.
  const activeUser = useMemo(() => users.find((u) => u.id === activeUserId) ?? null, [users, activeUserId]);

  const searchPlaceholder =
    tab === "invitations" ? "Search invitations by email…" : "Search by name or email…";

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[1120px] p-6 space-y-4">
        <header className="flex items-end flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <h1 className="h1">Users</h1>
            <p className="caption mono mt-1 text-fg-dim">
              {activeUserCount} active · {pendingInviteCount} pending invitations
            </p>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> Invite user
          </Button>
        </header>

        {/* Filter bar — row 1: full-width search; row 2: toggle + chips. */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
              aria-hidden="true"
            />
            <Input
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Jump back to the first page whenever the search term changes.
                setOffset(0);
              }}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="users">Users · {total}</TabsTrigger>
                <TabsTrigger value="invitations">Invitations · {allInvitations.length}</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "users" ? (
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => setRoleFilter("all")} className="appearance-none">
                  <Chip selected={roleFilter === "all"}>All</Chip>
                </button>
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter((cur) => (cur === r ? "all" : r))}
                    className="appearance-none capitalize"
                  >
                    <Chip selected={roleFilter === r}>{r}</Chip>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {INVITATION_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setInviteFilter(f.id)}
                    className="appearance-none"
                  >
                    <Chip selected={inviteFilter === f.id}>{f.label}</Chip>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {tab === "users" ? (
          usersQuery.isPending ? (
            <Skeleton type="block" />
          ) : usersQuery.isError ? (
            <p className="body-sm text-[var(--destructive-fg)]">Couldn&apos;t load users. Try again.</p>
          ) : (
            <>
              <UsersTable users={visibleUsers} selfId={selfId} onOpen={(u) => setActiveUserId(u.id)} />
              <Pagination
                offset={offset}
                pageSize={PAGE_SIZE}
                total={total}
                onPrev={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                onNext={() => setOffset((o) => o + PAGE_SIZE)}
              />
            </>
          )
        ) : invitationsQuery.isPending ? (
          <Skeleton type="block" />
        ) : (
          <InvitationsTable invitations={allInvitations} filter={inviteFilter} />
        )}

        <UserSheet
          user={activeUser}
          selfId={selfId}
          open={activeUser !== null}
          onOpenChange={(o) => !o && setActiveUserId(null)}
        />
        <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      </div>
    </TooltipProvider>
  );
}

function Pagination({
  offset,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  if (total <= pageSize && offset === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="caption text-fg-dim">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-1">
        <Button size="xs" variant="outline" onClick={onPrev} disabled={!hasPrev}>
          Previous
        </Button>
        <Button size="xs" variant="outline" onClick={onNext} disabled={!hasNext}>
          Next
        </Button>
      </div>
    </div>
  );
}

function UserStatusBadge({ user }: { user: User }) {
  // Users have no maintenance status — derive Active/Blocked from `blocked_at`.
  return isUserBlocked(user) ? (
    <SemanticPill tone="danger">Blocked</SemanticPill>
  ) : (
    <SemanticPill tone="positive">Active</SemanticPill>
  );
}

/** Initials circle (gradient) used in the table avatar column + the sheet. */
function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full text-fg font-medium uppercase"
      style={{
        width: size,
        height: size,
        fontSize: size <= 28 ? 11 : 15,
        background: "linear-gradient(var(--accent-soft), var(--bg-elev-3))",
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function YouPill() {
  return (
    <span className="inline-flex items-center rounded-sm bg-bg-elev-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
      You
    </span>
  );
}

function UsersTable({
  users,
  selfId,
  onOpen,
}: {
  users: User[];
  selfId: string | null;
  onOpen: (u: User) => void;
}) {
  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <table className="w-full text-left text-sm table-fixed">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-[40%]" />
          <col className="w-16" />
        </colgroup>
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {["", "User", "Roles", ""].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-fg-dim">
                No users found.
              </td>
            </tr>
          ) : (
            users.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover cursor-pointer h-14",
                    isSelf && "bg-bg-row-hover",
                  )}
                  onClick={() => onOpen(u)}
                >
                  <td className="pl-3 pr-0 py-2.5">
                    <Avatar name={u.display_name} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-fg">{u.display_name}</span>
                      {isSelf ? <YouPill /> : null}
                    </div>
                    <div className="text-xs font-mono text-fg-dim">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {sortRoles(u.roles).map((r) => (
                        <RoleBadge key={r} role={r} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {/* Visual affordance only — the whole row is the click target. */}
                    <Pencil className="size-3.5 inline text-fg-dim" aria-hidden="true" />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-bg-elev-3 text-[10px] uppercase tracking-[0.04em] text-fg-muted">
      {role}
    </span>
  );
}

// Invitation lifecycle → pill tone + label. These are real invitation states
// (no maintenance-status vocabulary): revoked renders struck-through per the
// frozen contract.
const INVITATION_TONE: Record<InvitationStatus, SemanticTone> = {
  pending: "neutral",
  accepted: "positive",
  expired: "warning",
  revoked: "danger",
};

function InvitationStatusPill({ status }: { status: InvitationStatus }) {
  return (
    <SemanticPill tone={INVITATION_TONE[status]} strike={status === "revoked"}>
      {status}
    </SemanticPill>
  );
}

const INVITATION_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "all", label: "All" },
] as const;
type InvitationFilter = (typeof INVITATION_FILTERS)[number]["id"];

function InvitationsTable({ invitations, filter }: { invitations: Invitation[]; filter: InvitationFilter }) {
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  // Disable both row actions while either is in flight for that row, so a
  // double-click can't fire resend+revoke (or two revokes) against one invite.
  const pendingId = resend.isPending ? resend.variables : revoke.isPending ? revoke.variables : undefined;

  // Pending / Accepted / All (frozen 2026-06-10). Pending + Accepted match one
  // status exactly; All applies no status filter so revoked/expired surface for
  // the audit trail. The chips live in the page filter bar (inline with the
  // view toggle); this table just consumes the selected `filter`.
  const filtered = filter === "all" ? invitations : invitations.filter((i) => i.status === filter);

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {["Email", "Roles", "Invited by", "Sent at", "Expires", "Status", ""].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-fg-dim">
                No invitations in this view.
              </td>
            </tr>
          ) : (
            filtered.map((i) => (
              <tr
                key={i.id}
                className={cn(
                  "border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover",
                  i.status !== "pending" && "opacity-70",
                )}
              >
                <td className="px-3 py-2.5 font-mono text-fg">{i.email}</td>
                <td className="px-3 py-2.5">
                  {sortRoles(i.roles).map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center px-2 py-0.5 rounded-sm bg-bg-elev-3 text-[10px] uppercase tracking-[0.04em] text-fg-muted mr-1"
                    >
                      {r}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-fg-muted">@{inviterHandle(i.inviter)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                  {formatUtc(i.sent_at)}
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                  {formatUtc(i.expires_at)}
                </td>
                <td className="px-3 py-2.5">
                  <InvitationStatusPill status={i.status} />
                </td>
                <td className="px-3 py-2.5 w-32 text-right">
                  {/* Resend + Revoke only for pending — the backend rejects
                        resend/revoke of any terminal status (expired/accepted/
                        revoked) with 409, so showing the buttons there is a dead
                        affordance. */}
                  {i.status === "pending" ? (
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={pendingId === i.id}
                        onClick={() => resend.mutate(i.id)}
                      >
                        Resend
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-[var(--destructive-fg)]"
                        disabled={pendingId === i.id}
                        onClick={() => revoke.mutate(i.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserSheet({
  user,
  selfId,
  open,
  onOpenChange,
}: {
  user: User | null;
  selfId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-modal="true" className="sm:max-w-[560px] bg-bg-elev-1 p-0">
        {user ? (
          <UserSheetBody user={user} isSelf={user.id === selfId} onClose={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * User sheet body. Roles are edited as a local draft (4-checkbox list); the
 * footer Save fires the diff against the server (parallel assign/revoke), per
 * the frozen contract. Block lives in the Danger zone with the last-admin and
 * self guards.
 */
function UserSheetBody({ user, isSelf, onClose }: { user: User; isSelf: boolean; onClose: () => void }) {
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();

  const [draftRoles, setDraftRoles] = useState<Role[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const added = draftRoles.filter((r) => !user.roles.includes(r));
  const removed = user.roles.filter((r) => !draftRoles.includes(r));
  const diffCount = added.length + removed.length;

  const toggleRole = (role: Role, checked: boolean) => {
    setError(null);
    setDraftRoles((cur) => (checked ? [...cur, role] : cur.filter((r) => r !== role)));
  };

  const save = async () => {
    if (diffCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        ...added.map((role) => assignRole.mutateAsync({ userId: user.id, role })),
        ...removed.map((role) => revokeRole.mutateAsync({ userId: user.id, role })),
      ]);
      onClose();
    } catch {
      // Roll back to the server's roles and surface a recoverable banner.
      setDraftRoles(user.roles);
      setError("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="px-6 pt-6 pb-0">
        <div className="flex items-center gap-3">
          <Avatar name={user.display_name} size={44} />
          <div className="min-w-0">
            <SheetTitle className="flex items-center gap-2">
              <span className="truncate">{user.display_name}</span>
              {isSelf ? <YouPill /> : null}
            </SheetTitle>
            <p className="text-xs font-mono text-fg-dim truncate">{user.email}</p>
            {user.oauth_provider ? (
              <p className="text-xs text-fg-dim capitalize mt-0.5">Signs in with {user.oauth_provider}</p>
            ) : null}
          </div>
        </div>
        <SheetDescription className="sr-only">
          Edit roles and account status for {user.display_name}.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <Field label="Status">
          <UserStatusBadge user={user} />
        </Field>

        <RolesEditor
          user={user}
          isSelf={isSelf}
          draftRoles={draftRoles}
          onToggle={toggleRole}
          disabled={saving}
        />

        <UserDangerZone user={user} isSelf={isSelf} />

        {error ? (
          <p role="alert" className="text-xs text-[var(--destructive-fg)]">
            {error}
          </p>
        ) : null}
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t border-border-subtle px-6 py-4">
        <p className="text-xs text-fg-dim">
          {diffCount === 0 ? "No changes." : `${diffCount} change${diffCount === 1 ? "" : "s"} pending.`}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={diffCount === 0 || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SheetFooter>
    </div>
  );
}

/**
 * Block / unblock surface in the user sheet's Danger zone (frozen decision —
 * the block action lives here, not in a row overflow menu). Block is disabled
 * for self (you can't block yourself) and for the last admin (backend guard),
 * each with an explanatory tooltip.
 */
function UserDangerZone({ user, isSelf }: { user: User; isSelf: boolean }) {
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const blocked = isUserBlocked(user);

  const blockDisabledReason = isSelf
    ? "You can't block yourself."
    : user.is_last_admin
      ? "Promote another admin before blocking this user."
      : null;

  return (
    <div className="rounded-md border-l-[3px] border-l-[var(--destructive-border)] border border-border-subtle bg-[var(--destructive-bg)]/15 p-4 space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--destructive-fg)]">
        Danger zone
      </p>
      {blocked ? (
        <>
          <p className="body-sm">This account is blocked and can&apos;t sign in.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={unblockUser.isPending}
            onClick={() => unblockUser.mutate({ id: user.id })}
          >
            Unblock this user
          </Button>
        </>
      ) : (
        <>
          <p className="body-sm">
            Blocking signs the user out everywhere and prevents future sign-in. Roles are kept.
          </p>
          {blockDisabledReason ? (
            <Tooltip>
              {/* Disabled buttons don't emit pointer events — wrap in a span so
                  the tooltip still triggers on hover/focus. */}
              <TooltipTrigger asChild>
                <span className="inline-block" tabIndex={0}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-[var(--destructive-fg)] border-[var(--destructive-border)] pointer-events-none"
                  >
                    <ShieldAlert className="size-3.5" aria-hidden="true" /> Block this user
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{blockDisabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={blockUser.isPending}
              onClick={() => blockUser.mutate({ id: user.id })}
              className="text-[var(--destructive-fg)] border-[var(--destructive-border)] hover:bg-[var(--destructive-bg)]"
            >
              <ShieldAlert className="size-3.5" aria-hidden="true" /> Block this user
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function RolesEditor({
  user,
  isSelf,
  draftRoles,
  onToggle,
  disabled,
}: {
  user: User;
  isSelf: boolean;
  draftRoles: Role[];
  onToggle: (role: Role, checked: boolean) => void;
  disabled: boolean;
}) {
  // Can't strip your own access: on the self user, a role you currently hold is
  // locked against removal (you'd lock yourself out). Adding roles to yourself
  // stays allowed. This is a UI guard — the backend self-revoke guard is being
  // added separately, and the UI must not depend on it.
  const lockedSelfRole = (role: Role) => isSelf && user.roles.includes(role);

  return (
    <Field label="Roles">
      <div className="rounded-md border border-border-subtle divide-y divide-border-subtle">
        {ROLE_ORDER.map((role) => {
          const checked = draftRoles.includes(role);
          // The backend forbids removing the last admin's admin role; mirror it
          // by locking the admin checkbox while it's the sole admin.
          const lockedAdmin = role === "admin" && checked && Boolean(user.is_last_admin);
          // Locking only matters while the box is checked — it prevents removal;
          // it never blocks adding a role.
          const locked = lockedAdmin || (checked && lockedSelfRole(role));
          const id = `role-${role}`;
          return (
            <div key={role} className="flex items-start gap-3 p-3">
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled || locked}
                onCheckedChange={(c) => onToggle(role, c === true)}
                className="mt-0.5"
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex items-center gap-1.5 text-sm font-medium capitalize text-fg">
                  {role}
                  {locked ? <Lock className="size-3 text-fg-dim" aria-hidden="true" /> : null}
                </span>
                <span className="block text-xs text-fg-dim">{ROLE_DESCRIPTIONS[role]}</span>
              </label>
            </div>
          );
        })}
      </div>
      {user.is_last_admin ? (
        <p className="caption mt-1.5 text-[var(--impact-partial-fg)]">
          You&apos;re the only admin. Promote someone else before removing the admin role.
        </p>
      ) : isSelf ? (
        <p className="caption mt-1.5 text-fg-dim">You can&apos;t remove your own roles.</p>
      ) : null}
    </Field>
  );
}
