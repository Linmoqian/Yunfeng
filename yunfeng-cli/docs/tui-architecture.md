# @yunfeng/tui 架构说明

Yunfeng coding agent CLI 的终端 UI 渲染引擎。v1 定位为**交互底座**：只负责渲染、布局、输入与弹层，不接入 agent / LLM 业务。

## 目录结构

```
packages/tui/src/
├── terminal/          终端抽象与 I/O 边界
│   ├── ansi.ts        SGR 样式原语、颜色模式（truecolor/256/16/none）与降级
│   ├── input.ts       按键解析（字符/功能键/修饰键/Alt 组合）
│   └── process-terminal.ts  真实终端实现（raw mode、颜色能力探测）
├── utils.ts           可见宽度（CJK=2）、ANSI 剥离、折行、截断、列切片
├── layout/            flexbox 式布局系统
│   ├── layout-node.ts 空间分配算法（basis/grow/shrink/minSize/maxSize）
│   ├── stack.ts       Stack 基类（VStack/HStack 公共实现，align 语义）
│   ├── v-stack.ts / h-stack.ts
│   ├── scroll.ts      通用滚动容器（视口裁剪 + ↑/↓/PgUp/PgDn）
│   ├── box.ts / spacer.ts / text.ts
├── components/        业务组件
│   ├── editor.ts      多行输入（字素安全光标、Home/End/Delete）
│   ├── messages.ts    消息流（视口滚动、贴底语义）
│   ├── selector.ts    选择器（Enter 确认 / Esc 取消 / 禁用态）
│   ├── status.ts      状态栏
│   ├── overlay.ts     模态弹层（边框 + 标题 + 遮罩）
│   └── mascot.ts      云朵吉祥物（浮动动画）
├── tui.ts             TuiBase 核心：焦点、输入分发、全局快捷键、差分渲染、弹层
├── tui-main-screen.ts 主屏模式（保留终端 scrollback）
└── tui-full-screen.ts 全屏模式（alt screen，退出恢复）
```

## 核心契约

### Component

```ts
interface Component {
	render(width: number, height?: number): string[];
	handleInput?(data: string): boolean; // 返回 true 表示消费并触发重绘
	invalidate(): void;
	dispose?(): void; // 释放定时器/订阅，由 TuiBase.stop 递归调用
}
```

- `render` 返回**已含 ANSI 样式**的行数组；`height` 是可用高度（VStack 会按分配尺寸传给子组件，如 Messages/Scroll 据此决定渲染窗口）。
- 行内可用 `CURSOR_MARKER`（APC 序列）标记硬件光标位置，渲染帧会剥离并定位光标（IME 场景）。

### Focusable

```ts
interface Focusable {
	focused: boolean;
}
```

TuiBase 维护单一焦点组件；`setFocus` 切换时互斥设置 `focused`。

## 渲染流程

`TuiBase.renderFrame()` 统一两种屏幕模式：

1. **装配**：弹层存在时只渲染弹层，否则渲染 children，全部传入 `(width, height)`。
2. **裁剪**：行数组截取可视高度 `height`。
3. **差分**：`diffAndBuild` 与上一帧逐行比对，仅对变化行输出 `\x1b[{n};1H\x1b[2K...`；尺寸变化才全量重绘（`\x1b[H`）。
4. **光标**：有 `CURSOR_MARKER` 且开启硬件光标时定位，否则隐藏光标。

渲染由 `requestRender()` 节流（16ms 合并），`renderNow(true)` 可强制立即渲染。

## 输入流程

`handleTerminalInput` 逐键处理（终端可能批量送达）：

1. `parseKey` 解析为结构化 Key（方向键/功能键/修饰键/Alt/ctrl 等）。
2. **全局快捷键**优先：`addGlobalShortcut` 注册的 handler 返回 true 则消费该键，不再下传。
3. **输入监听器**：`addInputListener` 可改写或消费输入（`{ data, consume }`）。
4. **焦点组件**：未消费则调用 `focusedComponent.handleInput`。

## 布局语义

- 主轴分配：`allocateStackSizes` 按 `basis`（或固有尺寸）→ `grow` 平分多余 → `shrink` 收回超限 → `minSize/maxSize` 约束。
- VStack 的可用高度由 `render` 的 `height` 传入；无 `height` 时保持固有尺寸、不补行。
- `align` 控制交叉轴：`stretch/start/center/end`（HStack 垂直对齐，VStack 水平对齐）。
- 裁剪不足/超出时，VStack 将子组件行补齐到分配行数（stretch 语义，撑满可用高度）。

## 颜色降级

`ProcessTerminal` 构造时按 `NO_COLOR` / `TERM` / `COLORTERM` 探测能力并 `setColorMode`：

- `none`：不输出颜色（仅保留 bold 等非色属性）
- `16`：命名色直接映射，truecolor/256 近似到 6 基本色 + 灰阶
- `256`：truecolor 量化（`16 + 36r + 6g + b`）
- `truecolor`：原样输出

## 弹层

`TuiBase.openOverlay(overlay, focusTarget)` / `closeOverlay()`：

- 打开后渲染帧只渲染弹层（覆盖下层内容），焦点移交给 `focusTarget`。
- `Overlay` 组件负责边框、标题、遮罩留白；内容可为 Selector 等任意组件。

## 滚动

- `Scroll` 通用滚动容器：包装任意组件，按 `height` 裁剪视口；`scroll=0` 贴底，正数回看；聚焦时 ↑/↓ 单行、PgUp/PgDn 翻页。
- `Messages` 自带同样的视口/贴底语义，`add` 时仅贴底状态保持贴底，回看历史不被新消息打断。

## 测试与命令

```bash
npm test               # vitest（packages/tui）
npm run lint           # eslint
npm run format:check   # prettier --check
npm run build          # tsc（workspaces）
npm run demo           # 真实终端交互演示
npm run smoke          # 内存终端冒烟（不依赖真实终端）
```

新增组件/改动后：补测试 → `npm run format` → `npm run lint` → `npm test` → 提交。
