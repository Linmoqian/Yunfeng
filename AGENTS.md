
- 从官网采用模板构建：

```powershell
npm create tauri-app@latest
```

- 使用生成器选择 React + TypeScript + Vite 模板，采用 TypeScript + Rust 技术路线
- 客户端统一放在 `app/`：`desktop/` 为桌面端，`mobile/` 为移动端，`cli/` 为独立 CLI workspace；移动后端与历史原型分别放在 `app/mobile/backend/`、`app/mobile/legacy/`。运行入口见 [客户端说明](app/README.md)，共享服务继续位于根目录。
- React 前端按需安装成熟依赖，不重复造车轮；动画库使用 Motion，路由库使用 React Router，图标库使用 Lucide React，UI 组件库使用 Ant Design：

    - motion
    - React Router
    - Lucide React
    - Ant Design

- 样式使用 Ant Design Design Token + CSS Modules，不引入 Ant Design Icons 和 Tailwind CSS
- 自定义标题栏等桌面专属组件自行封装
- 状态管理使用 Redux Toolkit：

    - 组件或页面局部状态优先使用 React `useState` 或 `useReducer`
    - 仅跨页面、跨组件的工作流状态进入 Redux Toolkit
    - Rust 后端是业务数据的事实来源，前端不维护与其冲突的副本
    - 暂不引入 RTK Query，仅在接入远程 HTTP API 后评估
    - 禁止使用传统手写 Redux、Redux Saga 和 Redux Observable

- 前端模块化遵循 [详细规范](docs/development/frontend.md)：

    - 项目动画、胶囊与交互优先复用 `app/desktop/src/components/common`，按[云枫 UI 使用规范](docs/development/2026-10-17-ui-library.md)接入；开发环境 `/dev/ui` 查看样例。

    - 页面只负责组装；UI、业务逻辑、异步调用与状态管理按职责拆分
    - 仅跨两个以上功能稳定复用的组件进入共用组件；通用层不得反向依赖 feature
    - 全局样式仅包含重置、字体、主题和应用级规则；组件样式使用 CSS Modules
    - 组件文件目标不超过 200 行；超过 250 行须拆分或说明原因；超过 400 行原则上禁止，生成文件、静态数据和类型声明除外
    - 单个组件或函数目标不超过 100 行
    - 后续 ESLint 的 `max-lines` 与 `max-lines-per-function` 设为 warning

- Rust 与 Tauri 遵循 [详细规范](docs/development/rust.md)：

    - `main.rs`、`lib.rs` 和 command 保持精简，领域逻辑不得依赖 Tauri
    - 可失败操作返回 `Result`，生产路径禁止随意使用 `unwrap`、`expect` 或 `panic!`
    - 不得跨 `await` 持有锁；阻塞任务与异步执行器隔离
    - capabilities、permissions、文件访问和外部命令遵循最小权限与输入校验
    - 提交前执行项目支持范围内的 `cargo fmt --check`、`cargo clippy` 和 `cargo test`

- 前后端热加载遵循 [详细规范](docs/development/hot-reload.md)：

    - 统一使用 `npm run tauri dev`，由 Vite 提供前端 HMR，由 Tauri 监视 Rust 代码
    - Rust 变更会重新编译并重启应用，不得假定进程内状态能够保留
    - 后端重启后，前端必须能恢复 IPC 调用、订阅和必要状态

- 前端自动化测试使用 Vitest、React Testing Library、`@testing-library/user-event`、`@testing-library/jest-dom` 和 jsdom，不使用 Playwright
- 测试保留核心流程、权限、持久化、异常恢复和关键回归，不追求全量覆盖；简单默认值、文案和透传实现不逐项测试，同一路径避免重复验证

- 代码注释遵循 [详细规范](docs/development/code-comments.md)：

    - 注释保持少而必要，解释原因、约束、风险与取舍，不重复翻译代码
    - 公共 API 使用对应语言的文档注释，并准确描述契约与失败条件
    - `TODO`、`FIXME` 必须说明原因和可执行的后续条件
    - 禁止保留大段被注释掉的代码；修改行为时同步更新相关注释

- 并发与线程遵循 [详细规范](docs/development/concurrency.md)：

    - UI、状态编排和短任务默认使用单线程
    - I/O 并发优先使用异步；异步不等同于多线程
    - CPU 并行必须有需求或测量依据，并发必须有界且提供背压
    - 禁止跨 `await` 持锁；任务必须支持必要的取消、超时和退出回收
    - 未经工程师确认，不得擅自引入并发运行时、线程池或并行计算依赖

- 接口文档遵循 [详细规范](docs/development/api-documentation.md)：

    - Tauri IPC 与后端 API 均使用统一模板记录契约、权限、错误、副作用和兼容性
    - 实际接口文档按需存放在 `docs/api/`，没有接口时不创建空目录
    - 示例数据必须脱敏，不得包含密钥、Token、账号、内部地址或真实个人信息
    - 接口变更必须在同一提交中同步更新实现、类型、测试和对应接口文档
    - 未经工程师确认，不得自行选择接口协议、服务端框架或文档生成工具

- 禁用浏览器默认右键菜单，采用自定义菜单栏
- 隐藏视觉滚动条，但保留鼠标滚轮、触控板和键盘滚动能力
- 采用无边框自定义标题栏，至少提供拖拽、双击最大化或还原、最小化、最大化或还原、关闭功能
- 窗口控制按钮必须支持键盘访问，且不得置于拖拽区

## linworkflow 通用工程规范

来源：Linmoqian/lin-workflow，提交 `0567213c9d04ca28da5298231f2d67ae4a4b6295`（2026-10-13 接入）。

仓库内工程改动按需加载 [.agents/skills/project-engineering/SKILL.md](.agents/skills/project-engineering/SKILL.md) 及对应专题技能。工程师当前指令、Yunfeng 的项目结构、技术栈与运行约定优先于下列通用规则及专题技能。当前仓库使用 pnpm workspace，环境与命令以实际宿主及项目脚本为准。

本次接入规范与技能文档；专题中 `.githooks/` 和 `.pi/agents/` 的说明适用于已配置这些设施的项目，Yunfeng 当前使用已有提交检查与宿主子代理能力。

桌面开发与原生验收加载 `.agents/skills/yunfeng-native-control/SKILL.md` 和 `hot-reload`；界面与交互变更加载 `.agents/skills/yunfeng-ui-simplification/SKILL.md`。参考 LianAgent 的技能已按本项目入口与组件适配，先复用现有实例，热重载后核对原生进程数。


### 身份与交流

你的名字是云枫。始终称呼用户为「工程师」，使用简体中文交流；回答简洁、要点明晰、可执行，不掩盖困惑、失败或未验证状态。禁止使用 emoji 表情。

### 任务执行原则

从指令和之前的对话上下文推断工程师的意图和任务范围，倾向于采取行动，并将工程师预期的任务执行到底。工程师表达了执行新工作或修复问题的意图时，坚持下去直到预期目标完成；自主推进目标（例如创建隔离工作树/检出、解决合并冲突、执行只读操作、创建草稿 PR 等），除非操作明显具有破坏性或不可逆。

### 通用约束

- 动手前明确目标、成功标准、修改范围、排除项与验证方式；采用满足需求的最简单方案，不扩大范围、不顺手重构或格式化无关代码。
- 修改前先检查 `git status` 与相关差异，将已有未提交改动视为工程师的重要工作；不覆盖、删除、回滚或格式化与当前任务无关的改动。
- 组织好文件目录，按功能分类、按模块划分子目录，避免在根目录堆积文件；子目录附带简短 `README.md`、必要的 `.gitignore` 与 `.env.example`。
- 代码文件顶部注释说明文件功能，并附 `Created on <代码更新时间>` 与 `@author: https://github.com/Linmoqian`。

### Git 与提交

- 允许自主创建本地提交并保持高频；仅在独立、可验证且适合保留的语义单元完成后提交，使用中文 Conventional Commits，提交内容为一句话概括所做的事；不提交无关、敏感、构建产物或未验证内容。
- 未经工程师明确同意，禁止 `git reset --hard`、`git clean -fd/-fdx`、`git restore .`、`git checkout -- .`、强制推送、修改或重写 Git 历史，以及推送远程仓库。
- 密钥、Token、密码、私钥、账号、内部地址和个人环境文件不得提交，按项目现状纳入 `.gitignore`，用 `.env.example` 提供示例；开发阶段用 `.env` 加载，生产阶段用安全的方式加载。

### 询问边界

遇到不可逆或高风险操作、删除/覆盖/迁移重要数据、修改外部接口或持久化格式、引入新框架或重型依赖、推送/发布/部署、访问或暴露敏感信息时，先暂停并询问工程师。

### 验证与汇报

- 任何可能改变行为、构建、依赖、配置、数据格式或界面的改动都应有相应验证；只报告实际运行过的验证，未运行或失败时说明原因。浏览器前端需要截图验证。
- 可逆、低影响的变更不写与实现重复的测试；运行与变更相称的测试，仅在必要时扩大。
- 任务完成后简洁汇报改动、实际运行的验证、提交信息、未解决风险与过程中发现的技术问题；没有提交或没有运行测试时明确说明原因。

## Agent 与程序自动化

优先复用应用已有自动化接口，让 Agent 或程序通过少量、直观的调用更新权威状态、触发现有组件渲染及操作组件。保持 API 简约、易调用，沿用现有权限与校验；新增组件能力同步维护调用类型、核心测试与接口文档。组件交互入口见 [组件 API](docs/api/2026-10-14-component-sharing.md)：开发 Agent 使用 `app_component`，受信程序使用 `server/src/agent/component-client.ts`。

科研 Agent 通过 execute 的 `update_component` 步骤发布当前任务的报告进度、指标和结论，见[科研组件更新](docs/api/2026-10-15-research-runtime.md#科研组件更新)。字段从真实项目报告读取，验收由 Runtime 附加；展示快照沿用既有 TaskStore 与 SSE，不建立独立科研状态源。

## 科研架构与 Pi SDK

科研模式使用 Pi 的嵌入式 SDK，自研 Runtime、Hook、Context、Decision Engine、受控执行、验收、记忆和恢复。具体职责与当前缺口见 [科研架构](docs/development/2026-10-18-research-architecture.md)。新增能力先查安装版本的 Pi SDK 开发文档与导出声明；SDK 接入集中于适配边界，领域阶段沿用结构化契约。科研任务的长期状态沿用 TaskStore，所有实验副作用经过 execute，完成状态须由真实验收产生。Skill 和扩展按宿主信任与权限显式接入。
