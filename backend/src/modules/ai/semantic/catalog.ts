import type { Role } from '../../../common/enums/role.enum.js';
import { canSeeField, canSeeMetric, canUseEntity } from './access-policy.js';
import { isGroupable, type EntityDefinition, type EntityRegistry } from './entity-definition.js';
import { REGISTRY } from './entity-registry.js';

/**
 * What the model is told about the data, generated from the registry and
 * never written by hand. Declare an entity and the assistant learns it on
 * the next message; nobody edits a prompt.
 *
 * Split in two on purpose:
 *
 *   the INDEX     — entity names and one line each. Small enough to sit in
 *                   every system prompt.
 *   the DETAIL    — fields and metrics for one entity, fetched by a tool
 *                   call only when the model is actually composing a query.
 *
 * Putting the full detail in every prompt cost around 1,100 tokens a
 * message whether or not anyone asked a question that needed it. On a tier
 * that caps tokens per minute that is the difference between answering and
 * being rate-limited, so the detail is paid for only when it is used.
 *
 * Both are role-shaped. An employee's index never mentions `payrollRun` and
 * their detail never mentions `baseSalary`, so the model is not declining to
 * answer something it knows about — it does not know the field exists.
 */

/** Entity names and what each holds. Goes in the system prompt. */
export function buildIndex(role: Role, registry: EntityRegistry = REGISTRY): string {
  return Object.entries(registry)
    .filter(([, def]) => canUseEntity(def, role))
    .map(([name, def]) => `- ${name}: ${def.describe}${scopeNote(def, role)}`)
    .join('\n');
}

/** Everything needed to query one entity. Returned by describe_hr_entity. */
export function describeEntity(
  name: string,
  def: EntityDefinition,
  role: Role,
): {
  entity: string;
  describe: string;
  scope: string;
  fields: { name: string; type: string; values?: string[]; groupable: boolean; note?: string }[];
  metrics: { name: string; describe: string }[];
} {
  return {
    entity: name,
    describe: def.describe,
    scope: def.access.seesEveryone.includes(role)
      ? 'Every record in the company.'
      : def.access.shared
        ? 'Company-wide policy data.'
        : 'Their own records only. This is applied before the query runs — never filter by person to achieve it.',
    fields: Object.entries(def.fields)
      .filter(([, f]) => canSeeField(f, role))
      .map(([fieldName, f]) => ({
        name: fieldName,
        type: f.type,
        ...(f.values ? { values: [...f.values] } : {}),
        groupable: isGroupable(f),
        ...(f.describe ? { note: f.describe } : {}),
      })),
    metrics: Object.entries(def.metrics)
      .filter(([, m]) => canSeeMetric(m, role))
      .map(([metricName, m]) => ({ name: metricName, describe: m.describe })),
  };
}

function scopeNote(def: EntityDefinition, role: Role): string {
  // Only worth the tokens when it changes what comes back.
  return def.access.seesEveryone.includes(role) || def.access.shared
    ? ''
    : ' (their own records only)';
}

/**
 * The short version that sits in every system prompt: how to ask, plus the
 * index. The detailed field list is one tool call away.
 */
export function queryGuidance(role: Role): string {
  return `HR DATA

Named tools cover the common questions. For anything they do not — a total,
a ranking, a breakdown by department or job title, a filter combination —
compose it with query_hr_data instead of saying you cannot.

Call describe_hr_entity first to see an entity's fields and metrics, then
query_hr_data:
  {"entity":"attendance","filters":[{"field":"date","op":"gte","value":"2026-09-01"}],
   "groupBy":["department"],"metrics":["overtimeMinutes"]}

- filters combine with AND. ops: eq ne gt gte lt lte contains in isNull notNull.
- groupBy takes names, statuses and job titles, not dates or amounts.
- orderBy defaults to the first metric descending, which is what "most" and
  "highest" mean. Omit metrics and it counts rows.
- Dates are YYYY-MM-DD; resolve "last month" before calling.
- Only the listed fields exist. If a query returns an "error" it names the
  real ones — fix the query and call again rather than giving up.
- Scoping is applied by the system. Never filter by a person to limit
  results to whoever is asking.

ENTITIES
${buildIndex(role)}`;
}
