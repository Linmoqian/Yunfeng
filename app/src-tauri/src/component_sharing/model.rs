//! 工作台组件的进程内权威状态；字段合并避免不同字段互相覆盖。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{collections::HashMap, path::PathBuf};

#[derive(Debug, Serialize)]
pub struct Error {
    pub code: &'static str,
    pub message: &'static str,
}
pub fn error(code: &'static str, message: &'static str) -> Error {
    Error { code, message }
}

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub component: String,
    pub revision: u64,
    pub state: Value,
}

pub fn title(component: &str) -> Result<&'static str, Error> {
    match component {
        "writing" => Ok("文稿"),
        "resources" => Ok("资源"),
        _ => Err(error("UNKNOWN_COMPONENT", "组件尚未接入共享")),
    }
}
pub fn authorize(label: &str, component: &str) -> Result<(), Error> {
    title(component)?;
    if label == "main" || label == format!("component-{component}") {
        Ok(())
    } else {
        Err(error("FORBIDDEN", "窗口无权访问该组件"))
    }
}

#[derive(Default)]
pub struct Store {
    states: HashMap<String, Snapshot>,
    path: Option<PathBuf>,
}
impl Store {
    pub fn persistent(path: PathBuf) -> Self {
        Self {
            states: HashMap::new(),
            path: Some(path),
        }
    }
    pub fn get(&mut self, component: &str) -> Result<Snapshot, Error> {
        title(component)?;
        if component == "writing" {
            if let Some(path) = &self.path {
                if let Some(snapshot) = super::persistence::read(path)? {
                    validate(
                        component,
                        snapshot
                            .state
                            .as_object()
                            .ok_or_else(|| error("STORAGE_ERROR", "文稿数据无效"))?,
                    )?;
                    self.states.insert(component.into(), snapshot);
                }
            }
        }
        Ok(self
            .states
            .entry(component.into())
            .or_insert_with(|| Snapshot {
                component: component.into(),
                revision: 0,
                state: if component == "writing" {
                    json!({"name":"", "body":""})
                } else {
                    json!({"view":"文件", "files":[]})
                },
            })
            .clone())
    }
    pub fn patch(&mut self, component: &str, patch: Map<String, Value>) -> Result<Snapshot, Error> {
        let mut snapshot = self.get(component)?;
        if patch.is_empty() {
            return Ok(snapshot);
        }
        let mut state = snapshot
            .state
            .as_object()
            .cloned()
            .ok_or_else(|| error("STATE_ERROR", "组件状态不可用"))?;
        state.extend(patch);
        validate(component, &state)?;
        if snapshot.state == Value::Object(state.clone()) {
            return Ok(snapshot);
        }
        snapshot.revision = snapshot
            .revision
            .checked_add(1)
            .ok_or_else(|| error("STATE_ERROR", "版本已达上限"))?;
        snapshot.state = Value::Object(state);
        if component == "writing" {
            if let Some(path) = &self.path {
                super::persistence::save(path, &snapshot)?;
            }
        }
        self.states.insert(component.into(), snapshot.clone());
        Ok(snapshot)
    }
}
fn validate(component: &str, state: &Map<String, Value>) -> Result<(), Error> {
    let valid = if component == "writing" {
        state.len() == 2
            && state
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|v| v.chars().count() <= 200)
            && state
                .get("body")
                .and_then(Value::as_str)
                .is_some_and(|v| v.len() <= 64 * 1024)
    } else {
        state.len() == 2
            && state
                .get("view")
                .and_then(Value::as_str)
                .is_some_and(|v| ["文件", "图片", "视频", "结果"].contains(&v))
            && state
                .get("files")
                .and_then(Value::as_array)
                .is_some_and(|files| {
                    files.len() <= 200
                        && files.iter().all(|file| {
                            file.as_object().is_some_and(|f| {
                                f.len() == 2
                                    && f.get("name")
                                        .and_then(Value::as_str)
                                        .is_some_and(|v| v.chars().count() <= 255)
                                    && f.get("size")
                                        .and_then(Value::as_u64)
                                        .is_some_and(|v| v <= 9_007_199_254_740_991)
                            })
                        })
                })
    };
    if valid {
        Ok(())
    } else {
        Err(error("INVALID_STATE", "字段、类型或大小不符合组件契约"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn patch(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }
    #[test]
    fn field_updates_preserve_other_fields_and_revisions() {
        let mut store = Store::default();
        store
            .patch("writing", patch(json!({"name":"草稿"})))
            .unwrap();
        let s = store
            .patch("writing", patch(json!({"body":"正文"})))
            .unwrap();
        assert_eq!(s.revision, 2);
        assert_eq!(s.state["name"], "草稿");
        assert_eq!(
            store
                .patch("writing", patch(json!({"body":"正文"})))
                .unwrap()
                .revision,
            2
        );
    }
    #[test]
    fn invalid_patch_is_atomic() {
        let mut store = Store::default();
        assert!(store
            .patch("writing", patch(json!({"unknown":true})))
            .is_err());
        assert!(store
            .patch("writing", patch(json!({"body":"x".repeat(65537)})))
            .is_err());
        assert_eq!(store.get("writing").unwrap().revision, 0);
        assert!(store
            .patch(
                "resources",
                patch(json!({"files":[{"name":"file", "size":-1}]}))
            )
            .is_err());
    }
    #[test]
    fn windows_are_scoped() {
        assert!(authorize("main", "writing").is_ok());
        assert!(authorize("component-writing", "writing").is_ok());
        assert!(authorize("component-writing", "resources").is_err());
        assert!(authorize("untrusted", "writing").is_err());
        assert!(authorize("main", "unknown").is_err());
    }
}
