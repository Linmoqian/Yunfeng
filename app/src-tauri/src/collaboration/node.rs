//! 桌面节点绑定；只持久化用户选择的目录与固定身份，令牌每次在 Rust 内读取。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::model::{Action, Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use yunfeng_team::node::{client, types};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Binding {
    address: String,
    directory: PathBuf,
    id: String,
}
impl Binding {
    pub(super) fn connect(address: &str, directory: PathBuf) -> Result<(Self, Value)> {
        let address = types::address(address)?;
        let directory = directory.canonicalize().map_err(Error::storage)?;
        let mut binding = Self {
            address,
            directory,
            id: String::new(),
        };
        let reply = client::request(
            &binding.address,
            &binding.credential()?,
            &json!({"action":"snapshot"}),
        )?;
        let identity: types::Identity =
            serde_json::from_value(reply["node"].clone()).map_err(|_| types::input())?;
        types::identity(&identity)?;
        if identity.address != binding.address {
            return Err(types::denied());
        }
        binding.id = identity.id;
        let view = binding.view(reply)?;
        Ok((binding, view))
    }
    fn credential(&self) -> Result<String> {
        let path = self.directory.join("control.token");
        let meta = std::fs::symlink_metadata(&path).map_err(Error::storage)?;
        if !meta.file_type().is_file() || meta.len() != 64 {
            return Err(types::denied());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o077 != 0 {
                return Err(types::denied());
            }
        }
        let token = std::fs::read_to_string(path).map_err(Error::storage)?;
        types::secret(&token)?;
        Ok(token)
    }
    pub(super) fn refresh(&self) -> Result<Value> {
        let reply = self.request(json!({"action":"snapshot"}))?;
        self.view(reply)
    }

    pub(super) fn action(&self, action: Action) -> Result<Value> {
        if matches!(action, Action::Activate { .. } | Action::Leave {}) {
            return Err(Error::new("COLLAB_INPUT", "请使用断开节点返回本地团队"));
        }
        let mut input = serde_json::to_value(action).map_err(Error::storage)?;
        if let Some(object) = input.as_object_mut() {
            object.remove("owner");
        }
        self.view(self.request(input)?)
    }
    fn request(&self, value: Value) -> Result<Value> {
        client::request(&self.address, &self.credential()?, &value)
    }
    fn view(&self, reply: Value) -> Result<Value> {
        let identity: types::Identity =
            serde_json::from_value(reply["node"].clone()).map_err(|_| types::input())?;
        if identity.id != self.id
            || identity.address != self.address
            || reply["snapshot"]["installationId"] != self.id
        {
            return Err(types::denied());
        }
        let failures = reply["autoSync"]["failedPeers"].as_u64().unwrap_or(0);
        let mut snapshot = reply["snapshot"].clone();
        let object = snapshot.as_object_mut().ok_or_else(types::input)?;
        object.insert("connection".into(), json!({"id":self.id,"name":identity.name,"address":self.address,"peerFailures":failures}));
        Ok(snapshot)
    }
}
pub(super) fn load(path: &Path) -> Result<Option<Binding>> {
    match std::fs::read(path) {
        Ok(bytes) => {
            if bytes.len() > 16_384 {
                return Err(types::input());
            }
            let binding: Binding = serde_json::from_slice(&bytes).map_err(|_| types::input())?;
            if types::address(&binding.address)? != binding.address
                || !binding.directory.is_absolute()
            {
                return Err(types::input());
            }
            yunfeng_team::model::uuid(&binding.id)?;
            Ok(Some(binding))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(Error::storage(e)),
    }
}
pub(super) fn save(path: &Path, binding: Option<&Binding>) -> Result<()> {
    if let Some(binding) = binding {
        let parent = path.parent().ok_or_else(types::input)?;
        std::fs::create_dir_all(parent).map_err(Error::storage)?;
        let mut file = tempfile::NamedTempFile::new_in(parent).map_err(Error::storage)?;
        file.write_all(&serde_json::to_vec(binding).map_err(Error::storage)?)
            .map_err(Error::storage)?;
        file.as_file().sync_all().map_err(Error::storage)?;
        file.persist(path).map_err(Error::storage)?;
    } else if let Err(e) = std::fs::remove_file(path) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(Error::storage(e));
        }
    }
    Ok(())
}
