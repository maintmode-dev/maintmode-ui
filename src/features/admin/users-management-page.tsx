"use client";

import { MoreHorizontal, Plus, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/features/_shared/hooks/use-debounced-value";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/shadcn/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/shadcn/dropdown-menu";
import { Label } from "@/shared/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { formatRelative } from "@/shared/ui/lib/format";

import {
  useAssignRole,
  useBlockUser,
  useInvitationsQuery,
  useInviteUser,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeRole,
  useRolesQuery,
  useUnblockUser,
  useUsersQuery,
} from "./queries/use-users-queries";
import { isUserBlocked } from "@/domain/admin/user";
import type { Invitation, User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";

const PAGE_SIZE = 50;

export function UsersManagementPage() {
  const [tab, setTab] = useState<"users" | "invitations">("users");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Debounce search so we don't fire a BFF round-trip on every keystroke; the
  // input stays controlled by `query` while `debouncedQuery` drives the fetch.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const usersQuery = useUsersQuery({ search: debouncedQuery || undefined, limit: PAGE_SIZE, offset });
  const invitationsQuery = useInvitationsQuery();

  const page = usersQuery.data;
  const users = useMemo(() => page?.users ?? [], [page]);
  const total = page?.total ?? users.length;
  const allInvitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data]);

  // Keep the open sheet in sync with refetched data (status/roles change after
  // a mutation), looking the user up by id rather than holding a stale copy.
  const activeUser = useMemo(() => users.find((u) => u.id === activeUserId) ?? null, [users, activeUserId]);

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="flex items-end flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="h1">Users</h1>
          <p className="body-sm mt-1">Manage accounts and pending invitations.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> Invite user
        </Button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="users">Users · {total}</TabsTrigger>
            <TabsTrigger value="invitations">Invitations · {allInvitations.length}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Jump back to the first page whenever the search term changes.
              setOffset(0);
            }}
            className="pl-8"
          />
        </div>
      </div>

      {tab === "users" ? (
        usersQuery.isPending ? (
          <Skeleton type="block" />
        ) : usersQuery.isError ? (
          <p className="body-sm text-[var(--destructive-fg)]">Couldn&apos;t load users. Try again.</p>
        ) : (
          <>
            <UsersTable users={users} onOpen={(u) => setActiveUserId(u.id)} />
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
        <InvitationsTable invitations={allInvitations} />
      )}

      <UserSheet
        user={activeUser}
        open={activeUser !== null}
        onOpenChange={(o) => !o && setActiveUserId(null)}
      />
      <InviteUserSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
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
  return isUserBlocked(user) ? (
    <StatusBadge status="canceled" dot={false} />
  ) : (
    <StatusBadge status="completed" dot={false} />
  );
}

function UsersTable({ users, onOpen }: { users: User[]; onOpen: (u: User) => void }) {
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {["User", "Roles", "Status", "Last active", ""].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-fg-dim">
                No users found.
              </td>
            </tr>
          ) : (
            users.map((u) => {
              const blocked = isUserBlocked(u);
              return (
                <tr
                  key={u.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover cursor-pointer"
                  onClick={() => onOpen(u)}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-fg">{u.display_name}</div>
                    <div className="text-xs font-mono text-fg-dim">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <RoleBadge key={r} role={r} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <UserStatusBadge user={u} />
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">
                    {u.last_seen_at ? formatRelative(u.last_seen_at) : "—"}
                  </td>
                  <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="More actions" className="text-fg-dim hover:text-fg">
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(u)}>Open profile</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {blocked ? (
                          <DropdownMenuItem
                            disabled={unblockUser.isPending}
                            onClick={() => unblockUser.mutate({ id: u.id })}
                          >
                            <ShieldCheck className="size-3.5" aria-hidden="true" /> Unblock
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={u.is_last_admin || blockUser.isPending}
                            onClick={() => blockUser.mutate({ id: u.id })}
                            className="text-[var(--destructive-fg)] focus:bg-[var(--destructive-bg)] focus:text-[var(--destructive-fg)]"
                          >
                            <ShieldAlert className="size-3.5" aria-hidden="true" /> Block
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

function InvitationsTable({ invitations }: { invitations: Invitation[] }) {
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  // Disable both row actions while either is in flight for that row, so a
  // double-click can't fire resend+revoke (or two revokes) against one invite.
  const pendingId = resend.isPending ? resend.variables : revoke.isPending ? revoke.variables : undefined;

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {["Email", "Roles", "Status", "Invited", "Expires", ""].map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invitations.map((i) => (
            <tr key={i.id} className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover">
              <td className="px-3 py-2.5 font-mono text-fg">{i.email}</td>
              <td className="px-3 py-2.5">
                {i.roles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center px-2 py-0.5 rounded-sm bg-bg-elev-3 text-[10px] uppercase tracking-[0.04em] text-fg-muted mr-1"
                  >
                    {r}
                  </span>
                ))}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge
                  status={
                    i.status === "pending" ? "planned" : i.status === "accepted" ? "completed" : "canceled"
                  }
                  dot={false}
                />
              </td>
              <td className="px-3 py-2.5 text-fg-muted">{formatRelative(i.sent_at)}</td>
              <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                {formatRelative(i.expires_at)}
              </td>
              <td className="px-3 py-2.5 w-32 text-right">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserSheet({
  user,
  open,
  onOpenChange,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[440px]">
        {user ? (
          <>
            <SheetHeader>
              <SheetTitle>{user.display_name}</SheetTitle>
              <p className="text-xs font-mono text-fg-dim">{user.email}</p>
            </SheetHeader>
            <div className="px-6 py-4 space-y-4">
              <Field label="Status">
                <UserStatusBadge user={user} />
              </Field>
              <RolesEditor user={user} />
              <Field label="Connected providers">
                <div className="flex gap-1.5 flex-wrap capitalize text-sm">
                  {user.connected_providers.length > 0 ? user.connected_providers.join(", ") : "—"}
                </div>
              </Field>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const ALL_ROLES: Role[] = ["guest", "editor", "reviewer", "admin"];

function RolesEditor({ user }: { user: User }) {
  const rolesQuery = useRolesQuery();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const [adding, setAdding] = useState<Role | "">("");

  const assignable = rolesQuery.data ?? ALL_ROLES;
  const available = assignable.filter((r) => !user.roles.includes(r));
  const busy = assignRole.isPending || revokeRole.isPending;

  return (
    <Field label="Roles">
      <div className="flex flex-wrap gap-1.5">
        {user.roles.map((r) => {
          // The backend forbids removing the last admin's admin role; mirror
          // that in the UI so the chip's remove control is disabled.
          const lockedAdmin = r === "admin" && Boolean(user.is_last_admin);
          return (
            <span
              key={r}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-bg-elev-3 text-xs uppercase tracking-[0.04em] text-fg"
            >
              {r}
              <button
                type="button"
                aria-label={`Remove ${r} role`}
                disabled={lockedAdmin || busy}
                onClick={() => revokeRole.mutate({ userId: user.id, role: r })}
                className="text-fg-dim hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>

      {user.is_last_admin ? (
        <p className="caption mt-1 text-[var(--impact-partial-fg)]">
          This is the last admin. The admin role cannot be removed.
        </p>
      ) : null}

      {available.length > 0 ? (
        <div className="flex items-center gap-1.5 mt-2">
          <Select value={adding} onValueChange={(v) => setAdding(v as Role)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Add role…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="xs"
            variant="outline"
            disabled={!adding || busy}
            onClick={() => {
              if (!adding) {
                return;
              }
              assignRole.mutate({ userId: user.id, role: adding }, { onSuccess: () => setAdding("") });
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
    </Field>
  );
}

function InviteUserSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const invite = useInviteUser();

  const reset = () => {
    setEmail("");
    setRole("editor");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent className="sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Invite user</SheetTitle>
          <p className="body-sm">
            They receive a one-time invitation link. Choose the lowest role that fits the work.
          </p>
        </SheetHeader>
        <form
          className="px-6 py-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = email.trim();
            if (!trimmed) return;
            invite.mutate(
              { email: trimmed, roles: [role] },
              {
                onSuccess: () => {
                  reset();
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@maintmode"
              className="font-mono"
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
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
