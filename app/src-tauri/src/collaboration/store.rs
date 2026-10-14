//! SQLite 本地团队：事务、幂等消息和有界快照。
//! Created on 2026-10-13
//! @author: https://github.com/Linmoqian
use super::model::{self, Action, Error, Link, Message, Result, Snapshot, Team};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub struct Store {
    pub(super) db: Connection,
}
const SCHEMA: &str = "
CREATE TABLE installations (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, active_team TEXT);
CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, board TEXT NOT NULL DEFAULT '', links TEXT NOT NULL DEFAULT '[]');
CREATE TABLE messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, team_id TEXT NOT NULL REFERENCES teams(id), text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX messages_team_sequence ON messages(team_id, sequence);
PRAGMA user_version=1;";

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let parent = path
            .parent()
            .ok_or_else(|| Error::new("COLLAB_STORAGE", "协作目录不可用"))?;
        std::fs::create_dir_all(parent).map_err(Error::storage)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
                .map_err(Error::storage)?;
        }
        Self::initialize(Connection::open(path).map_err(Error::storage)?)
    }
    pub(super) fn initialize(mut db: Connection) -> Result<Self> {
        db.busy_timeout(Duration::from_secs(2))
            .map_err(Error::storage)?;
        let version: u32 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(Error::storage)?;
        if version > 1 {
            return Err(Error::new(
                "COLLAB_SCHEMA",
                "协作数据库版本较新，请更新应用",
            ));
        }
        db.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )
        .map_err(Error::storage)?;
        if version == 0 {
            let tx = db.transaction().map_err(Error::storage)?;
            tx.execute_batch(SCHEMA).map_err(Error::storage)?;
            tx.execute(
                "INSERT INTO installations(singleton,id) VALUES (1,?1)",
                [uuid::Uuid::new_v4().to_string()],
            )
            .map_err(Error::storage)?;
            tx.commit().map_err(Error::storage)?;
        }
        Ok(Self { db })
    }
    fn active(&self) -> Result<String> {
        self.db
            .query_row(
                "SELECT active_team FROM installations WHERE singleton=1",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .map_err(Error::storage)?
            .ok_or_else(|| Error::new("COLLAB_NO_TEAM", "请先创建或恢复本地团队"))
    }
    pub fn action(&mut self, action: Action) -> Result<Snapshot> {
        match action {
            Action::Snapshot {} => {}
            Action::Create { name, owner } => {
                self.create(&model::name(&name)?, &model::name(&owner)?)?
            }
            Action::Message { id, text } => {
                self.message(&model::uuid(&id)?, &model::body(&text, false)?)?
            }
            Action::Board {
                announcement,
                links,
            } => {
                let body = model::body(&announcement, true)?;
                let links = serde_json::to_string(&model::links(links)?).map_err(Error::storage)?;
                self.db
                    .execute(
                        "UPDATE teams SET board=?1,links=?2 WHERE id=?3",
                        params![body, links, self.active()?],
                    )
                    .map_err(Error::storage)?;
            }
            Action::Activate { id } => {
                let id = model::uuid(&id)?;
                if !self
                    .db
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM teams WHERE id=?1)",
                        [&id],
                        |row| row.get::<_, bool>(0),
                    )
                    .map_err(Error::storage)?
                {
                    return Err(Error::new("COLLAB_NOT_FOUND", "本地团队不存在"));
                }
                self.db
                    .execute(
                        "UPDATE installations SET active_team=?1 WHERE singleton=1",
                        [id],
                    )
                    .map_err(Error::storage)?;
            }
            Action::Leave {} => {
                self.db
                    .execute(
                        "UPDATE installations SET active_team=NULL WHERE singleton=1",
                        [],
                    )
                    .map_err(Error::storage)?;
            }
        }
        self.snapshot()
    }
    fn create(&mut self, name: &str, owner: &str) -> Result<()> {
        let tx = self.db.transaction().map_err(Error::storage)?;
        let active: Option<String> = tx
            .query_row(
                "SELECT active_team FROM installations WHERE singleton=1",
                [],
                |row| row.get(0),
            )
            .map_err(Error::storage)?;
        if let Some(id) = active {
            let same: bool = tx
                .query_row(
                    "SELECT name=?1 AND owner=?2 FROM teams WHERE id=?3",
                    params![name, owner, id],
                    |row| row.get(0),
                )
                .map_err(Error::storage)?;
            return if same {
                Ok(())
            } else {
                Err(Error::new(
                    "COLLAB_ACTIVE_TEAM",
                    "请先关闭当前团队，再创建新团队",
                ))
            };
        }
        let count: u32 = tx
            .query_row("SELECT COUNT(*) FROM teams", [], |row| row.get(0))
            .map_err(Error::storage)?;
        if count >= 32 {
            return Err(Error::new("COLLAB_LIMIT", "本地团队已达到 32 个上限"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO teams(id,name,owner) VALUES (?1,?2,?3)",
            params![id, name, owner],
        )
        .map_err(Error::storage)?;
        tx.execute(
            "UPDATE installations SET active_team=?1 WHERE singleton=1",
            [&id],
        )
        .map_err(Error::storage)?;
        tx.commit().map_err(Error::storage)
    }
    fn message(&mut self, id: &str, text: &str) -> Result<()> {
        let team = self.active()?;
        let tx = self.db.transaction().map_err(Error::storage)?;
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT team_id,text FROM messages WHERE id=?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(Error::storage)?;
        if let Some((old_team, old_text)) = existing {
            return if old_team == team && old_text == text {
                Ok(())
            } else {
                Err(Error::new(
                    "COLLAB_MESSAGE_CONFLICT",
                    "消息标识已用于其他内容",
                ))
            };
        }
        let count: u32 = tx
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE team_id=?1",
                [&team],
                |row| row.get(0),
            )
            .map_err(Error::storage)?;
        if count >= 10_000 {
            return Err(Error::new(
                "COLLAB_LIMIT",
                "本地团队已达到 10000 条消息上限",
            ));
        }
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(Error::storage)?
            .as_millis();
        let time = i64::try_from(time).map_err(Error::storage)?;
        tx.execute(
            "INSERT INTO messages(id,team_id,text,created_at) VALUES (?1,?2,?3,?4)",
            params![id, team, text, time],
        )
        .map_err(Error::storage)?;
        tx.commit().map_err(Error::storage)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let (installation_id, active): (String, Option<String>) = self
            .db
            .query_row(
                "SELECT id,active_team FROM installations WHERE singleton=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(Error::storage)?;
        let mut statement = self
            .db
            .prepare("SELECT id,name,owner FROM teams ORDER BY rowid DESC LIMIT 32")
            .map_err(Error::storage)?;
        let saved_teams = statement
            .query_map([], |row| {
                let owner: String = row.get(2)?;
                Ok(Team {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    members: vec![owner.clone()],
                    owner,
                })
            })
            .map_err(Error::storage)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Error::storage)?;
        let team = saved_teams
            .iter()
            .find(|team| Some(&team.id) == active.as_ref())
            .cloned();
        let (mut board, mut links, mut messages) = (String::new(), Vec::<Link>::new(), Vec::new());
        if let Some(team) = &team {
            let row: (String, String) = self
                .db
                .query_row(
                    "SELECT board,links FROM teams WHERE id=?1",
                    [&team.id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(Error::storage)?;
            board = row.0;
            links = serde_json::from_str(&row.1).map_err(Error::storage)?;
            let mut statement = self.db.prepare("SELECT id,text,created_at FROM (SELECT sequence,id,text,created_at FROM messages WHERE team_id=?1 ORDER BY sequence DESC LIMIT 200) ORDER BY sequence ASC").map_err(Error::storage)?;
            messages = statement
                .query_map([&team.id], |row| {
                    Ok(Message {
                        id: row.get(0)?,
                        name: team.owner.clone(),
                        text: row.get(1)?,
                        created_at: u64::try_from(row.get::<_, i64>(2)?).map_err(|value| {
                            rusqlite::Error::FromSqlConversionFailure(
                                2,
                                rusqlite::types::Type::Integer,
                                Box::new(value),
                            )
                        })?,
                    })
                })
                .map_err(Error::storage)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(Error::storage)?;
        }
        Ok(Snapshot {
            installation_id,
            mode: if team.is_some() { "local" } else { "empty" },
            team,
            saved_teams,
            messages,
            board,
            links,
            network_available: false,
        })
    }
}
