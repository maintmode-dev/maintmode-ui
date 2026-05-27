import type { Role } from "@/domain/auth/permissions";

export type UserStatus = "active" | "blocked" | "pending";

export type SignInProvider = "google" | "github" | "microsoft" | "okta";

export interface User {
  id: string;
  email: string;
  display_name: string;
  roles: Role[];
  status: UserStatus;
  connected_providers: SignInProvider[];
  is_last_admin?: boolean;
  created_at: string;
  last_active_at?: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  email: string;
  roles: Role[];
  status: InvitationStatus;
  suggested_provider?: SignInProvider;
  invited_by: string;
  invited_at: string;
  expires_at: string;
}
