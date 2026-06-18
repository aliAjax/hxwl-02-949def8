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
import {
  STORES,
  fillAuditLogDefaults,
  fillBatchDefaults,
  fillExpiryAlertHandlingDefaults,
  fillHerbDefaults,
  fillOperationDefaults,
  fillRolePreferenceDefaults,
  fillSafetyStockRuleDefaults,
  type AuditLogRecord,
  type BatchRecord,
  type ExpiryAlertHandlingRecord,
  type HerbRecord,
  type OperationRecord,
  type RolePreferenceRecord,
  type SafetyStockRuleRecord,
} from "./schema";
import { buildSeedData } from "./seed";
import type {
  NewBatchAdjustmentInput,
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
  expiryAlertHandlings?: unknown[];
}

export const CURRENT_EXPORT_SCHEMA_VERSION = 2;

export interface ImportPreview {
  batchCount: number;
  operationCount: number;
  safetyStockRuleCount: number;
  rolePreferenceCount: number;
  herbCount: number;
  auditLogCount: number;
  expiryAlertHandlingCount: number;
  exportedAt: string;
  schemaVersion: number;
}

export interface ImportError {
  type: "version" | "batchNo_conflict" | "field_missing" | "format" | "empty";
  message: string;
  details?: string[];
}

export type ImportValidationResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; errors: ImportError[] };

export function validateImportData(raw: unknown): ImportValidationResult {
  const errors: ImportError[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: [{ type: "format", message: "导入数据格式无效，不是有效的 JSON 对象" }] };
  }

  const data = raw as Record<string, unknown>;

  if (!Array.isArray(data.batches) || !Array.isArray(data.operations)) {
    return {
      ok: false,
      errors: [{ type: "format", message: "导入数据缺少必要的 batches 或 operations 字段" }],
    };
  }

  if (typeof data.schemaVersion !== "number") {
    errors.push({
      type: "field_missing",
      message: "缺少 schemaVersion 字段，无法确认数据版本",
    });
  } else if (data.schemaVersion > CURRENT_EXPORT_SCHEMA_VERSION) {
    errors.push({
      type: "version",
      message: `数据版本 ${data.schemaVersion} 高于当前系统支持版本 ${CURRENT_EXPORT_SCHEMA_VERSION}，请升级应用后再导入`,
    });
  } else if (data.schemaVersion < 1) {
    errors.push({
      type: "version",
      message: `数据版本 ${data.schemaVersion} 过低，不支持导入`,
    });
  }

  const requiredSnapshotFields: Array<{ key: keyof ExportData; label: string }> = [
    { key: "herbs", label: "herbs（饮片表）" },
    { key: "auditLogs", label: "auditLogs（审计日志表）" },
    { key: "safetyStockRules", label: "safetyStockRules（安全库存规则表）" },
    { key: "rolePreferences", label: "rolePreferences（角色偏好表）" },
  ];

  const missingSnapshotFields: string[] = [];
  for (const { key, label } of requiredSnapshotFields) {
    if (!Array.isArray(data[key])) {
      missingSnapshotFields.push(label);
    }
  }

  if (missingSnapshotFields.length > 0) {
    errors.push({
      type: "field_missing",
      message: `快照缺少必要的数据表字段：${missingSnapshotFields.join("、")}`,
      details: missingSnapshotFields,
    });
  }

  const requiredBatchFields = ["id", "batchNo", "name", "herbId"];
  const batchMissingFieldsSet = new Set<string>();
  const batchNos = new Set<string>();
  const duplicateBatchNos: string[] = [];

  const batches = (data.batches as Record<string, unknown>[]) || [];
  for (const batch of batches) {
    for (const field of requiredBatchFields) {
      if (batch[field] === undefined || batch[field] === null || batch[field] === "") {
        batchMissingFieldsSet.add(field);
      }
    }
    const batchNo = String(batch.batchNo ?? "");
    if (batchNo) {
      if (batchNos.has(batchNo)) {
        if (!duplicateBatchNos.includes(batchNo)) {
          duplicateBatchNos.push(batchNo);
        }
      } else {
        batchNos.add(batchNo);
      }
    }
  }

  if (batchMissingFieldsSet.size > 0) {
    errors.push({
      type: "field_missing",
      message: `批号数据缺少必要字段：${Array.from(batchMissingFieldsSet).join("、")}`,
      details: Array.from(batchMissingFieldsSet),
    });
  }

  if (duplicateBatchNos.length > 0) {
    errors.push({
      type: "batchNo_conflict",
      message: `导入数据内部存在重复批号：${duplicateBatchNos.join("、")}`,
      details: duplicateBatchNos,
    });
  }

  const requiredOpFields = ["id", "batchId", "type", "quantity"];
  const opMissingFieldsSet = new Set<string>();
  const operations = (data.operations as Record<string, unknown>[]) || [];
  for (const op of operations) {
    for (const field of requiredOpFields) {
      if (op[field] === undefined || op[field] === null) {
        opMissingFieldsSet.add(field);
      }
    }
  }

  if (opMissingFieldsSet.size > 0) {
    errors.push({
      type: "field_missing",
      message: `流水数据缺少必要字段：${Array.from(opMissingFieldsSet).join("、")}`,
      details: Array.from(opMissingFieldsSet),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const preview: ImportPreview = {
    batchCount: batches.length,
    operationCount: operations.length,
    safetyStockRuleCount: Array.isArray(data.safetyStockRules) ? (data.safetyStockRules as unknown[]).length : 0,
    rolePreferenceCount: Array.isArray(data.rolePreferences) ? (data.rolePreferences as unknown[]).length : 0,
    herbCount: Array.isArray(data.herbs) ? (data.herbs as unknown[]).length : 0,
    auditLogCount: Array.isArray(data.auditLogs) ? (data.auditLogs as unknown[]).length : 0,
    expiryAlertHandlingCount: Array.isArray(data.expiryAlertHandlings) ? (data.expiryAlertHandlings as unknown[]).length : 0,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 0,
  };

  return { ok: true, preview };
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

  static async recordBatchAdjustment(
    input: NewBatchAdjustmentInput
  ): Promise<OperationResult> {
    const batch = await BatchRepository.getById(input.batchId);
    if (!batch) {
      return { ok: false, error: "批号不存在或已被移除" };
    }
    if (!Number.isFinite(input.actualStock) || input.actualStock < 0) {
      return { ok: false, error: "实际库存不能为负数" };
    }

    const current = await OperationRepository.getCurrentStock(input.batchId);
    const diff = input.actualStock - current;
    if (diff === 0) {
      return { ok: false, error: "实际库存与当前库存相同，无需调整" };
    }

    const opType: OperationType = diff > 0 ? "inbound" : "loss";
    const quantity = Math.abs(diff);
    const balanceAfter = input.actualStock;
    const now = nowIso();
    const reason = input.reason?.trim() || "盘点调整";

    const opId = createId("op");
    const operation: OperationRecord = {
      id: opId,
      batchId: input.batchId,
      type: opType,
      quantity,
      balanceAfter,
      operator: input.operator || "系统",
      remark: `批号调整：${reason}`,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: "pending",
    };

    const logId = createId("log");
    const auditLog: AuditLogRecord = {
      id: logId,
      logType: "batch_adjust",
      herbName: batch.name,
      batchNo: batch.batchNo,
      changeGrams: diff,
      operator: input.operator || "系统",
      remark: `盘点调整：${current}${batch.unit} → ${input.actualStock}${batch.unit}（${reason}）`,
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
        return { ok: false, error: `批号调整失败：${e.message}` };
      }
      return { ok: false, error: "批号调整失败：未知错误" };
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
      schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
      exportedAt: nowIso(),
      batches: snapshot.batches,
      operations: snapshot.operations,
      auditLogs: snapshot.auditLogs,
      herbs: snapshot.herbs,
      safetyStockRules: snapshot.safetyStockRules,
      rolePreferences: snapshot.rolePreferences,
      expiryAlertHandlings: snapshot.expiryAlertHandlings,
    };
  }

  static async checkBatchNoConflicts(
    incomingBatches: unknown[]
  ): Promise<string[]> {
    const existingBatches = await inventoryDB.getAll<BatchRecord>(STORES.BATCHES);
    const existingBatchNos = new Set(
      existingBatches.map((b) => b.batchNo)
    );
    const conflicts: string[] = [];
    for (const raw of incomingBatches) {
      const batch = raw as Record<string, unknown>;
      const batchNo = String(batch.batchNo ?? "");
      if (batchNo && existingBatchNos.has(batchNo)) {
        conflicts.push(batchNo);
      }
    }
    return conflicts;
  }

  static async importConsistentSnapshot(
    data: ExportData
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const herbs = ((data.herbs as Partial<HerbRecord>[]) || []).map(fillHerbDefaults);
      const batches = ((data.batches as Partial<BatchRecord>[]) || []).map(fillBatchDefaults);
      const operations = ((data.operations as Partial<OperationRecord>[]) || []).map(fillOperationDefaults);
      const auditLogs = ((data.auditLogs as Partial<AuditLogRecord>[]) || []).map(fillAuditLogDefaults);
      const safetyStockRules = ((data.safetyStockRules as Partial<SafetyStockRuleRecord>[]) || []).map(fillSafetyStockRuleDefaults);
      const rolePreferences = ((data.rolePreferences as Partial<RolePreferenceRecord>[]) || []).map(fillRolePreferenceDefaults);

      const expiryAlertHandlings = Array.isArray(data.expiryAlertHandlings)
        ? ((data.expiryAlertHandlings as Partial<ExpiryAlertHandlingRecord>[]) || []).map(fillExpiryAlertHandlingDefaults)
        : [];

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

          for (const h of herbs) {
            stores[STORES.HERBS].put(h);
          }
          for (const b of batches) {
            stores[STORES.BATCHES].put(b);
          }
          for (const op of operations) {
            stores[STORES.OPERATIONS].put(op);
          }
          for (const log of auditLogs) {
            stores[STORES.AUDIT_LOGS].put(log);
          }
          for (const rule of safetyStockRules) {
            stores[STORES.SAFETY_STOCK_RULES].put(rule);
          }
          for (const pref of rolePreferences) {
            stores[STORES.ROLE_PREFERENCES].put(pref);
          }
          for (const handling of expiryAlertHandlings) {
            stores[STORES.EXPIRY_ALERT_HANDLINGS].put(handling);
          }

          stores[STORES.META].put({
            key: this.SEED_FLAG,
            value: true,
            updatedAt: nowIso(),
          });
        }
      );

      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导入数据写入失败";
      return { ok: false, error: msg };
    }
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
