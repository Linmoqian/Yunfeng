//! Agent 与程序复用组件状态、校验和窗口入口，不执行任意前端脚本。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::{error, publish, set_window, Error, Runtime};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Read {
        component: String,
    },
    Patch {
        component: String,
        patch: Map<String, Value>,
    },
    Open {
        component: String,
        patch: Option<Map<String, Value>>,
    },
    Close {
        component: String,
    },
}

pub fn execute(app: &tauri::AppHandle, request: Request) -> Result<Value, Error> {
    let (component, patch, open) = match request {
        Request::Read { component } => (component, None, false),
        Request::Patch { component, patch } => (component, Some(patch), false),
        Request::Open { component, patch } => (component, patch, true),
        Request::Close { component } => {
            set_window(app, &component, false)?;
            return Ok(Value::Null);
        }
    };
    let runtime = app.state::<Runtime>();
    let updating = patch.is_some();
    // 与 IPC 共用 Store；释放状态锁后才通知和打开窗口。
    let snapshot = {
        let mut store = runtime
            .0
            .lock()
            .map_err(|_| error("STATE_ERROR", "组件状态不可用"))?;
        match patch {
            Some(patch) => store.patch(&component, patch)?,
            None => store.get(&component)?,
        }
    };
    if updating {
        publish(app, &snapshot);
    }
    if open {
        set_window(app, &component, true)?;
    }
    Ok(json!(snapshot))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn request_rejects_scripts_unknown_fields_and_missing_patch() {
        for value in [
            json!({"action":"eval", "script":"alert(1)"}),
            json!({"action":"read", "component":"writing", "patch":{}}),
            json!({"action":"patch", "component":"writing"}),
            json!({"action":"open", "component":"writing", "url":"https://example.com"}),
        ] {
            assert!(serde_json::from_value::<Request>(value).is_err());
        }
        assert!(serde_json::from_value::<Request>(
            json!({"action":"open", "component":"resources", "patch":{"view":"结果"}})
        )
        .is_ok());
    }
}
