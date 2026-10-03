import { z } from 'zod';

/**
 * The structure the model fills in instead of writing SQL.
 *
 * It is a fixed shape with a fixed vocabulary, so an invalid query is
 * rejected by this schema before anything reaches the database. There is no
 * free text anywhere in it — nothing the model emits is ever concatenated
 * into a statement.
 */

export const FILTER_OPS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'isNull', 'notNull',
] as const;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const QuerySchema = z.object({
  entity: z.string().min(1),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(FILTER_OPS),
        value: z.union([scalar, z.array(scalar)]).optional(),
      }),
    )
    .max(8)
    .optional(),
  /** Two levels is plenty — "overtime by department by month" is already a lot to read. */
  groupBy: z.array(z.string().min(1)).max(2).optional(),
  metrics: z.array(z.string().min(1)).max(6).optional(),
  /** Which fields to return when listing rows rather than aggregating. */
  select: z.array(z.string().min(1)).max(12).optional(),
  orderBy: z
    .object({
      key: z.string().min(1),
      direction: z.enum(['asc', 'desc']).default('desc'),
    })
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type HrQuery = z.infer<typeof QuerySchema>;

/**
 * The same shape as JSON Schema, for the tool definition sent to the model.
 * Kept beside the validator deliberately — a test asserts the two agree, so
 * they cannot drift into describing different things.
 */
export const QUERY_JSON_SCHEMA = {
  entity: {
    type: 'string',
    description: 'Which entity to query. Must be one from the data catalogue.',
  },
  filters: {
    type: 'array',
    description: 'Conditions every returned row must satisfy. Combined with AND.',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'A field of the chosen entity' },
        op: { type: 'string', enum: [...FILTER_OPS] },
        value: {
          description:
            'The value to compare against. An array for "in". Omit for ' +
            '"isNull" and "notNull". Dates are YYYY-MM-DD.',
        },
      },
      required: ['field', 'op'],
    },
  },
  groupBy: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Fields to group by, for questions like "by department". ' +
      'Leave empty to list individual rows.',
  },
  metrics: {
    type: 'array',
    items: { type: 'string' },
    description:
      'What to measure in each group, from the entity\'s metrics. ' +
      'Defaults to count when grouping.',
  },
  select: {
    type: 'array',
    items: { type: 'string' },
    description: 'Fields to return when listing rows. Ignored when grouping.',
  },
  orderBy: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'A metric name when grouping, otherwise a field' },
      direction: { type: 'string', enum: ['asc', 'desc'] },
    },
    required: ['key'],
  },
  limit: {
    type: 'integer',
    description: 'How many rows or groups to return. Default 20, maximum 200.',
  },
} as const;
