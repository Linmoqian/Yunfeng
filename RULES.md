# Pi Desktop 项目规则

## 两条核心原则

**简约。模块化。**

所有规则由此派生。冲突、犹豫、争议时回到这两条裁决。例外允许，但必须在提交说明里写明理由；「V1 是这样写的」「临时赶进度」都不是理由。

---

## 一、简约

1. 能不写的代码不写。能 50 行解决的，不写 200 行。
2. 不为「未来扩展」提前设计系统。需求出现再抽象，且只抽象到能覆盖当前用例。
3. 不引入未使用的依赖、未调用的函数、未引用的字段。
4. 不重构没坏的东西；不顺手优化相邻代码。

### 行数阈值（简约的硬下限）

- sidecar TS 模块 ≤ 400 行
- 前端 TS/TSX 模块 ≤ 300 行
- CSS 文件 ≤ 300 行（设计 token 文件除外，如 `index.css` 的 @theme 部分）
- 单个函数 ≤ 50 行

超过即拆。存量超标文件（见 TODO）分批拆分，禁止一次性大爆炸重构。

---

## 二、模块化（三层依赖单向）

```
React 前端 (app/src) ──HTTP/SSE──▶ sidecar (app/sidecar) ◀──Tauri (app/src-tauri) 管理生命周期
```

1. 一个模块只做一件事，名字能概括它的全部职责。
2. 模块边界即文件边界：一个文件被打开时应能独立读懂，不需要先读另外三个文件。
3. 依赖单向、可画出无环图。禁止反向依赖、循环依赖。
4. 跨模块共享的类型/常量必须从公共模块显式导出，禁止复制粘贴。

### 前端分层（依赖单向）

```
App.tsx       装配与 hooks 调用，禁止持有领域业务 state
  ↓
hooks         数据层单一来源（useSidecar / useSessions / useSession / useFileTree / useModels）
  ↓
lib           纯逻辑：api.ts（HTTP/SSE 客户端）、types.ts、sessionActions.ts、utils.ts、platform.ts
  ↓
components    展示组件，只接收 props 与 hooks 返回值，不直接 fetch
```

### sidecar 分层（依赖单向）

```
index.ts      只做装配：HTTP 路由、认证、生命周期
  ↓
registry.ts   会话封装与命令分发
  ↓
sessions.ts / fs-api.ts / models.ts   独立能力模块
```

### 契约

- 前端 `app/src/lib/types.ts` 与 sidecar `app/sidecar/src/types.ts` 是同一协议的镜像，改动一侧必须同步另一侧，并同步 `lib/api.ts` 的 `SidecarClient`。
- 会话数据与 pi CLI 共享 `~/.pi/agent/sessions/` JSONL 文件，格式变更必须兼容 pi 本体（`pi/` 与 `pi-web/` 仅本地参考）。
- sidecar 协议变更必须通过 `smoke.mjs` 集成验证。

---

## 三、状态与数据流

1. 会话、文件树、模型等数据只经 hooks 获取，组件不直接 fetch、不手写轮询。
2. SSE 解析收敛在 `lib/api.ts` 的 `subscribeEvents`，业务层只消费事件对象。
3. 同一份数据在客户端只有一个权威来源。
4. 调试信息走统一调试总线，禁止在业务逻辑 `console.log`（sidecar 的 `PI_SIDECAR_READY` 协议输出除外）。

---

## 四、测试

- sidecar 纯逻辑（sessions JSONL 解析、registry 命令分发、fs 路径校验）用 `bun test` 覆盖。
- 前端纯逻辑（api.ts SSE 解析、sessionActions、utils、types 契约）必须有单元测试。
- bug 修复必须先写复现测试，再改代码。
- sidecar 协议集成验证用 `smoke.mjs`。

---

## 五、安全与本地边界

1. 永远是本地工具：不部署云端、不多用户、不引入鉴权体系。
2. sidecar 只监听 `127.0.0.1`，所有请求必须带 `X-Pi-Token`（或 query `token`）。
3. 文件 API 必须校验 root 相对路径，防路径穿越。

---

## 六、命名与 Git

命名遵循用户级 AGENTS.md（camelCase 变量/函数、PascalCase 组件/类）。

Git：
- Conventional Commits：`type(scope): 中文描述`，一句话说清改动。
- 禁止任何 AI 生成相关字样。
- 新增依赖必须在提交说明写明理由。
- 推送远程需工程师明确同意。

---

## 与 AGENTS.md / CLAUDE.md 的关系

- AGENTS.md（用户级）：通用行为规范，冲突时以 AGENTS.md 为准。
- CLAUDE.md（项目级）：架构说明与常用命令。
- 本文件：项目级开发规则，把「简约、模块化」量化到本项目的三层架构。
