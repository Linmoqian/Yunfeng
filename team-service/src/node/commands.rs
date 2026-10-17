//! 节点控制动作与协作发布；成员入口复用相同执行路径并固定真实消息作者。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{log, peers, types::*, Node};
use crate::{
    members::{self, Member},
    model::{self, Action, Error, Result},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
impl Node {
    pub(super) fn command(&mut self, command: Command) -> Result<Value> {
        self.command_as(command, None)
    }
    pub(super) fn command_as(&mut self, command: Command, sender: Option<Member>) -> Result<Value> {
        match command {
            Command::Shutdown {} => {
                self.stopped = true;
                return Ok(json!({"stopping":true}));
            }
            Command::Snapshot {} => {}
            Command::Member { member } => {
                let team = self.team()?;
                let member = Member {
                    id: member.id,
                    node_id: self.identity.id.clone(),
                    profile: member.profile,
                };
                log::publish(
                    &mut self.store,
                    &self.identity.id,
                    &team,
                    uuid::Uuid::new_v4().to_string(),
                    Mutation::Member { member },
                )?;
            }
            Command::Grant { id, rotate } => return self.grant(&id, rotate),
            Command::Create { name } => {
                let owner = self.identity.name.clone();
                let participant_name = owner.clone();
                let node = self.identity.id.clone();
                self.store.atomic(|s| {
                    let snapshot = s.action(Action::Create { name, owner })?;
                    let team = snapshot.team.ok_or_else(input)?;
                    let mut card = members::seed(&s.db, &team.id, &node, &participant_name, false)?;
                    let saved = log::events(s, &team.id)?;
                    if !saved.iter().any(|event| event.id == team.id) {
                        card.profile.kind = members::MemberKind::Program;
                        members::save(&s.db, &team.id, &card)?;
                        log::publish(s, &node, &team.id, team.id.clone(), Mutation::Team { name: team.name, owner: team.owner })?;
                    }
                    if !saved.iter().any(|event| matches!(&event.change, Mutation::Member { member } if member.id == node)) {
                        log::publish(s, &node, &team.id, uuid::Uuid::new_v4().to_string(), Mutation::Member { member: card })?;
                    }
                    Ok(())
                })?;
            }
            Command::Message { id, text } => {
                let team = self.team()?;
                let id = model::uuid(&id)?;
                let text = model::body(&text, false)?;
                let sender = sender.unwrap_or(
                    members::find(&self.store.db, &team, &self.identity.id)?.ok_or_else(input)?,
                );
                if let Some(old) = log::events(&self.store, &team)?
                    .into_iter()
                    .find(|e| e.id == id)
                {
                    if old.origin != self.identity.id
                        || !matches!(old.change, Mutation::Message { text: ref saved, member_id: ref actor, .. } if *saved == text && actor.as_deref().unwrap_or(&self.identity.id) == sender.id)
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
                            name: sender.profile.name,
                            member_id: Some(sender.id),
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
}
