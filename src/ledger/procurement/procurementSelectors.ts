import type { LedgerState, SafetyStockState, ProcurementSuggestionItem, PriorityLevel } from "../types";
import { DEFAULT_CONSUMPTION_DAYS, DEFAULT_PURCHASE_COVER_DAYS, NEAR_EXPIRY_UNSAFE_DAYS, PRIORITY_LABELS } from "../types";
import { selectAllBatches, selectBatchesByHerbName } from "../selectors/batchSelectors";
import { selectAllOperations, selectCurrentStock } from "../selectors/stockSelectors";
import { selectSafetyStockThresholdForHerb } from "../safetyStock/lowStockSelectors";
import {
  calculateProcurementSuggestion,
  sortProcurementSuggestions,
  selectCategoryProcurementSummary,
} from "./procurementCalculations";
import type { CategoryProcurementSummary } from "./procurementCalculations";

export { selectCategoryProcurementSummary };
export type { CategoryProcurementSummary };

export function selectProcurementSuggestions(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState,
  options?: {
    consumptionDays?: number;
    coverDays?: number;
    nearExpiryUnsafeDays?: number;
  }
): ProcurementSuggestionItem[] {
  const allBatches = selectAllBatches(ledgerState);
  const herbMap = new Map<string, typeof allBatches>();

  for (const batch of allBatches) {
    const list = herbMap.get(batch.name) ?? [];
    list.push(batch);
    herbMap.set(batch.name, list);
  }

  const suggestions: ProcurementSuggestionItem[] = [];

  for (const [herbName, batches] of herbMap.entries()) {
    const firstBatch = batches[0];
    const threshold = selectSafetyStockThresholdForHerb(
      safetyStockState,
      herbName,
      firstBatch.category,
      ledgerState
    );

    const batchInfo = batches.map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expiry: b.expiry,
      stock: selectCurrentStock(ledgerState, b.id),
    }));

    const outboundOps = selectOutboundOpsForHerb(ledgerState, herbName);

    const suggestion = calculateProcurementSuggestion({
      herbName,
      spec: firstBatch.spec,
      origin: firstBatch.origin,
      category: firstBatch.category,
      unit: firstBatch.unit,
      batches: batchInfo,
      outboundOps,
      thresholdGrams: threshold,
      options,
    });

    (suggestion as any).batches = batches;
    suggestions.push(suggestion);
  }

  return sortProcurementSuggestions(suggestions);
}

function selectOutboundOpsForHerb(
  ledgerState: LedgerState,
  herbName: string
): typeof ledgerState["operations"] {
  const batches = selectBatchesByHerbName(ledgerState, herbName);
  const batchIds = new Set(batches.map((b) => b.id));
  return selectAllOperations(ledgerState).filter(
    (op) => op.type === "outbound" && batchIds.has(op.batchId)
  );
}

export function selectProcurementSuggestionsFiltered(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState,
  filters: {
    category?: string;
    priority?: PriorityLevel | "all";
    query?: string;
    onlyNeedPurchase?: boolean;
  }
): ProcurementSuggestionItem[] {
  const all = selectProcurementSuggestions(ledgerState, safetyStockState);
  const q = (filters.query ?? "").trim().toLowerCase();

  return all.filter((item) => {
    if (filters.category && filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) {
      return false;
    }
    if (q && !item.name.toLowerCase().includes(q)) {
      return false;
    }
    if (filters.onlyNeedPurchase && item.suggestedPurchaseQty <= 0) {
      return false;
    }
    return true;
  });
}

export function exportProcurementListCsv(suggestions: ProcurementSuggestionItem[]): string {
  const headers = [
    "优先级",
    "饮片名称",
    "炮制规格",
    "产地",
    "功效分类",
    "当前总库存(g)",
    "安全可用库存(g)",
    "近效期库存(g)",
    "安全库存阈值(g)",
    "日均消耗量(g/天)",
    "预计可用天数",
    "建议采购量(g)",
    "涉及批次数",
  ];

  const rows = suggestions.map((item) => [
    PRIORITY_LABELS[item.priority],
    item.name,
    item.spec,
    item.origin,
    item.category,
    String(item.totalStock),
    String(item.safeAvailableStock),
    String(item.nearExpiryStock),
    String(item.thresholdGrams),
    String(item.avgDailyConsumption),
    item.stockDaysLeft === Infinity ? "充足" : String(item.stockDaysLeft),
    String(item.suggestedPurchaseQty),
    String(item.batchCount),
  ]);

  const formatCell = (cell: string): string =>
    `"${cell.replace(/"/g, '""')}"`;

  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(formatCell).join(",")).join("\n")
  );
}
