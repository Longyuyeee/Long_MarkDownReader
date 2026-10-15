//! Dynamic collections filter live candidates before applying the display limit.
use crate::commands::index::{search_segments, KnowledgeSearchResult};
use crate::formats::file_registry::{file_format_by_id, file_format_for_path, is_sensitive_path};
use crate::services::knowledge_index::{build_search_segments_for_source, IndexedSource};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CollectionFilters {
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub modified_within_days: Option<u32>,
}

impl CollectionFilters {
    pub fn validate(&self) -> Result<(), String> {
        let directory = self.directory.replace('\\', "/");
        if directory.len() > 4096
            || directory.starts_with('/')
            || directory.contains(':')
            || directory.split('/').any(|part| part == ".." || part == ".")
        {
            return Err("目录必须是资料库内的相对目录，不能包含 ..".into());
        }
        let tags: Vec<_> = std::iter::once(&self.tag)
            .chain(&self.tags)
            .filter(|tag| !tag.is_empty())
            .collect();
        if tags.len() > 8
            || tags.iter().any(|tag| {
                tag.chars().count() > 80 || tag.chars().any(|c| c.is_whitespace() || c == '#')
            })
        {
            return Err("标签请填写单个标签名，不含 # 或空格".into());
        }
        if self
            .modified_within_days
            .is_some_and(|days| !(1..=3650).contains(&days))
        {
            return Err("修改时间范围必须是 1 至 3650 天".into());
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionResults {
    pub results: Vec<KnowledgeSearchResult>,
    pub truncated: bool,
}

fn candidates(directory: &Path, paths: &mut Vec<std::path::PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|e| format!("无法读取筛选目录：{e}"))? {
        let entry = entry.map_err(|e| format!("无法读取目录项：{e}"))?;
        let path = entry.path();
        let kind = entry
            .file_type()
            .map_err(|e| format!("无法读取文件类型：{e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if kind.is_symlink()
            || name.starts_with('.')
            || name.ends_with(".assets")
            || is_sensitive_path(&path)
        {
            continue;
        }
        if kind.is_dir() {
            candidates(&path, paths)?;
        } else if kind.is_file()
            && !name.ends_with(".annotations.json")
            && !name.ends_with(".ocr.json")
        {
            paths.push(path);
        }
    }
    Ok(())
}

pub fn search(
    root: &str,
    query: &str,
    object_types: &[String],
    filters: &CollectionFilters,
) -> Result<CollectionResults, String> {
    filters.validate()?;
    if query.chars().count() > 500 || object_types.len() > 8 {
        return Err("搜索条件过长".into());
    }
    let mut types = HashSet::new();
    for id in object_types {
        if !file_format_by_id(id)?.capabilities.index.is_supported() || !types.insert(id) {
            return Err("格式筛选无效或重复".into());
        }
    }
    let guard = WorkspaceGuard::new(root)?;
    let directory = if filters.directory.is_empty() {
        guard.root().to_path_buf()
    } else {
        guard.resolve_directory(filters.directory.replace('\\', "/"), false)?
    };
    let tags = std::iter::once(&filters.tag)
        .chain(&filters.tags)
        .filter(|tag| !tag.is_empty())
        .map(|tag| {
            regex::Regex::new(&format!(
                r#"(?:^|\s)#{}(?:$|\s|[.,;:!?，。；：！？、\[\](){{}}\"'<>])"#,
                regex::escape(tag)
            ))
            .map_err(|e| format!("标签条件无效：{e}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let cutoff = filters.modified_within_days.map(|days| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_sub(u64::from(days) * 86400)
    });
    let mut paths = Vec::new();
    candidates(&directory, &mut paths)?;
    paths.sort();
    let query = query.trim().to_lowercase();
    crate::services::search_query::SearchQuery::parse(&query)?;
    let mut results = Vec::new();
    for path in paths {
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        if !format.capabilities.index.is_supported()
            || (!types.is_empty() && !types.contains(&format.id))
        {
            continue;
        }
        let path = guard.resolve_existing_file(&path, &[])?;
        let metadata = fs::metadata(&path).map_err(|e| format!("无法读取文件信息：{e}"))?;
        let modified = metadata
            .modified()
            .map_err(|e| format!("无法读取修改时间：{e}"))?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        if cutoff.is_some_and(|cutoff| modified.as_secs() < cutoff) {
            continue;
        }
        if !tags.is_empty() {
            if format.id != "markdown" {
                continue;
            }
            if metadata.len() > 20 * 1024 * 1024 {
                return Err("标签筛选遇到超过 20 MiB 的笔记，请缩小目录范围".into());
            }
            let content =
                fs::read_to_string(&path).map_err(|e| format!("无法读取标签内容：{e}"))?;
            if !tags.iter().all(|tag| tag.is_match(&content)) {
                continue;
            }
        }
        if query.is_empty() {
            results.push(KnowledgeSearchResult {
                title: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                path: path.to_string_lossy().into_owned(),
                object_type: format.id.clone(),
                match_kind: "title".into(),
                context: "符合集合条件".into(),
                page: None,
                annotation_id: None,
                locator_kind: None,
                locator_object_id: None,
                location_label: None,
                score: 100,
                extraction_failed: false,
            });
        } else {
            let source = IndexedSource {
                path: path
                    .strip_prefix(guard.root())
                    .map_err(|_| "文件不在资料库内")?
                    .to_string_lossy()
                    .replace('\\', "/"),
                size: metadata.len(),
                modified_nanos: modified.as_nanos().min(u64::MAX as u128) as u64,
            };
            results.extend(search_segments(
                &build_search_segments_for_source(guard.root(), &source),
                &query,
            ));
        }
        if results.len() > 200 {
            break;
        }
    }
    let truncated = results.len() > 200;
    results.truncate(200);
    Ok(CollectionResults { results, truncated })
}

#[tauri::command]
pub async fn search_smart_collection(
    library_root: String,
    query: String,
    object_types: Vec<String>,
    filters: CollectionFilters,
) -> Result<CollectionResults, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search(&library_root, &query, &object_types, &filters)
    })
    .await
    .map_err(|e| format!("集合搜索任务失败：{e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiple_tags_require_all_and_old_single_tag_still_works() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("both.md"), "#项目 #工作").unwrap();
        fs::write(fixture.0.join("one.md"), "#项目 #生活").unwrap();
        let mut filters = CollectionFilters {
            tag: "项目".into(),
            tags: vec!["工作".into()],
            ..Default::default()
        };
        let result = search(fixture.root(), "", &[], &filters).unwrap();
        assert_eq!(result.results.len(), 1);
        assert!(result.results[0].path.ends_with("both.md"));
        filters.tags.clear();
        assert_eq!(
            search(fixture.root(), "", &[], &filters)
                .unwrap()
                .results
                .len(),
            2
        );
    }
    struct Fixture(std::path::PathBuf);
    static FIXTURE_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    impl Fixture {
        fn new() -> Self {
            Self::with_timestamp(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
            )
        }
        fn with_timestamp(timestamp: u128) -> Self {
            let path = std::env::temp_dir().join(format!(
                "longedit-collection-{}-{}-{}",
                std::process::id(),
                timestamp,
                FIXTURE_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            // Exclusive ownership: never merge with another test's directory.
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn root(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn same_timestamp_fixtures_have_independent_content_and_lifetimes() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let first = Fixture::with_timestamp(timestamp);
        fs::write(
            first.0.join("first-only.md"),
            "belongs to the first fixture",
        )
        .unwrap();
        let second = Fixture::with_timestamp(timestamp);
        assert_ne!(
            first.0, second.0,
            "parallel fixtures must not silently share a directory"
        );
        assert!(!second.0.join("first-only.md").exists());
        drop(second);
        assert!(
            first.0.join("first-only.md").exists(),
            "dropping one fixture must not delete another fixture's data"
        );
    }
    #[test]
    fn filters_apply_before_cap_and_reflect_live_changes() {
        let fixture = Fixture::new();
        for i in 0..205 {
            fs::write(fixture.0.join(format!("a{i}.md")), "budget #other").unwrap();
        }
        fs::create_dir(fixture.0.join("project")).unwrap();
        fs::write(fixture.0.join("project/target.md"), "budget #项目").unwrap();
        let filters = CollectionFilters {
            tag: "项目".into(),
            modified_within_days: Some(7),
            ..Default::default()
        };
        let result = search(fixture.root(), "budget", &["markdown".into()], &filters).unwrap();
        assert_eq!(result.results.len(), 1);
        assert!(!result.truncated);
        assert!(result.results[0].path.ends_with("target.md"));
        fs::rename(
            fixture.0.join("project/target.md"),
            fixture.0.join("project/renamed.md"),
        )
        .unwrap();
        fs::write(fixture.0.join("project/new.md"), "#项目").unwrap();
        assert_eq!(
            search(fixture.root(), "", &[], &filters)
                .unwrap()
                .results
                .len(),
            2
        );
        fs::remove_file(fixture.0.join("project/renamed.md")).unwrap();
        assert_eq!(
            search(fixture.root(), "", &[], &filters)
                .unwrap()
                .results
                .len(),
            1
        );
        assert_eq!(
            fs::read_dir(&fixture.0)
                .unwrap()
                .filter(|entry| entry.as_ref().unwrap().file_type().unwrap().is_file())
                .count(),
            205,
            "all original root notes must still belong to this fixture"
        );
        assert!(fixture.0.join("project/new.md").is_file());
        let all = search(fixture.root(), "", &[], &CollectionFilters::default()).unwrap();
        assert_eq!(all.results.len(), 200);
        assert!(all.truncated);
    }
    #[test]
    fn directory_tag_time_and_invalid_conditions_are_explicit() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("project")).unwrap();
        fs::create_dir(fixture.0.join("project-extra")).unwrap();
        fs::write(fixture.0.join("project/a.md"), "#项目扩展").unwrap();
        fs::write(fixture.0.join("project/b.md"), "#项目，正文").unwrap();
        fs::write(fixture.0.join("project-extra/c.md"), "#项目").unwrap();
        let mut filters = CollectionFilters {
            directory: "project".into(),
            tag: "项目".into(),
            ..Default::default()
        };
        assert_eq!(
            search(fixture.root(), "", &[], &filters)
                .unwrap()
                .results
                .len(),
            1
        );
        let file = fs::OpenOptions::new()
            .write(true)
            .open(fixture.0.join("project/b.md"))
            .unwrap();
        file.set_times(
            fs::FileTimes::new().set_modified(UNIX_EPOCH + std::time::Duration::from_secs(1)),
        )
        .unwrap();
        filters.modified_within_days = Some(7);
        assert!(search(fixture.root(), "", &[], &filters)
            .unwrap()
            .results
            .is_empty());
        for directory in ["../outside", "C:/outside", "/outside", "missing"] {
            filters.directory = directory.into();
            assert!(search(fixture.root(), "", &[], &filters).is_err());
        }
        assert!(search(
            fixture.root(),
            "",
            &["unknown".into()],
            &CollectionFilters::default()
        )
        .is_err());
    }
}
