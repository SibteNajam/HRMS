'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/**
 * next-themes injects a blocking script that sets the theme class before the
 * first paint, so a dark-mode user never sees a white flash.
 *
 * disableTransitionOnChange is deliberate: transitioning every colour on the
 * page produces a visible smear across the whole UI.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="cadre-theme"
    >
      {children}
    </NextThemes>
  );
}
