//! PDF 导出 IPC；保存路径只由原生对话框产生，最多接纳一个导出。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use super::{
    model::{authorize, error, Error},
    pdf, Runtime,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
pub struct ExportRuntime(pub Arc<AtomicBool>);
impl Default for ExportRuntime {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}
struct Permit(Arc<AtomicBool>);
impl Drop for Permit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
#[tauri::command]
pub async fn paper_export_pdf(
    window: WebviewWindow,
    runtime: State<'_, Runtime>,
    exporting: State<'_, ExportRuntime>,
    tool: Option<String>,
    format: Option<String>,
) -> Result<bool, Error> {
    authorize(window.label(), "writing")?;
    let tool = tool.unwrap_or_else(|| "writing".into());
    if !["writing", "analysis", "literature", "design"].contains(&tool.as_str()) {
        return Err(error("INVALID_STATE", "研究工具无效"));
    }
    let format = format.unwrap_or_else(|| "pdf".into());
    if !["pdf", "md", "zip", "docx"].contains(&format.as_str()) {
        return Err(error("INVALID_STATE", "导出格式无效"));
    }
    exporting
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| error("EXPORT_BUSY", "已有 PDF 导出，请等待完成"))?;
    let permit = Permit(exporting.0.clone());
    let store = runtime.0.clone();
    let path = runtime.1.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let snapshot = store
            .lock()
            .map_err(|_| error("STATE_ERROR", "文稿状态不可用"))?
            .get("writing")?;
        let mut document = snapshot.clone();
        document.state = super::document_export::selected(&snapshot, &tool);
        document.state["body"] = super::document_export::content(&snapshot, &tool).into();
        let name = document.state["name"].as_str().unwrap_or("文稿");
        let filename = name
            .chars()
            .filter(|c| !c.is_control() && !"/\\:*?\"<>|".contains(*c))
            .take(100)
            .collect::<String>();
        let filename = if filename.trim().is_empty() {
            "论文"
        } else {
            &filename
        };
        let Some(destination) = window
            .dialog()
            .file()
            .add_filter("文稿", &[&format])
            .set_file_name(format!("{filename}.{format}"))
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let destination = destination
            .into_path()
            .map_err(|_| error("EXPORT_FAILED", "请选择本地保存位置"))?;
        let bytes = if format == "pdf" {
            pdf::render(&path, &document)?
        } else {
            super::document_export::render(&path, &snapshot, &tool, &format)?
        };
        pdf::save(&destination, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|_| error("EXPORT_FAILED", "PDF 导出任务失败"))?
}
