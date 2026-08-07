# Design System Master File — Yunfeng 工作台

> **优先级：** 构建具体页面时，先查 `design-system/yunfeng/pages/[page-name].md`；若存在则以该页面覆盖文件为准，否则严格遵循本 Master 文件。
> **基调：** 暖色、工坊/出版物质感、衬线标题。本文件已按工程调性将工具生成默认（蓝色 Glassmorphism）覆盖为暖色丝缎系。

---

**Project:** Yunfeng
**类型:** 任务工作台（编码任务编排 / 生产工具）
**基调:** 暖色、衬线、工坊质感、内容优先
**模式支持:** Light（默认）✓ / Dark（跟随系统或手动）✓

---

## 设计原则

1. **内容优先**：工作台是任务编排工具，信息密度服务于快速定位与推进，不做装饰性动画。
2. **暖色权威色**：单一枫叶棕 accent，用于当前焦点、正在运行、关键操作；不做多色堆叠。
3. **状态语义色**：运行=accent，等待/中性=text-secondary，需要处理=failed-red，完成=positive-green；颜色不单独承载信息，配合文字标签。
4. **衬线标题 + 无衬线正文**：标题用衬线强调"工坊/出版物"质感，正文与代码保持高可读性。
5. **克制动效**：150–300ms，动效传递含义（任务关注、流式输出、审批），不装饰；尊重 `prefers-reduced-motion`。

### 关键禁止项

- ❌ Emoji 作图标 —— 一律使用 Lucide React 图标。
- ❌ 可点击元素缺 `cursor:pointer`。
- ❌ 缩放 transform 引发布局抖动。
- ❌ 低于 4.5:1 的正文对比度。
- ❌ 0ms 状态突变 —— 一律 150–300ms 过渡。
- ❌ 隐藏焦点环 —— 键盘可达焦点必须可见。
- ❌ 深色模式作为默认 —— 跟随系统或用户偏好。

---

## Color Palette（暖色丝缎系）

| Role | Light | Dark | CSS Variable / Ant Token |
|------|-------|------|---------------------------|
| Primary / Accent（枫叶棕） | `#A35F3B` | `#D39366` | `--accent`, `colorPrimary` |
| Background / Canvas | `#F2F3EF` | `#171A18` | `--canvas`, `colorBgLayout` |
| Surface | `#FBFAF6` | `#20231F` | `--surface`, `colorBgContainer` |
| Surface Raised | `#FFFDF9` | `#292C27` | `--surface-raised` |
| Text Primary | `#292720` | `#F2EFE7` | `--text-primary`, `colorTextBase` |
| Text Secondary | `#67675F` | `#B8B6AC` | `--text-secondary`, `colorTextSecondary` |
| Border Subtle | `#DAD8CF` | `#3A3E37` | `--border-subtle`, `colorBorderSecondary` |
| Border Strong | `#B9B4A7` | `#53584E` | `--border-strong`, `colorBorder` |
| Attention（需要处理） | `#8B3E35` | `#E07A6E` | `--attention`, `colorError` |
| Positive（完成） | `#55705A` | `#86AD8E` | `--positive`, `colorSuccess` |

```css
/* 现有 app/src/styles/tokens.css 为唯一色权威源；Ant Design token 从这些变量同步。
   MASTER 不重复定义十六进制，改用变量名引用，避免两处漂移。 */
```

---

## Typography

| 用途 | Font | 说明 |
|------|------|------|
| Display / 标题 | `Songti SC`, `Noto Serif CJK SC`, `Source Han Serif SC`, serif | 衬线，强调工坊/出版物质感 |
| Body / 正文 | Inter, `PingFang SC`, `Noto Sans CJK SC`, sans-serif | 高可读性 |
| Mono / 代码·状态 | `SFMono-Regular`, `Cascadia Code`, `JetBrains Mono`, monospace | 任务路径、模型、状态标签 |

- 正文基准 16px / line-height 1.5。
- 标题用衬线、粗体 600、字母压紧 `-0.02em~-0.03em`。
- 状态/代码信息用 mono + 11–13px + 次要色。

---

## Motion

- 时长基准 **150–300ms**，easing `cubic-bezier(0.22, 1, 0.36, 1)`（现有 `--motion-ease`）。
- 应用场景（Motion 库）：
  - 任务行/信息层进入：轻微 `y + opacity` fade（≤300ms）。
  - 流式输出：内容平稳进入，不做复杂 choreography。
  - 审批/注意卡片：`attention` 状态用 `yf-pulse` 呼吸提示（1s 循环）但**只作用于圆点小元素**，不放大整卡。
- ❌ 不做 scroll pin、SplitText、Flip 等重编排（工具 `--motion 4/10` Standard，克制）。
- 尊重 `prefers-reduced-motion`（现有 global.css 已有全局覆盖）。

---

## Spacing（与 Ant Design token 对齐）

| Token | 值 | Ant Token | 用途 |
|-------|-----|-----------|------|
| `--space-xs` | 4px | `paddingXS` | 紧凑间隙 |
| `--space-sm` | 8px | `paddingSM` | 图标间距、内联 |
| `--space-md` | 16px | `padding` | 标准内边距 |
| `--space-lg` | 24px | `paddingLG` | 区块内边距 |
| `--space-xl` | 32px | `borderRadiusLG` / 大间隙 | 分组间隔 |
| `--space-2xl` | 48px | — | 页面段落边缘 |
| `--space-3xl` | 64px | — | 首屏留白 |

---

## 布局结构

- **桌面**：固定侧栏（约 286px）+ 主区；主区聚焦当前任务会话。
- **移动（≤1024px）**：侧栏可折叠，主区占满；≤720px 隐藏侧栏属性信息。
- 响应式断点：375 / 768 / 1024 / 1440。
- 无横向滚动；文案可省略号截断。

---

## Pre-Delivery Checklist

- [ ] 无 Emoji 图标 —— 一律 Lucide。
- [ ] 图标来源统一 Lucide。
- [ ] 可点击元素 `cursor:pointer`。
- [ ] hover 平滑过渡 150–300ms。
- [ ] 浅色模式正文对比度 ≥4.5:1。
- [ ] 键盘导航焦点可见。
- [ ] `prefers-reduced-motion` 被尊重。
- [ ] 响应式 375/768/1024/1440 无横向滚动。
- [ ] 无内容被固定导航遮挡。
