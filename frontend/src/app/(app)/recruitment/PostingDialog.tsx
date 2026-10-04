'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Info, Megaphone } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/getErrorMessage';
import {
  useCreatePostingMutation, useUpdatePostingMutation,
  type EmploymentType, type JobPosting, type WorkMode,
} from '@/store/api/endpoints/recruitmentApi';

/**
 * The description written here is the thing a CV is scored against, so the
 * form says so rather than leaving somebody to write marketing copy and
 * wonder why the scores look random.
 */
export function PostingDialog({
  posting, onClose,
}: {
  posting: JobPosting | null;
  onClose: () => void;
}) {
  const [code, setCode] = useState(posting?.code ?? '');
  const [title, setTitle] = useState(posting?.title ?? '');
  const [description, setDescription] = useState(posting?.description ?? '');
  const [skills, setSkills] = useState((posting?.requiredSkills ?? []).join(', '));
  const [years, setYears] = useState(String(posting?.minYearsExperience ?? 0));
  const [threshold, setThreshold] = useState(String(posting?.shortlistThreshold ?? 70));
  const [status, setStatus] = useState(posting?.status ?? 'DRAFT');
  const [location, setLocation] = useState(posting?.location ?? '');
  const [employmentType, setEmploymentType] =
    useState<EmploymentType>(posting?.employmentType ?? 'FULL_TIME');
  const [workMode, setWorkMode] = useState<WorkMode>(posting?.workMode ?? 'ON_SITE');
  const [salaryRange, setSalaryRange] = useState(posting?.salaryRange ?? '');
  const [advertIntro, setAdvertIntro] = useState(posting?.advertIntro ?? '');

  // The interview window. Set once; every bookable slot comes from it.
  const [from, setFrom] = useState(posting?.interviewFrom?.slice(0, 10) ?? '');
  const [to, setTo] = useState(posting?.interviewTo?.slice(0, 10) ?? '');
  const [startHour, setStartHour] = useState(String(posting?.interviewStartHour ?? 10));
  const [endHour, setEndHour] = useState(String(posting?.interviewEndHour ?? 17));
  // On by default for a new role: a day of back-to-back interviews with
  // no lunch is not a schedule anybody keeps, and switching it off is one
  // click where remembering to switch it on is a thing to forget.
  const [breakOn, setBreakOn] = useState(
    posting ? posting.breakStartHour !== null : true,
  );
  const [breakStart, setBreakStart] = useState(String(posting?.breakStartHour ?? 13));
  const [breakEnd, setBreakEnd] = useState(String(posting?.breakEndHour ?? 14));
  const [slotMinutes, setSlotMinutes] = useState(String(posting?.slotMinutes ?? 60));

  const [create, { isLoading: creating }] = useCreatePostingMutation();
  const [update, { isLoading: updating }] = useUpdatePostingMutation();
  const saving = creating || updating;

  const skillList = skills.split(',').map((s) => s.trim()).filter(Boolean);

  /**
   * What the window works out to, before it is saved.
   *
   * The arithmetic is easy to get wrong in your head — a break eats an
   * hour, weekends are skipped — and "six slots a day" read back is the
   * fastest way to notice you meant something else.
   */
  function summarise(): string {
    if (Number(endHour) <= Number(startHour)) {
      return 'The day has to end after it starts.';
    }
    if (breakOn && Number(breakEnd) <= Number(breakStart)) {
      return 'The break has to end after it starts.';
    }
    if (breakOn && (Number(breakStart) < Number(startHour) || Number(breakEnd) > Number(endHour))) {
      return 'The break has to fall inside the interview hours.';
    }

    const hours = Number(endHour) - Number(startHour);
    const breakHours = breakOn ? Number(breakEnd) - Number(breakStart) : 0;
    const perDay = Math.max(0, Math.floor(((hours - breakHours) * 60) / Number(slotMinutes || 60)));
    const days = countWeekdays(from, to);

    if (perDay === 0) return 'Those hours do not fit a single slot.';
    if (days === 0) return 'No weekdays fall between those dates.';

    return `${perDay} slot${perDay === 1 ? '' : 's'} a day × ${days} weekday${days === 1 ? '' : 's'} = ${perDay * days} interview times`;
  }

  /** True when the window cannot produce a bookable slot. */
  const windowBroken =
    Boolean(from && to) && !summarise().includes('interview times');
  const invalid =
    code.trim().length < 2 ||
    title.trim().length < 3 ||
    description.trim().length < 40 ||
    skillList.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      requiredSkills: skillList,
      minYearsExperience: Number(years || 0),
      shortlistThreshold: Number(threshold || 70),
      status,
      location: location.trim() || undefined,
      employmentType,
      workMode,
      salaryRange: salaryRange.trim() || undefined,
      advertIntro: advertIntro.trim() || undefined,
      interviewFrom: from || undefined,
      interviewTo: to || undefined,
      interviewStartHour: Number(startHour),
      interviewEndHour: Number(endHour),
      breakStartHour: breakOn ? Number(breakStart) : undefined,
      breakEndHour: breakOn ? Number(breakEnd) : undefined,
      slotMinutes: Number(slotMinutes),
    };
    try {
      const saved = posting
        ? await update({ id: posting.id, ...body }).unwrap()
        : await create(body).unwrap();

      toast.success(
        saved.slots.generated > 0
          ? `${posting ? 'Updated' : body.code + ' created'} — ${saved.slots.generated} interview slots laid out`
          : posting ? 'Posting updated' : `${body.code} created`,
      );
      // A booked slot is never moved, and HR should know it was kept.
      if (saved.slots.kept > 0) {
        toast.info(`${saved.slots.kept} already-booked time${saved.slots.kept === 1 ? '' : 's'} left unchanged`);
      }
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
        className="animate-scale-in relative max-h-[90vh] w-full max-w-[600px] overflow-y-auto rounded-xl border border-line-subtle bg-surface-overlay p-6 shadow-xl"
      >
        <h2 className="font-display text-h3 text-content-primary">
          {posting ? `Edit ${posting.code}` : 'New job posting'}
        </h2>

        <div className="mt-5 grid gap-x-3 sm:grid-cols-[140px_1fr]">
          <Input
            label="Code" required value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BE-001"
            hint="Quote this in the advert"
          />
          <Input
            label="Title" required value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Backend Engineer"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="jd" className="mb-1.5 block text-body-sm font-medium text-content-primary">
            Description <span className="text-danger">*</span>
          </label>
          <textarea
            id="jd"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the person will own, the systems they will work in, and what you actually need them to have done before."
            className="w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
          />
          <p className="mt-1 flex items-start gap-1.5 text-caption text-content-tertiary">
            <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
            This is what each CV is read against. Requirements score well;
            adjectives do not.
          </p>
        </div>

        <Input
          label="Required skills" required value={skills}
          onChange={(e) => setSkills(e.target.value)}
          placeholder="TypeScript, NestJS, Prisma, MySQL, Docker"
          hint={`Comma separated — ${skillList.length} skill${skillList.length === 1 ? '' : 's'}`}
        />

        <div className="grid gap-x-3 sm:grid-cols-3">
          <Input
            label="Min. years" type="number" min={0} max={50}
            value={years} onChange={(e) => setYears(e.target.value)}
          />
          <Input
            label="Shortlist at" type="number" min={1} max={100}
            value={threshold} onChange={(e) => setThreshold(e.target.value)}
            hint="Auto-invite score"
          />
          <Select
            label="Status" value={status}
            onChange={(e) => setStatus(e.target.value as JobPosting['status'])}
          >
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>

        <p className="mb-5 text-caption text-content-tertiary">
          Only <span className="font-medium text-content-secondary">Open</span>{' '}
          postings are matched to CVs that arrive by email.
        </p>

        {/* ── The advert ──────────────────────────────────────────────
            Separate section because none of it is scored against. It
            exists so the LinkedIn post can be generated from the posting
            instead of being written a second time and drifting. */}
        <div className="mb-4 rounded-lg border border-line-subtle bg-surface-sunken p-4">
          <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-content-primary">
            <Megaphone size={14} strokeWidth={2} aria-hidden />
            For the advert
          </h3>
          <p className="mb-3 mt-0.5 text-caption text-content-tertiary">
            Not used for scoring. These build the post you publish, so it
            can never disagree with what you screen against.
          </p>

          <div className="grid gap-x-3 sm:grid-cols-[1fr_140px_140px]">
            <Input
              label="Location" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Islamabad, Pakistan"
            />
            <Select
              label="Type" value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
            >
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option>
            </Select>
            <Select
              label="Work mode" value={workMode}
              onChange={(e) => setWorkMode(e.target.value as WorkMode)}
            >
              <option value="ON_SITE">On-site</option>
              <option value="HYBRID">Hybrid</option>
              <option value="REMOTE">Remote</option>
            </Select>
          </div>

          <Input
            label="Salary range" value={salaryRange}
            onChange={(e) => setSalaryRange(e.target.value)}
            placeholder="PKR 150,000 – 250,000 / month"
            hint="Left out of the advert if empty"
          />

          <label htmlFor="intro" className="mb-1.5 block text-body-sm font-medium text-content-primary">
            Opening lines
          </label>
          <textarea
            id="intro"
            rows={3}
            value={advertIntro}
            onChange={(e) => setAdvertIntro(e.target.value)}
            placeholder="We are looking for a skilled and motivated developer to join our team…"
            className="w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
          />
          <p className="mt-1 text-caption text-content-tertiary">
            Written for a person to read. The description above is written
            for the scorer.
          </p>
        </div>

        {/* ── Interview window ────────────────────────────────────────
            Set once. Every slot a candidate can book is generated from
            these numbers, so nobody picks times one by one and every
            candidate sees the same grid. */}
        <div className="mb-4 rounded-lg border border-line-subtle bg-surface-sunken p-4">
          <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-content-primary">
            <CalendarRange size={14} strokeWidth={2} aria-hidden />
            Interview window
          </h3>
          <p className="mb-3 mt-0.5 text-caption text-content-tertiary">
            Shortlisted candidates pick from these times. Weekends are
            skipped, and a time somebody has already booked is never moved.
          </p>

          <div className="grid gap-x-3 sm:grid-cols-2">
            <Input
              label="First day" type="date" value={from}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="Last day" type="date" value={to}
              min={from || new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {/* Dropdowns, not number boxes. A field that accepts "5" cannot
              tell five in the morning from five in the evening, and the
              one posting created with a typed hour ended up running from
              06:00 to 05:00 — open, advertised and unbookable. */}
          <div className="grid gap-x-3 sm:grid-cols-3">
            <HourSelect
              label="Day starts" value={startHour} onChange={setStartHour}
            />
            <HourSelect
              label="Day ends" value={endHour} onChange={setEndHour} from={1} to={24}
            />
            <Select
              label="Each lasts"
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(e.target.value)}
            >
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1 hour 30</option>
              <option value="120">2 hours</option>
            </Select>
          </div>

          <label className="mb-2 flex cursor-pointer items-center gap-2 text-body-sm text-content-primary">
            <input
              type="checkbox"
              checked={breakOn}
              onChange={(e) => setBreakOn(e.target.checked)}
              className="h-4 w-4 rounded border-line-default accent-[var(--color-primary)]"
            />
            Break in the middle of the day
          </label>

          {breakOn && (
            <div className="grid gap-x-3 sm:grid-cols-2">
              <HourSelect label="Break starts" value={breakStart} onChange={setBreakStart} />
              <HourSelect label="Break ends" value={breakEnd} onChange={setBreakEnd} from={1} to={24} />
            </div>
          )}

          {from && to && (
            <p
              className={cn(
                'rounded-md px-2.5 py-2 text-caption',
                windowBroken
                  ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] font-medium text-danger'
                  : 'bg-surface-raised text-content-secondary',
              )}
            >
              {summarise()}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit" variant="primary" loading={saving}
            disabled={invalid || windowBroken}
          >
            {posting ? 'Save changes' : 'Create posting'}
          </Button>
        </div>
      </form>
    </div>
  );
}


/** Weekdays between two YYYY-MM-DD dates, inclusive. */
function countWeekdays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (end < start) return 0;

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}


/**
 * An hour of the day, written the way people say it.
 *
 * "17" is correct and nobody thinks in it; "5:00 PM" is unambiguous. The
 * value is still the 24-hour number the API wants — the label is the only
 * thing that changes.
 */
function HourSelect({
  label, value, onChange, from = 0, to = 23,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  from?: number;
  to?: number;
}) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
        <option key={h} value={h}>{hourLabel(h)}</option>
      ))}
    </Select>
  );
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12:00 midnight';
  if (hour === 12) return '12:00 noon';
  if (hour === 24) return 'midnight';
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}
