export type MaintmodeAuthConfig = {
  authSecret: string;
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
};

export type AuthConfigIssue = {
  field:
    | "MAINTMODE_AUTH_SECRET"
    | "MAINTMODE_APP_BASE_URL"
    | "MAINTMODE_GOOGLE_OAUTH_CLIENT_ID"
    | "MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET";
  message: string;
};

export class AuthConfigValidationError extends Error {
  readonly issues: AuthConfigIssue[];

  constructor(issues: AuthConfigIssue[]) {
    super(
      `Invalid maintmode auth config: ${issues.map((issue) => `${issue.field} ${issue.message}`).join("; ")}`,
    );
    this.name = "AuthConfigValidationError";
    this.issues = issues;
  }
}

const MIN_SECRET_LENGTH = 32;

export function parseMaintmodeAuthConfig(env: Record<string, string | undefined>): MaintmodeAuthConfig {
  const issues: AuthConfigIssue[] = [];
  const rawSecret = env.MAINTMODE_AUTH_SECRET;
  const rawBaseUrl = env.MAINTMODE_APP_BASE_URL;
  const rawGoogleClientId = env.MAINTMODE_GOOGLE_OAUTH_CLIENT_ID;
  const rawGoogleClientSecret = env.MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET;
  let appBaseUrl = "";

  if (!rawSecret) {
    issues.push({ field: "MAINTMODE_AUTH_SECRET", message: "is required" });
  } else if (rawSecret.length < MIN_SECRET_LENGTH) {
    issues.push({
      field: "MAINTMODE_AUTH_SECRET",
      message: `must be at least ${MIN_SECRET_LENGTH} characters`,
    });
  }

  if (!rawBaseUrl) {
    issues.push({ field: "MAINTMODE_APP_BASE_URL", message: "is required" });
  } else {
    try {
      const parsed = new URL(rawBaseUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        issues.push({ field: "MAINTMODE_APP_BASE_URL", message: "must use http or https" });
      } else {
        appBaseUrl = parsed.toString().replace(/\/$/, "");
      }
    } catch {
      issues.push({ field: "MAINTMODE_APP_BASE_URL", message: "must be a valid URL" });
    }
  }

  if (!rawGoogleClientId) {
    issues.push({ field: "MAINTMODE_GOOGLE_OAUTH_CLIENT_ID", message: "is required" });
  }
  if (!rawGoogleClientSecret) {
    issues.push({ field: "MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET", message: "is required" });
  }

  if (issues.length > 0) {
    throw new AuthConfigValidationError(issues);
  }

  return {
    authSecret: rawSecret ?? "",
    appBaseUrl,
    googleClientId: rawGoogleClientId ?? "",
    googleClientSecret: rawGoogleClientSecret ?? "",
  };
}

/**
 * Returns true when a relative URI is safe to redirect a user back to after login.
 * Rejects absolute URLs, protocol-relative URLs, and any path containing backslashes.
 */
export function isSafeOriginalUri(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  if (!value.startsWith("/")) {
    return false;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return false;
  }
  if (value.includes("\\")) {
    return false;
  }
  return true;
}
