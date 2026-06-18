import { describe, it, expect } from "vitest";
import {
  selectCurrentStock,
  createEmptyState,
} from "../src/ledger/store";
import type {
  LedgerState,
  LedgerOperationDTO,
  BatchLedgerDTO,
} from "../src/ledger/types";

function nowIso(): string {
  return new Date().toISOString();
}

function createBaseOperation(overrides: Partial<LedgerOperationDTO> = {}): LedgerOperationDTO {
  return {
    id: "op_default",
    batchId: "bat_default",
    type: "inbound",
    quantity: 0,
    balanceAfter: 0,
    operator: "系统",
    remark: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDeleted: false,
    syncStatus: "pending",
    ...overrides,
  };
}

function createBaseBatch(overrides: Partial<BatchLedgerDTO> = {}): BatchLedgerDTO {
  return {
    id: "bat_default",
    name: "测试饮片",
    spec: "生品",
    origin: "测试产地",
    category: "补气",
    batchNo: "TEST001",
    expiry: "2027-12-31",
    unit: "g",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDeleted: false,
    syncStatus: "pending",
    ...overrides,
  };
}

describe("selectCurrentStock", () => {
  describe("基础入库计算", () => {
    it("空状态应返回 0", () => {
      const state = createEmptyState();
      expect(selectCurrentStock(state, "bat_nonexistent")).toBe(0);
    });

    it("不存在的 batchId 应返回 0", () => {
      const state = createEmptyState();
      const batch = createBaseBatch({ id: "bat_exists" });
      state.batches[batch.id] = batch;
      expect(selectCurrentStock(state, "bat_not_there")).toBe(0);
    });

    it("单次入库应返回入库数量", () => {
      const state = createEmptyState();
      const batchId = "bat_single_inbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(5000);
    });

    it("多次入库应累加", () => {
      const state = createEmptyState();
      const batchId = "bat_multi_inbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 3000,
          balanceAfter: 3000,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "inbound",
          quantity: 2000,
          balanceAfter: 5000,
          createdAt: "2026-06-05T10:00:00.000Z",
          updatedAt: "2026-06-05T10:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "inbound",
          quantity: 1500,
          balanceAfter: 6500,
          createdAt: "2026-06-10T10:00:00.000Z",
          updatedAt: "2026-06-10T10:00:00.000Z",
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(6500);
    });
  });

  describe("出库计算", () => {
    it("单次出库应从库存中扣除", () => {
      const state = createEmptyState();
      const batchId = "bat_single_outbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 1000,
          balanceAfter: 4000,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(4000);
    });

    it("多次出库应累计扣除", () => {
      const state = createEmptyState();
      const batchId = "bat_multi_outbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 10000,
          balanceAfter: 10000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 2000,
          balanceAfter: 8000,
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "outbound",
          quantity: 1500,
          balanceAfter: 6500,
        }),
        createBaseOperation({
          id: "op_004",
          batchId,
          type: "outbound",
          quantity: 3000,
          balanceAfter: 3500,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(3500);
    });
  });

  describe("损耗计算", () => {
    it("单次损耗应从库存中扣除", () => {
      const state = createEmptyState();
      const batchId = "bat_single_loss";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "loss",
          quantity: 500,
          balanceAfter: 4500,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(4500);
    });

    it("多次损耗应累计扣除", () => {
      const state = createEmptyState();
      const batchId = "bat_multi_loss";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 8000,
          balanceAfter: 8000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "loss",
          quantity: 200,
          balanceAfter: 7800,
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "loss",
          quantity: 300,
          balanceAfter: 7500,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(7500);
    });
  });

  describe("混合操作计算", () => {
    it("入库、出库、损耗混合应正确计算", () => {
      const state = createEmptyState();
      const batchId = "bat_mixed";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 10000,
          balanceAfter: 10000,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 2000,
          balanceAfter: 8000,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "loss",
          quantity: 500,
          balanceAfter: 7500,
          createdAt: "2026-06-03T00:00:00.000Z",
          updatedAt: "2026-06-03T00:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_004",
          batchId,
          type: "inbound",
          quantity: 3000,
          balanceAfter: 10500,
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_005",
          batchId,
          type: "outbound",
          quantity: 1500,
          balanceAfter: 9000,
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_006",
          batchId,
          type: "loss",
          quantity: 200,
          balanceAfter: 8800,
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(8800);
    });

    it("全出库后库存应为 0", () => {
      const state = createEmptyState();
      const batchId = "bat_all_out";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 3000,
          balanceAfter: 2000,
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "outbound",
          quantity: 2000,
          balanceAfter: 0,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(0);
    });
  });

  describe("软删除流水处理", () => {
    it("已软删除的入库流水不应计入库存", () => {
      const state = createEmptyState();
      const batchId = "bat_deleted_inbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
          isDeleted: true,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "inbound",
          quantity: 3000,
          balanceAfter: 3000,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(3000);
    });

    it("已软删除的出库流水不应扣除库存", () => {
      const state = createEmptyState();
      const batchId = "bat_deleted_outbound";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 2000,
          balanceAfter: 3000,
          isDeleted: true,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(5000);
    });

    it("已软删除的损耗流水不应扣除库存", () => {
      const state = createEmptyState();
      const batchId = "bat_deleted_loss";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "loss",
          quantity: 500,
          balanceAfter: 4500,
          isDeleted: true,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(5000);
    });

    it("混合软删除的多种流水应正确计算", () => {
      const state = createEmptyState();
      const batchId = "bat_mixed_deleted";
      state.batches[batchId] = createBaseBatch({ id: batchId });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 10000,
          balanceAfter: 10000,
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "inbound",
          quantity: 2000,
          balanceAfter: 12000,
          isDeleted: true,
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "outbound",
          quantity: 3000,
          balanceAfter: 9000,
        }),
        createBaseOperation({
          id: "op_004",
          batchId,
          type: "outbound",
          quantity: 1000,
          balanceAfter: 8000,
          isDeleted: true,
        }),
        createBaseOperation({
          id: "op_005",
          batchId,
          type: "loss",
          quantity: 500,
          balanceAfter: 7500,
        }),
        createBaseOperation({
          id: "op_006",
          batchId,
          type: "loss",
          quantity: 200,
          balanceAfter: 7300,
          isDeleted: true,
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(6500);
    });
  });

  describe("跨批次隔离", () => {
    it("不同批次的流水不应互相影响", () => {
      const state = createEmptyState();
      const batchA = "bat_A";
      const batchB = "bat_B";
      state.batches[batchA] = createBaseBatch({ id: batchA, batchNo: "A001" });
      state.batches[batchB] = createBaseBatch({ id: batchB, batchNo: "B001" });
      state.operations = [
        createBaseOperation({
          id: "op_A1",
          batchId: batchA,
          type: "inbound",
          quantity: 5000,
          balanceAfter: 5000,
        }),
        createBaseOperation({
          id: "op_B1",
          batchId: batchB,
          type: "inbound",
          quantity: 3000,
          balanceAfter: 3000,
        }),
        createBaseOperation({
          id: "op_A2",
          batchId: batchA,
          type: "outbound",
          quantity: 1000,
          balanceAfter: 4000,
        }),
        createBaseOperation({
          id: "op_B2",
          batchId: batchB,
          type: "outbound",
          quantity: 500,
          balanceAfter: 2500,
        }),
      ];
      expect(selectCurrentStock(state, batchA)).toBe(4000);
      expect(selectCurrentStock(state, batchB)).toBe(2500);
    });
  });

  describe("真实场景模拟", () => {
    it("黄芪批号完整场景（期初入库 + 多次出库 + 损耗）", () => {
      const state = createEmptyState();
      const batchId = "bat_huangqi_01";
      state.batches[batchId] = createBaseBatch({
        id: batchId,
        name: "黄芪",
        batchNo: "HQ2603",
      });
      state.operations = [
        createBaseOperation({
          id: "op_001",
          batchId,
          type: "inbound",
          quantity: 8000,
          balanceAfter: 8000,
          operator: "库管",
          remark: "期初入库",
          createdAt: "2026-03-01T09:05:00.000Z",
          updatedAt: "2026-03-01T09:05:00.000Z",
        }),
        createBaseOperation({
          id: "op_002",
          batchId,
          type: "outbound",
          quantity: 900,
          balanceAfter: 7100,
          operator: "药师·王",
          remark: "门诊配方领用",
          createdAt: "2026-05-15T14:20:00.000Z",
          updatedAt: "2026-05-15T14:20:00.000Z",
        }),
        createBaseOperation({
          id: "op_003",
          batchId,
          type: "outbound",
          quantity: 1200,
          balanceAfter: 5900,
          operator: "药师·王",
          remark: "门诊配方领用",
          createdAt: "2026-05-22T14:20:00.000Z",
          updatedAt: "2026-05-22T14:20:00.000Z",
        }),
        createBaseOperation({
          id: "op_004",
          batchId,
          type: "outbound",
          quantity: 600,
          balanceAfter: 5300,
          operator: "药师·李",
          remark: "煎剂室领用",
          createdAt: "2026-06-05T10:00:00.000Z",
          updatedAt: "2026-06-05T10:00:00.000Z",
        }),
        createBaseOperation({
          id: "op_005",
          batchId,
          type: "outbound",
          quantity: 800,
          balanceAfter: 4500,
          operator: "药师·李",
          remark: "门诊配方领用",
          createdAt: "2026-06-12T08:30:00.000Z",
          updatedAt: "2026-06-12T08:30:00.000Z",
        }),
        createBaseOperation({
          id: "op_006",
          batchId,
          type: "outbound",
          quantity: 500,
          balanceAfter: 4000,
          operator: "药师·赵",
          remark: "代煎订单",
          createdAt: "2026-06-15T09:15:00.000Z",
          updatedAt: "2026-06-15T09:15:00.000Z",
        }),
        createBaseOperation({
          id: "op_007",
          batchId,
          type: "loss",
          quantity: 80,
          balanceAfter: 3920,
          operator: "库管",
          remark: "月末盘点损耗",
          createdAt: "2026-06-15T10:30:00.000Z",
          updatedAt: "2026-06-15T10:30:00.000Z",
        }),
      ];
      expect(selectCurrentStock(state, batchId)).toBe(3920);
    });
  });
});
