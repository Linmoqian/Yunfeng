/**
 * @yunfeng/tui - 终端 UI 渲染引擎
 *
 * 入口：终端层 + 渲染原语 + 布局系统 + 组合核心 + 基础组件。
 * v1 不接入 agent/LLM，只做交互底座。
 */
export {
	type Style,
	style,
	RESET,
	cursorUp,
	clearLine,
	clearScreen,
	cursorHome,
	hideCursor,
	showCursor,
	visibleWidth,
	setColorMode,
	getColorMode,
	type ColorMode,
} from "./terminal/ansi.js";
export { detectColorMode } from "./terminal/process-terminal.js";
export { parseKey, type Key, type ParseResult } from "./terminal/input.js";

// 渲染原语
export {
	applyBackgroundToLine,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth as textVisibleWidth,
	wrapTextWithAnsi,
} from "./utils.js";

// 组合核心
export {
	Container,
	CURSOR_MARKER,
	type Component,
	type Focusable,
	isFocusable,
	TuiBase,
	type Terminal,
	type TuiInputListener,
	type TuiMode,
	type TuiStopOptions,
} from "./tui.js";
export { TuiMainScreen } from "./tui-main-screen.js";
export { TuiFullScreen, type TuiFullScreenOptions } from "./tui-full-screen.js";

// 布局系统
export {
	LAYOUT_NODE,
	allocateStackSizes,
	type LayoutNode,
	type LayoutViewport,
	type StackEntry,
} from "./layout/layout-node.js";
export { Stack, type StackChild, type StackOptions } from "./layout/stack.js";
export { VStack } from "./layout/v-stack.js";
export { HStack } from "./layout/h-stack.js";
export { Box } from "./layout/box.js";
export { Spacer } from "./layout/spacer.js";
export { Text } from "./layout/text.js";
export { Scroll } from "./layout/scroll.js";

// 基础组件
export { Editor } from "./components/editor.js";
export { Mascot, type MascotOptions } from "./components/mascot.js";
export { Messages, type Message, type MessageRole } from "./components/messages.js";
export { Selector, type SelectOption } from "./components/selector.js";
export { StatusBar, type StatusInfo } from "./components/status.js";
export { Overlay, type OverlayOptions } from "./components/overlay.js";
