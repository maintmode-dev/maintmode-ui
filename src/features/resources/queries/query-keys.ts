export const resourcesQueryKeys = {
  all: ["resources"] as const,
  search: (name: string) => [...resourcesQueryKeys.all, "search", name] as const,
};
