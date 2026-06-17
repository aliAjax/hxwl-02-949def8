import type {
  AuditLogRecord,
  BatchRecord,
  HerbRecord,
  OperationRecord,
  RolePreferenceRecord,
  SafetyStockRuleRecord,
} from "./schema";

interface SeedMovement {
  type: "inbound" | "outbound" | "loss";
  quantity: number;
  operator: string;
  remark: string;
  createdAt: string;
}

function buildBatchWithMovements(
  base: Omit<BatchRecord, "herbId" | "updatedAt" | "isDeleted" | "syncStatus" | "serverId">,
  movements: SeedMovement[]
): {
  batch: BatchRecord;
  operations: OperationRecord[];
  auditLogs: AuditLogRecord[];
  herb: HerbRecord;
} {
  let balance = 0;
  const operations: OperationRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];

  movements.forEach((m, idx) => {
    balance = m.type === "inbound" ? balance + m.quantity : balance - m.quantity;
    const opId = `op_seed_${base.id}_${idx}`;
    const operation: OperationRecord = {
      id: opId,
      batchId: base.id,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: balance,
      operator: m.operator,
      remark: m.remark,
      createdAt: m.createdAt,
      updatedAt: m.createdAt,
      isDeleted: false,
      syncStatus: "synced",
    };
    operations.push(operation);

    if (idx === 0 && m.type === "inbound" && m.remark.includes("期初入库")) {
      const createLog: AuditLogRecord = {
        id: `log_seed_${base.id}_create`,
        logType: "create_batch",
        herbName: base.name,
        batchNo: base.batchNo,
        changeGrams: m.quantity,
        operator: m.operator,
        remark: `新增批号，期初库存 ${m.quantity}${base.unit}`,
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        isDeleted: false,
        syncStatus: "synced",
      };
      auditLogs.push(createLog);
    } else {
      const changeGrams = m.type === "inbound" ? m.quantity : -m.quantity;
      const logLabels: Record<string, string> = {
        inbound: "入库",
        outbound: "出库",
        loss: "损耗",
      };
      const log: AuditLogRecord = {
        id: `log_seed_${base.id}_${idx}`,
        logType: m.type,
        herbName: base.name,
        batchNo: base.batchNo,
        changeGrams,
        operator: m.operator,
        remark: m.remark || `${logLabels[m.type]} ${m.quantity}${base.unit}`,
        createdAt: m.createdAt,
        updatedAt: m.createdAt,
        isDeleted: false,
        syncStatus: "synced",
      };
      auditLogs.push(log);
    }
  });

  const latestOp = operations[operations.length - 1];
  const updatedAt = latestOp ? latestOp.createdAt : base.createdAt;

  const herb: HerbRecord = {
    id: `herb_${base.id}`,
    name: base.name,
    spec: base.spec,
    origin: base.origin,
    category: base.category,
    defaultUnit: base.unit,
    createdAt: base.createdAt,
    updatedAt,
    isDeleted: false,
  };

  return {
    batch: {
      id: base.id,
      herbId: herb.id,
      name: base.name,
      spec: base.spec,
      origin: base.origin,
      category: base.category,
      batchNo: base.batchNo,
      expiry: base.expiry,
      unit: base.unit,
      createdAt: base.createdAt,
      updatedAt,
      isDeleted: false,
      syncStatus: "synced",
    },
    operations: operations.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    ),
    auditLogs: auditLogs.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    ),
    herb,
  };
}

export function buildSeedData(): {
  herbs: HerbRecord[];
  batches: BatchRecord[];
  operations: OperationRecord[];
  auditLogs: AuditLogRecord[];
  safetyStockRules: SafetyStockRuleRecord[];
  rolePreferences: RolePreferenceRecord[];
} {
  const groups = [
    buildBatchWithMovements(
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
        {
          type: "inbound",
          quantity: 8000,
          operator: "库管",
          remark: "期初入库",
          createdAt: "2026-03-01T09:05:00.000Z",
        },
        {
          type: "outbound",
          quantity: 1200,
          operator: "药师·王",
          remark: "门诊配方领用",
          createdAt: "2026-04-12T14:20:00.000Z",
        },
        {
          type: "outbound",
          quantity: 600,
          operator: "药师·李",
          remark: "煎剂室领用",
          createdAt: "2026-05-20T10:00:00.000Z",
        },
        {
          type: "loss",
          quantity: 80,
          operator: "库管",
          remark: "月末盘点损耗",
          createdAt: "2026-06-15T10:30:00.000Z",
        },
      ]
    ),
    buildBatchWithMovements(
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
        {
          type: "inbound",
          quantity: 4000,
          operator: "库管",
          remark: "期初入库",
          createdAt: "2026-02-10T08:35:00.000Z",
        },
        {
          type: "outbound",
          quantity: 500,
          operator: "药师·王",
          remark: "门诊配方领用",
          createdAt: "2026-03-22T11:00:00.000Z",
        },
        {
          type: "outbound",
          quantity: 300,
          operator: "药师·赵",
          remark: "代煎订单",
          createdAt: "2026-06-01T15:40:00.000Z",
        },
      ]
    ),
    buildBatchWithMovements(
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
        {
          type: "inbound",
          quantity: 1500,
          operator: "库管",
          remark: "期初入库",
          createdAt: "2026-01-15T09:10:00.000Z",
        },
        {
          type: "outbound",
          quantity: 520,
          operator: "药师·李",
          remark: "门诊配方领用",
          createdAt: "2026-05-28T13:10:00.000Z",
        },
      ]
    ),
    buildBatchWithMovements(
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
        {
          type: "inbound",
          quantity: 3000,
          operator: "库管",
          remark: "期初入库",
          createdAt: "2026-02-20T10:05:00.000Z",
        },
        {
          type: "outbound",
          quantity: 800,
          operator: "药师·王",
          remark: "门诊配方领用",
          createdAt: "2026-04-05T14:00:00.000Z",
        },
        {
          type: "loss",
          quantity: 50,
          operator: "库管",
          remark: "受潮损耗",
          createdAt: "2026-05-10T09:00:00.000Z",
        },
      ]
    ),
  ];

  const herbs: HerbRecord[] = [];
  const batches: BatchRecord[] = [];
  const operations: OperationRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];

  for (const g of groups) {
    herbs.push(g.herb);
    batches.push(g.batch);
    operations.push(...g.operations);
    auditLogs.push(...g.auditLogs);
  }

  operations.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  auditLogs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const now = new Date().toISOString();
  const safetyStockRules: SafetyStockRuleRecord[] = [
    {
      id: "ssr_buqi",
      name: "补气类安全库存",
      ruleType: "category",
      target: "补气",
      thresholdGrams: 1500,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      isDeleted: false,
      syncStatus: "synced",
    },
    {
      id: "ssr_huangqi",
      name: "黄芪专属安全库存",
      ruleType: "herb",
      target: "黄芪",
      thresholdGrams: 2000,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      isDeleted: false,
      syncStatus: "synced",
    },
    {
      id: "ssr_qingre",
      name: "清热类安全库存",
      ruleType: "category",
      target: "清热",
      thresholdGrams: 1000,
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
      isDeleted: false,
      syncStatus: "synced",
    },
    {
      id: "ssr_huashi",
      name: "化湿类安全库存",
      ruleType: "category",
      target: "化湿",
      thresholdGrams: 800,
      createdAt: "2026-01-20T00:00:00.000Z",
      updatedAt: "2026-01-20T00:00:00.000Z",
      isDeleted: false,
      syncStatus: "synced",
    },
  ];

  const rolePreferences: RolePreferenceRecord[] = [
    {
      role: "pharmacist",
      displayName: "药师",
      defaultTab: true,
      preferredFilters: [],
      recentSearches: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      role: "warehouse",
      displayName: "库管",
      defaultTab: false,
      preferredFilters: [],
      recentSearches: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      role: "manager",
      displayName: "门店负责人",
      defaultTab: false,
      preferredFilters: [],
      recentSearches: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    herbs,
    batches,
    operations,
    auditLogs,
    safetyStockRules,
    rolePreferences,
  };
}
