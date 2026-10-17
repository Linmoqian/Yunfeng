//! 成员自报的短期状态租约；不持久化、不从资料或节点可达性推断在线。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    Online,
    Working,
    Idle,
    Offline,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub member_id: String,
    pub status: &'static str,
    pub observed_at: Option<u64>,
    pub expires_at: Option<u64>,
}
#[cfg(feature = "node")]
mod exchange;
#[cfg(feature = "node")]
pub use exchange::Heartbeat;
const TTL: Duration = Duration::from_secs(90);
struct Lease {
    activity: Activity,
    deadline: Instant,
    timestamp: u64,
    expires_at: u64,
    #[cfg(feature = "node")]
    revision: i64,
    #[cfg(feature = "node")]
    origin: String,
}
#[derive(Default)]
pub(crate) struct Registry(HashMap<(String, String), Lease>);
impl Registry {
    pub(crate) fn report(&mut self, team: &str, member: &str, activity: Activity) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|v| v.as_millis() as u64)
            .unwrap_or_default();
        self.0.insert(
            (team.into(), member.into()),
            Lease {
                activity,
                deadline: Instant::now() + TTL,
                expires_at: timestamp.saturating_add(TTL.as_millis() as u64),
                timestamp,
                #[cfg(feature = "node")]
                revision: 0,
                #[cfg(feature = "node")]
                origin: String::new(),
            },
        );
    }
    pub(crate) fn view(&self, team: &str, member: &str) -> Presence {
        self.at(team, member, Instant::now())
    }
    fn at(&self, team: &str, member: &str, now: Instant) -> Presence {
        let lease = self.0.get(&(team.into(), member.into()));
        let status = match lease {
            None => "unknown",
            Some(l) if now >= l.deadline => "offline",
            Some(l) => match l.activity {
                Activity::Online => "online",
                Activity::Working => "working",
                Activity::Idle => "idle",
                Activity::Offline => "offline",
            },
        };
        Presence {
            member_id: member.into(),
            status,
            observed_at: lease.map(|l| l.timestamp),
            expires_at: lease.map(|l| l.expires_at),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn leases_expire_and_never_survive_restart_or_cross_teams() {
        let mut registry = Registry::default();
        assert_eq!(registry.view("a", "member").status, "unknown");
        registry.report("a", "member", Activity::Working);
        assert_eq!(registry.view("a", "member").status, "working");
        assert_eq!(registry.view("b", "member").status, "unknown");
        assert_eq!(
            registry
                .at("a", "member", Instant::now() + Duration::from_secs(91))
                .status,
            "offline"
        );
        registry.report("a", "member", Activity::Idle);
        assert_eq!(registry.view("a", "member").status, "idle");
        assert_eq!(Registry::default().view("a", "member").status, "unknown");
    }
}
