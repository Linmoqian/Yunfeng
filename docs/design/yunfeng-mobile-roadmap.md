# yunfeng-mobile 前端补齐计划

对标：腾讯 Marvis（六 Agent 协作 / 任务进度 / 技能包 / 会话管理 / 语音输入 / 人设管理 / 本地+云端双模式 / 跨端协同 / L2 授权安全）与行业 agent 前端模式（AG-UI、CopilotKit、LangChain frontend：流式文本 / thinking 区块 / 工具调用生命周期卡片 / human-in-the-loop / 生成式 UI）。

## 现状基线

- 首页：问候 + 快捷指令（静态 mock）+ Agent 状态（静态 mock）+ 本地/效率模式切换（纯 UI）。
- 会话：静态 mock 列表 + 本地搜索。
- 聊天：本地占位回复，无流式、无工具、无 thinking。
- 我的：静态设置。
- 未接 sidecar，无调试总线，无 e2e。

## P0 会话核心（把对话做真，依赖 sidecar 契约）

1. 数据层：sidecar HTTP/SSE 客户端 + `types.ts` 协议镜像（与 `app/` 同步，含契约测试）。
2. 流式对话：SSE 增量渲染、thinking 区块、停止生成 / 重试。
3. 工具调用卡片：pending → running → done/failed，失败可展开详情。
4. Markdown / 代码块渲染与移动端阅读优化。
5. 会话管理：重命名 / 删除 / 归档、会话搜索、空态与骨架屏。

验证：bun sidecar smoke + 浏览器 SSE 演示 + vitest 契约测试。

## P1 Agent 协作与差异化

6. Agent 实时状态面板：订阅 AgentEvent，替换静态 mock。
7. 任务拆解视图：主管拆解 → 子任务进度列表（Marvis 任务进度呈现）。
8. 快捷指令 / 技能真实化：点击预填并发送；技能列表接 sidecar registry。
9. 本地 / 效率模式生效：UI 状态传递到运行时配置。
10. 授权确认 UI（human-in-the-loop）：危险操作二次确认（对齐 L2 安全 / AG-UI approvals）。

验证：事件驱动 UI 单测 + 端到端演示。

## P2 移动端特性与打磨

11. 语音输入（Marvis 已有）。
12. 设备协同入口 UI：桌面设备列表 / 连接状态 / 任务进度推送（后端方案待定，先 UI）。
13. 人设 / 身份管理入口。
14. 动效与触感：下拉刷新、haptic、页面转场（reduced-motion 已支持）。
15. 离线 / 低资源模式提示。
16. 无障碍：字体缩放、对比度、读屏适配。

验证：真机 / Tauri mobile / 无障碍扫描。

## 工程底座（贯穿）

- 调试信息总线（AGENTS.md 要求）。
- 组件 / 页面测试 + Playwright 移动视口 e2e。
- 设计 token 与 `app/` 共享收敛。

## 依赖与风险

- P0 依赖移动端 sidecar 接入方案（桌面是 Bun 子进程，移动端需单独决策）；前端先按协议对接。
- 真机与 Tauri mobile 验证未做。
- 不引入重型状态库，沿用 `app/` 的 hook 风格。
