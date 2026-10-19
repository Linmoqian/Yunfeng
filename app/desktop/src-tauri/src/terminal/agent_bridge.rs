//! 桌面私有 Agent 通道；复用 PTY 和组件状态，不对 Web 暴露命令接口。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use super::model::{error, Request, Result, MAX_SESSIONS};
use super::Runtime;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
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
    Research {
        request: yunfeng_research_kernel::execution::Request,
    },
    Component {
        request: crate::component_sharing::agent::Request,
    },
    Start {
        cwd: String,
        command: String,
    },
    Run {
        cwd: String,
        program: String,
        args: Vec<String>,
        #[serde(rename = "jobId")]
        job_id: String,
    },
    StopJob {
        #[serde(rename = "jobId")]
        job_id: String,
    },
    Read {
        id: String,
        cursor: u64,
    },
    Stop {
        id: String,
    },
    Release {
        id: String,
    },
}
struct Handler {
    runtime: Runtime,
    app: Option<tauri::AppHandle>,
    owned: HashSet<String>,
    released: VecDeque<String>,
    research_jobs: HashMap<String, (String, String, String, Vec<String>)>,
}
impl Handler {
    fn prepare_start(&mut self) -> Result<()> {
        self.owned.retain(|id| self.runtime.get(id).is_ok());
        self.released.retain(|id| self.owned.contains(id));
        self.research_jobs
            .retain(|_, (id, ..)| self.owned.contains(id));
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
            self.research_jobs
                .retain(|_, (existing, ..)| existing != &id);
        }
        Ok(())
    }
    fn dispatch(&mut self, action: Action) -> Result<Value> {
        if let Action::Research { request } = action {
            return yunfeng_research_kernel::execution::execute(request).map_err(|_| {
                error(
                    "RESEARCH_IO_FAILED",
                    "科研文件执行失败，请核对路径与实测产物",
                )
            });
        }
        if let Action::Component { request } = action {
            let app = self
                .app
                .as_ref()
                .ok_or_else(|| error("UNAVAILABLE", "组件接口未连接桌面"))?;
            return crate::component_sharing::agent::execute(app, request)
                .map_err(|e| error(e.code, e.message));
        }
        if let Action::StopJob { job_id } = action {
            if job_id.is_empty() || job_id.len() > 200 || job_id.contains('\0') {
                return Err(error("INVALID_INPUT", "科研作业身份无效"));
            }
            let prefix = format!("{job_id}:");
            let ids: Vec<String> = self
                .research_jobs
                .iter()
                .filter(|(key, _)| **key == job_id || key.starts_with(&prefix))
                .map(|(_, (id, ..))| id.clone())
                .collect();
            for id in ids {
                if self.runtime.get(&id).is_ok() {
                    self.runtime.action(Request::Stop { id: id.clone() })?;
                    if !self.released.contains(&id) {
                        self.released.push_back(id);
                    }
                }
            }
            return Ok(Value::Null);
        }
        if matches!(action, Action::Start { .. } | Action::Run { .. }) {
            if let Action::Run {
                cwd,
                program,
                args,
                job_id,
            } = &action
            {
                if job_id.is_empty() || job_id.len() > 200 || job_id.contains('\0') {
                    return Err(error("INVALID_INPUT", "科研作业身份无效"));
                }
                if let Some((id, root, executable, arguments)) = self.research_jobs.get(job_id) {
                    if cwd != root || program != executable || args != arguments {
                        return Err(error("CONFLICT", "科研作业身份已绑定其他命令"));
                    }
                    return Ok(json!({"id":id}));
                }
            }
            self.prepare_start()?;
            let started = match action {
                Action::Start { cwd, command } => self.runtime.start_command(&cwd, &command)?,
                Action::Run {
                    cwd,
                    program,
                    args,
                    job_id,
                } => {
                    let started = self.runtime.start_program(&cwd, &program, &args)?;
                    if let Some(id) = started["id"].as_str() {
                        self.research_jobs
                            .insert(job_id, (id.to_owned(), cwd, program, args));
                    }
                    started
                }
                _ => return Err(error("INVALID_INPUT", "启动操作不可用")),
            };
            if let Some(id) = started["id"].as_str() {
                self.owned.insert(id.into());
            }
            return Ok(started);
        }
        let id = match &action {
            Action::Read { id, .. } | Action::Stop { id } | Action::Release { id } => id,
            Action::Start { .. } | Action::Run { .. } => {
                return Err(error("INVALID_INPUT", "操作不可用"))
            }
            Action::StopJob { .. } => return Err(error("INVALID_INPUT", "操作不可用")),
            Action::Component { .. } => return Err(error("INVALID_INPUT", "操作不可用")),
            Action::Research { .. } => return Err(error("INVALID_INPUT", "操作不可用")),
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
        BufReader::new((&mut *stream).take(8 * 1024 * 1024)).read_line(&mut line)?;
        let response = match serde_json::from_str::<Envelope>(&line) {
            Ok(envelope) if envelope.token == token => match self.dispatch(envelope.request) {
                Ok(value) => json!({ "result": value }),
                Err(error) => json!({ "error": error }),
            },
            _ => json!({ "error": { "code": "FORBIDDEN", "message": "终端通道认证失败" } }),
        };
        // 合并 JSON 的细碎写入；固定缓冲避免再复制一份完整的大响应。
        let mut output = BufWriter::new(stream);
        serde_json::to_writer(&mut output, &response)?;
        output.write_all(b"\n")?;
        output.flush()
    }
}

pub struct AgentBridge {
    address: SocketAddr,
    token: String,
    stopping: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl AgentBridge {
    pub fn start(runtime: Runtime, app: Option<tauri::AppHandle>) -> std::io::Result<Self> {
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
                    app,
                    owned: HashSet::new(),
                    released: VecDeque::new(),
                    research_jobs: HashMap::new(),
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
        command.env("YUNFENG_RESEARCH_NATIVE", "3");
        command.env("YUNFENG_APP_PORT", self.address.port().to_string());
        command.env("YUNFENG_APP_TOKEN", &self.token);
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

#[cfg(all(test, unix))]
#[path = "research_bridge_tests.rs"]
mod research_tests;
