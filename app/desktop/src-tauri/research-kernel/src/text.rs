//! 有界行读取与精确替换，复用文件权限和原子写入边界。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use crate::{files, Result};
use serde_json::{json, Value};
use std::path::Path;

pub fn read_range(cwd: &Path, path: &str, start_line: usize, line_count: usize) -> Result<Value> {
    if start_line == 0 || start_line > 65537 || line_count == 0 || line_count > 1000 {
        return Err("读取行范围无效".into());
    }
    let content = files::read_text(cwd, path)?;
    let lines: Vec<&str> = content.split_inclusive('\n').collect();
    let text: String = lines
        .iter()
        .skip(start_line - 1)
        .take(line_count)
        .copied()
        .collect();
    Ok(
        json!({"content":text,"start_line":start_line,"total_lines":lines.len(),
        "truncated":start_line > 1 || start_line - 1 + line_count < lines.len()}),
    )
}

pub fn patch(cwd: &Path, path: &str, old_text: &str, new_text: &str) -> Result<Value> {
    if old_text.is_empty() || old_text.len() > 65536 || new_text.len() > 65536 {
        return Err("精确修改文本无效或超过上限".into());
    }
    let content = files::read_text(cwd, path)?;
    if content.find(old_text).is_none() || content.find(old_text) != content.rfind(old_text) {
        return Err("原文匹配冲突，请重新读取".into());
    }
    let updated = content.replacen(old_text, new_text, 1);
    // 通道内调用串行；外部进程的竞态只能尽力检查，不能承诺跨进程 CAS。
    if files::read_text(cwd, path)? != content {
        return Err("文件已变化，请重新读取".into());
    }
    files::write_text(cwd, path, &updated)?;
    Ok(json!({"changed":updated != content,"bytes":updated.len()}))
}
