use crate::formats::canvas::validate_canvas_json;
use crate::formats::opml::{
    opml_to_canvas, parse_opml, serialize_opml, OpmlDocument, MAX_OPML_BYTES,
};
use crate::formats::text::TextDocumentError;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpmlFile {
    pub path: String,
    pub signature: String,
    pub document: OpmlDocument,
}

fn signature(content: &str) -> String {
    format!("{:x}", md5::compute(content.as_bytes()))
}

fn read_validated(path: &Path) -> Result<(String, OpmlDocument), String> {
    recover_interrupted_write(path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 OPML 元数据失败: {error}"))?;
    if metadata.len() > MAX_OPML_BYTES as u64 {
        return Err("OPML 文件不能超过 8 MB".into());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取 OPML 失败: {error}"))?;
    let document = parse_opml(&content)?;
    Ok((content, document))
}

fn external_error(code: &str, message: impl Into<String>) -> TextDocumentError {
    TextDocumentError::simple(code, message.into())
}

fn resolve_external_opml(
    path: String,
    access: &ExternalFileAccess,
) -> Result<std::path::PathBuf, TextDocumentError> {
    let file = access
        .resolve_editable(path)
        .map_err(|error| external_error("external-not-authorized", error))?;
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("opml") {
        return Err(external_error(
            "format-mismatch",
            "外部思维导图必须使用 .opml 扩展名",
        ));
    }
    Ok(file)
}

fn external_opml_file(file: &Path) -> Result<OpmlFile, TextDocumentError> {
    let (content, document) =
        read_validated(file).map_err(|error| external_error("external-opml-read-failed", error))?;
    Ok(OpmlFile {
        path: file.to_string_lossy().into_owned(),
        signature: signature(&content),
        document,
    })
}

fn read_external_opml_file_with_access(
    path: String,
    access: &ExternalFileAccess,
) -> Result<OpmlFile, TextDocumentError> {
    let file = resolve_external_opml(path, access)?;
    external_opml_file(&file)
}

fn write_external_opml_file_with_access(
    path: String,
    expected_signature: String,
    document: OpmlDocument,
    access: &ExternalFileAccess,
) -> Result<OpmlFile, TextDocumentError> {
    let content = serialize_opml(&document)
        .map_err(|error| external_error("invalid-opml-document", error))?;
    let file = resolve_external_opml(path, access)?;
    let (current, _) = read_validated(&file)
        .map_err(|error| external_error("external-opml-read-failed", error))?;
    if signature(&current) != expected_signature {
        return Err(TextDocumentError::recoverable(
            "external-modified",
            "外部 OPML 文件已被其他程序修改",
            "Long编辑没有覆盖外部变化，请重新打开文件后再编辑",
        ));
    }
    write_utf8(&file, &content)
        .map_err(|error| external_error("external-opml-write-failed", error))?;
    external_opml_file(&file)
}

#[tauri::command]
pub async fn read_opml_file(library_root: String, path: String) -> Result<OpmlFile, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["opml"])?;
    tauri::async_runtime::spawn_blocking(move || {
        let (content, document) = read_validated(&file)?;
        Ok(OpmlFile {
            path: file.to_string_lossy().into_owned(),
            signature: signature(&content),
            document,
        })
    })
    .await
    .map_err(|error| format!("OPML 读取任务失败: {error}"))?
}

#[tauri::command]
pub async fn read_external_opml_file(
    path: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<OpmlFile, TextDocumentError> {
    read_external_opml_file_with_access(path, &access)
}

#[tauri::command]
pub async fn write_opml_file(
    library_root: String,
    path: String,
    expected_signature: String,
    document: OpmlDocument,
) -> Result<OpmlFile, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["opml"])?;
    tauri::async_runtime::spawn_blocking(move || {
        let (current, _) = read_validated(&file)?;
        if signature(&current) != expected_signature {
            return Err("OPML 已被其他程序修改，请重新加载后再保存".into());
        }
        let content = serialize_opml(&document)?;
        write_utf8(&file, &content)?;
        Ok(OpmlFile {
            path: file.to_string_lossy().into_owned(),
            signature: signature(&content),
            document,
        })
    })
    .await
    .map_err(|error| format!("OPML 写入任务失败: {error}"))?
}

#[tauri::command]
pub async fn write_external_opml_file(
    path: String,
    expected_signature: String,
    document: OpmlDocument,
    access: State<'_, ExternalFileAccess>,
) -> Result<OpmlFile, TextDocumentError> {
    write_external_opml_file_with_access(path, expected_signature, document, &access)
}

#[tauri::command]
pub async fn create_canvas_from_opml(library_root: String, path: String) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let file = guard.resolve_existing_file(path, &["opml"])?;
    let relative = file
        .strip_prefix(guard.root())
        .unwrap_or(&file)
        .to_string_lossy()
        .replace('\\', "/");
    let (_, document) = read_validated(&file)?;
    let canvas = opml_to_canvas(&document, &relative);
    let content = serde_json::to_string_pretty(&canvas)
        .map_err(|error| format!("生成 Canvas 失败: {error}"))?
        + "\n";
    validate_canvas_json(&content)?;
    let parent = file.parent().ok_or("OPML 文件缺少父目录")?;
    let stem = file
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("思维导图");
    let mut index = 0usize;
    let target = loop {
        let name = if index == 0 {
            format!("{stem} 画布.canvas")
        } else {
            format!("{stem} 画布 {index}.canvas")
        };
        let candidate = guard.resolve_file_for_write(parent.join(name), &["canvas"])?;
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    write_utf8(&target, &content)?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const FIXTURE: &str = include_str!("../../tests/fixtures/formats/mindmap.opml");

    #[test]
    fn opml_round_trip_preserves_tree_metadata_and_projects_to_canvas() {
        let document = parse_opml(FIXTURE).unwrap();
        assert_eq!(document.title, "产品知识图谱");
        assert_eq!(document.roots[0].children.len(), 2);
        assert_eq!(
            document.roots[0]
                .attributes
                .get("category")
                .map(String::as_str),
            Some("product")
        );
        let serialized = serialize_opml(&document).unwrap();
        let reparsed = parse_opml(&serialized).unwrap();
        assert_eq!(
            reparsed.roots[0].children[1].children[0].text,
            "OPML 思维导图"
        );
        assert!(reparsed.roots[0].children[1].collapsed);
        let canvas = serde_json::to_string(&opml_to_canvas(&reparsed, "mindmap.opml")).unwrap();
        validate_canvas_json(&canvas).unwrap();
    }

    #[test]
    fn opml_parser_rejects_document_type_declarations() {
        let content = r#"<?xml version="1.0"?>
<!DOCTYPE opml [<!ENTITY example "expanded">]>
<opml version="2.0"><head><title>&example;</title></head><body><outline text="Root" /></body></opml>"#;
        assert!(parse_opml(content).is_err());
    }

    #[test]
    fn commands_reject_stale_writes_and_create_canvas_projection() {
        let base = std::env::temp_dir().join(format!(
            "longedit-opml-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("map.opml");
        fs::write(&path, FIXTURE).unwrap();
        let opened = tauri::async_runtime::block_on(read_opml_file(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        fs::write(&path, FIXTURE.replace("产品知识图谱", "外部修改")).unwrap();
        let error = tauri::async_runtime::block_on(write_opml_file(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            opened.signature,
            opened.document,
        ))
        .unwrap_err();
        assert!(error.contains("其他程序修改"));
        let canvas = tauri::async_runtime::block_on(create_canvas_from_opml(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(Path::new(&canvas).is_file());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn external_opml_requires_authorization_preserves_metadata_and_rejects_conflicts() {
        let base = std::env::temp_dir().join(format!(
            "longedit-external-opml-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("external.opml");
        fs::write(&path, FIXTURE).unwrap();
        let path_string = path.to_string_lossy().into_owned();
        let access = ExternalFileAccess::default();

        let unauthorized =
            read_external_opml_file_with_access(path_string.clone(), &access).unwrap_err();
        assert_eq!(unauthorized.code, "external-not-authorized");

        access.authorize_editable(&path).unwrap();
        let mut opened = read_external_opml_file_with_access(path_string.clone(), &access).unwrap();
        opened.document.title = "外部 OPML 已保存".into();
        let saved = write_external_opml_file_with_access(
            path_string.clone(),
            opened.signature,
            opened.document,
            &access,
        )
        .unwrap();
        assert_eq!(saved.document.title, "外部 OPML 已保存");
        assert_eq!(
            saved.document.roots[0]
                .attributes
                .get("category")
                .map(String::as_str),
            Some("product")
        );

        let external_change = FIXTURE.replace("产品知识图谱", "其他程序修改");
        fs::write(&path, &external_change).unwrap();
        let stale = write_external_opml_file_with_access(
            path_string,
            saved.signature,
            saved.document,
            &access,
        )
        .unwrap_err();
        assert_eq!(stale.code, "external-modified");
        assert_eq!(fs::read_to_string(&path).unwrap(), external_change);
        fs::remove_dir_all(base).unwrap();
    }
}
