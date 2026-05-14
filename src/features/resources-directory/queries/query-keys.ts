export const resourceDirectoryKeys = {
  all: ["resource-directory"] as const,
  search: (name: string) => [...resourceDirectoryKeys.all, "search", name] as const,
  detail: (id: string) => [...resourceDirectoryKeys.all, "detail", id] as const,
  types: (id: string) => [...resourceDirectoryKeys.all, "types", id] as const,
};
