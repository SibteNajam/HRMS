'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { openNavGroup, toggleNavGroup } from '@/store/slices/uiSlice';
import { navForRole, type NavItem } from './navigation';
import { UserCard } from './UserCard';
import type { Role } from '@/types';

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { sidebarCollapsed, expandedNavGroups } = useAppSelector((s) => s.ui);
  const groups = navForRole(role);

  // The group containing the current route opens on load.
  useEffect(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.children?.some((c) => c.path === pathname)) {
          dispatch(openNavGroup(item.label));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <aside
      className={cn(
        'm-3 mr-0 flex shrink-0 flex-col rounded-2xl bg-surface-raised shadow-sm',
        'border border-line-subtle transition-[width] duration-200 ease-out',
        sidebarCollapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className={cn('flex h-16 items-center px-4', sidebarCollapsed && 'justify-center px-0')}>
        {sidebarCollapsed
          ? <LogoMark className="h-8 w-8 text-[var(--color-primary)]" />
          : <Logo />}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi}>
            {gi > 0 && <div className="my-4 border-t border-line-subtle" />}
            {group.label && !sidebarCollapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-tertiary">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <NavRow
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  collapsed={sidebarCollapsed}
                  expanded={expandedNavGroups.includes(item.label)}
                  onToggle={() => dispatch(toggleNavGroup(item.label))}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line-subtle p-3">
        <UserCard collapsed={sidebarCollapsed} />
      </div>
    </aside>
  );
}

function NavRow({
  item, pathname, collapsed, expanded, onToggle,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isActive = item.path === pathname;
  const hasActiveChild = item.children?.some((c) => c.path === pathname) ?? false;

  const base =
    'group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-body font-medium ' +
    'transition-colors duration-100 ease-out';

  // Semantic tokens only. hover:text-ink-800 was #1E293B — dark navy — with
  // no dark: override, so hovering in dark mode painted the label dark on
  // dark and it vanished.
  const idle =
    'text-content-secondary hover:bg-surface-hover hover:text-content-primary';

  const active =
    'bg-[var(--color-primary-solid)] text-white shadow-brand';

  const parentOpen = 'bg-surface-selected text-content-selected';

  // Leaf item — navigates.
  if (item.path) {
    return (
      <li>
        <Link
          href={item.path}
          title={collapsed ? item.label : undefined}
          className={cn(base, isActive ? active : idle, collapsed && 'justify-center px-0')}
        >
          <Icon
            icon={item.icon}
            size="md"
            strokeWidth={isActive ? 2 : 1.75}
            className={cn(
              isActive
                ? 'text-white'
                : 'text-nav-icon group-hover:text-[var(--color-primary)]',
            )}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </li>
    );
  }

  // Parent — expands, never navigates.
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title={collapsed ? item.label : undefined}
        className={cn(
          base,
          hasActiveChild && !expanded ? parentOpen : idle,
          collapsed && 'justify-center px-0',
        )}
      >
        <Icon
          icon={item.icon}
          size="md"
          className={cn(
            hasActiveChild
              ? 'text-[var(--color-primary)]'
              : 'text-nav-icon group-hover:text-[var(--color-primary)]',
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{item.label}</span>
            <ChevronDown
              size={16}
              className={cn(
                'shrink-0 text-content-tertiary transition-transform duration-200 ease-out',
                expanded && 'rotate-180',
              )}
            />
          </>
        )}
      </button>

      {!collapsed && (
        <div
          className={cn(
            'grid transition-all duration-200 ease-out',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <ul className="relative ml-[26px] overflow-hidden border-l border-line-subtle">
            {item.children?.map((child) => {
              const childActive = child.path === pathname;
              return (
                <li key={child.path}>
                  <Link
                    href={child.path}
                    className={cn(
                      'flex h-[38px] items-center gap-2.5 rounded-md pl-[18px] pr-3',
                      'text-body-sm transition-colors duration-100 ease-out',
                      childActive
                        ? 'bg-surface-selected font-semibold text-content-selected'
                        : 'text-content-secondary hover:bg-surface-sunken hover:text-content-primary',
                    )}
                  >
                    {/* Children carry no icons — at 13px they are noise. */}
                    <span
                      className={cn(
                        'h-1 w-1 shrink-0 rounded-full',
                        childActive ? 'bg-[var(--color-primary)]' : 'bg-line-default',
                      )}
                    />
                    <span className="truncate">{child.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
