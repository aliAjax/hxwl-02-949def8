import { describe, it, expect } from "vitest";
import {
  calculateAvgDailyConsumption,
  resolveRuleThreshold,
  calculateDynamicSafetyStock,
  isLowStockWithRules,
} from "../src/ledger/safetyStock/safetyStockCalculations";
import type { SafetyStockRuleDTO, LedgerOperationDTO } from "../src/ledger/types";

function createOutboundOp(daysAgo: number, qty: number): LedgerOperationDTO {
  const date = new Date("2025-06-15");
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `op_${daysAgo}_${qty}`,
    batchId: "batch_test",
    type: "outbound",
    quantity: qty,
    balanceAfter: 0,
    operator: "测试",
    remark: "",
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    isDeleted: false,
    syncStatus: "synced",
  };
}

const referenceDate = new Date("2025-06-15");

describe("安全库存纯函数", () => {
  describe("calculateAvgDailyConsumption", () => {
    it("空出库记录返回 0", () => {
      const avg = calculateAvgDailyConsumption([], 30, referenceDate);
      expect(avg).toBe(0);
    });

    it("计算日均消耗 - 30 天共 3000g → 日均 100g", () => {
      const ops = [
        createOutboundOp(10, 1000),
        createOutboundOp(20, 1000),
        createOutboundOp(29, 1000),
      ];
      const avg = calculateAvgDailyConsumption(ops, 30, referenceDate);
      expect(avg).toBe(100);
    });

    it("超出时间范围的出库不计算", () => {
      const ops = [
        createOutboundOp(10, 500),
        createOutboundOp(40, 5000),
      ];
      const avg = calculateAvgDailyConsumption(ops, 30, referenceDate);
      expect(avg).toBeCloseTo(16.67, 1);
    });

    it("使用默认天数参数", () => {
      const ops = [createOutboundOp(5, 100)];
      const avg = calculateAvgDailyConsumption(ops, undefined, referenceDate);
      expect(typeof avg).toBe("number");
    });
  });

  describe("resolveRuleThreshold", () => {
    it("固定阈值模式直接返回 thresholdGrams", () => {
      const rule: SafetyStockRuleDTO = {
        id: "rule1",
        name: "测试规则",
        calcMode: "fixed",
        thresholdGrams: 500,
        ruleType: "herb",
        target: "测试饮片",
        isDeleted: false,
        syncStatus: "synced",
        consumptionDays: 30,
        coverDays: 14,
        minThresholdGrams: 100,
        createdAt: "",
        updatedAt: "",
      };
      const threshold = resolveRuleThreshold(rule);
      expect(threshold).toBe(500);
    });

    it("动态模式但无出库数据时回退到固定阈值", () => {
      const rule: SafetyStockRuleDTO = {
        id: "rule1",
        name: "测试规则",
        calcMode: "dynamic",
        thresholdGrams: 300,
        ruleType: "herb",
        target: "测试饮片",
        isDeleted: false,
        syncStatus: "synced",
        consumptionDays: 30,
        coverDays: 14,
        minThresholdGrams: 100,
        createdAt: "",
        updatedAt: "",
      };
      const threshold = resolveRuleThreshold(rule, { outboundOps: [] });
      expect(threshold).toBe(300);
    });

    it("动态模式计算阈值 - 日均 100g × 14天覆盖 = 1400", () => {
      const rule: SafetyStockRuleDTO = {
        id: "rule1",
        name: "测试规则",
        calcMode: "dynamic",
        thresholdGrams: 300,
        ruleType: "herb",
        target: "测试饮片",
        isDeleted: false,
        syncStatus: "synced",
        consumptionDays: 30,
        coverDays: 14,
        minThresholdGrams: 100,
        createdAt: "",
        updatedAt: "",
      };
      const ops = [
        createOutboundOp(5, 1000),
        createOutboundOp(15, 1000),
        createOutboundOp(25, 1000),
      ];
      const threshold = resolveRuleThreshold(rule, {
        outboundOps: ops,
        referenceDate,
      });
      expect(threshold).toBe(1400);
    });

    it("动态计算值低于最低阈值时取最低阈值", () => {
      const rule: SafetyStockRuleDTO = {
        id: "rule1",
        name: "测试规则",
        calcMode: "dynamic",
        thresholdGrams: 300,
        ruleType: "herb",
        target: "测试饮片",
        isDeleted: false,
        syncStatus: "synced",
        consumptionDays: 30,
        coverDays: 2,
        minThresholdGrams: 500,
        createdAt: "",
        updatedAt: "",
      };
      const ops = [createOutboundOp(10, 100)];
      const threshold = resolveRuleThreshold(rule, {
        outboundOps: ops,
        referenceDate,
      });
      expect(threshold).toBe(500);
    });
  });

  describe("calculateDynamicSafetyStock", () => {
    it("无出库记录时返回最低阈值和对应说明", () => {
      const result = calculateDynamicSafetyStock([], {
        consumptionDays: 30,
        coverDays: 14,
        minThresholdGrams: 200,
        referenceDate,
      });
      expect(result.threshold).toBe(200);
      expect(result.avgDailyConsumption).toBe(0);
      expect(result.explanation).toContain("无出库记录");
    });

    it("有出库记录时计算动态阈值并返回说明", () => {
      const ops = [
        createOutboundOp(5, 600),
        createOutboundOp(15, 600),
        createOutboundOp(25, 600),
      ];
      const result = calculateDynamicSafetyStock(ops, {
        consumptionDays: 30,
        coverDays: 10,
        minThresholdGrams: 100,
        referenceDate,
      });
      expect(result.avgDailyConsumption).toBe(60);
      expect(result.threshold).toBe(600);
      expect(result.explanation).toContain("60.0g/天");
      expect(result.explanation).toContain("动态计算值");
    });

    it("返回完整的结果结构", () => {
      const result = calculateDynamicSafetyStock([], { referenceDate });
      expect(result).toHaveProperty("threshold");
      expect(result).toHaveProperty("avgDailyConsumption");
      expect(result).toHaveProperty("consumptionDays");
      expect(result).toHaveProperty("coverDays");
      expect(result).toHaveProperty("minThreshold");
      expect(result).toHaveProperty("explanation");
    });
  });

  describe("isLowStockWithRules", () => {
    it("库存低于阈值返回 true", () => {
      expect(isLowStockWithRules(100, 200)).toBe(true);
    });

    it("库存等于阈值返回 false", () => {
      expect(isLowStockWithRules(200, 200)).toBe(false);
    });

    it("库存高于阈值返回 false", () => {
      expect(isLowStockWithRules(300, 200)).toBe(false);
    });
  });
});
