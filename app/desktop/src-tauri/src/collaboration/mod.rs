//! 协作 IPC 边界：数据库工作交给现有阻塞池，一次只接纳一个操作。
//! Created on 2026-10-13
//! @author: https://github.com/Linmoqian
mod backend;
pub mod model;
mod node;
#[cfg(test)]
mod tests;
use model::{Action, Error, Result};
use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
#[serde(untagged)]
pub enum Input {
    Node(NodeInput),
    Local(Action),
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum NodeInput {
    #[serde(rename = "nodeConnect")]
    Connect {
        address: String,
        #[serde(default)]
        directory: Option<String>,
    },
    #[serde(rename = "nodeDisconnect")]
    Disconnect {},
    #[serde(rename = "nodeRefresh")]
    Refresh {},
}
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;

pub struct Runtime {
    path: PathBuf,
    backend: Arc<Mutex<backend::Backend>>,
    busy: Arc<AtomicBool>,
}
struct Permit(Arc<AtomicBool>);
fn authorize(label: &str) -> Result<()> {
    if label != "main" {
        return Err(Error::new("COLLAB_FORBIDDEN", "当前窗口无权访问协作数据"));
    }
    Ok(())
}
impl Drop for Permit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl Runtime {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            backend: Arc::new(Mutex::new(backend::Backend::default())),
            busy: Arc::new(AtomicBool::new(false)),
        }
    }
    fn admit(&self) -> Result<Permit> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Permit(self.busy.clone()))
            .map_err(|_| Error::new("COLLAB_BUSY", "协作操作正在执行，请稍后重试"))
    }
}

#[tauri::command]
pub async fn collaboration_action(
    mut input: Input,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Runtime>,
) -> Result<Value> {
    authorize(window.label())?;
    let permit = state.admit()?;
    let backend = state.backend.clone();
    let app = window.app_handle().clone();
    let path = state.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        if let Input::Node(NodeInput::Connect { directory, .. }) = &mut input {
            if directory.is_none() {
                use tauri_plugin_dialog::DialogExt;
                let selected = app
                    .dialog()
                    .file()
                    .set_title("选择团队节点数据目录")
                    .blocking_pick_folder()
                    .ok_or_else(|| Error::new("COLLAB_CANCELLED", "已取消连接"))?;
                *directory = Some(
                    selected
                        .into_path()
                        .map_err(Error::storage)?
                        .to_string_lossy()
                        .into_owned(),
                );
            }
        }
        backend.lock().map_err(Error::storage)?.apply(input, &path)
    })
    .await
    .map_err(Error::storage)?
}
