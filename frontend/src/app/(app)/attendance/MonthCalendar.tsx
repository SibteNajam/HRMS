'use client';

import { cn } from '@/lib/cn';
import { ATTENDANCE_STATUS, hoursLabel, timeLabel } from '@/lib/attendanceStyles';
import type { MonthData } from '@/store/api/endpoints/attendanceApi';

/**
 * Status as a filled dot under the date, not as a cell background.
 *
 * A grid of coloured blocks is loud and the dates stop being readable —
 * which defeats the point of a calendar.
 */
export function MonthCalendar({ data }: { data: MonthData }) {
  const first = new Date(Date.UTC(data.year, data.month - 1, 1));
  // Monday-first: JS getUTCDay() is Sunday-first.
  const lead = (first.getUTCDay() + 6) % 7;

  const byDay = new Map(
    data.records.map((r) => [new Date(r.date).getUTCDate(), r]),
  );
  const holidayByDay = new Map(
    data.holidays.map((h) => [Number(h.date.slice(8, 10)), h.name]),
  );

  const today = new Date();
  const isThisMonth =
    today.getFullYear() === data.year && today.getMonth() + 1 === data.month;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="pb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-content-tertiary">
            {d}
          </div>
        ))}

        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}

        {Array.from({ length: data.daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(Date.UTC(data.year, data.month - 1, day));
          const weekend = data.weekendDays.includes(date.getUTCDay());
          const record = byDay.get(day);
          const holiday = holidayByDay.get(day);
          const isToday = isThisMonth && today.getDate() === day;

          const status = record?.status ?? (holiday ? 'HOLIDAY' : null);
          const meta = status ? ATTENDANCE_STATUS[status] : null;

          const tooltip = holiday
            ? holiday
            : record
              ? `${ATTENDANCE_STATUS[record.status].label}` +
                (record.checkIn
                  ? ` · ${timeLabel(record.checkIn)}–${timeLabel(record.checkOut)} · ${hoursLabel(record.minutesWorked)}`
                  : '')
              : undefined;

          return (
            <div
              key={day}
              title={tooltip}
              className={cn(
                'group relative flex aspect-square flex-col items-center justify-center rounded-lg border transition-colors',
                weekend
                  ? 'border-transparent bg-surface-sunken'
                  : 'border-line-subtle bg-surface-raised hover:border-line-default',
                isToday && 'ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-surface-raised',
              )}
            >
              <span
                className={cn(
                  'tabular text-body-sm font-medium',
                  weekend ? 'text-content-tertiary' : 'text-content-primary',
                )}
              >
                {day}
              </span>
              {meta ? (
                <span className={cn('mt-1 h-1.5 w-1.5 rounded-full', meta.dot)} />
              ) : (
                <span className="mt-1 h-1.5 w-1.5" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line-subtle pt-3">
        {(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', ATTENDANCE_STATUS[s].dot)} />
            <span className="text-caption text-content-secondary">
              {ATTENDANCE_STATUS[s].label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
