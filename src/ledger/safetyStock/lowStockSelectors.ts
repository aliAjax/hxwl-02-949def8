import type { LedgerState, SafetyStockState, BatchLedgerDTO, LowStockHerbItem } from "../types";
import { LOW_STOCK_GRAMS, DEFAULT_CONSUMPTION_DAYS, DEFAULT_PURCHASE_COVER_DAYS } from "../types";
import { selectAllBatches, selectBatchesByHerbName } from "../selectors/batchSelectors";
import { selectAllOperations, selectCurrentStock } from "../selectors/stockSelectors";
import { selectAllSafetyStockRules, findRuleForHerb } from "./safetyStockSelectors";
import { resolveRuleThreshold, isLowStockWithRules } from "./safetyStockCalculations";

export function selectSafetyStockThresholdForHerb(
  state: SafetyStockState,
  herbName: string,
  category: string,
  ledgerState?: LedgerState
): number {
  const rules = selectAllSafetyStockRules(state);
  const herbRule = rules.find(
    (r) => r.ruleType === "herb" && r.target === herbName
  );
  if (herbRule) {
    const outboundOps = ledgerState
      ? selectOutboundOperationsForHerb(ledgerState, herbName)
      : [];
    return resolveRuleThreshold(herbRule, { outboundOps });
  }
  const categoryRule = rules.find(
    (r) => r.ruleType === "category" && r.target === category
  );
  if (categoryRule) {
    const outboundOps = ledgerState
      ? selectOutboundOperationsForHerb(ledgerState, herbName)
      : [];
    return resolveRuleThreshold(categoryRule, { outboundOps });
  }
  return LOW_STOCK_GRAMS;
}

export function selectOutboundOperationsForHerb(
  ledgerState: LedgerState,
  herbName: string
): typeof ledgerState["operations"] {
  const batches = selectBatchesByHerbName(ledgerState, herbName);
  const batchIds = new Set(batches.map((b) => b.id));
  return selectAllOperations(ledgerState).filter(
    (op) => op.type === "outbound" && batchIds.has(op.batchId)
  );
}

export function selectLowStockBatchesWithRules(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): BatchLedgerDTO[] {
  return selectAllBatches(ledgerState).filter((b) => {
    const stock = selectCurrentStock(ledgerState, b.id);
    const threshold = selectSafetyStockThresholdForHerb(
      safetyStockState,
      b.name,
      b.category,
      ledgerState
    );
    return isLowStockWithRules(stock, threshold);
  });
}

export function selectLowStockHerbCountWithRules(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): number {
  return selectLowStockHerbList(ledgerState, safetyStockState).length;
}

export function selectLowStockHerbList(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): LowStockHerbItem[] {
  const map = new Map<string, LowStockHerbItem>();

  for (const batch of selectAllBatches(ledgerState)) {
    const stock = selectCurrentStock(ledgerState, batch.id);
    const existing = map.get(batch.name);

    if (existing) {
      existing.totalStock += stock;
      existing.batchCount += 1;
      existing.batches.push(batch);
    } else {
      const threshold = selectSafetyStockThresholdForHerb(
        safetyStockState,
        batch.name,
        batch.category,
        ledgerState
      );
      map.set(batch.name, {
        name: batch.name,
        category: batch.category,
        totalStock: stock,
        unit: batch.unit,
        thresholdGrams: threshold,
        shortageGrams: threshold - stock,
        batchCount: 1,
        batches: [batch],
      });
    }
  }

  const list = Array.from(map.values()).filter((item) =>
    isLowStockWithRules(item.totalStock, item.thresholdGrams)
  );

  for (const item of list) {
    item.shortageGrams = item.thresholdGrams - item.totalStock;
  }

  list.sort((a, b) => b.shortageGrams - a.shortageGrams);

  return list;
}
