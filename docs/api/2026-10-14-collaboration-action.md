# 本地协作操作

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `collaboration_action` |
| 用途 | 查询和保存团队、消息、公告及链接；连接本机独立节点 |
| 调用方 | 工作区团队面板、设备档案 |
| 提供方 | 独立 yunfeng-team crate，Tauri collaboration 适配 |
| 稳定性 | 实验性，本地协作第一批 |
| 引入版本 | 0.1.0 |
| 维护方 | Yunfeng |
| 接口类型 | Tauri command |
| 调用方式 | 异步 invoke；SQLite 操作在现有阻塞池执行 |
| 权限或认证 | 本地 main 窗口，`allow-collaboration-action` |
| Content-Type | 不适用 |

## 请求

IPC 顶层参数为 `input`。未知 action、字段和错误类型由 Tauri/Serde 拒绝。

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| action | input | string | 是 | — | snapshot/create/message/board/member/relation/presence/activate/leave/nodeConnect/nodeDisconnect/nodeRefresh | 操作 |
| name、owner | input | string | create | — | 各 1–80 Unicode 字符，无控制字符 | 团队名称、本地显示名 |
| id | input | string | message/activate | — | UUID | 客户端消息幂等键或已存团队 ID |
| text | input | string | message | — | 去首尾空白后 1–4000 字符 | 消息正文 |
| announcement | input | string | board | — | 去首尾空白后 0–4000 字符 | 公告 |
| links | input | Link[] | board | — | 最多 16 条 | 整体替换链接集合 |
| links[].title | input | string | 是 | — | 1–80 字符，无控制字符 | 标题 |
| relation | input | {memberId:UUID,parentId:UUID/null} | relation | parentId 可省略为 null | 本机托管的成员，同队父成员，不得自指成环 | 管理员设置直属上级，null 表示解除 |
| status | input | string | presence | — | online/working/idle/offline | 仅续报当前安装成员的状态；须启用，不允许指定其他成员 |
| member | input | MemberInput | member | — | {id:UUID,profile:MemberProfile} | 创建或整体更新本机托管成员，完整字段见[成员契约](2026-10-17-team-node.md#成员接口与资料) |
| links[].url | input | string | 是 | — | 规范化后最多 2048 字节，HTTP/HTTPS、有主机、无登录凭据 | 链接 |

正文允许换行和制表符，拒绝其他控制字符。名称和内容均由 Rust 校验。

`nodeConnect` 使用 `{address:string,directory?:string}`。address 必填，仅允许完整 HTTP 回环 IP 与非零端口，不含凭据、路径、query 或 fragment。directory 省略时由 Rust 打开原生目录选择器；自动化可提供本机绝对目录。目录必须为该节点数据目录，含有效的64位十六进制 `control.token` 普通文件（Unix 权限0600，拒绝符号链接）。成功连接校验节点 ID 和地址后，原子保存绑定；失败保留原绑定。`nodeDisconnect` 无参数，移除绑定并返回原本地数据库快照，不停止节点；可重复。`nodeRefresh` 无参数，已连接时只查询节点快照，否则查询本地数据库。绑定节点时 create 的 owner 兼容接收但忽略，使用节点名称；activate/leave 拒绝，返回本地团队应使用 nodeDisconnect。

## 响应

成功返回提交后快照。除 connection 外字段必定返回，team 可以为 null。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| installationId | string | 是 | UUID | 当前数据源的安装或节点标识，不是网络认证凭据 |
| connection | object | 否 | {id:UUID,name:string,address:string,peerFailures:number} | 绑定节点时返回；id/name/address 为固定节点身份，peerFailures 为本次刷新失败的直接邻居数，普通查询/写入返回0；不代表成员在线 |
| mode | string | 是 | empty/local | 当前是否有本地团队 |
| team | Team/null | 是 | id/name/owner/members | 本地或节点团队成员名称，不作为身份依据 |
| savedTeams | Team[] | 是 | 最多 32 个 | 可恢复的本地团队 |
| messages | Message[] | 是 | 当前团队最近 200 条，按存储序号升序 | 每条含 id/name/text/createdAt |
| relations | {memberId:string,parentId:string/null}[] | 是 | 当前团队显式关系，空团队[] | 管理员组织视图，未出现的成员为根 |
| presence | Presence[] | 是 | 当前团队每个成员一条，空团队[] | 状态租约，不持久化；旧服务可能省略，前端按未知处理 |
| participants | MemberCard[] | 是 | 当前团队最多128个，空团队为[] | 身份铭牌、权限与助手/机器人资料 |
| messages[].memberId | string/null | 是 | 新消息绑定本机成员 UUID；历史消息可空 | 作者身份 |
| messages[].createdAt | number | 是 | Unix 毫秒，非负 | 本机入库时间，不作为跨设备排序依据 |
| board | string | 是 | 最多 4000 字符 | 当前公告 |
| links | Link[] | 是 | 最多 16 条 | 当前链接 |
| networkAvailable | boolean | 是 | 本地 false，节点按是否有已配对邻居返回 | 不代表节点或成员在线 |

## 错误码

失败以 `{code,message}` 拒绝 invoke。

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| COLLAB_CANCELLED | 取消原生目录选择 | 是 | 静默保留原绑定 |
| NODE_UNAVAILABLE | 节点不可达、响应无效或超时 | 是 | 保留内容，后台重试 |
| NODE_FORBIDDEN | 控制凭据无效、节点身份变化 | 修改配置后 | 核对目录与地址，重新显式连接 |
| NODE_CONFLICT | 节点记录冲突 | 修改输入后 | 核对操作 |
| COLLAB_INPUT | 内容校验失败 | 修改输入后 | 保留草稿，显示 message |
| COLLAB_BUSY | 已有协作操作正在执行 | 是 | 当前操作结束后重试 |
| COLLAB_STORAGE | 数据库、文件、锁或执行任务失败 | 条件满足 | 提示重试，避免展示内部路径 |
| COLLAB_SCHEMA | 数据库版本比应用支持版本更新 | 否 | 更新应用 |
| COLLAB_FORBIDDEN | 非 main 窗口、成员停用或操作权限不足 | 条件满足 | 从授权窗口调用，或由本机管理员调整权限 |
| COLLAB_NO_TEAM | 没有当前团队 | 条件满足 | 创建或恢复团队 |
| COLLAB_ACTIVE_TEAM | 已存在不同的活动团队 | 条件满足 | 先关闭当前团队 |
| COLLAB_LIMIT | 团队或消息数量到达上限 | 否 | 保留数据，后续增加归档策略 |
| COLLAB_MESSAGE_CONFLICT | 消息 ID 被不同内容或团队使用 | 修改输入后 | 新消息使用新 UUID |
| COLLAB_NOT_FOUND | 团队不存在 | 否 | 刷新列表 |

参数反序列化、ACL 拒绝发生于 command 之前，可能返回 Tauri 字符串错误；前端统一显示通用失败信息。

## 权限与安全

capability 仅匹配本地 main 窗口，不授权远程页面。command 再次检查窗口标签。未绑定时，应用数据目录下 `collaboration/store.sqlite3` 是协作数据事实来源；绑定后全部协作读写路由至选定节点，节点数据库是事实来源，桌面不直接打开或复制其 SQLite。`collaboration/node-connection.json` 仅保存地址、规范化目录及首次确认的节点 UUID，令牌每次在 Rust 内从所选目录读取，不返回前端、不写绑定文件或日志。目录选择授予桌面该节点的管理员控制能力；此能力仅属于受信任 main 窗口，普通成员继续使用分层成员 API。后续响应的 UUID、地址与 installationId 必须匹配绑定，否则拒绝。该适配器不监听网络端口。本机 main 窗口为成员资料与组织关系管理员，可维护本宿主的全部身份资料；未绑定的本地操作中，发送消息要求当前安装成员启用且为 contributor/editor，保存公告及链接要求 editor。绑定节点后使用 control 管理员身份，界面仍按当前节点成员资料约束普通按钮，但该 UI 约束不替代成员 API 的权限边界。领域权限由 Rust 校验。管理员仍可通过 member 动作恢复自身权限；成员种类不自动赋予控制能力。安装 UUID 不能用于证明设备身份。数据库尚未加密，依赖本机账号与文件系统保护；Unix 协作目录权限为 0700。

## 行为约束

- 副作用：首次查询创建数据库与安装 UUID；创建、消息使用事务；公告与链接先整体校验再原子更新。关闭团队仅清除活动指针，保留记录供恢复。
- 幂等性：当前团队相同 name/owner 重复 create 返回原团队。message 的 id、团队和正文均相同则不重复写入；冲突拒绝。board 整体覆盖，activate/leave 可重复。
- 超时与取消：节点请求总预算20秒，连接最多3秒，复用已有有界 HTTP 客户端；邻居请求仍为5秒。SQLite 锁等待最多 2 秒。IPC 没有应用层总超时；关闭面板或卸载组件不取消已接纳的写入，重新查询获取结果。
- 成员更新：同 ID 整体替换资料，每队最多128个；仅允许修改本机 nodeId 的身份。资料写入成功后返回 Rust 快照；失败保留编辑草稿。停用不删除历史记录。
- 并发、限流与重试：整个模块最多接纳一个操作，忙时立即拒绝，无无限队列；最多 32 团队，每团队 10000 消息。重复发送同一草稿保留消息 UUID。
- 分页、过滤与排序：当前仅最近 200 消息，历史分页尚未实现。团队按数据库既定顺序返回。
- 缓存与恢复：前端只展示 Rust 快照，团队页可见时每5秒尝试一次 nodeRefresh，整个协作入口最多一个请求，忙时跳过后台刷新。打开页面查询 snapshot，手动刷新也调用 nodeRefresh；关闭团队页停止刷新和人类心跳。临时失败保留已有成员、关系、消息、公告及输入草稿，仅显示轻量“重连中”，恢复自动更新且不重新挂载关系图。绑定保留至显式断开或更换；应用重启后重新读取绑定并验证节点。若重启时节点不可达，未缓存旧业务内容，显示重试入口，可返回本地团队。切换数据源会清空当前消息/公告草稿，避免误发到其他团队。
- 节点同步：独立节点服务自动交换并沿多跳转发，桌面 nodeRefresh 只读取 snapshot，不触发 sync；团队页面关闭后节点仍继续同步。peerFailures 来自 autoSync.failedPeers，表示最近自动交换失败且尚未恢复的直邻居数，成员离线由90秒心跳租约判断。邻居失败不会清空已合并数据。
- 组织界面：通讯录和中央“关系图”以独立成员为入口，每次仅展开所选成员与直属下级。铭牌点击展示身份、权限、助手或设备资料，箭头切换直属视角，顶部选择器可定位成员。主窗口是管理员视图；成员 API 仍按自身与直属范围过滤，不因此扩大访问范围。
- 关系编辑：本机托管成员的铭牌中选择直属上级并显式保存；选择“独立成员”提交 parentId=null。前端排除自身和后代候选，Rust 再校验同队、宿主和循环。保存中冻结选择与重复提交，失败保留选择；成功用完整返回快照更新图。远端成员只读，资料及关系需在所属节点维护。
- 关系拖放：本机托管成员通过铭牌把手浮起，原位显示虚影；候选排除自身、后代与原上级，悬停预览直属关系，放入“独立成员”解除关系。松手吸附后调用现有 relation 动作，等待后端确认；无效落点、Escape 或窗口失焦平稳回位，失败显示简短反馈。远端成员保持只读；键盘仍可在铭牌详情中编辑。减少动态效果设置下关闭浮起与位移动画。
- 在线状态：Presence 为 `{memberId,status,observedAt,expiresAt}`。status 为 online/working/idle/offline/unknown；后两时间为服务接收时的 Unix 毫秒与90秒后到期时刻，未上报均为 null。续报覆盖同一成员的内存租约，不写 SQLite/事件日志；单调时钟判过期，服务重启恢复 unknown。重复请求仅刷新有效期。权限不从状态推导。
- 本机人类成员：界面就绪后约20秒续报；交互时在线，输入后15秒内为工作中，60秒无操作或窗口失焦/隐藏为空闲。仅发送状态枚举，不发送输入内容。心跳串行、有界，临时失败静默等待下一次，前台操作等当前心跳结束后优先执行。铭牌在租约过期时转离线；停用铭牌覆盖租约显示停用。助手、程序和机器人需主动上报，不把资料登记或邻居可达解释成在线。
- 状态展示：工作中仅使用固定尺寸细条的缓慢明暗动画；状态切换使用胶囊原有淡入，不按心跳重播；减少动态效果时保持静态。空闲、离线和未知不循环动画。
- 事件或 channel：不适用；通过有界 IPC 刷新节点 HTTP 快照，无推送订阅。
- Webhook 或 WebSocket：不适用。

## 调用示例

### 请求示例

```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("collaboration_action", {
  input: { action: "create", name: "测试团队", owner: "测试成员" },
});
```

### 响应示例

```json
{"installationId":"00000000-0000-4000-8000-000000000001","mode":"empty","team":null,"savedTeams":[],"messages":[],"participants":[],"relations":[],"board":"","links":[],"networkAvailable":false}
```

该示例对应 snapshot/leave 后没有活动团队的状态。

### 错误示例

```json
{"code":"COLLAB_BUSY","message":"协作操作正在执行，请稍后重试"}
```

## 兼容性与变更记录

数据库 user_version=4；v1/v2 在事务中增加成员表和可空消息 member_id，旧团队补齐本机 human/editor。既有 author、历史消息、团队、公告和链接保留；旧消息 memberId=null，新消息 name 使用当前成员显示名。遇到较新版本在修改数据库配置前拒绝打开。v3 事务新增 member_relations，默认空组织关系，不改写既有资料。原请求结构兼容，响应增加 participants/memberId/relations；消息与公告新增上述权限检查。安装 UUID 不能作为网络认证凭据。

废弃计划：无。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 0.1.0 | 新增 | 本地协作 IPC 与 SQLite 数据库 | 旧预览状态没有持久数据，不自动导入 |

### 2026-10-17 模块独立化

本地核心迁至 `team-service` crate，桌面继续使用原 IPC 与应用数据目录，前端不复制存储。独立节点的本机配对与文件同步使用可选 node feature，契约见 [本机对等节点接口](2026-10-17-team-node.md)；桌面可通过节点绑定接入该服务，自身不开放端口。

告示牌只有 Rust 确认提交后才显示“已保存”；失败保留草稿，保存期间禁用编辑，未修改不提交，支持 Cmd/Ctrl+Enter 保存、Escape 取消并恢复编辑按钮焦点。关闭并恢复本地团队或应用重启后，从 SQLite 重新读取公告与消息。

### 2026-10-17 桌面节点绑定

增加 nodeConnect/nodeDisconnect/nodeRefresh 兼容动作和可选 connection 响应；沿用现有 IPC 权限与领域操作，无数据库格式迁移。节点绑定单独保存，断开后恢复原本地团队。连接示例（省略目录时显示原生选择器）：

```ts
await invoke("collaboration_action", { input: { action: "nodeConnect", address: "http://127.0.0.1:19001" } });
await invoke("collaboration_action", { input: { action: "nodeRefresh" } });
await invoke("collaboration_action", { input: { action: "nodeDisconnect" } });
```
