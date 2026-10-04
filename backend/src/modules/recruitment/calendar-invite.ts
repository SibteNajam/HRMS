/**
 * A calendar invitation, as a .ics attachment.
 *
 * This is the part of "put it in my calendar" that actually works. An
 * interactive calendar inside the email body does not: AMP for Email is
 * the only thing that ever allowed it, fewer than a third of clients
 * render it, and Gmail no longer shows it in the inbox without an opt-in.
 * A link to a page plus an .ics once they have chosen is what every
 * scheduling product does, for that reason.
 *
 * Written by hand because the format is a dozen lines and a dependency
 * here would be a dependency in the path of every interview email.
 * RFC 5545, as far as a single event needs it.
 */

export interface CalendarInvite {
  /** Stable across updates: the same interview must replace, not duplicate. */
  uid: string;
  /** Bumped on every send, so a later version wins in the client. */
  sequence: number;
  startsAt: Date;
  endsAt: Date;
  title: string;
  description: string;
  /** A meeting URL, when there is one. */
  location?: string;
  organiser: { name: string; email: string };
  attendee: { name: string; email: string };
  cancelled?: boolean;
}

export function buildInvite(invite: CalendarInvite): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI-HRMS//Recruitment//EN',
    'CALSCALE:GREGORIAN',
    // REQUEST is what makes a client offer "add to calendar" rather than
    // treating the file as an attachment to download.
    `METHOD:${invite.cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(invite.startsAt)}`,
    `DTEND:${stamp(invite.endsAt)}`,
    `SUMMARY:${escape(invite.title)}`,
    `DESCRIPTION:${escape(invite.description)}`,
    ...(invite.location ? [`LOCATION:${escape(invite.location)}`] : []),
    ...(invite.location ? [`URL:${escape(invite.location)}`] : []),
    `ORGANIZER;CN=${escape(invite.organiser.name)}:mailto:${invite.organiser.email}`,
    `ATTENDEE;CN=${escape(invite.attendee.name)};ROLE=REQ-PARTICIPANT;` +
      `PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${invite.attendee.email}`,
    `STATUS:${invite.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    // A reminder the day before and an hour before. Nobody has ever
    // complained about being reminded of an interview.
    ...(invite.cancelled ? [] : [
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(invite.title)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(invite.title)}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // CRLF, not LF, and a terminator after the last line too: RFC 5545
  // terminates content lines rather than separating them, and some
  // parsers — Outlook among them — are strict about both.
  return `${lines.flatMap(fold).join('\r\n')}\r\n`;
}

/** UTC basic format: 20261006T060000Z. */
function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Escapes the four characters the format gives meaning to.
 *
 * A comma in a job title would otherwise split the field and the event
 * arrives with half a name, or not at all.
 */
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Lines over 75 octets are continued with a leading space.
 *
 * Measured in bytes rather than characters: a description with an em dash
 * in it is longer than it looks, and a line split mid-character produces a
 * file some clients refuse outright.
 */
function fold(line: string): string[] {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return [line];

  const out: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut a multi-byte character in half.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;

    out.push(
      (out.length === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'),
    );
    start = end;
    limit = 74; // the continuation space counts toward the next line
  }
  return out;
}
