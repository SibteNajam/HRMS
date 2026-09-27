import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator.js';
import type { JwtUser } from '../types/jwt-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Writes an audit row after a decorated handler succeeds.
 *
 * Runs on the success path only — a handler that throws logs nothing. Audit
 * writes never fail the request they are recording.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const actorUserId = req.user?.sub ?? 0;

    return next.handle().pipe(
      tap((result) => {
        const entityId =
          Number(req.params?.id) ||
          (result as { id?: number } | null)?.id ||
          0;

        void this.prisma.auditLog
          .create({
            data: {
              actorUserId,
              action: meta.action,
              entity: meta.entity,
              entityId,
              metadata: this.safeMetadata(req.body, result),
            },
          })
          .catch(() => undefined);
      }),
    );
  }

  private safeMetadata(body: unknown, result: unknown) {
    const redact = (o: unknown) => {
      if (!o || typeof o !== 'object') return undefined;
      const clone: Record<string, unknown> = { ...(o as object) };
      for (const key of ['password', 'passwordHash', 'currentPassword']) {
        if (key in clone) clone[key] = '[redacted]';
      }
      return clone;
    };
    return { request: redact(body), result: redact(result) } as object;
  }
}
