import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  entity: string;
}

/**
 * Records an audit row after the handler succeeds. Never write audit rows by
 * hand — if the handler throws, nothing is logged.
 */
export const Audit = (action: string, entity: string) =>
  SetMetadata(AUDIT_KEY, { action, entity } satisfies AuditMeta);
