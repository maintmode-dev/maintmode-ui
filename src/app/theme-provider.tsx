"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Lightweight theme provider — replaces `next-themes` (whose client-rendered
 * `<script>` trips React 19's "script tag while rendering" error). Toggle state
 * lives in React Context + localStorage; the anti-flash script that sets
 * `data-theme` before paint is rendered by the SERVER root layout (per the
 * Next.js "preventing flash before hydration" guide), not here.
 */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Inline anti-flash script — applies the stored (or default) theme to
 * `document.documentElement[data-theme]` before first paint. Mirrors the
 * storage key + default below.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:"${DEFAULT_THEME}")}catch(e){}})()`;

/**
 * Renders the anti-flash script in the server layout's `<head>`. `type` is
 * `text/javascript` on the server (so it runs during HTML parse, before paint)
 * and `text/plain` on the client — that's the documented way to keep React 19
 * from flagging a `<script>` rendered in a component as un-executable. Paired
 * with `suppressHydrationWarning` so the type swap doesn't warn.
 */
export function ThemeInitScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The DOM already has the right data-theme (set by the head script before
  // hydration). Seed state from it via a lazy initializer so React matches the
  // painted theme with no flash and no post-mount setState. On the server the
  // initializer returns the default, which is what the head script also writes.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === "undefined") return DEFAULT_THEME;
    const current = document.documentElement.getAttribute("data-theme");
    return current === "light" || current === "dark" ? current : DEFAULT_THEME;
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode) — theme still applies
      // for this session via the data-theme attribute.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
