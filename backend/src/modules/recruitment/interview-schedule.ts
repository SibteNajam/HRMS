/**
 * Turning an interview window into bookable slots.
 *
 * HR sets five numbers once — the dates, the hours, the break and the slot
 * length — and every slot comes from them. The alternative, clicking times
 * one by one, means a fortnight of interviews is sixty clicks and the grid
 * every candidate sees depends on whether somebody got bored halfway.
 *
 * Pure, so the arithmetic can be checked without a database: an hour that
 * silently disappears into a break or a weekend is the kind of bug nobody
 * notices until a candidate says the page was empty.
 */

export interface InterviewWindow {
  from: Date;
  to: Date;
  /**
   * The zone the hours are written in — "Asia/Karachi", not UTC.
   *
   * HR typing "10:00" means ten in the morning where they are. Building
   * the slot at 10:00 UTC put it at 15:00 for everyone in Pakistan, which
   * is how a nine-to-five interview day ended up running into the evening.
   */
  timeZone: string;
  /** Hours of the day, 0-23. 10 to 17 means the last slot starts at 16. */
  startHour: number;
  endHour: number;
  /** Lunch. Null for no break. */
  breakStartHour: number | null;
  breakEndHour: number | null;
  slotMinutes: number;
}

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
}

export class InvalidWindow extends Error {}

/** More than this is a scheduling mistake, not a hiring round. */
const MAX_SLOTS = 500;

export function validateWindow(w: InterviewWindow): void {
  if (w.to < w.from) {
    throw new InvalidWindow('The last interview day cannot be before the first.');
  }
  if (w.startHour < 0 || w.endHour > 24 || w.endHour <= w.startHour) {
    throw new InvalidWindow('Interview hours must run forwards within one day.');
  }
  if (w.slotMinutes < 10 || w.slotMinutes > 480) {
    throw new InvalidWindow('A slot has to be between 10 minutes and 8 hours.');
  }

  const hasBreak = w.breakStartHour !== null && w.breakEndHour !== null;
  if (hasBreak) {
    if (w.breakEndHour! <= w.breakStartHour!) {
      throw new InvalidWindow('The break has to end after it starts.');
    }
    if (w.breakStartHour! < w.startHour || w.breakEndHour! > w.endHour) {
      throw new InvalidWindow('The break has to fall inside the interview hours.');
    }
  }
}

/**
 * @param weekendDays days of the week nobody interviews on, 0 = Sunday.
 *
 * Times are built in UTC. Every date in this system is stored and compared
 * in UTC, and a slot built from a local-midnight Date lands on the wrong
 * day for anyone east of Greenwich — which is everyone here.
 */
export function generateSlots(
  w: InterviewWindow,
  weekendDays: number[] = [],
): GeneratedSlot[] {
  validateWindow(w);

  const slots: GeneratedSlot[] = [];
  const day = startOfUtcDay(w.from);
  const last = startOfUtcDay(w.to);

  while (day <= last) {
    if (!weekendDays.includes(day.getUTCDay())) {
      slots.push(...slotsForDay(day, w));
      if (slots.length > MAX_SLOTS) {
        throw new InvalidWindow(
          `That window produces more than ${MAX_SLOTS} interview slots. ` +
            `Shorten the dates or lengthen the slots.`,
        );
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return slots;
}

function slotsForDay(day: Date, w: InterviewWindow): GeneratedSlot[] {
  const out: GeneratedSlot[] = [];
  const dayEnd = atHour(day, w.endHour, w.timeZone);

  const breakStart =
    w.breakStartHour !== null ? atHour(day, w.breakStartHour, w.timeZone) : null;
  const breakEnd =
    w.breakEndHour !== null ? atHour(day, w.breakEndHour, w.timeZone) : null;

  let cursor = atHour(day, w.startHour, w.timeZone);

  while (true) {
    const end = new Date(cursor.getTime() + w.slotMinutes * 60_000);
    // A slot that would run past the end of the day is not a short slot,
    // it is no slot.
    if (end > dayEnd) break;

    // Anything overlapping the break is skipped and the cursor jumps to
    // the end of it, rather than shuffling forward minute by minute.
    if (breakStart && breakEnd && cursor < breakEnd && end > breakStart) {
      cursor = new Date(breakEnd);
      continue;
    }

    out.push({ startsAt: new Date(cursor), endsAt: end });
    cursor = end;
  }

  return out;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
  ));
}

/**
 * A wall-clock hour in `timeZone`, as the UTC instant it happens at.
 *
 * Guess the instant as though the zone were UTC, ask what the clock there
 * actually reads at that guess, and correct by the difference. One pass is
 * enough for whole hours: the error is the offset, and applying it lands
 * on the right instant.
 */
function atHour(day: Date, hour: number, timeZone: string): Date {
  const guess = Date.UTC(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour,
  );
  return new Date(guess - offsetAt(guess, timeZone));
}

/** How far `timeZone` is ahead of UTC at a given instant, in milliseconds. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asIfUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    // Intl renders midnight as 24 in some locales.
    get('hour') % 24, get('minute'), get('second'),
  );
  return asIfUtc - utcMs;
}

/** "10:00–17:00, 1 hour each, break 13:00–14:00" — for HR to read back. */
export function describeWindow(w: InterviewWindow): string {
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const length =
    w.slotMinutes % 60 === 0
      ? `${w.slotMinutes / 60} hour${w.slotMinutes === 60 ? '' : 's'}`
      : `${w.slotMinutes} minutes`;

  const parts = [`${hh(w.startHour)}–${hh(w.endHour)}`, `${length} each`];
  if (w.breakStartHour !== null && w.breakEndHour !== null) {
    parts.push(`break ${hh(w.breakStartHour)}–${hh(w.breakEndHour)}`);
  }
  return parts.join(', ');
}
