'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, PenLine, Search, UserX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useDebounced } from '@/hooks/useDebounced';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { ATTENDANCE_STATUS, hoursLabel, timeLabel } from '@/lib/attendanceStyles';
import {
  useGetRegisterQuery, useMarkAbsenteesMutation,
  type AttendanceRecord,
} from '@/store/api/endpoints/attendanceApi';
import { CorrectDialog } from './CorrectDialog';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function RegisterPage() {
  const [date, setDate] = useState(() => iso(new Date()));
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [editing, setEditing] = useState<{
    employeeId: number; name: string; record: AttendanceRecord | null;
  } | null>(null);

  const { data, isLoading } = useGetRegisterQuery(
    { date, search: debounced || undefined },
    // Someone else checking in does not invalidate this tab's cache.
    { pollingInterval: 60_000, skipPollingIfUnfocused: true },
  );
  const [markAbsent, { isLoading: marking }] = useMarkAbsenteesMutation();

  const isToday = date === iso(new Date());
  const notMarked = data?.counts.NOT_MARKED ?? 0;

  function shiftDay(by: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + by);
    setDate(iso(d));
  }

  async function runMarkAbsent() {
    try {
      const r = await markAbsent({ date }).unwrap();
      toast.success(
        r.marked ? `${r.marked} marked absent` : 'Nobody left to mark',
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Daily register"
        subtitle="Everyone's attendance for one day. Click a row to correct it."
        actions={
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => shiftDay(-1)} aria-label="Previous day">
              <ChevronLeft size={18} />
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Register date"
              className="h-10 rounded-sm border border-line-default bg-surface-raised px-3 text-body text-content-primary focus:border-[var(--color-primary)] focus:outline-none"
            />
            <Button size="icon" variant="ghost" onClick={() => shiftDay(1)} aria-label="Next day">
              <ChevronRight size={18} />
            </Button>
            {!isToday && (
              <Button size="sm" variant="secondary" className="ml-1" onClick={() => setDate(iso(new Date()))}>
                Today
              </Button>
            )}
          </div>
        }
      />

      {/* Status counts across the top — the shape of the day at a glance. */}
      {data && !data.isWeekend && !data.holiday && (
        <div className="stagger mb-5 flex flex-wrap gap-3">
          {(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'NOT_MARKED'] as const).map((s) => {
            const n = data.counts[s] ?? 0;
            const meta = ATTENDANCE_STATUS[s];
            if (n === 0) return null;
            return (
              <div key={s} className="flex items-center gap-2.5 rounded-lg border border-line-subtle bg-surface-raised px-4 py-2.5 shadow-sm">
                <span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
                <span className="tabular font-display text-h3 font-bold text-content-primary">{n}</span>
                <span className="text-body-sm text-content-secondary">{meta.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {data?.holiday && (
        <div className="mb-5 rounded-lg border border-line-subtle bg-surface-sunken px-4 py-3 text-body-sm text-content-secondary">
          <strong className="text-content-primary">{data.holiday.name}</strong> — a
          company holiday, so nobody is expected to check in.
        </div>
      )}
      {data?.isWeekend && !data.holiday && (
        <div className="mb-5 rounded-lg border border-line-subtle bg-surface-sunken px-4 py-3 text-body-sm text-content-secondary">
          This day is a weekend. Attendance is not expected.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-start gap-3 border-b border-line-subtle p-4">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="Search name or employee code…"
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search employees"
            />
          </div>
          {notMarked > 0 && !data?.isWeekend && !data?.holiday && (
            <Button
              variant="secondary" icon={UserX} loading={marking}
              onClick={runMarkAbsent}
              title="Writes an ABSENT record for anyone with no row for this day"
            >
              Mark {notMarked} absent
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : !data?.rows.length ? (
          <div className="p-16 text-center text-body-sm text-content-secondary">
            No employees match that search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-sunken">
                  {['Employee', 'Status', 'In', 'Out', 'Worked', 'Overtime', ''].map((h, i) => (
                    <th key={h || i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const name = `${row.employee.firstName} ${row.employee.lastName}`;
                  const meta = ATTENDANCE_STATUS[row.status];
                  const r = row.record;
                  return (
                    <tr key={row.employee.id} className="border-t border-line-subtle transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-body font-medium text-content-primary">{name}</p>
                            <p className="truncate text-caption text-content-tertiary">
                              {row.employee.department.name} · {row.employee.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                      </td>
                      <td className="tabular px-4 py-3 text-body text-content-primary">
                        {timeLabel(r?.checkIn ?? null)}
                      </td>
                      <td className="tabular px-4 py-3 text-body text-content-primary">
                        {timeLabel(r?.checkOut ?? null)}
                      </td>
                      <td className="tabular px-4 py-3 text-body text-content-primary">
                        {hoursLabel(r?.minutesWorked ?? null)}
                      </td>
                      <td className="tabular px-4 py-3 text-body">
                        {r && r.overtimeMinutes > 0 ? (
                          <span className="text-success">{hoursLabel(r.overtimeMinutes)}</span>
                        ) : (
                          <span className="text-content-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm" variant="ghost" icon={PenLine}
                          onClick={() =>
                            setEditing({ employeeId: row.employee.id, name, record: r })
                          }
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CorrectDialog
          employeeId={editing.employeeId}
          employeeName={editing.name}
          date={date}
          record={editing.record}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
