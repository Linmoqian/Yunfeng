// 移动端薄客户端：设备内不启动任何后端进程。
// Agent 任务/对话经 HTTP/SSE 直连电脑侧 yunfeng-gateway；
// 远程屏幕经 WebSocket 直连电脑侧 yunfeng-mobile-backend。
// 本地通知走系统通知插件（桌面壳与未来移动目标一致）。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
