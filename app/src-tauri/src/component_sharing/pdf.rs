//! PDF 排版边界：受控 Markdown 转 HTML，Rust 管理图片和限时子进程。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use super::{
    assets,
    model::{error, Error, Snapshot},
    persistence::database,
};
use pulldown_cmark::{html, Event, Options, Parser, Tag, TagEnd};
use std::{
    collections::HashMap,
    io::Cursor,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub fn safe_html(
    body: &str,
    mut image: impl FnMut(&str) -> Result<String, Error>,
) -> Result<String, Error> {
    let mut events = Vec::new();
    for event in Parser::new_ext(
        body,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_FOOTNOTES,
    ) {
        events.push(match event {
            Event::Html(text) | Event::InlineHtml(text) => Event::Text(text),
            Event::Start(Tag::Image { dest_url, .. }) => {
                let asset = dest_url.strip_prefix("paper-asset:").ok_or_else(|| {
                    error(
                        "EXPORT_FAILED",
                        "PDF 只允许已导入的图片，请替换外部图片引用",
                    )
                })?;
                let filename = image(asset)?;
                if !filename
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                {
                    return Err(error("EXPORT_FAILED", "图片临时名称无效"));
                }
                Event::Html(format!("<figure><img src=\"{filename}\" alt=\"\"><figcaption>").into())
            }
            Event::End(TagEnd::Image) => Event::Html("</figcaption></figure>".into()),
            Event::Start(Tag::Link {
                link_type,
                dest_url,
                title,
                id,
            }) => {
                let allowed = url::Url::parse(&dest_url)
                    .is_ok_and(|u| ["https", "http", "mailto"].contains(&u.scheme()));
                Event::Start(Tag::Link {
                    link_type,
                    dest_url: if allowed { dest_url } else { "".into() },
                    title,
                    id,
                })
            }
            other => other,
        });
    }
    let mut rendered = String::new();
    html::push_html(&mut rendered, events.into_iter());
    Ok(rendered)
}
pub fn render(path: &Path, snapshot: &Snapshot) -> Result<Vec<u8>, Error> {
    let pandoc = program("YUNFENG_PANDOC_BIN", "pandoc")?;
    let xelatex = program("YUNFENG_XELATEX_BIN", "xelatex")?;
    let dir = tempfile::tempdir().map_err(|_| error("EXPORT_FAILED", "无法创建 PDF 临时目录"))?;
    let conn = database(path)?;
    let mut cache = HashMap::new();
    let mut pixels = 0_u64;
    let body = snapshot.state["body"]
        .as_str()
        .ok_or_else(|| error("EXPORT_FAILED", "文稿正文无效"))?;
    let rendered = safe_html(body, |id| {
        if let Some(filename) = cache.get(id) {
            return Ok(String::clone(filename));
        }
        let (_, bytes) = assets::read(&conn, id)?;
        let image = image::load_from_memory(&bytes)
            .map_err(|_| error("EXPORT_FAILED", "图片无法用于 PDF 排版"))?;
        pixels += u64::from(image.width()) * u64::from(image.height());
        if cache.len() >= 32 || pixels > 64_000_000 {
            return Err(error(
                "EXPORT_FAILED",
                "单份 PDF 最多 32 张图片、总计 6400 万像素",
            ));
        }
        let filename = format!("figure-{}.png", cache.len());
        let mut png = Cursor::new(Vec::new());
        image
            .write_to(&mut png, image::ImageFormat::Png)
            .map_err(|_| error("EXPORT_FAILED", "图片转换失败"))?;
        std::fs::write(dir.path().join(&filename), png.into_inner())
            .map_err(|_| error("EXPORT_FAILED", "图片临时保存失败"))?;
        cache.insert(id.to_owned(), filename.clone());
        Ok(filename)
    })?;
    if body.trim().is_empty() {
        return Err(error("EXPORT_FAILED", "请先输入文稿正文"));
    }
    std::fs::write(dir.path().join("paper.html"), rendered)
        .map_err(|_| error("EXPORT_FAILED", "文稿临时保存失败"))?;
    let deadline = Instant::now() + Duration::from_secs(30);
    let font = if cfg!(target_os = "macos") {
        "PingFang SC"
    } else if cfg!(target_os = "windows") {
        "Microsoft YaHei"
    } else {
        "Noto Sans CJK SC"
    };
    let mut convert = Command::new(pandoc);
    convert
        .args([
            "--sandbox",
            "--from=html",
            "--to=latex",
            "--standalone",
            "--variable=geometry:margin=25mm",
            "--variable=fontsize:11pt",
            "--variable=colorlinks:true",
            "--variable=linkcolor:violet",
            "--variable=urlcolor:violet",
        ])
        .arg(format!("--variable=CJKmainfont:{font}"))
        .args(["paper.html", "--output=paper.tex"]);
    run(&mut convert, dir.path(), deadline)?;
    for _ in 0..2 {
        let mut command = Command::new(&xelatex);
        command
            .args([
                "-no-shell-escape",
                "-halt-on-error",
                "-interaction=nonstopmode",
                "paper.tex",
            ])
            .env("openin_any", "p")
            .env("openout_any", "p");
        run(&mut command, dir.path(), deadline)?;
    }
    let output = dir.path().join("paper.pdf");
    let length = std::fs::metadata(&output)
        .map_err(|_| error("EXPORT_FAILED", "未生成 PDF"))?
        .len();
    if length > 32 * 1024 * 1024 {
        return Err(error("EXPORT_FAILED", "PDF 超过 32 MiB 导出上限"));
    }
    let bytes = std::fs::read(output).map_err(|_| error("EXPORT_FAILED", "无法读取生成的 PDF"))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(error("EXPORT_FAILED", "生成结果不是有效 PDF"));
    }
    Ok(bytes)
}
fn program(variable: &str, name: &str) -> Result<PathBuf, Error> {
    if let Some(path) = std::env::var_os(variable) {
        let path = PathBuf::from(path);
        if path.is_absolute() && path.is_file() {
            return Ok(path);
        }
        return Err(error(
            "EXPORT_UNAVAILABLE",
            "PDF 工具配置无效，需要绝对可执行文件路径",
        ));
    }
    let executable = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    for path in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let candidate = path.join(&executable);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(error(
        "EXPORT_UNAVAILABLE",
        "PDF 导出需要安装 Pandoc 与 XeLaTeX，并加入 PATH",
    ))
}
fn run(command: &mut Command, directory: &Path, deadline: Instant) -> Result<(), Error> {
    command
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|_| error("EXPORT_UNAVAILABLE", "PDF 排版工具无法启动"))?;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(error(
                        "EXPORT_FAILED",
                        "PDF 排版失败，请检查中文字体和 TeX 依赖",
                    ))
                }
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                #[cfg(unix)]
                if let Ok(pid) = i32::try_from(child.id()) {
                    // SAFETY: pid 为当前持有子进程创建的独立组，非零；只回收本次排版组。
                    unsafe {
                        libc::kill(-pid, libc::SIGKILL);
                    }
                }
                let _ = child.kill();
                let _ = child.wait();
                return Err(error("EXPORT_TIMEOUT", "PDF 排版超过 30 秒，已停止"));
            }
        }
    }
}
pub fn save(destination: &Path, bytes: &[u8]) -> Result<(), Error> {
    use std::io::Write;
    let parent = destination
        .parent()
        .ok_or_else(|| error("EXPORT_FAILED", "保存位置无效"))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| error("EXPORT_FAILED", "无法写入保存位置"))?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| error("EXPORT_FAILED", "PDF 保存失败"))?;
    file.persist(destination)
        .map_err(|_| error("EXPORT_FAILED", "PDF 保存失败，原文件未被替换"))?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "需要本机 Pandoc、XeLaTeX 与中文字体"]
    fn native_pdf_export() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db");
        let image = image::DynamicImage::new_rgb8(240, 80);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let asset = assets::execute(
            &path,
            assets::Request::Import {
                name: "验收插图.png".into(),
                bytes: bytes.into_inner(),
            },
        )
        .unwrap();
        let body=format!("# 论文写作验收\n\n## 摘要\n\n中文文稿与图片由 Rust 保存，PDF 使用本机排版工具生成。\n\n## 结果\n\n| 项目 | 结果 |\n| --- | --- |\n| 中文正文 | 通过 |\n| 表格 | 通过 |\n\n![验收图片](paper-asset:{})\n\n## 参考文献\n\n[排版工具文档](https://pandoc.org)\n",asset["id"].as_str().unwrap());
        let snapshot = Snapshot {
            component: "writing".into(),
            revision: 1,
            state: serde_json::json!({"name":"论文写作验收","body":body}),
        };
        let result = render(&path, &snapshot).unwrap();
        assert!(result.starts_with(b"%PDF-"));
        let output = std::env::var_os("YUNFENG_PDF_TEST_OUTPUT")
            .map(PathBuf::from)
            .unwrap_or_else(|| dir.path().join("验收.pdf"));
        save(&output, &result).unwrap();
        assert!(output.is_file());
    }
    #[test]
    fn unsafe_html_and_image_paths_do_not_reach_renderer() {
        let html = safe_html(
            "<script>bad()</script>\n\n[文件](file:///secret)\n\n\\input{secret}",
            |_| Ok("image.png".into()),
        )
        .unwrap();
        assert!(!html.contains("<script>"));
        assert!(!html.contains("file:///"));
        assert!(safe_html("![图](https://example.test/image.png)", |_| Ok(
            "image.png".into()
        ))
        .is_err());
        assert!(safe_html("![图](../../secret)", |_| Ok("image.png".into())).is_err());
    }
    #[test]
    fn tables_and_registered_images_are_preserved() {
        let html = safe_html(
            "|项|值|\n|---|---|\n|一|二|\n\n![图](paper-asset:demo)",
            |_| Ok("figure-0.png".into()),
        )
        .unwrap();
        assert!(html.contains("<table>"));
        assert!(html.contains("src=\"figure-0.png\""));
        assert!(html.contains("<figcaption>图</figcaption>"));
    }
    #[test]
    fn atomic_save_replaces_only_after_success() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("saved.pdf");
        std::fs::write(&path, b"old").unwrap();
        save(&path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(save(&dir.path().join("missing/out.pdf"), b"pdf").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn deadline_stops_and_reaps_the_child() {
        let dir = tempfile::tempdir().unwrap();
        let mut command = Command::new("/bin/sleep");
        command.arg("30");
        assert_eq!(
            run(&mut command, dir.path(), Instant::now())
                .unwrap_err()
                .code,
            "EXPORT_TIMEOUT"
        );
    }
}
