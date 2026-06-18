import { describe, it, expect } from "vitest";
import {
  validateImportData,
  CURRENT_EXPORT_SCHEMA_VERSION,
  type ExportData,
} from "../src/ledger/db/inventoryService";

function createValidSnapshot(): ExportData {
  return {
    schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    exportedAt: "2026-06-19T00:00:00.000Z",
    batches: [
      {
        id: "bat_001",
        herbId: "herb_001",
        name: "黄芪",
        spec: "蜜炙",
        origin: "甘肃",
        category: "补气",
        batchNo: "HQ2603",
        expiry: "2026-12-31",
        unit: "g",
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z",
        isDeleted: false,
        syncStatus: "synced",
      },
    ],
    operations: [
      {
        id: "op_001",
        batchId: "bat_001",
        type: "inbound",
        quantity: 8000,
        balanceAfter: 8000,
        operator: "库管",
        remark: "期初入库",
        createdAt: "2026-03-01T09:05:00.000Z",
        updatedAt: "2026-03-01T09:05:00.000Z",
        isDeleted: false,
        syncStatus: "synced",
      },
    ],
    auditLogs: [
      {
        id: "log_001",
        logType: "create_batch",
        herbName: "黄芪",
        batchNo: "HQ2603",
        changeGrams: 8000,
        operator: "库管",
        remark: "新增批号，期初库存 8000g",
        createdAt: "2026-03-01T09:05:00.000Z",
        updatedAt: "2026-03-01T09:05:00.000Z",
        isDeleted: false,
        syncStatus: "synced",
      },
    ],
    herbs: [
      {
        id: "herb_001",
        name: "黄芪",
        spec: "蜜炙",
        origin: "甘肃",
        category: "补气",
        defaultUnit: "g",
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z",
        isDeleted: false,
      },
    ],
    safetyStockRules: [],
    rolePreferences: [],
    expiryAlertHandlings: [],
  };
}

describe("validateImportData", () => {
  describe("格式校验", () => {
    it("非对象输入应返回 format 错误", () => {
      const result = validateImportData(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("format");
      }
    });

    it("字符串输入应返回 format 错误", () => {
      const result = validateImportData("not an object");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("format");
      }
    });

    it("缺少 batches 字段应返回 format 错误", () => {
      const data = { ...createValidSnapshot(), batches: undefined };
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("format");
      }
    });

    it("缺少 operations 字段应返回 format 错误", () => {
      const data = { ...createValidSnapshot(), operations: undefined };
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("format");
      }
    });
  });

  describe("缺失字段校验", () => {
    it("缺少 schemaVersion 应返回 field_missing 错误", () => {
      const { schemaVersion, ...rest } = createValidSnapshot();
      const result = validateImportData(rest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.message).toContain("schemaVersion");
      }
    });

    it("缺少 herbs 快照表应返回 field_missing 错误", () => {
      const { herbs, ...rest } = createValidSnapshot();
      const result = validateImportData(rest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.message).toContain("herbs");
      }
    });

    it("缺少 auditLogs 快照表应返回 field_missing 错误", () => {
      const { auditLogs, ...rest } = createValidSnapshot();
      const result = validateImportData(rest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.message).toContain("auditLogs");
      }
    });

    it("缺少 safetyStockRules 快照表应返回 field_missing 错误", () => {
      const { safetyStockRules, ...rest } = createValidSnapshot();
      const result = validateImportData(rest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.message).toContain("safetyStockRules");
      }
    });

    it("缺少 rolePreferences 快照表应返回 field_missing 错误", () => {
      const { rolePreferences, ...rest } = createValidSnapshot();
      const result = validateImportData(rest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.message).toContain("rolePreferences");
      }
    });

    it("批号数据缺少必要字段（id, batchNo, name, herbId）应返回 field_missing 错误", () => {
      const data = createValidSnapshot();
      data.batches = [{ ...(data.batches[0] as Record<string, unknown>), id: undefined, batchNo: undefined }];
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.details).toContain("id");
        expect(missing?.details).toContain("batchNo");
      }
    });

    it("流水数据缺少必要字段（id, batchId, type, quantity）应返回 field_missing 错误", () => {
      const data = createValidSnapshot();
      data.operations = [{ ...(data.operations[0] as Record<string, unknown>), id: undefined, quantity: undefined }];
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missing = result.errors.find((e) => e.type === "field_missing");
        expect(missing).toBeDefined();
        expect(missing?.details).toContain("id");
        expect(missing?.details).toContain("quantity");
      }
    });
  });

  describe("版本校验", () => {
    it("schemaVersion 高于当前版本应返回 version 错误", () => {
      const data = createValidSnapshot();
      data.schemaVersion = CURRENT_EXPORT_SCHEMA_VERSION + 1;
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const versionError = result.errors.find((e) => e.type === "version");
        expect(versionError).toBeDefined();
        expect(versionError?.message).toContain(`数据版本 ${data.schemaVersion}`);
      }
    });

    it("schemaVersion 小于 1 应返回 version 错误", () => {
      const data = createValidSnapshot();
      data.schemaVersion = 0;
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const versionError = result.errors.find((e) => e.type === "version");
        expect(versionError).toBeDefined();
      }
    });

    it("schemaVersion 等于当前版本应通过校验", () => {
      const data = createValidSnapshot();
      data.schemaVersion = CURRENT_EXPORT_SCHEMA_VERSION;
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
    });

    it("schemaVersion 为 1（低于当前但合法）应通过校验", () => {
      const data = createValidSnapshot();
      data.schemaVersion = 1;
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
    });
  });

  describe("批号重复校验", () => {
    it("导入数据内部存在重复批号应返回 batchNo_conflict 错误", () => {
      const data = createValidSnapshot();
      const batch1 = data.batches[0] as Record<string, unknown>;
      const batch2 = {
        ...batch1,
        id: "bat_002",
        herbId: "herb_002",
      };
      data.batches = [batch1, batch2];
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const conflict = result.errors.find((e) => e.type === "batchNo_conflict");
        expect(conflict).toBeDefined();
        expect(conflict?.details).toContain("HQ2603");
      }
    });

    it("多个重复批号应全部列出", () => {
      const data = createValidSnapshot();
      const base = data.batches[0] as Record<string, unknown>;
      data.batches = [
        { ...base, id: "bat_001", batchNo: "A001" },
        { ...base, id: "bat_002", batchNo: "A001" },
        { ...base, id: "bat_003", batchNo: "B002" },
        { ...base, id: "bat_004", batchNo: "B002" },
      ];
      const result = validateImportData(data);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const conflict = result.errors.find((e) => e.type === "batchNo_conflict");
        expect(conflict).toBeDefined();
        expect(conflict?.details).toContain("A001");
        expect(conflict?.details).toContain("B002");
      }
    });

    it("不重复的批号应通过校验", () => {
      const data = createValidSnapshot();
      const base = data.batches[0] as Record<string, unknown>;
      data.batches = [
        { ...base, id: "bat_001", batchNo: "A001" },
        { ...base, id: "bat_002", batchNo: "A002" },
      ];
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
    });
  });

  describe("正常快照预览", () => {
    it("正常快照应返回正确的预览数据", () => {
      const data = createValidSnapshot();
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.batchCount).toBe(1);
        expect(result.preview.operationCount).toBe(1);
        expect(result.preview.auditLogCount).toBe(1);
        expect(result.preview.herbCount).toBe(1);
        expect(result.preview.safetyStockRuleCount).toBe(0);
        expect(result.preview.rolePreferenceCount).toBe(0);
        expect(result.preview.expiryAlertHandlingCount).toBe(0);
        expect(result.preview.schemaVersion).toBe(CURRENT_EXPORT_SCHEMA_VERSION);
        expect(result.preview.exportedAt).toBe("2026-06-19T00:00:00.000Z");
      }
    });

    it("空数组（但结构完整）应返回预览且计数为 0", () => {
      const data = createValidSnapshot();
      data.batches = [];
      data.operations = [];
      data.auditLogs = [];
      data.herbs = [];
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.batchCount).toBe(0);
        expect(result.preview.operationCount).toBe(0);
        expect(result.preview.auditLogCount).toBe(0);
        expect(result.preview.herbCount).toBe(0);
      }
    });

    it("多批号多流水应返回正确的计数", () => {
      const data = createValidSnapshot();
      const baseBatch = data.batches[0] as Record<string, unknown>;
      const baseOp = data.operations[0] as Record<string, unknown>;
      data.batches = [
        { ...baseBatch, id: "bat_001", batchNo: "A001" },
        { ...baseBatch, id: "bat_002", batchNo: "A002" },
        { ...baseBatch, id: "bat_003", batchNo: "A003" },
      ];
      data.operations = [
        { ...baseOp, id: "op_001", batchId: "bat_001" },
        { ...baseOp, id: "op_002", batchId: "bat_001" },
        { ...baseOp, id: "op_003", batchId: "bat_002" },
        { ...baseOp, id: "op_004", batchId: "bat_003" },
      ];
      const result = validateImportData(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.preview.batchCount).toBe(3);
        expect(result.preview.operationCount).toBe(4);
      }
    });
  });

  describe("多错误聚合", () => {
    it("同时存在多种错误时应全部返回", () => {
      const data = createValidSnapshot();
      data.schemaVersion = CURRENT_EXPORT_SCHEMA_VERSION + 1;
      const base = data.batches[0] as Record<string, unknown>;
      data.batches = [
        { ...base, id: "bat_001", batchNo: "A001" },
        { ...base, id: "bat_002", batchNo: "A001" },
      ];
      const { herbs, ...rest } = data;
      void herbs;
      const result = validateImportData(rest as unknown as ExportData);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errorTypes = result.errors.map((e) => e.type);
        expect(errorTypes).toContain("version");
        expect(errorTypes).toContain("field_missing");
        expect(errorTypes).toContain("batchNo_conflict");
      }
    });
  });
});
