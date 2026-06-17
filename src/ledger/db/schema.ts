export const DB_NAME = "hxwl_inventory_db";
export const DB_VERSION = 2;

export const STORES = {
  HERBS: "herbs",
  BATCHES: "batches",
  OPERATIONS: "operations",
  AUDIT_LOGS: "audit_logs",
  SAFETY_STOCK_RULES: "safety_stock_rules",
  ROLE_PREFERENCES: "role_preferences",
  META: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export interface HerbRecord {
  id: string;
  name: string;
  spec: string;
  origin: string;
  category: string;
  defaultUnit: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface BatchRecord {
  id: string;
  herbId: string;
  name: string;
  spec: string;
  origin: string;
  category: string;
  batchNo: string;
  expiry: string;
  unit: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  syncStatus: "pending" | "synced" | "conflict" | "error";
  serverId?: string;
}

export interface OperationRecord {
  id: string;
  batchId: string;
  type: "inbound" | "outbound" | "loss";
  quantity: number;
  balanceAfter: number;
  operator: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  syncStatus: "pending" | "synced" | "conflict" | "error";
  serverId?: string;
}

export interface AuditLogRecord {
  id: string;
  logType:
    | "create_batch"
    | "inbound"
    | "outbound"
    | "loss"
    | "update_safety_stock";
  herbName: string;
  batchNo: string;
  changeGrams: number;
  operator: string;
  remark: string;
  safetyStockBefore?: number;
  safetyStockAfter?: number;
  safetyStockTarget?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  syncStatus: "pending" | "synced" | "conflict" | "error";
  serverId?: string;
}

export interface SafetyStockRuleRecord {
  id: string;
  name: string;
  ruleType: "category" | "herb";
  target: string;
  thresholdGrams: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  syncStatus: "pending" | "synced" | "conflict" | "error";
  serverId?: string;
}

export interface RolePreferenceRecord {
  role: "pharmacist" | "warehouse" | "manager";
  defaultTab?: string;
  preferredFilters?: string[];
  selectedCategory?: string;
  dashboardLayout?: string;
  recentSearches?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export const DEFAULT_HERB: Omit<HerbRecord, never> = {
  id: "",
  name: "",
  spec: "",
  origin: "",
  category: "",
  defaultUnit: "g",
  createdAt: "",
  updatedAt: "",
  isDeleted: false,
};

export const DEFAULT_BATCH: Omit<BatchRecord, never> = {
  id: "",
  herbId: "",
  name: "",
  spec: "",
  origin: "",
  category: "",
  batchNo: "",
  expiry: "",
  unit: "g",
  createdAt: "",
  updatedAt: "",
  isDeleted: false,
  syncStatus: "pending",
};

export const DEFAULT_OPERATION: Omit<OperationRecord, never> = {
  id: "",
  batchId: "",
  type: "inbound",
  quantity: 0,
  balanceAfter: 0,
  operator: "",
  remark: "",
  createdAt: "",
  updatedAt: "",
  isDeleted: false,
  syncStatus: "pending",
};

export const DEFAULT_AUDIT_LOG: Omit<AuditLogRecord, never> = {
  id: "",
  logType: "create_batch",
  herbName: "",
  batchNo: "",
  changeGrams: 0,
  operator: "",
  remark: "",
  createdAt: "",
  updatedAt: "",
  isDeleted: false,
  syncStatus: "pending",
};

export const DEFAULT_SAFETY_STOCK_RULE: Omit<SafetyStockRuleRecord, never> = {
  id: "",
  name: "",
  ruleType: "category",
  target: "",
  thresholdGrams: 0,
  createdAt: "",
  updatedAt: "",
  isDeleted: false,
  syncStatus: "pending",
};

export const DEFAULT_ROLE_PREFERENCE: Omit<RolePreferenceRecord, never> = {
  role: "pharmacist",
  createdAt: "",
  updatedAt: "",
};

export function fillHerbDefaults(raw: Partial<HerbRecord>): HerbRecord {
  return {
    ...DEFAULT_HERB,
    ...raw,
    defaultUnit: raw.defaultUnit ?? "g",
    isDeleted: raw.isDeleted ?? false,
  } as HerbRecord;
}

export function fillBatchDefaults(raw: Partial<BatchRecord>): BatchRecord {
  return {
    ...DEFAULT_BATCH,
    ...raw,
    unit: raw.unit ?? "g",
    isDeleted: raw.isDeleted ?? false,
    syncStatus: raw.syncStatus ?? "pending",
  } as BatchRecord;
}

export function fillOperationDefaults(
  raw: Partial<OperationRecord>
): OperationRecord {
  return {
    ...DEFAULT_OPERATION,
    ...raw,
    isDeleted: raw.isDeleted ?? false,
    syncStatus: raw.syncStatus ?? "pending",
  } as OperationRecord;
}

export function fillAuditLogDefaults(
  raw: Partial<AuditLogRecord>
): AuditLogRecord {
  return {
    ...DEFAULT_AUDIT_LOG,
    ...raw,
    isDeleted: raw.isDeleted ?? false,
    syncStatus: raw.syncStatus ?? "pending",
  } as AuditLogRecord;
}

export function fillSafetyStockRuleDefaults(
  raw: Partial<SafetyStockRuleRecord>
): SafetyStockRuleRecord {
  return {
    ...DEFAULT_SAFETY_STOCK_RULE,
    ...raw,
    isDeleted: raw.isDeleted ?? false,
    syncStatus: raw.syncStatus ?? "pending",
  } as SafetyStockRuleRecord;
}

export function fillRolePreferenceDefaults(
  raw: Partial<RolePreferenceRecord>
): RolePreferenceRecord {
  return {
    ...DEFAULT_ROLE_PREFERENCE,
    ...raw,
  } as RolePreferenceRecord;
}

export interface IndexedDBMigration {
  version: number;
  upgrade: (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void;
}

export const MIGRATIONS: IndexedDBMigration[] = [
  {
    version: 1,
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(STORES.HERBS)) {
        const herbStore = db.createObjectStore(STORES.HERBS, { keyPath: "id" });
        herbStore.createIndex("name", "name", { unique: false });
        herbStore.createIndex("category", "category", { unique: false });
        herbStore.createIndex("name_category", ["name", "category"], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORES.BATCHES)) {
        const batchStore = db.createObjectStore(STORES.BATCHES, {
          keyPath: "id",
        });
        batchStore.createIndex("batchNo", "batchNo", { unique: true });
        batchStore.createIndex("herbId", "herbId", { unique: false });
        batchStore.createIndex("name", "name", { unique: false });
        batchStore.createIndex("category", "category", { unique: false });
        batchStore.createIndex("expiry", "expiry", { unique: false });
        batchStore.createIndex("createdAt", "createdAt", { unique: false });
        batchStore.createIndex("isDeleted", "isDeleted", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.OPERATIONS)) {
        const opStore = db.createObjectStore(STORES.OPERATIONS, {
          keyPath: "id",
        });
        opStore.createIndex("batchId", "batchId", { unique: false });
        opStore.createIndex("type", "type", { unique: false });
        opStore.createIndex("createdAt", "createdAt", { unique: false });
        opStore.createIndex("batchId_createdAt", ["batchId", "createdAt"], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORES.AUDIT_LOGS)) {
        const logStore = db.createObjectStore(STORES.AUDIT_LOGS, {
          keyPath: "id",
        });
        logStore.createIndex("logType", "logType", { unique: false });
        logStore.createIndex("herbName", "herbName", { unique: false });
        logStore.createIndex("batchNo", "batchNo", { unique: false });
        logStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SAFETY_STOCK_RULES)) {
        const ssStore = db.createObjectStore(STORES.SAFETY_STOCK_RULES, {
          keyPath: "id",
        });
        ssStore.createIndex("ruleType", "ruleType", { unique: false });
        ssStore.createIndex("target", "target", { unique: false });
        ssStore.createIndex("ruleType_target", ["ruleType", "target"], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORES.ROLE_PREFERENCES)) {
        db.createObjectStore(STORES.ROLE_PREFERENCES, { keyPath: "role" });
      }

      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: "key" });
      }
    },
  },
  {
    version: 2,
    upgrade: (db, oldVersion, tx) => {
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains(STORES.BATCHES)) {
          const store = tx.objectStore(STORES.BATCHES);
          store.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as
              | IDBCursorWithValue
              | undefined;
            if (cursor) {
              const value = cursor.value as Partial<BatchRecord>;
              let changed = false;
              if (!value.syncStatus) {
                value.syncStatus = "pending";
                changed = true;
              }
              if (value.isDeleted === undefined) {
                value.isDeleted = false;
                changed = true;
              }
              if (changed) {
                cursor.update(value);
              }
              cursor.continue();
            }
          };
        }

        if (db.objectStoreNames.contains(STORES.OPERATIONS)) {
          const store = tx.objectStore(STORES.OPERATIONS);
          store.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as
              | IDBCursorWithValue
              | undefined;
            if (cursor) {
              const value = cursor.value as Partial<OperationRecord>;
              let changed = false;
              if (!value.syncStatus) {
                value.syncStatus = "pending";
                changed = true;
              }
              if (value.isDeleted === undefined) {
                value.isDeleted = false;
                changed = true;
              }
              if (changed) {
                cursor.update(value);
              }
              cursor.continue();
            }
          };
        }

        if (db.objectStoreNames.contains(STORES.AUDIT_LOGS)) {
          const store = tx.objectStore(STORES.AUDIT_LOGS);
          store.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as
              | IDBCursorWithValue
              | undefined;
            if (cursor) {
              const value = cursor.value as Partial<AuditLogRecord>;
              let changed = false;
              if (!value.syncStatus) {
                value.syncStatus = "pending";
                changed = true;
              }
              if (value.isDeleted === undefined) {
                value.isDeleted = false;
                changed = true;
              }
              if (changed) {
                cursor.update(value);
              }
              cursor.continue();
            }
          };
        }

        if (db.objectStoreNames.contains(STORES.SAFETY_STOCK_RULES)) {
          const store = tx.objectStore(STORES.SAFETY_STOCK_RULES);
          store.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as
              | IDBCursorWithValue
              | undefined;
            if (cursor) {
              const value = cursor.value as Partial<SafetyStockRuleRecord>;
              let changed = false;
              if (!value.syncStatus) {
                value.syncStatus = "pending";
                changed = true;
              }
              if (value.isDeleted === undefined) {
                value.isDeleted = false;
                changed = true;
              }
              if (changed) {
                cursor.update(value);
              }
              cursor.continue();
            }
          };
        }
      }
    },
  },
];
