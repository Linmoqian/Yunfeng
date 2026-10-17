//! 本机对等节点协议：控制接口、限额和不可变同步事件。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use crate::model::{Error, Link, Result};
use serde::{Deserialize, Serialize};
pub const MAX_BODY: usize = 8 * 1024 * 1024;
pub const MAX_LOG: usize = 6 * 1024 * 1024;
pub const MAX_EVENTS: usize = 1000;
pub const MAX_FILE: usize = 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Identity {
    pub id: String,
    pub name: String,
    pub address: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Invitation {
    pub address: String,
    pub team: String,
    pub ticket: String,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Command {
    Presence {
        status: crate::presence::Activity,
    },
    Snapshot {},
    Relation {
        relation: crate::relations::Relation,
    },
    Member {
        member: crate::members::MemberInput,
    },
    Grant {
        id: String,
        #[serde(default)]
        rotate: bool,
    },
    Create {
        name: String,
    },
    Message {
        id: String,
        text: String,
    },
    Board {
        announcement: String,
        links: Vec<Link>,
    },
    Invite {},
    Join {
        invitation: Invitation,
    },
    Sync {},
    Share {
        name: String,
        data: String,
    },
    File {
        id: String,
    },
    Shutdown {},
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Mutation {
    Relation {
        relation: crate::relations::Relation,
    },
    MemberBoard {
        #[serde(rename = "memberId")]
        member_id: String,
        announcement: String,
        links: Vec<Link>,
    },
    Member {
        member: crate::members::Member,
    },
    Team {
        name: String,
        owner: String,
    },
    Message {
        #[serde(default, rename = "memberId", skip_serializing_if = "Option::is_none")]
        member_id: Option<String>,
        name: String,
        text: String,
        time: u64,
    },
    Board {
        announcement: String,
        links: Vec<Link>,
    },
    File {
        #[serde(default, rename = "memberId", skip_serializing_if = "Option::is_none")]
        member_id: Option<String>,
        name: String,
        data: String,
        sha256: String,
        size: usize,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub id: String,
    pub origin: String,
    pub clock: i64,
    pub team: String,
    pub change: Mutation,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Join {
    pub ticket: String,
    pub node: Identity,
    pub incoming_token: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Welcome {
    pub node: Identity,
    pub team: String,
    pub incoming_token: String,
    pub events: Vec<Event>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Exchange {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub presence: Vec<crate::presence::Heartbeat>,
    pub from: String,
    pub team: String,
    pub events: Vec<Event>,
}
#[derive(Clone)]
pub struct Peer {
    pub node: Identity,
    pub incoming: String,
    pub outgoing: String,
}
pub fn input() -> Error {
    Error::new("COLLAB_INPUT", "节点请求字段、地址或内容无效")
}
pub fn denied() -> Error {
    Error::new("NODE_FORBIDDEN", "节点认证或团队授权失败")
}
pub fn network(_: impl std::fmt::Display) -> Error {
    Error::new(
        "NODE_UNAVAILABLE",
        "节点连接失败，请检查地址与节点状态后重试",
    )
}
pub fn address(value: &str) -> Result<String> {
    let url = url::Url::parse(value).map_err(|_| input())?;
    let ip = url
        .host_str()
        .ok_or_else(input)?
        .trim_matches(['[', ']'])
        .parse::<std::net::IpAddr>()
        .map_err(|_| input())?;
    if !ip.is_loopback()
        || url.scheme() != "http"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(input());
    }
    let port = url.port_or_known_default().ok_or_else(input)?;
    if port == 0 {
        return Err(input());
    }
    Ok(format!("http://{}", std::net::SocketAddr::new(ip, port)))
}
pub fn identity(value: &Identity) -> Result<()> {
    crate::model::uuid(&value.id)?;
    crate::model::name(&value.name)?;
    if address(&value.address)? != value.address {
        return Err(input());
    }
    Ok(())
}
pub fn secret(value: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(input());
    }
    Ok(())
}
pub fn token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
pub fn now() -> Result<i64> {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(Error::storage)?
            .as_millis(),
    )
    .map_err(Error::storage)
}
