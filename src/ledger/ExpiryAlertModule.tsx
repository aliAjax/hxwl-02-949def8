import { useEffect, useMemo, useState } from "react";
import {
  AlertLevel,
  BatchLedgerDTO,
  WARNING_EXPIRY_DAYS_30,
  NEAR_EXPIRY_DAYS,
  ExpiryAlertHandling,
} from "./types";
import {
  countBatchesByAlertLevel,
  daysUntilExpiry,
  selectAlertLevel,
  selectAllBatches,
  selectBatchesByAlertLevel,
  selectCurrentStock,
} from "./store";
import type { LedgerStore } from "./store";

const alertLevelLabels: Record<AlertLevel, string> = {
  normal: "正常",
  warning60: "60天内到期",
  warning30: "30天内到期",
  expired: "已过期",
};

const alertLevelColors: Record<AlertLevel, string> = {
  normal: "alert-normal",
  warning60: "alert-warning60",
  warning30: "alert-warning30",
  expired: "alert-expired",
};

const alertLevelOrder: AlertLevel[] = ["expired", "warning30", "warning60", "normal"];

type HandlingFilter = "all" | "pending" | "handled";

const handlingLabels: Record<HandlingFilter, string> = {
  all: "全部",
  pending: "待处理",
  handled: "已处理",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface AlertMetricCardProps {
  label: string;
  value: number;
  level: AlertLevel;
  active: boolean;
  onClick: () => void;
}

function AlertMetricCard({ label, value, level, active, onClick }: AlertMetricCardProps) {
  return (
    <article
      className={`alert-metric-card ${alertLevelColors[level]} ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <i />
    </article>
  );
}

interface HandlingModalProps {
  batch: BatchLedgerDTO;
  existingHandling?: ExpiryAlertHandling;
  onClose: () => void;
  onConfirm: (params: { handledBy: string; remark: string }) => void;
  mode: "mark" | "unmark";
}

function HandlingModal({ batch, existingHandling, onClose, onConfirm, mode }: HandlingModalProps) {
  const [handledBy, setHandledBy] = useState(existingHandling?.handledBy ?? "药师");
  const [remark, setRemark] = useState(existingHandling?.remark ?? "");

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel handling-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{mode === "mark" ? "标记已处理" : "取消已处理"}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="handling-batch-info">
            <span className="batch-no">{batch.batchNo}</span>
            <p><strong>{batch.name}</strong> · {batch.spec}</p>
            <p className="muted">产地 {batch.origin} · 有效期至 {batch.expiry}</p>
          </div>

          {mode === "mark" ? (
            <>
              <div className="form-row">
                <label>处理人</label>
                <input
                  type="text"
                  value={handledBy}
                  onChange={(e) => setHandledBy(e.target.value)}
                  placeholder="请输入处理人姓名"
                />
              </div>
              <div className="form-row">
                <label>处理备注</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="请填写处理方式和情况说明（如：已退回供应商、已销毁、已折扣促销等）"
                  rows={4}
                />
              </div>
            </>
          ) : (
            <p className="confirm-text">
              确认要取消该批次的&quot;已处理&quot;标记吗？<br />
              取消后该批次将重新出现在待处理列表中。
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={() => onConfirm({ handledBy, remark })}
          >
            {mode === "mark" ? "确认标记" : "确认取消"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AlertBatchCardProps {
  batch: BatchLedgerDTO;
  currentStock: number;
  daysLeft: number;
  level: AlertLevel;
  handling?: ExpiryAlertHandling;
  onMarkHandled: () => void;
  onUnmarkHandled: () => void;
}

function AlertBatchCard({
  batch,
  currentStock,
  daysLeft,
  level,
  handling,
  onMarkHandled,
  onUnmarkHandled,
}: AlertBatchCardProps) {
  const isHandled = handling?.isHandled ?? false;
  const isAlertBatch = level !== "normal";
  const badgeText = level === "expired"
    ? `已过期 ${Math.abs(daysLeft)} 天`
    : `剩余 ${daysLeft} 天`;

  return (
    <article className={`alert-batch-card ${alertLevelColors[level]} ${isHandled ? "handled" : ""}`}>
      <div className="alert-batch-card-head">
        <div className="alert-batch-card-title">
          <span className="batch-no">{batch.batchNo}</span>
          <h4>{batch.name} · {batch.spec}</h4>
        </div>
        <div className="alert-badges">
          {isAlertBatch && isHandled && (
            <span className="handling-badge handled">
              ✓ 已处理
            </span>
          )}
          <span className={`alert-badge ${alertLevelColors[level]}`}>
            {alertLevelLabels[level]}
          </span>
        </div>
      </div>

      <div className="alert-batch-card-meta">
        <span>产地 {batch.origin}</span>
        <span>分类 {batch.category}</span>
        <span>有效期 {batch.expiry}</span>
      </div>

      <div className="alert-batch-card-body">
        <div className="alert-stock">
          <span>当前库存</span>
          <strong>{currentStock} <i>{batch.unit}</i></strong>
        </div>
        <div className="alert-days">
          <span>{level === "expired" ? "已过期天数" : "剩余天数"}</span>
          <strong className={alertLevelColors[level]}>
            {level === "expired" ? Math.abs(daysLeft) : daysLeft}
            <i>天</i>
          </strong>
        </div>
      </div>

      <div className="alert-progress-bar">
        <div
          className={`alert-progress-fill ${alertLevelColors[level]}`}
          style={{
            width: level === "expired"
              ? "100%"
              : level === "normal"
                ? "0%"
                : `${Math.max(0, Math.min(100, (1 - daysLeft / NEAR_EXPIRY_DAYS) * 100))}%`,
          }}
        />
      </div>

      <div className="alert-badge-text">
        {badgeText}
      </div>

      {isAlertBatch && isHandled && handling && (
        <div className="handling-info">
          <div className="handling-info-row">
            <span className="handling-label">处理人：</span>
            <span className="handling-value">{handling.handledBy || "未填写"}</span>
          </div>
          {handling.handledAt && (
            <div className="handling-info-row">
              <span className="handling-label">处理时间：</span>
              <span className="handling-value">{formatDateTime(handling.handledAt)}</span>
            </div>
          )}
          {handling.remark && (
            <div className="handling-info-row remark">
              <span className="handling-label">处理备注：</span>
              <span className="handling-value">{handling.remark}</span>
            </div>
          )}
        </div>
      )}

      {isAlertBatch && (
        <div className="handling-actions">
          {isHandled ? (
            <button className="btn-unmark" onClick={onUnmarkHandled}>
              撤销已处理
            </button>
          ) : (
            <button className="btn-mark" onClick={onMarkHandled}>
              标记已处理
            </button>
          )}
        </div>
      )}
    </article>
  );
}

interface ExpiryAlertModuleProps {
  store: LedgerStore;
}

function ExpiryAlertModule({ store }: ExpiryAlertModuleProps) {
  const { state, inventoryStore } = store;
  const { expiryAlertHandlings, markExpiryAlertHandled, unmarkExpiryAlertHandled } = inventoryStore;

  const [selectedLevel, setSelectedLevel] = useState<AlertLevel | "all">("all");
  const [handlingFilter, setHandlingFilter] = useState<HandlingFilter>("all");
  const [query, setQuery] = useState("");

  const [modalState, setModalState] = useState<
    | { open: false; batch: null; mode: "mark" | "unmark" }
    | { open: true; batch: BatchLedgerDTO; mode: "mark" | "unmark" }
  >({ open: false, batch: null, mode: "mark" });

  const counts = useMemo(() => countBatchesByAlertLevel(state), [state]);
  const grouped = useMemo(() => selectBatchesByAlertLevel(state), [state]);
  const allBatches = useMemo(() => selectAllBatches(state), [state]);

  const alertBatches = useMemo(() => {
    return allBatches.filter((b) => selectAlertLevel(b.expiry) !== "normal");
  }, [allBatches]);

  const handlingCounts = useMemo(() => {
    let handled = 0;
    let pending = 0;
    for (const batch of alertBatches) {
      const h = expiryAlertHandlings[batch.id];
      if (h?.isHandled) handled++;
      else pending++;
    }
    return { handled, pending };
  }, [alertBatches, expiryAlertHandlings]);

  const filteredBatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    let batches: BatchLedgerDTO[];

    if (selectedLevel === "all") {
      batches = allBatches;
    } else {
      batches = grouped[selectedLevel];
    }

    if (handlingFilter !== "all") {
      batches = batches.filter((b) => {
        const level = selectAlertLevel(b.expiry);
        if (level === "normal") return false;
        const h = expiryAlertHandlings[b.id];
        if (handlingFilter === "handled") return h?.isHandled ?? false;
        return !(h?.isHandled ?? false);
      });
    }

    if (!q) return batches;

    return batches.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      b.spec.toLowerCase().includes(q) ||
      b.batchNo.toLowerCase().includes(q)
    );
  }, [selectedLevel, handlingFilter, query, allBatches, grouped, expiryAlertHandlings]);

  const sortedBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => {
      const hA = expiryAlertHandlings[a.id]?.isHandled ? 1 : 0;
      const hB = expiryAlertHandlings[b.id]?.isHandled ? 1 : 0;
      if (hA !== hB) return hA - hB;
      const daysA = daysUntilExpiry(a.expiry);
      const daysB = daysUntilExpiry(b.expiry);
      return daysA - daysB;
    });
  }, [filteredBatches, expiryAlertHandlings]);

  const totalBatches = allBatches.length;
  const nearExpiryCount = counts.warning60 + counts.warning30 + counts.expired;

  const openMarkModal = (batch: BatchLedgerDTO) => {
    const level = selectAlertLevel(batch.expiry);
    if (level === "normal") return;
    setModalState({ open: true, batch, mode: "mark" });
  };

  const openUnmarkModal = (batch: BatchLedgerDTO) => {
    const level = selectAlertLevel(batch.expiry);
    if (level === "normal") return;
    setModalState({ open: true, batch, mode: "unmark" });
  };

  const closeModal = () => {
    setModalState({ open: false, batch: null, mode: "mark" });
  };

  const handleConfirm = async (params: { handledBy: string; remark: string }) => {
    if (!modalState.open || !modalState.batch) return;
    const { batch, mode } = modalState;
    const level = selectAlertLevel(batch.expiry);
    if (level === "normal") {
      closeModal();
      return;
    }
    if (mode === "mark") {
      await markExpiryAlertHandled({
        batchId: batch.id,
        handledBy: params.handledBy,
        remark: params.remark,
      });
    } else {
      await unmarkExpiryAlertHandled(batch.id);
    }
    closeModal();
  };

  return (
    <section className="expiry-alert module panel">
      <div className="section-heading">
        <div>
          <p>近效期预警</p>
          <h2>库存批次有效期预警中心</h2>
        </div>
        <div className="alert-summary">
          共 {totalBatches} 个批号 · 近效期 {nearExpiryCount} 个
          <span className="summary-divider">·</span>
          待处理 <strong className="pending-count">{handlingCounts.pending}</strong>
          <span className="summary-divider">·</span>
          已处理 <strong className="handled-count">{handlingCounts.handled}</strong>
        </div>
      </div>

      <div className="alert-metrics-grid">
        <AlertMetricCard
          label="全部批次"
          value={totalBatches}
          level="normal"
          active={selectedLevel === "all"}
          onClick={() => setSelectedLevel("all")}
        />
        {alertLevelOrder.map((level) => (
          <AlertMetricCard
            key={level}
            label={alertLevelLabels[level]}
            value={counts[level]}
            level={level}
            active={selectedLevel === level}
            onClick={() => setSelectedLevel(level)}
          />
        ))}
      </div>

      <div className="alert-toolbar">
        <input
          type="text"
          value={query}
          placeholder="搜索饮片名称 / 规格 / 批号"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="handling-filter-chips">
          {(Object.keys(handlingLabels) as HandlingFilter[]).map((key) => (
            <button
              key={key}
              className={handlingFilter === key ? "filter-active" : ""}
              onClick={() => setHandlingFilter(key)}
            >
              {handlingLabels[key]}
              {key !== "all" && (
                <span className="chip-count">
                  {key === "handled" ? handlingCounts.handled : handlingCounts.pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="alert-filter-chips">
          <button
            className={selectedLevel === "all" ? "filter-active" : ""}
            onClick={() => setSelectedLevel("all")}
          >
            全部
          </button>
          {alertLevelOrder.map((level) => (
            <button
              key={level}
              className={`${selectedLevel === level ? "filter-active" : ""} ${alertLevelColors[level]}`}
              onClick={() => setSelectedLevel(level)}
            >
              {alertLevelLabels[level]}
            </button>
          ))}
        </div>
      </div>

      {sortedBatches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⏰</div>
          <h3>暂无匹配批次</h3>
          <p>当前筛选条件下没有找到符合的批次</p>
          {(selectedLevel !== "all" || handlingFilter !== "all") && (
            <button
              className="clear-filter"
              onClick={() => {
                setSelectedLevel("all");
                setHandlingFilter("all");
              }}
            >
              查看全部批次
            </button>
          )}
        </div>
      ) : (
        <div className="alert-batch-list">
          {sortedBatches.map((batch) => {
            const daysLeft = daysUntilExpiry(batch.expiry);
            const level = selectAlertLevel(batch.expiry);
            const currentStock = selectCurrentStock(state, batch.id);
            const handling = expiryAlertHandlings[batch.id];
            return (
              <AlertBatchCard
                key={batch.id}
                batch={batch}
                currentStock={currentStock}
                daysLeft={daysLeft}
                level={level}
                handling={handling}
                onMarkHandled={() => openMarkModal(batch)}
                onUnmarkHandled={() => openUnmarkModal(batch)}
              />
            );
          })}
        </div>
      )}

      {modalState.open && modalState.batch && (
        <HandlingModal
          batch={modalState.batch}
          mode={modalState.mode}
          existingHandling={expiryAlertHandlings[modalState.batch.id]}
          onClose={closeModal}
          onConfirm={handleConfirm}
        />
      )}
    </section>
  );
}

export default ExpiryAlertModule;
