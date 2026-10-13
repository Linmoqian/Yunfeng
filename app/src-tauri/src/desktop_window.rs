//! 主窗口恢复入口，启动、Dock 重新打开与托盘显示使用相同顺序。
//! Created on 2026-10-13
//! @author: https://github.com/Linmoqian
use tauri::{AppHandle, Manager};

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_owned())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}
