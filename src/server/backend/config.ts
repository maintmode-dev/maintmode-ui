import "server-only";

import { parseMaintmodeBackendConfig } from "@/shared/config/runtime-config";

export function readMaintmodeBackendConfig() {
  return parseMaintmodeBackendConfig(process.env);
}
