# 云枫共享 UI

桌面与移动端共用的 React 组件、动效与交互。保持浅白淡紫、圆润边界、轻量胶囊和枫叶云朵，使用现有 React、Motion、CSS Modules。由宿主 Vite 直接编译源码，开发修改可热更新。

```tsx
import "@yunfeng/design-tokens/styles.css";
import { Capsule, ProgressCapsule, MapleCloudLoading } from "@yunfeng/ui";
import { Details } from "@yunfeng/ui/antd";

<Capsule tone="success" value={report.revision}>验收通过</Capsule>
<ProgressCapsule label="实验" current={report.done} total={report.total} />
<Details label="实验过程">{report.details}</Details>
```

| 入口 | 内容 |
| --- | --- |
| `@yunfeng/ui` | 胶囊、进度、关系节点、品牌加载、动效和交互 Hooks、拖放样式 |
| `@yunfeng/ui/antd` | Ant Design 的省略号折叠详情，按需导入 |
| `@yunfeng/ui/assets/*` | 共享枫叶与云朵资源 |
| `@yunfeng/ui/styles/*` | 供既有 CSS Modules 组合的样式 |

React、Motion 和 Ant Design 使用 peer 依赖；宿主 Vite 对 React、React DOM、Motion 去重，桌面同时对 Ant Design 去重，避免跨包上下文分离。Ant Design 与 Lucide 只用于 `antd` 入口，移动端基础组件无需安装 Ant Design。宿主负责引入共享 Token、切换 `data-theme`；标题栏高度和安全区等平台规则保留在客户端。

库只接收 props，不导入客户端、Redux、Tauri、请求或数据库。业务状态、权限、执行、验收和 Agent 组件 API 继续由宿主管理；移动端的任务语义映射也留在移动端。CLI 从[设计变量包](../design-tokens/README.md)读取语义色，使用原有 TUI 渲染。

桌面旧 `components/common` 保留转发。新增调用使用本包；交互约定见[云枫 UI 规范](../../docs/development/2026-10-17-ui-library.md)。桌面 `/dev/ui` 直接展示共享实现。

验证：`pnpm --filter @yunfeng/ui check`、`pnpm --filter @yunfeng/ui test`，随后运行受影响客户端的检查和界面验收。
