import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  NEAR_EXPIRY_DAYS,
  OPERATION_LABELS,
  OPERATION_SIGNS,
  OperationType,
} from "./types";
import {
  countBatchesByAlertLevel,
  daysUntilExpiry,
  exportState,
  selectAllBatches,
  selectAllOperations,
  selectBatchesByAlertLevel,
  selectCurrentStock,
  selectExpiryStatus,
  selectLowStockHerbList,
  selectTotalStockByName,
  type LowStockHerbItem,
} from "./store";
import type { LedgerStore, SafetyStockStore } from "./store";
import type { RolePreferenceRecord } from "./db/repositories";

type RoleType = "pharmacist" | "warehouse" | "manager";

const ROLE_CONFIG: Record<RoleType, { label: string; icon: string; description: string }> = {
  pharmacist: { label: "药师", icon: "💊", description: "重点关注近效期预警和饮片详情" },
  warehouse: { label: "库管", icon: "📦", description: "重点处理入库出库和低库存补货" },
  manager: { label: "门店负责人", icon: "📊", description: "重点查看经营指标和分类占比" },
};

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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCsvCell(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

interface RoleWorkspaceModuleProps {
  ledgerStore: LedgerStore;
  safetyStockStore: SafetyStockStore;
}

function RoleWorkspaceModule({ ledgerStore, safetyStockStore }: RoleWorkspaceModuleProps) {
  const { state: ledgerState, recordOperation, inventoryStore } = ledgerStore;
  const { state: safetyStockState } = safetyStockStore;
  const {
    updateRolePreference,
    selectRolePreference,
    selectCurrentRoleOrDefault,
    addRecentSearch,
    rolePreferences,
  } = inventoryStore;

  const [currentRole, setCurrentRoleState] = useState<RoleType>(
    selectCurrentRoleOrDefault()
  );
  const [roleInitializing, setRoleInitializing] = useState(true);

  useEffect(() => {
    const defaultRole = selectCurrentRoleOrDefault();
    setCurrentRoleState(defaultRole);
    setRoleInitializing(false);
  }, [selectCurrentRoleOrDefault]);

  const setCurrentRole = useCallback(
    (role: RoleType) => {
      setCurrentRoleState(role);
      void (async () => {
        const existing = selectRolePreference(role);
        await updateRolePreference({
          role,
          displayName: existing?.displayName || ROLE_CONFIG[role].label,
          defaultTab: true,
        });
        const allRoles: RolePreferenceRecord["role"][] = [
          "pharmacist",
          "warehouse",
          "manager",
        ];
        for (const r of allRoles) {
          if (r !== role) {
            const other = selectRolePreference(r);
            if (other?.defaultTab) {
              await updateRolePreference({ role: r, defaultTab: false });
            }
          }
        }
      })();
    },
    [updateRolePreference, selectRolePreference]
  );

  const allBatches = useMemo(() => selectAllBatches(ledgerState), [ledgerState]);
  const allOperations = useMemo(() => selectAllOperations(ledgerState), [ledgerState]);
  const alertCounts = useMemo(() => countBatchesByAlertLevel(ledgerState), [ledgerState]);
  const alertGrouped = useMemo(() => selectBatchesByAlertLevel(ledgerState), [ledgerState]);
  const lowStockList = useMemo(
    () => selectLowStockHerbList(ledgerState, safetyStockState),
    [ledgerState, safetyStockState]
  );
  const totalStockByName = useMemo(
    () => selectTotalStockByName(ledgerState),
    [ledgerState]
  );

  const nearExpiryCount = alertCounts.warning60 + alertCounts.warning30 + alertCounts.expired;

  const weeklyOutbound = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return allOperations
      .filter((op) => op.type === "outbound" && new Date(op.createdAt) >= weekAgo)
      .reduce((sum, op) => sum + op.quantity, 0);
  }, [allOperations]);

  const weeklyInbound = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return allOperations
      .filter((op) => op.type === "inbound" && new Date(op.createdAt) >= weekAgo)
      .reduce((sum, op) => sum + op.quantity, 0);
  }, [allOperations]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; stock: number; value: number }> = {};
    for (const cat of CATEGORIES) {
      stats[cat] = { count: 0, stock: 0, value: 0 };
    }
    for (const batch of allBatches) {
      if (stats[batch.category]) {
        stats[batch.category].count += 1;
        stats[batch.category].stock += selectCurrentStock(ledgerState, batch.id);
      }
    }
    const totalStock = Object.values(stats).reduce((sum, s) => sum + s.stock, 0);
    for (const cat of CATEGORIES) {
      stats[cat].value = totalStock > 0 ? (stats[cat].stock / totalStock) * 100 : 0;
    }
    return stats;
  }, [allBatches, ledgerState]);

  const handleQuickOutbound = (batchId: string) => {
    const batch = ledgerState.batches[batchId];
    if (!batch) return;
    const result = recordOperation({
      batchId,
      type: "outbound",
      quantity: 100,
      operator: ROLE_CONFIG[currentRole].label,
      remark: "快捷出库",
    });
    if (!result.ok) {
      alert(result.error);
    }
  };

  const handleQuickInbound = (batchId: string) => {
    const result = recordOperation({
      batchId,
      type: "inbound",
      quantity: 500,
      operator: ROLE_CONFIG[currentRole].label,
      remark: "快捷入库",
    });
    if (!result.ok) {
      alert(result.error);
    }
  };

  const handleQuickLoss = (batchId: string) => {
    const result = recordOperation({
      batchId,
      type: "loss",
      quantity: 50,
      operator: ROLE_CONFIG[currentRole].label,
      remark: "快捷损耗登记",
    });
    if (!result.ok) {
      alert(result.error);
    }
  };

  const handleExportSummary = () => {
    const headers = [
      "饮片名称",
      "炮制规格",
      "产地",
      "功效分类",
      "批号",
      "当前库存",
      "单位",
      "有效期",
      "有效期状态",
      "操作人",
      "导出时间",
    ];
    const now = formatLocalDate(new Date());
    const rows = allBatches.map((b) => {
      const stock = selectCurrentStock(ledgerState, b.id);
      const expiryStatus = selectExpiryStatus(b.expiry);
      const statusText = expiryStatus === "expired" ? "已过期" : expiryStatus === "near" ? "近效期" : "正常";
      return [
        b.name,
        b.spec,
        b.origin,
        b.category,
        b.batchNo,
        String(stock),
        b.unit,
        b.expiry,
        statusText,
        ROLE_CONFIG[currentRole].label,
        now,
      ];
    });
    const csvContent =
      "\uFEFF" +
      [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ROLE_CONFIG[currentRole].label}工作台摘要_${now}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportState = () => {
    const json = exportState(ledgerState);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `库存数据_${formatLocalDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="role-workspace module panel">
      <div className="section-heading">
        <div>
          <p>角色化工作台</p>
          <h2>
            当前角色：{ROLE_CONFIG[currentRole].icon} {ROLE_CONFIG[currentRole].label}
          </h2>
          <p className="role-description">{ROLE_CONFIG[currentRole].description}</p>
        </div>
        {currentRole === "manager" && (
          <div className="role-export-actions">
            <button className="primary-action" onClick={handleExportSummary}>
              导出摘要
            </button>
            <button className="secondary-action" onClick={handleExportState}>
              导出完整数据
            </button>
          </div>
        )}
      </div>

      <div className="role-switcher">
        {(Object.keys(ROLE_CONFIG) as RoleType[]).map((role) => (
          <button
            key={role}
            className={`role-tab ${currentRole === role ? "role-tab-active" : ""}`}
            onClick={() => setCurrentRole(role)}
          >
            <span className="role-icon">{ROLE_CONFIG[role].icon}</span>
            <span className="role-label">{ROLE_CONFIG[role].label}</span>
          </button>
        ))}
      </div>

      {currentRole === "pharmacist" && (
        <PharmacistView
          ledgerState={ledgerState}
          allBatches={allBatches}
          alertGrouped={alertGrouped}
          nearExpiryCount={nearExpiryCount}
          onQuickOutbound={handleQuickOutbound}
          currentRole={currentRole}
          addRecentSearch={addRecentSearch}
          rolePreference={selectRolePreference(currentRole)}
        />
      )}

      {currentRole === "warehouse" && (
        <WarehouseView
          ledgerState={ledgerState}
          lowStockList={lowStockList}
          allOperations={allOperations}
          weeklyInbound={weeklyInbound}
          weeklyOutbound={weeklyOutbound}
          onQuickInbound={handleQuickInbound}
          onQuickOutbound={handleQuickOutbound}
          onQuickLoss={handleQuickLoss}
        />
      )}

      {currentRole === "manager" && (
        <ManagerView
          ledgerState={ledgerState}
          allBatches={allBatches}
          totalStockByName={totalStockByName}
          categoryStats={categoryStats}
          alertCounts={alertCounts}
          nearExpiryCount={nearExpiryCount}
          lowStockCount={lowStockList.length}
          weeklyInbound={weeklyInbound}
          weeklyOutbound={weeklyOutbound}
          onExportSummary={handleExportSummary}
        />
      )}
    </section>
  );
}

interface PharmacistViewProps {
  ledgerState: LedgerStore["state"];
  allBatches: ReturnType<typeof selectAllBatches>;
  alertGrouped: ReturnType<typeof selectBatchesByAlertLevel>;
  nearExpiryCount: number;
  onQuickOutbound: (batchId: string) => void;
  currentRole: RoleType;
  addRecentSearch: (
    role: RolePreferenceRecord["role"],
    search: string,
    maxItems?: number
  ) => Promise<any>;
  rolePreference?: RolePreferenceRecord;
}

function PharmacistView({
  ledgerState,
  allBatches,
  alertGrouped,
  nearExpiryCount,
  onQuickOutbound,
  currentRole,
  addRecentSearch,
  rolePreference,
}: PharmacistViewProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [herbQuery, setHerbQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setHerbQuery(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      const trimmed = value.trim();
      if (!trimmed) return;
      debounceTimerRef.current = setTimeout(() => {
        void addRecentSearch(currentRole, trimmed, 10);
      }, 800);
    },
    [addRecentSearch, currentRole]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const nearExpiryBatches = useMemo(() => {
    return [...alertGrouped.expired, ...alertGrouped.warning30, ...alertGrouped.warning60].sort((a, b) => {
      const daysA = daysUntilExpiry(a.expiry);
      const daysB = daysUntilExpiry(b.expiry);
      return daysA - daysB;
    });
  }, [alertGrouped]);

  const filteredHerbs = useMemo(() => {
    const q = herbQuery.trim().toLowerCase();
    if (!q) return nearExpiryBatches;
    return nearExpiryBatches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.spec.toLowerCase().includes(q) ||
        b.batchNo.toLowerCase().includes(q)
    );
  }, [nearExpiryBatches, herbQuery]);

  const selectedBatch = selectedBatchId ? ledgerState.batches[selectedBatchId] : null;
  const selectedBatchStock = selectedBatch ? selectCurrentStock(ledgerState, selectedBatchId!) : 0;

  const expiryBadgeText = (expiry: string) => {
    const status = selectExpiryStatus(expiry);
    const days = daysUntilExpiry(expiry);
    if (status === "expired") return { text: `已过期 ${Math.abs(days)} 天`, className: "expiry-expired" };
    if (status === "near") return { text: `近效期 剩 ${days} 天`, className: "expiry-near" };
    return { text: `剩余 ${days} 天`, className: "expiry-ok" };
  };

  return (
    <div className="role-view pharmacist-view">
      <div className="pharmacist-metrics">
        <div className="role-metric-card role-metric-danger">
          <span>近效期批次</span>
          <strong>{nearExpiryCount}</strong>
          <i>个</i>
        </div>
        <div className="role-metric-card role-metric-warning">
          <span>已过期批次</span>
          <strong>{alertGrouped.expired.length}</strong>
          <i>个</i>
        </div>
        <div className="role-metric-card">
          <span>30天内到期</span>
          <strong>{alertGrouped.warning30.length}</strong>
          <i>个</i>
        </div>
        <div className="role-metric-card role-metric-success">
          <span>正常批次</span>
          <strong>{alertGrouped.normal.length}</strong>
          <i>个</i>
        </div>
      </div>

      <div className="role-workspace-grid">
        <div className="role-panel role-panel-narrow">
          <div className="role-panel-heading">
            <h3>近效期优先</h3>
            <span className="role-panel-count">{nearExpiryBatches.length} 个</span>
          </div>
          <div className="role-search">
            <input
              type="text"
              placeholder="搜索饮片名称/规格/批号"
              value={herbQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          {rolePreference?.recentSearches &&
            rolePreference.recentSearches.length > 0 && (
              <div className="recent-searches">
                <span className="recent-label">最近搜索：</span>
                {rolePreference.recentSearches.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    className="recent-chip"
                    onClick={() => handleSearchChange(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          <div className="role-batch-list">
            {nearExpiryBatches.length === 0 ? (
              <div className="role-empty">
                <div className="role-empty-icon">✅</div>
                <p>暂无近效期批次</p>
              </div>
            ) : (
              filteredHerbs.map((batch) => {
                const badge = expiryBadgeText(batch.expiry);
                const stock = selectCurrentStock(ledgerState, batch.id);
                return (
                  <div
                    key={batch.id}
                    className={`role-batch-item ${selectedBatchId === batch.id ? "selected" : ""}`}
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <div className="role-batch-head">
                      <span className="batch-no">{batch.batchNo}</span>
                      <span className={`expiry-badge ${badge.className}`}>{badge.text}</span>
                    </div>
                    <div className="role-batch-name">{batch.name} · {batch.spec}</div>
                    <div className="role-batch-stock">
                      库存 <strong>{stock}</strong> {batch.unit}
                    </div>
                    <div className="role-batch-actions">
                      <button
                        className="role-action-btn role-action-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickOutbound(batch.id);
                        }}
                      >
                        配方出库
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="role-panel">
          <div className="role-panel-heading">
            <h3>饮片详情</h3>
            {selectedBatch && (
              <span className="role-panel-subtitle">{selectedBatch.name}</span>
            )}
          </div>
          {selectedBatch ? (
            <div className="herb-detail">
              <div className="herb-detail-header">
                <div>
                  <span className="batch-no">{selectedBatch.batchNo}</span>
                  <h4>{selectedBatch.name} · {selectedBatch.spec}</h4>
                </div>
                <span className={`expiry-badge ${expiryBadgeText(selectedBatch.expiry).className}`}>
                  {expiryBadgeText(selectedBatch.expiry).text}
                </span>
              </div>
              <div className="herb-detail-meta">
                <div className="meta-item">
                  <span>产地</span>
                  <strong>{selectedBatch.origin}</strong>
                </div>
                <div className="meta-item">
                  <span>分类</span>
                  <strong>{selectedBatch.category}</strong>
                </div>
                <div className="meta-item">
                  <span>单位</span>
                  <strong>{selectedBatch.unit}</strong>
                </div>
                <div className="meta-item">
                  <span>有效期</span>
                  <strong>{selectedBatch.expiry}</strong>
                </div>
              </div>
              <div className="herb-detail-stock">
                <div className="stock-display-large">
                  <span>当前库存</span>
                  <strong>{selectedBatchStock} <i>{selectedBatch.unit}</i></strong>
                </div>
                <div className="herb-detail-actions">
                  <button
                    className="primary-action"
                    onClick={() => onQuickOutbound(selectedBatch.id)}
                  >
                    配方出库 -100g
                  </button>
                </div>
              </div>
              <div className="herb-detail-operations">
                <h5>最近操作记录</h5>
                <div className="op-list">
                  {ledgerState.operations
                    .filter((op) => op.batchId === selectedBatch.id && !op.isDeleted)
                    .slice(0, 8)
                    .map((op) => (
                      <div key={op.id} className={`op-item op-${op.type}`}>
                        <span className="op-type">{OPERATION_LABELS[op.type]}</span>
                        <span className="op-qty">
                          {OPERATION_SIGNS[op.type]}{op.quantity} {selectedBatch.unit}
                        </span>
                        <span className="op-balance">结存 {op.balanceAfter} {selectedBatch.unit}</span>
                        <span className="op-time">{formatDateTime(op.createdAt)}</span>
                        <span className="op-operator">
                          {op.operator}
                          {op.remark ? ` · ${op.remark}` : ""}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="role-empty">
              <div className="role-empty-icon">🔍</div>
              <h4>选择一个饮片查看详情</h4>
              <p>点击左侧列表中的饮片卡片查看详细信息</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface WarehouseViewProps {
  ledgerState: LedgerStore["state"];
  lowStockList: LowStockHerbItem[];
  allOperations: ReturnType<typeof selectAllOperations>;
  weeklyInbound: number;
  weeklyOutbound: number;
  onQuickInbound: (batchId: string) => void;
  onQuickOutbound: (batchId: string) => void;
  onQuickLoss: (batchId: string) => void;
}

function WarehouseView({
  ledgerState,
  lowStockList,
  allOperations,
  weeklyInbound,
  weeklyOutbound,
  onQuickInbound,
  onQuickOutbound,
  onQuickLoss,
}: WarehouseViewProps) {
  const [opType, setOpType] = useState<OperationType>("inbound");

  const recentOperations = useMemo(() => {
    return allOperations
      .filter((op) => !op.isDeleted)
      .slice(0, 15);
  }, [allOperations]);

  const totalShortage = useMemo(
    () => lowStockList.reduce((sum, item) => sum + item.shortageGrams, 0),
    [lowStockList]
  );

  return (
    <div className="role-view warehouse-view">
      <div className="warehouse-metrics">
        <div className="role-metric-card role-metric-success">
          <span>本周入库</span>
          <strong>{weeklyInbound.toLocaleString()}</strong>
          <i>g</i>
        </div>
        <div className="role-metric-card role-metric-warning">
          <span>本周出库</span>
          <strong>{weeklyOutbound.toLocaleString()}</strong>
          <i>g</i>
        </div>
        <div className="role-metric-card role-metric-danger">
          <span>低库存品种</span>
          <strong>{lowStockList.length}</strong>
          <i>种</i>
        </div>
        <div className="role-metric-card">
          <span>库存总缺口</span>
          <strong>{totalShortage.toLocaleString()}</strong>
          <i>g</i>
        </div>
      </div>

      <div className="role-workspace-grid">
        <div className="role-panel role-panel-narrow">
          <div className="role-panel-heading">
            <h3>低库存补货</h3>
            <span className="role-panel-count">{lowStockList.length} 种</span>
          </div>
          <div className="warehouse-op-toggle">
            <button
              className={opType === "inbound" ? "op-toggle-active" : ""}
              onClick={() => setOpType("inbound")}
            >
              入库
            </button>
            <button
              className={opType === "outbound" ? "op-toggle-active" : ""}
              onClick={() => setOpType("outbound")}
            >
              出库
            </button>
            <button
              className={opType === "loss" ? "op-toggle-active" : ""}
              onClick={() => setOpType("loss")}
            >
              损耗
            </button>
          </div>
          <div className="role-lowstock-list">
            {lowStockList.length === 0 ? (
              <div className="role-empty">
                <div className="role-empty-icon">✅</div>
                <p>库存充足，无需补货</p>
              </div>
            ) : (
              lowStockList.map((item) => (
                <div key={item.name} className="lowstock-herb-card">
                  <div className="lowstock-herb-head">
                    <h4>{item.name}</h4>
                    <span className="lowstock-category">{item.category}类</span>
                  </div>
                  <div className="lowstock-herb-stock">
                    <div className="stock-mini">
                      <span>当前</span>
                      <strong>{item.totalStock}</strong>
                      <i>{item.unit}</i>
                    </div>
                    <div className="stock-mini stock-threshold">
                      <span>安全线</span>
                      <strong>{item.thresholdGrams}</strong>
                      <i>g</i>
                    </div>
                    <div className="stock-mini stock-shortage">
                      <span>缺口</span>
                      <strong>-{item.shortageGrams}</strong>
                      <i>g</i>
                    </div>
                  </div>
                  <div className="lowstock-herb-batches">
                    {item.batches.map((batch) => {
                      const stock = selectCurrentStock(ledgerState, batch.id);
                      return (
                        <div key={batch.id} className="lowstock-batch-row">
                          <div>
                            <span className="batch-no">{batch.batchNo}</span>
                            <span className="batch-spec">{batch.spec}</span>
                            <span className="batch-stock-small">{stock}{item.unit}</span>
                          </div>
                          {opType === "inbound" ? (
                            <button
                              className="role-action-btn role-action-success"
                              onClick={() => onQuickInbound(batch.id)}
                            >
                              +500g 入库
                            </button>
                          ) : opType === "outbound" ? (
                            <button
                              className="role-action-btn role-action-primary"
                              onClick={() => onQuickOutbound(batch.id)}
                            >
                              -100g 出库
                            </button>
                          ) : (
                            <button
                              className="role-action-btn role-action-danger"
                              onClick={() => onQuickLoss(batch.id)}
                            >
                              -50g 损耗
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="role-panel">
          <div className="role-panel-heading">
            <h3>出入库流水</h3>
            <span className="role-panel-count">最近 15 条</span>
          </div>
          <div className="warehouse-operations">
            {recentOperations.length === 0 ? (
              <div className="role-empty">
                <div className="role-empty-icon">📋</div>
                <p>暂无操作记录</p>
              </div>
            ) : (
              <div className="op-list op-list-large">
                {recentOperations.map((op) => {
                  const batch = ledgerState.batches[op.batchId];
                  if (!batch || op.isDeleted) return null;
                  return (
                    <div key={op.id} className={`op-item op-${op.type}`}>
                      <span className="op-type">{OPERATION_LABELS[op.type]}</span>
                      <span className="op-batch-info">
                        <span className="batch-no">{batch.batchNo}</span>
                        <span className="op-herb-name">{batch.name}</span>
                      </span>
                      <span className="op-qty">
                        {OPERATION_SIGNS[op.type]}{op.quantity} {batch.unit}
                      </span>
                      <span className="op-balance">结存 {op.balanceAfter} {batch.unit}</span>
                      <span className="op-time">{formatDateTime(op.createdAt)}</span>
                      <span className="op-operator">
                        {op.operator}
                        {op.remark ? ` · ${op.remark}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManagerViewProps {
  ledgerState: LedgerStore["state"];
  allBatches: ReturnType<typeof selectAllBatches>;
  totalStockByName: ReturnType<typeof selectTotalStockByName>;
  categoryStats: Record<string, { count: number; stock: number; value: number }>;
  alertCounts: ReturnType<typeof countBatchesByAlertLevel>;
  nearExpiryCount: number;
  lowStockCount: number;
  weeklyInbound: number;
  weeklyOutbound: number;
  onExportSummary: () => void;
}

function ManagerView({
  ledgerState,
  allBatches,
  totalStockByName,
  categoryStats,
  alertCounts,
  nearExpiryCount,
  lowStockCount,
  weeklyInbound,
  weeklyOutbound,
  onExportSummary,
}: ManagerViewProps) {
  const [sortBy, setSortBy] = useState<"stock" | "batchCount" | "name">("stock");

  const totalStockValue = useMemo(
    () => allBatches.reduce((sum, b) => sum + selectCurrentStock(ledgerState, b.id), 0),
    [allBatches, ledgerState]
  );

  const sortedHerbs = useMemo(() => {
    return [...totalStockByName].sort((a, b) => {
      if (sortBy === "stock") return b.totalStock - a.totalStock;
      if (sortBy === "batchCount") return b.batchCount - a.batchCount;
      return a.name.localeCompare(b.name);
    });
  }, [totalStockByName, sortBy]);

  const topCategory = useMemo(() => {
    let max = { name: "", value: 0 };
    for (const cat of CATEGORIES) {
      if (categoryStats[cat].value > max.value) {
        max = { name: cat, value: categoryStats[cat].value };
      }
    }
    return max;
  }, [categoryStats]);

  const turnoverRate = weeklyOutbound > 0 && totalStockValue > 0
    ? ((weeklyOutbound / totalStockValue) * 100).toFixed(1)
    : "0";

  return (
    <div className="role-view manager-view">
      <div className="manager-metrics">
        <div className="role-metric-card role-metric-success">
          <span>总库存</span>
          <strong>{totalStockValue.toLocaleString()}</strong>
          <i>g</i>
        </div>
        <div className="role-metric-card role-metric-warning">
          <span>周周转率</span>
          <strong>{turnoverRate}</strong>
          <i>%</i>
        </div>
        <div className="role-metric-card role-metric-danger">
          <span>近效期批次</span>
          <strong>{nearExpiryCount}</strong>
          <i>个</i>
        </div>
        <div className="role-metric-card">
          <span>低库存品种</span>
          <strong>{lowStockCount}</strong>
          <i>种</i>
        </div>
        <div className="role-metric-card role-metric-success">
          <span>本周入库</span>
          <strong>{weeklyInbound.toLocaleString()}</strong>
          <i>g</i>
        </div>
        <div className="role-metric-card role-metric-warning">
          <span>本周出库</span>
          <strong>{weeklyOutbound.toLocaleString()}</strong>
          <i>g</i>
        </div>
      </div>

      <div className="role-workspace-grid">
        <div className="role-panel role-panel-narrow">
          <div className="role-panel-heading">
            <h3>分类占比</h3>
            <span className="role-panel-subtitle">主力品类：{topCategory.name}</span>
          </div>
          <div className="category-chart">
            {CATEGORIES.map((cat) => {
              const stat = categoryStats[cat];
              return (
                <div key={cat} className="category-bar-row">
                  <div className="category-bar-label">
                    <span>{cat}</span>
                    <span className="category-bar-value">{stat.value.toFixed(1)}%</span>
                  </div>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${stat.value}%` }}
                    />
                  </div>
                  <div className="category-bar-meta">
                    <span>{stat.count} 个批号</span>
                    <span>{stat.stock.toLocaleString()} g</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="manager-summary">
            <h4>健康度摘要</h4>
            <div className="summary-item">
              <span className="summary-label">库存健康度</span>
              <span className={`summary-value ${
                nearExpiryCount === 0 && lowStockCount === 0
                  ? "summary-good"
                  : nearExpiryCount < 3 && lowStockCount < 3
                    ? "summary-warn"
                    : "summary-danger"
              }`}>
                {nearExpiryCount === 0 && lowStockCount === 0
                  ? "优秀"
                  : nearExpiryCount < 3 && lowStockCount < 3
                    ? "良好"
                    : "需关注"}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">过期风险</span>
              <span className={`summary-value ${
                alertCounts.expired === 0 ? "summary-good" : "summary-danger"
              }`}>
                {alertCounts.expired === 0 ? "无" : `${alertCounts.expired} 个已过期`}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">60天内到期</span>
              <span className="summary-value summary-warn">
                {alertCounts.warning60 + alertCounts.warning30} 个
              </span>
            </div>
            <button className="primary-action manager-export-btn" onClick={onExportSummary}>
              导出经营摘要
            </button>
          </div>
        </div>

        <div className="role-panel">
          <div className="role-panel-heading">
            <h3>饮片库存排行</h3>
            <div className="sort-controls">
              <span>排序：</span>
              <button
                className={sortBy === "stock" ? "sort-active" : ""}
                onClick={() => setSortBy("stock")}
              >
                按库存
              </button>
              <button
                className={sortBy === "batchCount" ? "sort-active" : ""}
                onClick={() => setSortBy("batchCount")}
              >
                按批号数
              </button>
              <button
                className={sortBy === "name" ? "sort-active" : ""}
                onClick={() => setSortBy("name")}
              >
                按名称
              </button>
            </div>
          </div>
          <div className="herb-ranking-list">
            {sortedHerbs.map((item, index) => (
              <div key={item.name} className="herb-ranking-item">
                <div className="ranking-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="ranking-info">
                  <h4>{item.name}</h4>
                  <span>{item.batchCount} 个批号</span>
                </div>
                <div className="ranking-stock">
                  <strong>{item.totalStock.toLocaleString()}</strong>
                  <i>{item.unit}</i>
                </div>
                <div className="ranking-bar">
                  <div
                    className="ranking-bar-fill"
                    style={{
                      width: `${sortedHerbs[0] ? (item.totalStock / sortedHerbs[0].totalStock) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoleWorkspaceModule;
