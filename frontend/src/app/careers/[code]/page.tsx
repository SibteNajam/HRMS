import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, Clock, MapPin } from 'lucide-react';
import { COMPANY } from '@/lib/company';
import { API, EMPLOYMENT_LABEL, MODE_LABEL, type OpenRole } from '../types';
import { ApplyForm } from './ApplyForm';

export const dynamic = 'force-dynamic';

async function role(code: string): Promise<OpenRole | null> {
  try {
    const res = await fetch(`${API}/careers/${code}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const found = await role(code);
  return { title: found ? found.title : 'Careers' };
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const found = await role(code);
  if (!found) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-[760px] px-5 py-14">
      <Link
        href="/careers"
        className="inline-flex items-center gap-1.5 text-body-sm text-content-secondary transition-colors hover:text-content-primary"
      >
        <ArrowLeft size={15} /> All open roles
      </Link>

      <header className="mt-6">
        <p className="text-body-sm font-semibold uppercase tracking-[0.1em] text-[var(--color-primary)]">
          {COMPANY.name}
        </p>
        <h1 className="mt-2 font-display text-display-sm text-content-primary">
          {found.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-content-secondary">
          {found.location && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} aria-hidden />{found.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            {MODE_LABEL[found.workMode]} · {EMPLOYMENT_LABEL[found.employmentType]}
          </span>
          {found.salaryRange && (
            <span className="flex items-center gap-1.5">
              <Banknote size={14} aria-hidden />{found.salaryRange}
            </span>
          )}
        </div>
      </header>

      {found.intro && (
        <p className="mt-7 max-w-[62ch] text-body leading-relaxed text-content-primary">
          {found.intro}
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-h2 text-content-primary">
          What we are looking for
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {found.minYearsExperience > 0 && (
            <li className="flex items-start gap-2.5 text-body text-content-secondary">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary-solid)]" />
              {found.minYearsExperience}+ years of relevant experience
            </li>
          )}
          {found.skills.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-body text-content-secondary">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary-solid)]" />
              {s}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10">
        <ApplyForm code={found.code} title={found.title} />
      </div>

      <footer className="mt-12 border-t border-line-subtle pt-6 text-caption text-content-tertiary">
        © {new Date().getFullYear()} {COMPANY.name} · Reference {found.code}
      </footer>
    </main>
  );
}
