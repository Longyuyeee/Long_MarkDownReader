use crate::commands::table::file_signature as table_file_signature;
use crate::formats::file_registry::file_format_for_path;
use crate::formats::markdown::extract_pdf_reference_mentions;
use crate::formats::table::{parse_internal_table, InternalTable, MAX_INTERNAL_TABLE_BYTES};
use crate::formats::text::{
    encode_text_for_save, read_text_snapshot, verify_current_signature, TextSavePolicy,
};
use crate::services::pdf_index::load_pdf_index;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_MARKDOWN_TASK_BYTES: u64 = 20 * 1024 * 1024;
const MAX_WORKSPACE_TABLE_TASK_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SCANNED_ENTRIES: usize = 100_000;
const MAX_TASKS: usize = 24;
const MAX_COMPLETED_TASKS: usize = 24;
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
    signature: String,
    completed: bool,
    priority: String,
    due_date: Option<String>,
    source_type: String,
    row_id: Option<String>,
    column_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskMutation {
    path: String,
    line: usize,
    text: String,
    completed: bool,
    expected_signature: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskMutationResult {
    path: String,
    line: usize,
    text: String,
    completed: bool,
    signature: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTableTaskMutation {
    path: String,
    row_id: String,
    column_id: String,
    text: String,
    completed: bool,
    expected_signature: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTableTaskMutationResult {
    path: String,
    row_id: String,
    column_id: String,
    text: String,
    completed: bool,
    signature: String,
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
    completed_tasks: Vec<WorkspaceTask>,
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
    completed_tasks: Vec<WorkspaceTask>,
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

fn task_priority(text: &str) -> &'static str {
    let lower = text.to_ascii_lowercase();
    if lower.contains("!high") || text.contains("#高优先级") {
        "high"
    } else if lower.contains("!medium") || text.contains("#中优先级") {
        "medium"
    } else if lower.contains("!low") || text.contains("#低优先级") {
        "low"
    } else {
        "normal"
    }
}

fn valid_task_date(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value
            .bytes()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn task_due_date(text: &str) -> Option<String> {
    let start = text.to_ascii_lowercase().find("@due(")? + 5;
    let value = text.get(start..start + 10)?;
    (text.as_bytes().get(start + 10) == Some(&b')') && valid_task_date(value))
        .then(|| value.to_string())
}

fn collect_tasks(root: &Path, path: &Path, title: &str, scan: &mut WorkspaceScan) {
    if (scan.tasks.len() >= MAX_TASKS && scan.completed_tasks.len() >= MAX_COMPLETED_TASKS)
        || path
            .metadata()
            .map(|metadata| metadata.len() > MAX_MARKDOWN_TASK_BYTES)
            .unwrap_or(true)
    {
        return;
    }
    let Ok(snapshot) = read_text_snapshot(path) else {
        return;
    };
    for (line_index, line) in snapshot.content.lines().enumerate() {
        let trimmed = line.trim_start();
        let task = [
            ("- [ ]", false),
            ("* [ ]", false),
            ("- [x]", true),
            ("- [X]", true),
            ("* [x]", true),
            ("* [X]", true),
        ]
        .into_iter()
        .find_map(|(marker, completed)| {
            trimmed
                .strip_prefix(marker)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|text| (text, completed))
        });
        let Some((text, completed)) = task else {
            continue;
        };
        let item = WorkspaceTask {
            title: title.to_string(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path(root, path),
            line: line_index + 1,
            text: text.chars().take(500).collect(),
            signature: snapshot.signature.clone(),
            completed,
            priority: task_priority(text).to_string(),
            due_date: task_due_date(text),
            source_type: "markdown".into(),
            row_id: None,
            column_id: None,
        };
        if completed {
            if scan.completed_tasks.len() < MAX_COMPLETED_TASKS {
                scan.completed_tasks.push(item);
            }
        } else if scan.tasks.len() < MAX_TASKS {
            scan.tasks.push(item);
        }
        if scan.tasks.len() >= MAX_TASKS && scan.completed_tasks.len() >= MAX_COMPLETED_TASKS {
            break;
        }
    }
}

fn table_task_completion_column(table: &InternalTable) -> Option<&str> {
    let columns = table
        .data
        .columns
        .iter()
        .filter(|column| {
            column.column_type == "boolean"
                && matches!(
                    column.name.trim().to_lowercase().as_str(),
                    "完成" | "已完成" | "done" | "completed"
                )
        })
        .collect::<Vec<_>>();
    (columns.len() == 1).then(|| columns[0].id.as_str())
}

fn table_task_title_column(table: &InternalTable) -> Option<&str> {
    let preferred = table
        .views
        .iter()
        .find(|view| view.id == table.active_view)
        .and_then(|view| view.config.title_column.as_deref());
    preferred
        .and_then(|id| {
            table
                .data
                .columns
                .iter()
                .find(|column| column.id == id && column.column_type == "text")
        })
        .or_else(|| {
            table
                .data
                .columns
                .iter()
                .find(|column| column.column_type == "text")
        })
        .map(|column| column.id.as_str())
}

fn collect_table_tasks(root: &Path, path: &Path, title: &str, scan: &mut WorkspaceScan) {
    if (scan.tasks.len() >= MAX_TASKS && scan.completed_tasks.len() >= MAX_COMPLETED_TASKS)
        || path
            .metadata()
            .map(|metadata| metadata.len() > MAX_WORKSPACE_TABLE_TASK_BYTES)
            .unwrap_or(true)
    {
        return;
    }
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(metadata) = path.metadata() else {
        return;
    };
    let Ok(content) = std::str::from_utf8(&bytes) else {
        return;
    };
    let Ok(table) = parse_internal_table(content.strip_prefix('\u{feff}').unwrap_or(content))
    else {
        return;
    };
    let (Some(completion_column), Some(title_column)) = (
        table_task_completion_column(&table),
        table_task_title_column(&table),
    ) else {
        return;
    };
    let signature = table_file_signature(&metadata, &bytes);
    for row in &table.data.rows {
        let completed = match row.values.get(completion_column).map(String::as_str) {
            Some("false") => false,
            Some("true") => true,
            _ => continue,
        };
        let Some(text) = row
            .values
            .get(title_column)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty() && value.chars().count() <= 500)
        else {
            continue;
        };
        let item = WorkspaceTask {
            title: title.to_string(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path(root, path),
            line: 0,
            text: text.chars().take(500).collect(),
            signature: signature.clone(),
            completed,
            priority: task_priority(text).to_string(),
            due_date: task_due_date(text),
            source_type: "table".into(),
            row_id: Some(row.id.clone()),
            column_id: Some(completion_column.to_string()),
        };
        if completed {
            if scan.completed_tasks.len() < MAX_COMPLETED_TASKS {
                scan.completed_tasks.push(item);
            }
        } else if scan.tasks.len() < MAX_TASKS {
            scan.tasks.push(item);
        }
        if scan.tasks.len() >= MAX_TASKS && scan.completed_tasks.len() >= MAX_COMPLETED_TASKS {
            break;
        }
    }
}

#[derive(Deserialize)]
struct RawWorkspaceTable<'a> {
    #[serde(borrow)]
    data: RawWorkspaceTableData<'a>,
}

#[derive(Deserialize)]
struct RawWorkspaceTableData<'a> {
    #[serde(borrow)]
    rows: Vec<RawWorkspaceTableRow<'a>>,
}

#[derive(Deserialize)]
struct RawWorkspaceTableRow<'a> {
    id: String,
    #[serde(borrow)]
    values: HashMap<String, &'a RawValue>,
}

fn patch_table_task_value(
    content: &str,
    row_id: &str,
    column_id: &str,
    completed: bool,
) -> Result<String, String> {
    let raw: RawWorkspaceTable =
        serde_json::from_str(content).map_err(|error| format!("Table JSON 无效: {}", error))?;
    let row = raw
        .data
        .rows
        .iter()
        .find(|row| row.id == row_id)
        .ok_or("Table 任务行已不存在，请刷新工作台后重试")?;
    let value = row
        .values
        .get(column_id)
        .ok_or("Table 完成列已不存在，请刷新工作台后重试")?
        .get();
    let expected = if completed { "\"false\"" } else { "\"true\"" };
    if value != expected {
        return Err("Table 任务状态已变化，请刷新工作台后重试".into());
    }
    let start = value.as_ptr() as usize - content.as_ptr() as usize;
    let mut updated = content.to_string();
    updated.replace_range(
        start..start + value.len(),
        if completed { "\"true\"" } else { "\"false\"" },
    );
    parse_internal_table(&updated)?;
    Ok(updated)
}

fn mutate_workspace_table_task(
    root: &Path,
    mutation: WorkspaceTableTaskMutation,
) -> Result<WorkspaceTableTaskMutationResult, String> {
    if mutation.row_id.trim().is_empty()
        || mutation.column_id.trim().is_empty()
        || mutation.text.trim().is_empty()
        || mutation.text.chars().count() > 500
    {
        return Err("Table 待办目标或内容无效".into());
    }
    if mutation.expected_signature.trim().is_empty() {
        return Err("缺少 Table 源文件签名，请刷新工作台后重试".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let path = guard.resolve_existing_file(&mutation.path, &["json"])?;
    if !path
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.to_lowercase().ends_with(".table.json"))
    {
        return Err("工作台只允许更新内部 .table.json 任务".into());
    }
    recover_interrupted_write(&path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 Table 元数据失败: {}", error))?;
    let current_bytes = fs::read(&path).map_err(|error| format!("读取 Table 失败: {}", error))?;
    if current_bytes.len() as u64 > MAX_WORKSPACE_TABLE_TASK_BYTES {
        return Err("工作台 Table 任务文件超过 8 MiB 上限".into());
    }
    if table_file_signature(&metadata, &current_bytes) != mutation.expected_signature {
        return Err("Table 已被其他程序修改，请刷新工作台后重试".into());
    }
    let current = std::str::from_utf8(&current_bytes).map_err(|_| "Table 必须使用 UTF-8 编码")?;
    let has_bom = current.starts_with('\u{feff}');
    let source = current.strip_prefix('\u{feff}').unwrap_or(current);
    let table = parse_internal_table(source)?;
    if table_task_completion_column(&table) != Some(mutation.column_id.as_str()) {
        return Err("Table 完成列已变化，请刷新工作台后重试".into());
    }
    let title_column =
        table_task_title_column(&table).ok_or("Table 任务标题列已变化，请刷新工作台后重试")?;
    let row = table
        .data
        .rows
        .iter()
        .find(|row| row.id == mutation.row_id)
        .ok_or("Table 任务行已不存在，请刷新工作台后重试")?;
    if row.values.get(title_column).map(|value| value.trim()) != Some(mutation.text.trim()) {
        return Err("Table 任务内容已变化，请刷新工作台后重试".into());
    }
    let updated = patch_table_task_value(
        source,
        &mutation.row_id,
        &mutation.column_id,
        mutation.completed,
    )?;
    let mut output = Vec::with_capacity(updated.len() + usize::from(has_bom) * 3);
    if has_bom {
        output.extend_from_slice(b"\xEF\xBB\xBF");
    }
    output.extend_from_slice(updated.as_bytes());
    if output.len() > MAX_INTERNAL_TABLE_BYTES {
        return Err("保存结果超过 64 MB 上限".into());
    }
    let latest_metadata = path
        .metadata()
        .map_err(|error| format!("复核 Table 元数据失败: {}", error))?;
    let latest_bytes = fs::read(&path).map_err(|error| format!("复核 Table 失败: {}", error))?;
    if table_file_signature(&latest_metadata, &latest_bytes) != mutation.expected_signature {
        return Err("Table 已被其他程序修改，请刷新工作台后重试".into());
    }
    write_bytes(&path, &output)?;
    let saved_bytes = fs::read(&path).map_err(|error| format!("复读 Table 失败: {}", error))?;
    if saved_bytes != output {
        return Err("Table 待办写回后复读不一致，请重新打开文件检查".into());
    }
    let saved_metadata = path
        .metadata()
        .map_err(|error| format!("读取 Table 保存结果失败: {}", error))?;
    Ok(WorkspaceTableTaskMutationResult {
        path: path.to_string_lossy().into_owned(),
        row_id: mutation.row_id,
        column_id: mutation.column_id,
        text: mutation.text,
        completed: mutation.completed,
        signature: table_file_signature(&saved_metadata, &saved_bytes),
    })
}

fn mutate_workspace_task(
    root: &Path,
    mutation: WorkspaceTaskMutation,
) -> Result<WorkspaceTaskMutationResult, String> {
    if mutation.line == 0 || mutation.text.trim().is_empty() || mutation.text.chars().count() > 500
    {
        return Err("待办位置或内容无效".into());
    }
    if mutation.expected_signature.trim().is_empty() {
        return Err("缺少待办源文件签名，请刷新工作台后重试".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    let path = guard.resolve_existing_file(&mutation.path, &["md", "markdown"])?;
    recover_interrupted_write(&path)?;
    let snapshot = read_text_snapshot(&path).map_err(|error| error.message)?;
    if snapshot.read_only_reason.is_some() {
        return Err("Markdown 文件为只读，无法更新待办".into());
    }
    verify_current_signature(&path, Some(&mutation.expected_signature))
        .map_err(|error| error.message)?;

    let mut parts: Vec<String> = snapshot
        .content
        .split_inclusive('\n')
        .map(str::to_string)
        .collect();
    if parts.is_empty() && !snapshot.content.is_empty() {
        parts.push(snapshot.content.clone());
    }
    let line = parts
        .get_mut(mutation.line - 1)
        .ok_or_else(|| "待办所在行已不存在，请刷新工作台后重试".to_string())?;
    let trimmed = line.trim_start();
    let marker = if mutation.completed {
        if trimmed.starts_with("- [ ]") {
            "- [ ]"
        } else if trimmed.starts_with("* [ ]") {
            "* [ ]"
        } else {
            return Err("待办状态已变化，请刷新工作台后重试".into());
        }
    } else if trimmed.starts_with("- [x]") || trimmed.starts_with("- [X]") {
        if trimmed.starts_with("- [x]") {
            "- [x]"
        } else {
            "- [X]"
        }
    } else if trimmed.starts_with("* [x]") || trimmed.starts_with("* [X]") {
        if trimmed.starts_with("* [x]") {
            "* [x]"
        } else {
            "* [X]"
        }
    } else {
        return Err("待办状态已变化，请刷新工作台后重试".into());
    };
    let actual_text = trimmed[marker.len()..].trim();
    if actual_text != mutation.text.trim() {
        return Err("待办内容已变化，请刷新工作台后重试".into());
    }
    let marker_offset = line.len() - trimmed.len();
    let replacement = if mutation.completed {
        if marker.starts_with('-') {
            "- [x]"
        } else {
            "* [x]"
        }
    } else if marker.starts_with('-') {
        "- [ ]"
    } else {
        "* [ ]"
    };
    line.replace_range(marker_offset..marker_offset + marker.len(), replacement);
    let updated = parts.concat();
    let encoded = encode_text_for_save(
        &snapshot,
        &updated,
        TextSavePolicy {
            expected_signature: Some(mutation.expected_signature),
            encoding: None,
            bom: None,
            line_ending: None,
            has_final_newline: None,
        },
    )
    .map_err(|error| error.message)?;
    verify_current_signature(&path, encoded.expected_signature.as_deref())
        .map_err(|error| error.message)?;
    write_bytes(&path, &encoded.bytes)?;
    let saved = read_text_snapshot(&path).map_err(|error| error.message)?;
    if saved.content != encoded.normalized_content {
        return Err("待办写回后复读不一致，请重新打开文件检查".into());
    }
    Ok(WorkspaceTaskMutationResult {
        path: path.to_string_lossy().into_owned(),
        line: mutation.line,
        text: mutation.text,
        completed: mutation.completed,
        signature: saved.signature,
    })
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
        let is_internal_table = name.to_lowercase().ends_with(".table.json");
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
        } else if format.id == "table" && is_internal_table {
            collect_table_tasks(root, &path, &summary.title, scan);
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
        completed_tasks: scan.completed_tasks,
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
pub async fn set_workspace_markdown_task_state(
    library_root: String,
    mutation: WorkspaceTaskMutation,
) -> Result<WorkspaceTaskMutationResult, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = guard.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || mutate_workspace_task(&root, mutation))
        .await
        .map_err(|error| format!("待办更新任务失败: {error}"))?
}

#[tauri::command]
pub async fn set_workspace_table_task_state(
    library_root: String,
    mutation: WorkspaceTableTaskMutation,
) -> Result<WorkspaceTableTaskMutationResult, String> {
    let root = WorkspaceGuard::new(&library_root)?.root().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || mutate_workspace_table_task(&root, mutation))
        .await
        .map_err(|error| format!("Table 待办更新任务失败: {}", error))?
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
            "# Plan\n- [ ] Ship dashboard !high @due(2026-08-26)\n- [x] Ignore completed !low @due(2026-08-20)\n* [ ] Review index\n",
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
        assert_eq!(overview.tasks[0].priority, "high");
        assert_eq!(overview.tasks[0].due_date.as_deref(), Some("2026-08-26"));
        assert!(!overview.tasks[0].completed);
        assert_eq!(overview.completed_tasks.len(), 1);
        assert!(overview.completed_tasks[0].completed);
        assert_eq!(overview.completed_tasks[0].priority, "low");
        assert_eq!(overview.canvases.len(), 1);
        assert_eq!(overview.canvases[0].object_type, "canvas");
        assert!(overview
            .format_counts
            .iter()
            .any(|item| item.object_type == "markdown" && item.count == 1));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn task_mutation_completes_and_undoes_without_changing_text_format() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-task-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("计划.md");
        fs::write(&path, b"\xEF\xBB\xBF# Plan\r\n- [ ] Ship workspace\r\n").unwrap();
        let initial = read_text_snapshot(&path).unwrap();

        let completed = mutate_workspace_task(
            &root,
            WorkspaceTaskMutation {
                path: path.to_string_lossy().into_owned(),
                line: 2,
                text: "Ship workspace".into(),
                completed: true,
                expected_signature: initial.signature.clone(),
            },
        )
        .unwrap();
        let completed_bytes = fs::read(&path).unwrap();
        assert!(completed_bytes.starts_with(b"\xEF\xBB\xBF"));
        assert!(String::from_utf8_lossy(&completed_bytes).contains("- [x] Ship workspace\r\n"));

        let undone = mutate_workspace_task(
            &root,
            WorkspaceTaskMutation {
                path: path.to_string_lossy().into_owned(),
                line: 2,
                text: "Ship workspace".into(),
                completed: false,
                expected_signature: completed.signature,
            },
        )
        .unwrap();
        assert!(!undone.completed);
        assert_eq!(
            fs::read(&path).unwrap(),
            b"\xEF\xBB\xBF# Plan\r\n- [ ] Ship workspace\r\n"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn task_mutation_rejects_stale_signature_and_changed_line() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-task-conflict-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("Plan.md");
        fs::write(&path, "- [ ] Original\n").unwrap();
        let initial = read_text_snapshot(&path).unwrap();
        fs::write(&path, "- [ ] Changed externally\n").unwrap();
        let before = fs::read(&path).unwrap();
        let error = mutate_workspace_task(
            &root,
            WorkspaceTaskMutation {
                path: path.to_string_lossy().into_owned(),
                line: 1,
                text: "Original".into(),
                completed: true,
                expected_signature: initial.signature,
            },
        )
        .unwrap_err();
        assert!(error.contains("其他程序修改"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn table_tasks_are_discovered_and_complete_then_undo_byte_for_byte() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-table-task-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("post-v115-m4b0")
            .join("workspace")
            .join("M4B0 Tasks.table.json");
        let path = root.join("任务表.table.json");
        let mut initial = b"\xEF\xBB\xBF".to_vec();
        initial.extend(fs::read(fixture).unwrap());
        fs::write(&path, &initial).unwrap();
        fs::write(root.join("ignored.csv"), "任务,完成\n不应推断,true\n").unwrap();

        let overview = build_workspace_overview(&root);
        assert_eq!(overview.tasks.len(), 1);
        assert_eq!(overview.completed_tasks.len(), 1);
        let task = &overview.tasks[0];
        assert_eq!(task.source_type, "table");
        assert_eq!(task.row_id.as_deref(), Some("task-row-1"));
        assert_eq!(task.column_id.as_deref(), Some("done"));
        assert_eq!(task.text, "复核 Table 工作台行动");

        let completed = mutate_workspace_table_task(
            &root,
            WorkspaceTableTaskMutation {
                path: path.to_string_lossy().into_owned(),
                row_id: task.row_id.clone().unwrap(),
                column_id: task.column_id.clone().unwrap(),
                text: task.text.clone(),
                completed: true,
                expected_signature: task.signature.clone(),
            },
        )
        .unwrap();
        let completed_bytes = fs::read(&path).unwrap();
        assert!(completed_bytes.starts_with(b"\xEF\xBB\xBF"));
        assert_ne!(completed_bytes, initial);
        assert!(String::from_utf8_lossy(&completed_bytes).contains("\"done\": \"true\""));

        let undone = mutate_workspace_table_task(
            &root,
            WorkspaceTableTaskMutation {
                path: path.to_string_lossy().into_owned(),
                row_id: completed.row_id,
                column_id: completed.column_id,
                text: completed.text,
                completed: false,
                expected_signature: completed.signature,
            },
        )
        .unwrap();
        assert!(!undone.completed);
        assert_eq!(fs::read(&path).unwrap(), initial);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn table_task_mutation_rejects_stale_signature_without_writing() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-table-task-conflict-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("post-v115-m4b0")
            .join("workspace")
            .join("M4B0 Tasks.table.json");
        let path = root.join("Tasks.table.json");
        fs::copy(fixture, &path).unwrap();
        let task = build_workspace_overview(&root).tasks.remove(0);
        let mut changed = fs::read(&path).unwrap();
        changed.push(b'\n');
        fs::write(&path, &changed).unwrap();
        let before = fs::read(&path).unwrap();

        let error = mutate_workspace_table_task(
            &root,
            WorkspaceTableTaskMutation {
                path: path.to_string_lossy().into_owned(),
                row_id: task.row_id.unwrap(),
                column_id: task.column_id.unwrap(),
                text: task.text,
                completed: true,
                expected_signature: task.signature,
            },
        )
        .unwrap_err();
        assert!(error.contains("其他程序修改"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn table_task_mutation_rejects_files_above_workspace_scan_limit() {
        let root = std::env::temp_dir().join(format!(
            "longedit-workspace-table-task-size-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("post-v115-m4b0")
            .join("workspace")
            .join("M4B0 Tasks.table.json");
        let path = root.join("Tasks.table.json");
        let mut bytes = fs::read(fixture).unwrap();
        bytes.resize(MAX_WORKSPACE_TABLE_TASK_BYTES as usize + 1, b' ');
        fs::write(&path, &bytes).unwrap();
        let signature = table_file_signature(&path.metadata().unwrap(), &bytes);

        let error = mutate_workspace_table_task(
            &root,
            WorkspaceTableTaskMutation {
                path: path.to_string_lossy().into_owned(),
                row_id: "task-row-1".into(),
                column_id: "done".into(),
                text: "复核 Table 工作台行动".into(),
                completed: true,
                expected_signature: signature,
            },
        )
        .unwrap_err();
        assert!(error.contains("8 MiB"));
        assert_eq!(fs::read(&path).unwrap(), bytes);
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
