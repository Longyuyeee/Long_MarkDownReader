use crate::formats::canvas::validate_canvas_json;
use crate::formats::opml::{
    opml_to_canvas, parse_opml, serialize_opml, opml_preservation_issues, OpmlDocument, MAX_OPML_BYTES,
};
use crate::formats::text::TextDocumentError;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_new_bytes, write_utf8};
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
    pub preservation_issues: Vec<String>,
}

fn signature(content: &str) -> String {
    format!("{:x}", md5::compute(content.as_bytes()))
}

fn require_preservable(content: &str) -> Result<(), String> {
    let issues = opml_preservation_issues(content)?;
    if issues.is_empty() { Ok(()) } else { Err(format!("原件不能无损保存，未覆盖；请另存兼容副本。{}", issues.join("；"))) }
}

fn serialize_preserving_model(document: &OpmlDocument) -> Result<(String, OpmlDocument), String> {
    let content = serialize_opml(document)?;
    let parsed = parse_opml(&content)?;
    if serde_json::to_value(document).map_err(|e|e.to_string())? != serde_json::to_value(&parsed).map_err(|e|e.to_string())? {
        return Err("当前主题含无法无损序列化的字段，未覆盖文件".into());
    }
    Ok((content, parsed))
}

fn read_validated(path: &Path) -> Result<(String, OpmlDocument), String> {
    let _document = crate::services::document_coordination::acquire_existing_file(path)?;
    read_validated_under_lease(path)
}

fn read_validated_under_lease(path: &Path) -> Result<(String, OpmlDocument), String> {
    crate::services::document_coordination::ensure_existing_file(path)?;
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
    let _document = crate::services::document_coordination::acquire_existing_file(file)
        .map_err(|error| external_error("document-unavailable", error))?;
    external_opml_file_under_lease(file)
}

fn external_opml_file_under_lease(file: &Path) -> Result<OpmlFile, TextDocumentError> {
    let (content, document) =
        read_validated_under_lease(file).map_err(|error| external_error("external-opml-read-failed", error))?;
    Ok(OpmlFile {
        path: file.to_string_lossy().into_owned(),
        signature: signature(&content),
        document,
        preservation_issues: opml_preservation_issues(&content).map_err(|e| external_error("opml-preservation-check-failed",e))?,
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
    let (content, _) = serialize_preserving_model(&document)
        .map_err(|error| external_error("invalid-opml-document", error))?;
    let file = resolve_external_opml(path, access)?;
    let _document = crate::services::document_coordination::acquire_existing_file(&file)
        .map_err(|error| external_error("document-unavailable", error))?;
    let (current, _) = read_validated_under_lease(&file)
        .map_err(|error| external_error("external-opml-read-failed", error))?;
    if signature(&current) != expected_signature {
        return Err(TextDocumentError::recoverable(
            "external-modified",
            "外部 OPML 文件已被其他程序修改",
            "Long编辑没有覆盖外部变化，请重新打开文件后再编辑",
        ));
    }
    require_preservable(&current).map_err(|e|external_error("opml-preservation-required",e))?;
    parse_opml(&content).map_err(|e|external_error("invalid-opml-document",e))?;
    write_utf8(&file, &content)
        .map_err(|error| external_error("external-opml-write-failed", error))?;
    external_opml_file_under_lease(&file)
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
            preservation_issues: opml_preservation_issues(&content)?,
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
        let _document = crate::services::document_coordination::acquire_existing_file(&file)?;
        let (current, _) = read_validated_under_lease(&file)?;
        if signature(&current) != expected_signature {
            return Err("OPML 已被其他程序修改，请重新加载后再保存".into());
        }
        require_preservable(&current)?;
        let (content, document) = serialize_preserving_model(&document)?;
        write_utf8(&file, &content)?;
        Ok(OpmlFile {
            path: file.to_string_lossy().into_owned(),
            signature: signature(&content),
            document,
            preservation_issues: opml_preservation_issues(&content)?,
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

fn save_opml_copy_with_access(
    library_root: String, path: String, external: bool, expected_signature: String,
    document: OpmlDocument, target_file_name: String, accept_loss: bool,
    access: &ExternalFileAccess,
) -> Result<OpmlFile, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = if external { resolve_external_opml(path, access).map_err(|e|e.message)? }
        else { guard.resolve_existing_file(path, &["opml"])? };
    crate::commands::files::validate_item_name(&target_file_name)?;
    if target_file_name.is_empty() || target_file_name.chars().count() > 240
        || target_file_name.contains(['/', '\\']) || crate::sanitize_filename(&target_file_name) != target_file_name
        || !target_file_name.to_lowercase().ends_with(".opml") {
        return Err("副本名称须为有效的 .opml 文件名，不能包含目录".into());
    }
    // Authorization of one external file never authorizes creating siblings.
    let parent = if external { guard.root() } else { source.parent().ok_or("原件缺少父目录")? };
    let target = guard.resolve_file_for_write(parent.join(&target_file_name), &["opml"])?;
    if source == target { return Err("副本不能覆盖原件，请使用其他名称".into()); }
    let _lease = crate::services::document_coordination::acquire(&[&source, &target])?;
    let (original, _) = read_validated_under_lease(&source)?;
    if signature(&original) != expected_signature { return Err("原件已被其他程序修改，未创建副本；请保留草稿并核对".into()); }
    let issues = opml_preservation_issues(&original)?;
    if !issues.is_empty() && !accept_loss { return Err("请先确认兼容副本不能保留的 XML 扩展；未创建文件".into()); }
    let content = serialize_opml(&document)?;
    let parsed = parse_opml(&content)?;
    if !opml_preservation_issues(&content)?.is_empty() { return Err("兼容副本内容无效，未创建文件".into()); }
    // create_new is the final race-safe guard; never replace an existing copy.
    write_new_bytes(&target, content.as_bytes())?;
    let saved = fs::read_to_string(&target).map_err(|e|format!("副本已创建于 {}，但读取核对失败：{e}；原件和草稿保留",target.display()))?;
    if saved != content || fs::read_to_string(&source).map_err(|e|e.to_string())? != original {
        return Err(format!("副本已创建于 {}，但核对未通过；请保留草稿并检查文件",target.display()));
    }
    Ok(OpmlFile { path: target.to_string_lossy().into_owned(), signature: signature(&saved), document: parsed, preservation_issues: Vec::new() })
}

#[tauri::command]
pub async fn save_opml_compatible_copy(
    library_root: String, path: String, external: bool, expected_signature: String,
    document: OpmlDocument, target_file_name: String, accept_loss: bool,
    access: State<'_, ExternalFileAccess>,
) -> Result<OpmlFile, String> {
    save_opml_copy_with_access(library_root, path, external, expected_signature, document, target_file_name, accept_loss, &access)
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
    let _directory = crate::services::document_coordination::acquire(&[parent])?;
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
    write_new_bytes(&target, content.as_bytes())?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const FIXTURE: &str = include_str!("../../tests/fixtures/formats/mindmap.opml");

    #[test]
    fn v1119_opml_copy_requires_loss_acknowledgment_never_overwrites_and_retains_source() {
        let fixture = crate::services::test_workspace::TestWorkspace::new();
        let source = fixture.0.join("扩展.opml");
        let original = FIXTURE.replace("<head>","<head><!--必须保留的源注释-->").replace("</head>","<vendor:state xmlns:vendor=\"urn:vendor\">保密扩展</vendor:state></head>");
        fs::write(&source,&original).unwrap();
        let access = ExternalFileAccess::default();
        let opened = tauri::async_runtime::block_on(read_opml_file(fixture.root(),source.to_string_lossy().into_owned())).unwrap();
        assert!(!opened.preservation_issues.is_empty());
        assert!(tauri::async_runtime::block_on(write_opml_file(fixture.root(),opened.path.clone(),opened.signature.clone(),opened.document.clone())).is_err());
        let mut draft = opened.document.clone(); draft.roots[0].note = "保留我的草稿".into();
        let copy = |name:&str,ack| save_opml_copy_with_access(fixture.root(),opened.path.clone(),false,opened.signature.clone(),draft.clone(),name.into(),ack,&access);
        assert!(copy("兼容副本.opml",false).is_err());
        assert!(!fixture.0.join("兼容副本.opml").exists());
        for name in ["../逃逸.opml","CON.opml","file.txt"," bad.opml"] { assert!(copy(name,true).is_err(),"invalid name {name}"); }
        let saved = copy("兼容副本.opml",true).unwrap();
        assert_eq!(saved.document.roots[0].note,"保留我的草稿");
        assert!(saved.preservation_issues.is_empty());
        let copied = fs::read(&saved.path).unwrap();
        assert!(copy("兼容副本.opml",true).is_err());
        assert_eq!(fs::read(&saved.path).unwrap(),copied);
        assert_eq!(fs::read_to_string(&source).unwrap(),original);
        fs::write(&source,original.replace("产品知识图谱","其他窗口的内容")).unwrap();
        assert!(copy("过期副本.opml",true).is_err());
        assert!(!fixture.0.join("过期副本.opml").exists());
    }

    #[test]
    fn v1119_opml_external_copy_creates_only_inside_authorized_library_and_respects_leases() {
        let source = crate::services::test_workspace::TestWorkspace::new();
        let library = crate::services::test_workspace::TestWorkspace::new();
        let path = source.0.join("external.opml"); fs::write(&path,FIXTURE).unwrap();
        let access = ExternalFileAccess::default(); access.authorize_editable(&path).unwrap();
        let opened = read_external_opml_file_with_access(path.to_string_lossy().into_owned(),&access).unwrap();
        let copy = || save_opml_copy_with_access(library.root(),opened.path.clone(),true,opened.signature.clone(),opened.document.clone(),"copy.opml".into(),false,&access);
        let lease = crate::services::document_coordination::acquire(&[&source.0]).unwrap();
        assert!(copy().is_err()); drop(lease);
        let saved = copy().unwrap(); assert!(Path::new(&saved.path).starts_with(&library.0));
        assert!(!source.0.join("copy.opml").exists());
        assert_eq!(fs::read_to_string(path).unwrap(),FIXTURE);
    }

    #[test]
    fn v1119_opml_head_cdata_entities_empty_metadata_and_extensions_are_accounted_for() {
        let source = "<opml version=\"2.0\"><head><title><![CDATA[资料 & ]]>&lt;计划&gt;</title><ownerName> 保留空白 </ownerName><empty/></head><body><outline text=\"主题\"/></body></opml>";
        let parsed = parse_opml(source).unwrap();
        assert_eq!(parsed.title,"资料 & <计划>"); assert_eq!(parsed.metadata["ownerName"]," 保留空白 "); assert_eq!(parsed.metadata["empty"],"");
        assert!(opml_preservation_issues(source).unwrap().is_empty());
        let (_,roundtrip) = serialize_preserving_model(&parsed).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(),serde_json::to_value(roundtrip).unwrap());
        let split_long = format!("<opml><head><ownerName>{}<![CDATA[{}]]></ownerName></head><body><outline text=\"a\"/></body></opml>","a".repeat(3000),"b".repeat(2000));
        assert!(!opml_preservation_issues(&split_long).unwrap().is_empty());
        for source in [source.replace("<body>","<head/><body>"),source.replace("text=\"主题\"","text=\"主题\" _collapsed=\"maybe\""),source.replace("text=\"主题\"","text=\"主题\" extra:state=\"x\"")] {
            assert!(!opml_preservation_issues(&source).unwrap().is_empty());
        }
        let mut invalid = parse_opml(FIXTURE).unwrap(); invalid.roots[0].attributes.insert("vendor:state".into(),"must-not-drop".into());
        assert!(serialize_preserving_model(&invalid).is_err());
    }

    #[test]
    fn specialized_external_opml_shares_move_protection_and_releases_after_failure() {
        let root = std::env::temp_dir().join(format!("longedit-opml-move-{}-{}",
            std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        let path = root.join("external.opml");
        fs::write(&path, FIXTURE).unwrap();
        let access = ExternalFileAccess::default();
        access.authorize_editable(&path).unwrap();
        let input = path.to_string_lossy().into_owned();
        let opened = read_external_opml_file_with_access(input.clone(), &access).unwrap();
        let moving = crate::services::document_coordination::acquire(&[&root]).unwrap();
        assert!(read_external_opml_file_with_access(input.clone(), &access).is_err());
        assert!(write_external_opml_file_with_access(input.clone(), opened.signature.clone(), opened.document.clone(), &access).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), FIXTURE);
        drop(moving);
        let saved = write_external_opml_file_with_access(input, opened.signature, opened.document, &access).unwrap();
        assert_eq!(saved.document.title, "产品知识图谱");
        fs::remove_dir_all(root).unwrap();
    }

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
        let source_before_projection = fs::read(&path).unwrap();
        let canvas = tauri::async_runtime::block_on(create_canvas_from_opml(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(Path::new(&canvas).is_file());
        assert_eq!(
            Path::new(&canvas).file_name().and_then(|value| value.to_str()),
            Some("map 画布.canvas")
        );
        let numbered_canvas = tauri::async_runtime::block_on(create_canvas_from_opml(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(
            Path::new(&numbered_canvas)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("map 画布 1.canvas")
        );
        let projected: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&canvas).unwrap()).unwrap();
        assert_eq!(projected["nodes"].as_array().unwrap().len(), 5);
        assert_eq!(projected["edges"].as_array().unwrap().len(), 4);
        assert!(projected["nodes"].as_array().unwrap().iter().any(|node| {
            node["id"] == "opml-graph" && node["text"] == "知识图谱\n\n增强关系发现"
        }));
        assert!(projected.get("metadata").is_none());
        assert!(projected["nodes"].as_array().unwrap().iter().all(|node| {
            node.get("attributes").is_none() && node.get("collapsed").is_none()
        }));
        assert_eq!(fs::read(&path).unwrap(), source_before_projection);
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
