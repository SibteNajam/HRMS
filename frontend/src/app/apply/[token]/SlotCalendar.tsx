'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Slot {
  id: number;
  startsAt: string;
  endsAt: string;
  taken: boolean;
}

/**
 * Pick a day, then a time.
 *
 * A fortnight of hourly interviews is fifty-odd slots, and as one list it
 * is a scroll that tells you nothing: you cannot see which days have room
 * without reading every row. A month grid answers "when could I come in?"
 * at a glance, and the times for one day fit on a screen.
 *
 * Everything renders in the viewer's own timezone, which is the one they
 * will turn up in.
 */
export function SlotCalendar({
  slots, busy, onChoose,
}: {
  slots: Slot[];
  /** The slot currently being booked, if any. */
  busy: number | null;
  onChoose: (slotId: number) => void;
}) {
  /** Slots grouped by their local day, because that is how they are picked. */
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = localDayKey(new Date(slot.startsAt));
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [slots]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  // Open on the first day with something free, not simply the first day —
  // a calendar that opens on a full day looks like there is nothing left.
  const [selected, setSelected] = useState<string | null>(() => {
    const open = days.find((d) => byDay.get(d)!.some((s) => !s.taken));
    return open ?? days[0] ?? null;
  });

  const [month, setMonth] = useState(() =>
    startOfMonth(selected ? new Date(`${selected}T12:00:00`) : new Date()),
  );

  if (days.length === 0) return null;

  const grid = monthGrid(month);
  const chosenSlots = selected ? byDay.get(selected) ?? [] : [];

  // Only move within months that actually hold interviews.
  const firstMonth = startOfMonth(new Date(`${days[0]}T12:00:00`));
  const lastMonth = startOfMonth(new Date(`${days.at(-1)}T12:00:00`));
  const canGoBack = month > firstMonth;
  const canGoForward = month < lastMonth;

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      {/* ── The month ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-line-subtle bg-surface-raised p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canGoBack}
            onClick={() => setMonth(addMonths(month, -1))}
            className="grid h-8 w-8 place-items-center rounded-lg text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>

          <p className="font-display text-body font-semibold text-content-primary">
            {monthLabel(month)}
          </p>

          <button
            type="button"
            aria-label="Next month"
            disabled={!canGoForward}
            onClick={() => setMonth(addMonths(month, 1))}
            className="grid h-8 w-8 place-items-center rounded-lg text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span
              key={i}
              className="grid h-8 place-items-center text-caption font-semibold text-content-tertiary"
            >
              {d}
            </span>
          ))}

          {grid.map(({ key, date, inMonth }) => {
            const daySlots = byDay.get(key);
            const free = daySlots?.filter((s) => !s.taken).length ?? 0;
            const hasAny = Boolean(daySlots);
            const isSelected = key === selected;

            return (
              <button
                key={key}
                type="button"
                disabled={!hasAny}
                onClick={() => setSelected(key)}
                aria-label={`${date.getDate()} — ${free} time${free === 1 ? '' : 's'} free`}
                className={cn(
                  'relative grid h-10 place-items-center rounded-lg text-body-sm transition-colors',
                  !inMonth && 'opacity-30',
                  isSelected
                    ? 'bg-[var(--color-primary-solid)] font-semibold text-white'
                    : hasAny
                      ? 'font-medium text-content-primary hover:bg-surface-hover'
                      : 'cursor-not-allowed text-content-tertiary',
                )}
              >
                {date.getDate()}
                {/* A dot means there is still room; days that filled up
                    stay visible but say so. */}
                {hasAny && !isSelected && (
                  <span
                    className={cn(
                      'absolute bottom-1.5 h-1 w-1 rounded-full',
                      free > 0 ? 'bg-[var(--color-primary)]' : 'bg-line-strong',
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex items-center gap-3 border-t border-line-subtle pt-2.5 text-caption text-content-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
            full
          </span>
        </p>
      </div>

      {/* ── That day's times ──────────────────────────────────────── */}
      <div>
        <p className="mb-3 flex items-center gap-2 text-body font-semibold text-content-primary">
          <CalendarDays size={16} strokeWidth={2} className="text-[var(--color-primary)]" aria-hidden />
          {selected ? longDay(selected) : 'Pick a day'}
        </p>

        {chosenSlots.length === 0 ? (
          <p className="rounded-lg border border-line-subtle bg-surface-sunken px-4 py-6 text-center text-body-sm text-content-secondary">
            Choose a day with a dot under it.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chosenSlots.map((slot) => {
              const working = busy === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={slot.taken || busy !== null}
                  onClick={() => onChoose(slot.id)}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-center transition-colors',
                    slot.taken
                      ? 'cursor-not-allowed border-line-subtle bg-surface-sunken'
                      : 'border-line-default bg-surface-raised hover:border-[var(--color-primary)] hover:bg-surface-hover',
                  )}
                >
                  <span
                    className={cn(
                      'tabular block text-body font-semibold',
                      slot.taken
                        ? 'text-content-tertiary line-through decoration-1'
                        : 'text-content-primary',
                    )}
                  >
                    {time(slot.startsAt)}
                  </span>
                  <span className="flex items-center justify-center gap-1 text-caption text-content-tertiary">
                    {working ? (
                      'Booking…'
                    ) : slot.taken ? (
                      'Taken'
                    ) : (
                      <>
                        <Clock size={10} aria-hidden />
                        {minutes(slot.startsAt, slot.endsAt)} min
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-caption text-content-tertiary">
          Times are shown in your own timezone ({timeZoneName()}).
        </p>
      </div>
    </div>
  );
}

// ─── Dates ────────────────────────────────────────────────────────────

/**
 * A day key in the viewer's own timezone.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC day, and an evening
 * slot in Karachi belongs to the next one.
 */
function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, by: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + by, 1);
}

/** Six weeks from Monday, so the grid never changes height. */
function monthGrid(month: Date): { key: string; date: Date; inMonth: boolean }[] {
  const first = startOfMonth(month);
  // getDay() is Sunday-first; the grid starts on Monday.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      key: localDayKey(date),
      date,
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function monthLabel(month: Date): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month);
}

function longDay(key: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${key}T12:00:00`));
}

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function minutes(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local time';
  }
}
