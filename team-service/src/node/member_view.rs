//! 成员下行视图；所有成员响应共用过滤边界，不返回组织上级、邻居或全队快照。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{log, types::*, Node};
use crate::{
    members::{self, Member},
    model::{Error, Result},
};
use serde_json::{json, Value};

pub(super) fn identity(member: &Member) -> Value {
    json!({"id":member.id,"profile":member.profile})
}

impl Node {
    pub(super) fn member_children(&self, member: &Member) -> Result<Vec<Member>> {
        let team = self.team()?;
        let relations = crate::relations::list(&self.store.db, &team)?;
        Ok(members::list(&self.store.db, &team)?
            .into_iter()
            .filter(|child| {
                relations
                    .iter()
                    .any(|r| r.member_id == child.id && r.parent_id.as_deref() == Some(&member.id))
            })
            .collect())
    }
    fn visible_members(&self, member: &Member) -> Result<Vec<String>> {
        let mut ids: Vec<String> = self
            .member_children(member)?
            .into_iter()
            .map(|m| m.id)
            .collect();
        ids.push(member.id.clone());
        Ok(ids)
    }
    pub(super) fn member_file(&self, member: &Member, id: &str) -> Result<Value> {
        crate::model::uuid(id)?;
        let ids = self.visible_members(member)?;
        let event = log::events(&self.store, &self.team()?)?.into_iter().find(|event| event.id == id && matches!(&event.change, Mutation::File {member_id:Some(owner),..} if ids.contains(owner))).ok_or_else(denied)?;
        serde_json::to_value(event.change).map_err(Error::storage)
    }
    pub(super) fn member_snapshot(&self, member: &Member) -> Result<Value> {
        let children = self.member_children(member)?;
        let mut visible: Vec<String> = children.iter().map(|m| m.id.clone()).collect();
        visible.push(member.id.clone());
        let events = log::events(&self.store, &self.team()?)?;
        let mut messages = vec![];
        let mut files = vec![];
        let mut boards = vec![];
        let mut board_owners = std::collections::HashSet::new();
        for event in events.iter().rev() {
            match &event.change {
                Mutation::Message {
                    member_id: Some(owner),
                    name,
                    text,
                    time,
                } if visible.contains(owner) && messages.len() < 200 => {
                    messages.push(json!({"id":event.id,"memberId":owner,"name":name,"text":text.trim(),"createdAt":time}));
                }
                Mutation::File {
                    member_id: Some(owner),
                    name,
                    size,
                    sha256,
                    ..
                } if visible.contains(owner) => {
                    files.push(json!({"id":event.id,"memberId":owner,"name":name,"size":size,"sha256":sha256}));
                }
                Mutation::MemberBoard {
                    member_id: owner,
                    announcement,
                    links,
                } if visible.contains(owner) && board_owners.insert(owner) => {
                    boards.push(
                        json!({"memberId":owner,"announcement":announcement.trim(),"links":links}),
                    );
                }
                _ => {}
            }
        }
        messages.reverse();
        files.reverse();
        boards.reverse();
        Ok(
            json!({"identity":identity(member),"children":children.iter().map(identity).collect::<Vec<_>>(),"messages":messages,"files":files,"boards":boards}),
        )
    }
}
