use crate::formats::file_registry::{
    file_format_by_id, file_format_for_path, file_format_registry, FileFormatRegistry,
};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use crate::{sanitize_filename, FileContent};
use chardetng::EncodingDetector;
use std::fs;
use std::path::Path;

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

#[tauri::command]
pub fn get_file_format_registry() -> Result<FileFormatRegistry, String> {
    Ok(file_format_registry()?.clone())
}

#[tauri::command]
pub async fn read_text_document(
    library_root: String,
    path: String,
    format_id: String,
) -> Result<FileContent, String> {
    let format = ensure_capability(&format_id, "read")?;
    if format.adapters.reader.as_deref() != Some("text") {
        return Err(format!("{} 不是通用文本读取格式", format.label));
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let path = guard.resolve_existing(path)?;
    if !path.is_file() {
        return Err("目标必须是文件".into());
    }
    ensure_matching_format(&path, &format_id)?;
    recover_interrupted_write(&path)?;
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > format.max_bytes {
        return Err(format!(
            "{} 超过 {} 字节读取上限",
            format.label, format.max_bytes
        ));
    }
    let bytes = fs::read(&path).map_err(|error| format!("读取文件失败: {error}"))?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Ok(FileContent {
        content: text.into_owned(),
        encoding: encoding.name().to_string(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn write_text_document(
    library_root: String,
    path: String,
    format_id: String,
    content: String,
) -> Result<(), String> {
    let format = ensure_capability(&format_id, "edit")?;
    if format.adapters.writer.as_deref() != Some("text") {
        return Err(format!("{} 不是通用文本写入格式", format.label));
    }
    if content.len() as u64 > format.max_bytes {
        return Err(format!(
            "{} 超过 {} 字节写入上限",
            format.label, format.max_bytes
        ));
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let path = guard.resolve_for_write(path)?;
    ensure_matching_format(&path, &format_id)?;
    write_utf8(path, &content)
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
        ))
        .unwrap();
        assert!(loaded.content.contains("Generic adapter fixture"));
        tauri::async_runtime::block_on(write_text_document(
            root_string.clone(),
            path.clone(),
            "plain-text".into(),
            "second line".into(),
        ))
        .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second line");
        assert!(tauri::async_runtime::block_on(read_text_document(
            root_string,
            path,
            "markdown".into(),
        ))
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
