//! 论文图片存储与有界解码；IPC 不接收文件路径。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use super::{
    model::{error, Error},
    persistence::{database, failure},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageFormat, ImageReader, Limits};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{io::Cursor, path::Path};
pub const MAX_BYTES: usize = 20 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    List,
    Import { name: String, bytes: Vec<u8> },
    ImportPdf { name: String, bytes: Vec<u8> },
    Read { id: String },
    Caption { id: String, caption: String },
    Archive { id: String },
    Restore { id: String },
}
fn open(path: &Path) -> Result<Connection, Error> {
    let conn = database(path)?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS paper_asset (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes BLOB NOT NULL, caption TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0);").map_err(|_| failure())?;
    Ok(conn)
}
pub fn execute(path: &Path, request: Request) -> Result<Value, Error> {
    let mut conn = open(path)?;
    match request {
        Request::List => {
            let mut query = conn.prepare("SELECT id,name,mime,width,height,length(bytes),caption,archived FROM paper_asset ORDER BY rowid").map_err(|_| failure())?;
            let rows = query.query_map([], |r| Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"mime":r.get::<_,String>(2)?,"width":r.get::<_,u32>(3)?,"height":r.get::<_,u32>(4)?,"size":r.get::<_,i64>(5)?,"caption":r.get::<_,String>(6)?,"archived":r.get::<_,bool>(7)?}))).map_err(|_| failure())?;
            Ok(Value::Array(
                rows.collect::<Result<Vec<_>, _>>().map_err(|_| failure())?,
            ))
        }
        Request::Import { name, bytes } => {
            if name.is_empty() || name.chars().count() > 255 || name.contains(['/', '\\', '\0']) {
                return Err(invalid());
            }
            let (mime, width, height) = validate_image(&bytes)?;
            let tx = conn
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .map_err(|_| failure())?;
            let (count, total): (u32, i64) = tx
                .query_row(
                    "SELECT count(*),coalesce(sum(length(bytes)),0) FROM paper_asset",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|_| failure())?;
            if count >= 100 || total + bytes.len() as i64 > 200 * 1024 * 1024 {
                return Err(error(
                    "ASSET_LIMIT",
                    "图片库最多 100 张、总计 200 MiB，请整理后重试",
                ));
            }
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute("INSERT INTO paper_asset(id,name,mime,width,height,bytes) VALUES (?1,?2,?3,?4,?5,?6)",params![id,name,mime,width,height,bytes]).map_err(|_| failure())?;
            tx.commit().map_err(|_| failure())?;
            Ok(json!({"id":id}))
        }
        Request::ImportPdf { name, bytes } => {
            if name.is_empty()
                || name.chars().count() > 255
                || name.contains(['/', '\\', '\0'])
                || bytes.len() > MAX_BYTES
                || !bytes.starts_with(b"%PDF-")
                || !bytes.windows(5).any(|part| part == b"%%EOF")
            {
                return Err(error("INVALID_ASSET", "请选择不超过 20 MiB 的 PDF 文献"));
            }
            let tx = conn
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .map_err(|_| failure())?;
            let (count, total): (u32, i64) = tx
                .query_row(
                    "SELECT count(*),coalesce(sum(length(bytes)),0) FROM paper_asset",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| failure())?;
            if count >= 100 || total + bytes.len() as i64 > 200 * 1024 * 1024 {
                return Err(error("ASSET_LIMIT", "素材库最多 100 项、200 MiB"));
            }
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute("INSERT INTO paper_asset(id,name,mime,width,height,bytes) VALUES (?1,?2,'application/pdf',0,0,?3)", params![id,name,bytes]).map_err(|_| failure())?;
            tx.commit().map_err(|_| failure())?;
            Ok(json!({"id":id}))
        }
        Request::Read { id } => {
            let (mime, bytes) = read(&conn, &id)?;
            Ok(json!({"url": format!("data:{mime};base64,{}", STANDARD.encode(bytes))}))
        }
        Request::Caption { id, caption } => {
            check_id(&id)?;
            if caption.chars().count() > 500 {
                return Err(invalid());
            }
            changed(
                conn.execute(
                    "UPDATE paper_asset SET caption=?1 WHERE id=?2",
                    params![caption, id],
                )
                .map_err(|_| failure())?,
            )
        }
        Request::Archive { id } => {
            check_id(&id)?;
            changed(
                conn.execute("UPDATE paper_asset SET archived=1 WHERE id=?1", [id])
                    .map_err(|_| failure())?,
            )
        }
        Request::Restore { id } => {
            check_id(&id)?;
            changed(
                conn.execute("UPDATE paper_asset SET archived=0 WHERE id=?1", [id])
                    .map_err(|_| failure())?,
            )
        }
    }
}
pub fn read(conn: &Connection, id: &str) -> Result<(String, Vec<u8>), Error> {
    check_id(id)?;
    conn.query_row(
        "SELECT mime,bytes FROM paper_asset WHERE id=?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .map_err(|_| error("ASSET_NOT_FOUND", "图片素材不存在或无法读取"))
}
fn changed(count: usize) -> Result<Value, Error> {
    if count == 1 {
        Ok(Value::Null)
    } else {
        Err(error("ASSET_NOT_FOUND", "图片素材不存在"))
    }
}
fn check_id(id: &str) -> Result<(), Error> {
    uuid::Uuid::parse_str(id).map(|_| ()).map_err(|_| invalid())
}
fn invalid() -> Error {
    error("INVALID_ASSET", "图片名称、格式、尺寸或大小不符合要求")
}
fn validate_image(bytes: &[u8]) -> Result<(&'static str, u32, u32), Error> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err(invalid());
    }
    let format = image::guess_format(bytes).map_err(|_| invalid())?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err(invalid()),
    };
    let (width, height) = ImageReader::with_format(Cursor::new(bytes), format)
        .into_dimensions()
        .map_err(|_| invalid())?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 16_000_000 {
        return Err(invalid());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| invalid())?;
    Ok((mime, width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corrupt_images_and_paths_are_rejected() {
        assert!(validate_image(b"not an image").is_err());
        assert!(check_id("../../secret").is_err());
        let dir = tempfile::tempdir().unwrap();
        assert!(execute(
            &dir.path().join("db"),
            Request::Import {
                name: "bad.png".into(),
                bytes: vec![1, 2, 3]
            }
        )
        .is_err());
        assert_eq!(
            execute(&dir.path().join("db"), Request::List).unwrap(),
            json!([])
        );
    }
    #[test]
    fn image_and_caption_survive_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db");
        let image = image::DynamicImage::new_rgb8(2, 2);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        let value = execute(
            &path,
            Request::Import {
                name: "图.png".into(),
                bytes: bytes.into_inner(),
            },
        )
        .unwrap();
        let id = value["id"].as_str().unwrap().to_string();
        execute(
            &path,
            Request::Caption {
                id: id.clone(),
                caption: "图一".into(),
            },
        )
        .unwrap();
        assert_eq!(execute(&path, Request::List).unwrap()[0]["caption"], "图一");
        assert!(execute(&path, Request::Read { id }).unwrap()["url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
    }
}
