import {
  DB_NAME,
  DB_VERSION,
  MIGRATIONS,
  STORES,
  StoreName,
  fillAuditLogDefaults,
  fillBatchDefaults,
  fillExpiryAlertHandlingDefaults,
  fillHerbDefaults,
  fillOperationDefaults,
  fillRolePreferenceDefaults,
  fillSafetyStockRuleDefaults,
  type AuditLogRecord,
  type BatchRecord,
  type ExpiryAlertHandlingRecord,
  type HerbRecord,
  type MetaRecord,
  type OperationRecord,
  type RolePreferenceRecord,
  type SafetyStockRuleRecord,
} from "./schema";

export class DatabaseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class ConstraintError extends DatabaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConstraintError";
  }
}

type IDBTransactionMode = "readonly" | "readwrite";

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      const err = request.error;
      if (err?.name === "ConstraintError") {
        reject(new ConstraintError(err.message || "数据约束冲突", err));
      } else {
        reject(new DatabaseError(err?.message || "数据库操作失败", err));
      }
    };
  });
}

function wrapTransaction(
  transaction: IDBTransaction
): Promise<IDBTransaction> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(transaction);
    transaction.onerror = () => {
      const err = transaction.error;
      if (err?.name === "ConstraintError") {
        reject(new ConstraintError(err.message || "数据约束冲突", err));
      } else {
        reject(new DatabaseError(err?.message || "事务执行失败", err));
      }
    };
    transaction.onabort = () => {
      reject(new DatabaseError("事务被中止", transaction.error));
    };
  });
}

export class InventoryDatabase {
  private static instance: InventoryDatabase | null = null;
  private db: IDBDatabase | null = null;
  private openPromise: Promise<IDBDatabase> | null = null;
  private listeners: Set<() => void> = new Set();

  static getInstance(): InventoryDatabase {
    if (!InventoryDatabase.instance) {
      InventoryDatabase.instance = new InventoryDatabase();
    }
    return InventoryDatabase.instance;
  }

  private constructor() {}

  open(): Promise<IDBDatabase> {
    if (this.db) {
      return Promise.resolve(this.db);
    }
    if (this.openPromise) {
      return this.openPromise;
    }

    this.openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.openPromise = null;
        reject(
          new DatabaseError(
            request.error?.message || "无法打开数据库",
            request.error
          )
        );
      };

      request.onblocked = () => {
        reject(
          new DatabaseError(
            "数据库被其他标签页阻塞，请关闭其他使用该数据库的标签页后重试"
          )
        );
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const upgradeTx = request.transaction!;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        const migrationsToRun = MIGRATIONS.filter(
          (m) => m.version > oldVersion && m.version <= DB_VERSION
        );
        for (const migration of migrationsToRun) {
          try {
            migration.upgrade(db, oldVersion, upgradeTx);
          } catch (e) {
            console.error(`迁移到版本 ${migration.version} 失败:`, e);
          }
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.openPromise = null;

        this.db.onversionchange = () => {
          this.close();
        };

        this.db.onclose = () => {
          this.db = null;
        };

        resolve(this.db);
      };
    });

    return this.openPromise;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.openPromise = null;
    }
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("数据库变更监听失败:", e);
      }
    }
  }

  private async getStore(
    storeName: StoreName,
    mode: IDBTransactionMode = "readonly"
  ): Promise<{ store: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.open();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { store, tx };
  }

  private async getStores(
    storeNames: StoreName[],
    mode: IDBTransactionMode = "readonly"
  ): Promise<{ stores: Record<StoreName, IDBObjectStore>; tx: IDBTransaction }> {
    const db = await this.open();
    const tx = db.transaction(storeNames, mode);
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }
    return { stores: stores as Record<StoreName, IDBObjectStore>, tx };
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    const { store, tx } = await this.getStore(storeName, "readonly");
    const result = await wrapRequest(store.getAll() as IDBRequest<T[]>);
    await wrapTransaction(tx);
    return result;
  }

  async getByIndex<T>(
    storeName: StoreName,
    indexName: string,
    value: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    const { store, tx } = await this.getStore(storeName, "readonly");
    const index = store.index(indexName);
    const result = await wrapRequest(index.getAll(value) as IDBRequest<T[]>);
    await wrapTransaction(tx);
    return result;
  }

  async getByKey<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const { store, tx } = await this.getStore(storeName, "readonly");
    const result = await wrapRequest(store.get(key) as IDBRequest<T>);
    await wrapTransaction(tx);
    return result;
  }

  async count(storeName: StoreName): Promise<number> {
    const { store, tx } = await this.getStore(storeName, "readonly");
    const result = await wrapRequest(store.count());
    await wrapTransaction(tx);
    return result;
  }

  async put<T>(
    storeName: StoreName,
    value: T,
    notify = true
  ): Promise<T> {
    const { store, tx } = await this.getStore(storeName, "readwrite");
    await wrapRequest(store.put(value));
    await wrapTransaction(tx);
    if (notify) this.notify();
    return value;
  }

  async putBulk<T>(
    storeName: StoreName,
    values: T[],
    notify = true
  ): Promise<T[]> {
    if (values.length === 0) return [];
    const { store, tx } = await this.getStore(storeName, "readwrite");
    for (const v of values) {
      store.put(v);
    }
    await wrapTransaction(tx);
    if (notify) this.notify();
    return values;
  }

  async delete(
    storeName: StoreName,
    key: IDBValidKey,
    notify = true
  ): Promise<void> {
    const { store, tx } = await this.getStore(storeName, "readwrite");
    await wrapRequest(store.delete(key));
    await wrapTransaction(tx);
    if (notify) this.notify();
  }

  async clear(storeName: StoreName, notify = true): Promise<void> {
    const { store, tx } = await this.getStore(storeName, "readwrite");
    await wrapRequest(store.clear());
    await wrapTransaction(tx);
    if (notify) this.notify();
  }

  async clearAll(notify = true): Promise<void> {
    const db = await this.open();
    const storeNames = Array.from(db.objectStoreNames) as StoreName[];
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    await wrapTransaction(tx);
    if (notify) this.notify();
  }

  async withTransaction<T>(
    storeNames: StoreName[],
    mode: IDBTransactionMode,
    fn: (stores: Record<StoreName, IDBObjectStore>) => Promise<T> | T
  ): Promise<T> {
    const { stores, tx } = await this.getStores(storeNames, mode);
    let result: T;
    try {
      result = await fn(stores);
    } catch (e) {
      tx.abort();
      throw e;
    }
    await wrapTransaction(tx);
    this.notify();
    return result;
  }

  async getConsistentSnapshot(): Promise<{
    batches: BatchRecord[];
    operations: OperationRecord[];
    auditLogs: AuditLogRecord[];
    herbs: HerbRecord[];
    safetyStockRules: SafetyStockRuleRecord[];
    rolePreferences: RolePreferenceRecord[];
    expiryAlertHandlings: ExpiryAlertHandlingRecord[];
    meta: MetaRecord[];
  }> {
    const db = await this.open();
    const storeNames: StoreName[] = [
      STORES.BATCHES,
      STORES.OPERATIONS,
      STORES.AUDIT_LOGS,
      STORES.HERBS,
      STORES.SAFETY_STOCK_RULES,
      STORES.ROLE_PREFERENCES,
      STORES.EXPIRY_ALERT_HANDLINGS,
      STORES.META,
    ];
    const tx = db.transaction(storeNames, "readonly");

    const [batches, operations, auditLogs, herbs, safetyStockRules, rolePreferences, expiryAlertHandlings, meta] =
      await Promise.all([
        wrapRequest(tx.objectStore(STORES.BATCHES).getAll()) as Promise<
          Partial<BatchRecord>[]
        >,
        wrapRequest(tx.objectStore(STORES.OPERATIONS).getAll()) as Promise<
          Partial<OperationRecord>[]
        >,
        wrapRequest(tx.objectStore(STORES.AUDIT_LOGS).getAll()) as Promise<
          Partial<AuditLogRecord>[]
        >,
        wrapRequest(tx.objectStore(STORES.HERBS).getAll()) as Promise<
          Partial<HerbRecord>[]
        >,
        wrapRequest(
          tx.objectStore(STORES.SAFETY_STOCK_RULES).getAll()
        ) as Promise<Partial<SafetyStockRuleRecord>[]>,
        wrapRequest(
          tx.objectStore(STORES.ROLE_PREFERENCES).getAll()
        ) as Promise<Partial<RolePreferenceRecord>[]>,
        wrapRequest(
          tx.objectStore(STORES.EXPIRY_ALERT_HANDLINGS).getAll()
        ) as Promise<Partial<ExpiryAlertHandlingRecord>[]>,
        wrapRequest(tx.objectStore(STORES.META).getAll()) as Promise<
          MetaRecord[]
        >,
      ]);

    await wrapTransaction(tx);

    return {
      batches: batches.map(fillBatchDefaults),
      operations: operations.map(fillOperationDefaults),
      auditLogs: auditLogs.map(fillAuditLogDefaults),
      herbs: herbs.map(fillHerbDefaults),
      safetyStockRules: safetyStockRules.map(fillSafetyStockRuleDefaults),
      rolePreferences: rolePreferences.map(fillRolePreferenceDefaults),
      expiryAlertHandlings: expiryAlertHandlings.map(fillExpiryAlertHandlingDefaults),
      meta,
    };
  }

  async getMeta(key: string): Promise<unknown> {
    const record = await this.getByKey<MetaRecord>(STORES.META, key);
    return record?.value;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const now = new Date().toISOString();
    await this.put<MetaRecord>(STORES.META, {
      key,
      value,
      updatedAt: now,
    });
  }
}

export const inventoryDB = InventoryDatabase.getInstance();
