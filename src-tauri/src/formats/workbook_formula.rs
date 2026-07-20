use a1::{Address, Column, RangeOrCell, Row, A1};
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;

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
            r"(?x)(?:'(?:[^']|'')+'!|[A-Za-z_][A-Za-z0-9_.]*!)?\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6})?",
        )
        .expect("formula reference regex must compile")
    })
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

fn translate_segment(segment: &str, row_delta: i32, column_delta: i32) -> String {
    let mut output = String::with_capacity(segment.len());
    let mut cursor = 0;
    for candidate in reference_regex().find_iter(segment) {
        let start = candidate.start();
        let end = candidate.end();
        let preceded_by_identifier = start > 0 && is_identifier_byte(segment.as_bytes()[start - 1]);
        let followed_by_identifier =
            end < segment.len() && is_identifier_byte(segment.as_bytes()[end]);
        let followed_by_call = segment[end..].trim_start().starts_with('(');
        let inside_brackets = segment[..start].rfind('[') > segment[..start].rfind(']');
        let touches_brackets = start > 0 && segment.as_bytes()[start - 1] == b'['
            || end < segment.len() && matches!(segment.as_bytes()[end], b'[' | b']');
        if preceded_by_identifier
            || followed_by_identifier
            || followed_by_call
            || inside_brackets
            || touches_brackets
        {
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

#[cfg(test)]
mod tests {
    use super::translate_formula;

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
}
