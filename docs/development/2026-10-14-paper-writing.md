# 论文写作第一批迁移

专用界面直接复用 `WorkspaceShell`、`DockPanel` 三栏组件：左侧参考文献与章节，中间 Markdown 编辑和预览，右侧图片素材及文稿操作。通过工作台标签进入；左右互换、拖动调宽、折叠和右键菜单沿用共享外壳。紧凑侧栏提供展开入口，原生独立窗口使用相同三栏。

参考 LianAgent 的 `AppLayout` 工具插槽和 `research-tools` 交互；采用 Yunfeng 的 Ant Design、浅白淡紫及圆角 token。正文、标题和图片由 Rust 写入应用数据目录 `paper-writing/store.sqlite3`，前端通过既有 SDK 同步。浏览器仅提供编辑预览，并明确提示未持久化。

文稿为 UTF-8 Markdown，最多 64 KiB。导入拒绝无效编码、二进制文本和非 Markdown 文件；替换已有内容前确认。导出生成 `.md` 文件。参考文献链接仅接受 HTTP/HTTPS，插入正文参考文献章节，不自动检索或验证文献。预览不执行 HTML，不加载远程图片。

当前保存一份共享文稿，更新成功后原生重启恢复。图片支持 PNG/JPEG/WebP，图注、插入正文、可恢复移出；正文以 `paper-asset:UUID` 引用本机素材。Markdown 导出不打包图片，PDF 会嵌入正文引用的图片。

PDF 由 Rust 管理原生保存对话框、Markdown 转换、图片转换和限时子进程；需要本机 Pandoc、XeLaTeX 及中文字体。可通过绝对路径环境变量 `YUNFENG_PANDOC_BIN`、`YUNFENG_XELATEX_BIN` 配置工具。macOS 使用 PingFang SC，Windows 使用 Microsoft YaHei，Linux 使用 Noto Sans CJK SC。支持标题、段落、列表、表格、图注、引用链接；尚未实现 TeX 数学公式、期刊模板、多文稿管理和完整文献管理。详见 [PDF 接口](../api/2026-10-14-paper-pdf.md) 与 [素材接口](../api/2026-10-14-paper-assets.md)。

原生验证图片导入、图注保存、插入与预览、重启恢复、独立写作窗口恢复；PDF 保存及取消操作通过，导出的中文、表格、云枫图片和图注已渲染检查。Windows/Linux 未原生验收。既有大包警告、开发 runner 热重载遗留旧进程、终端并行测试偶发失败仍需后续处理。
