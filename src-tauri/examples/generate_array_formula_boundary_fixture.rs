use rust_xlsxwriter::{Formula, Workbook};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbook/array-formula-boundary.xlsx");
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Array Boundary")?;

    sheet.write_string(0, 0, "Input")?;
    sheet.write_string(0, 1, "Legacy array")?;
    sheet.write_string(0, 3, "Dynamic array")?;
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        sheet.write_number(u32::try_from(row + 1)?, 0, value)?;
    }
    sheet.write_array_formula(
        1,
        1,
        3,
        1,
        Formula::new("=A2:A4*2").set_result("2"),
    )?;
    sheet.write_dynamic_array_formula(
        1,
        3,
        3,
        3,
        Formula::new("=SEQUENCE(3,1,10,1)").set_result("10"),
    )?;

    workbook.save(&output)?;
    println!("{}", output.display());
    Ok(())
}
