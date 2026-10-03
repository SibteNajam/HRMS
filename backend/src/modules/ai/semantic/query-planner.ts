import {
  AccessDenied,
  fieldFor,
  metricFor,
  nest,
  scopeFor,
  type RowScope,
  type Viewer,
} from './access-policy.js';
import {
  isGroupable,
  pathOf,
  type EntityDefinition,
  type EntityRegistry,
  type FieldDefinition,
  type MetricDefinition,
  type Row,
} from './entity-definition.js';
import type { HrQuery } from './query-schema.js';

/**
 * Turns a validated query into a plan: a Prisma `where`, the set of columns
 * to read, and what to do with the rows that come back.
 *
 * Pure. No database, no clock, no injection — which is what lets the access
 * rules be tested by assertion rather than by running the application.
 */

const MAX_GROUPS = 50;
const DEFAULT_ROWS = 20;

export interface PlannedMetric {
  name: string;
  def: MetricDefinition;
  /** Path to the value when the metric reads a column rather than computing one. */
  path: string | null;
}

export interface PlannedField {
  name: string;
  def: FieldDefinition;
  path: string;
}

export interface QueryPlan {
  entity: string;
  def: EntityDefinition;
  scope: RowScope;
  /** Always an AND array. The scope is the first element and nothing can displace it. */
  where: Record<string, unknown>;
  /** Nested Prisma `select`, covering every path the plan reads. */
  select: Record<string, unknown>;
  mode: 'aggregate' | 'rows';
  groupBy: PlannedField[];
  metrics: PlannedMetric[];
  fields: PlannedField[];
  orderBy: { key: string; direction: 'asc' | 'desc' } | null;
  limit: number;
}

export function plan(
  registry: EntityRegistry,
  query: HrQuery,
  viewer: Viewer,
): QueryPlan {
  const def = registry[query.entity];
  if (!def) {
    throw new AccessDenied(
      `"${query.entity}" is not something I can look up. ` +
        `Choose one of the entities in the data catalogue.`,
    );
  }

  // Decided before anything else is read, and merged below where no later
  // step can reach it.
  const scope = scopeFor(query.entity, def, viewer);

  const role = viewer.role;
  const groupBy = (query.groupBy ?? []).map((name) => {
    const field = fieldFor(def, query.entity, name, role);
    if (!isGroupable(field)) {
      throw new AccessDenied(
        `"${name}" cannot be grouped by — it is a ${field.type}. ` +
          `Filter on it instead, or group by a name or status.`,
      );
    }
    return { name, def: field, path: pathOf(name, field) };
  });

  const metrics = (query.metrics ?? []).map((name) => {
    const metric = metricFor(def, query.entity, name, role);
    return {
      name,
      def: metric,
      path: metric.field
        ? pathOf(metric.field, fieldFor(def, query.entity, metric.field, role))
        : null,
    };
  });

  // Grouping with nothing to measure means counting. Asking for a metric
  // with no grouping means one total across everything that matched.
  const mode: 'aggregate' | 'rows' =
    groupBy.length > 0 || metrics.length > 0 ? 'aggregate' : 'rows';
  if (mode === 'aggregate' && metrics.length === 0) {
    metrics.push({ name: 'count', def: def.metrics.count, path: null });
  }

  const fields =
    mode === 'rows'
      ? plannedFields(def, query.entity, query.select, role)
      : [];

  const where = buildWhere(def, query, scope, role);
  const orderBy = resolveOrder(def, query, mode, metrics, groupBy, fields, role);

  return {
    entity: query.entity,
    def,
    scope,
    where,
    select: buildSelect(collectPaths(def, groupBy, metrics, fields, role)),
    mode,
    groupBy,
    metrics,
    fields,
    orderBy,
    limit: Math.min(
      query.limit ?? (mode === 'aggregate' ? MAX_GROUPS : DEFAULT_ROWS),
      mode === 'aggregate' ? MAX_GROUPS : 200,
    ),
  };
}

// ─── Pieces ─────────────────────────────────────────────────────────────

function plannedFields(
  def: EntityDefinition,
  entity: string,
  requested: string[] | undefined,
  role: ReturnType<() => Viewer['role']>,
): PlannedField[] {
  // No selection given: return every field this role may see. Better than
  // guessing a subset and leaving out the one that was asked about.
  const names =
    requested && requested.length > 0
      ? requested
      : Object.keys(def.fields).filter((n) => {
          const f = def.fields[n];
          return !f.restrictedTo || f.restrictedTo.includes(role);
        });

  return names.map((name) => {
    const field = fieldFor(def, entity, name, role);
    return { name, def: field, path: pathOf(name, field) };
  });
}

function buildWhere(
  def: EntityDefinition,
  query: HrQuery,
  scope: RowScope,
  role: Viewer['role'],
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];

  // First, and never conditional. Prisma ANDs the array, so a later clause
  // can only ever narrow what this one allows.
  if (scope.where) clauses.push(scope.where);

  for (const filter of query.filters ?? []) {
    const field = fieldFor(def, query.entity, filter.field, role);
    clauses.push(nest(pathOf(filter.field, field), condition(filter, field)));
  }

  return { AND: clauses };
}

type Filter = NonNullable<HrQuery['filters']>[number];

function condition(filter: Filter, field: FieldDefinition): unknown {
  if (filter.op === 'isNull') return { equals: null };
  if (filter.op === 'notNull') return { not: null };

  if (filter.value === undefined) {
    throw new AccessDenied(`"${filter.field}" needs a value to compare against.`);
  }

  if (filter.op === 'in') {
    const list = Array.isArray(filter.value) ? filter.value : [filter.value];
    return { in: list.map((v) => coerce(v, field, filter.field)) };
  }

  if (Array.isArray(filter.value)) {
    throw new AccessDenied(`"${filter.op}" takes a single value, not a list.`);
  }

  const value = coerce(filter.value, field, filter.field);

  switch (filter.op) {
    case 'eq': return { equals: value };
    case 'ne': return { not: value };
    case 'gt': return { gt: value };
    case 'gte': return { gte: value };
    case 'lt': return { lt: value };
    case 'lte': return { lte: value };
    case 'contains':
      if (field.type !== 'string') {
        throw new AccessDenied(`"${filter.field}" is a ${field.type}; "contains" only works on text.`);
      }
      return { contains: String(value) };
  }
}

/**
 * Model output is text. A date filter that stayed a string would silently
 * match nothing, which reads as "there is no data" rather than as an error.
 */
function coerce(
  value: string | number | boolean,
  field: FieldDefinition,
  name: string,
): unknown {
  switch (field.type) {
    case 'date': {
      const date = parseDay(value);
      if (!date) throw new AccessDenied(`"${value}" is not a date I can read. Use YYYY-MM-DD.`);
      return date;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new AccessDenied(`"${name}" needs a number.`);
      return n;
    }
    case 'boolean':
      return value === true || value === 'true' || value === 1 || value === '1';
    case 'enum': {
      const text = String(value).toUpperCase();
      if (field.values && !field.values.includes(text)) {
        throw new AccessDenied(
          `"${value}" is not a value of ${name}. One of: ${field.values.join(', ')}.`,
        );
      }
      return text;
    }
    default:
      return String(value);
  }
}

/** Anchored to UTC, matching how `@db.Date` columns are stored. */
export function parseDay(value: string | number | boolean): Date | null {
  if (typeof value === 'number') return new Date(value);
  const text = String(value).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (ymd) {
    return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveOrder(
  def: EntityDefinition,
  query: HrQuery,
  mode: 'aggregate' | 'rows',
  metrics: PlannedMetric[],
  groupBy: PlannedField[],
  fields: PlannedField[],
  role: Viewer['role'],
): QueryPlan['orderBy'] {
  if (query.orderBy) {
    const key = query.orderBy.key;
    const known =
      metrics.some((m) => m.name === key) ||
      groupBy.some((g) => g.name === key) ||
      fields.some((f) => f.name === key);
    if (!known) {
      // Not an access question — the key simply is not in the result, so
      // sorting by it would be meaningless.
      throw new AccessDenied(
        `Cannot order by "${key}" because it is not in the result. ` +
          `Order by one of: ${[...metrics.map((m) => m.name), ...groupBy.map((g) => g.name), ...fields.map((f) => f.name)].join(', ')}.`,
      );
    }
    return { key, direction: query.orderBy.direction };
  }

  // "Which department has the most overtime" never says "sort descending",
  // but that is always what it means.
  if (mode === 'aggregate') {
    return { key: metrics[0].name, direction: 'desc' };
  }
  if (def.defaultOrder) {
    const field = def.fields[def.defaultOrder.field];
    if (field && (!field.restrictedTo || field.restrictedTo.includes(role))) {
      return { key: def.defaultOrder.field, direction: def.defaultOrder.direction };
    }
  }
  return null;
}

function collectPaths(
  def: EntityDefinition,
  groupBy: PlannedField[],
  metrics: PlannedMetric[],
  fields: PlannedField[],
  role: Viewer['role'],
): string[] {
  const paths = new Set<string>();
  for (const g of groupBy) paths.add(g.path);
  for (const f of fields) paths.add(f.path);
  for (const m of metrics) {
    if (m.path) paths.add(m.path);
    // A computed metric reads columns nobody asked for — overtime needs
    // check-in and check-out even though neither appears in the answer.
    for (const need of m.def.needs ?? []) {
      const field = def.fields[need];
      paths.add(field && (!field.restrictedTo || field.restrictedTo.includes(role))
        ? pathOf(need, field)
        : need);
    }
  }
  // Prisma rejects an empty select; counting still needs one column.
  if (paths.size === 0) paths.add('id');
  return [...paths];
}

/**
 * `['date', 'employee.department.name']`
 *   → `{ date: true, employee: { select: { department: { select: { name: true } } } } }`
 */
export function buildSelect(paths: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const path of paths) {
    const parts = path.split('.');
    let node = root;

    parts.forEach((key, index) => {
      if (index === parts.length - 1) {
        // A leaf wins over a bare relation: selecting `employee` and
        // `employee.firstName` must not drop the name.
        if (typeof node[key] !== 'object') node[key] = true;
        return;
      }
      if (typeof node[key] !== 'object' || node[key] === null) {
        node[key] = { select: {} };
      }
      node = (node[key] as { select: Record<string, unknown> }).select;
    });
  }

  return root;
}

/** Walks a dot path through the nested object Prisma returned. */
export function valueAt(row: Row, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) =>
      node && typeof node === 'object' ? (node as Row)[key] : undefined,
    row,
  );
}
