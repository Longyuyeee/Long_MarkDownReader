//! Read-only annotation snapshots and content-addressed PDF links. A note is
//! written only by the explicit new-note action, never by inserting into a draft.
use crate::formats::pdf_annotations::{
    validate_pdf_annotations, PdfAnnotation, PdfAnnotationDocument, MAX_ANNOTATION_FILE_BYTES,
};
use crate::services::{reliable_write::write_new_bytes, workspace_guard::WorkspaceGuard};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, io::Read, path::Path};

pub const MAX_READING_ANNOTATIONS: usize = 200;
const MAX_NOTE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingItem {
    pub annotation: PdfAnnotation,
    pub uri: String,
    pub label: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSnapshot {
    pub source_digest: String,
    pub source_signature: String,
    pub relative_path: String,
    pub items: Vec<ReadingItem>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedSource {
    pub source_digest: String,
    pub source_signature: String,
}

fn main_only(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("请在主工作台整理 PDF 阅读笔记".into())
    }
}
fn signature(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|t| t.as_nanos())
        .unwrap_or(0);
    format!("{}:{}", metadata.len(), modified)
}
fn digest(path: &Path) -> Result<VerifiedSource, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("无法读取 PDF 来源：{e}"))?;
    let before = file.metadata().map_err(|e| e.to_string())?;
    if before.len() == 0 || before.len() > super::pdf::MAX_PDF_DOCUMENT_BYTES {
        return Err("PDF 为空或超过 2 GiB".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > before.len() {
            return Err("PDF 在校验期间变化，请重新打开".into());
        }
        hash.update(&buffer[..n]);
    }
    let after = path.metadata().map_err(|e| e.to_string())?;
    if total != before.len() || signature(&before) != signature(&after) {
        return Err("PDF 在校验期间变化，请重新打开".into());
    }
    Ok(VerifiedSource {
        source_digest: format!("{:x}", hash.finalize()),
        source_signature: signature(&after),
    })
}
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

pub(crate) fn verify(
    root: &str,
    path: &str,
    expected: &str,
    expected_signature: Option<&str>,
) -> Result<VerifiedSource, String> {
    if !valid_digest(expected) {
        return Err("PDF 来源摘要无效".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let pdf = guard.resolve_existing_file(path, &["pdf"])?;
    let _lease = crate::services::document_coordination::acquire_existing_file(&pdf)?;
    let value = digest(&pdf)?;
    if !value.source_digest.eq_ignore_ascii_case(expected) {
        return Err("PDF 来源内容已被替换，未定位到旧批注；请核对原文件".into());
    }
    if expected_signature.is_some_and(|s| s != value.source_signature) {
        return Err("PDF 在阅读期间变化，请重新打开".into());
    }
    Ok(value)
}
pub(crate) fn snapshot(
    root: &str,
    path: &str,
    expected_signature: &str,
    ids: &[String],
) -> Result<ReadingSnapshot, String> {
    if ids.is_empty()
        || ids.len() > MAX_READING_ANNOTATIONS
        || ids.iter().collect::<HashSet<_>>().len() != ids.len()
    {
        return Err("每次请选择 1–200 条不重复批注".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let pdf = guard.resolve_existing_file(path, &["pdf"])?;
    let _lease = crate::services::document_coordination::acquire_existing_file(&pdf)?;
    let before = digest(&pdf)?;
    if before.source_signature != expected_signature {
        return Err("PDF 在阅读期间变化，请重新打开后整理".into());
    }
    let sidecar = pdf.with_file_name(format!(
        "{}.annotations.json",
        pdf.file_name().unwrap().to_string_lossy()
    ));
    // Reuse the workspace boundary for the companion, too: never follow a
    // malicious sidecar symlink outside this library.
    let sidecar = guard.resolve_existing_file(sidecar, &["json"])?;
    let mut bytes = Vec::new();
    fs::File::open(&sidecar)
        .map_err(|e| e.to_string())?
        .take(MAX_ANNOTATION_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_ANNOTATION_FILE_BYTES {
        return Err("PDF 批注文件超过 5 MiB".into());
    }
    let document: PdfAnnotationDocument =
        serde_json::from_slice(&bytes).map_err(|e| format!("批注记录损坏：{e}"))?;
    validate_pdf_annotations(&document)?;
    if document.source.pdf_file != pdf.file_name().unwrap().to_string_lossy() {
        return Err("批注与当前 PDF 不匹配".into());
    }
    let relative = pdf
        .strip_prefix(guard.root())
        .map_err(|_| "PDF 不在当前资料库")?
        .to_string_lossy()
        .replace('\\', "/");
    let mut items = Vec::new();
    let mut text_bytes = 0;
    for id in ids {
        let a = document
            .annotations
            .iter()
            .find(|a| &a.id == id)
            .ok_or("所选批注已被删除，请刷新列表")?;
        text_bytes += a.quote.len() + a.comment.len();
        if text_bytes > MAX_NOTE_BYTES / 2 {
            return Err("所选摘录和评论过大，请分批整理".into());
        }
        let uri = format!(
            "longedit://pdf?path={}&page={}&annotation={}&sha256={}",
            encode(&relative),
            a.page,
            encode(&a.id),
            before.source_digest
        );
        let label = format!("{} · 第 {} 页", document.source.pdf_file, a.page);
        items.push(ReadingItem {
            annotation: a.clone(),
            uri,
            label,
        });
    }
    let after = digest(&pdf)?;
    let mut after_bytes = Vec::new();
    let checked_sidecar = guard.resolve_existing_file(&sidecar, &["json"])?;
    fs::File::open(checked_sidecar)
        .map_err(|e| e.to_string())?
        .take(MAX_ANNOTATION_FILE_BYTES + 1)
        .read_to_end(&mut after_bytes)
        .map_err(|e| e.to_string())?;
    if after.source_digest != before.source_digest
        || after.source_signature != before.source_signature
        || after_bytes != bytes
    {
        return Err("PDF 或批注在整理期间变化，请重试".into());
    }
    Ok(ReadingSnapshot {
        source_digest: after.source_digest,
        source_signature: after.source_signature,
        relative_path: relative,
        items,
    })
}
pub(crate) fn save_new(
    root: &str,
    pdf: &str,
    expected: &str,
    target: &str,
    content: &str,
) -> Result<String, String> {
    if content.trim().is_empty() || content.len() > MAX_NOTE_BYTES {
        return Err("阅读笔记为空或超过 8 MiB".into());
    }
    verify(root, pdf, expected, None)?;
    let guard = WorkspaceGuard::new(root)?;
    let target = guard.resolve_for_write(target)?;
    if !target
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
    {
        return Err("阅读笔记请选择 .md 文件".into());
    }
    let _lease = crate::services::document_coordination::acquire(&[&target])?;
    // No overwrite, even when a native Save dialog offered replacement.
    if target.exists() {
        return Err("目标文件已存在，未覆盖；请选择新的笔记名称".into());
    }
    if let Err(error) = write_new_bytes(&target, content.as_bytes()) {
        // A promotion may have succeeded before a cleanup/receipt failure.
        // Acknowledge only these exact newly-authored bytes, never overwrite.
        if fs::read(&target).ok().as_deref() != Some(content.as_bytes()) {
            return Err(error);
        }
    }
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn build_pdf_reading_note(
    window: tauri::WebviewWindow,
    library_root: String,
    pdf_path: String,
    expected_signature: String,
    annotation_ids: Vec<String>,
) -> Result<ReadingSnapshot, String> {
    main_only(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        snapshot(
            &library_root,
            &pdf_path,
            &expected_signature,
            &annotation_ids,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn verify_pdf_reference(
    window: tauri::WebviewWindow,
    library_root: String,
    pdf_path: String,
    source_digest: String,
    expected_signature: Option<String>,
) -> Result<VerifiedSource, String> {
    main_only(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        verify(
            &library_root,
            &pdf_path,
            &source_digest,
            expected_signature.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_pdf_reading_note(
    window: tauri::WebviewWindow,
    library_root: String,
    pdf_path: String,
    source_digest: String,
    target_path: String,
    content: String,
) -> Result<String, String> {
    main_only(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        save_new(
            &library_root,
            &pdf_path,
            &source_digest,
            &target_path,
            &content,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "pdf_reading_tests.rs"]
mod tests;
