import { useMemo, useState } from "react";
import {
  CATEGORIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type PriorityLevel,
  type ProcurementSuggestionItem,
} from "./types";
import {
  exportProcurementListCsv,
  selectCategoryProcurementSummary,
  selectProcurementSuggestionsFiltered,
  type LedgerStore,
  type SafetyStockStore,
} from "./store";

interface ProcurementSuggestionModuleProps {
  ledgerStore: LedgerStore;
  safetyStockStore: SafetyStockStore;
}

function priorityBadgeClass(priority: PriorityLevel): string {
  switch (priority) {
    case "urgent":
      return "priority-urgent";
    case "high":
      return "priority-high";
    case "medium":
      return "priority-medium";
    case "low":
      return "priority-low";
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ProcurementSuggestionModule({
  ledgerStore,
  safetyStockStore,
}: ProcurementSuggestionModuleProps) {
  const { state: ledgerState } = ledgerStore;
  const { state: safetyStockState } = safetyStockStore;

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel | "all">("all");
  const [onlyNeedPurchase, setOnlyNeedPurchase] = useState(true);
  const [viewMode, setViewMode] = useState<"detail" | "category">("detail");
  const [expandedHerb, setExpandedHerb] = useState<string | null>(null);

  const filteredList = useMemo(
    () =>
      selectProcurementSuggestionsFiltered(ledgerState, safetyStockState, {
        category: selectedCategory,
        priority: selectedPriority,
        query,
        onlyNeedPurchase,
      }),
    [ledgerState, safetyStockState, selectedCategory, selectedPriority, query, onlyNeedPurchase]
  );

  const allSuggestions = useMemo(
    () =>
      selectProcurementSuggestionsFiltered(ledgerState, safetyStockState, {
        onlyNeedPurchase: true,
      }),
    [ledgerState, safetyStockState]
  );

  const categorySummaries = useMemo(
    () => selectCategoryProcurementSummary(allSuggestions),
    [allSuggestions]
  );

  const totalMetrics = useMemo(() => {
    let totalSuggestedQty = 0;
    let urgent = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const item of allSuggestions) {
      totalSuggestedQty += item.suggestedPurchaseQty;
      if (item.priority === "urgent") urgent += 1;
      else if (item.priority === "high") high += 1;
      else if (item.priority === "medium") medium += 1;
      else if (item.priority === "low") low += 1;
    }
    return { totalSuggestedQty, urgent, high, medium, low, totalHerbs: allSuggestions.length };
  }, [allSuggestions]);

  const toggleExpand = (name: string) => {
    setExpandedHerb((prev) => (prev === name ? null : name));
  };

  const handleExport = () => {
    const csv = exportProcurementListCsv(allSuggestions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `采购补货建议清单_${formatLocalDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const priorityFilterCounts = useMemo(() => {
    const counts: Record<PriorityLevel | "all", number> = {
      all: allSuggestions.length,
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const item of allSuggestions) {
      counts[item.priority] = (counts[item.priority] ?? 0) + 1;
    }
    return counts;
  }, [allSuggestions]);

  return (
    <section className="procurement module panel">
      <div className="section-heading">
        <div>
          <p>采购补货建议</p>
          <h2>综合库存、效期与出库流水的智能补货</h2>
        </div>
        <div className="procurement-header-actions">
          <span className="procurement-summary-total">
            建议采购 {totalMetrics.totalHerbs} 种饮片 · 合计 {totalMetrics.totalSuggestedQty.toLocaleString()} g
          </span>
          <button className="primary-action" onClick={handleExport}>
            📤 导出补货清单
          </button>
        </div>
      </div>

      <div className="procurement-metrics">
        <div className="procurement-metric">
          <span>需采购品种</span>
          <strong className="procurement-metric-main">{totalMetrics.totalHerbs}</strong>
          <i>种</i>
        </div>
        <div className="procurement-metric">
          <span>紧急补货</span>
          <strong className="procurement-metric-urgent">{totalMetrics.urgent}</strong>
          <i>种</i>
        </div>
        <div className="procurement-metric">
          <span>高优先级</span>
          <strong className="procurement-metric-high">{totalMetrics.high}</strong>
          <i>种</i>
        </div>
        <div className="procurement-metric">
          <span>采购总量</span>
          <strong className="procurement-metric-total">
            {totalMetrics.totalSuggestedQty.toLocaleString()}
          </strong>
          <i>g</i>
        </div>
      </div>

      <div className="procurement-toolbar">
        <div className="procurement-toolbar-left">
          <input
            type="text"
            value={query}
            placeholder="搜索饮片名称"
            onChange={(e) => setQuery(e.target.value)}
            className="procurement-search"
          />
          <label className="procurement-checkbox">
            <input
              type="checkbox"
              checked={onlyNeedPurchase}
              onChange={(e) => setOnlyNeedPurchase(e.target.checked)}
            />
            <span>仅显示需采购</span>
          </label>
        </div>

        <div className="procurement-view-toggle">
          <button
            className={viewMode === "detail" ? "toggle-active" : ""}
            onClick={() => setViewMode("detail")}
          >
            饮片明细
          </button>
          <button
            className={viewMode === "category" ? "toggle-active" : ""}
            onClick={() => setViewMode("category")}
          >
            分类汇总
          </button>
        </div>
      </div>

      <div className="procurement-filter-chips">
        <div className="filter-chips-group">
          <span className="filter-chips-label">功效分类：</span>
          <button
            className={selectedCategory === "all" ? "filter-active" : ""}
            onClick={() => setSelectedCategory("all")}
          >
            全部 ({categorySummaries.reduce((s, c) => s + c.herbCount, 0)})
          </button>
          {CATEGORIES.map((cat) => {
            const summary = categorySummaries.find((s) => s.category === cat);
            return (
              <button
                key={cat}
                className={selectedCategory === cat ? "filter-active" : ""}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat} ({summary?.herbCount ?? 0})
              </button>
            );
          })}
        </div>
        <div className="filter-chips-group">
          <span className="filter-chips-label">优先级：</span>
          <button
            className={selectedPriority === "all" ? "filter-active" : ""}
            onClick={() => setSelectedPriority("all")}
          >
            全部 ({priorityFilterCounts.all})
          </button>
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              className={`${selectedPriority === p ? "filter-active" : ""} priority-filter-${p}`}
              onClick={() => setSelectedPriority(p)}
            >
              {PRIORITY_LABELS[p]} ({priorityFilterCounts[p]})
            </button>
          ))}
        </div>
      </div>

      {viewMode === "category" ? (
        categorySummaries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <h3>库存充足，无需采购</h3>
            <p>当前所有饮片均在安全线以上</p>
          </div>
        ) : (
          <div className="category-summary-grid">
            {categorySummaries
              .filter((s) => selectedCategory === "all" || s.category === selectedCategory)
              .map((summary) => (
                <article key={summary.category} className="category-summary-card">
                  <header className="category-summary-head">
                    <h3>{summary.category}类</h3>
                    <span className="category-summary-count">{summary.herbCount} 种饮片</span>
                  </header>
                  <div className="category-summary-qty">
                    <span>建议采购总量</span>
                    <strong>{summary.totalSuggestedQty.toLocaleString()} g</strong>
                  </div>
                  <div className="category-summary-priorities">
                    {summary.urgentCount > 0 && (
                      <span className="priority-chip priority-urgent">
                        紧急 {summary.urgentCount}
                      </span>
                    )}
                    {summary.highCount > 0 && (
                      <span className="priority-chip priority-high">
                        高 {summary.highCount}
                      </span>
                    )}
                    {summary.mediumCount > 0 && (
                      <span className="priority-chip priority-medium">
                        中 {summary.mediumCount}
                      </span>
                    )}
                    {summary.lowCount > 0 && (
                      <span className="priority-chip priority-low">
                        低 {summary.lowCount}
                      </span>
                    )}
                  </div>
                  <div className="category-summary-list">
                    {filteredList
                      .filter((i) => i.category === summary.category)
                      .map((item) => (
                        <div
                          key={item.name}
                          className={`category-summary-item ${expandedHerb === item.name ? "expanded" : ""}`}
                          onClick={() => toggleExpand(item.name)}
                        >
                          <div className="category-summary-item-head">
                            <span className={`priority-badge-mini ${priorityBadgeClass(item.priority)}`}>
                              {PRIORITY_LABELS[item.priority]}
                            </span>
                            <strong>{item.name}</strong>
                            <span className="item-expand-arrow">
                              {expandedHerb === item.name ? "▲" : "▼"}
                            </span>
                          </div>
                          <div className="category-summary-item-qty">
                            建议采购 <b>{item.suggestedPurchaseQty.toLocaleString()} g</b>
                          </div>
                          {expandedHerb === item.name && (
                            <SuggestionDetailCard item={item} />
                          )}
                        </div>
                      ))}
                  </div>
                </article>
              ))}
          </div>
        )
      ) : filteredList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>库存充足</h3>
          <p>
            {allSuggestions.length === 0
              ? "恭喜！所有饮片库存均在安全线以上，暂无需采购"
              : "当前筛选条件下没有符合的补货建议"}
          </p>
          {(selectedCategory !== "all" || selectedPriority !== "all" || query) && (
            <button
              className="clear-filter"
              onClick={() => {
                setSelectedCategory("all");
                setSelectedPriority("all");
                setQuery("");
              }}
            >
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <div className="procurement-list">
          {filteredList.map((item) => (
            <ProcurementCard
              key={item.name}
              item={item}
              expanded={expandedHerb === item.name}
              onToggle={() => toggleExpand(item.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProcurementCard({
  item,
  expanded,
  onToggle,
}: {
  item: ProcurementSuggestionItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progressPercentage = Math.min(
    100,
    Math.max(
      0,
      item.thresholdGrams > 0
        ? (item.safeAvailableStock / item.thresholdGrams) * 100
        : 0
    )
  );

  return (
    <article className={`procurement-card ${expanded ? "expanded" : ""}`}>
      <header className="procurement-card-head" onClick={onToggle}>
        <div className="procurement-card-title">
          <span className={`priority-badge ${priorityBadgeClass(item.priority)}`}>
            {PRIORITY_LABELS[item.priority]}
          </span>
          <h3>{item.name}</h3>
          <span className="procurement-category-tag">{item.category}类</span>
        </div>
        <div className="procurement-card-suggestion">
          <div className="suggestion-qty-label">建议采购</div>
          <div className="suggestion-qty-value">
            {item.suggestedPurchaseQty.toLocaleString()} <i>{item.unit}</i>
          </div>
          <span className="expand-arrow">{expanded ? "▲" : "▼"}</span>
        </div>
      </header>

      <div className="procurement-progress">
        <div className="procurement-progress-bar">
          <div
            className={`procurement-progress-fill ${
              progressPercentage < 30
                ? "critical"
                : progressPercentage < 60
                  ? "warning"
                  : "normal"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="procurement-progress-labels">
          <span>安全可用 {item.safeAvailableStock.toLocaleString()}g</span>
          <span className="threshold-label">安全线 {item.thresholdGrams.toLocaleString()}g</span>
        </div>
      </div>

      <div className="procurement-info-grid">
        <div className="procurement-info-item">
          <span>总库存</span>
          <strong>{item.totalStock.toLocaleString()} {item.unit}</strong>
        </div>
        <div className="procurement-info-item">
          <span>近效期排除</span>
          <strong className="near-expiry-warn">
            {item.nearExpiryStock.toLocaleString()} {item.unit}
          </strong>
        </div>
        <div className="procurement-info-item">
          <span>安全可用</span>
          <strong className="safe-stock">
            {item.safeAvailableStock.toLocaleString()} {item.unit}
          </strong>
        </div>
        <div className="procurement-info-item">
          <span>日均消耗</span>
          <strong>{item.avgDailyConsumption.toLocaleString()} {item.unit}/天</strong>
        </div>
        <div className="procurement-info-item">
          <span>预计可用</span>
          <strong
            className={
              item.stockDaysLeft <= 7
                ? "days-critical"
                : item.stockDaysLeft <= 14
                  ? "days-warn"
                  : ""
            }
          >
            {item.stockDaysLeft === Infinity ? "充足" : `${item.stockDaysLeft} 天`}
          </strong>
        </div>
        <div className="procurement-info-item">
          <span>涉及批号</span>
          <strong>{item.batchCount} 个</strong>
        </div>
      </div>

      {expanded && <SuggestionDetailCard item={item} />}
    </article>
  );
}

function SuggestionDetailCard({ item }: { item: ProcurementSuggestionItem }) {
  return (
    <div className="procurement-detail">
      {item.nearExpiryBatches.length > 0 && (
        <div className="procurement-detail-section">
          <div className="procurement-detail-title">
            <span className="near-expiry-icon">⚠️</span>
            近效期批次（未计入可用库存）
          </div>
          <div className="near-expiry-batch-list">
            {item.nearExpiryBatches.map((b) => (
              <div key={b.batchId} className="near-expiry-batch-item">
                <span className="batch-no">{b.batchNo}</span>
                <span className="near-expiry-days">
                  剩余 <b>{b.daysLeft}</b> 天
                </span>
                <span className="near-expiry-qty">
                  库存 {b.stock.toLocaleString()} {item.unit}
                </span>
                <span className="near-expiry-date">有效期 {b.expiry}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="procurement-detail-section">
        <div className="procurement-detail-title">补货计算依据</div>
        <div className="calculation-breakdown">
          <div className="calc-row">
            <span>① 安全库存阈值</span>
            <b>{item.thresholdGrams.toLocaleString()} {item.unit}</b>
          </div>
          <div className="calc-row">
            <span>② 按 {item.consumptionDays} 天出库流水估算日均消耗</span>
            <b>{item.avgDailyConsumption.toLocaleString()} {item.unit}/天</b>
          </div>
          <div className="calc-row">
            <span>③ 覆盖 45 天预计需求</span>
            <b>{(item.avgDailyConsumption * 45).toLocaleString()} {item.unit}</b>
          </div>
          <div className="calc-row">
            <span>④ 取较大值作为目标库存</span>
            <b>
              {Math.max(item.thresholdGrams, item.avgDailyConsumption * 45).toLocaleString()}{" "}
              {item.unit}
            </b>
          </div>
          <div className="calc-row calc-subtract">
            <span>⑤ 扣除安全可用库存</span>
            <b>-{item.safeAvailableStock.toLocaleString()} {item.unit}</b>
          </div>
          <div className="calc-row calc-final">
            <span>⑥ 建议采购量（向上取整至 100g）</span>
            <b>{item.suggestedPurchaseQty.toLocaleString()} {item.unit}</b>
          </div>
        </div>
      </div>

      <div className="procurement-detail-section">
        <div className="procurement-detail-title">优先级评分明细</div>
        <div className="priority-score-list">
          <PriorityScoreBar
            label={`优先级综合评分`}
            score={item.priorityScore}
            max={110}
            highlight
          />
          <div className="score-details-hint">
            评分维度：库存缺口程度(50) + 预计可用天数紧迫性(40) + 近效期占比(20)
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityScoreBar({
  label,
  score,
  max,
  highlight,
}: {
  label: string;
  score: number;
  max: number;
  highlight?: boolean;
}) {
  const percent = Math.min(100, (score / max) * 100);
  const colorClass =
    score >= 60 ? "score-urgent" : score >= 35 ? "score-high" : score >= 15 ? "score-medium" : "score-low";

  return (
    <div className={`priority-score-bar ${highlight ? "score-highlight" : ""}`}>
      <div className="score-bar-label">
        <span>{label}</span>
        <b>{score.toFixed(1)} / {max}</b>
      </div>
      <div className="score-bar-track">
        <div className={`score-bar-fill ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default ProcurementSuggestionModule;
