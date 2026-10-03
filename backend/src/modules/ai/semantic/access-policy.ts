import { Role } from '../../../common/enums/role.enum.js';
import type {
  EntityDefinition,
  EntityRegistry,
  FieldDefinition,
  MetricDefinition,
} from './entity-definition.js';

/**
 * The one place row and column access is decided.
 *
 * Previously this boundary was repeated inside every hand-written tool: each
 * one had to remember to read the employee id from the session rather than
 * the model's arguments. Twenty-one chances to get it wrong. Here it is
 * decided once, from the declaration, and the query builder cannot run
 * without it.
 *
 * Everything in this file is pure. It takes a role and a declaration and
 * returns a decision, which is why it can be tested exhaustively.
 */

/** Refused on access grounds. Carries no detail about what exists. */
export class AccessDenied extends Error {}

export interface Viewer {
  role: Role;
  /** employees.id, from the verified session. Null for an account with no employee record. */
  employeeId: number | null;
}

export interface RowScope {
  /**
   * A Prisma `where` fragment that pins the query to rows this viewer owns,
   * or null when they are entitled to every row.
   *
   * Merged into the query by the translator as an AND, after the model's own
   * filters, so no filter the model writes can widen it.
   */
  where: Record<string, unknown> | null;
  /** For the audit line: what was actually applied. */
  describe: string;
}

// ─── Entities ───────────────────────────────────────────────────────────

/** Whether a viewer may reach an entity at all. */
export function canUseEntity(def: EntityDefinition, role: Role): boolean {
  return def.access.roles.includes(role);
}

export function entitiesFor(registry: EntityRegistry, role: Role): string[] {
  return Object.entries(registry)
    .filter(([, def]) => canUseEntity(def, role))
    .map(([name]) => name)
    .sort();
}

/**
 * Decides which rows a viewer may see.
 *
 * Fails closed in every direction:
 *   - an entity the role cannot use is refused
 *   - a restricted role on an entity with no ownership path is refused,
 *     rather than being shown everything
 *   - a restricted viewer with no employee record is refused, rather than
 *     being scoped to `undefined` and matching every row
 */
export function scopeFor(
  name: string,
  def: EntityDefinition,
  viewer: Viewer,
): RowScope {
  if (!canUseEntity(def, viewer.role)) {
    throw new AccessDenied(`There is no "${name}" data available to you.`);
  }

  if (def.access.seesEveryone.includes(viewer.role)) {
    return { where: null, describe: 'all records' };
  }

  // Company-wide data with no owner: holidays, leave types, departments.
  if (def.access.shared) {
    return { where: null, describe: 'company-wide records' };
  }

  // The fail-closed case that matters. An entity declared without an
  // ownership path and without `shared` cannot be scoped, so it is refused
  // rather than guessed at. Forgetting a line in the registry closes an
  // entity; it never opens one.
  if (!def.access.ownedVia) {
    throw new AccessDenied(`There is no "${name}" data available to you.`);
  }

  if (viewer.employeeId === null) {
    throw new AccessDenied(
      'This account has no employee record, so it has no personal HR data.',
    );
  }

  return {
    where: nest(def.access.ownedVia, viewer.employeeId),
    describe: 'your own records only',
  };
}

/**
 * `employeeId` → `{ employeeId: 7 }`
 * `employee.id` → `{ employee: { id: 7 } }`
 */
export function nest(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  return parts.reduceRight<Record<string, unknown>>(
    (acc, key, index) => ({ [key]: index === parts.length - 1 ? value : acc }),
    {},
  );
}

// ─── Fields and metrics ─────────────────────────────────────────────────

export function canSeeField(field: FieldDefinition, role: Role): boolean {
  return !field.restrictedTo || field.restrictedTo.includes(role);
}

export function canSeeMetric(metric: MetricDefinition, role: Role): boolean {
  return !metric.restrictedTo || metric.restrictedTo.includes(role);
}

/**
 * Resolves a field name the model used.
 *
 * A restricted field is reported as unknown, not as forbidden. "You may not
 * see baseSalary" confirms that baseSalary exists and that somebody can; an
 * unknown-field message tells the model to pick something else and tells the
 * person nothing.
 */
export function fieldFor(
  def: EntityDefinition,
  entity: string,
  name: string,
  role: Role,
): FieldDefinition {
  const field = def.fields[name];
  if (!field || !canSeeField(field, role)) {
    throw new AccessDenied(
      `"${name}" is not a field of ${entity}. Available: ${visibleFieldNames(def, role).join(', ')}.`,
    );
  }
  return field;
}

export function metricFor(
  def: EntityDefinition,
  entity: string,
  name: string,
  role: Role,
): MetricDefinition {
  const metric = def.metrics[name];
  if (!metric || !canSeeMetric(metric, role)) {
    throw new AccessDenied(
      `"${name}" is not a metric of ${entity}. Available: ${visibleMetricNames(def, role).join(', ')}.`,
    );
  }
  return metric;
}

export function visibleFieldNames(def: EntityDefinition, role: Role): string[] {
  return Object.entries(def.fields)
    .filter(([, f]) => canSeeField(f, role))
    .map(([name]) => name);
}

export function visibleMetricNames(def: EntityDefinition, role: Role): string[] {
  return Object.entries(def.metrics)
    .filter(([, m]) => canSeeMetric(m, role))
    .map(([name]) => name);
}
