import type { MockResource } from "@/shared/mock/mock-resource";

const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString();

// Mock fixtures for the not-yet-wired resource screens (RUK-158). These use
// the legacy `MockResource` shape, not the backend `Resource` domain type.
export const MOCK_RESOURCES: MockResource[] = [
  {
    id: "r-1",
    name: "orders-db",
    type: "database",
    description: "Primary orders database (Postgres 15)",
    owner: "ops@maintmode",
    created_at: iso(120),
    updated_at: iso(15),
  },
  {
    id: "r-2",
    name: "users-db",
    type: "database",
    description: "Auth + profile DB",
    owner: "ops@maintmode",
    created_at: iso(120),
    updated_at: iso(60),
  },
  {
    id: "r-3",
    name: "api-gateway",
    type: "service",
    description: "Public API entrypoint",
    owner: "platform@maintmode",
    created_at: iso(90),
    updated_at: iso(10),
  },
  {
    id: "r-4",
    name: "edge-eu",
    type: "cluster",
    description: "EU edge cluster (12 nodes)",
    owner: "platform@maintmode",
    created_at: iso(60),
    updated_at: iso(5),
  },
  {
    id: "r-5",
    name: "auth-svc",
    type: "service",
    owner: "platform@maintmode",
    created_at: iso(50),
    updated_at: iso(2),
  },
  {
    id: "r-6",
    name: "redis-cache",
    type: "cache",
    owner: "ops@maintmode",
    created_at: iso(40),
    updated_at: iso(1),
  },
  {
    id: "r-7",
    name: "worker-legacy",
    type: "service",
    description: "Pending decommission",
    owner: "ops@maintmode",
    archived: true,
    created_at: iso(400),
    updated_at: iso(30),
  },
  {
    id: "r-8",
    name: "object-storage",
    type: "service",
    owner: "ops@maintmode",
    created_at: iso(200),
    updated_at: iso(7),
  },
];
