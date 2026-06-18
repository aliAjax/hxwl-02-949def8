import type { BaseEntity, InventoryAuditLogDTO, AuditLogType } from "../types";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createBaseEntity(id: string): BaseEntity {
  const ts = nowIso();
  return {
    id,
    createdAt: ts,
    updatedAt: ts,
    isDeleted: false,
    syncStatus: "pending",
  };
}

export function createAuditLog(params: {
  logType: AuditLogType;
  herbName: string;
  batchNo: string;
  changeGrams: number;
  operator: string;
  remark: string;
  safetyStockBefore?: number;
  safetyStockAfter?: number;
  safetyStockTarget?: string;
}): InventoryAuditLogDTO {
  return {
    ...createBaseEntity(createId("log")),
    logType: params.logType,
    herbName: params.herbName,
    batchNo: params.batchNo,
    changeGrams: params.changeGrams,
    operator: params.operator || "系统",
    remark: params.remark,
    safetyStockBefore: params.safetyStockBefore,
    safetyStockAfter: params.safetyStockAfter,
    safetyStockTarget: params.safetyStockTarget,
  };
}
