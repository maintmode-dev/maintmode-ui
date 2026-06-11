import type { ComponentProps } from "react";

/**
 * Official OAuth-provider brand marks + the MaintMode product mark, as inline
 * SVG (no network fetch, sharp at any size). Path data is lifted verbatim from
 * the design snapshots' `icons.jsx` (login + user-settings) so the app and the
 * mockups share one source of truth. Provider marks keep their vendor colours —
 * no per-theme recolouring.
 *
 * Source: maintmode-docs/design-snapshots/{login,user-settings}/project/icons.jsx
 */

export type BrandProvider = "google" | "github" | "microsoft" | "okta";

interface BrandIconProps {
  name: BrandProvider;
  size?: number;
  className?: string;
}

export function BrandIcon({ name, size = 20, className }: BrandIconProps) {
  const wrap = { width: size, height: size, className, "aria-hidden": true as const };
  switch (name) {
    case "google":
      return (
        <svg {...wrap} viewBox="0 0 48 48">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
          />
        </svg>
      );
    case "github":
      return (
        <svg {...wrap} viewBox="0 0 24 24">
          <path
            fill="#181717"
            d="M12 .5C5.73.5.78 5.46.78 11.73c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.55 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15.9-.25 1.86-.37 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.27-5.14 5.55.4.34.76 1.02.76 2.06v3.05c0 .3.21.65.78.54 4.46-1.49 7.68-5.7 7.68-10.67C23.22 5.46 18.27.5 12 .5z"
          />
        </svg>
      );
    case "microsoft":
      return (
        <svg {...wrap} viewBox="0 0 24 24">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#7FBA00" d="M13 1h10v10H13z" />
          <path fill="#00A4EF" d="M1 13h10v10H1z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      );
    case "okta":
      return (
        <svg {...wrap} viewBox="0 0 24 24">
          <path
            fill="#007DC1"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
          />
        </svg>
      );
  }
}

/**
 * MaintMode product mark — geometric M monogram with a wrench-jaw notch at the
 * top centre (references "maintenance") and a completed-step tick at the base.
 * Renders in `currentColor` so callers tint it (e.g. via `--accent-fg`).
 */
export function MaintMark({ size = 24, className, ...props }: ComponentProps<"svg"> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M3 20V6" />
      <path d="M21 20V6" />
      <path d="M3 6l5 6" />
      <path d="M21 6l-5 6" />
      <path d="M8 12h2.5l1.5-2 1.5 2H16" />
      <path d="M9 17.5l2 2 4-4" />
    </svg>
  );
}
