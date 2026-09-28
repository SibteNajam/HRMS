'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { timeLabel } from '@/lib/attendanceStyles';
import {
  useCorrectAttendanceMutation, useSetAttendanceMutation,
  type AttendanceRecord,
} from '@/store/api/endpoints/attendanceApi';

const STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY'] as const;

/**
 * Editing one person's day. Handles both cases: correcting an existing row,
 * and creating one where the day was never marked.
 */
export function CorrectDialog({
  employeeId, employeeName, date, record, onClose,
}: {
  employeeId: number;
  employeeName: string;
  date: string;
  record: AttendanceRecord | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string>(record?.status ?? 'PRESENT');
  const [checkIn, setCheckIn] = useState(
    record?.checkIn ? timeLabel(record.checkIn) : '',
  );
  const [checkOut, setCheckOut] = useState(
    record?.checkOut ? timeLabel(record.checkOut) : '',
  );
  const [reason, setReason] = useState('');

  const [correct, { isLoading: correcting }] = useCorrectAttendanceMutation();
  const [set, { isLoading: setting }] = useSetAttendanceMutation();
  const busy = correcting || setting;

  // Times are meaningless for these — nobody clocked in on a holiday.
  const timesApply = !['ABSENT', 'ON_LEAVE', 'HOLIDAY'].includes(status);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (record) {
        await correct({
          id: record.id,
          status,
          checkIn: timesApply && checkIn ? checkIn : undefined,
          checkOut: timesApply && checkOut ? checkOut : undefined,
          reason: reason.trim(),
        }).unwrap();
      } else {
        await set({
          employeeId,
          date: date.slice(0, 10),
          status,
          checkIn: timesApply && checkIn ? checkIn : undefined,
          checkOut: timesApply && checkOut ? checkOut : undefined,
          reason: reason.trim(),
        }).unwrap();
      }
      toast.success(`${employeeName}'s record updated`);
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
        className="animate-scale-in relative w-full max-w-[460px] rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl"
      >
        <h2 className="font-display text-h3 text-content-primary">
          {record ? 'Correct' : 'Set'} attendance
        </h2>
        <p className="mt-1.5 text-body-sm text-content-secondary">
          {employeeName} ·{' '}
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
          }).format(new Date(date))}
        </p>

        <div className="mt-5">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>

          {timesApply && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Check in" type="time" value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
              <Input
                label="Check out" type="time" value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
          )}

          <Input
            label="Reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Forgot to check out — confirmed with their manager"
            hint="Recorded in the audit log against your name."
            error={reason.length > 0 && reason.trim().length < 5 ? 'At least 5 characters' : undefined}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={reason.trim().length < 5}>
            Save record
          </Button>
        </div>
      </form>
    </div>
  );
}
