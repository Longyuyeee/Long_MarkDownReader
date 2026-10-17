//! Single-library file-group continuation. Existing UI/API adapters stay intact
//! until the approved search-page design is connected and visually verified.
use super::*;
use crate::services::{
    knowledge_index::{file_relations_digest, source_digest, KnowledgeIndexSnapshot},
    search_scan::{SearchLimits, SourceScan},
};
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[path = "index_collection_pages.rs"]
pub mod collections;
#[path = "index_search_libraries.rs"]
pub mod libraries;

const MAX_SESSIONS: usize = 4;
const MAX_ACTIVE_TASKS: usize = 4;
const MAX_SESSION_SOURCES: usize = 100_000;
const MAX_SESSION_FILES: usize = 10_000;
const MAX_RESULT_BYTES: usize = 8 * 1024 * 1024;
const MAX_FILES_PER_STEP: usize = 256;
const IDLE_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_AGE: Duration = Duration::from_secs(20 * 60);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum SearchChannel {
    Library,
    Palette,
    Collection,
    TagCatalog,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchSort {
    #[default]
    Relevance,
    Modified,
    Name,
    Path,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchMatchMode {
    #[default]
    Content,
    Tag,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchPageRequest {
    pub library_root: String,
    pub query: String,
    #[serde(default)]
    pub sort: SearchSort,
    #[serde(default)]
    pub match_mode: SearchMatchMode,
    pub page_size: usize,
    pub channel: SearchChannel,
    pub cursor: Option<String>,
}

impl SearchPageRequest {
    fn normalize_validate(&mut self) -> Result<(), SearchPageError> {
        if !matches!(
            self.channel,
            SearchChannel::Library | SearchChannel::Palette
        ) {
            return Err(SearchPageError::new(
                "invalidRequest",
                "请使用原标签或集合入口继续查询。",
            ));
        }
        self.query = self.query.trim().to_owned();
        if self.match_mode == SearchMatchMode::Content {
            self.query = self.query.to_lowercase();
        }
        crate::services::search_query::SearchQuery::parse(&self.query)
            .map_err(|message| SearchPageError::new("invalidRequest", message))?;
        if self.match_mode == SearchMatchMode::Tag {
            tag_pattern(&self.query)?;
        }
        if self.query.is_empty()
            || !(1..=100).contains(&self.page_size)
            || self
                .cursor
                .as_ref()
                .is_some_and(|cursor| cursor.len() > 160)
        {
            return Err(SearchPageError::new(
                "invalidRequest",
                "请输入搜索条件，页大小须为 1 至 100 个文件。",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileGroup {
    pub path: String,
    pub title: String,
    pub modified_at_ms: Option<u64>,
    pub matches: Vec<KnowledgeSearchResult>,
    pub may_have_more_matches: bool,
    pub location_limit_per_kind: usize,
    pub unlocated_limit_per_kind: usize,
    #[serde(skip)]
    modified_nanos: u64,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScanState {
    Preparing,
    Ready,
    Limited,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPageResponse {
    pub session_id: String,
    pub snapshot_id: Option<String>,
    pub files: Vec<SearchFileGroup>,
    pub page_offset: Option<usize>,
    pub next_cursor: Option<String>,
    pub scan_state: ScanState,
    pub scan_complete: bool,
    pub coverage: &'static str,
    pub total_files: Option<usize>,
    pub examined_sources: usize,
    pub indexed: bool,
    pub unread_sources: usize,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catalog: Option<collections::CatalogSummary>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPageError {
    pub code: &'static str,
    pub message: String,
}
impl SearchPageError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
    fn expired() -> Self {
        Self::new(
            "expired",
            "资料或查询现场已变化，请重新搜索；不会替换或保存当前草稿。",
        )
    }
    fn busy() -> Self {
        Self::new("busy", "搜索任务较多，请稍后继续；已加载结果不应清空。")
    }
    fn unavailable() -> Self {
        Self::new(
            "unavailable",
            "部分资料已变化或无法读取，请核对资料库后重试；这不是没有匹配。",
        )
    }
}

type Owner = (String, SearchChannel);
struct SessionHandle {
    id: String,
    cancelled: Arc<AtomicBool>,
    state: Mutex<SessionState>,
}

enum SessionState {
    Single(Box<QuerySession>),
    Libraries(Box<libraries::LibrarySession>),
}
impl SessionState {
    fn expired(&self) -> bool {
        match self {
            Self::Single(session) => session.expired(),
            Self::Libraries(session) => session.expired(),
        }
    }
}

#[derive(Default)]
pub struct SearchPageRuntime {
    sessions: Mutex<HashMap<Owner, Arc<SessionHandle>>>,
    active: Arc<AtomicUsize>,
}

struct TaskPermit(Arc<AtomicUsize>);
impl Drop for TaskPermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

impl SearchPageRuntime {
    fn permit(&self) -> Result<TaskPermit, SearchPageError> {
        self.active
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count < MAX_ACTIVE_TASKS).then_some(count + 1)
            })
            .map_err(|_| SearchPageError::busy())?;
        Ok(TaskPermit(self.active.clone()))
    }

    fn prune(sessions: &mut HashMap<Owner, Arc<SessionHandle>>) {
        sessions.retain(|_, entry| {
            let expired = match entry.state.try_lock() {
                Ok(state) => state.expired(),
                Err(std::sync::TryLockError::Poisoned(_)) => true,
                Err(std::sync::TryLockError::WouldBlock) => false,
            };
            if expired {
                entry.cancelled.store(true, Ordering::Release);
            }
            !expired
        });
    }

    fn insert(
        &self,
        owner: Owner,
        session: QuerySession,
    ) -> Result<Arc<SessionHandle>, SearchPageError> {
        self.insert_state(
            owner,
            session.id.clone(),
            session.cancelled.clone(),
            SessionState::Single(Box::new(session)),
        )
    }

    fn insert_state(
        &self,
        owner: Owner,
        id: String,
        cancelled: Arc<AtomicBool>,
        state: SessionState,
    ) -> Result<Arc<SessionHandle>, SearchPageError> {
        let mut sessions = self.sessions.lock().map_err(|_| SearchPageError::busy())?;
        Self::prune(&mut sessions);
        if !sessions.contains_key(&owner) && sessions.len() >= MAX_SESSIONS {
            return Err(SearchPageError::busy());
        }
        let handle = Arc::new(SessionHandle {
            id,
            cancelled,
            state: Mutex::new(state),
        });
        if let Some(old) = sessions.insert(owner, handle.clone()) {
            old.cancelled.store(true, Ordering::Release);
        }
        Ok(handle)
    }

    fn get(&self, owner: &Owner) -> Result<Arc<SessionHandle>, SearchPageError> {
        let mut sessions = self.sessions.lock().map_err(|_| SearchPageError::busy())?;
        Self::prune(&mut sessions);
        sessions
            .get(owner)
            .cloned()
            .ok_or_else(SearchPageError::expired)
    }

    pub fn close(&self, window: &str, channel: SearchChannel, id: &str) -> bool {
        let Ok(mut sessions) = self.sessions.lock() else {
            return false;
        };
        let owner = (window.to_owned(), channel);
        if !sessions.get(&owner).is_some_and(|session| session.id == id) {
            return false;
        }
        if let Some(session) = sessions.remove(&owner) {
            session.cancelled.store(true, Ordering::Release);
        }
        true
    }

    pub fn close_window(&self, window: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.retain(|owner, session| {
                if owner.0 == window {
                    session.cancelled.store(true, Ordering::Release);
                    return false;
                }
                true
            });
        }
    }
}

pub async fn run_page(
    app: AppHandle,
    window: String,
    mut request: SearchPageRequest,
) -> Result<SearchPageResponse, SearchPageError> {
    request.normalize_validate()?;
    run_scoped_page(app, window, request, None).await
}
async fn run_scoped_page(
    app: AppHandle,
    window: String,
    request: SearchPageRequest,
    collection: Option<collections::CollectionScope>,
) -> Result<SearchPageResponse, SearchPageError> {
    let libraries = crate::commands::config::get_config(app.clone()).libraries;
    let selected = configured_page_scope(&libraries, &request.library_root)?;
    let guard = WorkspaceGuard::new(selected).map_err(|_| {
        if request.cursor.is_some() {
            SearchPageError::expired()
        } else {
            SearchPageError::unavailable()
        }
    })?;
    let root = guard.root().to_path_buf();
    let runtime = app.state::<SearchPageRuntime>();
    let permit = runtime.permit()?;
    let owner = (window, request.channel);
    let entry = if request.cursor.is_some() {
        runtime.get(&owner)?
    } else {
        let index = app.state::<KnowledgeIndexRuntime>();
        index
            .ensure_watcher(&root)
            .map_err(|_| SearchPageError::unavailable())?;
        let revision = index.search_revision_stamp(&root);
        let allow_index = !index.blocks_index_reads(&root) && !index.search_sources_changed(&root);
        let snapshot = allow_index.then(|| index.cached_snapshot(&root)).flatten();
        let cache = knowledge_index_cache_root(&app).map_err(|_| SearchPageError::unavailable())?;
        let mut session = QuerySession::new(
            &root,
            &request,
            revision.0,
            snapshot,
            allow_index.then_some(cache),
        )?;
        session.set_collection(collection.clone())?;
        session.index_epoch = revision.1;
        session.source_epoch = revision.2;
        runtime.insert(owner.clone(), session)?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let index = app.state::<KnowledgeIndexRuntime>();
        let mut state = entry
            .state
            .try_lock()
            .map_err(|_| SearchPageError::busy())?;
        let SessionState::Single(session) = &mut *state else {
            return Err(SearchPageError::new(
                "requestMismatch",
                "这是跨库查询的续载位置，请使用原搜索入口。",
            ));
        };
        session.validate_collection_scope(&collection)?;
        session.validate_binding(&request)?;
        let result = session.request_live(&request, &index, SearchLimits::default());
        let result = if entry.cancelled.load(Ordering::Acquire) {
            Err(SearchPageError::expired())
        } else {
            result
        };
        drop(state);
        if result
            .as_ref()
            .is_err_and(|error| matches!(error.code, "expired" | "unavailable"))
        {
            app.state::<SearchPageRuntime>()
                .close(&owner.0, owner.1, &entry.id);
        }
        result
    })
    .await
    .map_err(|_| {
        SearchPageError::new(
            "taskFailed",
            "搜索任务未完成，请重试；已加载结果和草稿应保留。",
        )
    })?
}

fn configured_page_scope<'a>(
    libraries: &'a [crate::commands::config::LibraryConfig],
    requested: &str,
) -> Result<&'a str, SearchPageError> {
    let requested = scope_identity(requested);
    // Select in config before any filesystem access. In particular, don't
    // canonicalize every unrelated/offline library on every continuation.
    libraries
        .iter()
        .find(|library| scope_identity(&library.path) == requested)
        .map(|library| library.path.as_str())
        .ok_or_else(|| {
            SearchPageError::new(
                "scopeUnavailable",
                "请选择已配置的资料库；本次搜索没有读取其他范围。",
            )
        })
}

fn scope_identity(path: &str) -> String {
    let path = path.replace('\\', "/");
    let path = if cfg!(windows) {
        let lower = path.to_lowercase();
        if let Some(unc) = lower.strip_prefix("//?/unc/") {
            format!("//{unc}")
        } else {
            lower.strip_prefix("//?/").unwrap_or(&lower).to_owned()
        }
    } else {
        path
    };
    path.trim_end_matches('/').to_owned()
}

fn session_identity() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "{:x}",
        md5::compute(format!(
            "{}:{}:{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    )
}

// One pool per user query, shared by every library. These are retained
// signatures/result payloads, not allocator/RSS or physical I/O accounting.
#[derive(Default)]
struct RetainedCounts {
    sources: usize,
    files: usize,
    bytes: usize,
}
#[derive(Default)]
struct RetentionPool(Mutex<RetainedCounts>);
struct Retention {
    pool: Arc<RetentionPool>,
    owned: RetainedCounts,
}
impl Default for Retention {
    fn default() -> Self {
        Self {
            pool: Arc::new(RetentionPool::default()),
            owned: RetainedCounts::default(),
        }
    }
}
impl Retention {
    fn source(&mut self) -> bool {
        let Ok(mut counts) = self.pool.0.lock() else {
            return false;
        };
        if counts.sources >= MAX_SESSION_SOURCES {
            return false;
        }
        counts.sources += 1;
        self.owned.sources += 1;
        true
    }
    fn group(&mut self, bytes: usize) -> bool {
        let Ok(mut counts) = self.pool.0.lock() else {
            return false;
        };
        if counts.files >= MAX_SESSION_FILES
            || bytes > MAX_RESULT_BYTES.saturating_sub(counts.bytes)
        {
            return false;
        }
        counts.files += 1;
        counts.bytes += bytes;
        self.owned.files += 1;
        self.owned.bytes += bytes;
        true
    }
}
impl Drop for Retention {
    fn drop(&mut self) {
        if let Ok(mut counts) = self.pool.0.lock() {
            counts.sources = counts.sources.saturating_sub(self.owned.sources);
            counts.files = counts.files.saturating_sub(self.owned.files);
            counts.bytes = counts.bytes.saturating_sub(self.owned.bytes);
        }
    }
}

struct SourceVerification {
    revision: u64,
    scan: SourceScan,
    seen: Vec<bool>,
    count: usize,
}

struct QuerySession {
    id: String,
    guard: WorkspaceGuard,
    query: String,
    sort: SearchSort,
    match_mode: SearchMatchMode,
    tag_pattern: Option<regex::Regex>,
    collection: Option<collections::CollectionScope>,
    collection_cutoff: Option<u64>,
    pending_collection: bool,
    catalog: Option<collections::CatalogState>,
    pending_catalog: bool,
    page_size: usize,
    revision: u64,
    index_epoch: u64,
    source_epoch: u64,
    needs_verification: bool,
    verification: Option<SourceVerification>,
    created: Instant,
    touched: Instant,
    cancelled: Arc<AtomicBool>,
    scan: Option<SourceScan>,
    sources: Vec<IndexedSource>,
    source_paths: HashMap<String, usize>,
    snapshot: Option<Arc<KnowledgeIndexSnapshot>>,
    disk_cache: Option<PathBuf>,
    snapshot_id: Option<String>,
    relations_digest: String,
    indexed: bool,
    map_position: usize,
    positions: Vec<Vec<usize>>,
    source_position: usize,
    pending_segments: Option<Vec<IndexedSearchSegment>>,
    groups: Vec<SearchFileGroup>,
    retained_bytes: usize,
    state: ScanState,
    warnings: Vec<String>,
    work_step: u64,
    last_work: Option<(String, SearchPageResponse)>,
    furthest_page: usize,
    body_builds: usize,
    unread_sources: usize,
    retention: Retention,
}

impl QuerySession {
    fn new(
        root: &Path,
        request: &SearchPageRequest,
        revision: u64,
        snapshot: Option<Arc<KnowledgeIndexSnapshot>>,
        disk_cache: Option<PathBuf>,
    ) -> Result<Self, SearchPageError> {
        // An opaque process-local identity, not an authentication secret. Access
        // is bound to the caller's injected native window and fixed channel.
        let id = session_identity();
        Ok(Self {
            id,
            guard: WorkspaceGuard::new(root).map_err(|_| SearchPageError::unavailable())?,
            query: request.query.clone(),
            sort: request.sort,
            match_mode: request.match_mode,
            tag_pattern: if request.match_mode == SearchMatchMode::Tag {
                Some(tag_pattern(&request.query)?)
            } else {
                None
            },
            collection: None,
            collection_cutoff: None,
            pending_collection: false,
            catalog: None,
            pending_catalog: false,
            page_size: request.page_size,
            revision,
            index_epoch: 0,
            source_epoch: 0,
            needs_verification: false,
            verification: None,
            created: Instant::now(),
            touched: Instant::now(),
            cancelled: Arc::new(AtomicBool::new(false)),
            scan: Some(SourceScan::new(root).map_err(|_| SearchPageError::unavailable())?),
            sources: Vec::new(),
            source_paths: HashMap::new(),
            snapshot,
            disk_cache,
            snapshot_id: None,
            relations_digest: String::new(),
            indexed: false,
            map_position: 0,
            positions: Vec::new(),
            source_position: 0,
            pending_segments: None,
            groups: Vec::new(),
            retained_bytes: 0,
            state: ScanState::Preparing,
            warnings: Vec::new(),
            work_step: 0,
            last_work: None,
            furthest_page: 0,
            body_builds: 0,
            unread_sources: 0,
            retention: Retention::default(),
        })
    }

    fn expired(&self) -> bool {
        self.touched.elapsed() >= IDLE_TTL || self.created.elapsed() >= MAX_AGE
    }
    fn work_cursor(&self) -> String {
        format!("{}:w:{}", self.id, self.work_step)
    }
    fn page_cursor(&self, offset: usize) -> String {
        format!("{}:p:{offset}", self.id)
    }

    #[cfg(test)]
    fn request(
        &mut self,
        request: &SearchPageRequest,
        revision: u64,
        limits: SearchLimits,
    ) -> Result<SearchPageResponse, SearchPageError> {
        self.validate_binding(request)?;
        let cursor = request.cursor.clone().unwrap_or_else(|| self.work_cursor());
        if self.expired() || self.cancelled.load(Ordering::Acquire) || self.revision != revision {
            return Err(SearchPageError::expired());
        }
        self.request_bound(
            cursor,
            &mut SearchBudget::new(limits).with_cancellation(self.cancelled.clone()),
        )
    }

    fn request_live(
        &mut self,
        request: &SearchPageRequest,
        index: &KnowledgeIndexRuntime,
        limits: SearchLimits,
    ) -> Result<SearchPageResponse, SearchPageError> {
        self.validate_binding(request)?;
        self.observe_notifications(index)?;
        let mut budget = SearchBudget::new(limits).with_cancellation(self.cancelled.clone());
        let cursor = request.cursor.clone().unwrap_or_else(|| self.work_cursor());
        if let Some((previous, response)) = &self.last_work {
            if previous == &cursor && response.scan_state == ScanState::Preparing {
                // A retry does not advance or skip the issued next work cursor.
                self.touched = Instant::now();
                return Ok(response.clone());
            }
        }
        let work_issued = self.state == ScanState::Preparing
            || self
                .last_work
                .as_ref()
                .is_some_and(|(_, frame)| frame.scan_state == ScanState::Preparing);
        if cursor == self.work_cursor() && work_issued {
            self.advance_live(index, &mut budget)?;
            self.work_step += 1;
            let response = if self.public_scan_state() == ScanState::Preparing {
                self.response(Vec::new(), None, Some(self.work_cursor()))
            } else {
                self.page(0)?
            };
            self.last_work = Some((cursor, response.clone()));
            self.touched = Instant::now();
            return Ok(response);
        }
        // Already issued file pages retain the stricter synchronous proof.
        // Work preparation can span budgets; published pages never become an
        // unverified replacement or silently append a different snapshot.
        if self.needs_verification
            && !verify_directory_notification(
                self,
                index,
                (self.revision, self.index_epoch),
                &mut budget,
            )
        {
            return Err(SearchPageError::expired());
        }
        self.needs_verification = false;
        self.verification = None;
        let response = self.request_bound(cursor, &mut budget)?;
        self.observe_notifications(index)?;
        if self.needs_verification
            && !verify_directory_notification(
                self,
                index,
                (self.revision, self.index_epoch),
                &mut budget,
            )
        {
            return Err(SearchPageError::expired());
        }
        self.needs_verification = false;
        Ok(response)
    }

    fn public_scan_state(&self) -> ScanState {
        if self.needs_verification {
            ScanState::Preparing
        } else {
            self.state
        }
    }

    fn observe_notifications(
        &mut self,
        index: &KnowledgeIndexRuntime,
    ) -> Result<(), SearchPageError> {
        let stamp = index.search_revision_stamp(self.guard.root());
        if self.expired()
            || self.cancelled.load(Ordering::Acquire)
            || !index.search_watch_healthy(self.guard.root())
            || stamp.1 != self.index_epoch
            || stamp.2 != self.source_epoch
        {
            return Err(SearchPageError::expired());
        }
        if stamp.0 != self.revision {
            self.needs_verification = true;
            if self
                .verification
                .as_ref()
                .is_some_and(|proof| proof.revision != stamp.0)
            {
                self.verification = None;
            }
        }
        Ok(())
    }

    fn advance_live(
        &mut self,
        index: &KnowledgeIndexRuntime,
        budget: &mut SearchBudget,
    ) -> Result<(), SearchPageError> {
        self.observe_notifications(index)?;
        // Preserve the original source walk until it is complete. A directory
        // hint cannot publish results, but it need not restart a large scan.
        if self.needs_verification && self.scan.is_none() {
            if !self.verify_sources_step(index, budget)? {
                self.observe_notifications(index)?;
                return Ok(());
            }
        }
        if self.state == ScanState::Preparing {
            self.advance(budget)?;
        }
        self.observe_notifications(index)?;
        if self.needs_verification && self.scan.is_none() {
            self.verify_sources_step(index, budget)?;
        }
        self.observe_notifications(index)?;
        Ok(())
    }

    fn verify_sources_step(
        &mut self,
        index: &KnowledgeIndexRuntime,
        budget: &mut SearchBudget,
    ) -> Result<bool, SearchPageError> {
        if self.state == ScanState::Limited {
            return Err(SearchPageError::expired());
        }
        self.observe_notifications(index)?;
        if !self.needs_verification {
            return Ok(true);
        }
        if self.verification.is_none() {
            self.verification = Some(SourceVerification {
                revision: index.search_revision(self.guard.root()),
                scan: SourceScan::new(self.guard.root())
                    .map_err(|_| SearchPageError::unavailable())?,
                seen: vec![false; self.sources.len()],
                count: 0,
            });
        }
        let proof = self.verification.as_mut().unwrap();
        loop {
            match proof.scan.next(budget) {
                Ok(Some(source)) => {
                    let position = self
                        .sources
                        .binary_search_by(|expected| expected.path.cmp(&source.path))
                        .map_err(|_| SearchPageError::expired())?;
                    if proof.seen[position] || self.sources[position] != source {
                        return Err(SearchPageError::expired());
                    }
                    proof.seen[position] = true;
                    proof.count += 1;
                }
                Ok(None) => break,
                Err(SearchStop::Entries | SearchStop::Sources | SearchStop::Elapsed) => {
                    return Ok(false)
                }
                Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                Err(_) => return Err(SearchPageError::unavailable()),
            }
        }
        if proof.count != self.sources.len() {
            return Err(SearchPageError::expired());
        }
        let target = proof.revision;
        let relation = self.guard.root().join(".longedit/file-relations.json");
        match fs::metadata(&relation) {
            Ok(metadata) => match budget.read(metadata.len()) {
                Ok(()) => {}
                Err(SearchStop::ReadBytes | SearchStop::Elapsed) => return Ok(false),
                Err(_) => return Err(SearchPageError::expired()),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(SearchPageError::expired()),
        }
        let digest = file_relations_digest(self.guard.root());
        if digest == "unavailable" || digest != self.relations_digest {
            return Err(SearchPageError::expired());
        }
        self.observe_notifications(index)?;
        if self.verification.as_ref().map(|proof| proof.revision) != Some(target)
            || index.search_revision_stamp(self.guard.root())
                != (target, self.index_epoch, self.source_epoch)
        {
            return Ok(false);
        }
        if budget.check_time().is_err() {
            return Ok(false);
        }
        self.revision = target;
        self.needs_verification = false;
        self.verification = None;
        Ok(true)
    }

    fn validate_binding(&self, request: &SearchPageRequest) -> Result<(), SearchPageError> {
        if self.query != request.query
            || self.sort != request.sort
            || self.match_mode != request.match_mode
            || self.page_size != request.page_size
            || WorkspaceGuard::new(&request.library_root)
                .map_or(true, |guard| guard.root() != self.guard.root())
        {
            return Err(SearchPageError::new(
                "requestMismatch",
                "续载条件与原查询不同，请重新搜索；没有混合两个查询的结果。",
            ));
        }
        if request
            .cursor
            .as_ref()
            .is_some_and(|cursor| !cursor.starts_with(&format!("{}:", self.id)))
        {
            return Err(SearchPageError::new(
                "invalidCursor",
                "这是旧查询的续载位置，未改变当前查询。",
            ));
        }
        Ok(())
    }

    fn request_bound(
        &mut self,
        cursor: String,
        budget: &mut SearchBudget,
    ) -> Result<SearchPageResponse, SearchPageError> {
        if let Some((previous, response)) = &self.last_work {
            if previous == &cursor {
                self.validate_response(response)?;
                let response = response.clone();
                self.touched = Instant::now();
                return Ok(response);
            }
        }
        let page_prefix = format!("{}:p:", self.id);
        let response = if let Some(offset) = cursor.strip_prefix(&page_prefix) {
            let offset = offset
                .parse::<usize>()
                .map_err(|_| SearchPageError::new("invalidCursor", "续载位置无效。"))?;
            if self.state == ScanState::Preparing
                || offset % self.page_size != 0
                || offset > self.furthest_page
            {
                return Err(SearchPageError::new(
                    "invalidCursor",
                    "续载位置无效，请使用当前结果提供的继续查看入口。",
                ));
            }
            self.page(offset)?
        } else {
            if cursor != self.work_cursor() || self.state != ScanState::Preparing {
                return Err(SearchPageError::new(
                    "invalidCursor",
                    "续载步骤已更新，请使用最新的继续查看位置。",
                ));
            }
            self.advance(budget)?;
            self.work_step += 1;
            let response = if self.state == ScanState::Preparing {
                self.response(Vec::new(), None, Some(self.work_cursor()))
            } else {
                self.page(0)?
            };
            self.last_work = Some((cursor, response.clone()));
            response
        };
        self.touched = Instant::now();
        Ok(response)
    }

    fn response(
        &self,
        files: Vec<SearchFileGroup>,
        page_offset: Option<usize>,
        next_cursor: Option<String>,
    ) -> SearchPageResponse {
        SearchPageResponse {
            session_id: self.id.clone(),
            snapshot_id: self.snapshot_id.clone(),
            files,
            page_offset,
            next_cursor,
            scan_state: self.public_scan_state(),
            scan_complete: self.public_scan_state() == ScanState::Ready,
            coverage: if self.collection.is_some() && self.query.is_empty() {
                "registered-file-metadata-and-tag-filter"
            } else {
                "registered-extractable-content"
            },
            total_files: (self.public_scan_state() == ScanState::Ready)
                .then_some(self.groups.len()),
            examined_sources: self.source_position,
            indexed: self.indexed,
            unread_sources: self.unread_sources,
            warnings: self.warnings.clone(),
            catalog: self.catalog.as_ref().map(|catalog| catalog.summary()),
        }
    }

    fn page(&mut self, offset: usize) -> Result<SearchPageResponse, SearchPageError> {
        if offset > self.groups.len() {
            return Err(SearchPageError::expired());
        }
        let end = (offset + self.page_size).min(self.groups.len());
        let next = (end < self.groups.len()).then(|| self.page_cursor(end));
        self.furthest_page = self
            .furthest_page
            .max(if next.is_some() { end } else { offset });
        let response = self.response(self.groups[offset..end].to_vec(), Some(offset), next);
        self.validate_response(&response)?;
        Ok(response)
    }

    fn validate_source(&self, source: &IndexedSource) -> Result<(), SearchPageError> {
        let path = self
            .guard
            .root()
            .join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let metadata = fs::symlink_metadata(&path).map_err(|_| SearchPageError::expired())?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(SearchPageError::expired());
        }
        self.guard
            .resolve_existing(&path)
            .map_err(|_| SearchPageError::expired())?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_nanos().min(u64::MAX as u128) as u64)
            .unwrap_or(0);
        if metadata.len() != source.size || modified != source.modified_nanos {
            return Err(SearchPageError::expired());
        }
        Ok(())
    }

    fn validate_response(&self, response: &SearchPageResponse) -> Result<(), SearchPageError> {
        for group in &response.files {
            self.validate_group(group)?;
        }
        Ok(())
    }

    fn validate_group(&self, group: &SearchFileGroup) -> Result<(), SearchPageError> {
        let source = self
            .sources
            .get(
                *self
                    .source_paths
                    .get(&group.path)
                    .ok_or_else(SearchPageError::expired)?,
            )
            .ok_or_else(SearchPageError::expired)?;
        self.validate_source(source)?;
        if group
            .matches
            .iter()
            .any(|result| result.object_type == "pdf")
        {
            for suffix in [".annotations.json", ".ocr.json"] {
                let companion = format!("{}{suffix}", group.path);
                if let Some(position) = self.source_paths.get(&companion) {
                    self.validate_source(&self.sources[*position])?;
                } else if !matches!(fs::symlink_metadata(&companion), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
                {
                    return Err(SearchPageError::expired());
                }
            }
        }
        Ok(())
    }

    fn finish(&mut self, warning: Option<String>) {
        self.state = if warning.is_some() {
            ScanState::Limited
        } else {
            ScanState::Ready
        };
        if let Some(warning) = warning {
            self.warnings.push(warning);
        }
        let sort = self.sort;
        self.groups
            .sort_by(|left, right| compare_groups(left, right, sort));
        // Ready pages keep only result payloads and source signatures, not all
        // source bodies, parser output or another copy of the index snapshot.
        self.scan = None;
        self.snapshot = None;
        self.disk_cache = None;
        self.positions = Vec::new();
        self.pending_segments = None;
    }

    fn prepare_sources(&mut self) {
        self.sources
            .sort_by(|left, right| left.path.cmp(&right.path));
        let digest = source_digest(&self.sources);
        let relations = file_relations_digest(self.guard.root());
        self.relations_digest = relations.clone();
        if self.snapshot.is_none() {
            if let Some(cache) = self.disk_cache.take() {
                self.snapshot = read_snapshot(&cache, self.guard.root())
                    .ok()
                    .flatten()
                    .map(Arc::new);
            }
        }
        if self.snapshot.as_ref().is_some_and(|snapshot| {
            snapshot.source_digest != digest
                || snapshot.file_relations_digest != relations
                || snapshot.search_segments.is_empty()
        }) {
            self.snapshot = None;
        }
        self.indexed = self.snapshot.is_some();
        self.snapshot_id = Some(format!(
            "{:x}",
            md5::compute(format!(
                "{}:{}:{digest}:{relations}",
                self.id, self.revision
            ))
        ));
        self.source_paths = self
            .sources
            .iter()
            .enumerate()
            .map(|(position, source)| {
                (
                    self.guard
                        .root()
                        .join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR))
                        .to_string_lossy()
                        .into_owned(),
                    position,
                )
            })
            .collect();
        if self.indexed {
            self.positions = vec![Vec::new(); self.sources.len()];
        }
    }

    fn advance(&mut self, budget: &mut SearchBudget) -> Result<(), SearchPageError> {
        while self.scan.is_some() {
            match self.scan.as_mut().unwrap().next(budget) {
                Ok(Some(source)) => {
                    if !self.retention.source() {
                        self.prepare_sources();
                        self.finish(Some(
                            "来源数量达到本次会话上限，尚未查全，请缩小范围后重试。".into(),
                        ));
                        return Ok(());
                    }
                    self.sources.push(source);
                }
                Ok(None) => {
                    self.scan = None;
                    self.prepare_sources();
                }
                Err(SearchStop::Entries | SearchStop::Sources | SearchStop::Elapsed) => {
                    return Ok(())
                }
                Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                Err(_) => return Err(SearchPageError::unavailable()),
            }
        }
        if let Some(snapshot) = &self.snapshot {
            while self.map_position < snapshot.search_segments.len() {
                match budget.segment(0) {
                    Ok(()) => {}
                    Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                    Err(_) => return Ok(()),
                }
                let segment = &snapshot.search_segments[self.map_position];
                let Some(position) = self.source_paths.get(&segment.path) else {
                    // A malformed/old-path cache is not a silently incomplete
                    // index. Discard it and use guarded live file extraction.
                    self.snapshot = None;
                    self.indexed = false;
                    self.positions = Vec::new();
                    break;
                };
                self.positions[*position].push(self.map_position);
                self.map_position += 1;
            }
        }
        let start = self.source_position;
        while self.source_position < self.sources.len()
            && self.source_position - start < MAX_FILES_PER_STEP
        {
            match budget.check_time() {
                Ok(()) => {}
                Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                Err(_) => return Ok(()),
            }
            let source = &self.sources[self.source_position];
            if source.path.ends_with(".annotations.json") || source.path.ends_with(".ocr.json") {
                self.source_position += 1;
                continue;
            }
            self.validate_source(source)?;
            let path = self
                .guard
                .root()
                .join(source.path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !self.pending_collection {
                if let Some(scope) = &self.collection {
                    let decision = scope.accept(&path, source, self.collection_cutoff, budget)?;
                    if decision != collections::Decision::Pause {
                        self.validate_source(source)?;
                    }
                    match decision {
                        collections::Decision::Match => self.pending_collection = true,
                        collections::Decision::Pause => return Ok(()),
                        decision => {
                            if decision == collections::Decision::Unread {
                                self.unread_sources += 1;
                            }
                            self.source_position += 1;
                            continue;
                        }
                    }
                }
            }
            if self.match_mode == SearchMatchMode::Tag
                && !file_format_for_path(&path).is_ok_and(|format| format.id == "markdown")
            {
                self.source_position += 1;
                continue;
            }
            let empty_collection = self.collection.is_some() && self.query.is_empty();
            if self.catalog.is_some() && !self.pending_catalog {
                match collections::catalog_source(
                    &path,
                    source,
                    budget,
                    self.catalog.as_mut().unwrap(),
                )? {
                    collections::CatalogDecision::Match => {
                        self.pending_catalog = true;
                        self.validate_source(source)?;
                    }
                    collections::CatalogDecision::Pause => return Ok(()),
                    collections::CatalogDecision::Unread => {
                        self.validate_source(source)?;
                        self.unread_sources += 1;
                        self.pending_collection = false;
                        self.source_position += 1;
                        continue;
                    }
                    collections::CatalogDecision::Limited => {
                        self.finish(Some(
                            "标签过长或统计达到会话载荷上限，已显示的数量仅为已统计部分。".into(),
                        ));
                        return Ok(());
                    }
                }
            }
            let cached_file = !empty_collection
                && self.indexed
                && !self.positions[self.source_position].is_empty();
            if empty_collection && self.pending_segments.is_none() {
                self.pending_segments = Some(vec![collections::file_segment(&path)?]);
            }
            if !cached_file && self.pending_segments.is_none() {
                let format =
                    file_format_for_path(&path).map_err(|_| SearchPageError::unavailable())?;
                let indexer = format
                    .adapters
                    .indexer
                    .as_deref()
                    .ok_or_else(SearchPageError::unavailable)?;
                let previous_reads = budget.read_bytes;
                match reserve_search_reads(&self.guard, &path, indexer, format.max_bytes, budget) {
                    Ok(()) => {}
                    Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                    Err(SearchStop::ReadBytes) if previous_reads > 0 => return Ok(()),
                    Err(SearchStop::ReadBytes) => {
                        self.finish(Some(
                            "单份资料及伴随内容超过本次读取预算，尚未查全。".into(),
                        ));
                        return Ok(());
                    }
                    Err(SearchStop::Elapsed) => return Ok(()),
                    Err(_) => return Err(SearchPageError::unavailable()),
                }
                let mut segments =
                    crate::services::knowledge_index::build_search_segments_for_source(
                        self.guard.root(),
                        source,
                    );
                self.body_builds += 1;
                self.validate_source(source)?;
                if segments.is_empty() {
                    segments.push(IndexedSearchSegment {
                        title: path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned(),
                        path: path.to_string_lossy().into_owned(),
                        object_type: format.id.clone(),
                        match_kind: "title".into(),
                        text: String::new(),
                        page: None,
                        annotation_id: None,
                        locator_kind: None,
                        locator_object_id: None,
                        location_label: None,
                        extraction_failed: true,
                    });
                }
                if segments.len() > 100_000
                    || segments.iter().fold(0usize, |sum, segment| {
                        sum.saturating_add(segment.text.len())
                    }) > 64 * 1024 * 1024
                {
                    self.finish(Some(
                        "单份资料提取内容达到本次会话上限，结果尚未查全。".into(),
                    ));
                    return Ok(());
                }
                self.pending_segments = Some(segments);
                // A bounded parser cannot be preempted. Keep its completed
                // output so resuming matching does not reopen the source body.
                match budget.check_time() {
                    Ok(()) => {}
                    Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                    Err(_) => return Ok(()),
                }
            }
            let prior_segments = budget.segments;
            let unread = if cached_file {
                let snapshot = self.snapshot.as_ref().unwrap();
                self.positions[self.source_position]
                    .iter()
                    .any(|index| snapshot.search_segments[*index].extraction_failed)
            } else {
                self.pending_segments
                    .as_ref()
                    .unwrap()
                    .iter()
                    .any(|segment| segment.extraction_failed)
            };
            let has_exclusions = crate::services::search_query::SearchQuery::parse(&self.query)
                .is_ok_and(|parsed| !parsed.negative.is_empty());
            let results = if empty_collection {
                budget.segment(0).map(|()| {
                    vec![collections::file_result(
                        self.pending_segments.as_ref().unwrap().first().unwrap(),
                    )]
                })
            } else if unread && has_exclusions {
                Ok(Vec::new())
            } else if let Some(pattern) = &self.tag_pattern {
                if cached_file {
                    let snapshot = self.snapshot.as_ref().unwrap();
                    search_tag_segments(
                        self.positions[self.source_position]
                            .iter()
                            .map(|position| &snapshot.search_segments[*position]),
                        pattern,
                        &self.query,
                        budget,
                    )
                } else {
                    search_tag_segments(
                        self.pending_segments.as_ref().unwrap().iter(),
                        pattern,
                        &self.query,
                        budget,
                    )
                }
            } else if cached_file {
                let snapshot = self.snapshot.as_ref().unwrap();
                search_segment_iter(
                    self.positions[self.source_position]
                        .iter()
                        .map(|index| &snapshot.search_segments[*index]),
                    &self.query,
                    &mut Some(budget),
                )
            } else {
                search_segments_checked(
                    self.pending_segments.as_ref().unwrap(),
                    &self.query,
                    &mut Some(budget),
                )
            };
            let results = match results {
                Ok(results) => results,
                Err(SearchStop::Cancelled) => return Err(SearchPageError::expired()),
                Err(SearchStop::Segments | SearchStop::TextBytes | SearchStop::Elapsed)
                    if prior_segments > 0 =>
                {
                    return Ok(())
                }
                Err(error) => {
                    self.finish(Some(format!("单份资料处理达到预算，结果尚未查全：{error}")));
                    return Ok(());
                }
            };
            if unread {
                self.unread_sources += 1;
            }
            if !results.is_empty() {
                let mut counts = HashMap::new();
                for result in &results {
                    *counts.entry(result.match_kind.as_str()).or_insert(0usize) += 1;
                }
                let group = SearchFileGroup {
                    path: path.to_string_lossy().into_owned(),
                    title: results[0].title.clone(),
                    modified_at_ms: (source.modified_nanos > 0)
                        .then_some(source.modified_nanos / 1_000_000),
                    modified_nanos: source.modified_nanos,
                    may_have_more_matches: results.len() >= MAX_SEARCH_RESULTS
                        || results.iter().any(|result| {
                            if matches!(result.match_kind.as_str(), "title" | "tag") {
                                return false;
                            }
                            let located = result.page.is_some()
                                || result.annotation_id.is_some()
                                || (result.locator_kind.is_some()
                                    && result.locator_object_id.is_some());
                            counts[result.match_kind.as_str()]
                                >= if located {
                                    MAX_LOCATED_MATCHES_PER_KIND
                                } else {
                                    1
                                }
                        }),
                    location_limit_per_kind: MAX_LOCATED_MATCHES_PER_KIND,
                    unlocated_limit_per_kind: 1,
                    matches: results,
                };
                // This is a payload budget, not a claim about total allocator/RSS.
                let bytes = serde_json::to_vec(&group)
                    .map_err(|_| SearchPageError::unavailable())?
                    .len();
                if self.groups.len() >= MAX_SESSION_FILES
                    || bytes > MAX_RESULT_BYTES.saturating_sub(self.retained_bytes)
                    || !self.retention.group(bytes)
                {
                    self.finish(Some(
                        "结果载荷达到本次会话上限，仅能继续查看已找到的文件，尚未查全。".into(),
                    ));
                    return Ok(());
                }
                self.retained_bytes += bytes;
                self.groups.push(group);
            }
            self.pending_segments = None;
            self.pending_collection = false;
            self.pending_catalog = false;
            self.source_position += 1;
        }
        if self.source_position == self.sources.len() {
            self.finish((self.unread_sources > 0).then(|| {
                format!(
                    "{} 份资料正文未能读取或提取，结果尚不完整；没有将未知正文当作排除条件已满足。",
                    self.unread_sources
                )
            }));
        }
        Ok(())
    }
}

fn compare_groups(
    left: &SearchFileGroup,
    right: &SearchFileGroup,
    sort: SearchSort,
) -> std::cmp::Ordering {
    let primary = match sort {
        SearchSort::Modified => right.modified_nanos.cmp(&left.modified_nanos),
        SearchSort::Name => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
        SearchSort::Path => left.path.to_lowercase().cmp(&right.path.to_lowercase()),
        SearchSort::Relevance => std::cmp::Ordering::Equal,
    };
    primary.then_with(|| compare_search_results(&left.matches[0], &right.matches[0]))
}

// Windows can report directory metadata notifications while a read-only scan
// opens child directories. Never ignore those notifications: prove equality of
// the entire source inventory and relation digest within this request's budget.
// A preparing session qualifies only after its source walk has fully ended;
// a truncated/limited inventory cannot establish that proof.
fn verify_directory_notification(
    session: &mut QuerySession,
    index: &KnowledgeIndexRuntime,
    before: (u64, u64),
    budget: &mut SearchBudget,
) -> bool {
    let after = index.search_revision_pair(session.guard.root());
    let complete_inventory = session.state == ScanState::Ready
        || (session.state == ScanState::Preparing && session.scan.is_none());
    if after.1 != before.1 || !complete_inventory || budget.check_time().is_err() {
        return false;
    }
    let Some(paths) = index.bounded_search_change_paths(session.guard.root(), 64) else {
        return false;
    };
    if paths.is_empty()
        || paths.iter().any(|path| {
            !fs::symlink_metadata(path)
                .is_ok_and(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        })
    {
        return false;
    }
    let Ok(sources) = collect_search_sources(session.guard.root(), budget) else {
        return false;
    };
    let relations = session.guard.root().join(".longedit/file-relations.json");
    match fs::metadata(&relations) {
        Ok(metadata) if budget.read(metadata.len()).is_ok() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return false,
    }
    let relation_digest = file_relations_digest(session.guard.root());
    if source_digest(&sources) != source_digest(&session.sources)
        || relation_digest == "unavailable"
        || relation_digest != session.relations_digest
        || index.search_revision_pair(session.guard.root()) != after
        || !index.search_watch_healthy(session.guard.root())
        || budget.check_time().is_err()
    {
        return false;
    }
    session.revision = after.0;
    true
}

fn tag_pattern(query: &str) -> Result<regex::Regex, SearchPageError> {
    let tag = query
        .strip_prefix('#')
        .filter(|tag| !tag.is_empty() && !tag.chars().any(|c| c.is_whitespace() || c == '"'))
        .ok_or_else(|| {
            SearchPageError::new("invalidRequest", "标签筛选格式为 #标签，不含空格或引号。")
        })?;
    crate::services::inline_tags::pattern(tag)
        .map_err(|_| SearchPageError::new("invalidRequest", "标签筛选条件无效。"))
}

fn search_tag_segments<'a>(
    segments: impl Iterator<Item = &'a IndexedSearchSegment>,
    pattern: &regex::Regex,
    query: &str,
    budget: &mut SearchBudget,
) -> Result<Vec<KnowledgeSearchResult>, SearchStop> {
    for segment in segments {
        budget.segment(segment.text.len())?;
        if segment.object_type == "markdown"
            && segment.match_kind == "body"
            && pattern.is_match(&segment.text)
        {
            return Ok(vec![KnowledgeSearchResult {
                title: segment.title.clone(),
                path: segment.path.clone(),
                object_type: "markdown".into(),
                match_kind: "tag".into(),
                context: format!("标签 {query}"),
                page: None,
                annotation_id: None,
                locator_kind: None,
                locator_object_id: None,
                location_label: None,
                score: 80,
                extraction_failed: segment.extraction_failed,
            }]);
        }
    }
    Ok(Vec::new())
}

#[cfg(test)]
#[path = "index_search_pages_tests.rs"]
mod tests;
