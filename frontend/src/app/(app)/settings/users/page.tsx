'use client';

import { useState } from 'react';
import {
  CircleCheck, CircleMinus, Search, ShieldCheck, UserCog, Users, UserX,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { useDebounced } from '@/hooks/useDebounced';
import {
  useGetAdminUsersQuery,
  useGetUserCountsQuery,
} from '@/store/api/endpoints/adminApi';
import { useAppSelector } from '@/store/hooks';
import type { Role } from '@/types';
import { UserRow } from './UserRow';
import { TableSkeleton } from '@/components/ui/TableSkeleton';

export default function UsersPage() {
  const me = useAppSelector((s) => s.auth.user);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [status, setStatus] = useState<'' | 'active' | 'disabled'>('');
  const debounced = useDebounced(search, 300);

  const { data: counts } = useGetUserCountsQuery();
  const { data, isLoading, isError } = useGetAdminUsersQuery({
    search: debounced || undefined,
    role: role || undefined,
    status: status || undefined,
    limit: 50,
  });

  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Who has an account, what they can do, and whether they can sign in."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={counts?.employees ?? '—'} icon={Users} />
        <StatCard label="HR" value={counts?.hr ?? '—'} icon={UserCog} />
        <StatCard label="Administrators" value={counts?.admins ?? '—'} icon={ShieldCheck} />
        <StatCard label="Disabled" value={counts?.disabled ?? '—'} icon={UserX} />
      </div>

      <div className="mt-6 rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        {/* Filters in one row above the table, never scattered per column. */}
        <div className="flex flex-wrap items-start gap-3 border-b border-line-subtle p-4">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="Search name, email or code…"
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <div className="w-[170px]">
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role | '')}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          <div className="w-[170px]">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : isError ? (
          <div className="p-16 text-center">
            <p className="text-body text-danger">Could not load accounts.</p>
          </div>
        ) : !data?.data.length ? (
          <div className="p-16 text-center">
            <Avatar name="No one" size="xl" className="mx-auto opacity-40" />
            <p className="mt-4 font-display text-h3 text-content-primary">
              No accounts match
            </p>
            <p className="mt-1 text-body-sm text-content-secondary">
              Try a different search or clear the filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-sunken">
                  {['Person', 'Department', 'Role', 'Status', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-content-secondary"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === me?.sub} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <div className="flex items-center justify-between border-t border-line-subtle px-4 py-3">
            <p className="text-body-sm text-content-secondary">
              Showing {data.data.length} of {data.meta.total}
            </p>
            <div className="flex items-center gap-2 text-body-sm text-content-tertiary">
              <CircleCheck size={14} className="text-success" aria-hidden />
              Accounts are disabled, never deleted
              <CircleMinus size={14} className="text-content-tertiary" aria-hidden />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
