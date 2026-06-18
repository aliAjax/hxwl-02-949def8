import type { LedgerState, InventoryAuditLogDTO, AuditLogType } from "../types";

export function selectAllAuditLogs(state: LedgerState): InventoryAuditLogDTO[] {
  return state.auditLogs.filter((l) => !l.isDeleted);
}

export function selectAuditLogsByBatchId(
  state: LedgerState,
  batchId: string
): InventoryAuditLogDTO[] {
  const batch = state.batches[batchId];
  if (!batch) return [];
  return state.auditLogs.filter(
    (l) => !l.isDeleted && l.batchNo === batch.batchNo
  );
}

export function selectAuditLogsByBatchNo(
  state: LedgerState,
  batchNo: string
): InventoryAuditLogDTO[] {
  return selectAllAuditLogs(state).filter((l) => l.batchNo === batchNo);
}

export function selectAuditLogsByType(
  state: LedgerState,
  logType: AuditLogType
): InventoryAuditLogDTO[] {
  return selectAllAuditLogs(state).filter((l) => l.logType === logType);
}

export function selectFilteredAuditLogs(
  state: LedgerState,
  filters: { batchNo?: string; logType?: AuditLogType | "all"; operator?: string; dateFrom?: string; dateTo?: string }
): InventoryAuditLogDTO[] {
  let logs = selectAllAuditLogs(state);
  if (filters.batchNo && filters.batchNo.trim()) {
    const q = filters.batchNo.trim().toLowerCase();
    logs = logs.filter((l) => l.batchNo.toLowerCase().includes(q));
  }
  if (filters.logType && filters.logType !== "all") {
    logs = logs.filter((l) => l.logType === filters.logType);
  }
  if (filters.operator && filters.operator.trim()) {
    const q = filters.operator.trim().toLowerCase();
    logs = logs.filter((l) => l.operator.toLowerCase().includes(q));
  }
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    from.setHours(0, 0, 0, 0);
    logs = logs.filter((l) => new Date(l.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    logs = logs.filter((l) => new Date(l.createdAt) <= to);
  }
  return logs;
}
