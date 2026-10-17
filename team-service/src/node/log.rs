//! 同一 SQLite 内的节点事件与业务投影；批量导入失败时不留下部分更新。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::types::*;
use crate::{
    model::{self, Error, Result},
    Store,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
pub fn initialize(store: &mut Store, name: &str) -> Result<(String, String)> {
    store.db.execute_batch("CREATE TABLE IF NOT EXISTS node_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, name TEXT NOT NULL, control TEXT NOT NULL, clock INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS node_peer (team TEXT NOT NULL REFERENCES teams(id), id TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, incoming TEXT NOT NULL, outgoing TEXT NOT NULL, PRIMARY KEY(team,id)); CREATE TABLE IF NOT EXISTS node_invite (ticket TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(id), expires INTEGER NOT NULL, peer TEXT); CREATE TABLE IF NOT EXISTS node_event (id TEXT PRIMARY KEY, origin TEXT NOT NULL, clock INTEGER NOT NULL, team TEXT NOT NULL REFERENCES teams(id), payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS node_events_team ON node_event(team,clock,origin,id);").map_err(Error::storage)?;
    store
        .db
        .execute(
            "INSERT OR IGNORE INTO node_meta VALUES (1,1,?1,?2,0)",
            params![model::name(name)?, token()],
        )
        .map_err(Error::storage)?;
    let (version, saved, control): (i64, String, String) = store
        .db
        .query_row(
            "SELECT version,name,control FROM node_meta WHERE singleton=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(Error::storage)?;
    if version != 1 || saved != name {
        return Err(Error::new("NODE_CONFIG", "节点目录版本或名称不匹配"));
    }
    Ok((saved, control))
}
pub fn events(store: &Store, team: &str) -> Result<Vec<Event>> {
    let mut q = store
        .db
        .prepare("SELECT payload FROM node_event WHERE team=?1 ORDER BY clock,origin,id")
        .map_err(Error::storage)?;
    let texts = q
        .query_map([team], |r| r.get::<_, String>(0))
        .map_err(Error::storage)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Error::storage)?;
    texts
        .into_iter()
        .map(|s| serde_json::from_str(&s).map_err(Error::storage))
        .collect()
}
pub fn validate(event: &Event) -> Result<()> {
    model::uuid(&event.id)?;
    model::uuid(&event.origin)?;
    model::uuid(&event.team)?;
    if event.clock < 1 || event.clock > i64::MAX - 10000 {
        return Err(input());
    }
    match &event.change {
        Mutation::Relation { relation } => {
            model::uuid(&relation.member_id)?;
            if let Some(parent) = &relation.parent_id {
                model::uuid(parent)?;
            }
        }
        Mutation::MemberBoard {
            member_id,
            announcement,
            links,
        } => {
            model::uuid(member_id)?;
            model::body(announcement, true)?;
            model::links(links.clone())?;
        }
        Mutation::Member { member } => {
            member.profile.validate()?;
            crate::model::uuid(&member.id)?;
            crate::model::uuid(&member.node_id)?;
            if member.node_id != event.origin {
                return Err(denied());
            }
        }
        Mutation::Team { name, owner } => {
            model::name(name)?;
            model::name(owner)?;
            if event.id != event.team {
                return Err(input());
            }
        }
        Mutation::Message {
            name,
            text,
            time,
            member_id,
        } => {
            if let Some(id) = member_id {
                model::uuid(id)?;
            }
            model::name(name)?;
            model::body(text, false)?;
            if *time > i64::MAX as u64 {
                return Err(input());
            }
        }
        Mutation::Board {
            announcement,
            links,
        } => {
            model::body(announcement, true)?;
            model::links(links.clone())?;
        }
        Mutation::File {
            member_id,
            name,
            data,
            sha256,
            size,
        } => {
            if let Some(id) = member_id {
                model::uuid(id)?;
            }
            model::name(name)?;
            if name.contains(['/', '\\'])
                || [".", ".."].contains(&name.as_str())
                || *size > MAX_FILE
                || data.len() > MAX_FILE * 4 / 3 + 4
            {
                return Err(input());
            }
            let bytes = STANDARD.decode(data).map_err(|_| input())?;
            if bytes.len() != *size || format!("{:x}", Sha256::digest(&bytes)) != *sha256 {
                return Err(input());
            }
        }
    }
    Ok(())
}
fn insert(store: &mut Store, event: &Event) -> Result<()> {
    validate(event)?;
    let payload = serde_json::to_string(event).map_err(Error::storage)?;
    let old: Option<String> = store
        .db
        .query_row(
            "SELECT payload FROM node_event WHERE id=?1",
            [&event.id],
            |r| r.get(0),
        )
        .optional()
        .map_err(Error::storage)?;
    if let Some(old) = old {
        return if old == payload {
            Ok(())
        } else {
            Err(Error::new("NODE_CONFLICT", "事件标识与已保存内容冲突"))
        };
    }
    let (count, size): (i64, i64) = store.db.query_row("SELECT COUNT(*),COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM node_event WHERE team=?1", [&event.team], |r| Ok((r.get(0)?, r.get(1)?))).map_err(Error::storage)?;
    if count >= MAX_EVENTS as i64 || size + payload.len() as i64 > MAX_LOG as i64 {
        return Err(Error::new("COLLAB_LIMIT", "本机实验节点同步日志达到上限"));
    }
    match &event.change {
        Mutation::Member { .. } | Mutation::Relation { .. } | Mutation::MemberBoard { .. } => {}
        Mutation::Team { name, owner } => {
            let old: Option<(String, String)> = store
                .db
                .query_row(
                    "SELECT name,owner FROM teams WHERE id=?1",
                    [&event.team],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(Error::storage)?;
            if let Some((saved_name, saved_owner)) = old {
                if saved_name != *name || saved_owner != *owner {
                    return Err(input());
                }
            } else {
                let count: i64 = store
                    .db
                    .query_row("SELECT COUNT(*) FROM teams", [], |r| r.get(0))
                    .map_err(Error::storage)?;
                if count >= 32 {
                    return Err(Error::new("COLLAB_LIMIT", "本地团队达到上限"));
                }
                store
                    .db
                    .execute(
                        "INSERT INTO teams(id,name,owner) VALUES (?1,?2,?3)",
                        params![event.team, name, owner],
                    )
                    .map_err(Error::storage)?;
            }
        }
        Mutation::Message {
            name,
            text,
            time,
            member_id,
        } => {
            // 消息事件使用业务消息 ID，重复同步不会生成第二条消息。
            store.db.execute("INSERT INTO messages(id,team_id,text,created_at,author,member_id) VALUES (?1,?2,?3,?4,?5,?6)", params![event.id, event.team, text.trim(), *time as i64, name, member_id]).map_err(Error::storage)?;
        }
        Mutation::Board { .. } | Mutation::File { .. } => {}
    }
    store
        .db
        .execute(
            "INSERT INTO node_event VALUES (?1,?2,?3,?4,?5)",
            params![event.id, event.origin, event.clock, event.team, payload],
        )
        .map_err(Error::storage)?;
    store
        .db
        .execute(
            "UPDATE node_meta SET clock=MAX(clock,?1) WHERE singleton=1",
            [event.clock],
        )
        .map_err(Error::storage)?;
    Ok(())
}
pub fn merge(store: &mut Store, team: &str, incoming: &[Event]) -> Result<()> {
    if incoming.len() > MAX_EVENTS || incoming.iter().any(|e| e.team != team) {
        return Err(input());
    }
    let mut sorted = incoming.to_vec();
    sorted.sort_by(|a, b| (a.clock, &a.origin, &a.id).cmp(&(b.clock, &b.origin, &b.id)));
    store.atomic(|store| {
        for event in &sorted {
            insert(store, event)?;
        }
        let saved = events(store, team)?;
        let mut updated = std::collections::HashSet::new();
        for event in saved.iter().rev() {
            if let Mutation::Member { member } = &event.change {
                if updated.insert(&member.id) {
                    crate::members::save(&store.db, team, member)?;
                }
            }
        }
        super::organization::project(store, team, &saved)?;
        if let Some(Event {
            change:
                Mutation::Board {
                    announcement,
                    links,
                },
            ..
        }) = saved
            .iter()
            .rev()
            .find(|e| matches!(e.change, Mutation::Board { .. }))
        {
            store
                .db
                .execute(
                    "UPDATE teams SET board=?1,links=?2 WHERE id=?3",
                    params![
                        announcement.trim(),
                        serde_json::to_string(links).map_err(Error::storage)?,
                        team
                    ],
                )
                .map_err(Error::storage)?;
        }
        Ok(())
    })
}
pub fn publish(
    store: &mut Store,
    node: &str,
    team: &str,
    id: String,
    change: Mutation,
) -> Result<()> {
    // 验证与日志、业务记录同事务；网络失败不回滚本地已确认内容。
    let existing = events(store, team)?.into_iter().find(|e| e.id == id);
    if let Some(old) = existing {
        if old.origin == node && old.change == change {
            return Ok(());
        }
        return Err(Error::new("NODE_CONFLICT", "记录标识已经用于其他内容"));
    }
    let clock: i64 = store
        .db
        .query_row("SELECT clock+1 FROM node_meta WHERE singleton=1", [], |r| {
            r.get(0)
        })
        .map_err(Error::storage)?;
    merge(
        store,
        team,
        &[Event {
            id,
            origin: node.into(),
            team: team.into(),
            clock,
            change,
        }],
    )
}
