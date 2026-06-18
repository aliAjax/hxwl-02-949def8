import { describe, it, expect } from "vitest";
import {
  calculateProcurementSuggestion,
  sortProcurementSuggestions,
  selectCategoryProcurementSummary,
  type ProcurementCalcInput,
} from "../src/ledger/procurement/procurementCalculations";

const referenceDate = new Date("2025-06-15");

function createBasicInput(overrides: Partial<ProcurementCalcInput> = {}): ProcurementCalcInput {
  return {
    herbName: "黄芪",
    spec: "统货",
    origin: "甘肃",
    category: "补气药",
    unit: "g",
    batches: [],
    outboundOps: [],
    thresholdGrams: 500,
    options: {
      referenceDate,
      consumptionDays: 30,
      coverDays: 14,
      nearExpiryUnsafeDays: 30,
    },
    ...overrides,
  };
}

describe("采购建议纯函数", () => {
  describe("calculateProcurementSuggestion", () => {
    it("无库存且无出库记录 - 按阈值补货", () => {
      const input = createBasicInput({
        batches: [],
        outboundOps: [],
        thresholdGrams: 500,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.name).toBe("黄芪");
      expect(result.totalStock).toBe(0);
      expect(result.safeAvailableStock).toBe(0);
      expect(result.suggestedPurchaseQty).toBeGreaterThan(0);
      expect(result.priority).not.toBe("low");
    });

    it("库存充足且无近效期 - 无需补货", () => {
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2026-12-31", stock: 2000 },
        ],
        outboundOps: [],
        thresholdGrams: 500,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.suggestedPurchaseQty).toBe(0);
      expect(result.priority).toBe("low");
      expect(result.priorityScore).toBe(0);
    });

    it("库存低于阈值 - 产生补货建议", () => {
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2026-12-31", stock: 200 },
        ],
        outboundOps: [],
        thresholdGrams: 500,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.suggestedPurchaseQty).toBeGreaterThan(0);
      expect(result.safeAvailableStock).toBe(200);
    });

    it("近效期库存从安全库存中扣减", () => {
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2025-06-20", stock: 800 },
          { id: "b2", batchNo: "B002", expiry: "2026-12-31", stock: 200 },
        ],
        outboundOps: [],
        thresholdGrams: 500,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.totalStock).toBe(1000);
      expect(result.nearExpiryStock).toBe(800);
      expect(result.safeAvailableStock).toBe(200);
      expect(result.nearExpiryBatches.length).toBe(1);
      expect(result.nearExpiryBatches[0].batchId).toBe("b1");
    });

    it("近效期批次按剩余天数升序排列", () => {
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2025-07-01", stock: 100 },
          { id: "b2", batchNo: "B002", expiry: "2025-06-20", stock: 100 },
          { id: "b3", batchNo: "B003", expiry: "2025-06-25", stock: 100 },
        ],
        outboundOps: [],
        thresholdGrams: 1000,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.nearExpiryBatches.map((b) => b.batchNo)).toEqual([
        "B002",
        "B003",
        "B001",
      ]);
    });

    it("有出库记录时根据日均消耗计算补货量", () => {
      const ops = Array.from({ length: 10 }, (_, i) => ({
        createdAt: new Date(
          referenceDate.getTime() - (i + 1) * 24 * 60 * 60 * 1000
        ).toISOString(),
        quantity: 100,
      }));
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2026-12-31", stock: 500 },
        ],
        outboundOps: ops,
        thresholdGrams: 500,
        options: {
          referenceDate,
          consumptionDays: 30,
          coverDays: 14,
          nearExpiryUnsafeDays: 30,
        },
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.avgDailyConsumption).toBeGreaterThan(0);
      expect(result.stockDaysLeft).toBeGreaterThan(0);
      expect(result.stockDaysLeft).not.toBe(Infinity);
    });

    it("建议采购量按 100g 取整", () => {
      const input = createBasicInput({
        batches: [
          { id: "b1", batchNo: "B001", expiry: "2026-12-31", stock: 350 },
        ],
        outboundOps: [],
        thresholdGrams: 520,
      });
      const result = calculateProcurementSuggestion(input);
      expect(result.suggestedPurchaseQty % 100).toBe(0);
    });

    it("返回完整的建议结构", () => {
      const input = createBasicInput();
      const result = calculateProcurementSuggestion(input);
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("totalStock");
      expect(result).toHaveProperty("safeAvailableStock");
      expect(result).toHaveProperty("suggestedPurchaseQty");
      expect(result).toHaveProperty("priority");
      expect(result).toHaveProperty("priorityScore");
      expect(result).toHaveProperty("nearExpiryBatches");
      expect(result).toHaveProperty("avgDailyConsumption");
    });
  });

  describe("sortProcurementSuggestions", () => {
    function makeItem(name: string, priority: string, qty: number, score: number) {
      return {
        name,
        spec: "统货",
        origin: "甘肃",
        category: "测试",
        unit: "g",
        totalStock: 0,
        safeAvailableStock: 0,
        nearExpiryStock: 0,
        nearExpiryBatches: [],
        thresholdGrams: 500,
        avgDailyConsumption: 0,
        consumptionDays: 30,
        suggestedPurchaseQty: qty,
        priority: priority as any,
        priorityScore: score,
        stockDaysLeft: Infinity,
        batchCount: 0,
        batches: [] as any,
      };
    }

    it("按优先级从高到低排序", () => {
      const items = [
        makeItem("A", "low", 100, 10),
        makeItem("B", "urgent", 500, 80),
        makeItem("C", "high", 300, 50),
      ];
      const sorted = sortProcurementSuggestions(items);
      expect(sorted.map((i) => i.name)).toEqual(["B", "C", "A"]);
    });

    it("同优先级按建议采购量降序", () => {
      const items = [
        makeItem("A", "high", 100, 40),
        makeItem("B", "high", 500, 45),
        makeItem("C", "high", 300, 42),
      ];
      const sorted = sortProcurementSuggestions(items);
      expect(sorted.map((i) => i.name)).toEqual(["B", "C", "A"]);
    });

    it("不修改原数组", () => {
      const items = [
        makeItem("A", "low", 100, 10),
        makeItem("B", "urgent", 500, 80),
      ];
      const originalOrder = items.map((i) => i.name);
      sortProcurementSuggestions(items);
      expect(items.map((i) => i.name)).toEqual(originalOrder);
    });
  });

  describe("selectCategoryProcurementSummary", () => {
    function makeItem(name: string, category: string, priority: string, qty: number) {
      return {
        name,
        spec: "统货",
        origin: "甘肃",
        category,
        unit: "g",
        totalStock: 0,
        safeAvailableStock: 0,
        nearExpiryStock: 0,
        nearExpiryBatches: [],
        thresholdGrams: 500,
        avgDailyConsumption: 0,
        consumptionDays: 30,
        suggestedPurchaseQty: qty,
        priority: priority as any,
        priorityScore: 50,
        stockDaysLeft: Infinity,
        batchCount: 0,
        batches: [] as any,
      };
    }

    it("按品类汇总采购建议", () => {
      const items = [
        makeItem("黄芪", "补气药", "high", 1000),
        makeItem("党参", "补气药", "urgent", 500),
        makeItem("当归", "补血药", "medium", 800),
        makeItem("无需补货", "其他", "low", 0),
      ];
      const summaries = selectCategoryProcurementSummary(items);
      expect(summaries.length).toBe(2);

      const buqi = summaries.find((s) => s.category === "补气药")!;
      expect(buqi.herbCount).toBe(2);
      expect(buqi.totalSuggestedQty).toBe(1500);
      expect(buqi.urgentCount).toBe(1);
      expect(buqi.highCount).toBe(1);
    });

    it("按总建议量降序排列", () => {
      const items = [
        makeItem("A", "类别1", "high", 100),
        makeItem("B", "类别2", "high", 500),
        makeItem("C", "类别1", "high", 200),
      ];
      const summaries = selectCategoryProcurementSummary(items);
      expect(summaries[0].category).toBe("类别2");
      expect(summaries[1].category).toBe("类别1");
    });

    it("空输入返回空数组", () => {
      const summaries = selectCategoryProcurementSummary([]);
      expect(summaries).toEqual([]);
    });

    it("所有都是 0 补货时返回空数组", () => {
      const items = [makeItem("A", "类别1", "low", 0)];
      const summaries = selectCategoryProcurementSummary(items);
      expect(summaries).toEqual([]);
    });
  });
});
