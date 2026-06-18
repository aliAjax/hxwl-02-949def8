# hxwl-02 中药饮片库存

按批号、炮制规格与近效期管理饮片周转

## 技术栈

React 19 + Vite 7 + TypeScript 5 + Vitest 3

## 本地开发

```bash
npm install
npm run dev
```

开发端口：5102

## 测试

```bash
# 运行所有测试
npm test

# 监听模式运行测试
npm run test:watch
```

## 类型检查

```bash
npm run typecheck
```

## 构建与验证

```bash
# 生产构建
npm run build

# 本地预览构建产物
npm run preview

# 完整验证（类型检查 + 测试 + 构建）
npm run verify
```

## CI 持续集成

项目配置了 GitHub Actions CI，在每次推送和拉取请求时自动运行：
- 类型检查
- 单元测试
- 生产构建

## 初始功能

- 领域指标看板
- 角色和分类筛选
- 专业字段录入区
- 示例记录列表
- 可继续扩展IndexedDB、权限、后端API和复杂图表
