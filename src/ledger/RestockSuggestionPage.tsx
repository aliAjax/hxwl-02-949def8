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
  selectProcurementSuggestionsFiltered,
  type LedgerStore,
  type SafetyStockStore,
} from "./store";

interface RestockSuggestionPageProps {
  ledgerStore: LedgerStore;
  safetyStockStore: SafetyStockStore;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function stockDaysClass(days: number): string {
  if (days === Infinity) return "";
  if (days <= 7) return "days-critical";
  if (days <= 14) return "days-warn";
  return "";
}

function RestockSuggestionPage({
  ledgerStore,
  safetyStockStore,
}: RestockSuggestionPageProps) {
  const { state: ledgerState } = ledgerStore;
  const { state: safetyStockState } = safetyStockStore;

  const [herbNameFilter, setHerbNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | "all">("all");
  const [onlyNeedPurchase, setOnlyNeedPurchase] = useState(true);

  const filteredList = useMemo(
    () =>
      selectProcurementSuggestionsFiltered(ledgerState, safetyStockState, {
        category: categoryFilter,
        priority: priorityFilter,
        query: herbNameFilter,
        onlyNeedPurchase,
      }),
    [ledgerState, safetyStockState, categoryFilter, priorityFilter, herbNameFilter, onlyNeedPurchase]
  );

  const allSuggestions = useMemo(
    () =>
      selectProcurementSuggestionsFiltered(ledgerState, safetyStockState, {
        onlyNeedPurchase: true,
      }),
    [ledgerState, safetyStockState]
  );

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allSuggestions.length };
    for (const item of allSuggestions) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [allSuggestions]);

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

  const handleExport = () => {
    const csv = exportProcurementListCsv(filteredList);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `补货建议_${formatLocalDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setHerbNameFilter("");
    setCategoryFilter("all");
    setPriorityFilter("all");
    setOnlyNeedPurchase(true);
  };

  const hasActiveFilters =
    herbNameFilter !== "" ||
    categoryFilter !== "all" ||
    priorityFilter !== "all" ||
    onlyNeedPurchase !== true;

  return (
    <section className="restock-suggestion module panel">
      <div className="section-heading">
        <div>
          <p>补货建议</p>
          <h2>基于库存、效期与消耗的智能采购建议</h2>
        </div>
        <div className="restock-header-actions">
          <span className="restock-summary-total">
            建议采购 {totalMetrics.totalHerbs} 种饮片 · 合计 {totalMetrics.totalSuggestedQty.toLocaleString()} g
          </span>
          <button
            className="primary-action"
            onClick={handleExport}
            disabled={filteredList.length === 0}
          >
            📤 导出当前筛选结果
          </button>
        </div>
      </div>

      <div className="restock-metrics">
        <div className="restock-metric">
          <span>需采购品种</span>
          <strong className="restock-metric-main">{totalMetrics.totalHerbs}</strong>
          <i>种</i>
        </div>
        <div className="restock-metric">
          <span>紧急补货</span>
          <strong className="restock-metric-urgent">{totalMetrics.urgent}</strong>
          <i>种</i>
        </div>
        <div className="restock-metric">
          <span>高优先级</span>
          <strong className="restock-metric-high">{totalMetrics.high}</strong>
          <i>种</i>
        </div>
        <div className="restock-metric">
          <span>采购总量</span>
          <strong className="restock-metric-total">
            {totalMetrics.totalSuggestedQty.toLocaleString()}
          </strong>
          <i>g</i>
        </div>
      </div>

      <div className="restock-toolbar">
        <div className="restock-toolbar-left">
          <input
            type="text"
            value={herbNameFilter}
            placeholder="搜索饮片名称"
            onChange={(e) => setHerbNameFilter(e.target.value)}
            className="restock-search"
          />
          <label className="restock-checkbox">
            <input
              type="checkbox"
              checked={onlyNeedPurchase}
              onChange={(e) => setOnlyNeedPurchase(e.target.checked)}
            />
            <span>仅显示需采购</span>
          </label>
        </div>
        <div className="restock-toolbar-right">
          {hasActiveFilters && (
            <button className="clear-filter" onClick={clearFilters}>
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="restock-filter-chips">
        <div className="filter-chips-group">
          <span className="filter-chips-label">功效分类：</span>
          <button
            className={categoryFilter === "all" ? "filter-active" : ""}
            onClick={() => setCategoryFilter("all")}
          >
            全部 ({categoryCounts.all ?? 0})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={categoryFilter === cat ? "filter-active" : ""}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat} ({categoryCounts[cat] ?? 0})
            </button>
          ))}
        </div>
        <div className="filter-chips-group">
          <span className="filter-chips-label">优先级：</span>
          <button
            className={priorityFilter === "all" ? "filter-active" : ""}
            onClick={() => setPriorityFilter("all")}
          >
            全部 ({priorityFilterCounts.all})
          </button>
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              className={`${priorityFilter === p ? "filter-active" : ""} priority-filter-${p}`}
              onClick={() => setPriorityFilter(p)}
            >
              {PRIORITY_LABELS[p]} ({priorityFilterCounts[p]})
            </button>
          ))}
        </div>
      </div>

      {filteredList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>库存充足，无需采购</h3>
          <p>
            {allSuggestions.length === 0
              ? "当前所有饮片均在安全线以上，暂无需采购"
              : "当前筛选条件下没有符合的补货建议"}
          </p>
          {hasActiveFilters && (
            <button className="clear-filter" onClick={clearFilters}>
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="restock-table-wrapper">
            <table className="restock-table">
              <thead>
                <tr>
                  <th className="col-priority">优先级</th>
                  <th className="col-herb">饮片名称</th>
                  <th className="col-category">分类</th>
                  <th className="col-number">建议采购量</th>
                  <th className="col-number">安全可用库存</th>
                  <th className="col-number">近效期库存</th>
                  <th className="col-number">预计可用天数</th>
                  <th className="col-number">涉及批号</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item) => (
                  <RestockTableRow key={item.name} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="restock-table-footer">
            <span>共 {filteredList.length} 条记录</span>
            <span className="restock-footer-total">
              当前筛选采购总量：
              <strong>
                {filteredList.reduce((sum, item) => sum + item.suggestedPurchaseQty, 0).toLocaleString()} g
              </strong>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function RestockTableRow({ item }: { item: ProcurementSuggestionItem }) {
  return (
    <tr className="restock-table-row">
      <td className="col-priority">
        <span className={`priority-badge ${priorityBadgeClass(item.priority)}`}>
          {PRIORITY_LABELS[item.priority]}
        </span>
      </td>
      <td className="col-herb">
        <div className="herb-name-cell">
          <strong>{item.name}</strong>
          <span className="herb-spec">{item.spec} · {item.origin}</span>
        </div>
      </td>
      <td className="col-category">
        <span className="category-tag">{item.category}类</span>
      </td>
      <td className="col-number">
        <strong className="suggested-qty">
          {item.suggestedPurchaseQty.toLocaleString()} <i>{item.unit}</i>
        </strong>
      </td>
      <td className="col-number">
        <span className={item.safeAvailableStock < item.thresholdGrams ? "stock-low" : ""}>
          {item.safeAvailableStock.toLocaleString()} <i>{item.unit}</i>
        </span>
      </td>
      <td className="col-number">
        <span className="near-expiry-warn">
          {item.nearExpiryStock.toLocaleString()} <i>{item.unit}</i>
        </span>
      </td>
      <td className="col-number">
        <strong className={stockDaysClass(item.stockDaysLeft)}>
          {item.stockDaysLeft === Infinity ? "充足" : `${item.stockDaysLeft} 天`}
        </strong>
      </td>
      <td className="col-number">
        <span>{item.batchCount} 个</span>
      </td>
    </tr>
  );
}

export default RestockSuggestionPage;
