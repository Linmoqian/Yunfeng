//! 组织事件投影：核验发布宿主，按确定性顺序化解并发形成的环。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::types::*;
use crate::{
    model::{Error, Result},
    Store,
};

pub(super) fn project(store: &Store, team: &str, events: &[Event]) -> Result<()> {
    store
        .db
        .execute("DELETE FROM member_relations WHERE team=?1", [team])
        .map_err(Error::storage)?;
    let mut relations = std::collections::HashSet::new();
    for event in events.iter().rev() {
        let actor = match &event.change {
            Mutation::Relation { relation } => Some(&relation.member_id),
            Mutation::MemberBoard { member_id, .. } => Some(member_id),
            Mutation::File {
                member_id: Some(id),
                ..
            } => Some(id),
            Mutation::Message {
                member_id: Some(id),
                ..
            } => Some(id),
            _ => None,
        };
        if let Some(id) = actor {
            let member = crate::members::find(&store.db, team, id)?.ok_or_else(input)?;
            if member.node_id != event.origin {
                return Err(denied());
            }
        }
        if let Mutation::Relation { relation } = &event.change {
            if relations.insert(&relation.member_id) {
                crate::relations::validate(&store.db, team, relation)?;
                if !crate::relations::cycle(&store.db, team, relation)? {
                    crate::relations::save(&store.db, team, relation)?;
                }
            }
        }
    }
    Ok(())
}
