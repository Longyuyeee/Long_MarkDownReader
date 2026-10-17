use crate::commands::config::get_config;
#[cfg(test)]
use crate::services::inline_tags::TAGS as RE_TAG;
use crate::FileEntry;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn search_library(
    library_root: String,
    query: String,
    names_only: Option<bool>,
) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    let root = Path::new(&library_root);
    if root.exists() {
        search_recursive(root, &query, &mut results, names_only.unwrap_or(false));
    }
    Ok(results)
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<FileEntry>, names_only: bool) {
    search_recursive_impl(dir, query, results, &mut HashSet::new(), names_only)
}

fn search_recursive_impl(
    dir: &Path,
    query: &str,
    results: &mut Vec<FileEntry>,
    visited: &mut HashSet<PathBuf>,
    names_only: bool,
) {
    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let query_lower = query.to_lowercase();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            search_recursive_impl(&path, query, results, visited, names_only);
        } else if is_searchable_file(&name) {
            let lower_name = name.to_lowercase();
            let name_matches = lower_name.contains(&query_lower);
            let content_matches = !names_only
                && !name_matches
                && !lower_name.ends_with(".pdf")
                && !lower_name.ends_with(".xlsx")
                && path
                    .metadata()
                    .map(|metadata| metadata.len() <= 20 * 1024 * 1024)
                    .unwrap_or(false)
                && fs::read_to_string(&path)
                    .map(|content| content.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);
            if name_matches || content_matches {
                results.push(FileEntry {
                    name: name.into_owned(),
                    path: path.to_string_lossy().into_owned(),
                    is_dir: false,
                });
            }
        }
    }
}

fn is_searchable_file(name: &str) -> bool {
    let name = name.to_lowercase();
    [
        ".md",
        ".canvas",
        ".mmd",
        ".mermaid",
        ".pdf",
        ".csv",
        ".tsv",
        ".xlsx",
        ".table.json",
    ]
    .iter()
    .any(|extension| name.ends_with(extension))
}

#[tauri::command]
pub async fn search_all_libraries(
    app_handle: tauri::AppHandle,
    query: String,
) -> Result<Vec<FileEntry>, String> {
    let config = get_config(app_handle);
    let mut results = Vec::new();
    for library in &config.libraries {
        let root = Path::new(&library.path);
        if root.exists() {
            search_recursive(root, &query, &mut results, false);
        }
    }
    Ok(results)
}

#[derive(Serialize)]
pub struct TagEntry {
    tag: String,
    count: usize,
}

#[tauri::command]
pub async fn get_all_tags(library_root: String) -> Result<Vec<TagEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || tags_in_library(Path::new(&library_root)))
        .await
        .map_err(|error| error.to_string())?
}

fn tags_in_library(root: &Path) -> Result<Vec<TagEntry>, String> {
    fs::read_dir(root).map_err(|_| "资料库不存在或无法读取，请检查路径后重试".to_string())?;
    super::index::search_pages::collections::legacy_tag_catalog(root).map(|entries| {
        entries
            .into_iter()
            .map(|entry| TagEntry {
                tag: entry.tag,
                count: entry.count,
            })
            .collect()
    })
}

#[tauri::command]
pub async fn search_by_tag(library_root: String, tag: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_tags_in_library(Path::new(&library_root), &tag)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn search_tags_in_library(root: &Path, tag: &str) -> Result<Vec<FileEntry>, String> {
    // An unavailable library is a failed search, not a successful empty result.
    fs::read_dir(root).map_err(|_| "资料库不存在或无法读取，请检查路径后重试".to_string())?;
    super::index::search_pages::collections::legacy_tag_files(root, tag)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_catalog_matches_results_for_every_existing_tag_delimiter() {
        let fixture = crate::services::test_workspace::TestWorkspace::new();
        fs::write(
            fixture.0.join("punctuation.md"),
            "正文 #项目`代码 #项目#后缀",
        )
        .unwrap();
        let entries = tags_in_library(&fixture.0).unwrap();
        assert_eq!(
            entries
                .iter()
                .find(|entry| entry.tag == "项目")
                .unwrap()
                .count,
            1
        );
        assert_eq!(
            search_tags_in_library(&fixture.0, "项目").unwrap().len(),
            1,
            "a counted file must be reachable through that exact tag"
        );
    }

    #[test]
    fn tag_search_rejects_missing_or_non_directory_root() {
        let root = std::env::temp_dir().join(format!(
            "longedit-tag-search-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(search_tags_in_library(&root, "验收").is_err());
        fs::write(&root, "synthetic").unwrap();
        assert!(search_tags_in_library(&root, "验收").is_err());
        fs::remove_file(&root).unwrap();
    }

    #[test]
    fn tag_search_distinguishes_readable_empty_library_and_match() {
        let root = std::env::temp_dir().join(format!(
            "longedit-tag-search-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        assert!(search_tags_in_library(&root, "验收").unwrap().is_empty());
        let note = root.join("synthetic.md");
        fs::write(&note, "合成资料 #验收").unwrap();
        assert_eq!(search_tags_in_library(&root, "验收").unwrap().len(), 1);
        assert!(search_tags_in_library(&root, "没有匹配")
            .unwrap()
            .is_empty());
        fs::remove_file(note).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn searchable_extensions_are_case_insensitive_and_bounded() {
        assert!(is_searchable_file("Notes.MD"));
        assert!(is_searchable_file("data.table.json"));
        assert!(is_searchable_file("diagram.MERMAID"));
        assert!(!is_searchable_file("archive.zip"));
        assert!(!is_searchable_file("notes.md.exe"));
    }

    #[test]
    fn markdown_tags_stop_before_sentence_punctuation() {
        let content = "Uses #product. 中文 #项目，and #release-v1!";
        let tags: Vec<&str> = RE_TAG
            .captures_iter(content)
            .map(|capture| capture.get(1).unwrap().as_str())
            .collect();
        assert_eq!(tags, vec!["product", "项目", "release-v1"]);
    }

    #[test]
    fn tag_overview_counts_notes_and_includes_uppercase_markdown() {
        let root = std::env::temp_dir().join(format!(
            "longedit-tag-overview-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("first.md"), "# 项目\n\n#项目 #项目。 #工作").unwrap();
        fs::write(root.join("second.MD"), "资料 #项目 #工作 #工作").unwrap();
        fs::write(root.join("ignored.txt"), "#项目").unwrap();
        fs::write(root.join(".hidden.md"), "#项目").unwrap();
        let entries = tags_in_library(&root).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|entry| entry.count == 2));
        assert_eq!(search_tags_in_library(&root, "项目").unwrap().len(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn tag_overview_distinguishes_empty_and_unavailable_library() {
        let root = std::env::temp_dir().join(format!(
            "longedit-tag-empty-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(tags_in_library(&root).is_err());
        fs::write(&root, "a file is not a library").unwrap();
        assert!(tags_in_library(&root).is_err());
        fs::remove_file(&root).unwrap();
        fs::create_dir(&root).unwrap();
        assert!(tags_in_library(&root).unwrap().is_empty());
        fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn link_lookup_can_skip_content_without_changing_regular_search() {
        let root = std::env::temp_dir().join(format!(
            "longedit-link-names-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested/目标.md"), "a note").unwrap();
        fs::write(root.join("其他.md"), "正文中提到了目标").unwrap();
        let mut named = Vec::new();
        search_recursive(&root, "目标", &mut named, true);
        assert_eq!(named.len(), 1);
        assert_eq!(named[0].name, "目标.md");
        let mut regular = Vec::new();
        search_recursive(&root, "目标", &mut regular, false);
        assert_eq!(regular.len(), 2);
        fs::remove_dir_all(root).unwrap();
    }
}
