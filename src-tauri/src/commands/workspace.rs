use crate::formats::file_registry::file_format_for_path;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_MARKDOWN_TASK_BYTES: u64 = 20 * 1024 * 1024;
const MAX_SCANNED_ENTRIES: usize = 100_000;
const MAX_TASKS: usize = 24;
const MAX_RECENT_FILES: usize = 8;
const MAX_CANVASES: usize = 8;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTask {
    title: String,
    path: String,
    relative_path: String,
    line: usize,
    text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileSummary {
    title: String,
    path: String,
    relative_path: String,
    object_type: String,
    modified_at: u64,
    size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFormatCount {
    object_type: String,
    count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOverview {
    total_files: usize,
    tasks: Vec<WorkspaceTask>,
    recent_files: Vec<WorkspaceFileSummary>,
    canvases: Vec<WorkspaceFileSummary>,
    format_counts: Vec<WorkspaceFormatCount>,
}

#[derive(Default)]
struct WorkspaceScan {
    scanned_entries: usize,
    total_files: usize,
    tasks: Vec<WorkspaceTask>,
    files: Vec<WorkspaceFileSummary>,
    format_counts: HashMap<String, usize>,
}

fn modified_timestamp(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn collect_tasks(root: &Path, path: &Path, title: &str, scan: &mut WorkspaceScan) {
    if scan.tasks.len() >= MAX_TASKS
        || path
            .metadata()
            .map(|metadata| metadata.len() > MAX_MARKDOWN_TASK_BYTES)
            .unwrap_or(true)
    {
        return;
    }
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    for (line_index, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        let task_text = trimmed
            .strip_prefix("- [ ]")
            .or_else(|| trimmed.strip_prefix("* [ ]"))
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(text) = task_text else {
            continue;
        };
        scan.tasks.push(WorkspaceTask {
            title: title.to_string(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path(root, path),
            line: line_index + 1,
            text: text.chars().take(500).collect(),
        });
        if scan.tasks.len() >= MAX_TASKS {
            break;
        }
    }
}

fn scan_directory(root: &Path, directory: &Path, scan: &mut WorkspaceScan) {
    if scan.scanned_entries >= MAX_SCANNED_ENTRIES {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if scan.scanned_entries >= MAX_SCANNED_ENTRIES {
            break;
        }
        scan.scanned_entries += 1;
        if entry
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(true)
        {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if name.starts_with('.') || name.ends_with(".assets") {
            continue;
        }
        if path.is_dir() {
            scan_directory(root, &path, scan);
            continue;
        }
        let Ok(format) = file_format_for_path(&path) else {
            continue;
        };
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        scan.total_files += 1;
        *scan.format_counts.entry(format.id.clone()).or_default() += 1;
        let summary = WorkspaceFileSummary {
            title: name.into_owned(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path(root, &path),
            object_type: format.id.clone(),
            modified_at: modified_timestamp(&metadata),
            size: metadata.len(),
        };
        if format.id == "markdown" {
            collect_tasks(root, &path, &summary.title, scan);
        }
        scan.files.push(summary);
    }
}

fn build_workspace_overview(root: &Path) -> WorkspaceOverview {
    let mut scan = WorkspaceScan::default();
    scan_directory(root, root, &mut scan);
    scan.files.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    let canvases = scan
        .files
        .iter()
        .filter(|file| file.object_type == "canvas")
        .take(MAX_CANVASES)
        .cloned()
        .collect();
    let recent_files = scan.files.into_iter().take(MAX_RECENT_FILES).collect();
    let mut format_counts: Vec<_> = scan
        .format_counts
        .into_iter()
        .map(|(object_type, count)| WorkspaceFormatCount { object_type, count })
        .collect();
    format_counts.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.object_type.cmp(&right.object_type))
    });
    WorkspaceOverview {
        total_files: scan.total_files,
        tasks: scan.tasks,
        recent_files,
        canvases,
        format_counts,
    }
}

#[tauri::command]
pub async fn get_workspace_overview(library_root: String) -> Result<WorkspaceOverview, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let root = guard.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || build_workspace_overview(&root))
        .await
        .map_err(|error| format!("工作台概览任务失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overview_collects_registered_files_tasks_and_recent_canvases() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-overview-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("notes.assets")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(
            root.join("Plan.md"),
            "# Plan\n- [ ] Ship dashboard\n- [x] Ignore completed\n* [ ] Review index\n",
        )
        .unwrap();
        fs::write(root.join("Board.canvas"), r#"{"nodes":[],"edges":[]}"#).unwrap();
        fs::write(root.join("Data.csv"), "name,value\nA,1\n").unwrap();
        fs::write(root.join("notes.assets").join("ignored.md"), "- [ ] hidden").unwrap();
        fs::write(root.join(".hidden").join("ignored.canvas"), "{}").unwrap();
        fs::write(root.join("unsupported.bin"), b"ignored").unwrap();

        let overview = build_workspace_overview(&root);
        assert_eq!(overview.total_files, 3);
        assert_eq!(overview.tasks.len(), 2);
        assert_eq!(overview.tasks[0].line, 2);
        assert_eq!(overview.canvases.len(), 1);
        assert_eq!(overview.canvases[0].object_type, "canvas");
        assert!(overview
            .format_counts
            .iter()
            .any(|item| item.object_type == "markdown" && item.count == 1));
        fs::remove_dir_all(root).unwrap();
    }
}
