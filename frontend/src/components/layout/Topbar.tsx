'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, PanelLeft, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { useAppDispatch } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/uiSlice';
import { breadcrumbFor } from './navigation';
import { ThemeToggle } from './ThemeToggle';

export function Topbar() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const trail = breadcrumbFor(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-6">
      <button
        type="button"
        onClick={() => dispatch(toggleSidebar())}
        aria-label="Toggle sidebar"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md',
          'text-content-secondary transition-colors duration-100',
          'hover:bg-surface-sunken hover:text-content-primary',
        )}
      >
        <Icon icon={PanelLeft} size="md" />
      </button>

      {/* Never shown on the dashboard — there is nothing to trace back to. */}
      {trail.length > 0 && pathname !== '/' && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
          {trail.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight size={14} className="text-line-default" aria-hidden />
              )}
              <span
                className={cn(
                  'text-body-sm',
                  i === trail.length - 1
                    ? 'font-semibold text-content-primary'
                    : 'text-content-secondary',
                )}
                aria-current={i === trail.length - 1 ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      <label className="relative hidden lg:block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search…"
          aria-label="Search"
          className={cn(
            'h-10 w-[320px] rounded-md border border-line-default bg-surface-raised',
            'pl-9 pr-16 text-body text-content-primary placeholder:text-content-tertiary',
            'transition-colors hover:border-line-strong',
            'focus:border-[var(--color-primary)] focus:outline-none',
          )}
        />
        <kbd
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2',
            'rounded border border-line-subtle bg-surface-sunken px-1.5 py-0.5',
            'text-[10px] font-medium text-content-tertiary',
          )}
        >
          ⌘K
        </kbd>
      </label>

      <ThemeToggle />

      <Link
        href="/notifications"
        aria-label="Notifications"
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-md',
          'text-content-secondary transition-colors duration-100',
          'hover:bg-surface-sunken hover:text-content-primary',
        )}
      >
        <Icon icon={Bell} size="md" />
      </Link>
    </header>
  );
}
