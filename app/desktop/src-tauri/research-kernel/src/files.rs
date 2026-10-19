//! 项目内有界读写与实测指标验收，拒绝敏感路径和符号链接。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use crate::Result;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

fn private(part: &str) -> bool {
    let name = part.to_lowercase();
    matches!(
        name.as_str(),
        ".env" | "auth.json" | "models.json" | ".git" | "node_modules"
    ) || name.starts_with(".env.")
        || name.starts_with("credentials")
        || name.ends_with(".pem")
        || name.ends_with(".key")
}
/// 返回项目内路径；逐级拒绝链接。与现有 TS 相同，不构成操作系统沙箱。
pub fn project_path(cwd: &Path, input: &str) -> Result<PathBuf> {
    if input.is_empty() || input.contains('\0') || Path::new(input).is_absolute() {
        return Err("需要项目内相对路径".into());
    }
    let root = fs::canonicalize(cwd)?;
    let mut relative = PathBuf::new();
    for component in Path::new(input).components() {
        match component {
            Component::Normal(part) => relative.push(part),
            Component::CurDir => {}
            Component::ParentDir if relative.pop() => {}
            _ => return Err("路径越界".into()),
        }
    }
    if relative.as_os_str().is_empty() || relative.iter().any(|p| private(&p.to_string_lossy())) {
        return Err("路径越界或涉及敏感资源".into());
    }
    let target = root.join(relative);
    let mut current = target.as_path();
    while current != root {
        match fs::symlink_metadata(current) {
            Ok(info) if info.file_type().is_symlink() => {
                return Err("科研文件路径不能包含符号链接".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        current = current.parent().ok_or("路径越界")?;
    }
    Ok(target)
}
/// 仅读取普通 UTF-8 文本，最多 64 KiB；增长中的文件同样受上限约束。
pub fn read_text(cwd: &Path, path: &str) -> Result<String> {
    let target = project_path(cwd, path)?;
    // 先拒绝 FIFO/设备，避免打开特殊文件时阻塞共用执行通道；打开后仍复核。
    let before = fs::metadata(&target)?;
    if !before.is_file() || before.len() > 65536 {
        return Err("观察文件超过上限或不是普通文件".into());
    }
    let file = fs::File::open(target)?;
    let info = file.metadata()?;
    if !info.is_file() || info.len() > 65536 {
        return Err("观察文件超过上限或不是普通文件".into());
    }
    let mut bytes = Vec::with_capacity(info.len() as usize);
    file.take(65537).read_to_end(&mut bytes)?;
    if bytes.len() > 65536 {
        return Err("观察文件超过上限".into());
    }
    Ok(String::from_utf8(bytes)?)
}
/// 调用方授权后的原子写入；临时文件与目标同目录，不额外承诺断电 fsync。
pub fn write_text(cwd: &Path, path: &str, content: &str) -> Result<()> {
    if content.len() > 65536 {
        return Err("写入超过上限".into());
    }
    let target = project_path(cwd, path)?;
    fs::create_dir_all(target.parent().ok_or("缺少父目录")?)?;
    project_path(cwd, path)?;
    let temporary = target.with_file_name(format!(
        "{}.{}.tmp",
        target.file_name().ok_or("缺少文件名")?.to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(content.as_bytes())?;
        drop(file);
        project_path(cwd, path)?;
        fs::rename(&temporary, &target)?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
/// 依据真实文件验收；字符串、布尔值或缺失指标均不得当作数值。
pub fn evaluate(cwd: &Path, condition: &Value) -> Result<Value> {
    let path = condition["path"].as_str().ok_or("缺少验收路径")?;
    if condition["kind"] == "file_exists" {
        let passed = fs::metadata(project_path(cwd, path)?)?.is_file();
        return Ok(json!({"passed":passed,"actual":passed,"reason":"核验普通文件存在"}));
    }
    if condition["kind"] != "metric" {
        return Err("未知验收类型".into());
    }
    let data: Value = serde_json::from_str(&read_text(cwd, path)?)?;
    let key = condition["key"].as_str().ok_or("缺少指标")?;
    let mut item = &data;
    for part in key.split('.') {
        item = item.get(part).ok_or("指标不存在")?;
    }
    let actual = item
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or("指标不是有限数值")?;
    let target = condition["value"]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or("目标不是有限数值")?;
    let operator = condition["operator"].as_str().ok_or("缺少运算符")?;
    let passed = match operator {
        ">" => actual > target,
        ">=" => actual >= target,
        "<" => actual < target,
        "<=" => actual <= target,
        "==" => actual == target,
        _ => return Err("未知运算符".into()),
    };
    Ok(json!({"passed":passed,"actual":item,"reason":format!("{path}:{key} {operator} {target}")}))
}
