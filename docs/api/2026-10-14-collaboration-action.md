# 本地协作操作

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `collaboration_action` |
| 用途 | 查询和保存本机团队、消息、公告及链接 |
| 调用方 | 工作区团队面板、设备档案 |
| 提供方 | Rust collaboration 模块 |
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
| action | input | string | 是 | — | snapshot/create/message/board/activate/leave | 操作 |
| name、owner | input | string | create | — | 各 1–80 Unicode 字符，无控制字符 | 团队名称、本地显示名 |
| id | input | string | message/activate | — | UUID | 客户端消息幂等键或已存团队 ID |
| text | input | string | message | — | 去首尾空白后 1–4000 字符 | 消息正文 |
| announcement | input | string | board | — | 去首尾空白后 0–4000 字符 | 公告 |
| links | input | Link[] | board | — | 最多 16 条 | 整体替换链接集合 |
| links[].title | input | string | 是 | — | 1–80 字符，无控制字符 | 标题 |
| links[].url | input | string | 是 | — | 规范化后最多 2048 字节，HTTP/HTTPS、有主机、无登录凭据 | 链接 |

正文允许换行和制表符，拒绝其他控制字符。名称和内容均由 Rust 校验。

## 响应

成功返回提交后快照。所有字段必定返回，team 可以为 null。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| installationId | string | 是 | UUID | 持久化安装标识，不是网络认证身份 |
| mode | string | 是 | empty/local | 当前是否有本地团队 |
| team | Team/null | 是 | id/name/owner/members | members 目前只有本地 owner |
| savedTeams | Team[] | 是 | 最多 32 个 | 可恢复的本地团队 |
| messages | Message[] | 是 | 当前团队最近 200 条，按存储序号升序 | 每条含 id/name/text/createdAt |
| messages[].createdAt | number | 是 | Unix 毫秒，非负 | 本机入库时间，不作为跨设备排序依据 |
| board | string | 是 | 最多 4000 字符 | 当前公告 |
| links | Link[] | 是 | 最多 16 条 | 当前链接 |
| networkAvailable | boolean | 是 | 当前恒为 false | 尚未提供联网能力 |

## 错误码

失败以 `{code,message}` 拒绝 invoke。

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| COLLAB_INPUT | 内容校验失败 | 修改输入后 | 保留草稿，显示 message |
| COLLAB_BUSY | 已有协作操作正在执行 | 是 | 当前操作结束后重试 |
| COLLAB_STORAGE | 数据库、文件、锁或执行任务失败 | 条件满足 | 提示重试，避免展示内部路径 |
| COLLAB_SCHEMA | 数据库版本比应用支持版本更新 | 否 | 更新应用 |
| COLLAB_FORBIDDEN | 非 main 窗口 | 否 | 从授权窗口调用 |
| COLLAB_NO_TEAM | 没有当前团队 | 条件满足 | 创建或恢复团队 |
| COLLAB_ACTIVE_TEAM | 已存在不同的活动团队 | 条件满足 | 先关闭当前团队 |
| COLLAB_LIMIT | 团队或消息数量到达上限 | 否 | 保留数据，后续增加归档策略 |
| COLLAB_MESSAGE_CONFLICT | 消息 ID 被不同内容或团队使用 | 修改输入后 | 新消息使用新 UUID |
| COLLAB_NOT_FOUND | 团队不存在 | 否 | 刷新列表 |

参数反序列化、ACL 拒绝发生于 command 之前，可能返回 Tauri 字符串错误；前端统一显示通用失败信息。

## 权限与安全

capability 仅匹配本地 main 窗口，不授权远程页面。command 再次检查窗口标签。应用数据目录下 `collaboration/store.sqlite3` 是协作数据事实来源；调用者不能传入路径。本模块不开网络端口。安装 UUID 不能用于证明设备身份。数据库尚未加密，依赖本机账号与文件系统保护；Unix 协作目录权限为 0700。

## 行为约束

- 副作用：首次查询创建数据库与安装 UUID；创建、消息使用事务；公告与链接先整体校验再原子更新。关闭团队仅清除活动指针，保留记录供恢复。
- 幂等性：当前团队相同 name/owner 重复 create 返回原团队。message 的 id、团队和正文均相同则不重复写入；冲突拒绝。board 整体覆盖，activate/leave 可重复。
- 超时与取消：SQLite 锁等待最多 2 秒。IPC 没有应用层总超时；关闭面板或卸载组件不取消已接纳的写入，重新查询获取结果。
- 并发、限流与重试：整个模块最多接纳一个操作，忙时立即拒绝，无无限队列；最多 32 团队，每团队 10000 消息。重复发送同一草稿保留消息 UUID。
- 分页、过滤与排序：当前仅最近 200 消息，历史分页尚未实现。团队按数据库既定顺序返回。
- 缓存：前端只展示 Rust 快照；打开团队面板及手动刷新重新查询。
- 事件或 channel：不适用，本批没有网络或推送订阅。
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
{"installationId":"00000000-0000-4000-8000-000000000001","mode":"empty","team":null,"savedTeams":[],"messages":[],"board":"","links":[],"networkAvailable":false}
```

该示例对应 snapshot/leave 后没有活动团队的状态。

### 错误示例

```json
{"code":"COLLAB_BUSY","message":"协作操作正在执行，请稍后重试"}
```

## 兼容性与变更记录

数据库 user_version=1。遇到较新版本在修改数据库配置前拒绝打开。后续认证密钥、配对票据与网络成员须通过版本化迁移引入；本地团队 UUID 尚不具备 LianAgent 签名事件的线协议语义。调用者不能把安装 UUID 当成公钥。

废弃计划：无。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 0.1.0 | 新增 | 本地协作 IPC 与 SQLite 数据库 | 旧预览状态没有持久数据，不自动导入 |
