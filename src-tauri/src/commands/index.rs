use crate::formats::docx::parse_docx;
use crate::formats::file_registry::{file_format_for_path, is_sensitive_path};
use crate::formats::odt::parse_odt;
use crate::formats::opml::{opml_search_text, parse_opml};
use crate::formats::table::{parse_internal_table, table_search_text};
use crate::services::knowledge_index::{
    build_pptx_index_segments, delete_index, inspect_index, read_ready_snapshot,
    snapshot_from_graph, write_snapshot, IndexedSearchSegment, KnowledgeIndexRuntime,
    KnowledgeIndexStatus,
};
use crate::services::pdf_index::load_pdf_index;
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

const MAX_SEARCH_RESULTS: usize = 200;
const MAX_TEXT_FILE_BYTES: u64 = 20 * 1024 * 1024;

fn knowledge_index_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map_err(|error| format!("无法定位应用缓存目录: {error}"))
}

#[tauri::command]
pub fn get_knowledge_index_status(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let cache_root = knowledge_index_cache_root(&app)?;
    Ok(inspect_index(&cache_root, guard.root(), &runtime))
}

#[tauri::command]
pub async fn rebuild_knowledge_index(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let workspace = guard.root().to_path_buf();
    let cache_root = knowledge_index_cache_root(&app)?;
    if runtime.is_building(&workspace) {
        return Err("知识索引正在构建，请稍后再试".into());
    }
    runtime.set(&workspace, "building", 10, None);
    let graph =
        match crate::commands::graph::build_link_graph(workspace.to_string_lossy().into_owned())
            .await
        {
            Ok(graph) => graph,
            Err(error) => {
                runtime.set(&workspace, "error", 0, Some(error.clone()));
                return Err(error);
            }
        };
    runtime.set(&workspace, "building", 75, None);
    let workspace_for_task = workspace.clone();
    let cache_for_task = cache_root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let snapshot = snapshot_from_graph(&workspace_for_task, graph);
        write_snapshot(&cache_for_task, &workspace_for_task, &snapshot)
    })
    .await;
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            let error = format!("知识索引写入任务失败: {error}");
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    if let Err(error) = result {
        runtime.set(&workspace, "error", 0, Some(error.clone()));
        return Err(error);
    }
    runtime.set(&workspace, "ready", 100, None);
    Ok(inspect_index(&cache_root, &workspace, &runtime))
}

#[tauri::command]
pub fn delete_knowledge_index(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let workspace = guard.root();
    let cache_root = knowledge_index_cache_root(&app)?;
    if runtime.is_building(workspace) {
        return Err("知识索引正在构建，暂时不能删除".into());
    }
    delete_index(&cache_root, workspace)?;
    runtime.set(workspace, "missing", 0, None);
    Ok(inspect_index(&cache_root, workspace, &runtime))
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub title: String,
    pub path: String,
    pub object_type: String,
    pub match_kind: String,
    pub context: String,
    pub page: Option<u32>,
    pub annotation_id: Option<String>,
    pub locator_kind: Option<String>,
    pub locator_object_id: Option<String>,
    pub location_label: Option<String>,
    pub score: u32,
    pub extraction_failed: bool,
}

fn snippet(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut result = collapsed.chars().take(220).collect::<String>();
    if collapsed.chars().count() > 220 {
        result.push('…');
    }
    result
}

fn text_match_context(value: &str, query: &str) -> Option<String> {
    value
        .lines()
        .find(|line| line.to_lowercase().contains(query))
        .map(snippet)
        .or_else(|| value.to_lowercase().contains(query).then(|| snippet(value)))
}

fn sort_search_results(results: &mut Vec<KnowledgeSearchResult>) {
    results.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.page.cmp(&right.page))
    });
    results.truncate(MAX_SEARCH_RESULTS);
}

fn search_segments(segments: &[IndexedSearchSegment], query: &str) -> Vec<KnowledgeSearchResult> {
    let mut results = Vec::new();
    let mut title_paths = HashSet::new();
    let mut match_counts: HashMap<(&str, &str), usize> = HashMap::new();
    for segment in segments {
        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }
        if segment.title.to_lowercase().contains(query) && title_paths.insert(segment.path.as_str())
        {
            results.push(KnowledgeSearchResult {
                title: segment.title.clone(),
                path: segment.path.clone(),
                object_type: segment.object_type.clone(),
                match_kind: "title".into(),
                context: if segment.extraction_failed {
                    "PDF 正文不可提取，可能是扫描件、加密文件或损坏文件".into()
                } else {
                    "文件名匹配".into()
                },
                page: None,
                annotation_id: None,
                locator_kind: None,
                locator_object_id: None,
                location_label: None,
                score: 100,
                extraction_failed: segment.extraction_failed,
            });
        }
        let Some(context) = text_match_context(&segment.text, query) else {
            continue;
        };
        let limit = if segment.match_kind == "annotation" {
            5
        } else {
            1
        };
        let count = match_counts
            .entry((&segment.path, &segment.match_kind))
            .or_default();
        if *count >= limit {
            continue;
        }
        *count += 1;
        let score = match segment.match_kind.as_str() {
            "annotation" => 90,
            "ocr" => 75,
            "related" => 75,
            "slide-title" => 80,
            "notes" => 75,
            "object" => 70,
            "body" if segment.object_type == "pdf" => 70,
            "body" if segment.object_type == "docx" => 70,
            "body" if segment.object_type == "pptx" => 70,
            _ => 60,
        };
        results.push(KnowledgeSearchResult {
            title: segment.title.clone(),
            path: segment.path.clone(),
            object_type: segment.object_type.clone(),
            match_kind: segment.match_kind.clone(),
            context,
            page: segment.page,
            annotation_id: segment.annotation_id.clone(),
            locator_kind: segment.locator_kind.clone(),
            locator_object_id: segment.locator_object_id.clone(),
            location_label: segment.location_label.clone(),
            score,
            extraction_failed: segment.extraction_failed,
        });
    }
    sort_search_results(&mut results);
    results
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<KnowledgeSearchResult>) {
    if results.len() >= MAX_SEARCH_RESULTS {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if results.len() >= MAX_SEARCH_RESULTS
            || entry
                .file_type()
                .map(|kind| kind.is_symlink())
                .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.')
            || name.ends_with(".assets")
            || name.ends_with(".annotations.json")
            || name.ends_with(".ocr.json")
            || is_sensitive_path(&path)
        {
            continue;
        }
        if path.is_dir() {
            search_recursive(&path, query, results);
            continue;
        }
        let path_string = path.to_string_lossy().into_owned();
        let title = name.into_owned();
        let title_matches = title.to_lowercase().contains(query);
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        if !format.capabilities.index.is_supported() {
            continue;
        }
        let Some(indexer) = format.adapters.indexer.as_deref() else {
            continue;
        };
        if indexer == "pdf" {
            let index = load_pdf_index(&path);
            if title_matches {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "title".into(),
                    context: if index.extraction_failed {
                        "PDF 正文不可提取，可能是扫描件、加密文件或损坏文件".into()
                    } else {
                        "PDF 文件名匹配".into()
                    },
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 100,
                    extraction_failed: index.extraction_failed,
                });
            }
            for annotation in index
                .annotations
                .iter()
                .filter(|item| item.text.to_lowercase().contains(query))
                .take(5)
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "annotation".into(),
                    context: snippet(&annotation.text),
                    page: Some(annotation.page),
                    annotation_id: Some(annotation.id.clone()),
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 90,
                    extraction_failed: index.extraction_failed,
                });
            }
            if let Some((page_index, context)) =
                index.pages.iter().enumerate().find_map(|(page, text)| {
                    text_match_context(text, query).map(|value| (page, value))
                })
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "body".into(),
                    context,
                    page: Some((page_index + 1) as u32),
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 70,
                    extraction_failed: index.extraction_failed,
                });
            }
            if let Some((page, context)) = index.ocr_pages.iter().find_map(|item| {
                text_match_context(&item.text, query).map(|value| (item.page, value))
            }) {
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: "pdf".into(),
                    match_kind: "ocr".into(),
                    context,
                    page: Some(page),
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 75,
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
            let Some(model) = model else {
                continue;
            };
            if title_matches {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "title".into(),
                    context: "文件名匹配".into(),
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 100,
                    extraction_failed: false,
                });
            }
            if let Some((index, block, context)) =
                model.blocks.iter().enumerate().find_map(|(index, block)| {
                    text_match_context(&block.text, query).map(|context| (index, block, context))
                })
            {
                let location_label = match block.kind.as_str() {
                    "heading" => format!("标题：{}", block.text),
                    "table" => format!("表格 {}", index + 1),
                    "list-item" => format!("列表项 {}", index + 1),
                    _ => format!("段落 {}", index + 1),
                };
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "body".into(),
                    context,
                    page: None,
                    annotation_id: None,
                    locator_kind: Some("docx-block".into()),
                    locator_object_id: Some(block.id.clone()),
                    location_label: Some(location_label),
                    score: 70,
                    extraction_failed: false,
                });
            }
            if let Some((item, context)) = model.related_content.iter().find_map(|item| {
                text_match_context(&item.text, query).map(|context| (item, context))
            }) {
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: format.id.clone(),
                    match_kind: "related".into(),
                    context,
                    page: None,
                    annotation_id: None,
                    locator_kind: Some(format!("docx-{}", item.kind)),
                    locator_object_id: Some(item.id.clone()),
                    location_label: Some(item.label.clone()),
                    score: 75,
                    extraction_failed: false,
                });
            }
        } else if indexer == "odt" {
            let model = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| parse_odt(&bytes).ok());
            let Some(model) = model else {
                continue;
            };
            if title_matches {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: format.id.clone(),
                    match_kind: "title".into(),
                    context: "文件名匹配".into(),
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 100,
                    extraction_failed: false,
                });
            }
            if let Some((index, block, context)) =
                model.blocks.iter().enumerate().find_map(|(index, block)| {
                    text_match_context(&block.text, query).map(|context| (index, block, context))
                })
            {
                let location_label = match block.kind.as_str() {
                    "heading" => format!("标题：{}", block.text),
                    "table" => format!("表格 {}", index + 1),
                    "list-item" => format!("列表项 {}", index + 1),
                    _ => format!("段落 {}", index + 1),
                };
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: format.id.clone(),
                    match_kind: "body".into(),
                    context,
                    page: None,
                    annotation_id: None,
                    locator_kind: Some("odt-block".into()),
                    locator_object_id: Some(block.id.clone()),
                    location_label: Some(location_label),
                    score: 70,
                    extraction_failed: false,
                });
            }
        } else if indexer == "pptx" {
            let pptx_segments = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    build_pptx_index_segments(&title, &path_string, &format.id, &bytes).ok()
                });
            if let Some(pptx_segments) = pptx_segments {
                results.extend(search_segments(&pptx_segments, query));
            }
        } else if matches!(
            indexer,
            "markdown" | "text" | "json-text" | "table" | "opml"
        ) {
            let content = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= MAX_TEXT_FILE_BYTES)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    let mut detector = EncodingDetector::new();
                    detector.feed(&bytes, true);
                    let encoding = detector.guess(None, true);
                    let (text, _, _) = encoding.decode(&bytes);
                    if indexer == "opml" {
                        parse_opml(text.strip_prefix('\u{feff}').unwrap_or(&text))
                            .ok()
                            .map(|document| opml_search_text(&document))
                    } else if title.to_ascii_lowercase().ends_with(".table.json") {
                        parse_internal_table(text.strip_prefix('\u{feff}').unwrap_or(&text))
                            .ok()
                            .map(|table| table_search_text(&table, MAX_TEXT_FILE_BYTES as usize))
                    } else {
                        Some(text.into_owned())
                    }
                });
            let context = content
                .as_deref()
                .and_then(|value| text_match_context(value, query));
            if title_matches || context.is_some() {
                results.push(KnowledgeSearchResult {
                    title,
                    path: path_string,
                    object_type: format.id.clone(),
                    match_kind: if title_matches { "title" } else { "body" }.into(),
                    context: context.unwrap_or_else(|| "文件名匹配".into()),
                    page: None,
                    annotation_id: None,
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: if title_matches { 100 } else { 60 },
                    extraction_failed: false,
                });
            }
        }
    }
}

fn search_workspace(
    root: &Path,
    query: &str,
    index: Option<(&Path, bool)>,
) -> Vec<KnowledgeSearchResult> {
    if let Some((cache_root, runtime_blocks_read)) = index {
        if let Some(snapshot) = read_ready_snapshot(cache_root, root, runtime_blocks_read) {
            return search_segments(&snapshot.search_segments, query);
        }
    }
    let mut results = Vec::new();
    search_recursive(root, query, &mut results);
    sort_search_results(&mut results);
    results
}

#[tauri::command]
pub async fn search_knowledge(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
    query: String,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let root = guard.root().to_path_buf();
    let cache_root = knowledge_index_cache_root(&app)?;
    let runtime_blocks_read = runtime.blocks_index_reads(&root);
    tauri::async_runtime::spawn_blocking(move || {
        search_workspace(&root, &query, Some((&cache_root, runtime_blocks_read)))
    })
    .await
    .map_err(|error| format!("知识索引任务失败: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::graph::GraphData;
    use crate::services::pdf_index::clear_pdf_index_cache;
    use base64::{engine::general_purpose, Engine as _};
    use std::io::{Cursor, Write};
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    const TWO_PAGE_PDF: &str = "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCAzMDAgMzAwIF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgMzAwIDMwMCBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDcgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgMyAwIFIgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0xlbmd0aCA5Ngo+PgpzdHJlYW0KMSAwIDAgMSAwIDAgY20gIEJUIC9GMSAxMiBUZiAxNC40IFRMIEVUCkJUIDEgMCAwIDEgNDAgMjUwIFRtIChLbm93bGVkZ2UgR3JhcGggQWxwaGEpIFRqIFQqIEVUCiAKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8Ci9MZW5ndGggOTEKPj4Kc3RyZWFtCjEgMCAwIDEgMCAwIGNtICBCVCAvRjEgMTIgVGYgMTQuNCBUTCBFVApCVCAxIDAgMCAxIDQwIDI1MCBUbSAoU2Vjb25kIFBhZ2UgQmV0YSkgVGogVCogRVQKIAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAxMAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDAzOTIgMDAwMDAgbiAKMDAwMDAwMDU4NSAwMDAwMCBuIAowMDAwMDAwNjUzIDAwMDAwIG4gCjAwMDAwMDA5MTQgMDAwMDAgbiAKMDAwMDAwMDk3OSAwMDAwMCBuIAowMDAwMDAxMTI0IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDg3ZGQ4ZDI4MmYyODI4ZmFkMDdiZjc2YTE0NjRkYzM0Pjw4N2RkOGQyODJmMjgyOGZhZDA3YmY3NmExNDY0ZGMzND5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgMTAKPj4Kc3RhcnR4cmVmCjEyNjQKJSVFT0YK";

    fn docx_fixture() -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut output);
            let options =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            for (name, content) in [
                (
                    "[Content_Types].xml",
                    r#"<Types><Override PartName="/word/document.xml"/></Types>"#,
                ),
                (
                    "word/document.xml",
                    r#"<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Indexed project heading</w:t></w:r></w:p><w:p><w:commentRangeStart w:id="3"/><w:r><w:t>Searchable DOCX paragraph</w:t><w:commentReference w:id="3"/></w:r></w:p></w:body></w:document>"#,
                ),
                (
                    "word/comments.xml",
                    r#"<w:comments xmlns:w="w"><w:comment w:id="3" w:author="Reviewer"><w:p><w:r><w:t>Unique review evidence</w:t></w:r></w:p></w:comment></w:comments>"#,
                ),
            ] {
                zip.start_file(name, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        output.into_inner()
    }

    #[test]
    fn searches_pdf_pages_and_annotations_with_locations() {
        clear_pdf_index_cache();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-index-test-{}", nonce));
        fs::create_dir_all(&root).unwrap();
        let pdf = root.join("research.pdf");
        fs::write(
            &pdf,
            general_purpose::STANDARD.decode(TWO_PAGE_PDF).unwrap(),
        )
        .unwrap();
        fs::write(
            root.join("research.pdf.annotations.json"),
            r#"{
              "schemaVersion": 1,
              "source": { "pdfFile": "research.pdf", "size": 1, "modifiedAt": 1 },
              "annotations": [{
                "id": "annotation-1", "kind": "highlight", "page": 1, "color": "yellow",
                "rects": [{ "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.05 }],
                "quote": "Critical insight for indexing", "comment": "", "createdAt": 1, "updatedAt": 1
              }]
            }"#,
        )
        .unwrap();

        let body = search_workspace(&root, "second page beta", None);
        assert!(body.iter().any(|result| {
            result.match_kind == "body" && result.page == Some(2) && result.object_type == "pdf"
        }));
        let annotations = search_workspace(&root, "critical insight", None);
        assert!(annotations.iter().any(|result| {
            result.match_kind == "annotation"
                && result.page == Some(1)
                && result.annotation_id.as_deref() == Some("annotation-1")
        }));
        fs::write(root.join("scan.pdf"), b"%PDF scanned fixture").unwrap();
        fs::write(
            root.join("scan.pdf.ocr.json"),
            r#"{
              "schemaVersion": 1,
              "source": { "pdfFile": "scan.pdf", "size": 1, "modifiedAt": 1 },
              "provider": { "id": "tesseract-wasm", "version": "7.0.0", "languages": ["chi_sim", "eng"] },
              "updatedAt": 2,
              "pages": [{
                "page": 1, "text": "Unique scanned evidence", "confidence": 93.2,
                "processedAt": 2, "width": 1200, "height": 1600
              }]
            }"#,
        )
        .unwrap();
        let ocr = search_workspace(&root, "unique scanned evidence", None);
        assert!(ocr.iter().any(|result| {
            result.match_kind == "ocr" && result.page == Some(1) && result.object_type == "pdf"
        }));

        let cache = root.join("cache");
        fs::create_dir_all(&cache).unwrap();
        let snapshot = snapshot_from_graph(
            &root,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        write_snapshot(&cache, &root, &snapshot).unwrap();
        let indexed_body = search_workspace(&root, "second page beta", Some((&cache, false)));
        let indexed_annotation = search_workspace(&root, "critical insight", Some((&cache, false)));
        let indexed_ocr = search_workspace(&root, "unique scanned evidence", Some((&cache, false)));
        assert!(indexed_body
            .iter()
            .any(|result| result.match_kind == "body" && result.page == Some(2)));
        assert!(indexed_annotation.iter().any(|result| {
            result.match_kind == "annotation"
                && result.page == Some(1)
                && result.annotation_id.as_deref() == Some("annotation-1")
        }));
        assert!(indexed_ocr
            .iter()
            .any(|result| result.match_kind == "ocr" && result.page == Some(1)));
        let _ = fs::remove_dir_all(root);
        clear_pdf_index_cache();
    }

    #[test]
    fn indexes_docx_blocks_and_related_content_with_locators() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("longedit-docx-index-{nonce}"));
        let root = base.join("workspace");
        let cache = base.join("cache");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::write(root.join("review.docx"), docx_fixture()).unwrap();

        let live_body = search_workspace(&root, "searchable docx paragraph", None);
        assert!(live_body.iter().any(|result| {
            result.object_type == "docx"
                && result.match_kind == "body"
                && result.locator_kind.as_deref() == Some("docx-block")
                && result.locator_object_id.as_deref() == Some("docx-block-2")
        }));
        let live_comment = search_workspace(&root, "unique review evidence", None);
        assert!(live_comment.iter().any(|result| {
            result.match_kind == "related"
                && result.locator_kind.as_deref() == Some("docx-comment")
                && result.location_label.as_deref() == Some("批注 3")
        }));

        let snapshot = snapshot_from_graph(
            &root,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        assert!(snapshot.search_segments.iter().any(|segment| {
            segment.object_type == "docx"
                && segment.locator_object_id.as_deref() == Some("docx-block-2")
        }));
        write_snapshot(&cache, &root, &snapshot).unwrap();
        let indexed_comment =
            search_workspace(&root, "unique review evidence", Some((&cache, false)));
        assert!(indexed_comment.iter().any(|result| {
            result.match_kind == "related"
                && result.locator_object_id.as_deref() == Some("docx-related-1")
        }));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn indexes_pptx_slides_objects_and_notes_consistently() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("longedit-pptx-index-{nonce}"));
        let root = base.join("workspace");
        let cache = base.join("cache");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&cache).unwrap();
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let presentation = root.join("planning.pptx");
        fs::write(&presentation, source).unwrap();

        let live_title = search_workspace(&root, "powerpoint producer fixture", None);
        assert!(live_title.iter().any(|result| {
            result.object_type == "pptx"
                && result.match_kind == "slide-title"
                && result.page == Some(1)
                && result.locator_kind.as_deref() == Some("pptx-slide")
                && result
                    .location_label
                    .as_deref()
                    .is_some_and(|label| label.starts_with("幻灯片 1"))
        }));
        let live_object = search_workspace(&root, "structured slide reading", None);
        assert!(live_object.iter().any(|result| {
            result.match_kind == "object"
                && result.page == Some(1)
                && result.locator_kind.as_deref() == Some("pptx-object")
                && result.locator_object_id.as_deref() == Some("3")
        }));
        let live_notes = search_workspace(&root, "speaker note evidence", None);
        assert!(live_notes.iter().any(|result| {
            result.match_kind == "notes"
                && result.page == Some(1)
                && result.locator_kind.as_deref() == Some("pptx-slide")
                && result.location_label.as_deref() == Some("幻灯片 1 · 备注")
        }));

        let snapshot = snapshot_from_graph(
            &root,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        );
        assert!(snapshot.search_segments.iter().any(|segment| {
            segment.object_type == "pptx"
                && segment.match_kind == "object"
                && segment.locator_object_id.as_deref() == Some("3")
        }));
        write_snapshot(&cache, &root, &snapshot).unwrap();
        for query in [
            "powerpoint producer fixture",
            "structured slide reading",
            "speaker note evidence",
        ] {
            let live = search_workspace(&root, query, None)
                .into_iter()
                .map(|result| {
                    (
                        result.match_kind,
                        result.page,
                        result.locator_kind,
                        result.locator_object_id,
                        result.location_label,
                    )
                })
                .collect::<Vec<_>>();
            let indexed = search_workspace(&root, query, Some((&cache, false)))
                .into_iter()
                .map(|result| {
                    (
                        result.match_kind,
                        result.page,
                        result.locator_kind,
                        result.locator_object_id,
                        result.location_label,
                    )
                })
                .collect::<Vec<_>>();
            assert_eq!(indexed, live, "{query}");
        }
        assert_eq!(fs::read(&presentation).unwrap(), source);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn ready_index_is_used_and_stale_or_legacy_snapshot_falls_back() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("longedit-index-fallback-{nonce}"));
        let root = base.join("workspace");
        let cache = base.join("cache");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&cache).unwrap();
        let note = root.join("evidence.txt");
        fs::write(&note, "Indexed snapshot evidence").unwrap();
        let graph = GraphData {
            nodes: Vec::new(),
            edges: Vec::new(),
        };
        let mut snapshot = snapshot_from_graph(&root, graph.clone());
        snapshot.search_segments[0].text = "Synthetic index-only evidence".into();
        write_snapshot(&cache, &root, &snapshot).unwrap();
        assert!(read_ready_snapshot(&cache, &root, false).is_some());
        assert!(
            search_workspace(&root, "synthetic index-only", Some((&cache, false)))
                .iter()
                .any(|result| result.context.contains("Synthetic index-only evidence"))
        );

        fs::write(&note, "Fresh live fallback evidence with a different size").unwrap();
        assert!(read_ready_snapshot(&cache, &root, false).is_none());
        assert!(
            search_workspace(&root, "fresh live fallback", Some((&cache, false)))
                .iter()
                .any(|result| result.context.contains("Fresh live fallback evidence"))
        );

        let mut legacy_snapshot = snapshot_from_graph(&root, graph);
        legacy_snapshot.search_segments.clear();
        write_snapshot(&cache, &root, &legacy_snapshot).unwrap();
        assert!(read_ready_snapshot(&cache, &root, false).is_none());
        assert!(!search_workspace(&root, "fresh live fallback", Some((&cache, false))).is_empty());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn pptx_index_lifecycle_rebuilds_falls_back_and_removes_deleted_objects() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("longedit-pptx-lifecycle-{nonce}"));
        let root = base.join("workspace");
        let cache = base.join("cache");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&cache).unwrap();
        let presentation = root.join("lifecycle.pptx");
        fs::write(
            &presentation,
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
        )
        .unwrap();
        let runtime = KnowledgeIndexRuntime::default();

        let graph = tauri::async_runtime::block_on(crate::commands::graph::build_link_graph(
            root.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let snapshot = snapshot_from_graph(&root, graph);
        write_snapshot(&cache, &root, &snapshot).unwrap();
        let ready = inspect_index(&cache, &root, &runtime);
        assert_eq!(ready.state, "ready");
        assert_eq!(
            snapshot
                .objects
                .iter()
                .filter(|object| object.object_type == "pptx_slide")
                .count(),
            3
        );
        assert_eq!(
            snapshot
                .relations
                .iter()
                .filter(|relation| relation.relation_type == "contains")
                .count(),
            3
        );

        fs::write(
            &presentation,
            include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
        )
        .unwrap();
        assert_eq!(inspect_index(&cache, &root, &runtime).state, "stale");
        assert!(read_ready_snapshot(&cache, &root, false).is_none());
        assert!(search_workspace(
            &root,
            "libreoffice impress producer fixture",
            Some((&cache, false)),
        )
        .iter()
        .any(|result| result.object_type == "pptx"));

        let rebuilt_graph = tauri::async_runtime::block_on(
            crate::commands::graph::build_link_graph(root.to_string_lossy().into_owned()),
        )
        .unwrap();
        let rebuilt = snapshot_from_graph(&root, rebuilt_graph);
        write_snapshot(&cache, &root, &rebuilt).unwrap();
        assert_eq!(inspect_index(&cache, &root, &runtime).state, "ready");
        assert!(read_ready_snapshot(&cache, &root, false).is_some());

        fs::remove_file(&presentation).unwrap();
        assert_eq!(inspect_index(&cache, &root, &runtime).state, "stale");
        assert!(search_workspace(
            &root,
            "libreoffice impress producer fixture",
            Some((&cache, false)),
        )
        .iter()
        .all(|result| result.object_type != "pptx"));
        let empty_graph = tauri::async_runtime::block_on(crate::commands::graph::build_link_graph(
            root.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let empty_snapshot = snapshot_from_graph(&root, empty_graph);
        write_snapshot(&cache, &root, &empty_snapshot).unwrap();
        assert_eq!(inspect_index(&cache, &root, &runtime).state, "ready");
        assert!(empty_snapshot
            .objects
            .iter()
            .all(|object| object.object_type != "pptx" && object.object_type != "pptx_slide"));
        assert!(empty_snapshot
            .relations
            .iter()
            .all(|relation| relation.relation_type != "contains"));

        delete_index(&cache, &root).unwrap();
        assert_eq!(inspect_index(&cache, &root, &runtime).state, "missing");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn searches_table_titles_and_cell_content() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-table-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("customers.csv"),
            "name,segment\nAcme Research,Strategic Account\n",
        )
        .unwrap();
        let results = search_workspace(&root, "strategic account", None);
        assert!(results.iter().any(|result| {
            result.object_type == "table"
                && result.match_kind == "body"
                && result.context.contains("Strategic Account")
        }));
        fs::write(
            root.join("planning.table.json"),
            r#"{
              "schemaVersion": 1, "kind": "longedit.table",
              "data": {
                "columns": [{"id":"topic","name":"主题","type":"text"}],
                "rows": [{"id":"row-1","values":{"topic":"Unique board evidence"}}]
              },
              "views": [{"id":"grid","name":"表格","kind":"grid","config":{"filter":"","frozenColumns":1,"columnWidths":{"topic":160}}}],
              "activeView": "grid"
            }"#,
        )
        .unwrap();
        let internal = search_workspace(&root, "unique board evidence", None);
        assert!(internal.iter().any(|result| {
            result.object_type == "table"
                && result.context.contains("Unique board evidence")
                && !result.context.contains("schemaVersion")
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn indexes_registered_plain_text_through_the_generic_adapter() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-text-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("adapter-proof.txt"),
            "Generic adapter evidence lives here.",
        )
        .unwrap();
        let results = search_workspace(&root, "generic adapter evidence", None);
        assert!(results.iter().any(|result| {
            result.object_type == "plain-text"
                && result.match_kind == "body"
                && result.context.contains("Generic adapter evidence")
        }));
        fs::write(
            root.join("index-proof.ts"),
            "export const searchableCodeEvidence = 'registered code adapter';",
        )
        .unwrap();
        let code_results = search_workspace(&root, "searchablecodeevidence", None);
        assert!(code_results.iter().any(|result| {
            result.object_type == "typescript"
                && result.match_kind == "body"
                && result.context.contains("searchableCodeEvidence")
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn live_search_excludes_env_and_suspected_credential_files() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-sensitive-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(".env"), "API_TOKEN=unique-env-secret").unwrap();
        fs::write(
            root.join("service-credentials.yaml"),
            "password: unique-credential-secret",
        )
        .unwrap();
        fs::write(root.join("service.yaml"), "name: visible-service-setting").unwrap();

        assert!(search_workspace(&root, "unique-env-secret", None).is_empty());
        assert!(search_workspace(&root, "unique-credential-secret", None).is_empty());
        assert!(search_workspace(&root, "visible-service-setting", None)
            .iter()
            .any(|result| result.object_type == "yaml"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn indexes_opml_semantics_without_exposing_xml_markup() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-opml-index-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("strategy.opml"),
            include_str!("../../tests/fixtures/formats/mindmap.opml"),
        )
        .unwrap();
        let results = search_workspace(&root, "增强关系发现", None);
        assert!(results.iter().any(|result| result.object_type == "opml"
            && result.match_kind == "body"
            && result.context.contains("增强关系发现")
            && !result.context.contains("outline")));
        fs::remove_dir_all(root).unwrap();
    }
}
