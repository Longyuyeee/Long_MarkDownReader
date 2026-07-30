use crate::commands::graph::GraphData;
use crate::formats::docx::parse_docx;
use crate::formats::file_registry::{file_format_for_path, is_sensitive_path};
use crate::formats::odf_content::{odf_content_search_segments, parse_odf_content};
use crate::formats::odt::parse_odt;
use crate::formats::opml::{opml_search_text, parse_opml};
use crate::formats::pptx::{parse_pptx, pptx_search_segments};
use crate::formats::table::{parse_internal_table, table_search_text};
use crate::services::pdf_index::load_pdf_index;
use crate::services::reliable_write::write_utf8;
use chardetng::EncodingDetector;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub const KNOWLEDGE_INDEX_SCHEMA_VERSION: u32 = 1;
const INDEX_DIRECTORY: &str = "knowledge-index-v1";
const INDEX_FILE: &str = "snapshot.json";
const MAX_INDEX_BYTES: u64 = 128 * 1024 * 1024;
const MAX_INDEX_SOURCES: usize = 100_000;
const MAX_INDEX_OBJECTS: usize = 250_000;
const MAX_INDEX_RELATIONS: usize = 500_000;
const MAX_INDEX_SEARCH_SEGMENTS: usize = 500_000;
const MAX_INDEX_TEXT_FILE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexedSource {
    pub path: String,
    pub size: u64,
    pub modified_nanos: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedKnowledgeObject {
    pub id: String,
    pub title: String,
    pub path: String,
    pub object_type: String,
    pub search_text: String,
    pub parent_id: Option<String>,
    pub locator_kind: Option<String>,
    pub locator_object_id: Option<String>,
    pub locator_page: Option<u32>,
    pub location_label: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedRelation {
    pub source: String,
    pub target: String,
    pub relation_type: String,
    pub directed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedSearchSegment {
    pub title: String,
    pub path: String,
    pub object_type: String,
    pub match_kind: String,
    pub text: String,
    pub page: Option<u32>,
    pub annotation_id: Option<String>,
    #[serde(default)]
    pub locator_kind: Option<String>,
    #[serde(default)]
    pub locator_object_id: Option<String>,
    #[serde(default)]
    pub location_label: Option<String>,
    pub extraction_failed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexSnapshot {
    pub schema_version: u32,
    pub workspace_fingerprint: String,
    pub source_digest: String,
    pub built_at: u64,
    pub sources: Vec<IndexedSource>,
    pub objects: Vec<IndexedKnowledgeObject>,
    pub relations: Vec<IndexedRelation>,
    #[serde(default)]
    pub search_segments: Vec<IndexedSearchSegment>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexStatus {
    pub state: String,
    pub schema_version: u32,
    pub built_at: Option<u64>,
    pub source_count: usize,
    pub object_count: usize,
    pub relation_count: usize,
    pub progress: u8,
    pub cache_bytes: u64,
    pub error: Option<String>,
}

impl KnowledgeIndexStatus {
    fn simple(state: &str) -> Self {
        Self {
            state: state.into(),
            schema_version: KNOWLEDGE_INDEX_SCHEMA_VERSION,
            built_at: None,
            source_count: 0,
            object_count: 0,
            relation_count: 0,
            progress: if state == "ready" { 100 } else { 0 },
            cache_bytes: 0,
            error: None,
        }
    }
}

#[derive(Clone, Debug)]
struct RuntimeStatus {
    state: String,
    progress: u8,
    error: Option<String>,
}

#[derive(Default)]
pub struct KnowledgeIndexRuntime {
    states: Mutex<HashMap<String, RuntimeStatus>>,
}

impl KnowledgeIndexRuntime {
    pub fn set(&self, workspace: &Path, state: &str, progress: u8, error: Option<String>) {
        let key = workspace.to_string_lossy().into_owned();
        self.states
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(
                key,
                RuntimeStatus {
                    state: state.into(),
                    progress,
                    error,
                },
            );
    }

    fn get(&self, workspace: &Path) -> Option<RuntimeStatus> {
        self.states
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(workspace.to_string_lossy().as_ref())
            .cloned()
    }

    pub fn is_building(&self, workspace: &Path) -> bool {
        self.get(workspace)
            .is_some_and(|status| status.state == "building")
    }

    pub fn blocks_index_reads(&self, workspace: &Path) -> bool {
        self.get(workspace)
            .is_some_and(|status| status.state == "building" || status.state == "error")
    }
}

pub fn index_workspace_directory(cache_root: &Path, workspace: &Path) -> PathBuf {
    let fingerprint = workspace_fingerprint(workspace);
    cache_root.join(INDEX_DIRECTORY).join(fingerprint)
}

pub fn index_snapshot_path(cache_root: &Path, workspace: &Path) -> PathBuf {
    index_workspace_directory(cache_root, workspace).join(INDEX_FILE)
}

pub fn workspace_fingerprint(workspace: &Path) -> String {
    format!("{:x}", md5::compute(workspace.to_string_lossy().as_bytes()))
}

pub fn collect_index_sources(workspace: &Path) -> Vec<IndexedSource> {
    let mut sources = Vec::new();
    collect_sources_recursive(workspace, workspace, &mut sources);
    sources.sort_by(|left, right| left.path.cmp(&right.path));
    sources
}

fn collect_sources_recursive(workspace: &Path, directory: &Path, sources: &mut Vec<IndexedSource>) {
    let Ok(entries) = fs::read_dir(directory) else {
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
        if name.starts_with('.') || name.ends_with(".assets") || is_sensitive_path(&path) {
            continue;
        }
        if path.is_dir() {
            collect_sources_recursive(workspace, &path, sources);
            continue;
        }
        let is_sidecar = name.ends_with(".annotations.json") || name.ends_with(".ocr.json");
        let is_indexed_format = file_format_for_path(&path)
            .ok()
            .is_some_and(|format| format.capabilities.index.is_supported());
        if !is_sidecar && !is_indexed_format {
            continue;
        }
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        let modified_nanos = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_nanos().min(u64::MAX as u128) as u64)
            .unwrap_or(0);
        let relative = path
            .strip_prefix(workspace)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        sources.push(IndexedSource {
            path: relative,
            size: metadata.len(),
            modified_nanos,
        });
    }
}

pub fn source_digest(sources: &[IndexedSource]) -> String {
    let encoded = serde_json::to_vec(sources).unwrap_or_default();
    format!("{:x}", md5::compute(encoded))
}

fn source_title(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

pub(crate) fn build_pptx_index_segments(
    title: &str,
    path: &str,
    object_type: &str,
    bytes: &[u8],
) -> Result<Vec<IndexedSearchSegment>, String> {
    let model = parse_pptx(bytes)?;
    let mut segments = vec![IndexedSearchSegment {
        title: title.into(),
        path: path.into(),
        object_type: object_type.into(),
        match_kind: "title".into(),
        text: String::new(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        extraction_failed: false,
    }];
    segments.extend(
        pptx_search_segments(&model)
            .into_iter()
            .map(|segment| IndexedSearchSegment {
                title: title.into(),
                path: path.into(),
                object_type: object_type.into(),
                match_kind: segment.match_kind,
                text: segment.text,
                page: Some(segment.slide_number),
                annotation_id: None,
                locator_kind: Some(segment.locator_kind),
                locator_object_id: Some(segment.locator_object_id),
                location_label: Some(segment.location_label),
                extraction_failed: false,
            }),
    );
    Ok(segments)
}

pub(crate) fn build_odf_content_index_segments(
    title: &str,
    path: &str,
    object_type: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<Vec<IndexedSearchSegment>, String> {
    let model = parse_odf_content(bytes, extension)?;
    let mut segments = vec![IndexedSearchSegment {
        title: title.into(),
        path: path.into(),
        object_type: object_type.into(),
        match_kind: "title".into(),
        text: String::new(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        extraction_failed: false,
    }];
    segments.extend(
        odf_content_search_segments(&model)
            .into_iter()
            .map(|segment| IndexedSearchSegment {
                title: title.into(),
                path: path.into(),
                object_type: object_type.into(),
                match_kind: segment.match_kind,
                text: segment.text,
                page: segment.page,
                annotation_id: None,
                locator_kind: Some(segment.locator_kind),
                locator_object_id: Some(segment.locator_object_id),
                location_label: Some(segment.location_label),
                extraction_failed: false,
            }),
    );
    Ok(segments)
}

fn decode_searchable_text(path: &Path, indexer: &str) -> Option<String> {
    let bytes = path
        .metadata()
        .ok()
        .filter(|metadata| metadata.len() <= MAX_INDEX_TEXT_FILE_BYTES)
        .and_then(|_| fs::read(path).ok())?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    if indexer == "opml" {
        parse_opml(text)
            .ok()
            .map(|document| opml_search_text(&document))
    } else if path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".table.json")
    {
        parse_internal_table(text)
            .ok()
            .map(|table| table_search_text(&table, MAX_INDEX_TEXT_FILE_BYTES as usize))
    } else {
        Some(text.to_string())
    }
}

fn build_search_segments(workspace: &Path, sources: &[IndexedSource]) -> Vec<IndexedSearchSegment> {
    let mut segments = Vec::new();
    for source in sources {
        if source.path.ends_with(".annotations.json") || source.path.ends_with(".ocr.json") {
            continue;
        }
        let path = workspace.join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if is_sensitive_path(&path) {
            continue;
        }
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        let Some(indexer) = format.adapters.indexer.as_deref() else {
            continue;
        };
        let title = source_title(&path);
        let path_string = path.to_string_lossy().into_owned();
        if indexer == "pdf" {
            let index = load_pdf_index(&path);
            segments.push(IndexedSearchSegment {
                title: title.clone(),
                path: path_string.clone(),
                object_type: format.id.clone(),
                match_kind: "title".into(),
                text: String::new(),
                page: None,
                annotation_id: None,
                locator_kind: None,
                locator_object_id: None,
                location_label: None,
                extraction_failed: index.extraction_failed,
            });
            for (page, text) in index.pages.into_iter().enumerate() {
                if !text.trim().is_empty() {
                    segments.push(IndexedSearchSegment {
                        title: title.clone(),
                        path: path_string.clone(),
                        object_type: format.id.clone(),
                        match_kind: "body".into(),
                        text,
                        page: Some((page + 1) as u32),
                        annotation_id: None,
                        locator_kind: None,
                        locator_object_id: None,
                        location_label: None,
                        extraction_failed: index.extraction_failed,
                    });
                }
            }
            for page in index.ocr_pages {
                segments.push(IndexedSearchSegment {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "ocr".into(),
                    text: page.text,
                    page: Some(page.page),
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    extraction_failed: index.extraction_failed,
                });
            }
            for annotation in index.annotations {
                segments.push(IndexedSearchSegment {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "annotation".into(),
                    text: annotation.text,
                    page: Some(annotation.page),
                    annotation_id: Some(annotation.id),
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    extraction_failed: index.extraction_failed,
                });
            }
        } else if indexer == "docx" {
            let model = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| parse_docx(&bytes).ok());
            if let Some(model) = model {
                segments.push(IndexedSearchSegment {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "title".into(),
                    text: String::new(),
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    extraction_failed: false,
                });
                for (index, block) in model.blocks.into_iter().enumerate() {
                    if block.text.trim().is_empty() {
                        continue;
                    }
                    let location_label = match block.kind.as_str() {
                        "heading" => format!("标题：{}", block.text),
                        "table" => format!("表格 {}", index + 1),
                        "list-item" => format!("列表项 {}", index + 1),
                        _ => format!("段落 {}", index + 1),
                    };
                    segments.push(IndexedSearchSegment {
                        title: title.clone(),
                        path: path_string.clone(),
                        object_type: format.id.clone(),
                        match_kind: "body".into(),
                        text: block.text,
                        page: None,
                        annotation_id: None,
                        locator_kind: Some("docx-block".into()),
                        locator_object_id: Some(block.id),
                        location_label: Some(location_label),
                        extraction_failed: false,
                    });
                }
                for item in model.related_content {
                    segments.push(IndexedSearchSegment {
                        title: title.clone(),
                        path: path_string.clone(),
                        object_type: format.id.clone(),
                        match_kind: "related".into(),
                        text: item.text,
                        page: None,
                        annotation_id: None,
                        locator_kind: Some(format!("docx-{}", item.kind)),
                        locator_object_id: Some(item.id),
                        location_label: Some(item.label),
                        extraction_failed: false,
                    });
                }
            }
        } else if indexer == "odt" {
            let model = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| parse_odt(&bytes).ok());
            if let Some(model) = model {
                segments.push(IndexedSearchSegment {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "title".into(),
                    text: String::new(),
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    extraction_failed: false,
                });
                for (index, block) in model.blocks.into_iter().enumerate() {
                    if block.text.trim().is_empty() {
                        continue;
                    }
                    let location_label = match block.kind.as_str() {
                        "heading" => format!("标题：{}", block.text),
                        "table" => format!("表格 {}", index + 1),
                        "list-item" => format!("列表项 {}", index + 1),
                        _ => format!("段落 {}", index + 1),
                    };
                    segments.push(IndexedSearchSegment {
                        title: title.clone(),
                        path: path_string.clone(),
                        object_type: format.id.clone(),
                        match_kind: "body".into(),
                        text: block.text,
                        page: None,
                        annotation_id: None,
                        locator_kind: Some("odt-block".into()),
                        locator_object_id: Some(block.id),
                        location_label: Some(location_label),
                        extraction_failed: false,
                    });
                }
            }
        } else if indexer == "odf-content" {
            if let Some(odf_segments) = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    let extension = path.extension()?.to_str()?;
                    build_odf_content_index_segments(
                        &title,
                        &path_string,
                        &format.id,
                        extension,
                        &bytes,
                    )
                    .ok()
                })
            {
                segments.extend(odf_segments);
            }
        } else if indexer == "pptx" {
            if let Some(pptx_segments) = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    build_pptx_index_segments(&title, &path_string, &format.id, &bytes).ok()
                })
            {
                segments.extend(pptx_segments);
            }
        } else if matches!(
            indexer,
            "markdown" | "text" | "json-text" | "table" | "opml"
        ) {
            if let Some(text) = decode_searchable_text(&path, indexer) {
                segments.push(IndexedSearchSegment {
                    title,
                    path: path_string,
                    object_type: format.id.clone(),
                    match_kind: "body".into(),
                    text,
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    extraction_failed: false,
                });
            }
        }
    }
    segments
}

pub fn snapshot_from_graph(workspace: &Path, graph: GraphData) -> KnowledgeIndexSnapshot {
    let sources = collect_index_sources(workspace);
    let source_digest = source_digest(&sources);
    let search_segments = build_search_segments(workspace, &sources);
    let mut objects: Vec<IndexedKnowledgeObject> = graph
        .nodes
        .into_iter()
        .map(|node| {
            let (locator_kind, locator_object_id, locator_page) = node
                .locator
                .map(|locator| (Some(locator.kind), Some(locator.object_id), locator.page))
                .unwrap_or((None, None, None));
            IndexedKnowledgeObject {
                id: node.id,
                title: node.title,
                path: node.path,
                object_type: node.object_type,
                search_text: node.search_text,
                parent_id: node.parent_id,
                locator_kind,
                locator_object_id,
                locator_page,
                location_label: node.location_label,
            }
        })
        .collect();
    let indexed_paths: HashSet<String> = objects
        .iter()
        .filter(|object| object.parent_id.is_none())
        .map(|object| object.path.clone())
        .collect();
    for source in &sources {
        if source.path.ends_with(".annotations.json") || source.path.ends_with(".ocr.json") {
            continue;
        }
        let path = workspace.join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if is_sensitive_path(&path) {
            continue;
        }
        let path_string = path.to_string_lossy().into_owned();
        if indexed_paths.contains(&path_string) {
            continue;
        }
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        if format.adapters.indexer.as_deref() != Some("text") || source.size > format.max_bytes {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let mut detector = EncodingDetector::new();
        detector.feed(&bytes, true);
        let encoding = detector.guess(None, true);
        let (content, _, _) = encoding.decode(&bytes);
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let title = name
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(&name)
            .to_string();
        objects.push(IndexedKnowledgeObject {
            id: path_string.clone(),
            title,
            path: path_string,
            object_type: format.id.clone(),
            search_text: content.chars().take(12_000).collect(),
            parent_id: None,
            locator_kind: None,
            locator_object_id: None,
            locator_page: None,
            location_label: None,
        });
    }
    let relations = graph
        .edges
        .into_iter()
        .map(|edge| IndexedRelation {
            source: edge.source,
            target: edge.target,
            relation_type: edge.relation_type,
            directed: edge.directed,
        })
        .collect();
    KnowledgeIndexSnapshot {
        schema_version: KNOWLEDGE_INDEX_SCHEMA_VERSION,
        workspace_fingerprint: workspace_fingerprint(workspace),
        source_digest,
        built_at: std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0),
        sources,
        objects,
        relations,
        search_segments,
    }
}

pub fn write_snapshot(
    cache_root: &Path,
    workspace: &Path,
    snapshot: &KnowledgeIndexSnapshot,
) -> Result<(), String> {
    if snapshot.sources.len() > MAX_INDEX_SOURCES
        || snapshot.objects.len() > MAX_INDEX_OBJECTS
        || snapshot.relations.len() > MAX_INDEX_RELATIONS
        || snapshot.search_segments.len() > MAX_INDEX_SEARCH_SEGMENTS
    {
        return Err("知识索引对象数量超过安全上限".into());
    }
    let directory = index_workspace_directory(cache_root, workspace);
    fs::create_dir_all(&directory).map_err(|error| format!("创建索引缓存目录失败: {error}"))?;
    let content =
        serde_json::to_string(snapshot).map_err(|error| format!("序列化知识索引失败: {error}"))?;
    if content.len() as u64 > MAX_INDEX_BYTES {
        return Err("知识索引快照不能超过 128 MB".into());
    }
    write_utf8(directory.join(INDEX_FILE), &content)
}

pub fn read_snapshot(
    cache_root: &Path,
    workspace: &Path,
) -> Result<Option<KnowledgeIndexSnapshot>, String> {
    let path = index_snapshot_path(cache_root, workspace);
    if !path.exists() {
        return Ok(None);
    }
    if path
        .metadata()
        .map(|metadata| metadata.len() > MAX_INDEX_BYTES)
        .unwrap_or(true)
    {
        return Err("知识索引快照大小无效".into());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("读取知识索引失败: {error}"))?;
    let snapshot: KnowledgeIndexSnapshot =
        serde_json::from_str(&content).map_err(|error| format!("知识索引已损坏: {error}"))?;
    if snapshot.schema_version != KNOWLEDGE_INDEX_SCHEMA_VERSION
        || snapshot.workspace_fingerprint != workspace_fingerprint(workspace)
        || snapshot.sources.len() > MAX_INDEX_SOURCES
        || snapshot.objects.len() > MAX_INDEX_OBJECTS
        || snapshot.relations.len() > MAX_INDEX_RELATIONS
        || snapshot.search_segments.len() > MAX_INDEX_SEARCH_SEGMENTS
    {
        return Err("知识索引版本、工作区标识或数量边界不匹配".into());
    }
    Ok(Some(snapshot))
}

pub fn read_ready_snapshot(
    cache_root: &Path,
    workspace: &Path,
    runtime_blocks_read: bool,
) -> Option<KnowledgeIndexSnapshot> {
    if runtime_blocks_read {
        return None;
    }
    let snapshot = read_snapshot(cache_root, workspace).ok().flatten()?;
    if snapshot.search_segments.is_empty()
        || source_digest(&collect_index_sources(workspace)) != snapshot.source_digest
    {
        return None;
    }
    Some(snapshot)
}

pub fn inspect_index(
    cache_root: &Path,
    workspace: &Path,
    runtime: &KnowledgeIndexRuntime,
) -> KnowledgeIndexStatus {
    if let Some(current) = runtime.get(workspace) {
        if current.state == "building" || current.state == "error" {
            let mut status = KnowledgeIndexStatus::simple(&current.state);
            status.progress = current.progress;
            status.error = current.error;
            return status;
        }
    }
    let path = index_snapshot_path(cache_root, workspace);
    let cache_bytes = path.metadata().map(|value| value.len()).unwrap_or(0);
    match read_snapshot(cache_root, workspace) {
        Ok(None) => KnowledgeIndexStatus::simple("missing"),
        Err(error) => {
            let mut status = KnowledgeIndexStatus::simple("corrupt");
            status.cache_bytes = cache_bytes;
            status.error = Some(error);
            status
        }
        Ok(Some(snapshot)) => {
            let current_sources = collect_index_sources(workspace);
            let state = if source_digest(&current_sources) == snapshot.source_digest {
                "ready"
            } else {
                "stale"
            };
            KnowledgeIndexStatus {
                state: state.into(),
                schema_version: snapshot.schema_version,
                built_at: Some(snapshot.built_at),
                source_count: snapshot.sources.len(),
                object_count: snapshot.objects.len(),
                relation_count: snapshot.relations.len(),
                progress: if state == "ready" { 100 } else { 0 },
                cache_bytes,
                error: None,
            }
        }
    }
}

pub fn delete_index(cache_root: &Path, workspace: &Path) -> Result<(), String> {
    let directory = index_workspace_directory(cache_root, workspace);
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| format!("删除知识索引失败: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::graph::{GraphEdge, GraphNode};

    fn fixture(name: &str) -> (PathBuf, PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-index-cache-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let workspace = base.join("workspace");
        let cache = base.join("cache");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&cache).unwrap();
        (base, workspace, cache)
    }

    #[test]
    fn snapshot_round_trip_detects_staleness_and_deletion() {
        let (base, workspace, cache) = fixture("lifecycle");
        fs::write(workspace.join("One.md"), "# One").unwrap();
        fs::write(workspace.join("Flow.mmd"), "flowchart TD\nA --> B").unwrap();
        let graph = GraphData {
            nodes: vec![GraphNode::test_node("one")],
            edges: vec![GraphEdge::test_edge("one", "one")],
        };
        let snapshot = snapshot_from_graph(&workspace, graph);
        write_snapshot(&cache, &workspace, &snapshot).unwrap();
        let runtime = KnowledgeIndexRuntime::default();
        let ready = inspect_index(&cache, &workspace, &runtime);
        assert_eq!(ready.state, "ready");
        assert_eq!(ready.object_count, 2);
        assert!(read_snapshot(&cache, &workspace)
            .unwrap()
            .unwrap()
            .objects
            .iter()
            .any(
                |object| object.object_type == "diagram" && object.search_text.contains("A --> B")
            ));
        fs::write(workspace.join("Two.md"), "# Two").unwrap();
        assert_eq!(inspect_index(&cache, &workspace, &runtime).state, "stale");
        delete_index(&cache, &workspace).unwrap();
        assert_eq!(inspect_index(&cache, &workspace, &runtime).state, "missing");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn damaged_or_incompatible_snapshot_is_corrupt() {
        let (base, workspace, cache) = fixture("corrupt");
        let directory = index_workspace_directory(&cache, &workspace);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(INDEX_FILE), "{not-json").unwrap();
        let runtime = KnowledgeIndexRuntime::default();
        assert_eq!(inspect_index(&cache, &workspace, &runtime).state, "corrupt");

        let mut snapshot = snapshot_from_graph(
            &workspace,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        snapshot.schema_version += 1;
        fs::write(
            directory.join(INDEX_FILE),
            serde_json::to_string(&snapshot).unwrap(),
        )
        .unwrap();
        assert_eq!(inspect_index(&cache, &workspace, &runtime).state, "corrupt");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn sensitive_files_never_enter_index_sources_or_search_segments() {
        let (base, workspace, _) = fixture("sensitive-exclusion");
        fs::write(
            workspace.join("public.yaml"),
            "message: searchable-public-value",
        )
        .unwrap();
        fs::write(
            workspace.join("deploy-secrets.yaml"),
            "password: never-index-this-secret",
        )
        .unwrap();
        fs::write(workspace.join(".env"), "API_TOKEN=never-index-this-env").unwrap();

        let snapshot = snapshot_from_graph(
            &workspace,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        assert!(snapshot
            .sources
            .iter()
            .any(|source| source.path == "public.yaml"));
        assert!(!snapshot
            .sources
            .iter()
            .any(|source| source.path.contains("secret") || source.path.contains(".env")));
        assert!(snapshot
            .search_segments
            .iter()
            .any(|segment| segment.text.contains("searchable-public-value")));
        assert!(!snapshot.search_segments.iter().any(|segment| {
            segment.text.contains("never-index-this-secret")
                || segment.text.contains("never-index-this-env")
        }));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn real_ods_and_odp_enter_persistent_search_with_precise_locators() {
        let (base, workspace, _) = fixture("odf-content");
        let fixture_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("odf-content");
        fs::copy(
            fixture_root.join("longedit-e1c-spreadsheet.ods"),
            workspace.join("Evidence.ods"),
        )
        .unwrap();
        fs::copy(
            fixture_root.join("longedit-e1c-presentation.odp"),
            workspace.join("Briefing.odp"),
        )
        .unwrap();
        let snapshot = snapshot_from_graph(
            &workspace,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        assert!(snapshot.search_segments.iter().any(|segment| {
            segment.object_type == "ods"
                && segment.locator_kind.as_deref() == Some("ods-cell")
                && segment.text.contains("LongEdit E1C ODS fixture")
        }));
        assert!(snapshot.search_segments.iter().any(|segment| {
            segment.object_type == "odp"
                && segment.locator_kind.as_deref() == Some("odp-slide")
                && segment.text.contains("LongEdit E1C ODP fixture")
        }));
        fs::remove_dir_all(base).unwrap();
    }
}
