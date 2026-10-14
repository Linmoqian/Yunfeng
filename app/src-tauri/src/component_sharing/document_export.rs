//! 文稿包与 Word 导出；仅读取 SQLite 快照和受控素材。
//! Created on 2026-10-15
//! @author: https://github.com/Linmoqian
use super::{
    assets,
    model::{error, Error, Snapshot},
    pdf,
    persistence::database,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    io::{Cursor, Write},
    path::Path,
    process::Command,
    time::{Duration, Instant},
};

pub fn selected(snapshot: &Snapshot, tool: &str) -> Value {
    if tool == "writing" {
        serde_json::json!({"name":snapshot.state["name"], "body":snapshot.state["body"]})
    } else {
        snapshot
            .state
            .get(tool)
            .cloned()
            .unwrap_or_else(|| serde_json::json!({"name":"", "body":""}))
    }
}
pub fn content(snapshot: &Snapshot, tool: &str) -> String {
    let document = selected(snapshot, tool);
    let mut body = document["body"].as_str().unwrap_or_default().to_owned();
    if let Some(references) = snapshot.state["references"].as_array() {
        for reference in references {
            let id = reference["id"].as_str().unwrap_or_default();
            let key = format!("[^ref-{id}]");
            if body.contains(&key) && !body.contains(&format!("{key}:")) {
                let clean = |field: &str| {
                    reference[field]
                        .as_str()
                        .unwrap_or_default()
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                };
                body.push_str(&format!(
                    "\n\n{key}: {}. {}. {}\n",
                    clean("title"),
                    clean("citation"),
                    clean("url")
                ));
            }
        }
    }
    body
}
fn image_ids(body: &str) -> BTreeSet<String> {
    body.split("paper-asset:")
        .skip(1)
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
                .collect()
        })
        .collect()
}
pub fn render(
    path: &Path,
    snapshot: &Snapshot,
    tool: &str,
    format: &str,
) -> Result<Vec<u8>, Error> {
    let body = content(snapshot, tool);
    if format == "md" {
        return Ok(body.into_bytes());
    }
    if format == "zip" {
        return archive(path, snapshot, tool, body);
    }
    if format != "docx" {
        return Err(error("INVALID_STATE", "导出格式无效"));
    }
    let conn = database(path)?;
    let mut images = std::collections::HashMap::new();
    let mut total = 0;
    let mut html = pdf::safe_html(&body, |id| {
        let (mime, bytes) = assets::read(&conn, id)?;
        total += bytes.len();
        if total > 100 * 1024 * 1024 {
            return Err(error("EXPORT_FAILED", "Word 图片超过 100 MiB"));
        }
        let name = format!("figure-{}.png", images.len());
        images.insert(
            name.clone(),
            format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        );
        Ok(name)
    })?;
    for (name, uri) in images {
        html = html.replace(&format!("src=\"{name}\""), &format!("src=\"{uri}\""));
    }
    let dir = tempfile::tempdir().map_err(|_| error("EXPORT_FAILED", "无法创建文稿临时目录"))?;
    std::fs::write(dir.path().join("paper.html"), html)
        .map_err(|_| error("EXPORT_FAILED", "无法准备文稿"))?;
    let mut command = Command::new(pdf::program("YUNFENG_PANDOC_BIN", "pandoc")?);
    command.args([
        "--sandbox",
        "--from=html",
        "--to=docx",
        "--standalone",
        "paper.html",
        "--output=paper.docx",
    ]);
    pdf::run(
        &mut command,
        dir.path(),
        Instant::now() + Duration::from_secs(30),
    )?;
    let output = dir.path().join("paper.docx");
    if std::fs::metadata(&output)
        .map_err(|_| error("EXPORT_FAILED", "未生成 Word 文稿"))?
        .len()
        > 128 * 1024 * 1024
    {
        return Err(error("EXPORT_FAILED", "Word 文稿超过上限"));
    }
    std::fs::read(output).map_err(|_| error("EXPORT_FAILED", "无法读取 Word 文稿"))
}
fn archive(
    path: &Path,
    snapshot: &Snapshot,
    tool: &str,
    mut body: String,
) -> Result<Vec<u8>, Error> {
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let conn = database(path)?;
    let mut total = 0;
    let mut ids = image_ids(&body);
    if let Some(references) = snapshot.state["references"].as_array() {
        for reference in references {
            if let Some(id) = reference["pdfAssetId"].as_str() {
                ids.insert(id.into());
            }
        }
    }
    for id in ids {
        let (mime, bytes) = assets::read(&conn, &id)?;
        total += bytes.len();
        if total > 200 * 1024 * 1024 {
            return Err(error("EXPORT_FAILED", "文稿包素材超过 200 MiB"));
        }
        let extension = match mime.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "application/pdf" => "pdf",
            _ => return Err(error("EXPORT_FAILED", "素材类型无效")),
        };
        let name = format!("assets/{id}.{extension}");
        body = body.replace(&format!("paper-asset:{id}"), &name);
        entry(&mut archive, &name, &bytes)?;
    }
    if let Some(files) = snapshot.state["dataFiles"].as_array() {
        for file in files {
            let id = file["id"].as_str().unwrap_or_default();
            if uuid::Uuid::parse_str(id).is_err() {
                return Err(error("INVALID_STATE", "数据摘录标识无效"));
            }
            let name = format!("data/{id}.txt");
            body = body.replace(&format!("research-data:{id}"), &name);
            entry(
                &mut archive,
                &name,
                file["content"].as_str().unwrap_or_default().as_bytes(),
            )?;
        }
    }
    entry(&mut archive, "manuscript.md", body.as_bytes())?;
    let metadata =
        serde_json::to_vec_pretty(&serde_json::json!({"tool": tool, "workspace": snapshot.state}))
            .map_err(|_| error("EXPORT_FAILED", "资料索引失败"))?;
    entry(&mut archive, "materials.json", &metadata)?;
    archive
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|_| error("EXPORT_FAILED", "归档失败"))
}
fn entry(
    archive: &mut zip::ZipWriter<Cursor<Vec<u8>>>,
    name: &str,
    bytes: &[u8],
) -> Result<(), Error> {
    archive
        .start_file(
            name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored),
        )
        .map_err(|_| error("EXPORT_FAILED", "归档失败"))?;
    archive
        .write_all(bytes)
        .map_err(|_| error("EXPORT_FAILED", "归档失败"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "需要本机 Pandoc"]
    fn native_word_export() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.sqlite3");
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let image = assets::execute(
            &path,
            assets::Request::Import {
                name: "图.png".into(),
                bytes: png.into_inner(),
            },
        )
        .unwrap();
        let body = format!(
            "# 中文验收\n\n|项目|结果|\n|---|---|\n|Word|通过|\n\n![图注](paper-asset:{})",
            image["id"].as_str().unwrap()
        );
        let snapshot = Snapshot {
            component: "writing".into(),
            revision: 0,
            state: serde_json::json!({"name":"验收", "body":body}),
        };
        let bytes = render(&path, &snapshot, "writing", "docx").unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        use std::io::Read;
        let mut xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(xml.contains("中文验收"));
        assert!(xml.contains("<w:tbl>"));
        assert!(archive
            .file_names()
            .any(|name| name.starts_with("word/media/")));
    }
    #[test]
    fn each_tool_exports_its_own_body_with_stable_citations() {
        let snapshot = Snapshot {
            component: "writing".into(),
            revision: 1,
            state: serde_json::json!({"name":"论文", "body":"论文", "analysis":{"name":"分析", "body":"来源[^ref-a]"}, "references":[{"id":"a", "title":"证据", "citation":"作者", "url":"https://example.org"}]}),
        };
        assert_eq!(content(&snapshot, "writing"), "论文");
        assert!(content(&snapshot, "analysis").contains("[^ref-a]: 证据"));
        let dir = tempfile::tempdir().unwrap();
        let bytes = render(
            &dir.path().join("store.sqlite3"),
            &snapshot,
            "analysis",
            "zip",
        )
        .unwrap();
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert!(zip.by_name("manuscript.md").is_ok());
        assert!(zip.by_name("materials.json").is_ok());
    }
}
