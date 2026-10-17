//! 可单独启动的本机节点；每个实例拥有自己的数据库和对等连接，无中心服务。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
mod http;
mod log;
mod peers;
pub mod types;
use crate::{
    model::{self, Action, Error, Result},
    Store,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{net::SocketAddr, path::Path};
use types::*;
/// 持有单个节点的存储与连接能力；由串行 HTTP 入口驱动。
pub struct Node {
    store: Store,
    identity: Identity,
    control: String,
    stopped: bool,
}
impl Node {
    /// 打开独立节点数据库；拒绝非回环地址、名称变更及不兼容的存储版本。
    pub fn open(path: &Path, name: &str, address: &str) -> Result<Self> {
        let address = types::address(address)?;
        let mut store = Store::open(path)?;
        let (name, control) = log::initialize(&mut store, name)?;
        let id = store.snapshot()?.installation_id;
        Ok(Self {
            store,
            identity: Identity { id, name, address },
            control,
            stopped: false,
        })
    }
    fn team(&self) -> Result<String> {
        self.store
            .snapshot()?
            .team
            .map(|t| t.id)
            .ok_or_else(|| Error::new("COLLAB_NO_TEAM", "请先创建或加入团队"))
    }
    fn snapshot(&self) -> Result<Value> {
        let mut snapshot = self.store.snapshot()?;
        let peers = if let Some(team) = &snapshot.team {
            peers::list(&self.store, &team.id)?
        } else {
            vec![]
        };
        snapshot.network_available = !peers.is_empty();
        if let Some(team) = &mut snapshot.team {
            if !team.members.contains(&self.identity.name) {
                team.members.push(self.identity.name.clone());
            }
            for peer in &peers {
                if !team.members.contains(&peer.node.name) {
                    team.members.push(peer.node.name.clone());
                }
            }
        }
        let events = snapshot
            .team
            .as_ref()
            .map(|t| log::events(&self.store, &t.id))
            .transpose()?
            .unwrap_or_default();
        let files: Vec<_> = events.iter().filter_map(|e| if let Mutation::File { name, sha256, size, .. } = &e.change { Some(json!({ "id": e.id, "name": name, "sha256": sha256, "size": size, "origin": e.origin })) } else { None }).collect();
        Ok(
            json!({"node": self.identity, "snapshot": snapshot, "peers": peers.iter().map(|p| &p.node).collect::<Vec<_>>(), "files": files}),
        )
    }
    fn join(&mut self, invitation: Invitation) -> Result<Value> {
        let address = types::address(&invitation.address)?;
        model::uuid(&invitation.team)?;
        secret(&invitation.ticket)?;
        if address == self.identity.address {
            return Err(input());
        }
        if self
            .store
            .snapshot()?
            .team
            .is_some_and(|t| t.id != invitation.team)
        {
            return Err(Error::new("COLLAB_ACTIVE_TEAM", "当前节点已有其他团队"));
        }
        // 请求丢失后以相同节点重试仍使用原边令牌，避免生成无法恢复的半连接。
        let incoming = format!(
            "{:x}",
            Sha256::digest(format!(
                "{}:{}:{}",
                self.control, invitation.ticket, self.identity.id
            ))
        );
        let reply = http::post(
            &address,
            "/v1/join",
            &invitation.ticket,
            &Join {
                ticket: invitation.ticket.clone(),
                node: self.identity.clone(),
                incoming_token: incoming.clone(),
            },
        )?;
        let welcome: Welcome = serde_json::from_value(reply).map_err(|_| input())?;
        identity(&welcome.node)?;
        secret(&welcome.incoming_token)?;
        if welcome.team != invitation.team
            || welcome.node.address != address
            || welcome.node.id == self.identity.id
        {
            return Err(input());
        }
        self.store.atomic(|s| {
            log::merge(s, &welcome.team, &welcome.events)?;
            peers::remember(
                s,
                &welcome.team,
                &Peer {
                    node: welcome.node,
                    incoming,
                    outgoing: welcome.incoming_token,
                },
            )?;
            s.action(Action::Activate { id: welcome.team })?;
            Ok(())
        })?;
        self.snapshot()
    }
    fn sync(&mut self) -> Result<Value> {
        let team = self.team()?;
        let mut results = vec![];
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        for peer in peers::list(&self.store, &team)? {
            let result = (|| {
                if std::time::Instant::now() >= deadline {
                    return Err(network("sync deadline"));
                }
                let body = Exchange {
                    from: self.identity.id.clone(),
                    team: team.clone(),
                    events: log::events(&self.store, &team)?,
                };
                let reply: Exchange = serde_json::from_value(http::post(
                    &peer.node.address,
                    "/v1/exchange",
                    &peer.outgoing,
                    &body,
                )?)
                .map_err(|_| input())?;
                if reply.from != peer.node.id || reply.team != team {
                    return Err(denied());
                }
                log::merge(&mut self.store, &team, &reply.events)
            })();
            results.push(match result {
                Ok(()) => json!({"node": peer.node.id, "ok": true}),
                Err(error) => json!({"node": peer.node.id,"ok": false,"error": error}),
            });
        }
        Ok(json!({"results": results, "state": self.snapshot()?}))
    }
    fn command(&mut self, command: Command) -> Result<Value> {
        match command {
            Command::Shutdown {} => {
                self.stopped = true;
                return Ok(json!({"stopping":true}));
            }
            Command::Snapshot {} => {}
            Command::Create { name } => {
                let owner = self.identity.name.clone();
                let node = self.identity.id.clone();
                self.store.atomic(|s| {
                    let snapshot = s.action(Action::Create { name, owner })?;
                    let team = snapshot.team.ok_or_else(input)?;
                    if log::events(s, &team.id)?
                        .iter()
                        .any(|event| event.id == team.id)
                    {
                        return Ok(());
                    }
                    log::publish(
                        s,
                        &node,
                        &team.id,
                        team.id.clone(),
                        Mutation::Team {
                            name: team.name,
                            owner: team.owner,
                        },
                    )
                })?;
            }
            Command::Message { id, text } => {
                let team = self.team()?;
                let id = model::uuid(&id)?;
                let text = model::body(&text, false)?;
                if let Some(old) = log::events(&self.store, &team)?
                    .into_iter()
                    .find(|e| e.id == id)
                {
                    if old.origin != self.identity.id
                        || !matches!(old.change, Mutation::Message { text: ref saved, .. } if *saved == text)
                    {
                        return Err(Error::new("NODE_CONFLICT", "消息标识与原内容冲突"));
                    }
                } else {
                    log::publish(
                        &mut self.store,
                        &self.identity.id,
                        &team,
                        id,
                        Mutation::Message {
                            name: self.identity.name.clone(),
                            text,
                            time: now()? as u64,
                        },
                    )?;
                }
            }
            Command::Board {
                announcement,
                links,
            } => {
                let team = self.team()?;
                log::publish(
                    &mut self.store,
                    &self.identity.id,
                    &team,
                    uuid::Uuid::new_v4().to_string(),
                    Mutation::Board {
                        announcement: model::body(&announcement, true)?,
                        links: model::links(links)?,
                    },
                )?;
            }
            Command::Invite {} => {
                let team = self.team()?;
                return serde_json::to_value(peers::invite(
                    &mut self.store,
                    &team,
                    &self.identity.address,
                )?)
                .map_err(Error::storage);
            }
            Command::Join { invitation } => return self.join(invitation),
            Command::Sync {} => return self.sync(),
            Command::Share { name, data } => {
                let team = self.team()?;
                if data.len() > MAX_FILE * 4 / 3 + 4 {
                    return Err(input());
                }
                let bytes = STANDARD.decode(&data).map_err(|_| input())?;
                let hash = format!("{:x}", Sha256::digest(&bytes));
                log::publish(
                    &mut self.store,
                    &self.identity.id,
                    &team,
                    uuid::Uuid::new_v4().to_string(),
                    Mutation::File {
                        name,
                        data,
                        sha256: hash,
                        size: bytes.len(),
                    },
                )?;
            }
            Command::File { id } => {
                let team = self.team()?;
                model::uuid(&id)?;
                let event = log::events(&self.store, &team)?
                    .into_iter()
                    .find(|e| e.id == id && matches!(e.change, Mutation::File { .. }))
                    .ok_or_else(|| Error::new("COLLAB_NOT_FOUND", "共享文件不存在"))?;
                return serde_json::to_value(event.change).map_err(Error::storage);
            }
        }
        self.snapshot()
    }
    fn handle(&mut self, route: &str, token: &str, value: Value) -> Result<Value> {
        match route {
            "/v1/local" => {
                if token != self.control {
                    return Err(denied());
                }
                self.command(serde_json::from_value(value).map_err(|_| input())?)
            }
            "/v1/join" => serde_json::to_value(peers::accept(
                &mut self.store,
                &self.identity,
                token,
                serde_json::from_value(value).map_err(|_| input())?,
            )?)
            .map_err(Error::storage),
            "/v1/exchange" => serde_json::to_value(peers::exchange(
                &mut self.store,
                &self.identity,
                token,
                serde_json::from_value(value).map_err(|_| input())?,
            )?)
            .map_err(Error::storage),
            _ => Err(input()),
        }
    }
}
/// 启动单实例有界节点；控制令牌写入私有文件，stdout 仅包含公开启动信息。
/// 监听、目录锁、配置或数据库失败返回错误；成功运行至收到授权 shutdown。
pub fn serve(directory: &Path, name: &str, bind: SocketAddr) -> Result<()> {
    let listener = http::listener(bind)?;
    let address = format!("http://{}", listener.local_addr().map_err(network)?);
    std::fs::create_dir_all(directory).map_err(Error::storage)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(Error::storage)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.create(true).read(true).write(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let instance = options
        .open(directory.join("instance.lock"))
        .map_err(Error::storage)?;
    instance
        .try_lock()
        .map_err(|_| Error::new("NODE_BUSY", "此数据目录已有运行中的节点"))?;
    let mut node = Node::open(&directory.join("store.sqlite3"), name, &address)?;
    let credential = directory.join("control.token");
    write_credential(&credential, &node.control)?;
    println!(
        "{}",
        serde_json::to_string(&node.identity).map_err(Error::storage)?
    );
    while !node.stopped {
        let (mut stream, remote) = listener.accept().map_err(network)?;
        if !remote.ip().is_loopback() {
            continue;
        }
        let result = http::read(&mut stream)
            .and_then(|(route, token, value)| node.handle(&route, &token, value));
        let _ = http::respond(&mut stream, result);
    }
    Ok(())
}
fn write_credential(path: &Path, token: &str) -> Result<()> {
    use std::io::Write;
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if !meta.file_type().is_file()
            || std::fs::read_to_string(path).map_err(Error::storage)? != token
        {
            return Err(Error::new("NODE_CONFIG", "节点凭据文件不匹配"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(Error::storage)?;
        }
        return Ok(());
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .map_err(Error::storage)?
        .write_all(token.as_bytes())
        .map_err(Error::storage)
}

#[cfg(test)]
mod tests;
