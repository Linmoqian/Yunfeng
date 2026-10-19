# 云枫 UI 使用规范

云枫的动画库、组件库与交互库位于 `app/desktop/src/components/common/`，共用入口为 `index.ts`。这是项目内部模块，使用已有依赖；组件在科研、团队和会话功能中实际复用。开发环境 [/dev/ui](http://localhost:5173/dev/ui) 是专门的 UI 审阅页，提供胶囊、模式、排队、进度、详情、加载与拖放分区导航。模式选择沿用首页 Segmented 样式，指标按钮直接更新同一胶囊，队列支持输入 Enter 入队、添加样例、逐条移除与清空；最多三条，保留稳定行身份并让退出内容失去交互能力。排队握柄支持拖动和上下键排序，Escape、失焦或指针取消恢复拖动前顺序；拖动期间暂缓增删。重连分区复用真实 ConnectionCapsule，支持模拟断线、重连和立即恢复；重连演示五秒后恢复，胶囊沿用延迟出现和最短驻留后收起，固定展示区避免跳动。重复操作与卸载清理模拟计时器，不操作真实网络连接。科研闭环分区是独立的本地有限状态机：基线与优化各由一次 Hook 唤醒，依次观察、决策、执行、反思；等待期间没有自动轮询。支持单步或每 1.5 秒自动推进，暂停清理推进计时器并保留阶段和作业进度，恢复后继续。关系图支持点击节点查看样例指标与验收，手动选择不随自动推进被覆盖；过程默认折叠。它不调用真实科研服务、模型、命令或持久化数据库，不能作为科研 Runtime 验收。顶部重置恢复全部样例，减少动态效果时立即切换。拖放分区可实际移动铭牌，体验浮起、透明候选、落点吸附与无效回位；Escape 或失焦取消，左右键移动，重置恢复起点。此沙盒只更新页面局部状态，不调用团队关系接口。生产构建不注册此路由。

## 视觉与动效

沿用 `app/desktop/src/styles/tokens.css` 的浅白淡紫、语义颜色、圆角和字体。标题、正文、数字分别遵循现有 `--font-display`、`--font-body` 与等宽数字约定。正文和输入允许选取；控件与状态胶囊避免误选。

动画表达状态改变。高频快照不反复入场，键盘操作不等待动画，事实先更新。加载只表达等待，不能推测百分比。错误、权限要求、风险与待处理事项保留可见。

| 词汇 | 时长 | 使用场景 |
| --- | --- | --- |
| `enter` / `exit` | 140 / 100 ms | 小组件出现、退出 |
| 胶囊初次出现 | 180 ms | 3 px 轻移；重复快照不重播 |
| `feedback` | 220 ms | 同一胶囊事实变化，仅透明度反馈 |
| `progress` | 240 ms | 条形比例变化；计数立即呈现 |
| `layout` | 260 ms | 无回弹的布局位移 |
| `lift` / `snap` / `return` | 140 / 140 / 180 ms | 浮起、候选吸附、无效回位 |

Motion 参数维护于 `motion/presets.ts`；CSS 按压和提示使用对应 `--yf-motion-*` token，调整时同步维护两处。`useYunfengMotion()` 自动响应系统减少动态效果，将过渡降为 0。枫叶加载在此模式显示静态图形。循环品牌加载拥有独立节奏，不作为通用进入速度。

```tsx
import { Capsule, ProgressCapsule, Details, useYunfengMotion } from "../../components/common";

const { reduced, transition } = useYunfengMotion();
// 在 motion 元素中使用 transition("enter")；reduced 时禁用空间位移。
<Capsule tone="accent" value={report.gain}>提升 {report.gain}%</Capsule>
<ProgressCapsule label="实验" current={report.done} total={report.total} />
<Details label="详细过程">{report.details}</Details>
```

## 组件契约

- `Capsule` 默认是浅边框胶囊；`tone` 为 neutral / accent / success / warning / danger，由业务选择。`status` 仅保留业务标识，不推断通过与失败。`value` 是触发反馈的事实键，相同值不重播；数字与正文不插值。`appearance="plain"` 供已有布局兼容，`animateOnMount={false}` 关闭初次出现反馈。
- `ProgressCapsule` 仅接受有限、非负计数；总量必须大于 0，且当前值不大于总量。无总量只显示计数，无效输入不渲染。进度来自权威业务事实。
- `Details` 复用 Ant Design Collapse 的键盘与焦点行为，默认折叠，以省略号显示入口，`label` 保留可访问名称与悬停提示，事实更新保留展开状态；支持 `defaultOpen` 和 `onOpenChange`。需确认的副作用不能藏在详情内。
- `MapleCloudLoading` 是装饰动画，`compact` 用于状态胶囊。调用方提供 `role="status"` 及等待文字；工作区仍只保留一个统一加载入口。

## 交互契约

`interactionStyles.pressable` 提供悬停轻抬、按压和展开态；与原生 button 或既有 Ant Design 控件组合，并提供可访问名称。`interactionStyles.disclosure` 供 Collapse 使用。CSS Modules 保留组件作用域，不给全局按钮批量加动画。

`useStableVisibility(active)` 默认延迟 600 ms 出现、至少驻留 1200 ms、恢复后稳定 400 ms 再收起；可通过 delay / minimum / settle 覆盖。真实错误用 `{ immediate: true }` 立即显示。此 Hook 只控制提示，不能清空已有会话或推迟请求。

`useGestureCancellation(active, onCancel)` 只在手势期间监听 Escape 和窗口失焦；忽略中文组字中的 Escape，回调始终为最新值，退出与卸载移除监听。组件的 pointercancel 仍应调用同一取消逻辑。

`dragStyles` 导出 slot / floating / handle / target / hint / dropChip。样式通过 data-source、data-candidate、data-over 和 data-locked 表达反馈，均为 `"true"` 时激活。候选、原位虚影与落点以半透明底色呈现，不使用虚线；候选与落点由业务验证；视觉样式不会变更关系或授予权限。

```tsx
import { dragStyles, useGestureCancellation } from "../../components/common";

useGestureCancellation(dragging, cancel);
<div className={`${dragStyles.slot} ${dragStyles.target}`}
  data-source={dragging} data-candidate={canDrop} data-over={hovered}>
  <motion.div className={dragStyles.floating}>{children}</motion.div>
</div>
```

成员拖放的候选、原位虚影、吸附后提交、快速释放和键盘替代入口仍由团队模块维护。科研画布的 Agent 聚焦与用户让权继续复用既有组件 API；本库不增加事件总线、持久化数据源或另一套组件协议。

## 接入与维护

新界面优先使用本库。只抽取已复用的稳定模式，避免包装每一个 Ant Design 控件。功能目录可以组合样式、覆盖密度和承载业务逻辑，共用层不得反向导入功能模块。已有 Capsule、ProgressCapsule、MapleCloudLoading、CapsuleInteraction 和 workspaceMotion 入口保留兼容。

修改后执行 `pnpm --dir app/desktop exec tsc --noEmit` 及受影响的少量 Vitest 测试，并在原生窗口检查排版、键盘、折叠、状态更新和减少动态效果。开发展示页中的数值明确标为样例，不能作为实验或服务验收。
