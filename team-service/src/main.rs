//! 独立节点启动入口；每个实例显式指定数据目录与名称。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use std::{net::SocketAddr, path::PathBuf};
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let mut directory = None;
    let mut name = None;
    let mut bind = "127.0.0.1:0".parse::<SocketAddr>()?;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--data-dir" if directory.is_none() => directory = args.next().map(PathBuf::from),
            "--name" if name.is_none() => name = args.next(),
            "--bind" => bind = args.next().ok_or("缺少监听地址")?.parse()?,
            _ => return Err("用法：yunfeng-team-node --data-dir <目录> --name <节点名称> [--bind 127.0.0.1:端口]".into()),
        }
    }
    yunfeng_team::node::serve(
        &directory.ok_or("缺少 --data-dir")?,
        &name.ok_or("缺少 --name")?,
        bind,
    )?;
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("[错误] {error}");
        std::process::exit(1);
    }
}
