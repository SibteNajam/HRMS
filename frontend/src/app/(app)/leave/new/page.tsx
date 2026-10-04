'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, CalendarPlus, Info } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useCreateLeaveRequestMutation,
  useGetLeaveTypesQuery,
  useGetMyLeaveBalanceQuery,
} from '@/store/api/endpoints/leaveApi';
import { useAppSelector } from '@/store/hooks';

const schema = z
  .object({
    leaveTypeId: z.string().min(1, 'Choose a leave type'),
    startDate: z.string().min(1, 'Choose a start date'),
    endDate: z.string().min(1, 'Choose an end date'),
    reason: z.string().min(10, 'Give at least 10 characters').max(500),
  })
  .refine((v) => new Date(v.endDate) >= new Date(v.startDate), {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

type Values = z.infer<typeof schema>;

/** Working days excluding weekends — mirrors the server so the preview matches. */
function workingDays(start: string, end: string) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
}

export default function NewLeavePage() {
  const router = useRouter();
  const me = useAppSelector((s) => s.auth.user)!;
  const { data: types } = useGetLeaveTypesQuery();
  const { data: balance } = useGetMyLeaveBalanceQuery();
  const [create, { isLoading }] = useCreateLeaveRequestMutation();

  const { register, handleSubmit, control, setError, formState: { errors } } =
    useForm<Values>({ resolver: zodResolver(schema) });

  const [typeId, start, end] = useWatch({
    control, name: ['leaveTypeId', 'startDate', 'endDate'],
  });

  const days = useMemo(() => workingDays(start, end), [start, end]);
  const line = balance?.find((b) => String(b.leaveType.id) === typeId);

  /**
   * Unpaid leave has no quota, so it has no balance to run out of — the
   * server skips the balance check for it entirely and takes the pay
   * instead. A balance row still exists with an allocation of zero, and
   * treating that as "nothing remaining" left the submit button dead with
   * nothing on screen explaining why.
   */
  const tracked = (line?.leaveType.annualQuota ?? 0) > 0;
  const after = tracked && line ? line.remaining - days : null;
  const overBalance = after !== null && after < 0;

  const approver =
    me.role === 'EMPLOYEE'
      ? 'your HR team'
      : 'an administrator';

  async function onSubmit(values: Values) {
    try {
      await create({
        leaveTypeId: Number(values.leaveTypeId),
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
      }).unwrap();
      toast.success('Leave request submitted', {
        description: `Sent to ${approver} for approval.`,
      });
      router.push('/leave');
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  }

  return (
    <>
      <PageHeader title="Request leave" subtitle={`Your request goes to ${approver}.`} />

      <div className="max-w-[640px]">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="animate-fade-up rounded-xl border border-line-subtle bg-surface-raised p-6 shadow-sm"
        >
          {errors.root && (
            <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <p className="text-body-sm text-danger">{errors.root.message}</p>
            </div>
          )}

          <Select label="Leave type" required error={errors.leaveTypeId?.message} {...register('leaveTypeId')}>
            <option value="">Select…</option>
            {types?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.annualQuota > 0 ? ` · ${t.annualQuota} days/year` : ' · unpaid'}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="From" type="date" required error={errors.startDate?.message} {...register('startDate')} />
            <Input label="To" type="date" required error={errors.endDate?.message} {...register('endDate')} />
          </div>

          {days > 0 && (
            <div className="animate-fade-in mb-4 flex items-start gap-2.5 rounded-lg border border-line-subtle bg-surface-sunken px-3.5 py-3">
              <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
              <div className="text-body-sm">
                <p className="font-medium text-content-primary">
                  <span className="tabular">{days}</span> working day{days === 1 ? '' : 's'}
                  <span className="font-normal text-content-secondary"> · weekends excluded</span>
                </p>
                {tracked && line ? (
                  <p className={overBalance ? 'text-danger' : 'text-content-secondary'}>
                    {overBalance
                      ? `You only have ${line.remaining} day${line.remaining === 1 ? '' : 's'} remaining.`
                      : `Balance would go from ${line.remaining} to ${after}.`}
                  </p>
                ) : line ? (
                  // Say the cost out loud. Unpaid leave is the one type
                  // where approval is easy and the consequence is not.
                  <p className="text-content-secondary">
                    Unpaid — {days} day{days === 1 ? '' : 's'} will be deducted
                    from your pay for that month.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="reason" className="mb-1.5 block text-body-sm font-medium text-content-primary">
              Reason<span className="ml-0.5 text-danger">*</span>
            </label>
            <textarea
              id="reason"
              rows={4}
              placeholder="Family wedding in Lahore — travelling the day before. Handover to Sara."
              {...register('reason')}
              className="w-full resize-y rounded-sm border border-line-default bg-surface-raised p-3 text-body text-content-primary placeholder:text-content-tertiary focus:border-[var(--color-primary)] focus:outline-none"
            />
            <div className="min-h-[22px] pt-1">
              {errors.reason ? (
                <p className="text-body-sm text-danger">{errors.reason.message}</p>
              ) : (
                <p className="text-body-sm text-content-tertiary">
                  Detail helps whoever reviews it decide without asking.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={CalendarPlus}
              loading={isLoading}
              disabled={overBalance}
            >
              Submit request
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
