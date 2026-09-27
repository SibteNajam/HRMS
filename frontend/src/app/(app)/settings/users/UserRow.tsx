'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CircleCheck, CircleMinus, Loader2, ShieldCheck, UserCog, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatRelative } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useSetUserRoleMutation,
  useSetUserStatusMutation,
  type AdminUser,
} from '@/store/api/endpoints/adminApi';
import type { Role } from '@/types';

const ROLE_META: Record<Role, { label: string; tone: 'neutral' | 'brand' | 'info'; icon: typeof User }> = {
  EMPLOYEE: { label: 'Employee', tone: 'neutral', icon: User },
  HR: { label: 'HR', tone: 'info', icon: UserCog },
  ADMIN: { label: 'Admin', tone: 'brand', icon: ShieldCheck },
};

export function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [setRole, { isLoading: savingRole }] = useSetUserRoleMutation();
  const [setStatus, { isLoading: savingStatus }] = useSetUserStatusMutation();
  const [confirming, setConfirming] = useState(false);

  const name = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : 'System administrator';
  const meta = ROLE_META[user.role];

  async function changeRole(role: Role) {
    if (role === user.role) return;
    try {
      await setRole({ id: user.id, role }).unwrap();
      toast.success(`${name} is now ${ROLE_META[role].label}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function toggleStatus() {
    try {
      await setStatus({ id: user.id, isActive: !user.isActive }).unwrap();
      toast.success(user.isActive ? `${name} disabled` : `${name} re-enabled`);
      setConfirming(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirming(false);
    }
  }

  return (
    <>
      <tr
        className={cn(
          'border-t border-line-subtle transition-colors hover:bg-surface-hover',
          !user.isActive && 'opacity-60',
        )}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-content-primary">
                {name}
                {isSelf && (
                  <span className="ml-2 text-caption font-normal text-content-tertiary">
                    (you)
                  </span>
                )}
              </p>
              <p className="truncate text-caption text-content-tertiary">
                {user.email}
                {user.employee && ` · ${user.employee.employeeCode}`}
              </p>
            </div>
          </div>
        </td>

        <td className="px-4 py-3">
          <p className="text-body text-content-primary">
            {user.employee?.department.name ?? '—'}
          </p>
          <p className="text-caption text-content-tertiary">
            {user.employee?.designation ?? 'No employee record'}
          </p>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
            {savingRole && <Loader2 size={14} className="animate-spin text-content-tertiary" />}
          </div>
        </td>

        <td className="px-4 py-3">
          {user.isActive ? (
            <Badge tone="success" icon={CircleCheck}>Active</Badge>
          ) : (
            <Badge tone="neutral" icon={CircleMinus}>Disabled</Badge>
          )}
          <p className="mt-1 text-caption text-content-tertiary">
            {user.lastLoginAt ? `Seen ${formatRelative(user.lastLoginAt)}` : 'Never signed in'}
          </p>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {/* Role is a select, not a menu — it is a value, not an action. */}
            <select
              value={user.role}
              disabled={savingRole || isSelf || !user.isActive}
              onChange={(e) => changeRole(e.target.value as Role)}
              aria-label={`Role for ${name}`}
              title={
                isSelf
                  ? 'You cannot change your own role'
                  : !user.isActive
                    ? 'Re-enable the account first'
                    : undefined
              }
              className={cn(
                'h-8 rounded-sm border border-line-default bg-surface-raised px-2 pr-7',
                'text-body-sm text-content-primary transition-colors',
                'hover:border-line-strong focus:border-[var(--color-primary)] focus:outline-none',
                'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-tertiary',
              )}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR</option>
              <option value="ADMIN">Admin</option>
            </select>

            <Button
              size="sm"
              variant={user.isActive ? 'ghost' : 'secondary'}
              loading={savingStatus}
              disabled={isSelf}
              onClick={() => (user.isActive ? setConfirming(true) : void toggleStatus())}
              title={isSelf ? 'You cannot disable your own account' : undefined}
              className={user.isActive ? 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : ''}
            >
              {user.isActive ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </td>
      </tr>

      <ConfirmDialog
        open={confirming}
        title={`Disable ${name}?`}
        // State the consequence and name the object — never "Are you sure?".
        description={
          `They will not be able to sign in. Their attendance, leave and ` +
          `payslip records are kept, and you can re-enable the account at ` +
          `any time.`
        }
        confirmLabel="Disable account"
        tone="danger"
        loading={savingStatus}
        onConfirm={toggleStatus}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
