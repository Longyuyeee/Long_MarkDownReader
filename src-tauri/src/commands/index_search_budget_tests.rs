use super::*;
use crate::commands::graph::GraphData;
use crate::services::{search_scan::SearchLimits, test_workspace::TestWorkspace};
use std::time::Duration;

fn limits() -> SearchLimits {
    SearchLimits {
        elapsed: Duration::from_secs(30),
        ..SearchLimits::default()
    }
}

#[test]
fn v118_query_budget_reports_incomplete_instead_of_partial_or_empty_success() {
    let fixture = TestWorkspace::new();
    for index in 0..12 {
        fs::write(fixture.0.join(format!("项目-{index}.md")), "预算确认").unwrap();
    }
    for query in ["预算", "项目 预算 -旧版", "不存在"] {
        let mut budget = SearchBudget::new(SearchLimits {
            sources: 3,
            ..limits()
        });
        let result = search_workspace_checked(&fixture.0, query, None, &mut budget);
        assert!(
            matches!(result, Err(SearchStop::Sources)),
            "{query}: cannot claim a complete result"
        );
        assert_eq!(budget.sources, 3);
        assert_eq!(
            budget.read_bytes, 0,
            "metadata limit stops before opening content"
        );
        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("这不表示没有匹配资料"));
    }
}

#[test]
fn v118_query_budget_is_cumulative_for_literal_and_complex_cold_reads() {
    let fixture = TestWorkspace::new();
    for index in 0..3 {
        fs::write(fixture.0.join(format!("项目-{index}.md")), "budget").unwrap();
    }
    for query in ["budget", "项目 budget"] {
        let mut budget = SearchBudget::new(SearchLimits {
            read_bytes: 10,
            ..limits()
        });
        assert!(matches!(
            search_workspace_checked(&fixture.0, query, None, &mut budget),
            Err(SearchStop::ReadBytes)
        ));
        assert_eq!(
            budget.read_bytes, 6,
            "reject the next file before reading it"
        );
        for index in 0..3 {
            assert_eq!(
                fs::read_to_string(fixture.0.join(format!("项目-{index}.md"))).unwrap(),
                "budget"
            );
        }
    }
}

#[test]
fn v118_query_budget_applies_to_disk_freshness_before_unbounded_traversal() {
    let fixture = TestWorkspace::new();
    let root = fixture.dir("library");
    let cache = fixture.dir("cache");
    for index in 0..5 {
        fs::write(root.join(format!("{index}.md")), "预算").unwrap();
    }
    let snapshot = snapshot_from_graph(
        &root,
        GraphData {
            nodes: Vec::new(),
            edges: Vec::new(),
        },
    );
    write_snapshot(&cache, &root, &snapshot).unwrap();
    let mut budget = SearchBudget::new(SearchLimits {
        entries: 2,
        ..limits()
    });
    assert!(matches!(
        search_workspace_checked(&root, "预算", Some((&cache, false)), &mut budget),
        Err(SearchStop::Entries)
    ));
    assert_eq!(
        (budget.entries, budget.read_bytes, budget.segments),
        (2, 0, 0)
    );
    let mut full = SearchBudget::new(limits());
    assert_eq!(
        search_workspace_checked(&root, "预算", Some((&cache, false)), &mut full)
            .unwrap()
            .len(),
        5
    );
    assert_eq!(
        full.read_bytes, 0,
        "ready snapshot does not reopen source bodies"
    );
}

#[test]
fn v118_query_budget_checks_cached_segment_count_text_and_elapsed_for_both_grammars() {
    let segment = IndexedSearchSegment {
        title: "项目.md".into(),
        path: "/项目.md".into(),
        object_type: "markdown".into(),
        match_kind: "body".into(),
        text: "预算确认".into(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        extraction_failed: false,
    };
    let segments = vec![segment.clone(); 5];
    for query in ["预算", "项目 预算 -旧版"] {
        let mut count = SearchBudget::new(SearchLimits {
            segments: 2,
            ..limits()
        });
        assert!(matches!(
            search_segments_checked(&segments, query, &mut Some(&mut count)),
            Err(SearchStop::Segments)
        ));
        assert_eq!(count.segments, 2);
        let mut bytes = SearchBudget::new(SearchLimits {
            text_bytes: segment.text.len() - 1,
            ..limits()
        });
        assert!(matches!(
            search_segments_checked(&segments, query, &mut Some(&mut bytes)),
            Err(SearchStop::TextBytes)
        ));
        assert_eq!(bytes.segments, 0);
        let mut expired = SearchBudget::new(SearchLimits {
            elapsed: Duration::ZERO,
            ..limits()
        });
        assert!(matches!(
            search_segments_checked(&segments, query, &mut Some(&mut expired)),
            Err(SearchStop::Elapsed)
        ));
    }
}

#[test]
fn v118_query_budget_charges_pdf_sidecars_before_loading_any_of_them() {
    let fixture = TestWorkspace::new();
    let guard = WorkspaceGuard::new(&fixture.0).unwrap();
    let pdf = fixture.0.join("资料.pdf");
    fs::write(&pdf, "pdf").unwrap();
    fs::write(fixture.0.join("资料.pdf.annotations.json"), "annotation").unwrap();
    fs::write(fixture.0.join("资料.pdf.ocr.json"), "OCR").unwrap();
    let mut budget = SearchBudget::new(SearchLimits {
        read_bytes: 12,
        ..limits()
    });
    assert_eq!(
        reserve_search_reads(&guard, &pdf, "pdf", 64 * 1024 * 1024, &mut budget),
        Err(SearchStop::ReadBytes)
    );
    assert_eq!(budget.read_bytes, 3);
    let mut full = SearchBudget::new(limits());
    reserve_search_reads(&guard, &pdf, "pdf", 64 * 1024 * 1024, &mut full).unwrap();
    assert_eq!(
        full.read_bytes, 16,
        "main PDF + annotations + OCR all share one budget"
    );
}

#[test]
fn v118_query_budget_keeps_whole_file_exclusions_when_terms_span_segments() {
    let fixture = TestWorkspace::new();
    let path = fixture.0.join("报告.docx");
    fs::write(&path, super::tests::docx_fixture()).unwrap();
    let query = "indexed review -paragraph";
    let mut budget = SearchBudget::new(limits());
    assert!(
        search_workspace_checked(&fixture.0, query, None, &mut budget)
            .unwrap()
            .is_empty()
    );
    let mut budget = SearchBudget::new(limits());
    let results =
        search_workspace_checked(&fixture.0, "indexed review", None, &mut budget).unwrap();
    assert!(results.iter().any(|result| result.match_kind == "related"));
}

#[test]
fn v118_query_budget_still_finds_late_filename_match_beyond_200_files() {
    let fixture = TestWorkspace::new();
    for index in 0..240 {
        fs::write(fixture.0.join(format!("a-{index}.md")), "预算确认").unwrap();
    }
    let target = fixture.0.join("zz-项目预算.md");
    fs::write(&target, "原文不变").unwrap();
    for query in ["预算", "项目 预算"] {
        let mut budget = SearchBudget::new(limits());
        let results = search_workspace_checked(&fixture.0, query, None, &mut budget).unwrap();
        assert_eq!(results[0].path, target.to_string_lossy());
        assert_eq!(results[0].score, 100);
        assert!(budget.read_bytes > 0 && budget.sources == 241);
    }
}

#[test]
fn v118_query_budget_cached_overlay_and_deleted_file_fallback_use_checked_paths() {
    let fixture = TestWorkspace::new();
    let old = fixture.0.join("项目.md");
    let retained = fixture.0.join("保留.md");
    fs::write(&old, "old").unwrap();
    fs::write(&retained, "budget").unwrap();
    let snapshot = snapshot_from_graph(
        &fixture.0,
        GraphData {
            nodes: Vec::new(),
            edges: Vec::new(),
        },
    );
    let mut cached = SearchBudget::new(limits());
    assert_eq!(
        search_library_snapshot(
            &fixture.0,
            "budget",
            Some(&snapshot),
            &[],
            None,
            &mut cached
        )
        .unwrap()
        .len(),
        1
    );
    assert_eq!((cached.entries, cached.read_bytes), (0, 0));
    fs::write(&old, "budget replacement").unwrap();
    let mut blocked = SearchBudget::new(SearchLimits {
        read_bytes: 1,
        ..limits()
    });
    assert!(matches!(
        search_library_snapshot(
            &fixture.0,
            "budget",
            Some(&snapshot),
            std::slice::from_ref(&old),
            None,
            &mut blocked
        ),
        Err(SearchStop::ReadBytes)
    ));
    let mut overlay = SearchBudget::new(limits());
    assert_eq!(
        search_library_snapshot(
            &fixture.0,
            "budget",
            Some(&snapshot),
            std::slice::from_ref(&old),
            None,
            &mut overlay
        )
        .unwrap()
        .len(),
        2
    );
    assert_eq!(
        overlay.entries, 0,
        "safe one-file overlay must not walk the full tree"
    );
    assert_eq!(
        overlay.read_bytes, 36,
        "reserve the helper's safety read and its segment builder read"
    );
    fs::remove_file(&old).unwrap();
    let mut deleted = SearchBudget::new(limits());
    let results = search_library_snapshot(
        &fixture.0,
        "budget",
        Some(&snapshot),
        &[old],
        None,
        &mut deleted,
    )
    .unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].path, retained.to_string_lossy());
    assert!(
        deleted.entries > 0,
        "deletion falls back to bounded metadata, not an error or stale cache"
    );
}
