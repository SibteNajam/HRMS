'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PartyPopper, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CardListSkeleton } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useAppSelector } from '@/store/hooks';
import {
  useCreateHolidayMutation, useDeleteHolidayMutation, useGetHolidaysQuery,
  type Holiday,
} from '@/store/api/endpoints/attendanceApi';

export default function HolidaysPage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const isAdmin = me.role === 'ADMIN';
  const year = new Date().getFullYear();

  const { data, isLoading } = useGetHolidaysQuery({ year });
  const [create, { isLoading: creating }] = useCreateHolidayMutation();
  const [remove, { isLoading: removing }] = useDeleteHolidayMutation();

  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Holiday | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create({ date, name: name.trim() }).unwrap();
      toast.success(`${name} added`, {
        description: 'It will not count against anyone’s attendance.',
      });
      setDate('');
      setName('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id).unwrap();
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(null);
    }
  }

  const today = new Date();

  return (
    <>
      <PageHeader
        title="Holidays"
        subtitle={`Company holidays for ${year}. These days are excluded from attendance and from leave day counts.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
          {isLoading ? (
            <CardListSkeleton count={3} />
          ) : !data?.length ? (
            <div className="p-16 text-center">
              <PartyPopper size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
              <h3 className="mt-4 font-display text-h3 text-content-primary">
                No holidays set for {year}
              </h3>
              <p className="mx-auto mt-1.5 max-w-[380px] text-body-sm text-content-secondary">
                Until a date is listed here, it counts as a normal working day
                and the nightly job will mark people absent on it.
              </p>
            </div>
          ) : (
            <ul className="stagger">
              {data.map((h) => {
                const d = new Date(h.date);
                const past = d < today;
                return (
                  <li
                    key={h.id}
                    className={cn(
                      'flex items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-0',
                      past && 'opacity-55',
                    )}
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-selected">
                      <span className="text-[10px] font-semibold uppercase text-content-selected">
                        {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d)}
                      </span>
                      <span className="tabular text-body font-bold leading-none text-content-selected">
                        {d.getUTCDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-content-primary">{h.name}</p>
                      <p className="text-caption text-content-tertiary">
                        {new Intl.DateTimeFormat('en-GB', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        }).format(d)}
                        {past && ' · past'}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        size="sm" variant="ghost" icon={Trash2}
                        className="text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                        onClick={() => setDeleting(h)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form onSubmit={add} className="h-fit rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
          <h2 className="font-display text-h3 text-content-primary">Add a holiday</h2>
          <p className="mt-1 text-body-sm text-content-secondary">
            Anyone already marked absent on this date is changed to holiday.
          </p>
          <div className="mt-4">
            <Input
              label="Date" type="date" required
              value={date} onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Name" required placeholder="Independence Day"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            type="submit" variant="primary" icon={Plus} fullWidth
            loading={creating} disabled={!date || name.trim().length < 2}
          >
            Add holiday
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.name ?? ''}?`}
        description="That date becomes a normal working day again. Attendance already marked as holiday is not changed back automatically."
        confirmLabel="Remove holiday"
        tone="danger"
        loading={removing}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
