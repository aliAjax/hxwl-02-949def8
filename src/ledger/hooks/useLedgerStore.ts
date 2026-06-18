import { useCallback, useEffect, useRef, useState } from "react";
import type { LedgerState, NewBatchInput, NewOperationInput, NewBatchAdjustmentInput, OperationResult } from "../types";
import { useInventoryStore } from "../db/useInventoryStore";
import type { InventoryStore } from "../db/useInventoryStore";
import { applyOperation, applyBatchAdjustment } from "../operations/ledgerOperations";
import { createAuditLog } from "../utils/entity";
import type { InventoryAuditLogDTO } from "../types";

export interface LedgerStore {
  state: LedgerState;
  addBatch: (input: NewBatchInput) => Promise<string | null>;
  recordOperation: (input: NewOperationInput) => OperationResult;
  recordBatchAdjustment: (input: NewBatchAdjustmentInput) => OperationResult;
  recordSafetyStockChange: (params: {
    herbName: string;
    batchNo: string;
    operator: string;
    remark: string;
    safetyStockBefore: number;
    safetyStockAfter: number;
    safetyStockTarget: string;
  }) => OperationResult;
  refreshAll: () => Promise<void>;
  inventoryStore: InventoryStore;
}

export function useLedgerStore(
  _initial?: LedgerState | (() => LedgerState)
): LedgerStore {
  const inventoryStore = useInventoryStore();
  const {
    ledgerState: state,
    addBatch: asyncAddBatch,
    recordOperation: asyncRecordOperation,
    recordBatchAdjustment: asyncRecordBatchAdjustment,
    recordSafetyStockChange: asyncRecordSafetyStockChange,
    refreshAll,
  } = inventoryStore;

  const [optimisticState, setOptimisticState] = useState<LedgerState>(state);
  const lastDbStateRef = useRef<LedgerState>(state);

  useEffect(() => {
    lastDbStateRef.current = state;
    setOptimisticState(state);
  }, [state]);

  const addBatch = useCallback(
    async (input: NewBatchInput): Promise<string | null> => {
      const result = await asyncAddBatch(input);
      if (result === null) {
        setOptimisticState(lastDbStateRef.current);
      }
      return result;
    },
    [asyncAddBatch]
  );

  const recordOperation = useCallback(
    (input: NewOperationInput): OperationResult => {
      const optimisticResult = applyOperation(optimisticState, input);
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      void (async () => {
        const result = await asyncRecordOperation(input);
        if (!result.ok) {
          setOptimisticState(lastDbStateRef.current);
        }
      })();
      return { ok: true };
    },
    [optimisticState, asyncRecordOperation]
  );

  const recordBatchAdjustment = useCallback(
    (input: NewBatchAdjustmentInput): OperationResult => {
      const optimisticResult = applyBatchAdjustment(optimisticState, input);
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      void (async () => {
        const result = await asyncRecordBatchAdjustment(input);
        if (!result.ok) {
          setOptimisticState(lastDbStateRef.current);
        }
      })();
      return { ok: true };
    },
    [optimisticState, asyncRecordBatchAdjustment]
  );

  const recordSafetyStockChange = useCallback(
    (params: {
      herbName: string;
      batchNo: string;
      operator: string;
      remark: string;
      safetyStockBefore: number;
      safetyStockAfter: number;
      safetyStockTarget: string;
    }): OperationResult => {
      const auditLog: InventoryAuditLogDTO = createAuditLog({
        logType: "update_safety_stock",
        herbName: params.herbName,
        batchNo: params.batchNo,
        changeGrams: params.safetyStockAfter - params.safetyStockBefore,
        operator: params.operator || "系统",
        remark:
          params.remark ||
          `安全库存从 ${params.safetyStockBefore}g 调整为 ${params.safetyStockAfter}g`,
        safetyStockBefore: params.safetyStockBefore,
        safetyStockAfter: params.safetyStockAfter,
        safetyStockTarget: params.safetyStockTarget,
      });
      setOptimisticState((prev) => ({
        ...prev,
        auditLogs: [auditLog, ...prev.auditLogs],
      }));
      void (async () => {
        await asyncRecordSafetyStockChange(params);
      })();
      return { ok: true };
    },
    [asyncRecordSafetyStockChange]
  );

  return {
    state: optimisticState,
    addBatch,
    recordOperation,
    recordBatchAdjustment,
    recordSafetyStockChange,
    refreshAll,
    inventoryStore,
  };
}
