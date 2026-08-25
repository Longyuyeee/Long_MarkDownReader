use crate::formats::file_registry::file_format_for_path;
use crate::formats::markdown::extract_pdf_reference_mentions;
use crate::services::pdf_index::load_pdf_index;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_MARKDOWN_TASK_BYTES: u64 = 20 * 1024 * 1024;
const MAX_SCANNED_ENTRIES: usize = 100_000;
const MAX_TASKS: usize = 24;
const MAX_RECENT_FILES: usize = 8;
const MAX_CANVASES: usize = 8;
const MAX_DUPLICATE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_DUPLICATE_HASH_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DUPLICATE_GROUPS: usize = 24;
const MAX_DUPLICATE_FILES_PER_GROUP: usize = 8;
const MAX_UNREFERENCED_ANNOTATIONS: usize = 48;

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDuplicateGroup {
    size: u64,
    files: Vec<WorkspaceFileSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAnnotationIssue {
    title: String,
    pdf_path: String,
    relative_path: String,
    annotation_id: String,
    page: u32,
    text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealthReport {
    duplicate_groups: Vec<WorkspaceDuplicateGroup>,
    unreferenced_annotations: Vec<WorkspaceAnnotationIssue>,
    scanned_files: usize,
    hashed_files: usize,
    scanned_annotations: usize,
    truncated: bool,
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

fn query_value(uri: &str, key: &str) -> Option<String> {
    uri.split_once('?')?.1.split('&').find_map(|field| {
        let (field_key, value) = field.split_once('=')?;
        (field_key == key)
            .then(|| {
                urlencoding::decode(value)
                    .ok()
                    .map(|value| value.into_owned())
            })
            .flatten()
    })
}

fn annotation_references(files: &[WorkspaceFileSummary]) -> HashSet<(String, String)> {
    let mut references = HashSet::new();
    for file in files.iter().filter(|file| file.object_type == "markdown") {
        if file.size > MAX_MARKDOWN_TASK_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&file.path) else {
            continue;
        };
        for mention in extract_pdf_reference_mentions(&content) {
            let Some(annotation_id) = query_value(&mention.syntax, "annotation") else {
                continue;
            };
            references.insert((mention.target.to_lowercase(), annotation_id));
        }
    }
    references
}

fn collect_unreferenced_annotations(
    files: &[WorkspaceFileSummary],
) -> (Vec<WorkspaceAnnotationIssue>, usize, bool) {
    let references = annotation_references(files);
    let mut issues = Vec::new();
    let mut scanned_annotations = 0;
    let mut truncated = false;
    for file in files.iter().filter(|file| file.object_type == "pdf") {
        let index = load_pdf_index(Path::new(&file.path));
        for annotation in index.annotations {
            scanned_annotations += 1;
            let reference_key = (file.relative_path.to_lowercase(), annotation.id.clone());
            if references.contains(&reference_key) {
                continue;
            }
            if issues.len() >= MAX_UNREFERENCED_ANNOTATIONS {
                truncated = true;
                continue;
            }
            let text = annotation.text.trim();
            issues.push(WorkspaceAnnotationIssue {
                title: if text.is_empty() {
                    format!("第 {} 页批注", annotation.page)
                } else {
                    text.chars().take(120).collect()
                },
                pdf_path: file.path.clone(),
                relative_path: file.relative_path.clone(),
                annotation_id: annotation.id,
                page: annotation.page,
                text: text.chars().take(220).collect(),
            });
        }
    }
    issues.sort_by(|left, right| {
        left.relative_path
            .cmp(&right.relative_path)
            .then_with(|| left.page.cmp(&right.page))
    });
    (issues, scanned_annotations, truncated)
}

fn collect_duplicate_groups(
    files: &[WorkspaceFileSummary],
) -> (Vec<WorkspaceDuplicateGroup>, usize, bool) {
    let mut by_size: HashMap<u64, Vec<WorkspaceFileSummary>> = HashMap::new();
    for file in files {
        if file.size > 0 && file.size <= MAX_DUPLICATE_FILE_BYTES {
            by_size.entry(file.size).or_default().push(file.clone());
        }
    }
    let mut candidates: Vec<_> = by_size
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .collect();
    candidates.sort_by_key(|(size, _)| *size);

    let mut total_hashed_bytes: u64 = 0;
    let mut hashed_files = 0;
    let mut groups = Vec::new();
    let mut truncated = false;
    for (size, mut same_size) in candidates {
        same_size.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        let mut by_digest: HashMap<String, Vec<WorkspaceFileSummary>> = HashMap::new();
        for file in same_size {
            if total_hashed_bytes.saturating_add(size) > MAX_DUPLICATE_HASH_BYTES {
                truncated = true;
                continue;
            }
            let Ok(bytes) = fs::read(&file.path) else {
                continue;
            };
            total_hashed_bytes += size;
            hashed_files += 1;
            by_digest
                .entry(format!("{:x}", md5::compute(bytes)))
                .or_default()
                .push(file);
        }
        for mut digest_files in by_digest.into_values().filter(|files| files.len() > 1) {
            if groups.len() >= MAX_DUPLICATE_GROUPS {
                truncated = true;
                continue;
            }
            digest_files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
            let Ok(anchor) = fs::read(&digest_files[0].path) else {
                continue;
            };
            let mut exact = vec![digest_files[0].clone()];
            for file in digest_files.into_iter().skip(1) {
                if fs::read(&file.path)
                    .map(|bytes| bytes == anchor)
                    .unwrap_or(false)
                {
                    if exact.len() < MAX_DUPLICATE_FILES_PER_GROUP {
                        exact.push(file);
                    } else {
                        truncated = true;
                    }
                }
            }
            if exact.len() > 1 {
                groups.push(WorkspaceDuplicateGroup { size, files: exact });
            }
        }
    }
    groups.sort_by(|left, right| {
        right.size.cmp(&left.size).then_with(|| {
            left.files[0]
                .relative_path
                .cmp(&right.files[0].relative_path)
        })
    });
    (groups, hashed_files, truncated)
}

fn build_workspace_health(root: &Path) -> WorkspaceHealthReport {
    let mut scan = WorkspaceScan::default();
    scan_directory(root, root, &mut scan);
    let scanned_files = scan.files.len();
    let (duplicate_groups, hashed_files, duplicate_truncated) =
        collect_duplicate_groups(&scan.files);
    let (unreferenced_annotations, scanned_annotations, annotation_truncated) =
        collect_unreferenced_annotations(&scan.files);
    WorkspaceHealthReport {
        duplicate_groups,
        unreferenced_annotations,
        scanned_files,
        hashed_files,
        scanned_annotations,
        truncated: scan.scanned_entries >= MAX_SCANNED_ENTRIES
            || duplicate_truncated
            || annotation_truncated,
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

#[tauri::command]
pub async fn analyze_workspace_health(
    library_root: String,
) -> Result<WorkspaceHealthReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let root = guard.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || build_workspace_health(&root))
        .await
        .map_err(|error| format!("工作区健康分析任务失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

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

    #[test]
    fn health_detects_exact_duplicates_and_unreferenced_annotations() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-health-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("research")).unwrap();
        fs::write(root.join("copy-a.txt"), "exact duplicate").unwrap();
        fs::write(root.join("copy-b.txt"), "exact duplicate").unwrap();
        fs::write(root.join("different.txt"), "other content!!").unwrap();
        fs::write(root.join("research").join("paper.pdf"), b"%PDF-health-test").unwrap();
        fs::write(
            root.join("research").join("paper.pdf.annotations.json"),
            r#"{"schemaVersion":1,"source":{"pdfFile":"paper.pdf","size":16,"modifiedAt":1},"annotations":[{"id":"used","kind":"comment","page":1,"color":"yellow","rects":[],"quote":"","comment":"Referenced","createdAt":1,"updatedAt":1},{"id":"pending","kind":"comment","page":2,"color":"blue","rects":[],"quote":"","comment":"Needs review","createdAt":1,"updatedAt":1}]}"#,
        )
        .unwrap();
        fs::write(
            root.join("notes.md"),
            "[source](longedit://pdf?path=research%2Fpaper.pdf&page=1&annotation=used)",
        )
        .unwrap();

        let report = build_workspace_health(&root);
        assert_eq!(report.duplicate_groups.len(), 1);
        assert_eq!(report.duplicate_groups[0].files.len(), 2);
        assert_eq!(report.scanned_annotations, 2);
        assert_eq!(report.unreferenced_annotations.len(), 1);
        assert_eq!(report.unreferenced_annotations[0].annotation_id, "pending");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn post_v115_m0_workspace_fixture_matches_current_baseline() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("post-v115-m0")
            .join("workspace")
            .canonicalize()
            .unwrap();
        let started = std::time::Instant::now();
        let overview = build_workspace_overview(&root);
        let health = build_workspace_health(&root);
        let duration_ms = started.elapsed().as_millis();

        assert_eq!(overview.total_files, 11);
        assert_eq!(overview.tasks.len(), 2);
        assert_eq!(overview.canvases.len(), 1);
        assert_eq!(health.duplicate_groups.len(), 1);
        assert_eq!(health.unreferenced_annotations.len(), 1);

        if let Some(output) = std::env::var_os("LONGEDIT_M0_WORKSPACE_EVIDENCE") {
            let output = PathBuf::from(output);
            fs::create_dir_all(output.parent().unwrap()).unwrap();
            let evidence = serde_json::json!({
                "schemaVersion": 1,
                "stage": "M0-workspace-baseline",
                "expected": {
                    "totalRegisteredFiles": 11,
                    "openTaskCount": 2,
                    "canvasCount": 1,
                    "duplicateGroupCount": 1,
                    "unreferencedAnnotationCount": 1
                },
                "actual": {
                    "totalRegisteredFiles": overview.total_files,
                    "openTaskCount": overview.tasks.len(),
                    "canvasCount": overview.canvases.len(),
                    "duplicateGroupCount": health.duplicate_groups.len(),
                    "unreferencedAnnotationCount": health.unreferenced_annotations.len(),
                    "scannedFiles": health.scanned_files,
                    "hashedFiles": health.hashed_files,
                    "durationMs": duration_ms
                },
                "sourceUserContentIncluded": false,
                "passed": true
            });
            fs::write(
                output,
                format!("{}\n", serde_json::to_string_pretty(&evidence).unwrap()),
            )
            .unwrap();
        }
    }
}
