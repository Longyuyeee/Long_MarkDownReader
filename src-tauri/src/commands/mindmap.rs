use crate::formats::canvas::validate_canvas_json;
use crate::formats::opml::{
    opml_to_canvas, parse_opml, serialize_opml, OpmlDocument, MAX_OPML_BYTES,
};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::fs;
use std::path::Path;

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
}
