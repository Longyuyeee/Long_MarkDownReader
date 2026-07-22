use crate::commands::table::{
    available_output_path, infer_column_type, internal_from_document, TableDocument, TableViewState,
};
use crate::formats::table::{
    validate_internal_table, MAX_INTERNAL_TABLE_BYTES, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS,
};
use crate::formats::workbook::{
    WorkbookCalculationPayload, WorkbookCalculationResult, WorkbookCapabilities,
    WorkbookCapabilityLevel, WorkbookCell, WorkbookConditionalFormatPayload,
    WorkbookDataValidationPayload, WorkbookDefinedNamePayload, WorkbookDocument,
    WorkbookDrawingPayload, WorkbookEngine, WorkbookFilterPayload, WorkbookOutlinePayload,
    WorkbookSheetPage, WorkbookStructureChange, WorkbookStructureMigrationPreview,
    WorkbookStructurePayload, WorkbookTablePayload, WorkbookWritePayload,
};
use crate::formats::workbook_calculation::calculate_workbook;
use crate::formats::workbook_formula::{
    migrate_workbook_formula, migrate_workbook_reference, translate_formula,
    validate_workbook_structure_change, WorkbookFormulaTranslation, MAX_FORMULA_TRANSLATIONS,
};
use crate::formats::workbook_ooxml::{
    patch_workbook, patch_workbook_conditional_format, patch_workbook_data_validation,
    patch_workbook_defined_name, patch_workbook_drawing, patch_workbook_filter,
    patch_workbook_freeze_pane, patch_workbook_outline, patch_workbook_structure,
    patch_workbook_table, read_workbook_defined_names, read_workbook_linked_data,
    read_workbook_protection, read_workbook_sheet_layout, validate_workbook_package,
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

fn used_dimensions<T: CellType>(range: &calamine::Range<T>) -> (usize, usize) {
    range
        .end()
        .map(|(row, column)| (row as usize + 1, column as usize + 1))
        .unwrap_or((0, 0))
}

impl WorkbookEngine for CalamineWorkbookEngine {
    fn capabilities(&self) -> WorkbookCapabilities {
        WorkbookCapabilities {
            engine_id: "calamine-ooxml-ironcalc-v14".into(),
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
            row_dimensions: WorkbookCapabilityLevel::Supported,
            column_dimensions: WorkbookCapabilityLevel::Supported,
            row_column_outline: WorkbookCapabilityLevel::Supported,
            merged_cells: WorkbookCapabilityLevel::Supported,
            freeze_panes: WorkbookCapabilityLevel::Supported,
            sort_filter_view: WorkbookCapabilityLevel::Supported,
            excel_tables: WorkbookCapabilityLevel::Supported,
            named_ranges: WorkbookCapabilityLevel::Supported,
            date_time_values: WorkbookCapabilityLevel::Supported,
            error_values: WorkbookCapabilityLevel::Supported,
            named_styles: WorkbookCapabilityLevel::Supported,
            theme_indexed_colors: WorkbookCapabilityLevel::Supported,
            per_side_borders: WorkbookCapabilityLevel::Supported,
            custom_number_formats: WorkbookCapabilityLevel::Supported,
            conditional_formatting_preservation: WorkbookCapabilityLevel::Supported,
            charts: WorkbookCapabilityLevel::Supported,
            pivot_tables: WorkbookCapabilityLevel::Supported,
            slicers: WorkbookCapabilityLevel::Supported,
            external_data: WorkbookCapabilityLevel::Supported,
            data_validation: WorkbookCapabilityLevel::Supported,
            sheet_protection: WorkbookCapabilityLevel::Supported,
            print_layout: WorkbookCapabilityLevel::Supported,
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
            defined_names: read_workbook_defined_names(&bytes)?,
            linked_data: read_workbook_linked_data(&bytes)?,
            protection: read_workbook_protection(&bytes)?,
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
        let source = fs::read(path).map_err(|error| format!("读取 XLSX 样式失败: {error}"))?;
        let (total_rows, total_columns) = used_dimensions(&values);
        let requested_end = row_offset.saturating_add(row_limit.clamp(1, MAX_PAGE_ROWS));
        let layout = read_workbook_sheet_layout(
            &source,
            sheet,
            row_offset,
            requested_end,
            MAX_PREVIEW_COLUMNS,
        )?;
        let total_rows = total_rows.max(layout.extent.0);
        let total_columns = total_columns.max(layout.extent.1);
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
                        let formula = layout.formulas.get(&(row, column)).cloned();
                        WorkbookCell {
                            value: value.to_string(),
                            formula,
                            kind: cell_kind(&value).into(),
                            style: layout
                                .styles
                                .get(&(row, column))
                                .cloned()
                                .unwrap_or_default(),
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
            default_row_height: layout.default_row_height,
            default_column_width: layout.default_column_width,
            row_heights: layout.row_heights,
            column_widths: layout.column_widths,
            row_states: layout.row_states,
            column_states: layout.column_states,
            merged_cells: layout.merged_cells,
            named_styles: layout.named_styles,
            freeze_pane: layout.freeze_pane,
            auto_filter: layout.auto_filter,
            auto_filter_state: layout.auto_filter_state,
            tables: layout.tables,
            data_validations: layout.data_validations,
            conditional_formats: layout.conditional_formats,
            drawings: layout.drawings,
            page_layout: layout.page_layout,
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
pub fn preview_workbook_structure_migration(
    change: WorkbookStructureChange,
    current_sheet: String,
    formulas: Vec<String>,
    references: Vec<String>,
) -> Result<WorkbookStructureMigrationPreview, String> {
    validate_workbook_structure_change(&change)?;
    if current_sheet.is_empty() || current_sheet.chars().count() > 31 {
        return Err("当前工作表名称无效".into());
    }
    if formulas.is_empty() && references.is_empty() {
        return Err("没有需要预览的公式或引用".into());
    }
    if formulas.len().saturating_add(references.len()) > MAX_FORMULA_TRANSLATIONS {
        return Err(format!(
            "单次最多迁移 {MAX_FORMULA_TRANSLATIONS} 个公式或引用"
        ));
    }
    let formulas = formulas
        .iter()
        .map(|formula| migrate_workbook_formula(formula, &current_sheet, &change))
        .collect::<Result<Vec<_>, _>>()?;
    let references = references
        .iter()
        .map(|reference| {
            migrate_workbook_reference(reference, Some(current_sheet.as_str()), &change)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(WorkbookStructureMigrationPreview {
        formulas,
        references,
    })
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
        let output = patch_workbook(
            &source,
            &payload.edits,
            &payload.style_edits,
            &payload.row_height_edits,
            &payload.column_width_edits,
            &payload.merge_edits,
        )?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_structure(
    library_root: String,
    path: String,
    payload: WorkbookStructurePayload,
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
            return Err("XLSX 已被其他程序修改，请重新加载后再修改行列结构".into());
        }
        let output = patch_workbook_structure(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("保存后的 XLSX 不能超过 128 MB".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX 工作表结构写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_defined_name(
    library_root: String,
    path: String,
    payload: WorkbookDefinedNamePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing defined names.".into());
        }
        let output = patch_workbook_defined_name(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX defined-name write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_data_validation(
    library_root: String,
    path: String,
    payload: WorkbookDataValidationPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing data validation rules.".into(),
            );
        }
        let output = patch_workbook_data_validation(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX data-validation write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_conditional_format(
    library_root: String,
    path: String,
    payload: WorkbookConditionalFormatPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing conditional formatting.".into(),
            );
        }
        let output = patch_workbook_conditional_format(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX conditional-format write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_drawing(
    library_root: String,
    path: String,
    payload: WorkbookDrawingPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err(
                "The XLSX changed on disk. Reload it before editing Drawing objects.".into(),
            );
        }
        let output = patch_workbook_drawing(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX Drawing write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_filter(
    library_root: String,
    path: String,
    payload: WorkbookFilterPayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing filters.".into());
        }
        let output = patch_workbook_filter(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX filter write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_table(
    library_root: String,
    path: String,
    payload: WorkbookTablePayload,
) -> Result<WorkbookDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file = guard.resolve_existing_file(path, &["xlsx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        recover_interrupted_write(&file)?;
        ensure_workbook(&file)?;
        let source = fs::read(&file).map_err(|error| format!("Failed to read XLSX: {error}"))?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Failed to read XLSX metadata: {error}"))?;
        if workbook_signature(&metadata, &source) != payload.expected_signature {
            return Err("The XLSX changed on disk. Reload it before editing the Table.".into());
        }
        let output = patch_workbook_table(&source, &payload.change)?;
        if output.len() as u64 > MAX_WORKBOOK_BYTES {
            return Err("The saved XLSX cannot exceed 128 MB.".into());
        }
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("XLSX Table write task failed: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_freeze_pane(
    library_root: String,
    path: String,
    expected_signature: String,
    sheet: String,
    rows: usize,
    columns: usize,
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
        if workbook_signature(&metadata, &source) != expected_signature {
            return Err("XLSX 已被其他程序修改，请重新加载后再修改冻结窗格".into());
        }
        let output = patch_workbook_freeze_pane(&source, &sheet, rows, columns)?;
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("冻结窗格写回任务失败: {error}"))?
}

#[tauri::command]
pub async fn update_workbook_outline(
    library_root: String,
    path: String,
    payload: WorkbookOutlinePayload,
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
            return Err("XLSX 已被其他程序修改，请重新加载后再修改行列结构".into());
        }
        let output = patch_workbook_outline(&source, &payload.row_edits, &payload.column_edits)?;
        validate_workbook_package(&output)?;
        write_bytes(&file, &output)?;
        CalamineWorkbookEngine.inspect(&file)
    })
    .await
    .map_err(|error| format!("行列隐藏分组写回任务失败: {error}"))?
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
        WorkbookCellEdit, WorkbookCellStyleEdit, WorkbookColumnStateEdit, WorkbookColumnWidthEdit,
        WorkbookConditionalFormatAction, WorkbookConditionalFormatChange,
        WorkbookConditionalFormatPayload, WorkbookConditionalFormatRule,
        WorkbookConditionalFormatStyle, WorkbookDataValidation, WorkbookDataValidationAction,
        WorkbookDataValidationChange, WorkbookDataValidationPayload, WorkbookDefinedNameAction,
        WorkbookDefinedNameChange, WorkbookDefinedNamePayload, WorkbookDrawingAction,
        WorkbookDrawingChange, WorkbookDrawingPayload, WorkbookFilterAction, WorkbookFilterChange,
        WorkbookFilterPayload, WorkbookFilterTarget, WorkbookMergeEdit, WorkbookMergeRange,
        WorkbookOutlinePayload, WorkbookRowHeightEdit, WorkbookRowStateEdit,
        WorkbookStructureAction, WorkbookStructureAxis, WorkbookStructurePayload,
        WorkbookStylePatch, WorkbookWritePayload,
    };
    use rust_xlsxwriter::{
        ConditionalFormatCell, ConditionalFormatCellRule, Format, Formula, Workbook,
    };
    use std::collections::{BTreeMap, BTreeSet};
    use std::io::{Cursor, Read};
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    #[test]
    fn previews_bounded_workbook_structure_migrations() {
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 2,
        };
        let preview = preview_workbook_structure_migration(
            change.clone(),
            "Data".into(),
            vec!["=A2+Other!A2".into()],
            vec!["A1:A3".into(), "Other!A1:A3".into()],
        )
        .unwrap();
        assert_eq!(preview.formulas, ["=A4+Other!A2"]);
        assert_eq!(preview.references, ["A1:A5", "Other!A1:A3"]);

        assert!(preview_workbook_structure_migration(
            change.clone(),
            "Data".into(),
            vec![],
            vec![],
        )
        .unwrap_err()
        .contains("没有需要预览"));
        assert!(preview_workbook_structure_migration(
            change,
            "Data".into(),
            vec!["=A1".into(); MAX_FORMULA_TRANSLATIONS + 1],
            vec![],
        )
        .unwrap_err()
        .contains("单次最多迁移"));
    }

    #[test]
    fn writes_row_and_column_structure_with_signature_protection() {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-row-structure-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("rows.xlsx");
        let mut workbook = Workbook::new();
        let data = workbook.add_worksheet();
        data.set_name("Data").unwrap();
        data.write_string(0, 0, "Header").unwrap();
        data.write_number(1, 0, 10).unwrap();
        data.write_number(2, 0, 20).unwrap();
        data.write_formula(2, 1, Formula::new("=SUM(A2:A3)"))
            .unwrap();
        workbook.save(&path).unwrap();

        let root_text = root.to_string_lossy().into_owned();
        let path_text = path.to_string_lossy().into_owned();
        let document = tauri::async_runtime::block_on(read_workbook_file(
            root_text.clone(),
            path_text.clone(),
        ))
        .unwrap();
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 1,
        };
        let stale = tauri::async_runtime::block_on(update_workbook_structure(
            root_text.clone(),
            path_text.clone(),
            WorkbookStructurePayload {
                expected_signature: "stale".into(),
                change: change.clone(),
            },
        ))
        .unwrap_err();
        assert!(stale.contains("其他程序修改"));

        let saved = tauri::async_runtime::block_on(update_workbook_structure(
            root_text,
            path_text,
            WorkbookStructurePayload {
                expected_signature: document.signature.clone(),
                change,
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let xml = String::from_utf8(zip_part(
            &fs::read(&path).unwrap(),
            "xl/worksheets/sheet1.xml",
        ))
        .unwrap();
        assert!(xml.contains("r=\"A3\""));
        assert!(xml.contains("SUM(A3:A4)"));

        let column_saved = tauri::async_runtime::block_on(update_workbook_structure(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookStructurePayload {
                expected_signature: saved.signature,
                change: WorkbookStructureChange {
                    sheet: "Data".into(),
                    axis: WorkbookStructureAxis::Column,
                    action: WorkbookStructureAction::Insert,
                    index: 0,
                    count: 1,
                },
            },
        ))
        .unwrap();
        assert_ne!(column_saved.signature, document.signature);
        let xml = String::from_utf8(zip_part(
            &fs::read(&path).unwrap(),
            "xl/worksheets/sheet1.xml",
        ))
        .unwrap();
        assert!(xml.contains("r=\"B3\""));
        assert!(xml.contains("SUM(B3:B4)"));
        fs::remove_dir_all(base).unwrap();
    }

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
            .add_conditional_format(
                1,
                1,
                1,
                1,
                &ConditionalFormatCell::new()
                    .set_rule(ConditionalFormatCellRule::GreaterThan(50))
                    .set_format(Format::new().set_bold()),
            )
            .unwrap();
        first.set_row_height(1, 28).unwrap();
        first.set_column_width(0, 18).unwrap();
        first.set_column_width(1, 14).unwrap();
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

    fn compatibility_fixture_copy(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("compatibility.xlsx");
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/workbook/compatibility-baseline.xlsx"),
            &path,
        )
        .unwrap();
        (base, path)
    }

    #[test]
    fn writes_filter_state_with_signature_protection() {
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-filter-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("library");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("filter.xlsx");
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Name").unwrap();
        sheet.write_string(0, 1, "Score").unwrap();
        sheet.write_string(1, 0, "Alpha").unwrap();
        sheet.write_number(1, 1, 2).unwrap();
        sheet.write_string(2, 0, "Beta").unwrap();
        sheet.write_number(2, 1, 1).unwrap();
        sheet.autofilter(0, 0, 2, 1).unwrap();
        workbook.save(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookFilterChange {
            sheet: "Data".into(),
            target: WorkbookFilterTarget::Worksheet,
            action: WorkbookFilterAction::Apply,
            table_name: None,
            range: WorkbookMergeRange {
                top: 0,
                bottom: 2,
                left: 0,
                right: 1,
            },
            filter_column: Some(0),
            query: Some("Al".into()),
            sort_column: Some(1),
            sort_direction: Some("asc".into()),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_filter(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookFilterPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Data", 0, 10)
            .unwrap();
        assert_eq!(page.auto_filter_state.query.as_deref(), Some("Al"));
        let stale = tauri::async_runtime::block_on(update_workbook_filter(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookFilterPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_defined_names_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookDefinedNameChange {
            action: WorkbookDefinedNameAction::Create,
            name: "ProgressRange".into(),
            new_name: None,
            scope: None,
            target_sheet: Some("进度".into()),
            range: Some(WorkbookMergeRange {
                top: 0,
                bottom: 2,
                left: 0,
                right: 1,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_defined_name(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDefinedNamePayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert!(saved
            .defined_names
            .iter()
            .any(|item| item.name == "ProgressRange"));
        let stale = tauri::async_runtime::block_on(update_workbook_defined_name(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDefinedNamePayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_data_validation_rules_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookDataValidationChange {
            sheet: "进度".into(),
            action: WorkbookDataValidationAction::Create,
            validation_index: None,
            validation: Some(WorkbookDataValidation {
                ranges: vec![WorkbookMergeRange {
                    top: 1,
                    bottom: 2,
                    left: 1,
                    right: 1,
                }],
                kind: "custom".into(),
                operator: None,
                formula1: Some("B2>=0".into()),
                formula2: None,
                allow_blank: false,
                show_error_message: true,
                error_title: Some("Invalid progress".into()),
                error: Some("Progress must be non-negative.".into()),
                prompt_title: None,
                prompt: None,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_data_validation(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDataValidationPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_ne!(saved.signature, document.signature);
        assert_eq!(page.data_validations.len(), 1);
        assert_eq!(page.data_validations[0].kind, "custom");
        assert_eq!(page.data_validations[0].formula1.as_deref(), Some("B2>=0"));

        let stale = tauri::async_runtime::block_on(update_workbook_data_validation(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDataValidationPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn writes_conditional_formats_with_signature_protection() {
        let (base, path) = fixture();
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let change = WorkbookConditionalFormatChange {
            sheet: "进度".into(),
            action: WorkbookConditionalFormatAction::Create,
            group_index: None,
            rule_index: None,
            rule: Some(WorkbookConditionalFormatRule {
                group_index: 0,
                rule_index: 0,
                ranges: vec![WorkbookMergeRange {
                    top: 1,
                    bottom: 2,
                    left: 0,
                    right: 0,
                }],
                kind: "cellIs".into(),
                operator: Some("equal".into()),
                formula1: Some("75".into()),
                formula2: None,
                priority: 0,
                stop_if_true: true,
                style: WorkbookConditionalFormatStyle {
                    font_color: Some("#9C6500".into()),
                    fill_color: Some("#FFEB9C".into()),
                    bold: false,
                },
                color_scale: None,
                data_bar: None,
                icon_set: None,
                editable: true,
            }),
        };
        let saved = tauri::async_runtime::block_on(update_workbook_conditional_format(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookConditionalFormatPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 10)
            .unwrap();
        assert_ne!(saved.signature, document.signature);
        assert_eq!(page.conditional_formats.len(), 2);
        assert!(page
            .conditional_formats
            .iter()
            .any(|rule| rule.formula1.as_deref() == Some("75")));

        let stale = tauri::async_runtime::block_on(update_workbook_conditional_format(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookConditionalFormatPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
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
        assert_eq!(page.row_heights[0].row, 1);
        assert!((page.row_heights[0].height - 27.75).abs() < 0.01);
        assert!(page
            .column_widths
            .iter()
            .any(|item| { item.start_column == 0 && item.end_column == 0 && item.width > 18.0 }));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 4,
                bottom: 4,
                left: 0,
                right: 1,
            }]
        );
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
        assert_eq!(page.rows[1][3].kind, "date");
        assert_eq!(page.rows[1][4].kind, "date");
        assert_eq!(page.rows[1][5].kind, "error");
        assert_eq!(page.rows[1][5].value, "#DIV/0!");
        assert_eq!(
            page.rows[3][1].formula.as_deref(),
            Some("=SUM(AmountRange)")
        );
        assert_eq!(page.rows[3][1].value, "1250.5");
        assert_eq!(page.freeze_pane.rows, 1);
        assert_eq!(page.freeze_pane.columns, 1);
        assert_eq!(
            page.page_layout.print_area,
            Some(crate::formats::workbook::WorkbookMergeRange {
                top: 0,
                bottom: 4,
                left: 0,
                right: 5,
            })
        );
        assert_eq!(
            page.page_layout.setup.orientation.as_deref(),
            Some("landscape")
        );
        assert_eq!(page.page_layout.setup.paper_size, Some(9));
        assert_eq!(page.page_layout.setup.fit_to_height, Some(0));
        assert!(page.page_layout.setup.fit_to_page);
        assert_eq!(page.page_layout.margins.left, Some(0.5));
        assert_eq!(page.page_layout.margins.right, Some(0.5));
        assert!(page.page_layout.options.grid_lines);
        assert!(page.page_layout.options.headings);
        assert!(page.page_layout.options.horizontal_centered);
        assert_eq!(
            page.page_layout.header_footer.odd_header.as_deref(),
            Some("&LConfidential&CQuarterly summary&RPage &P of &N")
        );
        assert_eq!(
            page.page_layout.header_footer.odd_footer.as_deref(),
            Some("&CGenerated by LongEdit fixture")
        );
        assert!(!page.page_layout.protection.enabled);
        let protected_page = engine
            .read_sheet(&workbook_path, "Protected", 0, 10)
            .unwrap();
        assert!(protected_page.page_layout.protection.enabled);
        assert!(protected_page.page_layout.protection.password_protected);
        assert_eq!(
            protected_page.page_layout.protection.blocked_actions,
            ["objects", "scenarios"]
        );
        let details_page = engine
            .read_sheet(&workbook_path, "Details", 0, 100)
            .unwrap();
        assert_eq!(
            details_page.auto_filter,
            Some(crate::formats::workbook::WorkbookMergeRange {
                top: 0,
                bottom: 1,
                left: 0,
                right: 1,
            })
        );
        assert_eq!(details_page.data_validations.len(), 1);
        assert_eq!(details_page.data_validations[0].kind, "list");
        assert_eq!(
            details_page.data_validations[0].formula1.as_deref(),
            Some("\"Active,Paused,Closed\"")
        );
        let inventory_page = engine
            .read_sheet(&workbook_path, "Inventory", 0, 100)
            .unwrap();
        assert_eq!(inventory_page.tables.len(), 1);
        assert_eq!(inventory_page.tables[0].name, "InventoryTable");
        assert_eq!(
            inventory_page.tables[0].columns,
            ["Product", "Stock", "Category"]
        );
        assert_eq!(inventory_page.drawings.len(), 2);
        let chart_drawing = inventory_page
            .drawings
            .iter()
            .find(|drawing| drawing.kind == "chart")
            .unwrap();
        assert_eq!(chart_drawing.name, "InventoryStockChart");
        assert_eq!((chart_drawing.from.row, chart_drawing.from.column), (1, 4));
        assert_eq!(
            chart_drawing
                .to
                .as_ref()
                .map(|anchor| (anchor.row, anchor.column)),
            Some((15, 11))
        );
        assert_eq!(chart_drawing.part.as_deref(), Some("xl/charts/chart1.xml"));
        let chart = chart_drawing.chart.as_ref().unwrap();
        assert_eq!(chart.chart_type, "column");
        assert_eq!(chart.title.as_deref(), Some("Inventory stock"));
        assert_eq!(chart.series.len(), 1);
        assert_eq!(chart.series[0].name.as_deref(), Some("Stock"));
        assert_eq!(
            chart.series[0].categories.as_deref(),
            Some("Inventory!$A$2:$A$3")
        );
        assert_eq!(
            chart.series[0].values.as_deref(),
            Some("Inventory!$B$2:$B$3")
        );
        let image_drawing = inventory_page
            .drawings
            .iter()
            .find(|drawing| drawing.kind == "image")
            .unwrap();
        assert_eq!(
            image_drawing.description.as_deref(),
            Some("Inventory marker")
        );
        assert_eq!((image_drawing.from.row, image_drawing.from.column), (18, 4));
        assert_eq!(image_drawing.part.as_deref(), Some("xl/media/image1.png"));
        assert_eq!(document.linked_data.pivot_tables.len(), 1);
        let pivot = &document.linked_data.pivot_tables[0];
        assert_eq!(pivot.name, "InventoryPivot");
        assert_eq!(pivot.sheet.as_deref(), Some("Inventory"));
        assert_eq!(pivot.cache_id, Some(1));
        assert_eq!(pivot.source_type, "worksheet");
        assert_eq!(pivot.source_sheet.as_deref(), Some("Inventory"));
        assert_eq!(pivot.source_range.as_deref(), Some("A1:C3"));
        assert!(pivot.refresh_on_load);
        assert_eq!(document.linked_data.slicers.len(), 1);
        assert_eq!(document.linked_data.slicers[0].name, "CategorySlicer");
        assert_eq!(
            document.linked_data.slicers[0].sheet.as_deref(),
            Some("Inventory")
        );
        assert_eq!(document.linked_data.external_links.len(), 1);
        assert_eq!(
            document.linked_data.external_links[0].kind,
            "external_workbook"
        );
        assert_eq!(
            document.linked_data.external_links[0]
                .target_kind
                .as_deref(),
            Some("file")
        );
        assert_eq!(document.linked_data.external_relationship_count, 1);
        assert_eq!(document.linked_data.connections.len(), 1);
        assert_eq!(document.linked_data.connections[0].id, Some(7));
        assert_eq!(
            document.linked_data.connections[0].name,
            "Warehouse fixture"
        );
        assert!(document.linked_data.connections[0].refresh_on_load);
        assert!(document.protection.enabled);
        assert!(document.protection.lock_structure);
        assert!(document.protection.password_protected);
        let public_document = serde_json::to_string(&document).unwrap();
        assert!(!public_document.contains("secret.example"));
        assert!(!public_document.contains("not-for-ui"));
        assert!(!public_document.contains("external-data.xlsx"));
        assert!(!public_document.contains("ABCD"));
        assert!(!public_document.contains("B459"));
        assert!(!public_document.contains("fixture-protection"));
        assert_eq!(
            document
                .defined_names
                .iter()
                .filter(|item| !item.name.starts_with("_xlnm."))
                .count(),
            5
        );
        assert!(document
            .defined_names
            .iter()
            .any(|item| item.name == "_xlnm._FilterDatabase" && item.hidden));
        let amount_range = document
            .defined_names
            .iter()
            .find(|item| item.name == "AmountRange")
            .unwrap();
        assert_eq!(amount_range.formula, "Summary!$B$2:$B$2");
        assert_eq!(
            amount_range.reference,
            Some(crate::formats::workbook::WorkbookRangeReference {
                sheet: "Summary".into(),
                top: 1,
                bottom: 1,
                left: 1,
                right: 1,
            })
        );
        let local_name = document
            .defined_names
            .iter()
            .find(|item| item.name == "Codes")
            .unwrap();
        assert_eq!(local_name.scope.as_deref(), Some("Details"));
        assert_eq!(local_name.reference.as_ref().unwrap().sheet, "Details");
        assert!(document
            .defined_names
            .iter()
            .find(|item| item.name == "TaxRate")
            .unwrap()
            .reference
            .is_none());
        assert_eq!(
            document
                .defined_names
                .iter()
                .find(|item| item.name == "TeamLabel")
                .unwrap()
                .formula,
            "\"R&D\""
        );
        assert!(page.rows[0][0].style.bold);
        assert_eq!(page.rows[0][0].style.font_color.as_deref(), Some("#FFFFFF"));
        assert_eq!(page.rows[0][0].style.fill_color.as_deref(), Some("#2563EB"));
        assert_eq!(page.rows[1][1].style.number_format, "currency");
        assert!(page
            .row_heights
            .iter()
            .any(|item| item.row == 1 && (item.height - 27.75).abs() < 0.01));
        assert!(page
            .column_widths
            .iter()
            .any(|item| { item.start_column == 0 && item.end_column == 0 && item.width > 22.0 }));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 4,
                bottom: 4,
                left: 0,
                right: 2,
            }]
        );

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
            capabilities.row_dimensions,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.column_dimensions,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.merged_cells,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.freeze_panes,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.sort_filter_view,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.excel_tables,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.data_validation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.charts, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.pivot_tables,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(capabilities.slicers, WorkbookCapabilityLevel::Supported);
        assert_eq!(
            capabilities.external_data,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.sheet_protection,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.print_layout,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.named_ranges,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.date_time_values,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.error_values,
            WorkbookCapabilityLevel::Supported
        );
        assert!(!page.named_styles.is_empty());
        assert_eq!(
            capabilities.named_styles,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.theme_indexed_colors,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.per_side_borders,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.custom_number_formats,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.conditional_formatting_preservation,
            WorkbookCapabilityLevel::Supported
        );
        assert_eq!(
            capabilities.xlsx_round_trip,
            WorkbookCapabilityLevel::Planned
        );
    }

    #[test]
    fn compatibility_fixture_preserves_defined_names_dates_and_errors_during_cell_patch() {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/workbook/compatibility-baseline.xlsx");
        let source = fs::read(fixture_path).unwrap();
        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                input: "Alpha updated".into(),
                kind: "string".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        assert_eq!(
            zip_part(&source, "xl/workbook.xml"),
            zip_part(&output, "xl/workbook.xml")
        );
        assert_eq!(
            read_workbook_defined_names(&source).unwrap(),
            read_workbook_defined_names(&output).unwrap()
        );

        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-s6-10-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("round-trip.xlsx");
        fs::write(&path, output).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha updated");
        assert_eq!(page.rows[1][3].kind, "date");
        assert_eq!(page.rows[1][4].kind, "date");
        assert_eq!(page.rows[1][5].kind, "error");
        assert_eq!(page.rows[1][5].value, "#DIV/0!");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_and_removes_freeze_panes_with_signature_protection() {
        let (base, path) = compatibility_fixture_copy("freeze-pane");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let updated = tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            document.signature,
            "Summary".into(),
            2,
            0,
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.freeze_pane.rows, 2);
        assert_eq!(page.freeze_pane.columns, 0);
        tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            updated.signature,
            "Summary".into(),
            0,
            0,
        ))
        .unwrap();
        assert_eq!(
            CalamineWorkbookEngine
                .read_sheet(&path, "Summary", 0, 10)
                .unwrap()
                .freeze_pane,
            crate::formats::workbook::WorkbookFreezePane::default()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_row_column_visibility_and_outline_without_touching_other_parts() {
        let (base, path) = compatibility_fixture_copy("row-column-outline");
        let root = base.join("library");
        let source = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let updated = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: document.signature.clone(),
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: true,
                    outline_level: 2,
                    collapsed: false,
                }],
                column_edits: vec![WorkbookColumnStateEdit {
                    sheet: "Summary".into(),
                    start_column: 1,
                    end_column: 2,
                    hidden: false,
                    outline_level: 1,
                    collapsed: false,
                }],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.row_states.len(), 1);
        assert!(page.row_states[0].hidden);
        assert_eq!(page.row_states[0].outline_level, 2);
        assert_eq!(page.column_states.len(), 2);
        assert_eq!(page.column_states[0].start_column, 1);
        assert_eq!(page.column_states[1].end_column, 2);
        assert!(page
            .column_states
            .iter()
            .all(|state| state.outline_level == 1));

        let before = zip_parts(&source);
        let after = zip_parts(&fs::read(&path).unwrap());
        let changed = before
            .iter()
            .filter_map(|(name, bytes)| (after.get(name) != Some(bytes)).then_some(name.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(changed, ["xl/worksheets/sheet1.xml"]);

        let stale = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: document.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(stale.unwrap_err().contains("其他程序修改"));

        let restored = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: updated.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
                column_edits: vec![WorkbookColumnStateEdit {
                    sheet: "Summary".into(),
                    start_column: 1,
                    end_column: 2,
                    hidden: false,
                    outline_level: 0,
                    collapsed: false,
                }],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert!(page.row_states.is_empty());
        assert!(page.column_states.is_empty());

        let clean_bytes = fs::read(&path).unwrap();
        let invalid_level = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: restored.signature.clone(),
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Summary".into(),
                    row: 1,
                    hidden: false,
                    outline_level: 8,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(invalid_level.unwrap_err().contains("目标无效"));
        assert_eq!(fs::read(&path).unwrap(), clean_bytes);

        let protected = tauri::async_runtime::block_on(update_workbook_outline(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookOutlinePayload {
                expected_signature: restored.signature,
                row_edits: vec![WorkbookRowStateEdit {
                    sheet: "Protected".into(),
                    row: 1,
                    hidden: true,
                    outline_level: 1,
                    collapsed: false,
                }],
                column_edits: vec![],
            },
        ));
        assert!(protected.unwrap_err().contains("已受保护"));
        assert_eq!(fs::read(&path).unwrap(), clean_bytes);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn enforces_literal_list_validation_and_preserves_table_parts() {
        let (base, path) = compatibility_fixture_copy("validation");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = |input: &str, signature: String| WorkbookWritePayload {
            expected_signature: signature,
            edits: vec![WorkbookCellEdit {
                sheet: "Details".into(),
                row: 1,
                column: 1,
                input: input.into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        let invalid = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload("Unknown", document.signature.clone()),
        ));
        assert!(invalid.unwrap_err().contains("Active, Paused, or Closed"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload("Paused", document.signature),
        ))
        .unwrap();
        assert!(!saved.signature.is_empty());
        assert_eq!(
            CalamineWorkbookEngine
                .read_sheet(&path, "Details", 0, 10)
                .unwrap()
                .rows[1][1]
                .value,
            "Paused"
        );
        assert_eq!(
            zip_part(&before, "xl/tables/table1.xml"),
            zip_part(&fs::read(&path).unwrap(), "xl/tables/table1.xml")
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn updates_drawing_and_chart_with_signature_protection() {
        let (base, path) = compatibility_fixture_copy("drawing-update");
        let root = base.join("library");
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        let drawing = page.drawings.iter().find(|item| item.editable).unwrap();
        let change = WorkbookDrawingChange {
            sheet: "Inventory".into(),
            drawing_part: drawing.drawing_part.clone(),
            anchor_index: drawing.anchor_index,
            object_id: drawing.object_id.clone(),
            action: WorkbookDrawingAction::UpdateMetadata,
            name: Some("Inventory overview".into()),
            description: Some("Updated locally".into()),
            from: None,
            to: None,
            chart_title: None,
            series_index: None,
            series_categories: None,
            series_values: None,
        };
        let saved = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: document.signature.clone(),
                change: change.clone(),
            },
        ))
        .unwrap();
        assert_ne!(saved.signature, document.signature);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        assert!(page
            .drawings
            .iter()
            .any(|item| item.name == "Inventory overview"
                && item.description.as_deref() == Some("Updated locally")));
        let chart_drawing = page
            .drawings
            .iter()
            .find(|item| {
                item.chart
                    .as_ref()
                    .is_some_and(|chart| chart.title_editable)
            })
            .unwrap();
        let chart_saved = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: saved.signature,
                change: WorkbookDrawingChange {
                    sheet: "Inventory".into(),
                    drawing_part: chart_drawing.drawing_part.clone(),
                    anchor_index: chart_drawing.anchor_index,
                    object_id: chart_drawing.object_id.clone(),
                    action: WorkbookDrawingAction::UpdateChartTitle,
                    name: None,
                    description: None,
                    from: None,
                    to: None,
                    chart_title: Some("Inventory by location".into()),
                    series_index: None,
                    series_categories: None,
                    series_values: None,
                },
            },
        ))
        .unwrap();
        assert!(chart_saved.signature.len() > 10);
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Inventory", 0, 30)
            .unwrap();
        assert!(page.drawings.iter().any(|item| {
            item.chart.as_ref().and_then(|chart| chart.title.as_deref())
                == Some("Inventory by location")
        }));
        let stale = tauri::async_runtime::block_on(update_workbook_drawing(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookDrawingPayload {
                expected_signature: document.signature,
                change,
            },
        ));
        assert!(stale.unwrap_err().contains("changed on disk"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn preserves_chart_drawing_and_image_parts_when_editing_cells() {
        let (base, path) = compatibility_fixture_copy("drawings");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature,
            edits: vec![WorkbookCellEdit {
                sheet: "Inventory".into(),
                row: 1,
                column: 1,
                input: "18".into(),
                kind: "number".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload,
        ))
        .unwrap();
        let after = fs::read(&path).unwrap();
        for part in [
            "xl/drawings/drawing1.xml",
            "xl/drawings/_rels/drawing1.xml.rels",
            "xl/charts/chart1.xml",
            "xl/media/image1.png",
            "xl/pivotTables/pivotTable1.xml",
            "xl/pivotCache/pivotCacheDefinition1.xml",
            "xl/slicers/slicer1.xml",
            "xl/externalLinks/externalLink1.xml",
            "xl/externalLinks/_rels/externalLink1.xml.rels",
            "xl/connections.xml",
            "xl/worksheets/sheet1.xml",
            "xl/workbook.xml",
        ] {
            assert_eq!(zip_part(&before, part), zip_part(&after, part), "{part}");
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn refuses_to_edit_or_reconfigure_protected_sheet() {
        let (base, path) = compatibility_fixture_copy("protected-sheet");
        let root = base.join("library");
        let before = fs::read(&path).unwrap();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let payload = WorkbookWritePayload {
            expected_signature: document.signature.clone(),
            edits: vec![WorkbookCellEdit {
                sheet: "Protected".into(),
                row: 1,
                column: 0,
                input: "bypass".into(),
                kind: "string".into(),
            }],
            style_edits: vec![],
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
        };
        let rejected = tauri::async_runtime::block_on(write_workbook_cells(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            payload,
        ));
        assert!(rejected.unwrap_err().contains("不会绕过 Excel 工作表保护"));
        assert_eq!(fs::read(&path).unwrap(), before);

        let freeze_rejected = tauri::async_runtime::block_on(update_workbook_freeze_pane(
            root.to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            document.signature,
            "Protected".into(),
            1,
            1,
        ));
        assert!(freeze_rejected
            .unwrap_err()
            .contains("不会绕过 Excel 工作表保护"));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(base).unwrap();
    }

    fn zip_part(bytes: &[u8], name: &str) -> Vec<u8> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut part = archive.by_name(name).unwrap();
        let mut output = Vec::new();
        part.read_to_end(&mut output).unwrap();
        output
    }

    fn zip_parts(bytes: &[u8]) -> BTreeMap<String, Vec<u8>> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut output = BTreeMap::new();
        for index in 0..archive.len() {
            let mut part = archive.by_index(index).unwrap();
            if part.is_dir() {
                continue;
            }
            let name = part.name().to_string();
            let mut data = Vec::new();
            part.read_to_end(&mut data).unwrap();
            assert!(output.insert(name, data).is_none());
        }
        output
    }

    #[test]
    fn complex_fixture_package_diff_is_allowlisted_and_lossless() {
        let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let gate: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(manifest_root.join("../shared/xlsx-release-gate.json")).unwrap(),
        )
        .unwrap();
        let source =
            fs::read(manifest_root.join("tests/fixtures/workbook/compatibility-baseline.xlsx"))
                .unwrap();
        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                input: "Alpha audited".into(),
                kind: "string".into(),
            }],
            &[WorkbookCellStyleEdit {
                sheet: "Summary".into(),
                row: 1,
                column: 0,
                patch: WorkbookStylePatch {
                    bold: Some(true),
                    fill_color: Some("#DBEAFE".into()),
                    ..Default::default()
                },
            }],
            &[WorkbookRowHeightEdit {
                sheet: "Summary".into(),
                row: 1,
                height: Some(30.0),
            }],
            &[WorkbookColumnWidthEdit {
                sheet: "Summary".into(),
                start_column: 0,
                end_column: 0,
                width: Some(24.0),
            }],
            &[WorkbookMergeEdit {
                sheet: "Summary".into(),
                top: 5,
                bottom: 5,
                left: 3,
                right: 4,
                action: "merge".into(),
            }],
        )
        .unwrap();

        let before = zip_parts(&source);
        let after = zip_parts(&output);
        let before_names = before.keys().cloned().collect::<BTreeSet<_>>();
        let after_names = after.keys().cloned().collect::<BTreeSet<_>>();
        assert_eq!(before_names, after_names, "ZIP parts were added or removed");
        assert!(
            before.len() >= gate["complexFixture"]["minimumZipParts"].as_u64().unwrap() as usize
        );

        let changed = before
            .iter()
            .filter_map(|(name, data)| (after.get(name) != Some(data)).then_some(name.clone()))
            .collect::<BTreeSet<_>>();
        let allowed = gate["differentialGate"]["contentAndStyleAllowedChangedParts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap().to_string())
            .collect::<BTreeSet<_>>();
        assert_eq!(changed, allowed, "unexpected OOXML package differential");

        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-differential-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("audited.xlsx");
        fs::write(&path, output).unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Summary", 0, 10)
            .unwrap();
        assert_eq!(page.rows[1][0].value, "Alpha audited");
        assert!(page.rows[1][0].style.bold);
        assert_eq!(page.rows[1][0].style.fill_color.as_deref(), Some("#DBEAFE"));
        assert!(page
            .merged_cells
            .iter()
            .any(|range| { (range.top, range.bottom, range.left, range.right) == (5, 5, 3, 4) }));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn complex_workbook_performance_stays_within_release_budget() {
        let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let gate: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(manifest_root.join("../shared/xlsx-release-gate.json")).unwrap(),
        )
        .unwrap();
        let workload = &gate["performanceWorkload"];
        let sheet_count = workload["sheets"].as_u64().unwrap() as usize;
        let row_count = workload["rows"].as_u64().unwrap() as usize;
        let column_count = workload["columns"].as_u64().unwrap() as usize;
        let formula_rows = workload["formulaRows"].as_u64().unwrap() as usize;
        let base = std::env::temp_dir().join(format!(
            "longedit-xlsx-performance-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("business-workload.xlsx");
        let mut workbook = Workbook::new();
        for sheet_index in 0..sheet_count {
            let sheet = workbook.add_worksheet();
            sheet
                .set_name(format!("Business{}", sheet_index + 1))
                .unwrap();
            for column in 0..column_count {
                sheet
                    .write_string(0, column as u16, format!("Field{}", column + 1))
                    .unwrap();
            }
            if sheet_index == 0 {
                for row in 1..row_count {
                    sheet
                        .write_string(row as u32, 0, format!("Record-{row:05}"))
                        .unwrap();
                    for column in 1..column_count {
                        sheet
                            .write_number(row as u32, column as u16, (row * column) as f64)
                            .unwrap();
                    }
                    if row <= formula_rows {
                        sheet
                            .write_formula(
                                row as u32,
                                (column_count - 1) as u16,
                                Formula::new(format!("=B{}+C{}", row + 1, row + 1))
                                    .set_result((row * 3).to_string()),
                            )
                            .unwrap();
                    }
                }
            }
        }
        workbook.save(&path).unwrap();
        let source = fs::read(&path).unwrap();

        let total_started = Instant::now();
        let inspect_started = Instant::now();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let inspect_ms = inspect_started.elapsed().as_millis();
        assert_eq!(document.sheets.len(), sheet_count);

        let page_started = Instant::now();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "Business1", row_count / 2, 200)
            .unwrap();
        let page_ms = page_started.elapsed().as_millis();
        assert_eq!(page.rows.len(), 200);
        assert_eq!(page.returned_columns, column_count);

        let patch_started = Instant::now();
        let output = patch_workbook(
            &source,
            &[WorkbookCellEdit {
                sheet: "Business1".into(),
                row: row_count / 2,
                column: 1,
                input: "42".into(),
                kind: "number".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let patch_ms = patch_started.elapsed().as_millis();
        let total_ms = total_started.elapsed().as_millis();
        eprintln!(
            "workbook performance: inspect={inspect_ms}ms page={page_ms}ms patch={patch_ms}ms total={total_ms}ms"
        );
        let budgets = &gate["performanceBudgetsMs"];
        assert!(
            inspect_ms <= budgets["inspect"].as_u64().unwrap() as u128,
            "inspect {inspect_ms} ms"
        );
        assert!(
            page_ms <= budgets["readPage"].as_u64().unwrap() as u128,
            "page {page_ms} ms"
        );
        assert!(
            patch_ms <= budgets["patch"].as_u64().unwrap() as u128,
            "patch {patch_ms} ms"
        );
        assert!(
            total_ms <= budgets["total"].as_u64().unwrap() as u128,
            "total {total_ms} ms"
        );
        let growth_percent = output.len().saturating_sub(source.len()) * 100 / source.len();
        assert!(
            growth_percent <= gate["maximumPatchedFileGrowthPercent"].as_u64().unwrap() as usize,
            "patched package grew by {growth_percent}%"
        );
        fs::remove_dir_all(base).unwrap();
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
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
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
            row_height_edits: vec![],
            column_width_edits: vec![],
            merge_edits: vec![],
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
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
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
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
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
    fn edits_row_heights_column_widths_and_merge_ranges_without_data_loss() {
        let (base, path) = fixture();
        let document = CalamineWorkbookEngine.inspect(&path).unwrap();
        let saved = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: document.signature,
                edits: vec![WorkbookCellEdit {
                    sheet: "进度".into(),
                    row: 6,
                    column: 0,
                    input: "新的合并标题".into(),
                    kind: "string".into(),
                }],
                style_edits: vec![],
                row_height_edits: vec![WorkbookRowHeightEdit {
                    sheet: "进度".into(),
                    row: 1,
                    height: Some(36.0),
                }],
                column_width_edits: vec![WorkbookColumnWidthEdit {
                    sheet: "进度".into(),
                    start_column: 0,
                    end_column: 1,
                    width: Some(20.0),
                }],
                merge_edits: vec![
                    WorkbookMergeEdit {
                        sheet: "进度".into(),
                        top: 4,
                        bottom: 4,
                        left: 0,
                        right: 1,
                        action: "unmerge".into(),
                    },
                    WorkbookMergeEdit {
                        sheet: "进度".into(),
                        top: 6,
                        bottom: 6,
                        left: 0,
                        right: 2,
                        action: "merge".into(),
                    },
                ],
            },
        ))
        .unwrap();
        let page = CalamineWorkbookEngine
            .read_sheet(&path, "进度", 0, 100)
            .unwrap();
        assert!(page
            .row_heights
            .iter()
            .any(|item| item.row == 1 && (item.height - 36.0).abs() < 0.01));
        assert!((0..=1).all(|column| page.column_widths.iter().any(|item| {
            item.start_column <= column
                && item.end_column >= column
                && (item.width - 20.0).abs() < 0.01
        })));
        assert_eq!(
            page.merged_cells,
            [crate::formats::workbook::WorkbookMergeRange {
                top: 6,
                bottom: 6,
                left: 0,
                right: 2,
            }]
        );
        let rejected = tauri::async_runtime::block_on(write_workbook_cells(
            base.join("library").to_string_lossy().into_owned(),
            path.to_string_lossy().into_owned(),
            WorkbookWritePayload {
                expected_signature: saved.signature,
                edits: vec![],
                style_edits: vec![],
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![WorkbookMergeEdit {
                    sheet: "进度".into(),
                    top: 0,
                    bottom: 1,
                    left: 0,
                    right: 1,
                    action: "merge".into(),
                }],
            },
        ));
        assert!(rejected.unwrap_err().contains("避免数据丢失"));
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
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
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
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
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
                row_height_edits: vec![],
                column_width_edits: vec![],
                merge_edits: vec![],
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
        assert!(formula_before.contains("<conditionalFormatting"));
        assert_eq!(
            formula_before.split("<conditionalFormatting").nth(1),
            formula_after.split("<conditionalFormatting").nth(1),
            "样式写回应原样保留条件格式及其后的工作表对象"
        );
        assert_ne!(
            zip_part(&before, "xl/styles.xml"),
            zip_part(&after, "xl/styles.xml")
        );
        fs::remove_dir_all(base).unwrap();
    }
}
