'use client';

import { useState } from 'react';
import { Gauge, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useDebounced } from '@/hooks/useDebounced';
import { useGetAllBalancesQuery, useGetLeaveTypesQuery } from '@/store/api/endpoints/leaveApi';

export default function LeaveBalancesPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const year = new Date().getFullYear();

  const { data: types } = useGetLeaveTypesQuery();
  const { data, isLoading } = useGetAllBalancesQuery({
    year,
    search: debounced || undefined,
  });

  // Only quota-bearing types get a column — unpaid has no balance to show.
  const columns = (types ?? []).filter((t) => t.annualQuota > 0);

  return (
    <>
      <PageHeader
        title="Leave balances"
        subtitle={`Entitlement and usage for ${year}, across every active employee.`}
      />

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-start gap-3 border-b border-line-subtle p-4">
          <div className="min-w-[260px] flex-1">
            <Input
              placeholder="Search name or employee code…"
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search employees"
            />
          </div>
          <p className="self-center text-body-sm text-content-secondary">
            {data ? `${data.length} employee${data.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={4} />
        ) : !data?.length ? (
          <div className="p-16 text-center">
            <Gauge size={44} strokeWidth={1.25} className="mx-auto text-line-default" aria-hidden />
            <h3 className="mt-4 font-display text-h3 text-content-primary">No employees match</h3>
            <p className="mt-1.5 text-body-sm text-content-secondary">Try a different search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-sunken">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                    Employee
                  </th>
                  {columns.map((t) => (
                    <th key={t.id} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const name = `${row.employee.firstName} ${row.employee.lastName}`;
                  return (
                    <tr key={row.employee.id} className="border-t border-line-subtle transition-colors hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-body font-medium text-content-primary">
                              {name}
                              {row.employee.role !== 'EMPLOYEE' && (
                                <Badge tone="brand" small>{row.employee.role}</Badge>
                              )}
                            </p>
                            <p className="truncate text-caption text-content-tertiary">
                              {row.employee.department.name} · {row.employee.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>

                      {columns.map((t) => {
                        const b = row.balances.find((x) => x.leaveType.id === t.id);
                        if (!b) {
                          return (
                            <td key={t.id} className="px-4 py-3 text-body-sm text-content-tertiary">
                              Not allocated
                            </td>
                          );
                        }
                        const pct = b.allocated ? (b.used / b.allocated) * 100 : 0;
                        const low = b.remaining <= 2;
                        return (
                          <td key={t.id} className="px-4 py-3">
                            <p className="tabular text-body font-medium">
                              <span className={cn(low ? 'text-warning' : 'text-content-primary')}>
                                {b.remaining}
                              </span>
                              <span className="text-content-tertiary"> / {b.allocated}</span>
                            </p>
                            <div className="mt-1.5 h-1.5 w-[86px] overflow-hidden rounded-full bg-surface-sunken">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-[width] duration-500 ease-out',
                                  low ? 'bg-warning' : 'bg-[var(--color-primary)]',
                                )}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
