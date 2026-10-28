# 研究工具

## 界面精简核对

| 修改前 | 修改后 | 原因 |
| --- | --- | --- |
| 文稿操作和格式栏常驻 13 个入口 | 一个文稿菜单、粗体、斜体和更多格式，共 4 个入口 | 减少按钮密度，完整动作仍可发现 |
| 数据添加同时出现在左右栏 | 左栏章节导航，右栏单一文本添加入口 | 避免重复入口 |
| 正文外围卡片描边 | 标题下细分隔线，正文无外围描边 | 让正文占据主要视觉空间 |

macOS 开发窗口已核对两个菜单的打开与 Escape 关闭；类型检查和文稿核心测试通过。原生导入、导出文件对话框尚未在此轮逐项验收。

从 LianAgent `app/desktop/src/features/workspace/research-tools` 迁移共享编辑器、格式化、提纲、文献和数据摘录交互；核对时参考仓库 HEAD 为 `3ea1ecf62454c7982e8314deb4260c14fb35beba`。组件改用 Ant Design 与 Yunfeng Token，三栏使用已有 WorkspaceShell / DockPanel。

四个工具各自保存正文与标题，共用参考文献、图片和文本摘录。数据分析、实验设计是记录文稿，计算与设计核验由其他工具执行。未接入参考仓库育种数据集、成果登记和工作区文件服务。

Rust 是保存权威。writing 快照的 name/body 继续代表论文，新增 analysis/literature/design 与 references/dataFiles，可读取旧快照。700 ms 合并输入、串行保存、Cmd+S 立即保存；主窗口与 component-writing 使用同一 SDK。同字段同时修改仍按后收到的写入覆盖，暂未迁移参考仓库的版本冲突拒绝。

沿用每篇 64 KiB 文稿限制；文本全文和摘录同为 64 KiB，文献最多 200 篇，摘录最多 20 份，快照最多 4 MiB。图片与 PDF 共用 SQLite 素材库：100 项、200 MiB，每项 20 MiB。PDF 仅校验头尾标识和容量，全文阅读由系统 PDF 组件负责。

Markdown、PDF、Word 和 ZIP 导出由 Rust 从已保存快照生成。PDF 需 Pandoc、XeLaTeX；Word 需 Pandoc。ZIP 包含当前正文、引用图片、文献 PDF、数据摘录和四工具元数据。目标写入使用临时文件与原子替换。

CodeMirror 6 与 Lezer 使用 MIT 许可；复用官方 Markdown 语言支持。zip 沿用参考仓库 2.4 系列，禁用默认特性，启用 deflate 以核验 Word 的压缩内容；文稿包写入使用 Stored。
