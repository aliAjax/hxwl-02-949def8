import "./styles.css";

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
    "饮片名称",
    "炮制规格",
    "产地",
    "批号",
    "有效期",
    "库存克数",
    "功效分类"
  ],
  "records": [
    [
      "黄芪",
      "蜜炙",
      "甘肃",
      "补气",
      "批号HQ2603，库存8200g"
    ],
    [
      "金银花",
      "生品",
      "河南",
      "清热",
      "近效期剩余48天"
    ],
    [
      "丹参",
      "切片",
      "山东",
      "活血",
      "低于安全库存1200g"
    ]
  ]
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
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action">新增记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field: string) => (
              <label key={field}>
                <span>{field}</span>
                <input placeholder={"填写" + field} />
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>示例数据</p>
            <h2>近期记录</h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {project.records.map((record: string[], index: number) => (
            <article key={record.join("-")} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record[0]}</h3>
                <p>{record.slice(1).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
