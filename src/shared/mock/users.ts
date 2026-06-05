import type { Invitation, User } from "@/domain/admin/user";

const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString();

// Phase-4 placeholder identity used by MOCK_USERS below. The frontend no
// longer reads this directly — `useMeQuery` is the only source of the
// current user — so the constant stays module-private.
const MOCK_CURRENT_USER: User = {
  id: "u-1",
  email: "ruslan.kosykh@indriver.com",
  display_name: "Ruslan Kosykh",
  roles: ["admin"],
  status: "active",
  connected_providers: ["google"],
  created_at: iso(180),
  last_active_at: iso(0),
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: "u-2",
    email: "ops-lead@maintmode",
    display_name: "Operations Lead",
    roles: ["admin"],
    status: "active",
    connected_providers: ["google"],
    is_last_admin: false,
    created_at: iso(120),
    last_active_at: iso(0),
  },
  {
    id: "u-3",
    email: "alice@maintmode",
    display_name: "Alice Operator",
    roles: ["editor"],
    status: "active",
    connected_providers: ["google"],
    created_at: iso(60),
    last_active_at: iso(1),
  },
  {
    id: "u-4",
    email: "bob@maintmode",
    display_name: "Bob Viewer",
    roles: ["guest"],
    status: "active",
    connected_providers: ["google"],
    created_at: iso(30),
    last_active_at: iso(4),
  },
  {
    id: "u-5",
    email: "carol@maintmode",
    display_name: "Carol (blocked)",
    roles: ["editor"],
    status: "blocked",
    connected_providers: ["google"],
    created_at: iso(200),
    last_active_at: iso(10),
  },
];

export const MOCK_INVITATIONS: Invitation[] = [
  {
    id: "i-1",
    email: "dave@maintmode",
    roles: ["editor"],
    status: "pending",
    suggested_provider: "google",
    invited_by: "Ruslan Kosykh",
    invited_at: iso(2),
    expires_at: iso(-12),
  },
  {
    id: "i-2",
    email: "eve@external.org",
    roles: ["guest"],
    status: "pending",
    suggested_provider: "google",
    invited_by: "Ruslan Kosykh",
    invited_at: iso(0),
    expires_at: iso(-14),
  },
  {
    id: "i-3",
    email: "old@maintmode",
    roles: ["editor"],
    status: "expired",
    invited_by: "Ops Lead",
    invited_at: iso(30),
    expires_at: iso(16),
  },
];
