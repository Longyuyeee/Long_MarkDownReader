//! Read-only structural checks. This receipt is NOT permission to move files.
use crate::commands::files::validate_item_name;
use crate::services::archive_dependencies::{self, DependencyReport};
use crate::services::archive_edits::{self, BatchPreview};
use crate::services::archive_history::{self, ArchiveHistoryPlan};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;
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
    dependencies: Option<DependencyReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePreflight {
    items: Vec<ArchiveItemCheck>,
    structural_checks_passed: bool,
    can_execute: bool,
    pending_checks: Vec<&'static str>,
    edit_preview: Option<BatchPreview>,
    window_draft_audit: Option<super::lifecycle::ArchiveDraftAudit>,
    window_confirmation_request_id: Option<String>,
    window_confirmation_error: Option<String>,
    plan_digest: Option<String>,
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
            dependencies: None,
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
        edit_preview: None,
        window_draft_audit: None,
        window_confirmation_request_id: None,
        window_confirmation_error: None,
        plan_digest: None,
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
    let cache = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("history_v2");
    let before = super::lifecycle::observe_archive_drafts(&app_handle)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = check(&library_root, &target_dir, items)?;
        inspect_histories(&library_root, &cache, &mut result)?;
        inspect_dependencies(&library_root, &mut result)?;
        inspect_edit_preview(&library_root, &mut result);
        let plan = if result.structural_checks_passed {
            let paths: Vec<_> = result
                .items
                .iter()
                .filter_map(|item| {
                    item.target_path
                        .as_ref()
                        .map(|target| (PathBuf::from(&item.source_path), PathBuf::from(target)))
                })
                .collect();
            match crate::services::archive_plan::ArchivePlan::capture(
                Path::new(&library_root),
                &paths,
            ) {
                Ok(plan) => {
                    result.plan_digest = Some(plan.digest()?);
                    Some(plan)
                }
                Err(error) => {
                    result.window_confirmation_error = Some(error);
                    None
                }
            }
        } else {
            None
        };
        Ok::<_, String>((result, plan))
    })
    .await
    .map_err(|e| format!("归档预检任务失败: {e}"))??;
    let (mut result, plan) = result;
    let after = super::lifecycle::observe_archive_drafts(&app_handle)?;
    let audit = super::lifecycle::audit_archive_drafts(before, after);
    if let Some(preview) = &mut result.edit_preview {
        preview
            .blockers
            .extend(audit.blockers.iter().map(|s| s.to_string()));
    }
    result.window_draft_audit = Some(audit);
    // Start a fresh diagnostic round after the slow filesystem scan. Cached
    // clean observations are not replies; the caller must query its status.
    // This never changes can_execute or grants a file-mutation lease.
    if result.window_confirmation_error.is_none() {
        match super::lifecycle::begin_archive_confirmation(app_handle, plan) {
            Ok(id) => result.window_confirmation_request_id = Some(id),
            Err(error) => result.window_confirmation_error = Some(error),
        }
    }
    Ok(result)
}

fn inspect_dependencies(root: &str, result: &mut ArchivePreflight) -> Result<(), String> {
    let guard = WorkspaceGuard::new(root)?;
    let inventory = archive_dependencies::scan(root);
    // Do not project a partially invalid batch as though every item will move.
    let planned_moves: Option<Vec<(PathBuf, PathBuf)>> = result
        .items
        .iter()
        .map(|item| {
            if !item.issues.is_empty() {
                return None;
            }
            Some((
                guard.resolve_existing(&item.source_path).ok()?,
                PathBuf::from(item.target_path.as_ref()?),
            ))
        })
        .collect();
    for item in &mut result.items {
        let source = match guard.resolve_existing(&item.source_path) {
            Ok(p) if p.is_file() => p,
            _ => continue,
        };
        match &inventory {
            Err(error) => item
                .issues
                .push(issue("dependency_scan_incomplete", error.clone())),
            Ok(inventory) => {
                let report = match &planned_moves {
                    Some(moves) => inventory.report_batch(guard.root(), &source, moves),
                    None => {
                        let mut report = inventory.report(&source);
                        report
                            .limitations
                            .push("batch_projection_unavailable_due_to_preflight_issues");
                        report
                    }
                };
                if !report.outgoing.is_empty() || !report.incoming_candidates.is_empty() {
                    item.issues.push(issue(
                        "dependency_candidates",
                        "发现本地链接或附件引用候选，需核对后才能归档",
                    ));
                }
                item.dependencies = Some(report);
            }
        }
    }
    Ok(())
}

fn inspect_edit_preview(root: &str, result: &mut ArchivePreflight) {
    let build = || -> Result<BatchPreview, String> {
        let guard = WorkspaceGuard::new(root)?;
        let reports: Vec<_> = result
            .items
            .iter()
            .map(|item| item.dependencies.as_ref())
            .collect::<Option<Vec<_>>>()
            .ok_or("missing_dependency_reports")?;
        if reports.is_empty() {
            return Err("missing_dependency_reports".into());
        }
        let count: usize = reports
            .iter()
            .map(|r| r.outgoing.len() + r.incoming_candidates.len() + r.move_impacts.len())
            .sum();
        if count > 20_000 {
            return Err("edit_preview_evidence_limit".into());
        }
        let documents: BTreeSet<_> = reports
            .iter()
            .flat_map(|r| r.outgoing.iter().chain(&r.incoming_candidates))
            .map(|e| e.document.clone())
            .collect();
        let mut remaining = 32 * 1024 * 1024;
        let mut texts = BTreeMap::new();
        let mut failures = Vec::new();
        for document in documents {
            match read_preview_source(&guard, &document, &mut remaining) {
                Ok(text) => {
                    texts.insert(document, text);
                }
                Err(error) => failures.push(format!("{document}: {error}")),
            }
        }
        let mut preview = archive_edits::batch_preview(&reports, &texts);
        preview.blockers.extend(failures);
        // A preview is never allowed to hide structural/history/draft failures.
        if result.items.iter().any(|item| !item.issues.is_empty()) {
            preview.blockers.push("preflight_has_issues".into());
        }
        let mut output_budget = 32 * 1024 * 1024usize;
        for document in &mut preview.documents {
            if let Some(content) = &document.content {
                if content.len() > output_budget {
                    document.content = None;
                    document.blockers.push("edit_preview_output_limit".into());
                } else {
                    output_budget -= content.len();
                }
            }
        }
        Ok(preview)
    };
    result.edit_preview = Some(build().unwrap_or_else(|error| BatchPreview {
        documents: vec![],
        blockers: vec![error],
        can_execute: false,
    }));
}

fn read_preview_source(
    guard: &WorkspaceGuard,
    document: &str,
    remaining: &mut usize,
) -> Result<String, String> {
    let path = Path::new(document);
    let relative = path
        .strip_prefix(guard.root())
        .map_err(|_| "preview_source_outside_library")?;
    let mut cursor = guard.root().to_owned();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return Err("preview_source_invalid_path".into());
        }
        cursor.push(part);
        if std::fs::symlink_metadata(&cursor)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("preview_source_symlink".into());
        }
    }
    if guard.resolve_existing(path)? != path {
        return Err("preview_source_identity_changed".into());
    }
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 2 * 1024 * 1024 || meta.len() > *remaining as u64 {
        return Err("preview_source_size_limit".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(meta.len() + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    *remaining = remaining.saturating_sub(bytes.len());
    if bytes.len() as u64 != meta.len() {
        return Err("preview_source_changed_during_read".into());
    }
    String::from_utf8(bytes).map_err(|_| "preview_source_invalid_utf8".into())
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
    fn archive_command_preview_reads_sources_and_serializes_without_writes() {
        let f = Fixture::new();
        fs::write(f.0.join("note.md"), "[asset](asset.png)").unwrap();
        fs::write(f.0.join("asset.png"), "asset").unwrap();
        let mut result = f.check(vec![item("note.md", "note.md")]);
        inspect_dependencies(f.0.to_str().unwrap(), &mut result).unwrap();
        inspect_edit_preview(f.0.to_str().unwrap(), &mut result);
        let preview = result.edit_preview.as_ref().unwrap();
        assert_eq!(
            preview.documents[0].content.as_deref(),
            Some("[asset](../asset.png)")
        );
        assert!(!preview.can_execute && !result.can_execute);
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["editPreview"]["canExecute"], false);
        assert_eq!(
            fs::read_to_string(f.0.join("note.md")).unwrap(),
            "[asset](asset.png)"
        );
        assert!(!f.0.join("project/note.md").exists());
    }

    #[test]
    fn archive_command_preview_blocks_missing_reports_and_changed_sources() {
        let f = Fixture::new();
        let mut result = f.check(vec![item("note.md", "note.md")]);
        inspect_edit_preview(f.0.to_str().unwrap(), &mut result);
        assert!(result
            .edit_preview
            .as_ref()
            .unwrap()
            .blockers
            .contains(&"missing_dependency_reports".into()));
        fs::write(f.0.join("note.md"), "[asset](asset.png)").unwrap();
        fs::write(f.0.join("asset.png"), "asset").unwrap();
        inspect_dependencies(f.0.to_str().unwrap(), &mut result).unwrap();
        fs::write(f.0.join("note.md"), "[asset](other.png)").unwrap();
        inspect_edit_preview(f.0.to_str().unwrap(), &mut result);
        let doc = &result.edit_preview.as_ref().unwrap().documents[0];
        assert!(doc.content.is_none());
        assert!(doc
            .blockers
            .contains(&"source_snapshot_missing_or_changed".into()));
    }

    #[test]
    fn archive_preview_reader_rejects_budget_encoding_and_outside_sources() {
        let f = Fixture::new();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        let path = guard.root().join("note.md");
        assert!(read_preview_source(&guard, path.to_str().unwrap(), &mut 1).is_err());
        fs::write(&path, [0xff]).unwrap();
        assert!(read_preview_source(&guard, path.to_str().unwrap(), &mut 100).is_err());
        assert!(read_preview_source(
            &guard,
            guard
                .root()
                .parent()
                .unwrap()
                .join("outside.md")
                .to_str()
                .unwrap(),
            &mut 100
        )
        .is_err());
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
    fn dependency_inventory_reads_nested_files_and_preserves_content() {
        let f = Fixture::new();
        fs::write(f.0.join("note.md"), "![图](assets/photo.png)").unwrap();
        fs::write(
            f.0.join("project/ref.md"),
            "[记录](../note.md)\n[[note|会议]]",
        )
        .unwrap();
        let mut r = f.check(vec![item("note.md", "new.md")]);
        inspect_dependencies(f.0.to_str().unwrap(), &mut r).unwrap();
        let report = r.items[0].dependencies.as_ref().unwrap();
        assert_eq!(report.outgoing.len(), 1);
        assert_eq!(report.incoming_candidates.len(), 2);
        assert!(!report.complete);
        assert!(has(&r, 0, "dependency_candidates"));
        assert_eq!(
            fs::read_to_string(f.0.join("note.md")).unwrap(),
            "![图](assets/photo.png)"
        );
        assert!(!f.0.join("project/new.md").exists());
    }
    #[test]
    fn invalid_encoding_and_oversized_scan_are_not_clean_receipts() {
        let f = Fixture::new();
        fs::write(f.0.join("project/bad.md"), [0xff, 0xfe]).unwrap();
        let mut r = f.check(vec![item("note.md", "new.md")]);
        inspect_dependencies(f.0.to_str().unwrap(), &mut r).unwrap();
        assert!(has(&r, 0, "dependency_scan_incomplete"));
        assert!(r.items[0].dependencies.is_none());
        let file = fs::File::create(f.0.join("project/bad.md")).unwrap();
        file.set_len(2 * 1024 * 1024 + 1).unwrap();
        assert!(archive_dependencies::scan(f.0.to_str().unwrap()).is_err());
    }
    #[test]
    fn no_candidates_never_means_complete_dependency_safety() {
        let f = Fixture::new();
        let mut r = f.check(vec![item("note.md", "new.md")]);
        inspect_dependencies(f.0.to_str().unwrap(), &mut r).unwrap();
        let report = r.items[0].dependencies.as_ref().unwrap();
        assert!(report.incoming_candidates.is_empty() && report.outgoing.is_empty());
        assert!(!report.complete && !r.can_execute);
        assert!(!report.limitations.is_empty());
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

    #[test]
    fn archive_invalid_batch_keeps_evidence_without_projecting_partial_plan() {
        let f = Fixture::new();
        fs::write(f.0.join("note.md"), "[other](other.md)").unwrap();
        fs::write(f.0.join("other.md"), "other").unwrap();
        let mut dirty = item("other.md", "other.md");
        dirty.has_unsaved_changes = true;
        let mut result = f.check(vec![item("note.md", "note.md"), dirty]);
        inspect_dependencies(f.0.to_str().unwrap(), &mut result).unwrap();
        let report = result.items[0].dependencies.as_ref().unwrap();
        assert!(!report.outgoing.is_empty());
        assert!(report.move_impacts.is_empty());
        assert!(report
            .limitations
            .contains(&"batch_projection_unavailable_due_to_preflight_issues"));
        assert!(has(&result, 1, "unsaved_changes"));
        assert!(!result.can_execute);
    }
}
