//! 桌面私有通道的有界文件执行契约；计划授权与作业状态由 TS 编排层负责。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use crate::{files, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Read {
        cwd: String,
        path: String,
    },
    Write {
        cwd: String,
        path: String,
        content: String,
    },
    Evaluate {
        cwd: String,
        condition: Condition,
    },
    ReadMany {
        cwd: String,
        paths: Vec<String>,
    },
    WriteMany {
        cwd: String,
        files: Vec<Write>,
        condition: Option<Condition>,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Write {
    path: String,
    content: String,
}
#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Condition {
    FileExists {
        path: String,
    },
    Metric {
        path: String,
        key: String,
        operator: Operator,
        value: f64,
    },
}
#[derive(Deserialize, Serialize)]
pub enum Operator {
    #[serde(rename = ">")]
    Greater,
    #[serde(rename = ">=")]
    GreaterEqual,
    #[serde(rename = "<")]
    Less,
    #[serde(rename = "<=")]
    LessEqual,
    #[serde(rename = "==")]
    Equal,
}
fn bounded(cwd: &str, path: &str) -> Result<()> {
    if cwd.is_empty()
        || cwd.len() > 4096
        || cwd.contains('\0')
        || path.is_empty()
        || path.len() > 2000
    {
        return Err("项目路径无效或超过上限".into());
    }
    Ok(())
}
fn validate_condition(cwd: &str, condition: &Condition) -> Result<()> {
    let path = match condition {
        Condition::FileExists { path } | Condition::Metric { path, .. } => path,
    };
    bounded(cwd, path)?;
    if let Condition::Metric { key, value, .. } = condition {
        if key.is_empty() || key.len() > 2000 || !value.is_finite() {
            return Err("指标条件无效".into());
        }
    }
    Ok(())
}
fn evaluate(cwd: &str, condition: Condition) -> Result<Value> {
    validate_condition(cwd, &condition)?;
    Ok(
        files::evaluate(Path::new(cwd), &serde_json::to_value(condition)?)
            .unwrap_or_else(|_| json!({"passed":false,"reason":"无法核验真实指标或文件"})),
    )
}
/// 执行受信任编排层提交的单次请求；无重试、网络、模型、数据库或命令启动。
/// 写入错误可能发生在提交后，调用方不得自动重放。该方法不是操作系统沙箱。
pub fn execute(request: Request) -> Result<Value> {
    match request {
        Request::Read { cwd, path } => {
            bounded(&cwd, &path)?;
            Ok(files::read_text(Path::new(&cwd), &path)?.into())
        }
        Request::Write { cwd, path, content } => {
            bounded(&cwd, &path)?;
            files::write_text(Path::new(&cwd), &path, &content)?;
            Ok(Value::Null)
        }
        Request::Evaluate { cwd, condition } => evaluate(&cwd, condition),
        Request::ReadMany { cwd, paths } => {
            if paths.is_empty() || paths.len() > 8 {
                return Err("批量读取须为一到八个文件".into());
            }
            let mut results = Vec::with_capacity(paths.len());
            for path in paths {
                let result =
                    bounded(&cwd, &path).and_then(|_| files::read_text(Path::new(&cwd), &path));
                results.push(match result {
                    Ok(content) => json!({"content":content}),
                    Err(_) => json!({"error":"观察文件不可用"}),
                });
            }
            Ok(results.into())
        }
        Request::WriteMany {
            cwd,
            files,
            condition,
        } => write_many(&cwd, files, condition),
    }
}

fn write_many(cwd: &str, writes: Vec<Write>, condition: Option<Condition>) -> Result<Value> {
    if writes.is_empty() || writes.len() > 8 {
        return Err("批量写入须为一到八个文件".into());
    }
    // 先验证完整批次，避免后续非法字段导致前面的文件已写入；I/O 失败仍可能部分提交。
    for write in &writes {
        bounded(cwd, &write.path)?;
        files::project_path(Path::new(cwd), &write.path)?;
        if write.content.len() > 65536 {
            return Err("写入超过上限".into());
        }
    }
    if let Some(ref condition) = condition {
        validate_condition(cwd, condition)?;
        let path = match condition {
            Condition::FileExists { path } | Condition::Metric { path, .. } => path,
        };
        files::project_path(Path::new(cwd), path)?;
    }
    for write in writes {
        files::write_text(Path::new(cwd), &write.path, &write.content)?;
    }
    Ok(json!({"evaluation":condition.map(|condition| evaluate(cwd, condition)).transpose()?}))
}
