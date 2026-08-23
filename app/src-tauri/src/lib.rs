// Yunfeng 桌面端外壳：
// - 窗口 + 系统托盘（状态展示与分项快捷操作见 tray.rs）
// - 一键启动编排：yunfeng-server + yunfeng-gateway + yunfeng-mobile-backend + RustDesk
// - 支持 YUNFENG_RUNTIME_HOME 将整套后端切到可写 HOME，并派生 PI_CODING_AGENT_DIR

mod tray;

use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{Emitter, Manager, RunEvent, State};

const SERVER_PORT: u16 = 8000;
const GATEWAY_PORT: u16 = 8787;
const MOBILE_BACKEND_PORT: u16 = 8788;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
        })
}

struct ServiceChild {
    child: Child,
    pid: u32,
    port: u16,
    info: Option<String>,
}

#[derive(Default)]
struct ServerState {
    inner: Arc<Mutex<Option<ServiceChild>>>,
}

#[derive(Default)]
struct GatewayState {
    inner: Arc<Mutex<Option<ServiceChild>>>,
}

#[derive(Default)]
struct MobileBackendState {
    inner: Arc<Mutex<Option<ServiceChild>>>,
}

#[derive(Default)]
struct RustDeskState {
    child: Arc<Mutex<Option<Child>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub info: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RustDeskStatus {
    pub available: bool,
    pub running: bool,
    pub binary: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OrchestrationStatus {
    server: ServiceStatus,
    gateway: ServiceStatus,
    mobile_backend: ServiceStatus,
    rustdesk: RustDeskStatus,
}

fn node_service_entry(
    dir: &Path,
    dist_entry: &str,
    src_entry: &str,
) -> Result<Vec<String>, String> {
    let dist = dir.join(dist_entry);
    if dist.exists() {
        return Ok(vec![dist.to_string_lossy().into_owned()]);
    }
    let tsx = dir
        .join("node_modules")
        .join("tsx")
        .join("dist")
        .join("cli.mjs");
    if tsx.exists() {
        return Ok(vec![
            tsx.to_string_lossy().into_owned(),
            src_entry.to_string(),
        ]);
    }
    // Node 22+ 可直接运行 TypeScript（类型剥离），适配 yunfeng-mobile-backend 的 dev 运行方式。
    if dir.join(src_entry).exists() {
        return Ok(vec![src_entry.to_string()]);
    }
    Err(format!(
        "{} 未安装依赖：请先在对应目录执行 npm install && npm run build",
        dir.display()
    ))
}

fn runtime_home() -> Option<PathBuf> {
    std::env::var("YUNFENG_RUNTIME_HOME")
        .ok()
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

/// 派生 pi agent 配置目录，优先级与 apply_runtime_env 保持一致：
/// 显式 YUNFENG_AGENT_DIR > YUNFENG_RUNTIME_HOME 派生 > None（未隔离时不播种）。
fn pi_agent_dir() -> Option<PathBuf> {
    if let Ok(agent_dir) = std::env::var("YUNFENG_AGENT_DIR") {
        if !agent_dir.is_empty() {
            return Some(PathBuf::from(agent_dir));
        }
    }
    runtime_home().map(|home| home.join(".pi").join("agent"))
}

/// 同步单个文件；内容一致则跳过，缺失或不同才写入，保证幂等。
fn seed_file(src: &Path, dest: &Path, seeded: &mut Vec<String>) -> Result<(), String> {
    let src_bytes = std::fs::read(src).map_err(|e| format!("读取 {}: {e}", src.display()))?;
    if std::fs::read(dest).is_ok_and(|existing| existing == src_bytes) {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 {}: {e}", parent.display()))?;
    }
    std::fs::write(dest, &src_bytes).map_err(|e| format!("写入 {}: {e}", dest.display()))?;
    seeded.push(dest.display().to_string());
    Ok(())
}

/// 递归同步目录树，新增扩展无需改代码即可被播种。
fn seed_tree(src: &Path, dest: &Path, seeded: &mut Vec<String>) -> Result<(), String> {
    let entries = std::fs::read_dir(src).map_err(|e| format!("读取 {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历 {}: {e}", src.display()))?;
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if path.is_dir() {
            seed_tree(&path, &target, seeded)?;
        } else {
            seed_file(&path, &target, seeded)?;
        }
    }
    Ok(())
}

/// 把 services_root()/pi-assets 播种到 agent dir（AGENTS.md + extensions/）。
/// 仅在隔离的运行时 HOME/AGENT_DIR 下生效，不触碰真实 ~/.pi/agent。
fn ensure_pi_assets() {
    let Some(agent_dir) = pi_agent_dir() else {
        return;
    };
    let assets = services_root().join("pi-assets");
    if !assets.is_dir() {
        eprintln!(
            "[yunfeng-desktop] pi-assets 缺失，跳过播种: {}",
            assets.display()
        );
        return;
    }
    let mut seeded: Vec<String> = Vec::new();
    let result = (|| -> Result<(), String> {
        let agents_src = assets.join("AGENTS.md");
        if agents_src.is_file() {
            seed_file(&agents_src, &agent_dir.join("AGENTS.md"), &mut seeded)?;
        }
        let ext_src = assets.join("extensions");
        if ext_src.is_dir() {
            seed_tree(&ext_src, &agent_dir.join("extensions"), &mut seeded)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) if seeded.is_empty() => {
            println!("[yunfeng-desktop] pi 资产已就绪，无需播种")
        }
        Ok(()) => println!(
            "[yunfeng-desktop] 已播种 {} 个 pi 资产文件到 {}",
            seeded.len(),
            agent_dir.display()
        ),
        Err(error) => eprintln!("[yunfeng-desktop] pi 资产播种失败: {error}"),
    }
}

fn apply_runtime_env(command: &mut Command) {
    if let Some(home) = runtime_home() {
        let _ = std::fs::create_dir_all(&home);
        let home_string = home.to_string_lossy().into_owned();
        command.env("HOME", &home_string);
        command.env("USERPROFILE", &home_string);
        // server 需要可写的 pi agent 配置目录；显式 YUNFENG_AGENT_DIR 优先。
        if std::env::var("YUNFENG_AGENT_DIR").is_err() {
            command.env(
                "PI_CODING_AGENT_DIR",
                home.join(".pi")
                    .join("agent")
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    if let Ok(agent_dir) = std::env::var("YUNFENG_AGENT_DIR") {
        command.env("PI_CODING_AGENT_DIR", agent_dir);
    }
}

fn gateway_token() -> String {
    if let Ok(token) = std::env::var("YUNFENG_GATEWAY_TOKEN") {
        if !token.is_empty() {
            return token;
        }
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:x}", nanos, std::process::id())
}

fn service_command(
    dir: &Path,
    dist_entry: &str,
    src_entry: &str,
    extra_args: &[String],
    port: u16,
) -> Result<(Command, Vec<String>), String> {
    let mut entry = node_service_entry(dir, dist_entry, src_entry)?;
    let mut args: Vec<String> = Vec::new();
    args.append(&mut entry);
    args.extend(extra_args.iter().cloned());
    args.push("--port".to_string());
    args.push(port.to_string());
    let mut command = Command::new("node");
    command.current_dir(dir);
    Ok((command, args))
}

fn services_root() -> PathBuf {
    std::env::var("YUNFENG_SERVICES_DIR")
        .ok()
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .unwrap_or_else(repo_root)
}

fn server_dir() -> PathBuf {
    services_root().join("server")
}

fn gateway_dir() -> PathBuf {
    services_root().join("gateway")
}

fn mobile_backend_dir() -> PathBuf {
    services_root().join("yunfeng-mobile-backend")
}

fn env_port(name: &str, fallback: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}

fn server_service() -> Result<(Command, Vec<String>), String> {
    let port = env_port("YUNFENG_SERVER_PORT", SERVER_PORT);
    let dir = server_dir();
    let mut entry = if let Ok(value) = std::env::var("YUNFENG_SERVER_ENTRY") {
        let path = PathBuf::from(&value);
        if path.exists() {
            vec![value]
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };
    if entry.is_empty() {
        entry = node_service_entry(&dir, "dist/index.js", "src/index.ts")?;
    }
    let mut args = entry;
    args.push("--port".to_string());
    args.push(port.to_string());
    let mut command = Command::new("node");
    command.current_dir(&dir);
    Ok((command, args))
}

fn gateway_service(server_port: u16) -> Result<(Command, Vec<String>), String> {
    let port = env_port("YUNFENG_GATEWAY_PORT", GATEWAY_PORT);
    let token = gateway_token();
    let args = vec![
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--upstream".to_string(),
        format!("http://127.0.0.1:{server_port}"),
        "--auth-token".to_string(),
        token,
    ];
    service_command(&gateway_dir(), "dist/index.js", "src/index.ts", &args, port)
}

fn mobile_backend_service() -> Result<(Command, Vec<String>), String> {
    let port = env_port("YUNFENG_MOBILE_BACKEND_PORT", MOBILE_BACKEND_PORT);
    let mut extra = vec!["--host".to_string(), "0.0.0.0".to_string()];
    if let Ok(db) = std::env::var("YUNFENG_MOBILE_DB") {
        if !db.is_empty() {
            extra.push("--db".to_string());
            extra.push(db);
        }
    }
    service_command(
        &mobile_backend_dir(),
        "dist/index.js",
        "src/index.ts",
        &extra,
        port,
    )
}

fn spawn_service(
    state: Arc<Mutex<Option<ServiceChild>>>,
    app: tauri::AppHandle,
    (mut command, args): (Command, Vec<String>),
    port: u16,
    ready_prefix: &'static str,
    event_name: &'static str,
) -> Result<ServiceStatus, String> {
    {
        let mut guard = state.lock().unwrap();
        if let Some(entry) = guard.as_mut() {
            if entry.child.try_wait().ok().flatten().is_none() {
                return Ok(ServiceStatus {
                    running: true,
                    port: Some(entry.port),
                    info: entry.info.clone(),
                });
            }
        }
        *guard = None;
    }

    apply_runtime_env(&mut command);
    command
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .stdin(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动服务失败: {error}"))?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or("服务 stdout 不可用")?;
    {
        let mut guard = state.lock().unwrap();
        *guard = Some(ServiceChild {
            child,
            pid,
            port,
            info: None,
        });
    }
    std::thread::spawn(move || {
        monitor_service(pid, port, stdout, ready_prefix, event_name, state, app);
    });
    Ok(ServiceStatus {
        running: true,
        port: Some(port),
        info: None,
    })
}

fn monitor_service(
    pid: u32,
    port: u16,
    stdout: std::process::ChildStdout,
    ready_prefix: &'static str,
    event_name: &'static str,
    state: Arc<Mutex<Option<ServiceChild>>>,
    app: tauri::AppHandle,
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        let info = trimmed
            .strip_prefix(ready_prefix)
            .map(|rest| rest.trim().to_string());
        if let Some(info_value) = info {
            if let Ok(mut guard) = state.lock() {
                if let Some(entry) = guard.as_mut() {
                    if entry.pid == pid {
                        entry.info = Some(info_value.clone());
                    }
                }
            }
            let _ = app.emit(
                event_name,
                ServiceStatus {
                    running: true,
                    port: Some(port),
                    info: Some(info_value),
                },
            );
        }
        println!("[{event_name}] {trimmed}");
    }

    let exit_code = {
        let mut guard = state.lock().unwrap();
        if let Some(entry) = guard.as_mut() {
            if entry.pid == pid {
                let code = entry
                    .child
                    .wait()
                    .ok()
                    .map(|status| status.code())
                    .flatten();
                *guard = None;
                code
            } else {
                None
            }
        } else {
            None
        }
    };
    println!("[service-exited {event_name}] pid={pid} code={exit_code:?}");
    let _ = app.emit(
        "service-exited",
        serde_json::json!({ "event": event_name, "pid": pid, "port": port, "exitCode": exit_code }),
    );
}

pub(crate) fn service_status(state: &Arc<Mutex<Option<ServiceChild>>>) -> ServiceStatus {
    let mut guard = state.lock().unwrap();
    let running = if let Some(entry) = guard.as_mut() {
        entry.child.try_wait().ok().flatten().is_none()
    } else {
        false
    };
    let port = if running {
        guard.as_ref().map(|entry| entry.port)
    } else {
        None
    };
    let info = if running {
        guard.as_ref().and_then(|entry| entry.info.clone())
    } else {
        None
    };
    ServiceStatus {
        running,
        port,
        info,
    }
}

pub(crate) fn stop_service(state: &Arc<Mutex<Option<ServiceChild>>>) {
    let mut guard = state.lock().unwrap();
    if let Some(mut entry) = guard.take() {
        let _ = entry.child.kill();
        let _ = entry.child.wait();
    }
}

fn rustdesk_binary() -> Option<PathBuf> {
    if let Ok(value) = std::env::var("RUSTDESK_BIN") {
        let path = PathBuf::from(value);
        if path.exists() {
            return Some(path);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let bundled = services_root()
            .join("rustdesk")
            .join("RustDesk.app")
            .join("Contents")
            .join("MacOS")
            .join("RustDesk");
        if bundled.exists() {
            return Some(bundled);
        }
        let app = PathBuf::from("/Applications/RustDesk.app/Contents/MacOS/RustDesk");
        if app.exists() {
            return Some(app);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let exe = PathBuf::from(std::env::var("PROGRAMFILES").unwrap_or_default())
            .join("RustDesk")
            .join("rustdesk.exe");
        if exe.exists() {
            return Some(exe);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let bin = PathBuf::from("/usr/bin/rustdesk");
        if bin.exists() {
            return Some(bin);
        }
    }
    None
}

pub(crate) fn rustdesk_status_impl(child: &Arc<Mutex<Option<Child>>>) -> RustDeskStatus {
    let binary = rustdesk_binary();
    let running = child
        .lock()
        .unwrap()
        .as_mut()
        .map(|child| child.try_wait().ok().flatten().is_none())
        .unwrap_or(false);
    RustDeskStatus {
        available: binary.is_some(),
        running,
        binary: binary.map(|path| path.to_string_lossy().into_owned()),
    }
}

pub(crate) fn rustdesk_open_impl(
    child: &Arc<Mutex<Option<Child>>>,
) -> Result<RustDeskStatus, String> {
    let binary = rustdesk_binary().ok_or_else(|| "未找到 RustDesk".to_string())?;
    let mut child_handle = Command::new(&binary)
        .spawn()
        .map_err(|error| format!("启动 RustDesk 失败: {error}"))?;
    let running = child_handle.try_wait().ok().flatten().is_none();
    *child.lock().unwrap() = if running { Some(child_handle) } else { None };
    Ok(RustDeskStatus {
        available: true,
        running,
        binary: Some(binary.to_string_lossy().into_owned()),
    })
}

pub(crate) fn rustdesk_close_impl(child: &Arc<Mutex<Option<Child>>>) {
    if let Some(mut child_handle) = child.lock().unwrap().take() {
        let _ = child_handle.kill();
        let _ = child_handle.wait();
    }
}

#[tauri::command]
fn server_status(state: State<'_, ServerState>) -> ServiceStatus {
    service_status(&state.inner)
}

#[tauri::command]
fn gateway_status(state: State<'_, GatewayState>) -> ServiceStatus {
    service_status(&state.inner)
}

#[tauri::command]
fn mobile_backend_status(state: State<'_, MobileBackendState>) -> ServiceStatus {
    service_status(&state.inner)
}

#[tauri::command]
fn orchestration_status(
    server: State<'_, ServerState>,
    gateway: State<'_, GatewayState>,
    mobile_backend: State<'_, MobileBackendState>,
    rustdesk: State<'_, RustDeskState>,
) -> OrchestrationStatus {
    OrchestrationStatus {
        server: service_status(&server.inner),
        gateway: service_status(&gateway.inner),
        mobile_backend: service_status(&mobile_backend.inner),
        rustdesk: rustdesk_status_impl(&rustdesk.child),
    }
}

/// 启动 server 服务；与 #[tauri::command] 包装分离，供托盘等内部模块复用。
pub(crate) fn spawn_server_service(
    app: tauri::AppHandle,
    inner: Arc<Mutex<Option<ServiceChild>>>,
) -> Result<ServiceStatus, String> {
    let (command, args) = server_service()?;
    spawn_service(
        inner,
        app,
        (command, args),
        env_port("YUNFENG_SERVER_PORT", SERVER_PORT),
        "PI_SERVER_READY",
        "server-ready",
    )
}

#[tauri::command]
fn start_server(
    app: tauri::AppHandle,
    state: State<'_, ServerState>,
) -> Result<ServiceStatus, String> {
    spawn_server_service(app, state.inner.clone())
}

#[tauri::command]
fn stop_server(state: State<'_, ServerState>) {
    stop_service(&state.inner);
}

pub(crate) fn spawn_gateway_service(
    app: tauri::AppHandle,
    inner: Arc<Mutex<Option<ServiceChild>>>,
) -> Result<ServiceStatus, String> {
    let (command, args) = gateway_service(env_port("YUNFENG_SERVER_PORT", SERVER_PORT))?;
    spawn_service(
        inner,
        app,
        (command, args),
        env_port("YUNFENG_GATEWAY_PORT", GATEWAY_PORT),
        "YF_GATEWAY_READY",
        "gateway-ready",
    )
}

#[tauri::command]
fn start_gateway(
    app: tauri::AppHandle,
    state: State<'_, GatewayState>,
) -> Result<ServiceStatus, String> {
    spawn_gateway_service(app, state.inner.clone())
}

#[tauri::command]
fn stop_gateway(state: State<'_, GatewayState>) {
    stop_service(&state.inner);
}

pub(crate) fn spawn_mobile_backend_service(
    app: tauri::AppHandle,
    inner: Arc<Mutex<Option<ServiceChild>>>,
) -> Result<ServiceStatus, String> {
    let (command, args) = mobile_backend_service()?;
    spawn_service(
        inner,
        app,
        (command, args),
        env_port("YUNFENG_MOBILE_BACKEND_PORT", MOBILE_BACKEND_PORT),
        "YF_MOBILE_READY",
        "mobile-backend-ready",
    )
}

#[tauri::command]
fn start_mobile_backend(
    app: tauri::AppHandle,
    state: State<'_, MobileBackendState>,
) -> Result<ServiceStatus, String> {
    spawn_mobile_backend_service(app, state.inner.clone())
}

#[tauri::command]
fn stop_mobile_backend(state: State<'_, MobileBackendState>) {
    stop_service(&state.inner);
}

/// 启动全部服务；内部复用函数，供托盘与启动编排调用。
pub(crate) fn start_all_inner(
    app: tauri::AppHandle,
    server: Arc<Mutex<Option<ServiceChild>>>,
    gateway: Arc<Mutex<Option<ServiceChild>>>,
    mobile_backend: Arc<Mutex<Option<ServiceChild>>>,
    rustdesk: Arc<Mutex<Option<Child>>>,
) -> Result<OrchestrationStatus, String> {
    // 播种须先于 server 启动：server 进程启动时即读取 agent dir 的扩展与上下文。
    ensure_pi_assets();
    let server_status = spawn_server_service(app.clone(), server)?;
    let gateway_status = spawn_gateway_service(app.clone(), gateway)?;
    let mobile_backend_status = spawn_mobile_backend_service(app.clone(), mobile_backend)?;
    let rustdesk_status =
        rustdesk_open_impl(&rustdesk).unwrap_or_else(|_| rustdesk_status_impl(&rustdesk));
    Ok(OrchestrationStatus {
        server: server_status,
        gateway: gateway_status,
        mobile_backend: mobile_backend_status,
        rustdesk: rustdesk_status,
    })
}

#[tauri::command]
fn start_all(
    app: tauri::AppHandle,
    server: State<'_, ServerState>,
    gateway: State<'_, GatewayState>,
    mobile_backend: State<'_, MobileBackendState>,
    rustdesk: State<'_, RustDeskState>,
) -> Result<OrchestrationStatus, String> {
    start_all_inner(
        app,
        server.inner.clone(),
        gateway.inner.clone(),
        mobile_backend.inner.clone(),
        rustdesk.child.clone(),
    )
}

pub(crate) fn stop_all_inner(
    server: &Arc<Mutex<Option<ServiceChild>>>,
    gateway: &Arc<Mutex<Option<ServiceChild>>>,
    mobile_backend: &Arc<Mutex<Option<ServiceChild>>>,
    rustdesk: &Arc<Mutex<Option<Child>>>,
) {
    stop_service(server);
    stop_service(gateway);
    stop_service(mobile_backend);
    rustdesk_close_impl(rustdesk);
}

#[tauri::command]
fn stop_all(
    server: State<'_, ServerState>,
    gateway: State<'_, GatewayState>,
    mobile_backend: State<'_, MobileBackendState>,
    rustdesk: State<'_, RustDeskState>,
) {
    stop_all_inner(
        &server.inner,
        &gateway.inner,
        &mobile_backend.inner,
        &rustdesk.child,
    );
}

#[tauri::command]
fn rustdesk_open(state: State<'_, RustDeskState>) -> Result<RustDeskStatus, String> {
    rustdesk_open_impl(&state.child)
}

#[tauri::command]
fn rustdesk_close(state: State<'_, RustDeskState>) {
    rustdesk_close_impl(&state.child);
}

#[tauri::command]
fn rustdesk_status(state: State<'_, RustDeskState>) -> RustDeskStatus {
    rustdesk_status_impl(&state.child)
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(ServerState::default());
    app.manage(GatewayState::default());
    app.manage(MobileBackendState::default());
    app.manage(RustDeskState::default());

    tray::setup(app)?;

    // 自动拉起全部后端服务。
    let app_handle = app.handle().clone();
    std::thread::spawn(move || {
        let result = start_all(
            app_handle.clone(),
            app_handle.state::<ServerState>(),
            app_handle.state::<GatewayState>(),
            app_handle.state::<MobileBackendState>(),
            app_handle.state::<RustDeskState>(),
        );
        if let Err(error) = result {
            eprintln!("[yunfeng-desktop] start_all failed: {error}");
        }
    });

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            server_status,
            start_gateway,
            stop_gateway,
            gateway_status,
            start_mobile_backend,
            stop_mobile_backend,
            mobile_backend_status,
            start_all,
            stop_all,
            orchestration_status,
            rustdesk_open,
            rustdesk_close,
            rustdesk_status
        ])
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let server = app.state::<ServerState>();
                stop_service(&server.inner);
                let gateway = app.state::<GatewayState>();
                stop_service(&gateway.inner);
                let mobile_backend = app.state::<MobileBackendState>();
                stop_service(&mobile_backend.inner);
                let rustdesk = app.state::<RustDeskState>();
                rustdesk_close_impl(&rustdesk.child);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{seed_file, seed_tree};
    use std::fs;
    use std::path::PathBuf;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yunfeng-seed-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("创建临时目录");
        dir
    }

    #[test]
    fn seed_file_is_idempotent() {
        let root = temp_root("file");
        let src = root.join("src.md");
        let dest = root.join("nested").join("dest.md");
        fs::write(&src, b"v1").expect("写入源");

        let mut seeded = Vec::new();
        seed_file(&src, &dest, &mut seeded).expect("首次播种");
        assert_eq!(seeded.len(), 1);
        assert_eq!(fs::read(&dest).unwrap(), b"v1");

        // 内容一致时不重写、不计数。
        let mut seeded = Vec::new();
        seed_file(&src, &dest, &mut seeded).expect("重复播种");
        assert!(seeded.is_empty());

        // 内容变化时覆盖。
        fs::write(&src, b"v2").expect("更新源");
        let mut seeded = Vec::new();
        seed_file(&src, &dest, &mut seeded).expect("变更播种");
        assert_eq!(fs::read(&dest).unwrap(), b"v2");
        assert_eq!(seeded.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn seed_tree_recurses_and_skips_unchanged() {
        let root = temp_root("tree");
        let src = root.join("assets");
        let dest = root.join("agent");
        fs::create_dir_all(src.join("extensions").join("demo")).expect("创建源目录");
        fs::write(src.join("AGENTS.md"), b"rules").expect("写 AGENTS");
        fs::write(
            src.join("extensions").join("demo").join("index.ts"),
            b"tool",
        )
        .expect("写扩展");

        let mut seeded = Vec::new();
        seed_tree(&src, &dest, &mut seeded).expect("播种目录");
        assert_eq!(seeded.len(), 2);
        assert!(dest.join("AGENTS.md").is_file());
        assert!(dest.join("extensions/demo/index.ts").is_file());

        // 二次播种全量跳过。
        let mut seeded = Vec::new();
        seed_tree(&src, &dest, &mut seeded).expect("重复播种目录");
        assert!(seeded.is_empty());

        let _ = fs::remove_dir_all(&root);
    }
}
