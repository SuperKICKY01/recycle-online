/**
 * THE THEME, WIRED TO THE DEVICE.
 *
 * The palette and the resolution rule are pure and proven in `src/ui/theme.ts`;
 * this file is the React Native glue that pure module cannot contain — it reads
 * the OS light/dark setting (`useColorScheme`) and the operator's stored choice
 * (SecureStore), and hands the resolved tokens to the tree through one context.
 * It lives in `app/` because it imports react-native and expo, which the node
 * program forbids (`src/ui/theme.ts`'s header).
 *
 * WHAT IS STORED, AND WHERE. One string — `light` | `dark` | `system` — under
 * the SecureStore key `THEME_PREF_KEY`, on the device only. Never the server: a
 * theme is a per-device preference, not a shop setting, so it does not belong in
 * `/shop`. SecureStore is the one per-device value store the app already uses
 * (the session token), and its author left room for exactly this second key.
 *
 * `system` is the default until a choice is stored, and it follows the OS —
 * which requires `app.json`'s `userInterfaceStyle` to be `automatic`, not the
 * `light` it was before this pass. That is a device-visible change no headless
 * proof can see; the owner's handset pass reads it (a dark-set phone opens dark
 * with no choice made).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

import {
  resolveTheme,
  THEME_PREF_KEY,
  THEME_PREFS,
  type SystemScheme,
  type ThemePref,
  type ThemeTokens,
} from "../src/ui/theme";

// Re-exported so a screen has one import for the hook and the token type it
// annotates `makeStyles(t: ThemeTokens)` with.
export type { ThemePref, ThemeTokens } from "../src/ui/theme";

interface ThemeContextValue {
  readonly tokens: ThemeTokens;
  readonly pref: ThemePref;
  readonly setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePref(value: string | null): value is ThemePref {
  return value !== null && (THEME_PREFS as readonly string[]).includes(value);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // `useColorScheme` returns the OS scheme (or null/undefined before it is known
  // or on a platform that does not report one). Its type on this react-native
  // resolution path is structurally `SystemScheme`.
  const system = useColorScheme() as SystemScheme;
  const [pref, setPrefState] = useState<ThemePref>("system");

  // Load the stored choice once. SecureStore is async; until it resolves, the
  // default `system` is on screen, which is the right thing to show anyway.
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(THEME_PREF_KEY)
      .then((stored) => {
        if (alive && isThemePref(stored)) setPrefState(stored);
      })
      .catch(() => {
        // A read failure leaves the default in place — never fatal for a theme.
      });
    return () => {
      alive = false;
    };
  }, []);

  const setPref = useMemo(
    () => (next: ThemePref) => {
      setPrefState(next);
      // Fire and forget: the on-screen theme changes immediately; persistence is
      // best-effort and its failure must not block the UI.
      SecureStore.setItemAsync(THEME_PREF_KEY, next).catch(() => {
        // ignored — the choice still applies for this session.
      });
    },
    [],
  );

  const tokens = useMemo(() => resolveTheme(pref, system), [pref, system]);
  const value = useMemo<ThemeContextValue>(() => ({ tokens, pref, setPref }), [tokens, pref, setPref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The tokens for the active scheme. The one hook every screen calls. */
export function useTheme(): ThemeTokens {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useTheme() outside a <ThemeProvider>");
  return ctx.tokens;
}

/** The stored preference and its setter — for the settings control only. */
export function useThemeControl(): { pref: ThemePref; setPref: (pref: ThemePref) => void } {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useThemeControl() outside a <ThemeProvider>");
  return { pref: ctx.pref, setPref: ctx.setPref };
}
