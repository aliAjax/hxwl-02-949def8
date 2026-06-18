import type { ProcurementSuggestionItem, PriorityLevel, NearExpiryBatchInfo } from "../types";
import { PRIORITY_ORDER, NEAR_EXPIRY_UNSAFE_DAYS, DEFAULT_CONSUMPTION_DAYS, DEFAULT_PURCHASE_COVER_DAYS } from "../types";
import { calculateAvgDailyConsumption } from "../safetyStock/safetyStockCalculations";
import { daysUntilExpiry } from "../expiry/expiryCalculations";

export interface ProcurementCalcInput {
  herbName: string;
  spec: string;
  origin: string;
  category: string;
  unit: string;
  batches: Array<{
    id: string;
    batchNo: string;
    expiry: string;
    stock: number;
  }>;
  outboundOps: Array<{
    createdAt: string;
    quantity: number;
  }>;
  thresholdGrams: number;
  options?: {
    consumptionDays?: number;
    coverDays?: number;
    nearExpiryUnsafeDays?: number;
    referenceDate?: Date;
  };
}

export function calculateProcurementSuggestion(
  input: ProcurementCalcInput
): ProcurementSuggestionItem {
  const {
    herbName,
    spec,
    origin,
    category,
    unit,
    batches,
    outboundOps,
    thresholdGrams,
    options = {},
  } = input;

  const consumptionDays = options.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS;
  const coverDays = options.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS;
  const nearExpiryUnsafeDays = options.nearExpiryUnsafeDays ?? NEAR_EXPIRY_UNSAFE_DAYS;
  const referenceDate = options.referenceDate;

  let totalStock = 0;
  let nearExpiryStock = 0;
  const nearExpiryBatches: NearExpiryBatchInfo[] = [];

  for (const batch of batches) {
    totalStock += batch.stock;

    const daysLeft = daysUntilExpiry(batch.expiry, referenceDate);
    if (daysLeft <= nearExpiryUnsafeDays && batch.stock > 0) {
      nearExpiryStock += batch.stock;
      nearExpiryBatches.push({
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiry: batch.expiry,
        daysLeft,
        stock: batch.stock,
      });
    }
  }

  nearExpiryBatches.sort((a, b) => a.daysLeft - b.daysLeft);

  const safeAvailableStock = Math.max(0, totalStock - nearExpiryStock);

  const avgDailyConsumption = calculateAvgDailyConsumption(
    outboundOps as any,
    consumptionDays,
    referenceDate
  );

  let stockDaysLeft = Infinity;
  if (avgDailyConsumption > 0 && safeAvailableStock > 0) {
    stockDaysLeft = safeAvailableStock / avgDailyConsumption;
  } else if (safeAvailableStock <= 0) {
    stockDaysLeft = 0;
  }

  const targetStock = Math.max(
    thresholdGrams,
    avgDailyConsumption * coverDays
  );
  let suggestedPurchaseQty = Math.max(0, targetStock - safeAvailableStock);

  if (suggestedPurchaseQty > 0 && avgDailyConsumption > 0) {
    const minOrderQty = avgDailyConsumption * 7;
    suggestedPurchaseQty = Math.max(suggestedPurchaseQty, minOrderQty);
  }

  suggestedPurchaseQty = Math.ceil(suggestedPurchaseQty / 100) * 100;

  let priorityScore = 0;

  if (safeAvailableStock < thresholdGrams) {
    const shortageRatio = (thresholdGrams - safeAvailableStock) / thresholdGrams;
    priorityScore += shortageRatio * 50;
  }

  if (avgDailyConsumption > 0 && stockDaysLeft < Infinity) {
    if (stockDaysLeft <= 7) {
      priorityScore += 40;
    } else if (stockDaysLeft <= 14) {
      priorityScore += 25;
    } else if (stockDaysLeft <= 30) {
      priorityScore += 10;
    }
  }

  if (nearExpiryStock > 0) {
    const nearExpiryRatio = nearExpiryStock / Math.max(1, totalStock);
    priorityScore += nearExpiryRatio * 20;
  }

  if (suggestedPurchaseQty <= 0) {
    priorityScore = 0;
  }

  let priority: PriorityLevel;
  if (suggestedPurchaseQty <= 0) {
    priority = "low";
  } else if (priorityScore >= 60) {
    priority = "urgent";
  } else if (priorityScore >= 35) {
    priority = "high";
  } else if (priorityScore >= 15) {
    priority = "medium";
  } else {
    priority = "low";
  }

  return {
    name: herbName,
    spec,
    origin,
    category,
    unit,
    totalStock,
    safeAvailableStock,
    nearExpiryStock,
    nearExpiryBatches,
    thresholdGrams,
    avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
    consumptionDays,
    suggestedPurchaseQty,
    priority,
    priorityScore: Math.round(priorityScore * 100) / 100,
    stockDaysLeft:
      stockDaysLeft === Infinity
        ? Infinity
        : Math.round(stockDaysLeft * 10) / 10,
    batchCount: batches.length,
    batches: [] as any,
  };
}

export function sortProcurementSuggestions(
  suggestions: ProcurementSuggestionItem[]
): ProcurementSuggestionItem[] {
  return [...suggestions].sort((a, b) => {
    const priorityDiff =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    if (b.suggestedPurchaseQty !== a.suggestedPurchaseQty) {
      return b.suggestedPurchaseQty - a.suggestedPurchaseQty;
    }
    return b.priorityScore - a.priorityScore;
  });
}

export interface CategoryProcurementSummary {
  category: string;
  herbCount: number;
  totalSuggestedQty: number;
  urgentCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export function selectCategoryProcurementSummary(
  suggestions: ProcurementSuggestionItem[]
): CategoryProcurementSummary[] {
  const map = new Map<string, CategoryProcurementSummary>();

  for (const item of suggestions) {
    if (item.suggestedPurchaseQty <= 0) continue;

    const existing = map.get(item.category) ?? {
      category: item.category,
      herbCount: 0,
      totalSuggestedQty: 0,
      urgentCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    };

    existing.herbCount += 1;
    existing.totalSuggestedQty += item.suggestedPurchaseQty;
    if (item.priority === "urgent") existing.urgentCount += 1;
    else if (item.priority === "high") existing.highCount += 1;
    else if (item.priority === "medium") existing.mediumCount += 1;
    else if (item.priority === "low") existing.lowCount += 1;

    map.set(item.category, existing);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalSuggestedQty - a.totalSuggestedQty
  );
}
