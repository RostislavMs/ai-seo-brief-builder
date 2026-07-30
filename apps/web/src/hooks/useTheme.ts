import { useSyncExternalStore } from "react";
import {
  getSnapshot,
  setPreference,
  subscribe,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/theme";

interface UseThemeResult {
  /** Що вибрав користувач: конкретна тема або «як в системі». */
  preference: ThemePreference;
  /** Що показано насправді — потрібно для іконки стану, не для стилів. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

export function useTheme(): UseThemeResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [preference, resolved] = snapshot.split("|");

  return {
    preference: preference as ThemePreference,
    resolved: resolved as ResolvedTheme,
    setPreference,
  };
}
