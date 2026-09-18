/**
 * Wire contract for the built-in sign-in method settings (RUK-297).
 *
 * Recorded against the backend branch `feature/ruk-297`; the shape is taken
 * from `internal/app/api/public/authsettings/models/auth_setting.go`.
 *
 * Three fields, and no more: there is no `display_name` (labels are a frontend
 * concern — see `src/domain/auth/auth-method-settings.ts`), no
 * `updated_by_user_id` (the audit trail answers "who", and resolving it here
 * would pull a user lookup into an endpoint that reads one table), and no
 * `can_enable` / `blocked_reason` (the only refusal is the last-method guard,
 * and it can only be known by asking).
 */
export interface AuthMethodSettingDto {
  /**
   * DELIBERATELY `string`, not `AuthMethodName`.
   *
   * Narrowing it to the closed set would make "render a method this build does
   * not know" (SPEC §3.1) unrepresentable — and would do so silently, because
   * the recorded fixture only ever holds known methods, so every test stays
   * green while the screen quietly loses the ability to show a live sign-in
   * path it has not heard of.
   */
  method: string;
  enabled: boolean;
  /**
   * Carried, not rendered. It is part of the wire contract and the contract
   * test asserts it, so dropping it here would leave the test demanding a field
   * the code discards. Showing "last changed at" without "by whom" would raise
   * the question the audit trail answers properly.
   */
  updated_at: string;
}

/**
 * An object rather than a bare array, mirroring the backend: a top-level array
 * cannot grow a sibling field later without breaking every client.
 */
export interface AuthMethodSettingsResponseDto {
  methods: AuthMethodSettingDto[];
}
