use super::*;
use crate::services::{knowledge_index::collect_index_sources, test_workspace::TestWorkspace};
use std::collections::HashSet;

#[test]
fn v118_scan_budget_resumes_without_repeating_or_skipping_sources() {
    let fixture = TestWorkspace::new();
    for directory in ["资料 A", "资料 B", "资料 B/子目录"] {
        fs::create_dir(fixture.0.join(directory)).unwrap();
    }
    for index in 0..31 {
        let directory = ["资料 A", "资料 B/子目录"][index % 2];
        fs::write(
            fixture.0.join(directory).join(format!("{index}.md")),
            "项目预算",
        )
        .unwrap();
    }
    fs::write(fixture.0.join("来源.pdf.ocr.json"), "{}").unwrap();
    fs::write(fixture.0.join("来源.pdf.annotations.json"), "{}").unwrap();
    let expected = collect_index_sources(&fixture.0);
    let mut scan = SourceScan::new(&fixture.0).unwrap();
    let mut actual = Vec::new();
    let mut completed = false;
    let mut pauses = 0;
    for _ in 0..100 {
        let mut budget = SearchBudget::new(SearchLimits {
            entries: 3,
            sources: 2,
            ..SearchLimits::default()
        });
        loop {
            match scan.next(&mut budget) {
                Ok(Some(source)) => actual.push(source),
                Ok(None) => {
                    completed = true;
                    break;
                }
                Err(SearchStop::Entries | SearchStop::Sources) => {
                    pauses += 1;
                    break;
                }
                Err(error) => panic!("unexpected stop: {error:?}"),
            }
        }
        assert!(budget.entries <= 3 && budget.sources <= 2);
        if completed {
            break;
        }
    }
    assert!(completed && pauses > 10);
    assert_eq!(
        actual.len(),
        actual
            .iter()
            .map(|source| &source.path)
            .collect::<HashSet<_>>()
            .len()
    );
    actual.sort_by(|left, right| left.path.cmp(&right.path));
    assert_eq!(
        actual, expected,
        "resume must retain metadata and PDF sidecar identity"
    );
}

#[test]
fn v118_scan_budget_keeps_a_pending_source_when_source_budget_is_zero() {
    let fixture = TestWorkspace::new();
    fs::write(fixture.0.join("第一份.md"), "原始正文").unwrap();
    let mut scan = SourceScan::new(&fixture.0).unwrap();
    let mut blocked = SearchBudget::new(SearchLimits {
        sources: 0,
        ..SearchLimits::default()
    });
    assert_eq!(scan.next(&mut blocked), Err(SearchStop::Sources));
    assert_eq!(blocked.sources, 0);
    let mut resumed = SearchBudget::default();
    let source = scan.next(&mut resumed).unwrap().unwrap();
    assert_eq!(source.path, "第一份.md");
    assert_eq!(
        resumed.entries, 0,
        "pending metadata is not enumerated again"
    );
    assert!(scan.next(&mut resumed).unwrap().is_none());
    assert_eq!(
        fs::read_to_string(fixture.0.join("第一份.md")).unwrap(),
        "原始正文"
    );
}

#[test]
fn v118_scan_budget_counts_unsupported_entries_and_preserves_privacy_filters() {
    let fixture = TestWorkspace::new();
    for index in 0..20 {
        fs::write(fixture.0.join(format!("{index}.unsupported")), "预算").unwrap();
    }
    let mut tiny = SearchBudget::new(SearchLimits {
        entries: 4,
        ..SearchLimits::default()
    });
    assert_eq!(
        collect_search_sources(&fixture.0, &mut tiny),
        Err(SearchStop::Entries)
    );
    assert_eq!(tiny.sources, 0);
    fs::write(fixture.dir(".private").join("不能读取.md"), "预算秘密").unwrap();
    fs::write(fixture.dir("image.assets").join("可见附件.md"), "用户附件正文").unwrap();
    for name in [".env", "credentials.json"] {
        fs::write(fixture.0.join(name), "预算秘密").unwrap();
    }
    fs::write(fixture.0.join("可见.md"), "预算").unwrap();
    let actual = collect_search_sources(&fixture.0, &mut SearchBudget::default()).unwrap();
    assert_eq!(
        actual
            .iter()
            .map(|source| source.path.as_str())
            .collect::<Vec<_>>(),
        vec!["image.assets/可见附件.md", "可见.md"]
    );
}

#[test]
fn v118_scan_budget_distinguishes_empty_missing_and_depth_failure() {
    let fixture = TestWorkspace::new();
    assert!(
        collect_search_sources(&fixture.0, &mut SearchBudget::default())
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        collect_search_sources(&fixture.0.join("不存在"), &mut SearchBudget::default()),
        Err(SearchStop::Io)
    );
    let mut directory = fixture.0.clone();
    for _ in 0..MAX_DIRECTORY_DEPTH {
        directory = directory.join("d");
        fs::create_dir(&directory).unwrap();
    }
    let mut scan = SourceScan::new(&fixture.0).unwrap();
    assert_eq!(
        scan.next(&mut SearchBudget::default()),
        Err(SearchStop::Depth)
    );
    assert!(
        scan.next(&mut SearchBudget::default()).is_err(),
        "failed traversal cannot later claim completion"
    );
}

#[test]
fn v118_scan_budget_limits_bytes_segments_and_time_without_counter_overflow() {
    let mut budget = SearchBudget::new(SearchLimits {
        read_bytes: 5,
        segments: 2,
        text_bytes: 7,
        ..SearchLimits::default()
    });
    budget.read(5).unwrap();
    assert_eq!(budget.read(1), Err(SearchStop::ReadBytes));
    assert_eq!(budget.read_bytes, 5);
    budget.segment(5).unwrap();
    assert_eq!(budget.segment(3), Err(SearchStop::TextBytes));
    assert_eq!((budget.segments, budget.text_bytes), (1, 5));
    budget.segment(2).unwrap();
    assert_eq!(budget.segment(0), Err(SearchStop::Segments));
    let mut expired = SearchBudget::new(SearchLimits {
        elapsed: Duration::ZERO,
        ..SearchLimits::default()
    });
    assert_eq!(expired.read(0), Err(SearchStop::Elapsed));
    let mut maximum = SearchBudget::new(SearchLimits {
        read_bytes: u64::MAX,
        ..SearchLimits::default()
    });
    maximum.read(u64::MAX).unwrap();
    assert_eq!(maximum.read(1), Err(SearchStop::ReadBytes));
}

#[cfg(unix)]
#[test]
fn v118_scan_budget_does_not_follow_symlinks_outside_the_library() {
    let fixture = TestWorkspace::new();
    let library = fixture.dir("library");
    let outside = fixture.dir("outside");
    fs::write(outside.join("不能读取.md"), "预算秘密").unwrap();
    std::os::unix::fs::symlink(&outside, library.join("链接")).unwrap();
    std::os::unix::fs::symlink(outside.join("不能读取.md"), library.join("链接.md")).unwrap();
    assert!(
        collect_search_sources(&library, &mut SearchBudget::default())
            .unwrap()
            .is_empty()
    );
}
