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
        Request::Evaluate { cwd, condition } => {
            let path = match &condition {
                Condition::FileExists { path } | Condition::Metric { path, .. } => path,
            };
            bounded(&cwd, path)?;
            if let Condition::Metric { key, value, .. } = &condition {
                if key.is_empty() || key.len() > 2000 || !value.is_finite() {
                    return Err("指标条件无效".into());
                }
            }
            Ok(
                files::evaluate(Path::new(&cwd), &serde_json::to_value(condition)?)
                    .unwrap_or_else(|_| json!({"passed":false,"reason":"无法核验真实指标或文件"})),
            )
        }
    }
}
