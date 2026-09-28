'use client';

import { ArrowRight, PenLine, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { CardListSkeleton } from '@/components/ui/loading';
import { formatDate, formatRelative } from '@/lib/format';
import { ATTENDANCE_STATUS, timeLabel } from '@/lib/attendanceStyles';
import type { AttendanceStatus } from '@/types';
import { useGetCorrectionsQuery } from '@/store/api/endpoints/attendanceApi';

export default function CorrectionsPage() {
  const { data, isLoading } = useGetCorrectionsQuery({ limit: 50 });

  return (
    <>
      <PageHeader
        title="Attendance corrections"
        subtitle="Every manual change to an attendance record, and who made it."
      />

      {isLoading ? (
        <CardListSkeleton count={4} />
      ) : !data?.length ? (
        <div className="rounded-xl border border-line-subtle bg-surface-raised p-16 text-center shadow-sm">
          <ScrollText size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
          <h3 className="mt-4 font-display text-h3 text-content-primary">No corrections yet</h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-body-sm text-content-secondary">
            When HR edits an attendance record, the change is recorded here
            with the reason given — attendance feeds payroll, so every manual
            change stays accountable.
          </p>
        </div>
      ) : (
        <div className="stagger flex flex-col gap-3">
          {data.map((log) => {
            const actor = log.actor?.employee
              ? `${log.actor.employee.firstName} ${log.actor.employee.lastName}`
              : log.actor?.email ?? 'Unknown';
            const subject = log.record
              ? `${log.record.employee.firstName} ${log.record.employee.lastName}`
              : 'Deleted record';
            const m = log.metadata ?? {};
            const before = m.before;
            const after = m.after;

            return (
              <article key={log.id} className="rounded-xl border border-line-subtle bg-surface-raised p-4 shadow-sm">
                <header className="flex items-start gap-3">
                  <Avatar name={actor} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-content-primary">
                      <span className="font-semibold">{actor}</span>
                      {log.action === 'ATTENDANCE_SET' ? ' set ' : ' corrected '}
                      <span className="font-semibold">{subject}</span>
                      {log.record && (
                        <span className="text-content-secondary">
                          {' '}· {formatDate(log.record.date)}
                        </span>
                      )}
                    </p>
                    <p className="text-caption text-content-tertiary">
                      {formatRelative(log.createdAt)}
                    </p>
                  </div>
                  <Badge tone="neutral" icon={PenLine} small>
                    {log.action === 'ATTENDANCE_SET' ? 'Created' : 'Corrected'}
                  </Badge>
                </header>

                {before && after && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface-sunken px-3.5 py-2.5">
                    <Change before={before} after={after} />
                  </div>
                )}

                {m.reason && (
                  <p className="mt-2.5 text-body-sm italic text-content-secondary">
                    “{m.reason}”
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Change({
  before, after,
}: {
  before: { checkIn: string | null; checkOut: string | null; status: string };
  after: { checkIn: string | null; checkOut: string | null; status: string };
}) {
  const bMeta = ATTENDANCE_STATUS[before.status as AttendanceStatus];
  const aMeta = ATTENDANCE_STATUS[after.status as AttendanceStatus];
  const statusChanged = before.status !== after.status;
  const timesChanged =
    before.checkIn !== after.checkIn || before.checkOut !== after.checkOut;

  return (
    <>
      {statusChanged && (
        <span className="flex items-center gap-2">
          <Badge tone={bMeta?.tone ?? 'neutral'} small>{bMeta?.label ?? before.status}</Badge>
          <ArrowRight size={13} className="text-content-tertiary" aria-hidden />
          <Badge tone={aMeta?.tone ?? 'neutral'} small>{aMeta?.label ?? after.status}</Badge>
        </span>
      )}
      {timesChanged && (
        <span className="tabular flex items-center gap-2 text-body-sm">
          <span className="text-content-tertiary line-through">
            {timeLabel(before.checkIn)}–{timeLabel(before.checkOut)}
          </span>
          <ArrowRight size={13} className="text-content-tertiary" aria-hidden />
          <span className="font-medium text-content-primary">
            {timeLabel(after.checkIn)}–{timeLabel(after.checkOut)}
          </span>
        </span>
      )}
    </>
  );
}
