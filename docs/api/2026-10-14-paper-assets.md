# 论文图片素材

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `paper_asset_action` |
| 用途 | 导入、读取、图注和可恢复归档 |
| 调用方 | 主窗口与写作组件窗口 |
| 提供方 | Rust component_sharing/assets |
| 稳定性 | 实验性 |
| 引入版本 | 0.1.0 |
| 维护方 | Yunfeng 工作台 |
| 接口类型 | command |
| 调用方式 | 异步，磁盘与解码在阻塞任务中执行 |
| 权限或认证 | `allow-paper-asset-action`；Rust 限制 main / component-writing |
| Content-Type | IPC JSON |

## 请求

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| request.action | IPC | string | 是 | — | list/import/read/caption/archive/restore | 操作 |
| request.name | IPC | string | import | — | 1 至 255 字符，无路径分隔符/NUL | 原始文件名 |
| request.bytes | IPC | number[] | import | — | 每项 0 至 255，最多 20 MiB | PNG/JPEG/WebP 原始字节 |
| request.id | IPC | string | read/caption/archive/restore | — | UUID | 素材标识 |
| request.caption | IPC | string | caption | — | 最多 500 字符 | 图注 |

拒绝未知字段。图片最多 8192 像素宽或高、1600 万像素；解码内存上限 96 MiB。库最多 100 张，总计 200 MiB，包含归档素材。

## 响应

list 返回元数据数组，import 返回 `{id}`，read 返回 `{url}`，修改成功返回 null。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| id/name/mime | string | list/import 中 id | UUID/文件名/图片 MIME | 素材标识与格式 |
| width/height/size | number | list | 像素/像素/字节 | 图片信息 |
| caption | string | list | 最多 500 字符 | 保存的图注 |
| archived | boolean | list | true/false | 归档标志 |
| url | string | read | 图片 data URL | 无任意文件路径 |
| code/message | string | 错误 | 稳定错误码/展示文本 | 错误结构 |

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| INVALID_ASSET | 名称、大小、内容或尺寸不合法 | 修改后 | 选择支持的图片 |
| ASSET_LIMIT | 库容量达到限制 | 否 | 暂停导入；归档不释放容量 |
| ASSET_NOT_FOUND | 标识不存在或读取失败 | 刷新后 | 刷新素材列表 |
| STORAGE_ERROR/STORAGE_VERSION | 存储故障/新版本格式 | 修复或升级后 | 保留原库 |
| FORBIDDEN | 未授权窗口 | 否 | 在写作窗口使用 |

## 权限与安全

不接收任意路径。按实际文件内容校验格式并执行有界解码，不信任扩展名。原图、元数据、图注保存在文稿 SQLite 库，不记录正文或图片内容到日志。资源组件窗口虽匹配组件 capability，Rust 仍拒绝其调用图片接口。

## 行为约束

导入为事务操作，每次产生新 UUID。归档与恢复幂等；归档仍允许正文读取图片。无永久删除接口。主界面和独立窗口每 5 秒及聚焦刷新元数据，取消订阅随卸载；预览为窗口缓存。前端每次只导入一张图片，无自动写重试。已发出的短操作不支持取消，重启恢复成功提交的素材。

## 调用示例

`invoke("paper_asset_action", {request:{action:"list"}})` 返回 `[]`。

`invoke("paper_asset_action", {request:{action:"read",id:"00000000-0000-4000-8000-000000000001"}})` 在标识不存在时返回 `{code:"ASSET_NOT_FOUND",message:"图片素材不存在或无法读取"}`。

正文使用 `![图注](paper-asset:UUID)`；预览只读取本机已导入素材，拒绝外部图片地址。

## 兼容性与变更记录

2026-10-14，0.1.0：新增接口和素材表，现有文稿字段不变。无废弃计划。
