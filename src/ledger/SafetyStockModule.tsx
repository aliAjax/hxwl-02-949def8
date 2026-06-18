import { useEffect, useMemo, useState } from "react";
import {
  AUDIT_LOG_LABELS,
  CATEGORIES,
  DEFAULT_CONSUMPTION_DAYS,
  DEFAULT_PURCHASE_COVER_DAYS,
  LOW_STOCK_GRAMS,
  NewSafetyStockRuleInput,
  SafetyStockCalcMode,
  SafetyStockRuleDTO,
  SafetyStockRulePreviewResult,
  SafetyStockRuleType,
} from "./types";
import {
  buildTemporarySafetyStockState,
  calculateDynamicSafetyStock,
  checkSafetyStockRuleNameExists,
  previewRuleChange,
  resolveRuleThreshold,
  selectAllSafetyStockRules,
  selectTotalStockByName,
  selectOutboundOperationsForHerb,
} from "./store";
import type {
  LedgerStore,
  SafetyStockStore,
} from "./store";

interface RuleFormState {
  name: string;
  ruleType: SafetyStockRuleType;
  target: string;
  calcMode: SafetyStockCalcMode;
  thresholdGrams: string;
  consumptionDays: string;
  coverDays: string;
  minThresholdGrams: string;
  operator: string;
}

const getEmptyRuleForm = (): RuleFormState => ({
  name: "",
  ruleType: "category",
  target: "",
  calcMode: "fixed",
  thresholdGrams: "",
  consumptionDays: String(DEFAULT_CONSUMPTION_DAYS),
  coverDays: String(DEFAULT_PURCHASE_COVER_DAYS),
  minThresholdGrams: String(LOW_STOCK_GRAMS),
  operator: "",
});

interface SafetyStockModuleProps {
  safetyStockStore: SafetyStockStore;
  ledgerStore: LedgerStore;
}

function SafetyStockModule({
  safetyStockStore,
  ledgerStore,
}: SafetyStockModuleProps) {
  const {
    state: ssState,
    addRule,
    updateRule,
    removeRule,
    ruleChangeLogs,
  } = safetyStockStore;
  const {
    state: ledgerState,
    recordSafetyStockChange,
    refreshAll,
  } = ledgerStore;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(getEmptyRuleForm());
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<
    SafetyStockRuleType | "all"
  >("all");
  const [showLogsForRuleId, setShowLogsForRuleId] = useState<string | null>(
    null
  );
  const [previewResult, setPreviewResult] =
    useState<SafetyStockRulePreviewResult | null>(null);
  const [isComputingPreview, setIsComputingPreview] = useState(false);

  const rules = useMemo(() => selectAllSafetyStockRules(ssState), [ssState]);
  const herbNameList = useMemo(
    () => selectTotalStockByName(ledgerState).map((item) => item.name),
    [ledgerState]
  );

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (filterType !== "all" && r.ruleType !== filterType) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || r.target.toLowerCase().includes(q)
      );
    });
  }, [rules, query, filterType]);

  const targetOptions = useMemo(() => {
    if (ruleForm.ruleType === "category") {
      return CATEGORIES;
    }
    return herbNameList;
  }, [ruleForm.ruleType, herbNameList]);

  const draftRuleInput: NewSafetyStockRuleInput | null = useMemo(() => {
    if (!ruleForm.name.trim() || !ruleForm.target.trim()) return null;
    const threshold = Number(ruleForm.thresholdGrams);
    if (!Number.isFinite(threshold) || threshold <= 0) return null;

    const base: NewSafetyStockRuleInput = {
      name: ruleForm.name.trim(),
      ruleType: ruleForm.ruleType,
      target: ruleForm.target.trim(),
      calcMode: ruleForm.calcMode,
      thresholdGrams: threshold,
    };

    if (ruleForm.calcMode === "dynamic") {
      const cd = Number(ruleForm.consumptionDays);
      const cvd = Number(ruleForm.coverDays);
      const min = Number(ruleForm.minThresholdGrams);
      if (
        Number.isFinite(cd) &&
        cd >= 1 &&
        Number.isFinite(cvd) &&
        cvd >= 1 &&
        Number.isFinite(min) &&
        min >= 0
      ) {
        base.consumptionDays = cd;
        base.coverDays = cvd;
        base.minThresholdGrams = min;
      }
    }
    return base;
  }, [ruleForm]);

  useEffect(() => {
    if (!draftRuleInput) {
      setPreviewResult(null);
      return;
    }
    let cancelled = false;
    setIsComputingPreview(true);
    const compute = () => {
      try {
        const tempState = buildTemporarySafetyStockState(
          ssState,
          editingId,
          draftRuleInput
        );
        const result = previewRuleChange(
          ledgerState,
          ssState,
          tempState,
          draftRuleInput
        );
        if (!cancelled) {
          setPreviewResult(result);
          setIsComputingPreview(false);
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewResult(null);
          setIsComputingPreview(false);
        }
      }
    };
    const id = window.setTimeout(compute, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [draftRuleInput, ssState, ledgerState, editingId]);

  const handleRuleField = <K extends keyof RuleFormState>(
    key: K,
    value: string
  ) => {
    setRuleForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "ruleType") {
        next.target = "";
      }
      if (key === "calcMode" && value === "fixed") {
        next.consumptionDays = String(DEFAULT_CONSUMPTION_DAYS);
        next.coverDays = String(DEFAULT_PURCHASE_COVER_DAYS);
        next.minThresholdGrams = String(LOW_STOCK_GRAMS);
      }
      return next;
    });
    if (ruleErrors[key as string]) {
      setRuleErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  const validateRuleForm = (): boolean => {
    const next: Record<string, string> = {};

    if (!ruleForm.name.trim()) next.name = "规则名称不能为空";
    if (!ruleForm.target.trim()) next.target = "适用对象不能为空";

    const thresholdVal = Number(ruleForm.thresholdGrams);
    if (!ruleForm.thresholdGrams.trim()) {
      next.thresholdGrams = "安全库存克数不能为空";
    } else if (!Number.isFinite(thresholdVal)) {
      next.thresholdGrams = "安全库存克数必须是数字";
    } else if (thresholdVal <= 0) {
      next.thresholdGrams = "安全库存克数必须大于 0";
    }

    if (ruleForm.calcMode === "dynamic") {
      const cd = Number(ruleForm.consumptionDays);
      const cvd = Number(ruleForm.coverDays);
      const min = Number(ruleForm.minThresholdGrams);

      if (!ruleForm.consumptionDays.trim()) {
        next.consumptionDays = "消耗统计天数不能为空";
      } else if (!Number.isFinite(cd) || cd < 1) {
        next.consumptionDays = "消耗统计天数必须是 ≥1 的数字";
      }

      if (!ruleForm.coverDays.trim()) {
        next.coverDays = "目标覆盖天数不能为空";
      } else if (!Number.isFinite(cvd) || cvd < 1) {
        next.coverDays = "目标覆盖天数必须是 ≥1 的数字";
      }

      if (!ruleForm.minThresholdGrams.trim()) {
        next.minThresholdGrams = "最低兜底阈值不能为空";
      } else if (!Number.isFinite(min) || min < 0) {
        next.minThresholdGrams = "最低兜底阈值必须是 ≥0 的数字";
      }
    }

    const ruleName = ruleForm.name.trim();
    if (
      ruleName &&
      checkSafetyStockRuleNameExists(ssState, ruleName, editingId ?? undefined)
    ) {
      next.name = `规则名称 "${ruleName}" 已存在，请使用不同的名称`;
    }

    setRuleErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetForm = () => {
    setRuleForm(getEmptyRuleForm());
    setRuleErrors({});
    setEditingId(null);
    setPreviewResult(null);
  };

  const submitRule = async () => {
    if (!validateRuleForm() || !draftRuleInput) return;

    const operator = ruleForm.operator.trim() || "系统";

    const previewData = previewResult
      ? {
          affectedHerbCount: previewResult.affectedHerbs.length,
          lowStockBeforeCount: previewResult.totalLowStockBefore,
          lowStockAfterCount: previewResult.totalLowStockAfter,
          suggestionDeltaTotal: previewResult.totalSuggestionDelta,
        }
      : {
          affectedHerbCount: 0,
          lowStockBeforeCount: 0,
          lowStockAfterCount: 0,
          suggestionDeltaTotal: 0,
        };

    if (editingId) {
      const existingRule = ssState.rules[editingId];
      const beforeHerbName = draftRuleInput.ruleType === "herb" ? draftRuleInput.target : "";
      const beforeOutboundOps = beforeHerbName
        ? selectOutboundOperationsForHerb(ledgerState, beforeHerbName)
        : [];
      const beforeThreshold = existingRule
        ? resolveRuleThreshold(existingRule, { outboundOps: beforeOutboundOps })
        : 0;
      const afterThreshold = draftRuleInput.thresholdGrams;

      const result = await updateRule(editingId, {
        ...draftRuleInput,
        operator,
        existingRule,
        previewData,
      });

      if (result.ok && beforeThreshold !== afterThreshold) {
        const targetBatches =
          draftRuleInput.ruleType === "herb"
            ? Object.values(ledgerState.batches).filter(
                (b) =>
                  !b.isDeleted &&
                  b.name ===
                    (draftRuleInput.ruleType === "herb"
                      ? draftRuleInput.target
                      : "")
              )
            : Object.values(ledgerState.batches).filter(
                (b) =>
                  !b.isDeleted &&
                  b.category ===
                    (draftRuleInput.ruleType === "category"
                      ? draftRuleInput.target
                      : "")
              );

        if (targetBatches.length > 0) {
          targetBatches.forEach((batch) => {
            recordSafetyStockChange({
              herbName: batch.name,
              batchNo: batch.batchNo,
              operator,
              remark: `安全库存规则「${draftRuleInput.name}」调整：${beforeThreshold}g → ${afterThreshold}g`,
              safetyStockBefore: beforeThreshold,
              safetyStockAfter: afterThreshold,
              safetyStockTarget: draftRuleInput.target,
            });
          });
        } else {
          recordSafetyStockChange({
            herbName:
              draftRuleInput.ruleType === "herb"
                ? draftRuleInput.target
                : `【${draftRuleInput.target}】分类`,
            batchNo: "-",
            operator,
            remark: `安全库存规则「${draftRuleInput.name}」调整：${beforeThreshold}g → ${afterThreshold}g`,
            safetyStockBefore: beforeThreshold,
            safetyStockAfter: afterThreshold,
            safetyStockTarget: draftRuleInput.target,
          });
        }
      }
    } else {
      await addRule({ ...draftRuleInput, operator, previewData });
    }

    await refreshAll();
    resetForm();
    setShowForm(false);
  };

  const startEdit = (ruleId: string) => {
    const rule = ssState.rules[ruleId];
    if (!rule) return;
    setRuleForm({
      name: rule.name,
      ruleType: rule.ruleType,
      target: rule.target,
      calcMode: rule.calcMode,
      thresholdGrams: String(rule.thresholdGrams),
      consumptionDays: String(
        rule.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS
      ),
      coverDays: String(rule.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS),
      minThresholdGrams: String(rule.minThresholdGrams ?? LOW_STOCK_GRAMS),
      operator: "",
    });
    setEditingId(ruleId);
    setShowForm(true);
    setRuleErrors({});
    setPreviewResult(null);
  };

  const cancelForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleDelete = async (ruleId: string) => {
    const existingRule = ssState.rules[ruleId];
    let previewData = {
      affectedHerbCount: 0,
      lowStockBeforeCount: 0,
      lowStockAfterCount: 0,
      suggestionDeltaTotal: 0,
    };

    if (existingRule) {
      const draftForDelete: NewSafetyStockRuleInput = {
        name: existingRule.name,
        ruleType: existingRule.ruleType,
        target: existingRule.target,
        calcMode: "fixed",
        thresholdGrams: LOW_STOCK_GRAMS,
      };
      const tempState = {
        ...ssState,
        rules: {
          ...ssState.rules,
          [ruleId]: { ...ssState.rules[ruleId], isDeleted: true },
        },
      };
      const result = previewRuleChange(
        ledgerState,
        ssState,
        tempState,
        draftForDelete
      );
      previewData = {
        affectedHerbCount: result.affectedHerbs.length,
        lowStockBeforeCount: result.totalLowStockBefore,
        lowStockAfterCount: result.totalLowStockAfter,
        suggestionDeltaTotal: result.totalSuggestionDelta,
      };
    }

    const operator = ruleForm.operator.trim() || "系统";
    await removeRule(ruleId, { operator, existingRule, previewData });
    await refreshAll();
    setDeletingId(null);
    if (editingId === ruleId) {
      cancelForm();
    }
  };

  const ruleTypeLabel = (type: SafetyStockRuleType): string =>
    type === "category" ? "功效分类" : "单个饮片";

  const ruleTypeColor = (type: SafetyStockRuleType): string =>
    type === "category" ? "ssr-category" : "ssr-herb";

  const calcModeLabel = (mode: SafetyStockCalcMode): string =>
    mode === "fixed" ? "固定阈值" : "动态计算";

  const calcModeColor = (mode: SafetyStockCalcMode): string =>
    mode === "fixed" ? "mode-fixed" : "mode-dynamic";

  const categoryCount = rules.filter((r) => r.ruleType === "category").length;
  const herbCount = rules.filter((r) => r.ruleType === "herb").length;
  const fixedCount = rules.filter((r) => r.calcMode === "fixed").length;
  const dynamicCount = rules.filter((r) => r.calcMode === "dynamic").length;

  const logsForSelectedRule = useMemo(() => {
    if (!showLogsForRuleId) return [];
    return ruleChangeLogs.filter((l) => l.ruleId === showLogsForRuleId);
  }, [ruleChangeLogs, showLogsForRuleId]);

  const renderRuleExplanation = (rule: SafetyStockRuleDTO) => {
    if (rule.calcMode === "fixed") {
      return `固定阈值 ${rule.thresholdGrams}g`;
    }
    const cd = rule.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS;
    const cvd = rule.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS;
    const min = rule.minThresholdGrams ?? rule.thresholdGrams;

    let sampleExplanation = "";
    if (rule.ruleType === "herb") {
      const outboundOps = selectOutboundOperationsForHerb(ledgerState, rule.target);
      const dyn = calculateDynamicSafetyStock(outboundOps, {
        consumptionDays: cd,
        coverDays: cvd,
        minThresholdGrams: min,
      });
      sampleExplanation = dyn.explanation;
    } else {
      sampleExplanation = `近${cd}天出库均值 × ${cvd}天覆盖，最低 ${min}g`;
    }

    return sampleExplanation;
  };

  return (
    <section className="safety-stock module panel">
      <div className="section-heading">
        <div>
          <p>安全库存规则</p>
          <h2>按分类或饮片配置安全库存阈值（支持固定 / 动态模式）</h2>
          <div className="ssr-stats">
            <span>
              共 <strong>{rules.length}</strong> 条规则（固定
              <strong className="mode-fixed-count">{fixedCount}</strong>
              / 动态<strong className="mode-dynamic-count">{dynamicCount}</strong>
              ）
            </span>
          </div>
        </div>
        <button
          className="primary-action"
          onClick={() => {
            if (showForm) {
              cancelForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
        >
          {showForm ? "收起表单" : "新增规则"}
        </button>
      </div>

      {showForm && (
        <div className="ssr-form">
          <div className="ssr-form-title">
            {editingId ? "编辑规则" : "新增安全库存规则"}
          </div>

          <div className="ssr-mode-tabs">
            <button
              className={`ssr-tab ${
                ruleForm.calcMode === "fixed" ? "ssr-tab-active" : ""
              }`}
              onClick={() => handleRuleField("calcMode", "fixed")}
            >
              🔒 固定阈值
            </button>
            <button
              className={`ssr-tab ${
                ruleForm.calcMode === "dynamic" ? "ssr-tab-active" : ""
              }`}
              onClick={() => handleRuleField("calcMode", "dynamic")}
            >
              📊 动态计算（出库均值 × 覆盖天数）
            </button>
          </div>

          <div className="field-grid">
            <label>
              <span>
                规则名称<span className="required-mark">*</span>
              </span>
              <input
                type="text"
                value={ruleForm.name}
                placeholder="填写规则名称，例如「黄芪安全库存」"
                onChange={(e) => handleRuleField("name", e.target.value)}
                className={ruleErrors.name ? "input-error" : ""}
              />
              {ruleErrors.name && (
                <span className="error-text">{ruleErrors.name}</span>
              )}
            </label>

            <label>
              <span>
                规则类型<span className="required-mark">*</span>
              </span>
              <select
                value={ruleForm.ruleType}
                onChange={(e) => handleRuleField("ruleType", e.target.value)}
              >
                <option value="category">功效分类</option>
                <option value="herb">单个饮片</option>
              </select>
            </label>

            <label>
              <span>
                适用对象<span className="required-mark">*</span>
              </span>
              <select
                value={ruleForm.target}
                onChange={(e) => handleRuleField("target", e.target.value)}
                className={ruleErrors.target ? "input-error" : ""}
              >
                <option value="">
                  选择{ruleForm.ruleType === "category" ? "功效分类" : "饮片"}
                </option>
                {targetOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {ruleErrors.target && (
                <span className="error-text">{ruleErrors.target}</span>
              )}
            </label>

            <label>
              <span>
                {ruleForm.calcMode === "fixed"
                  ? "安全库存克数"
                  : "基础/参考阈值（g）"}
                <span className="required-mark">*</span>
              </span>
              <input
                type="number"
                value={ruleForm.thresholdGrams}
                placeholder={
                  ruleForm.calcMode === "fixed"
                    ? "固定阈值，低于该值即为低库存"
                    : "动态模式下的参考 / 兜底备用"
                }
                onChange={(e) =>
                  handleRuleField("thresholdGrams", e.target.value)
                }
                className={ruleErrors.thresholdGrams ? "input-error" : ""}
              />
              {ruleErrors.thresholdGrams && (
                <span className="error-text">
                  {ruleErrors.thresholdGrams}
                </span>
              )}
            </label>

            {ruleForm.calcMode === "dynamic" && (
              <>
                <label>
                  <span>
                    消耗统计天数<span className="required-mark">*</span>
                  </span>
                  <input
                    type="number"
                    value={ruleForm.consumptionDays}
                    placeholder="统计近N天的出库均值，如 30"
                    onChange={(e) =>
                      handleRuleField("consumptionDays", e.target.value)
                    }
                    className={ruleErrors.consumptionDays ? "input-error" : ""}
                  />
                  {ruleErrors.consumptionDays && (
                    <span className="error-text">
                      {ruleErrors.consumptionDays}
                    </span>
                  )}
                </label>

                <label>
                  <span>
                    目标覆盖天数<span className="required-mark">*</span>
                  </span>
                  <input
                    type="number"
                    value={ruleForm.coverDays}
                    placeholder="希望库存覆盖多少天消耗，如 45"
                    onChange={(e) =>
                      handleRuleField("coverDays", e.target.value)
                    }
                    className={ruleErrors.coverDays ? "input-error" : ""}
                  />
                  {ruleErrors.coverDays && (
                    <span className="error-text">{ruleErrors.coverDays}</span>
                  )}
                </label>

                <label>
                  <span>
                    最低兜底阈值（g）<span className="required-mark">*</span>
                  </span>
                  <input
                    type="number"
                    value={ruleForm.minThresholdGrams}
                    placeholder="动态值低于该值时取该值，避免无出库时阈值为0"
                    onChange={(e) =>
                      handleRuleField("minThresholdGrams", e.target.value)
                    }
                    className={
                      ruleErrors.minThresholdGrams ? "input-error" : ""
                    }
                  />
                  {ruleErrors.minThresholdGrams && (
                    <span className="error-text">
                      {ruleErrors.minThresholdGrams}
                    </span>
                  )}
                </label>
              </>
            )}

            <label>
              <span>操作人</span>
              <input
                type="text"
                value={ruleForm.operator}
                placeholder="选填，将写入审计日志"
                onChange={(e) => handleRuleField("operator", e.target.value)}
              />
            </label>
          </div>

          {draftRuleInput && ruleForm.calcMode === "dynamic" && (
            <div className="ssr-formula-preview">
              <span className="formula-icon">🧮</span>
              <span className="formula-text">
                计算公式：<code>MAX(</code>
                近<strong>{draftRuleInput.consumptionDays}</strong>天出库均值
                <code> × </code>
                <strong>{draftRuleInput.coverDays}</strong>天覆盖
                <code>, </code>
                最低兜底<strong>{draftRuleInput.minThresholdGrams}g</strong>
                <code>)</code>
              </span>
            </div>
          )}

          {isComputingPreview && (
            <div className="ssr-preview-loading">⏳ 正在计算预览效果…</div>
          )}

          {!isComputingPreview && previewResult && (
            <div className="ssr-preview-panel">
              <div className="ssr-preview-header">
                <h5>🔍 调整效果预览（未保存）</h5>
                <p className="ssr-preview-explain">{previewResult.explainText}</p>
              </div>

              <div className="ssr-preview-stats">
                <div className="stat-card">
                  <div className="stat-label">影响饮片数</div>
                  <div className="stat-value">
                    {previewResult.affectedHerbs.length}
                  </div>
                </div>
                <div
                  className={`stat-card ${
                    previewResult.lowStockDelta > 0
                      ? "stat-warn"
                      : previewResult.lowStockDelta < 0
                      ? "stat-good"
                      : ""
                  }`}
                >
                  <div className="stat-label">低库存数量变化</div>
                  <div className="stat-value">
                    {previewResult.totalLowStockBefore} →{" "}
                    {previewResult.totalLowStockAfter}
                    <span className="stat-delta">
                      {" "}
                      ({previewResult.lowStockDelta > 0 ? "+" : ""}
                      {previewResult.lowStockDelta})
                    </span>
                  </div>
                </div>
                <div
                  className={`stat-card ${
                    previewResult.totalSuggestionDelta > 0
                      ? "stat-warn"
                      : previewResult.totalSuggestionDelta < 0
                      ? "stat-good"
                      : ""
                  }`}
                >
                  <div className="stat-label">补货建议总量变化</div>
                  <div className="stat-value">
                    {previewResult.totalSuggestionBefore.toLocaleString()}g →{" "}
                    {previewResult.totalSuggestionAfter.toLocaleString()}g
                    <span className="stat-delta">
                      {" "}
                      ({previewResult.totalSuggestionDelta > 0 ? "+" : ""}
                      {previewResult.totalSuggestionDelta.toLocaleString()}g)
                    </span>
                  </div>
                </div>
              </div>

              {previewResult.newlyLowStock.length > 0 && (
                <div className="ssr-preview-section ssr-preview-warn">
                  <h6>⚠️ 新增低库存（{previewResult.newlyLowStock.length}种）</h6>
                  <ul>
                    {previewResult.newlyLowStock.map((h) => (
                      <li key={h.name}>
                        <strong>{h.name}</strong>（{h.category}）库存{" "}
                        {h.totalStock}g {"<"}{" "}
                        {h.thresholdAfter.toLocaleString()}g，补货建议
                        {h.suggestionAfter > 0
                          ? ` +${h.suggestionAfter.toLocaleString()}g`
                          : " 无"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.noLongerLowStock.length > 0 && (
                <div className="ssr-preview-section ssr-preview-good">
                  <h6>✅ 脱离低库存（{previewResult.noLongerLowStock.length}种）</h6>
                  <ul>
                    {previewResult.noLongerLowStock.map((h) => (
                      <li key={h.name}>
                        <strong>{h.name}</strong>（{h.category}）库存{" "}
                        {h.totalStock}g ≥ {h.thresholdAfter.toLocaleString()}g
                        {h.suggestionBefore > 0 &&
                          h.suggestionAfter <= 0 &&
                          `，原补货 ${h.suggestionBefore.toLocaleString()}g 建议取消`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.affectedHerbs.length > 0 &&
                previewResult.newlyLowStock.length === 0 &&
                previewResult.noLongerLowStock.length === 0 && (
                  <div className="ssr-preview-section ssr-preview-neutral">
                    <h6>📋 受影响饮片明细</h6>
                    <ul>
                      {previewResult.affectedHerbs
                        .filter((h) => h.suggestionDelta !== 0)
                        .slice(0, 10)
                        .map((h) => (
                          <li key={h.name}>
                            <strong>{h.name}</strong> 阈值{" "}
                            {h.thresholdBefore}g → {h.thresholdAfter}g，补货
                            {h.suggestionDelta > 0 ? "+" : ""}
                            {h.suggestionDelta.toLocaleString()}g
                          </li>
                        ))}
                      {previewResult.affectedHerbs.filter(
                        (h) => h.suggestionDelta !== 0
                      ).length > 10 && (
                        <li className="li-more">
                          …其余{" "}
                          {previewResult.affectedHerbs.filter(
                            (h) => h.suggestionDelta !== 0
                          ).length - 10}{" "}
                          种饮片补货建议有变化
                        </li>
                      )}
                      {previewResult.affectedHerbs.filter(
                        (h) => h.suggestionDelta !== 0
                      ).length === 0 && (
                        <li>所有受影响饮片的补货建议无变化</li>
                      )}
                    </ul>
                  </div>
                )}
            </div>
          )}

          <div className="ssr-form-actions">
            <button className="primary-action" onClick={submitRule}>
              {editingId ? "保存修改并记录日志" : "创建规则并记录日志"}
            </button>
            {editingId ? (
              <button className="clear-filter" onClick={cancelForm}>
                取消编辑
              </button>
            ) : (
              <button className="clear-filter" onClick={resetForm}>
                清空
              </button>
            )}
          </div>
        </div>
      )}

      <div className="ssr-toolbar">
        <input
          type="text"
          value={query}
          placeholder="搜索规则名称 / 适用对象"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ssr-filter-chips">
          <button
            className={filterType === "all" ? "filter-active" : ""}
            onClick={() => setFilterType("all")}
          >
            全部 ({rules.length})
          </button>
          <button
            className={`${
              filterType === "category" ? "filter-active" : ""
            } ssr-chip-category`}
            onClick={() => setFilterType("category")}
          >
            按分类 ({categoryCount})
          </button>
          <button
            className={`${
              filterType === "herb" ? "filter-active" : ""
            } ssr-chip-herb`}
            onClick={() => setFilterType("herb")}
          >
            按饮片 ({herbCount})
          </button>
        </div>
      </div>

      {filteredRules.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>暂无安全库存规则</h3>
          <p>点击「新增规则」创建第一个安全库存配置</p>
        </div>
      ) : (
        <div className="ssr-list">
          {filteredRules.map((rule) => {
            const herbName = rule.ruleType === "herb" ? rule.target : "";
            const outboundOps = herbName
              ? selectOutboundOperationsForHerb(ledgerState, herbName)
              : [];
            const effectiveThreshold = resolveRuleThreshold(rule, { outboundOps });
            const hasLogs = ruleChangeLogs.some((l) => l.ruleId === rule.id);
            return (
              <article
                key={rule.id}
                className={`ssr-card ${ruleTypeColor(rule.ruleType)}`}
              >
                <header className="ssr-card-head">
                  <div className="ssr-card-title">
                    <span
                      className={`ssr-type-badge ${ruleTypeColor(rule.ruleType)}`}
                    >
                      {ruleTypeLabel(rule.ruleType)}
                    </span>
                    <span
                      className={`ssr-mode-badge ${calcModeColor(rule.calcMode)}`}
                    >
                      {calcModeLabel(rule.calcMode)}
                    </span>
                    {rule.migratedFromV1 && (
                      <span className="ssr-migrate-badge" title="已从 v1 版本迁移">
                        已迁移
                      </span>
                    )}
                    <h4>{rule.name}</h4>
                  </div>
                  <div className="ssr-card-actions">
                    {hasLogs && (
                      <button
                        className={`ssr-action-btn ssr-log-btn ${
                          showLogsForRuleId === rule.id ? "active" : ""
                        }`}
                        onClick={() =>
                          setShowLogsForRuleId(
                            showLogsForRuleId === rule.id ? null : rule.id
                          )
                        }
                      >
                        📜 变更日志
                      </button>
                    )}
                    <button
                      className="ssr-action-btn ssr-edit-btn"
                      onClick={() => startEdit(rule.id)}
                    >
                      编辑
                    </button>
                    <button
                      className="ssr-action-btn ssr-delete-btn"
                      onClick={() => setDeletingId(rule.id)}
                    >
                      删除
                    </button>
                  </div>
                </header>

                <div className="ssr-card-body">
                  <div className="ssr-target">
                    <span>适用对象</span>
                    <strong>{rule.target}</strong>
                  </div>
                  <div className="ssr-threshold">
                    <span>
                      {rule.calcMode === "fixed"
                        ? "安全库存阈值"
                        : "当前生效阈值"}
                    </span>
                    <strong>
                      {effectiveThreshold.toLocaleString()} <i>g</i>
                    </strong>
                  </div>
                  {rule.calcMode === "dynamic" && (
                    <div className="ssr-dynamic-config">
                      <span>动态参数</span>
                      <em>
                        近{rule.consumptionDays ?? DEFAULT_CONSUMPTION_DAYS}天均值 ×{" "}
                        {rule.coverDays ?? DEFAULT_PURCHASE_COVER_DAYS}天覆盖，
                        最低 {(rule.minThresholdGrams ?? LOW_STOCK_GRAMS).toLocaleString()}g
                      </em>
                    </div>
                  )}
                  <div className="ssr-explanation">
                    <span>说明</span>
                    <em>{renderRuleExplanation(rule)}</em>
                  </div>
                </div>

                {showLogsForRuleId === rule.id && logsForSelectedRule.length > 0 && (
                  <div className="ssr-changelog-panel">
                    <h6>📜 规则变更历史</h6>
                    <ul className="ssr-changelog-list">
                      {logsForSelectedRule.map((log) => (
                        <li key={log.id} className={`changelog-${log.action}`}>
                          <div className="changelog-head">
                            <span className="changelog-action">
                              {log.action === "create" && "➕ 创建"}
                              {log.action === "update" && "✏️ 更新"}
                              {log.action === "delete" && "🗑️ 删除"}
                              {log.action === "migrate" && "⬆️ 迁移"}
                            </span>
                            <span className="changelog-operator">
                              操作人：{log.operator}
                            </span>
                            <span className="changelog-time">
                              {new Date(log.createdAt).toLocaleString("zh-CN")}
                            </span>
                          </div>
                          <div className="changelog-body">
                            <p>{log.remark}</p>
                            <div className="changelog-stats">
                              <span>
                                影响 <strong>{log.affectedHerbCount}</strong> 种饮片
                              </span>
                              <span>
                                低库存{" "}
                                <strong>
                                  {log.lowStockBeforeCount} →{" "}
                                  {log.lowStockAfterCount}
                                </strong>
                              </span>
                              <span>
                                补货变化{" "}
                                <strong>
                                  {log.suggestionDeltaTotal > 0 ? "+" : ""}
                                  {log.suggestionDeltaTotal.toLocaleString()}g
                                </strong>
                              </span>
                            </div>
                            {log.before && log.after && (
                              <details className="changelog-diff">
                                <summary>查看完整变更前后快照</summary>
                                <pre>
                                  <code>
                                    BEFORE: {JSON.stringify(log.before, null, 2)}
                                  </code>
                                </pre>
                                <pre>
                                  <code>
                                    AFTER:&nbsp;&nbsp;
                                    {JSON.stringify(log.after, null, 2)}
                                  </code>
                                </pre>
                              </details>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {deletingId === rule.id && (
                  <div className="ssr-delete-confirm">
                    <span>确认删除规则「{rule.name}」？此操作将写入审计日志</span>
                    <div className="ssr-delete-actions">
                      <button
                        className="ssr-confirm-delete"
                        onClick={() => handleDelete(rule.id)}
                      >
                        确认删除
                      </button>
                      <button
                        className="ssr-cancel-delete"
                        onClick={() => setDeletingId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default SafetyStockModule;
