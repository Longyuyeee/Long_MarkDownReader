use super::*;
use crate::commands::graph::GraphData;
use crate::services::{knowledge_index::snapshot_from_graph, test_workspace::TestWorkspace};

struct Fixture {
    _owned: TestWorkspace,
    root: PathBuf,
    cache: PathBuf,
}
impl Fixture {
    fn new(count: usize) -> Self {
        let owned = TestWorkspace::new();
        let root = owned.dir("资料 & project");
        let cache = owned.dir("cache");
        for index in 0..count {
            fs::write(
                root.join(format!("a-{index:04}-记录.md")),
                "项目预算确认\n保留正文",
            )
            .unwrap();
        }
        fs::write(root.join("zz-项目预算.md"), "保留最相关文件原文").unwrap();
        for directory in ["目录 A", "目录 B"] {
            fs::create_dir(root.join(directory)).unwrap();
            fs::write(root.join(directory).join("同名.md"), "项目预算记录").unwrap();
        }
        Self {
            _owned: owned,
            root,
            cache,
        }
    }
    fn snapshot(&self) -> KnowledgeIndexSnapshot {
        snapshot_from_graph(
            &self.root,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        )
    }
    fn request(&self) -> SearchPageRequest {
        SearchPageRequest {
            library_root: self.root.to_string_lossy().into_owned(),
            query: "预算".into(),
            sort: SearchSort::Relevance,
            match_mode: SearchMatchMode::Content,
            page_size: 40,
            channel: SearchChannel::Library,
            cursor: None,
        }
    }
    fn session(&self, request: &SearchPageRequest) -> QuerySession {
        QuerySession::new(&self.root, request, 0, None, None).unwrap()
    }
    fn pdf_annotations(&self) {
        fs::write(
            self.root.join("多批注.pdf"),
            include_bytes!("../../../scripts/fixtures/v126-search/Paper.pdf"),
        )
        .unwrap();
        let annotations = (0..8).map(|index| serde_json::json!({"id":format!("批注-{index}"),"kind":"comment","page":1,
            "color":"yellow","quote":"项目预算确认","comment":format!("预算位置{index}"),"rects":[],"createdAt":1,"updatedAt":2})).collect::<Vec<_>>();
        fs::write(
            self.root.join("多批注.pdf.annotations.json"),
            serde_json::to_vec(&serde_json::json!({"schemaVersion":1,
            "source":{"pdfFile":"多批注.pdf","size":1,"modifiedAt":1},"annotations":annotations}))
            .unwrap(),
        )
        .unwrap();
    }
}

fn limits() -> SearchLimits {
    SearchLimits {
        elapsed: Duration::from_secs(30),
        ..SearchLimits::default()
    }
}
fn drain(
    session: &mut QuerySession,
    mut request: SearchPageRequest,
    limits: SearchLimits,
) -> Vec<SearchPageResponse> {
    let mut pages = Vec::new();
    for _ in 0..1000 {
        let response = session.request(&request, 0, limits).unwrap();
        if response.scan_state == ScanState::Preparing {
            assert!(
                response.files.is_empty()
                    && response.total_files.is_none()
                    && !response.scan_complete
            );
        }
        request.cursor = response.next_cursor.clone();
        pages.push(response);
        if request.cursor.is_none() {
            return pages;
        }
    }
    panic!("continuation made no bounded progress");
}

#[test]
fn v118_pages_real_cold_memory_and_disk_keep_244_file_groups_and_annotation_positions() {
    let fixture = Fixture::new(240);
    fixture.pdf_annotations();
    let snapshot = Arc::new(fixture.snapshot());
    write_snapshot(&fixture.cache, &fixture.root, &snapshot).unwrap();
    let mut expected = None;
    for mode in ["cold", "memory", "disk"] {
        let request = fixture.request();
        let mut session = QuerySession::new(
            &fixture.root,
            &request,
            0,
            (mode == "memory").then(|| snapshot.clone()),
            (mode == "disk").then(|| fixture.cache.clone()),
        )
        .unwrap();
        let pages = drain(&mut session, request, limits());
        let files = pages
            .iter()
            .flat_map(|page| &page.files)
            .collect::<Vec<_>>();
        assert_eq!(
            files.len(),
            244,
            "the 201st file and every later file must remain reachable: {mode}"
        );
        assert_eq!(
            files
                .iter()
                .map(|group| &group.path)
                .collect::<HashSet<_>>()
                .len(),
            244
        );
        assert_eq!(
            files[0].path,
            fixture.root.join("zz-项目预算.md").to_string_lossy()
        );
        assert!(pages.iter().all(|page| page.total_files == Some(244)
            && page.scan_complete
            && page.warnings.is_empty()));
        let pdf = files
            .iter()
            .find(|group| group.path.ends_with("多批注.pdf"))
            .unwrap();
        let annotations = pdf
            .matches
            .iter()
            .filter_map(|result| result.annotation_id.as_deref())
            .collect::<HashSet<_>>();
        assert_eq!(
            annotations.len(),
            5,
            "keep legitimate annotation identities inside one file group"
        );
        assert!(pdf.may_have_more_matches && pdf.location_limit_per_kind == 5);
        assert!(
            files.iter().any(|group| group.path.contains("目录 A"))
                && files.iter().any(|group| group.path.contains("目录 B"))
        );
        let encoded = serde_json::to_value(files).unwrap();
        if let Some(expected) = &expected {
            assert_eq!(&encoded, expected, "cold/cache parity");
        } else {
            expected = Some(encoded);
        }
        assert_eq!(session.body_builds, if mode == "cold" { 244 } else { 0 });
        assert!(
            session.snapshot.is_none()
                && session.pending_segments.is_none()
                && session.positions.is_empty(),
            "paging releases index/parse buffers"
        );
        assert_eq!(
            fs::read_to_string(fixture.root.join("zz-项目预算.md")).unwrap(),
            "保留最相关文件原文"
        );
    }
}

#[test]
fn v118_pages_small_scan_and_matching_budgets_resume_without_reopening_completed_bodies() {
    let fixture = Fixture::new(240);
    let request = fixture.request();
    let mut session = fixture.session(&request);
    let pages = drain(
        &mut session,
        request,
        SearchLimits {
            entries: 11,
            sources: 7,
            read_bytes: 1000,
            segments: 9,
            ..limits()
        },
    );
    assert!(
        pages
            .iter()
            .filter(|page| page.scan_state == ScanState::Preparing)
            .count()
            > 30
    );
    assert_eq!(
        pages.iter().map(|page| page.files.len()).sum::<usize>(),
        243
    );
    assert_eq!(
        session.body_builds, 243,
        "the pending file is reused when a matching step ends"
    );
    assert!(pages
        .iter()
        .filter(|page| !page.files.is_empty())
        .all(|page| page.scan_complete && page.total_files == Some(243)));
}

#[test]
fn v118_pages_interleaved_index_segments_and_complex_exclusions_are_grouped_per_file() {
    let fixture = Fixture::new(4);
    fs::write(
        fixture.root.join("报告.docx"),
        super::super::tests::docx_fixture(),
    )
    .unwrap();
    let mut snapshot = fixture.snapshot();
    snapshot.search_segments.reverse();
    let snapshot = Arc::new(snapshot);
    for (query, expected) in [("indexed review", 1), ("indexed review -paragraph", 0)] {
        let mut request = fixture.request();
        request.query = query.into();
        let mut session =
            QuerySession::new(&fixture.root, &request, 0, Some(snapshot.clone()), None).unwrap();
        let pages = drain(
            &mut session,
            request,
            SearchLimits {
                segments: 6,
                ..limits()
            },
        );
        assert_eq!(
            pages.iter().map(|page| page.files.len()).sum::<usize>(),
            expected
        );
        assert_eq!(session.body_builds, 0);
    }
}

#[test]
fn v118_pages_retry_is_idempotent_and_page_fetch_does_not_rebuild_bodies() {
    let fixture = Fixture::new(240);
    let mut request = fixture.request();
    let mut session = fixture.session(&request);
    let initial_cursor = session.work_cursor();
    let first = session.request(&request, 0, limits()).unwrap();
    assert_eq!(first.scan_state, ScanState::Ready);
    let builds = session.body_builds;
    request.cursor = Some(initial_cursor);
    assert_eq!(
        serde_json::to_value(session.request(&request, 0, limits()).unwrap()).unwrap(),
        serde_json::to_value(&first).unwrap()
    );
    request.cursor = first.next_cursor;
    let second = session.request(&request, 0, limits()).unwrap();
    let retry = session.request(&request, 0, limits()).unwrap();
    assert_eq!(
        serde_json::to_value(&second).unwrap(),
        serde_json::to_value(&retry).unwrap()
    );
    assert_eq!(second.page_offset, Some(40));
    assert_eq!(session.body_builds, builds);
}

#[test]
fn v118_pages_work_retry_does_not_consume_the_next_scan_step() {
    let fixture = Fixture::new(24);
    let mut request = fixture.request();
    let mut session = fixture.session(&request);
    let first_cursor = session.work_cursor();
    let first = session
        .request(
            &request,
            0,
            SearchLimits {
                entries: 3,
                ..limits()
            },
        )
        .unwrap();
    assert_eq!(first.scan_state, ScanState::Preparing);
    let source_count = session.sources.len();
    request.cursor = Some(first_cursor);
    let replay = session.request(&request, 0, limits()).unwrap();
    assert_eq!(
        serde_json::to_value(replay).unwrap(),
        serde_json::to_value(&first).unwrap()
    );
    assert_eq!(session.sources.len(), source_count);
    request.cursor = first.next_cursor;
    assert!(!drain(&mut session, request, limits())
        .last()
        .unwrap()
        .files
        .is_empty());
}

#[test]
fn v118_pages_query_sort_scope_size_and_forged_offsets_cannot_mix_queries() {
    let fixture = Fixture::new(60);
    let request = fixture.request();
    let mut session = fixture.session(&request);
    let first = session.request(&request, 0, limits()).unwrap();
    for field in 0..4 {
        let mut wrong = request.clone();
        wrong.cursor = first.next_cursor.clone();
        match field {
            0 => wrong.query = "其他".into(),
            1 => wrong.sort = SearchSort::Modified,
            2 => wrong.library_root = fixture.cache.to_string_lossy().into_owned(),
            _ => wrong.page_size = 20,
        }
        assert_eq!(
            session.request(&wrong, 55, limits()).unwrap_err().code,
            "requestMismatch"
        );
    }
    let mut wrong = request.clone();
    wrong.cursor = Some(session.page_cursor(99999));
    assert_eq!(
        session.request(&wrong, 0, limits()).unwrap_err().code,
        "invalidCursor"
    );
    wrong.cursor = Some("another-session:p:40".into());
    assert_eq!(
        session.request(&wrong, 0, limits()).unwrap_err().code,
        "invalidCursor"
    );
    wrong.cursor = first.next_cursor;
    assert_eq!(
        session.request(&wrong, 0, limits()).unwrap().page_offset,
        Some(40)
    );
}

#[test]
fn v118_pages_modified_sort_uses_nanosecond_metadata_and_serializes_safe_milliseconds() {
    let fixture = Fixture::new(4);
    let target = fixture.root.join("a-0000-记录.md");
    fs::OpenOptions::new()
        .write(true)
        .open(&target)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(10)))
        .unwrap();
    let request = fixture.request();
    let mut relevance = fixture.session(&request);
    let ranked = drain(&mut relevance, request.clone(), limits());
    assert!(ranked[0].files[0].path.ends_with("zz-项目预算.md"));
    let mut request = request;
    request.sort = SearchSort::Modified;
    let mut modified = fixture.session(&request);
    let pages = drain(&mut modified, request, limits());
    let files = pages
        .iter()
        .flat_map(|page| &page.files)
        .collect::<Vec<_>>();
    assert!(files
        .windows(2)
        .all(|pair| pair[0].modified_nanos >= pair[1].modified_nanos));
    assert_eq!(files.last().unwrap().path, target.to_string_lossy());
    assert_eq!(files.last().unwrap().modified_at_ms, Some(10_000));
    assert!(files
        .iter()
        .all(|file| file.modified_at_ms.unwrap() < 9_007_199_254_740_991));
}

#[test]
fn v118_pages_source_change_rename_and_delete_expire_before_returning_stale_pages() {
    for operation in ["change", "rename", "delete"] {
        let fixture = Fixture::new(60);
        let mut request = fixture.request();
        let mut session = fixture.session(&request);
        let first = session.request(&request, 0, limits()).unwrap();
        request.cursor = first.next_cursor;
        let target = PathBuf::from(&session.groups[40].path);
        match operation {
            "change" => fs::write(&target, "外部新正文，不允许改回").unwrap(),
            "rename" => fs::rename(&target, target.with_file_name("改名.md")).unwrap(),
            _ => fs::remove_file(&target).unwrap(),
        }
        assert_eq!(
            session.request(&request, 0, limits()).unwrap_err().code,
            "expired"
        );
        if operation == "change" {
            assert_eq!(
                fs::read_to_string(&target).unwrap(),
                "外部新正文，不允许改回"
            );
        }
    }
}

#[test]
fn v118_pages_index_revision_and_ttl_invalidate_even_when_build_timestamp_is_unchanged() {
    let fixture = Fixture::new(4);
    let index = KnowledgeIndexRuntime::default();
    let snapshot = fixture.snapshot();
    let built = snapshot.built_at;
    index.cache_snapshot(&fixture.root, snapshot.clone());
    let revision = index.search_revision(&fixture.root);
    let mut request = fixture.request();
    request.page_size = 2;
    let mut session = QuerySession::new(
        &fixture.root,
        &request,
        revision,
        index.cached_snapshot(&fixture.root),
        None,
    )
    .unwrap();
    let first = session.request(&request, revision, limits()).unwrap();
    request.cursor = first.next_cursor;
    index.cache_snapshot(&fixture.root, snapshot);
    assert_eq!(
        index.cached_snapshot(&fixture.root).unwrap().built_at,
        built
    );
    assert_eq!(
        session
            .request(&request, index.search_revision(&fixture.root), limits())
            .unwrap_err()
            .code,
        "expired"
    );
    let mut expired = fixture.session(&fixture.request());
    expired.touched = Instant::now() - IDLE_TTL;
    assert_eq!(
        expired
            .request(&fixture.request(), 0, limits())
            .unwrap_err()
            .code,
        "expired"
    );
}

#[test]
fn v118_pages_owner_channel_replacement_and_late_close_are_isolated() {
    let fixture = Fixture::new(4);
    let request = fixture.request();
    let runtime = SearchPageRuntime::default();
    let a = runtime
        .insert(
            ("A".into(), SearchChannel::Library),
            fixture.session(&request),
        )
        .unwrap();
    let palette = runtime
        .insert(
            ("A".into(), SearchChannel::Palette),
            fixture.session(&request),
        )
        .unwrap();
    let b = runtime
        .insert(
            ("B".into(), SearchChannel::Library),
            fixture.session(&request),
        )
        .unwrap();
    let locked_old = a.state.lock().unwrap();
    let replacement = runtime
        .insert(
            ("A".into(), SearchChannel::Library),
            fixture.session(&request),
        )
        .unwrap();
    assert!(a.cancelled.load(Ordering::Acquire));
    assert!(!palette.cancelled.load(Ordering::Acquire) && !b.cancelled.load(Ordering::Acquire));
    assert_eq!(
        SearchBudget::default()
            .with_cancellation(a.cancelled.clone())
            .check_time(),
        Err(SearchStop::Cancelled)
    );
    assert!(!runtime.close("A", SearchChannel::Library, &a.id));
    assert_eq!(
        runtime
            .get(&("A".into(), SearchChannel::Library))
            .unwrap()
            .id,
        replacement.id
    );
    drop(locked_old);
    runtime.close_window("A");
    assert!(
        replacement.cancelled.load(Ordering::Acquire) && palette.cancelled.load(Ordering::Acquire)
    );
    assert_eq!(
        runtime
            .get(&("B".into(), SearchChannel::Library))
            .unwrap()
            .id,
        b.id
    );
}

#[test]
fn v118_pages_cache_and_active_task_limits_are_fail_fast_and_released() {
    let fixture = Fixture::new(0);
    let request = fixture.request();
    let runtime = SearchPageRuntime::default();
    for index in 0..MAX_SESSIONS {
        runtime
            .insert(
                (format!("w{index}"), SearchChannel::Library),
                fixture.session(&request),
            )
            .unwrap();
    }
    assert_eq!(
        runtime
            .insert(
                ("extra".into(), SearchChannel::Library),
                fixture.session(&request)
            )
            .err()
            .unwrap()
            .code,
        "busy"
    );
    runtime.close_window("w0");
    runtime
        .insert(
            ("extra".into(), SearchChannel::Library),
            fixture.session(&request),
        )
        .unwrap();
    let mut permits = (0..MAX_ACTIVE_TASKS)
        .map(|_| runtime.permit().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(runtime.permit().err().unwrap().code, "busy");
    permits.pop();
    let permit = runtime.permit().unwrap();
    drop(permit);
    drop(permits);
    assert_eq!(runtime.active.load(Ordering::Acquire), 0);
}

#[test]
fn v118_pages_payload_limit_preserves_partial_pages_and_does_not_invent_total_count() {
    let fixture = Fixture::new(300);
    let mut request = fixture.request();
    let mut session = fixture.session(&request);
    let first = session.request(&request, 0, limits()).unwrap();
    assert_eq!(first.scan_state, ScanState::Preparing);
    assert_eq!(session.groups.len(), MAX_FILES_PER_STEP);
    session.retained_bytes = MAX_RESULT_BYTES; // Exercise the precise retained-payload boundary, not a scale benchmark.
    request.cursor = first.next_cursor;
    let pages = drain(&mut session, request, limits());
    assert!(pages
        .iter()
        .all(|page| page.scan_state == ScanState::Limited
            && !page.scan_complete
            && page.total_files.is_none()
            && !page.warnings.is_empty()));
    assert_eq!(
        pages.iter().map(|page| page.files.len()).sum::<usize>(),
        MAX_FILES_PER_STEP
    );
    assert!(session.source_position < session.sources.len());
}

#[test]
fn v118_pages_unreadable_content_is_not_treated_as_exclusion_success_or_clean_empty() {
    let fixture = Fixture::new(0);
    fs::write(fixture.root.join("损坏预算.docx"), "not a ZIP").unwrap();
    for query in ["预算", "预算 -旧版"] {
        let mut request = fixture.request();
        request.query = query.into();
        let mut session = fixture.session(&request);
        let pages = drain(&mut session, request, limits());
        assert_eq!(pages.last().unwrap().scan_state, ScanState::Limited);
        assert_eq!(pages.last().unwrap().unread_sources, 1);
        let damaged = pages
            .iter()
            .flat_map(|page| &page.files)
            .find(|file| file.path.ends_with("损坏预算.docx"));
        if query == "预算" {
            let damaged = damaged.unwrap();
            assert!(damaged.matches[0].extraction_failed);
            assert!(!damaged.matches[0].context.contains("PDF"));
        } else {
            assert!(
                damaged.is_none(),
                "unknown negative conditions cannot admit a file"
            );
        }
    }
}

#[test]
fn v118_pages_stale_disk_index_falls_back_and_missing_index_segments_do_not_hide_filenames() {
    let fixture = Fixture::new(4);
    let snapshot = fixture.snapshot();
    write_snapshot(&fixture.cache, &fixture.root, &snapshot).unwrap();
    fs::write(fixture.root.join("新预算.md"), "新正文").unwrap();
    let request = fixture.request();
    let mut session = QuerySession::new(
        &fixture.root,
        &request,
        0,
        None,
        Some(fixture.cache.clone()),
    )
    .unwrap();
    let pages = drain(&mut session, request.clone(), limits());
    assert!(pages.iter().any(|page| page
        .files
        .iter()
        .any(|file| file.path.ends_with("新预算.md"))));
    assert!(!session.indexed && session.body_builds > 0);
    fs::write(fixture.root.join("损坏预算.docx"), "bad").unwrap();
    let mut session = QuerySession::new(
        &fixture.root,
        &request,
        0,
        Some(Arc::new(fixture.snapshot())),
        None,
    )
    .unwrap();
    let pages = drain(&mut session, request, limits());
    assert!(pages.iter().any(|page| page
        .files
        .iter()
        .any(|file| file.path.ends_with("损坏预算.docx"))));
    assert_eq!(
        session.body_builds, 1,
        "only the missing cache segment falls back to guarded extraction"
    );
}

#[test]
fn v118_pages_empty_complete_and_missing_library_failure_are_distinct() {
    let owned = TestWorkspace::new();
    let root = owned.dir("empty");
    let request = SearchPageRequest {
        library_root: root.to_string_lossy().into_owned(),
        query: "预算".into(),
        sort: SearchSort::Relevance,
        match_mode: SearchMatchMode::Content,
        page_size: 50,
        channel: SearchChannel::Library,
        cursor: None,
    };
    let mut session = QuerySession::new(&root, &request, 0, None, None).unwrap();
    let page = session.request(&request, 0, limits()).unwrap();
    assert!(
        page.scan_complete
            && page.files.is_empty()
            && page.total_files == Some(0)
            && page.next_cursor.is_none()
    );
    assert_eq!(
        QuerySession::new(&root.join("missing"), &request, 0, None, None)
            .err()
            .unwrap()
            .code,
        "unavailable"
    );
}

#[test]
fn v118_pages_tag_mode_pages_exact_markdown_tags_in_cold_memory_and_disk() {
    let fixture = Fixture::new(240);
    for source in collect_search_sources(&fixture.root, &mut SearchBudget::new(limits())).unwrap() {
        fs::write(
            fixture.root.join(source.path),
            "保留标签 #Budget，继续工作。",
        )
        .unwrap();
    }
    fs::write(fixture.root.join("仅文件名#Budget.md"), "没有这个标签").unwrap();
    fs::write(fixture.root.join("前缀.md"), "#BudgetExtra #budget").unwrap();
    fs::write(fixture.root.join("非笔记.txt"), "#Budget").unwrap();
    let snapshot = Arc::new(fixture.snapshot());
    write_snapshot(&fixture.cache, &fixture.root, &snapshot).unwrap();
    let mut expected = None;
    for mode in ["cold", "memory", "disk"] {
        let mut request = fixture.request();
        request.query = " #Budget ".into();
        request.match_mode = SearchMatchMode::Tag;
        request.normalize_validate().unwrap();
        assert_eq!(
            request.query, "#Budget",
            "preserve legacy case-sensitive tag identity"
        );
        let mut session = QuerySession::new(
            &fixture.root,
            &request,
            0,
            (mode == "memory").then(|| snapshot.clone()),
            (mode == "disk").then(|| fixture.cache.clone()),
        )
        .unwrap();
        let pages = drain(&mut session, request, limits());
        let groups = pages
            .iter()
            .flat_map(|page| &page.files)
            .collect::<Vec<_>>();
        assert_eq!(
            groups.len(),
            243,
            "{mode}: no 200 cutoff, no prefix/title/TXT false tag match"
        );
        assert!(groups.iter().all(|group| group.matches.len() == 1
            && group.matches[0].match_kind == "tag"
            && !group.may_have_more_matches));
        assert_eq!(
            session.body_builds,
            if mode == "cold" { 245 } else { 0 },
            "only Markdown bodies, no TXT read for tag search"
        );
        let encoded = serde_json::to_value(groups).unwrap();
        if let Some(expected) = &expected {
            assert_eq!(&encoded, expected);
        } else {
            expected = Some(encoded);
        }
    }
}

#[test]
fn v118_pages_tag_mode_binding_and_validation_reject_mixed_continuations() {
    let fixture = Fixture::new(1);
    let mut request = fixture.request();
    request.query = "#预算".into();
    request.match_mode = SearchMatchMode::Tag;
    let mut session = fixture.session(&request);
    let first = session.request(&request, 0, limits()).unwrap();
    request.cursor = Some(session.page_cursor(0));
    request.match_mode = SearchMatchMode::Content;
    assert_eq!(
        session.request(&request, 0, limits()).unwrap_err().code,
        "requestMismatch"
    );
    assert!(first.scan_complete && first.total_files == Some(0));
    for query in ["预算", "#", "#两个 标签", "#\"标签\""] {
        request.query = query.into();
        request.match_mode = SearchMatchMode::Tag;
        assert!(request.normalize_validate().is_err(), "{query}");
    }
}

#[test]
fn v118_pages_request_bounds_and_unknown_fields_are_rejected() {
    let fixture = Fixture::new(0);
    let mut request = fixture.request();
    request.query = "  BUDGET  ".into();
    request.normalize_validate().unwrap();
    assert_eq!(request.query, "budget");
    for size in [0, 101, usize::MAX] {
        request.page_size = size;
        assert_eq!(
            request.normalize_validate().unwrap_err().code,
            "invalidRequest"
        );
    }
    request.page_size = 50;
    request.query = "\"未结束".into();
    assert!(request.normalize_validate().is_err());
    request.query = "预算".into();
    request.cursor = Some("x".repeat(161));
    assert!(request.normalize_validate().is_err());
    assert!(serde_json::from_value::<SearchPageRequest>(serde_json::json!({"libraryRoot":fixture.root,"query":"预算","pageSize":50,"channel":"library","owner":"B"})).is_err());
}

#[test]
fn v118_pages_scope_selection_does_not_probe_other_libraries_and_keeps_platform_identity() {
    use crate::commands::config::LibraryConfig;
    let fixture = Fixture::new(0);
    let libraries = vec![
        LibraryConfig {
            name: "离线的其他库".into(),
            path: "//not-contacted.invalid/other".into(),
            ..LibraryConfig::default()
        },
        LibraryConfig {
            name: "当前库".into(),
            path: fixture.root.to_string_lossy().into_owned(),
            ..LibraryConfig::default()
        },
    ];
    assert_eq!(
        configured_page_scope(&libraries, &fixture.request().library_root).unwrap(),
        libraries[1].path
    );
    assert_eq!(
        configured_page_scope(&libraries, &fixture.cache.to_string_lossy())
            .unwrap_err()
            .code,
        "scopeUnavailable"
    );
    let upper = vec![LibraryConfig {
        path: "/Case/Library".into(),
        ..LibraryConfig::default()
    }];
    assert_eq!(
        configured_page_scope(&upper, "/case/library").is_ok(),
        cfg!(windows)
    );
}

#[test]
fn v118_pages_new_pdf_sidecar_expires_retry_even_before_watcher_delivery() {
    let fixture = Fixture::new(0);
    fs::write(
        fixture.root.join("多批注.pdf"),
        include_bytes!("../../../scripts/fixtures/v126-search/Paper.pdf"),
    )
    .unwrap();
    let mut request = fixture.request();
    request.query = "多批注".into();
    let mut session = fixture.session(&request);
    let first_cursor = session.work_cursor();
    let first = session.request(&request, 0, limits()).unwrap();
    assert_eq!(first.files.len(), 1);
    fs::write(fixture.root.join("多批注.pdf.annotations.json"), "{}").unwrap();
    request.cursor = Some(first_cursor);
    assert_eq!(
        session.request(&request, 0, limits()).unwrap_err().code,
        "expired"
    );
}

#[test]
fn v118_pages_cold_read_only_search_with_real_watcher_verifies_directory_hints() {
    let fixture = Fixture::new(240);
    fixture.pdf_annotations();
    let ordinary = fixture.root.join("普通资料");
    fs::create_dir(&ordinary).unwrap();
    for index in 0..1400 {
        fs::write(
            ordinary.join(format!("{index}.txt")),
            "ordinary unrelated text",
        )
        .unwrap();
    }
    let index = KnowledgeIndexRuntime::default();
    let root = WorkspaceGuard::new(&fixture.root).unwrap();
    index.ensure_watcher(root.root()).unwrap();
    let revision = index.search_revision(root.root());
    let mut request = fixture.request();
    let mut session = QuerySession::new(root.root(), &request, revision, None, None).unwrap();
    let mut files = 0;
    for _ in 0..100 {
        let response = session
            .request_live(&request, &index, limits())
            .unwrap_or_else(|error| {
                panic!(
                    "read-only search failed: {error:?}; revision {revision} -> {}; paths: {:?}",
                    index.search_revision(root.root()),
                    index.changed_paths(root.root())
                )
            });
        files += response.files.len();
        request.cursor = response.next_cursor;
        if request.cursor.is_none() {
            break;
        }
    }
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(files, 244);
    assert!(index.search_watch_healthy(root.root()));
    assert_eq!(
        session.revision,
        index.search_revision(root.root()),
        "all observed hints must be verified, not suppressed or silently left stale"
    );
}

#[test]
fn v118_pages_live_directory_proof_preserves_pages_without_reparsing_or_unbounded_budget() {
    let fixture = Fixture::new(80);
    let root = WorkspaceGuard::new(&fixture.root).unwrap();
    let index = KnowledgeIndexRuntime::default();
    index.ensure_watcher(root.root()).unwrap();
    let mut request = fixture.request();
    let mut session = QuerySession::new(root.root(), &request, 0, None, None).unwrap();
    let first = session.request_live(&request, &index, limits()).unwrap();
    let builds = session.body_builds;
    request.cursor = first.next_cursor.clone();
    let revision = index.search_revision(root.root());
    fs::create_dir(fixture.root.join("新建空目录")).unwrap();
    let started = Instant::now();
    while index.search_revision(root.root()) == revision
        && started.elapsed() < Duration::from_secs(5)
    {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(
        index.search_revision(root.root()) > revision,
        "a real directory event must arrive"
    );
    let old_revision = session.revision;
    assert_eq!(
        session
            .request_live(
                &request,
                &index,
                SearchLimits {
                    entries: 0,
                    ..limits()
                }
            )
            .unwrap_err()
            .code,
        "expired"
    );
    assert_eq!(
        session.revision, old_revision,
        "an unfinished proof cannot absorb the hint"
    );
    let second = session.request_live(&request, &index, limits()).unwrap();
    assert_eq!(second.page_offset, Some(40));
    assert_eq!(second.snapshot_id, first.snapshot_id);
    assert_eq!(
        session.body_builds, builds,
        "directory verification reads signatures, not bodies"
    );
    assert_eq!(session.revision, index.search_revision(root.root()));
}

#[test]
fn v118_pages_live_proof_never_absorbs_source_changes_index_replacement_or_partial_inventory() {
    for change in ["file", "new-source", "explicit-index", "incomplete-scan"] {
        let fixture = Fixture::new(80);
        let root = WorkspaceGuard::new(&fixture.root).unwrap();
        let index = KnowledgeIndexRuntime::default();
        index.ensure_watcher(root.root()).unwrap();
        let mut request = fixture.request();
        let mut session = QuerySession::new(root.root(), &request, 0, None, None).unwrap();
        if change != "incomplete-scan" {
            request.cursor = session
                .request_live(&request, &index, limits())
                .unwrap()
                .next_cursor;
        }
        let before = index.search_revision(root.root());
        match change {
            "file" => fs::write(fixture.root.join("zz-项目预算.md"), "真实新正文不得改回").unwrap(),
            "new-source" => fs::write(fixture.root.join("预算新文件.md"), "真实新增来源").unwrap(),
            "explicit-index" => index.note_search_change(root.root()),
            _ => fs::create_dir(fixture.root.join("尚未核对的目录")).unwrap(),
        }
        let started = Instant::now();
        while index.search_revision(root.root()) == before
            && started.elapsed() < Duration::from_secs(5)
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(
            index.search_revision(root.root()) > before,
            "{change}: change notification must arrive"
        );
        assert_eq!(
            session
                .request_live(&request, &index, limits())
                .unwrap_err()
                .code,
            "expired",
            "{change}"
        );
        if change == "file" {
            assert_eq!(
                fs::read_to_string(fixture.root.join("zz-项目预算.md")).unwrap(),
                "真实新正文不得改回"
            );
        }
    }
}

#[test]
fn v118_pages_real_filesystem_watcher_revision_does_not_reset_when_changes_are_cleared() {
    let fixture = Fixture::new(0);
    let index = KnowledgeIndexRuntime::default();
    index.ensure_watcher(&fixture.root).unwrap();
    let before = index.search_revision(&fixture.root);
    fs::write(fixture.root.join("外部变化.md"), "预算").unwrap();
    let started = Instant::now();
    while index.search_revision(&fixture.root) == before
        && started.elapsed() < Duration::from_secs(5)
    {
        std::thread::sleep(Duration::from_millis(20));
    }
    let changed = index.search_revision(&fixture.root);
    assert!(
        changed > before,
        "real native watcher must advance the revision"
    );
    index.clear_changes(&fixture.root);
    assert!(index.search_revision(&fixture.root) >= changed);
    index.invalidate_snapshot(&fixture.root);
    assert!(index.search_revision(&fixture.root) > changed);
    assert_eq!(
        index.search_revision(&fixture.cache),
        0,
        "other libraries keep independent revisions"
    );
}

#[test]
fn v118_pages_ui_order_history_and_assets_do_not_invalidate_search_but_relations_do() {
    use crate::services::knowledge_index::relevant_search_path;
    let fixture = Fixture::new(0);
    for path in [
        ".misty_order.json",
        ".longedit/history/note.json",
        "picture.assets/origin.png",
        ".private/a.md",
        "credentials.json",
    ] {
        assert!(
            !relevant_search_path(&fixture.root, &fixture.root.join(path)),
            "{path}"
        );
    }
    for path in [
        ".longedit/file-relations.json",
        ".longedit",
        "目录/资料.md",
        "资料.pdf.annotations.json",
        "资料.pdf.ocr.json",
        "目录",
    ] {
        assert!(
            relevant_search_path(&fixture.root, &fixture.root.join(path)),
            "{path}"
        );
    }
    assert!(
        relevant_search_path(&fixture.root, &fixture.cache.join("unknown.md")),
        "unknown scope must not be silently ignored"
    );
}

#[test]
fn v118_pages_real_hidden_order_event_keeps_cursor_revision_stable() {
    let fixture = Fixture::new(0);
    let index = KnowledgeIndexRuntime::default();
    index.ensure_watcher(&fixture.root).unwrap();
    let before = index.search_revision(&fixture.root);
    let path = fixture.root.join(".misty_order.json");
    fs::write(&path, "{}").unwrap();
    let started = Instant::now();
    while index.changed_paths(&fixture.root).is_empty()
        && started.elapsed() < Duration::from_secs(5)
    {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(
        !index.changed_paths(&fixture.root).is_empty(),
        "a real event, not an unused path predicate"
    );
    assert_eq!(
        index.search_revision(&fixture.root),
        before,
        "UI ordering does not stale a content query"
    );
    assert!(!index.search_sources_changed(&fixture.root));
}

#[test]
fn v118_pages_mixed_case_assets_directory_uses_the_same_rule_as_source_scanning() {
    let fixture = Fixture::new(0);
    let directory = fixture.root.join("资料.Assets");
    fs::create_dir(&directory).unwrap();
    let note = directory.join("预算.md");
    fs::write(&note, "预算").unwrap();
    let sources = collect_search_sources(&fixture.root, &mut SearchBudget::default()).unwrap();
    assert!(sources
        .iter()
        .any(|source| source.path == "资料.Assets/预算.md"));
    assert!(
        crate::services::knowledge_index::relevant_search_path(&fixture.root, &note),
        "a source that is indexed must not be excluded by the cursor watcher"
    );
}

#[test]
fn v118_pages_fixed_fixture_timing_reports_first_page_and_continuation_separately() {
    let fixture = Fixture::new(240);
    let snapshot = Arc::new(fixture.snapshot());
    let mut observations = Vec::new();
    for mode in ["cold", "memory"] {
        let mut first_times = Vec::new();
        let mut next_times = Vec::new();
        for _ in 0..5 {
            let mut request = fixture.request();
            let mut session = QuerySession::new(
                &fixture.root,
                &request,
                0,
                (mode == "memory").then(|| snapshot.clone()),
                None,
            )
            .unwrap();
            let started = Instant::now();
            let first = session
                .request(&request, 0, SearchLimits::default())
                .unwrap();
            first_times.push(started.elapsed().as_micros() as u64);
            assert_eq!(first.scan_state, ScanState::Ready);
            let reads = session.body_builds;
            request.cursor = first.next_cursor;
            let started = Instant::now();
            let next = session
                .request(&request, 0, SearchLimits::default())
                .unwrap();
            next_times.push(started.elapsed().as_micros() as u64);
            assert_eq!(next.page_offset, Some(40));
            assert_eq!(session.body_builds, reads);
        }
        first_times.sort_unstable();
        next_times.sort_unstable();
        observations.push(serde_json::json!({"mode":mode,"firstPageMicros":first_times,"nextPageMicros":next_times}));
    }
    eprintln!(
        "V118_FILE_PAGES_BASELINE {}",
        serde_json::json!({"sources":243,"pageSize":40,"samplesPerMode":5,"observations":observations,
        "includesNativeIpc":false,"includesConfiguredScopeOrWatcherSetup":false,"nextPageRebuildsCompletedBodies":false})
    );
}
