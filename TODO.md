# TODO

- [x] 了解项目结构与当前进度
- [x] 调研 pi-web 与 pi agent 的数据共享机制
- [x] 搭建 Tauri 2 + sidecar（pi SDK 运行时）骨架
- [x] sidecar HTTP/SSE 服务（会话/命令/模型/文件）
- [x] 前端 MVP：会话列表、流式对话、文件工作区、模型切换
- [x] 苹果风格 UI 重构
- [x] 按 prototype skill 重构为三变体 UI（A 命令面板 / B 工程工作台 / C 沉浸对话）
- [x] 工程师选定 UI 变体（已废弃：git 78b8aed 清空重写为液态玻璃单 UI）
- [x] 借鉴 yolo-block 工程经验：新增 RULES.md 项目规则与 MEMORY.md 长期记忆
- [x] sidecar 拆分 registry.ts（→ wrapper/commands/registry 三模块）
- [x] 引入 vitest 前端单测（api.ts SSE 解析 / sessionActions / 契约镜像测试）
- [x] sidecar 用 bun test 补充纯逻辑单测（命令分发 / JSONL 映射 / fs 路径校验）
- [x] 接入 lin-workflow 工程规范与 project-engineering skill
- [x] 建立 yunfeng-mobile Tauri 2 + Vite + React 工程骨架
- [x] 实现 Marvis 风格移动端首页（对话入口 / 快捷指令 / Agent 协作 / 模式切换）
- [x] 移动端浅色主题对齐 app 设计 token
- [ ] 锁定 UI 主题并沉淀设计规范文档
- [ ] 前端调试信息总线（AGENTS.md 要求）
- [ ] sidecar 打包单文件二进制（bun compile）并验证
- [ ] Rust release 模式接入 sidecar 产物
- [ ] skills 工作流集成（内置 SKILL.md 包 + 管理界面）
- [ ] 端到端 tauri dev 交互验证

## yunfeng-mobile 移动端前端（见 docs/design/yunfeng-mobile-roadmap.md）

- [x] P0-1 sidecar HTTP/SSE 数据层 + types.ts 协议镜像与契约测试
- [x] P0-2 流式对话（SSE 增量 / thinking / 停止 / 重试）
- [ ] P0-3 工具调用生命周期卡片
- [x] P0-4 Markdown / 代码块渲染（基础版）
- [ ] P0-5 会话管理（重命名 / 删除 / 归档 / 搜索 / 空态）
- [ ] P1-6 Agent 实时状态面板（订阅 AgentEvent）
- [ ] P1-7 任务拆解视图（子任务进度）
- [ ] P1-8 快捷指令 / 技能真实化（接 registry）
- [ ] P1-9 本地 / 效率模式生效
- [ ] P1-10 授权确认 UI（human-in-the-loop）
- [ ] P2-11 语音输入
- [ ] P2-12 设备协同入口 UI
- [ ] P2-13 人设管理入口
- [ ] P2-14 移动端动效 / 触感打磨
- [ ] P2-15 离线 / 低资源模式提示
- [ ] P2-16 无障碍（字体缩放 / 对比度 / 读屏）
- [ ] 移动端 Rust cargo check / tauri 启动验证
- [ ] Playwright 移动视口 e2e
