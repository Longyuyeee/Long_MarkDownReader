use crate::formats::table::{
    parse_internal_table, validate_internal_table, DashboardItem, GridViewConfig, InternalTable,
    TableColumn, TableData, TableRow, TableSort, TableView, MAX_INTERNAL_TABLE_BYTES, TABLE_KIND,
    TABLE_SCHEMA_VERSION,
};
use crate::sanitize_filename;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes};
use crate::services::workspace_guard::WorkspaceGuard;
use chardetng::EncodingDetector;
use csv::{ReaderBuilder, Terminator, WriterBuilder};
use encoding_rs::Encoding;
use rust_xlsxwriter::{Format, Workbook};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::State;

const MAX_TABLE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_TABLE_ROWS: usize = 200_000;
const MAX_TABLE_COLUMNS: usize = 512;
const MAX_CELL_CHARS: usize = 1_000_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDocument {
    pub path: String,
    pub format: String,
    pub delimiter: String,
    pub encoding: String,
    pub has_bom: bool,
    pub line_ending: String,
    pub signature: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub column_types: Vec<String>,
    pub column_ids: Vec<String>,
    pub row_ids: Vec<String>,
    pub view: TableViewState,
    pub views: Vec<TableViewDefinition>,
    pub active_view: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableViewDefinition {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config: TableViewState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableViewState {
    #[serde(default)]
    pub filter: String,
    #[serde(default)]
    pub sort_column: Option<String>,
    #[serde(default = "default_sort_direction")]
    pub sort_direction: String,
    #[serde(default)]
    pub frozen_columns: usize,
    #[serde(default)]
    pub column_widths: Vec<u16>,
    #[serde(default)]
    pub group_by: Option<String>,
    #[serde(default)]
    pub title_column: Option<String>,
    #[serde(default)]
    pub card_columns: Vec<String>,
    #[serde(default)]
    pub category_column: Option<String>,
    #[serde(default)]
    pub value_column: Option<String>,
    #[serde(default = "default_aggregation")]
    pub aggregation: String,
    #[serde(default = "default_chart_type")]
    pub chart_type: String,
    #[serde(default)]
    pub series_column: Option<String>,
    #[serde(default = "default_null_strategy")]
    pub null_strategy: String,
    #[serde(default = "default_true")]
    pub show_legend: bool,
    #[serde(default)]
    pub dashboard_items: Vec<DashboardItemState>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardItemState {
    pub chart_view_id: String,
    #[serde(default = "default_dashboard_width")]
    pub width: u8,
}

fn default_dashboard_width() -> u8 {
    6
}

fn default_sort_direction() -> String {
    "asc".into()
}

fn default_aggregation() -> String {
    "count".into()
}

fn default_chart_type() -> String {
    "bar".into()
}

fn default_null_strategy() -> String {
    "skip".into()
}

fn default_true() -> bool {
    true
}

impl Default for TableViewState {
    fn default() -> Self {
        Self {
            filter: String::new(),
            sort_column: None,
            sort_direction: default_sort_direction(),
            frozen_columns: 0,
            column_widths: Vec::new(),
            group_by: None,
            title_column: None,
            card_columns: Vec::new(),
            category_column: None,
            value_column: None,
            aggregation: default_aggregation(),
            chart_type: default_chart_type(),
            series_column: None,
            null_strategy: default_null_strategy(),
            show_legend: true,
            dashboard_items: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableWritePayload {
    pub delimiter: String,
    pub encoding: String,
    pub has_bom: bool,
    pub line_ending: String,
    pub expected_signature: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    #[serde(default)]
    pub column_types: Vec<String>,
    #[serde(default)]
    pub column_ids: Vec<String>,
    #[serde(default)]
    pub row_ids: Vec<String>,
    #[serde(default)]
    pub view: TableViewState,
    #[serde(default)]
    pub views: Vec<TableViewDefinition>,
    #[serde(default)]
    pub active_view: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableWriteResult {
    pub signature: String,
    pub size: u64,
}

fn file_signature(metadata: &fs::Metadata, bytes: &[u8]) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{}:{}:{:016x}", metadata.len(), modified, hasher.finish())
}

fn table_delimiter(path: &Path) -> Result<u8, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "csv" => Ok(b','),
        "tsv" => Ok(b'\t'),
        _ => Err("仅支持 CSV 和 TSV 文件".into()),
    }
}

fn is_internal_table(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.to_ascii_lowercase().ends_with(".table.json"))
}

fn ensure_table_path(path: &Path) -> Result<(), String> {
    if is_internal_table(path)
        || matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str(),
            "csv" | "tsv"
        )
    {
        Ok(())
    } else {
        Err("仅支持 CSV、TSV 和 .table.json 文件".into())
    }
}

fn validate_shape(headers: &[String], rows: &[Vec<String>]) -> Result<usize, String> {
    if rows.len() > MAX_TABLE_ROWS {
        return Err(format!("表格超过 {} 行上限", MAX_TABLE_ROWS));
    }
    let columns = rows
        .iter()
        .map(Vec::len)
        .chain(std::iter::once(headers.len()))
        .max()
        .unwrap_or(0);
    if columns == 0 || columns > MAX_TABLE_COLUMNS {
        return Err(format!("表格列数必须在 1–{} 之间", MAX_TABLE_COLUMNS));
    }
    for cell in headers.iter().chain(rows.iter().flatten()) {
        if cell.chars().count() > MAX_CELL_CHARS {
            return Err("单元格文本超过 100 万字符上限".into());
        }
    }
    Ok(columns)
}

fn padded(mut values: Vec<String>, columns: usize) -> Vec<String> {
    values.resize(columns, String::new());
    values
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let year = value[0..4].parse::<u16>().ok();
    let month = value[5..7].parse::<u8>().ok();
    let day = value[8..10].parse::<u8>().ok();
    year.is_some()
        && month.is_some_and(|item| (1..=12).contains(&item))
        && day.is_some_and(|item| (1..=31).contains(&item))
}

pub(crate) fn infer_column_type(rows: &[Vec<String>], column: usize) -> String {
    let values = rows
        .iter()
        .filter_map(|row| row.get(column))
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(2_000)
        .collect::<Vec<_>>();
    if values.is_empty() {
        return "empty".into();
    }
    if values.iter().all(|value| value.parse::<i64>().is_ok()) {
        return "integer".into();
    }
    if values
        .iter()
        .all(|value| value.parse::<f64>().is_ok_and(f64::is_finite))
    {
        return "number".into();
    }
    if values
        .iter()
        .all(|value| matches!(value.to_ascii_lowercase().as_str(), "true" | "false"))
    {
        return "boolean".into();
    }
    if values.iter().all(|value| is_iso_date(value)) {
        return "date".into();
    }
    "text".into()
}

fn view_state(config: &GridViewConfig, column_ids: &[String]) -> TableViewState {
    TableViewState {
        filter: config.filter.clone(),
        sort_column: config.sort.as_ref().map(|sort| sort.column.clone()),
        sort_direction: config
            .sort
            .as_ref()
            .map(|sort| sort.direction.clone())
            .unwrap_or_else(|| "asc".into()),
        frozen_columns: config.frozen_columns,
        column_widths: column_ids
            .iter()
            .map(|id| config.column_widths.get(id).copied().unwrap_or(160))
            .collect(),
        group_by: config.group_by.clone(),
        title_column: config.title_column.clone(),
        card_columns: config.card_columns.clone(),
        category_column: config.category_column.clone(),
        value_column: config.value_column.clone(),
        aggregation: config.aggregation.clone(),
        chart_type: config.chart_type.clone(),
        series_column: config.series_column.clone(),
        null_strategy: config.null_strategy.clone(),
        show_legend: config.show_legend,
        dashboard_items: config
            .dashboard_items
            .iter()
            .map(|item| DashboardItemState {
                chart_view_id: item.chart_view_id.clone(),
                width: item.width,
            })
            .collect(),
    }
}

fn internal_view_config(
    state: TableViewState,
    column_ids: &[String],
    columns: usize,
) -> GridViewConfig {
    GridViewConfig {
        filter: state.filter,
        sort: state.sort_column.map(|column| TableSort {
            column,
            direction: if state.sort_direction == "desc" {
                "desc".into()
            } else {
                "asc".into()
            },
        }),
        frozen_columns: state.frozen_columns.min(columns),
        column_widths: column_ids
            .iter()
            .enumerate()
            .map(|(index, id)| {
                (
                    id.clone(),
                    state
                        .column_widths
                        .get(index)
                        .copied()
                        .unwrap_or(160)
                        .clamp(60, 600),
                )
            })
            .collect(),
        group_by: state.group_by,
        title_column: state.title_column,
        card_columns: state.card_columns,
        category_column: state.category_column,
        value_column: state.value_column,
        aggregation: if matches!(state.aggregation.as_str(), "sum" | "average") {
            state.aggregation
        } else {
            "count".into()
        },
        chart_type: if matches!(state.chart_type.as_str(), "line" | "pie" | "scatter") {
            state.chart_type
        } else {
            "bar".into()
        },
        series_column: state.series_column,
        null_strategy: if state.null_strategy == "zero" {
            "zero".into()
        } else {
            "skip".into()
        },
        show_legend: state.show_legend,
        dashboard_items: state
            .dashboard_items
            .into_iter()
            .map(|item| DashboardItem {
                chart_view_id: item.chart_view_id,
                width: if matches!(item.width, 4 | 6 | 8 | 12) {
                    item.width
                } else {
                    6
                },
            })
            .collect(),
    }
}

fn parse_table(path: &Path) -> Result<TableDocument, String> {
    recover_interrupted_write(path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取表格元数据失败: {}", error))?;
    if metadata.len() > MAX_TABLE_BYTES {
        return Err("CSV/TSV 超过 32 MB 上限".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取表格失败: {}", error))?;
    let has_bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (decoded, _, had_errors) = encoding.decode(&bytes);
    if had_errors {
        return Err("表格包含无法按检测编码解码的字节".into());
    }
    let content = decoded.strip_prefix('\u{feff}').unwrap_or(&decoded);
    let line_ending = if content.contains("\r\n") {
        "crlf"
    } else {
        "lf"
    };
    let delimiter = table_delimiter(path)?;
    let mut reader = ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(content.as_bytes());
    let mut records = Vec::new();
    for (index, record) in reader.records().enumerate() {
        if index > MAX_TABLE_ROWS {
            return Err(format!("表格超过 {} 行上限", MAX_TABLE_ROWS));
        }
        let record =
            record.map_err(|error| format!("CSV/TSV 第 {} 行解析失败: {}", index + 1, error))?;
        records.push(record.iter().map(str::to_string).collect::<Vec<_>>());
    }
    if records.is_empty() {
        records.push(vec![String::new()]);
    }
    let headers = records.remove(0);
    let columns = validate_shape(&headers, &records)?;
    let headers = padded(headers, columns);
    let rows = records
        .into_iter()
        .map(|row| padded(row, columns))
        .collect::<Vec<_>>();
    let column_types = (0..columns)
        .map(|column| infer_column_type(&rows, column))
        .collect();
    let row_count = rows.len();
    let view = TableViewState {
        sort_direction: "asc".into(),
        frozen_columns: 1,
        column_widths: vec![160; columns],
        ..Default::default()
    };
    Ok(TableDocument {
        path: path.to_string_lossy().into_owned(),
        format: if delimiter == b'\t' { "tsv" } else { "csv" }.into(),
        delimiter: (delimiter as char).to_string(),
        encoding: encoding.name().to_string(),
        has_bom,
        line_ending: line_ending.into(),
        signature: file_signature(&metadata, &bytes),
        headers,
        rows,
        column_types,
        column_ids: (0..columns)
            .map(|index| format!("column-{}", index + 1))
            .collect(),
        row_ids: (0..row_count)
            .map(|index| format!("row-{}", index + 1))
            .collect(),
        view: view.clone(),
        views: vec![TableViewDefinition {
            id: "grid".into(),
            name: "表格".into(),
            kind: "grid".into(),
            config: view,
        }],
        active_view: "grid".into(),
    })
}

fn parse_internal(path: &Path) -> Result<TableDocument, String> {
    recover_interrupted_write(path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 Table 元数据失败: {}", error))?;
    if metadata.len() as usize > MAX_INTERNAL_TABLE_BYTES {
        return Err("Table 文件不能超过 64 MB".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取 Table 失败: {}", error))?;
    let content = std::str::from_utf8(&bytes).map_err(|_| "Table 必须使用 UTF-8 编码")?;
    let internal = parse_internal_table(content.strip_prefix('\u{feff}').unwrap_or(content))?;
    let column_ids = internal
        .data
        .columns
        .iter()
        .map(|column| column.id.clone())
        .collect::<Vec<_>>();
    let headers = internal
        .data
        .columns
        .iter()
        .map(|column| column.name.clone())
        .collect::<Vec<_>>();
    let rows = internal
        .data
        .rows
        .iter()
        .map(|row| {
            column_ids
                .iter()
                .map(|column| row.values.get(column).cloned().unwrap_or_default())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let column_types = internal
        .data
        .columns
        .iter()
        .enumerate()
        .map(|(index, column)| {
            if matches!(column.column_type.as_str(), "auto" | "empty") {
                infer_column_type(&rows, index)
            } else {
                column.column_type.clone()
            }
        })
        .collect();
    let active = internal
        .views
        .iter()
        .find(|view| view.id == internal.active_view)
        .ok_or("Table activeView 无效")?;
    let view = view_state(&active.config, &column_ids);
    let views = internal
        .views
        .iter()
        .map(|item| TableViewDefinition {
            id: item.id.clone(),
            name: item.name.clone(),
            kind: item.kind.clone(),
            config: view_state(&item.config, &column_ids),
        })
        .collect();
    Ok(TableDocument {
        path: path.to_string_lossy().into_owned(),
        format: "longedit-table".into(),
        delimiter: ",".into(),
        encoding: "UTF-8".into(),
        has_bom: false,
        line_ending: "lf".into(),
        signature: file_signature(&metadata, &bytes),
        headers,
        rows,
        column_types,
        column_ids,
        row_ids: internal
            .data
            .rows
            .iter()
            .map(|row| row.id.clone())
            .collect(),
        view,
        views,
        active_view: internal.active_view,
    })
}

fn parse_any_table(path: &Path) -> Result<TableDocument, String> {
    ensure_table_path(path)?;
    if is_internal_table(path) {
        parse_internal(path)
    } else {
        parse_table(path)
    }
}

#[tauri::command]
pub async fn read_table_file(library_root: String, path: String) -> Result<TableDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["csv", "tsv", "json"])?;
    ensure_table_path(&file)?;
    tauri::async_runtime::spawn_blocking(move || parse_any_table(&file))
        .await
        .map_err(|error| format!("表格解析任务失败: {}", error))?
}

#[tauri::command]
pub async fn write_table_file(
    library_root: String,
    path: String,
    payload: TableWritePayload,
) -> Result<TableWriteResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["csv", "tsv", "json"])?;
    ensure_table_path(&file)?;
    tauri::async_runtime::spawn_blocking(move || {
        if is_internal_table(&file) {
            write_internal_table(&file, payload)
        } else {
            write_table(&file, payload)
        }
    })
    .await
    .map_err(|error| format!("表格保存任务失败: {}", error))?
}

async fn read_external_table_file_with_access(
    path: String,
    access: &ExternalFileAccess,
) -> Result<TableDocument, String> {
    let file = access.resolve_editable(path)?;
    ensure_table_path(&file)?;
    tauri::async_runtime::spawn_blocking(move || parse_any_table(&file))
        .await
        .map_err(|error| format!("外部表格解析任务失败: {error}"))?
}

async fn write_external_table_file_with_access(
    path: String,
    payload: TableWritePayload,
    access: &ExternalFileAccess,
) -> Result<TableWriteResult, String> {
    let file = access.resolve_editable(path)?;
    ensure_table_path(&file)?;
    tauri::async_runtime::spawn_blocking(move || {
        if is_internal_table(&file) {
            write_internal_table(&file, payload)
        } else {
            write_table(&file, payload)
        }
    })
    .await
    .map_err(|error| format!("外部表格保存任务失败: {error}"))?
}

#[tauri::command]
pub async fn read_external_table_file(
    path: String,
    access: State<'_, ExternalFileAccess>,
) -> Result<TableDocument, String> {
    read_external_table_file_with_access(path, &access).await
}

#[tauri::command]
pub async fn write_external_table_file(
    path: String,
    payload: TableWritePayload,
    access: State<'_, ExternalFileAccess>,
) -> Result<TableWriteResult, String> {
    write_external_table_file_with_access(path, payload, &access).await
}

fn normalized_ids(values: Vec<String>, count: usize, prefix: &str) -> Vec<String> {
    if values.len() == count {
        values
    } else {
        (0..count)
            .map(|index| format!("{}-{}", prefix, index + 1))
            .collect()
    }
}

fn write_internal_table(
    file: &Path,
    payload: TableWritePayload,
) -> Result<TableWriteResult, String> {
    let metadata = file
        .metadata()
        .map_err(|error| format!("读取 Table 元数据失败: {}", error))?;
    let current_bytes = fs::read(file).map_err(|error| format!("读取 Table 失败: {}", error))?;
    if file_signature(&metadata, &current_bytes) != payload.expected_signature {
        return Err("Table 已被其他程序修改，请重新加载后再保存".into());
    }
    let current = std::str::from_utf8(&current_bytes).map_err(|_| "Table 必须使用 UTF-8 编码")?;
    let mut internal = parse_internal_table(current.strip_prefix('\u{feff}').unwrap_or(current))?;
    let submitted_views = payload.views.clone();
    let submitted_active_view = payload.active_view.clone();
    let submitted_active_config = payload.view.clone();
    let columns = validate_shape(&payload.headers, &payload.rows)?;
    let column_ids = normalized_ids(payload.column_ids, columns, "column");
    let row_ids = normalized_ids(payload.row_ids, payload.rows.len(), "row");
    let column_types = if payload.column_types.len() == columns {
        payload.column_types
    } else {
        (0..columns)
            .map(|column| infer_column_type(&payload.rows, column))
            .collect()
    };
    internal.data.columns = (0..columns)
        .map(|index| TableColumn {
            id: column_ids[index].clone(),
            name: payload.headers.get(index).cloned().unwrap_or_default(),
            column_type: column_types[index].clone(),
        })
        .collect();
    internal.data.rows = payload
        .rows
        .into_iter()
        .enumerate()
        .map(|(index, row)| TableRow {
            id: row_ids[index].clone(),
            values: column_ids
                .iter()
                .cloned()
                .zip(padded(row, columns))
                .collect(),
        })
        .collect();
    if submitted_views.is_empty() {
        let active = internal
            .views
            .iter_mut()
            .find(|view| view.id == internal.active_view)
            .ok_or("Table activeView 无效")?;
        active.config = internal_view_config(submitted_active_config, &column_ids, columns);
    } else {
        internal.views = submitted_views
            .into_iter()
            .map(|view| TableView {
                id: view.id,
                name: view.name,
                kind: view.kind,
                config: internal_view_config(view.config, &column_ids, columns),
            })
            .collect();
        internal.active_view = submitted_active_view;
        if let Some(active) = internal
            .views
            .iter_mut()
            .find(|view| view.id == internal.active_view)
        {
            active.config = internal_view_config(submitted_active_config, &column_ids, columns);
        }
    }
    validate_internal_table(&internal)?;
    let output = serde_json::to_vec_pretty(&internal)
        .map_err(|error| format!("序列化 Table 失败: {}", error))?;
    if output.len() > MAX_INTERNAL_TABLE_BYTES {
        return Err("保存结果超过 64 MB 上限".into());
    }
    write_bytes(file, &output)?;
    let saved = file
        .metadata()
        .map_err(|error| format!("读取保存结果失败: {}", error))?;
    Ok(TableWriteResult {
        signature: file_signature(&saved, &output),
        size: saved.len(),
    })
}

pub(crate) fn available_output_path(directory: &Path, stem: &str, suffix: &str) -> PathBuf {
    for index in 0.. {
        let name = if index == 0 {
            format!("{}{}", stem, suffix)
        } else {
            format!("{} {}{}", stem, index, suffix)
        };
        let candidate = directory.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

pub(crate) fn internal_from_document(document: &TableDocument) -> InternalTable {
    let column_ids = (0..document.headers.len())
        .map(|index| format!("column-{}", index + 1))
        .collect::<Vec<_>>();
    InternalTable {
        schema_version: TABLE_SCHEMA_VERSION,
        kind: TABLE_KIND.into(),
        data: TableData {
            columns: document
                .headers
                .iter()
                .enumerate()
                .map(|(index, name)| TableColumn {
                    id: column_ids[index].clone(),
                    name: name.clone(),
                    column_type: document.column_types[index].clone(),
                })
                .collect(),
            rows: document
                .rows
                .iter()
                .enumerate()
                .map(|(index, row)| TableRow {
                    id: format!("row-{}", index + 1),
                    values: column_ids
                        .iter()
                        .cloned()
                        .zip(row.iter().cloned())
                        .collect(),
                })
                .collect(),
        },
        views: vec![TableView {
            id: "grid".into(),
            name: "表格".into(),
            kind: "grid".into(),
            config: GridViewConfig {
                frozen_columns: 1,
                column_widths: column_ids.iter().map(|id| (id.clone(), 160)).collect(),
                ..Default::default()
            },
        }],
        active_view: "grid".into(),
    }
}

#[tauri::command]
pub async fn create_table_file(
    library_root: String,
    target_dir: Option<String>,
    prefix: Option<String>,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = if let Some(directory) = target_dir {
        guard.resolve_directory(directory, true)?
    } else {
        guard.root().to_path_buf()
    };
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let stem = sanitize_filename(&prefix.unwrap_or_else(|| "未命名数据表".into()));
    if stem.is_empty() {
        return Err("文件名不能为空".into());
    }
    let path = available_output_path(&root, &stem, ".table.json");
    let blank = TableDocument {
        path: path.to_string_lossy().into_owned(),
        format: "longedit-table".into(),
        delimiter: ",".into(),
        encoding: "UTF-8".into(),
        has_bom: false,
        line_ending: "lf".into(),
        signature: String::new(),
        headers: vec!["名称".into()],
        rows: Vec::new(),
        column_types: vec!["text".into()],
        column_ids: vec!["column-1".into()],
        row_ids: Vec::new(),
        view: TableViewState::default(),
        views: Vec::new(),
        active_view: "grid".into(),
    };
    let internal = internal_from_document(&blank);
    let bytes = serde_json::to_vec_pretty(&internal).map_err(|error| error.to_string())?;
    write_bytes(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn import_table_file(library_root: String, path: String) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(path, &["csv", "tsv"])?;
    let directory = source.parent().ok_or("源文件没有父目录")?.to_path_buf();
    let stem = source
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let document = parse_table(&source)?;
        let internal = internal_from_document(&document);
        validate_internal_table(&internal)?;
        let output = serde_json::to_vec_pretty(&internal).map_err(|error| error.to_string())?;
        if output.len() > MAX_INTERNAL_TABLE_BYTES {
            return Err("转换后的 Table 超过 64 MB 上限".into());
        }
        let target = available_output_path(&directory, &stem, ".table.json");
        write_bytes(&target, &output)?;
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("Table 导入任务失败: {}", error))?
}

fn export_delimited(document: &TableDocument, delimiter: u8) -> Result<Vec<u8>, String> {
    let mut writer = WriterBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .from_writer(Vec::new());
    writer
        .write_record(&document.headers)
        .map_err(|error| error.to_string())?;
    for row in &document.rows {
        writer
            .write_record(row)
            .map_err(|error| error.to_string())?;
    }
    writer.into_inner().map_err(|error| error.to_string())
}

fn export_xlsx(document: &TableDocument) -> Result<Vec<u8>, String> {
    let mut workbook = Workbook::new();
    let header = Format::new().set_bold();
    let worksheet = workbook.add_worksheet();
    worksheet
        .set_name("Data")
        .map_err(|error| error.to_string())?;
    worksheet
        .set_freeze_panes(1, document.view.frozen_columns as u16)
        .map_err(|error| error.to_string())?;
    for (column, value) in document.headers.iter().enumerate() {
        worksheet
            .write_string_with_format(0, column as u16, value, &header)
            .map_err(|error| error.to_string())?;
        worksheet
            .set_column_width(
                column as u16,
                document
                    .view
                    .column_widths
                    .get(column)
                    .copied()
                    .unwrap_or(160) as f64
                    / 7.0,
            )
            .map_err(|error| error.to_string())?;
    }
    for (row_index, row) in document.rows.iter().enumerate() {
        for (column, value) in row.iter().enumerate() {
            let row_number = (row_index + 1) as u32;
            let column_number = column as u16;
            match document.column_types.get(column).map(String::as_str) {
                Some("integer" | "number") if value.parse::<f64>().is_ok() => worksheet
                    .write_number(row_number, column_number, value.parse::<f64>().unwrap())
                    .map_err(|error| error.to_string())?,
                Some("boolean")
                    if matches!(value.to_ascii_lowercase().as_str(), "true" | "false") =>
                {
                    worksheet
                        .write_boolean(
                            row_number,
                            column_number,
                            value.eq_ignore_ascii_case("true"),
                        )
                        .map_err(|error| error.to_string())?
                }
                _ => worksheet
                    .write_string(row_number, column_number, value)
                    .map_err(|error| error.to_string())?,
            };
        }
    }
    workbook.save_to_buffer().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn export_table_file(
    library_root: String,
    path: String,
    format: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing_file(path, &["csv", "tsv", "json"])?;
    ensure_table_path(&source)?;
    let directory = source.parent().ok_or("源文件没有父目录")?.to_path_buf();
    let file_name = source.file_name().unwrap_or_default().to_string_lossy();
    let stem = file_name
        .strip_suffix(".table.json")
        .unwrap_or_else(|| {
            source
                .file_stem()
                .unwrap_or_default()
                .to_str()
                .unwrap_or("数据表")
        })
        .to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let document = parse_any_table(&source)?;
        let (suffix, output) = match format.as_str() {
            "csv" => (".csv", export_delimited(&document, b',')?),
            "tsv" => (".tsv", export_delimited(&document, b'\t')?),
            "xlsx" => (".xlsx", export_xlsx(&document)?),
            _ => return Err("仅支持导出 CSV、TSV 或 XLSX".into()),
        };
        let target = available_output_path(&directory, &stem, suffix);
        write_bytes(&target, &output)?;
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("Table 导出任务失败: {}", error))?
}

fn write_table(file: &Path, payload: TableWritePayload) -> Result<TableWriteResult, String> {
    let metadata = file
        .metadata()
        .map_err(|error| format!("读取表格元数据失败: {}", error))?;
    let current_bytes = fs::read(file).map_err(|error| format!("读取表格失败: {}", error))?;
    if file_signature(&metadata, &current_bytes) != payload.expected_signature {
        return Err("CSV/TSV 已被其他程序修改，请重新加载后再保存".into());
    }
    let expected_delimiter = table_delimiter(file)?;
    let delimiter = payload
        .delimiter
        .as_bytes()
        .first()
        .copied()
        .unwrap_or(expected_delimiter);
    if delimiter != expected_delimiter {
        return Err("分隔符与文件扩展名不匹配".into());
    }
    let columns = validate_shape(&payload.headers, &payload.rows)?;
    let mut writer = WriterBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .terminator(if payload.line_ending == "crlf" {
            Terminator::CRLF
        } else {
            Terminator::Any(b'\n')
        })
        .from_writer(Vec::new());
    writer
        .write_record(padded(payload.headers, columns))
        .map_err(|error| format!("写入表头失败: {}", error))?;
    for row in payload.rows {
        writer
            .write_record(padded(row, columns))
            .map_err(|error| format!("写入表格失败: {}", error))?;
    }
    let utf8 = writer
        .into_inner()
        .map_err(|error| format!("完成表格序列化失败: {}", error))?;
    let utf8 = String::from_utf8(utf8).map_err(|error| error.to_string())?;
    let encoding = Encoding::for_label(payload.encoding.as_bytes()).ok_or("原表格编码不受支持")?;
    let (encoded, _, had_errors) = encoding.encode(&utf8);
    if had_errors {
        return Err(format!(
            "当前内容包含无法写回 {} 编码的字符；请删除这些字符或转换为 UTF-8",
            encoding.name()
        ));
    }
    let mut output = Vec::with_capacity(encoded.len() + 3);
    if payload.has_bom && encoding == encoding_rs::UTF_8 {
        output.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    output.extend_from_slice(&encoded);
    if output.len() as u64 > MAX_TABLE_BYTES {
        return Err("保存结果超过 32 MB 上限".into());
    }
    write_bytes(file, &output)?;
    let saved = file
        .metadata()
        .map_err(|error| format!("读取保存结果失败: {}", error))?;
    Ok(TableWriteResult {
        signature: file_signature(&saved, &output),
        size: saved.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant, SystemTime};

    fn temp_table(extension: &str, content: &[u8]) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-table-test-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("fixture.{extension}"));
        fs::write(&path, content).unwrap();
        path
    }

    fn payload(document: &TableDocument) -> TableWritePayload {
        TableWritePayload {
            delimiter: document.delimiter.clone(),
            encoding: document.encoding.clone(),
            has_bom: document.has_bom,
            line_ending: document.line_ending.clone(),
            expected_signature: document.signature.clone(),
            headers: document.headers.clone(),
            rows: document.rows.clone(),
            column_types: document.column_types.clone(),
            column_ids: document.column_ids.clone(),
            row_ids: document.row_ids.clone(),
            view: document.view.clone(),
            views: document.views.clone(),
            active_view: document.active_view.clone(),
        }
    }

    #[test]
    fn parses_quoted_multiline_and_flexible_csv_rows() {
        let path = temp_table(
            "csv",
            b"name,notes,count\r\nalpha,\"comma, and\nnewline\",12\r\nbeta,short\r\n",
        );
        let document = parse_table(&path).unwrap();
        assert_eq!(document.headers, ["name", "notes", "count"]);
        assert_eq!(document.rows.len(), 2);
        assert_eq!(document.rows[0][1], "comma, and\nnewline");
        assert_eq!(document.rows[1], ["beta", "short", ""]);
        assert_eq!(document.line_ending, "crlf");
        assert_eq!(document.column_types, ["text", "text", "integer"]);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn parses_tsv_and_infers_common_types() {
        let path = temp_table(
            "tsv",
            b"id\tactive\tcreated\tamount\n1\ttrue\t2026-07-19\t3.5\n2\tfalse\t2026-07-20\t4.25\n",
        );
        let document = parse_table(&path).unwrap();
        assert_eq!(document.delimiter, "\t");
        assert_eq!(
            document.column_types,
            ["integer", "boolean", "date", "number"]
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn preserves_utf8_bom_crlf_and_quotes_on_write() {
        let path = temp_table("csv", b"\xef\xbb\xbfkey,value\r\na,\"hello, world\"\r\n");
        let document = parse_table(&path).unwrap();
        let mut next = payload(&document);
        next.rows[0][1] = "line one\nline two".into();
        let result = write_table(&path, next).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert!(String::from_utf8_lossy(&bytes).contains("\r\n"));
        assert_eq!(
            result.signature,
            file_signature(&path.metadata().unwrap(), &bytes)
        );
        let reloaded = parse_table(&path).unwrap();
        assert_eq!(reloaded.rows[0][1], "line one\nline two");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_save_after_external_same_size_change() {
        let path = temp_table("csv", b"key,value\na,one\n");
        let document = parse_table(&path).unwrap();
        fs::write(&path, b"key,value\na,two\n").unwrap();
        let error = write_table(&path, payload(&document)).unwrap_err();
        assert!(error.contains("其他程序修改"));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn external_table_requires_authorization_and_preserves_source_conflicts() {
        let path = temp_table("csv", b"key,value\na,one\n");
        let path_string = path.to_string_lossy().into_owned();
        let access = ExternalFileAccess::default();

        assert!(
            tauri::async_runtime::block_on(read_external_table_file_with_access(
                path_string.clone(),
                &access,
            ))
            .unwrap_err()
            .contains("authorized")
        );

        access.authorize_editable(&path).unwrap();
        let opened = tauri::async_runtime::block_on(read_external_table_file_with_access(
            path_string.clone(),
            &access,
        ))
        .unwrap();
        assert_eq!(opened.format, "csv");

        let mut updated = payload(&opened);
        updated.rows[0][1] = "saved".into();
        let saved = tauri::async_runtime::block_on(write_external_table_file_with_access(
            path_string.clone(),
            updated,
            &access,
        ))
        .unwrap();
        assert_eq!(parse_table(&path).unwrap().rows[0][1], "saved");

        fs::write(&path, b"key,value\na,two\n").unwrap();
        let mut stale_payload = payload(&opened);
        stale_payload.expected_signature = saved.signature;
        let stale = tauri::async_runtime::block_on(write_external_table_file_with_access(
            path_string,
            stale_payload,
            &access,
        ))
        .unwrap_err();
        assert!(stale.contains("其他程序修改"));
        assert_eq!(fs::read(&path).unwrap(), b"key,value\na,two\n");

        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn parses_fifty_thousand_rows_within_first_screen_budget() {
        let mut content = String::from("id,name,amount,active\n");
        for index in 0..50_000 {
            content.push_str(&format!(
                "{index},item {index},{:.2},{}\n",
                index as f64 / 3.0,
                index % 2 == 0
            ));
        }
        let path = temp_table("csv", content.as_bytes());
        let started = Instant::now();
        let document = parse_table(&path).unwrap();
        let elapsed = started.elapsed();
        assert_eq!(document.rows.len(), 50_000);
        assert!(
            elapsed < Duration::from_secs(2),
            "50k rows parsed in {elapsed:?}"
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn internal_table_round_trips_data_ids_and_view_config() {
        let source = temp_table("csv", b"name,score\nAlpha,95\nBeta,88\n");
        let source_document = parse_table(&source).unwrap();
        let internal = internal_from_document(&source_document);
        let path = source.parent().unwrap().join("fixture.table.json");
        fs::write(&path, serde_json::to_vec_pretty(&internal).unwrap()).unwrap();
        let document = parse_internal(&path).unwrap();
        assert_eq!(document.column_ids, ["column-1", "column-2"]);
        assert_eq!(document.row_ids, ["row-1", "row-2"]);
        let mut next = payload(&document);
        next.rows[0][1] = "96".into();
        next.view.filter = "Alpha".into();
        next.view.sort_column = Some("column-2".into());
        next.view.sort_direction = "desc".into();
        next.view.column_widths = vec![220, 120];
        next.views.push(TableViewDefinition {
            id: "board".into(),
            name: "看板".into(),
            kind: "board".into(),
            config: TableViewState {
                group_by: Some("column-1".into()),
                title_column: Some("column-1".into()),
                card_columns: vec!["column-2".into()],
                ..Default::default()
            },
        });
        next.views.push(TableViewDefinition {
            id: "chart".into(),
            name: "图表".into(),
            kind: "chart".into(),
            config: TableViewState {
                category_column: Some("column-1".into()),
                value_column: Some("column-2".into()),
                series_column: Some("column-1".into()),
                aggregation: "average".into(),
                chart_type: "line".into(),
                null_strategy: "zero".into(),
                show_legend: false,
                ..Default::default()
            },
        });
        next.views.push(TableViewDefinition {
            id: "dashboard".into(),
            name: "仪表盘".into(),
            kind: "dashboard".into(),
            config: TableViewState {
                filter: "Alpha".into(),
                dashboard_items: vec![DashboardItemState {
                    chart_view_id: "chart".into(),
                    width: 8,
                }],
                ..Default::default()
            },
        });
        write_internal_table(&path, next).unwrap();
        let reloaded = parse_internal(&path).unwrap();
        assert_eq!(reloaded.rows[0][1], "96");
        assert_eq!(reloaded.view.filter, "Alpha");
        assert_eq!(reloaded.view.sort_column.as_deref(), Some("column-2"));
        assert_eq!(reloaded.view.column_widths, [220, 120]);
        assert_eq!(reloaded.views.len(), 4);
        assert_eq!(reloaded.views[1].kind, "board");
        assert_eq!(
            reloaded.views[1].config.group_by.as_deref(),
            Some("column-1")
        );
        assert_eq!(reloaded.views[2].config.chart_type, "line");
        assert_eq!(
            reloaded.views[2].config.series_column.as_deref(),
            Some("column-1")
        );
        assert_eq!(reloaded.views[2].config.null_strategy, "zero");
        assert!(!reloaded.views[2].config.show_legend);
        assert_eq!(reloaded.views[3].kind, "dashboard");
        assert_eq!(reloaded.views[3].config.filter, "Alpha");
        assert_eq!(
            reloaded.views[3].config.dashboard_items[0].chart_view_id,
            "chart"
        );
        assert_eq!(reloaded.views[3].config.dashboard_items[0].width, 8);
        let mut switched = payload(&reloaded);
        switched.active_view = "board".into();
        switched.view = switched.views[1].config.clone();
        write_internal_table(&path, switched).unwrap();
        let board = parse_internal(&path).unwrap();
        assert_eq!(board.active_view, "board");
        assert_eq!(board.view.group_by.as_deref(), Some("column-1"));
        fs::remove_dir_all(source.parent().unwrap()).unwrap();
    }

    #[test]
    fn exports_valid_csv_and_xlsx_buffers() {
        let path = temp_table("csv", b"name,score\nAlpha,95\n");
        let document = parse_table(&path).unwrap();
        let csv = export_delimited(&document, b',').unwrap();
        assert_eq!(String::from_utf8(csv).unwrap(), "name,score\nAlpha,95\n");
        let xlsx = export_xlsx(&document).unwrap();
        assert!(xlsx.starts_with(b"PK"));
        assert!(xlsx.len() > 1_000);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn import_create_and_export_commands_stay_inside_workspace() {
        let csv = temp_table("csv", b"name,score\nAlpha,95\n");
        let root = csv.parent().unwrap().to_path_buf();
        let imported = tauri::async_runtime::block_on(import_table_file(
            root.to_string_lossy().into_owned(),
            csv.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(imported.ends_with("fixture.table.json"));
        let xlsx = tauri::async_runtime::block_on(export_table_file(
            root.to_string_lossy().into_owned(),
            imported.clone(),
            "xlsx".into(),
        ))
        .unwrap();
        assert!(fs::read(xlsx).unwrap().starts_with(b"PK"));
        let created = tauri::async_runtime::block_on(create_table_file(
            root.to_string_lossy().into_owned(),
            None,
            Some("Roadmap".into()),
        ))
        .unwrap();
        assert_eq!(
            parse_internal(Path::new(&created)).unwrap().headers,
            ["名称"]
        );

        let outside = root.parent().unwrap().join(format!(
            "outside-{}.csv",
            root.file_name().unwrap_or_default().to_string_lossy()
        ));
        fs::write(&outside, b"x\ny\n").unwrap();
        assert!(tauri::async_runtime::block_on(import_table_file(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
        ))
        .is_err());
        fs::remove_file(outside).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
