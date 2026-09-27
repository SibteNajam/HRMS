'use client';

import { useState } from 'react';
import { ArrowRight, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useGetLeaveCalendarQuery } from '@/store/api/endpoints/leaveApi';
import { useAppSelector } from '@/store/hooks';

/**
 * One colour per leave type, keyed by id so a type keeps its colour between
 * renders and between months.
 */
const TYPE_COLOR = [
  { bar: 'bg-[var(--color-primary)]', dot: 'bg-[var(--color-primary)]' },
  { bar: 'bg-info',    dot: 'bg-info' },
  { bar: 'bg-success', dot: 'bg-success' },
  { bar: 'bg-warning', dot: 'bg-warning' },
  { bar: 'bg-danger',  dot: 'bg-danger' },
];
const colourFor = (id: number) => TYPE_COLOR[id % TYPE_COLOR.length];

const NAME_COL = 220;

export default function LeaveCalendarPage() {
  const now = new Date();
  const me = useAppSelector((s) => s.auth.user);
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const { data, isLoading } = useGetLeaveCalendarQuery(cursor);

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric',
  }).format(new Date(cursor.year, cursor.month - 1, 1));

  const days = data?.daysInMonth ?? 30;
  const isThisMonth =
    now.getFullYear() === cursor.year && now.getMonth() + 1 === cursor.month;
  const todayDay = isThisMonth ? now.getDate() : null;

  // Both the ruler and the bars use this template, so they cannot drift.
  const track = { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` };

  const dayMeta = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month - 1, i + 1));
    const dow = d.getUTCDay();
    return {
      day: i + 1,
      weekend: dow === 0 || dow === 6,
      letter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow],
      isToday: todayDay === i + 1,
    };
  });

  const typesInView = [
    ...new Map(
      (data?.rows ?? [])
        .flatMap((r) => r.spans.map((s) => s.leaveType))
        .map((t) => [t.id, t]),
    ).values(),
  ];

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
            {!isThisMonth && (
              <Button
                size="sm"
                variant="secondary"
                className="ml-1"
                onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 })}
              >
                Today
              </Button>
            )}
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={5} columns={3} />
        ) : !data?.rows.length ? (
          <EmptyMonth
            monthLabel={monthLabel}
            months={data?.monthsWithLeave ?? []}
            onJump={setCursor}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                {/* ── Ruler ─────────────────────────────────────────── */}
                <div className="flex border-b border-line-subtle bg-surface-sunken">
                  <div
                    className="shrink-0 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary"
                    style={{ width: NAME_COL }}
                  >
                    Employee
                  </div>
                  <div className="grid flex-1" style={track}>
                    {dayMeta.map((d) => (
                      <div
                        key={d.day}
                        className={cn(
                          'flex flex-col items-center justify-center py-1.5',
                          d.weekend && 'bg-surface-hover',
                          d.isToday && 'bg-[var(--color-primary)]',
                        )}
                      >
                        <span
                          className={cn(
                            'text-[9px] leading-none',
                            d.isToday
                              ? 'text-white/80'
                              : d.weekend
                                ? 'text-content-tertiary'
                                : 'text-content-tertiary',
                          )}
                        >
                          {d.letter}
                        </span>
                        <span
                          className={cn(
                            'tabular mt-0.5 text-[11px] font-semibold leading-none',
                            d.isToday
                              ? 'text-white'
                              : d.weekend
                                ? 'text-content-tertiary'
                                : 'text-content-secondary',
                          )}
                        >
                          {d.day}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Rows ──────────────────────────────────────────── */}
                <div className="stagger">
                  {data.rows.map((row) => {
                    const name = `${row.employee.firstName} ${row.employee.lastName}`;
                    const isMe = row.employee.id === me?.employeeId;

                    return (
                      <div
                        key={row.employee.id}
                        className={cn(
                          'flex min-h-[56px] border-b border-line-subtle last:border-0',
                          isMe && 'bg-surface-selected',
                        )}
                      >
                        <div
                          className="flex shrink-0 items-center gap-2.5 px-4"
                          style={{ width: NAME_COL }}
                        >
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-body-sm font-medium text-content-primary">
                              {name}
                              {isMe && (
                                <span className="ml-1.5 text-caption font-normal text-content-tertiary">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-caption text-content-tertiary">
                              {row.employee.department.name}
                            </p>
                          </div>
                        </div>

                        <div className="relative flex-1">
                          {/* Weekend columns — full height, same track as the ruler */}
                          <div className="absolute inset-0 grid" style={track} aria-hidden>
                            {dayMeta.map((d) => (
                              <div
                                key={d.day}
                                className={cn(
                                  'h-full border-r border-line-subtle/40 last:border-r-0',
                                  d.weekend && 'bg-surface-hover',
                                  d.isToday && 'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]',
                                )}
                              />
                            ))}
                          </div>

                          {/* Bars — grid-placed, so they land exactly on their days */}
                          <div className="relative grid h-full items-center py-2" style={track}>
                            {row.spans.map((span) => {
                              const s = new Date(span.startDate);
                              const e = new Date(span.endDate);
                              const from =
                                s.getUTCFullYear() === cursor.year &&
                                s.getUTCMonth() + 1 === cursor.month
                                  ? s.getUTCDate()
                                  : 1;
                              const to =
                                e.getUTCFullYear() === cursor.year &&
                                e.getUTCMonth() + 1 === cursor.month
                                  ? e.getUTCDate()
                                  : days;
                              const span_ = Math.max(1, to - from + 1);
                              const c = colourFor(span.leaveType.id);

                              return (
                                <div
                                  key={span.id}
                                  className="group relative flex h-7 items-center justify-center px-0.5"
                                  style={{ gridColumn: `${from} / span ${span_}` }}
                                >
                                  <div
                                    className={cn(
                                      'flex h-full w-full items-center justify-center rounded-md px-2 shadow-sm',
                                      c.bar,
                                    )}
                                  >
                                    <span className="truncate text-[11px] font-semibold text-white">
                                      {span.leaveType.name}
                                    </span>
                                  </div>

                                  {/* Styled tooltip — the native title attribute
                                      is an OS box we cannot theme. */}
                                  <div
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-subtle bg-surface-overlay px-2.5 py-1.5 shadow-lg group-hover:block"
                                  >
                                    <p className="text-caption font-semibold text-content-primary">
                                      {span.leaveType.name} · {span.days} day
                                      {span.days === 1 ? '' : 's'}
                                    </p>
                                    <p className="text-caption text-content-secondary">
                                      {new Intl.DateTimeFormat('en-GB', {
                                        day: 'numeric', month: 'short',
                                      }).format(s)}{' '}
                                      –{' '}
                                      {new Intl.DateTimeFormat('en-GB', {
                                        day: 'numeric', month: 'short',
                                      }).format(e)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Legend ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-subtle px-4 py-3">
              {typesInView.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5">
                  <span className={cn('h-2.5 w-2.5 rounded-full', colourFor(t.id).dot)} />
                  <span className="text-body-sm text-content-secondary">{t.name}</span>
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-surface-hover ring-1 ring-line-default" />
                <span className="text-body-sm text-content-tertiary">Weekend</span>
              </span>
              <span className="ml-auto text-caption text-content-tertiary">
                {data.rows.length} {data.rows.length === 1 ? 'person' : 'people'} off this month
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EmptyMonth({
  monthLabel, months, onJump,
}: {
  monthLabel: string;
  months: { year: number; month: number; count: number }[];
  onJump: (c: { year: number; month: number }) => void;
}) {
  return (
    <div className="p-16 text-center">
      <CalendarRange size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
      <h3 className="mt-4 font-display text-h3 text-content-primary">
        Nobody is off in {monthLabel}
      </h3>
      <p className="mt-1.5 text-body-sm text-content-secondary">
        Only approved leave appears here. Pending requests show up once they are decided.
      </p>

      {!!months.length && (
        <div className="mt-5">
          <p className="text-body-sm text-content-secondary">There is approved leave in:</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {months.map((m) => (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                onClick={() => onJump({ year: m.year, month: m.month })}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-default bg-surface-raised px-3 py-1.5 text-body-sm font-medium text-content-primary transition-colors hover:border-[var(--color-primary)] hover:text-content-selected"
              >
                {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
                  .format(new Date(m.year, m.month - 1, 1))}
                <span className="tabular text-content-tertiary">{m.count}</span>
                <ArrowRight size={13} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
