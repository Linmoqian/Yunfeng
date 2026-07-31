// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

/// 运行中的 sidecar 句柄。
pub struct SidecarState {
    inner: Mutex<Option<SidecarHandle>>,
}

struct SidecarHandle {
    child: Child,
    pub port: u16,
    pub token: String,
}

impl Drop for SidecarHandle {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(serde::Serialize)]
pub struct SidecarInfo {
    pub port: u16,
    pub token: String,
    pub base_url: String,
}

#[derive(Debug)]
struct SidecarError(String);

impl std::fmt::Display for SidecarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for SidecarError {}

/// 解析 sidecar 可执行入口（dev 模式用 bun，release 模式用编译产物）。
fn resolve_sidecar_command(token: &str) -> Result<Command, Box<dyn std::error::Error>> {
    // release 模式：优先使用打包好的 pi-sidecar 可执行文件。
    #[cfg(not(debug_assertions))]
    {
        if let Ok(exe) = std::env::current_exe() {
            let dir = exe
                .parent()
                .ok_or_else(|| SidecarError("cannot resolve exe dir".into()))?;
            let candidate = dir.join(if cfg!(windows) {
                "pi-sidecar.exe"
            } else {
                "pi-sidecar"
            });
            if candidate.exists() {
                let mut cmd = Command::new(candidate);
                cmd.arg("--port").arg("0").arg("--token").arg(token);
                return Ok(cmd);
            }
        }
    }

    // dev 模式（或 release 回退）：用 bun 运行 sidecar 源码。
    let sidecar_dir = {
        // 相对 src-tauri 的 sidecar 目录：../sidecar
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        std::path::PathBuf::from(manifest_dir)
            .parent()
            .ok_or_else(|| SidecarError("cannot resolve parent dir".into()))?
            .join("sidecar")
    };
    if !sidecar_dir.join("src/index.ts").exists() {
        return Err(Box::new(SidecarError(format!(
            "sidecar source not found at {}",
            sidecar_dir.display()
        ))));
    }

    let bun_path = std::env::var("BUN_PATH").unwrap_or_else(|_| "bun".to_string());
    let mut cmd = Command::new(bun_path);
    cmd.arg("run")
        .arg("src/index.ts")
        .arg("--port")
        .arg("0")
        .arg("--token")
        .arg(token);
    cmd.current_dir(&sidecar_dir);
    Ok(cmd)
}

/// 启动 sidecar 子进程，等待其输出 PI_SIDECAR_READY 行。
#[tauri::command]
fn start_sidecar(state: State<'_, SidecarState>) -> Result<SidecarInfo, String> {
    // 若已有运行中的句柄，直接复用。
    {
        let guard = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = guard.as_ref() {
            return Ok(SidecarInfo {
                port: handle.port,
                token: handle.token.clone(),
                base_url: format!("http://127.0.0.1:{}", handle.port),
            });
        }
    }

    let token = uuid::Uuid::new_v4().simple().to_string();
    let mut cmd = resolve_sidecar_command(&token).map_err(|e| e.to_string())?;
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::inherit());

    let mut child = cmd.spawn().map_err(|e| format!("failed to spawn sidecar: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar stdout unavailable".to_string())?;

    let reader = BufReader::new(stdout);
    let mut line = String::new();

    // 在有限行数内寻找 READY 标记。
    use std::time::{Duration, Instant};
    let deadline = Instant::now() + Duration::from_secs(20);
    // 以非阻塞方式轮询：read_line 会阻塞，改用线程 + 超时。
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = reader;
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let _ = tx.send(Err("sidecar stdout closed".to_string()));
                    return;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if let Some(rest) = trimmed.strip_prefix("PI_SIDECAR_READY ") {
                        let mut parts = rest.split_whitespace();
                        if let (Some(p), Some(t)) = (parts.next(), parts.next()) {
                            let _ = tx.send(Ok((p.to_string(), t.to_string())));
                            return;
                        }
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e.to_string()));
                    return;
                }
            }
            if std::time::Instant::now() > deadline {
                let _ = tx.send(Err("ready timeout".to_string()));
                return;
            }
        }
    });

    let (port_str, ready_token) = rx
        .recv_timeout(Duration::from_secs(20))
        .map_err(|e| e.to_string())?
        .map_err(|e| e)?;
    let port: u16 = port_str
        .parse()
        .map_err(|e: std::num::ParseIntError| format!("invalid port: {e}"))?;

    let info = SidecarInfo {
        port,
        token: ready_token,
        base_url: format!("http://127.0.0.1:{port}"),
    };

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(SidecarHandle {
        child,
        port,
        token: info.token.clone(),
    });

    Ok(info)
}

/// 停止 sidecar 子进程。
#[tauri::command]
fn stop_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut handle) = guard.take() {
        let _ = handle.child.kill();
        let _ = handle.child.wait();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::new())
        .invoke_handler(tauri::generate_handler![start_sidecar, stop_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
