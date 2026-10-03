import type { Role } from '../../../common/enums/role.enum.js';
import type { AttendancePolicy } from '../../attendance/attendance-policy.js';

/**
 * The vocabulary the assistant is allowed to think in.
 *
 * Everything the model can read is declared here as data. Nothing is
 * discovered from the database at runtime, so a column added to the schema is
 * invisible to the assistant until somebody deliberately names it. That is
 * the opposite of handing over the schema and hoping the prompt holds.
 *
 * The registry replaces one hand-written function per question with one
 * declaration per table. See docs/18-ai-query-architecture.md.
 */

// ─── Rows ───────────────────────────────────────────────────────────────

/** A row as Prisma returns it: scalars, Dates, Decimals and nested objects. */
export type Row = Record<string, unknown>;

/**
 * Whatever a computed metric needs that is not on the row itself.
 *
 * The attendance policy is passed in rather than imported so a derived
 * figure here uses the same thresholds payroll uses — one source, not two.
 */
export interface ComputeContext {
  policy: AttendancePolicy;
}

// ─── Fields ─────────────────────────────────────────────────────────────

export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum';

export interface FieldDefinition {
  type: FieldType;
  /**
   * Dot path from the row to the value, when the field is not a plain column
   * on this model. `department` on attendance is
   * `employee.department.name`.
   */
  path?: string;
  /** The permitted values of an enum. Shown to the model so it stops guessing. */
  values?: readonly string[];
  /**
   * Roles that may see or filter on this field.
   *
   * Omitted means every role that can reach the entity at all. Use it for
   * columns that stay hidden even on a row the person owns.
   */
  restrictedTo?: readonly Role[];
  /** Whether this may appear in groupBy. Defaults by type — see `isGroupable`. */
  groupable?: boolean;
  /** One short line for the catalogue, when the name alone is not enough. */
  describe?: string;
}

/** Dates and numbers make useless groups; names, statuses and flags make good ones. */
export function isGroupable(field: FieldDefinition): boolean {
  return field.groupable ?? (field.type === 'string' || field.type === 'enum' || field.type === 'boolean');
}

/** Where a field's value actually lives. */
export function pathOf(name: string, field: FieldDefinition): string {
  return field.path ?? name;
}

// ─── Metrics ────────────────────────────────────────────────────────────

export type Aggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface MetricDefinition {
  agg: Aggregation;
  /** Which declared field to aggregate. Omitted for `count`. */
  field?: string;
  /**
   * For a figure that is not stored — overtime is derived from check-in and
   * check-out, not a column. Returning null leaves the row out of the
   * aggregate rather than counting it as zero.
   */
  compute?: (row: Row, ctx: ComputeContext) => number | null;
  /** Columns `compute` reads. They are selected even when nobody asked for them. */
  needs?: readonly string[];
  describe: string;
  restrictedTo?: readonly Role[];
}

// ─── Access ─────────────────────────────────────────────────────────────

export interface EntityAccess {
  /** Roles permitted to query this entity at all. */
  roles: readonly Role[];
  /**
   * Roles that see every row. Any other role is restricted to its own rows
   * by `ownedVia`, with no way to opt out.
   */
  seesEveryone: readonly Role[];
  /**
   * Dot path from a row to the employee id that owns it — `employeeId` on
   * attendance, `id` on employee.
   *
   * Required for anything personal. A restricted role querying an entity
   * without it is refused outright, so forgetting this line closes the
   * entity rather than opening it.
   */
  ownedVia?: string;
  /**
   * Company-wide data that belongs to nobody: holidays, leave types, the
   * list of departments. Set this ONLY when a row genuinely has no owner —
   * it is what turns off the ownership requirement above.
   */
  shared?: boolean;
}

// ─── Entities ───────────────────────────────────────────────────────────

/**
 * Prisma models the registry may reach. Narrow on purpose: `users` is not
 * here, so no query can touch a password hash by any route.
 */
export type EntityModel =
  | 'attendance'
  | 'leaveRequest'
  | 'leaveBalance'
  | 'leaveType'
  | 'employee'
  | 'department'
  | 'payslip'
  | 'payrollRun'
  | 'due'
  | 'holiday';

export interface EntityDefinition {
  model: EntityModel;
  /** What one row means, in a sentence the model reads when choosing. */
  describe: string;
  access: EntityAccess;
  fields: Record<string, FieldDefinition>;
  metrics: Record<string, MetricDefinition>;
  /** Applied when the query asks for rows and names no order. */
  defaultOrder?: { field: string; direction: 'asc' | 'desc' };
}

export type EntityRegistry = Record<string, EntityDefinition>;
