# 桌面开发入口

在 `app/` 执行 `pnpm tauri dev`，也兼容项目既有的 `npm run tauri dev`。入口转交 Tauri CLI，由其启动 Vite、构建和监听 Rust。

macOS 使用 Cargo runner 生成 `src-tauri/target/debug/dev-bundle/Yunfeng 开发.app`，复用项目应用标识与图标，执行本机临时签名。应用包作为开发产物留在 Cargo target 目录，不入库。

该方案参考 LianAgent 的 `scripts/dev/tauri.mjs` 与 `macos-app.mjs`，便于 Dock、窗口管理与桌面验证工具识别开发进程。其他平台直接使用 Tauri CLI。

`processes.mjs` 移植自 LianAgent 提交 `a73bf448`，按本仓库工作目录和绝对二进制路径筛选旧开发树，并保护当前启动链。新启动先退出旧 Tauri/Vite/原生实例；macOS runner 在每次 Rust 重载时只回收旧原生树，避免 runner 被终止后子应用成为孤立进程。发送信号前再次核对 PID、开始时间和命令，先正常退出，四秒后才结束残留。

只读核对：在 `app/` 执行 `node scripts/dev/processes.mjs --dry-run`。清理不会匹配安装版或其他仓库；独立 preview/web-shared Vite 保留。自定义 Cargo target 路径需另行核实，不自动清理未知位置。

观察界面时先查已有进程，再绑定已运行开发包。禁止反复启动应用来获取截图；修改 Rust 后确认旧应用消失、新应用只有一个，IPC 恢复。正常关闭 runner 会转发退出信号；强制杀死 runner 产生的孤立应用在下一轮启动前回收。
