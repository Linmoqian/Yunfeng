//! 管理员维护的单父组织关系；成员只通过下行投影查询直属下级。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use crate::{
    members,
    model::{self, Error, Result},
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Relation {
    pub member_id: String,
    pub parent_id: Option<String>,
}

pub(crate) fn initialize(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE member_relations(team TEXT NOT NULL,member TEXT NOT NULL,parent TEXT,PRIMARY KEY(team,member),FOREIGN KEY(team,member) REFERENCES team_members(team,id),FOREIGN KEY(team,parent) REFERENCES team_members(team,id)); PRAGMA user_version=4;").map_err(Error::storage)
}
pub(crate) fn list(db: &Connection, team: &str) -> Result<Vec<Relation>> {
    let mut q = db
        .prepare("SELECT member,parent FROM member_relations WHERE team=?1 ORDER BY member")
        .map_err(Error::storage)?;
    let rows = q
        .query_map([team], |r| {
            Ok(Relation {
                member_id: r.get(0)?,
                parent_id: r.get(1)?,
            })
        })
        .map_err(Error::storage)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Error::storage)
}
pub(crate) fn validate(db: &Connection, team: &str, relation: &Relation) -> Result<()> {
    model::uuid(&relation.member_id)?;
    if members::find(db, team, &relation.member_id)?.is_none() {
        return Err(members::input());
    }
    if let Some(parent) = &relation.parent_id {
        model::uuid(parent)?;
        if parent == &relation.member_id || members::find(db, team, parent)?.is_none() {
            return Err(members::input());
        }
    }
    Ok(())
}
pub(crate) fn cycle(db: &Connection, team: &str, relation: &Relation) -> Result<bool> {
    let saved = list(db, team)?;
    let mut next = relation.parent_id.as_deref();
    for _ in 0..=128 {
        let Some(id) = next else { return Ok(false) };
        if id == relation.member_id {
            return Ok(true);
        }
        next = saved
            .iter()
            .find(|r| r.member_id == id)
            .and_then(|r| r.parent_id.as_deref());
    }
    Ok(true)
}
pub(crate) fn save(db: &Connection, team: &str, relation: &Relation) -> Result<()> {
    validate(db, team, relation)?;
    if cycle(db, team, relation)? {
        return Err(Error::new("COLLAB_INPUT", "直属关系不能形成循环"));
    }
    db.execute("INSERT INTO member_relations(team,member,parent) VALUES (?1,?2,?3) ON CONFLICT(team,member) DO UPDATE SET parent=excluded.parent", params![team,relation.member_id,relation.parent_id]).map_err(Error::storage)?;
    Ok(())
}
