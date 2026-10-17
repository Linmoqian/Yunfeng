//! 心跳只转发剩余租约；相同修订只能缩短截止时间，不能通过循环转发续命。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::*;

/// 节点间临时心跳。revision 来自宿主持久化逻辑时钟，remainingMs 不依赖跨机墙钟。
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Heartbeat {
    pub member_id: String,
    pub origin: String,
    pub revision: i64,
    pub status: Activity,
    pub remaining_ms: u64,
}

impl Registry {
    pub(crate) fn report_versioned(
        &mut self,
        team: &str,
        member: &str,
        origin: &str,
        revision: i64,
        status: Activity,
    ) {
        self.report(team, member, status);
        if let Some(lease) = self.0.get_mut(&(team.into(), member.into())) {
            lease.origin = origin.into();
            lease.revision = revision;
        }
    }
    pub(crate) fn export(&self, team: &str) -> Vec<Heartbeat> {
        let now = Instant::now();
        let mut result: Vec<_> = self
            .0
            .iter()
            .filter_map(|((t, member), lease)| {
                let remaining_ms = lease.deadline.saturating_duration_since(now).as_millis() as u64;
                (t == team && lease.revision > 0 && remaining_ms > 0).then(|| Heartbeat {
                    member_id: member.clone(),
                    origin: lease.origin.clone(),
                    revision: lease.revision,
                    status: lease.activity,
                    remaining_ms,
                })
            })
            .collect();
        result.sort_by(|a, b| a.member_id.cmp(&b.member_id));
        result
    }
    pub(crate) fn receive(
        &mut self,
        team: &str,
        local: &str,
        incoming: &[Heartbeat],
        elapsed: Duration,
    ) {
        let now = Instant::now();
        for heartbeat in incoming {
            // 宿主重启后也不从邻居收回本人旧状态，必须等待本人的新一次上报。
            if heartbeat.origin == local {
                continue;
            }
            let key = (team.into(), heartbeat.member_id.clone());
            let remaining = Duration::from_millis(heartbeat.remaining_ms).saturating_sub(elapsed);
            let deadline = now + remaining;
            if let Some(old) = self.0.get_mut(&key) {
                if heartbeat.revision < old.revision {
                    continue;
                }
                if heartbeat.revision == old.revision {
                    old.deadline = old.deadline.min(deadline);
                    old.expires_at = old
                        .expires_at
                        .min(timestamp().saturating_add(remaining.as_millis() as u64));
                    continue;
                }
            }
            let timestamp = timestamp();
            self.0.insert(
                key,
                Lease {
                    activity: heartbeat.status,
                    deadline,
                    timestamp,
                    expires_at: timestamp.saturating_add(remaining.as_millis() as u64),
                    origin: heartbeat.origin.clone(),
                    revision: heartbeat.revision,
                },
            );
        }
    }
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relay_never_renews_duplicates_or_resurrects_local_and_older_reports() {
        let mut source = Registry::default();
        source.report_versioned("team", "member", "a", 10, Activity::Working);
        let batch = source.export("team");
        let mut receiver = Registry::default();
        receiver.receive("team", "b", &batch, Duration::from_millis(20));
        assert_eq!(receiver.view("team", "member").status, "working");
        let key = ("team".into(), "member".into());
        let deadline = receiver.0[&key].deadline;
        receiver.receive("team", "b", &batch, Duration::ZERO);
        assert_eq!(receiver.0[&key].deadline, deadline);
        receiver.0.get_mut(&key).unwrap().deadline = Instant::now();
        receiver.receive("team", "b", &batch, Duration::ZERO);
        assert_eq!(receiver.view("team", "member").status, "offline");
        assert!(receiver.export("team").is_empty());
        source.report_versioned("team", "member", "a", 11, Activity::Idle);
        receiver.receive("team", "b", &source.export("team"), Duration::ZERO);
        receiver.receive("team", "b", &batch, Duration::ZERO);
        assert_eq!(receiver.view("team", "member").status, "idle");
        let mut restarted = Registry::default();
        restarted.receive("team", "a", &batch, Duration::ZERO);
        assert_eq!(restarted.view("team", "member").status, "unknown");
        restarted.receive("team", "b", &batch, Duration::from_secs(90));
        assert_eq!(restarted.view("team", "member").status, "offline");
    }
}
