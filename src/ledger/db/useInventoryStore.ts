import { useCallback, useEffect, useState } from "react";
import {
  AuditLogRepository,
  BatchRepository,
  OperationRepository,
  RolePreferenceRepository,
  SafetyStockRuleRepository,
  type WriteResult,
} from "./repositories";
import { InventoryService, type ExportData } from "./inventoryService";
import { inventoryDB } from "./database";
import type {
  AuditLogRecord,
  BatchRecord,
  OperationRecord,
  RolePreferenceRecord,
  SafetyStockRuleRecord,
} from "./schema";
import type {
  LedgerState,
  NewBatchInput,
  NewOperationInput,
  NewSafetyStockRuleInput,
  OperationResult,
  SafetyStockState,
  SCHEMA_VERSION,
} from "../types";
import { LOW_STOCK_GRAMS, SAFETY_STOCK_SCHEMA_VERSION } from "../types";

interface InventoryStoreState {
  loading: boolean;
  initializing: boolean;
  dbError: string | null;
  writeError: string | null;
  initialized: boolean;
}

function buildLedgerState(
  batches: BatchRecord[],
  operations: OperationRecord[],
  auditLogs: AuditLogRecord[],
  schemaVersion: typeof SCHEMA_VERSION
): LedgerState {
  const batchesRecord: Record<string, BatchRecord> = {};
  for (const b of batches) {
    batchesRecord[b.id] = b;
  }
  return {
    schemaVersion,
    batches: batchesRecord,
    operations,
    auditLogs,
  };
}

function buildSafetyStockState(
  rules: SafetyStockRuleRecord[],
  schemaVersion: typeof SAFETY_STOCK_SCHEMA_VERSION
): SafetyStockState {
  const rulesRecord: Record<string, SafetyStockRuleRecord> = {};
  for (const r of rules) {
    rulesRecord[r.id] = r;
  }
  return {
    schemaVersion,
    rules: rulesRecord,
  };
}

export function useInventoryStore() {
  const [storeState, setStoreState] = useState<InventoryStoreState>({
    loading: true,
    initializing: true,
    dbError: null,
    writeError: null,
    initialized: false,
  });

  const [ledgerState, setLedgerState] = useState<LedgerState>(() => ({
    schemaVersion: 1 as typeof SCHEMA_VERSION,
    batches: {},
    operations: [],
    auditLogs: [],
  }));

  const [safetyStockState, setSafetyStockState] = useState<SafetyStockState>(
    () => ({
      schemaVersion: 1 as typeof SAFETY_STOCK_SCHEMA_VERSION,
      rules: {},
    })
  );

  const [rolePreferences, setRolePreferences] = useState<
    RolePreferenceRecord[]
  >([]);

  const clearWriteError = useCallback(() => {
    setStoreState((prev) => ({ ...prev, writeError: null }));
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [batches, operations, auditLogs, rules, prefs] = await Promise.all([
        BatchRepository.getAllSorted(),
        OperationRepository.getAll(),
        AuditLogRepository.getAll(),
        SafetyStockRuleRepository.getAll(),
        RolePreferenceRepository.getAll(),
      ]);
      setLedgerState(buildLedgerState(batches, operations, auditLogs, 1));
      setSafetyStockState(buildSafetyStockState(rules, 1));
      setRolePreferences(prefs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载数据失败";
      setStoreState((prev) => ({ ...prev, dbError: msg }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { seeded } = await InventoryService.ensureInitialized();
        if (!mounted) return;
        await refreshAll();
        if (mounted) {
          setStoreState({
            loading: false,
            initializing: false,
            dbError: null,
            writeError: null,
            initialized: true,
          });
        }
        void seeded;
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : "数据库初始化失败";
        setStoreState({
          loading: false,
          initializing: false,
          dbError: msg,
          writeError: null,
          initialized: false,
        });
      }
    })();

    const unsubscribe = inventoryDB.onChange(() => {
      void refreshAll();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshAll]);

  const addBatch = useCallback(
    async (input: NewBatchInput): Promise<string | null> => {
      clearWriteError();
      const result = await InventoryService.createBatch(input);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError:
            result.error ||
            (result.errorType === "constraint"
              ? "批号重复或数据冲突"
              : "写入数据库失败"),
        }));
        return null;
      }
      return result.batchId || null;
    },
    [clearWriteError]
  );

  const recordOperation = useCallback(
    async (input: NewOperationInput): Promise<OperationResult> => {
      clearWriteError();
      const result = await InventoryService.recordOperation(input);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "操作失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const recordSafetyStockChange = useCallback(
    async (params: {
      herbName: string;
      batchNo: string;
      operator: string;
      remark: string;
      safetyStockBefore: number;
      safetyStockAfter: number;
      safetyStockTarget: string;
    }): Promise<OperationResult> => {
      clearWriteError();
      const result = await InventoryService.recordSafetyStockChange(params);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "记录失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const addSafetyStockRule = useCallback(
    async (input: NewSafetyStockRuleInput): Promise<string | null> => {
      clearWriteError();
      const result = await InventoryService.createSafetyStockRule(input);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError:
            result.error ||
            (result.errorType === "constraint"
              ? "规则名称重复"
              : "写入失败"),
        }));
        return null;
      }
      return result.data || null;
    },
    [clearWriteError]
  );

  const updateSafetyStockRule = useCallback(
    async (
      ruleId: string,
      input: Partial<NewSafetyStockRuleInput>
    ): Promise<OperationResult> => {
      clearWriteError();
      const result = await InventoryService.updateSafetyStockRule(
        ruleId,
        input
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "更新失败",
        }));
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [clearWriteError]
  );

  const removeSafetyStockRule = useCallback(
    async (ruleId: string): Promise<OperationResult> => {
      clearWriteError();
      const result = await InventoryService.deleteSafetyStockRule(ruleId);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "删除失败",
        }));
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    [clearWriteError]
  );

  const exportSnapshot = useCallback(async (): Promise<ExportData | null> => {
    try {
      return await InventoryService.exportConsistentSnapshot();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导出失败";
      setStoreState((prev) => ({ ...prev, writeError: msg }));
      return null;
    }
  }, []);

  const updateRolePreference = useCallback(
    async (
      data: Partial<RolePreferenceRecord> & {
        role: RolePreferenceRecord["role"];
      }
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.upsert(data);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "偏好设置保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const addRecentSearch = useCallback(
    async (
      role: RolePreferenceRecord["role"],
      search: string,
      maxItems = 10
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      if (!search || !search.trim()) {
        return { ok: false, error: "搜索内容不能为空", errorType: "constraint" };
      }
      clearWriteError();
      const result = await RolePreferenceRepository.addRecentSearch(
        role,
        search.trim(),
        maxItems
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "搜索历史保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const selectRolePreference = useCallback(
    (role: RolePreferenceRecord["role"]): RolePreferenceRecord | undefined => {
      return rolePreferences.find((p) => p.role === role);
    },
    [rolePreferences]
  );

  const selectCurrentRoleOrDefault = useCallback(
    (): RolePreferenceRecord["role"] => {
      const manager = rolePreferences.find(
        (p) => p.role === "manager"
      );
      if (manager?.defaultTab) {
        return "manager";
      }
      const pharmacist = rolePreferences.find(
        (p) => p.role === "pharmacist"
      );
      if (pharmacist?.defaultTab) {
        return "pharmacist";
      }
      const warehouse = rolePreferences.find(
        (p) => p.role === "warehouse"
      );
      if (warehouse?.defaultTab) {
        return "warehouse";
      }
      return "pharmacist";
    },
    [rolePreferences]
  );

  const resetAll = useCallback(async (): Promise<OperationResult> => {
    clearWriteError();
    try {
      await InventoryService.resetAndReseed();
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重置失败";
      setStoreState((prev) => ({ ...prev, writeError: msg }));
      return { ok: false, error: msg };
    }
  }, [clearWriteError]);

  const pendingSyncCount = useCallback(async (): Promise<number> => {
    return InventoryService.countPendingSync();
  }, []);

  return {
    storeState,
    ledgerState,
    safetyStockState,
    rolePreferences,
    clearWriteError,
    refreshAll,
    addBatch,
    recordOperation,
    recordSafetyStockChange,
    addSafetyStockRule,
    updateSafetyStockRule,
    removeSafetyStockRule,
    exportSnapshot,
    updateRolePreference,
    addRecentSearch,
    selectRolePreference,
    selectCurrentRoleOrDefault,
    resetAll,
    pendingSyncCount,
  };
}

export type InventoryStore = ReturnType<typeof useInventoryStore>;

export function selectCurrentStockFromState(
  state: LedgerState,
  batchId: string
): number {
  let stock = 0;
  for (const op of state.operations) {
    if (op.isDeleted || op.batchId !== batchId) continue;
    stock += op.type === "inbound" ? op.quantity : -op.quantity;
  }
  return stock;
}

export function selectSafetyStockThresholdFromState(
  state: SafetyStockState,
  herbName: string,
  category: string
): number {
  const rules = Object.values(state.rules).filter((r) => !r.isDeleted);
  const herbRule = rules.find(
    (r) => r.ruleType === "herb" && r.target === herbName
  );
  if (herbRule) return herbRule.thresholdGrams;
  const categoryRule = rules.find(
    (r) => r.ruleType === "category" && r.target === category
  );
  if (categoryRule) return categoryRule.thresholdGrams;
  return LOW_STOCK_GRAMS;
}
