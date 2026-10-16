use crate::formats::docx::parse_docx;
use crate::formats::file_registry::{file_format_for_path, is_sensitive_path};
use crate::formats::odt::parse_odt;
use crate::formats::opml::parse_opml;
use crate::formats::table::parse_internal_table;
use crate::services::knowledge_index::{
    build_odf_content_index_segments, build_opml_index_segments, build_pptx_index_segments,
    build_table_index_segments, build_workbook_index_segments, collect_index_sources, delete_index,
    inspect_index, read_snapshot, ready_status_from_snapshot, recover_index_cache,
    refresh_snapshot_incremental_for_paths, snapshot_from_graph_with_sources, write_snapshot,
    IndexedSearchSegment, IndexedSource, KnowledgeIndexRecoveryReport, KnowledgeIndexRuntime,
    KnowledgeIndexStatus,
};
#[cfg(test)]
use crate::services::knowledge_index::{read_ready_snapshot, snapshot_from_graph};
use crate::services::pdf_index::load_pdf_index;
use crate::services::search_scan::{collect_search_sources, SearchBudget, SearchStop};
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use serde::Serialize;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

const MAX_SEARCH_RESULTS: usize = 200;
const MAX_LOCATED_MATCHES_PER_KIND: usize = 5;
const MAX_TEXT_FILE_BYTES: u64 = 20 * 1024 * 1024;

#[cfg(test)]
#[path = "index_search_ranking_tests.rs"]
mod search_ranking_tests;

#[cfg(test)]
#[path = "index_search_budget_tests.rs"]
mod search_budget_tests;

#[path = "index_search_pages.rs"]
pub mod search_pages;

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
    let cancellation = runtime.begin_build(&workspace);
    let changed_paths = runtime.changed_paths(&workspace);
    let incremental_workspace = workspace.clone();
    let incremental_cache = cache_root.clone();
    let incremental_result =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<_>, String> {
            let Some(previous) = read_snapshot(&incremental_cache, &incremental_workspace)? else {
                return Ok(None);
            };
            Ok(refresh_snapshot_incremental_for_paths(
                &incremental_workspace,
                previous,
                &changed_paths,
            ))
        })
        .await;
    let incremental = match incremental_result {
        Ok(Ok(snapshot)) => snapshot,
        Ok(Err(error)) => {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
        Err(error) => {
            let error = format!("知识索引增量任务失败: {error}");
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    if let Some(snapshot) = incremental {
        if cancellation.load(std::sync::atomic::Ordering::Relaxed) {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "cancelled", 0, None);
            return Ok(inspect_index(&cache_root, &workspace, &runtime));
        }
        if let Err(error) = write_snapshot(&cache_root, &workspace, &snapshot) {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
        let status = ready_status_from_snapshot(&cache_root, &workspace, &snapshot);
        runtime.cache_snapshot(&workspace, snapshot);
        runtime.clear_changes(&workspace);
        let _ = runtime.ensure_watcher(&workspace);
        runtime.finish_build(&workspace);
        runtime.set(&workspace, "ready", 100, None);
        return Ok(status);
    }
    let source_workspace = workspace.clone();
    let source_task =
        tauri::async_runtime::spawn_blocking(move || collect_index_sources(&source_workspace));
    let graph = match crate::commands::graph::build_link_graph_cancellable(
        workspace.to_string_lossy().into_owned(),
        cancellation.clone(),
    )
    .await
    {
        Ok(graph) => graph,
        Err(error) if error == "knowledge-index-cancelled" => {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "cancelled", 0, None);
            return Ok(inspect_index(&cache_root, &workspace, &runtime));
        }
        Err(error) => {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    let sources = match source_task.await {
        Ok(sources) => sources,
        Err(error) => {
            let error = format!("知识索引来源扫描失败: {error}");
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    runtime.set(&workspace, "building", 75, None);
    let workspace_for_task = workspace.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        Ok::<_, String>(snapshot_from_graph_with_sources(
            &workspace_for_task,
            graph,
            sources,
        ))
    })
    .await;
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            let error = format!("知识索引写入任务失败: {error}");
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    let snapshot = match result {
        Ok(snapshot) => snapshot,
        Err(error) => {
            runtime.finish_build(&workspace);
            runtime.set(&workspace, "error", 0, Some(error.clone()));
            return Err(error);
        }
    };
    if cancellation.load(std::sync::atomic::Ordering::Relaxed) {
        runtime.finish_build(&workspace);
        runtime.set(&workspace, "cancelled", 0, None);
        return Ok(inspect_index(&cache_root, &workspace, &runtime));
    }
    if let Err(error) = write_snapshot(&cache_root, &workspace, &snapshot) {
        runtime.finish_build(&workspace);
        runtime.set(&workspace, "error", 0, Some(error.clone()));
        return Err(error);
    }
    let status = ready_status_from_snapshot(&cache_root, &workspace, &snapshot);
    runtime.cache_snapshot(&workspace, snapshot);
    runtime.clear_changes(&workspace);
    let _ = runtime.ensure_watcher(&workspace);
    runtime.finish_build(&workspace);
    runtime.set(&workspace, "ready", 100, None);
    Ok(status)
}

#[tauri::command]
pub fn cancel_knowledge_index(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexStatus, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let cache_root = knowledge_index_cache_root(&app)?;
    if !runtime.cancel_build(guard.root()) {
        return Err("当前没有正在准备的知识索引".into());
    }
    Ok(inspect_index(&cache_root, guard.root(), &runtime))
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
    runtime.invalidate_snapshot(workspace);
    runtime.set(workspace, "missing", 0, None);
    Ok(inspect_index(&cache_root, workspace, &runtime))
}

#[tauri::command]
pub fn recover_knowledge_index_cache(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
) -> Result<KnowledgeIndexRecoveryReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let cache_root = knowledge_index_cache_root(&app)?;
    recover_index_cache(&cache_root, guard.root(), &runtime)
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
    if query.is_empty() {
        return None;
    }
    value
        .lines()
        .find(|line| line.to_lowercase().contains(query))
        .map(|line| match_snippet(line, query))
        .or_else(|| {
            value
                .to_lowercase()
                .contains(query)
                .then(|| match_snippet(value, query))
        })
}

fn match_snippet(value: &str, query: &str) -> String {
    // Lowercasing can expand Unicode characters: map folded bytes back to source chars.
    let folded = value.to_lowercase();
    let Some(byte_start) = folded.find(query) else {
        return snippet(value);
    };
    let mut folded_bytes = 0;
    let mut match_char: usize = 0;
    for character in value.chars() {
        let length = character.to_lowercase().map(char::len_utf8).sum::<usize>();
        if folded_bytes + length > byte_start {
            break;
        }
        folded_bytes += length;
        match_char += 1;
    }
    let start = match_char.saturating_sub(40);
    let mut chars = value.chars().skip(start);
    let body = chars.by_ref().take(220).collect::<String>();
    let suffix = if chars.next().is_some() { "…" } else { "" };
    let prefix = if start > 0 { "…" } else { "" };
    format!(
        "{}{}{}",
        prefix,
        body.split_whitespace().collect::<Vec<_>>().join(" "),
        suffix
    )
}

fn decode_text_file(path: &Path) -> Option<String> {
    let bytes = path
        .metadata()
        .ok()
        .filter(|metadata| metadata.len() <= MAX_TEXT_FILE_BYTES)
        .and_then(|_| fs::read(path).ok())?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Some(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentPreview {
    text: String,
    label: String,
    truncated: bool,
    match_found: bool,
}

fn preview_excerpt(text: &str, query: &str, label: String) -> SearchDocumentPreview {
    let query = query.trim().to_lowercase();
    let found = if query.is_empty() {
        None
    } else {
        text.to_lowercase().find(&query)
    };
    let mut bytes = 0;
    let mut position: usize = 0;
    if let Some(at) = found {
        for ch in text.chars() {
            let len = ch.to_lowercase().map(char::len_utf8).sum::<usize>();
            if bytes + len > at {
                break;
            }
            bytes += len;
            position += 1;
        }
    }
    let start = position.saturating_sub(400);
    let mut chars = text.chars().skip(start);
    let body = chars.by_ref().take(8000).collect::<String>();
    let remaining = chars.next().is_some();
    SearchDocumentPreview {
        text: format!(
            "{}{}{}",
            if start > 0 { "…\n" } else { "" },
            body,
            if remaining { "\n…" } else { "" }
        ),
        label,
        truncated: start > 0 || remaining,
        match_found: found.is_some(),
    }
}

#[tauri::command]
pub async fn preview_search_document(
    library_root: String,
    path: String,
    query: String,
    page: Option<u32>,
    annotation_id: Option<String>,
    match_kind: String,
) -> Result<SearchDocumentPreview, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let path = guard.resolve_existing(path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let format = file_format_for_path(&path)?;
        if is_sensitive_path(&path) {
            return Err("此文件不提供搜索预览，请直接打开查看".into());
        }
        match format.id.as_str() {
            "markdown" | "plain-text" => {
                let text = decode_text_file(&path)
                    .ok_or("无法读取文字内容，文件可能过大或已不可访问，请直接打开查看")?;
                Ok(preview_excerpt(
                    &text,
                    &query,
                    if format.id == "markdown" {
                        "Markdown 原文"
                    } else {
                        "文本内容"
                    }
                    .into(),
                ))
            }
            "pdf" => {
                let index = load_pdf_index(&path);
                if let Some(id) = annotation_id {
                    let annotation = index
                        .annotations
                        .iter()
                        .find(|item| item.id == id)
                        .ok_or("该批注已不可用，请打开文件确认")?;
                    return Ok(preview_excerpt(
                        &annotation.text,
                        &query,
                        format!("第 {} 页 · 批注文字", annotation.page),
                    ));
                }
                let page = page.unwrap_or(1);
                if page == 0 {
                    return Err("页码不可用，请打开文件确认".into());
                }
                let text = if match_kind == "ocr" {
                    index
                        .ocr_pages
                        .iter()
                        .find(|item| item.page == page)
                        .map(|item| item.text.as_str())
                } else {
                    index.pages.get((page - 1) as usize).map(String::as_str)
                };
                let text = text
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("这一页没有可提取的文字，请打开 PDF 查看原页面")?;
                Ok(preview_excerpt(
                    text,
                    &query,
                    format!(
                        "第 {} 页 · {}",
                        page,
                        if match_kind == "ocr" {
                            "OCR 文字"
                        } else {
                            "PDF 提取文字"
                        }
                    ),
                ))
            }
            _ => Err("此格式请打开文件查看".into()),
        }
    })
    .await
    .map_err(|error| format!("读取预览失败：{error}"))?
}

// Best first, with exact identity tie-breakers rather than filesystem/index order.
// Keep case-sensitive paths distinct, as the existing frontend grouping does.
fn compare_search_results(
    left: &KnowledgeSearchResult,
    right: &KnowledgeSearchResult,
) -> std::cmp::Ordering {
    right
        .score
        .cmp(&left.score)
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.path.cmp(&right.path))
        .then_with(|| left.page.cmp(&right.page))
        .then_with(|| left.object_type.cmp(&right.object_type))
        .then_with(|| left.match_kind.cmp(&right.match_kind))
        .then_with(|| left.annotation_id.cmp(&right.annotation_id))
        .then_with(|| left.locator_kind.cmp(&right.locator_kind))
        .then_with(|| left.locator_object_id.cmp(&right.locator_object_id))
        .then_with(|| left.location_label.cmp(&right.location_label))
        .then_with(|| left.context.cmp(&right.context))
        .then_with(|| left.extraction_failed.cmp(&right.extraction_failed))
}

fn sort_search_results(results: &mut Vec<KnowledgeSearchResult>) {
    results.sort_by(compare_search_results);
    results.truncate(MAX_SEARCH_RESULTS);
}

struct RankedSearchResult(KnowledgeSearchResult);

impl PartialEq for RankedSearchResult {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}
impl Eq for RankedSearchResult {}
impl PartialOrd for RankedSearchResult {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for RankedSearchResult {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        compare_search_results(&self.0, &other.0)
    }
}

// The heap root is the worst retained match. Inspect later candidates without
// collecting every matching payload or stopping before a better file is seen.
struct SearchResultCollector {
    heap: BinaryHeap<RankedSearchResult>,
}

impl SearchResultCollector {
    fn new() -> Self {
        Self {
            heap: BinaryHeap::with_capacity(MAX_SEARCH_RESULTS),
        }
    }

    fn push(&mut self, result: KnowledgeSearchResult) {
        if self.heap.len() < MAX_SEARCH_RESULTS {
            self.heap.push(RankedSearchResult(result));
        } else if compare_search_results(&result, &self.heap.peek().unwrap().0).is_lt() {
            self.heap.peek_mut().unwrap().0 = result;
        }
    }

    fn extend(&mut self, results: impl IntoIterator<Item = KnowledgeSearchResult>) {
        for result in results {
            self.push(result);
        }
    }

    fn into_results(self) -> Vec<KnowledgeSearchResult> {
        let mut results = self
            .heap
            .into_iter()
            .map(|entry| entry.0)
            .collect::<Vec<_>>();
        results.sort_by(compare_search_results);
        results
    }
}

pub(crate) fn search_segments(
    segments: &[IndexedSearchSegment],
    query: &str,
) -> Vec<KnowledgeSearchResult> {
    // Internal index/collection callers retain their existing API. Interactive
    // search uses the checked entry point and reports incomplete work as an error.
    search_segments_checked(segments, query, &mut None).unwrap()
}

fn search_segments_checked(
    segments: &[IndexedSearchSegment],
    query: &str,
    budget: &mut Option<&mut SearchBudget>,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    search_segment_iter(segments.iter(), query, budget)
}

fn search_segment_iter<'a>(
    segments: impl Iterator<Item = &'a IndexedSearchSegment> + Clone,
    query: &str,
    budget: &mut Option<&mut SearchBudget>,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    let Ok(parsed) = crate::services::search_query::SearchQuery::parse(query) else {
        return Ok(Vec::new());
    };
    if parsed.positive.len() == 1 && parsed.negative.is_empty() {
        return search_literal_segments(segments, &parsed.positive[0], budget);
    }
    search_complex_segments(segments, query, budget)
}

fn search_literal_segments<'a>(
    segments: impl Iterator<Item = &'a IndexedSearchSegment>,
    query: &str,
    budget: &mut Option<&mut SearchBudget>,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    let mut results = SearchResultCollector::new();
    let mut seen_locations = HashSet::new();
    let mut title_paths = HashSet::new();
    let mut match_counts: HashMap<(&str, &str), usize> = HashMap::new();
    for segment in segments {
        if let Some(budget) = budget.as_deref_mut() {
            budget.segment(segment.text.len())?;
        }
        if segment.title.to_lowercase().contains(query) && title_paths.insert(segment.path.as_str())
        {
            results.push(KnowledgeSearchResult {
                title: segment.title.clone(),
                path: segment.path.clone(),
                object_type: segment.object_type.clone(),
                match_kind: "title".into(),
                context: if segment.extraction_failed {
                    if segment.object_type == "pdf" {
                        "PDF 正文不可提取，可能是扫描件、加密文件或损坏文件".into()
                    } else {
                        "正文未能读取或提取，仅匹配文件名".into()
                    }
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
        let located = segment.page.is_some()
            || segment.annotation_id.is_some()
            || (segment.locator_kind.is_some() && segment.locator_object_id.is_some());
        let limit = if located {
            MAX_LOCATED_MATCHES_PER_KIND
        } else {
            1
        };
        if located
            && !seen_locations.insert((
                &segment.path,
                &segment.match_kind,
                segment.page,
                &segment.annotation_id,
                &segment.locator_kind,
                &segment.locator_object_id,
            ))
        {
            continue;
        }
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
    if let Some(budget) = budget.as_deref_mut() {
        budget.check_time()?;
    }
    Ok(results.into_results())
}

fn search_complex_segments<'a>(
    segments: impl Iterator<Item = &'a IndexedSearchSegment> + Clone,
    query: &str,
    budget: &mut Option<&mut SearchBudget>,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    use crate::services::search_query::SearchQuery;
    let Ok(parsed) = SearchQuery::parse(query) else {
        return Ok(Vec::new());
    };
    if parsed.positive.is_empty() && parsed.negative.is_empty() {
        return Ok(Vec::new());
    }
    let mut candidates: HashMap<&str, (Vec<bool>, bool, usize)> = HashMap::new();
    let mut segment_hits = Vec::with_capacity(segments.size_hint().0);
    for segment in segments.clone() {
        if let Some(budget) = budget.as_deref_mut() {
            budget.segment(segment.text.len())?;
        }
        let title = segment.title.to_lowercase();
        let text = segment.text.to_lowercase();
        let entry = candidates
            .entry(&segment.path)
            .or_insert_with(|| (vec![false; parsed.positive.len()], false, 0));
        let mut hits = 0;
        for (index, term) in parsed.positive.iter().enumerate() {
            if title.contains(term) || text.contains(term) {
                entry.0[index] = true;
                hits += 1;
            }
        }
        entry.1 |= parsed
            .negative
            .iter()
            .any(|term| title.contains(term) || text.contains(term));
        entry.2 = entry.2.max(hits);
        segment_hits.push(hits);
    }
    let mut results = SearchResultCollector::new();
    let mut seen_locations = HashSet::new();
    let mut title_paths = HashSet::new();
    let mut match_counts: HashMap<(&str, &str), usize> = HashMap::new();
    for (index, segment) in segments.enumerate() {
        if let Some(budget) = budget.as_deref_mut() {
            budget.check_time()?;
        }
        let Some((found, excluded, best)) = candidates.get(segment.path.as_str()) else {
            continue;
        };
        if *excluded || found.iter().any(|found| !found) {
            continue;
        }
        if parsed
            .positive
            .iter()
            .all(|term| segment.title.to_lowercase().contains(term))
            && title_paths.insert(segment.path.as_str())
        {
            results.push(KnowledgeSearchResult {
                title: segment.title.clone(),
                path: segment.path.clone(),
                object_type: segment.object_type.clone(),
                match_kind: "title".into(),
                context: if segment.extraction_failed {
                    if segment.object_type == "pdf" {
                        "PDF 正文不可提取，可能是扫描件、加密文件或损坏文件".into()
                    } else {
                        "正文未能读取或提取，仅匹配文件名".into()
                    }
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
        if segment_hits[index] < *best {
            continue;
        }
        let Some(context) = parsed
            .positive
            .iter()
            .find_map(|term| text_match_context(&segment.text, term))
        else {
            continue;
        };
        let located = segment.page.is_some()
            || segment.annotation_id.is_some()
            || (segment.locator_kind.is_some() && segment.locator_object_id.is_some());
        let limit = if located {
            MAX_LOCATED_MATCHES_PER_KIND
        } else {
            1
        };
        if located
            && !seen_locations.insert((
                &segment.path,
                &segment.match_kind,
                segment.page,
                &segment.annotation_id,
                &segment.locator_kind,
                &segment.locator_object_id,
            ))
        {
            continue;
        }
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
    if let Some(budget) = budget.as_deref_mut() {
        budget.check_time()?;
    }
    Ok(results.into_results())
}

fn reserve_search_reads(
    guard: &WorkspaceGuard,
    path: &Path,
    indexer: &str,
    max_bytes: u64,
    budget: &mut SearchBudget,
) -> Result<(), SearchStop> {
    fn reserve(
        guard: &WorkspaceGuard,
        path: &Path,
        max_bytes: u64,
        optional: bool,
        budget: &mut SearchBudget,
    ) -> Result<(), SearchStop> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err(SearchStop::Io),
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(SearchStop::Io);
        }
        guard.resolve_existing(path).map_err(|_| SearchStop::Io)?;
        // Oversized inputs are already rejected by the existing format readers.
        if metadata.len() <= max_bytes {
            budget.read(metadata.len())?;
        }
        Ok(())
    }
    let limit = if indexer == "pdf" {
        64 * 1024 * 1024
    } else if matches!(
        indexer,
        "markdown" | "text" | "json-text" | "table" | "opml"
    ) {
        MAX_TEXT_FILE_BYTES
    } else {
        max_bytes
    };
    reserve(guard, path, limit, false, budget)?;
    if indexer == "pdf" {
        let name = path.file_name().ok_or(SearchStop::Io)?.to_string_lossy();
        reserve(
            guard,
            &path.with_file_name(format!("{name}.annotations.json")),
            crate::formats::pdf_annotations::MAX_ANNOTATION_FILE_BYTES,
            true,
            budget,
        )?;
        reserve(
            guard,
            &path.with_file_name(format!("{name}.ocr.json")),
            crate::formats::pdf_ocr::MAX_OCR_SIDECAR_BYTES,
            true,
            budget,
        )?;
    }
    Ok(())
}

fn search_sources(
    root: &Path,
    sources: &[IndexedSource],
    query: &str,
    results: &mut SearchResultCollector,
    budget: &mut SearchBudget,
) -> Result<(), SearchStop> {
    let guard = WorkspaceGuard::new(root).map_err(|_| SearchStop::Io)?;
    for source in sources {
        budget.check_time()?;
        let path = root.join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.')
            || name.ends_with(".assets")
            || name.ends_with(".annotations.json")
            || name.ends_with(".ocr.json")
            || is_sensitive_path(&path)
        {
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
        reserve_search_reads(&guard, &path, indexer, format.max_bytes, budget)?;
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
                .take(MAX_LOCATED_MATCHES_PER_KIND)
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
                    object_type: "pdf".into(),
                    match_kind: "annotation".into(),
                    context: match_snippet(&annotation.text, query),
                    page: Some(annotation.page),
                    annotation_id: Some(annotation.id.clone()),
                    locator_kind: None,
                    locator_object_id: None,
                    location_label: None,
                    score: 90,
                    extraction_failed: index.extraction_failed,
                });
            }
            for (page_index, context) in index
                .pages
                .iter()
                .enumerate()
                .filter_map(|(page, text)| {
                    text_match_context(text, query).map(|value| (page, value))
                })
                .take(MAX_LOCATED_MATCHES_PER_KIND)
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
            for (page, context) in index
                .ocr_pages
                .iter()
                .filter_map(|item| {
                    text_match_context(&item.text, query).map(|value| (item.page, value))
                })
                .take(MAX_LOCATED_MATCHES_PER_KIND)
            {
                results.push(KnowledgeSearchResult {
                    title: title.clone(),
                    path: path_string.clone(),
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
                results.extend(search_segments_checked(
                    &odf_segments,
                    query,
                    &mut Some(budget),
                )?);
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
                results.extend(search_segments_checked(
                    &pptx_segments,
                    query,
                    &mut Some(budget),
                )?);
            }
        } else if indexer == "workbook" {
            let workbook_segments = path
                .metadata()
                .ok()
                .filter(|metadata| metadata.len() <= format.max_bytes)
                .and_then(|_| fs::read(&path).ok())
                .and_then(|bytes| {
                    build_workbook_index_segments(&title, &path_string, &format.id, &bytes).ok()
                });
            if let Some(workbook_segments) = workbook_segments {
                results.extend(search_segments_checked(
                    &workbook_segments,
                    query,
                    &mut Some(budget),
                )?);
            }
        } else if indexer == "opml" {
            if let Some(document) = decode_text_file(&path).and_then(|text| parse_opml(&text).ok())
            {
                let segments = build_opml_index_segments(
                    &title,
                    &path_string,
                    &format.id,
                    &document,
                    MAX_TEXT_FILE_BYTES as usize,
                );
                results.extend(search_segments_checked(
                    &segments,
                    query,
                    &mut Some(budget),
                )?);
            }
        } else if indexer == "table" && title.to_ascii_lowercase().ends_with(".table.json") {
            if let Some(table) =
                decode_text_file(&path).and_then(|text| parse_internal_table(&text).ok())
            {
                let segments = build_table_index_segments(
                    &title,
                    &path_string,
                    &format.id,
                    &table,
                    MAX_TEXT_FILE_BYTES as usize,
                );
                results.extend(search_segments_checked(
                    &segments,
                    query,
                    &mut Some(budget),
                )?);
            }
        } else if matches!(indexer, "markdown" | "text" | "json-text" | "table") {
            let content = decode_text_file(&path);
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
    budget.check_time()
}

#[cfg(test)]
fn search_workspace(
    root: &Path,
    query: &str,
    index: Option<(&Path, bool)>,
) -> Vec<KnowledgeSearchResult> {
    search_workspace_checked(root, query, index, &mut SearchBudget::default())
        .expect("test fixture must fit the interactive query budget")
}

fn search_workspace_checked(
    root: &Path,
    query: &str,
    index: Option<(&Path, bool)>,
    budget: &mut SearchBudget,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    // Collect bounded metadata once. Disk freshness checks must not trigger the
    // previous unbounded collect_index_sources before cold-search limits apply.
    let sources = collect_search_sources(root, budget)?;
    if let Some((cache_root, runtime_blocks_read)) = index {
        if !runtime_blocks_read {
            if let Some(snapshot) = read_snapshot(cache_root, root).ok().flatten() {
                if !snapshot.search_segments.is_empty()
                    && crate::services::knowledge_index::source_digest(&sources)
                        == snapshot.source_digest
                    && snapshot.file_relations_digest
                        == crate::services::knowledge_index::file_relations_digest(root)
                {
                    return search_segments_checked(
                        &snapshot.search_segments,
                        query,
                        &mut Some(budget),
                    );
                }
            }
        }
    }
    if crate::services::search_query::SearchQuery::parse(query)
        .is_ok_and(|parsed| parsed.complex(query))
    {
        let mut results = SearchResultCollector::new();
        let guard = WorkspaceGuard::new(root).map_err(|_| SearchStop::Io)?;
        for source in &sources {
            if source.path.ends_with(".annotations.json") || source.path.ends_with(".ocr.json") {
                continue;
            }
            let path = root.join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
            let Ok(format) = file_format_for_path(&path) else {
                continue;
            };
            let Some(indexer) = format.adapters.indexer.as_deref() else {
                continue;
            };
            reserve_search_reads(&guard, &path, indexer, format.max_bytes, budget)?;
            let segments =
                crate::services::knowledge_index::build_search_segments_for_source(root, source);
            results.extend(search_segments_checked(
                &segments,
                query,
                &mut Some(budget),
            )?);
        }
        budget.check_time()?;
        return Ok(results.into_results());
    }
    let mut results = SearchResultCollector::new();
    search_sources(root, &sources, query, &mut results, budget)?;
    Ok(results.into_results())
}

#[tauri::command]
pub async fn search_knowledge_libraries_page(
    app: AppHandle,
    window: tauri::Window,
    request: search_pages::libraries::LibrariesPageRequest,
) -> Result<search_pages::libraries::LibrariesPageResponse, search_pages::SearchPageError> {
    search_pages::libraries::run(app, window.label().to_owned(), request).await
}

#[tauri::command]
pub async fn search_knowledge_page(
    app: AppHandle,
    window: tauri::Window,
    request: search_pages::SearchPageRequest,
) -> Result<search_pages::SearchPageResponse, search_pages::SearchPageError> {
    search_pages::run_page(app, window.label().to_owned(), request).await
}

#[tauri::command]
pub fn close_knowledge_search(
    window: tauri::Window,
    runtime: State<'_, search_pages::SearchPageRuntime>,
    channel: search_pages::SearchChannel,
    session_id: String,
) -> bool {
    runtime.close(window.label(), channel, &session_id)
}

#[tauri::command]
pub async fn search_knowledge(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: String,
    query: String,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    search_library_knowledge(&app, &runtime, &library_root, &query).await
}

async fn search_library_knowledge(
    app: &AppHandle,
    runtime: &KnowledgeIndexRuntime,
    library_root: &str,
    query: &str,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    crate::services::search_query::SearchQuery::parse(&query)?;
    let guard = WorkspaceGuard::new(library_root)?;
    let root = guard.root().to_path_buf();
    let cache_root = knowledge_index_cache_root(app)?;
    let runtime_blocks_read = runtime.blocks_index_reads(&root);
    let changed_paths = runtime.changed_paths(&root);
    let cached = (!runtime_blocks_read)
        .then(|| runtime.cached_snapshot(&root))
        .flatten();
    tauri::async_runtime::spawn_blocking(move || {
        let mut budget = SearchBudget::default();
        search_library_snapshot(
            &root,
            &query,
            cached.as_deref(),
            &changed_paths,
            Some((&cache_root, runtime_blocks_read)),
            &mut budget,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("知识索引任务失败: {}", error))?
}

fn search_library_snapshot(
    root: &Path,
    query: &str,
    cached: Option<&crate::services::knowledge_index::KnowledgeIndexSnapshot>,
    changed_paths: &[PathBuf],
    disk_index: Option<(&Path, bool)>,
    budget: &mut SearchBudget,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    if let Some(snapshot) = cached {
        budget.check_time()?;
        if changed_paths.is_empty()
            && snapshot.file_relations_digest
                == crate::services::knowledge_index::file_relations_digest(root)
        {
            return search_segments_checked(&snapshot.search_segments, query, &mut Some(budget));
        }
        // Never run the incremental helper's empty-path full-tree fallback in
        // an interactive query. Deleted files and non-overlay formats go cold.
        if let [path] = changed_paths {
            if path.is_file() {
                if let Ok(format) = file_format_for_path(path) {
                    if let Some(indexer @ ("markdown" | "text" | "json-text" | "table" | "opml")) =
                        format.adapters.indexer.as_deref()
                    {
                        // The existing helper reads once for relation safety,
                        // then its segment builder reads again. Reserve both;
                        // never enter its read-before-size-check with big input.
                        if path.metadata().is_ok_and(|metadata| {
                            metadata.len() <= format.max_bytes.min(MAX_TEXT_FILE_BYTES)
                        }) {
                            let guard = WorkspaceGuard::new(root).map_err(|_| SearchStop::Io)?;
                            reserve_search_reads(&guard, path, indexer, format.max_bytes, budget)?;
                            reserve_search_reads(&guard, path, indexer, format.max_bytes, budget)?;
                            if let Some(overlay) = refresh_snapshot_incremental_for_paths(
                                root,
                                snapshot.clone(),
                                changed_paths,
                            ) {
                                return search_segments_checked(
                                    &overlay.search_segments,
                                    query,
                                    &mut Some(budget),
                                );
                            }
                        }
                    }
                }
            }
        }
        return search_workspace_checked(root, query, None, budget);
    }
    search_workspace_checked(root, query, disk_index, budget)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResponse {
    results: Vec<KnowledgeSearchResult>,
    warnings: Vec<String>,
    limit_reached: bool,
}

fn configured_search_scope(
    libraries: &[crate::commands::config::LibraryConfig],
    selected: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let identity = |path: &str| path.replace('\\', "/").trim_end_matches('/').to_lowercase();
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for library in libraries {
        if selected.is_some_and(|root| identity(root) != identity(&library.path))
            || !seen.insert(identity(&library.path))
        {
            continue;
        }
        roots.push((library.name.clone(), library.path.clone()));
    }
    if roots.is_empty() {
        return Err("未找到已配置的资料库，请选择资料库或调整搜索范围".into());
    }
    Ok(roots)
}

#[tauri::command]
pub async fn search_knowledge_libraries(
    app: AppHandle,
    runtime: State<'_, KnowledgeIndexRuntime>,
    library_root: Option<String>,
    query: String,
) -> Result<LibrarySearchResponse, String> {
    crate::services::search_query::SearchQuery::parse(&query)?;
    let libraries = crate::commands::config::get_config(app.clone()).libraries;
    let roots = configured_search_scope(&libraries, library_root.as_deref())?;
    let mut response = LibrarySearchResponse {
        results: Vec::new(),
        warnings: Vec::new(),
        limit_reached: false,
    };
    for (name, root) in roots {
        match search_library_knowledge(&app, &runtime, &root, &query).await {
            Ok(results) => {
                response.limit_reached |= results.len() >= MAX_SEARCH_RESULTS;
                response.results.extend(results);
            }
            Err(error) => response.warnings.push(format!("{name}：{error}")),
        }
    }
    if response.results.is_empty() && !response.warnings.is_empty() {
        return Err(response.warnings.join("\n"));
    }
    response.limit_reached |= response.results.len() > MAX_SEARCH_RESULTS;
    sort_search_results(&mut response.results);
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multi_term_search_combines_document_segments_and_excludes_entire_files() {
        let base = IndexedSearchSegment {
            title: "项目方案.txt".into(),
            path: "/a.txt".into(),
            object_type: "plain-text".into(),
            match_kind: "body".into(),
            text: "预算已确认".into(),
            page: None,
            annotation_id: None,
            locator_kind: None,
            locator_object_id: None,
            location_label: None,
            extraction_failed: false,
        };
        let mut old = base.clone();
        old.path = "/old.txt".into();
        let mut exclusion = old.clone();
        exclusion.text = "这是旧版".into();
        let results = search_segments(&[base.clone(), old, exclusion], "项目 预算 -旧版");
        assert!(!results.is_empty());
        assert!(results.iter().all(|result| result.path == "/a.txt"));
        assert!(results.iter().any(|result| result.context.contains("预算")));
        assert!(search_segments(&[base.clone()], "\"项目 预算\"").is_empty());
        assert_eq!(search_segments(&[base.clone()], "-旧版").len(), 1);
        assert!(search_segments(&[base], "\"未结束").is_empty());
    }

    #[test]
    fn multi_term_search_uses_strongest_located_segment() {
        let base = IndexedSearchSegment {
            title: "报告.pdf".into(),
            path: "/report.pdf".into(),
            object_type: "pdf".into(),
            match_kind: "body".into(),
            text: "项目概述".into(),
            page: Some(1),
            annotation_id: None,
            locator_kind: None,
            locator_object_id: None,
            location_label: None,
            extraction_failed: false,
        };
        let mut strongest = base.clone();
        strongest.page = Some(2);
        strongest.text = "项目预算确认".into();
        let results = search_segments(&[base, strongest], "项目 预算");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].page, Some(2));
    }

    #[test]
    fn configured_scope_is_explicit_deduplicated_and_rejects_unknown_roots() {
        let libraries = serde_json::from_value::<Vec<crate::commands::config::LibraryConfig>>(serde_json::json!([{ "name": "项目", "path": "C:/project" }, { "name": "另一入口", "path": "c:\\project\\" }, { "name": "学习", "path": "C:/study" }])).unwrap();
        assert_eq!(configured_search_scope(&libraries, None).unwrap().len(), 2);
        assert_eq!(
            configured_search_scope(&libraries, Some("C:/study")).unwrap(),
            vec![("学习".to_owned(), "C:/study".to_owned())]
        );
        assert!(configured_search_scope(&libraries, Some("C:/private")).is_err());
        assert!(configured_search_scope(&[], None).is_err());
    }

    #[test]
    fn cold_and_indexed_query_match_registered_txt_json_and_exclude_sensitive_files() {
        let root = std::env::temp_dir().join(format!(
            "longedit-query-parity-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("项目.txt"), "预算确认").unwrap();
        fs::write(root.join("项目.json"), "{\"预算\":\"确认\"}").unwrap();
        fs::write(root.join("旧版项目.txt"), "预算确认").unwrap();
        fs::write(root.join(".env"), "项目预算秘密").unwrap();
        let query = "项目 预算 -旧版";
        let live = search_workspace(&root, query, None);
        let sources = collect_index_sources(&root);
        let cached = search_segments(
            &crate::services::knowledge_index::build_search_segments(&root, &sources),
            query,
        );
        let paths = |results: &[KnowledgeSearchResult]| {
            results
                .iter()
                .map(|result| result.path.clone())
                .collect::<HashSet<_>>()
        };
        assert_eq!(paths(&live), paths(&cached));
        assert_eq!(paths(&live).len(), 2);
        assert!(live.iter().any(|result| result.object_type == "plain-text"));
        assert!(live.iter().any(|result| result.object_type == "json"));
        assert_eq!(
            fs::read_to_string(root.join("项目.txt")).unwrap(),
            "预算确认"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_preserves_lines_and_shows_late_match_without_returning_entire_file() {
        let text = format!(
            "{}\n目标段落\n保留换行{}",
            "前言🙂".repeat(5000),
            "后文".repeat(6000)
        );
        let preview = preview_excerpt(&text, "目标段落", "Markdown 原文".into());
        assert!(preview.text.contains("\n目标段落\n保留换行"));
        assert!(preview.match_found && preview.truncated);
        assert!(preview.text.chars().count() <= 8004);
        let short = preview_excerpt("第一行\n第二行", "文件名", "文本内容".into());
        assert_eq!(short.text, "第一行\n第二行");
        assert!(!short.match_found && !short.truncated);
    }

    #[test]
    fn located_search_keeps_distinct_pages_deduplicates_and_bounds_results() {
        let base = IndexedSearchSegment {
            title: "report.pdf".into(),
            path: "/report.pdf".into(),
            object_type: "pdf".into(),
            match_kind: "body".into(),
            text: "budget".into(),
            page: Some(1),
            annotation_id: None,
            locator_kind: None,
            locator_object_id: None,
            location_label: None,
            extraction_failed: false,
        };
        let mut segments = vec![base.clone(), base.clone()];
        for page in 2..=8 {
            segments.push(IndexedSearchSegment {
                page: Some(page),
                ..base.clone()
            });
        }
        let hits = search_segments(&segments, "budget");
        assert_eq!(
            hits.iter().map(|hit| hit.page.unwrap()).collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5]
        );
        let unlocated = segments
            .iter()
            .map(|segment| IndexedSearchSegment {
                page: None,
                ..segment.clone()
            })
            .collect::<Vec<_>>();
        assert_eq!(search_segments(&unlocated, "budget").len(), 1);
        let objects = (1..=3)
            .map(|id| IndexedSearchSegment {
                object_type: "docx".into(),
                page: None,
                locator_kind: Some("docx-block".into()),
                locator_object_id: Some(format!("block-{id}")),
                ..base.clone()
            })
            .collect::<Vec<_>>();
        assert_eq!(search_segments(&objects, "budget").len(), 3);
    }

    #[test]
    fn search_context_keeps_late_unicode_match_visible() {
        let text = format!("{}预算确认{}", "前言🙂".repeat(150), "后文".repeat(150));
        let context = text_match_context(&text, "预算确认").unwrap();
        assert!(context.contains("预算确认"));
        assert!(context.starts_with('…') && context.ends_with('…'));
        assert!(context.chars().count() <= 222);
    }

    #[test]
    fn search_context_preserves_case_and_expanding_unicode_offsets() {
        let text = format!("{} NEEDLE 中文结尾", "İ".repeat(300));
        assert!(text_match_context(&text, "needle")
            .unwrap()
            .contains("NEEDLE 中文结尾"));
        assert_eq!(
            text_match_context("第一行\n这里是匹配内容", "匹配"),
            Some("这里是匹配内容".into())
        );
        assert_eq!(text_match_context("无关", "预算"), None);
        assert_eq!(text_match_context("任意", ""), None);
    }
    use crate::commands::graph::GraphData;
    use crate::services::pdf_index::clear_pdf_index_cache;
    use base64::{engine::general_purpose, Engine as _};
    use std::io::{Cursor, Write};
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    const TWO_PAGE_PDF: &str = "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCAzMDAgMzAwIF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgMzAwIDMwMCBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDcgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDcxOTAxNTkyNSswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgMyAwIFIgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0xlbmd0aCA5Ngo+PgpzdHJlYW0KMSAwIDAgMSAwIDAgY20gIEJUIC9GMSAxMiBUZiAxNC40IFRMIEVUCkJUIDEgMCAwIDEgNDAgMjUwIFRtIChLbm93bGVkZ2UgR3JhcGggQWxwaGEpIFRqIFQqIEVUCiAKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8Ci9MZW5ndGggOTEKPj4Kc3RyZWFtCjEgMCAwIDEgMCAwIGNtICBCVCAvRjEgMTIgVGYgMTQuNCBUTCBFVApCVCAxIDAgMCAxIDQwIDI1MCBUbSAoU2Vjb25kIFBhZ2UgQmV0YSkgVGogVCogRVQKIAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAxMAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDAzOTIgMDAwMDAgbiAKMDAwMDAwMDU4NSAwMDAwMCBuIAowMDAwMDAwNjUzIDAwMDAwIG4gCjAwMDAwMDA5MTQgMDAwMDAgbiAKMDAwMDAwMDk3OSAwMDAwMCBuIAowMDAwMDAxMTI0IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDg3ZGQ4ZDI4MmYyODI4ZmFkMDdiZjc2YTE0NjRkYzM0Pjw4N2RkOGQyODJmMjgyOGZhZDA3YmY3NmExNDY0ZGMzND5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgMTAKPj4Kc3RhcnR4cmVmCjEyNjQKJSVFT0YK";

    pub(super) fn docx_fixture() -> Vec<u8> {
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
        let pages = search_workspace(&root, "a", None);
        assert_eq!(
            pages
                .iter()
                .filter(|hit| hit.match_kind == "body")
                .map(|hit| hit.page)
                .collect::<Vec<_>>(),
            vec![Some(1), Some(2)]
        );
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
        let indexed_pages = search_workspace(&root, "a", Some((&cache, false)));
        assert_eq!(
            indexed_pages
                .iter()
                .filter(|hit| hit.match_kind == "body")
                .map(|hit| hit.page)
                .collect::<Vec<_>>(),
            vec![Some(1), Some(2)]
        );
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
        let graph = tauri::async_runtime::block_on(crate::commands::graph::build_link_graph(
            root.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let snapshot = snapshot_from_graph(&root, graph);
        write_snapshot(&cache, &root, &snapshot).unwrap();
        let ready = inspect_index(&cache, &root, &KnowledgeIndexRuntime::default());
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
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "stale"
        );
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
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "ready"
        );
        assert!(read_ready_snapshot(&cache, &root, false).is_some());

        fs::remove_file(&presentation).unwrap();
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "stale"
        );
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
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "ready"
        );
        assert!(empty_snapshot
            .objects
            .iter()
            .all(|object| object.object_type != "pptx" && object.object_type != "pptx_slide"));
        assert!(empty_snapshot
            .relations
            .iter()
            .all(|relation| relation.relation_type != "contains"));

        delete_index(&cache, &root).unwrap();
        assert_eq!(
            inspect_index(&cache, &root, &KnowledgeIndexRuntime::default()).state,
            "missing"
        );
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
                && result.locator_kind.as_deref() == Some("table-row")
                && result.locator_object_id.as_deref() == Some("row-1")
                && result.location_label.as_deref() == Some("第 1 行")
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
            && result.locator_kind.as_deref() == Some("opml-node")
            && result.locator_object_id.as_deref() == Some("graph")
            && result.location_label.as_deref() == Some("第 2 层主题：知识图谱")
            && !result.context.contains("outline")));
        fs::remove_dir_all(root).unwrap();
    }
}
