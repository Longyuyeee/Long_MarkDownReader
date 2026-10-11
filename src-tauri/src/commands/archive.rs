//! Read-only structural checks. This receipt is NOT permission to move files.
use crate::commands::files::validate_item_name;
use crate::services::archive_history::{self, ArchiveHistoryPlan};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveItem {
    source_path: String,
    target_name: String,
    // Required, never default to false when the caller omitted the draft check.
    has_unsaved_changes: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveIssue {
    code: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveItemCheck {
    source_path: String,
    target_path: Option<String>,
    issues: Vec<ArchiveIssue>,
    history: Option<ArchiveHistoryPlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePreflight {
    items: Vec<ArchiveItemCheck>,
    structural_checks_passed: bool,
    can_execute: bool,
    pending_checks: Vec<&'static str>,
}

fn issue(code: &'static str, message: impl Into<String>) -> ArchiveIssue {
    ArchiveIssue {
        code,
        message: message.into(),
    }
}

fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}

fn check(
    root: &str,
    target_dir: &str,
    items: Vec<ArchiveItem>,
) -> Result<ArchivePreflight, String> {
    if items.is_empty() || items.len() > 500 {
        return Err("每次归档请选择 1 至 500 个文件".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let target = guard.resolve_directory(target_dir, false)?;
    let mut sources: HashMap<String, Vec<usize>> = HashMap::new();
    let mut targets: HashMap<String, Vec<usize>> = HashMap::new();
    let mut results = Vec::with_capacity(items.len());
    for (index, item) in items.into_iter().enumerate() {
        let mut result = ArchiveItemCheck {
            source_path: item.source_path.clone(),
            target_path: None,
            issues: vec![],
            history: None,
        };
        if item.has_unsaved_changes {
            result.issues.push(issue(
                "unsaved_changes",
                "请先自行保存或取消此文件的未保存修改",
            ));
        }
        let source = guard
            .resolve_existing(&item.source_path)
            .and_then(|source| {
                let original = PathBuf::from(&item.source_path);
                let original = if original.is_absolute() {
                    original
                } else {
                    guard.root().join(original)
                };
                let metadata = std::fs::symlink_metadata(original).map_err(|e| e.to_string())?;
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err("首批归档只支持普通文件，不支持目录或符号链接".into());
                }
                Ok(source)
            });
        if let Ok(source) = &source {
            sources.entry(path_key(source)).or_default().push(index);
        } else if let Err(error) = &source {
            result.issues.push(issue("invalid_source", error.clone()));
        }
        match validate_item_name(&item.target_name) {
            Err(error) => result.issues.push(issue("invalid_name", error)),
            Ok(()) => {
                let destination = target.join(&item.target_name);
                result.target_path = Some(destination.to_string_lossy().into_owned());
                targets
                    .entry(path_key(&destination))
                    .or_default()
                    .push(index);
                // symlink_metadata also detects a dangling link: it must not be overwritten.
                match std::fs::symlink_metadata(&destination) {
                    Ok(_) => result
                        .issues
                        .push(issue("target_exists", "目标已存在同名项，不会覆盖")),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => result
                        .issues
                        .push(issue("target_unreadable", e.to_string())),
                }
                if let Ok(source) = &source {
                    if path_key(source) == path_key(&destination) {
                        result
                            .issues
                            .push(issue("same_path", "来源与目标相同，无需归档"));
                    }
                    let extension = |p: &Path| {
                        p.extension()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_lowercase()
                    };
                    if extension(source) != extension(&destination) {
                        result
                            .issues
                            .push(issue("extension_changed", "归档不能更改文件格式扩展名"));
                    }
                }
            }
        }
        results.push(result);
    }
    for (groups, code, message) in [
        (sources, "duplicate_source", "同一来源在本次归档中重复出现"),
        (targets, "duplicate_target", "多个文件使用了同一个目标名称"),
    ] {
        for indices in groups.values().filter(|indices| indices.len() > 1) {
            for &index in indices {
                results[index].issues.push(issue(code, message));
            }
        }
    }
    Ok(ArchivePreflight {
        structural_checks_passed: results.iter().all(|item| item.issues.is_empty()),
        items: results,
        can_execute: false,
        pending_checks: vec![
            "links_and_attachments",
            "history_and_identity",
            "execution_time_revalidation",
        ],
    })
}

#[tauri::command]
pub async fn preflight_archive(
    app_handle: tauri::AppHandle,
    library_root: String,
    target_dir: String,
    items: Vec<ArchiveItem>,
) -> Result<ArchivePreflight, String> {
    let mut result = check(&library_root, &target_dir, items)?;
    let cache = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("history_v2");
    inspect_histories(&library_root, &cache, &mut result)?;
    Ok(result)
}

fn inspect_histories(
    root: &str,
    cache: &Path,
    result: &mut ArchivePreflight,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(root)?;
    for item in &mut result.items {
        if !item.issues.is_empty() {
            continue;
        }
        let plan = (|| {
            let source = guard.resolve_existing(&item.source_path)?;
            let target =
                guard.resolve_for_write(item.target_path.as_ref().ok_or("缺少目标路径")?)?;
            archive_history::inspect(cache, &source, &target)
        })();
        match plan {
            Ok(plan) => item.history = Some(plan),
            Err(error) => item.issues.push(issue("history_conflict", error)),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "longedit-archive-test-{}-{nonce}-{}",
                std::process::id(),
                SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            fs::create_dir(path.join("project")).unwrap();
            fs::write(path.join("note.md"), "原始正文").unwrap();
            Self(path)
        }
        fn check(&self, items: Vec<ArchiveItem>) -> ArchivePreflight {
            check(self.0.to_str().unwrap(), "project", items).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn item(source: &str, name: &str) -> ArchiveItem {
        ArchiveItem {
            source_path: source.into(),
            target_name: name.into(),
            has_unsaved_changes: false,
        }
    }
    fn has(result: &ArchivePreflight, index: usize, code: &str) -> bool {
        result.items[index]
            .issues
            .iter()
            .any(|issue| issue.code == code)
    }
    #[test]
    fn valid_paths_are_read_only_and_not_execution_permission() {
        let f = Fixture::new();
        let result = f.check(vec![item("note.md", "会议.md")]);
        assert!(result.structural_checks_passed);
        assert!(!result.can_execute);
        assert_eq!(result.pending_checks.len(), 3);
        assert_eq!(fs::read_to_string(f.0.join("note.md")).unwrap(), "原始正文");
        assert_eq!(fs::read_dir(f.0.join("project")).unwrap().count(), 0);
    }
    #[test]
    fn reports_every_conflict_without_short_circuiting() {
        let f = Fixture::new();
        fs::write(f.0.join("project/occupied.md"), "保留目标").unwrap();
        let mut dirty = item("note.md", "occupied.md");
        dirty.has_unsaved_changes = true;
        let r = f.check(vec![
            dirty,
            item("missing.md", "new.md"),
            item("project", "folder"),
        ]);
        assert!(has(&r, 0, "unsaved_changes") && has(&r, 0, "target_exists"));
        assert!(has(&r, 1, "invalid_source") && has(&r, 2, "invalid_source"));
        assert_eq!(
            fs::read_to_string(f.0.join("project/occupied.md")).unwrap(),
            "保留目标"
        );
    }
    #[test]
    fn marks_all_duplicate_sources_and_targets() {
        let f = Fixture::new();
        let r = f.check(vec![item("note.md", "same.md"), item("note.md", "same.md")]);
        for i in 0..2 {
            assert!(has(&r, i, "duplicate_source") && has(&r, i, "duplicate_target"));
        }
    }
    #[test]
    fn rejects_invalid_names_and_extension_changes() {
        let f = Fixture::new();
        for name in ["../escape.md", "CON.md", "note.md.", " a.md", "a:b.md", ""] {
            assert!(has(
                &f.check(vec![item("note.md", name)]),
                0,
                "invalid_name"
            ));
        }
        assert!(has(
            &f.check(vec![item("note.md", "note.pdf")]),
            0,
            "extension_changed"
        ));
    }
    #[test]
    fn rejects_outside_paths_and_invalid_batch() {
        let f = Fixture::new();
        let outside = Fixture::new();
        let root = f.0.to_str().unwrap();
        assert!(check(
            root,
            outside.0.to_str().unwrap(),
            vec![item("note.md", "n.md")]
        )
        .is_err());
        assert!(has(
            &f.check(vec![item("../note.md", "n.md")]),
            0,
            "invalid_source"
        ));
        assert!(has(
            &f.check(vec![item(
                outside.0.join("note.md").to_str().unwrap(),
                "n.md"
            )]),
            0,
            "invalid_source"
        ));
        assert!(check(root, "project", vec![]).is_err());
        assert!(check(root, "missing", vec![item("note.md", "n.md")]).is_err());
        assert!(check(
            root,
            "project",
            (0..501).map(|_| item("note.md", "n.md")).collect()
        )
        .is_err());
    }
    #[test]
    fn caller_must_explicitly_supply_draft_state() {
        assert!(serde_json::from_str::<ArchiveItem>(
            r#"{"sourcePath":"note.md","targetName":"n.md"}"#
        )
        .is_err());
    }
    #[test]
    fn history_inventory_uses_the_same_canonical_identity_as_saving() {
        let f = Fixture::new();
        let cache = f.0.join("history-cache");
        let source = f.0.join("note.md").canonicalize().unwrap();
        let old = archive_history::history_path(&cache, &source);
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("1.md"), "past").unwrap();
        let mut r = f.check(vec![item("note.md", "new.md")]);
        inspect_histories(f.0.to_str().unwrap(), &cache, &mut r).unwrap();
        let value = serde_json::to_value(&r).unwrap();
        assert_eq!(value["items"][0]["history"]["snapshots"][0]["name"], "1.md");
        assert_eq!(
            value["items"][0]["history"]["strategy"],
            "copy_verify_then_retire_source"
        );
        assert!(!r.can_execute);
        assert_eq!(fs::read_to_string(old.join("1.md")).unwrap(), "past");
    }
    #[test]
    fn history_failure_is_per_item_and_does_not_hide_other_results() {
        let f = Fixture::new();
        fs::write(f.0.join("other.md"), "other").unwrap();
        let cache = f.0.join("history-cache");
        let target = f.0.join("project").canonicalize().unwrap().join("new.md");
        fs::create_dir_all(archive_history::history_path(&cache, &target)).unwrap();
        let mut r = f.check(vec![
            item("note.md", "new.md"),
            item("other.md", "other.md"),
        ]);
        inspect_histories(f.0.to_str().unwrap(), &cache, &mut r).unwrap();
        assert!(has(&r, 0, "history_conflict"));
        assert!(r.items[0].history.is_none());
        assert!(r.items[1].history.is_some());
        assert!(r.structural_checks_passed); // This field describes paths, not history or execution readiness.
        assert!(!r.can_execute);
    }
    #[cfg(windows)]
    #[test]
    fn windows_target_names_are_compared_without_case() {
        let f = Fixture::new();
        fs::write(f.0.join("other.md"), "other").unwrap();
        let r = f.check(vec![
            item("note.md", "Note.md"),
            item("other.md", "NOTE.md"),
        ]);
        assert!(has(&r, 0, "duplicate_target") && has(&r, 1, "duplicate_target"));
    }
    #[test]
    fn receipt_uses_frontend_camel_case_contract() {
        let f = Fixture::new();
        let r = serde_json::to_value(f.check(vec![item("note.md", "new.md")])).unwrap();
        assert_eq!(r["canExecute"], false);
        assert_eq!(r["structuralChecksPassed"], true);
        assert_eq!(r["items"][0]["sourcePath"], "note.md");
        assert!(r["items"][0]["targetPath"].is_string());
        assert_eq!(r["pendingChecks"].as_array().unwrap().len(), 3);
    }
    #[test]
    fn same_path_and_new_conflict_are_rechecked() {
        let f = Fixture::new();
        let r = check(f.0.to_str().unwrap(), ".", vec![item("note.md", "note.md")]).unwrap();
        assert!(has(&r, 0, "same_path"));
        assert!(
            f.check(vec![item("note.md", "new.md")])
                .structural_checks_passed
        );
        fs::write(f.0.join("project/new.md"), "new arrival").unwrap();
        assert!(has(
            &f.check(vec![item("note.md", "new.md")]),
            0,
            "target_exists"
        ));
    }
}
