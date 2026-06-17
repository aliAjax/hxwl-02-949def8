import { useMemo, useState } from "react";
import {
  AUDIT_LOG_LABELS,
  AUDIT_LOG_SIGNS,
  AuditLogType,
  CATEGORIES,
  InventoryAuditLogDTO,
  LedgerOperationDTO,
  NewBatchInput,
  OPERATION_LABELS,
  OPERATION_SIGNS,
  OperationType,
  SafetyStockState,
} from "./types";
import {
  checkBatchNoExists,
  daysUntilExpiry,
  selectBatches,
  selectCurrentStock,
  selectExpiryStatus,
  selectFilteredAuditLogs,
  selectPendingSyncCount,
  selectRecentOperations,
  selectSafetyStockThresholdForHerb,
} from "./store";
import type { LedgerStore } from "./store";

const emptyBatchForm = {
  name: "",
  spec: "",
  origin: "",
  category: "",
  batchNo: "",
  expiry: "",
  unit: "g",
  initialStock: "",
  operator: "",
  remark: "",
};

const emptyOpForm = {
  type: "outbound" as OperationType,
  quantity: "",
  operator: "",
  remark: "",
};

const batchFields: Array<{ key: keyof typeof emptyBatchForm; label: string; type: string; required: boolean }> = [
  { key: "name", label: "饮片名称", type: "text", required: true },
  { key: "spec", label: "炮制规格", type: "text", required: true },
  { key: "origin", label: "产地", type: "text", required: true },
  { key: "category", label: "功效分类", type: "select", required: true },
  { key: "batchNo", label: "批号", type: "text", required: true },
  { key: "expiry", label: "有效期", type: "date", required: true },
  { key: "unit", label: "单位", type: "text", required: true },
  { key: "initialStock", label: "期初库存", type: "number", required: true },
  { key: "operator", label: "操作人", type: "text", required: false },
  { key: "remark", label: "备注", type: "text", required: false },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function expiryBadgeText(expiry: string): { text: string; className: string } {
  const status = selectExpiryStatus(expiry);
  const days = daysUntilExpiry(expiry);
  if (status === "expired") {
    return { text: `已过期 ${Math.abs(days)} 天`, className: "expiry-expired" };
  }
  if (status === "near") {
    return { text: `近效期 剩 ${days} 天`, className: "expiry-near" };
  }
  return { text: `剩余 ${days} 天`, className: "expiry-ok" };
}

interface LedgerModuleProps {
  store: LedgerStore;
  safetyStockState: SafetyStockState;
}

function LedgerModule({ store, safetyStockState }: LedgerModuleProps) {
  const { state, addBatch, recordOperation } = store;
  const [showForm, setShowForm] = useState(false);
  const [batchForm, setBatchForm] = useState({ ...emptyBatchForm });
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [logBatchFilter, setLogBatchFilter] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState<AuditLogType | "all">("all");
  const [logOperatorFilter, setLogOperatorFilter] = useState("");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");

  const batches = selectBatches(state);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = batches.filter((b) => {
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.spec.toLowerCase().includes(q) ||
        b.batchNo.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const b of filtered) {
      const list = map.get(b.name) ?? [];
      list.push(b);
      map.set(b.name, list);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      totalStock: items.reduce((sum, b) => sum + selectCurrentStock(state, b.id), 0),
      unit: items[0]?.unit ?? "g",
    }));
  }, [batches, query, state]);

  const filteredAuditLogs = useMemo(
    () =>
      selectFilteredAuditLogs(state, {
        batchNo: logBatchFilter,
        logType: logTypeFilter,
        operator: logOperatorFilter,
        dateFrom: logDateFrom,
        dateTo: logDateTo,
      }),
    [state, logBatchFilter, logTypeFilter, logOperatorFilter, logDateFrom, logDateTo]
  );

  const auditLogBase = useMemo(() => {
    return selectFilteredAuditLogs(state, {
      batchNo: logBatchFilter,
      logType: "all",
      operator: logOperatorFilter,
      dateFrom: logDateFrom,
      dateTo: logDateTo,
    });
  }, [state, logBatchFilter, logOperatorFilter, logDateFrom, logDateTo]);

  const auditLogTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: auditLogBase.length };
    for (const log of auditLogBase) {
      counts[log.logType] = (counts[log.logType] ?? 0) + 1;
    }
    return counts;
  }, [auditLogBase]);

  const handleBatchField = (key: keyof typeof emptyBatchForm, value: string) => {
    setBatchForm((prev) => ({ ...prev, [key]: value }));
    if (batchErrors[key]) {
      setBatchErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateBatchForm = (): boolean => {
    const next: Record<string, string> = {};
    batchFields.forEach((f) => {
      if (!f.required) return;
      const value = batchForm[f.key];
      if (!value || !String(value).trim()) {
        next[f.key] = `${f.label}不能为空`;
      }
    });
    const stockValue = batchForm.initialStock;
    if (stockValue && stockValue.trim()) {
      const num = Number(stockValue);
      if (Number.isNaN(num)) {
        next.initialStock = "期初库存必须是数字";
      } else if (num <= 0) {
        next.initialStock = "期初库存必须大于 0";
      }
    }
    const batchNo = batchForm.batchNo.trim();
    if (batchNo && checkBatchNoExists(state, batchNo)) {
      next.batchNo = `批号 "${batchNo}" 已存在，请使用不同的批号`;
    }
    setBatchErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitBatch = async () => {
    if (!validateBatchForm()) return;
    const input: NewBatchInput = {
      name: batchForm.name.trim(),
      spec: batchForm.spec.trim(),
      origin: batchForm.origin.trim(),
      category: batchForm.category.trim(),
      batchNo: batchForm.batchNo.trim(),
      expiry: batchForm.expiry.trim(),
      unit: batchForm.unit.trim() || "g",
      initialStock: Number(batchForm.initialStock),
      operator: batchForm.operator.trim(),
      remark: batchForm.remark.trim(),
    };
    const batchId = await addBatch(input);
    if (!batchId) {
      setBatchErrors({ submit: "批号写入失败，请稍后重试" });
      return;
    }
    setBatchForm({ ...emptyBatchForm });
    setBatchErrors({});
    setShowForm(false);
  };

  return (
    <section className="ledger module panel">
      <div className="section-heading">
        <div>
          <p>批号库存台账</p>
          <h2>按批号登记入库 / 出库 / 损耗</h2>
        </div>
        <button
          className="primary-action"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "收起表单" : "新增批号"}
        </button>
      </div>

      {showForm && (
        <div className="batch-form">
          <div className="field-grid">
            {batchFields.map((f) => (
              <label key={f.key}>
                <span>
                  {f.label}
                  {f.required && <span className="required-mark">*</span>}
                </span>
                {f.type === "select" ? (
                  <select
                    value={batchForm[f.key]}
                    onChange={(e) => handleBatchField(f.key, e.target.value)}
                    className={batchErrors[f.key] ? "input-error" : ""}
                  >
                    <option value="">选择{f.label}</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    value={batchForm[f.key]}
                    placeholder={`填写${f.label}`}
                    onChange={(e) => handleBatchField(f.key, e.target.value)}
                    className={batchErrors[f.key] ? "input-error" : ""}
                  />
                )}
                {batchErrors[f.key] && (
                  <span className="error-text">{batchErrors[f.key]}</span>
                )}
              </label>
            ))}
          </div>
          <div className="batch-form-actions">
            <button className="primary-action" onClick={submitBatch}>
              登记批号
            </button>
            <button
              className="clear-filter"
              onClick={() => {
                setBatchForm({ ...emptyBatchForm });
                setBatchErrors({});
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}

      <div className="ledger-toolbar">
        <input
          type="text"
          value={query}
          placeholder="搜索饮片名称 / 规格 / 批号"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="ledger-summary">
          共 {batches.length} 个批号 · {grouped.length} 种饮片
          {selectPendingSyncCount(state) > 0 && (
            <> · 待同步 {selectPendingSyncCount(state)} 项</>
          )}
        </span>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>暂无批号台账</h3>
          <p>点击「新增批号」登记第一个批号库存</p>
        </div>
      ) : (
        <div className="batch-groups">
          {grouped.map((group) => (
            <section className="batch-group" key={group.name}>
              <header className="batch-group-header">
                <h3>{group.name}</h3>
                <span>
                  {group.items.length} 个批号 · 合计库存 {group.totalStock} {group.unit}
                </span>
              </header>
              <div className="batch-cards">
                {group.items.map((batch) => (
                  <BatchLedgerCard
                    key={batch.id}
                    batchId={batch.id}
                    stateRef={state}
                    safetyStockState={safetyStockState}
                    onRecord={recordOperation}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="audit-trail module panel">
        <div className="section-heading">
          <div>
            <p>操作流水</p>
            <h2>库存变动历史追踪</h2>
          </div>
          <span className="ledger-summary">
            共 {filteredAuditLogs.length} 条流水记录
          </span>
        </div>

        <div className="audit-toolbar">
          <input
            type="text"
            value={logBatchFilter}
            placeholder="按批号搜索"
            onChange={(e) => setLogBatchFilter(e.target.value)}
          />
          <input
            type="text"
            value={logOperatorFilter}
            placeholder="按操作人搜索"
            onChange={(e) => setLogOperatorFilter(e.target.value)}
          />
          <input
            type="date"
            value={logDateFrom}
            onChange={(e) => setLogDateFrom(e.target.value)}
          />
          <input
            type="date"
            value={logDateTo}
            onChange={(e) => setLogDateTo(e.target.value)}
          />
          <div className="audit-filter-chips">
            <button
              className={logTypeFilter === "all" ? "filter-active" : ""}
              onClick={() => setLogTypeFilter("all")}
            >
              全部 ({auditLogTypeCounts.all ?? 0})
            </button>
            <button
              className={`${logTypeFilter === "create_batch" ? "filter-active" : ""} audit-chip-create`}
              onClick={() => setLogTypeFilter("create_batch")}
            >
              新增批号 ({auditLogTypeCounts.create_batch ?? 0})
            </button>
            <button
              className={`${logTypeFilter === "inbound" ? "filter-active" : ""} audit-chip-inbound`}
              onClick={() => setLogTypeFilter("inbound")}
            >
              入库 ({auditLogTypeCounts.inbound ?? 0})
            </button>
            <button
              className={`${logTypeFilter === "outbound" ? "filter-active" : ""} audit-chip-outbound`}
              onClick={() => setLogTypeFilter("outbound")}
            >
              出库 ({auditLogTypeCounts.outbound ?? 0})
            </button>
            <button
              className={`${logTypeFilter === "loss" ? "filter-active" : ""} audit-chip-loss`}
              onClick={() => setLogTypeFilter("loss")}
            >
              损耗 ({auditLogTypeCounts.loss ?? 0})
            </button>
            <button
              className={`${logTypeFilter === "update_safety_stock" ? "filter-active" : ""} audit-chip-safety`}
              onClick={() => setLogTypeFilter("update_safety_stock")}
            >
              改安全库存 ({auditLogTypeCounts.update_safety_stock ?? 0})
            </button>
          </div>
        </div>

        {filteredAuditLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>暂无流水记录</h3>
            <p>
              {logBatchFilter || logTypeFilter !== "all" || logOperatorFilter || logDateFrom || logDateTo
                ? "当前筛选条件下没有找到符合的流水记录"
                : "进行库存操作后会在此处显示流水记录"}
            </p>
            {(logBatchFilter || logTypeFilter !== "all" || logOperatorFilter || logDateFrom || logDateTo) && (
              <button
                className="clear-filter"
                onClick={() => {
                  setLogBatchFilter("");
                  setLogTypeFilter("all");
                  setLogOperatorFilter("");
                  setLogDateFrom("");
                  setLogDateTo("");
                }}
              >
                清除筛选条件
              </button>
            )}
          </div>
        ) : (
          <div className="audit-log-list">
            {filteredAuditLogs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

interface BatchLedgerCardProps {
  batchId: string;
  stateRef: LedgerStore["state"];
  safetyStockState: SafetyStockState;
  onRecord: LedgerStore["recordOperation"];
}

function BatchLedgerCard({ batchId, stateRef, safetyStockState, onRecord }: BatchLedgerCardProps) {
  const state = stateRef;
  const batch = state.batches[batchId];
  const [opForm, setOpForm] = useState({ ...emptyOpForm });
  const [opError, setOpError] = useState("");

  if (!batch) return null;

  const currentStock = selectCurrentStock(state, batchId);
  const recentOps = selectRecentOperations(state, batchId, 4);
  const expiryBadge = expiryBadgeText(batch.expiry);
  const threshold = selectSafetyStockThresholdForHerb(
    safetyStockState,
    batch.name,
    batch.category
  );
  const low = currentStock < threshold;

  const submitOp = () => {
    const qty = Number(opForm.quantity);
    if (!opForm.quantity.trim() || Number.isNaN(qty) || qty <= 0) {
      setOpError("数量必须为大于 0 的数字");
      return;
    }
    const result = onRecord({
      batchId,
      type: opForm.type,
      quantity: qty,
      operator: opForm.operator.trim(),
      remark: opForm.remark.trim(),
    });
    if (!result.ok) {
      setOpError(result.error ?? "操作失败");
      return;
    }
    setOpForm({ ...emptyOpForm });
    setOpError("");
  };

  return (
    <article className="batch-card">
      <header className="batch-card-head">
        <div className="batch-card-title">
          <span className="batch-no">{batch.batchNo}</span>
          <h4>{batch.name} · {batch.spec}</h4>
        </div>
        <span className={`expiry-badge ${expiryBadge.className}`}>
          {expiryBadge.text}
        </span>
      </header>

      <div className="batch-card-meta">
        <span>产地 {batch.origin}</span>
        <span>分类 {batch.category}</span>
        <span>单位 {batch.unit}</span>
        <span>有效期 {batch.expiry}</span>
        {batch.syncStatus !== "synced" && (
          <span className="sync-status sync-pending">⏳ 待同步</span>
        )}
      </div>

      <div className="batch-stock">
        <div className="stock-display">
          <span>当前库存</span>
          <strong className={low ? "stock-low" : ""}>
            {currentStock} <i>{batch.unit}</i>
          </strong>
          {low && <span className="stock-hint">低于安全库存 {threshold}g</span>}
        </div>
      </div>

      <div className="op-form">
        <label>
          <span>类型</span>
          <select
            value={opForm.type}
            onChange={(e) =>
              setOpForm((prev) => ({ ...prev, type: e.target.value as OperationType }))
            }
          >
            <option value="inbound">入库</option>
            <option value="outbound">出库</option>
            <option value="loss">损耗</option>
          </select>
        </label>
        <label>
          <span>数量</span>
          <input
            type="number"
            value={opForm.quantity}
            placeholder="数量"
            onChange={(e) => {
              setOpForm((prev) => ({ ...prev, quantity: e.target.value }));
              if (opError) setOpError("");
            }}
            className={opError ? "input-error" : ""}
          />
        </label>
        <label>
          <span>操作人</span>
          <input
            type="text"
            value={opForm.operator}
            placeholder="操作人"
            onChange={(e) =>
              setOpForm((prev) => ({ ...prev, operator: e.target.value }))
            }
          />
        </label>
        <label>
          <span>备注</span>
          <input
            type="text"
            value={opForm.remark}
            placeholder="备注（可选）"
            onChange={(e) =>
              setOpForm((prev) => ({ ...prev, remark: e.target.value }))
            }
          />
        </label>
        <button className="primary-action op-submit" onClick={submitOp}>
          登记
        </button>
      </div>
      {opError && <span className="error-text op-error">{opError}</span>}

      <div className="op-list">
        <div className="op-list-title">最近操作记录</div>
        {recentOps.length === 0 ? (
          <p className="op-empty">暂无操作记录</p>
        ) : (
          recentOps.map((op) => (
            <OperationRow key={op.id} op={op} unit={batch.unit} />
          ))
        )}
      </div>
    </article>
  );
}

function OperationRow({ op, unit }: { op: LedgerOperationDTO; unit: string }) {
  const label = OPERATION_LABELS[op.type];
  const sign = OPERATION_SIGNS[op.type];
  return (
    <div className={`op-item op-${op.type}`}>
      <span className="op-type">{label}</span>
      <span className="op-qty">
        {sign}{op.quantity} {unit}
      </span>
      <span className="op-balance">结存 {op.balanceAfter} {unit}</span>
      <span className="op-time">{formatDateTime(op.createdAt)}</span>
      <span className="op-operator">
        {op.operator}
        {op.remark ? ` · ${op.remark}` : ""}
      </span>
    </div>
  );
}

function AuditLogRow({ log }: { log: InventoryAuditLogDTO }) {
  const label = AUDIT_LOG_LABELS[log.logType];
  const sign = AUDIT_LOG_SIGNS[log.logType];
  const isSafetyStock = log.logType === "update_safety_stock";

  return (
    <div className={`audit-log-item audit-${log.logType}`}>
      <span className="audit-log-type">{label}</span>
      <div className="audit-log-main">
        <div className="audit-log-herb">
          <strong>{log.herbName}</strong>
          {log.batchNo !== "-" && (
            <span className="audit-log-batch">批号: {log.batchNo}</span>
          )}
        </div>
        <div className="audit-log-details">
          {isSafetyStock ? (
            <span className="audit-log-change audit-safety-change">
              {log.safetyStockBefore}g → {log.safetyStockAfter}g
              {log.changeGrams !== 0 && (
                <span className={log.changeGrams > 0 ? "change-up" : "change-down"}>
                  ({log.changeGrams > 0 ? "+" : ""}{log.changeGrams}g)
                </span>
              )}
              {log.safetyStockTarget && (
                <span className="audit-log-target">
                  适用: {log.safetyStockTarget}
                </span>
              )}
            </span>
          ) : (
            <span className={`audit-log-change ${log.changeGrams >= 0 ? "change-up" : "change-down"}`}>
              {sign}{Math.abs(log.changeGrams)}g
            </span>
          )}
          <span className="audit-log-time">{formatDateTime(log.createdAt)}</span>
        </div>
      </div>
      <div className="audit-log-right">
        <span className="audit-log-operator">操作人: {log.operator}</span>
        {log.remark && <span className="audit-log-remark">{log.remark}</span>}
      </div>
    </div>
  );
}

export default LedgerModule;
