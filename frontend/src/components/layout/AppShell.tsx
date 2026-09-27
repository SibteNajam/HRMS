'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useGetMeQuery } from '@/store/api/endpoints/authApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setSession } from '@/store/slices/authSlice';
import { LogoMark } from '@/components/brand/Logo';

/**
 * The session cookie is httpOnly, so the client cannot read it. The only way
 * to know whether we are signed in is to ask the server — /auth/me either
 * returns the user or 401s, and the base query redirects on a 401.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { data: me, isLoading, isError } = useGetMeQuery();

  useEffect(() => {
    if (!me) return;
    dispatch(
      setSession({
        sub: me.id,
        employeeId: me.employee?.id ?? null,
        email: me.email,
        role: me.role,
        name: me.employee
          ? `${me.employee.firstName} ${me.employee.lastName}`
          : 'Administrator',
      }),
    );
  }, [me, dispatch]);

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page">
        <LogoMark className="h-10 w-10 animate-pulse text-[var(--color-primary)]" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* Only this scrolls — navigation must never scroll out of reach. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-6 pb-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
