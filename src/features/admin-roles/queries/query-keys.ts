export const adminRolesKeys = {
  all: ["admin-roles"] as const,
  catalog: () => [...adminRolesKeys.all, "catalog"] as const,
  userRoles: (userId: string) => [...adminRolesKeys.all, "user", userId] as const,
};
