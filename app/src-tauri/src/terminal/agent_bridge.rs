//! 桌面私有 Agent 通道；复用同一 PTY 注册表，不对 Web 暴露命令接口。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::model::{error, Request, Result, MAX_SESSIONS};
use super::Runtime;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashSet, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::JoinHandle;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    token: String,
    request: Action,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Start { cwd: String, command: String },
    Read { id: String, cursor: u64 },
    Stop { id: String },
    Release { id: String },
}
struct Handler {
    runtime: Runtime,
    owned: HashSet<String>,
    released: VecDeque<String>,
}
impl Handler {
    fn dispatch(&mut self, action: Action) -> Result<Value> {
        if let Action::Start { cwd, command } = action {
            self.owned.retain(|id| self.runtime.get(id).is_ok());
            self.released.retain(|id| self.owned.contains(id));
            // 只回收 Agent 已消费完的终端；保留人工终端及仍在读取的任务。
            while self
                .runtime
                .action(Request::List)?
                .as_array()
                .is_some_and(|ids| ids.len() >= MAX_SESSIONS)
            {
                let Some(id) = self.released.pop_front() else {
                    break;
                };
                self.runtime.action(Request::Close { id: id.clone() })?;
                self.owned.remove(&id);
            }
            let started = self.runtime.start_command(&cwd, &command)?;
            if let Some(id) = started["id"].as_str() {
                self.owned.insert(id.into());
            }
            return Ok(started);
        }
        let id = match &action {
            Action::Read { id, .. } | Action::Stop { id } | Action::Release { id } => id,
            Action::Start { .. } => return Err(error("INVALID_INPUT", "操作不可用")),
        };
        if !self.owned.contains(id) {
            return Err(error("FORBIDDEN", "该终端不属于 Agent"));
        }
        match action {
            Action::Read { id, cursor } => self.runtime.action(Request::Read { id, cursor }),
            Action::Stop { id } => self.runtime.action(Request::Stop { id }),
            Action::Release { id } => {
                let chunk = self.runtime.get(&id)?.read(0)?;
                if chunk.exit_code.is_none() {
                    return Err(error("BUSY", "终端仍在运行"));
                }
                if !self.released.contains(&id) {
                    self.released.push_back(id);
                }
                Ok(Value::Null)
            }
            _ => Err(error("INVALID_INPUT", "操作不可用")),
        }
    }
    fn connection(&mut self, stream: &mut TcpStream, token: &str) -> std::io::Result<()> {
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        stream.set_write_timeout(Some(Duration::from_secs(2)))?;
        let mut line = String::new();
        BufReader::new((&mut *stream).take(128 * 1024)).read_line(&mut line)?;
        let response = match serde_json::from_str::<Envelope>(&line) {
            Ok(envelope) if envelope.token == token => match self.dispatch(envelope.request) {
                Ok(value) => json!({ "result": value }),
                Err(error) => json!({ "error": error }),
            },
            _ => json!({ "error": { "code": "FORBIDDEN", "message": "终端通道认证失败" } }),
        };
        serde_json::to_writer(&mut *stream, &response)?;
        stream.write_all(b"\n")
    }
}

pub struct AgentBridge {
    address: SocketAddr,
    token: String,
    stopping: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl AgentBridge {
    pub fn start(runtime: Runtime) -> std::io::Result<Self> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
        let address = listener.local_addr()?;
        let token = uuid::Uuid::new_v4().to_string();
        let secret = token.clone();
        let stopping = Arc::new(AtomicBool::new(false));
        let stop = stopping.clone();
        let thread = std::thread::Builder::new()
            .name("yunfeng-agent-terminal".into())
            .spawn(move || {
                let mut handler = Handler {
                    runtime,
                    owned: HashSet::new(),
                    released: VecDeque::new(),
                };
                for connection in listener.incoming() {
                    if stop.load(Ordering::Acquire) {
                        break;
                    }
                    if let Ok(mut stream) = connection {
                        let _ = handler.connection(&mut stream, &secret);
                    }
                }
            })?;
        Ok(Self {
            address,
            token,
            stopping,
            thread: Some(thread),
        })
    }
    pub fn configure(&self, command: &mut std::process::Command) {
        command.env("YUNFENG_TERMINAL_PORT", self.address.port().to_string());
        command.env("YUNFENG_TERMINAL_TOKEN", &self.token);
    }
}
impl Drop for AgentBridge {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::Release);
        let _ = TcpStream::connect_timeout(&self.address, Duration::from_secs(1));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(all(test, unix))]
#[path = "agent_bridge_tests.rs"]
mod tests;
