# 云枫共享设计变量

桌面、移动端与 CLI 的明暗语义色、圆角、字体、阴影与动效基础。`tokens.json` 是颜色、圆角和阴影的设计源；`tokens.css` 提供 CSS 变量，测试校验颜色映射一致。`index.mjs` 直接从 JSON 读取终端语义色，无 React、DOM 或第三方依赖。

```ts
// 浏览器宿主
import "@yunfeng/design-tokens/styles.css";

// 终端或其他程序
import { palettes } from "@yunfeng/design-tokens";
const color = palettes.dark.brand;
```

通过根元素的 `data-theme="light"` / `"dark"` 指定主题，未指定时跟随系统。共享 CSS 提供 `--yf-*` 和既有语义别名；平台布局变量留在宿主。CLI 通过本地 link 依赖接入，保留独立 workspace。

修改颜色时同步 `tokens.json`、`tokens.css`，运行 `pnpm --filter @yunfeng/design-tokens test`；组件维护见[共享 UI](../ui/README.md)。原文档 `docs/design/yunfeng-tokens.css` 保留样式转发，旧入口可继续使用。
