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
    let _ = sheet;

    let lookup = workbook.add_worksheet();
    lookup.set_name("Lookup Data")?;
    lookup.write_string(0, 0, "Code")?;
    lookup.write_string(0, 1, "Amount")?;
    for (row, (code, value)) in [("A", 100.0), ("B", 200.0), ("C", 300.0)]
        .into_iter()
        .enumerate()
    {
        lookup.write_string(u32::try_from(row + 1)?, 0, code)?;
        lookup.write_number(u32::try_from(row + 1)?, 1, value)?;
    }
    lookup.write_string(4, 0, "D")?;
    lookup.write_string(4, 1, "400")?;
    lookup.write_string(5, 0, "E")?;
    lookup.write_number(5, 1, 500)?;
    for (column, (code, value)) in [("A", 100.0), ("B", 200.0), ("C", 300.0), ("D", 400.0)]
        .into_iter()
        .enumerate()
    {
        lookup.write_string(7, u16::try_from(column)?, code)?;
        lookup.write_number(8, u16::try_from(column)?, value)?;
    }
    for (row, (threshold, label)) in [
        (0.0, "Starter"),
        (10.0, "Basic"),
        (20.0, "Pro"),
        (30.0, "Enterprise"),
    ]
    .into_iter()
    .enumerate()
    {
        lookup.write_number(u32::try_from(row + 1)?, 4, threshold)?;
        lookup.write_string(u32::try_from(row + 1)?, 5, label)?;
    }

    let sheet = workbook
        .worksheet_from_name("Formula Matrix")
        .expect("formula fixture sheet");
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
        ("conditional_sumif", "=SUMIF(A2:A4,\">15\")", "50"),
        ("conditional_countif", "=COUNTIF(A2:A4,\">=20\")", "2"),
        ("conditional_averageif", "=AVERAGEIF(A2:A4,\">10\")", "25"),
        (
            "conditional_wildcard",
            "=COUNTIF('Lookup Data'!A2:A6,\"?\")",
            "5",
        ),
        (
            "lookup_vlookup_exact",
            "=VLOOKUP(\"B\",'Lookup Data'!A2:B6,2,FALSE)",
            "200",
        ),
        (
            "lookup_vlookup_approximate",
            "=VLOOKUP(25,'Lookup Data'!E2:F5,2,TRUE)",
            "Pro",
        ),
        (
            "lookup_hlookup_exact",
            "=HLOOKUP(\"C\",'Lookup Data'!A8:D9,2,FALSE)",
            "300",
        ),
        ("lookup_index", "=INDEX('Lookup Data'!B2:B6,3)", "300"),
        (
            "lookup_match_exact",
            "=MATCH(\"C\",'Lookup Data'!A2:A6,0)",
            "3",
        ),
        (
            "lookup_match_approximate",
            "=MATCH(25,'Lookup Data'!E2:E5,1)",
            "3",
        ),
        (
            "lookup_text_result",
            "=VLOOKUP(\"D\",'Lookup Data'!A2:B6,2,FALSE)",
            "400",
        ),
        (
            "lookup_not_found",
            "=VLOOKUP(\"Z\",'Lookup Data'!A2:B6,2,FALSE)",
            "#N/A",
        ),
        (
            "lookup_error_recovery",
            "=IFERROR(E31,\"missing\")",
            "missing",
        ),
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
