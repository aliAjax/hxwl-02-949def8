export type OperationType = "inbound" | "outbound" | "loss";

export type SyncStatus = "pending" | "synced" | "conflict" | "error";

export const SCHEMA_VERSION = 1;

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  serverId?: string;
}

export interface BatchLedgerDTO extends BaseEntity {
  name: string;
  spec: string;
  origin: string;
  category: string;
  batchNo: string;
  expiry: string;
  unit: string;
}

export interface LedgerOperationDTO extends BaseEntity {
  batchId: string;
  type: OperationType;
  quantity: number;
  balanceAfter: number;
  operator: string;
  remark: string;
}

export interface LedgerState {
  schemaVersion: number;
  batches: Record<string, BatchLedgerDTO>;
  operations: LedgerOperationDTO[];
  lastSyncedAt?: string;
}

export interface NewBatchInput {
  name: string;
  spec: string;
  origin: string;
  category: string;
  batchNo: string;
  expiry: string;
  unit: string;
  initialStock: number;
  operator: string;
  remark: string;
}

export interface NewOperationInput {
  batchId: string;
  type: OperationType;
  quantity: number;
  operator: string;
  remark: string;
}

export interface OperationResult {
  ok: boolean;
  error?: string;
}

export type ExpiryStatus = "expired" | "near" | "ok";

export const OPERATION_LABELS: Record<OperationType, string> = {
  inbound: "入库",
  outbound: "出库",
  loss: "损耗",
};

export const OPERATION_SIGNS: Record<OperationType, string> = {
  inbound: "+",
  outbound: "-",
  loss: "-",
};

export const NEAR_EXPIRY_DAYS = 60;
export const LOW_STOCK_GRAMS = 1200;

export const CATEGORIES = ["补气", "清热", "活血", "化湿"];
