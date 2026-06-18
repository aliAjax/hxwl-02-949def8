import type { SafetyStockState, SafetyStockRuleDTO, NewSafetyStockRuleInput, OperationResult } from "../types";
import { createId, createBaseEntity, nowIso } from "../utils/entity";

export function createSafetyStockRule(
  state: SafetyStockState,
  input: NewSafetyStockRuleInput
): { state: SafetyStockState; ruleId: string } {
  const ruleId = createId("ssr");
  const rule: SafetyStockRuleDTO = {
    ...createBaseEntity(ruleId),
    name: input.name,
    ruleType: input.ruleType,
    target: input.target,
    calcMode: input.calcMode,
    thresholdGrams: input.thresholdGrams,
    consumptionDays: input.consumptionDays,
    coverDays: input.coverDays,
    minThresholdGrams: input.minThresholdGrams,
  };
  return {
    ruleId,
    state: {
      ...state,
      rules: { ...state.rules, [ruleId]: rule },
    },
  };
}

export function updateSafetyStockRule(
  state: SafetyStockState,
  ruleId: string,
  input: Partial<NewSafetyStockRuleInput>
): OperationResult & { state?: SafetyStockState } {
  const existing = state.rules[ruleId];
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "规则不存在" };
  }
  const updated: SafetyStockRuleDTO = {
    ...existing,
    ...input,
    updatedAt: nowIso(),
    syncStatus: "pending",
  };
  return {
    ok: true,
    state: {
      ...state,
      rules: { ...state.rules, [ruleId]: updated },
    },
  };
}

export function deleteSafetyStockRule(
  state: SafetyStockState,
  ruleId: string
): OperationResult & { state?: SafetyStockState } {
  const existing = state.rules[ruleId];
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "规则不存在" };
  }
  const updated: SafetyStockRuleDTO = {
    ...existing,
    isDeleted: true,
    updatedAt: nowIso(),
    syncStatus: "pending",
  };
  return {
    ok: true,
    state: {
      ...state,
      rules: { ...state.rules, [ruleId]: updated },
    },
  };
}

export function buildTemporarySafetyStockState(
  baseState: SafetyStockState,
  editingRuleId: string | null,
  draftRule: NewSafetyStockRuleInput
): SafetyStockState {
  if (editingRuleId) {
    const result = updateSafetyStockRule(baseState, editingRuleId, draftRule);
    if (result.ok && result.state) {
      return result.state;
    }
    return baseState;
  }
  const tempResult = createSafetyStockRule(baseState, draftRule);
  return tempResult.state;
}
