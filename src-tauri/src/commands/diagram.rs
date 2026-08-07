use crate::formats::diagram::{
    analyze_mermaid_structure, update_mermaid_element, validate_mermaid_source, DiagramElementEdit,
    DiagramStructure, MAX_DIAGRAM_BYTES,
};
use crate::formats::text::TextDocumentError;
use crate::sanitize_filename;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::State;

const DEFAULT_SOURCE: &str =
    "flowchart LR\n    A[开始] --> B{判断}\n    B -->|是| C[执行]\n    B -->|否| D[结束]\n";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramDocument {
    pub path: String,
    pub content: String,
    pub signature: String,
}

#[tauri::command]
pub fn analyze_diagram_source(content: String) -> Result<DiagramStructure, String> {
    validate_mermaid_source(&content)?;
    Ok(analyze_mermaid_structure(&content))
}

#[tauri::command]
pub fn update_diagram_element(content: String, edit: DiagramElementEdit) -> Result<String, String> {
    update_mermaid_element(&content, &edit)
}

fn signature(path: &Path, bytes: &[u8]) -> Result<String, String> {
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    Ok(format!(
        "{}:{}:{:016x}",
        bytes.len(),
        modified,
        hasher.finish()
    ))
}

fn read_document(path: &Path) -> Result<DiagramDocument, String> {
    recover_interrupted_write(path)?;
    let bytes = fs::read(path).map_err(|error| format!("读取 Mermaid 文件失败: {}", error))?;
    if bytes.len() > MAX_DIAGRAM_BYTES {
        return Err("Mermaid 源码不能超过 2 MB".into());
    }
    let content =
        String::from_utf8(bytes.clone()).map_err(|_| "Mermaid 文件必须使用 UTF-8 编码")?;
    validate_mermaid_source(&content)?;
    Ok(DiagramDocument {
        path: path.to_string_lossy().into_owned(),
        signature: signature(path, &bytes)?,
        content,
    })
}

fn external_error(code: &str, message: impl Into<String>) -> TextDocumentError {
    TextDocumentError::simple(code, message.into())
}

fn ensure_mermaid_path(path: &Path) -> Result<(), TextDocumentError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "mmd" | "mermaid") {
        Ok(())
    } else {
        Err(external_error(
            "format-mismatch",
            "外部 Mermaid 文件必须使用 .mmd 或 .mermaid 扩展名",
        ))
    }
}

fn read_external_diagram_file_with_access(
    path: String,
    access: &ExternalFileAccess,
) -> Result<DiagramDocument, TextDocumentError> {
    let path = access
        .resolve_editable(path)
        .map_err(|error| external_error("external-not-authorized", error))?;
    ensure_mermaid_path(&path)?;
    read_document(&path).map_err(|error| external_error("external-diagram-read-failed", error))
}

async fn write_external_diagram_file_with_access(
    path: String,
    content: String,
    expected_signature: String,
    access: &ExternalFileAccess,
) -> Result<DiagramDocument, TextDocumentError> {
    validate_mermaid_source(&content)
        .map_err(|error| external_error("invalid-mermaid-source", error))?;
    let path = access
        .resolve_editable(path)
        .map_err(|error| external_error("external-not-authorized", error))?;
    ensure_mermaid_path(&path)?;
    if !path.is_file() {
        return Err(external_error(
            "external-file-missing",
            "外部 Mermaid 文件不存在",
        ));
    }
    let current = read_document(&path)
        .map_err(|error| external_error("external-diagram-read-failed", error))?;
    if current.signature != expected_signature {
        return Err(TextDocumentError::recoverable(
            "external-modified",
            "外部 Mermaid 文件已被其他程序修改",
            "Long编辑没有覆盖外部变化，请重新打开文件后再编辑",
        ));
    }
    write_utf8(&path, &content)
        .map_err(|error| external_error("external-diagram-write-failed", error))?;
    read_document(&path).map_err(|error| external_error("external-diagram-read-failed", error))
}

#[tauri::command]
pub async fn create_diagram_file(
    library_root: String,
    target_dir: Option<String>,
    prefix: Option<String>,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let directory = target_dir
        .map(|value| guard.resolve_directory(value, true))
        .transpose()?
        .unwrap_or_else(|| guard.root().to_path_buf());
    fs::create_dir_all(&directory).map_err(|error| format!("创建目录失败: {}", error))?;
    let base = sanitize_filename(&prefix.unwrap_or_else(|| "未命名图表".into()));
    if base.is_empty() {
        return Err("文件名不能为空".into());
    }
    let mut suffix = 0;
    let target = loop {
        let name = if suffix == 0 {
            format!("{}.mmd", base)
        } else {
            format!("{} {}.mmd", base, suffix)
        };
        let candidate = guard.resolve_file_for_write(directory.join(name), &["mmd", "mermaid"])?;
        if !candidate.exists() {
            break candidate;
        }
        suffix += 1;
    };
    write_utf8(&target, DEFAULT_SOURCE)?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_diagram_file(
    library_root: String,
    path: String,
) -> Result<DiagramDocument, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let path = guard.resolve_file_for_write(path, &["mmd", "mermaid"])?;
    if !path.is_file() {
        return Err("Mermaid 文件不存在".into());
    }
    read_document(&path)
}

#[tauri::command]
pub async fn read_external_diagram_file(
    path: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<DiagramDocument, TextDocumentError> {
    read_external_diagram_file_with_access(path, &access)
}

#[tauri::command]
pub async fn write_diagram_file(
    library_root: String,
    path: String,
    content: String,
    expected_signature: String,
) -> Result<DiagramDocument, String> {
    validate_mermaid_source(&content)?;
    let guard = WorkspaceGuard::new(&library_root)?;
    let path = guard.resolve_file_for_write(path, &["mmd", "mermaid"])?;
    if !path.is_file() {
        return Err("Mermaid 文件不存在".into());
    }
    let current = read_document(&path)?;
    if current.signature != expected_signature {
        return Err("Mermaid 文件已被其他程序修改，请重新加载后再保存".into());
    }
    write_utf8(&path, &content)?;
    read_document(&path)
}

#[tauri::command]
pub async fn write_external_diagram_file(
    path: String,
    content: String,
    expected_signature: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<DiagramDocument, TextDocumentError> {
    write_external_diagram_file_with_access(path, content, expected_signature, &access).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn workspace() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-diagram-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn creates_reads_writes_and_rejects_stale_source() {
        let root = workspace();
        let root_string = root.to_string_lossy().into_owned();
        let path = tauri::async_runtime::block_on(create_diagram_file(
            root_string.clone(),
            None,
            Some("流程".into()),
        ))
        .unwrap();
        let document =
            tauri::async_runtime::block_on(read_diagram_file(root_string.clone(), path.clone()))
                .unwrap();
        assert!(document.content.starts_with("flowchart"));
        let saved = tauri::async_runtime::block_on(write_diagram_file(
            root_string.clone(),
            path.clone(),
            "sequenceDiagram\n  A->>B: Hello\n".into(),
            document.signature.clone(),
        ))
        .unwrap();
        assert!(saved.content.starts_with("sequenceDiagram"));
        assert!(tauri::async_runtime::block_on(write_diagram_file(
            root_string,
            path,
            "flowchart LR\n  A --> B\n".into(),
            document.signature,
        ))
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_outside_workspace() {
        let root = workspace();
        let outside = root.parent().unwrap().join("outside.mmd");
        fs::write(&outside, DEFAULT_SOURCE).unwrap();
        assert!(tauri::async_runtime::block_on(read_diagram_file(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
        ))
        .is_err());
        fs::remove_file(outside).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn external_diagram_requires_authorization_and_preserves_conflicting_sources() {
        let root = workspace();
        let path = root.join("external.mmd");
        fs::write(&path, DEFAULT_SOURCE).unwrap();
        let path_string = path.to_string_lossy().into_owned();
        let access = ExternalFileAccess::default();

        let unauthorized =
            read_external_diagram_file_with_access(path_string.clone(), &access).unwrap_err();
        assert_eq!(unauthorized.code, "external-not-authorized");

        access.authorize_editable(&path).unwrap();
        let opened = read_external_diagram_file_with_access(path_string.clone(), &access).unwrap();
        let saved = tauri::async_runtime::block_on(write_external_diagram_file_with_access(
            path_string.clone(),
            "sequenceDiagram\n  A->>B: External saved\n".into(),
            opened.signature,
            &access,
        ))
        .unwrap();
        assert!(saved.content.contains("External saved"));

        fs::write(&path, "flowchart TD\n  Changed --> Outside\n").unwrap();
        let stale = tauri::async_runtime::block_on(write_external_diagram_file_with_access(
            path_string,
            "flowchart LR\n  Draft --> Local\n".into(),
            saved.signature,
            &access,
        ))
        .unwrap_err();
        assert_eq!(stale.code, "external-modified");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "flowchart TD\n  Changed --> Outside\n"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
