import { execFile } from "node:child_process";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * RUK-311 — `scripts/refresh-fixtures.mjs` authenticates as the BFF does.
 *
 * The backend refuses its token endpoints without the s2s credential, the
 * dev login the script signs in with among them. So the script must
 * send `X-S2S-APPNAME: maintmode-ui` + `X-S2S-TOKEN` there, and refuse to start
 * without the variable — otherwise the first thing a recorder sees is a 401
 * that reads like "backend down".
 *
 * Runs the real script as a process against a local stand-in gateway that
 * records what it receives and refuses the login with a 401, so the script
 * stops before capturing anything and no fixture is written.
 *
 * Expectations are literals written here, not read from the script.
 */

const SCRIPT = join(__dirname, "../../scripts/refresh-fixtures.mjs");
const TOKEN = "s2s-recorder-token-0123456789abcdefghij";

type Received = { method: string; url: string; headers: IncomingHttpHeaders };

let server: Server;
let received: Received[];
let gateway: string;

beforeEach(async () => {
  received = [];
  server = createServer((request, response) => {
    received.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers });
    request.resume();
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "invalid_client", message: "client authentication failed" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  gateway = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Runs the script asynchronously — the stand-in gateway lives in this process. */
function runScript(token: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env, FIXTURE_GATEWAY_URL: gateway };
  delete env.MAINTMODE_BACKEND_S2S_TOKEN;
  if (token !== undefined) {
    env.MAINTMODE_BACKEND_S2S_TOKEN = token;
  }
  return new Promise<{ code: number | null; stderr: string }>((resolve) => {
    execFile(process.execPath, [SCRIPT], { env, timeout: 15_000 }, (error, _stdout, stderr) => {
      resolve({ code: error ? ((error as { code?: number }).code ?? null) : 0, stderr });
    });
  });
}

describe("refresh-fixtures — s2s client credential", () => {
  it("sends the app name and the token on the dev login", async () => {
    const result = await runScript(TOKEN);

    // Stopped by the stand-in's 401 at login, before any capture.
    expect(result.code).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("POST");
    expect(received[0].url).toBe("/auth/api/v1/login/dev");
    expect(received[0].headers["x-s2s-appname"]).toBe("maintmode-ui");
    expect(received[0].headers["x-s2s-token"]).toBe(TOKEN);
  }, 20_000);

  it("refuses to start without the variable, before sending anything", async () => {
    const result = await runScript(undefined);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("MAINTMODE_BACKEND_S2S_TOKEN is not set");
    expect(received).toHaveLength(0);
  }, 20_000);
});
