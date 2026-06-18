import type { SafetyStockState, SafetyStockRuleDTO, SafetyStockRuleType } from "../types";
import { SAFETY_STOCK_SCHEMA_VERSION } from "../types";

export function createEmptySafetyStockState(): SafetyStockState {
  return {
    schemaVersion: SAFETY_STOCK_SCHEMA_VERSION,
    rules: {},
  };
}

export function selectAllSafetyStockRules(
  state: SafetyStockState
): SafetyStockRuleDTO[] {
  return Object.values(state.rules)
    .filter((r) => !r.isDeleted)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function selectSafetyStockRuleById(
  state: SafetyStockState,
  ruleId: string
): SafetyStockRuleDTO | undefined {
  const rule = state.rules[ruleId];
  return rule && !rule.isDeleted ? rule : undefined;
}

export function checkSafetyStockRuleNameExists(
  state: SafetyStockState,
  name: string,
  excludeId?: string
): boolean {
  return Object.values(state.rules).some(
    (r) => !r.isDeleted && r.name === name && r.id !== excludeId
  );
}

export function findRuleForHerb(
  state: SafetyStockState,
  herbName: string,
  category: string
): SafetyStockRuleDTO | undefined {
  const rules = selectAllSafetyStockRules(state);
  const herbRule = rules.find(
    (r) => r.ruleType === "herb" && r.target === herbName
  );
  if (herbRule) return herbRule;
  const categoryRule = rules.find(
    (r) => r.ruleType === "category" && r.target === category
  );
  return categoryRule;
}
