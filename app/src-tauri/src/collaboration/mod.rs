//! 协作 IPC 边界：数据库工作交给现有阻塞池，一次只接纳一个操作。
//! Created on 2026-10-13
//! @author: https://github.com/Linmoqian
pub mod model;
mod store;
#[cfg(test)]
mod tests;
use model::{Action, Error, Result, Snapshot};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub struct Runtime {
    path: PathBuf,
    store: Arc<Mutex<Option<store::Store>>>,
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
            store: Arc::new(Mutex::new(None)),
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
    input: Action,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Runtime>,
) -> Result<Snapshot> {
    authorize(window.label())?;
    let permit = state.admit()?;
    let store = state.store.clone();
    let path = state.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let mut guard = store.lock().map_err(Error::storage)?;
        if guard.is_none() {
            *guard = Some(store::Store::open(&path)?);
        }
        guard
            .as_mut()
            .ok_or_else(|| Error::new("COLLAB_STORAGE", "协作存储未就绪"))?
            .action(input)
    })
    .await
    .map_err(Error::storage)?
}
