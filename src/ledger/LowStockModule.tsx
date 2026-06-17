import { useMemo, useState } from "react";
import { CATEGORIES } from "./types";
import {
  selectCurrentStock,
  selectLowStockHerbList,
  exportLowStockListCsv,
  type LowStockHerbItem,
} from "./store";
import type { LedgerStore, SafetyStockStore } from "./store";

interface LowStockModuleProps {
  ledgerStore: LedgerStore;
  safetyStockStore: SafetyStockStore;
}

function LowStockModule({ ledgerStore, safetyStockStore }: LowStockModuleProps) {
  const { state: ledgerState } = ledgerStore;
  const { state: safetyStockState } = safetyStockStore;

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedHerb, setExpandedHerb] = useState<string | null>(null);

  const lowStockList = useMemo(
    () => selectLowStockHerbList(ledgerState, safetyStockState),
    [ledgerState, safetyStockState]
  );

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lowStockList.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [lowStockList, query, selectedCategory]);

  const totalShortage = useMemo(
    () => lowStockList.reduce((sum, item) => sum + item.shortageGrams, 0),
    [lowStockList]
  );

  const toggleExpand = (name: string) => {
    setExpandedHerb((prev) => (prev === name ? null : name));
  };

  const handleExport = () => {
    const csv = exportLowStockListCsv(filteredList);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    link.download = `低库存清单_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stockPercentage = (item: LowStockHerbItem): number => {
    if (item.thresholdGrams === 0) return 0;
    return Math.max(0, Math.min(100, (item.totalStock / item.thresholdGrams) * 100));
  };

  return (
    <section className="low-stock module panel">
      <div className="section-heading">
        <div>
          <p>低库存清单</p>
          <h2>低于安全库存的饮片汇总</h2>
        </div>
        <div className="low-stock-summary">
          <span>共 {lowStockList.length} 种饮片低库存</span>
          <span className="low-stock-shortage">
            总缺口 {totalShortage.toLocaleString()} g
          </span>
        </div>
      </div>

      <div className="low-stock-metrics">
        <div className="low-stock-metric">
          <span>低库存品种</span>
          <strong className="low-stock-metric-danger">{lowStockList.length}</strong>
          <i>种</i>
        </div>
        <div className="low-stock-metric">
          <span>涉及批号</span>
          <strong>
            {lowStockList.reduce((sum, item) => sum + item.batchCount, 0)}
          </strong>
          <i>个</i>
        </div>
        <div className="low-stock-metric">
          <span>库存总缺口</span>
          <strong className="low-stock-metric-warn">
            {totalShortage.toLocaleString()}
          </strong>
          <i>g</i>
        </div>
      </div>

      <div className="low-stock-toolbar">
        <input
          type="text"
          value={query}
          placeholder="搜索饮片名称"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="low-stock-filter-chips">
          <button
            className={selectedCategory === "all" ? "filter-active" : ""}
            onClick={() => setSelectedCategory("all")}
          >
            全部分类
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={selectedCategory === cat ? "filter-active" : ""}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          className="primary-action export-btn"
          onClick={handleExport}
          disabled={filteredList.length === 0}
        >
          导出CSV
        </button>
      </div>

      {filteredList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>库存充足</h3>
          <p>
            {lowStockList.length === 0
              ? "恭喜！所有饮片库存均在安全线以上"
              : "当前筛选条件下没有低库存饮片"}
          </p>
          {selectedCategory !== "all" && (
            <button
              className="clear-filter"
              onClick={() => setSelectedCategory("all")}
            >
              查看全部分类
            </button>
          )}
        </div>
      ) : (
        <div className="low-stock-list">
          {filteredList.map((item) => (
            <article
              key={item.name}
              className={`low-stock-card ${expandedHerb === item.name ? "expanded" : ""}`}
            >
              <header
                className="low-stock-card-head"
                onClick={() => toggleExpand(item.name)}
              >
                <div className="low-stock-card-title">
                  <h4>{item.name}</h4>
                  <span className="low-stock-category">{item.category}类</span>
                </div>
                <div className="low-stock-card-stock">
                  <div className="low-stock-current">
                    <span>当前库存</span>
                    <strong>
                      {item.totalStock.toLocaleString()} <i>{item.unit}</i>
                    </strong>
                  </div>
                  <div className="low-stock-arrow">
                    {expandedHerb === item.name ? "▲" : "▼"}
                  </div>
                </div>
              </header>

              <div className="low-stock-progress">
                <div className="low-stock-progress-bar">
                  <div
                    className={`low-stock-progress-fill ${
                      stockPercentage(item) < 30
                        ? "critical"
                        : stockPercentage(item) < 60
                          ? "warning"
                          : "normal"
                    }`}
                    style={{ width: `${stockPercentage(item)}%` }}
                  />
                </div>
                <div className="low-stock-progress-labels">
                  <span>0</span>
                  <span className="low-stock-threshold-label">
                    安全线 {item.thresholdGrams.toLocaleString()}g
                  </span>
                  <span>{item.thresholdGrams.toLocaleString()}</span>
                </div>
              </div>

              <div className="low-stock-info-row">
                <div className="low-stock-info-item">
                  <span>安全库存</span>
                  <strong>{item.thresholdGrams.toLocaleString()} g</strong>
                </div>
                <div className="low-stock-info-item">
                  <span>库存缺口</span>
                  <strong className="shortage">
                    -{item.shortageGrams.toLocaleString()} g
                  </strong>
                </div>
                <div className="low-stock-info-item">
                  <span>涉及批号</span>
                  <strong>{item.batchCount} 个</strong>
                </div>
              </div>

              {expandedHerb === item.name && (
                <div className="low-stock-batches">
                  <div className="low-stock-batches-title">批号明细</div>
                  <div className="low-stock-batch-list">
                    {item.batches.map((batch) => {
                      const stock = selectCurrentStock(ledgerState, batch.id);
                      return (
                        <div key={batch.id} className="low-stock-batch-item">
                          <div className="low-stock-batch-info">
                            <span className="batch-no">{batch.batchNo}</span>
                            <span className="batch-spec">{batch.spec}</span>
                          </div>
                          <div className="low-stock-batch-stock">
                            <strong>
                              {stock.toLocaleString()} <i>{item.unit}</i>
                            </strong>
                            <span className="batch-origin">产地 {batch.origin}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default LowStockModule;
