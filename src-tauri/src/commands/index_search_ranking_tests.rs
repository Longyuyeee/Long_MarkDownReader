use super::*;
use crate::commands::graph::GraphData;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

const WEAK_FILES: usize = 240;
static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct Fixture {
    directory: PathBuf,
    root: PathBuf,
    cache: PathBuf,
    strongest: PathBuf,
}

impl Fixture {
    fn new(label: &str) -> Self {
        let directory = std::env::temp_dir().join(format!(
            "longedit-v118-ranking-{label}-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        ));
        // Exclusive creation owns this disposable directory, including failure cleanup.
        fs::create_dir(&directory).unwrap();
        let root = directory.join("资料 & project");
        let cache = directory.join("cache");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&cache).unwrap();
        for index in 0..WEAK_FILES {
            fs::write(
                root.join(format!("a-{index:04}-记录.md")),
                "项目日志\n预算已确认\n",
            )
            .unwrap();
        }
        let strongest = root.join("zz-项目预算.md");
        fs::write(&strongest, "# 最相关方案\n\n保留原始正文\n").unwrap();
        for folder in ["目录 A", "目录 B"] {
            fs::create_dir(root.join(folder)).unwrap();
            fs::write(root.join(folder).join("同名资料.md"), "项目预算参考\n").unwrap();
        }
        Self {
            directory,
            root,
            cache,
            strongest,
        }
    }

    fn snapshot(&self) -> crate::services::knowledge_index::KnowledgeIndexSnapshot {
        snapshot_from_graph(
            &self.root,
            GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        )
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        // Only the exclusively created test directory is removed; never the temp root.
        let _ = fs::remove_dir_all(&self.directory);
    }
}

fn segment(path: String, title: &str, text: &str) -> IndexedSearchSegment {
    IndexedSearchSegment {
        title: title.into(),
        path,
        text: text.into(),
        object_type: "markdown".into(),
        match_kind: "body".into(),
        page: None,
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        extraction_failed: false,
    }
}

fn assert_strongest(results: &[KnowledgeSearchResult], path: &Path) {
    assert_eq!(
        results.len(),
        MAX_SEARCH_RESULTS,
        "keep the existing response bound"
    );
    assert_eq!(
        results[0].path,
        path.to_string_lossy(),
        "a late exact filename hit outranks earlier body hits"
    );
    assert_eq!(results[0].score, 100);
    assert_eq!(results[0].match_kind, "title");
}

#[test]
fn v118_ranking_literal_does_not_drop_a_late_strong_match() {
    let mut segments = (0..WEAK_FILES)
        .map(|index| segment(format!("/资料/{index:04}.md"), "日志.md", "项目预算"))
        .collect::<Vec<_>>();
    segments.push(segment(
        "/资料/zz-项目预算.md".into(),
        "zz-项目预算.md",
        "原文保留",
    ));
    assert_strongest(
        &search_segments(&segments, "预算"),
        Path::new("/资料/zz-项目预算.md"),
    );
}

#[test]
fn v118_ranking_complex_does_not_drop_a_late_strong_match_or_ignore_exclusions() {
    let mut segments = (0..WEAK_FILES)
        .map(|index| segment(format!("/资料/{index:04}.md"), "日志.md", "项目预算"))
        .collect::<Vec<_>>();
    segments.push(segment(
        "/资料/zz-项目预算.md".into(),
        "zz-项目预算.md",
        "原文保留",
    ));
    segments.push(segment(
        "/资料/旧版项目预算.md".into(),
        "旧版项目预算.md",
        "旧版",
    ));
    let results = search_segments(&segments, "项目 预算 -旧版");
    assert_strongest(&results, Path::new("/资料/zz-项目预算.md"));
    assert!(!results.iter().any(|result| result.path.contains("旧版")));
}

#[test]
fn v118_ranking_equal_titles_use_file_identity_at_the_limit() {
    let mut segments = (0..WEAK_FILES)
        .map(|index| segment(format!("/目录/{index:04}/同名.md"), "同名.md", "预算"))
        .collect::<Vec<_>>();
    let expected = search_segments(&segments, "预算")
        .into_iter()
        .map(|result| result.path)
        .collect::<Vec<_>>();
    segments.reverse();
    let reversed = search_segments(&segments, "预算")
        .into_iter()
        .map(|result| result.path)
        .collect::<Vec<_>>();
    assert_eq!(
        reversed, expected,
        "same-score files must not depend on scan order"
    );
    assert_eq!(
        expected,
        (0..MAX_SEARCH_RESULTS)
            .map(|index| format!("/目录/{index:04}/同名.md"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn v118_ranking_cold_real_files_include_the_late_filename_hit() {
    let fixture = Fixture::new("cold");
    let results = search_workspace(&fixture.root, "预算", None);
    assert_strongest(&results, &fixture.strongest);
    assert_eq!(
        fs::read_to_string(&fixture.strongest).unwrap(),
        "# 最相关方案\n\n保留原始正文\n"
    );
}

#[test]
fn v118_ranking_ready_disk_index_includes_the_late_filename_hit() {
    let fixture = Fixture::new("ready");
    let snapshot = fixture.snapshot();
    let late = snapshot
        .search_segments
        .iter()
        .position(|segment| segment.path == fixture.strongest.to_string_lossy())
        .unwrap();
    assert!(
        late > MAX_SEARCH_RESULTS,
        "fixture really scans the strongest file after the old limit"
    );
    write_snapshot(&fixture.cache, &fixture.root, &snapshot).unwrap();
    assert!(read_ready_snapshot(&fixture.cache, &fixture.root, false).is_some());
    assert_strongest(
        &search_workspace(&fixture.root, "预算", Some((&fixture.cache, false))),
        &fixture.strongest,
    );
}

#[test]
fn v118_ranking_incremental_overlay_keeps_a_changed_strong_file() {
    let fixture = Fixture::new("overlay");
    let snapshot = fixture.snapshot();
    fs::write(
        &fixture.strongest,
        "# 最相关方案\n\n用户刚刚修改了这份文件，原文继续保留\n",
    )
    .unwrap();
    let overlay = refresh_snapshot_incremental_for_paths(
        &fixture.root,
        snapshot,
        std::slice::from_ref(&fixture.strongest),
    )
    .expect("one safe Markdown update uses the real incremental overlay");
    assert_eq!(
        overlay.search_segments.last().unwrap().path,
        fixture.strongest.to_string_lossy()
    );
    assert_strongest(
        &search_segments(&overlay.search_segments, "预算"),
        &fixture.strongest,
    );
    assert_strongest(
        &search_segments(&overlay.search_segments, "项目 预算"),
        &fixture.strongest,
    );
}

#[test]
fn v118_ranking_fixed_fixture_timing() {
    let fixture = Fixture::new("timing");
    let snapshot = fixture.snapshot();
    write_snapshot(&fixture.cache, &fixture.root, &snapshot).unwrap();
    let mut observations = Vec::new();
    for mode in ["cold", "memory-index", "disk-index"] {
        let mut samples = Vec::new();
        let mut strongest_found = false;
        for _ in 0..5 {
            let started = Instant::now();
            let results = match mode {
                "cold" => search_workspace(&fixture.root, "预算", None),
                "memory-index" => search_segments(&snapshot.search_segments, "预算"),
                _ => search_workspace(&fixture.root, "预算", Some((&fixture.cache, false))),
            };
            samples.push(started.elapsed().as_micros() as u64);
            strongest_found = results
                .iter()
                .any(|result| result.path == fixture.strongest.to_string_lossy());
            assert_eq!(results.len(), MAX_SEARCH_RESULTS);
        }
        samples.sort_unstable();
        observations.push(serde_json::json!({"mode":mode,"medianMicros":samples[2],"minMicros":samples[0],"maxMicros":samples[4],"strongestFound":strongest_found}));
    }
    eprintln!(
        "V118_RANKING_BASELINE {}",
        serde_json::json!({"sourceFiles":WEAK_FILES+3,"samplesPerMode":5,"resultLimit":MAX_SEARCH_RESULTS,"observations":observations})
    );
}

fn ranked_fixture(index: usize) -> KnowledgeSearchResult {
    KnowledgeSearchResult {
        title: format!("同名资料-{}.md", index % 7),
        path: format!("/资料/{index:05}.md"),
        object_type: "markdown".into(),
        match_kind: "body".into(),
        context: format!("项目预算 {index}"),
        page: Some((index % 9 + 1) as u32),
        annotation_id: None,
        locator_kind: None,
        locator_object_id: None,
        location_label: None,
        score: [60, 70, 75, 80, 90, 100][index % 6],
        extraction_failed: false,
    }
}

#[test]
fn v118_ranking_collector_retains_only_200_payloads_and_matches_full_sort() {
    let mut expected = (0..20_000).map(ranked_fixture).collect::<Vec<_>>();
    let mut collector = SearchResultCollector::new();
    for candidate in expected.iter().rev() {
        collector.push(candidate.clone());
        assert!(collector.heap.len() <= MAX_SEARCH_RESULTS);
        assert_eq!(collector.heap.capacity(), MAX_SEARCH_RESULTS);
    }
    expected.sort_by(compare_search_results);
    expected.truncate(MAX_SEARCH_RESULTS);
    assert_eq!(
        serde_json::to_value(collector.into_results()).unwrap(),
        serde_json::to_value(expected).unwrap()
    );
}

#[test]
fn v118_ranking_local_top_k_and_cross_library_merge_share_one_order() {
    let candidates = (0..1050).map(ranked_fixture).collect::<Vec<_>>();
    let mut expected = candidates.clone();
    sort_search_results(&mut expected);
    let mut merged = Vec::new();
    for library in (0..3).rev() {
        let mut local = SearchResultCollector::new();
        local.extend(
            candidates
                .iter()
                .enumerate()
                .filter(|(index, _)| index % 3 == library)
                .map(|(_, result)| result.clone()),
        );
        merged.extend(local.into_results());
    }
    sort_search_results(&mut merged);
    assert_eq!(
        serde_json::to_value(merged).unwrap(),
        serde_json::to_value(expected).unwrap()
    );
}

#[test]
fn v118_ranking_exact_identity_preserves_case_locations_and_context() {
    let base = ranked_fixture(0);
    let mut variants = vec![base.clone()];
    for field in 0..8 {
        let mut changed = base.clone();
        match field {
            0 => changed.path = base.path.to_uppercase(),
            1 => changed.annotation_id = Some("annotation-1".into()),
            2 => changed.locator_kind = Some("docx-block".into()),
            3 => changed.locator_object_id = Some("block-1".into()),
            4 => changed.location_label = Some("段落 1".into()),
            5 => changed.context = "另一段预算".into(),
            6 => changed.extraction_failed = true,
            _ => changed.match_kind = "annotation".into(),
        }
        variants.push(changed);
    }
    let mut reversed = variants.iter().rev().cloned().collect::<Vec<_>>();
    sort_search_results(&mut variants);
    sort_search_results(&mut reversed);
    assert_eq!(variants.len(), 9);
    assert_eq!(
        serde_json::to_value(reversed).unwrap(),
        serde_json::to_value(variants).unwrap()
    );
}
