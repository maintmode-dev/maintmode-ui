export type MaintmodeBackendConfig = {
  apiBaseUrl: string;
  requestTimeoutMs: number;
};

export type ConfigIssue = {
  field: "MAINTMODE_API_BASE_URL" | "MAINTMODE_API_TIMEOUT_MS";
  message: string;
};

export class ConfigValidationError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(`Invalid maintmode runtime config: ${issues.map((issue) => `${issue.field} ${issue.message}`).join("; ")}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;

export function parseMaintmodeBackendConfig(env: Record<string, string | undefined>): MaintmodeBackendConfig {
  const issues: ConfigIssue[] = [];
  const rawBaseUrl = env.MAINTMODE_API_BASE_URL;
  const rawTimeout = env.MAINTMODE_API_TIMEOUT_MS;
  let apiBaseUrl = "";

  if (!rawBaseUrl) {
    issues.push({
      field: "MAINTMODE_API_BASE_URL",
      message: "is required",
    });
  } else {
    try {
      const parsed = new URL(rawBaseUrl);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        issues.push({
          field: "MAINTMODE_API_BASE_URL",
          message: "must use http or https",
        });
      } else {
        apiBaseUrl = parsed.toString().replace(/\/$/, "");
      }
    } catch {
      issues.push({
        field: "MAINTMODE_API_BASE_URL",
        message: "must be a valid URL",
      });
    }
  }

  const requestTimeoutMs = parseTimeout(rawTimeout, issues);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    apiBaseUrl,
    requestTimeoutMs,
  };
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
