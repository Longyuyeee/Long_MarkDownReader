use crate::formats::workbook::{
    WorkbookCalculatedCell, WorkbookCalculationDiagnostic, WorkbookCalculationPayload,
    WorkbookCalculationResult,
};
use crate::formats::workbook_ooxml::{validate_edit, validate_workbook_calculation_boundary};
use ironcalc::base::{cell::CellValue, Model};
use ironcalc::import::load_from_xlsx_bytes;
use std::collections::{HashMap, HashSet};

const MAX_CALCULATION_EDITS: usize = 10_000;
const MAX_CALCULATION_TARGETS: usize = 10_000;
const MAX_XLSX_ROWS: usize = 1_048_576;
const MAX_XLSX_COLUMNS: usize = 16_384;

fn sheet_indexes(model: &Model<'_>) -> HashMap<String, u32> {
    model
        .workbook
        .worksheets
        .iter()
        .enumerate()
        .map(|(index, sheet)| (sheet.get_name(), index as u32))
        .collect()
}

fn cell_value(value: CellValue) -> (String, &'static str) {
    match value {
        CellValue::None => (String::new(), "empty"),
        CellValue::String(value) if value.starts_with('#') => (value, "error"),
        CellValue::String(value) => (value, "text"),
        CellValue::Number(value) => (value.to_string(), "number"),
        CellValue::Boolean(value) => (value.to_string(), "boolean"),
    }
}

fn error_category(code: &str) -> &'static str {
    match code {
        "#DIV/0!" => "division_by_zero",
        "#NAME?" => "name",
        "#VALUE!" => "value",
        "#REF!" => "reference",
        "#NUM!" => "number",
        "#N/A" => "not_available",
        "#CIRC!" => "circular",
        _ => "other",
    }
}

pub fn calculate_workbook(
    source: &[u8],
    workbook_name: &str,
    payload: WorkbookCalculationPayload,
) -> Result<WorkbookCalculationResult, String> {
    if payload.edits.len() > MAX_CALCULATION_EDITS {
        return Err(format!(
            "单次重算最多应用 {MAX_CALCULATION_EDITS} 个单元格变更"
        ));
    }
    if payload.targets.len() > MAX_CALCULATION_TARGETS {
        return Err(format!(
            "单次重算最多返回 {MAX_CALCULATION_TARGETS} 个公式结果"
        ));
    }
    validate_workbook_calculation_boundary(source)?;
    let workbook = load_from_xlsx_bytes(source, workbook_name, "en", "UTC")
        .map_err(|error| format!("公式引擎导入 XLSX 失败: {error}"))?;
    let mut model = Model::from_workbook(workbook, "en")
        .map_err(|error| format!("初始化公式引擎失败: {error}"))?;
    let indexes = sheet_indexes(&model);
    let mut edited = HashSet::new();
    for edit in payload.edits {
        validate_edit(&edit)?;
        if edit.row >= MAX_XLSX_ROWS || edit.column >= MAX_XLSX_COLUMNS {
            return Err("重算单元格坐标超出 XLSX 上限".into());
        }
        let Some(&sheet) = indexes.get(&edit.sheet) else {
            return Err(format!("重算工作表不存在: {}", edit.sheet));
        };
        if !edited.insert((sheet, edit.row, edit.column)) {
            return Err("重算请求包含重复单元格变更".into());
        }
        let row = i32::try_from(edit.row + 1).map_err(|_| "重算行坐标溢出")?;
        let column = i32::try_from(edit.column + 1).map_err(|_| "重算列坐标溢出")?;
        if edit.kind == "empty" {
            model.cell_clear_contents(sheet, row, column)?;
        } else {
            model.set_user_input(sheet, row, column, edit.input)?;
        }
    }

    model.evaluate();

    let mut targets = HashSet::new();
    let mut cells = Vec::with_capacity(payload.targets.len());
    let mut diagnostics = Vec::new();
    for target in payload.targets {
        if target.row >= MAX_XLSX_ROWS || target.column >= MAX_XLSX_COLUMNS {
            return Err("公式结果坐标超出 XLSX 上限".into());
        }
        let Some(&sheet) = indexes.get(&target.sheet) else {
            return Err(format!("公式结果工作表不存在: {}", target.sheet));
        };
        if !targets.insert((sheet, target.row, target.column)) {
            continue;
        }
        let row = i32::try_from(target.row + 1).map_err(|_| "公式结果行坐标溢出")?;
        let column = i32::try_from(target.column + 1).map_err(|_| "公式结果列坐标溢出")?;
        let (value, kind) = cell_value(model.get_cell_value_by_index(sheet, row, column)?);
        let formatted_value = model.get_formatted_cell_value(sheet, row, column)?;
        if kind == "error" {
            diagnostics.push(WorkbookCalculationDiagnostic {
                sheet: target.sheet.clone(),
                row: target.row,
                column: target.column,
                code: value.clone(),
                category: error_category(&value).into(),
            });
        }
        cells.push(WorkbookCalculatedCell {
            sheet: target.sheet,
            row: target.row,
            column: target.column,
            value,
            formatted_value,
            kind: kind.into(),
        });
    }
    Ok(WorkbookCalculationResult {
        evaluated_formula_count: cells.len(),
        cells,
        diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use super::calculate_workbook;
    use crate::formats::workbook::{
        WorkbookCalculationPayload, WorkbookCellEdit, WorkbookFormulaTarget,
    };
    use rust_xlsxwriter::{Formula, Workbook};

    const FUNCTION_FIXTURE: &[u8] =
        include_bytes!("../../tests/fixtures/workbook/formula-function-matrix.xlsx");
    const COMPATIBILITY_FIXTURE: &[u8] =
        include_bytes!("../../tests/fixtures/workbook/compatibility-baseline.xlsx");

    fn workbook_bytes() -> Vec<u8> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 10).unwrap();
        sheet.write_number(1, 0, 20).unwrap();
        sheet
            .write_formula(0, 1, Formula::new("=SUM(A1:A2)"))
            .unwrap();
        sheet.write_formula(1, 1, Formula::new("=B1*2")).unwrap();
        sheet.write_formula(2, 1, Formula::new("=B3+1")).unwrap();
        let summary = workbook.add_worksheet();
        summary.set_name("Summary").unwrap();
        summary
            .write_formula(0, 0, Formula::new("=Data!B2+5"))
            .unwrap();
        workbook.define_name("Numbers", "=Data!$A$1:$A$2").unwrap();
        workbook
            .worksheet_from_name("Data")
            .unwrap()
            .write_formula(3, 1, Formula::new("=SUM(Numbers)"))
            .unwrap();
        workbook.save_to_buffer().unwrap()
    }

    fn target(row: usize) -> WorkbookFormulaTarget {
        WorkbookFormulaTarget {
            sheet: "Data".into(),
            row,
            column: 1,
        }
    }

    fn fixture_target(row: usize) -> WorkbookFormulaTarget {
        WorkbookFormulaTarget {
            sheet: "Formula Matrix".into(),
            row,
            column: 4,
        }
    }

    #[test]
    fn recalculates_dependencies_with_unsaved_edits() {
        let result = calculate_workbook(
            &workbook_bytes(),
            "calculation.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: vec![WorkbookCellEdit {
                    sheet: "Data".into(),
                    row: 1,
                    column: 0,
                    input: "40".into(),
                    kind: "number".into(),
                }],
                targets: vec![
                    target(0),
                    target(1),
                    WorkbookFormulaTarget {
                        sheet: "Summary".into(),
                        row: 0,
                        column: 0,
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "50");
        assert_eq!(result.cells[1].value, "100");
        assert_eq!(result.cells[2].value, "105");
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn reports_circular_reference_errors() {
        let result = calculate_workbook(
            &workbook_bytes(),
            "calculation.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![target(2)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].kind, "error");
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].category, "circular");
    }

    #[test]
    fn recalculates_formula_using_named_range() {
        let result = calculate_workbook(
            &workbook_bytes(),
            "calculation.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: vec![WorkbookCellEdit {
                    sheet: "Data".into(),
                    row: 1,
                    column: 0,
                    input: "40".into(),
                    kind: "number".into(),
                }],
                targets: vec![target(3)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "50");
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn recalculates_verified_function_families_from_real_xlsx_fixture() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: (1..=14)
                    .map(fixture_target)
                    .chain([fixture_target(17)])
                    .collect(),
            },
        )
        .unwrap();
        let expected = [
            ("60", "number"),
            ("20", "number"),
            ("10", "number"),
            ("30", "number"),
            ("3", "number"),
            ("12.5", "number"),
            ("12.35", "number"),
            ("high", "text"),
            ("true", "boolean"),
            ("true", "boolean"),
            ("true", "boolean"),
            ("LongEdit", "text"),
            ("9", "number"),
            ("WORKSPACE", "text"),
            ("recovered", "text"),
        ];
        assert_eq!(result.cells.len(), expected.len());
        for (cell, (value, kind)) in result.cells.iter().zip(expected) {
            assert_eq!(cell.value, value);
            assert_eq!(cell.kind, kind);
        }
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn classifies_formula_errors_and_preserves_dependency_propagation() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: [fixture_target(15), fixture_target(16), fixture_target(18)].into(),
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "#DIV/0!");
        assert_eq!(result.cells[1].value, "#DIV/0!");
        assert_eq!(result.cells[2].value, "#NAME?");
        assert_eq!(result.diagnostics.len(), 3);
        assert_eq!(result.diagnostics[0].category, "division_by_zero");
        assert_eq!(result.diagnostics[1].category, "division_by_zero");
        assert_eq!(result.diagnostics[2].category, "name");
    }

    #[test]
    fn recalculates_verified_conditional_and_lookup_families() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: (19..=28)
                    .map(fixture_target)
                    .chain([fixture_target(29), fixture_target(31)])
                    .collect(),
            },
        )
        .unwrap();
        let expected = [
            ("50", "number"),
            ("2", "number"),
            ("25", "number"),
            ("5", "number"),
            ("200", "number"),
            ("Pro", "text"),
            ("300", "number"),
            ("300", "number"),
            ("3", "number"),
            ("3", "number"),
            ("400", "text"),
            ("missing", "text"),
        ];
        assert_eq!(result.cells.len(), expected.len());
        for (cell, (value, kind)) in result.cells.iter().zip(expected) {
            assert_eq!(cell.value, value);
            assert_eq!(cell.kind, kind);
        }
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn classifies_lookup_not_found_as_not_available() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![fixture_target(30)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "#N/A");
        assert_eq!(result.cells[0].kind, "error");
        assert_eq!(result.diagnostics[0].category, "not_available");
    }

    #[test]
    fn recalculates_verified_multi_criteria_and_date_families() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: (32..=35)
                    .map(fixture_target)
                    .chain((36..=40).map(fixture_target))
                    .collect(),
            },
        )
        .unwrap();
        let expected = [
            ("50", "number"),
            ("2", "number"),
            ("20", "number"),
            ("0", "number"),
            ("45351", "number"),
            ("2024", "number"),
            ("2", "number"),
            ("29", "number"),
            ("29", "number"),
        ];
        assert_eq!(result.cells.len(), expected.len());
        for (cell, (value, kind)) in result.cells.iter().zip(expected) {
            assert_eq!(cell.value, value);
            assert_eq!(cell.kind, kind);
        }
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn classifies_invalid_date_input_as_value() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![fixture_target(41)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "#VALUE!");
        assert!(result.cells.iter().all(|cell| cell.kind == "error"));
        assert_eq!(result.diagnostics.len(), 1);
        assert!(result
            .diagnostics
            .iter()
            .all(|diagnostic| diagnostic.category == "value"));
    }

    #[test]
    fn recalculates_verified_xlookup_scenarios() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: (42..=48)
                    .map(fixture_target)
                    .chain([50].map(fixture_target))
                    .collect(),
            },
        )
        .unwrap();
        let expected = [
            ("200", "number"),
            ("400", "text"),
            ("missing", "text"),
            ("30", "number"),
            ("300", "number"),
            ("Pro", "text"),
            ("300", "number"),
            ("recovered", "text"),
        ];
        assert_eq!(result.cells.len(), expected.len());
        for (cell, (value, kind)) in result.cells.iter().zip(expected) {
            assert_eq!(cell.value, value);
            assert_eq!(cell.kind, kind);
        }
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn classifies_xlookup_not_found_as_not_available() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![fixture_target(49)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "#N/A");
        assert_eq!(result.cells[0].kind, "error");
        assert_eq!(result.diagnostics[0].category, "not_available");
    }

    #[test]
    fn recalculates_xlookup_with_unsaved_dependency_edit() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: vec![WorkbookCellEdit {
                    sheet: "Formula Matrix".into(),
                    row: 3,
                    column: 2,
                    input: "West".into(),
                    kind: "string".into(),
                }],
                targets: vec![fixture_target(45)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "20");
        assert_eq!(result.cells[0].kind, "number");
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn recalculates_verified_volatile_scenarios() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: (51..=56).map(fixture_target).collect(),
            },
        )
        .unwrap();
        let expected = [
            ("50", "number"),
            ("20", "number"),
            ("300", "number"),
            ("true", "boolean"),
            ("5", "number"),
            ("true", "boolean"),
        ];
        assert_eq!(result.cells.len(), expected.len());
        for (cell, (value, kind)) in result.cells.iter().zip(expected) {
            assert_eq!(cell.value, value);
            assert_eq!(cell.kind, kind);
        }
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn recalculates_volatile_references_with_unsaved_dependency_edits() {
        let result = calculate_workbook(
            FUNCTION_FIXTURE,
            "formula-function-matrix.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: vec![
                    WorkbookCellEdit {
                        sheet: "Formula Matrix".into(),
                        row: 2,
                        column: 0,
                        input: "45".into(),
                        kind: "number".into(),
                    },
                    WorkbookCellEdit {
                        sheet: "Formula Matrix".into(),
                        row: 3,
                        column: 0,
                        input: "40".into(),
                        kind: "number".into(),
                    },
                ],
                targets: vec![fixture_target(51), fixture_target(52)],
            },
        )
        .unwrap();
        assert_eq!(result.cells[0].value, "85");
        assert_eq!(result.cells[1].value, "45");
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn rejects_array_and_dynamic_array_calculation() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet
            .write_dynamic_formula(0, 0, Formula::new("=SEQUENCE(3,1,1,1)").set_result("1"))
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let error = calculate_workbook(
            &source,
            "dynamic-array.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![WorkbookFormulaTarget {
                    sheet: "Sheet1".into(),
                    row: 0,
                    column: 0,
                }],
            },
        )
        .unwrap_err();
        assert!(error.contains("动态数组"));
        assert!(error.contains("保留原公式与缓存结果"));
    }

    #[test]
    fn rejects_external_workbook_calculation_offline() {
        let error = calculate_workbook(
            COMPATIBILITY_FIXTURE,
            "compatibility-baseline.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![WorkbookFormulaTarget {
                    sheet: "Inventory".into(),
                    row: 0,
                    column: 0,
                }],
            },
        )
        .unwrap_err();
        assert!(error.contains("保持离线"));
        assert!(error.contains("外部工作簿链接"));
    }

    #[test]
    fn rejects_duplicate_edits_and_unknown_sheets() {
        let edit = WorkbookCellEdit {
            sheet: "Data".into(),
            row: 0,
            column: 0,
            input: "1".into(),
            kind: "number".into(),
        };
        let duplicate = calculate_workbook(
            &workbook_bytes(),
            "calculation.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: vec![edit.clone(), edit],
                targets: Vec::new(),
            },
        );
        assert!(duplicate.is_err());

        let unknown = calculate_workbook(
            &workbook_bytes(),
            "calculation.xlsx",
            WorkbookCalculationPayload {
                expected_signature: String::new(),
                edits: Vec::new(),
                targets: vec![WorkbookFormulaTarget {
                    sheet: "Missing".into(),
                    row: 0,
                    column: 0,
                }],
            },
        );
        assert!(unknown.is_err());
    }
}
