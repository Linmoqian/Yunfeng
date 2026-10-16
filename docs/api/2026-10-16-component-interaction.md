# 组件交互反馈

| 项目 | 说明 |
| --- | --- |
| 接口 | Agent `app_component({action:"status",component:"writing"})`，SDK `app.status("writing")` |
| 前端 | `componentSharing.status("writing")`；内部 IPC `component_interaction` 与事件 `component-interaction-changed` |
| 来源 | Rust 共享 Runtime；窗口报告仅提供短期元数据，业务快照仍由原 Store 管理 |
| 权限 | 主窗口及所属组件窗口 `allow-component-interaction`；Agent 沿用认证的桌面私有通道 |
| 兼容 | 既有 read/patch/open 返回新增可选 interaction；无 DB 迁移，重启反馈清空 |

## 简单调用

```ts
const status = await app.status("writing");
if (status.known && !status.yielded) {
  const result = await app.patch("writing", { body: "新的正文" });
  // 写入已提交；需要随后读取 status，核对 renderedRevision === result.revision。
}
```

`status` 返回：

```json
{"component":"writing","version":12,"known":true,"visible":true,"rendered":true,"renderedRevision":3,"editing":false,"yielded":false}
```

| 字段 | 含义 |
| --- | --- |
| version | 全局反馈序号；界面忽略旧事件，业务文稿版本仍为组件 snapshot.revision |
| known | 存在未过期的窗口反馈；false 不表示空闲 |
| visible | 至少一个窗口显示、未最小化，注册组件区域位于视口内 |
| renderedRevision | 可见视图已接受并经 React 提交、帧回调确认的最新业务版本；未知为 null |
| rendered | 可见视图确认了当前业务版本，且当前没有工程师操作；写入成功不会立即变为 true |
| editing | 任一共享窗口的输入焦点、未保存编辑或近期指针操作；包括文稿外的输入框 |
| yielded | 工程师正在操作或当前组件反馈未知，Agent 必须让出 |

## 反馈与呈现契约

内部 IPC：`invoke("component_interaction", {request:{component:"writing",report:{sequence:123,visible:true,renderedRevision:3,editing:false}}})`；省略 report 为读取。窗口身份由 Tauri 注入，不接受自报窗口、文本、坐标、任意组件或未知字段。窗口只报告所属组件；Rust 再检查窗口显示与最小化状态、确认版本不超过实际业务版本，并拒绝旧 sequence 的覆盖。

前端在 React 提交后的帧回调确认版本；保存中、保存失败后仍有未提交输入时不确认呈现。隐藏的组件不确认呈现。visible 不判断被其他应用遮挡的像素；rendered 表示当前视图已提交该版本，不表示所有字段、其他文稿标签、图片加载或异步 PDF 都已显示。模型不能据此宣称全文被逐项视觉验收。

窗口每秒续租，4 秒无反馈变为未知。过期的编辑报告继续阻止 Agent 操作，直到新报告确认结束，或窗口确实关闭；关闭窗口的报告由 Rust 移除。输入、组合输入、焦点变化及指针操作立即报告；按键与滚轮操作也让出，滚轮报告按帧合并。短暂操作保护 1.2 秒，按住拖拽期间持续让出。前端报告串行合并，卸载停止订阅、帧回调和心跳。

## 让出控制

Rust 在 Agent 的 patch/open/close/focus 入口校验反馈。任何共享窗口正在操作时，上述动作返回 COMPONENT_BUSY，不改业务状态、不抢窗口焦点。反馈未知返回 INTERACTION_UNAVAILABLE；read/status/blur 继续可用。门禁与状态提交共享锁范围，已接受的编辑反馈不会被之后的 Agent 写入越过。事件送达前或已受理的操作不保证撤销，不回滚已完成动作。

工程师自己的 IPC 编辑与窗口按钮仍可使用。让出后保持输入焦点、选区和滚动位置；云枫指针移除边框，在原胶囊位置显示“您正在操作 · 云枫已让出”，不新增常驻面板。新反馈确认空闲后恢复标记与操作资格；被拒绝的 Agent 动作不自动重放，Agent 重新读取状态后决定是否继续。当前机制保护共享文稿和资源组件，不中止已经运行的实验、终端命令或外部应用操作。

## 错误与验证

错误：FORBIDDEN、UNKNOWN_COMPONENT、INVALID_STATE（伪造呈现版本或无效字段）、STATE_ERROR、COMPONENT_BUSY、INTERACTION_UNAVAILABLE，以及既有通道错误。失败不自动重试副作用，反馈心跳可以重试元数据报告。通知失败通过后续报告和 status 读取补偿。

核心测试覆盖呈现版本、编辑/过期门禁、乱序反馈、关闭窗口释放、未保存输入与卸载。macOS 原生验收核对写入后先未呈现再确认、输入焦点保护、四种 Agent 动作拒绝，以及独立文稿编辑对主窗口操作的让出和恢复。
