//! 共享聚焦的 IPC 和私有 Agent 通道边界；释放锁后广播快照。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::{error, focus::FocusSnapshot, model::authorize, Error, Runtime};
use serde::Deserialize;
use tauri::{Emitter, Manager, State, WebviewWindow};

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum FocusRequest {
    Read {
        component: String,
    },
    Focus {
        component: String,
        target: Option<String>,
    },
    Blur {
        component: String,
    },
}
impl FocusRequest {
    fn component(&self) -> &str {
        match self {
            Self::Read { component } | Self::Focus { component, .. } | Self::Blur { component } => {
                component
            }
        }
    }
}

#[tauri::command]
pub fn component_focus(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    request: FocusRequest,
) -> Result<FocusSnapshot, Error> {
    authorize(window.label(), request.component())?;
    execute(window.app_handle(), &runtime, request)
}

pub fn execute(
    app: &tauri::AppHandle,
    runtime: &Runtime,
    request: FocusRequest,
) -> Result<FocusSnapshot, Error> {
    let updating = !matches!(request, FocusRequest::Read { .. });
    let (snapshot, all) = {
        let mut focus = runtime
            .2
            .lock()
            .map_err(|_| error("STATE_ERROR", "聚焦状态不可用"))?;
        let snapshot = match request {
            FocusRequest::Read { component } => focus.read(&component)?,
            FocusRequest::Focus { component, target } => {
                focus.focus(&component, target.as_deref().unwrap_or("component"))?
            }
            FocusRequest::Blur { component } => focus.blur(&component)?,
        };
        let all = [focus.read("writing")?, focus.read("resources")?];
        (snapshot, all)
    };
    if updating {
        for view in all {
            for label in ["main".into(), format!("component-{}", view.component)] {
                if let Some(window) = app.get_webview_window(&label) {
                    let _ = window.emit("component-focus-changed", &view);
                }
            }
        }
    }
    Ok(snapshot)
}
