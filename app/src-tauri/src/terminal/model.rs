//! 终端 IPC 类型、输入边界与有界输出回放。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const MAX_SESSIONS: usize = 4;
pub const MAX_OUTPUT: usize = 256 * 1024;

#[derive(Debug, Serialize)]
pub struct Error {
    pub code: &'static str,
    pub message: &'static str,
}
pub fn error(code: &'static str, message: &'static str) -> Error {
    Error { code, message }
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Size {
    pub cols: u16,
    pub rows: u16,
}
impl Size {
    pub fn validate(self) -> Result<Self> {
        if !(20..=300).contains(&self.cols) || !(4..=200).contains(&self.rows) {
            return Err(error("INVALID_SIZE", "终端尺寸超出范围"));
        }
        Ok(self)
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    List,
    Start { size: Size },
    Read { id: String, cursor: u64 },
    Write { id: String, data: String },
    Resize { id: String, size: Size },
    Stop { id: String },
    Close { id: String },
}

pub fn authorize(label: &str) -> Result<()> {
    if label != "main" {
        return Err(error("FORBIDDEN", "终端仅允许主窗口访问"));
    }
    Ok(())
}

#[derive(Default)]
pub struct Output {
    bytes: VecDeque<u8>,
    end: u64,
    pub closed: bool,
    pub failed: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub data: Vec<u8>,
    pub cursor: u64,
    pub truncated: bool,
    pub closed: bool,
    pub failed: bool,
}
impl Output {
    pub fn append(&mut self, data: &[u8]) {
        self.end += data.len() as u64;
        self.bytes.extend(data);
        let excess = self.bytes.len().saturating_sub(MAX_OUTPUT);
        self.bytes.drain(..excess);
    }
    pub fn read(&self, cursor: u64) -> Result<Chunk> {
        if cursor > self.end {
            return Err(error("INVALID_CURSOR", "终端输出游标无效"));
        }
        let start = self.end - self.bytes.len() as u64;
        let offset = cursor.saturating_sub(start) as usize;
        // 每次最多 64 KiB；游标读取可重试，不会消费或丢失首次输出。
        let data: Vec<u8> = self
            .bytes
            .iter()
            .skip(offset)
            .take(64 * 1024)
            .copied()
            .collect();
        let next = cursor.max(start) + data.len() as u64;
        Ok(Chunk {
            data,
            cursor: next,
            truncated: cursor < start,
            closed: self.closed && next == self.end,
            failed: self.failed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_permission_size_and_request() {
        assert!(authorize("main").is_ok());
        assert!(authorize("component-writing").is_err());
        assert!(Size { cols: 80, rows: 24 }.validate().is_ok());
        assert!(Size { cols: 1, rows: 24 }.validate().is_err());
        assert!(serde_json::from_str::<Request>(
            r#"{"action":"start","size":{"cols":80,"rows":24},"command":"anything"}"#
        )
        .is_err());
    }
    #[test]
    fn output_is_bounded_repeatable_and_reports_loss() {
        let mut out = Output::default();
        out.append(&vec![b'x'; MAX_OUTPUT + 7]);
        assert_eq!(out.bytes.len(), MAX_OUTPUT);
        let first = out.read(0).unwrap();
        assert!(first.truncated);
        assert_eq!(first.data.len(), 64 * 1024);
        assert_eq!(first.cursor, 7 + 64 * 1024);
        assert_eq!(first.data, out.read(0).unwrap().data);
        assert!(out.read(out.end + 1).is_err());
    }
    #[test]
    fn preserves_utf8_bytes_and_drains_before_close() {
        let mut out = Output::default();
        for byte in "云枫".as_bytes() {
            out.append(&[*byte]);
        }
        out.closed = true;
        let chunk = out.read(0).unwrap();
        assert_eq!(String::from_utf8(chunk.data).unwrap(), "云枫");
        assert!(chunk.closed);
    }
}
