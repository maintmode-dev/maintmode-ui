import "server-only";

import { parseMaintmodeAuthConfig } from "@/shared/config/auth-config";

/**
 * Single source of truth for the dev-bypass flow. Resolved at module load from
 * env + NODE_ENV (see `parseMaintmodeAuthConfig`, which answers false whenever
 * NODE_ENV is "production"). Consumers read this value, never re-derive it.
 */
export const DEV_BYPASS_ENABLED = parseMaintmodeAuthConfig(process.env).devAuthBypassEnabled;
