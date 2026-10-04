import Link from 'next/link';
import { ArrowRight, Briefcase, MapPin } from 'lucide-react';
import { COMPANY } from '@/lib/company';
import { API, EMPLOYMENT_LABEL, MODE_LABEL, type OpenRole } from './types';

export const metadata = { title: 'Careers' };
// Postings open and close; a page cached at build time would advertise a
// role that was filled last week.
export const dynamic = 'force-dynamic';

async function openRoles(): Promise<OpenRole[]> {
  try {
    const res = await fetch(`${API}/careers`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    // The careers page is public. A backend that is down should show an
    // empty board, not a stack trace to a stranger.
    return [];
  }
}

export default async function CareersPage() {
  const roles = await openRoles();

  return (
    <main className="mx-auto min-h-screen max-w-[760px] px-5 py-16">
      <header>
        <p className="text-body-sm font-semibold uppercase tracking-[0.1em] text-[var(--color-primary)]">
          {COMPANY.name}
        </p>
        <h1 className="mt-2 font-display text-display-sm text-content-primary">
          Open roles
        </h1>
        <p className="mt-3 max-w-[58ch] text-body text-content-secondary">
          Every application is read and answered. If we want to take yours
          further, you will get a link to pick your own interview time — no
          back-and-forth about calendars.
        </p>
      </header>

      {roles.length === 0 ? (
        <div className="mt-12 rounded-xl border border-line-subtle bg-surface-raised p-14 text-center">
          <Briefcase size={40} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h2 className="mt-4 font-display text-h2 text-content-primary">
            Nothing open right now
          </h2>
          <p className="mx-auto mt-2 max-w-[44ch] text-body-sm text-content-secondary">
            We are not hiring at the moment. Do check back — roles go up here
            first.
          </p>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-3">
          {roles.map((role) => (
            <li key={role.code}>
              <Link
                href={`/careers/${role.code}`}
                className="group flex items-start gap-4 rounded-xl border border-line-default bg-surface-raised p-5 transition-colors hover:border-[var(--color-primary)] hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-h2 text-content-primary">
                    {role.title}
                  </h2>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-content-secondary">
                    {role.location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} aria-hidden />{role.location}
                      </span>
                    )}
                    <span>{MODE_LABEL[role.workMode]}</span>
                    <span>{EMPLOYMENT_LABEL[role.employmentType]}</span>
                    {role.department && <span>{role.department}</span>}
                  </p>

                  {role.intro && (
                    <p className="mt-2.5 line-clamp-2 max-w-[62ch] text-body text-content-secondary">
                      {role.intro}
                    </p>
                  )}

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {role.skills.slice(0, 6).map((s) => (
                      <li
                        key={s}
                        className="rounded-md bg-surface-sunken px-2 py-1 text-caption text-content-secondary"
                      >
                        {s}
                      </li>
                    ))}
                    {role.skills.length > 6 && (
                      <li className="px-1 py-1 text-caption text-content-tertiary">
                        +{role.skills.length - 6}
                      </li>
                    )}
                  </ul>
                </div>

                <ArrowRight
                  size={18}
                  className="mt-1 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-14 border-t border-line-subtle pt-6 text-caption text-content-tertiary">
        © {new Date().getFullYear()} {COMPANY.name}
      </footer>
    </main>
  );
}
