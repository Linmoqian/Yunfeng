// Yunfeng 桌面端外壳：
// - 窗口 + 系统托盘（显示/退出）
// - 自动拉起 yunfeng-server（Node 进程，等待 PI_SERVER_READY）
// - Rust 后端管理 RustDesk 进程（启动/停止/状态）

use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
};

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, State, WindowEvent,
};

const SERVER_PORT: u16 = 8000;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

struct ServerChild {
    child: Child,
    pid: u32,
    port: u16,
}

#[derive(Default)]
struct ServerState {
    inner: Arc<Mutex<Option<ServerChild>>>,
}

#[derive(Default)]
struct RustDeskState {
    child: Arc<Mutex<Option<Child>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServerStatus {
    running: bool,
    port: Option<u16>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RustDeskStatus {
    available: bool,
    running: bool,
    binary: Option<String>,
}

fn server_dir() -> PathBuf {
    repo_root().join("server")
}

fn server_port() -> u16 {
    std::env::var("YUNFENG_SERVER_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(SERVER_PORT)
}

fn server_command(port: u16) -> Result<(Command, Vec<String>), String> {
    let dir = server_dir();
    let mut command = Command::new("node");
    let mut args: Vec<String> = Vec::new();

    if let Ok(entry) = std::env::var("YUNFENG_SERVER_ENTRY") {
        if Path::new(&entry).exists() {
            args.push(entry);
        }
    }
    if args.is_empty() {
        let dist = dir.join("dist").join("index.js");
        if dist.exists() {
            args.push(dist.to_string_lossy().into_owned());
        }
    }
    if args.is_empty() {
        let tsx = dir.join("node_modules").join("tsx").join("dist").join("cli.mjs");
        if tsx.exists() {
            args.push(tsx.to_string_lossy().into_owned());
            args.push("src/index.ts".to_string());
        }
    }
    if args.is_empty() {
        return Err(
            "未找到 server/dist/index.js 或 server/node_modules/tsx，请先在 server 目录执行 npm install && npm run build"
                .into(),
        );
    }

    args.push("--port".to_string());
    args.push(port.to_string());
    command.current_dir(&dir);
    Ok((command, args))
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

fn monitor_server(
    pid: u32,
    port: u16,
    stdout: std::process::ChildStdout,
    state: Arc<Mutex<Option<ServerChild>>>,
    app: tauri::AppHandle,
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("PI_SERVER_READY ") {
            let ready_port = rest
                .split_whitespace()
                .next()
                .and_then(|value| value.parse::<u16>().ok());
            let _ = app.emit(
                "server-ready",
                ServerStatus {
                    running: true,
                    port: ready_port.or(Some(port)),
                },
            );
        }
        println!("[yunfeng-server] {trimmed}");
    }

    let exit_code = {
        let mut guard = state.lock().unwrap();
        if let Some(entry) = guard.as_mut() {
            if entry.pid == pid {
                let code = entry.child.wait().ok().map(|status| status.code()).flatten();
                *guard = None;
                code
            } else {
                None
            }
        } else {
            None
        }
    };
    let _ = app.emit(
        "server-exited",
        serde_json::json!({ "pid": pid, "port": port, "exitCode": exit_code }),
    );
}

fn start_server_internal(
    state: Arc<Mutex<Option<ServerChild>>>,
    app: tauri::AppHandle,
) -> Result<ServerStatus, String> {
    {
        let mut guard = state.lock().unwrap();
        if let Some(entry) = guard.as_mut() {
            if entry.child.try_wait().ok().flatten().is_none() {
                return Ok(ServerStatus {
                    running: true,
                    port: Some(entry.port),
                });
            }
        }
        *guard = None;
    }

    let port = server_port();
    let (mut command, args) = server_command(port)?;
    command
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .stdin(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 yunfeng-server 失败: {error}"))?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or("yunfeng-server stdout 不可用")?;
    {
        let mut guard = state.lock().unwrap();
        *guard = Some(ServerChild { child, pid, port });
    }
    monitor_server(pid, port, stdout, state, app);
    Ok(ServerStatus {
        running: true,
        port: Some(port),
    })
}

#[tauri::command]
fn server_status(state: State<'_, ServerState>) -> ServerStatus {
    let mut guard = state.inner.lock().unwrap();
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
    ServerStatus { running, port }
}

#[tauri::command]
fn start_server(app: tauri::AppHandle, state: State<'_, ServerState>) -> Result<ServerStatus, String> {
    start_server_internal(state.inner.clone(), app)
}

#[tauri::command]
fn stop_server(state: State<'_, ServerState>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    if let Some(mut entry) = guard.take() {
        let _ = entry.child.kill();
        let _ = entry.child.wait();
    }
    Ok(())
}

#[tauri::command]
fn rustdesk_status(state: State<'_, RustDeskState>) -> RustDeskStatus {
    let binary = rustdesk_binary();
    let running = state
        .child
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

#[tauri::command]
fn rustdesk_open(state: State<'_, RustDeskState>) -> Result<RustDeskStatus, String> {
    let binary = rustdesk_binary().ok_or_else(|| "未找到 RustDesk".to_string())?;
    let mut child = Command::new(&binary)
        .spawn()
        .map_err(|error| format!("启动 RustDesk 失败: {error}"))?;
    let running = child.try_wait().ok().flatten().is_none();
    *state.child.lock().unwrap() = if running { Some(child) } else { None };
    Ok(RustDeskStatus {
        available: true,
        running,
        binary: Some(binary.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
fn rustdesk_close(state: State<'_, RustDeskState>) -> Result<(), String> {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(ServerState::default());
    app.manage(RustDeskState::default());

    let show = MenuItem::with_id(app, "show", "显示 Yunfeng", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("缺少窗口图标")?;
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // 关闭窗口时隐藏到托盘；托盘菜单可重新显示或退出。
    if let Some(window) = app.get_webview_window("main") {
        let handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = handle.hide();
            }
        });
    }

    // 自动拉起 yunfeng-server。
    let server_state = app.state::<ServerState>().inner.clone();
    let app_handle = app.handle().clone();
    std::thread::spawn(move || {
        if let Err(error) = start_server_internal(server_state, app_handle.clone()) {
            let _ = app_handle.emit("server-start-failed", error);
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
                if let Some(mut entry) = server.inner.lock().unwrap().take() {
                    let _ = entry.child.kill();
                    let _ = entry.child.wait();
                }
                let rustdesk = app.state::<RustDeskState>();
                let mut rustdesk_guard = rustdesk.child.lock().unwrap();
                if let Some(mut child) = rustdesk_guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
