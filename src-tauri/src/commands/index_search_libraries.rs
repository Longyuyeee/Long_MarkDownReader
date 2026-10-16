//! Bounded federated search. Workers never hold the aggregate lock while doing
//! filesystem/parsing work. Polling advances work; file pages use a frozen view.
use super::*;
use std::sync::mpsc::{self, Receiver, Sender};

const MAX_LIBRARIES: usize = 32;
const LIBRARY_LANES: usize = 2;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibrariesPageRequest {
    pub library_root: Option<String>,
    pub query: String,
    #[serde(default)]
    pub sort: SearchSort,
    pub page_size: usize,
    pub channel: SearchChannel,
    pub cursor: Option<String>,
}
impl LibrariesPageRequest {
    fn normalize_validate(&mut self) -> Result<(), SearchPageError> {
        let mut single = self.single(String::new());
        single.normalize_validate()?;
        self.query = single.query;
        Ok(())
    }
    fn single(&self, root: String) -> SearchPageRequest {
        SearchPageRequest {
            library_root: root,
            query: self.query.clone(),
            sort: self.sort,
            match_mode: SearchMatchMode::Content,
            page_size: self.page_size,
            channel: self.channel,
            cursor: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Scope {
    name: String,
    root: String,
}
fn configured_scopes(
    libraries: &[crate::commands::config::LibraryConfig],
    selected: Option<&str>,
) -> Result<Vec<Scope>, SearchPageError> {
    let mut seen = HashSet::new();
    let mut scopes = Vec::new();
    for library in libraries {
        let key = scope_identity(&library.path);
        if selected.is_some_and(|root| scope_identity(root) != key) || !seen.insert(key) {
            continue;
        }
        scopes.push(Scope {
            name: library.name.clone(),
            root: library.path.clone(),
        });
        if scopes.len() > MAX_LIBRARIES {
            return Err(SearchPageError::new(
                "scopeTooLarge",
                "一次最多搜索 32 个资料库，请选择较小范围；没有静默忽略其他库。",
            ));
        }
    }
    if scopes.is_empty() {
        return Err(SearchPageError::new(
            "scopeUnavailable",
            "请选择已配置的资料库；本次没有读取其他范围。",
        ));
    }
    // Stable configuration identity, independent of UI library-list ordering.
    scopes.sort_by(|left, right| scope_identity(&left.root).cmp(&scope_identity(&right.root)));
    Ok(scopes)
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryPhase {
    Queued,
    Searching,
    Preparing,
    Ready,
    Limited,
    Unavailable,
    Changed,
}
impl LibraryPhase {
    fn pending(self) -> bool {
        matches!(self, Self::Queued | Self::Searching | Self::Preparing)
    }
    fn usable(self) -> bool {
        matches!(self, Self::Ready | Self::Limited)
    }
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AggregateState {
    Preparing,
    Ready,
    Limited,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryProgress {
    pub library_name: String,
    pub library_root: String,
    pub state: LibraryPhase,
    pub available_files: usize,
    pub total_files: Option<usize>,
    pub examined_sources: usize,
    pub indexed: bool,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFileGroup {
    pub library_name: String,
    pub library_root: String,
    #[serde(flatten)]
    pub file: SearchFileGroup,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrariesPageResponse {
    pub session_id: String,
    pub snapshot_id: String,
    pub view_version: u64,
    pub files: Vec<LibraryFileGroup>,
    pub page_offset: usize,
    pub next_cursor: Option<String>,
    pub continue_cursor: Option<String>,
    pub refresh_cursor: String,
    pub scan_state: AggregateState,
    pub scan_complete: bool,
    pub total_files: Option<usize>,
    pub available_files: usize,
    pub coverage: &'static str,
    pub libraries: Vec<LibraryProgress>,
}

struct LibrarySlot {
    scope: Scope,
    phase: LibraryPhase,
    session: Option<QuerySession>,
    examined: usize,
    indexed: bool,
    warnings: Vec<String>,
}
struct LibraryJob {
    position: usize,
    request: SearchPageRequest,
    session: Option<QuerySession>,
    cancelled: Arc<AtomicBool>,
    pool: Arc<RetentionPool>,
}
struct Outcome {
    position: usize,
    result: Result<QuerySession, SearchPageError>,
}

pub(super) struct LibrarySession {
    id: String,
    cancelled: Arc<AtomicBool>,
    query: String,
    sort: SearchSort,
    page_size: usize,
    created: Instant,
    touched: Instant,
    slots: Vec<LibrarySlot>,
    pool: Arc<RetentionPool>,
    sender: Sender<Outcome>,
    receiver: Receiver<Outcome>,
    view: Vec<(usize, usize)>,
    view_coverage: Vec<(usize, LibraryPhase, u64)>,
    version: u64,
    furthest: usize,
    work_step: u64,
    last_work: Option<(String, LibrariesPageResponse)>,
    next_lane: usize,
}
impl LibrarySession {
    fn new(scopes: Vec<Scope>, request: &LibrariesPageRequest) -> Self {
        let (sender, receiver) = mpsc::channel();
        Self {
            id: session_identity(),
            cancelled: Arc::new(AtomicBool::new(false)),
            query: request.query.clone(),
            sort: request.sort,
            page_size: request.page_size,
            created: Instant::now(),
            touched: Instant::now(),
            slots: scopes
                .into_iter()
                .map(|scope| LibrarySlot {
                    scope,
                    phase: LibraryPhase::Queued,
                    session: None,
                    examined: 0,
                    indexed: false,
                    warnings: Vec::new(),
                })
                .collect(),
            pool: Arc::new(RetentionPool::default()),
            sender,
            receiver,
            view: Vec::new(),
            view_coverage: Vec::new(),
            version: 0,
            furthest: 0,
            work_step: 0,
            last_work: None,
            next_lane: 0,
        }
    }
    pub(super) fn expired(&self) -> bool {
        self.touched.elapsed() >= IDLE_TTL || self.created.elapsed() >= MAX_AGE
    }
    fn work_cursor(&self) -> String {
        format!("{}:w:{}", self.id, self.work_step)
    }
    fn snapshot_id(&self) -> String {
        format!("{}:v:{}", self.id, self.version)
    }
    fn page_cursor(&self, offset: usize) -> String {
        format!("{}:p:{}:{offset}", self.id, self.version)
    }

    fn validate_binding(
        &self,
        request: &LibrariesPageRequest,
        scopes: &[Scope],
    ) -> Result<(), SearchPageError> {
        if self.query != request.query
            || self.sort != request.sort
            || self.page_size != request.page_size
            || self.slots.iter().map(|slot| &slot.scope).ne(scopes.iter())
        {
            return Err(SearchPageError::new(
                "requestMismatch",
                "查询、排序、页大小或资料库范围已改变，请重新搜索；没有混合两个查询。",
            ));
        }
        if request
            .cursor
            .as_ref()
            .is_some_and(|cursor| !cursor.starts_with(&format!("{}:", self.id)))
        {
            return Err(SearchPageError::new(
                "invalidCursor",
                "这是旧查询的位置，没有改变当前查询。",
            ));
        }
        if self.expired() || self.cancelled.load(Ordering::Acquire) {
            return Err(SearchPageError::expired());
        }
        Ok(())
    }

    fn fail(&mut self, position: usize, error: SearchPageError) {
        let slot = &mut self.slots[position];
        slot.phase = if error.code == "expired" {
            LibraryPhase::Changed
        } else {
            LibraryPhase::Unavailable
        };
        slot.warnings = vec![error.message];
        slot.session = None; // releases this library's share of the aggregate budget
    }

    fn collect(&mut self, index: &KnowledgeIndexRuntime) -> bool {
        let mut changed = false;
        while let Ok(outcome) = self.receiver.try_recv() {
            changed = true;
            match outcome.result {
                Ok(session)
                    if index.search_revision(session.guard.root()) == session.revision
                        && index.search_watch_healthy(session.guard.root()) =>
                {
                    let slot = &mut self.slots[outcome.position];
                    slot.phase = match session.state {
                        ScanState::Preparing => LibraryPhase::Preparing,
                        ScanState::Ready => LibraryPhase::Ready,
                        ScanState::Limited => LibraryPhase::Limited,
                    };
                    slot.examined = session.source_position;
                    slot.indexed = session.indexed;
                    slot.warnings = session.warnings.clone();
                    slot.session = Some(session);
                }
                Ok(_) => self.fail(outcome.position, SearchPageError::expired()),
                Err(error) => self.fail(outcome.position, error),
            }
        }
        for position in 0..self.slots.len() {
            let stale = self.slots[position]
                .session
                .as_ref()
                .is_some_and(|session| {
                    index.search_revision(session.guard.root()) != session.revision
                        || !index.search_watch_healthy(session.guard.root())
                });
            if stale {
                self.fail(position, SearchPageError::expired());
                changed = true;
            }
        }
        changed
    }

    fn rebuild_view(&mut self) {
        let previous = std::mem::take(&mut self.view);
        self.view = self
            .slots
            .iter()
            .enumerate()
            .filter(|(_, slot)| slot.phase.usable())
            .flat_map(|(library, slot)| {
                (0..slot.session.as_ref().unwrap().groups.len()).map(move |group| (library, group))
            })
            .collect();
        let slots = &self.slots;
        self.view.sort_by(|(a, ai), (b, bi)| {
            let left = &slots[*a].session.as_ref().unwrap().groups[*ai];
            let right = &slots[*b].session.as_ref().unwrap().groups[*bi];
            let modified = if self.sort == SearchSort::Modified {
                right.modified_nanos.cmp(&left.modified_nanos)
            } else {
                std::cmp::Ordering::Equal
            };
            modified
                .then_with(|| compare_search_results(&left.matches[0], &right.matches[0]))
                .then_with(|| slots[*a].scope.root.cmp(&slots[*b].scope.root))
        });
        // Overlapping configured roots can expose the exact same canonical file.
        // Keep one deterministic representative, not two user file entries.
        let mut seen = HashSet::new();
        self.view.retain(|(library, group)| {
            seen.insert(
                self.slots[*library].session.as_ref().unwrap().groups[*group]
                    .path
                    .clone(),
            )
        });
        let coverage = self
            .slots
            .iter()
            .enumerate()
            .filter(|(_, slot)| !slot.phase.pending())
            .map(|(position, slot)| {
                (
                    position,
                    slot.phase,
                    slot.session.as_ref().map_or(0, |session| session.revision),
                )
            })
            .collect::<Vec<_>>();
        // A slow library reporting another preparation step must not invalidate
        // healthy file pages. Change the view only when files/coverage change.
        if self.view != previous || coverage != self.view_coverage {
            self.version += 1;
            self.furthest = 0;
            self.view_coverage = coverage;
        }
    }

    fn take_jobs(
        &mut self,
        runtime: &SearchPageRuntime,
        channel: SearchChannel,
    ) -> Vec<(LibraryJob, TaskPermit)> {
        let mut jobs = Vec::new();
        let mut lanes = self
            .slots
            .iter()
            .filter(|slot| {
                matches!(
                    slot.phase,
                    LibraryPhase::Searching | LibraryPhase::Preparing
                )
            })
            .count();
        for step in 0..self.slots.len() {
            let position = (self.next_lane + step) % self.slots.len();
            let slot = &mut self.slots[position];
            if slot.phase != LibraryPhase::Preparing
                && !(slot.phase == LibraryPhase::Queued && lanes < LIBRARY_LANES)
            {
                continue;
            }
            let Ok(permit) = runtime.permit() else {
                break;
            };
            if slot.phase == LibraryPhase::Queued {
                lanes += 1;
            }
            slot.phase = LibraryPhase::Searching;
            jobs.push((
                LibraryJob {
                    position,
                    request: SearchPageRequest {
                        library_root: slot.scope.root.clone(),
                        query: self.query.clone(),
                        sort: self.sort,
                        match_mode: SearchMatchMode::Content,
                        page_size: self.page_size,
                        channel,
                        cursor: None,
                    },
                    session: slot.session.take(),
                    cancelled: self.cancelled.clone(),
                    pool: self.pool.clone(),
                },
                permit,
            ));
        }
        self.next_lane = (self.next_lane + 1) % self.slots.len();
        jobs
    }

    fn aggregate_state(&self) -> AggregateState {
        if self.slots.iter().any(|slot| slot.phase.pending()) {
            AggregateState::Preparing
        } else if self
            .slots
            .iter()
            .all(|slot| slot.phase == LibraryPhase::Ready)
        {
            AggregateState::Ready
        } else if self.slots.iter().any(|slot| slot.phase.usable()) {
            AggregateState::Limited
        } else {
            AggregateState::Failed
        }
    }
    fn response(&mut self, offset: usize) -> Result<LibrariesPageResponse, SearchPageError> {
        if offset > self.view.len() {
            return Err(SearchPageError::new("invalidCursor", "文件页位置无效。"));
        }
        let end = (offset + self.page_size).min(self.view.len());
        let mut files = Vec::new();
        for &(library, group) in &self.view[offset..end] {
            let slot = &self.slots[library];
            let session = slot.session.as_ref().unwrap();
            files.push(LibraryFileGroup {
                library_name: slot.scope.name.clone(),
                library_root: slot.scope.root.clone(),
                file: session.groups[group].clone(),
            });
        }
        let next = (end < self.view.len()).then(|| self.page_cursor(end));
        self.furthest = self.furthest.max(if next.is_some() { end } else { offset });
        let state = self.aggregate_state();
        Ok(LibrariesPageResponse {
            session_id: self.id.clone(),
            snapshot_id: self.snapshot_id(),
            view_version: self.version,
            files,
            page_offset: offset,
            next_cursor: next,
            continue_cursor: (state == AggregateState::Preparing).then(|| self.work_cursor()),
            refresh_cursor: self.work_cursor(),
            scan_state: state,
            scan_complete: state == AggregateState::Ready,
            total_files: (state == AggregateState::Ready).then_some(self.view.len()),
            available_files: self.view.len(),
            coverage: "registered-extractable-content",
            libraries: self
                .slots
                .iter()
                .map(|slot| {
                    let count = slot
                        .session
                        .as_ref()
                        .map_or(0, |session| session.groups.len());
                    LibraryProgress {
                        library_name: slot.scope.name.clone(),
                        library_root: slot.scope.root.clone(),
                        state: slot.phase,
                        available_files: if slot.phase.usable() { count } else { 0 },
                        total_files: (slot.phase == LibraryPhase::Ready).then_some(count),
                        examined_sources: slot.examined,
                        indexed: slot.indexed,
                        warnings: slot.warnings.clone(),
                    }
                })
                .collect(),
        })
    }

    fn validate_files(
        &mut self,
        response: &LibrariesPageResponse,
        index: &KnowledgeIndexRuntime,
    ) -> Result<(), SearchPageError> {
        let mut failed = HashSet::new();
        for file in &response.files {
            let Some(position) = self
                .slots
                .iter()
                .position(|slot| slot.scope.root == file.library_root && slot.session.is_some())
            else {
                return Err(snapshot_changed());
            };
            let slot = &self.slots[position];
            let session = slot.session.as_ref().unwrap();
            if index.search_revision(session.guard.root()) != session.revision
                || !index.search_watch_healthy(session.guard.root())
                || WorkspaceGuard::new(&slot.scope.root)
                    .map_or(true, |guard| guard.root() != session.guard.root())
                || session.validate_group(&file.file).is_err()
            {
                failed.insert(position);
            }
        }
        if !failed.is_empty() {
            for position in failed {
                self.fail(position, SearchPageError::expired());
            }
            self.rebuild_view();
            return Err(snapshot_changed());
        }
        Ok(())
    }

    // Called on a bounded blocking coordinator, never waiting for workers.
    fn request(
        &mut self,
        request: &LibrariesPageRequest,
        scopes: &[Scope],
        runtime: &SearchPageRuntime,
        index: &KnowledgeIndexRuntime,
        mut launch: impl FnMut(LibraryJob, TaskPermit, Sender<Outcome>),
    ) -> Result<LibrariesPageResponse, SearchPageError> {
        self.validate_binding(request, scopes)?;
        let cursor = request.cursor.clone().unwrap_or_else(|| self.work_cursor());
        if let Some((old, response)) = &self.last_work {
            if old == &cursor {
                let response = response.clone();
                if response.view_version != self.version {
                    return Err(snapshot_changed());
                }
                if self.collect_finished_changes(index) {
                    self.rebuild_view();
                    return Err(snapshot_changed());
                }
                self.validate_files(&response, index)?;
                self.touched = Instant::now();
                return Ok(response);
            }
        }
        let page_prefix = format!("{}:p:", self.id);
        if let Some(page) = cursor.strip_prefix(&page_prefix) {
            let (version, offset) = page
                .split_once(':')
                .ok_or_else(|| SearchPageError::new("invalidCursor", "文件页位置无效。"))?;
            let version = version
                .parse::<u64>()
                .map_err(|_| SearchPageError::new("invalidCursor", "文件页位置无效。"))?;
            let offset = offset
                .parse::<usize>()
                .map_err(|_| SearchPageError::new("invalidCursor", "文件页位置无效。"))?;
            if version != self.version {
                return Err(snapshot_changed());
            }
            if offset % self.page_size != 0 || offset > self.furthest {
                return Err(SearchPageError::new(
                    "invalidCursor",
                    "请使用已提供的文件页位置，不能跳过未签发的页。",
                ));
            }
            // Do not collect worker output while paging an already issued view.
            // Check all completed epochs, not only files visible on this page.
            if self.collect_finished_changes(index) {
                self.rebuild_view();
                return Err(snapshot_changed());
            }
            let response = self.response(offset)?;
            self.validate_files(&response, index)?;
            self.touched = Instant::now();
            return Ok(response);
        }
        if cursor != self.work_cursor() {
            return Err(SearchPageError::new(
                "invalidCursor",
                "请使用最新的继续搜索位置。",
            ));
        }
        if self.collect(index) {
            self.rebuild_view();
        }
        for (job, permit) in self.take_jobs(runtime, request.channel) {
            launch(job, permit, self.sender.clone());
        }
        self.work_step += 1;
        let mut response = self.response(0)?;
        // A direct file check can discover a change before the watcher delivers
        // its event. Remove only that library and preserve the healthy ones.
        for _ in 0..=self.slots.len() {
            if self.validate_files(&response, index).is_ok() {
                break;
            }
            response = self.response(0)?;
        }
        self.validate_files(&response, index)?;
        self.last_work = Some((cursor, response.clone()));
        self.touched = Instant::now();
        Ok(response)
    }

    fn collect_finished_changes(&mut self, index: &KnowledgeIndexRuntime) -> bool {
        let mut changed = false;
        for position in 0..self.slots.len() {
            if !self.slots[position].phase.usable() {
                continue;
            }
            let session = self.slots[position].session.as_ref().unwrap();
            if index.search_revision(session.guard.root()) != session.revision
                || !index.search_watch_healthy(session.guard.root())
            {
                self.fail(position, SearchPageError::expired());
                changed = true;
            }
        }
        changed
    }
}

fn snapshot_changed() -> SearchPageError {
    SearchPageError::new(
        "snapshotChanged",
        "可用资料库或搜索快照已改变，请刷新结果，不要把旧页追加到新结果；其他库和草稿应保留。",
    )
}

fn run_library_step(
    mut job: LibraryJob,
    index: &KnowledgeIndexRuntime,
    cache: Option<PathBuf>,
    limits: SearchLimits,
) -> Result<QuerySession, SearchPageError> {
    if job.cancelled.load(Ordering::Acquire) {
        return Err(SearchPageError::expired());
    }
    let mut session = if let Some(session) = job.session.take() {
        session
    } else {
        let guard = WorkspaceGuard::new(&job.request.library_root)
            .map_err(|_| SearchPageError::unavailable())?;
        index
            .ensure_watcher(guard.root())
            .map_err(|_| SearchPageError::unavailable())?;
        let revision = index.search_revision(guard.root());
        let allow =
            !index.blocks_index_reads(guard.root()) && !index.search_sources_changed(guard.root());
        let mut session = QuerySession::new(
            guard.root(),
            &job.request,
            revision,
            allow.then(|| index.cached_snapshot(guard.root())).flatten(),
            if allow { cache } else { None },
        )?;
        session.cancelled = job.cancelled;
        session.retention.pool = job.pool;
        session
    };
    session.validate_binding(&job.request)?;
    let before = index.search_revision_pair(session.guard.root());
    if session.expired()
        || session.cancelled.load(Ordering::Acquire)
        || before.0 != session.revision
        || !index.search_watch_healthy(session.guard.root())
    {
        return Err(SearchPageError::expired());
    }
    let mut budget = SearchBudget::new(limits).with_cancellation(session.cancelled.clone());
    session.advance(&mut budget)?;
    if index.search_revision(session.guard.root()) != session.revision {
        if !verify_directory_notification(&mut session, index, before, &mut budget) {
            return Err(SearchPageError::expired());
        }
    }
    if session.cancelled.load(Ordering::Acquire)
        || !index.search_watch_healthy(session.guard.root())
    {
        return Err(SearchPageError::expired());
    }
    session.touched = Instant::now();
    Ok(session)
}

fn verify_directory_notification(
    session: &mut QuerySession,
    index: &KnowledgeIndexRuntime,
    before: (u64, u64),
    budget: &mut SearchBudget,
) -> bool {
    let after = index.search_revision_pair(session.guard.root());
    // Never absorb an explicit index replacement/build-state transition. Only
    // complete scans can establish equality of the whole source signature set.
    if after.1 != before.1 || session.state != ScanState::Ready || budget.check_time().is_err() {
        return false;
    }
    let Some(paths) = index.bounded_search_change_paths(session.guard.root(), 64) else {
        return false;
    };
    if paths.is_empty()
        || paths.len() > 64
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

pub async fn run(
    app: AppHandle,
    window: String,
    mut request: LibrariesPageRequest,
) -> Result<LibrariesPageResponse, SearchPageError> {
    request.normalize_validate()?;
    let configured = crate::commands::config::get_config(app.clone()).libraries;
    let scopes = configured_scopes(&configured, request.library_root.as_deref())?;
    let runtime = app.state::<SearchPageRuntime>();
    let permit = runtime.permit()?;
    let owner = (window, request.channel);
    let entry = if request.cursor.is_some() {
        runtime.get(&owner)?
    } else {
        let session = LibrarySession::new(scopes.clone(), &request);
        runtime.insert_state(
            owner.clone(),
            session.id.clone(),
            session.cancelled.clone(),
            SessionState::Libraries(Box::new(session)),
        )?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let runtime = app.state::<SearchPageRuntime>();
        let index = app.state::<KnowledgeIndexRuntime>();
        let mut state = entry
            .state
            .try_lock()
            .map_err(|_| SearchPageError::busy())?;
        let SessionState::Libraries(session) = &mut *state else {
            return Err(SearchPageError::new(
                "requestMismatch",
                "这是单库查询的位置，请使用原搜索入口。",
            ));
        };
        let result = session.request(
            &request,
            &scopes,
            &runtime,
            &index,
            |job, permit, sender| {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let _permit = permit;
                    let position = job.position;
                    // A parser panic must release its permit and become a per-library
                    // failure, not leave this slot permanently 'searching'.
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        run_library_step(
                            job,
                            &app.state::<KnowledgeIndexRuntime>(),
                            knowledge_index_cache_root(&app).ok(),
                            SearchLimits::default(),
                        )
                    }))
                    .unwrap_or_else(|_| {
                        Err(SearchPageError::new(
                            "taskFailed",
                            "此资料库搜索任务未完成；其他资料库结果仍保留。",
                        ))
                    });
                    let _ = sender.send(Outcome { position, result });
                });
            },
        );
        let cancelled = entry.cancelled.load(Ordering::Acquire);
        drop(state);
        if cancelled {
            return Err(SearchPageError::expired());
        }
        if result.as_ref().is_err_and(|error| error.code == "expired") {
            runtime.close(&owner.0, owner.1, &entry.id);
        }
        result
    })
    .await
    .map_err(|_| {
        SearchPageError::new(
            "taskFailed",
            "搜索协调任务未完成，请重试；已加载结果和草稿应保留。",
        )
    })?
}

#[cfg(test)]
#[path = "index_search_libraries_tests.rs"]
mod tests;
