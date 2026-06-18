import type { LedgerOperationDTO, SafetyStockRuleDTO } from "../types";
import {
  LOW_STOCK_GRAMS,
  DEFAULT_CONSUMPTION_DAYS,
  DEFAULT_PURCHASE_COVER_DAYS,
} from "../types";

export function calculateAvgDailyConsumption(
  outboundOps: LedgerOperationDTO[],
  days: number = DEFAULT_CONSUMPTION_DAYS,
  referenceDate?: Date
): number {
  if (outboundOps.length === 0) return 0;

  const now = referenceDate ? new Date(referenceDate) : new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let totalQty = 0;

  for (const op of outboundOps) {
    const opTime = new Date(op.createdAt).getTime();
    if (opTime >= cutoff.getTime()) {
      totalQty += op.quantity;
    }
  }

  if (totalQty === 0) return 0;

  return Math.round((totalQty / days) * 100) / 100;
}

export function resolveRuleThreshold(
  rule: SafetyStockRuleDTO,
  options: {
    herbName?: string;
    category?: string;
    outboundOps?: LedgerOperationDTO[];
    referenceDate?: Date;
  } = {}
): number {
  if (rule.calcMode === "fixed") {
    return rule.thresholdGrams;
  }

  if (!options.outboundOps || options.outboundOps.length === 0) {
    return rule.thresholdGrams;
  }

  const consumptionDays = rule.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS;
  const coverDays = rule.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS;
  const minThreshold = rule.minThresholdGrams ?? rule.thresholdGrams ?? LOW_STOCK_GRAMS;

  const avgDaily = calculateAvgDailyConsumption(
    options.outboundOps,
    consumptionDays,
    options.referenceDate
  );

  const dynamicThreshold = Math.ceil(avgDaily * coverDays);
  return Math.max(minThreshold, dynamicThreshold);
}

export function calculateDynamicSafetyStock(
  outboundOps: LedgerOperationDTO[],
  options: {
    consumptionDays?: number;
    coverDays?: number;
    minThresholdGrams?: number;
    referenceDate?: Date;
  } = {}
): {
  threshold: number;
  avgDailyConsumption: number;
  consumptionDays: number;
  coverDays: number;
  minThreshold: number;
  explanation: string;
} {
  const consumptionDays = options.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS;
  const coverDays = options.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS;
  const minThreshold = options.minThresholdGrams ?? LOW_STOCK_GRAMS;

  const avgDaily = calculateAvgDailyConsumption(
    outboundOps,
    consumptionDays,
    options.referenceDate
  );

  const dynamicValue = Math.ceil(avgDaily * coverDays);
  const finalThreshold = Math.max(minThreshold, dynamicValue);

  const explanation =
    avgDaily > 0
      ? `近${consumptionDays}天出库均值 ${avgDaily.toFixed(1)}g/天 × ${coverDays}天覆盖 = ${dynamicValue}g，${finalThreshold > dynamicValue ? `取最低阈值 ${minThreshold}g` : `取动态计算值`}`
      : `近${consumptionDays}天无出库记录，取最低阈值 ${minThreshold}g`;

  return {
    threshold: finalThreshold,
    avgDailyConsumption: Math.round(avgDaily * 100) / 100,
    consumptionDays,
    coverDays,
    minThreshold,
    explanation,
  };
}

export function isLowStockWithRules(
  stock: number,
  threshold: number
): boolean {
  return stock < threshold;
}
