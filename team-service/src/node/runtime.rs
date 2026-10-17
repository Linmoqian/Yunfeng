//! 自动对等同步：单个有界 I/O 工作线程，数据库始终归入口线程所有。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::{http, log, peers, presence, types::*, Node};
use crate::model::{Error, Result};
use std::{
    collections::HashMap,
    net::TcpListener,
    sync::mpsc::{self, Receiver, SyncSender},
    thread,
    time::{Duration, Instant},
};

struct Job {
    peer: Peer,
    body: Exchange,
    started: Instant,
}
struct Completion {
    id: String,
    team: String,
    started: Instant,
    reply: Result<Exchange>,
}
struct Retry {
    due: Instant,
    failures: u32,
}
impl Retry {
    fn complete(&mut self, now: Instant, ok: bool) {
        self.failures = if ok { 0 } else { (self.failures + 1).min(4) };
        self.due = now + Duration::from_secs(if ok { 2 } else { 1 << self.failures });
    }
}

fn exchange(job: Job) -> Completion {
    let reply = http::post(
        &job.peer.node.address,
        "/v1/exchange",
        &job.peer.outgoing,
        &job.body,
    )
    .and_then(|value| serde_json::from_value::<Exchange>(value).map_err(|_| input()))
    .and_then(|reply| {
        if reply.from != job.peer.node.id || reply.team != job.body.team {
            Err(denied())
        } else {
            Ok(reply)
        }
    });
    Completion {
        id: job.peer.node.id,
        team: job.body.team,
        started: job.started,
        reply,
    }
}
fn worker(jobs: Receiver<Job>, replies: SyncSender<Completion>) {
    while let Ok(job) = jobs.recv() {
        if replies.send(exchange(job)).is_err() {
            break;
        }
    }
}

/// 不共享存储或锁；最多一个在途交换，退出时关闭队列并回收工作线程。
/// 网络请求预算为5秒；周期失败只更新诊断计数，不清空任何已有业务事实。
pub(super) fn run(node: &mut Node, listener: TcpListener) -> Result<()> {
    listener.set_nonblocking(true).map_err(network)?;
    let (jobs, receiver) = mpsc::sync_channel(1);
    let (sender, replies) = mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("team-sync".into())
        .spawn(move || worker(receiver, sender))
        .map_err(Error::storage)?;
    let result = drive(node, listener, &jobs, replies);
    drop(jobs);
    worker.join().map_err(|_| network("sync worker stopped"))?;
    result
}
fn drive(
    node: &mut Node,
    listener: TcpListener,
    jobs: &SyncSender<Job>,
    replies: Receiver<Completion>,
) -> Result<()> {
    let mut retries: HashMap<String, Retry> = HashMap::new();
    let mut busy = false;
    let mut scan = Instant::now();
    while !node.stopped {
        match replies.try_recv() {
            Ok(done) => {
                busy = false;
                let result = done.reply.and_then(|reply| {
                    if node.team()? != done.team {
                        return Err(denied());
                    }
                    presence::merge(
                        &mut node.store,
                        &node.identity.id,
                        &reply,
                        done.started.elapsed(),
                    )
                });
                if let Some(retry) = retries.get_mut(&done.id) {
                    retry.complete(Instant::now(), result.is_ok());
                }
            }
            Err(mpsc::TryRecvError::Disconnected) => return Err(network("sync worker stopped")),
            Err(mpsc::TryRecvError::Empty) => {}
        }
        if !busy && Instant::now() >= scan {
            schedule(node, jobs, &mut retries, &mut busy)?;
            scan = Instant::now() + Duration::from_millis(250);
        }
        match listener.accept() {
            Ok((mut stream, remote)) if remote.ip().is_loopback() => {
                let result = http::read(&mut stream)
                    .and_then(|(route, token, value)| node.handle(&route, &token, value));
                let _ = http::respond(&mut stream, result);
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50))
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(network(e)),
        }
    }
    Ok(())
}
fn schedule(
    node: &mut Node,
    jobs: &SyncSender<Job>,
    retries: &mut HashMap<String, Retry>,
    busy: &mut bool,
) -> Result<()> {
    let team = match node.team() {
        Ok(team) => team,
        Err(e) if e.code == "COLLAB_NO_TEAM" => return Ok(()),
        Err(e) => return Err(e),
    };
    let peers = peers::list(&node.store, &team)?;
    retries.retain(|id, _| peers.iter().any(|p| &p.node.id == id));
    for peer in &peers {
        retries.entry(peer.node.id.clone()).or_insert(Retry {
            due: Instant::now(),
            failures: 0,
        });
    }
    node.sync_failures = retries.values().filter(|r| r.failures > 0).count();
    if *busy {
        return Ok(());
    }
    let next = peers
        .into_iter()
        .filter(|p| retries[&p.node.id].due <= Instant::now())
        .min_by_key(|p| retries[&p.node.id].due);
    if let Some(peer) = next {
        let body = Exchange {
            from: node.identity.id.clone(),
            events: log::events(&node.store, &team)?,
            presence: node.store.presence.export(&team),
            team,
        };
        jobs.send(Job {
            peer,
            body,
            started: Instant::now(),
        })
        .map_err(network)?;
        *busy = true;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slow_peer_does_not_block_local_requests_and_shutdown_reclaims_worker() {
        use std::{io::Read, net::TcpStream};
        let directory = tempfile::tempdir().unwrap();
        let listener = http::listener("127.0.0.1:0".parse().unwrap()).unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let mut node =
            Node::open(&directory.path().join("store.sqlite3"), "test", &address).unwrap();
        node.command(Command::Create {
            name: "test".into(),
        })
        .unwrap();
        let blackhole = http::listener("127.0.0.1:0".parse().unwrap()).unwrap();
        let peer = Peer {
            node: Identity {
                id: uuid::Uuid::new_v4().to_string(),
                name: "slow".into(),
                address: format!("http://{}", blackhole.local_addr().unwrap()),
            },
            incoming: token(),
            outgoing: token(),
        };
        let team = node.team().unwrap();
        peers::remember(&mut node.store, &team, &peer).unwrap();
        let token = node.control.clone();
        let (reached, wait) = mpsc::sync_channel(1);
        let (release, held) = mpsc::sync_channel(1);
        let sink = thread::spawn(move || {
            let (mut stream, _) = blackhole.accept().unwrap();
            let mut byte = [0];
            stream.read_exact(&mut byte).unwrap();
            reached.send(()).unwrap();
            let _ = held.recv();
        });
        let server = thread::spawn(move || run(&mut node, listener));
        wait.recv_timeout(Duration::from_secs(3)).unwrap();
        let before = Instant::now();
        let snapshot = super::super::client::request(
            &address,
            &token,
            &serde_json::json!({"action":"snapshot"}),
        )
        .unwrap();
        assert_eq!(snapshot["peers"].as_array().unwrap().len(), 1);
        assert!(before.elapsed() < Duration::from_secs(1));
        super::super::client::request(&address, &token, &serde_json::json!({"action":"shutdown"}))
            .unwrap();
        server.join().unwrap().unwrap();
        assert!(before.elapsed() < Duration::from_secs(6));
        release.send(()).unwrap();
        sink.join().unwrap();
        // 在途请求超时后监听与存储一并释放，不能遗留后台服务。
        let socket = TcpStream::connect(address.trim_start_matches("http://"));
        assert!(socket.is_err());
    }
    #[test]
    fn bounded_backoff_resets_on_recovery() {
        let now = Instant::now();
        let mut retry = Retry {
            due: now,
            failures: 0,
        };
        for seconds in [2, 4, 8, 16, 16] {
            retry.complete(now, false);
            assert_eq!(retry.due.duration_since(now).as_secs(), seconds);
        }
        retry.complete(now, true);
        assert_eq!(retry.failures, 0);
        assert_eq!(retry.due.duration_since(now).as_secs(), 2);
    }
}
