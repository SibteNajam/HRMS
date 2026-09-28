'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ATTENDANCE_STATUS, hoursLabel, timeLabel } from '@/lib/attendanceStyles';
import {
  useGetEmployeeMonthQuery, useGetMyMonthQuery,
} from '@/store/api/endpoints/attendanceApi';
import { useGetAdminUsersQuery } from '@/store/api/endpoints/adminApi';
import { useAppSelector } from '@/store/hooks';

export default function TimesheetPage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const isHr = me.role === 'HR' || me.role === 'ADMIN';
  const now = new Date();

  const [cursor, setCursor] = useState({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });
  const [employeeId, setEmployeeId] = useState<number | null>(null);

  // HR can look at anyone; an employee only ever sees their own.
  const { data: users } = useGetAdminUsersQuery({ limit: 100 }, { skip: !isHr });
  const mine = useGetMyMonthQuery(cursor, { skip: !!employeeId });
  const theirs = useGetEmployeeMonthQuery(
    { employeeId: employeeId ?? 0, ...cursor },
    { skip: !employeeId },
  );

  const { data, isLoading } = employeeId ? theirs : mine;

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric',
  }).format(new Date(cursor.year, cursor.month - 1, 1));

  function shift(by: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  function exportCsv() {
    if (!data) return;
    const header = 'Date,Status,Check in,Check out,Worked (min),Overtime (min)';
    const lines = data.records.map((r) =>
      [
        r.date.slice(0, 10), r.status,
        timeLabel(r.checkIn), timeLabel(r.checkOut),
        r.minutesWorked ?? '', r.overtimeMinutes,
      ].join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet-${cursor.year}-${String(cursor.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = data?.totals;

  return (
    <>
      <PageHeader
        title="Timesheet"
        subtitle="Hours worked day by day, with overtime."
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <span className="min-w-[140px] text-center text-body font-semibold text-content-primary">
              {monthLabel}
            </span>
            <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
            <Button variant="secondary" icon={Download} className="ml-2" onClick={exportCsv} disabled={!data?.records.length}>
              Export
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {isHr && (
          <div className="border-b border-line-subtle p-4">
            <div className="w-[300px]">
              <Select
                label="Employee"
                value={employeeId ?? ''}
                onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Me ({me.name})</option>
                {users?.data
                  .filter((u) => u.employee)
                  .map((u) => (
                    <option key={u.id} value={u.employee!.id}>
                      {u.employee!.firstName} {u.employee!.lastName} · {u.employee!.employeeCode}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
        )}

        {isLoading ? (
          <TableSkeleton rows={10} columns={6} avatar={false} />
        ) : !data?.records.length ? (
          <div className="p-16 text-center">
            <Clock size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">
              No records in {monthLabel}
            </h3>
            <p className="mt-1.5 text-body-sm text-content-secondary">
              Days appear here once attendance is marked.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-sunken">
                    {['Date', 'Status', 'In', 'Out', 'Worked', 'Overtime'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => {
                    const meta = ATTENDANCE_STATUS[r.status];
                    const d = new Date(r.date);
                    return (
                      <tr key={r.id} className="border-t border-line-subtle transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3">
                          <p className="text-body font-medium text-content-primary">
                            {new Intl.DateTimeFormat('en-GB', {
                              weekday: 'short', day: 'numeric', month: 'short',
                            }).format(d)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                        </td>
                        <td className="tabular px-4 py-3 text-body text-content-primary">{timeLabel(r.checkIn)}</td>
                        <td className="tabular px-4 py-3 text-body text-content-primary">{timeLabel(r.checkOut)}</td>
                        <td className="tabular px-4 py-3 text-body text-content-primary">{hoursLabel(r.minutesWorked)}</td>
                        <td className="tabular px-4 py-3 text-body">
                          {r.overtimeMinutes > 0 ? (
                            <span className="text-success">{hoursLabel(r.overtimeMinutes)}</span>
                          ) : (
                            <span className="text-content-tertiary">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {t && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-subtle bg-surface-sunken px-4 py-3">
                <Total label="Working days" value={String(t.workingDays)} />
                <Total label="Attendance" value={t.attendancePercentage === null ? '—' : `${t.attendancePercentage}%`} />
                <Total label="Total worked" value={hoursLabel(t.minutesWorked)} />
                <Total label="Overtime" value={hoursLabel(t.overtimeMinutes)} highlight />
                <Total label="Late" value={String(t.lateCount)} />
                <Total label="Absent" value={String(t.absentDays)} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Total({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-content-tertiary">{label}</p>
      <p className={cn('tabular font-display text-h3 font-bold', highlight ? 'text-success' : 'text-content-primary')}>
        {value}
      </p>
    </div>
  );
}
