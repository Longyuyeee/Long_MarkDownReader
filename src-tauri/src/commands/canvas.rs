use crate::formats::canvas::{markdown_outline_to_canvas, validate_canvas_json};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use crate::{build_local_graph, read_markdown_file, sanitize_filename, FileContent, GraphData};
use std::fs;
use std::path::Path;

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
    write_utf8(&file_path, "{\n  \"nodes\": [],\n  \"edges\": []\n}\n")?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_canvas_file(library_root: String, path: String) -> Result<FileContent, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let file_path = guard.resolve_file_for_write(path, &["canvas"])?;
    recover_interrupted_write(&file_path)?;
    if !file_path.is_file() {
        return Err("Canvas 文件不存在".into());
    }
    let content =
        fs::read_to_string(&file_path).map_err(|error| format!("读取 Canvas 失败: {}", error))?;
    validate_canvas_json(&content)?;
    Ok(FileContent {
        content,
        encoding: "UTF-8".into(),
        path: file_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn write_canvas_file(
    library_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let file_path = guard.resolve_file_for_write(path, &["canvas"])?;
    validate_canvas_json(&content)?;
    write_utf8(file_path, &content)
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
    let center = guard.resolve_existing_file(center_path, &["md", "pdf", "csv", "tsv", "json"])?;
    if center
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        && !center
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.to_ascii_lowercase().ends_with(".table.json"))
    {
        return Err("仅支持开放 Table JSON 作为表格中心对象".into());
    }
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
    write_canvas_file(
        canonical_root,
        path.clone(),
        serde_json::to_string_pretty(&canvas).map_err(|error| error.to_string())?,
    )
    .await?;
    Ok(path)
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
    let content = read_markdown_file(source.to_string_lossy().into_owned())
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
    write_canvas_file(
        canonical_root,
        path.clone(),
        serde_json::to_string_pretty(&canvas).map_err(|error| error.to_string())?,
    )
    .await?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn canvas_commands_round_trip_valid_fixture() {
        let workspace = TestWorkspace::new("round-trip");
        let path = workspace.root.join("round-trip.canvas");
        tauri::async_runtime::block_on(write_canvas_file(
            workspace.root_string(),
            path.to_string_lossy().into_owned(),
            VALID_CANVAS.to_string(),
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
