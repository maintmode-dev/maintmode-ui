"use client";

import { MoreHorizontal, Plus, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

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

import { useInvitationsQuery, useUsersQuery } from "./queries/use-users-queries";
import type { Invitation, User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";

export function UsersManagementPage() {
  const [tab, setTab] = useState<"users" | "invitations">("users");
  const [query, setQuery] = useState("");
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const usersQuery = useUsersQuery();
  const invitationsQuery = useInvitationsQuery();
  const allUsers = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const allInvitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data]);

  const users = useMemo(
    () => allUsers.filter((u) => u.email.toLowerCase().includes(query.toLowerCase())),
    [allUsers, query],
  );

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
            <TabsTrigger value="users">Users · {allUsers.length}</TabsTrigger>
            <TabsTrigger value="invitations">Invitations · {allInvitations.length}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {tab === "users" ? (
        usersQuery.isPending ? (
          <Skeleton type="block" />
        ) : (
          <UsersTable users={users} onOpen={setActiveUser} />
        )
      ) : invitationsQuery.isPending ? (
        <Skeleton type="block" />
      ) : (
        <InvitationsTable invitations={allInvitations} />
      )}

      <UserSheet
        user={activeUser}
        open={activeUser !== null}
        onOpenChange={(o) => !o && setActiveUser(null)}
      />
      <InviteUserSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function UsersTable({ users, onOpen }: { users: User[]; onOpen: (u: User) => void }) {
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
          {users.map((u) => (
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
                    <span
                      key={r}
                      className="inline-flex items-center px-2 py-0.5 rounded-sm bg-bg-elev-3 text-[10px] uppercase tracking-[0.04em] text-fg-muted"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2.5">
                {u.status === "blocked" ? (
                  <StatusBadge status="canceled" dot={false} />
                ) : (
                  <StatusBadge status="completed" dot={false} />
                )}
              </td>
              <td className="px-3 py-2.5 text-fg-muted">
                {u.last_active_at ? formatRelative(u.last_active_at) : "—"}
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
                    {u.status === "blocked" ? (
                      <DropdownMenuItem>
                        <ShieldCheck className="size-3.5" aria-hidden="true" /> Unblock
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        disabled={u.is_last_admin}
                        className="text-[var(--destructive-fg)] focus:bg-[var(--destructive-bg)] focus:text-[var(--destructive-fg)]"
                      >
                        <ShieldAlert className="size-3.5" aria-hidden="true" /> Block
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvitationsTable({ invitations }: { invitations: Invitation[] }) {
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
              <td className="px-3 py-2.5 text-fg-muted">{formatRelative(i.invited_at)}</td>
              <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                {formatRelative(i.expires_at)}
              </td>
              <td className="px-3 py-2.5 w-32 text-right">
                {i.status === "pending" ? (
                  <div className="flex gap-1 justify-end">
                    <Button size="xs" variant="outline">
                      Resend
                    </Button>
                    <Button size="xs" variant="ghost" className="text-[var(--destructive-fg)]">
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
                {user.status === "blocked" ? (
                  <StatusBadge status="canceled" dot={false} />
                ) : (
                  <StatusBadge status="completed" dot={false} />
                )}
              </Field>
              <Field label="Roles">
                <div className="flex flex-wrap gap-1.5">
                  {user.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center px-2 py-1 rounded-sm bg-bg-elev-3 text-xs uppercase tracking-[0.04em] text-fg"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                {user.is_last_admin ? (
                  <p className="caption mt-1 text-[var(--impact-partial-fg)]">
                    This is the last admin. Role cannot be removed.
                  </p>
                ) : null}
              </Field>
              <Field label="Connected providers">
                <div className="flex gap-1.5 flex-wrap capitalize text-sm">
                  {user.connected_providers.join(", ")}
                </div>
              </Field>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function InviteUserSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
            onOpenChange(false);
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
          <Button type="submit" className="w-full">
            Send invitation
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
