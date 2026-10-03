import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AttendanceService } from '../../attendance/attendance.service.js';
import type { JwtUser } from '../../../common/types/jwt-user.js';
import { AccessDenied, canUseEntity, entitiesFor, type Viewer } from './access-policy.js';
import { describeEntity } from './catalog.js';
import { REGISTRY } from './entity-registry.js';
import type { EntityModel, Row } from './entity-definition.js';
import { plan } from './query-planner.js';
import { QuerySchema } from './query-schema.js';
import { summarise, type QueryResult } from './query-runner.js';

/**
 * One tool, every question.
 *
 * The model names an entity, some filters, a grouping and a metric. This
 * service checks all of it against the registry, pins the rows to whoever is
 * asking, runs it and hands back figures. Adding a table to the registry
 * adds every question about that table at once.
 *
 * It cannot write. The only two Prisma methods reached from here are `count`
 * and `findMany`, and the entity list in the registry does not include
 * `users`, so there is no path to a password hash either.
 */

/**
 * Grouping happens in memory, so an unbounded match would mean loading the
 * table. Rather than silently aggregating a slice — which produces a
 * confident wrong total — the query is refused and the model is told to
 * narrow it.
 */
const MAX_SCAN_ROWS = 5_000;

interface ReadOnlyDelegate {
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
}

@Injectable()
export class SemanticQueryService {
  private readonly logger = new Logger(SemanticQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * The fields and metrics of one entity, for the model to compose against.
   *
   * Kept out of the system prompt and fetched on demand: the full detail for
   * every entity is around 1,100 tokens a message, and most questions never
   * need any of it.
   */
  describe(rawArgs: unknown, user: JwtUser) {
    // The model's arguments are untrusted JSON. Anything that is not
    // already a string is not an entity name, so it falls through to the
    // "no such data" answer rather than being stringified into one.
    const asked = (rawArgs as { entity?: unknown } | null)?.entity;
    const name = typeof asked === 'string' ? asked : '';
    const def = REGISTRY[name];

    // Same answer for "does not exist" and "not yours": an entity this role
    // cannot reach was never in their index, and confirming it exists tells
    // them something the index deliberately withheld.
    if (!def || !canUseEntity(def, user.role)) {
      return {
        error:
          `There is no "${name}" data available to you. ` +
          `Available: ${entitiesFor(REGISTRY, user.role).join(', ')}.`,
      };
    }

    return describeEntity(name, def, user.role);
  }

  async run(rawArgs: unknown, user: JwtUser): Promise<QueryResult | { error: string }> {
    const parsed = QuerySchema.safeParse(rawArgs);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        error:
          `That query is not shaped correctly: ${first.path.join('.') || 'query'} — ${first.message}.`,
      };
    }

    const viewer: Viewer = { role: user.role, employeeId: user.employeeId };

    try {
      const query = plan(REGISTRY, parsed.data, viewer);
      const delegate = this.delegateFor(query.def.model);

      // Counted under the same `where` the rows are read with, including
      // the scope clause — so the number reported is the number this person
      // was entitled to see, never the table total.
      const matched = await delegate.count({ where: query.where });

      if (query.mode === 'aggregate' && matched > MAX_SCAN_ROWS) {
        return {
          error:
            `That matches ${matched.toLocaleString()} records, which is too many to ` +
            `summarise at once. Add a filter — a date range, a department or a ` +
            `status — and ask again.`,
        };
      }

      const rows = await delegate.findMany({
        where: query.where,
        select: query.select,
        ...(query.mode === 'rows' ? { take: query.limit } : { take: MAX_SCAN_ROWS }),
      });

      // The audit line for AI data access: who asked, for what, under which
      // scope. The scope is the part worth keeping — it is the proof that a
      // restricted role was restricted.
      this.logger.log(
        `${user.role} ${user.email} queried ${query.entity} (${query.scope.describe}) — ${matched} matched`,
      );

      return summarise(query, rows, matched, { policy: this.attendance.policy });
    } catch (err) {
      if (err instanceof AccessDenied) {
        // Handed back to the model as a result rather than thrown, so it can
        // correct itself and try a different field instead of the whole
        // exchange failing.
        return { error: err.message };
      }
      this.logger.error(`Query failed for ${user.email}`, err as Error);
      return { error: 'That query could not be run. Try asking a simpler version of it.' };
    }
  }

  /**
   * Only `count` and `findMany` are exposed, and only for models named in
   * the registry. A model not in `EntityModel` is unreachable from here even
   * if a query asks for it by name.
   */
  private delegateFor(model: EntityModel): ReadOnlyDelegate {
    const client = this.prisma as unknown as Record<EntityModel, ReadOnlyDelegate>;
    const delegate = client[model];
    return {
      count: (args) => delegate.count(args),
      findMany: (args) => delegate.findMany(args),
    };
  }
}
