import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertLevel,
  AUDIT_LOG_LABELS,
  AuditLogType,
  BaseEntity,
  BatchLedgerDTO,
  CategoryProcurementSummary,
  DEFAULT_CONSUMPTION_DAYS,
  DEFAULT_PURCHASE_COVER_DAYS,
  ExpiryStatus,
  InventoryAuditLogDTO,
  LedgerOperationDTO,
  LedgerState,
  LOW_STOCK_GRAMS,
  NEAR_EXPIRY_DAYS,
  NEAR_EXPIRY_UNSAFE_DAYS,
  NewBatchInput,
  NewOperationInput,
  NewSafetyStockRuleInput,
  OperationResult,
  OperationType,
  PriorityLevel,
  ProcurementSuggestionItem,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  SAFETY_STOCK_SCHEMA_VERSION,
  SafetyStockRuleDTO,
  SafetyStockState,
  SCHEMA_VERSION,
  SyncStatus,
  WARNING_EXPIRY_DAYS_30,
} from "./types";
import { useInventoryStore } from "./db/useInventoryStore";
import type { InventoryStore } from "./db/useInventoryStore";
import { InventoryService } from "./db/inventoryService";
import { BatchRepository, OperationRepository } from "./db/repositories";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function createBaseEntity(id: string): BaseEntity {
  const ts = nowIso();
  return {
    id,
    createdAt: ts,
    updatedAt: ts,
    isDeleted: false,
    syncStatus: "pending",
  };
}

export function createEmptyState(): LedgerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    batches: {},
    operations: [],
    auditLogs: [],
  };
}

function createAuditLog(params: {
  logType: AuditLogType;
  herbName: string;
  batchNo: string;
  changeGrams: number;
  operator: string;
  remark: string;
  safetyStockBefore?: number;
  safetyStockAfter?: number;
  safetyStockTarget?: string;
}): InventoryAuditLogDTO {
  return {
    ...createBaseEntity(createId("log")),
    logType: params.logType,
    herbName: params.herbName,
    batchNo: params.batchNo,
    changeGrams: params.changeGrams,
    operator: params.operator || "系统",
    remark: params.remark,
    safetyStockBefore: params.safetyStockBefore,
    safetyStockAfter: params.safetyStockAfter,
    safetyStockTarget: params.safetyStockTarget,
  };
}

export function selectPendingSyncCount(state: LedgerState): number {
  const pendingBatches = Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus !== "synced"
  ).length;
  const pendingOps = state.operations.filter(
    (o) => !o.isDeleted && o.syncStatus !== "synced"
  ).length;
  const pendingLogs = state.auditLogs.filter(
    (l) => !l.isDeleted && l.syncStatus !== "synced"
  ).length;
  return pendingBatches + pendingOps + pendingLogs;
}

export function selectAllAuditLogs(state: LedgerState): InventoryAuditLogDTO[] {
  return state.auditLogs.filter((l) => !l.isDeleted);
}

export function selectAuditLogsByBatchNo(
  state: LedgerState,
  batchNo: string
): InventoryAuditLogDTO[] {
  return selectAllAuditLogs(state).filter((l) => l.batchNo === batchNo);
}

export function selectAuditLogsByType(
  state: LedgerState,
  logType: AuditLogType
): InventoryAuditLogDTO[] {
  return selectAllAuditLogs(state).filter((l) => l.logType === logType);
}

export function selectFilteredAuditLogs(
  state: LedgerState,
  filters: { batchNo?: string; logType?: AuditLogType | "all" }
): InventoryAuditLogDTO[] {
  let logs = selectAllAuditLogs(state);
  if (filters.batchNo && filters.batchNo.trim()) {
    const q = filters.batchNo.trim().toLowerCase();
    logs = logs.filter((l) => l.batchNo.toLowerCase().includes(q));
  }
  if (filters.logType && filters.logType !== "all") {
    logs = logs.filter((l) => l.logType === filters.logType);
  }
  return logs;
}

export function selectBatchByNo(
  state: LedgerState,
  batchNo: string
): BatchLedgerDTO | undefined {
  return Object.values(state.batches).find(
    (b) => !b.isDeleted && b.batchNo === batchNo
  );
}

export function selectAllBatches(state: LedgerState): BatchLedgerDTO[] {
  return Object.values(state.batches)
    .filter((b) => !b.isDeleted)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function selectBatchesByHerbName(
  state: LedgerState,
  name: string
): BatchLedgerDTO[] {
  return selectAllBatches(state).filter(
    (b) => b.name.toLowerCase() === name.toLowerCase()
  );
}

export function selectAllOperations(state: LedgerState): LedgerOperationDTO[] {
  return state.operations.filter((o) => !o.isDeleted);
}

export function selectLowStockBatches(state: LedgerState): BatchLedgerDTO[] {
  return selectAllBatches(state).filter((b) =>
    isLowStock(selectCurrentStock(state, b.id))
  );
}

export function selectExpiringBatches(
  state: LedgerState,
  daysThreshold = NEAR_EXPIRY_DAYS
): BatchLedgerDTO[] {
  return selectAllBatches(state).filter((b) => {
    const status = selectExpiryStatus(b.expiry);
    return status === "near" || status === "expired";
  });
}

export function selectTotalStockByName(
  state: LedgerState
): Array<{ name: string; totalStock: number; unit: string; batchCount: number }> {
  const map = new Map<string, { total: number; unit: string; count: number }>();
  for (const batch of selectAllBatches(state)) {
    const stock = selectCurrentStock(state, batch.id);
    const existing = map.get(batch.name) ?? {
      total: 0,
      unit: batch.unit,
      count: 0,
    };
    existing.total += stock;
    existing.count += 1;
    map.set(batch.name, existing);
  }
  return Array.from(map.entries()).map(([name, data]) => ({
    name,
    totalStock: data.total,
    unit: data.unit,
    batchCount: data.count,
  }));
}

export function exportState(state: LedgerState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): LedgerState {
  const parsed = JSON.parse(json) as Partial<LedgerState>;
  if (!parsed.schemaVersion || parsed.schemaVersion > SCHEMA_VERSION) {
    throw new Error("数据版本不兼容");
  }
  if (parsed.schemaVersion < SCHEMA_VERSION) {
    return migrateState(parsed as LedgerState);
  }
  return parsed as LedgerState;
}

export function migrateState(state: LedgerState): LedgerState {
  if (state.schemaVersion === SCHEMA_VERSION) return state;

  const migrated: LedgerState = {
    ...createEmptyState(),
    ...state,
    schemaVersion: SCHEMA_VERSION,
    auditLogs: state.auditLogs ?? [],
  };

  for (const id of Object.keys(migrated.batches)) {
    migrated.batches[id] = {
      ...createBaseEntity(id),
      ...migrated.batches[id],
    };
  }

  migrated.operations = migrated.operations.map((op) => ({
    ...createBaseEntity(op.id),
    ...op,
  }));

  migrated.auditLogs = migrated.auditLogs.map((log) => ({
    ...createBaseEntity(log.id),
    ...log,
  }));

  return migrated;
}

export function markSynced(
  state: LedgerState,
  timestamp: string = nowIso()
): LedgerState {
  const batches: Record<string, BatchLedgerDTO> = {};
  for (const id of Object.keys(state.batches)) {
    batches[id] = {
      ...state.batches[id],
      syncStatus: "synced" as SyncStatus,
      updatedAt: timestamp,
    };
  }
  const operations = state.operations.map((op) => ({
    ...op,
    syncStatus: "synced" as SyncStatus,
    updatedAt: timestamp,
  }));
  const auditLogs = state.auditLogs.map((log) => ({
    ...log,
    syncStatus: "synced" as SyncStatus,
    updatedAt: timestamp,
  }));
  return {
    ...state,
    batches,
    operations,
    auditLogs,
    lastSyncedAt: timestamp,
  };
}

export function checkBatchNoExists(
  state: LedgerState,
  batchNo: string,
  excludeId?: string
): boolean {
  return Object.values(state.batches).some(
    (b) => !b.isDeleted && b.batchNo === batchNo && b.id !== excludeId
  );
}

export function selectBatches(state: LedgerState): BatchLedgerDTO[] {
  return selectAllBatches(state);
}

export function selectBatchById(
  state: LedgerState,
  batchId: string
): BatchLedgerDTO | undefined {
  const batch = state.batches[batchId];
  return batch && !batch.isDeleted ? batch : undefined;
}

export function selectOperationsForBatch(
  state: LedgerState,
  batchId: string
): LedgerOperationDTO[] {
  return state.operations.filter(
    (op) => !op.isDeleted && op.batchId === batchId
  );
}

export function selectRecentOperations(
  state: LedgerState,
  batchId: string,
  limit = 5
): LedgerOperationDTO[] {
  return selectOperationsForBatch(state, batchId).slice(0, limit);
}

export function selectCurrentStock(
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

export function selectExpiryStatus(expiry: string): ExpiryStatus {
  const diff = daysUntilExpiry(expiry);
  if (diff <= 0) return "expired";
  if (diff <= NEAR_EXPIRY_DAYS) return "near";
  return "ok";
}

export function selectAlertLevel(expiry: string): AlertLevel {
  const diff = daysUntilExpiry(expiry);
  if (diff <= 0) return "expired";
  if (diff <= WARNING_EXPIRY_DAYS_30) return "warning30";
  if (diff <= NEAR_EXPIRY_DAYS) return "warning60";
  return "normal";
}

export function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiry);
  return Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function selectBatchesByAlertLevel(
  state: LedgerState
): Record<AlertLevel, BatchLedgerDTO[]> {
  const result: Record<AlertLevel, BatchLedgerDTO[]> = {
    normal: [],
    warning60: [],
    warning30: [],
    expired: [],
  };
  for (const batch of selectAllBatches(state)) {
    const level = selectAlertLevel(batch.expiry);
    result[level].push(batch);
  }
  return result;
}

export function countBatchesByAlertLevel(
  state: LedgerState
): Record<AlertLevel, number> {
  const grouped = selectBatchesByAlertLevel(state);
  return {
    normal: grouped.normal.length,
    warning60: grouped.warning60.length,
    warning30: grouped.warning30.length,
    expired: grouped.expired.length,
  };
}

export function selectNearExpiryCount(state: LedgerState): number {
  const counts = countBatchesByAlertLevel(state);
  return counts.warning60 + counts.warning30 + counts.expired;
}

export function isLowStock(stock: number): boolean {
  return stock < LOW_STOCK_GRAMS;
}

export function createBatch(
  state: LedgerState,
  input: NewBatchInput
): { state: LedgerState; batchId: string } {
  const ts = nowIso();
  const batchId = createId("bat");
  const batch: BatchLedgerDTO = {
    ...createBaseEntity(batchId),
    name: input.name,
    spec: input.spec,
    origin: input.origin,
    category: input.category,
    batchNo: input.batchNo,
    expiry: input.expiry,
    unit: input.unit || "g",
  };
  const openingOp: LedgerOperationDTO = {
    ...createBaseEntity(createId("op")),
    batchId,
    type: "inbound",
    quantity: input.initialStock,
    balanceAfter: input.initialStock,
    operator: input.operator || "系统",
    remark: input.remark || "期初入库",
  };
  const auditLog: InventoryAuditLogDTO = createAuditLog({
    logType: "create_batch",
    herbName: input.name,
    batchNo: input.batchNo,
    changeGrams: input.initialStock,
    operator: input.operator || "系统",
    remark: input.remark || `新增批号，期初库存 ${input.initialStock}${input.unit || "g"}`,
  });
  return {
    batchId,
    state: {
      ...state,
      batches: { ...state.batches, [batchId]: batch },
      operations: [openingOp, ...state.operations],
      auditLogs: [auditLog, ...state.auditLogs],
    },
  };
}

export function applyOperation(
  state: LedgerState,
  input: NewOperationInput
): OperationResult & { state?: LedgerState } {
  const batch = selectBatchById(state, input.batchId);
  if (!batch) {
    return { ok: false, error: "批号不存在或已被移除" };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "数量必须为大于 0 的数字" };
  }
  const current = selectCurrentStock(state, input.batchId);
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
  const ts = nowIso();
  const op: LedgerOperationDTO = {
    ...createBaseEntity(createId("op")),
    batchId: input.batchId,
    type: input.type,
    quantity: input.quantity,
    balanceAfter,
    operator: input.operator || "系统",
    remark: input.remark,
  };
  const changeGrams =
    input.type === "inbound" ? input.quantity : -input.quantity;
  const auditLog: InventoryAuditLogDTO = createAuditLog({
    logType: input.type as AuditLogType,
    herbName: batch.name,
    batchNo: batch.batchNo,
    changeGrams,
    operator: input.operator || "系统",
    remark: input.remark || `${AUDIT_LOG_LABELS[input.type as AuditLogType]} ${input.quantity}${batch.unit}`,
  });
  return {
    ok: true,
    state: {
      ...state,
      batches: {
        ...state.batches,
        [input.batchId]: { ...batch, updatedAt: ts, syncStatus: "pending" },
      },
      operations: [op, ...state.operations],
      auditLogs: [auditLog, ...state.auditLogs],
    },
  };
}

interface SeedMovement {
  type: OperationType;
  quantity: number;
  operator: string;
  remark: string;
  createdAt: string;
}

function buildBatch(
  base: Omit<BatchLedgerDTO, "updatedAt" | "isDeleted" | "syncStatus" | "serverId">,
  movements: SeedMovement[]
): { batch: BatchLedgerDTO; ops: LedgerOperationDTO[]; logs: InventoryAuditLogDTO[] } {
  let balance = 0;
  const opsChrono: LedgerOperationDTO[] = [];
  const logsChrono: InventoryAuditLogDTO[] = [];

  movements.forEach((m, idx) => {
    balance = m.type === "inbound" ? balance + m.quantity : balance - m.quantity;
    const op: LedgerOperationDTO = {
      ...createBaseEntity(createId("op")),
      batchId: base.id,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: balance,
      operator: m.operator,
      remark: m.remark,
      createdAt: m.createdAt,
      updatedAt: m.createdAt,
    };
    opsChrono.push(op);

    if (idx === 0 && m.type === "inbound" && m.remark.includes("期初入库")) {
      const createLog: InventoryAuditLogDTO = {
        ...createBaseEntity(createId("log")),
        logType: "create_batch",
        herbName: base.name,
        batchNo: base.batchNo,
        changeGrams: m.quantity,
        operator: m.operator,
        remark: `新增批号，期初库存 ${m.quantity}${base.unit}`,
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        syncStatus: "synced",
      };
      logsChrono.push(createLog);
    } else {
      const changeGrams = m.type === "inbound" ? m.quantity : -m.quantity;
      const log: InventoryAuditLogDTO = {
        ...createBaseEntity(createId("log")),
        logType: m.type as AuditLogType,
        herbName: base.name,
        batchNo: base.batchNo,
        changeGrams,
        operator: m.operator,
        remark: m.remark || `${AUDIT_LOG_LABELS[m.type as AuditLogType]} ${m.quantity}${base.unit}`,
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        syncStatus: "synced",
      };
      logsChrono.push(log);
    }
  });

  const opsDesc = [...opsChrono].reverse();
  const logsDesc = [...logsChrono].reverse();
  const updatedAt = opsChrono.length
    ? opsChrono[opsChrono.length - 1].createdAt
    : base.createdAt;
  return {
    batch: {
      ...createBaseEntity(base.id),
      ...base,
      createdAt: base.createdAt,
      updatedAt,
      syncStatus: "synced",
    },
    ops: opsDesc,
    logs: logsDesc,
  };
}

export function createSeedState(): LedgerState {
  const groups = [
    buildBatch(
      {
        id: "bat_huangqi_01",
        name: "黄芪",
        spec: "蜜炙",
        origin: "甘肃",
        category: "补气",
        batchNo: "HQ2603",
        expiry: "2026-12-31",
        unit: "g",
        createdAt: "2026-03-01T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 8000, operator: "库管", remark: "期初入库", createdAt: "2026-03-01T09:05:00.000Z" },
        { type: "outbound", quantity: 900, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-15T14:20:00.000Z" },
        { type: "outbound", quantity: 1200, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-22T14:20:00.000Z" },
        { type: "outbound", quantity: 600, operator: "药师·李", remark: "煎剂室领用", createdAt: "2026-06-05T10:00:00.000Z" },
        { type: "outbound", quantity: 800, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-12T08:30:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-15T09:15:00.000Z" },
        { type: "loss", quantity: 80, operator: "库管", remark: "月末盘点损耗", createdAt: "2026-06-15T10:30:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_dangshen_01",
        name: "党参",
        spec: "生品",
        origin: "山西",
        category: "补气",
        batchNo: "DS2604",
        expiry: "2026-07-10",
        unit: "g",
        createdAt: "2026-04-10T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 3000, operator: "库管", remark: "期初入库", createdAt: "2026-04-10T09:05:00.000Z" },
        { type: "outbound", quantity: 400, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-20T10:00:00.000Z" },
        { type: "outbound", quantity: 350, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-01T11:20:00.000Z" },
        { type: "outbound", quantity: 280, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-10T14:00:00.000Z" },
        { type: "outbound", quantity: 200, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-15T08:40:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_jinyinhua_01",
        name: "金银花",
        spec: "生品",
        origin: "河南",
        category: "清热",
        batchNo: "JYH2509",
        expiry: "2026-07-04",
        unit: "g",
        createdAt: "2026-02-10T08:30:00.000Z",
      },
      [
        { type: "inbound", quantity: 4000, operator: "库管", remark: "期初入库", createdAt: "2026-02-10T08:35:00.000Z" },
        { type: "outbound", quantity: 600, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-18T11:00:00.000Z" },
        { type: "outbound", quantity: 800, operator: "药师·李", remark: "夏季凉茶方领用", createdAt: "2026-05-28T10:20:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-05T15:40:00.000Z" },
        { type: "outbound", quantity: 700, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-12T09:30:00.000Z" },
        { type: "outbound", quantity: 450, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-15T14:10:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_lianqiao_01",
        name: "连翘",
        spec: "生品",
        origin: "山西",
        category: "清热",
        batchNo: "LQ2602",
        expiry: "2027-01-20",
        unit: "g",
        createdAt: "2026-02-20T10:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 2000, operator: "库管", remark: "期初入库", createdAt: "2026-02-20T10:05:00.000Z" },
        { type: "outbound", quantity: 300, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-25T10:30:00.000Z" },
        { type: "outbound", quantity: 250, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-05T15:20:00.000Z" },
        { type: "outbound", quantity: 180, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-12T11:00:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_banlangen_01",
        name: "板蓝根",
        spec: "切片",
        origin: "河北",
        category: "清热",
        batchNo: "BLG2510",
        expiry: "2026-06-30",
        unit: "g",
        createdAt: "2025-10-20T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 5000, operator: "库管", remark: "期初入库", createdAt: "2025-10-20T09:05:00.000Z" },
        { type: "outbound", quantity: 800, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-10T10:00:00.000Z" },
        { type: "outbound", quantity: 600, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-05-20T09:30:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-02T14:00:00.000Z" },
        { type: "outbound", quantity: 450, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-10T10:20:00.000Z" },
        { type: "outbound", quantity: 320, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-15T08:50:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_danshen_01",
        name: "丹参",
        spec: "切片",
        origin: "山东",
        category: "活血",
        batchNo: "DS2601",
        expiry: "2027-03-15",
        unit: "g",
        createdAt: "2026-01-15T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 1500, operator: "库管", remark: "期初入库", createdAt: "2026-01-15T09:10:00.000Z" },
        { type: "outbound", quantity: 320, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-05-20T13:10:00.000Z" },
        { type: "outbound", quantity: 280, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-02T10:40:00.000Z" },
        { type: "outbound", quantity: 200, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-12T15:00:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_chuanxiong_01",
        name: "川芎",
        spec: "酒炙",
        origin: "四川",
        category: "活血",
        batchNo: "CX2603",
        expiry: "2026-09-15",
        unit: "g",
        createdAt: "2026-03-20T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 2500, operator: "库管", remark: "期初入库", createdAt: "2026-03-20T09:05:00.000Z" },
        { type: "outbound", quantity: 200, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-01T10:20:00.000Z" },
        { type: "outbound", quantity: 150, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-10T09:40:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_taoren_01",
        name: "桃仁",
        spec: "生品",
        origin: "陕西",
        category: "活血",
        batchNo: "TR2601",
        expiry: "2026-08-30",
        unit: "g",
        createdAt: "2026-01-30T10:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 1200, operator: "库管", remark: "期初入库", createdAt: "2026-01-30T10:05:00.000Z" },
        { type: "outbound", quantity: 150, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-28T11:20:00.000Z" },
        { type: "outbound", quantity: 100, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-08T14:30:00.000Z" },
        { type: "outbound", quantity: 80, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-14T10:10:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_cangzhu_01",
        name: "苍术",
        spec: "麸炒",
        origin: "江苏",
        category: "化湿",
        batchNo: "CZ2602",
        expiry: "2026-10-20",
        unit: "g",
        createdAt: "2026-02-20T10:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 3000, operator: "库管", remark: "期初入库", createdAt: "2026-02-20T10:05:00.000Z" },
        { type: "outbound", quantity: 400, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-15T14:00:00.000Z" },
        { type: "outbound", quantity: 300, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-05-30T09:20:00.000Z" },
        { type: "loss", quantity: 50, operator: "库管", remark: "受潮损耗", createdAt: "2026-06-05T09:00:00.000Z" },
        { type: "outbound", quantity: 350, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-12T10:40:00.000Z" },
        { type: "outbound", quantity: 280, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-15T11:30:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_houpo_01",
        name: "厚朴",
        spec: "姜炙",
        origin: "四川",
        category: "化湿",
        batchNo: "HP2601",
        expiry: "2026-07-20",
        unit: "g",
        createdAt: "2026-01-25T09:30:00.000Z",
      },
      [
        { type: "inbound", quantity: 2000, operator: "库管", remark: "期初入库", createdAt: "2026-01-25T09:35:00.000Z" },
        { type: "outbound", quantity: 250, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-22T10:20:00.000Z" },
        { type: "outbound", quantity: 180, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-03T14:30:00.000Z" },
        { type: "outbound", quantity: 200, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-10T11:00:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_huoxiang_01",
        name: "藿香",
        spec: "生品",
        origin: "广东",
        category: "化湿",
        batchNo: "HX2512",
        expiry: "2026-06-25",
        unit: "g",
        createdAt: "2025-12-15T08:30:00.000Z",
      },
      [
        { type: "inbound", quantity: 3500, operator: "库管", remark: "期初入库", createdAt: "2025-12-15T08:35:00.000Z" },
        { type: "outbound", quantity: 600, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-05-18T10:00:00.000Z" },
        { type: "outbound", quantity: 450, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-05-28T14:20:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·赵", remark: "夏季解暑方领用", createdAt: "2026-06-05T11:30:00.000Z" },
        { type: "outbound", quantity: 380, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-12T09:20:00.000Z" },
        { type: "outbound", quantity: 300, operator: "药师·李", remark: "代煎订单", createdAt: "2026-06-15T13:50:00.000Z" },
      ]
    ),
    buildBatch(
      {
        id: "bat_baizhu_01",
        name: "白术",
        spec: "麸炒",
        origin: "浙江",
        category: "补气",
        batchNo: "BZ2602",
        expiry: "2026-11-30",
        unit: "g",
        createdAt: "2026-02-28T09:00:00.000Z",
      },
      [
        { type: "inbound", quantity: 6000, operator: "库管", remark: "期初入库", createdAt: "2026-02-28T09:05:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-06-05T10:00:00.000Z" },
        { type: "outbound", quantity: 400, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-06-12T14:20:00.000Z" },
      ]
    ),
  ];

  const batches: Record<string, BatchLedgerDTO> = {};
  const operations: LedgerOperationDTO[] = [];
  const auditLogs: InventoryAuditLogDTO[] = [];
  for (const g of groups) {
    batches[g.batch.id] = g.batch;
    operations.push(...g.ops);
    auditLogs.push(...g.logs);
  }
  operations.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  auditLogs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return {
    schemaVersion: SCHEMA_VERSION,
    batches,
    operations,
    auditLogs,
    lastSyncedAt: nowIso(),
  };
}

export interface LedgerStore {
  state: LedgerState;
  addBatch: (input: NewBatchInput) => Promise<string | null>;
  recordOperation: (input: NewOperationInput) => OperationResult;
  recordSafetyStockChange: (params: {
    herbName: string;
    batchNo: string;
    operator: string;
    remark: string;
    safetyStockBefore: number;
    safetyStockAfter: number;
    safetyStockTarget: string;
  }) => OperationResult;
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
    recordSafetyStockChange: asyncRecordSafetyStockChange,
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
    recordSafetyStockChange,
    inventoryStore,
  };
}

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

export function selectSafetyStockThresholdForHerb(
  state: SafetyStockState,
  herbName: string,
  category: string
): number {
  const rules = selectAllSafetyStockRules(state);
  const herbRule = rules.find(
    (r) => r.ruleType === "herb" && r.target === herbName
  );
  if (herbRule) {
    return herbRule.thresholdGrams;
  }
  const categoryRule = rules.find(
    (r) => r.ruleType === "category" && r.target === category
  );
  if (categoryRule) {
    return categoryRule.thresholdGrams;
  }
  return LOW_STOCK_GRAMS;
}

export function isLowStockWithRules(
  stock: number,
  threshold: number
): boolean {
  return stock < threshold;
}

export function selectLowStockBatchesWithRules(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): BatchLedgerDTO[] {
  return selectAllBatches(ledgerState).filter((b) => {
    const stock = selectCurrentStock(ledgerState, b.id);
    const threshold = selectSafetyStockThresholdForHerb(
      safetyStockState,
      b.name,
      b.category
    );
    return isLowStockWithRules(stock, threshold);
  });
}

export function selectLowStockHerbCountWithRules(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): number {
  return selectLowStockHerbList(ledgerState, safetyStockState).length;
}

export interface LowStockHerbItem {
  name: string;
  category: string;
  totalStock: number;
  unit: string;
  thresholdGrams: number;
  shortageGrams: number;
  batchCount: number;
  batches: BatchLedgerDTO[];
}

export function selectLowStockHerbList(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState
): LowStockHerbItem[] {
  const map = new Map<string, LowStockHerbItem>();

  for (const batch of selectAllBatches(ledgerState)) {
    const stock = selectCurrentStock(ledgerState, batch.id);
    const existing = map.get(batch.name);

    if (existing) {
      existing.totalStock += stock;
      existing.batchCount += 1;
      existing.batches.push(batch);
    } else {
      const threshold = selectSafetyStockThresholdForHerb(
        safetyStockState,
        batch.name,
        batch.category
      );
      map.set(batch.name, {
        name: batch.name,
        category: batch.category,
        totalStock: stock,
        unit: batch.unit,
        thresholdGrams: threshold,
        shortageGrams: threshold - stock,
        batchCount: 1,
        batches: [batch],
      });
    }
  }

  const list = Array.from(map.values()).filter((item) =>
    isLowStockWithRules(item.totalStock, item.thresholdGrams)
  );

  for (const item of list) {
    item.shortageGrams = item.thresholdGrams - item.totalStock;
  }

  list.sort((a, b) => b.shortageGrams - a.shortageGrams);

  return list;
}

function selectOutboundOperationsForHerb(
  ledgerState: LedgerState,
  herbName: string
): LedgerOperationDTO[] {
  const batches = selectBatchesByHerbName(ledgerState, herbName);
  const batchIds = new Set(batches.map((b) => b.id));
  return selectAllOperations(ledgerState).filter(
    (op) => op.type === "outbound" && batchIds.has(op.batchId)
  );
}

function calculateAvgDailyConsumption(
  outboundOps: LedgerOperationDTO[],
  days: number = DEFAULT_CONSUMPTION_DAYS
): number {
  if (outboundOps.length === 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let totalQty = 0;
  let earliestOpTime = now.getTime();

  for (const op of outboundOps) {
    const opTime = new Date(op.createdAt).getTime();
    if (opTime >= cutoff.getTime()) {
      totalQty += op.quantity;
      if (opTime < earliestOpTime) {
        earliestOpTime = opTime;
      }
    }
  }

  if (totalQty === 0) return 0;

  const daysSpan = Math.max(
    1,
    Math.ceil((now.getTime() - earliestOpTime) / (24 * 60 * 60 * 1000))
  );
  return totalQty / daysSpan;
}

export function selectProcurementSuggestions(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState,
  options?: {
    consumptionDays?: number;
    coverDays?: number;
    nearExpiryUnsafeDays?: number;
  }
): ProcurementSuggestionItem[] {
  const consumptionDays = options?.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS;
  const coverDays = options?.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS;
  const nearExpiryUnsafeDays =
    options?.nearExpiryUnsafeDays ?? NEAR_EXPIRY_UNSAFE_DAYS;

  const allBatches = selectAllBatches(ledgerState);
  const herbMap = new Map<string, BatchLedgerDTO[]>();

  for (const batch of allBatches) {
    const list = herbMap.get(batch.name) ?? [];
    list.push(batch);
    herbMap.set(batch.name, list);
  }

  const suggestions: ProcurementSuggestionItem[] = [];

  for (const [herbName, batches] of herbMap.entries()) {
    const firstBatch = batches[0];
    const threshold = selectSafetyStockThresholdForHerb(
      safetyStockState,
      herbName,
      firstBatch.category
    );

    let totalStock = 0;
    let nearExpiryStock = 0;
    const nearExpiryBatches: ProcurementSuggestionItem["nearExpiryBatches"] = [];

    for (const batch of batches) {
      const stock = selectCurrentStock(ledgerState, batch.id);
      totalStock += stock;

      const daysLeft = daysUntilExpiry(batch.expiry);
      if (daysLeft <= nearExpiryUnsafeDays && stock > 0) {
        nearExpiryStock += stock;
        nearExpiryBatches.push({
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiry: batch.expiry,
          daysLeft,
          stock,
        });
      }
    }

    nearExpiryBatches.sort((a, b) => a.daysLeft - b.daysLeft);

    const safeAvailableStock = Math.max(0, totalStock - nearExpiryStock);

    const outboundOps = selectOutboundOperationsForHerb(ledgerState, herbName);
    const avgDailyConsumption = calculateAvgDailyConsumption(
      outboundOps,
      consumptionDays
    );

    let stockDaysLeft = Infinity;
    if (avgDailyConsumption > 0 && safeAvailableStock > 0) {
      stockDaysLeft = safeAvailableStock / avgDailyConsumption;
    } else if (safeAvailableStock <= 0) {
      stockDaysLeft = 0;
    }

    const targetStock = Math.max(
      threshold,
      avgDailyConsumption * coverDays
    );
    let suggestedPurchaseQty = Math.max(0, targetStock - safeAvailableStock);

    if (suggestedPurchaseQty > 0 && avgDailyConsumption > 0) {
      const minOrderQty = avgDailyConsumption * 7;
      suggestedPurchaseQty = Math.max(suggestedPurchaseQty, minOrderQty);
    }

    suggestedPurchaseQty = Math.ceil(suggestedPurchaseQty / 100) * 100;

    let priorityScore = 0;

    if (safeAvailableStock < threshold) {
      const shortageRatio = (threshold - safeAvailableStock) / threshold;
      priorityScore += shortageRatio * 50;
    }

    if (avgDailyConsumption > 0 && stockDaysLeft < Infinity) {
      if (stockDaysLeft <= 7) {
        priorityScore += 40;
      } else if (stockDaysLeft <= 14) {
        priorityScore += 25;
      } else if (stockDaysLeft <= 30) {
        priorityScore += 10;
      }
    }

    if (nearExpiryStock > 0) {
      const nearExpiryRatio = nearExpiryStock / Math.max(1, totalStock);
      priorityScore += nearExpiryRatio * 20;
    }

    if (suggestedPurchaseQty <= 0) {
      priorityScore = 0;
    }

    let priority: PriorityLevel;
    if (suggestedPurchaseQty <= 0) {
      priority = "low";
    } else if (priorityScore >= 60) {
      priority = "urgent";
    } else if (priorityScore >= 35) {
      priority = "high";
    } else if (priorityScore >= 15) {
      priority = "medium";
    } else {
      priority = "low";
    }

    suggestions.push({
      name: herbName,
      spec: firstBatch.spec,
      origin: firstBatch.origin,
      category: firstBatch.category,
      unit: firstBatch.unit,
      totalStock,
      safeAvailableStock,
      nearExpiryStock,
      nearExpiryBatches,
      thresholdGrams: threshold,
      avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
      consumptionDays,
      suggestedPurchaseQty,
      priority,
      priorityScore: Math.round(priorityScore * 100) / 100,
      stockDaysLeft:
        stockDaysLeft === Infinity
          ? Infinity
          : Math.round(stockDaysLeft * 10) / 10,
      batchCount: batches.length,
      batches,
    });
  }

  suggestions.sort((a, b) => {
    const priorityDiff =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    if (b.suggestedPurchaseQty !== a.suggestedPurchaseQty) {
      return b.suggestedPurchaseQty - a.suggestedPurchaseQty;
    }
    return b.priorityScore - a.priorityScore;
  });

  return suggestions;
}

export function selectProcurementSuggestionsFiltered(
  ledgerState: LedgerState,
  safetyStockState: SafetyStockState,
  filters: {
    category?: string;
    priority?: PriorityLevel | "all";
    query?: string;
    onlyNeedPurchase?: boolean;
  }
): ProcurementSuggestionItem[] {
  const all = selectProcurementSuggestions(ledgerState, safetyStockState);
  const q = (filters.query ?? "").trim().toLowerCase();

  return all.filter((item) => {
    if (filters.category && filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) {
      return false;
    }
    if (q && !item.name.toLowerCase().includes(q)) {
      return false;
    }
    if (filters.onlyNeedPurchase && item.suggestedPurchaseQty <= 0) {
      return false;
    }
    return true;
  });
}

export function selectCategoryProcurementSummary(
  suggestions: ProcurementSuggestionItem[]
): CategoryProcurementSummary[] {
  const map = new Map<string, CategoryProcurementSummary>();

  for (const item of suggestions) {
    if (item.suggestedPurchaseQty <= 0) continue;

    const existing = map.get(item.category) ?? {
      category: item.category,
      herbCount: 0,
      totalSuggestedQty: 0,
      urgentCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    };

    existing.herbCount += 1;
    existing.totalSuggestedQty += item.suggestedPurchaseQty;
    if (item.priority === "urgent") existing.urgentCount += 1;
    else if (item.priority === "high") existing.highCount += 1;
    else if (item.priority === "medium") existing.mediumCount += 1;
    else if (item.priority === "low") existing.lowCount += 1;

    map.set(item.category, existing);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalSuggestedQty - a.totalSuggestedQty
  );
}

export function exportProcurementListCsv(suggestions: ProcurementSuggestionItem[]): string {
  const headers = [
    "优先级",
    "饮片名称",
    "炮制规格",
    "产地",
    "功效分类",
    "当前总库存(g)",
    "安全可用库存(g)",
    "近效期库存(g)",
    "安全库存阈值(g)",
    "日均消耗量(g/天)",
    "预计可用天数",
    "建议采购量(g)",
    "涉及批次数",
  ];

  const rows = suggestions.map((item) => [
    PRIORITY_LABELS[item.priority],
    item.name,
    item.spec,
    item.origin,
    item.category,
    String(item.totalStock),
    String(item.safeAvailableStock),
    String(item.nearExpiryStock),
    String(item.thresholdGrams),
    String(item.avgDailyConsumption),
    item.stockDaysLeft === Infinity ? "充足" : String(item.stockDaysLeft),
    String(item.suggestedPurchaseQty),
    String(item.batchCount),
  ]);

  const formatCell = (cell: string): string =>
    `"${cell.replace(/"/g, '""')}"`;

  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(formatCell).join(",")).join("\n")
  );
}

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
    thresholdGrams: input.thresholdGrams,
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
  const existing = selectSafetyStockRuleById(state, ruleId);
  if (!existing) {
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
  const existing = selectSafetyStockRuleById(state, ruleId);
  if (!existing) {
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

export function createSeedSafetyStockState(): SafetyStockState {
  const seedRules: SafetyStockRuleDTO[] = [
    {
      ...createBaseEntity("ssr_buqi"),
      name: "补气类安全库存",
      ruleType: "category",
      target: "补气",
      thresholdGrams: 1500,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      syncStatus: "synced",
    },
    {
      ...createBaseEntity("ssr_huangqi"),
      name: "黄芪专属安全库存",
      ruleType: "herb",
      target: "黄芪",
      thresholdGrams: 2000,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      syncStatus: "synced",
    },
    {
      ...createBaseEntity("ssr_qingre"),
      name: "清热类安全库存",
      ruleType: "category",
      target: "清热",
      thresholdGrams: 1000,
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
      syncStatus: "synced",
    },
  ];

  const rules: Record<string, SafetyStockRuleDTO> = {};
  for (const rule of seedRules) {
    rules[rule.id] = rule;
  }

  return {
    schemaVersion: SAFETY_STOCK_SCHEMA_VERSION,
    rules,
  };
}

export interface SafetyStockStore {
  state: SafetyStockState;
  addRule: (input: NewSafetyStockRuleInput) => string;
  updateRule: (
    ruleId: string,
    input: Partial<NewSafetyStockRuleInput>
  ) => OperationResult;
  removeRule: (ruleId: string) => OperationResult;
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
  } = inventoryStore;

  const [optimisticState, setOptimisticState] =
    useState<SafetyStockState>(state);
  const lastDbStateRef = useRef<SafetyStockState>(state);

  useEffect(() => {
    lastDbStateRef.current = state;
    setOptimisticState(state);
  }, [state]);

  const addRule = useCallback(
    (input: NewSafetyStockRuleInput): string => {
      const optimisticResult = createSafetyStockRule(optimisticState, input);
      setOptimisticState(optimisticResult.state);
      void (async () => {
        const result = await asyncAddRule(input);
        if (result === null) {
          setOptimisticState(lastDbStateRef.current);
        }
      })();
      return optimisticResult.ruleId;
    },
    [optimisticState, asyncAddRule]
  );

  const updateRule = useCallback(
    (
      ruleId: string,
      input: Partial<NewSafetyStockRuleInput>
    ): OperationResult => {
      const optimisticResult = updateSafetyStockRule(
        optimisticState,
        ruleId,
        input
      );
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      void (async () => {
        const result = await asyncUpdateRule(ruleId, input);
        if (!result.ok) {
          setOptimisticState(lastDbStateRef.current);
        }
      })();
      return { ok: true };
    },
    [optimisticState, asyncUpdateRule]
  );

  const removeRule = useCallback(
    (ruleId: string): OperationResult => {
      const optimisticResult = deleteSafetyStockRule(optimisticState, ruleId);
      if (!optimisticResult.ok || !optimisticResult.state) {
        return { ok: false, error: optimisticResult.error };
      }
      setOptimisticState(optimisticResult.state);
      void (async () => {
        const result = await asyncRemoveRule(ruleId);
        if (!result.ok) {
          setOptimisticState(lastDbStateRef.current);
        }
      })();
      return { ok: true };
    },
    [optimisticState, asyncRemoveRule]
  );

  return {
    state: optimisticState,
    addRule,
    updateRule,
    removeRule,
    inventoryStore,
  };
}
