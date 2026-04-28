export type PlaceholderErrorPayload = {
  error: {
    code: "NOT_IMPLEMENTED";
    message: string;
    route: string;
  };
};

export function createNotImplementedPayload(route: string): PlaceholderErrorPayload {
  return {
    error: {
      code: "NOT_IMPLEMENTED",
      message: "This BFF route is intentionally scaffolded and does not serve prototype mock data.",
      route,
    },
  };
}
