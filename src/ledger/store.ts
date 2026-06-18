import { LOW_STOCK_GRAMS, NEAR_EXPIRY_DAYS } from "./types";
import type { LedgerState, BatchLedgerDTO, AlertLevel } from "./types";
import { selectAllBatches } from "./selectors/batchSelectors";
import { selectCurrentStock } from "./selectors/stockSelectors";
import { selectExpiryStatus, selectAlertLevel } from "./expiry/expiryCalculations";

export { createId, nowIso, createBaseEntity, createAuditLog } from "./utils/entity";

export {
  createEmptyState,
  createBatch,
  applyOperation,
  applyBatchAdjustment,
  exportState,
  importState,
  migrateState,
} from "./operations/ledgerOperations";

export {
  selectAllBatches,
  selectBatches,
  selectBatchById,
  selectBatchByNo,
  selectBatchesByHerbName,
  checkBatchNoExists,
  selectTotalStockByName,
  selectHerbAggregatedStockMap,
} from "./selectors/batchSelectors";

export {
  selectAllOperations,
  selectOperationsByBatchId,
  selectOperationsForBatch,
  selectRecentOperations,
  selectCurrentStock,
} from "./selectors/stockSelectors";

export {
  selectAllAuditLogs,
  selectAuditLogsByBatchId,
  selectAuditLogsByBatchNo,
  selectAuditLogsByType,
  selectFilteredAuditLogs,
} from "./selectors/auditLogSelectors";

export {
  daysUntilExpiry,
  selectExpiryStatus,
  selectAlertLevel,
} from "./expiry/expiryCalculations";

export {
  selectPendingSyncCount,
  selectSyncStats,
  selectConflictBatches,
  selectConflictOperations,
  selectConflictAuditLogs,
  selectPendingBatches,
  selectPendingOperations,
  selectPendingAuditLogs,
  selectSyncedBatches,
  selectSyncedOperations,
  selectSyncedAuditLogs,
} from "./sync/syncSelectors";

export {
  markSynced,
  markEntitiesConflict,
  markPendingSynced,
  resolveConflictWithLocal,
  resolveConflictWithServer,
  resolveConflictLater,
} from "./sync/syncReducers";

export {
  createEmptySafetyStockState,
  selectAllSafetyStockRules,
  selectSafetyStockRuleById,
  checkSafetyStockRuleNameExists,
  findRuleForHerb,
} from "./safetyStock/safetyStockSelectors";

export {
  resolveRuleThreshold,
  calculateDynamicSafetyStock,
  calculateAvgDailyConsumption,
  isLowStockWithRules,
} from "./safetyStock/safetyStockCalculations";

export {
  createSafetyStockRule,
  updateSafetyStockRule,
  deleteSafetyStockRule,
  buildTemporarySafetyStockState,
} from "./safetyStock/safetyStockReducers";

export {
  selectSafetyStockThresholdForHerb,
  selectLowStockBatchesWithRules,
  selectLowStockHerbCountWithRules,
  selectLowStockHerbList,
} from "./safetyStock/lowStockSelectors";

export { exportLowStockListCsv } from "./safetyStock/lowStockExport";
export { previewRuleChange } from "./safetyStock/rulePreview";

export {
  calculateProcurementSuggestion,
  sortProcurementSuggestions,
  selectCategoryProcurementSummary,
} from "./procurement/procurementCalculations";
export type { CategoryProcurementSummary } from "./procurement/procurementCalculations";

export {
  selectProcurementSuggestions,
  selectProcurementSuggestionsFiltered,
  exportProcurementListCsv,
} from "./procurement/procurementSelectors";

export {
  useLedgerStore,
  type LedgerStore,
} from "./hooks/useLedgerStore";

export {
  useSafetyStockStore,
  type SafetyStockStore,
} from "./hooks/useSafetyStockStore";

export { createSeedState, createSeedSafetyStockState } from "./seed/seedData";

export type { LowStockHerbItem } from "./types";

export function isLowStock(stock: number): boolean {
  return stock < LOW_STOCK_GRAMS;
}

export function selectLowStockBatches(state: LedgerState): BatchLedgerDTO[] {
  return selectAllBatches(state).filter((b) =>
    isLowStock(selectCurrentStock(state, b.id))
  );
}

export function selectExpiringBatches(
  state: LedgerState,
  daysThreshold = NEAR_EXPIRY_DAYS
): BatchLedgerDTO[] {
  return selectAllBatches(state).filter((b) => {
    const status = selectExpiryStatus(b.expiry, { nearExpiryDays: daysThreshold });
    return status === "near" || status === "expired";
  });
}

export function selectBatchesByAlertLevel(
  state: LedgerState
): Record<AlertLevel, BatchLedgerDTO[]> {
  const result: Record<AlertLevel, BatchLedgerDTO[]> = {
    normal: [],
    warning60: [],
    warning30: [],
    expired: [],
  };
  for (const batch of selectAllBatches(state)) {
    const level = selectAlertLevel(batch.expiry);
    result[level].push(batch);
  }
  return result;
}

export function countBatchesByAlertLevel(
  state: LedgerState
): Record<AlertLevel, number> {
  const grouped = selectBatchesByAlertLevel(state);
  return {
    normal: grouped.normal.length,
    warning60: grouped.warning60.length,
    warning30: grouped.warning30.length,
    expired: grouped.expired.length,
  };
}

export function selectNearExpiryCount(state: LedgerState): number {
  const counts = countBatchesByAlertLevel(state);
  return counts.warning60 + counts.warning30 + counts.expired;
}
