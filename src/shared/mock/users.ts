import type { User } from "@/domain/admin/user";

const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString();

// Phase-4 placeholder identity used by MOCK_USERS below. The frontend no
// longer reads this directly — `useMeQuery` is the only source of the
// current user — so the constant stays module-private.
const MOCK_CURRENT_USER: User = {
  id: "u-1",
  email: "ruslan.kosykh@indriver.com",
  display_name: "Ruslan Kosykh",
  roles: ["admin"],
  oauth_provider: "google",
  connected_providers: ["google"],
  created_at: iso(180),
  last_seen_at: iso(0),
  blocked_at: null,
};

export const MOCK_USERS: User[] = [
  MOCK_CURRENT_USER,
  {
    id: "u-2",
    email: "ops-lead@maintmode",
    display_name: "Operations Lead",
    roles: ["admin"],
    oauth_provider: "google",
    connected_providers: ["google"],
    is_last_admin: false,
    created_at: iso(120),
    last_seen_at: iso(0),
    blocked_at: null,
  },
  {
    id: "u-3",
    email: "alice@maintmode",
    display_name: "Alice Operator",
    roles: ["editor"],
    oauth_provider: "google",
    connected_providers: ["google"],
    created_at: iso(60),
    last_seen_at: iso(1),
    blocked_at: null,
  },
  {
    id: "u-4",
    email: "bob@maintmode",
    display_name: "Bob Viewer",
    roles: ["guest"],
    oauth_provider: "google",
    connected_providers: ["google"],
    created_at: iso(30),
    last_seen_at: iso(4),
    blocked_at: null,
  },
  {
    id: "u-5",
    email: "carol@maintmode",
    display_name: "Carol (blocked)",
    roles: ["editor"],
    oauth_provider: "google",
    connected_providers: ["google"],
    created_at: iso(200),
    last_seen_at: iso(10),
    blocked_at: iso(8),
  },
];
