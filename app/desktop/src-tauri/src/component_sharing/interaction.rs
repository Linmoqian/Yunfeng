//! 窗口交互反馈与 Agent 写入门禁；反馈只保存短期元数据。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::model::{error, title, Error};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
const LEASE: Duration = Duration::from_secs(4);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Report {
    pub sequence: u64,
    pub visible: bool,
    pub rendered_revision: Option<u64>,
    pub editing: bool,
}
struct View {
    report: Report,
    received: Instant,
}
#[derive(Default)]
pub struct InteractionStore {
    version: u64,
    views: HashMap<(String, String), View>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Feedback {
    pub version: u64,
    pub component: String,
    pub known: bool,
    pub visible: bool,
    pub rendered: bool,
    pub rendered_revision: Option<u64>,
    pub editing: bool,
    pub yielded: bool,
}
impl InteractionStore {
    pub fn retain_windows(&mut self, exists: impl Fn(&str) -> bool) {
        self.views.retain(|(window, _), _| exists(window));
    }
    pub fn report(
        &mut self,
        window: &str,
        component: &str,
        report: Report,
        revision: u64,
        now: Instant,
    ) -> Result<(), Error> {
        title(component)?;
        if report.sequence > 9_007_199_254_740_991
            || report.rendered_revision.is_some_and(|r| r > revision)
        {
            return Err(error("INVALID_STATE", "交互反馈版本无效"));
        }
        let key = (window.into(), component.into());
        if self
            .views
            .get(&key)
            .is_some_and(|view| report.sequence <= view.report.sequence)
        {
            return Ok(());
        }
        self.version = self
            .version
            .checked_add(1)
            .ok_or_else(|| error("STATE_ERROR", "交互版本已达上限"))?;
        self.views.insert(
            key,
            View {
                report,
                received: now,
            },
        );
        Ok(())
    }
    pub fn read(&self, component: &str, revision: u64, now: Instant) -> Result<Feedback, Error> {
        title(component)?;
        let views: Vec<_> = self
            .views
            .iter()
            .filter(|((_, id), _)| id == component)
            .map(|(_, view)| view)
            .collect();
        let fresh: Vec<_> = views
            .iter()
            .filter(|view| now.duration_since(view.received) < LEASE)
            .collect();
        // 过期的编辑反馈不能假装空闲；窗口关闭或新的反馈才能释放。
        let editing = self.views.values().any(|view| view.report.editing);
        let known = !fresh.is_empty();
        let rendered_revision = fresh
            .iter()
            .filter(|view| view.report.visible)
            .filter_map(|view| view.report.rendered_revision)
            .max();
        Ok(Feedback {
            version: self.version,
            component: component.into(),
            known,
            visible: fresh.iter().any(|view| view.report.visible),
            rendered: rendered_revision == Some(revision) && !editing,
            rendered_revision,
            editing,
            yielded: editing || !known,
        })
    }
    pub fn allow_agent(&self, component: &str, revision: u64, now: Instant) -> Result<(), Error> {
        let status = self.read(component, revision, now)?;
        if status.editing {
            return Err(error("COMPONENT_BUSY", "工程师正在操作，云枫已让出组件"));
        }
        if !status.known {
            return Err(error(
                "INTERACTION_UNAVAILABLE",
                "组件交互反馈尚未确认，请稍后读取状态",
            ));
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editing_expiry_order_and_render_ack_are_safe() {
        let mut store = InteractionStore::default();
        let now = Instant::now();
        assert!(store.allow_agent("writing", 2, now).is_err());
        let report = |sequence, editing, revision| Report {
            sequence,
            editing,
            visible: true,
            rendered_revision: Some(revision),
        };
        store
            .report("main", "writing", report(1, false, 1), 2, now)
            .unwrap();
        assert!(!store.read("writing", 2, now).unwrap().rendered);
        store
            .report("main", "writing", report(2, false, 2), 2, now)
            .unwrap();
        assert!(store.read("writing", 2, now).unwrap().rendered);
        store
            .report("component-writing", "writing", report(1, true, 2), 2, now)
            .unwrap();
        assert!(store.allow_agent("writing", 2, now).is_err());
        let expired = now + LEASE;
        assert!(!store.read("writing", 2, expired).unwrap().known);
        assert!(store.read("writing", 2, expired).unwrap().editing);
        store
            .report(
                "component-writing",
                "writing",
                report(0, false, 2),
                2,
                expired,
            )
            .unwrap();
        assert!(store.read("writing", 2, expired).unwrap().editing);
        assert!(store
            .report("main", "writing", report(3, false, 3), 2, expired)
            .is_err());
        store.retain_windows(|label| label == "main");
        store
            .report("main", "writing", report(3, false, 2), 2, expired)
            .unwrap();
        assert!(store.allow_agent("writing", 2, expired).is_ok());
    }
}
