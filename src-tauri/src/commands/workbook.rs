use crate::commands::table::{
    available_output_path, infer_column_type, internal_from_document, TableDocument, TableViewState,
};
use crate::formats::table::{
    validate_internal_table, MAX_INTERNAL_TABLE_BYTES, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS,
};
use crate::formats::workbook::{
    WorkbookCalculationPayload, WorkbookCalculationResult, WorkbookCapabilities,
    WorkbookCapabilityLevel, WorkbookCell, WorkbookDocument, WorkbookEngine, WorkbookSheetPage,
    WorkbookWritePayload,
};
use crate::formats::workbook_calculation::calculate_workbook;
use crate::formats::workbook_formula::{
    translate_formula, WorkbookFormulaTranslation, MAX_FORMULA_TRANSLATIONS,
};
use crate::formats::workbook_ooxml::{
    patch_workbook, read_workbook_sheet_layout, validate_workbook_package,
};
use crate::sanitize_filename;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes};
use crate::services::workspace_guard::WorkspaceGuard;
use calamine::{open_workbook, CellType, Data, Reader, Xlsx};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_WORKBOOK_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PAGE_ROWS: usize = 5_000;
const MAX_PREVIEW_COLUMNS: usize = 256;

#[derive(Clone, Copy, Debug, Default)]
struct CalamineWorkbookEngine;

fn workbook_signature(metadata: &fs::Metadata, bytes: &[u8]) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}:{}:{:x}", metadata.len(), modified, md5::compute(bytes))
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

impl WorkbookEngine for CalamineWorkbookEngine {
    fn capabilities(&self) -> WorkbookCapabilities {
        WorkbookCapabilities {
            engine_id: "calamine-ooxml-ironcalc-v6".into(),
            extensions: vec!["xlsx".into()],
            read: WorkbookCapabilityLevel::Supported,
            cached_formula_results: WorkbookCapabilityLevel::Supported,
            existing_cell_editing: WorkbookCapabilityLevel::Supported,
            blank_cell_creation: WorkbookCapabilityLevel::Supported,
            range_editing: WorkbookCapabilityLevel::Supported,
            clipboard_tsv: WorkbookCapabilityLevel::Supported,
            conflict_detection: WorkbookCapabilityLevel::Supported,
            ooxml_part_preservation: WorkbookCapabilityLevel::Supported,
            cell_editing: WorkbookCapabilityLevel::Supported,
            formatting: WorkbookCapabilityLevel::Supported,
            row_column_selection: WorkbookCapabilityLevel::Supported,
            multi_area_selection: WorkbookCapabilityLevel::Supported,
            fill_handle: WorkbookCapabilityLevel::Supported,
            formula_reference_translation: WorkbookCapabilityLevel::Supported,
            formula_dependency_graph: WorkbookCapabilityLevel::Supported,
            formula_recalculation: WorkbookCapabilityLevel::Supported,
            charts: WorkbookCapabilityLevel::Planned,
            pivot_tables: WorkbookCapabilityLevel::Planned,
            data_validation: WorkbookCapabilityLevel::Planned,
            print_layout: WorkbookCapabilityLevel::Planned,
            xlsx_round_trip: WorkbookCapabilityLevel::Planned,
            max_file_bytes: MAX_WORKBOOK_BYTES,
            max_page_rows: MAX_PAGE_ROWS,
            max_preview_columns: MAX_PREVIEW_COLUMNS,
        }
    }

    fn inspect(&self, path: &Path) -> Result<WorkbookDocument, String> {
        recover_interrupted_write(path)?;
        let metadata = path
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {}", error))?;
        let bytes = fs::read(path).map_err(|error| format!("读取 XLSX 失败: {}", error))?;
        let workbook = open_xlsx(path)?;
        let sheets = workbook.sheet_names().to_vec();
        if sheets.is_empty() {
            return Err("XLSX 不包含可读取的工作表".into());
        }
        Ok(WorkbookDocument {
            path: path.to_string_lossy().into_owned(),
            size: metadata.len(),
            signature: workbook_signature(&metadata, &bytes),
            sheets,
        })
    }

    fn read_sheet(
        &self,
        path: &Path,
        sheet: &str,
        row_offset: usize,
        row_limit: usize,
    ) -> Result<WorkbookSheetPage, String> {
        let mut workbook = open_xlsx(path)?;
        if !workbook.sheet_names().iter().any(|name| name == sheet) {
            return Err("指定的工作表不存在".into());
        }
        let values = workbook
            .worksheet_range(sheet)
            .map_err(|error| format!("读取工作表失败: {}", error))?;
        let formulas = workbook
            .worksheet_formula(sheet)
            .map_err(|error| format!("读取公式失败: {}", error))?;
        let source = fs::read(path).map_err(|error| format!("读取 XLSX 样式失败: {error}"))?;
        let (total_rows, total_columns) = used_dimensions(&values);
        let formula_dimensions = used_dimensions(&formulas);
        let requested_end = row_offset.saturating_add(row_limit.clamp(1, MAX_PAGE_ROWS));
        let (sheet_extent, styles) = read_workbook_sheet_layout(
            &source,
            sheet,
            row_offset,
            requested_end,
            MAX_PREVIEW_COLUMNS,
        )?;
        let total_rows = total_rows.max(formula_dimensions.0).max(sheet_extent.0);
        let total_columns = total_columns.max(formula_dimensions.1).max(sheet_extent.1);
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
                            style: styles.get(&(row, column)).cloned().unwrap_or_default(),
                        }
                    })
                    .collect()
            })
            .collect();
        Ok(WorkbookSheetPage {
            sheet: sheet.to_string(),
            row_offset,
            total_rows,
            total_columns,
            returned_columns,
            rows,
            truncated_columns: total_columns > returned_columns,
        })
    }
}

#[tauri::command]
pub fn get_workbook_capabilities() -> WorkbookCapabilities {
    CalamineWorkbookEngine.capabilities()
}

#[tauri::command]
pub fn translate_workbook_formulas(
    requests: Vec<WorkbookFormulaTranslation>,
) -> Result<Vec<String>, String> {
    if requests.len() > MAX_FORMULA_TRANSLATIONS {
        return Err(format!("单次最多迁移 {MAX_FORMULA_TRANSLATIONS} 个公式"));
    }
    requests
        .into_iter()
        .map(|request| translate_formula(&request.formula, request.row_delta, request.column_delta))
        .collect()
}

#[tauri::command]
pub async fn recalculate_workbook_formulas(
    library_root: String,
    path: String,
    payload: WorkbookCalculationPayload,
) -> Result<WorkbookCalculationResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再重算".into());
        }
        validate_workbook_package(&source)?;
        let name = file
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("workbook.xlsx");
        calculate_workbook(&source, name, payload)
    })
    .await
    .map_err(|error| format!("公式重算任务失败: {error}"))?
}

#[tauri::command]
pub async fn read_workbook_file(
    library_root: String,
    path: String,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || CalamineWorkbookEngine.inspect(&file))
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
        CalamineWorkbookEngine.read_sheet(&file, &sheet, row_offset, row_limit)
    })
    .await
    .map_err(|error| format!("工作表读取任务失败: {}", error))?
}

#[tauri::command]
pub async fn write_workbook_cells(
    library_root: String,
    path: String,
    payload: WorkbookWritePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("读取 XLSX 失败: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("读取 XLSX 元数据失败: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再保存".into());
        }
        let output = patch_workbook(&source, &payload.edits, &payload.style_edits)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 写回任务失败: {error}"))?
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
    use crate::formats::workbook::{
        WorkbookCellEdit, WorkbookCellStyleEdit, WorkbookStylePatch, WorkbookWritePayload,
    };
    use rust_xlsxwriter::{Format, Formula, Workbook};
    use std::io::{Cursor, Read};
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
        first
            .merge_range(4, 0, 4, 1, "合并区域", &Format::new().set_bold())
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

    #[test]
    fn committed_compatibility_fixture_matches_engine_contract() {
        let fixture_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/workbook");
        let workbook_path = fixture_root.join("compatibility-baseline.xlsx");
        let expectation: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("compatibility-baseline.json")).unwrap(),
        )
        .unwrap();
        let engine = CalamineWorkbookEngine;

        let document = engine.inspect(&workbook_path).unwrap();
        assert_eq!(
            document.sheets,
            expectation["sheets"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_str().unwrap().to_string())
                .collect::<Vec<_>>()
        );
        let page = engine
            .read_sheet(&workbook_path, "Summary", 0, 100)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha");
        assert_eq!(page.rows[1][1].value, "1250.5");
        assert_eq!(page.rows[1][2].value, "true");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2:B2)"));
        assert_eq!(page.rows[2][1].value, "1250.5");
        assert!(page.rows[0][0].style.bold);
        assert_eq!(page.rows[0][0].style.font_color.as_deref(), Some("#FFFFFF"));
        assert_eq!(page.rows[0][0].style.fill_color.as_deref(), Some("#2563EB"));
        assert_eq!(page.rows[1][1].style.number_format, "currency");

        let capabilities = engine.capabilities();
        assert_eq!(capabilities.read, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.cached_formula_results,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.cell_editing,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.blank_cell_creation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.existing_cell_editing,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.conflict_detection,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.formatting, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.xlsx_round_trip,
            WorkbookCapabilityLevel::Planned
        );
    }

    fn zip_part(bytes: &[u8], name: &str) -> Vec<u8> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut part = archive.by_name(name).unwrap();
        let mut output = Vec::new();
        part.read_to_end(&mut output).unwrap();
        output
    }

    #[test]
    fn writes_existing_cells_preserves_unedited_parts_and_rejects_stale_save() {
        let (base, path) = fixture();
        let root = base.join("library");
        let root_string = root.to_string_lossy().into_owned();
        let path_string = path.to_string_lossy().into_owned();
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature.clone(),
            edits: vec![
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 0,
                    input: "编辑完成".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 1,
                    input: "99".into(),
                    kind: "number".into(),
                },
                WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 2,
                    column: 1,
                    input: "=SUM(B2, 1)".into(),
                    kind: "formula".into(),
                },
            ],
            style_edits: vec![],
        };
        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            root_string.clone(),
            path_string.clone(),
            payload,
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 100)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "编辑完成");
        assert_eq!(page.rows[1][1].value, "99");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 1)"));

        let after = fs::read(&path).unwrap();
        assert_eq!(
            zip_part(&before, "xl/styles.xml"),
            zip_part(&after, "xl/styles.xml")
        );
        let stale = WorkbookWritePayload {
            expected_signature: document.signature,
            edits: vec![WorkbookCellEdit {
                sheet: "进度".into(),
                row: 1,
                column: 0,
                input: "不应写入".into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
        };
        assert!(tauri::async_runtime::block_on(write_workbook_cells(
            root_string,
            path_string,
            stale,
        ))
        .unwrap_err()
        .contains("其他程序修改"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn creates_cells_in_existing_and_new_rows() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let merged_result = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 4,
                    column: 1,
                    input: "不能写入".into(),
                    kind: "string".into(),
                }],
                style_edits: vec![],
            },
        ));
        assert!(merged_result.unwrap_err().contains("只能编辑左上角"));
        let result = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 1,
                        column: 2,
                        input: "同一行新单元格".into(),
                        kind: "string".into(),
                    },
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 100,
                        column: 10,
                        input: "全新行单元格".into(),
                        kind: "string".into(),
                    },
                    WorkbookCellEdit {
                        sheet: "进度".into(),
                        row: 2,
                        column: 0,
                        input: "公式前插入".into(),
                        kind: "string".into(),
                    },
                ],
                style_edits: vec![],
            },
        ))
        .unwrap();
        assert!(result.size > 0);
        let first_page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_eq!(first_page.rows[1][2].value, "同一行新单元格");
        assert_eq!(first_page.rows[2][0].value, "公式前插入");
        let later_page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 100, 10)
            .unwrap();
        assert_eq!(later_page.rows[0][10].value, "全新行单元格");
        let bytes = fs::read(&path).unwrap();
        let sheet_xml = String::from_utf8(zip_part(&bytes, "xl/worksheets/sheet1.xml")).unwrap();
        assert!(sheet_xml.contains("dimension ref=\"A1:K101\""));
        let a3 = sheet_xml.find("r=\"A3\"").unwrap();
        let b3 = sheet_xml.find("r=\"B3\"").unwrap();
        assert!(a3 < b3);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn reads_and_writes_basic_styles_without_rewriting_cell_values() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let before = fs::read(&path).unwrap();
        let formula_before =
            String::from_utf8(zip_part(&before, "xl/worksheets/sheet1.xml")).unwrap();
        let invalid = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![],
                style_edits: vec![WorkbookCellStyleEdit {
                    sheet: "进度".into(),
                    row: 1,
                    column: 1,
                    patch: WorkbookStylePatch {
                        font_size: Some(100.0),
                        ..Default::default()
                    },
                }],
            },
        ));
        assert!(invalid.unwrap_err().contains("字号必须"));
        let merged = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature.clone(),
                edits: vec![],
                style_edits: vec![WorkbookCellStyleEdit {
                    sheet: "进度".into(),
                    row: 4,
                    column: 1,
                    patch: WorkbookStylePatch {
                        bold: Some(true),
                        ..Default::default()
                    },
                }],
            },
        ));
        assert!(merged.unwrap_err().contains("只能编辑左上角"));
        tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![],
                style_edits: vec![
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 1,
                        column: 1,
                        patch: WorkbookStylePatch {
                            number_format: Some("percent".into()),
                            bold: Some(true),
                            fill_color: Some("#DDEBF7".into()),
                            border_style: Some("thin".into()),
                            border_color: Some("#4472C4".into()),
                            horizontal_alignment: Some("center".into()),
                            ..Default::default()
                        },
                    },
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 2,
                        column: 1,
                        patch: WorkbookStylePatch {
                            italic: Some(true),
                            font_color: Some("#C00000".into()),
                            ..Default::default()
                        },
                    },
                    WorkbookCellStyleEdit {
                        sheet: "进度".into(),
                        row: 8,
                        column: 3,
                        patch: WorkbookStylePatch {
                            fill_color: Some("#FFF2CC".into()),
                            ..Default::default()
                        },
                    },
                ],
            },
        ))
        .unwrap();

        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 20)
            .unwrap();
        assert_eq!(page.rows[1][1].value, "75");
        assert_eq!(page.rows[1][1].style.number_format, "percent");
        assert!(page.rows[1][1].style.bold);
        assert_eq!(page.rows[1][1].style.fill_color.as_deref(), Some("#DDEBF7"));
        assert_eq!(page.rows[1][1].style.border_style, "thin");
        assert_eq!(page.rows[1][1].style.horizontal_alignment, "center");
        assert_eq!(page.rows[2][1].formula.as_deref(), Some("=SUM(B2, 5)"));
        assert!(page.rows[2][1].style.italic);
        assert_eq!(page.rows[2][1].style.font_color.as_deref(), Some("#C00000"));
        assert_eq!(page.rows[8][3].style.fill_color.as_deref(), Some("#FFF2CC"));

        let after = fs::read(&path).unwrap();
        let formula_after =
            String::from_utf8(zip_part(&after, "xl/worksheets/sheet1.xml")).unwrap();
        assert!(formula_before.contains("<f>SUM(B2, 5)</f>"));
        assert!(formula_after.contains("<f>SUM(B2, 5)</f>"));
        assert_ne!(
            zip_part(&before, "xl/styles.xml"),
            zip_part(&after, "xl/styles.xml")
        );
        fs::remove_dir_all(base).unwrap();
    }
}
