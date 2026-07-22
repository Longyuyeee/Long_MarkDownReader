use a1::{Address, Column, RangeOrCell, Row, A1};
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;

use crate::formats::workbook::{
    WorkbookStructureAction, WorkbookStructureAxis, WorkbookStructureChange,
};

const XLSX_MAX_COLUMNS: usize = 16_384;
const XLSX_MAX_ROWS: usize = 1_048_576;
pub const MAX_FORMULA_TRANSLATIONS: usize = 10_000;
const MAX_FORMULA_BYTES: usize = 8_192;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookFormulaTranslation {
    pub formula: String,
    pub row_delta: i32,
    pub column_delta: i32,
}

fn reference_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(
            r"(?x)
            (?:'(?:[^']|'')+'!|[A-Za-z_][A-Za-z0-9_.]*!)?
            (?:
                \$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6})?
                |\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}
                |\$?[1-9][0-9]{0,6}:\$?[1-9][0-9]{0,6}
            )",
        )
        .expect("formula reference regex must compile")
    })
}

pub fn validate_workbook_structure_change(change: &WorkbookStructureChange) -> Result<(), String> {
    let limit = match change.axis {
        WorkbookStructureAxis::Row => XLSX_MAX_ROWS,
        WorkbookStructureAxis::Column => XLSX_MAX_COLUMNS,
    };
    if change.sheet.is_empty()
        || change.sheet.chars().count() > 31
        || change.count == 0
        || change.index >= limit
        || change.count > limit
        || (change.action == WorkbookStructureAction::Delete
            && change.index.saturating_add(change.count) > limit)
    {
        return Err("工作簿结构变更目标无效".into());
    }
    Ok(())
}

fn migrate_index(index: usize, change: &WorkbookStructureChange, limit: usize) -> Option<usize> {
    match change.action {
        WorkbookStructureAction::Insert => {
            if index < change.index {
                Some(index)
            } else {
                index
                    .checked_add(change.count)
                    .filter(|shifted| *shifted < limit)
            }
        }
        WorkbookStructureAction::Delete => {
            let end = change.index + change.count;
            if index < change.index {
                Some(index)
            } else if index < end {
                None
            } else {
                Some(index - change.count)
            }
        }
    }
}

fn migrate_span(
    start: usize,
    end: usize,
    change: &WorkbookStructureChange,
    limit: usize,
) -> Option<(usize, usize)> {
    debug_assert!(start <= end);
    match change.action {
        WorkbookStructureAction::Insert => {
            if change.index <= start {
                Some((
                    start
                        .checked_add(change.count)
                        .filter(|value| *value < limit)?,
                    end.checked_add(change.count)
                        .filter(|value| *value < limit)?,
                ))
            } else if change.index <= end {
                Some((
                    start,
                    end.checked_add(change.count)
                        .filter(|value| *value < limit)?,
                ))
            } else {
                Some((start, end))
            }
        }
        WorkbookStructureAction::Delete => {
            let deleted_end = change.index + change.count - 1;
            if end < change.index {
                Some((start, end))
            } else if start > deleted_end {
                Some((start - change.count, end - change.count))
            } else {
                let survivors_before = start < change.index;
                let survivors_after = end > deleted_end;
                match (survivors_before, survivors_after) {
                    (false, false) => None,
                    (true, false) => Some((start, change.index - 1)),
                    (false, true) => Some((change.index, end - change.count)),
                    (true, true) => Some((start, end - change.count)),
                }
            }
        }
    }
}

fn migrate_column(column: Column, change: &WorkbookStructureChange) -> Option<Column> {
    Some(Column {
        x: migrate_index(column.x, change, XLSX_MAX_COLUMNS)?,
        ..column
    })
}

fn migrate_row(row: Row, change: &WorkbookStructureChange) -> Option<Row> {
    Some(Row {
        y: migrate_index(row.y, change, XLSX_MAX_ROWS)?,
        ..row
    })
}

fn migrate_address(address: Address, change: &WorkbookStructureChange) -> Option<Address> {
    Some(match change.axis {
        WorkbookStructureAxis::Row => Address {
            row: migrate_row(address.row, change)?,
            ..address
        },
        WorkbookStructureAxis::Column => Address {
            column: migrate_column(address.column, change)?,
            ..address
        },
    })
}

fn migrate_range(reference: RangeOrCell, change: &WorkbookStructureChange) -> Option<RangeOrCell> {
    Some(match reference {
        RangeOrCell::Cell(address) => RangeOrCell::Cell(migrate_address(address, change)?),
        RangeOrCell::Range { mut from, mut to } => {
            match change.axis {
                WorkbookStructureAxis::Row => {
                    let (start, end) = migrate_span(from.row.y, to.row.y, change, XLSX_MAX_ROWS)?;
                    from.row.y = start;
                    to.row.y = end;
                }
                WorkbookStructureAxis::Column => {
                    let (start, end) =
                        migrate_span(from.column.x, to.column.x, change, XLSX_MAX_COLUMNS)?;
                    from.column.x = start;
                    to.column.x = end;
                }
            }
            RangeOrCell::Range { from, to }
        }
        RangeOrCell::ColumnRange { mut from, mut to } => {
            if change.axis == WorkbookStructureAxis::Column {
                let (start, end) = migrate_span(from.x, to.x, change, XLSX_MAX_COLUMNS)?;
                from.x = start;
                to.x = end;
            }
            RangeOrCell::ColumnRange { from, to }
        }
        RangeOrCell::RowRange { mut from, mut to } => {
            if change.axis == WorkbookStructureAxis::Row {
                let (start, end) = migrate_span(from.y, to.y, change, XLSX_MAX_ROWS)?;
                from.y = start;
                to.y = end;
            }
            RangeOrCell::RowRange { from, to }
        }
        RangeOrCell::NonContiguous(references) => {
            let migrated = references
                .into_iter()
                .filter_map(|reference| migrate_range(reference, change))
                .collect::<Vec<_>>();
            if migrated.is_empty() {
                return None;
            }
            RangeOrCell::NonContiguous(migrated)
        }
    })
}

fn targets_changed_sheet(parsed: &A1, current_sheet: Option<&str>, changed_sheet: &str) -> bool {
    parsed
        .sheet_name
        .as_deref()
        .or(current_sheet)
        .is_some_and(|sheet| sheet.eq_ignore_ascii_case(changed_sheet))
}

pub fn migrate_workbook_reference(
    reference: &str,
    current_sheet: Option<&str>,
    change: &WorkbookStructureChange,
) -> Result<String, String> {
    validate_workbook_structure_change(change)?;
    let parsed = a1::new(reference).map_err(|_| format!("工作簿引用无效: {reference}"))?;
    if !targets_changed_sheet(&parsed, current_sheet, &change.sheet) {
        return Ok(reference.into());
    }
    Ok(migrate_range(parsed.reference.clone(), change)
        .map(|migrated| {
            A1 {
                reference: migrated,
                ..parsed
            }
            .to_string()
        })
        .unwrap_or_else(|| "#REF!".into()))
}

fn shifted_index(index: usize, delta: i32, absolute: bool, limit: usize) -> Option<usize> {
    if absolute || delta == 0 {
        return (index < limit).then_some(index);
    }
    let shifted = index as i64 + delta as i64;
    (shifted >= 0 && shifted < limit as i64).then_some(shifted as usize)
}

fn shift_column(column: Column, delta: i32) -> Option<Column> {
    Some(Column {
        x: shifted_index(column.x, delta, column.absolute, XLSX_MAX_COLUMNS)?,
        ..column
    })
}

fn shift_row(row: Row, delta: i32) -> Option<Row> {
    Some(Row {
        y: shifted_index(row.y, delta, row.absolute, XLSX_MAX_ROWS)?,
        ..row
    })
}

fn shift_address(address: Address, row_delta: i32, column_delta: i32) -> Option<Address> {
    Some(Address {
        column: shift_column(address.column, column_delta)?,
        row: shift_row(address.row, row_delta)?,
    })
}

fn shift_reference(
    reference: RangeOrCell,
    row_delta: i32,
    column_delta: i32,
) -> Option<RangeOrCell> {
    Some(match reference {
        RangeOrCell::Cell(address) => {
            RangeOrCell::Cell(shift_address(address, row_delta, column_delta)?)
        }
        RangeOrCell::Range { from, to } => RangeOrCell::Range {
            from: shift_address(from, row_delta, column_delta)?,
            to: shift_address(to, row_delta, column_delta)?,
        },
        RangeOrCell::ColumnRange { from, to } => RangeOrCell::ColumnRange {
            from: shift_column(from, column_delta)?,
            to: shift_column(to, column_delta)?,
        },
        RangeOrCell::RowRange { from, to } => RangeOrCell::RowRange {
            from: shift_row(from, row_delta)?,
            to: shift_row(to, row_delta)?,
        },
        RangeOrCell::NonContiguous(references) => RangeOrCell::NonContiguous(
            references
                .into_iter()
                .map(|reference| shift_reference(reference, row_delta, column_delta))
                .collect::<Option<Vec<_>>>()?,
        ),
    })
}

fn is_identifier_byte(value: u8) -> bool {
    value.is_ascii_alphanumeric() || matches!(value, b'_' | b'.' | b'@' | b'#')
}

fn should_skip_reference_candidate(segment: &str, start: usize, end: usize) -> bool {
    let preceded_by_identifier = start > 0 && is_identifier_byte(segment.as_bytes()[start - 1]);
    let followed_by_identifier = end < segment.len() && is_identifier_byte(segment.as_bytes()[end]);
    let followed_by_call = segment[end..].trim_start().starts_with('(');
    let inside_brackets = segment[..start].rfind('[') > segment[..start].rfind(']');
    let touches_brackets = start > 0 && matches!(segment.as_bytes()[start - 1], b'[' | b']')
        || end < segment.len() && matches!(segment.as_bytes()[end], b'[' | b']');
    let starts_inside_3d_reference = start > 0 && segment.as_bytes()[start - 1] == b':';
    preceded_by_identifier
        || followed_by_identifier
        || followed_by_call
        || inside_brackets
        || touches_brackets
        || starts_inside_3d_reference
}

fn translate_segment(segment: &str, row_delta: i32, column_delta: i32) -> String {
    let mut output = String::with_capacity(segment.len());
    let mut cursor = 0;
    for candidate in reference_regex().find_iter(segment) {
        let start = candidate.start();
        let end = candidate.end();
        if should_skip_reference_candidate(segment, start, end) {
            continue;
        }
        let Ok(parsed) = a1::new(candidate.as_str()) else {
            continue;
        };
        output.push_str(&segment[cursor..start]);
        let shifted = shift_reference(parsed.reference, row_delta, column_delta)
            .map(|reference| {
                A1 {
                    reference,
                    ..parsed
                }
                .to_string()
            })
            .unwrap_or_else(|| "#REF!".into());
        output.push_str(&shifted);
        cursor = end;
    }
    output.push_str(&segment[cursor..]);
    output
}

fn migrate_structure_segment(
    segment: &str,
    current_sheet: Option<&str>,
    change: &WorkbookStructureChange,
) -> String {
    let mut output = String::with_capacity(segment.len());
    let mut cursor = 0;
    for candidate in reference_regex().find_iter(segment) {
        let start = candidate.start();
        let end = candidate.end();
        if should_skip_reference_candidate(segment, start, end) {
            continue;
        }
        let Ok(parsed) = a1::new(candidate.as_str()) else {
            continue;
        };
        if !targets_changed_sheet(&parsed, current_sheet, &change.sheet) {
            continue;
        }
        output.push_str(&segment[cursor..start]);
        let migrated = migrate_range(parsed.reference.clone(), change)
            .map(|reference| {
                A1 {
                    reference,
                    ..parsed
                }
                .to_string()
            })
            .unwrap_or_else(|| "#REF!".into());
        output.push_str(&migrated);
        cursor = end;
    }
    output.push_str(&segment[cursor..]);
    output
}

pub fn translate_formula(
    formula: &str,
    row_delta: i32,
    column_delta: i32,
) -> Result<String, String> {
    if !formula.starts_with('=') {
        return Err("公式必须以 = 开头".into());
    }
    if formula.len() > MAX_FORMULA_BYTES {
        return Err(format!("公式不能超过 {MAX_FORMULA_BYTES} 字节"));
    }

    let mut output = String::with_capacity(formula.len());
    let mut segment_start = 0;
    let mut chars = formula.char_indices().peekable();
    while let Some((quote_start, character)) = chars.next() {
        if character != '"' {
            continue;
        }
        output.push_str(&translate_segment(
            &formula[segment_start..quote_start],
            row_delta,
            column_delta,
        ));
        let mut quote_end = formula.len();
        while let Some((index, character)) = chars.next() {
            if character != '"' {
                continue;
            }
            if matches!(chars.peek(), Some((_, '"'))) {
                chars.next();
                continue;
            }
            quote_end = index + character.len_utf8();
            break;
        }
        output.push_str(&formula[quote_start..quote_end]);
        segment_start = quote_end;
    }
    output.push_str(&translate_segment(
        &formula[segment_start..],
        row_delta,
        column_delta,
    ));
    Ok(output)
}

pub fn migrate_workbook_formula(
    formula: &str,
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<String, String> {
    if !formula.starts_with('=') {
        return Err("公式必须以 = 开头".into());
    }
    if formula.len() > MAX_FORMULA_BYTES {
        return Err(format!("公式不能超过 {MAX_FORMULA_BYTES} 字节"));
    }
    validate_workbook_structure_change(change)?;

    let mut output = String::with_capacity(formula.len());
    let mut segment_start = 0;
    let mut chars = formula.char_indices().peekable();
    while let Some((quote_start, character)) = chars.next() {
        if character != '"' {
            continue;
        }
        output.push_str(&migrate_structure_segment(
            &formula[segment_start..quote_start],
            Some(current_sheet),
            change,
        ));
        let mut quote_end = formula.len();
        while let Some((index, character)) = chars.next() {
            if character != '"' {
                continue;
            }
            if matches!(chars.peek(), Some((_, '"'))) {
                chars.next();
                continue;
            }
            quote_end = index + character.len_utf8();
            break;
        }
        output.push_str(&formula[quote_start..quote_end]);
        segment_start = quote_end;
    }
    output.push_str(&migrate_structure_segment(
        &formula[segment_start..],
        Some(current_sheet),
        change,
    ));
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_workbook_formula, migrate_workbook_reference, translate_formula, XLSX_MAX_ROWS,
    };
    use crate::formats::workbook::{
        WorkbookStructureAction, WorkbookStructureAxis, WorkbookStructureChange,
    };

    fn change(
        axis: WorkbookStructureAxis,
        action: WorkbookStructureAction,
        index: usize,
        count: usize,
    ) -> WorkbookStructureChange {
        WorkbookStructureChange {
            sheet: "Data Sheet".into(),
            axis,
            action,
            index,
            count,
        }
    }

    #[test]
    fn translates_relative_and_mixed_references() {
        assert_eq!(
            translate_formula("=A1+$A1+A$1+$A$1", 2, 3).unwrap(),
            "=D3+$A3+D$1+$A$1"
        );
    }

    #[test]
    fn translates_ranges_and_sheet_references() {
        assert_eq!(
            translate_formula("=SUM(A1:B2)+'Sales 2026'!C3+Sheet2!$D4", 1, 1).unwrap(),
            "=SUM(B2:C3)+'Sales 2026'!D4+Sheet2!$D5"
        );
    }

    #[test]
    fn skips_string_literals_and_function_names() {
        assert_eq!(
            translate_formula("=IF(A1=\"A1\",LOG10(B2),\"say \"\"C3\"\"\")", 1, 1).unwrap(),
            "=IF(B2=\"A1\",LOG10(C3),\"say \"\"C3\"\"\")"
        );
        assert_eq!(
            translate_formula("=LOG10 (A1)+SUM(Table1[A1])+B2", 1, 1).unwrap(),
            "=LOG10 (B2)+SUM(Table1[A1])+C3"
        );
    }

    #[test]
    fn emits_ref_for_out_of_bounds_relative_references() {
        assert_eq!(
            translate_formula("=A1+$A$1", -1, -1).unwrap(),
            "=#REF!+$A$1"
        );
        assert_eq!(translate_formula("=XFD1048576", 1, 0).unwrap(), "=#REF!");
    }

    #[test]
    fn rejects_non_formula_and_oversized_input() {
        assert!(translate_formula("A1", 1, 1).is_err());
        assert!(translate_formula(&format!("={}", "A".repeat(8_192)), 1, 1).is_err());
    }

    #[test]
    fn structural_insert_moves_absolute_and_cross_sheet_references() {
        let edit = change(
            WorkbookStructureAxis::Row,
            WorkbookStructureAction::Insert,
            1,
            2,
        );
        assert_eq!(
            migrate_workbook_formula(
                "=A1+$A$2+'Data Sheet'!B3+Other!C4+\"A2\"+SUM(Table1[A2])",
                "Data Sheet",
                &edit,
            )
            .unwrap(),
            "=A1+$A$4+'Data Sheet'!B5+Other!C4+\"A2\"+SUM(Table1[A2])"
        );
        assert_eq!(
            migrate_workbook_formula("=A2+'Data Sheet'!B2", "Other", &edit).unwrap(),
            "=A2+'Data Sheet'!B4"
        );
    }

    #[test]
    fn structural_delete_shrinks_ranges_and_emits_ref_for_deleted_cells() {
        let edit = change(
            WorkbookStructureAxis::Row,
            WorkbookStructureAction::Delete,
            2,
            3,
        );
        assert_eq!(
            migrate_workbook_formula("=A1:A10+A3+A6+$2:$8", "Data Sheet", &edit).unwrap(),
            "=A1:A7+#REF!+A3+$2:$5"
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!A3:A5", None, &edit).unwrap(),
            "#REF!"
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!A2:A4", None, &edit).unwrap(),
            "'Data Sheet'!A2:A2"
        );
    }

    #[test]
    fn structural_column_edits_expand_and_contract_two_dimensional_ranges() {
        let insert = change(
            WorkbookStructureAxis::Column,
            WorkbookStructureAction::Insert,
            2,
            2,
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!A1:D5", None, &insert).unwrap(),
            "'Data Sheet'!A1:F5"
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!C:F", None, &insert).unwrap(),
            "'Data Sheet'!E:H"
        );

        let delete = change(
            WorkbookStructureAxis::Column,
            WorkbookStructureAction::Delete,
            1,
            2,
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!A1:E5", None, &delete).unwrap(),
            "'Data Sheet'!A1:C5"
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!B2:C4", None, &delete).unwrap(),
            "#REF!"
        );
    }

    #[test]
    fn structural_migration_validates_limits_and_preserves_unrelated_sheets() {
        let invalid = change(
            WorkbookStructureAxis::Row,
            WorkbookStructureAction::Delete,
            XLSX_MAX_ROWS - 1,
            2,
        );
        assert!(migrate_workbook_reference("A1", Some("Data Sheet"), &invalid).is_err());

        let overflow = change(
            WorkbookStructureAxis::Row,
            WorkbookStructureAction::Insert,
            0,
            1,
        );
        assert_eq!(
            migrate_workbook_reference("'Data Sheet'!A1048576", None, &overflow).unwrap(),
            "#REF!"
        );
        assert_eq!(
            migrate_workbook_reference("Other!$A$2", None, &overflow).unwrap(),
            "Other!$A$2"
        );
        assert_eq!(
            migrate_workbook_formula(
                "=SUM(Sheet1:'Data Sheet'!A1)+[Book1.xlsx]'Data Sheet'!A1",
                "Other",
                &overflow,
            )
            .unwrap(),
            "=SUM(Sheet1:'Data Sheet'!A1)+[Book1.xlsx]'Data Sheet'!A1"
        );
    }
}
