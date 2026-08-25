use rust_xlsxwriter::{Formula, Workbook};
use std::path::PathBuf;

fn main() {
    let mut arguments = std::env::args_os().skip(1);
    let output = arguments
        .next()
        .map(PathBuf::from)
        .expect("output XLSX path is required");
    let rows = arguments
        .next()
        .and_then(|value| value.to_string_lossy().parse::<u32>().ok())
        .expect("row count is required");
    let columns = arguments
        .next()
        .and_then(|value| value.to_string_lossy().parse::<u16>().ok())
        .expect("column count is required");
    if arguments.next().is_some() || rows < 2 || columns < 2 {
        panic!("expected output, rows >= 2 and columns >= 2");
    }

    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Business").unwrap();
    sheet.set_freeze_panes(1, 1).unwrap();
    for column in 0..columns {
        sheet
            .write_string(0, column, format!("Field{}", column + 1))
            .unwrap();
    }
    for row in 1..rows {
        sheet
            .write_string(row, 0, format!("Record-{row:05}"))
            .unwrap();
        for column in 1..columns {
            if column == columns - 1 && row % 20 == 0 {
                sheet
                    .write_formula(
                        row,
                        column,
                        Formula::new(format!("=B{}+C{}", row + 1, row + 1))
                            .set_result((row * 3).to_string()),
                    )
                    .unwrap();
            } else {
                sheet
                    .write_number(row, column, f64::from(row) * f64::from(column))
                    .unwrap();
            }
        }
    }
    workbook.save(output).unwrap();
}
