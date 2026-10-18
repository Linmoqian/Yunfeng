//! 科研本地核心；由调用方管理授权、取消、事件调度和任务生命周期。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
mod checkpoint;
pub mod execution;
pub mod files;
pub mod store;
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
