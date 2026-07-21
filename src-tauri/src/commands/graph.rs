use crate::formats::markdown::{
    extract_pdf_reference_mentions, extract_wikilink_mentions, normalize_relation_type,
    WikilinkMention,
};
use crate::formats::table::{parse_internal_table, table_search_text};
use crate::services::pdf_index::load_pdf_index;
use crate::services::reliable_write::write_utf8;
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static RE_TAG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?:^|\s)#([^\s#`\[\]()]+)").unwrap());

#[derive(Serialize, Clone)]
pub struct GraphData {
    pub(crate) nodes: Vec<GraphNode>,
    pub(crate) edges: Vec<GraphEdge>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) path: String,
    pub(crate) size: f64,
    pub(crate) tags: Vec<String>,
    pub(crate) directory: String,
    pub(crate) modified_at: u64,
    pub(crate) object_type: String,
    pub(crate) search_text: String,
    pub(crate) content_signature: Option<String>,
}

impl GraphNode {
    #[cfg(test)]
    pub(crate) fn test_node(id: &str) -> Self {
        Self {
            id: id.into(),
            title: id.into(),
            path: id.into(),
            size: 8.0,
            tags: Vec::new(),
            directory: String::new(),
            modified_at: 0,
            object_type: "markdown".into(),
            search_text: String::new(),
            content_signature: None,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub(crate) source: String,
    pub(crate) target: String,
    pub(crate) relation_type: String,
    pub(crate) directed: bool,
    pub(crate) mentions: Vec<WikilinkMention>,
}

impl GraphEdge {
    pub(crate) fn wikilink(source: String, target: String, mention: WikilinkMention) -> Self {
        let relation_type = mention.relation_type.clone();
        Self {
            source,
            target,
            directed: relation_type != "related",
            relation_type,
            mentions: vec![mention],
        }
    }

    #[cfg(test)]
    pub(crate) fn test_edge(source: &str, target: &str) -> Self {
        Self {
            source: source.into(),
            target: target.into(),
            relation_type: "links-to".into(),
            directed: true,
            mentions: Vec::new(),
        }
    }
}

#[tauri::command]
pub async fn build_link_graph(library_root: String) -> Result<GraphData, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = guard.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut node_ids = HashSet::new();
        let mut name_to_paths = HashMap::new();
        build_filename_index(&root, &mut name_to_paths);
        build_graph_recursive(
            &root,
            &root,
            &mut nodes,
            &mut edges,
            &mut node_ids,
            &name_to_paths,
        );
        edges.retain(|edge| node_ids.contains(&edge.source) && node_ids.contains(&edge.target));
        edges = merge_graph_edges(edges);
        let mut degrees = HashMap::new();
        for edge in &edges {
            *degrees.entry(edge.source.clone()).or_insert(0usize) += 1;
            *degrees.entry(edge.target.clone()).or_insert(0usize) += 1;
        }
        for node in &mut nodes {
            let degree = *degrees.get(&node.id).unwrap_or(&0) as f64;
            node.size = (8.0 + degree.sqrt() * 6.0).clamp(8.0, 32.0);
        }
        GraphData { nodes, edges }
    })
    .await
    .map_err(|error| format!("知识图谱索引任务失败: {error}"))
}

pub(crate) fn merge_graph_edges(edges: Vec<GraphEdge>) -> Vec<GraphEdge> {
    let mut merged: Vec<GraphEdge> = Vec::new();
    let mut indexes: HashMap<(String, String, String), usize> = HashMap::new();
    for edge in edges {
        let key = (
            edge.source.clone(),
            edge.target.clone(),
            edge.relation_type.clone(),
        );
        if let Some(index) = indexes.get(&key).copied() {
            merged[index].mentions.extend(edge.mentions);
        } else {
            indexes.insert(key, merged.len());
            merged.push(edge);
        }
    }
    merged
}

pub(crate) fn filter_graph_by_depth(
    graph: GraphData,
    center_path: &str,
    depth: usize,
) -> GraphData {
    if !graph.nodes.iter().any(|node| node.id == center_path) {
        return GraphData {
            nodes: Vec::new(),
            edges: Vec::new(),
        };
    }
    let max_depth = depth.clamp(1, 4);
    let mut included = HashSet::from([center_path.to_string()]);
    let mut frontier = vec![center_path.to_string()];
    for _ in 0..max_depth {
        let mut next = Vec::new();
        for edge in &graph.edges {
            let neighbor = if frontier.contains(&edge.source) {
                Some(&edge.target)
            } else if frontier.contains(&edge.target) {
                Some(&edge.source)
            } else {
                None
            };
            if let Some(id) = neighbor {
                if included.insert(id.clone()) {
                    next.push(id.clone());
                }
            }
        }
        if next.is_empty() {
            break;
        }
        frontier = next;
    }
    GraphData {
        nodes: graph
            .nodes
            .into_iter()
            .filter(|node| included.contains(&node.id))
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .filter(|edge| included.contains(&edge.source) && included.contains(&edge.target))
            .collect(),
    }
}

#[tauri::command]
pub async fn build_local_graph(
    library_root: String,
    center_path: String,
    depth: usize,
) -> Result<GraphData, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let center = guard.resolve_existing_file(center_path, &["md", "pdf"])?;
    let graph = build_link_graph(guard.root().to_string_lossy().into_owned()).await?;
    Ok(filter_graph_by_depth(
        graph,
        &center.to_string_lossy(),
        depth,
    ))
}

fn build_filename_index(dir: &Path, index: &mut HashMap<String, Vec<String>>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            build_filename_index(&path, index);
        } else if name.ends_with(".md") {
            index
                .entry(name.trim_end_matches(".md").to_string())
                .or_default()
                .push(path.to_string_lossy().into_owned());
        }
    }
}

fn build_graph_recursive(
    library_root: &Path,
    dir: &Path,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
    name_to_paths: &HashMap<String, Vec<String>>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            build_graph_recursive(library_root, &path, nodes, edges, node_ids, name_to_paths);
        } else if name.ends_with(".md") {
            add_markdown_node(
                library_root,
                dir,
                &path,
                &name,
                nodes,
                edges,
                node_ids,
                name_to_paths,
            );
        } else if name.to_lowercase().ends_with(".pdf") {
            add_pdf_node(library_root, &path, &name, nodes, node_ids);
        } else if name.to_lowercase().ends_with(".csv")
            || name.to_lowercase().ends_with(".tsv")
            || name.to_lowercase().ends_with(".table.json")
        {
            add_table_node(library_root, &path, &name, nodes, node_ids);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn add_markdown_node(
    library_root: &Path,
    current_dir: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut HashSet<String>,
    name_to_paths: &HashMap<String, Vec<String>>,
) {
    let path_string = path.to_string_lossy().into_owned();
    let id = path_string.clone();
    let bytes = fs::read(path).unwrap_or_default();
    let content = String::from_utf8(bytes.clone()).unwrap_or_default();
    if node_ids.insert(id.clone()) {
        let metadata = fs::metadata(path).ok();
        let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0) as f64;
        let mut tags: Vec<String> = RE_TAG
            .captures_iter(&content)
            .map(|capture| capture[1].to_string())
            .collect();
        tags.sort_by_key(|value| value.to_lowercase());
        tags.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        nodes.push(GraphNode {
            id: id.clone(),
            title: name.trim_end_matches(".md").to_string(),
            path: path_string,
            size: (size / 100.0).clamp(5.0, 30.0),
            tags,
            directory: relative_directory(path, library_root),
            modified_at: modified_timestamp(metadata),
            object_type: "markdown".into(),
            search_text: content.chars().take(8_000).collect(),
            content_signature: Some(format!("{:x}", md5::compute(&bytes))),
        });
    }
    for mention in extract_wikilink_mentions(&content) {
        let target = resolve_wikilink(&mention.target, name_to_paths, current_dir);
        edges.push(GraphEdge::wikilink(id.clone(), target, mention));
    }
    for mention in extract_pdf_reference_mentions(&content) {
        let target = library_root.join(mention.target.replace('/', std::path::MAIN_SEPARATOR_STR));
        let target_id = target
            .canonicalize()
            .ok()
            .filter(|value| value.starts_with(library_root))
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| target.to_string_lossy().into_owned());
        edges.push(GraphEdge::wikilink(id.clone(), target_id, mention));
    }
}

fn add_pdf_node(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    node_ids: &mut HashSet<String>,
) {
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let index = load_pdf_index(path);
    let mut search_text = String::new();
    for page in &index.pages {
        if search_text.chars().count() >= 8_000 {
            break;
        }
        search_text.push_str(page);
        search_text.push('\n');
    }
    for page in &index.ocr_pages {
        search_text.push_str(&page.text);
        search_text.push('\n');
    }
    for annotation in &index.annotations {
        search_text.push_str(&annotation.text);
        search_text.push('\n');
    }
    let metadata = fs::metadata(path).ok();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title: name[..name.len().saturating_sub(4)].to_string(),
        path: path_string,
        size: 8.0,
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(metadata),
        object_type: "pdf".into(),
        search_text: search_text.chars().take(12_000).collect(),
        content_signature: None,
    });
}

fn add_table_node(
    library_root: &Path,
    path: &Path,
    name: &str,
    nodes: &mut Vec<GraphNode>,
    node_ids: &mut HashSet<String>,
) {
    let path_string = path.to_string_lossy().into_owned();
    if !node_ids.insert(path_string.clone()) {
        return;
    }
    let metadata = fs::metadata(path).ok();
    let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
    let bytes = fs::read(path).unwrap_or_default();
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (content, _, _) = encoding.decode(&bytes);
    let search_text = if name.to_ascii_lowercase().ends_with(".table.json") {
        parse_internal_table(content.strip_prefix('\u{feff}').unwrap_or(&content))
            .map(|table| table_search_text(&table, 12_000))
            .unwrap_or_default()
    } else {
        content.chars().take(12_000).collect()
    };
    let title = name
        .strip_suffix(".table.json")
        .or_else(|| name.rsplit_once('.').map(|(stem, _)| stem))
        .unwrap_or(name)
        .to_string();
    nodes.push(GraphNode {
        id: path_string.clone(),
        title,
        path: path_string,
        size: ((size as f64 / 20_000.0) + 8.0).clamp(8.0, 20.0),
        tags: Vec::new(),
        directory: relative_directory(path, library_root),
        modified_at: modified_timestamp(metadata),
        object_type: "table".into(),
        search_text,
        content_signature: None,
    });
}

fn relative_directory(path: &Path, library_root: &Path) -> String {
    path.parent()
        .and_then(|parent| parent.strip_prefix(library_root).ok())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn modified_timestamp(metadata: Option<fs::Metadata>) -> u64 {
    metadata
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn resolve_wikilink(
    link: &str,
    name_to_paths: &HashMap<String, Vec<String>>,
    current_dir: &Path,
) -> String {
    if link.contains(':') || link.starts_with('/') || link.starts_with('\\') {
        return link.to_string();
    }
    if link.contains('/') || link.contains('\\') {
        let normalized = link.replace('\\', "/");
        let file_name = normalized.rsplit('/').next().unwrap_or(link);
        if let Some(paths) = name_to_paths.get(file_name) {
            for path in paths {
                if path
                    .replace('\\', "/")
                    .ends_with(&format!("/{normalized}.md"))
                {
                    return path.clone();
                }
            }
            return paths[0].clone();
        }
        return format!("{link}.md");
    }
    if let Some(paths) = name_to_paths.get(link) {
        if paths.len() == 1 {
            return paths[0].clone();
        }
        let current_dir = current_dir.to_string_lossy();
        if let Some(path) = paths
            .iter()
            .find(|path| path.starts_with(current_dir.as_ref()))
        {
            return path.clone();
        }
        return paths[0].clone();
    }
    format!("{}/{}.md", current_dir.to_string_lossy(), link)
}

#[derive(Clone, Debug)]
struct NoteRecord {
    path: PathBuf,
    title: String,
    relative_path: String,
    replacement_target: String,
    directory: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphHealthCandidate {
    title: String,
    path: String,
    relative_path: String,
    replacement_target: String,
    confidence: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphLinkIssue {
    id: String,
    kind: String,
    source_path: String,
    source_title: String,
    target_text: String,
    syntax: String,
    context: String,
    line: usize,
    relation_type: String,
    candidates: Vec<GraphHealthCandidate>,
    recommended_candidate: Option<GraphHealthCandidate>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrphanNote {
    path: String,
    title: String,
    relative_path: String,
    directory: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphHealthReport {
    broken_links: Vec<GraphLinkIssue>,
    ambiguous_links: Vec<GraphLinkIssue>,
    orphan_notes: Vec<OrphanNote>,
    scanned_notes: usize,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphLinkRepair {
    source_path: String,
    target_path: String,
    line: usize,
    expected_syntax: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRepairResult {
    repaired_links: usize,
    changed_files: usize,
}

enum LinkResolution {
    Resolved(PathBuf),
    Broken(Vec<GraphHealthCandidate>, Option<GraphHealthCandidate>),
    Ambiguous(Vec<GraphHealthCandidate>),
}

#[tauri::command]
pub async fn analyze_graph_health(library_root: String) -> Result<GraphHealthReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    analyze_workspace(guard.root())
}

fn analyze_workspace(root: &Path) -> Result<GraphHealthReport, String> {
    let mut notes = Vec::new();
    collect_notes(root, root, &mut notes)?;
    notes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, note) in notes.iter().enumerate() {
        by_title
            .entry(note.title.to_lowercase())
            .or_default()
            .push(index);
    }

    let mut report = GraphHealthReport {
        scanned_notes: notes.len(),
        ..Default::default()
    };
    let mut connected = HashSet::new();
    for note in &notes {
        let content = fs::read_to_string(&note.path)
            .map_err(|error| format!("读取图谱治理文件失败 {}: {}", note.relative_path, error))?;
        for mention in extract_wikilink_mentions(&content) {
            match resolve_mention(note, &mention.target, &notes, &by_title) {
                LinkResolution::Resolved(target) => {
                    connected.insert(note.path.clone());
                    connected.insert(target);
                }
                LinkResolution::Broken(candidates, recommended_candidate) => {
                    report.broken_links.push(issue_from(
                        "broken",
                        note,
                        mention,
                        candidates,
                        recommended_candidate,
                    ));
                }
                LinkResolution::Ambiguous(candidates) => {
                    report.ambiguous_links.push(issue_from(
                        "ambiguous",
                        note,
                        mention,
                        candidates,
                        None,
                    ));
                }
            }
        }
    }

    report.orphan_notes = notes
        .iter()
        .filter(|note| !connected.contains(&note.path))
        .map(|note| OrphanNote {
            path: note.path.to_string_lossy().into_owned(),
            title: note.title.clone(),
            relative_path: note.relative_path.clone(),
            directory: note.directory.clone(),
        })
        .collect();
    Ok(report)
}

fn collect_notes(root: &Path, directory: &Path, notes: &mut Vec<NoteRecord>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("扫描图谱治理目录失败 {}: {}", directory.display(), error))?;
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            collect_notes(root, &path, notes)?;
        } else if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("md"))
        {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "无法计算治理文件相对路径")?;
            let relative_path = relative.to_string_lossy().replace('\\', "/");
            let replacement_target = relative
                .with_extension("")
                .to_string_lossy()
                .replace('\\', "/");
            let directory = relative
                .parent()
                .map(|value| value.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            notes.push(NoteRecord {
                path,
                title: name.trim_end_matches(".md").to_string(),
                relative_path,
                replacement_target,
                directory,
            });
        }
    }
    Ok(())
}

fn resolve_mention(
    source: &NoteRecord,
    target: &str,
    notes: &[NoteRecord],
    by_title: &HashMap<String, Vec<usize>>,
) -> LinkResolution {
    let normalized = normalize_target(target);
    let target_title = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_lowercase();
    let title_matches = by_title.get(&target_title).cloned().unwrap_or_default();
    if title_matches.is_empty() {
        let candidates = fuzzy_candidates(&target_title, notes);
        let recommended = recommended_candidate(&candidates);
        return LinkResolution::Broken(candidates, recommended);
    }

    if normalized.contains('/') {
        let source_relative = Path::new(&source.directory)
            .join(&normalized)
            .to_string_lossy()
            .replace('\\', "/");
        let exact: Vec<_> = title_matches
            .iter()
            .filter(|index| {
                notes[**index]
                    .replacement_target
                    .eq_ignore_ascii_case(&normalized)
                    || notes[**index]
                        .replacement_target
                        .eq_ignore_ascii_case(&source_relative)
            })
            .collect();
        if exact.len() == 1 {
            return LinkResolution::Resolved(notes[*exact[0]].path.clone());
        }
    }

    if title_matches.len() == 1 {
        return LinkResolution::Resolved(notes[title_matches[0]].path.clone());
    }
    let same_directory: Vec<_> = title_matches
        .iter()
        .filter(|index| {
            notes[**index]
                .directory
                .eq_ignore_ascii_case(&source.directory)
        })
        .collect();
    if same_directory.len() == 1 {
        return LinkResolution::Resolved(notes[*same_directory[0]].path.clone());
    }
    LinkResolution::Ambiguous(
        title_matches
            .into_iter()
            .map(|index| candidate_from(&notes[index], 1.0))
            .collect(),
    )
}

fn normalize_target(target: &str) -> String {
    target
        .trim()
        .replace('\\', "/")
        .trim_end_matches(".md")
        .trim_start_matches("./")
        .to_string()
}

fn fuzzy_candidates(target_title: &str, notes: &[NoteRecord]) -> Vec<GraphHealthCandidate> {
    let mut candidates: Vec<_> = notes
        .iter()
        .filter_map(|note| {
            let candidate = note.title.to_lowercase();
            let maximum = target_title.chars().count().max(candidate.chars().count());
            if maximum == 0 {
                return None;
            }
            let confidence = 1.0 - levenshtein(target_title, &candidate) as f64 / maximum as f64;
            (confidence >= 0.45).then(|| candidate_from(note, confidence))
        })
        .collect();
    candidates.sort_by(|left, right| {
        right
            .confidence
            .total_cmp(&left.confidence)
            .then(left.relative_path.cmp(&right.relative_path))
    });
    candidates.truncate(3);
    candidates
}

fn recommended_candidate(candidates: &[GraphHealthCandidate]) -> Option<GraphHealthCandidate> {
    let first = candidates.first()?;
    let gap = first.confidence
        - candidates
            .get(1)
            .map(|value| value.confidence)
            .unwrap_or(0.0);
    (first.confidence >= 0.72 && gap >= 0.12).then(|| first.clone())
}

fn candidate_from(note: &NoteRecord, confidence: f64) -> GraphHealthCandidate {
    GraphHealthCandidate {
        title: note.title.clone(),
        path: note.path.to_string_lossy().into_owned(),
        relative_path: note.relative_path.clone(),
        replacement_target: note.replacement_target.clone(),
        confidence,
    }
}

fn issue_from(
    kind: &str,
    note: &NoteRecord,
    mention: WikilinkMention,
    candidates: Vec<GraphHealthCandidate>,
    recommended_candidate: Option<GraphHealthCandidate>,
) -> GraphLinkIssue {
    let id_source = format!("{}:{}:{}", note.relative_path, mention.line, mention.syntax);
    GraphLinkIssue {
        id: format!("{:x}", md5::compute(id_source.as_bytes())),
        kind: kind.into(),
        source_path: note.path.to_string_lossy().into_owned(),
        source_title: note.title.clone(),
        target_text: mention.target,
        syntax: mention.syntax,
        context: mention.context,
        line: mention.line,
        relation_type: mention.relation_type,
        candidates,
        recommended_candidate,
    }
}

fn levenshtein(left: &str, right: &str) -> usize {
    let right_chars: Vec<char> = right.chars().collect();
    let mut costs: Vec<usize> = (0..=right_chars.len()).collect();
    for (left_index, left_char) in left.chars().enumerate() {
        let mut previous = costs[0];
        costs[0] = left_index + 1;
        for (right_index, right_char) in right_chars.iter().enumerate() {
            let old = costs[right_index + 1];
            costs[right_index + 1] = if left_char == *right_char {
                previous
            } else {
                1 + previous.min(costs[right_index]).min(old)
            };
            previous = old;
        }
    }
    costs[right_chars.len()]
}

#[tauri::command]
pub async fn repair_graph_links(
    library_root: String,
    repairs: Vec<GraphLinkRepair>,
) -> Result<GraphRepairResult, String> {
    if repairs.is_empty() {
        return Ok(GraphRepairResult {
            repaired_links: 0,
            changed_files: 0,
        });
    }
    if repairs.len() > 100 {
        return Err("单次最多修复 100 条链接".into());
    }
    let guard = WorkspaceGuard::new(&library_root)?;
    let mut changes: HashMap<PathBuf, (String, usize)> = HashMap::new();

    for repair in repairs {
        if repair.line == 0 || repair.expected_syntax.len() > 500 {
            return Err("修复请求的行号或链接语法无效".into());
        }
        let source = guard.resolve_existing_file(&repair.source_path, &["md"])?;
        let target = guard.resolve_existing_file(&repair.target_path, &["md"])?;
        let replacement_target = target
            .strip_prefix(guard.root())
            .map_err(|_| "修复目标超出知识库范围")?
            .with_extension("")
            .to_string_lossy()
            .replace('\\', "/");
        if !changes.contains_key(&source) {
            let content = fs::read_to_string(&source)
                .map_err(|error| format!("读取待修复笔记失败: {error}"))?;
            changes.insert(source.clone(), (content, 0));
        }
        let entry = changes
            .get_mut(&source)
            .ok_or("无法创建待修复文件的内存副本")?;
        entry.0 = replace_at_line(
            &entry.0,
            repair.line,
            &repair.expected_syntax,
            &replacement_target,
        )?;
        entry.1 += 1;
    }

    let repaired_links = changes.values().map(|(_, count)| *count).sum();
    let changed_files = changes.len();
    for (path, (content, _)) in changes {
        write_utf8(path, &content)?;
    }
    Ok(GraphRepairResult {
        repaired_links,
        changed_files,
    })
}

const EDITABLE_RELATION_TYPES: &[&str] = &[
    "parent",
    "child",
    "depends-on",
    "related",
    "contains",
    "cites",
    "derived-from",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationMutation {
    source_path: String,
    target_path: String,
    relation_type: String,
    action: String,
    expected_signature: String,
    expected_line: Option<usize>,
    expected_syntax: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationMutationResult {
    content_signature: String,
}

#[tauri::command]
pub async fn update_graph_relation(
    library_root: String,
    mutation: GraphRelationMutation,
) -> Result<GraphRelationMutationResult, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(&mutation.source_path, &["md"])?;
    let target = guard.resolve_existing_file(&mutation.target_path, &["md"])?;
    if source == target {
        return Err("不能创建指向自身的图谱关系".into());
    }
    let relation_type = normalize_relation_type(&mutation.relation_type)
        .filter(|value| EDITABLE_RELATION_TYPES.contains(&value.as_str()))
        .ok_or("不支持的图谱关系类型")?;
    if mutation.expected_signature.len() != 32
        || !mutation
            .expected_signature
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("图谱关系写回签名无效，请刷新图谱后重试".into());
    }
    let target_reference = target
        .strip_prefix(guard.root())
        .map_err(|_| "关系目标超出知识库范围")?
        .with_extension("")
        .to_string_lossy()
        .replace('\\', "/");
    if target_reference.contains(['[', ']', '"', '\r', '\n']) {
        return Err("关系目标文件名无法安全写入 Wikilink".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&source).map_err(|error| format!("读取关系源笔记失败: {error}"))?;
        let current_signature = format!("{:x}", md5::compute(&bytes));
        if !current_signature.eq_ignore_ascii_case(&mutation.expected_signature) {
            return Err("源笔记已被修改，请刷新图谱后再编辑关系".into());
        }
        let content = String::from_utf8(bytes).map_err(|_| "关系源笔记不是 UTF-8 文本")?;
        let updated = match mutation.action.as_str() {
            "add" => add_frontmatter_relation(&content, &relation_type, &target_reference)?,
            "remove" => remove_frontmatter_relation(
                &content,
                &relation_type,
                mutation.expected_line.ok_or("删除关系缺少原始行号")?,
                mutation
                    .expected_syntax
                    .as_deref()
                    .ok_or("删除关系缺少原始链接语法")?,
            )?,
            _ => return Err("不支持的图谱关系操作".into()),
        };
        write_utf8(&source, &updated)?;
        Ok(GraphRelationMutationResult {
            content_signature: format!("{:x}", md5::compute(updated.as_bytes())),
        })
    })
    .await
    .map_err(|error| format!("图谱关系写回任务失败: {error}"))?
}

fn split_markdown_lines(content: &str) -> (Vec<String>, &'static str, bool) {
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let trailing_newline = content.ends_with('\n');
    let lines = content.lines().map(str::to_string).collect();
    (lines, newline, trailing_newline)
}

fn join_markdown_lines(lines: &[String], newline: &str, trailing_newline: bool) -> String {
    let mut result = lines.join(newline);
    if trailing_newline {
        result.push_str(newline);
    }
    result
}

fn add_frontmatter_relation(
    content: &str,
    relation_type: &str,
    target_reference: &str,
) -> Result<String, String> {
    let (mut lines, newline, trailing_newline) = split_markdown_lines(content);
    let syntax = format!("[[{target_reference}]]");
    if extract_wikilink_mentions(content)
        .iter()
        .any(|mention| mention.relation_type == relation_type && mention.target == target_reference)
    {
        return Err("该语义关系已经存在".into());
    }

    let frontmatter_end = if lines.first().is_some_and(|line| line.trim() == "---") {
        lines
            .iter()
            .enumerate()
            .skip(1)
            .find_map(|(index, line)| (line.trim() == "---").then_some(index))
            .ok_or("Markdown Frontmatter 未闭合，无法安全写入关系")?
    } else {
        lines.splice(
            0..0,
            [
                "---".to_string(),
                "relations:".to_string(),
                format!("  {relation_type}: \"{syntax}\""),
                "---".to_string(),
            ],
        );
        return Ok(join_markdown_lines(&lines, newline, trailing_newline));
    };

    let relations_index = lines[1..frontmatter_end]
        .iter()
        .position(|line| line == "relations:")
        .map(|index| index + 1);
    let Some(relations_index) = relations_index else {
        let has_unsupported_relations = lines[1..frontmatter_end].iter().any(|line| {
            if line.starts_with([' ', '\t']) {
                return false;
            }
            line.split_once(':')
                .is_some_and(|(key, _)| key.trim().trim_matches(['\'', '"']) == "relations")
        });
        if has_unsupported_relations {
            return Err("现有 relations Frontmatter 结构无法安全编辑，请先转换为块映射".into());
        }
        lines.insert(frontmatter_end, "relations:".into());
        lines.insert(
            frontmatter_end + 1,
            format!("  {relation_type}: \"{syntax}\""),
        );
        return Ok(join_markdown_lines(&lines, newline, trailing_newline));
    };

    let block_end = ((relations_index + 1)..frontmatter_end)
        .find(|index| {
            let line = &lines[*index];
            !line.trim().is_empty() && !line.starts_with(' ') && !line.starts_with('\t')
        })
        .unwrap_or(frontmatter_end);
    let relation_line = ((relations_index + 1)..block_end).find(|index| {
        lines[*index]
            .trim()
            .split_once(':')
            .and_then(|(key, _)| normalize_relation_type(key))
            .is_some_and(|value| value == relation_type)
    });
    if let Some(index) = relation_line {
        let mut syntaxes: Vec<String> = extract_wikilink_mentions(content)
            .into_iter()
            .filter(|mention| mention.line == index + 1 && mention.relation_type == relation_type)
            .map(|mention| mention.syntax)
            .collect();
        syntaxes.push(syntax);
        lines[index] = format!("  {relation_type}: \"{}\"", syntaxes.join(" "));
    } else {
        lines.insert(block_end, format!("  {relation_type}: \"{syntax}\""));
    }
    Ok(join_markdown_lines(&lines, newline, trailing_newline))
}

fn remove_frontmatter_relation(
    content: &str,
    relation_type: &str,
    expected_line: usize,
    expected_syntax: &str,
) -> Result<String, String> {
    if expected_line == 0
        || expected_syntax.len() > 500
        || !expected_syntax.starts_with("[[")
        || !expected_syntax.ends_with("]]")
    {
        return Err("待删除关系的证据无效".into());
    }
    let (mut lines, newline, trailing_newline) = split_markdown_lines(content);
    let index = expected_line - 1;
    let line = lines.get(index).ok_or("关系位置已变化，请刷新图谱")?;
    let key_matches = line
        .trim()
        .split_once(':')
        .and_then(|(key, _)| normalize_relation_type(key))
        .is_some_and(|value| value == relation_type);
    if !key_matches || !line.contains(expected_syntax) {
        return Err("关系内容已被修改，请刷新图谱后重试".into());
    }
    lines[index] = line.replacen(expected_syntax, "", 1);
    let value_empty = lines[index].split_once(':').is_some_and(|(_, value)| {
        value
            .trim()
            .trim_matches(|character: char| matches!(character, '"' | '\''))
            .trim()
            .is_empty()
    });
    if value_empty {
        lines.remove(index);
    } else {
        lines[index] = lines[index].trim_end().to_string();
    }
    Ok(join_markdown_lines(&lines, newline, trailing_newline))
}

fn replace_at_line(
    content: &str,
    line_number: usize,
    expected_syntax: &str,
    replacement_target: &str,
) -> Result<String, String> {
    let mut lines: Vec<String> = content.split_inclusive('\n').map(str::to_string).collect();
    if !content.is_empty() && lines.is_empty() {
        lines.push(content.to_string());
    }
    let line = lines
        .get_mut(line_number - 1)
        .ok_or("修复位置已变化，请重新扫描")?;
    if !line.contains(expected_syntax) {
        return Err("链接内容已被修改，请重新扫描后再修复".into());
    }
    let alias = expected_syntax
        .strip_prefix("[[")
        .and_then(|value| value.strip_suffix("]]"))
        .and_then(|value| value.split_once('|').map(|(_, alias)| alias.trim()))
        .filter(|value| !value.is_empty());
    let replacement = alias
        .map(|value| format!("[[{}|{}]]", replacement_target, value))
        .unwrap_or_else(|| format!("[[{}]]", replacement_target));
    *line = line.replacen(expected_syntax, &replacement, 1);
    Ok(lines.concat())
}

#[derive(Serialize, Clone)]
pub struct Backlink {
    title: String,
    path: String,
    context: String,
}

#[tauri::command]
pub async fn extract_wikilinks(content: String) -> Result<Vec<String>, String> {
    Ok(extract_wikilink_mentions(&content)
        .into_iter()
        .map(|mention| mention.target)
        .collect())
}

#[tauri::command]
pub async fn find_backlinks(
    file_path: String,
    library_root: String,
) -> Result<Vec<Backlink>, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let target = guard.resolve_existing_file(file_path, &["md"])?;
    let target_stem = target
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let mut results = Vec::new();
    find_backlinks_recursive(guard.root(), &target_stem, &mut results);
    Ok(results)
}

fn find_backlinks_recursive(dir: &Path, target: &str, results: &mut Vec<Backlink>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            find_backlinks_recursive(&path, target, results);
        } else if name.ends_with(".md") {
            let Some(mention) = fs::read_to_string(&path).ok().and_then(|content| {
                extract_wikilink_mentions(&content)
                    .into_iter()
                    .find(|mention| wikilink_matches_stem(&mention.target, target))
            }) else {
                continue;
            };
            results.push(Backlink {
                title: name.trim_end_matches(".md").to_string(),
                path: path.to_string_lossy().into_owned(),
                context: mention.context,
            });
        }
    }
}

fn wikilink_matches_stem(link: &str, target_stem: &str) -> bool {
    let normalized = link.replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);
    file_name
        .strip_suffix(".md")
        .unwrap_or(file_name)
        .eq_ignore_ascii_case(target_stem)
}

#[derive(Serialize)]
pub struct LibraryStats {
    file_count: usize,
    total_chars: usize,
    total_words: usize,
}

#[tauri::command]
pub async fn get_library_stats(path: String) -> Result<LibraryStats, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Ok(LibraryStats {
            file_count: 0,
            total_chars: 0,
            total_words: 0,
        });
    }
    let mut stats = LibraryStats {
        file_count: 0,
        total_chars: 0,
        total_words: 0,
    };
    count_stats(root, &mut stats);
    Ok(stats)
}

fn count_stats(dir: &Path, stats: &mut LibraryStats) {
    count_stats_impl(dir, stats, &mut HashSet::new())
}

fn count_stats_impl(dir: &Path, stats: &mut LibraryStats, visited: &mut HashSet<PathBuf>) {
    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            count_stats_impl(&path, stats, visited);
        } else if name.ends_with(".md") {
            stats.file_count += 1;
            if let Ok(content) = fs::read_to_string(path) {
                stats.total_chars += content.chars().count();
                stats.total_words += content.split_whitespace().count();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-graph-health-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("workspace");
        fs::create_dir_all(&root).unwrap();
        (base, root)
    }

    #[test]
    fn detects_broken_ambiguous_and_orphan_notes() {
        let (base, root) = fixture("analysis");
        fs::create_dir_all(root.join("one")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();
        fs::write(root.join("Source.md"), "[[Missing]]\n[[Dup]]").unwrap();
        fs::write(root.join("one/Dup.md"), "duplicate one").unwrap();
        fs::write(root.join("two/Dup.md"), "duplicate two").unwrap();
        fs::write(root.join("Orphan.md"), "standalone").unwrap();

        let report = analyze_workspace(&root).unwrap();
        assert_eq!(report.broken_links.len(), 1);
        assert_eq!(report.ambiguous_links.len(), 1);
        assert_eq!(report.ambiguous_links[0].candidates.len(), 2);
        assert!(report
            .orphan_notes
            .iter()
            .any(|note| note.title == "Orphan"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn repairs_link_safely_and_preserves_alias() {
        let (base, root) = fixture("repair");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        fs::write(&source, "中文上下文 [[Targt|目标笔记]]\n").unwrap();
        fs::write(&target, "target").unwrap();
        let result = tauri::async_runtime::block_on(repair_graph_links(
            root.to_string_lossy().into_owned(),
            vec![GraphLinkRepair {
                source_path: source.to_string_lossy().into_owned(),
                target_path: target.to_string_lossy().into_owned(),
                line: 1,
                expected_syntax: "[[Targt|目标笔记]]".into(),
            }],
        ))
        .unwrap();
        assert_eq!(result.repaired_links, 1);
        assert_eq!(
            fs::read_to_string(&source).unwrap(),
            "中文上下文 [[Target|目标笔记]]\n"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn repair_rejects_outside_target_and_stale_syntax() {
        let (base, root) = fixture("guard");
        let source = root.join("Source.md");
        let outside = base.join("Outside.md");
        fs::write(&source, "[[Missing]]").unwrap();
        fs::write(&outside, "outside").unwrap();
        let outside_result = tauri::async_runtime::block_on(repair_graph_links(
            root.to_string_lossy().into_owned(),
            vec![GraphLinkRepair {
                source_path: source.to_string_lossy().into_owned(),
                target_path: outside.to_string_lossy().into_owned(),
                line: 1,
                expected_syntax: "[[Missing]]".into(),
            }],
        ));
        assert!(outside_result.is_err());
        assert!(replace_at_line("[[Changed]]", 1, "[[Missing]]", "Target").is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn graph_relation_editor_adds_removes_and_preserves_markdown() {
        let original = "---\r\ntype: project\r\n---\r\n# 项目\r\n正文\r\n";
        let added = add_frontmatter_relation(original, "depends-on", "docs/Target").unwrap();
        assert!(added.contains("relations:\r\n  depends-on: \"[[docs/Target]]\""));
        assert!(added.ends_with("# 项目\r\n正文\r\n"));
        let with_second = add_frontmatter_relation(&added, "depends-on", "docs/Other").unwrap();
        assert!(with_second.contains("depends-on: \"[[docs/Target]] [[docs/Other]]\""));
        let mention = extract_wikilink_mentions(&added)
            .into_iter()
            .find(|item| item.relation_type == "depends-on")
            .unwrap();
        let removed =
            remove_frontmatter_relation(&added, "depends-on", mention.line, &mention.syntax)
                .unwrap();
        assert!(!removed.contains("depends-on:"));
        assert!(removed.contains("type: project"));
        assert!(add_frontmatter_relation(&added, "depends-on", "docs/Target").is_err());
    }

    #[test]
    fn graph_relation_editor_rejects_unsupported_frontmatter() {
        let inline = "---\nrelations: { related: '[[Existing]]' }\ntype: note\n---\nBody\n";
        assert!(add_frontmatter_relation(inline, "related", "Target").is_err());
    }

    #[test]
    fn graph_relation_command_rejects_stale_signature_and_outside_target() {
        let (base, root) = fixture("relation-edit");
        let source = root.join("Source.md");
        let target = root.join("Target.md");
        let outside = base.join("Outside.md");
        fs::write(&source, "# Source\n").unwrap();
        fs::write(&target, "# Target\n").unwrap();
        fs::write(&outside, "# Outside\n").unwrap();
        let stale = tauri::async_runtime::block_on(update_graph_relation(
            root.to_string_lossy().into_owned(),
            GraphRelationMutation {
                source_path: source.to_string_lossy().into_owned(),
                target_path: target.to_string_lossy().into_owned(),
                relation_type: "related".into(),
                action: "add".into(),
                expected_signature: "00000000000000000000000000000000".into(),
                expected_line: None,
                expected_syntax: None,
            },
        ));
        assert!(stale.is_err());
        let outside_result = tauri::async_runtime::block_on(update_graph_relation(
            root.to_string_lossy().into_owned(),
            GraphRelationMutation {
                source_path: source.to_string_lossy().into_owned(),
                target_path: outside.to_string_lossy().into_owned(),
                relation_type: "related".into(),
                action: "add".into(),
                expected_signature: format!("{:x}", md5::compute(b"# Source\n")),
                expected_line: None,
                expected_syntax: None,
            },
        ));
        assert!(outside_result.is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn backlink_matching_handles_paths_extensions_and_case() {
        assert!(wikilink_matches_stem("folder/Target.md", "target"));
        assert!(wikilink_matches_stem("folder\\Target", "TARGET"));
        assert!(!wikilink_matches_stem("Target copy", "Target"));
    }

    #[test]
    fn library_stats_ignore_hidden_workspaces_and_non_markdown_files() {
        let (base, root) = fixture("stats");
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join("One.md"), "one two").unwrap();
        fs::write(root.join("data.csv"), "one,two").unwrap();
        fs::write(root.join(".hidden/Secret.md"), "hidden words").unwrap();
        let mut stats = LibraryStats {
            file_count: 0,
            total_chars: 0,
            total_words: 0,
        };
        count_stats(&root, &mut stats);
        assert_eq!(stats.file_count, 1);
        assert_eq!(stats.total_words, 2);
        fs::remove_dir_all(base).unwrap();
    }

    fn graph_node(id: &str) -> GraphNode {
        GraphNode::test_node(id)
    }

    #[test]
    fn local_graph_respects_requested_depth_and_unknown_centers() {
        let graph = GraphData {
            nodes: vec![
                graph_node("a"),
                graph_node("b"),
                graph_node("c"),
                graph_node("d"),
            ],
            edges: vec![
                GraphEdge::test_edge("a", "b"),
                GraphEdge::test_edge("b", "c"),
                GraphEdge::test_edge("c", "d"),
            ],
        };
        let one_hop = filter_graph_by_depth(graph.clone(), "a", 1);
        assert_eq!(one_hop.nodes.len(), 2);
        assert_eq!(one_hop.edges.len(), 1);
        let two_hops = filter_graph_by_depth(graph.clone(), "a", 2);
        assert_eq!(two_hops.nodes.len(), 3);
        assert_eq!(two_hops.edges.len(), 2);
        let missing = filter_graph_by_depth(graph, "missing", 2);
        assert!(missing.nodes.is_empty());
        assert!(missing.edges.is_empty());
    }

    #[test]
    fn repeated_relations_merge_without_losing_evidence() {
        let mentions = extract_wikilink_mentions("第一处 [[目标]]\n第二处 [[目标|别名]]");
        let merged = merge_graph_edges(vec![
            GraphEdge::wikilink("source".into(), "target".into(), mentions[0].clone()),
            GraphEdge::wikilink("source".into(), "target".into(), mentions[1].clone()),
        ]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].mentions.len(), 2);
        assert_eq!(merged[0].mentions[1].alias.as_deref(), Some("别名"));
        let value = serde_json::to_value(&merged[0]).unwrap();
        assert_eq!(value["relationType"], "links-to");
        assert_eq!(value["mentions"][0]["line"], 1);
    }

    #[test]
    fn related_frontmatter_relation_is_undirected() {
        let mention =
            extract_wikilink_mentions("---\nrelations:\n  related: [[图谱交互设计]]\n---")
                .remove(0);
        let edge = GraphEdge::wikilink("source".into(), "target".into(), mention);
        assert_eq!(edge.relation_type, "related");
        assert!(!edge.directed);
    }

    #[test]
    fn graph_nodes_include_filter_metadata() {
        let (base, root) = fixture("metadata");
        let sub = root.join("research");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("Target.md"), "# Target").unwrap();
        fs::write(sub.join("Paper.pdf"), b"%PDF fixture without text").unwrap();
        fs::write(
            sub.join("Metrics.csv"),
            "metric,value\nKnowledge coverage,92\n",
        )
        .unwrap();
        fs::write(
            sub.join("Planning.table.json"),
            r#"{"schemaVersion":1,"kind":"longedit.table","data":{"columns":[{"id":"topic","name":"主题","type":"text"}],"rows":[{"id":"row-1","values":{"topic":"Roadmap"}}]},"views":[{"id":"grid","name":"表格","kind":"grid","config":{"filter":"","frozenColumns":1,"columnWidths":{"topic":160}}}],"activeView":"grid"}"#,
        )
        .unwrap();
        fs::write(
            sub.join("Topic.md"),
            "---\nrelations:\n  depends-on: [[Target]]\n---\n# Topic\n#研究 #图谱\n[来源](longedit://pdf?path=research%2FPaper.pdf&page=2&annotation=a-1)",
        )
        .unwrap();
        let graph =
            tauri::async_runtime::block_on(build_link_graph(root.to_string_lossy().into_owned()))
                .unwrap();
        let topic = graph
            .nodes
            .iter()
            .find(|node| node.title == "Topic")
            .unwrap();
        assert_eq!(topic.directory, "research");
        assert_eq!(topic.tags, vec!["图谱", "研究"]);
        assert!(topic.modified_at > 0);
        let pdf = graph
            .nodes
            .iter()
            .find(|node| node.object_type == "pdf")
            .unwrap();
        let table = graph
            .nodes
            .iter()
            .find(|node| node.title == "Planning")
            .unwrap();
        assert_eq!(table.search_text, "主题\nRoadmap");
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.source == topic.id && edge.relation_type == "depends-on"));
        assert!(graph.edges.iter().any(|edge| edge.source == topic.id
            && edge.target == pdf.id
            && edge.relation_type == "annotates"));
        fs::remove_dir_all(base).unwrap();
    }
}
