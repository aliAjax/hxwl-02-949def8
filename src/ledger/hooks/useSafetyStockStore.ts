import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SafetyStockState,
  NewSafetyStockRuleInput,
  SafetyStockRuleDTO,
  OperationResult,
} from "../types";
import { useInventoryStore } from "../db/useInventoryStore";
import type { InventoryStore } from "../db/useInventoryStore";
import {
  createSafetyStockRule,
  updateSafetyStockRule,
  deleteSafetyStockRule,
} from "../safetyStock/safetyStockReducers";

export interface SafetyStockStore {
  state: SafetyStockState;
  addRule: (
    input: NewSafetyStockRuleInput & {
      operator?: string;
      previewData?: {
        affectedHerbCount: number;
        lowStockBeforeCount: number;
        lowStockAfterCount: number;
        suggestionDeltaTotal: number;
      };
    }
  ) => Promise<string | null>;
  updateRule: (
    ruleId: string,
    input: Partial<NewSafetyStockRuleInput> & {
      operator?: string;
      existingRule?: Partial<SafetyStockRuleDTO>;
      previewData?: {
        affectedHerbCount: number;
        lowStockBeforeCount: number;
        lowStockAfterCount: number;
        suggestionDeltaTotal: number;
      };
    }
  ) => Promise<OperationResult>;
  removeRule: (
    ruleId: string,
    options?: {
      operator?: string;
      existingRule?: Partial<SafetyStockRuleDTO>;
      previewData?: {
        affectedHerbCount: number;
        lowStockBeforeCount: number;
        lowStockAfterCount: number;
        suggestionDeltaTotal: number;
      };
    }
  ) => Promise<OperationResult>;
  ruleChangeLogs: import("../types").SafetyStockRuleChangeLogDTO[];
  inventoryStore: InventoryStore;
}

export function useSafetyStockStore(
  _initial?: SafetyStockState | (() => SafetyStockState)
): SafetyStockStore {
  const inventoryStore = useInventoryStore();
  const {
    safetyStockState: state,
    addSafetyStockRule: asyncAddRule,
    updateSafetyStockRule: asyncUpdateRule,
    removeSafetyStockRule: asyncRemoveRule,
    ruleChangeLogs,
  } = inventoryStore;

  const [optimisticState, setOptimisticState] =
    useState<SafetyStockState>(state);
  const lastDbStateRef = useRef<SafetyStockState>(state);

  useEffect(() => {
    lastDbStateRef.current = state;
    setOptimisticState(state);
  }, [state]);

  const addRule = useCallback(
    async (
      input: NewSafetyStockRuleInput & {
        operator?: string;
        previewData?: {
          affectedHerbCount: number;
          lowStockBeforeCount: number;
          lowStockAfterCount: number;
          suggestionDeltaTotal: number;
        };
      }
    ): Promise<string | null> => {
      const optimisticResult = createSafetyStockRule(optimisticState, input);
      setOptimisticState(optimisticResult.state);
      const result = await asyncAddRule(input);
      if (result === null) {
        setOptimisticState(lastDbStateRef.current);
        return null;
      }
      return optimisticResult.ruleId;
    },
    [optimisticState, asyncAddRule]
  );

  const updateRule = useCallback(
    async (
      ruleId: string,
      input: Partial<NewSafetyStockRuleInput> & {
        operator?: string;
        existingRule?: Partial<SafetyStockRuleDTO>;
        previewData?: {
          affectedHerbCount: number;
          lowStockBeforeCount: number;
          lowStockAfterCount: number;
          suggestionDeltaTotal: number;
        };
      }
    ): Promise<OperationResult> => {
      const optimisticResult = updateSafetyStockRule(
        optimisticState,
        ruleId,
        input
      );
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      const result = await asyncUpdateRule(ruleId, input);
      if (!result.ok) {
        setOptimisticState(lastDbStateRef.current);
        return result;
      }
      return { ok: true };
    },
    [optimisticState, asyncUpdateRule]
  );

  const removeRule = useCallback(
    async (
      ruleId: string,
      options?: {
        operator?: string;
        existingRule?: Partial<SafetyStockRuleDTO>;
        previewData?: {
          affectedHerbCount: number;
          lowStockBeforeCount: number;
          lowStockAfterCount: number;
          suggestionDeltaTotal: number;
        };
      }
    ): Promise<OperationResult> => {
      const optimisticResult = deleteSafetyStockRule(optimisticState, ruleId);
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      const result = await asyncRemoveRule(ruleId, options);
      if (!result.ok) {
        setOptimisticState(lastDbStateRef.current);
        return result;
      }
      return { ok: true };
    },
    [optimisticState, asyncRemoveRule]
  );

  return {
    state: optimisticState,
    addRule,
    updateRule,
    removeRule,
    ruleChangeLogs,
    inventoryStore,
  };
}
