use super::*;
use crate::commands::config::LibraryConfig;
use crate::commands::graph::GraphData;
use crate::services::{knowledge_index::snapshot_from_graph, test_workspace::TestWorkspace};

struct Fixture {
    _owned: TestWorkspace,
    scopes: Vec<Scope>,
}
impl Fixture {
    fn new(counts: &[usize]) -> Self {
        let owned = TestWorkspace::new();
        let scopes = counts
            .iter()
            .enumerate()
            .map(|(library, count)| {
                let root = owned.dir(&format!("库 {library} & 资料"));
                for file in 0..*count {
                    fs::write(root.join(format!("记录-{file:04}.md")), "项目预算确认").unwrap();
                }
                Scope {
                    name: format!("资料库 {library}"),
                    root: root.to_string_lossy().into_owned(),
                }
            })
            .collect();
        Self {
            _owned: owned,
            scopes,
        }
    }
    fn root(&self, position: usize) -> &Path {
        Path::new(&self.scopes[position].root)
    }
    fn request(&self) -> LibrariesPageRequest {
        LibrariesPageRequest {
            library_root: None,
            query: "预算".into(),
            sort: SearchSort::Relevance,
            page_size: 40,
            channel: SearchChannel::Palette,
            cursor: None,
        }
    }
}
fn limits() -> SearchLimits {
    SearchLimits {
        elapsed: Duration::from_secs(30),
        ..SearchLimits::default()
    }
}
fn tick(
    session: &mut LibrarySession,
    request: &LibrariesPageRequest,
    scopes: &[Scope],
    runtime: &SearchPageRuntime,
    index: &KnowledgeIndexRuntime,
    limits: SearchLimits,
) -> LibrariesPageResponse {
    session
        .request(request, scopes, runtime, index, |job, permit, sender| {
            let position = job.position;
            let result = run_library_step(job, index, None, limits);
            drop(permit);
            sender.send(Outcome { position, result }).unwrap();
        })
        .unwrap()
}
fn finish(
    session: &mut LibrarySession,
    mut request: LibrariesPageRequest,
    scopes: &[Scope],
    runtime: &SearchPageRuntime,
    index: &KnowledgeIndexRuntime,
    limits: SearchLimits,
) -> LibrariesPageResponse {
    for _ in 0..2000 {
        let response = tick(session, &request, scopes, runtime, index, limits);
        if response.scan_state != AggregateState::Preparing {
            return response;
        }
        request.cursor = response.continue_cursor;
    }
    panic!("bounded multi-library continuation made no progress");
}
fn all_files(
    session: &mut LibrarySession,
    mut response: LibrariesPageResponse,
    mut request: LibrariesPageRequest,
    scopes: &[Scope],
    runtime: &SearchPageRuntime,
    index: &KnowledgeIndexRuntime,
) -> Vec<LibraryFileGroup> {
    let mut files = Vec::new();
    loop {
        files.extend(response.files);
        let Some(cursor) = response.next_cursor else {
            return files;
        };
        request.cursor = Some(cursor);
        response = tick(session, &request, scopes, runtime, index, limits());
    }
}

#[test]
fn v118_libraries_real_486_files_survive_global_group_paging_cold_memory_and_disk() {
    let fixture = Fixture::new(&[241, 241]);
    for position in 0..2 {
        fs::write(fixture.root(position).join("同名.md"), "项目预算").unwrap();
        fs::write(fixture.root(position).join("预算.md"), "最相关文件原文").unwrap();
    }
    let cache = fixture._owned.dir("index-cache");
    let mut expected = None;
    for mode in ["cold", "memory", "disk"] {
        let index = KnowledgeIndexRuntime::default();
        for scope in &fixture.scopes {
            let snapshot = snapshot_from_graph(
                Path::new(&scope.root),
                GraphData {
                    nodes: Vec::new(),
                    edges: Vec::new(),
                },
            );
            if mode == "memory" {
                index.cache_snapshot(Path::new(&scope.root), snapshot);
            } else if mode == "disk" {
                write_snapshot(&cache, Path::new(&scope.root), &snapshot).unwrap();
            }
        }
        let runtime = SearchPageRuntime::default();
        let request = fixture.request();
        let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
        let mut current = request.clone();
        let response = loop {
            let response = session
                .request(
                    &current,
                    &fixture.scopes,
                    &runtime,
                    &index,
                    |job, permit, sender| {
                        let position = job.position;
                        let result = run_library_step(
                            job,
                            &index,
                            (mode == "disk").then(|| cache.clone()),
                            limits(),
                        );
                        drop(permit);
                        sender.send(Outcome { position, result }).unwrap();
                    },
                )
                .unwrap();
            if response.scan_state != AggregateState::Preparing {
                break response;
            }
            current.cursor = response.continue_cursor;
        };
        assert_eq!(response.total_files, Some(486), "{mode}");
        assert!(
            response.scan_complete
                && response
                    .libraries
                    .iter()
                    .all(|library| library.total_files == Some(243))
        );
        let builds: usize = session
            .slots
            .iter()
            .map(|slot| slot.session.as_ref().unwrap().body_builds)
            .sum();
        assert_eq!(builds, if mode == "cold" { 486 } else { 0 });
        let files = all_files(
            &mut session,
            response,
            request,
            &fixture.scopes,
            &runtime,
            &index,
        );
        assert_eq!(files.len(), 486);
        assert_eq!(
            files
                .iter()
                .map(|group| &group.file.path)
                .collect::<HashSet<_>>()
                .len(),
            486
        );
        assert!(
            files[..2].iter().all(|group| group.file.title == "预算.md"),
            "global relevance, not library concatenation"
        );
        assert_eq!(
            files
                .iter()
                .filter(|group| group.file.title == "同名.md")
                .count(),
            2
        );
        assert!(files.iter().all(|group| !group.library_name.is_empty()
            && Path::new(&group.file.path).starts_with(&group.library_root)));
        let encoded = serde_json::to_value(files).unwrap();
        if let Some(expected) = &expected {
            assert_eq!(&encoded, expected, "same ordering and locators: {mode}");
        } else {
            expected = Some(encoded);
        }
        assert_eq!(
            session
                .slots
                .iter()
                .map(|slot| slot.session.as_ref().unwrap().body_builds)
                .sum::<usize>(),
            builds,
            "file paging must not reopen completed bodies"
        );
    }
}

#[test]
fn v118_libraries_empty_success_partial_offline_and_all_failure_are_distinct() {
    let fixture = Fixture::new(&[0]);
    let offline = Scope {
        name: "离线库".into(),
        root: fixture
            ._owned
            .0
            .join("不存在")
            .to_string_lossy()
            .into_owned(),
    };
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let request = fixture.request();
    for (scopes, expected) in [
        (fixture.scopes.clone(), AggregateState::Ready),
        (
            vec![fixture.scopes[0].clone(), offline.clone()],
            AggregateState::Limited,
        ),
        (vec![offline], AggregateState::Failed),
    ] {
        let mut session = LibrarySession::new(scopes.clone(), &request);
        let response = finish(
            &mut session,
            request.clone(),
            &scopes,
            &runtime,
            &index,
            limits(),
        );
        assert_eq!(response.scan_state, expected);
        assert_eq!(
            response.total_files,
            (expected == AggregateState::Ready).then_some(0)
        );
        assert!(response.files.is_empty() && response.continue_cursor.is_none());
        if expected == AggregateState::Limited {
            assert_eq!(response.libraries[0].state, LibraryPhase::Ready);
            assert_eq!(response.libraries[0].total_files, Some(0));
            assert_eq!(response.libraries[1].state, LibraryPhase::Unavailable);
            assert!(!response.libraries[1].warnings.is_empty());
        }
    }
}

#[test]
fn v118_libraries_one_blocked_worker_does_not_hold_coordinator_or_healthy_results() {
    let fixture = Fixture::new(&[1, 81, 1]);
    let runtime = SearchPageRuntime::default();
    let index = Arc::new(KnowledgeIndexRuntime::default());
    let request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let (release_tx, release_rx) = mpsc::channel();
    let mut release = Some(release_rx);
    let (done_tx, done_rx) = mpsc::channel();
    let first = session
        .request(
            &request,
            &fixture.scopes,
            &runtime,
            &index,
            |job, permit, sender| {
                if job.position == 0 {
                    let index = index.clone();
                    let gate = release.take().unwrap();
                    let done = done_tx.clone();
                    std::thread::spawn(move || {
                        gate.recv_timeout(Duration::from_secs(10)).unwrap();
                        let position = job.position;
                        let result = run_library_step(job, &index, None, limits());
                        drop(permit);
                        sender.send(Outcome { position, result }).unwrap();
                        done.send(()).unwrap();
                    });
                } else {
                    let position = job.position;
                    let result = run_library_step(job, &index, None, limits());
                    drop(permit);
                    sender.send(Outcome { position, result }).unwrap();
                }
            },
        )
        .unwrap();
    assert!(first.files.is_empty() && first.scan_state == AggregateState::Preparing);
    assert_eq!(
        runtime.active.load(Ordering::Acquire),
        1,
        "only the deliberately gated worker remains"
    );
    let mut request = request;
    request.cursor = first.continue_cursor;
    let healthy = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert_eq!(healthy.available_files, 81);
    assert_eq!(healthy.files.len(), 40);
    assert_eq!(healthy.libraries[0].state, LibraryPhase::Searching);
    assert_eq!(healthy.scan_state, AggregateState::Preparing);
    assert!(!healthy.scan_complete && healthy.total_files.is_none());
    let version = healthy.view_version;
    // Even with a running worker, a frozen available view can page normally.
    request.cursor = healthy.next_cursor.clone();
    let second = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert_eq!(second.page_offset, 40);
    assert_eq!(second.view_version, version);
    release_tx.send(()).unwrap();
    done_rx.recv_timeout(Duration::from_secs(10)).unwrap();
    request.cursor = Some(healthy.refresh_cursor);
    let complete = finish(
        &mut session,
        request.clone(),
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert_eq!(complete.total_files, Some(83));
    assert!(complete.view_version > version);
    request.cursor = healthy.next_cursor;
    assert_eq!(
        session
            .request(
                &request,
                &fixture.scopes,
                &runtime,
                &index,
                |_, _, _| panic!("paging must not dispatch")
            )
            .unwrap_err()
            .code,
        "snapshotChanged"
    );
    assert_eq!(runtime.active.load(Ordering::Acquire), 0);
}

#[test]
fn v118_large_federated_directory_hint_between_worker_steps_keeps_healthy_libraries() {
    let fixture = Fixture::new(&[243, 243]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let small = SearchLimits {
        entries: 13,
        sources: 7,
        ..limits()
    };
    let first = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        small,
    );
    assert_eq!(first.scan_state, AggregateState::Preparing);
    let before = index.search_revision(fixture.root(0));
    fs::create_dir(fixture.root(0).join("用户新建空目录")).unwrap();
    let started = Instant::now();
    while index.search_revision(fixture.root(0)) == before
        && started.elapsed() < Duration::from_secs(5)
    {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(index.search_revision(fixture.root(0)) > before);
    request.cursor = first.continue_cursor;
    let ready = finish(
        &mut session,
        request.clone(),
        &fixture.scopes,
        &runtime,
        &index,
        small,
    );
    assert_eq!(
        ready.scan_state,
        AggregateState::Ready,
        "a harmless directory hint must not drop one library"
    );
    assert_eq!(ready.total_files, Some(486));
    let files = all_files(
        &mut session,
        ready,
        request,
        &fixture.scopes,
        &runtime,
        &index,
    );
    assert_eq!(files.len(), 486);
}

#[test]
fn v118_libraries_tiny_budgets_resume_all_files_without_reopening_completed_bodies() {
    let fixture = Fixture::new(&[121, 121, 1]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let response = finish(
        &mut session,
        request.clone(),
        &fixture.scopes,
        &runtime,
        &index,
        SearchLimits {
            entries: 7,
            sources: 5,
            read_bytes: 200,
            segments: 8,
            ..limits()
        },
    );
    assert!(session.work_step > 30);
    assert_eq!(response.total_files, Some(243));
    assert_eq!(
        session
            .slots
            .iter()
            .map(|slot| slot.session.as_ref().unwrap().body_builds)
            .sum::<usize>(),
        243
    );
    assert_eq!(
        all_files(
            &mut session,
            response,
            request,
            &fixture.scopes,
            &runtime,
            &index
        )
        .len(),
        243
    );
}

#[test]
fn v118_libraries_work_retry_is_identical_and_forged_or_changed_requests_do_not_advance() {
    let fixture = Fixture::new(&[81, 1]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let first = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    // cursor=None starts a new public query. Retry the actual continuation
    // issued by the first response, not an invented retry of a new-query call.
    let mut request = request;
    request.cursor = first.continue_cursor;
    let ready = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    let duplicate = session
        .request(&request, &fixture.scopes, &runtime, &index, |_, _, _| {
            panic!("duplicate cannot dispatch")
        })
        .unwrap();
    assert_eq!(
        serde_json::to_value(&ready).unwrap(),
        serde_json::to_value(duplicate).unwrap()
    );
    assert_eq!(ready.total_files, Some(82));
    let step = session.work_step;
    for mutation in ["query", "sort", "size", "cursor", "scope", "jump"] {
        let mut invalid = request.clone();
        let mut scopes = fixture.scopes.clone();
        match mutation {
            "query" => invalid.query = "另一次".into(),
            "sort" => invalid.sort = SearchSort::Modified,
            "size" => invalid.page_size = 12,
            "cursor" => invalid.cursor = Some("old-query:w:1".into()),
            "scope" => {
                scopes.pop();
            }
            "jump" => invalid.cursor = Some(session.page_cursor(80)),
            _ => unreachable!(),
        }
        assert!(
            session
                .request(&invalid, &scopes, &runtime, &index, |_, _, _| panic!(
                    "invalid cannot dispatch"
                ))
                .is_err(),
            "{mutation}"
        );
        assert_eq!(session.work_step, step);
    }
    request.cursor = ready.next_cursor;
    assert_eq!(
        tick(
            &mut session,
            &request,
            &fixture.scopes,
            &runtime,
            &index,
            limits()
        )
        .page_offset,
        40
    );
}

#[test]
fn v118_libraries_source_change_removes_only_affected_library_and_does_not_retry_it() {
    let fixture = Fixture::new(&[81, 81]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let ready = finish(
        &mut session,
        request.clone(),
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    index.note_search_change(fixture.root(0));
    request.cursor = ready.next_cursor;
    assert_eq!(
        session
            .request(
                &request,
                &fixture.scopes,
                &runtime,
                &index,
                |_, _, _| panic!("no automatic retry")
            )
            .unwrap_err()
            .code,
        "snapshotChanged"
    );
    request.cursor = Some(ready.refresh_cursor);
    let healthy = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert_eq!(healthy.scan_state, AggregateState::Limited);
    assert_eq!(healthy.available_files, 81);
    assert_eq!(healthy.libraries[0].state, LibraryPhase::Changed);
    assert!(healthy
        .files
        .iter()
        .all(|group| group.library_root == fixture.scopes[1].root));
    assert!(healthy.continue_cursor.is_none() && healthy.total_files.is_none());
}

#[test]
fn v118_libraries_direct_delete_is_detected_without_waiting_for_notify() {
    let fixture = Fixture::new(&[81, 1]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let ready = finish(
        &mut session,
        request.clone(),
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    fs::remove_file(&ready.files[0].file.path).unwrap();
    // Direct validation of the returned file, even with its recorded epoch.
    assert_eq!(
        session.validate_files(&ready, &index).unwrap_err().code,
        "snapshotChanged"
    );
    request.cursor = Some(ready.refresh_cursor);
    let healthy = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert!(healthy
        .files
        .iter()
        .all(|group| group.library_root != ready.files[0].library_root));
    assert_eq!(
        fs::read_to_string(fixture.root(1).join("记录-0000.md")).unwrap(),
        "项目预算确认"
    );
}

#[test]
fn v118_libraries_modified_order_is_global_and_overlapping_roots_do_not_duplicate_files() {
    let fixture = Fixture::new(&[1, 1]);
    let child = fixture.root(0).join("子目录");
    fs::create_dir(&child).unwrap();
    fs::write(child.join("预算.md"), "保留原文").unwrap();
    let old = fixture.root(0).join("记录-0000.md");
    fs::File::options()
        .write(true)
        .open(&old)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(10)))
        .unwrap();
    let mut scopes = fixture.scopes.clone();
    scopes.push(Scope {
        name: "子库".into(),
        root: child.to_string_lossy().into_owned(),
    });
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    request.sort = SearchSort::Modified;
    let mut session = LibrarySession::new(scopes.clone(), &request);
    let response = finish(&mut session, request, &scopes, &runtime, &index, limits());
    assert_eq!(response.total_files, Some(3), "{response:?}");
    assert_eq!(
        response.files.last().unwrap().file.modified_at_ms,
        Some(10_000)
    );
    assert_eq!(
        response
            .files
            .iter()
            .filter(|group| group.file.title == "预算.md")
            .count(),
        1
    );
}

#[test]
fn v118_libraries_shared_retention_limits_and_drop_release_are_aggregate_not_per_library() {
    let pool = Arc::new(RetentionPool::default());
    let mut a = Retention {
        pool: pool.clone(),
        owned: RetainedCounts::default(),
    };
    let mut b = Retention {
        pool: pool.clone(),
        owned: RetainedCounts::default(),
    };
    for _ in 0..MAX_SESSION_SOURCES / 2 {
        assert!(a.source());
        assert!(b.source());
    }
    assert!(!a.source() && !b.source());
    assert!(a.group(MAX_RESULT_BYTES - 1));
    assert!(!b.group(2));
    assert!(b.group(1));
    assert!(!a.group(1));
    drop(a);
    assert!(b.source() && b.group(2));
    drop(b);
    let counts = pool.0.lock().unwrap();
    assert_eq!((counts.sources, counts.files, counts.bytes), (0, 0, 0));
}

#[test]
fn v118_libraries_budget_exhaustion_is_limited_and_preserves_healthy_file_pages() {
    let fixture = Fixture::new(&[1, 1]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let first = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    // Inject capacity pressure, not a claim to have measured 100k actual files.
    session.pool.0.lock().unwrap().sources = MAX_SESSION_SOURCES;
    // Existing completed outcomes remain usable; a new queued library is limited.
    let extra = Scope {
        name: "第三库".into(),
        root: fixture._owned.dir("第三库").to_string_lossy().into_owned(),
    };
    fs::write(Path::new(&extra.root).join("预算.md"), "预算").unwrap();
    session.slots.push(LibrarySlot {
        scope: extra.clone(),
        phase: LibraryPhase::Queued,
        session: None,
        examined: 0,
        indexed: false,
        warnings: Vec::new(),
    });
    let mut scopes = fixture.scopes.clone();
    scopes.push(extra);
    let mut request = request;
    request.cursor = first.continue_cursor;
    let response = finish(&mut session, request, &scopes, &runtime, &index, limits());
    assert_eq!(response.scan_state, AggregateState::Limited);
    assert_eq!(response.available_files, 2);
    assert_eq!(response.libraries[2].state, LibraryPhase::Limited);
    assert!(!response.libraries[2].warnings.is_empty());
    assert!(response.total_files.is_none() && !response.scan_complete);
}

#[test]
fn v118_libraries_runtime_modes_share_owner_limits_cancellation_and_task_pool() {
    let fixture = Fixture::new(&[1]);
    let runtime = SearchPageRuntime::default();
    let request = fixture.request();
    let multi = LibrarySession::new(fixture.scopes.clone(), &request);
    let handle = runtime
        .insert_state(
            ("w".into(), SearchChannel::Palette),
            multi.id.clone(),
            multi.cancelled.clone(),
            SessionState::Libraries(Box::new(multi)),
        )
        .unwrap();
    let single_request = request.single(fixture.scopes[0].root.clone());
    let replacement = runtime
        .insert(
            ("w".into(), SearchChannel::Palette),
            QuerySession::new(fixture.root(0), &single_request, 0, None, None).unwrap(),
        )
        .unwrap();
    assert!(handle.cancelled.load(Ordering::Acquire));
    assert!(!runtime.close("w", SearchChannel::Palette, &handle.id));
    assert!(!replacement.cancelled.load(Ordering::Acquire));
    for index in 1..MAX_SESSIONS {
        let session = LibrarySession::new(fixture.scopes.clone(), &request);
        runtime
            .insert_state(
                (format!("w{index}"), SearchChannel::Palette),
                session.id.clone(),
                session.cancelled.clone(),
                SessionState::Libraries(Box::new(session)),
            )
            .unwrap();
    }
    let session = LibrarySession::new(fixture.scopes.clone(), &request);
    assert_eq!(
        runtime
            .insert_state(
                ("extra".into(), SearchChannel::Palette),
                session.id.clone(),
                session.cancelled.clone(),
                SessionState::Libraries(Box::new(session))
            )
            .err()
            .unwrap()
            .code,
        "busy"
    );
    let permits = (0..MAX_ACTIVE_TASKS)
        .map(|_| runtime.permit().unwrap())
        .collect::<Vec<_>>();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    assert!(session
        .take_jobs(&runtime, SearchChannel::Palette)
        .is_empty());
    assert_eq!(session.slots[0].phase, LibraryPhase::Queued);
    drop(permits);
    let jobs = session.take_jobs(&runtime, SearchChannel::Palette);
    assert_eq!(jobs.len(), 1);
    session.cancelled.store(true, Ordering::Release);
    let (job, permit) = jobs.into_iter().next().unwrap();
    assert_eq!(
        run_library_step(job, &KnowledgeIndexRuntime::default(), None, limits())
            .err()
            .unwrap()
            .code,
        "expired"
    );
    drop(permit);
    assert_eq!(runtime.active.load(Ordering::Acquire), 0);
}

#[test]
fn v118_libraries_config_scope_is_bounded_before_io_and_respects_platform_identity() {
    let mut libraries = vec![
        LibraryConfig {
            name: "一".into(),
            path: "/offline/project".into(),
            ..Default::default()
        },
        LibraryConfig {
            name: "重复".into(),
            path: "/offline/project/".into(),
            ..Default::default()
        },
        LibraryConfig {
            name: "大小写".into(),
            path: "/offline/Project".into(),
            ..Default::default()
        },
    ];
    assert_eq!(
        configured_scopes(&libraries, None).unwrap().len(),
        if cfg!(windows) { 1 } else { 2 }
    );
    assert!(configured_scopes(&libraries, Some("/unconfigured")).is_err());
    for index in 0..MAX_LIBRARIES {
        libraries.push(LibraryConfig {
            name: index.to_string(),
            path: format!("/offline/{index}"),
            ..Default::default()
        });
    }
    assert_eq!(
        configured_scopes(&libraries, None).unwrap_err().code,
        "scopeTooLarge"
    );
    assert_eq!(
        configured_scopes(&libraries, Some("/offline/0"))
            .unwrap()
            .len(),
        1
    );
    let fixture = Fixture::new(&[0]);
    let mut request = fixture.request();
    request.query = "  预算  ".into();
    request.normalize_validate().unwrap();
    assert_eq!(request.query, "预算");
    request.page_size = 101;
    assert!(request.normalize_validate().is_err());
    assert!(serde_json::from_value::<LibrariesPageRequest>(serde_json::json!({"libraryRoot":null,"query":"预算","pageSize":40,"channel":"palette","owner":"forged"})).is_err());
}

#[test]
fn v118_libraries_ttl_and_poisoned_session_cleanup_release_registry_capacity() {
    let fixture = Fixture::new(&[0]);
    let runtime = SearchPageRuntime::default();
    let request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    session.touched = Instant::now() - IDLE_TTL;
    let old = runtime
        .insert_state(
            ("ttl".into(), SearchChannel::Palette),
            session.id.clone(),
            session.cancelled.clone(),
            SessionState::Libraries(Box::new(session)),
        )
        .unwrap();
    assert!(runtime
        .get(&("ttl".into(), SearchChannel::Palette))
        .is_err());
    assert!(old.cancelled.load(Ordering::Acquire));
    let session = LibrarySession::new(fixture.scopes.clone(), &request);
    let poisoned = runtime
        .insert_state(
            ("poison".into(), SearchChannel::Palette),
            session.id.clone(),
            session.cancelled.clone(),
            SessionState::Libraries(Box::new(session)),
        )
        .unwrap();
    let copy = poisoned.clone();
    assert!(std::thread::spawn(move || {
        let _guard = copy.state.lock().unwrap();
        panic!("intentional poisoned-session cleanup regression");
    })
    .join()
    .is_err());
    assert!(runtime
        .get(&("poison".into(), SearchChannel::Palette))
        .is_err());
    assert!(poisoned.cancelled.load(Ordering::Acquire));
}

fn directory_event_fixture(
    extra_source_before_watch: bool,
) -> (Fixture, KnowledgeIndexRuntime, QuerySession, (u64, u64)) {
    let fixture = Fixture::new(&[1]);
    let index = KnowledgeIndexRuntime::default();
    let request = fixture.request().single(fixture.scopes[0].root.clone());
    let mut session = QuerySession::new(fixture.root(0), &request, 0, None, None).unwrap();
    session.advance(&mut SearchBudget::new(limits())).unwrap();
    assert_eq!(session.state, ScanState::Ready);
    if extra_source_before_watch {
        fs::write(fixture.root(0).join("预算新增.md"), "用户新正文不许改回").unwrap();
    }
    index.ensure_watcher(fixture.root(0)).unwrap();
    let before = index.search_revision_pair(fixture.root(0));
    fs::create_dir(fixture.root(0).join("空文件夹")).unwrap();
    let started = Instant::now();
    while index.search_revision(fixture.root(0)) == before.0
        && started.elapsed() < Duration::from_secs(5)
    {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(
        index.search_revision(fixture.root(0)) > before.0,
        "real directory event must be observed"
    );
    (fixture, index, session, before)
}

#[test]
fn v118_libraries_directory_notification_is_verified_not_blindly_ignored() {
    let (fixture, index, mut session, before) = directory_event_fixture(false);
    let mut budget = SearchBudget::new(limits());
    assert!(verify_directory_notification(
        &mut session,
        &index,
        before,
        &mut budget
    ));
    assert!(
        budget.entries > 0 && budget.sources == 1,
        "fresh bounded signature walk, not suppression"
    );
    assert_eq!(session.revision, index.search_revision(fixture.root(0)));
    assert_eq!(
        session.body_builds, 1,
        "verification never reparses completed bodies"
    );
    let before = index.search_revision_pair(fixture.root(0));
    index.note_search_change(fixture.root(0));
    assert!(
        !verify_directory_notification(
            &mut session,
            &index,
            before,
            &mut SearchBudget::new(limits())
        ),
        "explicit snapshot/build changes cannot be absorbed"
    );
}

#[test]
fn v118_libraries_directory_hint_with_added_source_or_budget_stop_still_expires() {
    let (fixture, index, mut session, before) = directory_event_fixture(true);
    assert!(
        !verify_directory_notification(
            &mut session,
            &index,
            before,
            &mut SearchBudget::new(limits())
        ),
        "a directory event must not hide a missed new file"
    );
    assert_eq!(
        fs::read_to_string(fixture.root(0).join("预算新增.md")).unwrap(),
        "用户新正文不许改回"
    );
    let (_fixture, index, mut session, before) = directory_event_fixture(false);
    assert!(
        !verify_directory_notification(
            &mut session,
            &index,
            before,
            &mut SearchBudget::new(SearchLimits {
                sources: 0,
                ..limits()
            })
        ),
        "incomplete verification must remain expired"
    );
}

#[test]
fn v118_libraries_empty_result_retry_rechecks_completed_library_epochs() {
    let fixture = Fixture::new(&[0]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let first = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    request.cursor = first.continue_cursor;
    let ready = tick(
        &mut session,
        &request,
        &fixture.scopes,
        &runtime,
        &index,
        limits(),
    );
    assert_eq!(ready.total_files, Some(0));
    index.note_search_change(fixture.root(0));
    assert_eq!(
        session
            .request(
                &request,
                &fixture.scopes,
                &runtime,
                &index,
                |_, _, _| panic!("retry must not launch")
            )
            .unwrap_err()
            .code,
        "snapshotChanged"
    );
}

#[test]
fn v118_libraries_real_unread_body_keeps_positive_filename_but_not_unknown_exclusion() {
    let fixture = Fixture::new(&[0, 1]);
    fs::write(
        fixture.root(0).join("预算.docx"),
        "损坏压缩正文，不冒充成功",
    )
    .unwrap();
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    for (query, expected) in [("预算", 2), ("预算 -秘密", 1)] {
        let mut request = fixture.request();
        request.query = query.into();
        let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
        let response = finish(
            &mut session,
            request,
            &fixture.scopes,
            &runtime,
            &index,
            limits(),
        );
        assert_eq!(response.scan_state, AggregateState::Limited);
        assert_eq!(response.available_files, expected);
        assert_eq!(response.libraries[0].state, LibraryPhase::Limited);
        assert_eq!(response.libraries[1].state, LibraryPhase::Ready);
        assert!(response.total_files.is_none());
    }
}

#[test]
fn v118_libraries_fixed_fixture_reports_full_aggregation_and_page_cost_separately() {
    let fixture = Fixture::new(&[243, 243]);
    let mut observations = Vec::new();
    for mode in ["cold", "memory"] {
        let index = KnowledgeIndexRuntime::default();
        if mode == "memory" {
            for scope in &fixture.scopes {
                index.cache_snapshot(
                    Path::new(&scope.root),
                    snapshot_from_graph(
                        Path::new(&scope.root),
                        GraphData {
                            nodes: Vec::new(),
                            edges: Vec::new(),
                        },
                    ),
                );
            }
        }
        let runtime = SearchPageRuntime::default();
        let mut first_times = Vec::new();
        let mut page_times = Vec::new();
        for _ in 0..5 {
            let mut request = fixture.request();
            let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
            let started = Instant::now();
            let first = finish(
                &mut session,
                request.clone(),
                &fixture.scopes,
                &runtime,
                &index,
                limits(),
            );
            first_times.push(started.elapsed().as_micros() as u64);
            assert_eq!(first.total_files, Some(486));
            let builds = session
                .slots
                .iter()
                .map(|slot| slot.session.as_ref().unwrap().body_builds)
                .sum::<usize>();
            request.cursor = first.next_cursor;
            let started = Instant::now();
            let second = tick(
                &mut session,
                &request,
                &fixture.scopes,
                &runtime,
                &index,
                limits(),
            );
            page_times.push(started.elapsed().as_micros() as u64);
            assert_eq!(second.page_offset, 40);
            assert_eq!(
                session
                    .slots
                    .iter()
                    .map(|slot| slot.session.as_ref().unwrap().body_builds)
                    .sum::<usize>(),
                builds
            );
        }
        observations.push(serde_json::json!({"mode":mode,"files":486,"samples":5,"fullAggregationMicros":first_times,"nextPageMicros":page_times,
            "workerExecution":"serial real helper in test launcher; not native IPC or scheduler timing"}));
    }
    println!(
        "V118_MULTILIBRARY_TIMING={}",
        serde_json::to_string(&observations).unwrap()
    );
}

#[test]
fn v118_libraries_preparation_progress_does_not_invalidate_healthy_file_pages() {
    let fixture = Fixture::new(&[81, 500]);
    let runtime = SearchPageRuntime::default();
    let index = KnowledgeIndexRuntime::default();
    let mut request = fixture.request();
    let mut session = LibrarySession::new(fixture.scopes.clone(), &request);
    let custom_limits = |job: LibraryJob, permit: TaskPermit, sender: Sender<Outcome>| {
        let position = job.position;
        let result = run_library_step(
            job,
            &index,
            None,
            if position == 0 {
                limits()
            } else {
                SearchLimits {
                    entries: 3,
                    sources: 2,
                    ..limits()
                }
            },
        );
        drop(permit);
        sender.send(Outcome { position, result }).unwrap();
    };
    let first = session
        .request(&request, &fixture.scopes, &runtime, &index, custom_limits)
        .unwrap();
    request.cursor = first.continue_cursor;
    let available = session
        .request(&request, &fixture.scopes, &runtime, &index, custom_limits)
        .unwrap();
    assert_eq!(available.available_files, 81);
    let version = available.view_version;
    let cursor = available.next_cursor.clone();
    for _ in 0..5 {
        request.cursor = Some(session.work_cursor());
        let progress = session
            .request(&request, &fixture.scopes, &runtime, &index, custom_limits)
            .unwrap();
        assert_eq!(progress.view_version, version);
        assert_eq!(progress.available_files, 81);
    }
    request.cursor = cursor;
    assert_eq!(
        tick(
            &mut session,
            &request,
            &fixture.scopes,
            &runtime,
            &index,
            limits()
        )
        .page_offset,
        40
    );
}
