//! 仅本机的有界 HTTP/JSON 传输；使用 httparse 解析，单连接串行处理并主动关闭。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::types::*;
use crate::model::{Error, Result};
use serde_json::Value;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    time::{Duration, Instant},
};
const HEADER_LIMIT: usize = 16 * 1024;
fn receive(
    stream: &mut TcpStream,
    response: bool,
    end: Instant,
) -> Result<(String, String, Vec<u8>)> {
    let mut bytes = Vec::new();
    let (header_end, length, route, token) = loop {
        if Instant::now() >= end || bytes.len() > MAX_BODY + HEADER_LIMIT {
            return Err(input());
        }
        let mut headers = [httparse::EMPTY_HEADER; 32];
        let mut request = httparse::Request::new(&mut headers);
        let mut reply_headers = [httparse::EMPTY_HEADER; 32];
        let mut reply = httparse::Response::new(&mut reply_headers);
        let parsed = if response {
            reply.parse(&bytes)
        } else {
            request.parse(&bytes)
        }
        .map_err(|_| input())?;
        if let httparse::Status::Complete(offset) = parsed {
            if offset > HEADER_LIMIT
                || (response && reply.code != Some(200))
                || (!response && request.method != Some("POST"))
            {
                return Err(input());
            }
            let headers = if response {
                reply.headers
            } else {
                request.headers
            };
            let mut length = None;
            let mut token = None;
            let mut json = false;
            for h in headers {
                let value = std::str::from_utf8(h.value).map_err(|_| input())?;
                if h.name.eq_ignore_ascii_case("content-length") {
                    if length.is_some() {
                        return Err(input());
                    }
                    length = Some(value.parse::<usize>().map_err(|_| input())?);
                }
                if h.name.eq_ignore_ascii_case("authorization") {
                    if token.is_some() {
                        return Err(denied());
                    }
                    token = value.strip_prefix("Bearer ").map(str::to_owned);
                }
                if h.name.eq_ignore_ascii_case("content-type") {
                    json = value.split(';').next() == Some("application/json");
                }
                if h.name.eq_ignore_ascii_case("transfer-encoding")
                    || (!response
                        && (h.name.eq_ignore_ascii_case("origin")
                            || h.name.eq_ignore_ascii_case("expect")))
                {
                    return Err(denied());
                }
            }
            let length = length.ok_or_else(input)?;
            if length > MAX_BODY || !json {
                return Err(input());
            }
            break (
                offset,
                length,
                request.path.unwrap_or("").to_owned(),
                token.unwrap_or_default(),
            );
        }
        if bytes.len() >= HEADER_LIMIT {
            return Err(input());
        }
        read_more(stream, &mut bytes, end, HEADER_LIMIT + MAX_BODY)?;
    };
    while bytes.len() < header_end + length {
        read_more(stream, &mut bytes, end, header_end + length)?;
    }
    if bytes.len() != header_end + length {
        return Err(input());
    }
    Ok((route, token, bytes[header_end..].to_vec()))
}
fn read_more(
    stream: &mut TcpStream,
    bytes: &mut Vec<u8>,
    end: Instant,
    limit: usize,
) -> Result<()> {
    let remaining = end
        .checked_duration_since(Instant::now())
        .filter(|d| !d.is_zero())
        .ok_or_else(input)?;
    stream.set_read_timeout(Some(remaining)).map_err(network)?;
    let mut chunk = [0; 4096];
    let cap = chunk.len().min(limit.saturating_sub(bytes.len()));
    if cap == 0 {
        return Err(input());
    }
    let n = stream.read(&mut chunk[..cap]).map_err(network)?;
    if n == 0 {
        return Err(network("eof"));
    }
    bytes.extend_from_slice(&chunk[..n]);
    Ok(())
}
pub fn read(stream: &mut TcpStream) -> Result<(String, String, Value)> {
    let (route, token, bytes) = receive(stream, false, Instant::now() + Duration::from_secs(5))?;
    let value = serde_json::from_slice(&bytes).map_err(|_| input())?;
    Ok((route, token, value))
}
pub fn respond(stream: &mut TcpStream, result: Result<Value>) -> Result<()> {
    let (status, body) = match result {
        Ok(value) => (200, value),
        Err(error) => (
            if matches!(error.code, "NODE_FORBIDDEN" | "COLLAB_FORBIDDEN") {
                403
            } else {
                400
            },
            serde_json::json!({ "error": error }),
        ),
    };
    let data = serde_json::to_vec(&body).map_err(Error::storage)?;
    if data.len() > MAX_BODY {
        return Err(input());
    }
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(network)?;
    write!(stream, "HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", if status == 200 { "OK" } else { "Error" }, data.len()).map_err(network)?;
    stream.write_all(&data).map_err(network)
}
fn write_before(stream: &mut TcpStream, mut data: &[u8], end: Instant) -> Result<()> {
    while !data.is_empty() {
        let remaining = end
            .checked_duration_since(Instant::now())
            .ok_or_else(input)?;
        stream.set_write_timeout(Some(remaining)).map_err(network)?;
        let count = stream.write(data).map_err(network)?;
        if count == 0 {
            return Err(network("closed"));
        }
        data = &data[count..];
    }
    Ok(())
}
pub fn post(
    address: &str,
    route: &str,
    token: &str,
    body: &impl serde::Serialize,
) -> Result<Value> {
    let end = Instant::now() + Duration::from_secs(5);
    let address = super::types::address(address)?;
    secret(token)?;
    let socket: SocketAddr = address
        .strip_prefix("http://")
        .ok_or_else(input)?
        .parse()
        .map_err(|_| input())?;
    let mut stream =
        TcpStream::connect_timeout(&socket, Duration::from_secs(3)).map_err(network)?;
    let data = serde_json::to_vec(body).map_err(Error::storage)?;
    if data.len() > MAX_BODY {
        return Err(input());
    }
    let header = format!("POST {route} HTTP/1.1\r\nHost: {socket}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len());
    write_before(&mut stream, header.as_bytes(), end)?;
    write_before(&mut stream, &data, end)?;
    let (_, _, bytes) = receive(&mut stream, true, end).map_err(network)?;
    serde_json::from_slice(&bytes).map_err(|_| network("json"))
}
pub fn listener(address: SocketAddr) -> Result<TcpListener> {
    if !address.ip().is_loopback() {
        return Err(input());
    }
    let socket = socket2::Socket::new(
        if address.is_ipv4() {
            socket2::Domain::IPV4
        } else {
            socket2::Domain::IPV6
        },
        socket2::Type::STREAM,
        Some(socket2::Protocol::TCP),
    )
    .map_err(network)?;
    socket.set_reuse_address(true).map_err(network)?;
    socket.bind(&address.into()).map_err(network)?;
    socket.listen(16).map_err(network)?;
    Ok(socket.into())
}
