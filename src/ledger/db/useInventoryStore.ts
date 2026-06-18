import { useCallback, useEffect, useState } from "react";
import {
  AuditLogRepository,
  BatchRepository,
  ExpiryAlertHandlingRepository,
  HerbRepository,
  OperationRepository,
  RolePreferenceRepository,
  SafetyStockRuleRepository,
  type WriteResult,
} from "./repositories";
import { InventoryService, type ExportData, type ImportPreview, type ImportValidationResult, validateImportData } from "./inventoryService";
import { inventoryDB } from "./database";
import type {
  AuditLogRecord,
  BatchRecord,
  HerbRecord,
  OperationRecord,
  RolePreferenceRecord,
  SafetyStockRuleRecord,
} from "./schema";
import type {
  ExpiryAlertHandling,
  LedgerState,
  NewBatchAdjustmentInput,
  NewBatchInput,
  NewExpiryAlertHandlingInput,
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

  const [expiryAlertHandlings, setExpiryAlertHandlings] = useState<
    Record<string, ExpiryAlertHandling>
  >({});

  const [herbs, setHerbs] = useState<HerbRecord[]>([]);

  const clearWriteError = useCallback(() => {
    setStoreState((prev) => ({ ...prev, writeError: null }));
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [batches, operations, auditLogs, rules, prefs, handlings, herbsData] = await Promise.all([
        BatchRepository.getAllSorted(),
        OperationRepository.getAll(),
        AuditLogRepository.getAll(),
        SafetyStockRuleRepository.getAll(),
        RolePreferenceRepository.getAll(),
        ExpiryAlertHandlingRepository.getAllAsMap(),
        HerbRepository.getAll(),
      ]);
      setLedgerState(buildLedgerState(batches, operations, auditLogs, 1));
      setSafetyStockState(buildSafetyStockState(rules, 1));
      setRolePreferences(prefs);
      setExpiryAlertHandlings(handlings);
      setHerbs(herbsData);
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

  const recordBatchAdjustment = useCallback(
    async (input: NewBatchAdjustmentInput): Promise<OperationResult> => {
      clearWriteError();
      const result = await InventoryService.recordBatchAdjustment(input);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "批号调整失败",
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

  const validateImportFile = useCallback(
    (raw: unknown): ImportValidationResult => {
      return validateImportData(raw);
    },
    []
  );

  const checkBatchNoConflicts = useCallback(
    async (batches: unknown[]): Promise<string[]> => {
      return InventoryService.checkBatchNoConflicts(batches);
    },
    []
  );

  const importSnapshot = useCallback(
    async (data: ExportData): Promise<{ ok: true } | { ok: false; error: string }> => {
      clearWriteError();
      const result = await InventoryService.importConsistentSnapshot(data);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error,
        }));
      }
      return result;
    },
    [clearWriteError]
  );

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

  const updateWarehouseOpType = useCallback(
    async (
      role: RolePreferenceRecord["role"],
      opType: "inbound" | "outbound" | "loss"
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.updateWarehouseOpType(
        role,
        opType
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "操作类型偏好保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const updateManagerSortBy = useCallback(
    async (
      role: RolePreferenceRecord["role"],
      sortBy: "stock" | "batchCount" | "name"
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.updateManagerSortBy(
        role,
        sortBy
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "排序偏好保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const updateSelectedCategory = useCallback(
    async (
      role: RolePreferenceRecord["role"],
      category: string
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.updateSelectedCategory(
        role,
        category
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "分类偏好保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const addPreferredFilter = useCallback(
    async (
      role: RolePreferenceRecord["role"],
      filter: string,
      maxItems = 10
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.addPreferredFilter(
        role,
        filter,
        maxItems
      );
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "常用筛选保存失败",
        }));
      }
      return result;
    },
    [clearWriteError]
  );

  const clearPreferredFilters = useCallback(
    async (
      role: RolePreferenceRecord["role"]
    ): Promise<WriteResult<RolePreferenceRecord>> => {
      clearWriteError();
      const result = await RolePreferenceRepository.clearPreferredFilters(role);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "常用筛选清除失败",
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

  const markExpiryAlertHandled = useCallback(
    async (input: NewExpiryAlertHandlingInput): Promise<OperationResult> => {
      clearWriteError();
      const result = await ExpiryAlertHandlingRepository.markHandled({
        batchId: input.batchId,
        handledBy: input.handledBy,
        remark: input.remark,
      });
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "标记处理状态失败",
        }));
        return { ok: false, error: result.error };
      }
      if (result.data) {
        setExpiryAlertHandlings((prev) => ({
          ...prev,
          [input.batchId]: result.data as ExpiryAlertHandling,
        }));
      }
      return { ok: true };
    },
    [clearWriteError]
  );

  const unmarkExpiryAlertHandled = useCallback(
    async (batchId: string): Promise<OperationResult> => {
      clearWriteError();
      const result = await ExpiryAlertHandlingRepository.unmarkHandled(batchId);
      if (!result.ok) {
        setStoreState((prev) => ({
          ...prev,
          writeError: result.error || "取消处理状态失败",
        }));
        return { ok: false, error: result.error };
      }
      if (result.data) {
        setExpiryAlertHandlings((prev) => ({
          ...prev,
          [batchId]: result.data as ExpiryAlertHandling,
        }));
      }
      return { ok: true };
    },
    [clearWriteError]
  );

  return {
    storeState,
    ledgerState,
    safetyStockState,
    rolePreferences,
    expiryAlertHandlings,
    herbs,
    clearWriteError,
    refreshAll,
    addBatch,
    recordOperation,
    recordBatchAdjustment,
    recordSafetyStockChange,
    addSafetyStockRule,
    updateSafetyStockRule,
    removeSafetyStockRule,
    exportSnapshot,
    validateImportFile,
    checkBatchNoConflicts,
    importSnapshot,
    updateRolePreference,
    addRecentSearch,
    updateWarehouseOpType,
    updateManagerSortBy,
    updateSelectedCategory,
    addPreferredFilter,
    clearPreferredFilters,
    selectRolePreference,
    selectCurrentRoleOrDefault,
    resetAll,
    pendingSyncCount,
    markExpiryAlertHandled,
    unmarkExpiryAlertHandled,
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
