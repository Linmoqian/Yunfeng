//! 本地协作契约与校验；安装标识不作为网络认证身份。
//! Created on 2026-10-13
//! @author: https://github.com/Linmoqian
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Serialize)]
pub struct Error {
    pub code: &'static str,
    pub message: &'static str,
}
impl Error {
    pub fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }
    pub fn storage(_: impl std::fmt::Display) -> Self {
        Self::new("COLLAB_STORAGE", "协作数据读写失败，请重试")
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub title: String,
    pub url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    Snapshot {},
    Presence {
        status: crate::presence::Activity,
    },
    Relation {
        relation: crate::relations::Relation,
    },
    Member {
        member: crate::members::MemberInput,
    },
    Create {
        name: String,
        owner: String,
    },
    Message {
        id: String,
        text: String,
    },
    Board {
        announcement: String,
        links: Vec<Link>,
    },
    Activate {
        id: String,
    },
    Leave {},
}
#[derive(Clone, Debug, Serialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub members: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub name: String,
    pub member_id: Option<String>,
    pub text: String,
    pub created_at: u64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub installation_id: String,
    pub mode: &'static str,
    pub team: Option<Team>,
    pub saved_teams: Vec<Team>,
    pub messages: Vec<Message>,
    pub board: String,
    pub links: Vec<Link>,
    pub network_available: bool,
    pub participants: Vec<crate::members::Member>,
    pub relations: Vec<crate::relations::Relation>,
    pub presence: Vec<crate::presence::Presence>,
}

pub fn name(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control) {
        return Err(Error::new(
            "COLLAB_INPUT",
            "名称须为 1 至 80 字，且不包含控制字符",
        ));
    }
    Ok(value.to_owned())
}
pub fn body(value: &str, empty_allowed: bool) -> Result<String> {
    let value = value.trim();
    if (!empty_allowed && value.is_empty())
        || value.chars().count() > 4000
        || value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(Error::new(
            "COLLAB_INPUT",
            "内容最多 4000 字，不能包含非法控制字符",
        ));
    }
    Ok(value.to_owned())
}
pub fn uuid(value: &str) -> Result<String> {
    uuid::Uuid::parse_str(value)
        .map(|id| id.to_string())
        .map_err(|_| Error::new("COLLAB_INPUT", "记录标识必须是有效 UUID"))
}
pub fn links(values: Vec<Link>) -> Result<Vec<Link>> {
    if values.len() > 16 {
        return Err(Error::new("COLLAB_INPUT", "协作链接最多 16 条"));
    }
    values
        .into_iter()
        .map(|link| {
            let parsed = url::Url::parse(link.url.trim())
                .map_err(|_| Error::new("COLLAB_INPUT", "链接格式无效"))?;
            if !matches!(parsed.scheme(), "http" | "https")
                || !parsed.has_host()
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.as_str().len() > 2048
            {
                return Err(Error::new(
                    "COLLAB_INPUT",
                    "仅接受不包含登录凭据的 HTTP 或 HTTPS 链接",
                ));
            }
            Ok(Link {
                title: name(&link.title)?,
                url: parsed.to_string(),
            })
        })
        .collect()
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
