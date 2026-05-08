import "server-only";

import { readMaintmodeBackendConfig } from "@/server/backend/config";
import { BackendRequestError, BackendUnavailableError } from "@/server/backend/errors/backend-request-error";

type BackendRequestOptions = RequestInit & {
  path: string;
};

export async function backendRequest<TResponse>({
  path,
  ...init
}: BackendRequestOptions): Promise<TResponse> {
  const config = readMaintmodeBackendConfig();
  const target = new URL(path, config.apiBaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    let response: Response;
    let body: string;

    try {
      response = await fetch(target, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...init.headers,
        },
      });
      body = await response.text();
    } catch (error) {
      if (isBackendTransportError(error)) {
        throw new BackendUnavailableError(error);
      }
      throw error;
    }

    if (!response.ok) {
      throw new BackendRequestError(response.status, body || response.statusText);
    }

    return (body ? JSON.parse(body) : undefined) as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function isBackendTransportError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
}
