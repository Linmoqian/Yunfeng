//! 受信任本机控制方复用同一有界 HTTP 实现，不向浏览器暴露节点令牌。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use crate::model::Result;
use serde_json::Value;
/// 调用节点控制接口；仅接受回环地址与有效令牌，单次请求预算二十秒。
/// 对等同步可在服务端继续处理至其同步预算；调用超时不表示写入回滚。
pub fn request(address: &str, token: &str, input: &Value) -> Result<Value> {
    super::http::post_with_budget(
        address,
        "/v1/local",
        token,
        input,
        std::time::Duration::from_secs(20),
    )
}
