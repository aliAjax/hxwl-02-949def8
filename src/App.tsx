import { useCallback, useMemo, useState } from "react";
import "./styles.css";
import LedgerModule from "./ledger/LedgerModule";
import ExpiryAlertModule from "./ledger/ExpiryAlertModule";
import SafetyStockModule from "./ledger/SafetyStockModule";
import LowStockModule from "./ledger/LowStockModule";
import ProcurementSuggestionModule from "./ledger/ProcurementSuggestionModule";
import RoleWorkspaceModule from "./ledger/RoleWorkspaceModule";
import {
  checkBatchNoExists,
  selectAllBatches,
  selectAllSafetyStockRules,
  selectCurrentStock,
  selectLowStockHerbCountWithRules,
  selectNearExpiryCount,
  useLedgerStore,
  useSafetyStockStore,
} from "./ledger/store";
import { LOW_STOCK_GRAMS, NEAR_EXPIRY_DAYS, type BatchLedgerDTO } from "./ledger/types";
import { InventoryService } from "./ledger/db/inventoryService";

interface InventoryRecord {
  name: string;
  spec: string;
  origin: string;
  batch: string;
  expiry: string;
  stockGrams: number;
  category: string;
}

const project = {
  "id": "hxwl-02",
  "port": 5102,
  "title": "中药饮片库存",
  "subtitle": "按批号、炮制规格与近效期管理饮片周转（IndexedDB 本地持久化）",
  "stack": "React + Vite + TypeScript + CSS + IndexedDB",
  "theme": [
    "#166534",
    "#b45309",
    "#0f766e"
  ],
  "domain": "中药房",
  "users": [
    "药师",
    "库管",
    "门店负责人"
  ],
  "metrics": [
    "近效期批次",
    "低库存品种",
    "本周出库",
    "安全库存"
  ],
  "filters": [
    "补气",
    "清热",
    "活血",
    "化湿"
  ],
  "fields": [
    { key: "name", label: "饮片名称" },
    { key: "spec", label: "炮制规格" },
    { key: "origin", label: "产地" },
    { key: "batch", label: "批号" },
    { key: "expiry", label: "有效期" },
    { key: "stockGrams", label: "库存克数" },
    { key: "category", label: "功效分类" },
    { key: "operator", label: "操作人" },
    { key: "remark", label: "备注" }
  ] as const,
};

const emptyForm: Record<string, string> = {
  name: "",
  spec: "",
  origin: "",
  batch: "",
  expiry: "",
  stockGrams: "",
  category: "",
  operator: "",
  remark: "",
};

const optionalEntryFields = new Set<keyof typeof emptyForm>(["operator", "remark"]);

const statusColors = ["status-ok", "status-watch", "status-danger"];

function getStockStatus(record: InventoryRecord): string {
  const today = new Date();
  const expiryDate = new Date(record.expiry);
  const diffDays = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return "已过期";
  if (diffDays <= 60) return "近效期";
  if (record.stockGrams < 1200) return "低库存";
  return "正常";
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCsvCell(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

function exportSummary(records: InventoryRecord[]) {
  const headers = [
    "饮片名称",
    "炮制规格",
    "产地",
    "功效分类",
    "批号",
    "库存克数",
    "有效期",
    "库存状态",
  ];
  const rows = records.map((r) => [
    r.name,
    r.spec,
    r.origin,
    r.category,
    r.batch,
    String(r.stockGrams),
    r.expiry,
    getStockStatus(r),
  ]);
  const csvContent =
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const today = formatLocalDate(new Date());
  const a = document.createElement("a");
  a.href = url;
  a.download = `库存摘要_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const ledgerStore = useLedgerStore();
  const { state: ledgerState, addBatch } = ledgerStore;

  const safetyStockStore = useSafetyStockStore();
  const { state: safetyStockState } = safetyStockStore;

  const { storeState: invStoreState, clearWriteError, resetAll, exportSnapshot } =
    ledgerStore.inventoryStore;

  const lowStockHerbCount = useMemo(
    () => selectLowStockHerbCountWithRules(ledgerState, safetyStockState),
    [ledgerState, safetyStockState]
  );
  const nearExpiryCount = useMemo(() => selectNearExpiryCount(ledgerState), [ledgerState]);
  const safetyStockRuleCount = useMemo(
    () => selectAllSafetyStockRules(safetyStockState).length,
    [safetyStockState]
  );

  const metricValues = [
    String(nearExpiryCount),
    String(lowStockHerbCount),
    "31",
    String(safetyStockRuleCount),
  ];

  const [formData, setFormData] = useState<Record<string, string>>({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [tab, setTab] = useState<"entry" | "ledger" | "alert" | "safety" | "lowstock" | "procurement" | "workspace">("workspace");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const records = useMemo<InventoryRecord[]>(() => {
    const batches = selectAllBatches(ledgerState);
    const result: InventoryRecord[] = batches.map((batch: BatchLedgerDTO) => ({
      name: batch.name,
      spec: batch.spec,
      origin: batch.origin,
      batch: batch.batchNo,
      expiry: batch.expiry,
      stockGrams: selectCurrentStock(ledgerState, batch.id),
      category: batch.category,
    }));
    result.sort((a, b) => {
      const aBatch = Object.values(ledgerState.batches).find(
        (x) => !x.isDeleted && x.batchNo === a.batch
      );
      const bBatch = Object.values(ledgerState.batches).find(
        (x) => !x.isDeleted && x.batchNo === b.batch
      );
      return (bBatch?.createdAt || "").localeCompare(aBatch?.createdAt || "");
    });
    return result;
  }, [ledgerState]);

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    project.fields.forEach((field) => {
      if (optionalEntryFields.has(field.key)) return;
      const value = formData[field.key];
      if (!value || !value.trim()) {
        nextErrors[field.key] = `${field.label}不能为空`;
      }
    });

    const stockValue = formData.stockGrams;
    if (stockValue && stockValue.trim()) {
      const num = Number(stockValue);
      if (Number.isNaN(num)) {
        nextErrors.stockGrams = "库存克数必须是数字";
      } else if (num <= 0) {
        nextErrors.stockGrams = "库存克数必须大于0";
      }
    }

    if (formData.batch && formData.batch.trim()) {
      if (checkBatchNoExists(ledgerState, formData.batch.trim())) {
        nextErrors.batch = "该批号已存在，请勿重复录入";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const batchId = await addBatch({
        name: formData.name.trim(),
        spec: formData.spec.trim(),
        origin: formData.origin.trim(),
        category: formData.category.trim(),
        batchNo: formData.batch.trim(),
        expiry: formData.expiry.trim(),
        unit: "g",
        initialStock: Number(formData.stockGrams),
        operator: formData.operator.trim() || "录入员",
        remark: formData.remark.trim() || "库存录入看板新增",
      });
      if (!batchId) {
        setErrors({ submit: "录入失败，请稍后重试" });
        return;
      }

      setFormData({ ...emptyForm });
      setErrors({});
    } catch (e) {
      setErrors({ submit: "录入失败，请稍后重试" });
    }
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter]
    );
  };

  const clearFilters = () => {
    setSelectedFilters([]);
  };

  const filteredRecords = selectedFilters.length === 0
    ? records
    : records.filter((record) => selectedFilters.includes(record.category));

  const formatRecordText = (record: InventoryRecord): string => {
    const today = new Date();
    const expiryDate = new Date(record.expiry);
    const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 60 && diffDays > 0) {
      return `近效期剩余${diffDays}天`;
    }
    if (record.stockGrams < 1200) {
      return `低于安全库存${record.stockGrams}g`;
    }
    return `批号${record.batch}，库存${record.stockGrams}g`;
  };

  const handleExportFull = useCallback(async () => {
    const snapshot = await exportSnapshot();
    if (!snapshot) return;
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IndexedDB库存完整数据_${formatLocalDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSnapshot]);

  const handleReset = useCallback(async () => {
    const result = await resetAll();
    if (!result.ok) {
      alert(`重置失败：${result.error || "未知错误"}`);
    }
    setShowResetConfirm(false);
  }, [resetAll]);

  return (
    <main className="app-shell">
      {invStoreState.loading && (
        <div className="global-loading">
          <div className="loading-spinner" />
          <p>正在加载本地数据库...</p>
        </div>
      )}

      {invStoreState.dbError && (
        <div className="error-banner db-error">
          <div className="error-banner-content">
            <strong>数据库错误：</strong>
            <span>{invStoreState.dbError}</span>
          </div>
          <button className="close-banner" onClick={() => clearWriteError()}>
            ×
          </button>
        </div>
      )}

      {invStoreState.writeError && (
        <div className="error-banner write-error">
          <div className="error-banner-content">
            <strong>操作提示：</strong>
            <span>{invStoreState.writeError}</span>
          </div>
          <button className="close-banner" onClick={() => clearWriteError()}>
            ×
          </button>
        </div>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <div className="db-actions">
            <button className="mini-btn" onClick={handleExportFull} title="导出 IndexedDB 完整快照">
              📤 导出数据
            </button>
            <button
              className="mini-btn mini-danger"
              onClick={() => setShowResetConfirm(true)}
              title="清空并重新初始化示例数据"
            >
              🔄 重置数据
            </button>
          </div>
        </div>
      </section>

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>确认重置所有数据？</h3>
            <p>此操作将清空本地数据库并恢复为初始示例数据，所有修改将丢失且无法恢复。</p>
            <div className="modal-actions">
              <button className="clear-filter" onClick={() => setShowResetConfirm(false)}>
                取消
              </button>
              <button className="primary-action danger-btn" onClick={handleReset}>
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="tab-bar">
        <button
          className={tab === "workspace" ? "tab tab-active" : "tab"}
          onClick={() => setTab("workspace")}
        >
          角色化工作台
        </button>
        <button
          className={tab === "procurement" ? "tab tab-active" : "tab"}
          onClick={() => setTab("procurement")}
        >
          采购补货建议
        </button>
        <button
          className={tab === "entry" ? "tab tab-active" : "tab"}
          onClick={() => setTab("entry")}
        >
          库存录入看板
        </button>
        <button
          className={tab === "ledger" ? "tab tab-active" : "tab"}
          onClick={() => setTab("ledger")}
        >
          批号库存台账
        </button>
        <button
          className={tab === "alert" ? "tab tab-active" : "tab"}
          onClick={() => setTab("alert")}
        >
          近效期预警中心
        </button>
        <button
          className={tab === "lowstock" ? "tab tab-active" : "tab"}
          onClick={() => setTab("lowstock")}
        >
          低库存清单
        </button>
        <button
          className={tab === "safety" ? "tab tab-active" : "tab"}
          onClick={() => setTab("safety")}
        >
          安全库存规则
        </button>
      </nav>

      {tab === "workspace" ? (
        <RoleWorkspaceModule
          ledgerStore={ledgerStore}
          safetyStockStore={safetyStockStore}
        />
      ) : tab === "procurement" ? (
        <ProcurementSuggestionModule
          ledgerStore={ledgerStore}
          safetyStockStore={safetyStockStore}
        />
      ) : tab === "ledger" ? (
        <LedgerModule store={ledgerStore} safetyStockState={safetyStockState} />
      ) : tab === "alert" ? (
        <ExpiryAlertModule store={ledgerStore} />
      ) : tab === "lowstock" ? (
        <LowStockModule
          ledgerStore={ledgerStore}
          safetyStockStore={safetyStockStore}
        />
      ) : tab === "safety" ? (
        <SafetyStockModule
          safetyStockStore={safetyStockStore}
          ledgerStore={ledgerStore}
        />
      ) : (
        <>
      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips filter-chips">
            {project.filters.map((filter: string) => (
              <button
                key={filter}
                className={selectedFilters.includes(filter) ? "filter-active" : ""}
                onClick={() => toggleFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          {selectedFilters.length > 0 && (
            <button className="clear-filter" onClick={clearFilters}>
              清空筛选
            </button>
          )}
          <h2>数据持久化</h2>
          <div className="db-hint">
            <p>💾 所有数据自动保存至浏览器本地 IndexedDB</p>
            <p>📦 刷新页面后数据不会丢失</p>
            <p>🔒 数据仅保存在本地浏览器中</p>
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>库存录入</h2>
            </div>
            <button className="primary-action" onClick={handleSubmit}>提交记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  {!optionalEntryFields.has(field.key) && (
                    <span className="required-mark">*</span>
                  )}
                </span>
                <input
                  type={field.key === "expiry" ? "date" : field.key === "stockGrams" ? "number" : "text"}
                  value={formData[field.key]}
                  placeholder={`填写${field.label}`}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className={errors[field.key] ? "input-error" : ""}
                />
                {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>入库数据</p>
            <h2>近期记录</h2>
          </div>
          <button className="primary-action" onClick={() => exportSummary(filteredRecords)}>导出摘要</button>
        </div>
        <div className="record-list">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record: InventoryRecord, index: number) => (
              <article key={`${record.batch}-${index}`} className="record-card">
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{record.name}</h3>
                  <p>{[record.spec, record.origin, record.category, `有效期${record.expiry}`, formatRecordText(record)].join(" · ")}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>暂无匹配记录</h3>
              <p>当前筛选条件下没有找到符合的饮片记录</p>
              {selectedFilters.length > 0 && (
                <button className="clear-filter" onClick={clearFilters}>
                  清除筛选条件
                </button>
              )}
            </div>
          )}
        </div>
      </section>
        </>
      )}
    </main>
  );
}

export default App;
