'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearSession } from '@/store/slices/authSlice';
import { useLogoutMutation } from '@/store/api/endpoints/authApi';

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee',
  HR: 'HR Manager',
  ADMIN: 'Administrator',
};

export function UserCard({ collapsed }: { collapsed: boolean }) {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [logout, { isLoading }] = useLogoutMutation();

  if (!user) return null;

  async function signOut() {
    try {
      await logout().unwrap();
    } finally {
      // Clear locally regardless — if the request failed the cookie may still
      // be gone, and leaving stale state on screen is worse.
      dispatch(clearSession());
      router.replace('/login');
    }
  }

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Avatar name={user.name} size="md" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={user.name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-content-primary">
          {user.name}
        </p>
        <p className="truncate text-caption text-content-tertiary">
          {ROLE_LABEL[user.role] ?? user.role}
        </p>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={isLoading}
        aria-label="Sign out"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md',
          'text-content-tertiary transition-colors duration-100',
          'hover:bg-surface-sunken hover:text-danger disabled:opacity-50',
        )}
      >
        <Icon icon={LogOut} size="sm" />
      </button>
    </div>
  );
}
