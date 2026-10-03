'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useSetTeamMinimumMutation } from '@/store/api/endpoints/projectsApi';
import type { ProjectTeam } from '@/types';

/**
 * The one number HR actually changes.
 *
 * Steppers rather than a text field: the value is almost always moved by
 * one, the realistic range is single digits, and a free text box invites a
 * typo that silently changes which leave gets approved without a person.
 */
export function MinimumStaffControl({ team }: { team: ProjectTeam }) {
  const [value, setValue] = useState(team.minimumStaff);
  const [save, { isLoading }] = useSetTeamMinimumMutation();

  // The list refetches after other edits; follow the server unless the
  // person is mid-change.
  useEffect(() => setValue(team.minimumStaff), [team.minimumStaff]);

  const dirty = value !== team.minimumStaff;

  async function commit() {
    try {
      const result = await save({ teamId: team.id, minimumStaff: value }).unwrap();
      // Raising the minimum above the headcount is allowed — "we need five
      // and have four" is a real situation — but it stops every request on
      // this team going through on its own, which is worth saying out loud.
      if (result.warning) toast.warning(result.warning);
      else toast.success(`${team.name} now needs ${value} available`);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setValue(team.minimumStaff);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-line-default bg-surface-raised">
        <button
          type="button"
          aria-label="Decrease minimum"
          disabled={value <= 1 || isLoading}
          onClick={() => setValue((v) => Math.max(1, v - 1))}
          className="grid h-8 w-8 place-items-center rounded-l-lg text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary disabled:opacity-40"
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <span className="tabular w-9 text-center font-display text-h3 font-bold text-content-primary">
          {value}
        </span>
        <button
          type="button"
          aria-label="Increase minimum"
          disabled={value >= 99 || isLoading}
          onClick={() => setValue((v) => Math.min(99, v + 1))}
          className="grid h-8 w-8 place-items-center rounded-r-lg text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary disabled:opacity-40"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>

      <Button
        size="sm"
        variant={dirty ? 'primary' : 'ghost'}
        icon={Check}
        loading={isLoading}
        disabled={!dirty}
        onClick={commit}
        className={cn(!dirty && 'invisible')}
      >
        Save
      </Button>
    </div>
  );
}
