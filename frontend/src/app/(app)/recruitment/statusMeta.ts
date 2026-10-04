import {
  CalendarCheck, CircleCheck, CircleDashed, CircleSlash, FileQuestion,
  Sparkles, UserCheck,
} from 'lucide-react';
import type { ApplicationStatus } from '@/store/api/endpoints/recruitmentApi';

/**
 * How each state reads to HR.
 *
 * `NEEDS_REVIEW` sorts and reads as the loudest, because it is the only one
 * where somebody applied and the system could not act — the state most
 * likely to sit untouched for a month.
 */
export const STATUS: Record<
  ApplicationStatus,
  { label: string; icon: typeof CircleCheck; tone: string; help: string }
> = {
  NEEDS_REVIEW: {
    label: 'Needs review',
    icon: FileQuestion,
    tone: 'text-danger',
    help: 'The CV could not be read, or no posting matched it.',
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    icon: Sparkles,
    tone: 'text-success',
    help: 'Scored at or above the bar. Invited to pick an interview time.',
  },
  INTERVIEW: {
    label: 'Interview booked',
    icon: CalendarCheck,
    tone: 'text-[var(--color-primary)]',
    help: 'They have chosen a time.',
  },
  RECEIVED: {
    label: 'Received',
    icon: CircleDashed,
    tone: 'text-content-tertiary',
    help: 'In, not yet screened.',
  },
  SCREENED: {
    label: 'Below the bar',
    icon: CircleSlash,
    tone: 'text-content-tertiary',
    help: 'Scored under the threshold. No email has been sent — that is yours to decide.',
  },
  HIRED: {
    label: 'Hired',
    icon: UserCheck,
    tone: 'text-success',
    help: 'Offer accepted.',
  },
  REJECTED: {
    label: 'Rejected',
    icon: CircleSlash,
    tone: 'text-danger',
    help: 'A person decided, and the candidate was told.',
  },
};
