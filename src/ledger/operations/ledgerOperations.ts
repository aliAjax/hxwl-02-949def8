import type {
  LedgerState,
  NewBatchInput,
  NewOperationInput,
  NewBatchAdjustmentInput,
  OperationResult,
  BatchLedgerDTO,
  LedgerOperationDTO,
  OperationType,
} from "../types";
import { AUDIT_LOG_LABELS, SCHEMA_VERSION } from "../types";
import { createId, createBaseEntity, createAuditLog, nowIso } from "../utils/entity";
import { selectBatchById } from "../selectors/batchSelectors";
import { selectCurrentStock } from "../selectors/stockSelectors";

export function createEmptyState(): LedgerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    batches: {},
    operations: [],
    auditLogs: [],
  };
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
  const auditLog = createAuditLog({
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
  const auditLog = createAuditLog({
    logType: input.type as any,
    herbName: batch.name,
    batchNo: batch.batchNo,
    changeGrams,
    operator: input.operator || "系统",
    remark: input.remark || `${AUDIT_LOG_LABELS[input.type as any]} ${input.quantity}${batch.unit}`,
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

export function applyBatchAdjustment(
  state: LedgerState,
  input: NewBatchAdjustmentInput
): OperationResult & { state?: LedgerState } {
  const batch = selectBatchById(state, input.batchId);
  if (!batch) {
    return { ok: false, error: "批号不存在或已被移除" };
  }
  if (!Number.isFinite(input.actualStock) || input.actualStock < 0) {
    return { ok: false, error: "实际库存不能为负数" };
  }
  const current = selectCurrentStock(state, input.batchId);
  const diff = input.actualStock - current;
  if (diff === 0) {
    return { ok: false, error: "实际库存与当前库存相同，无需调整" };
  }
  const opType: OperationType = diff > 0 ? "inbound" : "loss";
  const quantity = Math.abs(diff);
  const balanceAfter = input.actualStock;
  const ts = nowIso();
  const reason = input.reason?.trim() || "盘点调整";
  const op: LedgerOperationDTO = {
    ...createBaseEntity(createId("op")),
    batchId: input.batchId,
    type: opType,
    quantity,
    balanceAfter,
    operator: input.operator || "系统",
    remark: `批号调整：${reason}`,
  };
  const changeGrams = diff;
  const auditLog = createAuditLog({
    logType: "batch_adjust",
    herbName: batch.name,
    batchNo: batch.batchNo,
    changeGrams,
    operator: input.operator || "系统",
    remark: `盘点调整：${current}${batch.unit} → ${input.actualStock}${batch.unit}（${reason}）`,
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
