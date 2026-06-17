import { useMemo, useState } from "react";
import {
  AUDIT_LOG_LABELS,
  CATEGORIES,
  SafetyStockRuleType,
} from "./types";
import {
  checkSafetyStockRuleNameExists,
  selectAllSafetyStockRules,
  selectTotalStockByName,
} from "./store";
import type { SafetyStockStore, LedgerStore } from "./store";

const emptyRuleForm = {
  name: "",
  ruleType: "category" as SafetyStockRuleType,
  target: "",
  thresholdGrams: "",
  operator: "",
};

const ruleFormFields: Array<{
  key: keyof typeof emptyRuleForm;
  label: string;
  type: string;
  required: boolean;
}> = [
  { key: "name", label: "规则名称", type: "text", required: true },
  { key: "ruleType", label: "规则类型", type: "select", required: true },
  { key: "target", label: "适用对象", type: "select", required: true },
  { key: "thresholdGrams", label: "安全库存克数", type: "number", required: true },
  { key: "operator", label: "操作人", type: "text", required: false },
];

interface SafetyStockModuleProps {
  safetyStockStore: SafetyStockStore;
  ledgerStore: LedgerStore;
}

function SafetyStockModule({ safetyStockStore, ledgerStore }: SafetyStockModuleProps) {
  const { state: ssState, addRule, updateRule, removeRule } = safetyStockStore;
  const { state: ledgerState, recordSafetyStockChange } = ledgerStore;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({ ...emptyRuleForm });
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<SafetyStockRuleType | "all">("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
        r.name.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q)
      );
    });
  }, [rules, query, filterType]);

  const targetOptions = useMemo(() => {
    if (ruleForm.ruleType === "category") {
      return CATEGORIES;
    }
    return herbNameList;
  }, [ruleForm.ruleType, herbNameList]);

  const handleRuleField = (key: keyof typeof emptyRuleForm, value: string) => {
    setRuleForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "ruleType") {
        next.target = "";
      }
      return next;
    });
    if (ruleErrors[key]) {
      setRuleErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateRuleForm = (): boolean => {
    const next: Record<string, string> = {};

    ruleFormFields.forEach((f) => {
      if (!f.required) return;
      const value = ruleForm[f.key];
      if (!value || !String(value).trim()) {
        next[f.key] = `${f.label}不能为空`;
      }
    });

    const thresholdVal = ruleForm.thresholdGrams;
    if (thresholdVal && thresholdVal.trim()) {
      const num = Number(thresholdVal);
      if (Number.isNaN(num)) {
        next.thresholdGrams = "安全库存克数必须是数字";
      } else if (num <= 0) {
        next.thresholdGrams = "安全库存克数必须大于 0";
      }
    }

    const ruleName = ruleForm.name.trim();
    if (ruleName && checkSafetyStockRuleNameExists(ssState, ruleName, editingId ?? undefined)) {
      next.name = `规则名称 "${ruleName}" 已存在，请使用不同的名称`;
    }

    setRuleErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetForm = () => {
    setRuleForm({ ...emptyRuleForm });
    setRuleErrors({});
    setEditingId(null);
  };

  const submitRule = () => {
    if (!validateRuleForm()) return;

    const input = {
      name: ruleForm.name.trim(),
      ruleType: ruleForm.ruleType,
      target: ruleForm.target.trim(),
      thresholdGrams: Number(ruleForm.thresholdGrams),
    };
    const operator = ruleForm.operator.trim();

    if (editingId) {
      const existingRule = ssState.rules[editingId];
      const beforeThreshold = existingRule?.thresholdGrams ?? 0;
      const afterThreshold = input.thresholdGrams;

      updateRule(editingId, input);

      if (beforeThreshold !== afterThreshold) {
        const targetBatches =
          input.ruleType === "herb"
            ? Object.values(ledgerState.batches).filter(
                (b) => !b.isDeleted && b.name === input.target
              )
            : Object.values(ledgerState.batches).filter(
                (b) => !b.isDeleted && b.category === input.target
              );

        if (targetBatches.length > 0) {
          targetBatches.forEach((batch) => {
            recordSafetyStockChange({
              herbName: batch.name,
              batchNo: batch.batchNo,
              operator: operator || "系统",
              remark: `安全库存规则「${input.name}」调整：${beforeThreshold}g → ${afterThreshold}g`,
              safetyStockBefore: beforeThreshold,
              safetyStockAfter: afterThreshold,
              safetyStockTarget: input.target,
            });
          });
        } else {
          recordSafetyStockChange({
            herbName: input.ruleType === "herb" ? input.target : `【${input.target}】分类`,
            batchNo: "-",
            operator: operator || "系统",
            remark: `安全库存规则「${input.name}」调整：${beforeThreshold}g → ${afterThreshold}g`,
            safetyStockBefore: beforeThreshold,
            safetyStockAfter: afterThreshold,
            safetyStockTarget: input.target,
          });
        }
      }
    } else {
      addRule(input);
    }

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
      thresholdGrams: String(rule.thresholdGrams),
      operator: "",
    });
    setEditingId(ruleId);
    setShowForm(true);
    setRuleErrors({});
  };

  const cancelForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleDelete = (ruleId: string) => {
    removeRule(ruleId);
    setDeleteConfirmId(null);
    if (editingId === ruleId) {
      cancelForm();
    }
  };

  const ruleTypeLabel = (type: SafetyStockRuleType): string => {
    return type === "category" ? "功效分类" : "单个饮片";
  };

  const ruleTypeColor = (type: SafetyStockRuleType): string => {
    return type === "category" ? "ssr-category" : "ssr-herb";
  };

  const categoryCount = rules.filter((r) => r.ruleType === "category").length;
  const herbCount = rules.filter((r) => r.ruleType === "herb").length;

  return (
    <section className="safety-stock module panel">
      <div className="section-heading">
        <div>
          <p>安全库存规则</p>
          <h2>按分类或饮片配置安全库存阈值</h2>
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
          <div className="field-grid">
            {ruleFormFields.map((f) => (
              <label key={f.key}>
                <span>
                  {f.label}
                  {f.required && <span className="required-mark">*</span>}
                </span>
                {f.key === "ruleType" ? (
                  <select
                    value={ruleForm[f.key]}
                    onChange={(e) => handleRuleField(f.key, e.target.value)}
                    className={ruleErrors[f.key] ? "input-error" : ""}
                  >
                    <option value="category">功效分类</option>
                    <option value="herb">单个饮片</option>
                  </select>
                ) : f.key === "target" ? (
                  <select
                    value={ruleForm[f.key]}
                    onChange={(e) => handleRuleField(f.key, e.target.value)}
                    className={ruleErrors[f.key] ? "input-error" : ""}
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
                ) : (
                  <input
                    type={f.type}
                    value={ruleForm[f.key]}
                    placeholder={`填写${f.label}`}
                    onChange={(e) => handleRuleField(f.key, e.target.value)}
                    className={ruleErrors[f.key] ? "input-error" : ""}
                  />
                )}
                {ruleErrors[f.key] && (
                  <span className="error-text">{ruleErrors[f.key]}</span>
                )}
              </label>
            ))}
          </div>
          <div className="ssr-form-actions">
            <button className="primary-action" onClick={submitRule}>
              {editingId ? "保存修改" : "创建规则"}
            </button>
            {editingId && (
              <button className="clear-filter" onClick={cancelForm}>
                取消编辑
              </button>
            )}
            {!editingId && (
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
            className={`${filterType === "category" ? "filter-active" : ""} ssr-chip-category`}
            onClick={() => setFilterType("category")}
          >
            按分类 ({categoryCount})
          </button>
          <button
            className={`${filterType === "herb" ? "filter-active" : ""} ssr-chip-herb`}
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
          {filteredRules.map((rule) => (
            <article key={rule.id} className={`ssr-card ${ruleTypeColor(rule.ruleType)}`}>
              <header className="ssr-card-head">
                <div className="ssr-card-title">
                  <span className={`ssr-type-badge ${ruleTypeColor(rule.ruleType)}`}>
                    {ruleTypeLabel(rule.ruleType)}
                  </span>
                  <h4>{rule.name}</h4>
                </div>
                <div className="ssr-card-actions">
                  <button
                    className="ssr-action-btn ssr-edit-btn"
                    onClick={() => startEdit(rule.id)}
                  >
                    编辑
                  </button>
                  <button
                    className="ssr-action-btn ssr-delete-btn"
                    onClick={() => setDeleteConfirmId(rule.id)}
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
                  <span>安全库存</span>
                  <strong>
                    {rule.thresholdGrams} <i>g</i>
                  </strong>
                </div>
              </div>

              {deleteConfirmId === rule.id && (
                <div className="ssr-delete-confirm">
                  <span>确认删除规则「{rule.name}」？</span>
                  <div className="ssr-delete-actions">
                    <button
                      className="ssr-confirm-delete"
                      onClick={() => handleDelete(rule.id)}
                    >
                      确认删除
                    </button>
                    <button
                      className="ssr-cancel-delete"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      取消
                    </button>
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

export default SafetyStockModule;
