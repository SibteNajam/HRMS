'use client';

import { CircleAlert, FolderKanban, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { CardListSkeleton } from '@/components/ui/loading';
import { useGetProjectsQuery } from '@/store/api/endpoints/projectsApi';
import type { Project, ProjectTeam } from '@/types';
import { MinimumStaffControl } from './MinimumStaffControl';

const STATUS = {
  ACTIVE: { tone: 'success', label: 'Active' },
  ON_HOLD: { tone: 'warning', label: 'On hold' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
} as const;

/**
 * Where the staffing minimums live.
 *
 * This page is the reason leave can be approved without a person: the
 * minimum on each team is what the rules engine checks before letting a
 * request through. So the page shows the number next to what it is
 * protecting — the team, who is on it, and how many are off right now.
 */
export default function ProjectsPage() {
  const { data: projects, isLoading, isError } = useGetProjectsQuery(undefined, {
    // Leave approved elsewhere changes who is available today.
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });

  return (
    <>
      <PageHeader
        title="Projects & staffing"
        subtitle="How many people each team needs available. Leave is held for review when approving it would go below."
      />

      {isLoading ? (
        <CardListSkeleton count={2} />
      ) : isError ? (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-16 text-center">
          <p className="text-body text-danger">Could not load projects.</p>
        </div>
      ) : !projects?.length ? (
        <div className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <FolderKanban size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">No projects yet</h3>
          <p className="mx-auto mt-1.5 max-w-[400px] text-body-sm text-content-secondary">
            Until a project has teams with minimums, leave is judged on the
            person and their department alone.
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-5">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const status = STATUS[project.status];
  const atRisk = project.teams.filter((t) => t.headroomToday <= 0).length;

  return (
    <article className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-h2 text-content-primary">{project.name}</h2>
            <Badge tone={status.tone} small>{status.label}</Badge>
            <span className="tabular rounded-md bg-surface-sunken px-2 py-0.5 text-caption font-medium text-content-tertiary">
              {project.code}
            </span>
          </div>
          {project.description && (
            <p className="mt-1 max-w-[70ch] text-body-sm text-content-secondary">
              {project.description}
            </p>
          )}
        </div>

        {atRisk > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-2.5 py-1 text-caption font-medium text-warning">
            <TriangleAlert size={13} strokeWidth={2} aria-hidden />
            {atRisk} team{atRisk === 1 ? '' : 's'} at the limit today
          </span>
        )}
      </header>

      <div className="divide-y divide-line-subtle">
        {project.teams.map((t) => <TeamRow key={t.id} team={t} />)}
      </div>
    </article>
  );
}

function TeamRow({ team }: { team: ProjectTeam }) {
  // Below the minimum is a problem now; exactly on it means the next
  // request cannot go through on its own.
  const breached = team.headroomToday < 0;
  const atLimit = team.headroomToday === 0;

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-h3 text-content-primary">{team.name}</h3>
            {team.department && (
              <span className="text-body-sm text-content-tertiary">{team.department.name}</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-body-sm">
            <span className="flex items-center gap-1.5 text-content-secondary">
              <Users size={14} strokeWidth={2} aria-hidden />
              {team.size} member{team.size === 1 ? '' : 's'}
            </span>
            <span
              className={cn(
                'tabular font-medium',
                breached ? 'text-danger' : atLimit ? 'text-warning' : 'text-content-secondary',
              )}
            >
              {team.availableToday} available today
              {team.offToday > 0 && ` · ${team.offToday} off`}
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-content-tertiary">
            Minimum available
          </p>
          <MinimumStaffControl team={team} />
        </div>
      </div>

      {(breached || atLimit) && (
        <p
          className={cn(
            'mt-3 flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-caption',
            breached
              ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger'
              : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-warning',
          )}
        >
          {breached ? (
            <CircleAlert size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <ShieldCheck size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <span>
            {breached
              ? `Already ${Math.abs(team.headroomToday)} below the minimum today. Every leave request on this team is being held for review.`
              : 'Exactly on the minimum today. The next request across these dates will be held for review rather than approved automatically.'}
          </span>
        </p>
      )}

      {team.members.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {team.members.map((m) => (
            <li
              key={m.id}
              className={cn(
                'rounded-md px-2 py-1 text-caption',
                m.offToday
                  ? 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-warning line-through decoration-1'
                  : 'bg-surface-sunken text-content-secondary',
              )}
              title={m.offToday ? `${m.name} is on leave today` : m.name}
            >
              {m.name} <span className="opacity-70">· {m.roleOnTeam}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
