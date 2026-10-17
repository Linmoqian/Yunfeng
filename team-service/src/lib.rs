//! 团队领域模型与 SQLite 唯一存储；可嵌入 Tauri，也可独立启动本机节点。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
pub mod members;
pub mod model;
pub mod relations;
mod store;
pub use store::Store;
#[cfg(feature = "node")]
pub mod node;
#[cfg(test)]
mod tests;
