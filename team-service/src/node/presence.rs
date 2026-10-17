//! 同步心跳的团队与宿主校验；复用逻辑时钟，不将高频状态写入事件日志。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{log, types::*};
use crate::{
    members,
    model::{Error, Result},
    presence::Activity,
    Store,
};
use std::{collections::HashSet, time::Duration};

pub(super) fn report(
    store: &mut Store,
    team: &str,
    member: &members::Member,
    status: Activity,
) -> Result<()> {
    let updated = store
        .db
        .execute(
            "UPDATE node_meta SET clock=clock+1 WHERE clock<?1",
            [i64::MAX - 10000],
        )
        .map_err(Error::storage)?;
    if updated != 1 {
        return Err(Error::new("COLLAB_LIMIT", "节点逻辑时钟达到上限"));
    }
    let revision = store
        .db
        .query_row("SELECT clock FROM node_meta WHERE singleton=1", [], |r| {
            r.get(0)
        })
        .map_err(Error::storage)?;
    store
        .presence
        .report_versioned(team, &member.id, &member.node_id, revision, status);
    Ok(())
}
pub(super) fn merge(
    store: &mut Store,
    local: &str,
    exchange: &Exchange,
    elapsed: Duration,
) -> Result<()> {
    if exchange.presence.len() > 128 {
        return Err(input());
    }
    let mut seen = HashSet::new();
    for p in &exchange.presence {
        crate::model::uuid(&p.member_id)?;
        crate::model::uuid(&p.origin)?;
        if p.revision < 1
            || p.revision > i64::MAX - 10000
            || p.remaining_ms == 0
            || p.remaining_ms > 90_000
            || !seen.insert(&p.member_id)
        {
            return Err(input());
        }
    }
    store.atomic(|s| {
        log::merge(s, &exchange.team, &exchange.events)?;
        for p in &exchange.presence {
            let member = members::find(&s.db, &exchange.team, &p.member_id)?.ok_or_else(denied)?;
            if member.node_id != p.origin {
                return Err(denied());
            }
        }
        Ok(())
    })?;
    store
        .presence
        .receive(&exchange.team, local, &exchange.presence, elapsed);
    Ok(())
}
