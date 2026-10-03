import type { ComputeContext, Row } from './entity-definition.js';
import type { PlannedMetric, QueryPlan } from './query-planner.js';
import { valueAt } from './query-planner.js';

/**
 * Aggregation and presentation. Pure, so every figure the assistant reports
 * can be checked by a test rather than by asking it.
 *
 * Grouping happens here rather than in SQL because the useful groupings are
 * across relations — overtime by department, leave by job title — and
 * because overtime is derived from two timestamps rather than stored. One
 * path that is always correct beats two paths where only one handles the
 * interesting half of the questions.
 */

export interface AggregateRow {
  [key: string]: string | number | null;
}

export interface QueryResult {
  entity: string;
  /** Which rows this viewer was shown, in words, for the audit line. */
  scope: string;
  /** Rows matching the filters before grouping or limiting. */
  matched: number;
  groupedBy?: string[];
  results: AggregateRow[];
  truncated?: string;
}

/** What a group key looks like before it is turned back into text. */
const NO_VALUE = 'Unspecified';

export function summarise(
  plan: QueryPlan,
  rows: Row[],
  matched: number,
  ctx: ComputeContext,
): QueryResult {
  const base = { entity: plan.entity, scope: plan.scope.describe, matched };

  if (plan.mode === 'rows') {
    const results = rows.slice(0, plan.limit).map((row) => {
      const out: AggregateRow = {};
      for (const field of plan.fields) {
        out[field.name] = present(valueAt(row, field.path), field.def.type);
      }
      return out;
    });
    const ordered = plan.orderBy ? sortBy(results, plan.orderBy) : results;
    return {
      ...base,
      results: ordered,
      ...(matched > ordered.length
        ? { truncated: `Showing ${ordered.length} of ${matched} records.` }
        : {}),
    };
  }

  const buckets = new Map<string, { labels: AggregateRow; rows: Row[] }>();

  for (const row of rows) {
    const labels: AggregateRow = {};
    for (const group of plan.groupBy) {
      labels[group.name] = present(valueAt(row, group.path), group.def.type) ?? NO_VALUE;
    }
    // A query with no groupBy collapses to one bucket: the grand total.
    const key = plan.groupBy.map((g) => String(labels[g.name])).join('\u0000');
    const bucket = buckets.get(key) ?? { labels, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  const results = [...buckets.values()].map(({ labels, rows: bucketRows }) => {
    const out: AggregateRow = { ...labels };
    for (const metric of plan.metrics) {
      out[metric.name] = reduce(metric, bucketRows, ctx);
    }
    return out;
  });

  const ordered = plan.orderBy ? sortBy(results, plan.orderBy) : results;

  return {
    ...base,
    ...(plan.groupBy.length ? { groupedBy: plan.groupBy.map((g) => g.name) } : {}),
    results: ordered.slice(0, plan.limit),
    ...(ordered.length > plan.limit
      ? { truncated: `Showing the top ${plan.limit} of ${ordered.length} groups.` }
      : {}),
  };
}

// ─── Aggregation ────────────────────────────────────────────────────────

function reduce(metric: PlannedMetric, rows: Row[], ctx: ComputeContext): number | null {
  if (metric.def.agg === 'count') return rows.length;

  // A null means "no value here", not zero. A day still in progress has no
  // overtime yet; counting it as zero would drag an average down.
  const values: number[] = [];
  for (const row of rows) {
    const value = metric.def.compute
      ? metric.def.compute(row, ctx)
      : toNumber(valueAt(row, metric.path ?? ''));
    if (value !== null && Number.isFinite(value)) values.push(value);
  }

  if (values.length === 0) return null;

  switch (metric.def.agg) {
    case 'sum': return round(values.reduce((a, b) => a + b, 0));
    case 'avg': return round(values.reduce((a, b) => a + b, 0) / values.length);
    case 'min': return round(Math.min(...values));
    case 'max': return round(Math.max(...values));
    default: return null;
  }
}

/** Two decimals: money and percentages both read wrong with float noise. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortBy(
  rows: AggregateRow[],
  order: { key: string; direction: 'asc' | 'desc' },
): AggregateRow[] {
  const sign = order.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[order.key];
    const right = b[order.key];
    // Nulls last whichever way the sort runs — an empty group is never the
    // answer to "which is highest".
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * sign;
    }
    return String(left).localeCompare(String(right)) * sign;
  });
}

// ─── Presentation ───────────────────────────────────────────────────────

/** Prisma gives back Decimal objects and Dates; neither survives JSON usefully. */
export function present(value: unknown, type: string): string | number | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    // A `@db.Date` column comes back at midnight UTC. Printing a time on it
    // invites the model to talk about when something happened on a day that
    // has no time.
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }

  if (type === 'number') {
    const n = toNumber(value);
    return n === null ? null : round(n);
  }

  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number' || typeof value === 'string') return value;

  // Prisma's Decimal, and anything else that defines its own toString. An
  // object that does not would stringify to "[object Object]", which is
  // worse in an answer than saying nothing.
  if (typeof value === 'object' && 'toString' in value) {
    const text = (value as { toString(): string }).toString();
    return text === '[object Object]' ? null : text;
  }
  return null;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
