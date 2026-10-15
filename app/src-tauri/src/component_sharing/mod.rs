//! Tauri 组件状态与独立窗口边界；子窗口只访问所属组件。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
pub(crate) mod agent;
mod assets;
mod document_export;
pub mod export;
mod model;
mod pdf;
mod persistence;
mod research;
use model::{authorize, error, title, Error, Snapshot, Store};
use serde_json::{Map, Value};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct Runtime(pub Arc<Mutex<Store>>, pub PathBuf);
impl Runtime {
    pub fn new(path: PathBuf) -> Self {
        Self(Arc::new(Mutex::new(Store::persistent(path.clone()))), path)
    }
}

#[tauri::command]
pub async fn paper_asset_action(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    request: assets::Request,
) -> Result<Value, Error> {
    authorize(window.label(), "writing")?;
    let path = runtime.1.clone();
    tauri::async_runtime::spawn_blocking(move || assets::execute(&path, request))
        .await
        .map_err(|_| error("STORAGE_ERROR", "图片素材任务失败"))?
}

#[tauri::command]
pub async fn component_read(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    component: String,
) -> Result<Snapshot, Error> {
    authorize(window.label(), &component)?;
    let store = runtime.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .lock()
            .map_err(|_| error("STATE_ERROR", "组件状态不可用"))?
            .get(&component)
    })
    .await
    .map_err(|_| error("STATE_ERROR", "组件读取任务失败"))?
}

#[tauri::command]
pub async fn component_patch(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    component: String,
    patch: Map<String, Value>,
) -> Result<Snapshot, Error> {
    authorize(window.label(), &component)?;
    let store = runtime.0.clone();
    let key = component.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        store
            .lock()
            .map_err(|_| error("STATE_ERROR", "组件状态不可用"))?
            .patch(&key, patch)
    })
    .await
    .map_err(|_| error("STATE_ERROR", "组件保存任务失败"))??;
    // 状态提交成功后事件仅作为通知；接收方按版本去重并定期读取补偿丢失。
    publish(window.app_handle(), &snapshot);
    Ok(snapshot)
}

fn publish(app: &tauri::AppHandle, snapshot: &Snapshot) {
    for label in [
        "main".to_owned(),
        format!("component-{}", snapshot.component),
    ] {
        if let Some(target) = app.get_webview_window(&label) {
            let _ = target.emit("component-state-changed", &snapshot);
        }
    }
}

#[tauri::command]
pub async fn component_window(
    window: WebviewWindow,
    component: String,
    open: bool,
) -> Result<(), Error> {
    if window.label() != "main" {
        return Err(error("FORBIDDEN", "仅主窗口可管理组件窗口"));
    }
    set_window(window.app_handle(), &component, open)
}

fn set_window(app: &tauri::AppHandle, component: &str, open: bool) -> Result<(), Error> {
    let name = title(component)?;
    let label = format!("component-{component}");
    if let Some(existing) = app.get_webview_window(&label) {
        if !open {
            return existing
                .close()
                .map_err(|_| error("WINDOW_ERROR", "关闭组件窗口失败"));
        }
        existing
            .unminimize()
            .map_err(|_| error("WINDOW_ERROR", "恢复组件窗口失败"))?;
        existing
            .show()
            .map_err(|_| error("WINDOW_ERROR", "显示组件窗口失败"))?;
        return existing
            .set_focus()
            .map_err(|_| error("WINDOW_ERROR", "聚焦组件窗口失败"));
    }
    if !open {
        return Ok(());
    }
    // 固定本地路由与标签，不接受外部 URL 或任意窗口配置。
    let builder = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("component/{component}").into()),
    )
    .title(format!("云枫 · {name}"))
    .inner_size(
        if component == "writing" {
            1120.0
        } else {
            720.0
        },
        if component == "writing" { 760.0 } else { 680.0 },
    )
    .min_inner_size(420.0, 360.0)
    .decorations(false);
    #[cfg(target_os = "macos")]
    let builder = builder
        .decorations(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    match builder.build() {
        Ok(_) => Ok(()),
        Err(_) if app.get_webview_window(&label).is_some() => Ok(()),
        Err(_) => Err(error("WINDOW_ERROR", "创建组件窗口失败")),
    }
}
