# 组件共享指针

| 项目 | 说明 |
| --- | --- |
| 接口 | IPC `component_focus`；事件 `component-focus-changed`；桌面 `app_component` 的 focus/blur |
| 用途 | 显示 Agent 正在关注的共享组件和区域 |
| 来源 | Rust component_sharing Runtime，进程内状态，重启清空 |
| 权限 | 主窗口及所属组件窗口，`allow-component-focus`；Agent 沿用已认证私有 loopback 通道 |
| 稳定性 | 实验性，0.1.0 新增；既有共享状态、持久化和窗口协议兼容 |

## 简单调用

```ts
const app = applicationComponents();
await app?.focus("writing", "body");
await app?.blur("writing");
```

前端：`componentSharing.focus("resources", "files")`、`blur("resources")`、`readFocus("resources")`。默认 target 为 `component`。

Agent 工具：`app_component({action:"focus",component:"writing",target:"body"})`，操作结束用 `{action:"blur",component:"writing"}`。调用 `read` 返回既有组件快照及可选 `focus`，方便核对逻辑聚焦状态。

## 请求与响应

IPC：`invoke("component_focus", {request:{action:"focus",component:"writing",target:"body"}})`。

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| request.action | 是 | read/focus/blur；read 是 IPC 读取指针，桌面工具 read 仍读取组件 |
| request.component | 是 | writing/resources |
| request.target | focus 可选 | writing: component/name/body；resources: component/view/files |

请求拒绝任意坐标、CSS 选择器、HTML、URL、标签文本和未知字段。响应与事件为 `{"component":"writing","revision":1,"target":"body"}`，非当前组件的 target 为 null。read/blur 不接受 target；focus 不接受 patch。工具仅返回 component/action/revision/target 摘要。

错误沿用组件契约：UNKNOWN_COMPONENT、INVALID_STATE（区域未注册）、FORBIDDEN（越权窗口）、STATE_ERROR；未连接桌面 UNAVAILABLE。输入错误原子拒绝；通知失败不回滚已生效状态，前端通过读补偿。请求发出后失败不自动重放。

## 行为与边界

- 只有一个全局共享指针；切换组件时清除旧组件标记，版本单调递增。重复聚焦相同区域不递增，也不重播动画；旧组件的延迟 blur 不会清除另一组件的指针。
- 子窗口只能操作所属组件，不能指定窗口、其他组件或外部页面。事件仅通知 main 和所属组件窗口，不包含文稿或文件内容。
- 主窗口与独立窗口先订阅再读取，按版本去重，窗口激活时读取补偿。指针状态不进入 SQLite，避免重启后出现过期指针。
- 界面使用注册组件实际 DOM 边界定位边框和“云枫”指针胶囊；滚动、调整窗口和切换视图后重新定位。不存在或不可见时标记“未显示”，不宣称已经操作或渲染成功。
- 提示不改变系统鼠标、DOM 输入焦点、选区、滚动位置或组件业务数据；不自动打开窗口和切换文稿视图。提示层不拦截点击，支持减少动态效果。
- 注册区域与实际组件语义对应。科研 research 为任务检查点组件，本次不向桌面共享指针注册它；科研状态仍通过受控 execute 更新。

## 验证

Rust 覆盖全局唯一指针、相同区域去重、无效区域原子拒绝及旧组件清理；既有窗口权限测试继续生效。TS SDK 覆盖私有通道与参数错误，前端覆盖区域定位、乱序事件、输入焦点保留和未显示提示。原生验收以实际 IPC 与组件窗口截图为准。
