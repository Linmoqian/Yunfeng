# 云枫 UI

本项目的动画、组件与交互共用层。保留浅白淡紫、圆润边界、紧凑胶囊和枫叶云朵；依赖现有 React、Motion、Ant Design 与 CSS Modules，无新增依赖。

从 `components/common` 导入。开发环境打开 `/dev/ui` 预览样例，样例不访问业务 API，也不进入正式导航。详细约定见 [云枫 UI 使用规范](../../../../docs/development/2026-10-17-ui-library.md)。

| 层 | 入口 | 用途 |
| --- | --- | --- |
| 动画 | `useYunfengMotion`、`motionPresets` | 进入、退出、事实反馈、布局、浮起、吸附、回位 |
| 组件 | `Capsule`、`ProgressCapsule`、`MapleCloudLoading`、`Details` | 信息、真实计数、品牌加载和默认折叠详情 |
| 交互 | `interactionStyles`、`dragStyles` | 按压、悬停、候选、虚影和落点提示 |
| 交互 Hooks | `useStableVisibility`、`useGestureCancellation` | 抑制加载闪烁，Escape / 失焦取消手势 |

共用层不导入 feature、Redux、Tauri 或业务服务；权限、候选判断、提交、验收及 Agent 控制留在功能模块。工作台旧入口保留兼容，新组件直接使用本目录。
