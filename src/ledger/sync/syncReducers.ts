import type { LedgerState, SyncStatus } from "../types";
import { nowIso, createId } from "../utils/entity";

function updateBatchSyncStatus(
  state: LedgerState,
  batchIds: string[],
  targetStatus: SyncStatus,
  options?: { assignServerId?: boolean; timestamp?: string }
): LedgerState {
  const timestamp = options?.timestamp ?? nowIso();
  const batchIdSet = new Set(batchIds);
  const batches: Record<string, typeof state.batches[string]> = {};

  for (const id of Object.keys(state.batches)) {
    const b = state.batches[id];
    if (batchIdSet.has(id)) {
      batches[id] = {
        ...b,
        syncStatus: targetStatus,
        ...(options?.assignServerId ? { serverId: b.serverId ?? createId("srv") } : {}),
        updatedAt: timestamp,
      };
    } else {
      batches[id] = b;
    }
  }

  const operations = state.operations.map((op) => {
    if (batchIdSet.has(op.batchId)) {
      return {
        ...op,
        syncStatus: targetStatus,
        ...(options?.assignServerId ? { serverId: op.serverId ?? createId("srv") } : {}),
        updatedAt: timestamp,
      };
    }
    return op;
  });

  const conflictBatchNos = new Set(
    batchIds
      .map((id) => state.batches[id]?.batchNo)
      .filter((v): v is string => !!v)
  );
  const auditLogs = state.auditLogs.map((log) => {
    if (conflictBatchNos.has(log.batchNo)) {
      return {
        ...log,
        syncStatus: targetStatus,
        ...(options?.assignServerId ? { serverId: log.serverId ?? createId("srv") } : {}),
        updatedAt: timestamp,
      };
    }
    return log;
  });

  return {
    ...state,
    batches,
    operations,
    auditLogs,
    lastSyncedAt:
      targetStatus === "synced" ? timestamp : state.lastSyncedAt,
  };
}

export function markSynced(
  state: LedgerState,
  timestamp: string = nowIso()
): LedgerState {
  const allBatchIds = Object.keys(state.batches).filter(
    (id) => !state.batches[id].isDeleted
  );
  return updateBatchSyncStatus(state, allBatchIds, "synced", {
    assignServerId: true,
    timestamp,
  });
}

export function markEntitiesConflict(
  state: LedgerState,
  batchIds: string[],
  timestamp: string = nowIso()
): LedgerState {
  return updateBatchSyncStatus(state, batchIds, "conflict", { timestamp });
}

export function markPendingSynced(
  state: LedgerState,
  timestamp: string = nowIso()
): LedgerState {
  const pendingBatchIds = Object.keys(state.batches).filter(
    (id) => !state.batches[id].isDeleted && state.batches[id].syncStatus === "pending"
  );
  return updateBatchSyncStatus(state, pendingBatchIds, "synced", {
    assignServerId: true,
    timestamp,
  });
}

export function resolveConflictWithLocal(
  state: LedgerState,
  batchIds: string[],
  timestamp: string = nowIso()
): LedgerState {
  const conflictIds = batchIds.filter(
    (id) => state.batches[id]?.syncStatus === "conflict"
  );
  return updateBatchSyncStatus(state, conflictIds, "synced", {
    assignServerId: true,
    timestamp,
  });
}

export function resolveConflictWithServer(
  state: LedgerState,
  batchIds: string[],
  timestamp: string = nowIso()
): LedgerState {
  const conflictIds = batchIds.filter(
    (id) => state.batches[id]?.syncStatus === "conflict"
  );
  return updateBatchSyncStatus(state, conflictIds, "synced", {
    timestamp,
  });
}

export function resolveConflictLater(
  state: LedgerState,
  batchIds: string[],
  timestamp: string = nowIso()
): LedgerState {
  const conflictIds = batchIds.filter(
    (id) => state.batches[id]?.syncStatus === "conflict"
  );
  return updateBatchSyncStatus(state, conflictIds, "pending", {
    timestamp,
  });
}
