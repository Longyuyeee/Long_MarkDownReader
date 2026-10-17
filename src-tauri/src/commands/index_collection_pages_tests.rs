use super::*;
use crate::services::test_workspace::TestWorkspace;
fn request(root: &Path, query: &str) -> SearchPageRequest {
    SearchPageRequest {
        library_root: root.to_string_lossy().into_owned(),
        query: query.into(),
        sort: SearchSort::Name,
        match_mode: SearchMatchMode::Content,
        page_size: 40,
        channel: SearchChannel::Collection,
        cursor: None,
    }
}
fn session(
    root: &Path,
    query: &str,
    filters: CollectionFilters,
    types: &[String],
) -> (QuerySession, SearchPageRequest) {
    let request = request(root, query);
    let mut session = QuerySession::new(root, &request, 0, None, None).unwrap();
    session
        .set_collection(Some(CollectionScope::normalize(&filters, types).unwrap()))
        .unwrap();
    (session, request)
}
fn drain(session: &mut QuerySession, mut request: SearchPageRequest) -> Vec<SearchPageResponse> {
    let mut pages = Vec::new();
    for _ in 0..1000 {
        let response = session
            .request(
                &request,
                0,
                SearchLimits {
                    elapsed: Duration::from_secs(30),
                    ..Default::default()
                },
            )
            .unwrap();
        if response.scan_state == ScanState::Preparing {
            assert!(response.files.is_empty());
            assert_eq!(response.total_files, None);
        }
        request.cursor = response.next_cursor.clone();
        pages.push(response);
        if request.cursor.is_none() {
            return pages;
        }
    }
    panic!("collection made no bounded progress")
}
#[test]
fn v1110_collection_over_two_hundred_files_is_complete_grouped_and_globally_sorted() {
    let fixture = TestWorkspace::new();
    for n in 0..244 {
        fs::write(
            fixture.0.join(format!("note-{n:03}.md")),
            "预算正文 #项目`语法\n\n预算正文 #工作\n预算",
        )
        .unwrap();
    }
    fs::write(fixture.0.join("not-a-prefix.md"), "预算 #项目扩展").unwrap();
    let (mut state, request) = session(
        &fixture.0,
        "",
        CollectionFilters {
            tag: "项目".into(),
            ..Default::default()
        },
        &["markdown".into()],
    );
    let pages = drain(&mut state, request);
    let files = pages
        .iter()
        .flat_map(|page| &page.files)
        .collect::<Vec<_>>();
    assert_eq!(files.len(), 244);
    assert!(pages
        .iter()
        .all(|page| page.scan_state == ScanState::Preparing || page.total_files == Some(244)));
    assert_eq!(
        files
            .iter()
            .map(|file| &file.path)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        244
    );
    assert!(files.windows(2).all(|pair| pair[0].title <= pair[1].title));
    assert_eq!(state.body_builds, 0);
    let (mut state, request) = session(
        &fixture.0,
        "预算",
        CollectionFilters {
            tag: "项目".into(),
            ..Default::default()
        },
        &[],
    );
    let pages = drain(&mut state, request);
    assert_eq!(
        pages.iter().map(|page| page.files.len()).sum::<usize>(),
        244
    );
    assert!(pages
        .iter()
        .flat_map(|page| &page.files)
        .all(|file| !file.matches.is_empty()
            && file.matches.iter().all(|item| item.path == file.path)));
}
#[test]
fn v1110_collection_type_directory_multitag_time_and_full_query_modified_sort_are_combined() {
    let fixture = TestWorkspace::new();
    let project = fixture.dir("project");
    fixture.dir("project-extra");
    for n in 0..60 {
        fs::write(project.join(format!("note-{n:03}.md")), "#项目 #工作").unwrap();
    }
    fs::write(project.join("wrong.md"), "#项目").unwrap();
    fs::write(fixture.0.join("project-extra/other.md"), "#项目 #工作").unwrap();
    fs::write(project.join("text.txt"), "#项目 #工作").unwrap();
    let newest = project.join("zz-newest.md");
    fs::write(&newest, "#项目 #工作").unwrap();
    let old = project.join("old.md");
    fs::write(&old, "#项目 #工作").unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&old)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(10)))
        .unwrap();
    let filters = CollectionFilters {
        directory: "project".into(),
        tag: "项目".into(),
        tags: vec!["工作".into()],
        modified_within_days: Some(7),
    };
    let (mut state, mut req) = session(&fixture.0, "", filters, &["markdown".into()]);
    state.sort = SearchSort::Modified;
    req.sort = SearchSort::Modified;
    let pages = drain(&mut state, req);
    let files = pages
        .iter()
        .flat_map(|page| &page.files)
        .collect::<Vec<_>>();
    assert_eq!(files.len(), 61);
    assert!(files[0].path.ends_with("zz-newest.md"));
    assert!(files
        .windows(2)
        .all(|pair| pair[0].modified_nanos >= pair[1].modified_nanos));
    assert!(files.iter().all(|file| !file.path.ends_with("old.md")
        && !file.path.ends_with("wrong.md")
        && !file.path.ends_with("text.txt")));
}
#[test]
fn v1110_collection_metadata_only_does_not_extract_large_bodies_and_unread_tag_body_is_not_empty_complete(
) {
    let fixture = TestWorkspace::new();
    fs::write(fixture.0.join("okay.md"), "#项目").unwrap();
    let large = fixture.0.join("large.md");
    fs::File::create(&large)
        .unwrap()
        .set_len(21 * 1024 * 1024)
        .unwrap();
    let (mut state, req) = session(&fixture.0, "", Default::default(), &[]);
    let pages = drain(&mut state, req);
    assert_eq!(pages.last().unwrap().total_files, Some(2));
    assert_eq!(state.body_builds, 0);
    let (mut state, req) = session(
        &fixture.0,
        "",
        CollectionFilters {
            tag: "项目".into(),
            ..Default::default()
        },
        &[],
    );
    let pages = drain(&mut state, req);
    let last = pages.last().unwrap();
    assert_eq!(last.scan_state, ScanState::Limited);
    assert_eq!(last.total_files, None);
    assert_eq!(last.unread_sources, 1);
    assert_eq!(pages.iter().map(|page| page.files.len()).sum::<usize>(), 1);
}
#[test]
fn v1110_collection_rejects_scope_cursor_changes_and_private_directories() {
    let fixture = TestWorkspace::new();
    fixture.dir(".longedit");
    let (state, _) = session(&fixture.0, "", Default::default(), &[]);
    assert!(state.validate_collection_scope(&None).is_err());
    let changed = CollectionScope::normalize(
        &CollectionFilters {
            tag: "项目".into(),
            ..Default::default()
        },
        &[],
    )
    .unwrap();
    assert!(state.validate_collection_scope(&Some(changed)).is_err());
    assert!(CollectionScope::normalize(
        &CollectionFilters {
            directory: "../outside".into(),
            ..Default::default()
        },
        &[]
    )
    .is_err());
    assert!(CollectionScope::normalize(
        &Default::default(),
        &["markdown".into(), "markdown".into()]
    )
    .is_err());
    let req = request(&fixture.0, "");
    let mut state = QuerySession::new(&fixture.0, &req, 0, None, None).unwrap();
    assert!(state
        .set_collection(Some(
            CollectionScope::normalize(
                &CollectionFilters {
                    directory: ".longedit".into(),
                    ..Default::default()
                },
                &[]
            )
            .unwrap()
        ))
        .is_err());
}

#[test]
fn v1110_catalog_counts_and_tag_results_share_one_snapshot_grammar_and_resumable_steps() {
    let fixture = TestWorkspace::new();
    for n in 0..600 {
        fs::write(
            fixture.0.join(format!("{n:03}.MD")),
            "\u{feff}#项目 #项目`尾部 #工作。",
        )
        .unwrap();
    }
    fs::write(fixture.0.join(".hidden.md"), "#隐藏").unwrap();
    let req = request(&fixture.0, "");
    let mut state = QuerySession::new(&fixture.0, &req, 0, None, None).unwrap();
    let scope = CollectionScope {
        filters: Default::default(),
        types: vec!["markdown".into()],
        catalog: true,
    };
    state.set_collection(Some(scope)).unwrap();
    let first = state
        .request(
            &req,
            0,
            SearchLimits {
                elapsed: Duration::from_secs(30),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(first.scan_state, ScanState::Preparing);
    assert!(!first.scan_complete);
    let initial = first.catalog.as_ref().unwrap();
    assert_eq!(initial.examined_notes, 256);
    assert!(initial.tags.iter().all(|tag| tag.count == 256));
    let mut req = req;
    req.cursor = first.next_cursor;
    let second = state
        .request(
            &req,
            0,
            SearchLimits {
                elapsed: Duration::from_secs(30),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(second.catalog.as_ref().unwrap().examined_notes, 512);
    let retry = state
        .request(
            &req,
            0,
            SearchLimits {
                elapsed: Duration::from_secs(30),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        serde_json::to_value(&retry).unwrap(),
        serde_json::to_value(&second).unwrap(),
        "retrying the same issued cursor cannot count a note twice"
    );
    req.cursor = second.next_cursor;
    let pages = drain(&mut state, req);
    let done = pages.last().unwrap();
    assert!(done.scan_complete);
    let catalog = done.catalog.as_ref().unwrap();
    assert_eq!(catalog.examined_notes, 600);
    assert_eq!(catalog.tags.len(), 2);
    assert!(catalog.tags.iter().all(|tag| tag.count == 600));
    assert_eq!(
        legacy_tag_catalog(&fixture.0)
            .unwrap()
            .iter()
            .find(|tag| tag.tag == "项目")
            .unwrap()
            .count,
        600
    );
    assert_eq!(legacy_tag_files(&fixture.0, "项目").unwrap().len(), 600);
}

#[test]
fn v1110_catalog_limit_and_unread_are_explicit_and_failed_file_does_not_partially_increment_tags() {
    let fixture = TestWorkspace::new();
    fs::write(fixture.0.join("okay.md"), "#项目").unwrap();
    fs::write(fixture.0.join("bad.md"), [0xff, 0xfe, 0x41]).unwrap();
    let req = request(&fixture.0, "");
    let mut state = QuerySession::new(&fixture.0, &req, 0, None, None).unwrap();
    state
        .set_collection(Some(CollectionScope {
            filters: Default::default(),
            types: vec!["markdown".into()],
            catalog: true,
        }))
        .unwrap();
    let pages = drain(&mut state, req);
    let done = pages.last().unwrap();
    assert_eq!(done.scan_state, ScanState::Limited);
    assert_eq!(done.total_files, None);
    assert_eq!(done.unread_sources, 1);
    assert_eq!(done.catalog.as_ref().unwrap().tags[0].count, 1);
    assert!(
        legacy_tag_catalog(&fixture.0).is_err(),
        "compatibility vectors must not label a partial count complete"
    );
    let many = fixture.0.join("many.md");
    fs::write(
        &many,
        (0..10001)
            .map(|n| format!("#tag{n}"))
            .collect::<Vec<_>>()
            .join(" "),
    )
    .unwrap();
    let source = IndexedSource {
        path: "many.md".into(),
        size: fs::metadata(&many).unwrap().len(),
        modified_nanos: 0,
    };
    let mut catalog = CatalogState::default();
    assert!(matches!(
        catalog_source(&many, &source, &mut SearchBudget::default(), &mut catalog).unwrap(),
        CatalogDecision::Limited
    ));
    assert!(catalog.counts.is_empty());
    assert_eq!(catalog.examined_notes, 0);
}

#[test]
fn v1110_long_existing_tags_and_cursor_query_sort_page_and_scope_bindings_are_preserved() {
    let fixture = TestWorkspace::new();
    let tag = "旧".repeat(120);
    for n in 0..41 {
        fs::write(fixture.0.join(format!("note-{n:03}.md")), format!("#{tag}")).unwrap();
    }
    let (mut state, req) = session(
        &fixture.0,
        "",
        CollectionFilters {
            tag: tag.clone(),
            ..Default::default()
        },
        &[],
    );
    let first = state.request(&req, 0, SearchLimits::default()).unwrap();
    assert_eq!(first.total_files, Some(41));
    let mut next = req.clone();
    next.cursor = first.next_cursor;
    for altered in [
        SearchPageRequest {
            query: "different".into(),
            ..next.clone()
        },
        SearchPageRequest {
            sort: SearchSort::Path,
            ..next.clone()
        },
        SearchPageRequest {
            page_size: 20,
            ..next.clone()
        },
        SearchPageRequest {
            library_root: fixture.dir("other").to_string_lossy().into_owned(),
            ..next.clone()
        },
    ] {
        assert!(state.request(&altered, 0, SearchLimits::default()).is_err());
    }
    assert_eq!(legacy_tag_files(&fixture.0, &tag).unwrap().len(), 41);
    fs::write(fixture.0.join("note-040.md"), "#已修改").unwrap();
    assert!(
        state.request(&next, 0, SearchLimits::default()).is_err(),
        "a changed tagged source cannot be appended from the old snapshot"
    );
}
