import { ConstraintError, DatabaseError, inventoryDB } from "./database";
import {
  STORES,
  fillAuditLogDefaults,
  fillBatchDefaults,
  fillHerbDefaults,
  fillOperationDefaults,
  fillRolePreferenceDefaults,
  fillSafetyStockRuleDefaults,
  type AuditLogRecord,
  type BatchRecord,
  type HerbRecord,
  type OperationRecord,
  type RolePreferenceRecord,
  type SafetyStockRuleRecord,
} from "./schema";

export type { DatabaseError, ConstraintError };

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

export interface WriteResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errorType?: "constraint" | "database";
}

export function wrapDBError(e: unknown): {
  error: string;
  errorType: "constraint" | "database";
} {
  if (e instanceof ConstraintError) {
    return {
      error: e.message || "数据冲突，可能是重复的唯一键值",
      errorType: "constraint",
    };
  }
  if (e instanceof DatabaseError) {
    return { error: e.message || "数据库操作失败", errorType: "database" };
  }
  if (e instanceof Error) {
    return { error: e.message, errorType: "database" };
  }
  return { error: "未知错误", errorType: "database" };
}

export class HerbRepository {
  static async getAll(): Promise<HerbRecord[]> {
    const raw = await inventoryDB.getAll<Partial<HerbRecord>>(STORES.HERBS);
    return raw.map(fillHerbDefaults).filter((h) => !h.isDeleted);
  }

  static async getById(id: string): Promise<HerbRecord | undefined> {
    const raw = await inventoryDB.getByKey<Partial<HerbRecord>>(
      STORES.HERBS,
      id
    );
    if (!raw) return undefined;
    const filled = fillHerbDefaults(raw);
    return filled.isDeleted ? undefined : filled;
  }

  static async getByCategory(category: string): Promise<HerbRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<HerbRecord>>(
      STORES.HERBS,
      "category",
      category
    );
    return raw.map(fillHerbDefaults).filter((h) => !h.isDeleted);
  }

  static async upsert(data: Partial<HerbRecord>): Promise<WriteResult<HerbRecord>> {
    const now = nowIso();
    const id = data.id || createId("herb");
    const existing = await this.getById(id);
    const record: HerbRecord = fillHerbDefaults({
      ...existing,
      ...data,
      id,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.HERBS, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async softDelete(id: string): Promise<WriteResult<void>> {
    const existing = await this.getById(id);
    if (!existing) {
      return { ok: false, error: "记录不存在", errorType: "database" };
    }
    return this.upsert({ ...existing, isDeleted: true }).then(() => ({
      ok: true,
    }));
  }
}

export class BatchRepository {
  static async getAll(): Promise<BatchRecord[]> {
    const raw = await inventoryDB.getAll<Partial<BatchRecord>>(STORES.BATCHES);
    return raw.map(fillBatchDefaults).filter((b) => !b.isDeleted);
  }

  static async getAllSorted(): Promise<BatchRecord[]> {
    const all = await this.getAll();
    return all.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );
  }

  static async getById(id: string): Promise<BatchRecord | undefined> {
    const raw = await inventoryDB.getByKey<Partial<BatchRecord>>(
      STORES.BATCHES,
      id
    );
    if (!raw) return undefined;
    const filled = fillBatchDefaults(raw);
    return filled.isDeleted ? undefined : filled;
  }

  static async getByBatchNo(batchNo: string): Promise<BatchRecord | undefined> {
    const raw = await inventoryDB.getByIndex<Partial<BatchRecord>>(
      STORES.BATCHES,
      "batchNo",
      batchNo
    );
    const first = raw.map(fillBatchDefaults).find((b) => !b.isDeleted);
    return first;
  }

  static async existsByBatchNo(
    batchNo: string,
    excludeId?: string
  ): Promise<boolean> {
    const found = await this.getByBatchNo(batchNo);
    if (!found) return false;
    if (excludeId && found.id === excludeId) return false;
    return true;
  }

  static async getByName(name: string): Promise<BatchRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<BatchRecord>>(
      STORES.BATCHES,
      "name",
      name
    );
    return raw.map(fillBatchDefaults).filter((b) => !b.isDeleted);
  }

  static async getByCategory(category: string): Promise<BatchRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<BatchRecord>>(
      STORES.BATCHES,
      "category",
      category
    );
    return raw.map(fillBatchDefaults).filter((b) => !b.isDeleted);
  }

  static async upsert(
    data: Partial<BatchRecord>
  ): Promise<WriteResult<BatchRecord>> {
    const now = nowIso();
    const id = data.id || createId("bat");
    const existing = await this.getById(id);
    const record: BatchRecord = fillBatchDefaults({
      ...existing,
      ...data,
      id,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.BATCHES, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async softDelete(id: string): Promise<WriteResult<void>> {
    const existing = await this.getById(id);
    if (!existing) {
      return { ok: false, error: "批号不存在", errorType: "database" };
    }
    return this.upsert({ ...existing, isDeleted: true }).then(() => ({
      ok: true,
    }));
  }

  static async markSynced(id: string): Promise<WriteResult<BatchRecord>> {
    return this.upsert({ id, syncStatus: "synced" });
  }

  static async markAllSynced(): Promise<WriteResult<void>> {
    const all = await this.getAll();
    const now = nowIso();
    const updated = all.map((b) =>
      fillBatchDefaults({ ...b, syncStatus: "synced", updatedAt: now })
    );
    try {
      await inventoryDB.putBulk(STORES.BATCHES, updated);
      return { ok: true };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }
}

export class OperationRepository {
  static async getAll(): Promise<OperationRecord[]> {
    const raw = await inventoryDB.getAll<Partial<OperationRecord>>(
      STORES.OPERATIONS
    );
    return raw.map(fillOperationDefaults).filter((o) => !o.isDeleted);
  }

  static async getByBatchId(batchId: string): Promise<OperationRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<OperationRecord>>(
      STORES.OPERATIONS,
      "batchId",
      batchId
    );
    return raw
      .map(fillOperationDefaults)
      .filter((o) => !o.isDeleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getRecent(
    batchId: string,
    limit: number
  ): Promise<OperationRecord[]> {
    const ops = await this.getByBatchId(batchId);
    return ops.slice(0, limit);
  }

  static async getById(id: string): Promise<OperationRecord | undefined> {
    const raw = await inventoryDB.getByKey<Partial<OperationRecord>>(
      STORES.OPERATIONS,
      id
    );
    if (!raw) return undefined;
    const filled = fillOperationDefaults(raw);
    return filled.isDeleted ? undefined : filled;
  }

  static async getCurrentStock(batchId: string): Promise<number> {
    const ops = await this.getByBatchId(batchId);
    let stock = 0;
    for (const op of ops) {
      stock += op.type === "inbound" ? op.quantity : -op.quantity;
    }
    return stock;
  }

  static async upsert(
    data: Partial<OperationRecord>
  ): Promise<WriteResult<OperationRecord>> {
    const now = nowIso();
    const id = data.id || createId("op");
    const existing = await this.getById(id);
    const record: OperationRecord = fillOperationDefaults({
      ...existing,
      ...data,
      id,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.OPERATIONS, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async upsertBulk(
    records: Partial<OperationRecord>[]
  ): Promise<WriteResult<OperationRecord[]>> {
    if (records.length === 0) return { ok: true, data: [] };
    const now = nowIso();
    const filled: OperationRecord[] = await Promise.all(
      records.map(async (r) => {
        const id = r.id || createId("op");
        const existing = r.id ? await this.getById(r.id) : undefined;
        return fillOperationDefaults({
          ...existing,
          ...r,
          id,
          createdAt: existing?.createdAt || r.createdAt || now,
          updatedAt: now,
        });
      })
    );
    try {
      await inventoryDB.putBulk(STORES.OPERATIONS, filled);
      return { ok: true, data: filled };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async markAllSynced(): Promise<WriteResult<void>> {
    const all = await this.getAll();
    const now = nowIso();
    const updated = all.map((o) =>
      fillOperationDefaults({ ...o, syncStatus: "synced", updatedAt: now })
    );
    try {
      await inventoryDB.putBulk(STORES.OPERATIONS, updated);
      return { ok: true };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }
}

export class AuditLogRepository {
  static async getAll(): Promise<AuditLogRecord[]> {
    const raw = await inventoryDB.getAll<Partial<AuditLogRecord>>(
      STORES.AUDIT_LOGS
    );
    return raw
      .map(fillAuditLogDefaults)
      .filter((l) => !l.isDeleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getByType(
    logType: AuditLogRecord["logType"]
  ): Promise<AuditLogRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<AuditLogRecord>>(
      STORES.AUDIT_LOGS,
      "logType",
      logType
    );
    return raw
      .map(fillAuditLogDefaults)
      .filter((l) => !l.isDeleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getByBatchNo(batchNo: string): Promise<AuditLogRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<AuditLogRecord>>(
      STORES.AUDIT_LOGS,
      "batchNo",
      batchNo
    );
    return raw
      .map(fillAuditLogDefaults)
      .filter((l) => !l.isDeleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getFiltered(params: {
    batchNo?: string;
    logType?: AuditLogRecord["logType"] | "all";
  }): Promise<AuditLogRecord[]> {
    let logs = await this.getAll();
    if (params.batchNo && params.batchNo.trim()) {
      const q = params.batchNo.trim().toLowerCase();
      logs = logs.filter((l) => l.batchNo.toLowerCase().includes(q));
    }
    if (params.logType && params.logType !== "all") {
      logs = logs.filter((l) => l.logType === params.logType);
    }
    return logs;
  }

  static async upsert(
    data: Partial<AuditLogRecord>
  ): Promise<WriteResult<AuditLogRecord>> {
    const now = nowIso();
    const id = data.id || createId("log");
    const existing = data.id
      ? await inventoryDB.getByKey<Partial<AuditLogRecord>>(STORES.AUDIT_LOGS, id)
      : undefined;
    const record: AuditLogRecord = fillAuditLogDefaults({
      ...existing,
      ...data,
      id,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.AUDIT_LOGS, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async upsertBulk(
    records: Partial<AuditLogRecord>[]
  ): Promise<WriteResult<AuditLogRecord[]>> {
    if (records.length === 0) return { ok: true, data: [] };
    const now = nowIso();
    const filled: AuditLogRecord[] = records.map((r) => {
      const id = r.id || createId("log");
      return fillAuditLogDefaults({
        ...r,
        id,
        createdAt: r.createdAt || now,
        updatedAt: now,
      });
    });
    try {
      await inventoryDB.putBulk(STORES.AUDIT_LOGS, filled);
      return { ok: true, data: filled };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async markAllSynced(): Promise<WriteResult<void>> {
    const all = await this.getAll();
    const now = nowIso();
    const updated = all.map((l) =>
      fillAuditLogDefaults({ ...l, syncStatus: "synced", updatedAt: now })
    );
    try {
      await inventoryDB.putBulk(STORES.AUDIT_LOGS, updated);
      return { ok: true };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }
}

export class SafetyStockRuleRepository {
  static async getAll(): Promise<SafetyStockRuleRecord[]> {
    const raw = await inventoryDB.getAll<Partial<SafetyStockRuleRecord>>(
      STORES.SAFETY_STOCK_RULES
    );
    return raw
      .map(fillSafetyStockRuleDefaults)
      .filter((r) => !r.isDeleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getById(id: string): Promise<SafetyStockRuleRecord | undefined> {
    const raw = await inventoryDB.getByKey<Partial<SafetyStockRuleRecord>>(
      STORES.SAFETY_STOCK_RULES,
      id
    );
    if (!raw) return undefined;
    const filled = fillSafetyStockRuleDefaults(raw);
    return filled.isDeleted ? undefined : filled;
  }

  static async getByRuleType(
    ruleType: SafetyStockRuleRecord["ruleType"]
  ): Promise<SafetyStockRuleRecord[]> {
    const raw = await inventoryDB.getByIndex<Partial<SafetyStockRuleRecord>>(
      STORES.SAFETY_STOCK_RULES,
      "ruleType",
      ruleType
    );
    return raw
      .map(fillSafetyStockRuleDefaults)
      .filter((r) => !r.isDeleted);
  }

  static async getThresholdForHerb(
    herbName: string,
    category: string,
    defaultGrams: number
  ): Promise<number> {
    const rules = await this.getAll();
    const herbRule = rules.find(
      (r) => r.ruleType === "herb" && r.target === herbName
    );
    if (herbRule) return herbRule.thresholdGrams;
    const categoryRule = rules.find(
      (r) => r.ruleType === "category" && r.target === category
    );
    if (categoryRule) return categoryRule.thresholdGrams;
    return defaultGrams;
  }

  static async existsByName(
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const rules = await this.getAll();
    return rules.some((r) => r.name === name && r.id !== excludeId);
  }

  static async upsert(
    data: Partial<SafetyStockRuleRecord>
  ): Promise<WriteResult<SafetyStockRuleRecord>> {
    const now = nowIso();
    const id = data.id || createId("ssr");
    const existing = await this.getById(id);
    const record: SafetyStockRuleRecord = fillSafetyStockRuleDefaults({
      ...existing,
      ...data,
      id,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.SAFETY_STOCK_RULES, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async softDelete(id: string): Promise<WriteResult<void>> {
    const existing = await this.getById(id);
    if (!existing) {
      return { ok: false, error: "规则不存在", errorType: "database" };
    }
    return this.upsert({ ...existing, isDeleted: true }).then(() => ({
      ok: true,
    }));
  }
}

export class RolePreferenceRepository {
  static async getAll(): Promise<RolePreferenceRecord[]> {
    const raw = await inventoryDB.getAll<Partial<RolePreferenceRecord>>(
      STORES.ROLE_PREFERENCES
    );
    return raw.map(fillRolePreferenceDefaults);
  }

  static async getByRole(
    role: RolePreferenceRecord["role"]
  ): Promise<RolePreferenceRecord | undefined> {
    const raw = await inventoryDB.getByKey<Partial<RolePreferenceRecord>>(
      STORES.ROLE_PREFERENCES,
      role
    );
    if (!raw) return undefined;
    return fillRolePreferenceDefaults(raw);
  }

  static async upsert(
    data: Partial<RolePreferenceRecord> & {
      role: RolePreferenceRecord["role"];
    }
  ): Promise<WriteResult<RolePreferenceRecord>> {
    const now = nowIso();
    const existing = await this.getByRole(data.role);
    const record: RolePreferenceRecord = fillRolePreferenceDefaults({
      ...existing,
      ...data,
      role: data.role,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    try {
      await inventoryDB.put(STORES.ROLE_PREFERENCES, record);
      return { ok: true, data: record };
    } catch (e) {
      const info = wrapDBError(e);
      return { ok: false, ...info };
    }
  }

  static async addRecentSearch(
    role: RolePreferenceRecord["role"],
    search: string,
    maxItems = 10
  ): Promise<WriteResult<RolePreferenceRecord>> {
    const existing = (await this.getByRole(role)) || {
      role,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const searches = [search, ...(existing.recentSearches || [])]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, maxItems);
    return this.upsert({ ...existing, recentSearches: searches });
  }

  static async updateWarehouseOpType(
    role: RolePreferenceRecord["role"],
    opType: "inbound" | "outbound" | "loss"
  ): Promise<WriteResult<RolePreferenceRecord>> {
    const existing = (await this.getByRole(role)) || {
      role,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return this.upsert({ ...existing, warehouseOpType: opType });
  }

  static async updateManagerSortBy(
    role: RolePreferenceRecord["role"],
    sortBy: "stock" | "batchCount" | "name"
  ): Promise<WriteResult<RolePreferenceRecord>> {
    const existing = (await this.getByRole(role)) || {
      role,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return this.upsert({ ...existing, managerSortBy: sortBy });
  }

  static async updateSelectedCategory(
    role: RolePreferenceRecord["role"],
    category: string
  ): Promise<WriteResult<RolePreferenceRecord>> {
    const existing = (await this.getByRole(role)) || {
      role,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return this.upsert({ ...existing, selectedCategory: category });
  }
}
