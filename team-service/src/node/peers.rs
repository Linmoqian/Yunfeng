//! 显式邀请与双向配对；控制令牌不传给邻居，每条边只授权一个团队。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{log, types::*};
use crate::{model::Error, model::Result, Store};
use rusqlite::{params, OptionalExtension};
pub fn list(store: &Store, team: &str) -> Result<Vec<Peer>> {
    let mut q = store
        .db
        .prepare(
            "SELECT id,name,address,incoming,outgoing FROM node_peer WHERE team=?1 ORDER BY id",
        )
        .map_err(Error::storage)?;
    let rows = q
        .query_map([team], |r| {
            Ok(Peer {
                node: Identity {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    address: r.get(2)?,
                },
                incoming: r.get(3)?,
                outgoing: r.get(4)?,
            })
        })
        .map_err(Error::storage)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Error::storage);
    rows
}
pub fn remember(store: &mut Store, team: &str, peer: &Peer) -> Result<()> {
    identity(&peer.node)?;
    secret(&peer.incoming)?;
    secret(&peer.outgoing)?;
    let saved = list(store, team)?;
    if let Some(old) = saved.iter().find(|p| p.node.id == peer.node.id) {
        if old.node != peer.node || old.incoming != peer.incoming || old.outgoing != peer.outgoing {
            return Err(Error::new(
                "NODE_CONFLICT",
                "节点连接信息发生变化，请使用稳定端口与原数据目录",
            ));
        }
        return Ok(());
    }
    if saved.len() >= 8 {
        return Err(Error::new("COLLAB_LIMIT", "每队最多连接八个邻居节点"));
    }
    store
        .db
        .execute(
            "INSERT INTO node_peer VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                team,
                peer.node.id,
                peer.node.name,
                peer.node.address,
                peer.incoming,
                peer.outgoing
            ],
        )
        .map_err(Error::storage)?;
    Ok(())
}
pub fn invite(store: &mut Store, team: &str, address: &str) -> Result<Invitation> {
    let now = now()?;
    store
        .db
        .execute("DELETE FROM node_invite WHERE expires<?1", [now])
        .map_err(Error::storage)?;
    let count: i64 = store
        .db
        .query_row("SELECT COUNT(*) FROM node_invite", [], |r| r.get(0))
        .map_err(Error::storage)?;
    if count >= 32 {
        return Err(Error::new("COLLAB_LIMIT", "有效邀请数量达到上限"));
    }
    let ticket = token();
    store
        .db
        .execute(
            "INSERT INTO node_invite VALUES (?1,?2,?3,NULL)",
            params![ticket, team, now + 600_000],
        )
        .map_err(Error::storage)?;
    Ok(Invitation {
        address: address.into(),
        team: team.into(),
        ticket,
    })
}
pub fn accept(store: &mut Store, local: &Identity, token: &str, join: Join) -> Result<Welcome> {
    if token != join.ticket || local.id == join.node.id {
        return Err(denied());
    }
    secret(token)?;
    secret(&join.incoming_token)?;
    identity(&join.node)?;
    let saved: Option<(String, i64, Option<String>)> = store
        .db
        .query_row(
            "SELECT team,expires,peer FROM node_invite WHERE ticket=?1",
            [token],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(Error::storage)?;
    let (team, expires, used) = saved.ok_or_else(denied)?;
    if expires < now()? || used.as_ref().is_some_and(|id| *id != join.node.id) {
        return Err(denied());
    }
    let old = list(store, &team)?
        .into_iter()
        .find(|p| p.node.id == join.node.id);
    let incoming = old
        .as_ref()
        .map(|p| p.incoming.clone())
        .unwrap_or_else(super::types::token);
    store.atomic(|s| {
        remember(
            s,
            &team,
            &Peer {
                node: join.node.clone(),
                incoming: incoming.clone(),
                outgoing: join.incoming_token.clone(),
            },
        )?;
        s.db.execute(
            "UPDATE node_invite SET peer=?1 WHERE ticket=?2",
            params![join.node.id, token],
        )
        .map_err(Error::storage)?;
        Ok(())
    })?;
    Ok(Welcome {
        node: local.clone(),
        team: team.clone(),
        incoming_token: incoming,
        events: log::events(store, &team)?,
    })
}
pub fn exchange(
    store: &mut Store,
    local: &Identity,
    token: &str,
    exchange: Exchange,
) -> Result<Exchange> {
    let peer = list(store, &exchange.team)?
        .into_iter()
        .find(|p| p.node.id == exchange.from)
        .ok_or_else(denied)?;
    if peer.incoming != token {
        return Err(denied());
    }
    log::merge(store, &exchange.team, &exchange.events)?;
    Ok(Exchange {
        from: local.id.clone(),
        team: exchange.team.clone(),
        events: log::events(store, &exchange.team)?,
    })
}
