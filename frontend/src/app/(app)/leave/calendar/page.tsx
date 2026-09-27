'use client';

import { useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useGetLeaveCalendarQuery } from '@/store/api/endpoints/leaveApi';

/** One colour per leave type, assigned by id so it never shifts. */
const TYPE_COLOR = [
  'bg-[var(--color-primary)]',
  'bg-info',
  'bg-warning',
  'bg-success',
  'bg-danger',
];

export default function LeaveCalendarPage() {
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const { data, isLoading } = useGetLeaveCalendarQuery(cursor);

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric',
  }).format(new Date(cursor.year, cursor.month - 1, 1));

  const days = data?.daysInMonth ?? 30;
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === cursor.year && today.getMonth() + 1 === cursor.month;

  function shift(by: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  return (
    <>
      <PageHeader
        title="Leave calendar"
        subtitle="Approved leave across the organisation. Reasons are not shown."
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <span className="min-w-[150px] text-center text-body font-semibold text-content-primary">
              {monthLabel}
            </span>
            <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={6} columns={3} />
        ) : !data?.rows.length ? (
          <div className="p-16 text-center">
            <CalendarRange size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">
              Nobody is off in {monthLabel}
            </h3>
            <p className="mt-1.5 text-body-sm text-content-secondary">
              Approved leave appears here as a bar across the days it covers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              {/* Day ruler */}
              <div className="flex border-b border-line-subtle bg-surface-sunken">
                <div className="w-[220px] shrink-0 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                  Employee
                </div>
                <div className="flex flex-1">
                  {Array.from({ length: days }).map((_, i) => {
                    const d = new Date(Date.UTC(cursor.year, cursor.month - 1, i + 1));
                    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                    const isToday = isThisMonth && today.getDate() === i + 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 py-2.5 text-center text-[10px] font-medium',
                          weekend ? 'bg-surface-sunken text-content-tertiary' : 'text-content-secondary',
                          isToday && 'bg-surface-selected font-bold text-content-selected',
                        )}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* One row per person, bars positioned by day */}
              <div className="stagger">
                {data.rows.map((row) => {
                  const name = `${row.employee.firstName} ${row.employee.lastName}`;
                  return (
                    <div key={row.employee.id} className="flex border-b border-line-subtle last:border-0">
                      <div className="flex w-[220px] shrink-0 items-center gap-2.5 px-4 py-2.5">
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-body-sm font-medium text-content-primary">{name}</p>
                          <p className="truncate text-caption text-content-tertiary">
                            {row.employee.department.name}
                          </p>
                        </div>
                      </div>

                      <div className="relative flex flex-1 items-center py-2.5">
                        {/* Weekend shading underneath the bars */}
                        {Array.from({ length: days }).map((_, i) => {
                          const d = new Date(Date.UTC(cursor.year, cursor.month - 1, i + 1));
                          const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                          return (
                            <div
                              key={i}
                              className={cn('h-full flex-1', weekend && 'bg-surface-sunken')}
                            />
                          );
                        })}

                        {row.spans.map((span) => {
                          const s = new Date(span.startDate);
                          const e = new Date(span.endDate);
                          const from = Math.max(1, s.getUTCMonth() + 1 === cursor.month ? s.getUTCDate() : 1);
                          const to = Math.min(days, e.getUTCMonth() + 1 === cursor.month ? e.getUTCDate() : days);
                          const left = ((from - 1) / days) * 100;
                          const width = ((to - from + 1) / days) * 100;
                          return (
                            <div
                              key={span.id}
                              title={`${span.leaveType.name} · ${span.days} day${span.days === 1 ? '' : 's'}`}
                              className={cn(
                                'absolute flex h-6 items-center justify-center rounded-full px-2',
                                TYPE_COLOR[span.leaveType.id % TYPE_COLOR.length],
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              <span className="truncate text-[10px] font-semibold text-white">
                                {span.leaveType.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
