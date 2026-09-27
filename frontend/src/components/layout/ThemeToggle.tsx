'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';

const ORDER = ['light', 'dark', 'system'] as const;

const META = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
} as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know the user's theme, so render a placeholder until
  // mount or React reports a hydration mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  const current = (theme ?? 'system') as keyof typeof META;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Glyph = META[resolvedTheme === 'dark' ? 'dark' : 'light'].icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${META[next].label.toLowerCase()} theme`}
      title={`Theme: ${META[current].label} — click for ${META[next].label}`}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md',
        'text-content-secondary transition-colors duration-100',
        'hover:bg-surface-sunken hover:text-content-primary',
      )}
    >
      <Icon icon={Glyph} size="md" />
    </button>
  );
}
