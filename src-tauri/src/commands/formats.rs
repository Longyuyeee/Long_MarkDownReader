use crate::formats::file_registry::{
    file_format_by_id, file_format_for_path, file_format_registry, FileFormatRegistry,
};
use crate::formats::text::{
    encode_text_for_save, read_text_range_with_options, read_text_snapshot,
    read_text_snapshot_with_options, verify_current_signature, TextDocumentError,
    TextDocumentRangeSnapshot, TextDocumentSnapshot, TextReadOptions, TextSavePolicy,
    DEFAULT_TEXT_RANGE_BYTES,
};
use crate::sanitize_filename;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use std::fs;
use std::path::Path;
use tauri::State;

fn ensure_capability(
    format_id: &str,
    capability: &str,
) -> Result<&'static crate::formats::file_registry::FileFormatDefinition, String> {
    let format = file_format_by_id(format_id)?;
    let supported = match capability {
        "read" => format.capabilities.read.is_supported(),
        "edit" => format.capabilities.edit.is_supported(),
        "create" => format.capabilities.create.is_supported(),
        _ => false,
    };
    supported
        .then_some(format)
        .ok_or_else(|| format!("{} 不支持 {capability} 能力", format.label))
}

fn ensure_matching_format(path: &Path, format_id: &str) -> Result<(), String> {
    let actual = file_format_for_path(path)?;
    if actual.id == format_id {
        Ok(())
    } else {
        Err(format!(
            "文件扩展名属于 {}，与请求格式 {format_id} 不一致",
            actual.id
        ))
    }
}

fn text_boundary_error(code: &str, message: impl Into<String>) -> TextDocumentError {
    TextDocumentError::simple(code, message.into())
}

fn read_resolved_text_document(
    path: &Path,
    format: &crate::formats::file_registry::FileFormatDefinition,
    read_options: Option<TextReadOptions>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    recover_interrupted_write(path)
        .map_err(|error| text_boundary_error("recovery-failed", error))?;
    let metadata = path
        .metadata()
        .map_err(|error| text_boundary_error("metadata-read-failed", error.to_string()))?;
    if metadata.len() > format.max_bytes {
        return Err(TextDocumentError::recoverable(
            "read-too-large",
            format!("{} 超过 {} 字节读取上限", format.label, format.max_bytes),
            "使用大文件只读范围模式打开，或在外部工具中拆分文件",
        ));
    }
    read_text_snapshot_with_options(path, read_options)
}

fn read_resolved_text_document_range(
    path: &Path,
    offset: u64,
    length: Option<u64>,
    read_options: Option<TextReadOptions>,
) -> Result<TextDocumentRangeSnapshot, TextDocumentError> {
    recover_interrupted_write(path)
        .map_err(|error| text_boundary_error("recovery-failed", error))?;
    read_text_range_with_options(
        path,
        offset,
        length.unwrap_or(DEFAULT_TEXT_RANGE_BYTES),
        read_options,
    )
}

fn write_resolved_text_document(
    path: &Path,
    format: &crate::formats::file_registry::FileFormatDefinition,
    content: String,
    expected_signature: Option<String>,
    save_policy: Option<TextSavePolicy>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    if content.len() as u64 > format.max_bytes {
        return Err(TextDocumentError::recoverable(
            "write-too-large",
            format!("{} 超过 {} 字节写入上限", format.label, format.max_bytes),
            "减少文本内容，或等待大文件范围写入能力完成后再处理",
        ));
    }
    recover_interrupted_write(path)
        .map_err(|error| text_boundary_error("recovery-failed", error))?;
    let snapshot = read_text_snapshot(path)?;
    if let Some(reason) = snapshot.read_only_reason.as_deref() {
        return Err(TextDocumentError::recoverable(
            "read-only",
            format!("文本文件只读，无法覆盖保存: {reason}"),
            "调整文件权限，或另存为可写副本",
        ));
    }
    let mut policy = save_policy.unwrap_or(TextSavePolicy {
        expected_signature: None,
        encoding: None,
        bom: None,
        line_ending: None,
        has_final_newline: None,
    });
    if policy.expected_signature.is_none() {
        policy.expected_signature = expected_signature;
    }
    let encoded = encode_text_for_save(&snapshot, &content, policy)?;
    if encoded.bytes.len() as u64 > format.max_bytes {
        return Err(TextDocumentError::recoverable(
            "encoded-write-too-large",
            format!("{} 超过 {} 字节写入上限", format.label, format.max_bytes),
            "选择更紧凑的编码或减少文本内容",
        ));
    }
    verify_current_signature(path, encoded.expected_signature.as_deref())?;
    write_bytes(path, &encoded.bytes)
        .map_err(|error| text_boundary_error("write-failed", error))?;
    let saved = read_text_snapshot_with_options(
        path,
        Some(TextReadOptions {
            encoding: Some(encoded.encoding.clone()),
        }),
    )
    .or_else(|_| read_text_snapshot(path))?;
    if saved.content != encoded.normalized_content {
        return Err(TextDocumentError::recoverable(
            "post-write-verify-failed",
            "文本保存后重读验证失败，请检查编码或磁盘状态",
            "请重新加载文件并检查磁盘状态后再保存",
        ));
    }
    Ok(saved)
}

#[tauri::command]
pub fn get_file_format_registry() -> Result<FileFormatRegistry, String> {
    Ok(file_format_registry()?.clone())
}

#[tauri::command]
pub async fn read_text_document(
    library_root: String,
    path: String,
    format_id: String,
    read_options: Option<TextReadOptions>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "read")
        .map_err(|error| text_boundary_error("format-read-unsupported", error))?;
    if format.adapters.reader.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本读取格式", format.label),
        ));
    }
    let guard = WorkspaceGuard::new(library_root)
        .map_err(|error| text_boundary_error("workspace-root-invalid", error))?;
    let path = guard
        .resolve_existing(path)
        .map_err(|error| text_boundary_error("path-outside-workspace", error))?;
    if !path.is_file() {
        return Err(text_boundary_error("target-not-file", "目标必须是文件"));
    }
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    read_resolved_text_document(&path, format, read_options)
}

#[tauri::command]
pub async fn read_text_document_range(
    library_root: String,
    path: String,
    format_id: String,
    offset: u64,
    length: Option<u64>,
    read_options: Option<TextReadOptions>,
) -> Result<TextDocumentRangeSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "read")
        .map_err(|error| text_boundary_error("format-read-unsupported", error))?;
    if format.adapters.reader.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本读取格式", format.label),
        ));
    }
    let guard = WorkspaceGuard::new(library_root)
        .map_err(|error| text_boundary_error("workspace-root-invalid", error))?;
    let path = guard
        .resolve_existing(path)
        .map_err(|error| text_boundary_error("path-outside-workspace", error))?;
    if !path.is_file() {
        return Err(text_boundary_error("target-not-file", "目标必须是文件"));
    }
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    read_resolved_text_document_range(&path, offset, length, read_options)
}

pub(crate) async fn write_registered_text_document(
    library_root: String,
    path: String,
    format_id: String,
    content: String,
    expected_signature: Option<String>,
    save_policy: Option<TextSavePolicy>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "edit")
        .map_err(|error| text_boundary_error("format-edit-unsupported", error))?;
    if format.adapters.writer.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本写入格式", format.label),
        ));
    }
    let guard = WorkspaceGuard::new(library_root)
        .map_err(|error| text_boundary_error("workspace-root-invalid", error))?;
    let path = guard
        .resolve_for_write(path)
        .map_err(|error| text_boundary_error("path-outside-workspace", error))?;
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    write_resolved_text_document(&path, format, content, expected_signature, save_policy)
}

#[tauri::command]
pub async fn write_text_document(
    library_root: String,
    path: String,
    format_id: String,
    content: String,
    expected_signature: Option<String>,
    save_policy: Option<TextSavePolicy>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    if matches!(format_id.as_str(), "json" | "jsonc") {
        return Err(TextDocumentError::simple(
            "specialized-writer-required",
            "JSON/JSONC 必须通过专用保存命令执行语法门禁",
        ));
    }
    write_registered_text_document(
        library_root,
        path,
        format_id,
        content,
        expected_signature,
        save_policy,
    )
    .await
}

#[tauri::command]
pub async fn read_external_text_document(
    path: String,
    format_id: String,
    read_options: Option<TextReadOptions>,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "read")
        .map_err(|error| text_boundary_error("format-read-unsupported", error))?;
    if format.adapters.reader.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本读取格式", format.label),
        ));
    }
    let path = access
        .resolve_editable(path)
        .map_err(|error| text_boundary_error("external-not-authorized", error))?;
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    read_resolved_text_document(&path, format, read_options)
}

#[tauri::command]
pub async fn read_external_text_document_range(
    path: String,
    format_id: String,
    offset: u64,
    length: Option<u64>,
    read_options: Option<TextReadOptions>,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentRangeSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "read")
        .map_err(|error| text_boundary_error("format-read-unsupported", error))?;
    if format.adapters.reader.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本读取格式", format.label),
        ));
    }
    let path = access
        .resolve_editable(path)
        .map_err(|error| text_boundary_error("external-not-authorized", error))?;
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    read_resolved_text_document_range(&path, offset, length, read_options)
}

#[tauri::command]
pub async fn write_external_text_document(
    path: String,
    format_id: String,
    content: String,
    expected_signature: Option<String>,
    save_policy: Option<TextSavePolicy>,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let format = ensure_capability(&format_id, "edit")
        .map_err(|error| text_boundary_error("format-edit-unsupported", error))?;
    if format.adapters.writer.as_deref() != Some("text") {
        return Err(text_boundary_error(
            "adapter-mismatch",
            format!("{} 不是通用文本写入格式", format.label),
        ));
    }
    let path = access
        .resolve_editable(path)
        .map_err(|error| text_boundary_error("external-not-authorized", error))?;
    ensure_matching_format(&path, &format_id)
        .map_err(|error| text_boundary_error("format-mismatch", error))?;
    write_resolved_text_document(&path, format, content, expected_signature, save_policy)
}

#[tauri::command]
pub async fn create_format_file(
    library_root: String,
    target_dir: Option<String>,
    format_id: String,
    prefix: Option<String>,
    content: Option<String>,
) -> Result<String, String> {
    let format = ensure_capability(&format_id, "create")?;
    if !matches!(
        format.adapters.creator.as_deref(),
        Some("text" | "text-template")
    ) {
        return Err(format!("{} 需要专用创建适配器", format.label));
    }
    let creation = format
        .creation
        .as_ref()
        .ok_or_else(|| format!("{} 缺少创建契约", format.label))?;
    let guard = WorkspaceGuard::new(&library_root)?;
    let directory = match target_dir {
        Some(path) => guard.resolve_for_write(path)?,
        None => guard.root().to_path_buf(),
    };
    if !directory.exists() {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    }
    if !directory.is_dir() {
        return Err("创建目标必须是目录".into());
    }
    let base_name = sanitize_filename(&prefix.unwrap_or_else(|| creation.default_name.clone()));
    if base_name.is_empty() {
        return Err("文件名不能为空".into());
    }
    let body = content
        .or_else(|| creation.default_content.clone())
        .unwrap_or_default();
    if body.len() as u64 > format.max_bytes {
        return Err(format!("{} 模板超过大小限制", format.label));
    }
    let mut index = 0;
    let path = loop {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!(" {index}")
        };
        let candidate =
            directory.join(format!("{base_name}{suffix}{}", creation.default_extension));
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    let path = guard.resolve_for_write(path)?;
    ensure_matching_format(&path, &format_id)?;
    write_utf8(&path, &body)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn plain_text_adapter_creates_reads_writes_and_rejects_format_spoofing() {
        let root = std::env::temp_dir().join(format!(
            "longedit-format-adapter-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root_string = root.to_string_lossy().into_owned();
        let path = tauri::async_runtime::block_on(create_format_file(
            root_string.clone(),
            None,
            "plain-text".into(),
            Some("adapter fixture".into()),
            Some(include_str!("../../tests/fixtures/formats/plain-text.txt").into()),
        ))
        .unwrap();
        assert!(path.ends_with("adapter fixture.txt"));
        let loaded = tauri::async_runtime::block_on(read_text_document(
            root_string.clone(),
            path.clone(),
            "plain-text".into(),
            None,
        ))
        .unwrap();
        assert!(loaded.content.contains("Generic adapter fixture"));
        let saved = tauri::async_runtime::block_on(write_text_document(
            root_string.clone(),
            path.clone(),
            "plain-text".into(),
            "second line".into(),
            Some(loaded.signature.clone()),
            None,
        ))
        .unwrap();
        assert_ne!(saved.signature, loaded.signature);
        assert_eq!(fs::read_to_string(&path).unwrap(), "second line\r\n");
        assert!(tauri::async_runtime::block_on(read_text_document(
            root_string,
            path,
            "markdown".into(),
            None,
        ))
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn yaml_template_creation_uses_registered_extension_and_valid_source() {
        let root = std::env::temp_dir().join(format!(
            "longedit-yaml-create-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let root_string = root.to_string_lossy().into_owned();
        let path = tauri::async_runtime::block_on(create_format_file(
            root_string,
            None,
            "yaml".into(),
            None,
            None,
        ))
        .unwrap();
        assert!(path.ends_with("未命名配置.yaml"));
        let content = fs::read_to_string(&path).unwrap();
        assert!(crate::formats::yaml::analyze_yaml_source(&content).valid);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn plain_text_adapter_reads_bounded_ranges() {
        let root = std::env::temp_dir().join(format!(
            "longedit-format-range-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("large.txt");
        fs::write(&path, "alpha 中文 beta\nsecond line\n").unwrap();
        let first = tauri::async_runtime::block_on(read_text_document_range(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "plain-text".into(),
            0,
            Some(10),
            None,
        ))
        .unwrap();
        assert_eq!(first.offset, 0);
        assert!(first.next_offset <= 10);
        assert!(!first.eof);
        fs::remove_dir_all(root).unwrap();
    }
}
