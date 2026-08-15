# Yunfeng Mobile 项目规则

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

- 后端 TS 模块 ≤ 400 行
- 前端 TS/TSX 模块 ≤ 300 行
- CSS 文件 ≤ 300 行（设计 token 文件除外，如 `index.css` 的 @theme 与 docs/design/yunfeng-tokens.css）
- 单个函数 ≤ 50 行

超过即拆。存量超标文件（见 TODO）分批拆分，禁止一次性大爆炸重构。

---

## 二、模块化（薄客户端，后端集中在电脑侧）

```
移动端 (app/src) ──REST/SSE──▶ yunfeng-gateway ──▶ yunfeng-server（任务/对话/Agent）
       └────────REST/WS───▶ yunfeng-mobile-backend（配对 + 远程屏幕）
```

1. 移动端只做 UI 与 API 调用，禁止在设备内启动 sidecar 或其他后端进程。
2. 设计语言与桌面端统一：颜色/圆角/阴影必须引用 `docs/design/yunfeng-tokens.css` 的 `--yf-*` token，禁止新增语义色硬编码。
3. 一个模块只做一件事，名字能概括它的全部职责。
4. 模块边界即文件边界；依赖单向、无环。禁止反向依赖、循环依赖。
5. 跨模块共享的类型/常量必须从公共模块显式导出，禁止复制粘贴。

### 前端分层（依赖单向）

```
App.tsx       装配与 hooks 调用，禁止持有领域业务 state
  ↓
hooks         数据层单一来源（useGateway / useTasks / useTask / useModels / useRemoteDesktop）
  ↓
lib           纯逻辑：gateway.ts（HTTP/SSE 客户端）、types.ts、utils.ts、platform.ts
  ↓
components    展示组件，只接收 props 与 hooks 返回值，不直接 fetch
```

### 契约

- 移动端 `app/src/lib/types.ts` 与 yunfeng-server 任务 API / yunfeng-gateway 路径白名单保持镜像；接口变更需同步更新实现、测试与文档。
- 移动后端协议只保留配对、设备管理与远程桌面；Agent 命令不再经移动后端转发。
- 网关协议变更必须通过 gateway 的 node --test 集成测试验证。

---

## 三、状态与数据流

1. 任务、对话、模型等数据只经 hooks 获取，组件不直接 fetch、不手写轮询。
2. SSE 解析收敛在 `lib/gateway.ts` 的订阅函数，业务层只消费事件对象。
3. 任务与对话的事实来源在电脑侧；移动端只有 UI 临时状态，不维护冲突副本。
4. 调试信息走统一调试总线，禁止在业务逻辑 `console.log`（后端 READY 协议行除外）。

---

## 四、测试

- 移动端纯逻辑（gateway.ts 请求/SSE 解析、utils）用 Vitest 覆盖。
- 移动后端（accounts/config/desktop/hub 集成）用 node --test 覆盖。
- bug 修复必须先写复现测试，再改代码。
- 后端协议集成验证用 `yunfeng-mobile-backend/test/smoke.mjs`；网关协议用 `gateway/test`。

---

## 五、安全与本地边界

1. 默认局域网本地工具；移动协同是工程师确认的扩展边界，不部署云端。
2. yunfeng-gateway 对外监听局域网，必须启用 Bearer token，默认只开放任务/会话/模型路径。
3. yunfeng-mobile-backend 的 REST/WS 必须设备 token 认证，token 只存 sha256；配对码单次使用。
4. 已移除的 sidecar 文件 API 不再由移动端调用；如需文件能力应经网关显式开放并重新评估路径校验。

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
