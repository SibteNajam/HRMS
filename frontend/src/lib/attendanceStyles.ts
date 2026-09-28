import {
  CircleCheck, CircleDashed, CircleMinus, CircleX, Clock, PartyPopper,
  Plane, type LucideIcon,
} from 'lucide-react';
import type { AttendanceStatus } from '@/types';

export type RegisterStatus = AttendanceStatus | 'NOT_MARKED';

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  /** For the calendar dot. */
  dot: string;
}

export const ATTENDANCE_STATUS: Record<RegisterStatus, StatusMeta> = {
  PRESENT:    { label: 'Present',    icon: CircleCheck,   tone: 'success', dot: 'bg-success' },
  LATE:       { label: 'Late',       icon: Clock,         tone: 'warning', dot: 'bg-warning' },
  HALF_DAY:   { label: 'Half day',   icon: CircleDashed,  tone: 'info',    dot: 'bg-info' },
  ABSENT:     { label: 'Absent',     icon: CircleX,       tone: 'danger',  dot: 'bg-danger' },
  ON_LEAVE:   { label: 'On leave',   icon: Plane,         tone: 'info',    dot: 'bg-[var(--color-primary)]' },
  HOLIDAY:    { label: 'Holiday',    icon: PartyPopper,   tone: 'neutral', dot: 'bg-line-strong' },
  // Deliberately distinct from ABSENT: nobody has said this person was away,
  // the day simply has not been processed yet.
  NOT_MARKED: { label: 'Not marked', icon: CircleMinus,   tone: 'neutral', dot: 'bg-line-default' },
};

/** "6h 22m" from minutes. */
export function hoursLabel(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "09:05" from an ISO timestamp, in the viewer's timezone. */
export function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}
