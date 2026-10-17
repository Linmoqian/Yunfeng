//! 成员身份、权限和设备资料；节点是宿主，一个节点可以拥有多个不同类型的成员。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use crate::model::{self, Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MemberKind {
    Human,
    Agent,
    Program,
    Robot,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Access {
    Observer,
    Contributor,
    Editor,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RobotKind {
    Vehicle,
    Drone,
    Arm,
    Other,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AssistantInfo {
    pub model: String,
    pub provider: String,
    pub skills: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RobotInfo {
    pub kind: RobotKind,
    pub model: String,
    pub capabilities: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub kind: MemberKind,
    pub access: Access,
    pub summary: String,
    pub enabled: bool,
    pub robot_control: bool,
    pub assistant: Option<AssistantInfo>,
    pub robot: Option<RobotInfo>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Member {
    pub id: String,
    pub node_id: String,
    pub profile: Profile,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemberInput {
    pub id: String,
    pub profile: Profile,
}

fn short(value: &str, limit: usize) -> Result<()> {
    if value.chars().count() > limit || value.chars().any(char::is_control) {
        return Err(input());
    }
    Ok(())
}
fn names(values: &[String]) -> Result<()> {
    if values.len() > 16 {
        return Err(input());
    }
    let mut seen = std::collections::HashSet::new();
    for value in values {
        model::name(value)?;
        if !seen.insert(value) {
            return Err(input());
        }
    }
    Ok(())
}
pub(crate) fn input() -> Error {
    Error::new("COLLAB_INPUT", "成员资料或身份专属字段无效")
}
pub(crate) fn forbidden() -> Error {
    Error::new("COLLAB_FORBIDDEN", "成员已停用或没有此操作权限")
}
impl Profile {
    pub(crate) fn validate(&self) -> Result<()> {
        model::name(&self.name)?;
        short(&self.summary, 240)?;
        if self.robot_control && self.kind != MemberKind::Robot {
            return Err(input());
        }
        if self.assistant.is_some() && self.kind != MemberKind::Agent {
            return Err(input());
        }
        if (self.kind == MemberKind::Robot) != self.robot.is_some() {
            return Err(input());
        }
        if let Some(info) = &self.assistant {
            short(&info.model, 80)?;
            short(&info.provider, 80)?;
            names(&info.skills)?;
        }
        if let Some(info) = &self.robot {
            short(&info.model, 80)?;
            names(&info.capabilities)?;
            for capability in &info.capabilities {
                let valid = match info.kind {
                    RobotKind::Vehicle => capability == "drive",
                    RobotKind::Drone => {
                        matches!(capability.as_str(), "takeoff" | "land" | "velocity")
                    }
                    RobotKind::Arm => matches!(capability.as_str(), "joints" | "gripper"),
                    RobotKind::Other => true,
                };
                if !valid {
                    return Err(input());
                }
            }
        }
        Ok(())
    }
    /// 当前资料是否允许协作动作；机器人控制另有显式授权，不从身份推导。
    pub fn allows(&self, operation: &str) -> bool {
        self.enabled
            && match operation {
                "read" => true,
                "message" | "share" => self.access != Access::Observer,
                "board" => self.access == Access::Editor,
                "robotControl" => self.robot_control,
                _ => false,
            }
    }
}
pub(crate) fn initialize(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE team_members (team TEXT NOT NULL REFERENCES teams(id),id TEXT NOT NULL,node TEXT NOT NULL,profile TEXT NOT NULL,PRIMARY KEY(team,id)); ALTER TABLE messages ADD COLUMN member_id TEXT; PRAGMA user_version=3;").map_err(Error::storage)?;
    let mut q = db
        .prepare("SELECT teams.id,owner,installations.id FROM teams CROSS JOIN installations")
        .map_err(Error::storage)?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(Error::storage)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Error::storage)?;
    let has_node: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='node_meta')",
            [],
            |r| r.get(0),
        )
        .map_err(Error::storage)?;
    let node_name: Option<String> = if has_node {
        db.query_row("SELECT name FROM node_meta WHERE singleton=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(Error::storage)?
    } else {
        None
    };
    for (team, owner, node) in rows {
        if let Some(name) = &node_name {
            let mut member = seed(db, &team, &node, name, false)?;
            let root: Option<String> = db
                .query_row(
                    "SELECT origin FROM node_event WHERE team=?1 AND id=?1",
                    [&team],
                    |r| r.get(0),
                )
                .optional()
                .map_err(Error::storage)?;
            member.profile.access = if root.as_deref() == Some(&node) {
                Access::Editor
            } else {
                Access::Contributor
            };
            save(db, &team, &member)?;
        } else {
            seed(db, &team, &node, &owner, true)?;
        }
    }
    Ok(())
}
pub(crate) fn seed(
    db: &Connection,
    team: &str,
    node: &str,
    name: &str,
    owner: bool,
) -> Result<Member> {
    if let Some(member) = find(db, team, node)? {
        return Ok(member);
    }
    let member = Member {
        id: node.into(),
        node_id: node.into(),
        profile: Profile {
            name: name.into(),
            kind: if owner {
                MemberKind::Human
            } else {
                MemberKind::Program
            },
            access: if owner {
                Access::Editor
            } else {
                Access::Contributor
            },
            summary: String::new(),
            enabled: true,
            robot_control: false,
            assistant: None,
            robot: None,
        },
    };
    save(db, team, &member)?;
    Ok(member)
}
pub(crate) fn list(db: &Connection, team: &str) -> Result<Vec<Member>> {
    let mut q = db
        .prepare("SELECT id,node,profile FROM team_members WHERE team=?1 ORDER BY rowid LIMIT 128")
        .map_err(Error::storage)?;
    let rows = q
        .query_map([team], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(Error::storage)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Error::storage)?;
    rows.into_iter()
        .map(|(id, node_id, profile)| {
            Ok(Member {
                id,
                node_id,
                profile: serde_json::from_str(&profile).map_err(Error::storage)?,
            })
        })
        .collect()
}
pub(crate) fn find(db: &Connection, team: &str, id: &str) -> Result<Option<Member>> {
    Ok(list(db, team)?.into_iter().find(|m| m.id == id))
}
pub(crate) fn save(db: &Connection, team: &str, member: &Member) -> Result<()> {
    model::uuid(&member.id)?;
    model::uuid(&member.node_id)?;
    member.profile.validate()?;
    let node: Option<String> = db
        .query_row(
            "SELECT node FROM team_members WHERE team=?1 AND id=?2",
            params![team, member.id],
            |r| r.get(0),
        )
        .optional()
        .map_err(Error::storage)?;
    if node.as_ref().is_some_and(|node| *node != member.node_id) {
        return Err(forbidden());
    }
    if node.is_none() && list(db, team)?.len() >= 128 {
        return Err(Error::new("COLLAB_LIMIT", "每队最多128个成员"));
    }
    db.execute("INSERT INTO team_members(team,id,node,profile) VALUES (?1,?2,?3,?4) ON CONFLICT(team,id) DO UPDATE SET profile=excluded.profile", params![team,member.id,member.node_id,serde_json::to_string(&member.profile).map_err(Error::storage)?]).map_err(Error::storage)?;
    Ok(())
}
