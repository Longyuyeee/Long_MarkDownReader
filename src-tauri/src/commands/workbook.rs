use crate::commands::table::{
    available_output_path, infer_column_type, internal_from_document, TableDocument, TableViewState,
};
use crate::formats::table::{
    validate_internal_table, MAX_INTERNAL_TABLE_BYTES, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS,
};
use crate::sanitize_filename;
use crate::services::reliable_write::write_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use calamine::{open_workbook, CellType, Data, Reader, Xlsx};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_WORKBOOK_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PAGE_ROWS: usize = 5_000;
const MAX_PREVIEW_COLUMNS: usize = 256;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookDocument {
    pub path: String,
    pub size: u64,
    pub signature: String,
    pub sheets: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookCell {
    pub value: String,
    pub formula: Option<String>,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookSheetPage {
    pub sheet: String,
    pub row_offset: usize,
    pub total_rows: usize,
    pub total_columns: usize,
    pub returned_columns: usize,
    pub rows: Vec<Vec<WorkbookCell>>,
    pub truncated_columns: bool,
}

fn workbook_signature(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}:{}", metadata.len(), modified)
}

fn ensure_workbook(path: &Path) -> Result<(), String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 XLSX 元数据失败: {}", error))?;
    if metadata.len() > MAX_WORKBOOK_BYTES {
        return Err("XLSX 文件不能超过 128 MB".into());
    }
    Ok(())
}

fn open_xlsx(path: &Path) -> Result<Xlsx<std::io::BufReader<fs::File>>, String> {
    ensure_workbook(path)?;
    open_workbook(path).map_err(|error| format!("解析 XLSX 失败: {}", error))
}

fn cell_kind(cell: &Data) -> &'static str {
    match cell {
        Data::Empty => "empty",
        Data::String(_) => "text",
        Data::Float(_) => "number",
        Data::Int(_) => "integer",
        Data::Bool(_) => "boolean",
        Data::DateTime(_) | Data::DateTimeIso(_) | Data::DurationIso(_) => "date",
        Data::Error(_) => "error",
    }
}

fn normalized_formula(value: Option<&String>) -> Option<String> {
    value
        .filter(|formula| !formula.trim().is_empty())
        .map(|formula| {
            if formula.starts_with('=') {
                formula.clone()
            } else {
                format!("={}", formula)
            }
        })
}

fn used_dimensions<T: CellType>(range: &calamine::Range<T>) -> (usize, usize) {
    range
        .end()
        .map(|(row, column)| (row as usize + 1, column as usize + 1))
        .unwrap_or((0, 0))
}

#[tauri::command]
pub async fn read_workbook_file(
    library_root: String,
    path: String,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {}", error))?;
        let workbook = open_xlsx(&file)?;
        let sheets = workbook.sheet_names().to_vec();
        if sheets.is_empty() {
            return Err("XLSX 不包含可读取的工作表".into());
        }
        Ok(WorkbookDocument {
            path: file.to_string_lossy().into_owned(),
            size: metadata.len(),
            signature: workbook_signature(&metadata),
            sheets,
        })
    })
    .await
    .map_err(|error| format!("XLSX 读取任务失败: {}", error))?
}

#[tauri::command]
pub async fn read_workbook_sheet(
    library_root: String,
    path: String,
    sheet: String,
    row_offset: usize,
    row_limit: usize,
) -> Result<WorkbookSheetPage, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut workbook = open_xlsx(&file)?;
        if !workbook.sheet_names().iter().any(|name| name == &sheet) {
            return Err("指定的工作表不存在".into());
        }
        let values = workbook
            .worksheet_range(&sheet)
            .map_err(|error| format!("读取工作表失败: {}", error))?;
        let formulas = workbook
            .worksheet_formula(&sheet)
            .map_err(|error| format!("读取公式失败: {}", error))?;
        let (total_rows, total_columns) = used_dimensions(&values);
        let formula_dimensions = used_dimensions(&formulas);
        let total_rows = total_rows.max(formula_dimensions.0);
        let total_columns = total_columns.max(formula_dimensions.1);
        let returned_columns = total_columns.min(MAX_PREVIEW_COLUMNS);
        let row_offset = row_offset.min(total_rows);
        let row_limit = row_limit.clamp(1, MAX_PAGE_ROWS);
        let end = total_rows.min(row_offset.saturating_add(row_limit));
        let rows = (row_offset..end)
            .map(|row| {
                (0..returned_columns)
                    .map(|column| {
                        let value = values
                            .get_value((row as u32, column as u32))
                            .cloned()
                            .unwrap_or(Data::Empty);
                        let formula =
                            normalized_formula(formulas.get_value((row as u32, column as u32)));
                        WorkbookCell {
                            value: value.to_string(),
                            formula,
                            kind: cell_kind(&value).into(),
                        }
                    })
                    .collect()
            })
            .collect();
        Ok(WorkbookSheetPage {
            sheet,
            row_offset,
            total_rows,
            total_columns,
            returned_columns,
            rows,
            truncated_columns: total_columns > returned_columns,
        })
    })
    .await
    .map_err(|error| format!("工作表读取任务失败: {}", error))?
}

fn sheet_to_table(source: &Path, sheet: &str) -> Result<PathBuf, String> {
    let mut workbook = open_xlsx(source)?;
    if !workbook.sheet_names().iter().any(|name| name == sheet) {
        return Err("指定的工作表不存在".into());
    }
    let range = workbook
        .worksheet_range(sheet)
        .map_err(|error| format!("读取工作表失败: {}", error))?;
    let (total_rows, total_columns) = used_dimensions(&range);
    if total_columns == 0 {
        return Err("空工作表无法转换为 Table".into());
    }
    if total_columns > MAX_TABLE_COLUMNS {
        return Err(format!("工作表超过 {} 列上限", MAX_TABLE_COLUMNS));
    }
    if total_rows.saturating_sub(1) > MAX_TABLE_ROWS {
        return Err(format!("工作表超过 {} 条数据行上限", MAX_TABLE_ROWS));
    }
    let value_at = |row: usize, column: usize| {
        range
            .get_value((row as u32, column as u32))
            .map(ToString::to_string)
            .unwrap_or_default()
    };
    let headers = (0..total_columns)
        .map(|column| {
            let value = value_at(0, column).trim().to_string();
            if value.is_empty() {
                format!("列 {}", column + 1)
            } else {
                value
            }
        })
        .collect::<Vec<_>>();
    let rows = (1..total_rows)
        .map(|row| {
            (0..total_columns)
                .map(|column| value_at(row, column))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let column_types = (0..total_columns)
        .map(|column| infer_column_type(&rows, column))
        .collect::<Vec<_>>();
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    let safe_sheet = sanitize_filename(sheet);
    let target_stem = sanitize_filename(&format!("{} - {}", stem, safe_sheet));
    let directory = source.parent().ok_or("XLSX 文件没有父目录")?;
    let target = available_output_path(directory, &target_stem, ".table.json");
    let document = TableDocument {
        path: target.to_string_lossy().into_owned(),
        format: "longedit-table".into(),
        delimiter: ",".into(),
        encoding: "UTF-8".into(),
        has_bom: false,
        line_ending: "lf".into(),
        signature: String::new(),
        headers,
        rows,
        column_types,
        column_ids: (0..total_columns)
            .map(|index| format!("column-{}", index + 1))
            .collect(),
        row_ids: (1..total_rows)
            .map(|index| format!("row-{}", index))
            .collect(),
        view: TableViewState::default(),
        views: Vec::new(),
        active_view: "grid".into(),
    };
    let internal = internal_from_document(&document);
    validate_internal_table(&internal)?;
    let output = serde_json::to_vec_pretty(&internal).map_err(|error| error.to_string())?;
    if output.len() > MAX_INTERNAL_TABLE_BYTES {
        return Err("转换后的 Table 超过 64 MB 上限".into());
    }
    write_bytes(&target, &output)?;
    Ok(target)
}

#[tauri::command]
pub async fn import_workbook_sheet(
    library_root: String,
    path: String,
    sheet: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        sheet_to_table(&source, &sheet).map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("XLSX 导入任务失败: {}", error))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_xlsxwriter::{Formula, Workbook};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture() -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("project.xlsx");
        let mut workbook = Workbook::new();
        let first = workbook.add_worksheet();
        first.set_name("进度").unwrap();
        first.write_string(0, 0, "项目").unwrap();
        first.write_string(0, 1, "完成").unwrap();
        first.write_string(1, 0, "图谱").unwrap();
        first.write_number(1, 1, 75).unwrap();
        first
            .write_formula(2, 1, Formula::new("=SUM(B2, 5)").set_result("80"))
            .unwrap();
        workbook.add_worksheet().set_name("说明").unwrap();
        workbook.save(&path).unwrap();
        (base, path)
    }

    #[test]
    fn reads_multiple_sheets_values_and_formulas() {
        let (base, path) = fixture();
        let document = tauri::async_runtime::block_on(read_workbook_file(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(document.sheets, ["进度", "说明"]);
        let page = tauri::async_runtime::block_on(read_workbook_sheet(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "进度".into(),
            0,
            100,
        ))
        .unwrap();
        assert_eq!(page.rows[1][1].value, "75");
        assert_eq!(page.rows[2][1].value, "80");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 5)"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn imports_selected_sheet_as_open_table() {
        let (base, path) = fixture();
        let root = base.join("library");
        let target = tauri::async_runtime::block_on(import_workbook_sheet(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            "进度".into(),
        ))
        .unwrap();
        let parsed =
            crate::formats::table::parse_internal_table(&fs::read_to_string(target).unwrap())
                .unwrap();
        assert_eq!(parsed.data.columns[0].name, "项目");
        assert_eq!(parsed.data.rows[0].values["column-2"], "75");
        fs::remove_dir_all(base).unwrap();
    }
}
