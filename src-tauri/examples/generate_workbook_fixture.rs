use rust_xlsxwriter::{Color, Format, Formula, Workbook, XlsxError};
use std::path::PathBuf;

fn main() -> Result<(), XlsxError> {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbook/compatibility-baseline.xlsx");
    let mut workbook = Workbook::new();
    let header = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x2563EB));
    let currency = Format::new().set_num_format("$#,##0.00");

    let summary = workbook.add_worksheet();
    summary.set_name("Summary")?;
    summary.write_with_format(0, 0, "Item", &header)?;
    summary.write_with_format(0, 1, "Amount", &header)?;
    summary.write_with_format(0, 2, "Approved", &header)?;
    summary.write_string(1, 0, "Alpha")?;
    summary.write_with_format(1, 1, 1250.5, &currency)?;
    summary.write_boolean(1, 2, true)?;
    summary.write_string(2, 0, "Total")?;
    summary.write_formula(2, 1, Formula::new("=SUM(B2:B2)").set_result("1250.5"))?;
    summary.merge_range(4, 0, 4, 2, "Merged fixture title", &header)?;
    summary.set_column_width(0, 22)?;
    summary.set_column_width(1, 16)?;

    let details = workbook.add_worksheet();
    details.set_name("Details")?;
    details.write_string(0, 0, "Code")?;
    details.write_string(1, 0, "A-001")?;

    workbook.save(output)
}
