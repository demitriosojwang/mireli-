import { db } from "@/lib/db";

/**
 * Every actor that can produce an audit entry.
 *
 * `driver` exists because a driver-initiated action (acknowledging a trip,
 * boarding a passenger, reporting an incident) is a business event and must be
 * attributable, exactly like a passenger payment or an admin override.
 */
export type AuditRole = "driver" | "admin" | "system";

export async function audit(params: {
  actorId: string;
  actorName: string;
  actorRole: AuditRole;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (e) {
    // Auditing must never break the action it is recording. The failure is
    // logged loudly, but the driver's boarding or acceptance still succeeds —
    // otherwise a full disk could stop the fleet.
    console.error("audit log failed", params.action, params.entityId, e);
  }
}