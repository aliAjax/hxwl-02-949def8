import { describe, it, expect } from "vitest";
import type { LedgerState, BatchLedgerDTO, LedgerOperationDTO, InventoryAuditLogDTO } from "../src/ledger/types";
import {
  markSynced,
  markEntitiesConflict,
  markPendingSynced,
  resolveConflictWithLocal,
  resolveConflictWithServer,
  resolveConflictLater,
} from "../src/ledger/sync/syncReducers";
import {
  selectPendingSyncCount,
  selectSyncStats,
  selectPendingBatches,
  selectPendingOperations,
  selectPendingAuditLogs,
  selectConflictBatches,
  selectConflictOperations,
  selectConflictAuditLogs,
  selectSyncedBatches,
  selectSyncedOperations,
  selectSyncedAuditLogs,
} from "../src/ledger/sync/syncSelectors";
import { createId } from "../src/ledger/utils/entity";

function makeBatch(
  id: string,
  overrides: Partial<BatchLedgerDTO> = {}
): BatchLedgerDTO {
  return {
    id,
    name: "测试药材",
    spec: "统货",
    origin: "甘肃",
    category: "测试类",
    batchNo: `BATCH-${id}`,
    expiry: "2026-12-31",
    unit: "g",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    isDeleted: false,
    syncStatus: "pending",
    ...overrides,
  };
}

function makeOp(
  id: string,
  batchId: string,
  overrides: Partial<LedgerOperationDTO> = {}
): LedgerOperationDTO {
  return {
    id,
    batchId,
    type: "inbound",
    quantity: 100,
    balanceAfter: 100,
    operator: "测试",
    remark: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    isDeleted: false,
    syncStatus: "pending",
    ...overrides,
  };
}

function makeAuditLog(
  id: string,
  batchNo: string,
  overrides: Partial<InventoryAuditLogDTO> = {}
): InventoryAuditLogDTO {
  return {
    id,
    logType: "create_batch",
    herbName: "测试药材",
    batchNo,
    changeGrams: 100,
    operator: "测试",
    remark: "测试",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    isDeleted: false,
    syncStatus: "pending",
    ...overrides,
  };
}

function createTestState(): LedgerState {
  return {
    schemaVersion: 1,
    batches: {
      bat_1: makeBatch("bat_1"),
      bat_2: makeBatch("bat_2", { syncStatus: "synced", serverId: "srv_2" }),
      bat_3: makeBatch("bat_3", { syncStatus: "conflict" }),
    },
    operations: [
      makeOp("op_1", "bat_1"),
      makeOp("op_2", "bat_2", { syncStatus: "synced", serverId: "srv_op2" }),
      makeOp("op_3", "bat_3", { syncStatus: "conflict" }),
    ],
    auditLogs: [
      makeAuditLog("log_1", "BATCH-bat_1"),
      makeAuditLog("log_2", "BATCH-bat_2", { syncStatus: "synced", serverId: "srv_log2" }),
      makeAuditLog("log_3", "BATCH-bat_3", { syncStatus: "conflict" }),
    ],
    lastSyncedAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("同步状态 - markPendingSynced 实体级同步", () => {
  describe("核心 Bug 修复：实体级 pending 漏同步", () => {
    it("操作是 pending 但批次是 synced 时，操作也应该被同步", () => {
      const state: LedgerState = {
        schemaVersion: 1,
        batches: {
          bat_1: makeBatch("bat_1", { syncStatus: "synced", serverId: "srv_1" }),
        },
        operations: [
          makeOp("op_1", "bat_1", { syncStatus: "pending" }),
        ],
        auditLogs: [],
        lastSyncedAt: "2025-01-01T00:00:00.000Z",
      };

      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");

      expect(result.operations[0].syncStatus).toBe("synced");
      expect(result.operations[0].serverId).toBeDefined();
      expect(result.batches["bat_1"].syncStatus).toBe("synced");
    });

    it("审计日志是 pending 但批次是 synced 时，日志也应该被同步", () => {
      const state: LedgerState = {
        schemaVersion: 1,
        batches: {
          bat_1: makeBatch("bat_1", { syncStatus: "synced", serverId: "srv_1" }),
        },
        operations: [],
        auditLogs: [
          makeAuditLog("log_1", "BATCH-bat_1", { syncStatus: "pending" }),
        ],
        lastSyncedAt: "2025-01-01T00:00:00.000Z",
      };

      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");

      expect(result.auditLogs[0].syncStatus).toBe("synced");
      expect(result.auditLogs[0].serverId).toBeDefined();
    });

    it("混合场景：批次、操作、日志各自独立的 pending 都能被同步", () => {
      const state: LedgerState = {
        schemaVersion: 1,
        batches: {
          bat_pending: makeBatch("bat_pending", { syncStatus: "pending" }),
          bat_synced: makeBatch("bat_synced", { syncStatus: "synced", serverId: "srv_synced" }),
        },
        operations: [
          makeOp("op_pending_in_pending", "bat_pending", { syncStatus: "pending" }),
          makeOp("op_pending_in_synced", "bat_synced", { syncStatus: "pending" }),
          makeOp("op_synced", "bat_synced", { syncStatus: "synced", serverId: "srv_op" }),
        ],
        auditLogs: [
          makeAuditLog("log_pending_in_pending", "BATCH-bat_pending", { syncStatus: "pending" }),
          makeAuditLog("log_pending_in_synced", "BATCH-bat_synced", { syncStatus: "pending" }),
          makeAuditLog("log_synced", "BATCH-bat_synced", { syncStatus: "synced", serverId: "srv_log" }),
        ],
        lastSyncedAt: "2025-01-01T00:00:00.000Z",
      };

      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");
      const stats = selectSyncStats(result);

      expect(stats.pendingBatches).toBe(0);
      expect(stats.pendingOperations).toBe(0);
      expect(stats.pendingAuditLogs).toBe(0);
      expect(stats.syncedBatches).toBe(2);
      expect(stats.syncedOperations).toBe(3);
      expect(stats.syncedAuditLogs).toBe(3);
    });
  });

  describe("markPendingSynced 基本行为", () => {
    it("同步后所有 pending 实体变为 synced 并分配 serverId", () => {
      const state = createTestState();
      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");
      const stats = selectSyncStats(result);

      expect(stats.pendingBatches).toBe(0);
      expect(stats.pendingOperations).toBe(0);
      expect(stats.pendingAuditLogs).toBe(0);

      expect(result.batches["bat_1"].syncStatus).toBe("synced");
      expect(result.batches["bat_1"].serverId).toBeDefined();
      expect(result.operations[0].syncStatus).toBe("synced");
      expect(result.operations[0].serverId).toBeDefined();
      expect(result.auditLogs[0].syncStatus).toBe("synced");
      expect(result.auditLogs[0].serverId).toBeDefined();
    });

    it("conflict 状态的实体不会被 markPendingSynced 改变", () => {
      const state = createTestState();
      const result = markPendingSynced(state);

      expect(result.batches["bat_3"].syncStatus).toBe("conflict");
      expect(result.operations[2].syncStatus).toBe("conflict");
      expect(result.auditLogs[2].syncStatus).toBe("conflict");
    });

    it("已有 serverId 的实体不会被覆盖", () => {
      const state = createTestState();
      const result = markPendingSynced(state);

      expect(result.batches["bat_2"].serverId).toBe("srv_2");
      expect(result.operations[1].serverId).toBe("srv_op2");
      expect(result.auditLogs[1].serverId).toBe("srv_log2");
    });

    it("有 pending 实体时更新 lastSyncedAt", () => {
      const state = createTestState();
      const newTime = "2025-06-15T00:00:00.000Z";
      const result = markPendingSynced(state, newTime);

      expect(result.lastSyncedAt).toBe(newTime);
    });

    it("没有 pending 实体时不更新 lastSyncedAt", () => {
      const state: LedgerState = {
        schemaVersion: 1,
        batches: {
          bat_1: makeBatch("bat_1", { syncStatus: "synced", serverId: "srv_1" }),
        },
        operations: [
          makeOp("op_1", "bat_1", { syncStatus: "synced", serverId: "srv_op1" }),
        ],
        auditLogs: [
          makeAuditLog("log_1", "BATCH-bat_1", { syncStatus: "synced", serverId: "srv_log1" }),
        ],
        lastSyncedAt: "2025-01-01T00:00:00.000Z",
      };

      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");
      expect(result.lastSyncedAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("已删除的 pending 实体会被跳过", () => {
      const state: LedgerState = {
        schemaVersion: 1,
        batches: {
          bat_deleted: makeBatch("bat_deleted", { isDeleted: true, syncStatus: "pending" }),
        },
        operations: [
          makeOp("op_deleted", "bat_deleted", { isDeleted: true, syncStatus: "pending" }),
        ],
        auditLogs: [
          makeAuditLog("log_deleted", "BATCH-bat_deleted", { isDeleted: true, syncStatus: "pending" }),
        ],
        lastSyncedAt: "2025-01-01T00:00:00.000Z",
      };

      const result = markPendingSynced(state, "2025-06-15T00:00:00.000Z");

      expect(result.batches["bat_deleted"].syncStatus).toBe("pending");
      expect(result.operations[0].syncStatus).toBe("pending");
      expect(result.auditLogs[0].syncStatus).toBe("pending");
      expect(result.lastSyncedAt).toBe("2025-01-01T00:00:00.000Z");
    });
  });

  describe("markSynced", () => {
    it("将所有未删除批次及关联实体标记为已同步", () => {
      const state = createTestState();
      const result = markSynced(state, "2025-06-15T00:00:00.000Z");

      const stats = selectSyncStats(result);
      expect(stats.syncedBatches).toBe(3);
      expect(stats.conflictBatches).toBe(0);
      expect(stats.pendingBatches).toBe(0);
    });
  });

  describe("markEntitiesConflict", () => {
    it("将指定批次及关联实体标记为 conflict", () => {
      const state = createTestState();
      const result = markEntitiesConflict(state, ["bat_1"]);

      expect(result.batches["bat_1"].syncStatus).toBe("conflict");
      expect(result.operations[0].syncStatus).toBe("conflict");
      expect(result.auditLogs[0].syncStatus).toBe("conflict");
    });
  });

  describe("冲突解决", () => {
    it("resolveConflictWithLocal - 本地覆盖，标记为 synced 并分配 serverId", () => {
      const state = createTestState();
      const result = resolveConflictWithLocal(state, ["bat_3"]);

      expect(result.batches["bat_3"].syncStatus).toBe("synced");
      expect(result.batches["bat_3"].serverId).toBeDefined();
      expect(result.operations[2].syncStatus).toBe("synced");
      expect(result.auditLogs[2].syncStatus).toBe("synced");
    });

    it("resolveConflictWithServer - 保留服务端，标记为 synced 不分配新 serverId", () => {
      const state = createTestState();
      const result = resolveConflictWithServer(state, ["bat_3"]);

      expect(result.batches["bat_3"].syncStatus).toBe("synced");
      expect(result.batches["bat_3"].serverId).toBeUndefined();
    });

    it("resolveConflictLater - 延后处理，标记为 pending", () => {
      const state = createTestState();
      const result = resolveConflictLater(state, ["bat_3"]);

      expect(result.batches["bat_3"].syncStatus).toBe("pending");
      expect(result.operations[2].syncStatus).toBe("pending");
      expect(result.auditLogs[2].syncStatus).toBe("pending");
    });
  });

  describe("同步状态选择器", () => {
    it("selectPendingSyncCount 统计所有未同步实体", () => {
      const state = createTestState();
      const count = selectPendingSyncCount(state);
      expect(count).toBe(6);
    });

    it("selectSyncStats 返回完整统计信息", () => {
      const state = createTestState();
      const stats = selectSyncStats(state);

      expect(stats.pendingBatches).toBe(1);
      expect(stats.pendingOperations).toBe(1);
      expect(stats.pendingAuditLogs).toBe(1);
      expect(stats.conflictBatches).toBe(1);
      expect(stats.conflictOperations).toBe(1);
      expect(stats.conflictAuditLogs).toBe(1);
      expect(stats.syncedBatches).toBe(1);
      expect(stats.syncedOperations).toBe(1);
      expect(stats.syncedAuditLogs).toBe(1);
      expect(stats.lastSyncedAt).toBeDefined();
    });

    it("selectPendingBatches / Operations / AuditLogs", () => {
      const state = createTestState();
      expect(selectPendingBatches(state).length).toBe(1);
      expect(selectPendingOperations(state).length).toBe(1);
      expect(selectPendingAuditLogs(state).length).toBe(1);
    });

    it("selectConflictBatches / Operations / AuditLogs", () => {
      const state = createTestState();
      expect(selectConflictBatches(state).length).toBe(1);
      expect(selectConflictOperations(state).length).toBe(1);
      expect(selectConflictAuditLogs(state).length).toBe(1);
    });

    it("selectSyncedBatches / Operations / AuditLogs", () => {
      const state = createTestState();
      expect(selectSyncedBatches(state).length).toBe(1);
      expect(selectSyncedOperations(state).length).toBe(1);
      expect(selectSyncedAuditLogs(state).length).toBe(1);
    });
  });
});
