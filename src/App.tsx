import { useState } from "react";
import "./styles.css";

interface InventoryRecord {
  name: string;
  spec: string;
  origin: string;
  batch: string;
  expiry: string;
  stockGrams: number;
  category: string;
}

const project = {
  "id": "hxwl-02",
  "port": 5102,
  "title": "中药饮片库存",
  "subtitle": "按批号、炮制规格与近效期管理饮片周转",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#166534",
    "#b45309",
    "#0f766e"
  ],
  "domain": "中药房",
  "users": [
    "药师",
    "库管",
    "门店负责人"
  ],
  "metrics": [
    "近效期批次",
    "低库存品种",
    "本周出库",
    "安全库存"
  ],
  "filters": [
    "补气",
    "清热",
    "活血",
    "化湿"
  ],
  "fields": [
    { key: "name", label: "饮片名称" },
    { key: "spec", label: "炮制规格" },
    { key: "origin", label: "产地" },
    { key: "batch", label: "批号" },
    { key: "expiry", label: "有效期" },
    { key: "stockGrams", label: "库存克数" },
    { key: "category", label: "功效分类" }
  ] as const,
  "initialRecords": [
    {
      name: "黄芪",
      spec: "蜜炙",
      origin: "甘肃",
      batch: "HQ2603",
      expiry: "2026-12-31",
      stockGrams: 8200,
      category: "补气"
    },
    {
      name: "金银花",
      spec: "生品",
      origin: "河南",
      batch: "JYH2509",
      expiry: "2026-08-04",
      stockGrams: 3500,
      category: "清热"
    },
    {
      name: "丹参",
      spec: "切片",
      origin: "山东",
      batch: "DS2601",
      expiry: "2027-03-15",
      stockGrams: 980,
      category: "活血"
    }
  ] as InventoryRecord[]
};

const emptyForm: Record<string, string> = {
  name: "",
  spec: "",
  origin: "",
  batch: "",
  expiry: "",
  stockGrams: "",
  category: ""
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [formData, setFormData] = useState<Record<string, string>>({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<InventoryRecord[]>([...project.initialRecords]);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    project.fields.forEach((field) => {
      const value = formData[field.key];
      if (!value || !value.trim()) {
        nextErrors[field.key] = `${field.label}不能为空`;
      }
    });

    const stockValue = formData.stockGrams;
    if (stockValue && stockValue.trim()) {
      const num = Number(stockValue);
      if (Number.isNaN(num)) {
        nextErrors.stockGrams = "库存克数必须是数字";
      } else if (num <= 0) {
        nextErrors.stockGrams = "库存克数必须大于0";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const newRecord: InventoryRecord = {
      name: formData.name.trim(),
      spec: formData.spec.trim(),
      origin: formData.origin.trim(),
      batch: formData.batch.trim(),
      expiry: formData.expiry.trim(),
      stockGrams: Number(formData.stockGrams),
      category: formData.category.trim()
    };

    setRecords((prev) => [newRecord, ...prev]);
    setFormData({ ...emptyForm });
    setErrors({});
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter]
    );
  };

  const clearFilters = () => {
    setSelectedFilters([]);
  };

  const filteredRecords = selectedFilters.length === 0
    ? records
    : records.filter((record) => selectedFilters.includes(record.category));

  const formatRecordText = (record: InventoryRecord): string => {
    const today = new Date();
    const expiryDate = new Date(record.expiry);
    const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 60 && diffDays > 0) {
      return `近效期剩余${diffDays}天`;
    }
    if (record.stockGrams < 1200) {
      return `低于安全库存${record.stockGrams}g`;
    }
    return `批号${record.batch}，库存${record.stockGrams}g`;
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips filter-chips">
            {project.filters.map((filter: string) => (
              <button
                key={filter}
                className={selectedFilters.includes(filter) ? "filter-active" : ""}
                onClick={() => toggleFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          {selectedFilters.length > 0 && (
            <button className="clear-filter" onClick={clearFilters}>
              清空筛选
            </button>
          )}
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>库存录入</h2>
            </div>
            <button className="primary-action" onClick={handleSubmit}>提交记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  <span className="required-mark">*</span>
                </span>
                <input
                  type={field.key === "expiry" ? "date" : field.key === "stockGrams" ? "number" : "text"}
                  value={formData[field.key]}
                  placeholder={`填写${field.label}`}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className={errors[field.key] ? "input-error" : ""}
                />
                {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>入库数据</p>
            <h2>近期记录</h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record: InventoryRecord, index: number) => (
              <article key={`${record.batch}-${index}`} className="record-card">
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{record.name}</h3>
                  <p>{[record.spec, record.origin, record.category, `有效期${record.expiry}`, formatRecordText(record)].join(" · ")}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>暂无匹配记录</h3>
              <p>当前筛选条件下没有找到符合的饮片记录</p>
              {selectedFilters.length > 0 && (
                <button className="clear-filter" onClick={clearFilters}>
                  清除筛选条件
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
