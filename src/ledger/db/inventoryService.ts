import { inventoryDB } from "./database";
import {
  AuditLogRepository,
  BatchRepository,
  HerbRepository,
  OperationRepository,
  SafetyStockRuleRepository,
  createId,
  nowIso,
  type WriteResult,
} from "./repositories";
import { STORES, type AuditLogRecord, type OperationRecord } from "./schema";
import { buildSeedData } from "./seed";
import type {
  NewBatchInput,
  NewOperationInput,
  NewSafetyStockRuleInput,
  OperationResult,
  OperationType,
} from "../types";

export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  batches: unknown[];
  operations: unknown[];
  auditLogs: unknown[];
  herbs: unknown[];
  safetyStockRules: unknown[];
  rolePreferences: unknown[];
}

export class InventoryService {
  private static SEED_FLAG = "seed_data_v1_initialized";

  static async ensureInitialized(): Promise<{ seeded: boolean }> {
    const seeded = (await inventoryDB.getMeta(this.SEED_FLAG)) as boolean;
    if (seeded) return { seeded: false };

    await this.initializeWithSeed();
    return { seeded: true };
  }

  private static async initializeWithSeed(): Promise<void> {
    const seed = buildSeedData();
    const now = nowIso();
    await inventoryDB.withTransaction(
      [
        STORES.HERBS,
        STORES.BATCHES,
        STORES.OPERATIONS,
        STORES.AUDIT_LOGS,
        STORES.SAFETY_STOCK_RULES,
        STORES.ROLE_PREFERENCES,
        STORES.EXPIRY_ALERT_HANDLINGS,
        STORES.META,
      ],
      "readwrite",
      (stores) => {
        for (const h of seed.herbs) {
          stores[STORES.HERBS].put(h);
        }
        for (const b of seed.batches) {
          stores[STORES.BATCHES].put(b);
        }
        for (const op of seed.operations) {
          stores[STORES.OPERATIONS].put(op);
        }
        for (const log of seed.auditLogs) {
          stores[STORES.AUDIT_LOGS].put(log);
        }
        for (const rule of seed.safetyStockRules) {
          stores[STORES.SAFETY_STOCK_RULES].put(rule);
        }
        for (const pref of seed.rolePreferences) {
          stores[STORES.ROLE_PREFERENCES].put(pref);
        }
        stores[STORES.EXPIRY_ALERT_HANDLINGS].clear();
        stores[STORES.META].put({
          key: this.SEED_FLAG,
          value: true,
          updatedAt: now,
        });
      }
    );
  }

  static async resetAllData(): Promise<void> {
    await inventoryDB.withTransaction(
      [
        STORES.HERBS,
        STORES.BATCHES,
        STORES.OPERATIONS,
        STORES.AUDIT_LOGS,
        STORES.SAFETY_STOCK_RULES,
        STORES.ROLE_PREFERENCES,
        STORES.EXPIRY_ALERT_HANDLINGS,
        STORES.META,
      ],
      "readwrite",
      (stores) => {
        stores[STORES.HERBS].clear();
        stores[STORES.BATCHES].clear();
        stores[STORES.OPERATIONS].clear();
        stores[STORES.AUDIT_LOGS].clear();
        stores[STORES.SAFETY_STOCK_RULES].clear();
        stores[STORES.ROLE_PREFERENCES].clear();
        stores[STORES.EXPIRY_ALERT_HANDLINGS].clear();
        stores[STORES.META].put({
          key: this.SEED_FLAG,
          value: false,
          updatedAt: nowIso(),
        });
      }
    );
  }

  static async resetAndReseed(): Promise<void> {
    await this.resetAllData();
    await this.initializeWithSeed();
  }

  static async createBatch(
    input: NewBatchInput
  ): Promise<WriteResult<string> & { batchId?: string }> {
    const exists = await BatchRepository.existsByBatchNo(input.batchNo);
    if (exists) {
      return {
        ok: false,
        error: `批号 "${input.batchNo}" 已存在，请使用不同的批号`,
        errorType: "constraint",
      };
    }

    const now = nowIso();
    const batchId = createId("bat");
    const herbId = createId("herb");

    const herbRecord = {
      id: herbId,
      name: input.name,
      spec: input.spec,
      origin: input.origin,
      category: input.category,
      defaultUnit: input.unit || "g",
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const batchData = {
      id: batchId,
      herbId,
      name: input.name,
      spec: input.spec,
      origin: input.origin,
      category: input.category,
      batchNo: input.batchNo,
      expiry: input.expiry,
      unit: input.unit || "g",
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    const openingOpId = createId("op");
    const openingOperation: OperationRecord = {
      id: openingOpId,
      batchId,
      type: "inbound",
      quantity: input.initialStock,
      balanceAfter: input.initialStock,
      operator: input.operator || "系统",
      remark: input.remark || "期初入库",
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    const createLogId = createId("log");
    const auditLog: AuditLogRecord = {
      id: createLogId,
      logType: "create_batch",
      herbName: input.name,
      batchNo: input.batchNo,
      changeGrams: input.initialStock,
      operator: input.operator || "系统",
      remark:
        input.remark ||
        `新增批号，期初库存 ${input.initialStock}${input.unit || "g"}`,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    try {
      await inventoryDB.withTransaction(
        [
          STORES.HERBS,
          STORES.BATCHES,
          STORES.OPERATIONS,
          STORES.AUDIT_LOGS,
        ],
        "readwrite",
        (stores) => {
          stores[STORES.HERBS].put(herbRecord);
          stores[STORES.BATCHES].put(batchData);
          stores[STORES.OPERATIONS].put(openingOperation);
          stores[STORES.AUDIT_LOGS].put(auditLog);
        }
      );
      return { ok: true, batchId, data: batchId };
    } catch (e) {
      if (e instanceof Error) {
        return {
          ok: false,
          error: `新增批号失败：${e.message}`,
          errorType: "database",
        };
      }
      return { ok: false, error: "新增批号失败：未知错误", errorType: "database" };
    }
  }

  static async recordOperation(
    input: NewOperationInput
  ): Promise<OperationResult> {
    const batch = await BatchRepository.getById(input.batchId);
    if (!batch) {
      return { ok: false, error: "批号不存在或已被移除" };
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      return { ok: false, error: "数量必须为大于 0 的数字" };
    }

    const current = await OperationRepository.getCurrentStock(input.batchId);
    if (input.type !== "inbound" && input.quantity > current) {
      return {
        ok: false,
        error: `${input.type === "outbound" ? "出库" : "损耗"}不能超过该批号剩余库存（当前剩余 ${current}${batch.unit}）`,
      };
    }

    const balanceAfter =
      input.type === "inbound"
        ? current + input.quantity
        : current - input.quantity;
    const now = nowIso();
    const changeGrams =
      input.type === "inbound" ? input.quantity : -input.quantity;

    const opId = createId("op");
    const operation: OperationRecord = {
      id: opId,
      batchId: input.batchId,
      type: input.type,
      quantity: input.quantity,
      balanceAfter,
      operator: input.operator || "系统",
      remark: input.remark,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    const logId = createId("log");
    const logLabels: Record<OperationType, string> = {
      inbound: "入库",
      outbound: "出库",
      loss: "损耗",
    };
    const auditLog: AuditLogRecord = {
      id: logId,
      logType: input.type,
      herbName: batch.name,
      batchNo: batch.batchNo,
      changeGrams,
      operator: input.operator || "系统",
      remark:
        input.remark ||
        `${logLabels[input.type]} ${input.quantity}${batch.unit}`,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    const updatedBatch = {
      ...batch,
      updatedAt: now,
      syncStatus: "pending" as const,
    };

    try {
      await inventoryDB.withTransaction(
        [STORES.BATCHES, STORES.OPERATIONS, STORES.AUDIT_LOGS],
        "readwrite",
        (stores) => {
          stores[STORES.BATCHES].put(updatedBatch);
          stores[STORES.OPERATIONS].put(operation);
          stores[STORES.AUDIT_LOGS].put(auditLog);
        }
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof Error) {
        return { ok: false, error: `操作失败：${e.message}` };
      }
      return { ok: false, error: "操作失败：未知错误" };
    }
  }

  static async recordSafetyStockChange(params: {
    herbName: string;
    batchNo: string;
    operator: string;
    remark: string;
    safetyStockBefore: number;
    safetyStockAfter: number;
    safetyStockTarget: string;
  }): Promise<OperationResult> {
    const now = nowIso();
    const logId = createId("log");
    const auditLog: AuditLogRecord = {
      id: logId,
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
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };
    try {
      const result = await AuditLogRepository.upsert(auditLog);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof Error) {
        return { ok: false, error: `记录安全库存变更失败：${e.message}` };
      }
      return { ok: false, error: "记录安全库存变更失败" };
    }
  }

  static async createSafetyStockRule(
    input: NewSafetyStockRuleInput
  ): Promise<WriteResult<string>> {
    const exists = await SafetyStockRuleRepository.existsByName(input.name);
    if (exists) {
      return {
        ok: false,
        error: `规则名称 "${input.name}" 已存在`,
        errorType: "constraint",
      };
    }
    return SafetyStockRuleRepository.upsert(input).then((res) => ({
      ok: res.ok,
      data: res.data?.id,
      error: res.error,
      errorType: res.errorType,
    }));
  }

  static async updateSafetyStockRule(
    ruleId: string,
    input: Partial<NewSafetyStockRuleInput>
  ): Promise<WriteResult<void>> {
    if (input.name) {
      const exists = await SafetyStockRuleRepository.existsByName(
        input.name,
        ruleId
      );
      if (exists) {
        return {
          ok: false,
          error: `规则名称 "${input.name}" 已存在`,
          errorType: "constraint",
        };
      }
    }
    return SafetyStockRuleRepository.upsert({ id: ruleId, ...input }).then(
      (res) => ({
        ok: res.ok,
        error: res.error,
        errorType: res.errorType,
      })
    );
  }

  static async deleteSafetyStockRule(ruleId: string): Promise<WriteResult<void>> {
    return SafetyStockRuleRepository.softDelete(ruleId);
  }

  static async exportConsistentSnapshot(): Promise<ExportData> {
    const snapshot = await inventoryDB.getConsistentSnapshot();
    return {
      schemaVersion: 1,
      exportedAt: nowIso(),
      batches: snapshot.batches,
      operations: snapshot.operations,
      auditLogs: snapshot.auditLogs,
      herbs: snapshot.herbs,
      safetyStockRules: snapshot.safetyStockRules,
      rolePreferences: snapshot.rolePreferences,
    };
  }

  static async markAllSynced(): Promise<void> {
    await Promise.all([
      BatchRepository.markAllSynced(),
      OperationRepository.markAllSynced(),
      AuditLogRepository.markAllSynced(),
    ]);
  }

  static async countPendingSync(): Promise<number> {
    const [batches, operations, auditLogs] = await Promise.all([
      BatchRepository.getAll(),
      OperationRepository.getAll(),
      AuditLogRepository.getAll(),
    ]);
    const pendingBatches = batches.filter(
      (b) => !b.isDeleted && b.syncStatus !== "synced"
    ).length;
    const pendingOps = operations.filter(
      (o) => !o.isDeleted && o.syncStatus !== "synced"
    ).length;
    const pendingLogs = auditLogs.filter(
      (l) => !l.isDeleted && l.syncStatus !== "synced"
    ).length;
    return pendingBatches + pendingOps + pendingLogs;
  }
}

export { HerbRepository, BatchRepository, OperationRepository, AuditLogRepository, SafetyStockRuleRepository };
