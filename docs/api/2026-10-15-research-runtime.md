# 本地科研自主任务 API

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `POST /api/tasks`、`POST /api/tasks/:id/commands`、`GET /api/tasks/:id/conversation`、`GET /api/tasks/:id/events`、现有 interventions 接口 |
| 用途 | 创建、观察、暂停与继续本地科研自主任务 |
| 调用方 | 桌面工作台；兼容客户端 |
| 提供方 | Yunfeng Server，`server/src/research/` |
| 稳定性 | 实验性 |
| 引入版本 | 0.1.0，2026-10-15 |
| 维护方 | Yunfeng Server |
| 接口类型 | 既有 HTTP/SSE API |
| 调用方式 | 本机 Server 的 `/api` 前缀；网关转发沿用现有约定 |
| 权限或认证 | 本机 Server 沿用现有访问规则；网关使用既有 Bearer 认证；实验动作额外校验任务权限或计划授权 |
| Content-Type | 请求与普通响应 `application/json`；事件 `text/event-stream` |

## 请求

创建任务沿用 `POST /api/tasks`，以下字段用于科研模式。

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| mode | body | string | 否 | development | development / research | 科研模式进入自主 Runtime |
| cwd | body | string | 否 | Server 当前目录 | 必须为存在的目录 | 以真实路径作为项目与记忆范围 |
| message | body | string | 科研时是 | — | 非空，最多 10000 字符 | 原始目标；不会因反思自动替换 |
| model | body | object | 否 | 项目环境或 Lin 默认模型 | provider、modelId 字符串 | 当前节点的 Pi 规划/反思模型 |
| decisionModel | body | object | 否 | 同 model；未指定时使用默认模型 | provider、modelId 非空，分别 ≤200 字符 | 独立决策模型，用于目标树局部提案；可配置小模型 |
| decisionBudget | body | number | 否 | 10 | 有限数值，0 < 值 ≤1000 | 相对估计成本总预算；不表示金额或 GPU 时间 |
| skills | body | string[] | 否 | [] | 最多 5 个唯一名称，匹配 `[a-z0-9][a-z0-9-]{0,63}` | 显式选择科研方法文本；不会授予工具或命令权限 |
| maxCycles | body | integer | 否 | 20 | 1–1000 轮 | 本次规划预算 |
| permissions.commands | body | object[] | 否 | [] | 最多 20 项；program ≤500 字符；args 最多 32 项，每项 ≤2000 字符，无 NUL | 完整程序和参数精确匹配的预授权命令 |
| permissions.writeRoots | body | string[] | 否 | [".lin/experiments"] | 最多 8 个项目内相对目录，每项 ≤500 字符 | 自动写入范围，不覆盖目录自身 |

科研任务 commands 支持 `abort` 暂停、`retry`/`reopen` 继续、`prompt`/`steer`/`followUp` 补充目标、`setModel` 切换并暂停、`complete`/`archive` 人工关闭，以及空的 `getQueue`/`clearQueue`。补充后的总目标不得超过 10000 字符。人工关闭不表示指标实测通过；以 `autonomy.phase === COMPLETED` 判断自动验收。

桌面科研输入框统一以 `prompt` 补充目标，服务端中止当前工作、更新目标后重新观察；暂停与继续集中在状态栏。轮次、运行依据和项目目录通过“运行详情”查看。

任务显式模型优先；未指定时，仓库根 `.env` 的 `YUNFENG_MODEL_PROVIDER` 与 `YUNFENG_MODEL_ID` 优先于 Lin 默认设置。宿主环境变量优先于文件，凭据仅服务端加载，修改后重启后端。`YUNFENG_ENV_FILE` 可指定其他环境文件；不读取 Pi 配置。

批准/拒绝使用既有 `POST /api/tasks/:id/interventions/:requestId/resolve`，body 为 `{"decision":"approve"}` 或 `{"decision":"reject"}`。确认卡展示计划全部步骤、写入内容与验收条件；批准仅适用于该次完整计划，执行或暂停后失效。

## 响应

创建成功返回 HTTP 200，`{task,sessionId}`；普通查询与 commands 沿用既有响应结构。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| task.mode | string | 科研时是 | research | 调用方无需打开普通 Pi 会话 |
| task.sessionId | string | 是 | research- 前缀的外层运行标识 | 不是 Pi JSONL 会话 ID |
| task.autonomy | object | 科研时是 | schemaVersion 为 1 | TaskStore 的检查点摘要 |
| autonomy.goal | string | 是 | ≤10000 字符 | 当前研究目标 |
| autonomy.phase | string | 是 | OBSERVING / PLANNING / EXECUTING / WAITING / REFLECTING / PAUSED / COMPLETED / FAILED | 自主阶段 |
| autonomy.cycle、maxCycles | integer | 是 | 轮次 | 已用与当前上限 |
| autonomy.reason | string | 是 | 文本 | 当前阶段依据或错误 |
| autonomy.plan | object | 否 | decision、reason、steps、success_condition、observe_paths | 最近计划；观察文件最多 8 个 |
| autonomy.jobId、approvalId | string | 否 | 活跃时提供 | 作业或待授权请求 |
| autonomy.result、lastResult | object | 否 | job_id、status、output、evaluation、completedAt | 当前待反思或上一作业结果 |
| autonomy.component | object | 否 | component=research、revision、state、可选 result | execute 发布的任务专属科研展示快照，见下文 |
| autonomy.learning | object | 否 | summary、knowledge_update、next_question | 最近候选学习；最多 8 条知识更新 |
| autonomy.permissions | object | 是 | 同请求清单 | 当前执行范围 |
| autonomy.decision | object | 新任务是；旧任务规划后是 | mission、nodes、horizon、selectedId、budget、reason | 持久化目标树及决策依据 |
| autonomy.skills | string[] | 否 | 同请求的名称列表 | 暂停与服务恢复后沿用选择；旧任务省略等同 [] |
| autonomy.decisionModel | object | 否 | 同请求模型 | 显式指定的决策模型 |
| autonomy.trigger | object | 接收首个 Hook 批次后是 | receivedAt、signals，最多 32 项 | 最近触发原因；通知不能充当实测指标 |

`observation` 完整事实保存在服务端检查点，不通过任务摘要返回。作业 status 为 running / succeeded / failed / cancelled / interrupted。验收引用项目普通文件，或 JSON 有限数值字段与 `>`、`>=`、`<`、`<=`、`==` 的比较；数值字符串不算达标。

`decision.mission` 包含 id=mission、objective 和首次确定后锁定的 condition。`nodes` 最多 100 项，每项有 id、parent、objective、kind（group/explore/execute）、priority、confidence、cost、expected_gain、status、attempts，以及执行后的 fingerprint、jobId 和精简 result。节点身份和状态由服务端维护，父节点必须是 mission 或分组，最多四层。status 为 pending/running/succeeded/failed/blocked；分组仅用于目标层级，不单独执行或宣称实测通过。

模型滚动提案引用已有节点 ID 时，只更新尚可尝试节点的评分估计；原目标、父节点、类型、尝试次数和结果不重置。plan 的 write_file.content 必须是字符串，JSON 文件内容须先序列化。JSON 或阶段结构错误最多请求模型纠正一次，仍受同一阶段时限约束；认证或服务错误不触发结构纠正。

收益、成功概率和成本均为 0–1 的模型估计；priority=`expected_gain*0.5+confidence*0.3-cost*0.2`。horizon 为评分最高的最多五个可执行节点 ID；selectedId 是本轮选择。规则仅选择正评分、预算允许、尚未成功且未耗尽两次尝试的节点。预算 spent 在副作用前预留，成功、失败或中断均不退还。反思文本不能改变实测结果。

模型 plan 的 complete 仅验收当前节点；服务端 Plan 可包含 node_id、mission_complete 或 pause，客户端不得通过模型输出直接设置这些字段。整个任务只在锁定的长期验收条件实测通过后结束。没有验收条件、没有候选、需要人工信息、停止探索或出现无效重复时暂停；wait 等待真实事件。补充人工目标时重新建立树，保留已用成本；普通 retry 不重置尝试次数、预算或验收条件。

科研 conversation 返回 `{context:{messages,entryIds}}`，内容来自已有任务事件；SSE 的 `message_completed` 带 `{message:{id,role,content}}`，`task_updated` 带检查点摘要。断线补发继续沿用事件 seq；客户端按消息 ID 去重。capabilities 仅列出 observe、plan、execute、reflect。

计划、决策评分与作业原始输出属于 `role=tool` 的过程记录，对话默认过滤。`role=assistant` 仅播报实际实验结论、失败后的处理事项与一次最终验收通知；无副作用的中间核验不追加反思消息。反思与下一问题仍写入检查点和候选记忆。用户消息保留。历史快照将旧助手角色的固定过程前缀映射为 tool，不改写原事件；客户端过滤旧 SSE 补发的对应前缀、历史自动追问、连续同文结论和紧接实验结论的完成流程复述。运行卡显示简短阶段进展，内部依据和目录在详情中查看；失败、人工问题与具体计划授权保持可见。

`trigger.signals` 每项包含 hook、reason、event。event 有 id、occurredAt，以及 kind：lifecycle（action=started/resumed/recovered）、files_changed（最多八个项目内 paths）、job_completed（jobId、status）、approval_granted（requestId）、pi_extension（action=facts_changed、taskId、paths）。这些事件来自受信任的本地适配器；没有新增 HTTP 事件注入接口。Hook 筛选通知，Context Builder 重读真实状态，Decision Layer 判断是否值得行动。具体模块见 [Hook 说明](../../server/src/research/hooks/README.md)。

## 选择科研 skill 与 Pi 事件

```json
{"mode":"research","message":"设计并验证本地实验","skills":["experimental-design"]}
```

名称按项目 `.lin/skills/<名称>/SKILL.md`、项目 `.agents/skills/<名称>/SKILL.md`、Lin Agent 的 `skills/<名称>/SKILL.md` 顺序解析，首个存在文件优先。拒绝越出对应资源根的链接、非普通文件、无效或不同名的 SDK 元信息；单文件≤32 KiB，所选正文总计≤64 KiB。创建时校验失败沿用 task_create_failed / HTTP 500，不创建任务。恢复时重新加载并核验已保存的名称，资源失效会使模型阶段失败并停止任务，不静默丢弃选择。资源文本会发送给所选模型。

仅选中文本注入 Pi 资源上下文；未选中 skill、引用文件和辅助脚本不自动载入。模型直接工具保持禁用，脚本或文件修改须生成既有 execute 计划并通过权限、授权和实测验收。任意磁盘扩展和资源包不会自动执行。

受信任的服务内调用：

```typescript
const accepted = getResearchService().notify(taskId, ["control.json"]);
// 内置 Pi 扩展使用同一任务的 EventBus：
pi.events.emit("research:changed", { paths: ["control.json"] });
```

该入口只接收最多八个当前观察文件名称，不接收任务状态、指标、验收或执行步骤。任务身份由宿主闭包绑定。`accepted=true` 表示通知已接收，随后合并、重新观察并交给决策层；事实不变时不请求模型。暂停、完成、关闭、不存在运行实例或路径不在观察范围时返回 false。没有新增 HTTP 接口、授权类型或外部执行能力。

内置扩展还转换 `agent_start` / `agent_settled` 生命周期通知，附 taskId、sessionId、phase；Hook 默认拒绝其唤醒，因此不进入持久化 trigger，不增加任务轮次。`pi_extension/facts_changed` 才可入队，随既有 TaskStore / SSE 保存最近触发批次。瞬时队列不保证跨重启恢复；恢复后重新观察项目。

## 科研组件更新

Pi 计划可加入 `{"action":"update_component","component":"research","patch":{...}}`。沿用原有 execute 作业、授权、取消和顺序执行机制；该步骤计入每计划最多八步。组件身份由 Runtime 绑定当前任务和作业，Agent 不能指定其他 taskId、jobId、验收结果或 revision。

| patch 字段 | 类型 | 必填 | 约束与含义 |
| --- | --- | --- | --- |
| source | string | 是 | 项目内 JSON 报告相对路径，≤500 字符；普通文件≤64 KiB，沿用敏感路径与符号链接校验 |
| progress | object | 否 | `{label,current,total?,unit?}`；current/total 是报告字段路径，读取有限数值；current≥0，total>0 且 current≤total |
| metrics | array | 否 | 1–6 项 `{label,key,unit?}`，key 读取有限数值；保留原单位和值，百分数不自动乘 100 |
| conclusion | object | 否 | `{summary,details?}`，均为报告文本字段路径；读出的 summary 非空≤500 字符、details 非空≤8000 字符；限制与待办应放在 summary 中保持可见 |

至少提供 progress、metrics、conclusion 中一项。字段路径使用点号，最多200字符，拒绝原型字段；label 最多40字符，unit 最多16字符，文本不得含 NUL。未知字段、数值字符串、直接填写的指标数值和非法进度均原子拒绝。报告应由授权的真实实验生成，组件步骤只读取数据；文件来源可核对，不构成对实验方法或科学结论的独立验证。

一次更新发布 source 中的一份展示快照；省略项在新快照中为空，不拼接旧报告。相同作业、相同数据重复提交不递增版本。返回的 `autonomy.component` 为 `{component:"research",revision,state:{jobId,source,updatedAt,progress?,metrics,conclusion?},result?}`；revision 从1递增，updatedAt 为读取报告的时间。`result` 仅由 Runtime 附加对应作业的真实结果，完成时版本再次递增；后续整体目标核验不会覆盖该实验的节点验收。前端以任务 SSE 快照更新，进度与指标为轻量胶囊，结论摘要保持可见，报告来源、详细过程和作业输出默认折叠。

示例（字段必须已存在于实际报告中）：

```json
{"action":"update_component","component":"research","patch":{"source":".lin/experiments/report.json","progress":{"label":"实验","current":"done","total":"total"},"metrics":[{"label":"体积减小","key":"reduction","unit":"%"}],"conclusion":{"summary":"summary","details":"details"}}}
```

该步骤可在一次实验命令完成后发布，也可在多个授权阶段之间发布进度；当前不会在长命令运行中自动扫描报告，不引入模型轮询。执行时缺失报告、字段校验失败或组件未绑定作业会使作业失败，已完成的前序实验副作用保留，展示快照不被无效数据替换。失败、中断与未通过状态保持可见；已有组件结论时省略同一作业的重复助手结论，内部反思和记忆继续保存。

组件快照与所属任务检查点一同持久化；暂停、继续、重连和重启读取原快照，不重放组件步骤或实验命令。服务重启时未知作业的对应展示标记为中断。组件只读项目报告，不要求扩大命令或文件写入权限，计划内其他动作仍逐项授权。没有新 HTTP 更新端点、Tauri 权限、依赖或跨任务共享存储。

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| 400 / bad_request | 无效 mode、缺失目录、非法 commands 或 decision | 修正后 | 更正请求字段 |
| 404 / task_not_found | 任务不存在 | 否 | 刷新列表 |
| 404 / intervention_not_found | 授权不存在、已处理或暂停后失效 | 否 | 等待新的具体计划 |
| 500 / task_create_failed | 项目不是目录、目标/权限/预算/skill 选择无效、容量满或初始化失败 | 条件满足后 | 查看 message，修正配置或释放容量后重试一次 |
| 500 / command_failed | 科研不支持该命令、补充目标过长或容量满 | 条件满足后 | 更正命令；保留检查点后手动继续 |

模型输出无效、决策超时或执行提交失败通过 FAILED 阶段报告，HTTP 创建成功不代表随后实验成功。禁止客户端自动无限重试创建或继续。

模型服务报错时，`autonomy.reason` 包含 decide/plan/reflect 阶段、可识别的 HTTP 状态码与固定诊断。HTTP 401 提示检查 Lin 模型凭据，403 提示账户权限，429 提示稍后手动继续；不返回上游错误正文，避免泄漏凭据与内部地址。

## 权限与安全

决策模型与 Pi 从 Lin 目录读取模型配置与认证。每次 decide/plan/reflect 使用临时无工具会话，禁用扩展、技能、上下文文件和提示模板。Decision Layer 用结构化提案维护树，模型不能直接访问文件或执行系统命令；文件内容作为观察数据传入。

既有模型列表与文件接口将未归档科研任务的项目目录纳入允许根，来源为 TaskStore；无需创建普通 Pi 会话。创建和归档即时生效，目录外路径与符号链接的真实路径校验继续适用。

读取和写入路径限制在项目内，拒绝符号链接、`.git`、`node_modules`、环境变量文件、认证文件和私钥；路径校验并非抵御并发恶意替换的操作系统沙箱。命令使用 `shell:false` 和参数数组，获准程序仍具有本机权限，也可访问项目之外的系统资源。不要将凭据写入目标、参数、观察文件或输出；计划、结果和候选经验会持久化。

## 行为约束

- 执行器返回作业身份后进入 WAITING，结果先持久化再进入作业 Hook。文件 Hook 跟踪最多八个文件，优先长期验收路径、节点验收路径、observe_paths、已观察文件和 README/package.json；最多监听项目根及前三个路径的最近既有父目录，不递归。相同内容和未跟踪文件不唤醒；父目录创建事件重绑，订阅后回读一次关闭观察间隙。监听在工作和等待期间持续保留。
- Hook 队列最多 32 项，最近 128 个通知 ID 去重，文件路径合并最多八项；文件扫描和 Hook 文件派发各有一次性 50 ms 合并窗口，无定时模型轮询。每次只运行一个决策单元，繁忙、作业运行或审批等待时保留通知。排队期间事实已被观察过时跳过模型，不消耗轮次；Decision Layer 选择 wait 时不调用 Pi 规划。
- 单服务最多 4 个活跃自主任务与 4 个作业，计划每次最多 8 步并顺序执行。每次 decide/plan/reflect 120 秒超时，作业总时限 30 分钟；输出保留最后 65536 字符，观察与单次写入文件限制 64 KiB。
- 默认预算 20 轮；用完后暂停。继续时将轮次上限提升至至少当前轮次加 20，成本预算不增加。每轮提出最多五个任务和五个分组，只执行一个节点后重新观察。同一观测文件和 Git 状态下，相同步骤不重复执行，更换验收阈值不能绕过限制；改变项目输入仍受每节点两次限制。节点通过后继续核验长期目标，只有整体实测条件通过才结束。
- 暂停取消当前决策与作业并关闭监听。POSIX 回收命令进程组；Windows 当前仅保证直接子进程，后代进程需后续原生验证。已完成的文件写入不会回滚。
- 检查点先于副作用保存。服务异常重启时未知作业标记 interrupted 并暂停，继续后先反思，禁止自动重放命令。正常关闭也保存暂停状态。无作业、无待授权的活动检查点可在服务恢复时继续，容量之外的任务暂停。
- 最新触发批次随检查点和任务事件记录持久化；排队通知在内存中，恢复 Hook 重新读取状态，不保证离线期间的每个瞬时事件。文件 Hook 出错会暂停任务；任务状态、助手消息不会反向触发思考。审批 Hook 只继续已确认计划。
- 创建没有幂等键，重复调用产生不同任务；授权按请求 ID 校验，旧请求不能复用。memory.read 映射既有 MemoryService.retrieve，memory.write 映射 add；反思将知识写为候选 episode，按 job_id 去重，不自动确认候选。
- 仅实现本地项目：文件、Git、任务、基础系统内存与实验结果。GPU、传感器、issue 服务与训练平台未接入，不能推定其状态。没有新增线程池或第三方运行时依赖。

```mermaid
sequenceDiagram
  participant UI as 工作台
  participant R as Runtime
  participant H as Hook Layer
  participant D as Decision Layer
  participant P as Pi 节点规划
  participant J as 本地作业
  UI->>H: 启动、继续或授权事件
  H->>R: 合并批次，等待运行单元空闲
  R->>R: observe 真实状态
  R->>D: 当前状态、目标树和预算
  D-->>R: 合并局部候选，规则选择一个节点
  R->>P: plan 节点、状态和约束
  P-->>R: 可执行计划和验收条件
  R->>J: execute 授权计划
  J-->>R: job_id / running
  R-->>UI: WAITING
  J-->>R: 持久化实测结果
  J-->>H: 完成事件
  H->>R: 唤醒核验与反思
  R->>P: reflect 结果
  P-->>R: 候选知识与下一问题
  R->>D: 实测结果更新节点状态
  R->>R: 保存记忆，构建此事件的最新上下文
```

## 调用示例

以下为契约示例；可控决策下的真实本地作业已由核心测试覆盖，真实模型输出质量需独立验收。

```json
{"mode":"research","cwd":"/example/project","message":"核验实验 accuracy 至少 0.93","maxCycles":20,"decisionBudget":10,"decisionModel":{"provider":"local","modelId":"decision-small"}}
```

模型名为契约示例，实际需在 Lin 模型配置中存在且可用。省略 decisionModel 时沿用任务模型。Decision Layer 提案示例：

```json
{"decision":"select","reason":"先处理低成本的数据问题","mission_condition":{"kind":"metric","path":".lin/experiments/metrics.json","key":"accuracy","operator":">=","value":0.93},"candidates":[{"key":"clean","parent":"mission","objective":"核查错误标签并做对照实验","kind":"explore","confidence":0.8,"cost":0.2,"expected_gain":0.9}]}
```

Pi plan 示例（验收当前选中的节点）：

```json
{"decision":"complete","reason":"项目结果已存在，进行实测核验","steps":[],"success_condition":{"kind":"metric","path":".lin/experiments/metrics.json","key":"accuracy","operator":">=","value":0.93}}
```

暂停：`POST /api/tasks/:id/commands`，body `{"type":"abort"}`；继续：相同接口，body `{"type":"retry"}`。

## 兼容性与变更记录

新增可选 mode 与科研检查点，默认开发模式保留既有调用行为。TaskState 的检查点 schemaVersion 为 1，不迁移旧数据，也不将科研运行身份交给 Pi 会话接口。客户端需容忍可选字段；移动端尚未增加科研专用控制面板。废弃计划：无。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-15 | 0.1.0 | 兼容 | 本地科研自主任务、检查点、事件、计划授权 | 既有调用无需迁移；新客户端显式选择 research |
| 2026-10-15 | 0.1.0 | 兼容 | 目标树、决策模型、规则评分与预算 | 可选新增字段；旧任务下轮规划时建立树，未知作业恢复规则不变 |
| 2026-10-15 | 0.1.0 | 兼容 | 本地 Hook 层、事件上下文、去重与背压 | 新增可选 trigger；既有 API 不变，旧检查点恢复时重新观察 |
| 2026-10-15 | 0.1.0 | 修复 | 科研任务项目目录识别与模型失败诊断 | 无字段变更；错误原因仅公开固定诊断与状态码 |
| 2026-10-15 | 0.1.0 | 修复 | 项目环境配置、模型结构纠正与滚动节点身份 | 无持久化字段变更；显式任务模型继续优先 |
| 2026-10-15 | 0.1.0 | 修复 | 科研过程消息按工具记录过滤，反思面向用户 | 沿用已有消息角色；历史事件不改写，兼容旧快照与补发 |
| 2026-10-16 | 0.1.0 | 兼容扩展 | execute 发布任务专属科研组件，展示报告进度、指标和结论 | 新增可选 autonomy.component 与计划步骤；旧检查点无需迁移 |

| 2026-10-18 | 0.1.0 | 兼容扩展 | 显式科研 skills 与 Pi 内置事件桥 | skills 可选，旧任务不加载；通知只引用当前观察文件，自身生命周期不唤醒 |

2026-10-16 验证：Server 构建与前端 TypeScript 通过，18 项服务端核心测试和 5 项 React 核心测试通过。macOS 开发应用中，真实 Pi 按 execute 计划发布基线报告（实验 1/2），暂停并重启后快照保留；继续后执行一次优化并发布实验 2/2，压缩体积从 8686 降至 7736 字节（减少 10.94%），解压一致且 completed==1。日志仅有 baseline、optimize 各一次，最终结论由胶囊与报告摘要展示，对话未重复输出同轮反思。原生展开详情、Enter 收起通过；重载时仍存在既有 HTTP 502，需要一次手动重连。其他桌面平台和长命令内的实时报告刷新尚未验收。

### 任务内关系图组件

`POST /api/tasks/:id/components/research-graph` 沿用组件请求形状：

```json
{"action":"focus","component":"research-graph","target":"current"}
```

支持 `read`、`status`、`focus`、`blur`。`target` 为当前任务真实节点 ID、`mission` 或 `current`（服务端解析当前节点）。不存在的节点或跨组件请求返回 HTTP 400；非科研任务返回 404。该接口沿用任务接口的本机访问边界，不访问项目外文件，也不执行实验或改变目标树。

`read` 返回 TaskStore 中的目标树、临时 `focus` 和 `interaction`。`status` 返回 `known/visible/editing/yielded/rendered/renderedRevision/focusedRevision`。`focus` 返回 `accepted`；画布不可见或反馈超过 2.5 秒时拒绝并返回 `INTERACTION_UNAVAILABLE`，工程师操作时返回 `COMPONENT_BUSY`。拒绝不排队。接收不等于已呈现：客户端实际定位后报告 `focusedRevision`；聚焦请求两秒失效，重启不重放。未打开关系图时不自动切换工程师的视图。

UI 通过同一路径提交 `{action:"report",report:{sequence,visible,editing,renderedRevision,focusedRevision,epoch}}`。序号须单调递增，版本不能超过当前任务或已发出的焦点版本；旧反馈忽略，非法反馈返回 400。拖动、缩放、点击和输入立即让出，松手后保留短暂保护，不回放旧请求。报告中的 `epoch` 回传服务提供的 `focus.epoch`（初次为 null），服务重启会更换 epoch，旧聚焦确认随即失效，前端自动重新同步。交互租约仅保存在内存，不写业务检查点；离开关系图上报不可见，断联后自动失效。这里使用有界心跳同步 UI 临时租约，不唤醒科研决策或调用模型。

科研 Agent 通过受控 `execute` 步骤调用：

```json
{"action":"focus_component","component":"research-graph","target":"current"}
```

该步骤计入现有八步上限；返回接收或让出原因进入执行结果，拒绝不会终止实验。observe 的 `component.research-graph` 事实包含交互反馈，遇到让出原因不得立即重试争抢视野。程序可以直接使用上述组件 API；服务端亦提供 `ResearchGraphComponent.client()` 复用 `componentClient`。

每个决策节点可选保存 `report`（科研组件快照）和 `reflection`（本次作业反思摘要），与节点 `jobId` 绑定。报告仍只允许从授权的真实 JSON 产物读取，验收由 Runtime 计算；节点采用较大的半粗体标题与灰色小字概述，由目标原文拆分，概述最多两行、完整文本悬停查看；点击节点在周围展开胶囊：状态与进度位于上方，最多两项指标和单行结论位于下方；长结论悬停查看原文。重复点击、点击画布空白或 Escape 收起，胶囊随节点平移缩放定位，使用轻量淡入淡出，系统减少动态效果时即时切换；节点固定预留上下胶囊空间，展开不触发画布重排。旧检查点无这些字段时仅展示已有状态与进度，不从最新的其他实验补造数据。新字段可选，无需迁移旧任务。


### 数据库与节点关系调整

科研检查点及节点关系统一持久化到 Server 数据目录的 `research.sqlite`；节点表具有任务范围内的父节点外键，图关系不再由前端或 JSON 副本管理。首次启动导入旧科研 JSON，保留原文件作迁移备份，后续以 SQLite 为准。检查点、节点历史与关系在单事务更新，失败回滚；重启按同一数据目录恢复。需要 Node ≥22.13 的内置 `node:sqlite`，不增加数据库服务。普通开发任务与事件日志保持既有存储方式。旧 JSON 备份不包含升级后的最新进度，降级需先导出数据库中的检查点，不应直接用旧服务接管该目录。

复用 `POST /api/tasks/:id/components/research-graph`，认证和任务隔离沿用上述组件接口。`read` 返回 `{component,revision,state,focus,interaction}`，`state` 是该任务的目标树。调用方须容忍可选字段扩展。

```json
{"action":"read","component":"research-graph"}
```

读取版本后，用真实节点 ID 调整父节点：

```json
{"action":"move","component":"research-graph","node":"experiment-id","parent":"group-id","revision":12}
```

| 字段 | 类型 | 必填 | 约束与含义 |
| --- | --- | --- | --- |
| action | string | 是 | 固定 move |
| component | string | 是 | 固定 research-graph |
| node | string | 是 | 当前任务已有节点 ID，非空 ≤100 字符；不允许 mission |
| parent | string | 是 | mission 或当前任务已有分组 ID，非空 ≤100 字符 |
| revision | integer | 是 | read 返回的非负安全整数版本；不允许覆盖更新后的快照 |

成功为 HTTP 200，返回最新组件快照并通过 `task_updated` SSE 发布关系；不会启动实验、恢复任务或自动移动画布。相同版本下重复指定相同父节点无额外副作用；版本过期须重新 read，不盲目重试。HTTP 404 为科研任务不存在；HTTP 400 的 `{error}` 包含非法字段、跨任务/未知节点、循环、非分组父节点、超过四层，以及 `GRAPH_CONFLICT`（版本变化）或 `GRAPH_BUSY`（规划/执行/反思中或作业/审批尚未结束）。仅在 WAITING/PAUSED/COMPLETED/FAILED 且无活动作业时允许外部调整。该操作同步事务保存，不创建后台作业；请求取消后需 read 确认是否已提交，禁止假定取消等于回滚。

Server 内调用可使用 `graph.client().move(node,parent,revision)`。科研 Decision Layer 无需发送 HTTP：结构化提案新增可选 `relations:[{node,parent}]`，每轮最多十条、每节点一条，候选合并后整批校验、保存。未知字段拒绝。模型通过现有决策节点选择该操作；执行 Agent 的四个元接口保持原样。关系调整保留节点 ID、类型、尝试次数、结果、报告、反思及预算，不允许移动正在执行的节点或包含它的分组；节点新增继续通过 candidates，删除不开放。未提供 relations 的旧提案与原有 read/status/focus/blur/report 调用继续兼容。

### 节点相关性 `relate`（可选）

复用 `POST /api/tasks/:id/components/research-graph`、网关认证与所属任务权限。Agent/程序调用 `graph.client().relate(node, revision)`，前端点击节点“相关性”胶囊按需分析；没有额外窗口或并行状态源。

```json
{"action":"relate","component":"research-graph","node":"mission","revision":42}
```

| 字段 | 必填 | 契约 |
| --- | --- | --- |
| action/component | 是 | 固定为 `relate` / `research-graph`，拒绝未知字段 |
| node | 是 | 当前任务真实节点 ID 或 `mission`，非空文本最多100字符 |
| revision | 是 | `read` 返回的非负安全整数版本，过期拒绝 |

HTTP 200 返回现有 `GraphSnapshot`。`state.mission.relevance` 或 `state.nodes[].relevance` 是可选新增字段，旧数据无需迁移。结构：

```json
{"status":"ready","source":"内容指纹","space":"向量空间指纹","model":"configured-embedding-model","matches":[{"target":"node-id","similarity":0.76,"relation":"abstraction","direction":"outgoing","confidence":0.8,"reason":"当前实验是目标中的一个具体实现"}]}
```

- `status`：`ready`（分析完成，可为空匹配）、`unconfigured`（未配置）、`unavailable`（配置错误、服务失败或输出无效）。非 ready 状态均不伪造向量；非 ready 时 matches 为空，model/space 省略。
- `source` 是目标内容与层级的 SHA256；`space` 是端点与模型的指纹，不含凭据。结果与节点一起写入现有 SQLite 检查点，重启恢复；目标或层级变化后清除旧建议。未改变内容与向量空间时复用分析，指标状态变化不重复调用模型。
- `matches` 最多3项，只包含本任务已召回的其他节点。`similarity` 是同一向量空间归一化后的余弦值，范围 [-1,1]，**不是关系正确率**。首版只召回 >=0.35 的前三项，该阈值尚未针对项目语料校准，可能遗漏真实逻辑关系。
- `relation`：`progression`（先后递进）、`dependency`（逻辑前置依赖）、`abstraction`（具体到抽象）、`related`（主题相关）。`direction` 相对当前节点：`outgoing` 当前→target，`incoming` target→当前；`related` 固定 `undirected`。递进箭头从先到后，依赖箭头从前置到依赖方，抽象箭头从具体到抽象。
- `confidence` 范围 [0,1]，是决策模型的推断估计；`reason` 非空文本最多160字符。词向量只筛选，关系类型和方向由当前决策模型结合目标语义分类。缺乏依据可返回 related 或省略。建议不是实测因果，不直接改父子关系；Decision Layer 可参考后通过原有 relations 提案调整，并继续接受循环、层级、预算校验。
- 自动科研轮次在选定执行节点后分析该节点，每次最多一次分类请求（JSON 纠错最多一次）；下一轮决策能读取已保存建议。手动分析仅更新相关性，不唤醒实验、不执行命令、不消耗实验预算，但产生模型服务调用费用。
- HTTP 400 `{error}`：未知字段、节点不存在、无目标树、`GRAPH_CONFLICT` 版本变化或 `GRAPH_BUSY` 科研阶段/同任务分析正在运行；HTTP 404 为任务不存在或非科研任务；认证沿用现有网关。分析前后均检查版本和运行状态，过期结果不落库。
- 每任务最多一个手动分析、服务内最多四个并发手动分析，总超时35秒，Embedding 请求20秒；服务关闭中止请求，科研暂停中止自动分析。服务失败降级为 unavailable，不影响科研执行；同内容失败冷却60秒。节点文本每条最多取前4000字符，最多101条，向量维度1..8192且一致、有限非零，响应上限8MiB。原始向量仅在进程中缓存最多256条，不写入数据库、日志或前端。

#### Embedding 配置

项目 `.env` / 宿主环境的可选 `YUNFENG_EMBEDDING_URL`（完整端点）、`YUNFENG_EMBEDDING_MODEL` 必须同时指定，`YUNFENG_EMBEDDING_API_KEY` 按服务需要提供；配置后重启后端生效。URL 只接受 HTTPS 或本机回环 HTTP，拒绝内嵌凭据、查询参数、重定向。不会尝试将聊天模型当作 Embedding 模型，也不会自动读取 `.pi` 或复制聊天凭据。

该接口兼容 [Create embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create)：发送 `{model,input:string[],encoding_format:"float"}`，解析 `data:[{index,embedding:number[]}]`，若响应含 model 必须匹配。配置意味着将节点目标文本发送给选定服务，不发送文件内容、实验产物或密钥到分类上下文。上游正文和凭据不对外回显。

### Agent 节点标题与描述

节点与 mission 新增可选 `presentation:{title,summary}`，标题和描述均由当前决策模型总结。`title` 是最多32字符的非空单行文本（建议6到16个汉字），`summary` 是最多100字符的一句目的或方法概述；拒绝未知字段、空文本和换行。前端不再按标点拆分、截取执行指令作为标题或描述；生成前显示通用类型与“等待 Agent 总结”。摘要不是实测结论，完整 `objective`、验收条件、父子关系、作业与预算继续作为执行依据。

新规划在 `mission_presentation` 和候选 `presentation` 中提供摘要，服务端保存到目标树与现有 SQLite。既有节点只更新展示文字，不更换 ID 或完整目标；已有准确摘要由 Agent 沿用，状态变化不重复生成。字段可选保证旧记录和旧提案可读，无需数据库迁移。

旧节点补齐复用 `POST /api/tasks/:id/components/research-graph`：

```json
{"action":"summarize","component":"research-graph","revision":42}
```

Agent/程序可调用 `graph.client().summarize(revision)`；`action/component` 为固定值，`revision` 是必填的当前非负安全整数版本，拒绝其他字段。HTTP 200 返回现有 `GraphSnapshot`，一次最多补齐20个缺失摘要；没有缺失时不调用模型、不递增版本。已生成摘要通过 `read` 获取。

UI 打开关系图后仅在 WAITING/PAUSED/COMPLETED/FAILED 阶段补齐，后续批次随服务端快照逐批接续；失败显示紧凑重试入口，不持续轮询模型。摘要生成使用配置中的决策模型，不依赖 Embedding，也不使用项目文件、执行工具或修改验收结果；仅将节点 ID、类型与完整目标交给模型，产生一次模型调用费用，JSON 校验失败最多纠正一次。

认证和任务范围沿用关系图接口。HTTP 404 为任务不存在或非科研任务；HTTP 400 `{error}` 包括字段无效、模型或摘要结构失败、无目标树、`GRAPH_CONFLICT`（版本变化）和 `GRAPH_BUSY`（科研运行或同任务组件分析未完成）。和相关性分析共用每任务一项、服务内最多四项并发限制；模型总超时45秒，服务关闭时中止。保存前再次检查版本与运行状态，模型不得增删或遗漏本批节点，校验失败整批不保存。新字段为兼容新增，客户端应容忍缺失。
