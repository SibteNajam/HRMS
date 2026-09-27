import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-brand-600 p-12 lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="h-9 w-9 text-white" />
          <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-white">
            Cadre
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-white">
            Start with your own record.
          </h1>
          <p className="mt-4 text-body-lg leading-relaxed text-[#E7F0FE]">
            Creating an account gives you an employee profile, leave balances
            for the rest of the year, and a place to mark attendance.
          </p>
        </div>

        <p className="relative text-body-sm text-[#E7F0FF]">© {new Date().getFullYear()} Cadre</p>
      </aside>

      <main className="flex flex-1 flex-col bg-surface-page">
        <div className="flex justify-end p-6">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-6 pb-16 pt-4">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 lg:hidden">
              <LogoMark className="h-10 w-10 text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display text-h1 text-content-primary">Create account</h2>
            <p className="mt-1.5 text-body text-content-secondary">
              You will be set up as an employee. An administrator can change
              your role later.
            </p>
            <div className="mt-8">
              <SignupForm />
            </div>
            <p className="mt-6 text-center text-body-sm text-content-secondary">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
