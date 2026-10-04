import { describe, expect, it } from 'vitest';
import { buildInvite, type CalendarInvite } from './calendar-invite.js';

function invite(over: Partial<CalendarInvite> = {}): CalendarInvite {
  return {
    uid: 'interview-6@ai-hrms',
    sequence: 0,
    startsAt: new Date('2026-10-06T06:00:00.000Z'),
    endsAt: new Date('2026-10-06T07:00:00.000Z'),
    title: 'Interview — Senior Backend Engineer',
    description: 'We look forward to speaking with you.',
    organiser: { name: 'AI-HRMS', email: 'hr@example.com' },
    attendee: { name: 'Nadia Rauf', email: 'nadia@example.com' },
    ...over,
  };
}

/** Trailing CRLF means the final split is empty; drop it. */
const lines = (ics: string) => ics.trimEnd().split('\r\n');
const field = (ics: string, name: string) =>
  lines(ics).find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe('the calendar file', () => {
  it('is a single event between the right two instants', () => {
    const ics = buildInvite(invite());
    expect(field(ics, 'DTSTART')).toBe('DTSTART:20261006T060000Z');
    expect(field(ics, 'DTEND')).toBe('DTEND:20261006T070000Z');
  });

  it('opens and closes properly', () => {
    const ics = buildInvite(invite());
    expect(lines(ics)[0]).toBe('BEGIN:VCALENDAR');
    expect(lines(ics).at(-1)).toBe('END:VCALENDAR');
  });

  it('terminates every line with CRLF, including the last', () => {
    const ics = buildInvite(invite());
    expect(ics.endsWith('\r\n')).toBe(true);
    // Split on LF: every piece except the trailing empty one must carry
    // its CR, or a strict parser rejects the file.
    expect(ics.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('asks the client to add it rather than just download it', () => {
    expect(buildInvite(invite())).toContain('METHOD:REQUEST');
  });

  it('carries the meeting link where a client will find it', () => {
    const ics = buildInvite(invite({ location: 'https://meet.google.com/abc-defg-hij' }));
    expect(field(ics, 'LOCATION')).toContain('meet.google.com');
    expect(field(ics, 'URL')).toContain('meet.google.com');
  });

  it('leaves the location out when there is none', () => {
    expect(field(buildInvite(invite()), 'LOCATION')).toBeUndefined();
  });

  it('reminds them a day before and an hour before', () => {
    const ics = buildInvite(invite());
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT1H');
  });
});

describe('escaping', () => {
  it('escapes a comma, which would otherwise split the field', () => {
    const ics = buildInvite(invite({ title: 'Interview, second round' }));
    expect(field(ics, 'SUMMARY')).toBe('SUMMARY:Interview\\, second round');
  });

  it('escapes semicolons and backslashes', () => {
    const ics = buildInvite(invite({ title: 'A; B \\ C' }));
    // A semicolon separates parameters in this format, so an unescaped
    // one truncates the field. The escape was silently dropped once
    // because '\;' in a JS string is just ';'.
    expect(field(ics, 'SUMMARY')).toBe('SUMMARY:A\\; B \\\\ C');
  });

  it('turns a newline into the literal the format expects', () => {
    const ics = buildInvite(invite({ description: 'First line\nSecond line' }));
    expect(ics).toContain('First line\\nSecond line');
  });
});

describe('folding long lines', () => {
  it('leaves a short line alone', () => {
    expect(field(buildInvite(invite()), 'UID')).toBe('UID:interview-6@ai-hrms');
  });

  it('continues a long line with a leading space', () => {
    const ics = buildInvite(invite({ description: 'x'.repeat(300) }));
    const continued = lines(ics).filter((l) => l.startsWith(' '));
    expect(continued.length).toBeGreaterThan(0);
    for (const line of lines(ics)) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a character in half', () => {
    // An em dash is three bytes. Cut between them and the file is invalid.
    const ics = buildInvite(invite({ description: '— '.repeat(80) }));
    for (const line of lines(ics)) {
      // A broken split would leave a replacement character behind.
      expect(line).not.toContain('�');
    }
    expect(ics.replace(/\r\n /g, '')).toContain('— — —');
  });
});

describe('cancelling', () => {
  it('says so, so the client removes it', () => {
    const ics = buildInvite(invite({ cancelled: true, sequence: 1 }));
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(field(ics, 'SEQUENCE')).toBe('SEQUENCE:1');
  });

  it('drops the reminders', () => {
    expect(buildInvite(invite({ cancelled: true }))).not.toContain('BEGIN:VALARM');
  });

  it('keeps the same uid, so it replaces rather than duplicates', () => {
    const booked = buildInvite(invite());
    const cancelled = buildInvite(invite({ cancelled: true, sequence: 1 }));
    expect(field(booked, 'UID')).toBe(field(cancelled, 'UID'));
  });
});
