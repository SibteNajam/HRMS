'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, LogIn, LogOut, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { hoursLabel, timeLabel } from '@/lib/attendanceStyles';
import {
  useCheckInMutation, useCheckOutMutation, useGetTodayQuery,
} from '@/store/api/endpoints/attendanceApi';

/** Ticks while checked in, so the elapsed figure is live rather than stale. */
function useElapsed(since: string | null) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!since) return;
    const tick = () =>
      setMins(Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [since]);
  return mins;
}

export function CheckInCard() {
  const { data, isLoading } = useGetTodayQuery();
  const [checkIn, { isLoading: checkingIn }] = useCheckInMutation();
  const [checkOut, { isLoading: checkingOut }] = useCheckOutMutation();

  const working = data?.record?.checkIn && !data.record.checkOut;
  const elapsed = useElapsed(working ? data!.record!.checkIn : null);

  if (isLoading) {
    return <Skeleton className="h-[108px] rounded-xl" />;
  }
  if (!data) return null;

  async function act(fn: () => Promise<unknown>, label: string) {
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  // Not a working day — say which kind, and offer no button.
  if (data.isWeekend || data.holiday) {
    return (
      <div className="flex items-center gap-3.5 rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-sunken">
          <PartyPopper size={20} strokeWidth={1.75} className="text-content-tertiary" />
        </span>
        <div>
          <p className="text-body font-semibold text-content-primary">
            {data.holiday ? data.holiday.name : 'Weekend'}
          </p>
          <p className="text-body-sm text-content-secondary">
            Not a working day — nothing to record.
          </p>
        </div>
      </div>
    );
  }

  const done = !!data.record?.checkOut;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border p-5 shadow-sm',
        working
          ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_7%,transparent)]'
          : 'border-line-subtle bg-surface-raised',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg',
          working ? 'bg-success text-white' : 'bg-surface-selected text-content-selected',
        )}
      >
        <CalendarCheck size={20} strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        {done ? (
          <>
            <p className="text-body font-semibold text-content-primary">
              Done for today
            </p>
            <p className="tabular text-body-sm text-content-secondary">
              {timeLabel(data.record!.checkIn)} – {timeLabel(data.record!.checkOut)} ·{' '}
              {hoursLabel(data.record!.minutesWorked)}
              {data.record!.overtimeMinutes > 0 &&
                ` · ${hoursLabel(data.record!.overtimeMinutes)} overtime`}
            </p>
          </>
        ) : working ? (
          <>
            <p className="text-body font-semibold text-content-primary">
              Checked in at {timeLabel(data.record!.checkIn)}
            </p>
            <p className="tabular text-body-sm text-content-secondary">
              Working for {hoursLabel(elapsed)}
              <span className="ml-2 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-breathe" />
                <span className="text-success">live</span>
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-body font-semibold text-content-primary">
              You have not checked in today
            </p>
            <p className="text-body-sm text-content-secondary">
              Your arrival time decides whether the day is marked late.
            </p>
          </>
        )}
      </div>

      {data.canCheckIn && (
        <Button
          variant="primary" size="lg" icon={LogIn} loading={checkingIn}
          onClick={() => act(() => checkIn().unwrap(), 'Checked in')}
        >
          Check In
        </Button>
      )}
      {data.canCheckOut && (
        <Button
          variant="secondary" size="lg" icon={LogOut} loading={checkingOut}
          onClick={() => act(() => checkOut().unwrap(), 'Checked out')}
        >
          Check Out
        </Button>
      )}
    </div>
  );
}
