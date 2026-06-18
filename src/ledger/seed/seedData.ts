import type {
  LedgerState,
  SafetyStockState,
  BatchLedgerDTO,
  LedgerOperationDTO,
  InventoryAuditLogDTO,
  OperationType,
  SafetyStockRuleDTO,
} from "../types";
import {
  SCHEMA_VERSION,
  SAFETY_STOCK_SCHEMA_VERSION,
  AUDIT_LOG_LABELS,
} from "../types";
import { createId, createBaseEntity, nowIso } from "../utils/entity";

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
        logType: m.type as any,
        herbName: base.name,
        batchNo: base.batchNo,
        changeGrams,
        operator: m.operator,
        remark: m.remark || `${AUDIT_LOG_LABELS[m.type as any]} ${m.quantity}${base.unit}`,
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

export function createSeedSafetyStockState(): SafetyStockState {
  const seedRules: SafetyStockRuleDTO[] = [
    {
      ...createBaseEntity("ssr_buqi"),
      name: "补气类安全库存",
      ruleType: "category",
      target: "补气",
      calcMode: "fixed",
      thresholdGrams: 1500,
      consumptionDays: undefined,
      coverDays: undefined,
      minThresholdGrams: undefined,
      migratedFromV1: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      syncStatus: "synced",
    },
    {
      ...createBaseEntity("ssr_huangqi"),
      name: "黄芪专属安全库存",
      ruleType: "herb",
      target: "黄芪",
      calcMode: "dynamic",
      thresholdGrams: 2000,
      consumptionDays: 30,
      coverDays: 45,
      minThresholdGrams: 2000,
      migratedFromV1: false,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      syncStatus: "synced",
    },
    {
      ...createBaseEntity("ssr_qingre"),
      name: "清热类安全库存",
      ruleType: "category",
      target: "清热",
      calcMode: "fixed",
      thresholdGrams: 1000,
      consumptionDays: undefined,
      coverDays: undefined,
      minThresholdGrams: undefined,
      migratedFromV1: false,
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
