use crate::formats::workbook::{
    WorkbookCalculatedCell, WorkbookCellEdit, WorkbookDynamicArrayDiagnostic,
    WorkbookDynamicArrayPreviewPayload, WorkbookDynamicArrayPreviewResult, WorkbookMergeRange,
};
use crate::formats::workbook_ooxml::{read_workbook_sheet_layout, validate_edit};
use a1::RangeOrCell;
use calamine::{open_workbook_from_rs, Data, Reader as CalamineReader, Xlsx};
use std::collections::{HashMap, HashSet};
use std::io::Cursor;

pub const SUPPORTED_DYNAMIC_ARRAY_FUNCTIONS: [&str; 1] = ["SEQUENCE"];
const MAX_PREVIEW_CELLS: usize = 10_000;
const MAX_DIAGNOSTIC_CELLS: usize = 256;
const MAX_XLSX_ROWS: usize = 1_048_576;
const MAX_XLSX_COLUMNS: usize = 16_384;

#[derive(Clone, Debug)]
enum ScalarArgument {
    Default,
    Number(f64),
    Reference {
        sheet: String,
        row: usize,
        column: usize,
    },
}

#[derive(Clone, Debug)]
struct SequenceArguments {
    rows: ScalarArgument,
    columns: ScalarArgument,
    start: ScalarArgument,
    step: ScalarArgument,
}

fn diagnostic(
    code: &str,
    message: impl Into<String>,
    cells: Vec<String>,
) -> WorkbookDynamicArrayDiagnostic {
    WorkbookDynamicArrayDiagnostic {
        code: code.into(),
        message: message.into(),
        cells,
    }
}

fn blocked(
    function: &str,
    range: WorkbookMergeRange,
    diagnostic: WorkbookDynamicArrayDiagnostic,
    evaluated_dependency_count: usize,
) -> WorkbookDynamicArrayPreviewResult {
    WorkbookDynamicArrayPreviewResult {
        status: "blocked".into(),
        function: function.into(),
        range,
        cells: Vec::new(),
        diagnostics: vec![diagnostic],
        evaluated_dependency_count,
        source_package_unchanged: true,
    }
}

fn split_function(formula: &str) -> Result<(String, Vec<&str>), String> {
    let formula = formula.trim().strip_prefix('=').unwrap_or(formula.trim());
    let Some(open) = formula.find('(') else {
        return Err("E1A_INVALID_FORMULA: 动态数组公式缺少参数列表".into());
    };
    if !formula.ends_with(')') {
        return Err("E1A_INVALID_FORMULA: 动态数组公式必须以右括号结束".into());
    }
    let mut function = formula[..open].trim().to_ascii_uppercase();
    for prefix in ["_XLFN.", "_XLWS."] {
        function = function.replace(prefix, "");
    }
    if function.is_empty() {
        return Err("E1A_INVALID_FORMULA: 动态数组函数名为空".into());
    }
    let arguments = &formula[open + 1..formula.len() - 1];
    if arguments.contains(['(', ')', '"', '[', ']']) {
        return Err("E1A_UNSUPPORTED_ARGUMENT: E1A 不执行嵌套函数、字符串或外部引用".into());
    }
    let separator = if arguments.contains(';') && !arguments.contains(',') {
        ';'
    } else {
        ','
    };
    Ok((
        function,
        arguments.split(separator).map(str::trim).collect(),
    ))
}

fn parse_scalar(argument: &str, current_sheet: &str) -> Result<ScalarArgument, String> {
    if argument.is_empty() {
        return Ok(ScalarArgument::Default);
    }
    if let Ok(number) = argument.parse::<f64>() {
        if number.is_finite() {
            return Ok(ScalarArgument::Number(number));
        }
        return Err("E1A_INVALID_ARGUMENT: SEQUENCE 参数必须是有限数字".into());
    }
    let parsed = a1::new(argument)
        .map_err(|_| "E1A_UNSUPPORTED_ARGUMENT: SEQUENCE 参数只接受数字或直接 A1 引用")?;
    let RangeOrCell::Cell(address) = parsed.reference else {
        return Err("E1A_UNSUPPORTED_ARGUMENT: SEQUENCE 参数不接受区域引用".into());
    };
    Ok(ScalarArgument::Reference {
        sheet: parsed.sheet_name.unwrap_or_else(|| current_sheet.into()),
        row: address.row.y,
        column: address.column.x,
    })
}

fn parse_sequence(
    formula: &str,
    current_sheet: &str,
) -> Result<(String, SequenceArguments), String> {
    let (function, arguments) = split_function(formula)?;
    if !SUPPORTED_DYNAMIC_ARRAY_FUNCTIONS.contains(&function.as_str()) {
        return Err(format!(
            "E1A_UNSUPPORTED_FUNCTION: {function} 不在动态数组预览白名单"
        ));
    }
    if arguments.is_empty() || arguments.len() > 4 {
        return Err("E1A_INVALID_ARGUMENT: SEQUENCE 需要 1 到 4 个参数".into());
    }
    let mut parsed = arguments
        .into_iter()
        .map(|argument| parse_scalar(argument, current_sheet))
        .collect::<Result<Vec<_>, _>>()?;
    while parsed.len() < 4 {
        parsed.push(ScalarArgument::Default);
    }
    Ok((
        function,
        SequenceArguments {
            rows: parsed.remove(0),
            columns: parsed.remove(0),
            start: parsed.remove(0),
            step: parsed.remove(0),
        },
    ))
}

fn edit_map(
    edits: &[WorkbookCellEdit],
) -> Result<HashMap<(String, usize, usize), &WorkbookCellEdit>, String> {
    if edits.len() > MAX_PREVIEW_CELLS {
        return Err(format!(
            "E1A_RESOURCE_LIMIT: 动态数组预览最多接受 {MAX_PREVIEW_CELLS} 个草稿单元格"
        ));
    }
    let mut result = HashMap::new();
    for edit in edits {
        validate_edit(edit)?;
        let key = (edit.sheet.to_ascii_lowercase(), edit.row, edit.column);
        if result.insert(key, edit).is_some() {
            return Err("E1A_DUPLICATE_EDIT: 动态数组预览包含重复草稿单元格".into());
        }
    }
    Ok(result)
}

fn data_number(value: &Data) -> Option<f64> {
    match value {
        Data::Int(value) => Some(*value as f64),
        Data::Float(value) => Some(*value),
        Data::DateTime(value) => Some(value.as_f64()),
        _ => None,
    }
}

fn resolve_scalar(
    source: &[u8],
    workbook: &mut Xlsx<Cursor<&[u8]>>,
    edits: &HashMap<(String, usize, usize), &WorkbookCellEdit>,
    argument: &ScalarArgument,
    default: f64,
) -> Result<(f64, usize), String> {
    match argument {
        ScalarArgument::Default => Ok((default, 0)),
        ScalarArgument::Number(value) => Ok((*value, 0)),
        ScalarArgument::Reference { sheet, row, column } => {
            if let Some(edit) = edits.get(&(sheet.to_ascii_lowercase(), *row, *column)) {
                if edit.kind != "number" {
                    return Err(format!(
                        "E1A_NON_NUMERIC_DEPENDENCY: {sheet}!{} 必须是数值草稿",
                        a1::cell(*column, *row)
                    ));
                }
                let value = edit
                    .input
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .ok_or_else(|| {
                        format!(
                            "E1A_NON_NUMERIC_DEPENDENCY: {sheet}!{} 的草稿值无效",
                            a1::cell(*column, *row)
                        )
                    })?;
                return Ok((value, 1));
            }
            let layout = read_workbook_sheet_layout(
                source,
                sheet,
                *row,
                row.saturating_add(1),
                column.saturating_add(1),
            )?;
            if layout.formulas.contains_key(&(*row, *column))
                || layout
                    .array_formulas
                    .iter()
                    .any(|formula| is_inside(&formula.range, *row, *column))
            {
                return Err(format!(
                    "E1A_FORMULA_DEPENDENCY_BLOCKED: {sheet}!{} 必须是直接数值单元格",
                    a1::cell(*column, *row)
                ));
            }
            let values = workbook
                .worksheet_range(sheet)
                .map_err(|_| format!("E1A_MISSING_DEPENDENCY: 依赖工作表不存在: {sheet}"))?;
            let value = values
                .get_value((*row as u32, *column as u32))
                .and_then(data_number)
                .ok_or_else(|| {
                    format!(
                        "E1A_NON_NUMERIC_DEPENDENCY: {sheet}!{} 必须包含序列化数值",
                        a1::cell(*column, *row)
                    )
                })?;
            Ok((value, 1))
        }
    }
}

fn positive_dimension(value: f64, label: &str) -> Result<usize, String> {
    if value < 1.0 || value.fract() != 0.0 || value > MAX_PREVIEW_CELLS as f64 {
        return Err(format!(
            "E1A_INVALID_DIMENSION: SEQUENCE {label}必须是 1 到 {MAX_PREVIEW_CELLS} 的整数"
        ));
    }
    Ok(value as usize)
}

fn cell_reference(row: usize, column: usize) -> String {
    a1::cell(column, row).to_string()
}

fn is_inside(range: &WorkbookMergeRange, row: usize, column: usize) -> bool {
    row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
}

fn effective_occupied(source: &Data, edit: Option<&&WorkbookCellEdit>, has_formula: bool) -> bool {
    if let Some(edit) = edit {
        return edit.kind != "empty";
    }
    !matches!(source, Data::Empty) || has_formula
}

fn number_text(value: f64) -> String {
    if value == 0.0 {
        "0".into()
    } else {
        value.to_string()
    }
}

pub fn preview_dynamic_array(
    source: &[u8],
    payload: WorkbookDynamicArrayPreviewPayload,
) -> Result<WorkbookDynamicArrayPreviewResult, String> {
    if payload.anchor_row >= MAX_XLSX_ROWS || payload.anchor_column >= MAX_XLSX_COLUMNS {
        return Err("E1A_INVALID_ANCHOR: 动态数组 anchor 超出 XLSX 上限".into());
    }
    let initial_layout = read_workbook_sheet_layout(
        source,
        &payload.sheet,
        payload.anchor_row,
        payload.anchor_row.saturating_add(1),
        payload.anchor_column.saturating_add(1),
    )?;
    let formula = initial_layout
        .array_formulas
        .into_iter()
        .find(|formula| {
            formula.anchor_row == payload.anchor_row
                && formula.anchor_column == payload.anchor_column
        })
        .ok_or("E1A_ARRAY_NOT_FOUND: 指定位置不是数组公式 anchor")?;
    if formula.kind != "dynamic_array" {
        return Ok(blocked(
            "",
            formula.range,
            diagnostic(
                "legacy_array_blocked",
                "E1A 只预览动态数组；传统多单元格数组仍保持阻断",
                Vec::new(),
            ),
            0,
        ));
    }

    let (function, arguments) = match parse_sequence(&formula.formula, &payload.sheet) {
        Ok(parsed) => parsed,
        Err(error) => {
            let (code, message) = error
                .split_once(": ")
                .unwrap_or(("E1A_INVALID_FORMULA", error.as_str()));
            return Ok(blocked(
                "",
                formula.range,
                diagnostic(code.to_ascii_lowercase().as_str(), message, Vec::new()),
                0,
            ));
        }
    };
    let edits = edit_map(&payload.edits)?;
    if payload.edits.iter().any(|edit| {
        edit.sheet.eq_ignore_ascii_case(&payload.sheet)
            && is_inside(&formula.range, edit.row, edit.column)
    }) {
        return Ok(blocked(
            &function,
            formula.range,
            diagnostic(
                "array_range_edit_blocked",
                "数组声明区域不能作为动态数组预览草稿目标",
                Vec::new(),
            ),
            0,
        ));
    }
    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(source))
        .map_err(|error| format!("E1A_IMPORT_FAILED: 读取动态数组依赖失败: {error}"))?;
    let (rows_value, rows_dependencies) =
        resolve_scalar(source, &mut workbook, &edits, &arguments.rows, 1.0)?;
    let (columns_value, columns_dependencies) =
        resolve_scalar(source, &mut workbook, &edits, &arguments.columns, 1.0)?;
    let (start, start_dependencies) =
        resolve_scalar(source, &mut workbook, &edits, &arguments.start, 1.0)?;
    let (step, step_dependencies) =
        resolve_scalar(source, &mut workbook, &edits, &arguments.step, 1.0)?;
    let dependency_count =
        rows_dependencies + columns_dependencies + start_dependencies + step_dependencies;
    let rows = positive_dimension(rows_value, "行数")?;
    let columns = positive_dimension(columns_value, "列数")?;
    let cell_count = rows
        .checked_mul(columns)
        .ok_or("E1A_RESOURCE_LIMIT: SEQUENCE 预览范围溢出")?;
    if cell_count > MAX_PREVIEW_CELLS {
        return Ok(blocked(
            &function,
            formula.range,
            diagnostic(
                "resource_limit",
                format!("动态数组内存预览最多返回 {MAX_PREVIEW_CELLS} 个单元格"),
                Vec::new(),
            ),
            dependency_count,
        ));
    }
    let bottom = payload
        .anchor_row
        .checked_add(rows - 1)
        .filter(|bottom| *bottom < MAX_XLSX_ROWS);
    let right = payload
        .anchor_column
        .checked_add(columns - 1)
        .filter(|right| *right < MAX_XLSX_COLUMNS);
    let (Some(bottom), Some(right)) = (bottom, right) else {
        return Ok(blocked(
            &function,
            formula.range,
            diagnostic(
                "sheet_boundary",
                "动态数组预览将超出 XLSX 工作表边界",
                Vec::new(),
            ),
            dependency_count,
        ));
    };
    let preview_range = WorkbookMergeRange {
        top: payload.anchor_row,
        bottom,
        left: payload.anchor_column,
        right,
    };
    let layout = read_workbook_sheet_layout(
        source,
        &payload.sheet,
        preview_range.top,
        preview_range.bottom.saturating_add(1),
        preview_range.right.saturating_add(1),
    )?;
    let source_values = workbook
        .worksheet_range(&payload.sheet)
        .map_err(|error| format!("E1A_IMPORT_FAILED: 读取预览工作表失败: {error}"))?;
    let foreign_formula_cells = formula
        .conflict_cells
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let mut conflicts = Vec::new();
    for row in preview_range.top..=preview_range.bottom {
        for column in preview_range.left..=preview_range.right {
            let address = cell_reference(row, column);
            let merged = layout
                .merged_cells
                .iter()
                .any(|range| is_inside(range, row, column));
            let inside_declared = is_inside(&formula.range, row, column);
            let has_formula = layout.formulas.contains_key(&(row, column));
            let edit = edits.get(&(payload.sheet.to_ascii_lowercase(), row, column));
            let source_value = source_values
                .get_value((row as u32, column as u32))
                .unwrap_or(&Data::Empty);
            let occupied = effective_occupied(source_value, edit, has_formula);
            let conflicts_with_content = if inside_declared {
                foreign_formula_cells.contains(&address)
            } else {
                occupied
            };
            if merged || conflicts_with_content {
                if conflicts.len() < MAX_DIAGNOSTIC_CELLS {
                    conflicts.push(address);
                }
            }
        }
    }
    if !conflicts.is_empty() {
        return Ok(blocked(
            &function,
            preview_range,
            diagnostic(
                "spill_conflict",
                "动态数组目标包含占用内容、外来公式或合并单元格",
                conflicts,
            ),
            dependency_count,
        ));
    }

    let mut cells = Vec::with_capacity(cell_count);
    for row_offset in 0..rows {
        for column_offset in 0..columns {
            let index = row_offset * columns + column_offset;
            let value = start + index as f64 * step;
            if !value.is_finite() {
                return Ok(blocked(
                    &function,
                    preview_range,
                    diagnostic(
                        "numeric_overflow",
                        "SEQUENCE 结果超出有限数字范围",
                        vec![cell_reference(
                            payload.anchor_row + row_offset,
                            payload.anchor_column + column_offset,
                        )],
                    ),
                    dependency_count,
                ));
            }
            let value = number_text(value);
            cells.push(WorkbookCalculatedCell {
                sheet: payload.sheet.clone(),
                row: payload.anchor_row + row_offset,
                column: payload.anchor_column + column_offset,
                value: value.clone(),
                formatted_value: value,
                kind: "number".into(),
            });
        }
    }
    Ok(WorkbookDynamicArrayPreviewResult {
        status: "ready".into(),
        function,
        range: preview_range,
        cells,
        diagnostics: Vec::new(),
        evaluated_dependency_count: dependency_count,
        source_package_unchanged: true,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_sequence, preview_dynamic_array};
    use crate::formats::workbook::{WorkbookCellEdit, WorkbookDynamicArrayPreviewPayload};
    use rust_xlsxwriter::{Formula, Workbook};

    fn dynamic_workbook(with_conflict: bool) -> Vec<u8> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 3, 3).unwrap();
        sheet.write_number(0, 4, 2).unwrap();
        sheet
            .write_dynamic_formula(0, 0, Formula::new("=SEQUENCE(D1,E1,10,2)").set_result("10"))
            .unwrap();
        if with_conflict {
            sheet.write_string(1, 1, "occupied").unwrap();
        }
        workbook.save_to_buffer().unwrap()
    }

    fn payload(edits: Vec<WorkbookCellEdit>) -> WorkbookDynamicArrayPreviewPayload {
        WorkbookDynamicArrayPreviewPayload {
            expected_signature: String::new(),
            sheet: "Data".into(),
            anchor_row: 0,
            anchor_column: 0,
            edits,
        }
    }

    #[test]
    fn parser_accepts_bounded_sequence_and_rejects_nested_or_unknown_functions() {
        let (_, sequence) = parse_sequence("=_xlfn.SEQUENCE(3,2,10,-1)", "Data").unwrap();
        assert!(matches!(sequence.rows, super::ScalarArgument::Number(3.0)));
        assert!(parse_sequence("=FILTER(A1:A3,A1:A3>0)", "Data")
            .unwrap_err()
            .contains("UNSUPPORTED_FUNCTION"));
        assert!(parse_sequence("=SEQUENCE(SUM(A1:A2))", "Data")
            .unwrap_err()
            .contains("UNSUPPORTED_ARGUMENT"));
    }

    #[test]
    fn previews_sequence_in_memory_with_unsaved_scalar_dependency() {
        let source = dynamic_workbook(false);
        let result = preview_dynamic_array(
            &source,
            payload(vec![WorkbookCellEdit {
                sheet: "Data".into(),
                row: 0,
                column: 3,
                input: "2".into(),
                kind: "number".into(),
            }]),
        )
        .unwrap();
        assert_eq!(result.status, "ready");
        assert_eq!(result.function, "SEQUENCE");
        assert_eq!(result.cells.len(), 4);
        assert_eq!(result.cells[0].value, "10");
        assert_eq!(result.cells[3].value, "16");
        assert_eq!(result.evaluated_dependency_count, 2);
        assert!(result.source_package_unchanged);
    }

    #[test]
    fn blocks_occupied_spill_targets_with_stable_addresses() {
        let source = dynamic_workbook(true);
        let result = preview_dynamic_array(&source, payload(Vec::new())).unwrap();
        assert_eq!(result.status, "blocked");
        assert_eq!(result.diagnostics[0].code, "spill_conflict");
        assert_eq!(result.diagnostics[0].cells, ["B2"]);
        assert!(result.cells.is_empty());
    }
}
