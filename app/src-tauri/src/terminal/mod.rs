//! 工作台终端命令边界；主窗口与桌面 Agent 共用最多四个本机 PTY。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
mod agent_bridge;
pub use agent_bridge::AgentBridge;
mod model;
mod session;
use model::{authorize, error, Request, Result, MAX_SESSIONS};
use serde_json::{json, Value};
use session::Session;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use tauri::{State, WebviewWindow};

#[derive(Default, Clone)]
pub struct Runtime(Arc<Mutex<BTreeMap<String, Arc<Session>>>>);
impl Runtime {
    fn get(&self, id: &str) -> Result<Arc<Session>> {
        self.0
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端状态不可用"))?
            .get(id)
            .cloned()
            .ok_or_else(|| error("NOT_FOUND", "终端已关闭，请重新创建"))
    }
    pub(super) fn action(&self, request: Request) -> Result<Value> {
        match request {
            Request::Start { size } => {
                let mut sessions = self
                    .0
                    .lock()
                    .map_err(|_| error("STATE_ERROR", "终端状态不可用"))?;
                if sessions.len() >= MAX_SESSIONS {
                    return Err(error("LIMIT", "最多同时保留四个终端"));
                }
                let session = Arc::new(Session::start(size)?);
                let id = uuid::Uuid::new_v4().to_string();
                sessions.insert(id.clone(), session);
                Ok(json!({ "id": id }))
            }
            Request::List => {
                let sessions = self
                    .0
                    .lock()
                    .map_err(|_| error("STATE_ERROR", "终端状态不可用"))?;
                Ok(json!(sessions.keys().collect::<Vec<_>>()))
            }
            Request::Read { id, cursor } => Ok(json!(self.get(&id)?.read(cursor)?)),
            Request::Write { id, data } => {
                self.get(&id)?.write(&data)?;
                Ok(Value::Null)
            }
            Request::Resize { id, size } => {
                self.get(&id)?.resize(size)?;
                Ok(Value::Null)
            }
            Request::Stop { id } => {
                self.get(&id)?.stop()?;
                Ok(Value::Null)
            }
            Request::Close { id } => {
                let session = match self.get(&id) {
                    Ok(session) => session,
                    Err(e) if e.code == "NOT_FOUND" => return Ok(Value::Null),
                    Err(e) => return Err(e),
                };
                session.stop()?;
                self.0
                    .lock()
                    .map_err(|_| error("STATE_ERROR", "终端状态不可用"))?
                    .remove(&id);
                Ok(Value::Null)
            }
        }
    }
    pub(super) fn start_command(&self, cwd: &str, command: &str) -> Result<Value> {
        let mut sessions = self
            .0
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端状态不可用"))?;
        if sessions.len() >= MAX_SESSIONS {
            return Err(error("LIMIT", "最多同时保留四个终端"));
        }
        let session = Arc::new(Session::command(cwd, command)?);
        let id = uuid::Uuid::new_v4().to_string();
        sessions.insert(id.clone(), session);
        Ok(json!({ "id": id }))
    }
    pub fn stop_all(&self) {
        let sessions = self
            .0
            .lock()
            .map(|map| map.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for session in sessions {
            let _ = session.stop();
        }
    }
}

#[tauri::command]
pub async fn terminal_action(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    request: Request,
) -> Result<Value> {
    authorize(window.label())?;
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.action(request))
        .await
        .map_err(|_| error("STATE_ERROR", "终端任务失败"))?
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn session_limit_close_and_repeated_close() {
        let runtime = Runtime::default();
        for _ in 0..MAX_SESSIONS {
            runtime
                .action(Request::Start {
                    size: model::Size { cols: 80, rows: 24 },
                })
                .unwrap();
        }
        assert_eq!(
            runtime
                .action(Request::Start {
                    size: model::Size { cols: 80, rows: 24 }
                })
                .unwrap_err()
                .code,
            "LIMIT"
        );
        let ids: Vec<String> =
            serde_json::from_value(runtime.action(Request::List).unwrap()).unwrap();
        for id in ids {
            runtime.action(Request::Close { id: id.clone() }).unwrap();
            runtime.action(Request::Close { id }).unwrap();
        }
        assert_eq!(runtime.action(Request::List).unwrap(), json!([]));
    }
}
