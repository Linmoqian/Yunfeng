//! 组件语义聚焦：单个共享指针，只保存当前运行状态，不影响输入焦点。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::model::{error, title, Error};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct FocusSnapshot {
    pub component: String,
    pub revision: u64,
    pub target: Option<String>,
}

#[derive(Default)]
pub struct FocusStore {
    revision: u64,
    active: Option<(String, String)>,
}
impl FocusStore {
    pub fn read(&self, component: &str) -> Result<FocusSnapshot, Error> {
        title(component)?;
        Ok(FocusSnapshot {
            component: component.into(),
            revision: self.revision,
            target: self
                .active
                .as_ref()
                .filter(|(id, _)| id == component)
                .map(|(_, target)| target.clone()),
        })
    }
    pub fn focus(&mut self, component: &str, target: &str) -> Result<FocusSnapshot, Error> {
        title(component)?;
        let targets: &[&str] = match component {
            "writing" => &["component", "name", "body"],
            "resources" => &["component", "view", "files"],
            _ => &[],
        };
        if !targets.contains(&target) {
            return Err(error("INVALID_STATE", "聚焦区域尚未注册"));
        }
        let next = Some((component.into(), target.into()));
        if self.active != next {
            self.advance()?;
            self.active = next;
        }
        self.read(component)
    }
    pub fn blur(&mut self, component: &str) -> Result<FocusSnapshot, Error> {
        title(component)?;
        // 旧组件的延迟清理不能撤销已经移动到其他组件的指针。
        if self.active.as_ref().is_some_and(|(id, _)| id == component) {
            self.advance()?;
            self.active = None;
        }
        self.read(component)
    }
    fn advance(&mut self) -> Result<(), Error> {
        self.revision = self
            .revision
            .checked_add(1)
            .ok_or_else(|| error("STATE_ERROR", "聚焦版本已达上限"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn focus_is_global_validated_and_idempotent() {
        let mut store = FocusStore::default();
        assert_eq!(store.focus("writing", "body").unwrap().revision, 1);
        assert_eq!(store.focus("writing", "body").unwrap().revision, 1);
        assert!(store.focus("writing", "script").is_err());
        assert!(store.focus("unknown", "component").is_err());
        assert_eq!(
            store.read("writing").unwrap().target.as_deref(),
            Some("body")
        );
        assert_eq!(store.focus("resources", "files").unwrap().revision, 2);
        assert!(store.read("writing").unwrap().target.is_none());
        assert_eq!(store.blur("writing").unwrap().revision, 2);
        assert_eq!(
            store.read("resources").unwrap().target.as_deref(),
            Some("files")
        );
        assert!(store.blur("resources").unwrap().target.is_none());
        assert_eq!(store.read("resources").unwrap().revision, 3);
    }
}
