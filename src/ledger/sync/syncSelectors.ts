import type { LedgerState, BatchLedgerDTO, LedgerOperationDTO, InventoryAuditLogDTO, SyncStatus } from "../types";

export function selectPendingSyncCount(state: LedgerState): number {
  const pendingBatches = Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus !== "synced"
  ).length;
  const pendingOps = state.operations.filter(
    (o) => !o.isDeleted && o.syncStatus !== "synced"
  ).length;
  const pendingLogs = state.auditLogs.filter(
    (l) => !l.isDeleted && l.syncStatus !== "synced"
  ).length;
  return pendingBatches + pendingOps + pendingLogs;
}

export function selectSyncStats(state: LedgerState): {
  pendingBatches: number;
  pendingOperations: number;
  pendingAuditLogs: number;
  conflictBatches: number;
  conflictOperations: number;
  conflictAuditLogs: number;
  syncedBatches: number;
  syncedOperations: number;
  syncedAuditLogs: number;
  lastSyncedAt?: string;
} {
  const allBatches = Object.values(state.batches).filter((b) => !b.isDeleted);
  const allOps = state.operations.filter((o) => !o.isDeleted);
  const allLogs = state.auditLogs.filter((l) => !l.isDeleted);

  return {
    pendingBatches: allBatches.filter((b) => b.syncStatus === "pending").length,
    pendingOperations: allOps.filter((o) => o.syncStatus === "pending").length,
    pendingAuditLogs: allLogs.filter((l) => l.syncStatus === "pending").length,
    conflictBatches: allBatches.filter((b) => b.syncStatus === "conflict").length,
    conflictOperations: allOps.filter((o) => o.syncStatus === "conflict").length,
    conflictAuditLogs: allLogs.filter((l) => l.syncStatus === "conflict").length,
    syncedBatches: allBatches.filter((b) => b.syncStatus === "synced").length,
    syncedOperations: allOps.filter((o) => o.syncStatus === "synced").length,
    syncedAuditLogs: allLogs.filter((l) => l.syncStatus === "synced").length,
    lastSyncedAt: state.lastSyncedAt,
  };
}

function filterBySyncStatus<T extends { syncStatus: SyncStatus; isDeleted: boolean }>(
  items: T[],
  status: SyncStatus
): T[] {
  return items.filter((item) => !item.isDeleted && item.syncStatus === status);
}

export function selectConflictBatches(state: LedgerState): BatchLedgerDTO[] {
  return Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus === "conflict"
  );
}

export function selectConflictOperations(state: LedgerState): LedgerOperationDTO[] {
  return filterBySyncStatus(state.operations, "conflict");
}

export function selectConflictAuditLogs(state: LedgerState): InventoryAuditLogDTO[] {
  return filterBySyncStatus(state.auditLogs, "conflict");
}

export function selectPendingBatches(state: LedgerState): BatchLedgerDTO[] {
  return Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus === "pending"
  );
}

export function selectPendingOperations(state: LedgerState): LedgerOperationDTO[] {
  return filterBySyncStatus(state.operations, "pending");
}

export function selectPendingAuditLogs(state: LedgerState): InventoryAuditLogDTO[] {
  return filterBySyncStatus(state.auditLogs, "pending");
}

export function selectSyncedBatches(state: LedgerState): BatchLedgerDTO[] {
  return Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus === "synced"
  );
}

export function selectSyncedOperations(state: LedgerState): LedgerOperationDTO[] {
  return filterBySyncStatus(state.operations, "synced");
}

export function selectSyncedAuditLogs(state: LedgerState): InventoryAuditLogDTO[] {
  return filterBySyncStatus(state.auditLogs, "synced");
}
