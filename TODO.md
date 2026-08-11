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
- [ ] 锁定 UI 主题并沉淀设计规范文档
- [ ] 前端调试信息总线（AGENTS.md 要求）
- [ ] sidecar 打包单文件二进制（bun compile）并验证
- [ ] Rust release 模式接入 sidecar 产物
- [ ] skills 工作流集成（内置 SKILL.md 包 + 管理界面）
- [ ] 端到端 tauri dev 交互验证

## yunfeng-mobile 移动端前端

- [x] 建立 yunfeng-mobile Tauri 2 + Vite + React 工程骨架
- [x] 实现 Marvis 风格移动端首页（对话入口 / 快捷指令 / Agent 协作 / 模式切换）
- [x] 前端构建与单测通过（tsc + vite build + vitest）
- [ ] Rust 侧 cargo check / tauri 启动验证
- [ ] 移动端接入 sidecar 数据（当前为本地占位回复）
- [ ] 真机 / Tauri mobile 目标验证
