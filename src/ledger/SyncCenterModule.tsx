import { useCallback, useEffect, useMemo, useState } from "react";
import {
  selectPendingBatches,
  selectPendingOperations,
  selectPendingAuditLogs,
  selectConflictBatches,
  selectConflictOperations,
  selectConflictAuditLogs,
  selectSyncedBatches,
  selectSyncedOperations,
  selectSyncedAuditLogs,
  selectOperationsByBatchId,
  selectAuditLogsByBatchNo,
} from "./store";
import type { LedgerStore } from "./store";
import { AUDIT_LOG_LABELS, OPERATION_LABELS, type ConflictResolutionStrategy } from "./types";

interface SyncCenterModuleProps {
  ledgerStore: LedgerStore;
}

function SyncCenterModule({ ledgerStore }: SyncCenterModuleProps) {
  const { state: ledgerState } = ledgerStore;
  const inventoryStore = ledgerStore.inventoryStore;

  const [isSyncing, setIsSyncing] = useState(false);
  const [simulateConflict, setSimulateConflict] = useState(false);
  const [expandedConflictId, setExpandedConflictId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedConflictIds, setSelectedConflictIds] = useState<Set<string>>(new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);

  const pendingStats = useMemo(() => {
    const batches = selectPendingBatches(ledgerState).length;
    const operations = selectPendingOperations(ledgerState).length;
    const auditLogs = selectPendingAuditLogs(ledgerState).length;
    return { batches, operations, auditLogs };
  }, [ledgerState]);

  const conflictStats = useMemo(() => {
    const batches = selectConflictBatches(ledgerState).length;
    const operations = selectConflictOperations(ledgerState).length;
    const auditLogs = selectConflictAuditLogs(ledgerState).length;
    return { batches, operations, auditLogs };
  }, [ledgerState]);

  const syncedStats = useMemo(() => {
    const batches = selectSyncedBatches(ledgerState).length;
    const operations = selectSyncedOperations(ledgerState).length;
    const auditLogs = selectSyncedAuditLogs(ledgerState).length;
    return { batches, operations, auditLogs };
  }, [ledgerState]);

  const conflictBatches = useMemo(
    () => selectConflictBatches(ledgerState),
    [ledgerState]
  );

  useEffect(() => {
    let cancelled = false;
    inventoryStore.getSyncStats().then((stats) => {
      if (!cancelled) {
        setLastSyncedAt(stats.lastSyncedAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inventoryStore, ledgerState]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await inventoryStore.performSync({
        simulateConflict,
        conflictRatio: 0.35,
      });
      if (result.ok) {
        if (result.conflictCount > 0) {
          setSyncMessage(
            `同步完成：${result.syncedCount} 个批号成功同步，${result.conflictCount} 个批号存在冲突，请处理。`
          );
        } else {
          setSyncMessage(`同步完成：${result.syncedCount} 个批号成功同步。`);
        }
      } else {
        setSyncMessage("同步失败，请稍后重试。");
      }
    } finally {
      setIsSyncing(false);
      await inventoryStore.refreshAll();
    }
  }, [inventoryStore, simulateConflict]);

  const handleResolveConflict = useCallback(
    async (batchIds: string[], strategy: ConflictResolutionStrategy) => {
      if (batchIds.length === 0) return;
      setSyncMessage(null);
      const result = await inventoryStore.resolveConflict(batchIds, strategy);
      if (result.ok) {
        const strategyText = {
          local_overwrite: "本地覆盖",
          keep_server: "保留服务端",
          handle_later: "稍后处理",
        }[strategy];
        setSyncMessage(`已对 ${batchIds.length} 个冲突批号应用策略：${strategyText}`);
      } else {
        setSyncMessage(result.error || "冲突处理失败");
      }
      setSelectedConflictIds(new Set());
      await inventoryStore.refreshAll();
    },
    [inventoryStore]
  );

  const toggleConflictExpand = (batchId: string) => {
    setExpandedConflictId((prev) => (prev === batchId ? null : batchId));
  };

  const toggleSelectConflict = (batchId: string) => {
    setSelectedConflictIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedConflictIds.size === conflictBatches.length) {
      setSelectedConflictIds(new Set());
    } else {
      setSelectedConflictIds(new Set(conflictBatches.map((b) => b.id)));
    }
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", { hour12: false });
    } catch {
      return iso;
    }
  };

  const totalPending = pendingStats.batches + pendingStats.operations + pendingStats.auditLogs;
  const totalConflict = conflictStats.batches + conflictStats.operations + conflictStats.auditLogs;
  const totalSynced = syncedStats.batches + syncedStats.operations + syncedStats.auditLogs;

  return (
    <section className="sync-center module panel">
      <div className="section-heading">
        <div>
          <p>数据同步中心</p>
          <h2>管理本地与服务端的数据同步状态</h2>
        </div>
        <div className="sync-last-sync">
          <span>最近同步：{formatDateTime(lastSyncedAt)}</span>
        </div>
      </div>

      <div className="sync-stats-grid">
        <div className="sync-stat-card sync-pending-card">
          <div className="sync-stat-icon">⏳</div>
          <div className="sync-stat-content">
            <div className="sync-stat-label">待同步</div>
            <div className="sync-stat-value">{totalPending}</div>
            <div className="sync-stat-breakdown">
              <span>批号 {pendingStats.batches}</span>
              <span>流水 {pendingStats.operations}</span>
              <span>日志 {pendingStats.auditLogs}</span>
            </div>
          </div>
        </div>

        <div className="sync-stat-card sync-conflict-card">
          <div className="sync-stat-icon">⚠️</div>
          <div className="sync-stat-content">
            <div className="sync-stat-label">存在冲突</div>
            <div className="sync-stat-value">{totalConflict}</div>
            <div className="sync-stat-breakdown">
              <span>批号 {conflictStats.batches}</span>
              <span>流水 {conflictStats.operations}</span>
              <span>日志 {conflictStats.auditLogs}</span>
            </div>
          </div>
        </div>

        <div className="sync-stat-card sync-synced-card">
          <div className="sync-stat-icon">✓</div>
          <div className="sync-stat-content">
            <div className="sync-stat-label">已同步</div>
            <div className="sync-stat-value">{totalSynced}</div>
            <div className="sync-stat-breakdown">
              <span>批号 {syncedStats.batches}</span>
              <span>流水 {syncedStats.operations}</span>
              <span>日志 {syncedStats.auditLogs}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sync-actions-bar">
        <label className="sync-checkbox-label">
          <input
            type="checkbox"
            checked={simulateConflict}
            onChange={(e) => setSimulateConflict(e.target.checked)}
          />
          <span>模拟服务端冲突（随机约 35% 的待同步项）</span>
        </label>
        <div className="sync-action-buttons">
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={isSyncing || totalPending === 0}
          >
            {isSyncing ? "同步中..." : "立即同步"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className={`sync-message ${syncMessage.includes("失败") ? "sync-message-error" : "sync-message-info"}`}>
          {syncMessage}
        </div>
      )}

      {conflictBatches.length > 0 && (
        <div className="sync-conflict-section">
          <div className="sync-conflict-header">
            <h3>冲突批号列表（共 {conflictBatches.length} 个）</h3>
            <div className="sync-bulk-actions">
              <label className="sync-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedConflictIds.size === conflictBatches.length && conflictBatches.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>全选</span>
              </label>
              {selectedConflictIds.size > 0 && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      handleResolveConflict(
                        Array.from(selectedConflictIds),
                        "local_overwrite"
                      )
                    }
                  >
                    批量本地覆盖 ({selectedConflictIds.size})
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      handleResolveConflict(
                        Array.from(selectedConflictIds),
                        "keep_server"
                      )
                    }
                  >
                    批量保留服务端 ({selectedConflictIds.size})
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() =>
                      handleResolveConflict(
                        Array.from(selectedConflictIds),
                        "handle_later"
                      )
                    }
                  >
                    批量稍后处理 ({selectedConflictIds.size})
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="sync-conflict-list">
            {conflictBatches.map((batch) => {
              const isExpanded = expandedConflictId === batch.id;
              const isSelected = selectedConflictIds.has(batch.id);
              const batchOps = selectOperationsByBatchId(ledgerState, batch.id);
              const batchLogs = selectAuditLogsByBatchNo(ledgerState, batch.batchNo);

              return (
                <div
                  key={batch.id}
                  className={`sync-conflict-item ${isExpanded ? "expanded" : ""}`}
                >
                  <div className="sync-conflict-row">
                    <label className="sync-checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectConflict(batch.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </label>
                    <div
                      className="sync-conflict-summary"
                      onClick={() => toggleConflictExpand(batch.id)}
                    >
                      <div className="sync-conflict-batch-info">
                        <span className="sync-status sync-conflict">⚡ 冲突</span>
                        <span className="sync-conflict-batch-no">{batch.batchNo}</span>
                        <span className="sync-conflict-herb">{batch.name}</span>
                      </div>
                      <div className="sync-conflict-counts">
                        <span>{batchOps.length} 条流水</span>
                        <span>{batchLogs.length} 条日志</span>
                        <span className="sync-expand-toggle">
                          {isExpanded ? "收起 ▲" : "展开 ▼"}
                        </span>
                      </div>
                    </div>
                    <div
                      className="sync-conflict-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-sm"
                        onClick={() => handleResolveConflict([batch.id], "local_overwrite")}
                        title="保留本地数据并强制推送覆盖服务端"
                      >
                        本地覆盖
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleResolveConflict([batch.id], "keep_server")}
                        title="接受服务端版本，丢弃本地变更（不删除历史流水）"
                      >
                        保留服务端
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleResolveConflict([batch.id], "handle_later")}
                        title="将冲突改回待同步状态，稍后再处理"
                      >
                        稍后处理
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="sync-conflict-detail">
                      <div className="sync-conflict-meta">
                        <div><strong>本地更新时间：</strong>{formatDateTime(batch.updatedAt)}</div>
                        <div><strong>服务端ID：</strong>{batch.serverId || "尚未分配"}</div>
                        <div><strong>规格：</strong>{batch.spec}</div>
                        <div><strong>产地：</strong>{batch.origin}</div>
                      </div>

                      {batchOps.length > 0 && (
                        <div className="sync-conflict-subsection">
                          <h4>出入库流水（{batchOps.length} 条）</h4>
                          <table className="sync-detail-table">
                            <thead>
                              <tr>
                                <th>时间</th>
                                <th>类型</th>
                                <th>数量(g)</th>
                                <th>操作人</th>
                                <th>备注</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchOps.map((op) => (
                                <tr key={op.id}>
                                  <td>{formatDateTime(op.createdAt)}</td>
                                  <td>
                                    <span className={`op-type op-${op.type}`}>
                                      {OPERATION_LABELS[op.type] || op.type}
                                    </span>
                                  </td>
                                  <td>{op.quantity.toLocaleString()}</td>
                                  <td>{op.operator || "—"}</td>
                                  <td>{op.remark || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {batchLogs.length > 0 && (
                        <div className="sync-conflict-subsection">
                          <h4>审计日志（{batchLogs.length} 条）</h4>
                          <table className="sync-detail-table">
                            <thead>
                              <tr>
                                <th>时间</th>
                                <th>操作类型</th>
                                <th>操作人</th>
                                <th>变更克数</th>
                                <th>备注</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchLogs.map((log) => (
                                <tr key={log.id}>
                                  <td>{formatDateTime(log.createdAt)}</td>
                                  <td>{AUDIT_LOG_LABELS[log.logType] || log.logType}</td>
                                  <td>{log.operator || "—"}</td>
                                  <td>{log.changeGrams.toLocaleString()}</td>
                                  <td>{log.remark || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="sync-conflict-note">
                        <strong>说明：</strong>
                        选择「本地覆盖」将保留当前 IndexedDB 中的流水和日志数据并标记为已同步；
                        选择「保留服务端」将标记为已同步（模拟接受服务端版本，本地流水数据不会被删除）；
                        选择「稍后处理」将冲突状态改回待同步，下次同步时再处理。
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {conflictBatches.length === 0 && totalConflict === 0 && totalPending === 0 && (
        <div className="sync-empty">
          <div className="sync-empty-icon">🎉</div>
          <div className="sync-empty-text">所有数据已成功同步，暂无待处理项。</div>
        </div>
      )}
    </section>
  );
}

export default SyncCenterModule;
