//! 交互反馈 IPC：窗口身份由 Tauri 提供，呈现版本由组件快照校验。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::{
    error,
    interaction::{Feedback, InteractionStore, Report},
    model::authorize,
    Error, Runtime,
};
use serde::Deserialize;
use std::time::Instant;
use tauri::{Emitter, Manager, State, WebviewWindow};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    component: String,
    report: Option<Report>,
}

pub fn prune(app: &tauri::AppHandle, store: &mut InteractionStore) {
    store.retain_windows(|label| app.get_webview_window(label).is_some());
}
pub fn read(app: &tauri::AppHandle, runtime: &Runtime, component: &str) -> Result<Feedback, Error> {
    let mut interaction = runtime
        .3
        .lock()
        .map_err(|_| error("STATE_ERROR", "交互反馈不可用"))?;
    prune(app, &mut interaction);
    let revision = runtime
        .0
        .lock()
        .map_err(|_| error("STATE_ERROR", "组件状态不可用"))?
        .get(component)?
        .revision;
    interaction.read(component, revision, Instant::now())
}
#[tauri::command]
pub fn component_interaction(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    request: Request,
) -> Result<Feedback, Error> {
    authorize(window.label(), &request.component)?;
    let Some(mut report) = request.report else {
        return read(window.app_handle(), &runtime, &request.component);
    };
    report.visible &=
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true);
    let status = {
        let mut interaction = runtime
            .3
            .lock()
            .map_err(|_| error("STATE_ERROR", "交互反馈不可用"))?;
        prune(window.app_handle(), &mut interaction);
        let revision = runtime
            .0
            .lock()
            .map_err(|_| error("STATE_ERROR", "组件状态不可用"))?
            .get(&request.component)?
            .revision;
        interaction.report(
            window.label(),
            &request.component,
            report,
            revision,
            Instant::now(),
        )?;
        interaction.read(&request.component, revision, Instant::now())?
    };
    for label in ["main".into(), format!("component-{}", status.component)] {
        if let Some(target) = window.app_handle().get_webview_window(&label) {
            let _ = target.emit("component-interaction-changed", &status);
        }
    }
    Ok(status)
}
