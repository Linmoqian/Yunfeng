# 桌面开发入口

在 `app/` 执行 `pnpm tauri dev`，也兼容项目既有的 `npm run tauri dev`。入口转交 Tauri CLI，由其启动 Vite、构建和监听 Rust。

macOS 使用 Cargo runner 生成 `src-tauri/target/debug/dev-bundle/Yunfeng 开发.app`，复用项目应用标识与图标，执行本机临时签名。应用包作为开发产物留在 Cargo target 目录，不入库。

该方案参考 LianAgent 的 `scripts/dev/tauri.mjs` 与 `macos-app.mjs`，便于 Dock、窗口管理与桌面验证工具识别开发进程。其他平台直接使用 Tauri CLI。
