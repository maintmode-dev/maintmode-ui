import { NextResponse } from "next/server";

import { isRole } from "@/domain/auth/permissions";
import { DEV_BYPASS_ENABLED } from "@/server/auth/dev-bypass";
import { signInWithDevBypass } from "@/server/auth/sign-in";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * POST /api/auth/dev-login — dev-only headless sign-in as a role.
 *
 * What scripts and test tooling use to get a session without a browser (the
 * toolbar's "Login as" uses `devLoginAsAction` instead). It replaces the
 * `GET /api/auth/csrf` → `POST /api/auth/callback/dev-bypass` pair Auth.js used
 * to serve:
 *
 *   curl -c jar -X POST -d role=admin http://localhost:3000/api/auth/dev-login
 *
 * Answers 404 unless the dev bypass is on, which it never is in a production
 * build (`parseMaintmodeAuthConfig` ties it to NODE_ENV). A browser posting
 * from another site always sends `Origin`, so a foreign Origin is refused — no
 * page can sign a developer's browser into a dev account — while a script,
 * which sends none, gets through.
 */
export async function POST(request: Request) {
  if (!DEV_BYPASS_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }
  if (request.headers.get("origin") && !isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const role = await readRole(request);
  if (!isRole(role)) {
    return NextResponse.json({ error: "Unknown role", code: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    await signInWithDevBypass(role);
  } catch (error) {
    const code =
      typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
    return NextResponse.json(
      { error: "Dev sign-in failed", code: code || "DEV_LOGIN_FAILED" },
      { status: 502 },
    );
  }
  return new NextResponse(null, { status: 204 });
}

async function readRole(request: Request): Promise<string> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as { role?: unknown };
      return typeof body.role === "string" ? body.role : "";
    }
    const form = await request.formData();
    const role = form.get("role");
    return typeof role === "string" ? role : "";
  } catch {
    return "";
  }
}
