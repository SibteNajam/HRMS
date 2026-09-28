'use client';

import { useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, TrendingUp, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { StatRowSkeleton, Skeleton } from '@/components/ui/loading';
import { hoursLabel } from '@/lib/attendanceStyles';
import { useGetMyMonthQuery } from '@/store/api/endpoints/attendanceApi';
import { CheckInCard } from './CheckInCard';
import { MonthCalendar } from './MonthCalendar';

export default function MyAttendancePage() {
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });
  const { data, isLoading } = useGetMyMonthQuery(cursor);

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric',
  }).format(new Date(cursor.year, cursor.month - 1, 1));

  const isThisMonth =
    now.getFullYear() === cursor.year && now.getMonth() + 1 === cursor.month;

  function shift(by: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  const t = data?.totals;

  return (
    <>
      <PageHeader
        title="My attendance"
        subtitle="Check in and out, and see how the month is going."
      />

      <CheckInCard />

      <div className="mt-6">
        {isLoading || !t ? (
          <StatRowSkeleton count={4} />
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Attendance"
              value={t.attendancePercentage === null ? '—' : `${t.attendancePercentage}%`}
              icon={CalendarCheck}
            />
            <StatCard label="Present days" value={t.presentDays + t.lateCount} icon={CalendarCheck} />
            <StatCard label="Late arrivals" value={t.lateCount} icon={Clock} invertDelta />
            <StatCard label="Overtime" value={hoursLabel(t.overtimeMinutes)} icon={TrendingUp} />
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-h3 text-content-primary">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
            {!isThisMonth && (
              <Button
                size="sm" variant="secondary" className="ml-1"
                onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 })}
              >
                Today
              </Button>
            )}
          </div>
        </div>

        {isLoading || !data ? (
          <Skeleton className="h-[340px] rounded-lg" />
        ) : (
          <>
            <MonthCalendar data={data} />
            {t && t.absentDays > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3.5 py-2.5 text-body-sm text-danger">
                <X size={15} strokeWidth={2} aria-hidden />
                {t.absentDays} absence{t.absentDays === 1 ? '' : 's'} this month.
                If any of these are wrong, ask HR to correct the record.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
