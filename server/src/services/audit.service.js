import { AuditLog } from '../models/audit-log.js';

export function recordAudit({ actor, action, entityType, entityId, metadata = {}, requestId, session }) {
  return AuditLog.create([{ actor, action, entityType, entityId, metadata, requestId }], { session });
}

