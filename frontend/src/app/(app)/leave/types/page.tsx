'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileSliders, PenLine, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CardListSkeleton } from '@/components/ui/loading';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useGetLeaveTypesQuery,
  useUpsertLeaveTypeMutation,
} from '@/store/api/endpoints/leaveApi';
import type { LeaveType } from '@/types';

export default function LeaveTypesPage() {
  const { data: types, isLoading } = useGetLeaveTypesQuery();
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Leave types & policy"
        subtitle="The entitlements employees can request against."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Add type
          </Button>
        }
      />

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {types?.map((t) => (
            <div key={t.id} className="rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-h3 text-content-primary">{t.name}</h3>
                  <Badge tone={t.isPaid ? 'success' : 'neutral'} small className="mt-1.5">
                    {t.isPaid ? 'Paid' : 'Unpaid'}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </div>

              <p className="tabular mt-4 font-display text-display-sm text-content-primary">
                {t.annualQuota > 0 ? t.annualQuota : '∞'}
              </p>
              <p className="text-body-sm text-content-secondary">
                {t.annualQuota > 0
                  ? 'days per year'
                  : 'no quota — each approved day is deducted from pay'}
              </p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TypeDialog
          type={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TypeDialog({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  const [name, setName] = useState(type?.name ?? '');
  const [quota, setQuota] = useState(String(type?.annualQuota ?? 0));
  const [isPaid, setIsPaid] = useState(type?.isPaid ?? true);
  const [save, { isLoading }] = useUpsertLeaveTypeMutation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        id: type?.id,
        name: name.trim(),
        annualQuota: Number(quota),
        isPaid,
      }).unwrap();
      toast.success(type ? `${name} updated` : `${name} created`, {
        description: type
          ? 'Balances for this year were adjusted where possible.'
          : 'Allocated to every active employee, pro-rated for the rest of the year.',
      });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <form
        onSubmit={submit}
        className="animate-scale-in relative w-full max-w-[440px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl"
      >
        <h2 className="font-display text-h3 text-content-primary">
          {type ? `Edit ${type.name}` : 'New leave type'}
        </h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          {type
            ? 'Changing the quota updates this year’s allocation for anyone who has not already used more than the new figure.'
            : 'This will be allocated to every active employee, pro-rated for the months remaining this year.'}
        </p>

        <div className="mt-5">
          <Input
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Compassionate"
          />
          <Input
            label="Days per year"
            type="number"
            min={0}
            max={365}
            required
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            hint="Zero means unlimited but unpaid — each day is deducted from salary."
          />
          <Select
            label="Paid"
            value={isPaid ? 'yes' : 'no'}
            onChange={(e) => setIsPaid(e.target.value === 'yes')}
          >
            <option value="yes">Paid — salary unaffected</option>
            <option value="no">Unpaid — deducted from payroll</option>
          </Select>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={name.trim().length < 2}>
            {type ? 'Save changes' : 'Create type'}
          </Button>
        </div>
      </form>
    </div>
  );
}
