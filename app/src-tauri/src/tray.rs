// 系统托盘：服务状态展示 + 分项快捷操作 + 连接信息复制。
// 状态项文本由周期同步线程刷新（2s），服务启停后立即刷新一次。

use std::{
    io::Write,
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, WindowEvent,
};

use crate::{
    rustdesk_close_impl, rustdesk_open_impl, rustdesk_status_impl, service_status,
    spawn_gateway_service, spawn_mobile_backend_service, spawn_server_service, start_all_inner,
    stop_all_inner, stop_service, GatewayState, MobileBackendState, RustDeskState, ServerState,
    ServiceStatus,
};

/// 托盘菜单中需要刷新文本的状态项。
struct TrayMenuItems {
    server: MenuItem<tauri::Wry>,
    gateway: MenuItem<tauri::Wry>,
    mobile: MenuItem<tauri::Wry>,
    rustdesk: MenuItem<tauri::Wry>,
    copy: MenuItem<tauri::Wry>,
}

fn service_line(label: &str, status: &ServiceStatus) -> String {
    match (status.running, status.port) {
        (true, Some(port)) => format!("{label}：运行中 · :{port}"),
        _ => format!("{label}：已停止"),
    }
}

/// 移动后端状态行附带配对码，便于手机端在托盘直接读取。
fn mobile_line(status: &ServiceStatus) -> String {
    let pair_code = status
        .info
        .as_deref()
        .and_then(|info| info.split_whitespace().nth(2))
        .unwrap_or("");
    let base = service_line("移动后端", status);
    if !pair_code.is_empty() {
        format!("{base} · 配对码 {pair_code}")
    } else {
        base
    }
}

fn rustdesk_line(running: bool, available: bool) -> String {
    match (available, running) {
        (false, _) => "RustDesk：未安装".to_string(),
        (true, true) => "RustDesk：运行中".to_string(),
        _ => "RustDesk：未运行".to_string(),
    }
}

fn refresh_tray_items(
    app: &AppHandle,
    items: &Arc<Mutex<Option<TrayMenuItems>>>,
    server: &ServiceStatus,
    gateway: &ServiceStatus,
    mobile: &ServiceStatus,
    rustdesk: &crate::RustDeskStatus,
) {
    let Ok(mut guard) = items.lock() else { return };
    let Some(items) = guard.as_mut() else { return };
    let _ = items.server.set_text(service_line("Server", server));
    let _ = items.gateway.set_text(service_line("网关", gateway));
    let _ = items.mobile.set_text(mobile_line(mobile));
    let _ = items
        .rustdesk
        .set_text(rustdesk_line(rustdesk.running, rustdesk.available));

    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(format!(
            "Yunfeng · Server {} · 网关 {} · 移动后端 {} · RustDesk {}",
            if server.running { "运行" } else { "停止" },
            if gateway.running { "运行" } else { "停止" },
            if mobile.running { "运行" } else { "停止" },
            if rustdesk.running { "运行" } else { "停止" },
        )));
    }
}

fn snapshot_status(
    server: &ServerState,
    gateway: &GatewayState,
    mobile: &MobileBackendState,
    rustdesk: &RustDeskState,
) -> (
    ServiceStatus,
    ServiceStatus,
    ServiceStatus,
    crate::RustDeskStatus,
) {
    (
        service_status(&server.inner),
        service_status(&gateway.inner),
        service_status(&mobile.inner),
        rustdesk_status_impl(&rustdesk.child),
    )
}

/// 组合手机端需要的连接信息：网关地址 + token + 移动后端配对码。
fn compose_connection_info(
    gateway: &ServiceStatus,
    mobile: &ServiceStatus,
) -> Result<String, String> {
    let fields: Vec<&str> = gateway
        .info
        .as_deref()
        .unwrap_or("")
        .split_whitespace()
        .collect();
    if !gateway.running || fields.len() < 3 {
        return Err("网关未运行，暂无连接信息".to_string());
    }
    let mut text = format!(
        "Yunfeng 网关：http://{}:{}\nToken：{}",
        fields[0], fields[1], fields[2]
    );
    let mobile_fields: Vec<&str> = mobile
        .info
        .as_deref()
        .unwrap_or("")
        .split_whitespace()
        .collect();
    if mobile.running && mobile_fields.len() >= 3 {
        text.push_str(&format!(
            "\n移动后端：http://{}:{}\n配对码：{}",
            mobile_fields[0], mobile_fields[1], mobile_fields[2]
        ));
    }
    Ok(text)
}

/// 平台剪贴板命令（macOS pbcopy / Windows clip / Linux wl-copy、xclip），尽力而为。
fn pipe_to_command(bin: &str, text: &str) -> Result<(), String> {
    let mut child = std::process::Command::new(bin)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 {bin} 失败: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    child
        .wait()
        .map(|_| ())
        .map_err(|error| format!("{bin} 执行失败: {error}"))
}

fn copy_to_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return pipe_to_command("pbcopy", text);
    }
    #[cfg(target_os = "windows")]
    {
        return pipe_to_command("clip", text);
    }
    #[cfg(target_os = "linux")]
    {
        if pipe_to_command("wl-copy", text).is_ok() {
            return Ok(());
        }
        return pipe_to_command("xclip", text);
    }
    #[allow(unreachable_code)]
    Err("当前平台没有可用的剪贴板命令".to_string())
}

fn handle_menu_event(app: &AppHandle, id: &str, items: &Arc<Mutex<Option<TrayMenuItems>>>) {
    let mut action_result: Result<(), String> = Ok(());
    match id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "server-start" => {
            action_result =
                spawn_server_service(app.clone(), app.state::<ServerState>().inner.clone())
                    .map(|_| ());
        }
        "server-stop" => stop_service(&app.state::<ServerState>().inner),
        "gateway-start" => {
            action_result =
                spawn_gateway_service(app.clone(), app.state::<GatewayState>().inner.clone())
                    .map(|_| ());
        }
        "gateway-stop" => stop_service(&app.state::<GatewayState>().inner),
        "mobile-start" => {
            action_result = spawn_mobile_backend_service(
                app.clone(),
                app.state::<MobileBackendState>().inner.clone(),
            )
            .map(|_| ());
        }
        "mobile-stop" => stop_service(&app.state::<MobileBackendState>().inner),
        "rustdesk-open" => {
            action_result = rustdesk_open_impl(&app.state::<RustDeskState>().child).map(|_| ());
        }
        "rustdesk-close" => rustdesk_close_impl(&app.state::<RustDeskState>().child),
        "start-all" => {
            let server = app.state::<ServerState>();
            let gateway = app.state::<GatewayState>();
            let mobile = app.state::<MobileBackendState>();
            let rustdesk = app.state::<RustDeskState>();
            action_result = start_all_inner(
                app.clone(),
                server.inner.clone(),
                gateway.inner.clone(),
                mobile.inner.clone(),
                rustdesk.child.clone(),
            )
            .map(|_| ());
        }
        "stop-all" => {
            let server = app.state::<ServerState>();
            let gateway = app.state::<GatewayState>();
            let mobile = app.state::<MobileBackendState>();
            let rustdesk = app.state::<RustDeskState>();
            stop_all_inner(
                &server.inner,
                &gateway.inner,
                &mobile.inner,
                &rustdesk.child,
            );
        }
        "copy-conn" => {
            let (_, gateway_status, mobile_status, _) = snapshot_status(
                &app.state::<ServerState>(),
                &app.state::<GatewayState>(),
                &app.state::<MobileBackendState>(),
                &app.state::<RustDeskState>(),
            );
            match compose_connection_info(&gateway_status, &mobile_status) {
                Ok(text) => {
                    action_result = copy_to_clipboard(&text);
                    if action_result.is_ok() {
                        if let Ok(mut guard) = items.lock() {
                            if let Some(items) = guard.as_mut() {
                                let _ = items.copy.set_text("已复制连接信息");
                            }
                        }
                    }
                }
                Err(message) => action_result = Err(message),
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
    if let Err(message) = action_result {
        eprintln!("[yunfeng-tray] 操作失败: {message}");
    }
    let (server_status, gateway_status, mobile_status, rustdesk_status) = snapshot_status(
        &app.state::<ServerState>(),
        &app.state::<GatewayState>(),
        &app.state::<MobileBackendState>(),
        &app.state::<RustDeskState>(),
    );
    refresh_tray_items(
        app,
        items,
        &server_status,
        &gateway_status,
        &mobile_status,
        &rustdesk_status,
    );
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示 Yunfeng", true, None::<&str>)?;
    let server_status_item =
        MenuItem::with_id(app, "server-status", "Server：未知", false, None::<&str>)?;
    let gateway_status_item =
        MenuItem::with_id(app, "gateway-status", "网关：未知", false, None::<&str>)?;
    let mobile_status_item =
        MenuItem::with_id(app, "mobile-status", "移动后端：未知", false, None::<&str>)?;
    let rustdesk_status_item = MenuItem::with_id(
        app,
        "rustdesk-status",
        "RustDesk：未知",
        false,
        None::<&str>,
    )?;

    let server_start = MenuItem::with_id(app, "server-start", "启动 Server", true, None::<&str>)?;
    let server_stop = MenuItem::with_id(app, "server-stop", "停止 Server", true, None::<&str>)?;
    let gateway_start = MenuItem::with_id(app, "gateway-start", "启动网关", true, None::<&str>)?;
    let gateway_stop = MenuItem::with_id(app, "gateway-stop", "停止网关", true, None::<&str>)?;
    let mobile_start = MenuItem::with_id(app, "mobile-start", "启动移动后端", true, None::<&str>)?;
    let mobile_stop = MenuItem::with_id(app, "mobile-stop", "停止移动后端", true, None::<&str>)?;
    let rustdesk_open =
        MenuItem::with_id(app, "rustdesk-open", "打开 RustDesk", true, None::<&str>)?;
    let rustdesk_close =
        MenuItem::with_id(app, "rustdesk-close", "关闭 RustDesk", true, None::<&str>)?;

    let start_all_item = MenuItem::with_id(app, "start-all", "启动全部服务", true, None::<&str>)?;
    let stop_all_item = MenuItem::with_id(app, "stop-all", "停止全部服务", true, None::<&str>)?;
    let copy_conn = MenuItem::with_id(app, "copy-conn", "复制连接信息", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let server_sep = PredefinedMenuItem::separator(app)?;
    let server_submenu = Submenu::with_items(
        app,
        "Server",
        true,
        &[&server_start, &server_stop, &server_sep],
    )?;
    let gateway_submenu = Submenu::with_items(app, "网关", true, &[&gateway_start, &gateway_stop])?;
    let mobile_submenu =
        Submenu::with_items(app, "移动后端", true, &[&mobile_start, &mobile_stop])?;
    let rustdesk_submenu =
        Submenu::with_items(app, "RustDesk", true, &[&rustdesk_open, &rustdesk_close])?;

    let sep_top = PredefinedMenuItem::separator(app)?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &sep_top,
            &server_status_item,
            &gateway_status_item,
            &mobile_status_item,
            &rustdesk_status_item,
            &server_submenu,
            &gateway_submenu,
            &mobile_submenu,
            &rustdesk_submenu,
            &sep_bottom,
            &start_all_item,
            &stop_all_item,
            &copy_conn,
            &quit,
        ],
    )?;

    let items = Arc::new(Mutex::new(Some(TrayMenuItems {
        server: server_status_item,
        gateway: gateway_status_item,
        mobile: mobile_status_item,
        rustdesk: rustdesk_status_item,
        copy: copy_conn,
    })));

    let icon = app.default_window_icon().cloned().ok_or("缺少窗口图标")?;
    {
        let items = Arc::clone(&items);
        TrayIconBuilder::with_id("main-tray")
            .icon(icon)
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(move |app, event| {
                handle_menu_event(app, event.id.as_ref(), &items);
            })
            .build(app)?;
    }

    if let Some(window) = app.get_webview_window("main") {
        let handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = handle.hide();
            }
        });
    }

    // 周期同步状态文本与 tooltip；进程退出时随主线程结束。
    let app_handle = app.handle().clone();
    let items = Arc::clone(&items);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        let (server_status, gateway_status, mobile_status, rustdesk_status) = snapshot_status(
            &app_handle.state::<ServerState>(),
            &app_handle.state::<GatewayState>(),
            &app_handle.state::<MobileBackendState>(),
            &app_handle.state::<RustDeskState>(),
        );
        refresh_tray_items(
            &app_handle,
            &items,
            &server_status,
            &gateway_status,
            &mobile_status,
            &rustdesk_status,
        );
    });

    Ok(())
}
