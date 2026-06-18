import type {
  LedgerState,
  SafetyStockState,
  NewSafetyStockRuleInput,
  SafetyStockRulePreviewResult,
  SafetyStockRulePreviewItem,
} from "../types";
import {
  DEFAULT_CONSUMPTION_DAYS,
  DEFAULT_PURCHASE_COVER_DAYS,
  LOW_STOCK_GRAMS,
} from "../types";
import { selectHerbAggregatedStockMap } from "../selectors/batchSelectors";
import { selectSafetyStockThresholdForHerb } from "./lowStockSelectors";
import { selectProcurementSuggestions } from "../procurement/procurementSelectors";

export function previewRuleChange(
  ledgerState: LedgerState,
  baseSafetyState: SafetyStockState,
  newSafetyState: SafetyStockState,
  draftRule: NewSafetyStockRuleInput
): SafetyStockRulePreviewResult {
  const herbMap = selectHerbAggregatedStockMap(ledgerState);

  const affectedHerbNames: string[] = [];
  for (const [name, herb] of herbMap.entries()) {
    if (draftRule.ruleType === "herb") {
      if (name === draftRule.target) {
        affectedHerbNames.push(name);
      }
    } else {
      if (herb.category === draftRule.target) {
        affectedHerbNames.push(name);
      }
    }
  }

  const affectedHerbs: SafetyStockRulePreviewItem[] = [];
  let totalSuggestionBefore = 0;
  let totalSuggestionAfter = 0;
  let avgDailySum = 0;

  const baseLowStockSet = new Set<string>();
  const newLowStockSet = new Set<string>();

  const baseSuggestions = selectProcurementSuggestions(ledgerState, baseSafetyState);
  const newSuggestions = selectProcurementSuggestions(ledgerState, newSafetyState);

  const baseSuggestionMap = new Map(baseSuggestions.map(s => [s.name, s]));
  const newSuggestionMap = new Map(newSuggestions.map(s => [s.name, s]));

  for (const name of affectedHerbNames) {
    const herb = herbMap.get(name)!;
    const thresholdBefore = selectSafetyStockThresholdForHerb(
      baseSafetyState,
      name,
      herb.category,
      ledgerState
    );
    const thresholdAfter = selectSafetyStockThresholdForHerb(
      newSafetyState,
      name,
      herb.category,
      ledgerState
    );

    const isLowBefore = herb.totalStock < thresholdBefore;
    const isLowAfter = herb.totalStock < thresholdAfter;

    if (isLowBefore) baseLowStockSet.add(name);
    if (isLowAfter) newLowStockSet.add(name);

    const baseSugg = baseSuggestionMap.get(name);
    const newSugg = newSuggestionMap.get(name);

    const suggBefore = baseSugg?.suggestedPurchaseQty ?? 0;
    const suggAfter = newSugg?.suggestedPurchaseQty ?? 0;
    const avgDaily = baseSugg?.avgDailyConsumption ?? newSugg?.avgDailyConsumption ?? 0;

    totalSuggestionBefore += suggBefore;
    totalSuggestionAfter += suggAfter;
    avgDailySum += avgDaily;

    affectedHerbs.push({
      name,
      category: herb.category,
      totalStock: herb.totalStock,
      unit: herb.unit,
      thresholdBefore,
      thresholdAfter,
      isLowStockBefore: isLowBefore,
      isLowStockAfter: isLowAfter,
      lowStockStatusChanged: isLowBefore !== isLowAfter,
      suggestionBefore: suggBefore,
      suggestionAfter: suggAfter,
      suggestionDelta: suggAfter - suggBefore,
      avgDailyConsumption: avgDaily,
    });
  }

  const newlyLowStock = affectedHerbs.filter(
    h => !h.isLowStockBefore && h.isLowStockAfter
  );
  const noLongerLowStock = affectedHerbs.filter(
    h => h.isLowStockBefore && !h.isLowStockAfter
  );

  const totalLowStockBefore = baseLowStockSet.size;
  const totalLowStockAfter = newLowStockSet.size;
  const lowStockDelta = totalLowStockAfter - totalLowStockBefore;
  const totalSuggestionDelta = totalSuggestionAfter - totalSuggestionBefore;

  const targetLabel = draftRule.ruleType === "herb"
    ? `饮片「${draftRule.target}」`
    : `分类「${draftRule.target}」`;

  const modeLabel = draftRule.calcMode === "fixed"
    ? `固定阈值 ${draftRule.thresholdGrams}g`
    : `动态规则（近${draftRule.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS}天均值 × ${draftRule.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS}天覆盖，最低${draftRule.minThresholdGrams ?? LOW_STOCK_GRAMS}g）`;

  const changes: string[] = [];
  if (newlyLowStock.length > 0) {
    changes.push(`${newlyLowStock.length}种新增低库存`);
  }
  if (noLongerLowStock.length > 0) {
    changes.push(`${noLongerLowStock.length}种脱离低库存`);
  }
  if (totalSuggestionDelta !== 0) {
    changes.push(`补货建议${totalSuggestionDelta > 0 ? "+" : ""}${totalSuggestionDelta.toLocaleString()}g`);
  }

  const explainText = `规则「${draftRule.name}」应用于${targetLabel}，模式：${modeLabel}。影响${affectedHerbs.length}种饮片：${changes.length > 0 ? changes.join("，") : "低库存状态和补货建议无变化"}。`;

  return {
    affectedHerbs,
    newlyLowStock,
    noLongerLowStock,
    totalLowStockBefore,
    totalLowStockAfter,
    lowStockDelta,
    totalSuggestionBefore,
    totalSuggestionAfter,
    totalSuggestionDelta,
    avgDailyConsumptionSum: Math.round(avgDailySum * 100) / 100,
    explainText,
  };
}
