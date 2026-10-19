//! 按已确认的节点绑定路由现有协作操作；本地数据库与节点数据各自保持原有权威。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{
    model::{Action, Error, Result},
    node, Input, NodeInput,
};
use serde_json::Value;
use std::path::Path;
#[derive(Default)]
pub(super) struct Backend {
    local: Option<yunfeng_team::Store>,
    binding: Option<node::Binding>,
    loaded: bool,
}
impl Backend {
    pub(super) fn apply(&mut self, input: Input, path: &Path) -> Result<Value> {
        let config = path.with_file_name("node-connection.json");
        match input {
            Input::Node(NodeInput::Connect { address, directory }) => {
                let directory =
                    directory.ok_or_else(|| Error::new("COLLAB_INPUT", "请选择节点数据目录"))?;
                let (binding, view) = node::Binding::connect(&address, directory.into())?;
                node::save(&config, Some(&binding))?;
                self.binding = Some(binding);
                self.loaded = true;
                return Ok(view);
            }
            Input::Node(NodeInput::Disconnect {}) => {
                node::save(&config, None)?;
                self.binding = None;
                self.loaded = true;
                return self.local(Action::Snapshot {}, path);
            }
            _ => {}
        }
        if !self.loaded {
            self.binding = node::load(&config)?;
            self.loaded = true;
        }
        match input {
            Input::Node(NodeInput::Refresh {}) => match &self.binding {
                Some(binding) => binding.refresh(),
                None => self.local(Action::Snapshot {}, path),
            },
            Input::Local(action) => match &self.binding {
                Some(binding) => binding.action(action),
                None => self.local(action, path),
            },
            _ => Err(Error::new("COLLAB_INPUT", "协作操作无效")),
        }
    }
    fn local(&mut self, action: Action, path: &Path) -> Result<Value> {
        if self.local.is_none() {
            self.local = Some(yunfeng_team::Store::open(path)?);
        }
        let snapshot = self
            .local
            .as_mut()
            .ok_or_else(|| Error::storage("not ready"))?
            .action(action)?;
        serde_json::to_value(snapshot).map_err(Error::storage)
    }
}
