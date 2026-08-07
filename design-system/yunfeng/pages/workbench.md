# Workbench 页面设计覆盖文件

> 本文件覆盖 MASTER.md 中适用于工作台页面的通用规则。构建/维护工作台时以此为准。

## 页面形态

- **类型**：生产工具 / 任务编排工作台（桌面优先，响应式适配移动）。
- **布局**：固定侧栏（~286px，搜索/筛选/任务分组）+ 主区。
  - 无选中任务时：概述页（欢迎语 + 任务统计 + 空态引导）。
  - 选中任务：任务聚焦面板（会话流 + 审批 + 工具卡 + Git 改动 + 输入区）。
- **信息密度**：中（`--density 5/10`），快速定位与推进优先。

## 配色落地（暖色丝缎系，覆盖 MASTER 蓝色默认）

- 主色 accent：`#A35F3B`（浅）/ `#D39366`（深）。
- 状态语义：运行=accent，等待=text-secondary，需要处理=failed-red `#8B3E35`/`#E07A6E`，完成=positive `#55705A`/`#86AD8E`。
- 语义色不单独承载信息；一律带文字标签（"Agent 正在工作"、"等待审批" 等）。

## 排版落地

- 标题用衬线 `Songti SC / Noto Serif CJK SC`，正文用 Inter + `PingFang SC`。
- 任务状态、路径、模型等元信息用 mono 字体 + 11–13px + 次要色。

## 布局与 Ant Design 组件

| 区域 | 组件 | 说明 |
|------|------|------|
| 新建会话 | Modal + Form + Input/Input.TextArea | 输入校验（cwd/message 必填） |
| 设置 | Modal + Segmented（主题）+ Select（模型）+ Tag | 主题三态：跟随/浅/深 |
| 归档/进行中筛选 | Segmented | 修改前需要单选切换 |
| 构模型/思考等级/工具 | Collapse + Select + Switch | 运行中禁用 |
| Git 改动 | Collapse + Input + Button | 本地提交 / 推送（需审批） |
| 运行控制 | Button（中止/清空/重试/完成） | 按任务状态条件渲染 |
| 空态/概述 | Button（新建任务） | 主按钮引导启动 |

## 动效（Motion）

- 概述页、任务面板进入：`opacity 0→1 + y` 轻滑，≤300ms，easing `cubic-bezier(0.22,1,0.36,1)`。
- 会话消息进入：轻微 fade+slight y；不做复杂编排。
- 运行中工具状态用 mono 文字 + 旋转 Loading 图标（`spin` 1s）。
- 尊重 `prefers-reduced-motion`（global.css 全局降级）。

## 交互细节

- 任务行 hover：边框颜色转 accent，标题转 accent。
- 审批卡：attention 色边框 + 阴影 + 呼吸提示；允许一次/拒绝两个动作，confirm 无需输入。
- 消息操作（复制/分支/重发）默认隐藏，hover 消息显示。
- 发送失败乐观状态：消息旁圆点变红 + 面板内联反馈，保留"重新发送"。

## 无障碍

- 窗口/对话框按钮有可访问名称（`aria-label`）。
- `模型`/`思考等级` 等配置用 `<label htmlFor>` 关联。
- 折叠区块（Collapse）可键盘访问；键盘焦点环可见。
- 侧栏用 `aria-label="任务列表"`，聚焦面板用 `role="region" aria-label="当前任务"`。
