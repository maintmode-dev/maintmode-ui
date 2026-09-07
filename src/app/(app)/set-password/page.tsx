import { SetPasswordPage } from "@/features/settings/set-password-page";

/**
 * Deliberately NOT wrapped in `AppShell`: this is a single-purpose page reached
 * from the profile, and the app chrome around one form is noise. It sits under
 * `(app)` for the session and the provider tree, which the form's mutation
 * needs and which `(public)` does not mount.
 */
export default function Page() {
  return <SetPasswordPage />;
}
