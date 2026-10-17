//! 每成员独立凭据；读取当前数据库权限，不允许成员管理身份或调用节点控制动作。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{types::*, Node};
use crate::{
    members::{self, Member, MemberKind},
    model::{Error, Link, Result},
};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
enum MemberAction {
    Identity {},
    Snapshot {},
    Presence {
        status: crate::presence::Activity,
    },
    Children {},
    Message {
        id: String,
        text: String,
    },
    Board {
        announcement: String,
        links: Vec<Link>,
    },
    Share {
        name: String,
        data: String,
    },
    File {
        id: String,
    },
    RobotAuthorize {
        operation: String,
    },
}
impl Node {
    pub(super) fn grant(&mut self, id: &str, rotate: bool) -> Result<Value> {
        let team = self.team()?;
        crate::model::uuid(id)?;
        let member = members::find(&self.store.db, &team, id)?.ok_or_else(input)?;
        if member.node_id != self.identity.id || !member.profile.enabled {
            return Err(denied());
        }
        let saved: Option<String> = self
            .store
            .db
            .query_row(
                "SELECT token FROM node_member_auth WHERE team=?1 AND member=?2",
                params![team, id],
                |r| r.get(0),
            )
            .optional()
            .map_err(Error::storage)?;
        let credential = if rotate {
            token()
        } else {
            saved.unwrap_or_else(token)
        };
        self.store.db.execute("INSERT INTO node_member_auth(team,member,token) VALUES (?1,?2,?3) ON CONFLICT(team,member) DO UPDATE SET token=excluded.token", params![team,id,credential]).map_err(Error::storage)?;
        Ok(json!({"memberId":id,"token":credential}))
    }
    fn authenticate_member(&self, credential: &str) -> Result<Member> {
        secret(credential)?;
        let team = self.team()?;
        let id: Option<String> = self
            .store
            .db
            .query_row(
                "SELECT member FROM node_member_auth WHERE team=?1 AND token=?2",
                params![team, credential],
                |r| r.get(0),
            )
            .optional()
            .map_err(Error::storage)?;
        let member =
            members::find(&self.store.db, &team, &id.ok_or_else(denied)?)?.ok_or_else(denied)?;
        if member.node_id != self.identity.id || !member.profile.enabled {
            return Err(denied());
        }
        Ok(member)
    }
    pub(super) fn member_action(&mut self, token: &str, value: Value) -> Result<Value> {
        let member = self.authenticate_member(token)?;
        let action: MemberAction = serde_json::from_value(value).map_err(|_| input())?;
        let (permission, command) = match action {
            MemberAction::Identity {} => return Ok(super::member_view::identity(&member)),
            MemberAction::Snapshot {} => return self.member_snapshot(&member),
            MemberAction::Presence { status } => {
                let team = self.team()?;
                super::presence::report(&mut self.store, &team, &member, status)?;
                return self.member_snapshot(&member);
            }
            MemberAction::Children {} => {
                return Ok(Value::Array(
                    self.member_children(&member)?
                        .iter()
                        .map(super::member_view::identity)
                        .collect(),
                ))
            }
            MemberAction::Message { id, text } => ("message", Command::Message { id, text }),
            MemberAction::Board {
                announcement,
                links,
            } => (
                "board",
                Command::Board {
                    announcement,
                    links,
                },
            ),
            MemberAction::Share { name, data } => ("share", Command::Share { name, data }),
            MemberAction::File { id } => return self.member_file(&member, &id),
            MemberAction::RobotAuthorize { operation } => {
                return robot_authorization(&member, &operation)
            }
        };
        if !member.profile.allows(permission) {
            return Err(denied());
        }
        self.command_as(command, Some(member.clone()))?;
        self.member_snapshot(&member)
    }
}
fn robot_authorization(member: &Member, operation: &str) -> Result<Value> {
    if member.profile.kind != MemberKind::Robot {
        return Err(denied());
    }
    let robot = member.profile.robot.as_ref().ok_or_else(input)?;
    if operation != "telemetry" && !member.profile.allows("robotControl") {
        return Err(denied());
    }
    if !matches!(
        operation,
        "connect" | "disconnect" | "telemetry" | "emergencyStop"
    ) && !robot.capabilities.iter().any(|v| v == operation)
    {
        return Err(denied());
    }
    Ok(json!({"authorized":true,"memberId":member.id,"operation":operation}))
}
pub(super) fn initialize(db: &rusqlite::Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS node_member_auth (team TEXT NOT NULL,member TEXT NOT NULL,token TEXT NOT NULL UNIQUE,PRIMARY KEY(team,member),FOREIGN KEY(team,member) REFERENCES team_members(team,id));").map_err(Error::storage)
}
