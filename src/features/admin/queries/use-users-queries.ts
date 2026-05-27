"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_INVITATIONS, MOCK_USERS } from "@/shared/mock/users";
import type { Invitation, User } from "@/domain/admin/user";

export function usersKey() {
  return ["users"] as const;
}
export function invitationsKey() {
  return ["invitations"] as const;
}

export function useUsersQuery() {
  return useQuery({
    queryKey: usersKey(),
    queryFn: async (): Promise<User[]> => {
      if (DATA_SOURCE.users === "mock") {
        return MOCK_USERS;
      }
      const data = await bffFetch<{ users: User[] }>("/api/admin/users");
      return data.users;
    },
  });
}

export function useInvitationsQuery() {
  return useQuery({
    queryKey: invitationsKey(),
    queryFn: async (): Promise<Invitation[]> => {
      if (DATA_SOURCE.invitations === "mock") {
        return MOCK_INVITATIONS;
      }
      const data = await bffFetch<{ invitations: Invitation[] }>("/api/admin/invitations");
      return data.invitations;
    },
  });
}
