# 云枫 UI 兼容入口

组件实现已迁至 [packages/ui](../../../../../packages/ui/README.md)，本目录只转发既有组件、样式和 Hooks，避免重复维护。新代码使用 `@yunfeng/ui`；Ant Design 详情使用 `@yunfeng/ui/antd`。

桌面 `/dev/ui` 展示同一共享实现。交互约定见[云枫 UI 规范](../../../../../docs/development/2026-10-17-ui-library.md)。业务权限、执行与 Agent 组件 API 留在各功能模块。
