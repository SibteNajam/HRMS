/**
 * Display formatting. Never render an ISO date or a raw number in the UI —
 * ISO is a storage format, not a reading format.
 */

const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? 'PKR';
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? 'en-GB';

export function formatCurrency(value: number | string, currency = CURRENCY) {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Compact form for stat tiles: 4.2M rather than 4,235,000.00 */
export function formatCompactCurrency(value: number | string, currency = CURRENCY) {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1) {
  return `${formatNumber(value, decimals)}%`;
}

/** 12 Mar 2025 */
export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/** 12 Mar 2025, 09:04 */
export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

/** 09:04 */
export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

/** "2 hours ago" under 7 days, absolute date beyond that. */
export function formatRelative(date: string | Date) {
  const then = new Date(date).getTime();
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / 86_400_000);
  if (days >= 7) return formatDate(date);

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const mins = Math.round(diffMs / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-days, 'day');
}

/** 6h 22m */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}
