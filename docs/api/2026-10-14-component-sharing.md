# 工作台组件状态与独立窗口

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `component_read`、`component_patch`、`component_window`；事件 `component-state-changed` |
| 用途 | 主界面和独立窗口复用文稿、资源状态 |
| 调用方 | 应用内模块与对应组件窗口 |
| 提供方 | Tauri Rust `component_sharing` |
| 稳定性 | 实验性 |
| 引入版本 | 0.1.0 |
| 维护方 | Yunfeng 工作台 |
| 接口类型 | command 与 WebView 定向事件 |
| 调用方式 | 全部异步 command；SDK 返回 Promise；磁盘访问在阻塞任务中串行执行 |
| 权限或认证 | `allow-component-read`、`allow-component-patch`、`allow-component-window` |
| Content-Type | 不适用；IPC JSON |

采用已有 Tauri 窗口与事件 API，无新增依赖。事件用法依据 [Tauri 官方文档](https://v2.tauri.app/develop/calling-frontend/)。Context7 CLI 当前不可用，已查询官方文档。

## 请求

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| component | IPC | string | 是 | — | `writing`、`resources` | 固定注册组件 ID |
| patch | IPC | object | patch 时 | — | 只包含下面的顶层字段 | 字段合并，不删除其他字段 |
| open | IPC | boolean | window 时 | — | true/false | 打开或关闭独立窗口 |
| patch.name | IPC | string | 否 | 当前值 | 最多 200 个 Unicode 字符 | 文稿标题，初始空字符串 |
| patch.body | IPC | string | 否 | 当前值 | UTF-8 最多 65536 字节 | 正文，初始空字符串 |
| patch.view | IPC | string | 否 | 当前值 | 文件、图片、视频、结果 | 资源分类，初始“文件” |
| patch.files | IPC | array | 否 | 当前值 | 最多 200 项 | 完整替换资源清单，初始空数组 |
| patch.files[].name | IPC | string | 是 | — | 最多 255 个 Unicode 字符 | 文件名称 |
| patch.files[].size | IPC | number | 是 | — | 整数，0 至 9007199254740991，字节 | 文件大小 |

文稿不接受资源字段，资源不接受文稿字段。资源项只接受 name/size；非法字段、类型和大小原子拒绝。

研究写作扩展字段（writing 组件）：

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| patch.analysis / literature / design | IPC | object | 否 | 无 | 仅 name/body，200 字符标题、65536 字节正文 | 各工具文稿，缺省视为空文稿 |
| patch.references | IPC | array | 否 | 无 | 最多 200 项 | 完整替换文献库 |
| patch.references[].id / title / citation / url / notes | IPC | string | 是 | — | 分别最多 64/800/4096/2048/65536 字节 | 标识、标题、出处、链接、笔记；URL 为空或 HTTP/HTTPS |
| patch.references[].text | IPC | string | 否 | 无 | 65536 字节 | 导入全文 |
| patch.references[].pdfAssetId | IPC | string | 否 | 无 | UUID | 本机 PDF 素材 |
| patch.dataFiles | IPC | array | 否 | 无 | 最多 20 项 | 完整替换文本摘录 |
| patch.dataFiles[].id / name / content | IPC | string | 是 | — | 分别最多 64/800/65536 字节 | 稳定标识、文件名、正文 |

研究工具快照最多 4 MiB，正文与资料文本不含 NUL；未知字段原子拒绝。每个文稿独立，旧快照无需数据转换。库和各工具文稿对象仍采用同字段后写覆盖。

## 响应

read/patch 返回完整快照，window 成功返回 null。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| component | string | 是 | 注册 ID | 所属组件 |
| revision | number | 是 | 从 0 递增 | 组件状态版本；相同值不递增 |
| state | object | 是 | 文稿 name/body 或资源 view/files | Rust 权威状态 |
| code | string | 错误时 | 下表 | 稳定错误码 |
| message | string | 错误时 | 可展示文字 | 不包含内部路径和凭据 |

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| UNKNOWN_COMPONENT | 未注册组件 | 否 | 使用注册 ID |
| FORBIDDEN | 窗口不允许访问 | 否 | 主窗口管理；子窗口仅读写所属组件 |
| INVALID_STATE | 字段、类型或大小不合法 | 修改后 | 修正内容再提交 |
| STATE_ERROR | 锁或内部状态异常 | 重启后 | 保留输入并提示 |
| WINDOW_ERROR | 创建、显示、聚焦或关闭失败 | 是 | 用户手动重试一次 |
| STORAGE_ERROR | 文稿数据库读写失败 | 检查存储后 | 保留输入，手动重试 |
| STORAGE_VERSION | 数据库来自较新版本 | 升级后 | 不覆盖数据库 |

Tauri ACL 拒绝、反序列化错误由框架返回；浏览器 SDK 返回 Error“组件共享需要 Tauri 原生应用”。

## 权限与安全

只允许本地 main、component-writing、component-resources。子窗口不可管理窗口或访问其他组件。子窗口只授予读取、更新、事件订阅、窗口控制；不授予团队或服务管理。

URL、窗口标签和配置由 Rust 固定，不允许调用方提供远程页面。事件仅向 main 和所属组件 WebView 发送；文稿及文件清单不记录日志。当前资源共享只包含元数据，不持有跨窗口 File 对象或传输文件内容。

## 行为约束

- 文稿标题、正文与 revision 由 Rust 保存于应用数据目录 `paper-writing/store.sqlite3`。应用重启或 Rust 热重载恢复最近成功提交；失败不修改内存快照。资源清单仍为进程内状态。
- 每个组件最多一个独立窗口。重复打开恢复并聚焦原窗口；关闭不存在的窗口成功返回。
- patch 在短锁内合并，锁不跨 await。不同字段互不覆盖，同字段按 Rust 接收顺序后写覆盖；整个 files 数组视作一个字段。当前不提供冲突合并编辑器。
- 事件在提交后发送，可能重复、乱序或丢失。载荷是完整快照，接收方忽略旧 revision；SDK 订阅返回取消函数。页面先订阅后读取，并每 5 秒与聚焦时读取补偿。写成功不因事件发送失败回滚。
- 页面单个在途写入，后续编辑合并，失败保留输入并要求手动重试。已发出的短 IPC 不支持取消；无自动写入重试。
- SDK 用于应用内可信模块；不开放 HTTP、CLI、Python 或跨设备端口。新增组件需同步注册、校验、路由、权限与文档。

## 调用示例

```ts
import { componentSharing } from "./features/workbench/services/componentSharing";

await componentSharing.patch("writing", { name: "示例文稿", body: "共享正文" });
await componentSharing.open("writing");
const snapshot = await componentSharing.read("writing");
const stop = await componentSharing.subscribe("writing", (next) => {
  console.log(next.revision); // 业务模块按版本应用快照
});
stop();
await componentSharing.close("writing");
```

直接 IPC：`invoke("component_patch", { component: "writing", patch: { body: "共享正文" } })`。

响应：`{"component":"writing","revision":1,"state":{"name":"示例文稿","body":"共享正文"}}`。
错误：`{"code":"INVALID_STATE","message":"字段、类型或大小不符合组件契约"}`。

## 兼容性与变更记录

调用方容忍后续可选字段，组件 ID 与现有字段不改名；无废弃计划。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 0.1.0 | 新增 | 文稿与资源状态、独立窗口、SDK | 文稿从标签局部状态改为进程内状态 |
| 2026-10-14 | 0.1.0 | 兼容 | 文稿保存到 SQLite，read/patch 改为异步 | IPC 名称与字段不变；资源清单不持久化 |
| 2026-10-15 | 0.1.0 | 兼容扩展 | 四工具文稿、文献和摘录，输入合并 700 ms 保存 | 旧快照直接读取，name/body 保留 |

验证：Rust 字段合并、原子拒绝、窗口授权测试；SDK 读写、打开关闭载荷及浏览器拒绝测试。macOS 原生文稿双向编辑、重复打开聚焦、关闭重开、资源分类同步通过。文件清单选入和其他桌面平台尚未原生验收。
