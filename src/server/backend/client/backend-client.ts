import "server-only";

import { readMaintmodeBackendConfig } from "@/server/backend/config";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";

type BackendRequestOptions = RequestInit & {
  path: string;
};

export async function backendRequest<TResponse>({ path, ...init }: BackendRequestOptions): Promise<TResponse> {
  const config = readMaintmodeBackendConfig();
  const target = new URL(path, config.apiBaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...init.headers,
      },
    });

    const body = await response.text();

    if (!response.ok) {
      throw new BackendRequestError(response.status, body || response.statusText);
    }

    return (body ? JSON.parse(body) : undefined) as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}
