export type OperationType = "inbound" | "outbound" | "loss";

export type AuditLogType = "create_batch" | "inbound" | "outbound" | "loss" | "update_safety_stock" | "batch_adjust";

export type SyncStatus = "pending" | "synced" | "conflict" | "error";

export type ConflictResolutionStrategy = "local_overwrite" | "keep_server" | "handle_later";

export interface SyncStats {
  pendingBatches: number;
  pendingOperations: number;
  pendingAuditLogs: number;
  conflictBatches: number;
  conflictOperations: number;
  conflictAuditLogs: number;
  syncedBatches: number;
  syncedOperations: number;
  syncedAuditLogs: number;
  lastSyncedAt?: string;
}

export interface ConflictDetail {
  entityType: "batch" | "operation" | "audit_log";
  entityId: string;
  batchNo?: string;
  localUpdatedAt: string;
  serverUpdatedAt?: string;
  description: string;
}

export const SCHEMA_VERSION = 1;

export type SafetyStockCalcMode = "fixed" | "dynamic";

export type RuleChangeAction = "create" | "update" | "delete" | "migrate";

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

export interface RolePreferenceRecord {
  role: "pharmacist" | "warehouse" | "manager";
  displayName?: string;
  defaultTab?: boolean;
  preferredFilters?: string[];
  selectedCategory?: string;
  dashboardLayout?: string;
  recentSearches?: string[];
  warehouseOpType?: OperationType;
  managerSortBy?: "stock" | "batchCount" | "name";
  createdAt: string;
  updatedAt: string;
}

export interface LedgerOperationDTO extends BaseEntity {
  batchId: string;
  type: OperationType;
  quantity: number;
  balanceAfter: number;
  operator: string;
  remark: string;
}

export interface InventoryAuditLogDTO extends BaseEntity {
  logType: AuditLogType;
  herbName: string;
  batchNo: string;
  changeGrams: number;
  operator: string;
  remark: string;
  safetyStockBefore?: number;
  safetyStockAfter?: number;
  safetyStockTarget?: string;
}

export interface LedgerState {
  schemaVersion: number;
  batches: Record<string, BatchLedgerDTO>;
  operations: LedgerOperationDTO[];
  auditLogs: InventoryAuditLogDTO[];
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

export interface NewBatchAdjustmentInput {
  batchId: string;
  actualStock: number;
  operator: string;
  reason: string;
}

export interface OperationResult {
  ok: boolean;
  error?: string;
}

export type ExpiryStatus = "expired" | "near" | "ok";

export type AlertLevel = "normal" | "warning60" | "warning30" | "expired";

export const OPERATION_LABELS: Record<OperationType, string> = {
  inbound: "入库",
  outbound: "出库",
  loss: "损耗",
};

export const AUDIT_LOG_LABELS: Record<AuditLogType, string> = {
  create_batch: "新增批号",
  inbound: "入库",
  outbound: "出库",
  loss: "损耗",
  update_safety_stock: "修改安全库存",
  batch_adjust: "批号调整",
};

export const AUDIT_LOG_SIGNS: Record<AuditLogType, string> = {
  create_batch: "+",
  inbound: "+",
  outbound: "-",
  loss: "-",
  update_safety_stock: "→",
  batch_adjust: "↔",
};

export const OPERATION_SIGNS: Record<OperationType, string> = {
  inbound: "+",
  outbound: "-",
  loss: "-",
};

export const NEAR_EXPIRY_DAYS = 60;
export const WARNING_EXPIRY_DAYS_30 = 30;
export const LOW_STOCK_GRAMS = 1200;

export const CATEGORIES = ["补气", "清热", "活血", "化湿"];

export type SafetyStockRuleType = "category" | "herb";

export interface SafetyStockRuleDTO extends BaseEntity {
  name: string;
  ruleType: SafetyStockRuleType;
  target: string;
  calcMode: SafetyStockCalcMode;
  thresholdGrams: number;
  consumptionDays?: number;
  coverDays?: number;
  minThresholdGrams?: number;
  migratedFromV1?: boolean;
}

export interface SafetyStockState {
  schemaVersion: number;
  rules: Record<string, SafetyStockRuleDTO>;
}

export interface NewSafetyStockRuleInput {
  name: string;
  ruleType: SafetyStockRuleType;
  target: string;
  calcMode: SafetyStockCalcMode;
  thresholdGrams: number;
  consumptionDays?: number;
  coverDays?: number;
  minThresholdGrams?: number;
}

export const SAFETY_STOCK_SCHEMA_VERSION = 2;

export type PriorityLevel = "urgent" | "high" | "medium" | "low";

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export const PRIORITY_ORDER: PriorityLevel[] = ["urgent", "high", "medium", "low"];

export const NEAR_EXPIRY_UNSAFE_DAYS = 30;

export const DEFAULT_CONSUMPTION_DAYS = 30;

export const DEFAULT_PURCHASE_COVER_DAYS = 45;

export interface NearExpiryBatchInfo {
  batchId: string;
  batchNo: string;
  expiry: string;
  daysLeft: number;
  stock: number;
}

export interface ProcurementSuggestionItem {
  name: string;
  spec: string;
  origin: string;
  category: string;
  unit: string;
  totalStock: number;
  safeAvailableStock: number;
  nearExpiryStock: number;
  nearExpiryBatches: NearExpiryBatchInfo[];
  thresholdGrams: number;
  avgDailyConsumption: number;
  consumptionDays: number;
  suggestedPurchaseQty: number;
  priority: PriorityLevel;
  priorityScore: number;
  stockDaysLeft: number;
  batchCount: number;
  batches: BatchLedgerDTO[];
}

export interface CategoryProcurementSummary {
  category: string;
  herbCount: number;
  totalSuggestedQty: number;
  urgentCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface ExpiryAlertHandling {
  batchId: string;
  isHandled: boolean;
  handledAt?: string;
  handledBy?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewExpiryAlertHandlingInput {
  batchId: string;
  handledBy?: string;
  remark?: string;
}

export interface SafetyStockRuleChangeLogDTO {
  id: string;
  ruleId: string;
  ruleName: string;
  action: RuleChangeAction;
  operator: string;
  before?: Partial<SafetyStockRuleDTO>;
  after?: Partial<SafetyStockRuleDTO>;
  affectedHerbCount: number;
  lowStockBeforeCount: number;
  lowStockAfterCount: number;
  suggestionDeltaTotal: number;
  remark?: string;
  createdAt: string;
}

export interface SafetyStockRulePreviewItem {
  name: string;
  category: string;
  totalStock: number;
  unit: string;
  thresholdBefore: number;
  thresholdAfter: number;
  isLowStockBefore: boolean;
  isLowStockAfter: boolean;
  lowStockStatusChanged: boolean;
  suggestionBefore: number;
  suggestionAfter: number;
  suggestionDelta: number;
  avgDailyConsumption: number;
}

export interface SafetyStockRulePreviewResult {
  affectedHerbs: SafetyStockRulePreviewItem[];
  newlyLowStock: SafetyStockRulePreviewItem[];
  noLongerLowStock: SafetyStockRulePreviewItem[];
  totalLowStockBefore: number;
  totalLowStockAfter: number;
  lowStockDelta: number;
  totalSuggestionBefore: number;
  totalSuggestionAfter: number;
  totalSuggestionDelta: number;
  avgDailyConsumptionSum: number;
  explainText: string;
}
