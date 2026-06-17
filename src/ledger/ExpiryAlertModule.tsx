import { useMemo, useState } from "react";
import {
  AlertLevel,
  BatchLedgerDTO,
  WARNING_EXPIRY_DAYS_30,
  NEAR_EXPIRY_DAYS,
} from "./types";
import {
  countBatchesByAlertLevel,
  createSeedState,
  daysUntilExpiry,
  selectAlertLevel,
  selectAllBatches,
  selectBatchesByAlertLevel,
  selectCurrentStock,
  useLedgerStore,
} from "./store";

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

interface AlertBatchCardProps {
  batch: BatchLedgerDTO;
  currentStock: number;
  daysLeft: number;
  level: AlertLevel;
}

function AlertBatchCard({ batch, currentStock, daysLeft, level }: AlertBatchCardProps) {
  const badgeText = level === "expired"
    ? `已过期 ${Math.abs(daysLeft)} 天`
    : `剩余 ${daysLeft} 天`;

  return (
    <article className={`alert-batch-card ${alertLevelColors[level]}`}>
      <div className="alert-batch-card-head">
        <div className="alert-batch-card-title">
          <span className="batch-no">{batch.batchNo}</span>
          <h4>{batch.name} · {batch.spec}</h4>
        </div>
        <span className={`alert-badge ${alertLevelColors[level]}`}>
          {alertLevelLabels[level]}
        </span>
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
              : `${Math.max(0, Math.min(100, (1 - daysLeft / NEAR_EXPIRY_DAYS) * 100))}%`,
          }}
        />
      </div>

      <div className="alert-badge-text">
        {badgeText}
      </div>
    </article>
  );
}

function ExpiryAlertModule() {
  const { state } = useLedgerStore(createSeedState);
  const [selectedLevel, setSelectedLevel] = useState<AlertLevel | "all">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => countBatchesByAlertLevel(state), [state]);
  const grouped = useMemo(() => selectBatchesByAlertLevel(state), [state]);
  const allBatches = useMemo(() => selectAllBatches(state), [state]);

  const filteredBatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    let batches: BatchLedgerDTO[];

    if (selectedLevel === "all") {
      batches = allBatches;
    } else {
      batches = grouped[selectedLevel];
    }

    if (!q) return batches;

    return batches.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      b.spec.toLowerCase().includes(q) ||
      b.batchNo.toLowerCase().includes(q)
    );
  }, [selectedLevel, query, allBatches, grouped]);

  const sortedBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => {
      const daysA = daysUntilExpiry(a.expiry);
      const daysB = daysUntilExpiry(b.expiry);
      return daysA - daysB;
    });
  }, [filteredBatches]);

  const totalBatches = allBatches.length;
  const nearExpiryCount = counts.warning60 + counts.warning30 + counts.expired;

  return (
    <section className="expiry-alert module panel">
      <div className="section-heading">
        <div>
          <p>近效期预警</p>
          <h2>库存批次有效期预警中心</h2>
        </div>
        <div className="alert-summary">
          共 {totalBatches} 个批号 · 近效期 {nearExpiryCount} 个
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
          {selectedLevel !== "all" && (
            <button className="clear-filter" onClick={() => setSelectedLevel("all")}>
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
            return (
              <AlertBatchCard
                key={batch.id}
                batch={batch}
                currentStock={currentStock}
                daysLeft={daysLeft}
                level={level}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ExpiryAlertModule;
