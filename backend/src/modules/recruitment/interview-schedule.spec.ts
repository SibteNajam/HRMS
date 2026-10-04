import { describe, expect, it } from 'vitest';
import {
  describeWindow, generateSlots, InvalidWindow, validateWindow,
  type InterviewWindow,
} from './interview-schedule.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The window from the brief: 1–15 Oct, 10–17, hour slots, 13–14 break. */
function window(over: Partial<InterviewWindow> = {}): InterviewWindow {
  return {
    from: d('2026-10-01'),
    to: d('2026-10-01'),
    startHour: 10,
    endHour: 17,
    breakStartHour: 13,
    breakEndHour: 14,
    slotMinutes: 60,
    // UTC by default so the arithmetic tests read as written; the zone
    // itself gets its own tests below.
    timeZone: 'UTC',
    ...over,
  };
}

const times = (slots: { startsAt: Date }[]) =>
  slots.map((s) => s.startsAt.toISOString().slice(11, 16));

describe('slots in a day', () => {
  it('gives six hours between ten and five with an hour for lunch', () => {
    // 10-17 is seven hours; one goes to the break.
    expect(times(generateSlots(window()))).toEqual([
      '10:00', '11:00', '12:00', '14:00', '15:00', '16:00',
    ]);
  });

  it('leaves nothing overlapping the break', () => {
    const slots = generateSlots(window());
    for (const s of slots) {
      const hour = s.startsAt.getUTCHours();
      expect(hour, `${hour}:00 falls in the break`).not.toBe(13);
    }
  });

  it('fills the day when there is no break', () => {
    expect(times(generateSlots(window({ breakStartHour: null, breakEndHour: null }))))
      .toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('handles half-hour slots', () => {
    const slots = generateSlots(
      window({ slotMinutes: 30, endHour: 12, breakStartHour: null, breakEndHour: null }),
    );
    expect(times(slots)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('never runs a slot past the end of the day', () => {
    // 10:00-17:00 with 90-minute slots: four fit, the fifth would end at
    // 17:30 and is simply not offered.
    const slots = generateSlots(
      window({ slotMinutes: 90, breakStartHour: null, breakEndHour: null }),
    );
    expect(times(slots)).toEqual(['10:00', '11:30', '13:00', '14:30']);
    expect(slots.at(-1)!.endsAt.toISOString().slice(11, 16)).toBe('16:00');
  });

  it('builds the times in UTC', () => {
    // A local-midnight Date lands on the previous day east of Greenwich,
    // which is where this runs.
    expect(generateSlots(window())[0].startsAt.toISOString())
      .toBe('2026-10-01T10:00:00.000Z');
  });
});

describe('slots across a range', () => {
  it('covers every day between the two dates', () => {
    const slots = generateSlots(window({ from: d('2026-10-01'), to: d('2026-10-03') }));
    const days = [...new Set(slots.map((s) => s.startsAt.toISOString().slice(0, 10)))];
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(slots).toHaveLength(18);
  });

  it('skips the weekend when told which days it is', () => {
    // 3 and 4 October 2026 are a Saturday and a Sunday.
    const slots = generateSlots(
      window({ from: d('2026-10-01'), to: d('2026-10-05') }),
      [0, 6],
    );
    const days = [...new Set(slots.map((s) => s.startsAt.toISOString().slice(0, 10)))];
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-05']);
  });

  it('produces the full fortnight from the brief', () => {
    // 1-15 October, weekdays only, six slots a day.
    const slots = generateSlots(
      window({ from: d('2026-10-01'), to: d('2026-10-15') }),
      [0, 6],
    );
    expect(slots).toHaveLength(11 * 6);
  });

  it('handles a single day', () => {
    expect(generateSlots(window({ from: d('2026-10-01'), to: d('2026-10-01') })))
      .toHaveLength(6);
  });
});

describe('windows that make no sense', () => {
  it('refuses dates that run backwards', () => {
    expect(() => generateSlots(window({ from: d('2026-10-10'), to: d('2026-10-01') })))
      .toThrow(InvalidWindow);
  });

  it('refuses hours that run backwards', () => {
    expect(() => validateWindow(window({ startHour: 17, endHour: 10 })))
      .toThrow(InvalidWindow);
  });

  it('refuses a break outside the interview hours', () => {
    expect(() => validateWindow(window({ breakStartHour: 8, breakEndHour: 9 })))
      .toThrow(InvalidWindow);
  });

  it('refuses a break that ends before it starts', () => {
    expect(() => validateWindow(window({ breakStartHour: 14, breakEndHour: 13 })))
      .toThrow(InvalidWindow);
  });

  it('refuses a window that would produce hundreds of slots', () => {
    // A year of ten-minute slots is a mistake, not a hiring round.
    expect(() => generateSlots(
      window({ from: d('2026-01-01'), to: d('2026-12-31'), slotMinutes: 10 }),
    )).toThrow(InvalidWindow);
  });
});

describe('describing a window back to HR', () => {
  it('reads as a sentence', () => {
    expect(describeWindow(window())).toBe('10:00–17:00, 1 hour each, break 13:00–14:00');
  });

  it('leaves the break out when there is none', () => {
    expect(describeWindow(window({ breakStartHour: null, breakEndHour: null })))
      .toBe('10:00–17:00, 1 hour each');
  });

  it('says minutes when the slot is not whole hours', () => {
    expect(describeWindow(window({ slotMinutes: 45 })))
      .toContain('45 minutes each');
  });
});


describe('the hours are local, not UTC', () => {
  // HR typing "10:00" means ten in the morning where they are. Building
  // the slot at 10:00 UTC put it at 15:00 across Pakistan — a nine-to-five
  // interview day that ran into the evening.
  const inZone = (zone: string) =>
    generateSlots(window({ timeZone: zone, breakStartHour: null, breakEndHour: null }));

  it('turns 10:00 in Karachi into 05:00 UTC', () => {
    expect(inZone('Asia/Karachi')[0].startsAt.toISOString())
      .toBe('2026-10-01T05:00:00.000Z');
  });

  it('shows back as 10:00 to somebody in Karachi', () => {
    const first = inZone('Asia/Karachi')[0].startsAt;
    const shown = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Karachi',
    }).format(first);
    expect(shown).toBe('10:00');
  });

  it('leaves UTC alone', () => {
    expect(inZone('UTC')[0].startsAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('handles a zone behind UTC', () => {
    // New York in October is UTC-4.
    expect(inZone('America/New_York')[0].startsAt.toISOString())
      .toBe('2026-10-01T14:00:00.000Z');
  });

  it('keeps the whole day in the right order', () => {
    const slots = inZone('Asia/Karachi');
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i].startsAt.getTime()).toBeGreaterThan(slots[i - 1].startsAt.getTime());
    }
  });

  it('still skips the break in local hours', () => {
    const slots = generateSlots(window({ timeZone: 'Asia/Karachi' }));
    const local = slots.map((s) =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Karachi',
      }).format(s.startsAt),
    );
    expect(local).toEqual(['10:00', '11:00', '12:00', '14:00', '15:00', '16:00']);
  });
});
