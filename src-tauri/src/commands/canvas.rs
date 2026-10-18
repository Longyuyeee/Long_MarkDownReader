use crate::commands::graph::resolve_local_graph_center;
use crate::formats::canvas::{markdown_outline_to_canvas, validate_canvas_json};
use crate::formats::file_registry::file_format_for_path;
use crate::formats::text::{
    read_text_snapshot, verify_current_signature, TextDocumentError, TextDocumentSnapshot,
};
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_new_bytes, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use crate::{build_local_graph, read_markdown_file, sanitize_filename, GraphData};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;

const MAX_GRAPH_PROJECT_NODES: usize = 100;

#[tauri::command]
pub async fn create_canvas_file(
    library_root: String,
    target_dir: Option<String>,
    prefix: Option<String>,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = if let Some(directory) = target_dir {
        guard.resolve_directory(directory, true)?
    } else {
        guard.root().to_path_buf()
    };
    let _directory = crate::services::document_coordination::acquire(&[&root])?;
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    }

    let base_name = sanitize_filename(&prefix.unwrap_or_else(|| "未命名画布".to_string()));
    if base_name.is_empty() {
        return Err("文件名不能为空".into());
    }
    let mut index = 0;
    let file_path = loop {
        let name = if index == 0 {
            format!("{}.canvas", base_name)
        } else {
            format!("{} {}.canvas", base_name, index)
        };
        let candidate = guard.resolve_file_for_write(root.join(name), &["canvas"])?;
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    write_new_bytes(&file_path, b"{\n  \"nodes\": [],\n  \"edges\": []\n}\n")?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_canvas_file(library_root: String, path: String) -> Result<TextDocumentSnapshot, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let file_path = guard.resolve_file_for_write(path, &["canvas"])?;
    read_canvas_snapshot(&file_path).map_err(|error| error.message)
}

#[tauri::command]
pub async fn write_canvas_file(
    library_root: String,
    path: String,
    content: String,
    expected_signature: Option<String>,
) -> Result<TextDocumentSnapshot, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let file_path = guard.resolve_file_for_write(path, &["canvas"])?;
    validate_canvas_json(&content)?;
    let _document = crate::services::document_coordination::acquire_existing_file(&file_path)?;
    recover_interrupted_write(&file_path)?;
    let signature = expected_signature.filter(|value| !value.is_empty())
        .ok_or("缺少画布读取签名，请重新打开后保存；未覆盖文件")?;
    verify_current_signature(&file_path, Some(&signature)).map_err(|error| error.message)?;
    write_utf8(&file_path, &content)?;
    read_canvas_snapshot_under_lease(&file_path).map_err(|error| error.message)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasReference {
    pub status: &'static str,
    pub path: Option<String>,
    pub message: String,
}

/// JSON Canvas file paths are vault-relative, not relative to the canvas folder.
/// Resolves an exact source only; never searches by basename or opens outside it.
#[tauri::command]
pub async fn resolve_canvas_reference(library_root: String, reference: String) -> Result<CanvasReference, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let result = |status, path, message: &str| CanvasReference { status, path, message: message.into() };
    if reference.trim().is_empty() || reference.len() > 4096 {
        return Ok(result("missing", None, "尚未指定来源"));
    }
    let supplied = std::path::PathBuf::from(reference.replace('/', std::path::MAIN_SEPARATOR_STR));
    let candidate = if supplied.is_absolute() { supplied } else { guard.root().join(supplied) };
    let candidate = match guard.resolve_for_write(candidate) {
        Ok(path) => path,
        Err(_) => return Ok(result("unavailable", None, "来源不在可访问的资料库内，未读取")),
    };
    if candidate.strip_prefix(guard.root()).map_err(|e|e.to_string())?.components().any(|part| {
        let value = part.as_os_str().to_string_lossy(); value.eq_ignore_ascii_case(".longedit") || value.eq_ignore_ascii_case(".git")
    }) {
        return Ok(result("unavailable", None, "内部记录不能作为资料来源"));
    }
    if !candidate.is_file() { return Ok(result("missing", None, "来源已不存在或已在其他程序中移动，请重新指定")); }
    let source = guard.resolve_existing(candidate)?;
    if file_format_for_path(&source).is_err() { return Ok(result("unsupported", None, "来源格式尚未注册，未自动打开")); }
    Ok(result("available", Some(source.to_string_lossy().into_owned()), "来源可用"))
}

fn canvas_boundary_error(code: &str, message: impl Into<String>) -> TextDocumentError {
    TextDocumentError::simple(code, message.into())
}

fn ensure_canvas_path(path: &Path) -> Result<(), TextDocumentError> {
    let format = file_format_for_path(path)
        .map_err(|error| canvas_boundary_error("format-unregistered", error))?;
    if format.id != "canvas" {
        return Err(canvas_boundary_error(
            "format-mismatch",
            "外部 Canvas 命令只接受 .canvas 文件",
        ));
    }
    Ok(())
}

fn read_canvas_snapshot(path: &Path) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let _document = crate::services::document_coordination::acquire_existing_file(path)
        .map_err(|error| canvas_boundary_error("document-unavailable", error))?;
    read_canvas_snapshot_under_lease(path)
}

// Only called while the caller owns the document reservation. A write keeps
// one reservation across signature validation, promotion and receipt reread.
fn read_canvas_snapshot_under_lease(path: &Path) -> Result<TextDocumentSnapshot, TextDocumentError> {
    ensure_canvas_path(path)?;
    crate::services::document_coordination::ensure_existing_file(path)
        .map_err(|error| canvas_boundary_error("document-unavailable", error))?;
    recover_interrupted_write(path)
        .map_err(|error| canvas_boundary_error("canvas-recovery-failed", error))?;
    let snapshot = read_text_snapshot(path)?;
    if snapshot.encoding != "UTF-8" {
        return Err(TextDocumentError::recoverable(
            "canvas-encoding-unsupported",
            format!("Canvas 必须使用 UTF-8，当前检测为 {}", snapshot.encoding),
            "请先在文本工具中转换为 UTF-8 后再打开",
        ));
    }
    validate_canvas_json(&snapshot.content)
        .map_err(|error| canvas_boundary_error("canvas-invalid", error))?;
    Ok(snapshot)
}

async fn read_external_canvas_file_with_access(
    path: String,
    access: &ExternalFileAccess,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let file_path = access
        .resolve_editable(path)
        .map_err(|error| canvas_boundary_error("external-not-authorized", error))?;
    read_canvas_snapshot(&file_path)
}

async fn write_external_canvas_file_with_access(
    path: String,
    content: String,
    expected_signature: String,
    access: &ExternalFileAccess,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    let file_path = access
        .resolve_editable(path)
        .map_err(|error| canvas_boundary_error("external-not-authorized", error))?;
    ensure_canvas_path(&file_path)?;
    validate_canvas_json(&content)
        .map_err(|error| canvas_boundary_error("canvas-invalid", error))?;
    let _document = crate::services::document_coordination::acquire_existing_file(&file_path)
        .map_err(|error| canvas_boundary_error("document-unavailable", error))?;
    verify_current_signature(&file_path, Some(&expected_signature))?;
    write_utf8(&file_path, &content)
        .map_err(|error| canvas_boundary_error("canvas-write-failed", error))?;
    read_canvas_snapshot_under_lease(&file_path)
}

#[tauri::command]
pub async fn read_external_canvas_file(
    path: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    read_external_canvas_file_with_access(path, &access).await
}

#[tauri::command]
pub async fn write_external_canvas_file(
    path: String,
    content: String,
    expected_signature: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<TextDocumentSnapshot, TextDocumentError> {
    write_external_canvas_file_with_access(path, content, expected_signature, &access).await
}

fn graph_to_canvas_json(
    graph: &GraphData,
    library_root: &Path,
    center_path: &str,
) -> serde_json::Value {
    let mut levels = std::collections::HashMap::from([(center_path.to_string(), 0usize)]);
    let mut frontier = vec![center_path.to_string()];
    while !frontier.is_empty() {
        let mut next = Vec::new();
        for current in &frontier {
            let level = *levels.get(current).unwrap_or(&0);
            for edge in &graph.edges {
                let neighbor = if &edge.source == current {
                    Some(&edge.target)
                } else if &edge.target == current {
                    Some(&edge.source)
                } else {
                    None
                };
                if let Some(id) = neighbor {
                    if !levels.contains_key(id) {
                        levels.insert(id.clone(), level + 1);
                        next.push(id.clone());
                    }
                }
            }
        }
        frontier = next;
    }
    let mut level_counts: std::collections::HashMap<usize, usize> =
        std::collections::HashMap::new();
    for level in levels.values() {
        *level_counts.entry(*level).or_default() += 1;
    }
    let mut level_indexes: std::collections::HashMap<usize, usize> =
        std::collections::HashMap::new();
    let id_map: std::collections::HashMap<String, String> = graph
        .nodes
        .iter()
        .map(|node| {
            (
                node.id.clone(),
                format!("node-{:x}", md5::compute(node.id.as_bytes())),
            )
        })
        .collect();
    let nodes: Vec<serde_json::Value> = graph
        .nodes
        .iter()
        .map(|node| {
            let level = *levels.get(&node.id).unwrap_or(&0);
            let index = level_indexes.entry(level).or_default();
            let count = *level_counts.get(&level).unwrap_or(&1);
            let y = (*index as f64 - count.saturating_sub(1) as f64 / 2.0) * 190.0;
            *index += 1;
            let relative = Path::new(&node.path)
                .strip_prefix(library_root)
                .unwrap_or(Path::new(&node.path));
            serde_json::json!({
                "id": id_map.get(&node.id).unwrap(), "type": "file",
                "file": relative.to_string_lossy().replace('\\', "/"),
                "x": level as f64 * 360.0, "y": y, "width": 280, "height": 140,
                "color": if node.id == center_path { "6" } else { "5" }
            })
        })
        .collect();
    let edges: Vec<serde_json::Value> = graph.edges.iter().enumerate().filter_map(|(index, edge)| Some(serde_json::json!({
        "id": format!("edge-{}", index), "fromNode": id_map.get(&edge.source)?, "toNode": id_map.get(&edge.target)?,
        "fromSide": "right", "toSide": "left", "fromEnd": "none",
        "toEnd": if edge.directed { "arrow" } else { "none" }, "relationType": edge.relation_type
    }))).collect();
    serde_json::json!({ "nodes": nodes, "edges": edges })
}

#[tauri::command]
pub async fn create_canvas_from_graph(
    library_root: String,
    center_path: String,
    depth: usize,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let center = resolve_local_graph_center(&guard, &center_path)?;
    let canonical_root = guard.root().to_string_lossy().into_owned();
    let canonical_center = center.to_string_lossy().into_owned();
    let graph = build_local_graph(canonical_root.clone(), canonical_center.clone(), depth).await?;
    if graph.nodes.is_empty() {
        return Err("当前对象不在知识图谱中".into());
    }
    let center_title = graph
        .nodes
        .iter()
        .find(|node| node.id == canonical_center)
        .map(|node| node.title.as_str())
        .unwrap_or("知识图谱");
    let path = create_canvas_file(
        canonical_root.clone(),
        None,
        Some(format!("{} 思维导图", center_title)),
    )
    .await?;
    let canvas = graph_to_canvas_json(&graph, guard.root(), &canonical_center);
    let original = read_canvas_file(canonical_root.clone(), path.clone()).await?;
    write_canvas_file(
        canonical_root,
        path.clone(),
        serde_json::to_string_pretty(&canvas).map_err(|error| error.to_string())?,
        Some(original.signature),
    )
    .await?;
    Ok(path)
}

fn graph_project_markdown(
    graph: &GraphData,
    library_root: &Path,
    center_path: &str,
    depth: usize,
) -> Result<String, String> {
    let center = graph
        .nodes
        .iter()
        .find(|node| node.id == center_path)
        .ok_or("当前对象不在知识图谱中")?;
    let center_relative = Path::new(&center.path)
        .strip_prefix(library_root)
        .map_err(|_| "中心对象超出知识库范围")?
        .to_string_lossy()
        .replace('\\', "/");
    if center_relative.contains(['[', ']', '|', '\r', '\n']) {
        return Err("中心对象路径无法安全写入项目笔记".into());
    }

    let mut related = graph
        .nodes
        .iter()
        .filter(|node| node.id != center_path)
        .filter_map(|node| {
            let relative = Path::new(&node.path)
                .strip_prefix(library_root)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/");
            if relative.contains(['[', ']', '|', '\r', '\n']) {
                return None;
            }
            Some((
                node.title.trim().replace(['\r', '\n', '[', ']', '|'], " "),
                relative,
            ))
        })
        .collect::<Vec<_>>();
    related.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    let omitted_count = related.len().saturating_sub(MAX_GRAPH_PROJECT_NODES);
    related.truncate(MAX_GRAPH_PROJECT_NODES);

    let title = center
        .title
        .trim()
        .replace(['\r', '\n', '[', ']', '|'], " ");
    let mut output = format!(
        "---\nlongedit-generated: graph-project\nlongedit-center: \"{}\"\nlongedit-depth: {}\n---\n\n# {} 项目\n\n> 来源：知识图谱中的 [[{}|{}]]，生成后可继续自由编辑。\n\n## 目标\n\n- [ ] 明确项目目标与完成标准\n- [ ] 确认负责人和时间范围\n\n## 关联资料\n\n- [[{}|{}]]（中心对象）\n",
        center_relative.replace('"', "\\\""),
        depth.clamp(1, 4),
        title,
        center_relative,
        title,
        center_relative,
        title,
    );
    for (related_title, relative) in &related {
        output.push_str(&format!("- [[{}|{}]]\n", relative, related_title));
    }
    if omitted_count > 0 {
        output.push_str(&format!(
            "- 另有 {} 个关联对象未写入，以控制项目笔记规模\n",
            omitted_count
        ));
    }
    output.push_str(&format!(
        "\n## 下一步\n\n- [ ] 审阅中心对象\n- [ ] 核对 {} 个关联对象\n- [ ] 将确认后的行动拆分为具体任务\n",
        related.len()
    ));
    Ok(output)
}

#[tauri::command]
pub async fn create_project_note_from_graph(
    library_root: String,
    center_path: String,
    depth: usize,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let center = guard.resolve_existing_file(center_path, &["md", "pdf"])?;
    let canonical_root = guard.root().to_string_lossy().into_owned();
    let canonical_center = center.to_string_lossy().into_owned();
    let graph = build_local_graph(canonical_root, canonical_center.clone(), depth).await?;
    let content = graph_project_markdown(&graph, guard.root(), &canonical_center, depth)?;
    let center_title = graph
        .nodes
        .iter()
        .find(|node| node.id == canonical_center)
        .map(|node| node.title.as_str())
        .unwrap_or("知识图谱");
    let base_name = sanitize_filename(&format!("{} 项目", center_title));
    if base_name.is_empty() {
        return Err("项目笔记文件名不能为空".into());
    }
    let target_dir = center.parent().unwrap_or(guard.root());
    let _directory = crate::services::document_coordination::acquire(&[target_dir])?;
    let mut index = 0usize;
    let target = loop {
        let name = if index == 0 {
            format!("{base_name}.md")
        } else {
            format!("{base_name} {index}.md")
        };
        let candidate = guard.resolve_file_for_write(target_dir.join(name), &["md"])?;
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    write_new_bytes(&target, content.as_bytes())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_canvas_from_markdown(
    library_root: String,
    markdown_path: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(markdown_path, &["md"])?;
    if source.metadata().map_err(|error| error.to_string())?.len() > 10 * 1024 * 1024 {
        return Err("Markdown 文件不能超过 10 MB".into());
    }
    let content = read_markdown_file(
        guard.root().to_string_lossy().into_owned(),
        source.to_string_lossy().into_owned(),
    )
    .await?
    .content;
    let source_file = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let canvas = markdown_outline_to_canvas(&content, &source_file)?;
    let title = source.file_stem().unwrap_or_default().to_string_lossy();
    let target_dir = source
        .parent()
        .map(|value| value.to_string_lossy().into_owned());
    let canonical_root = guard.root().to_string_lossy().into_owned();
    let path = create_canvas_file(
        canonical_root.clone(),
        target_dir,
        Some(format!("{} 内容脑图", title)),
    )
    .await?;
    let original = read_canvas_file(canonical_root.clone(), path.clone()).await?;
    write_canvas_file(
        canonical_root,
        path.clone(),
        serde_json::to_string_pretty(&canvas).map_err(|error| error.to_string())?,
        Some(original.signature),
    )
    .await?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1119_canvas_managed_save_requires_fresh_signature_and_preserves_unknown_fields() {
        let fixture = crate::services::test_workspace::TestWorkspace::new();
        let path = fixture.0.join("项目.canvas");
        let original = "{\"nodes\":[],\"edges\":[],\"vendor\":{\"nested\":true,\"number\":1.00}}\r\n";
        fs::write(&path,original).unwrap();
        let opened = tauri::async_runtime::block_on(read_canvas_file(fixture.root(),path.to_string_lossy().into_owned())).unwrap();
        let save = |signature| tauri::async_runtime::block_on(write_canvas_file(fixture.root(),opened.path.clone(),original.into(),signature));
        assert!(save(None).is_err()); assert_eq!(fs::read_to_string(&path).unwrap(),original);
        let saved = save(Some(opened.signature.clone())).unwrap(); assert_eq!(saved.content,original);
        let peer = original.replace("true","false"); fs::write(&path,&peer).unwrap();
        assert!(save(Some(saved.signature)).is_err()); assert_eq!(fs::read_to_string(&path).unwrap(),peer);
        fs::rename(&path,fixture.0.join("moved.canvas")).unwrap();
        assert!(save(Some(opened.signature)).is_err()); assert!(!path.exists());
    }

    #[test]
    fn v1119_canvas_exact_root_source_resolution_never_guesses_or_escapes() {
        let fixture = crate::services::test_workspace::TestWorkspace::new();
        fs::create_dir(fixture.0.join("notes")).unwrap(); fs::create_dir(fixture.0.join(".longedit")).unwrap();
        fs::write(fixture.0.join("notes/资料.md"),"real source").unwrap();
        fs::write(fixture.0.join("资料.md"),"same name but different").unwrap();
        fs::write(fixture.0.join(".longedit/hidden.md"),"hidden").unwrap();
        let resolve = |reference:&str| tauri::async_runtime::block_on(resolve_canvas_reference(fixture.root(),reference.into())).unwrap();
        let actual = resolve("notes/资料.md"); assert_eq!(actual.status,"available"); assert_eq!(Path::new(&actual.path.unwrap()),fixture.0.join("notes/资料.md"));
        for reference in ["missing/资料.md","notes/no.md"] { let result = resolve(reference); assert_eq!(result.status,"missing");assert!(result.path.is_none()); }
        for reference in ["../资料.md",".longedit/hidden.md"] { assert_eq!(resolve(reference).status,"unavailable"); }
    }
    use crate::formats::canvas::MAX_CANVAS_BYTES;
    use crate::{GraphEdge, GraphNode};
    use std::path::PathBuf;

    const VALID_CANVAS: &str = include_str!("../../tests/fixtures/canvas/valid.canvas");
    const DAMAGED_CANVAS: &str = include_str!("../../tests/fixtures/canvas/damaged.canvas");
    const MINDMAP_MARKDOWN: &str = include_str!("../../tests/fixtures/canvas/mindmap.md");
    const TRAVERSAL_PATH: &str = include_str!("../../tests/fixtures/canvas/traversal-path.txt");

    struct TestWorkspace {
        base: PathBuf,
        root: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let unique = format!(
                "longedit-canvas-fixture-{}-{}-{}",
                name,
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let base = std::env::temp_dir().join(unique);
            let root = base.join("workspace");
            fs::create_dir_all(&root).unwrap();
            Self { base, root }
        }

        fn root_string(&self) -> String {
            self.root.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    #[test]
    fn graph_converts_to_interoperable_canvas() {
        let graph = GraphData {
            nodes: vec![GraphNode::test_node("a"), GraphNode::test_node("b")],
            edges: vec![GraphEdge::test_edge("a", "b")],
        };
        let canvas = graph_to_canvas_json(&graph, Path::new("."), "a");
        assert_eq!(canvas["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(canvas["edges"].as_array().unwrap().len(), 1);
        assert_eq!(canvas["edges"][0]["toEnd"], "arrow");
        assert_eq!(canvas["edges"][0]["relationType"], "links-to");
        assert!(validate_canvas_json(&serde_json::to_string(&canvas).unwrap()).is_ok());
    }

    #[test]
    fn graph_generates_traceable_project_note_with_tasks() {
        let root = Path::new("C:\\Knowledge");
        let center_path = "C:\\Knowledge\\Projects\\Alpha.md";
        let mut center = GraphNode::test_node(center_path);
        center.title = "Alpha".into();
        center.path = center_path.into();
        let mut related = GraphNode::test_node("C:\\Knowledge\\Notes\\Research.md");
        related.title = "Research".into();
        related.path = "C:\\Knowledge\\Notes\\Research.md".into();
        let graph = GraphData {
            nodes: vec![center, related],
            edges: vec![GraphEdge::test_edge(
                center_path,
                "C:\\Knowledge\\Notes\\Research.md",
            )],
        };

        let markdown = graph_project_markdown(&graph, root, center_path, 2).unwrap();

        assert!(markdown.contains("longedit-generated: graph-project"));
        assert!(markdown.contains("longedit-center: \"Projects/Alpha.md\""));
        assert!(markdown.contains("[[Notes/Research.md|Research]]"));
        assert!(markdown.contains("- [ ] 核对 1 个关联对象"));
    }

    #[test]
    fn specialized_external_canvas_shares_move_protection_and_releases_after_failure() {
        let workspace = TestWorkspace::new("move-protection");
        let path = workspace.root.join("external.canvas");
        fs::write(&path, VALID_CANVAS).unwrap();
        let access = ExternalFileAccess::default();
        access.authorize_editable(&path).unwrap();
        let input = path.to_string_lossy().into_owned();
        let opened = tauri::async_runtime::block_on(read_external_canvas_file_with_access(input.clone(), &access)).unwrap();
        let moving = crate::services::document_coordination::acquire(&[&workspace.root]).unwrap();
        assert!(tauri::async_runtime::block_on(read_external_canvas_file_with_access(input.clone(), &access)).is_err());
        assert!(tauri::async_runtime::block_on(write_external_canvas_file_with_access(
            input.clone(), VALID_CANVAS.into(), opened.signature.clone(), &access,
        )).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), VALID_CANVAS);
        drop(moving);
        let saved = tauri::async_runtime::block_on(write_external_canvas_file_with_access(
            input, VALID_CANVAS.into(), opened.signature, &access,
        )).unwrap();
        assert_eq!(saved.content, VALID_CANVAS);
    }

    #[test]
    fn canvas_commands_round_trip_valid_fixture() {
        let workspace = TestWorkspace::new("round-trip");
        // Creation remains supported through its explicit creation command;
        // saving a moved/deleted file must not silently recreate its old name.
        let path = PathBuf::from(tauri::async_runtime::block_on(create_canvas_file(
            workspace.root_string(), None, Some("round-trip".into()),
        )).unwrap());
        tauri::async_runtime::block_on(write_canvas_file(
            workspace.root_string(),
            path.to_string_lossy().into_owned(),
            VALID_CANVAS.to_string(),
            Some(read_canvas_snapshot(&path).unwrap().signature),
        ))
        .unwrap();

        let result = tauri::async_runtime::block_on(read_canvas_file(
            workspace.root_string(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(result.content, VALID_CANVAS);
        assert_eq!(result.encoding, "UTF-8");
        assert_eq!(Path::new(&result.path), path.canonicalize().unwrap());
    }

    #[test]
    fn external_canvas_requires_authorization_and_rejects_stale_or_invalid_writes() {
        let workspace = TestWorkspace::new("external");
        let path = workspace.root.join("external.canvas");
        fs::write(&path, VALID_CANVAS).unwrap();
        let path_string = path.to_string_lossy().into_owned();
        let access = ExternalFileAccess::default();

        let unauthorized = tauri::async_runtime::block_on(read_external_canvas_file_with_access(
            path_string.clone(),
            &access,
        ))
        .unwrap_err();
        assert_eq!(unauthorized.code, "external-not-authorized");

        access.authorize_editable(&path).unwrap();
        let opened = tauri::async_runtime::block_on(read_external_canvas_file_with_access(
            path_string.clone(),
            &access,
        ))
        .unwrap();

        let invalid = tauri::async_runtime::block_on(write_external_canvas_file_with_access(
            path_string.clone(),
            DAMAGED_CANVAS.into(),
            opened.signature.clone(),
            &access,
        ))
        .unwrap_err();
        assert_eq!(invalid.code, "canvas-invalid");
        assert_eq!(fs::read_to_string(&path).unwrap(), VALID_CANVAS);

        let saved_content = "{\"nodes\":[],\"edges\":[]}\n";
        let saved = tauri::async_runtime::block_on(write_external_canvas_file_with_access(
            path_string.clone(),
            saved_content.into(),
            opened.signature,
            &access,
        ))
        .unwrap();
        assert_eq!(saved.content, saved_content);
        assert_eq!(fs::read_to_string(&path).unwrap(), saved_content);

        fs::write(&path, "{\n  \"nodes\": [],\n  \"edges\": []\n}\n").unwrap();
        let stale = tauri::async_runtime::block_on(write_external_canvas_file_with_access(
            path_string,
            VALID_CANVAS.into(),
            saved.signature,
            &access,
        ))
        .unwrap_err();
        assert_eq!(stale.code, "external-modified");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\n  \"nodes\": [],\n  \"edges\": []\n}\n"
        );
    }

    #[test]
    fn canvas_commands_reject_damaged_and_oversized_fixtures() {
        let workspace = TestWorkspace::new("invalid");
        let damaged_path = workspace.root.join("damaged.canvas");
        fs::write(&damaged_path, DAMAGED_CANVAS).unwrap();
        assert!(tauri::async_runtime::block_on(read_canvas_file(
            workspace.root_string(),
            damaged_path.to_string_lossy().into_owned(),
        ))
        .is_err());

        let oversized_path = workspace.root.join("oversized.canvas");
        let oversized = "x".repeat(MAX_CANVAS_BYTES + 1);
        let error = tauri::async_runtime::block_on(write_canvas_file(
            workspace.root_string(),
            oversized_path.to_string_lossy().into_owned(),
            oversized,
            None,
        ))
        .unwrap_err();
        assert!(error.contains("20 MB"));
        assert!(!oversized_path.exists());
    }

    #[test]
    fn canvas_commands_reject_traversal_fixture() {
        let workspace = TestWorkspace::new("traversal");
        let outside = workspace.base.join("outside.canvas");
        fs::write(&outside, VALID_CANVAS).unwrap();
        let traversal = TRAVERSAL_PATH.trim().to_string();

        assert!(tauri::async_runtime::block_on(read_canvas_file(
            workspace.root_string(),
            traversal,
        ))
        .is_err());
        assert!(tauri::async_runtime::block_on(read_canvas_file(
            workspace.root_string(),
            outside.to_string_lossy().into_owned(),
        ))
        .is_err());
    }

    #[test]
    fn markdown_fixture_converts_and_round_trips_through_commands() {
        let workspace = TestWorkspace::new("markdown");
        let source = workspace.root.join("mindmap.md");
        fs::write(&source, MINDMAP_MARKDOWN).unwrap();

        let canvas_path = tauri::async_runtime::block_on(create_canvas_from_markdown(
            workspace.root_string(),
            source.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let result =
            tauri::async_runtime::block_on(read_canvas_file(workspace.root_string(), canvas_path))
                .unwrap();
        let canvas: serde_json::Value = serde_json::from_str(&result.content).unwrap();
        assert_eq!(canvas["nodes"].as_array().unwrap().len(), 10);
        assert_eq!(canvas["edges"].as_array().unwrap().len(), 9);
        assert!(canvas["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["text"] == "思维导图"));
    }
}
