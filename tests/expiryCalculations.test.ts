import { describe, it, expect } from "vitest";
import {
  daysUntilExpiry,
  selectExpiryStatus,
  selectAlertLevel,
  selectExpiringBatches,
} from "../src/ledger/expiry/expiryCalculations";

const referenceDate = new Date(2025, 5, 15);

function daysFromReference(daysOffset: number): string {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

describe("效期计算纯函数", () => {
  describe("daysUntilExpiry", () => {
    it("效期在未来 - 返回正数", () => {
      const days = daysUntilExpiry(daysFromReference(30), referenceDate);
      expect(days).toBeGreaterThan(0);
      expect(days).toBeCloseTo(30, 0);
    });

    it("效期在过去 - 返回负数", () => {
      const days = daysUntilExpiry(daysFromReference(-10), referenceDate);
      expect(days).toBeLessThan(0);
    });

    it("使用系统时间作为默认参考日期（不抛错）", () => {
      const days = daysUntilExpiry("2099-12-31");
      expect(typeof days).toBe("number");
      expect(days).toBeGreaterThan(0);
    });

    it("效期越远，天数越大", () => {
      const near = daysUntilExpiry(daysFromReference(10), referenceDate);
      const far = daysUntilExpiry(daysFromReference(30), referenceDate);
      expect(far).toBeGreaterThan(near);
    });
  });

  describe("selectExpiryStatus", () => {
    it("状态为 ok - 距离效期较远", () => {
      const status = selectExpiryStatus(daysFromReference(90), {
        referenceDate,
      });
      expect(status).toBe("ok");
    });

    it("状态为 near - 接近效期（默认 60 天内）", () => {
      const status = selectExpiryStatus(daysFromReference(30), {
        referenceDate,
      });
      expect(status).toBe("near");
    });

    it("状态为 expired - 已过期", () => {
      const status = selectExpiryStatus(daysFromReference(-10), {
        referenceDate,
      });
      expect(status).toBe("expired");
    });

    it("支持自定义近效期阈值", () => {
      const status = selectExpiryStatus(daysFromReference(20), {
        referenceDate,
        nearExpiryDays: 30,
      });
      expect(status).toBe("near");

      const statusOk = selectExpiryStatus(daysFromReference(20), {
        referenceDate,
        nearExpiryDays: 10,
      });
      expect(statusOk).toBe("ok");
    });
  });

  describe("selectAlertLevel", () => {
    it("normal - 效期充足", () => {
      const level = selectAlertLevel(daysFromReference(180), {
        referenceDate,
      });
      expect(level).toBe("normal");
    });

    it("warning60 - 60 天内到期", () => {
      const level = selectAlertLevel(daysFromReference(45), {
        referenceDate,
      });
      expect(level).toBe("warning60");
    });

    it("warning30 - 30 天内到期", () => {
      const level = selectAlertLevel(daysFromReference(15), {
        referenceDate,
      });
      expect(level).toBe("warning30");
    });

    it("expired - 已过期", () => {
      const level = selectAlertLevel(daysFromReference(-5), {
        referenceDate,
      });
      expect(level).toBe("expired");
    });
  });

  describe("selectExpiringBatches", () => {
    const batches = [
      { id: "b_far", expiry: daysFromReference(180) },
      { id: "b_near", expiry: daysFromReference(45) },
      { id: "b_veryNear", expiry: daysFromReference(10) },
      { id: "b_expired", expiry: daysFromReference(-10) },
    ];

    it("返回近效期和已过期批次的 id 列表", () => {
      const result = selectExpiringBatches(batches, { referenceDate });
      expect(result).toContain("b_near");
      expect(result).toContain("b_veryNear");
      expect(result).toContain("b_expired");
      expect(result).not.toContain("b_far");
    });

    it("支持自定义近效期阈值", () => {
      const result = selectExpiringBatches(batches, {
        referenceDate,
        nearExpiryDays: 15,
      });
      expect(result).toContain("b_veryNear");
      expect(result).toContain("b_expired");
      expect(result).not.toContain("b_far");
      expect(result).not.toContain("b_near");
    });

    it("空输入返回空数组", () => {
      const result = selectExpiringBatches([], { referenceDate });
      expect(result).toEqual([]);
    });
  });
});
