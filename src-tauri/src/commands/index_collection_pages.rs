//! Collections share the proven file-group cursor/runtime, not a second pager.
use super::*;
use crate::services::smart_collection::CollectionFilters;
use std::io::Read;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CollectionPageRequest {
    pub library_root: String,
    pub query: String,
    pub object_types: Vec<String>,
    pub filters: CollectionFilters,
    pub sort: SearchSort,
    pub page_size: usize,
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct CollectionScope {
    filters: CollectionFilters,
    types: Vec<String>,
    catalog: bool,
}
#[derive(PartialEq, Eq)]
pub(super) enum Decision {
    Match,
    Skip,
    Unread,
    Pause,
}
impl CollectionScope {
    fn normalize(filters: &CollectionFilters, types: &[String]) -> Result<Self, SearchPageError> {
        let invalid = |message: String| SearchPageError::new("invalidRequest", message);
        filters.validate().map_err(invalid)?;
        if types.len() > 8 {
            return Err(invalid("文件类型不能超过 8 种".into()));
        }
        let mut types = types.to_vec();
        types.sort();
        if types.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err(invalid("文件类型不能重复".into()));
        }
        for id in &types {
            if !crate::formats::file_registry::file_format_by_id(id)
                .map_err(invalid)?
                .capabilities
                .index
                .is_supported()
            {
                return Err(invalid("这种格式尚不支持集合查询".into()));
            }
        }
        let mut tags = std::iter::once(&filters.tag)
            .chain(&filters.tags)
            .filter(|tag| !tag.is_empty())
            .cloned()
            .collect::<Vec<_>>();
        for tag in &tags {
            crate::services::inline_tags::validate(tag).map_err(invalid)?;
        }
        tags.sort();
        tags.dedup();
        Ok(Self {
            filters: CollectionFilters {
                directory: filters
                    .directory
                    .replace('\\', "/")
                    .trim_end_matches('/')
                    .to_owned(),
                tag: tags.first().cloned().unwrap_or_default(),
                tags: tags.into_iter().skip(1).collect(),
                modified_within_days: filters.modified_within_days,
            },
            types,
            catalog: false,
        })
    }
    pub(super) fn accept(
        &self,
        path: &Path,
        source: &IndexedSource,
        cutoff: Option<u64>,
        budget: &mut SearchBudget,
    ) -> Result<Decision, SearchPageError> {
        let Ok(format) = file_format_for_path(path) else {
            return Ok(Decision::Skip);
        };
        let directory = &self.filters.directory;
        if (!directory.is_empty() && !source.path.starts_with(&format!("{directory}/")))
            || (!self.types.is_empty() && !self.types.contains(&format.id))
            || cutoff.is_some_and(|value| source.modified_nanos / 1_000_000_000 < value)
        {
            return Ok(Decision::Skip);
        }
        let tags = std::iter::once(&self.filters.tag)
            .chain(&self.filters.tags)
            .filter(|tag| !tag.is_empty())
            .collect::<Vec<_>>();
        if tags.is_empty() {
            return Ok(Decision::Match);
        }
        if format.id != "markdown" {
            return Ok(Decision::Skip);
        }
        if source.size > 20 * 1024 * 1024 {
            return Ok(Decision::Unread);
        }
        match budget.read(source.size) {
            Ok(()) => {}
            Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
            Err(_) => return Ok(Decision::Pause),
        }
        let mut bytes = Vec::new();
        if fs::File::open(path)
            .and_then(|file| file.take(20 * 1024 * 1024 + 1).read_to_end(&mut bytes))
            .is_err()
            || bytes.len() > 20 * 1024 * 1024
        {
            return Ok(Decision::Unread);
        }
        let Ok(content) = std::str::from_utf8(&bytes) else {
            return Ok(Decision::Unread);
        };
        Ok(
            if crate::services::inline_tags::contains_all(content, &tags) {
                Decision::Match
            } else {
                Decision::Skip
            },
        )
    }
}
impl QuerySession {
    pub(super) fn set_collection(
        &mut self,
        scope: Option<CollectionScope>,
    ) -> Result<(), SearchPageError> {
        if let Some(scope) = &scope {
            if !scope.filters.directory.is_empty() {
                let directory = self
                    .guard
                    .resolve_directory(&scope.filters.directory, false)
                    .map_err(|message| SearchPageError::new("invalidRequest", message))?;
                if scope
                    .filters
                    .directory
                    .split('/')
                    .any(|part| part.starts_with('.') || part.ends_with(".assets"))
                    || crate::formats::file_registry::is_sensitive_path(&directory)
                {
                    return Err(SearchPageError::new(
                        "invalidRequest",
                        "不能查询资料库私有目录或附件缓存",
                    ));
                }
            }
            self.collection_cutoff = scope.filters.modified_within_days.map(|days| {
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
                    .saturating_sub(u64::from(days) * 86400)
            });
        }
        self.collection = scope;
        self.catalog = self
            .collection
            .as_ref()
            .is_some_and(|scope| scope.catalog)
            .then(CatalogState::default);
        if self.collection.is_some() && self.query.is_empty() {
            self.snapshot = None;
            self.disk_cache = None;
            self.indexed = false;
        }
        Ok(())
    }
    pub(super) fn validate_collection_scope(
        &self,
        scope: &Option<CollectionScope>,
    ) -> Result<(), SearchPageError> {
        if self.collection != *scope {
            return Err(SearchPageError::new(
                "requestMismatch",
                "集合条件已改变，请重新查询；没有混合旧页结果。",
            ));
        }
        Ok(())
    }
}
pub async fn run(
    app: AppHandle,
    window: String,
    mut request: CollectionPageRequest,
) -> Result<SearchPageResponse, SearchPageError> {
    if window != "main" {
        return Err(SearchPageError::new(
            "forbidden",
            "只能在主工作台查询标签与集合",
        ));
    }
    request.query = request.query.trim().to_lowercase();
    crate::services::search_query::SearchQuery::parse(&request.query)
        .map_err(|message| SearchPageError::new("invalidRequest", message))?;
    if !(1..=100).contains(&request.page_size)
        || request
            .cursor
            .as_ref()
            .is_some_and(|value| value.len() > 160)
    {
        return Err(SearchPageError::new(
            "invalidRequest",
            "页大小须为 1 至 100 个文件，续载位置须有效。",
        ));
    }
    let scope = CollectionScope::normalize(&request.filters, &request.object_types)?;
    run_scoped_page(
        app,
        window,
        SearchPageRequest {
            library_root: request.library_root,
            query: request.query,
            sort: request.sort,
            match_mode: SearchMatchMode::Content,
            channel: SearchChannel::Collection,
            page_size: request.page_size,
            cursor: request.cursor,
        },
        Some(scope),
    )
    .await
}
pub(super) fn file_segment(path: &Path) -> Result<IndexedSearchSegment, SearchPageError> {
    Ok(IndexedSearchSegment {
        path: path.to_string_lossy().into_owned(),
        title: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        object_type: file_format_for_path(path)
            .map_err(|_| SearchPageError::unavailable())?
            .id
            .clone(),
        match_kind: "title".into(),
        text: String::new(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        extraction_failed: false,
    })
}
pub(super) fn file_result(segment: &IndexedSearchSegment) -> KnowledgeSearchResult {
    KnowledgeSearchResult {
        title: segment.title.clone(),
        path: segment.path.clone(),
        object_type: segment.object_type.clone(),
        match_kind: "title".into(),
        context: "符合集合条件".into(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        score: 100,
        extraction_failed: false,
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSummary {
    pub tags: Vec<TagCount>,
    pub examined_notes: usize,
}
#[derive(Default)]
pub(super) struct CatalogState {
    counts: std::collections::BTreeMap<String, usize>,
    bytes: usize,
    examined_notes: usize,
}
impl CatalogState {
    pub(super) fn summary(&self) -> CatalogSummary {
        let mut tags = self
            .counts
            .iter()
            .map(|(tag, count)| TagCount {
                tag: tag.clone(),
                count: *count,
            })
            .collect::<Vec<_>>();
        tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        CatalogSummary {
            tags,
            examined_notes: self.examined_notes,
        }
    }
}
pub(super) enum CatalogDecision {
    Match,
    Unread,
    Pause,
    Limited,
}
pub(super) fn catalog_source(
    path: &Path,
    source: &IndexedSource,
    budget: &mut SearchBudget,
    catalog: &mut CatalogState,
) -> Result<CatalogDecision, SearchPageError> {
    if source.size > 20 * 1024 * 1024 {
        return Ok(CatalogDecision::Unread);
    }
    match budget.read(source.size) {
        Ok(()) => {}
        Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
        Err(_) => return Ok(CatalogDecision::Pause),
    }
    let mut bytes = Vec::new();
    if fs::File::open(path)
        .and_then(|file| file.take(20 * 1024 * 1024 + 1).read_to_end(&mut bytes))
        .is_err()
        || bytes.len() > 20 * 1024 * 1024
    {
        return Ok(CatalogDecision::Unread);
    }
    let Ok(content) = std::str::from_utf8(&bytes) else {
        return Ok(CatalogDecision::Unread);
    };
    let mut names = std::collections::BTreeSet::new();
    let mut extra_bytes = 0;
    let mut extra_names = 0;
    for capture in crate::services::inline_tags::TAGS.captures_iter(content) {
        let name = capture.get(1).unwrap().as_str();
        if name.chars().count() > 500 { return Ok(CatalogDecision::Limited); }
        if names.contains(name) {
            continue;
        }
        if !catalog.counts.contains_key(name) {
            extra_bytes += serde_json::to_vec(&TagCount {
                tag: name.into(),
                count: 1,
            })
            .map_err(|_| SearchPageError::unavailable())?
            .len()
                + 32;
            if catalog.counts.len() + extra_names >= 10_000
                || catalog.bytes.saturating_add(extra_bytes) > 2 * 1024 * 1024
            {
                return Ok(CatalogDecision::Limited);
            }
            extra_names += 1;
        }
        names.insert(name.to_owned());
    }
    catalog.bytes += extra_bytes;
    catalog.examined_notes += 1;
    for name in names {
        *catalog.counts.entry(name).or_default() += 1;
    }
    Ok(CatalogDecision::Match)
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogPageRequest {
    pub library_root: String,
    pub cursor: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPageResponse {
    session_id: String,
    next_cursor: Option<String>,
    scan_state: ScanState,
    scan_complete: bool,
    tags: Vec<TagCount>,
    examined_notes: usize,
    total_notes: Option<usize>,
    unread_sources: usize,
    warnings: Vec<String>,
}
pub async fn run_catalog(
    app: AppHandle,
    window: String,
    request: CatalogPageRequest,
) -> Result<CatalogPageResponse, SearchPageError> {
    if window != "main" {
        return Err(SearchPageError::new(
            "forbidden",
            "只能在主工作台统计资料库标签",
        ));
    }
    if request
        .cursor
        .as_ref()
        .is_some_and(|cursor| cursor.len() > 160)
    {
        return Err(SearchPageError::new(
            "invalidRequest",
            "标签统计续载位置无效",
        ));
    }
    let scope = CollectionScope {
        filters: Default::default(),
        types: vec!["markdown".into()],
        catalog: true,
    };
    let response = run_scoped_page(
        app,
        window,
        SearchPageRequest {
            library_root: request.library_root,
            query: String::new(),
            sort: SearchSort::Name,
            match_mode: SearchMatchMode::Content,
            page_size: 40,
            channel: SearchChannel::TagCatalog,
            cursor: request.cursor,
        },
        Some(scope),
    )
    .await?;
    let catalog = response.catalog.ok_or_else(SearchPageError::unavailable)?;
    Ok(CatalogPageResponse {
        session_id: response.session_id,
        // All counts are accumulated before file paging; catalog never pages
        // the incidental file cards used by the shared source verifier.
        next_cursor: if response.scan_state == ScanState::Preparing {
            response.next_cursor
        } else {
            None
        },
        scan_state: response.scan_state,
        scan_complete: response.scan_complete,
        total_notes: response.scan_complete.then_some(catalog.examined_notes),
        tags: catalog.tags,
        examined_notes: catalog.examined_notes,
        unread_sources: response.unread_sources,
        warnings: response.warnings,
    })
}

// Legacy vector commands remain available, but use the same grammar, safe
// inventory and finite resource ceilings. They never return a partial vector
// as if it were a complete count. New UI uses the resumable native entry.
pub(crate) fn legacy_tag_catalog(root: &Path) -> Result<Vec<TagCount>, String> {
    let (mut state, mut request) = legacy_session(root, None)?;
    let start = Instant::now();
    loop {
        if start.elapsed() > Duration::from_secs(30) {
            return Err("标签统计用时较长，请从标签页分批继续；没有将部分数量当全部。".into());
        }
        let response = state
            .request_bound(
                request
                    .cursor
                    .clone()
                    .unwrap_or_else(|| state.work_cursor()),
                &mut SearchBudget::default(),
            )
            .map_err(|error| error.message)?;
        if response.scan_state == ScanState::Preparing {
            request.cursor = response.next_cursor;
            continue;
        }
        if !response.scan_complete {
            return Err(response.warnings.join("；"));
        }
        return Ok(response.catalog.ok_or("标签统计结果缺失")?.tags);
    }
}
pub(crate) fn legacy_tag_files(root: &Path, tag: &str) -> Result<Vec<crate::FileEntry>, String> {
    let (mut state, mut request) = legacy_session(root, Some(tag))?;
    let start = Instant::now();
    let mut files = Vec::new();
    loop {
        if start.elapsed() > Duration::from_secs(30) {
            return Err("标签查询用时较长，请从标签页分批继续；未清空当前结果。".into());
        }
        let response = state
            .request_bound(
                request
                    .cursor
                    .clone()
                    .unwrap_or_else(|| state.work_cursor()),
                &mut SearchBudget::default(),
            )
            .map_err(|error| error.message)?;
        if response.scan_state != ScanState::Preparing && !response.scan_complete {
            return Err(response.warnings.join("；"));
        }
        files.extend(response.files.into_iter().map(|file| crate::FileEntry {
            name: file.title,
            path: file.path,
            is_dir: false,
        }));
        if response.next_cursor.is_none() {
            return Ok(files);
        }
        request.cursor = response.next_cursor;
    }
}
fn legacy_session(
    root: &Path,
    tag: Option<&str>,
) -> Result<(QuerySession, SearchPageRequest), String> {
    let request = SearchPageRequest {
        library_root: root.to_string_lossy().into_owned(),
        query: String::new(),
        sort: SearchSort::Name,
        match_mode: SearchMatchMode::Content,
        page_size: 100,
        channel: SearchChannel::Collection,
        cursor: None,
    };
    let mut state =
        QuerySession::new(root, &request, 0, None, None).map_err(|error| error.message)?;
    let mut scope = CollectionScope::normalize(
        &CollectionFilters {
            tag: tag.unwrap_or_default().into(),
            ..Default::default()
        },
        &["markdown".into()],
    )
    .map_err(|error| error.message)?;
    scope.catalog = tag.is_none();
    state
        .set_collection(Some(scope))
        .map_err(|error| error.message)?;
    Ok((state, request))
}

#[cfg(test)]
#[path = "index_collection_pages_tests.rs"]
mod tests;
