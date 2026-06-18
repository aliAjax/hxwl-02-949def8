import { useCallback, useRef, useState } from "react";
import type {
  ExportData,
  ImportPreview,
  ImportValidationResult,
  ImportError,
} from "./db/inventoryService";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: ExportData) => Promise<{ ok: true } | { ok: false; error: string }>;
  validateImportFile: (raw: unknown) => ImportValidationResult;
  checkBatchNoConflicts: (batches: unknown[]) => Promise<string[]>;
}

type Step = "idle" | "preview" | "conflict_check" | "importing" | "done" | "error";

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function ImportModal({
  open,
  onClose,
  onImport,
  validateImportFile,
  checkBatchNoConflicts,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [parsedData, setParsedData] = useState<ExportData | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [validationErrors, setValidationErrors] = useState<ImportError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [conflictBatchNos, setConflictBatchNos] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [fileName, setFileName] = useState("");

  const reset = useCallback(() => {
    setStep("idle");
    setParsedData(null);
    setPreview(null);
    setValidationErrors([]);
    setWarnings([]);
    setConflictBatchNos([]);
    setImportError("");
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);

      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          setValidationErrors([
            {
              type: "format",
              message: "文件内容不是有效的 JSON 格式，请检查文件是否损坏",
            },
          ]);
          setStep("error");
          return;
        }

        const result = validateImportFile(parsed);

        if (!result.ok) {
          setValidationErrors(result.errors);
          setStep("error");
          return;
        }

        setParsedData(parsed as ExportData);
        setPreview(result.preview);
        setWarnings(result.warnings ?? []);
        setStep("preview");

        setStep("conflict_check");
        const conflicts = await checkBatchNoConflicts(
          (parsed as ExportData).batches
        );
        setConflictBatchNos(conflicts);
        setStep("preview");
      } catch {
        setValidationErrors([
          { type: "format", message: "读取文件失败，请重试" },
        ]);
        setStep("error");
      }
    },
    [validateImportFile, checkBatchNoConflicts]
  );

  const handleConfirmImport = useCallback(async () => {
    if (!parsedData) return;
    setStep("importing");
    const result = await onImport(parsedData);
    if (result.ok) {
      setStep("done");
    } else {
      setImportError(result.error);
      setStep("error");
    }
  }, [parsedData, onImport]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal-header">
          <h3>导入库存数据</h3>
          <button className="modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="import-modal-body">
          {step === "idle" && (
            <div className="import-step-idle">
              <p className="import-hint">
                选择此前从本系统导出的 IndexedDB 库存 JSON 快照文件。导入前会先预校验，确认后才会写入本地数据库。
              </p>
              <div className="import-file-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="import-file-input"
                />
                <button
                  className="primary-action"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📂 选择 JSON 文件
                </button>
              </div>
              {fileName && (
                <p className="import-file-name">已选择：{fileName}</p>
              )}
            </div>
          )}

          {step === "preview" && preview && (
            <div className="import-step-preview">
              <div className="import-preview-card">
                <h4>数据预览</h4>
                <div className="import-preview-grid">
                  <div className="import-preview-item">
                    <span className="preview-label">批号数量</span>
                    <strong>{preview.batchCount}</strong>
                  </div>
                  <div className="import-preview-item">
                    <span className="preview-label">流水数量</span>
                    <strong>{preview.operationCount}</strong>
                  </div>
                  <div className="import-preview-item">
                    <span className="preview-label">安全库存规则</span>
                    <strong>{preview.safetyStockRuleCount}</strong>
                  </div>
                  <div className="import-preview-item">
                    <span className="preview-label">角色偏好</span>
                    <strong>{preview.rolePreferenceCount}</strong>
                  </div>
                  <div className="import-preview-item">
                    <span className="preview-label">饮片数量</span>
                    <strong>{preview.herbCount}</strong>
                  </div>
                  <div className="import-preview-item">
                    <span className="preview-label">审计日志</span>
                    <strong>{preview.auditLogCount}</strong>
                  </div>
                  {preview.expiryAlertHandlingCount > 0 && (
                    <div className="import-preview-item">
                      <span className="preview-label">效期处理记录</span>
                      <strong>{preview.expiryAlertHandlingCount}</strong>
                    </div>
                  )}
                </div>
                {preview.exportedAt && (
                  <p className="import-export-time">
                    数据导出时间：{formatDateTime(preview.exportedAt)}
                  </p>
                )}
                <p className="import-schema-version">
                  数据版本：v{preview.schemaVersion}
                </p>
              </div>

              {conflictBatchNos.length > 0 && (
                <div className="import-warning-card import-conflict-warning">
                  <h4>⚠️ 批号冲突警告</h4>
                  <p>
                    以下批号在当前数据库中已存在，导入后将<strong>覆盖</strong>原有数据：
                  </p>
                  <div className="import-conflict-list">
                    {conflictBatchNos.slice(0, 10).map((no) => (
                      <span key={no} className="conflict-chip">
                        {no}
                      </span>
                    ))}
                    {conflictBatchNos.length > 10 && (
                      <span className="conflict-more">
                        …等共 {conflictBatchNos.length} 个
                      </span>
                    )}
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="import-warning-card">
                  <h4>⚠️ 注意事项</h4>
                  <ul>
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="import-danger-hint">
                <strong>⚠️ 重要提示：</strong>导入操作将<strong>替换</strong>当前本地数据库中的所有数据（包括所有批号、流水、规则和偏好），此操作不可撤销。建议先导出当前数据作为备份。
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="import-step-importing">
              <div className="loading-spinner" />
              <p>正在写入本地数据库...</p>
            </div>
          )}

          {step === "done" && (
            <div className="import-step-done">
              <div className="import-done-icon">✅</div>
              <h4>导入成功</h4>
              <p>数据已成功写入本地数据库，页面数据将自动刷新。</p>
            </div>
          )}

          {step === "error" && (
            <div className="import-step-error">
              <div className="import-error-icon">❌</div>
              {validationErrors.length > 0 ? (
                <>
                  <h4>预校验失败</h4>
                  <div className="import-error-list">
                    {validationErrors.map((err, i) => (
                      <div key={i} className="import-error-item">
                        <span className={`error-type-badge error-type-${err.type}`}>
                          {err.type === "version"
                            ? "版本不兼容"
                            : err.type === "batchNo_conflict"
                              ? "批号冲突"
                              : err.type === "field_missing"
                                ? "字段缺失"
                                : err.type === "format"
                                  ? "格式错误"
                                  : "数据为空"}
                        </span>
                        <span>{err.message}</span>
                        {err.details && err.details.length > 0 && (
                          <div className="error-details">
                            {err.details.map((d, j) => (
                              <span key={j} className="error-detail-chip">
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : importError ? (
                <>
                  <h4>导入失败</h4>
                  <p>{importError}</p>
                </>
              ) : (
                <>
                  <h4>发生错误</h4>
                  <p>未知错误，请重试。</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {step === "preview" && (
            <>
              <button className="clear-filter" onClick={reset}>
                重新选择
              </button>
              <button className="primary-action danger-btn" onClick={handleConfirmImport}>
                确认导入（替换当前数据）
              </button>
            </>
          )}
          {step === "done" && (
            <button className="primary-action" onClick={handleClose}>
              完成
            </button>
          )}
          {(step === "error" || step === "idle") && (
            <button className="clear-filter" onClick={handleClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportModal;
