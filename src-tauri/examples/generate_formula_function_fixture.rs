use rust_xlsxwriter::{Format, Formula, Workbook};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbook/formula-function-matrix.xlsx");
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Formula Matrix")?;

    let header = Format::new().set_bold();
    sheet.write_with_format(0, 0, "Value", &header)?;
    sheet.write_with_format(0, 1, "Text", &header)?;
    sheet.write_with_format(0, 3, "Case", &header)?;
    sheet.write_with_format(0, 4, "Formula result", &header)?;
    sheet.write_number(1, 0, 10)?;
    sheet.write_number(2, 0, 20)?;
    sheet.write_number(3, 0, 30)?;
    sheet.write_string(1, 1, " long edit ")?;
    sheet.write_string(2, 1, "workspace")?;

    let cases = [
        ("aggregate_sum", "=SUM(A2:A4)", "60"),
        ("aggregate_average", "=AVERAGE(A2:A4)", "20"),
        ("aggregate_min", "=MIN(A2:A4)", "10"),
        ("aggregate_max", "=MAX(A2:A4)", "30"),
        ("aggregate_count", "=COUNT(A2:A4)", "3"),
        ("math_abs", "=ABS(-12.5)", "12.5"),
        ("math_round", "=ROUND(12.345,2)", "12.35"),
        ("logical_if", "=IF(A4>25,\"high\",\"low\")", "high"),
        ("logical_and", "=AND(A2=10,A4=30)", "TRUE"),
        ("logical_or", "=OR(A2=0,A3=20)", "TRUE"),
        ("logical_not", "=NOT(A2=0)", "TRUE"),
        ("text_concat", "=CONCAT(\"Long\",\"Edit\")", "LongEdit"),
        ("text_len_trim", "=LEN(TRIM(B2))", "9"),
        ("text_upper", "=UPPER(B3)", "WORKSPACE"),
        ("error_division", "=1/0", "#DIV/0!"),
        ("error_propagation", "=E16+1", "#DIV/0!"),
        ("error_recovery", "=IFERROR(E16,\"recovered\")", "recovered"),
        ("unknown_function", "=LONGEDIT_UNKNOWN(A2)", "#NAME?"),
    ];
    for (index, (id, formula, cached_result)) in cases.iter().enumerate() {
        let row = u32::try_from(index + 1)?;
        sheet.write_string(row, 3, *id)?;
        sheet.write_formula(row, 4, Formula::new(*formula).set_result(*cached_result))?;
    }
    sheet.set_column_width(1, 16)?;
    sheet.set_column_width(3, 24)?;
    sheet.set_column_width(4, 20)?;
    workbook.save(output)?;
    Ok(())
}
