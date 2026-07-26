use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxReadReport {
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub signature: String,
    pub read_only: bool,
    pub model: DocxDocumentModel,
}

fn file_signature(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}:{modified}", metadata.len())
}

fn read_docx_path(path: &Path) -> Result<DocxReadReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 读取上限".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    let model = parse_docx(&source)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default();
    Ok(DocxReadReport {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified,
        signature: file_signature(&metadata),
        read_only: true,
        model,
    })
}

#[tauri::command]
pub async fn read_docx_document(
    library_root: String,
    path: String,
) -> Result<DocxReadReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || read_docx_path(&document))
        .await
        .map_err(|error| format!("DOCX 读取任务失败: {error}"))?
}
