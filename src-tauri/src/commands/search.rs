use crate::commands::config::get_config;
use crate::FileEntry;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static RE_TAG: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?:^|\s)#([^\s#`\[\](){}.,;:!?，。；：！？、\"'<>]+)"#).unwrap()
});

#[tauri::command]
pub async fn search_library(library_root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    let root = Path::new(&library_root);
    if root.exists() {
        search_recursive(root, &query, &mut results);
    }
    Ok(results)
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<FileEntry>) {
    search_recursive_impl(dir, query, results, &mut HashSet::new())
}

fn search_recursive_impl(
    dir: &Path,
    query: &str,
    results: &mut Vec<FileEntry>,
    visited: &mut HashSet<PathBuf>,
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
            search_recursive_impl(&path, query, results, visited);
        } else if is_searchable_file(&name) {
            let lower_name = name.to_lowercase();
            let name_matches = lower_name.contains(&query_lower);
            let content_matches = !name_matches
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
            search_recursive(root, &query, &mut results);
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
    let mut tag_counts = HashMap::new();
    let root = Path::new(&library_root);
    if root.exists() {
        collect_tags(root, &mut tag_counts);
    }
    let mut entries: Vec<TagEntry> = tag_counts
        .into_iter()
        .map(|(tag, count)| TagEntry { tag, count })
        .collect();
    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.tag.cmp(&right.tag))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn search_by_tag(library_root: String, tag: String) -> Result<Vec<FileEntry>, String> {
    search_tags_in_library(Path::new(&library_root), &tag)
}

fn search_tags_in_library(root: &Path, tag: &str) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    // An unavailable library is a failed search, not a successful empty result.
    fs::read_dir(root).map_err(|_| "资料库不存在或无法读取，请检查路径后重试".to_string())?;
    search_tag_recursive(root, tag, &mut results);
    Ok(results)
}

fn collect_tags(dir: &Path, tag_counts: &mut HashMap<String, usize>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            collect_tags(&path, tag_counts);
        } else if name.ends_with(".md") {
            if let Ok(content) = fs::read_to_string(path) {
                for capture in RE_TAG.captures_iter(&content) {
                    let tag = capture[1].to_string();
                    if !tag.is_empty() && !tag.starts_with('#') {
                        *tag_counts.entry(tag).or_insert(0) += 1;
                    }
                }
            }
        }
    }
}

fn search_tag_recursive(dir: &Path, tag: &str, results: &mut Vec<FileEntry>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let pattern = format!(
        r#"(?:^|\s)#{}(?:$|\s|[.,;:!?，。；：！？、\[\](){{}}\"'<>])"#,
        regex::escape(tag)
    );
    let Ok(tag_regex) = regex::Regex::new(&pattern) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            search_tag_recursive(&path, tag, results);
        } else if name.ends_with(".md")
            && fs::read_to_string(&path)
                .map(|content| tag_regex.is_match(&content))
                .unwrap_or(false)
        {
            results.push(FileEntry {
                name: name.into_owned(),
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
