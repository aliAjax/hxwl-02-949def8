import { useCallback, useState } from "react";
import {
  AlertLevel,
  BaseEntity,
  BatchLedgerDTO,
  ExpiryStatus,
  LedgerOperationDTO,
  LedgerState,
  LOW_STOCK_GRAMS,
  NEAR_EXPIRY_DAYS,
  NewBatchInput,
  NewOperationInput,
  NewSafetyStockRuleInput,
  OperationResult,
  OperationType,
  SAFETY_STOCK_SCHEMA_VERSION,
  SafetyStockRuleDTO,
  SafetyStockState,
  SCHEMA_VERSION,
  SyncStatus,
  WARNING_EXPIRY_DAYS_30,
} from "./types";

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
  };
}

export function selectPendingSyncCount(state: LedgerState): number {
  const pendingBatches = Object.values(state.batches).filter(
    (b) => !b.isDeleted && b.syncStatus !== "synced"
  ).length;
  const pendingOps = state.operations.filter(
    (o) => !o.isDeleted && o.syncStatus !== "synced"
  ).length;
  return pendingBatches + pendingOps;
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
  return {
    ...state,
    batches,
    operations,
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
  return {
    batchId,
    state: {
      ...state,
      batches: { ...state.batches, [batchId]: batch },
      operations: [openingOp, ...state.operations],
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
  return {
    ok: true,
    state: {
      ...state,
      batches: {
        ...state.batches,
        [input.batchId]: { ...batch, updatedAt: ts, syncStatus: "pending" },
      },
      operations: [op, ...state.operations],
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
): { batch: BatchLedgerDTO; ops: LedgerOperationDTO[] } {
  let balance = 0;
  const opsChrono: LedgerOperationDTO[] = movements.map((m) => {
    balance = m.type === "inbound" ? balance + m.quantity : balance - m.quantity;
    return {
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
  });
  const opsDesc = [...opsChrono].reverse();
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
        { type: "outbound", quantity: 1200, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-04-12T14:20:00.000Z" },
        { type: "outbound", quantity: 600, operator: "药师·李", remark: "煎剂室领用", createdAt: "2026-05-20T10:00:00.000Z" },
        { type: "loss", quantity: 80, operator: "库管", remark: "月末盘点损耗", createdAt: "2026-06-15T10:30:00.000Z" },
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
        expiry: "2026-08-04",
        unit: "g",
        createdAt: "2026-02-10T08:30:00.000Z",
      },
      [
        { type: "inbound", quantity: 4000, operator: "库管", remark: "期初入库", createdAt: "2026-02-10T08:35:00.000Z" },
        { type: "outbound", quantity: 500, operator: "药师·王", remark: "门诊配方领用", createdAt: "2026-03-22T11:00:00.000Z" },
        { type: "outbound", quantity: 300, operator: "药师·赵", remark: "代煎订单", createdAt: "2026-06-01T15:40:00.000Z" },
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
        { type: "outbound", quantity: 520, operator: "药师·李", remark: "门诊配方领用", createdAt: "2026-05-28T13:10:00.000Z" },
      ]
    ),
  ];

  const batches: Record<string, BatchLedgerDTO> = {};
  const operations: LedgerOperationDTO[] = [];
  for (const g of groups) {
    batches[g.batch.id] = g.batch;
    operations.push(...g.ops);
  }
  operations.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return {
    schemaVersion: SCHEMA_VERSION,
    batches,
    operations,
    lastSyncedAt: nowIso(),
  };
}

export function useLedgerStore(initial?: LedgerState | (() => LedgerState)) {
  const [state, setState] = useState<LedgerState>(() => {
    if (typeof initial === "function") {
      return (initial as () => LedgerState)();
    }
    return initial ?? createEmptyState();
  });

  const addBatch = useCallback(
    (input: NewBatchInput): string => {
      const result = createBatch(state, input);
      setState(result.state);
      return result.batchId;
    },
    [state]
  );

  const recordOperation = useCallback(
    (input: NewOperationInput): OperationResult => {
      const result = applyOperation(state, input);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      setState(result.state as LedgerState);
      return { ok: true };
    },
    [state]
  );

  return { state, addBatch, recordOperation };
}

export type LedgerStore = ReturnType<typeof useLedgerStore>;

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
  const lowStockBatches = selectLowStockBatchesWithRules(ledgerState, safetyStockState);
  const herbNames = new Set(lowStockBatches.map((b) => b.name));
  return herbNames.size;
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
  const lowStockBatches = selectLowStockBatchesWithRules(ledgerState, safetyStockState);

  const map = new Map<string, LowStockHerbItem>();

  for (const batch of lowStockBatches) {
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

  const list = Array.from(map.values());

  for (const item of list) {
    item.shortageGrams = item.thresholdGrams - item.totalStock;
  }

  list.sort((a, b) => b.shortageGrams - a.shortageGrams);

  return list;
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

export function useSafetyStockStore(
  initial?: SafetyStockState | (() => SafetyStockState)
) {
  const [state, setState] = useState<SafetyStockState>(() => {
    if (typeof initial === "function") {
      return (initial as () => SafetyStockState)();
    }
    return initial ?? createEmptySafetyStockState();
  });

  const addRule = useCallback(
    (input: NewSafetyStockRuleInput): string => {
      const result = createSafetyStockRule(state, input);
      setState(result.state);
      return result.ruleId;
    },
    [state]
  );

  const updateRule = useCallback(
    (ruleId: string, input: Partial<NewSafetyStockRuleInput>): OperationResult => {
      const result = updateSafetyStockRule(state, ruleId, input);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      setState(result.state as SafetyStockState);
      return { ok: true };
    },
    [state]
  );

  const removeRule = useCallback(
    (ruleId: string): OperationResult => {
      const result = deleteSafetyStockRule(state, ruleId);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      setState(result.state as SafetyStockState);
      return { ok: true };
    },
    [state]
  );

  return { state, addRule, updateRule, removeRule };
}

export type SafetyStockStore = ReturnType<typeof useSafetyStockStore>;
