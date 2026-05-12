export type MaintmodeBackendConfig = {
  apiBaseUrl: string;
  authApiBaseUrl: string;
  requestTimeoutMs: number;
  enableMockData: boolean;
};

export type ConfigIssue = {
  field:
    | "MAINTMODE_API_BASE_URL"
    | "MAINTMODE_AUTH_API_BASE_URL"
    | "MAINTMODE_API_TIMEOUT_MS"
    | "MAINTMODE_ENABLE_MOCK_DATA";
  message: string;
};

export class ConfigValidationError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(
      `Invalid maintmode runtime config: ${issues.map((issue) => `${issue.field} ${issue.message}`).join("; ")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;

export function parseMaintmodeBackendConfig(env: Record<string, string | undefined>): MaintmodeBackendConfig {
  const issues: ConfigIssue[] = [];
  const rawTimeout = env.MAINTMODE_API_TIMEOUT_MS;
  const rawEnableMockData = env.MAINTMODE_ENABLE_MOCK_DATA;

  const apiBaseUrl = parseHttpUrl(env.MAINTMODE_API_BASE_URL, "MAINTMODE_API_BASE_URL", issues);
  // Auth-service base URL (login/exchange/refresh/logout/me). The maintmode and
  // auth services live in separate Go services in the backend repo; in local
  // development they are usually exposed through nginx with `/auth/` and
  // `/maintmode/` prefixes. This env defaults to the same host as the resource
  // server when the auth-service is not split out (legacy single-binary mode).
  const rawAuthBaseUrl = env.MAINTMODE_AUTH_API_BASE_URL ?? env.MAINTMODE_API_BASE_URL;
  const authApiBaseUrl = parseHttpUrl(rawAuthBaseUrl, "MAINTMODE_AUTH_API_BASE_URL", issues);

  const requestTimeoutMs = parseTimeout(rawTimeout, issues);
  const enableMockData = parseBooleanFlag(rawEnableMockData, "MAINTMODE_ENABLE_MOCK_DATA", issues);

  // Guard against shipping mock-mode to production. The flag is only legal
  // for local development; setting it to `true` while `NODE_ENV=production`
  // is almost certainly an env-leak from a developer machine.
  if (enableMockData && env.NODE_ENV === "production") {
    issues.push({
      field: "MAINTMODE_ENABLE_MOCK_DATA",
      message: "must not be enabled in production",
    });
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    apiBaseUrl,
    authApiBaseUrl,
    requestTimeoutMs,
    enableMockData,
  };
}

function parseHttpUrl(
  raw: string | undefined,
  field: ConfigIssue["field"],
  issues: ConfigIssue[],
): string {
  if (!raw) {
    issues.push({ field, message: "is required" });
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      issues.push({ field, message: "must use http or https" });
      return "";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    issues.push({ field, message: "must be a valid URL" });
    return "";
  }
}

function parseTimeout(rawTimeout: string | undefined, issues: ConfigIssue[]) {
  if (!rawTimeout) {
    return DEFAULT_TIMEOUT_MS;
  }

  const value = Number(rawTimeout);

  if (!Number.isInteger(value)) {
    issues.push({
      field: "MAINTMODE_API_TIMEOUT_MS",
      message: "must be an integer",
    });
    return DEFAULT_TIMEOUT_MS;
  }

  if (value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    issues.push({
      field: "MAINTMODE_API_TIMEOUT_MS",
      message: `must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
    });
  }

  return value;
}

function parseBooleanFlag(
  rawValue: string | undefined,
  field: "MAINTMODE_ENABLE_MOCK_DATA",
  issues: ConfigIssue[],
) {
  if (!rawValue) {
    return false;
  }

  const value = rawValue.trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  issues.push({
    field,
    message: "must be true or false",
  });
  return false;
}
