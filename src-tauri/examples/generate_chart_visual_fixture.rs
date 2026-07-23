use rust_xlsxwriter::{
    Chart, ChartDataLabel, ChartFormat, ChartLegendPosition, ChartLine, ChartSolidFill, ChartType,
    Color, Format, FormatAlign, Workbook, XlsxError,
};
use std::path::PathBuf;

fn main() -> Result<(), XlsxError> {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbook/chart-visual-matrix.xlsx");
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Chart Matrix")?;
    for column in 0..=4 {
        worksheet.set_column_width(column, 13)?;
    }

    let header = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_background_color(Color::RGB(0xE8EEF8));
    let headers = ["Quarter", "Revenue", "Cost", "X value", "Y value"];
    for (column, value) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, column as u16, *value, &header)?;
    }

    let rows = [
        ("Q1", 42.0, 27.0, 1.0, 3.2),
        ("Q2", 58.0, 35.0, 2.0, 4.8),
        ("Q3", 73.0, 49.0, 3.0, 6.1),
        ("Q4", 89.0, 61.0, 4.0, 8.4),
    ];
    for (row, (quarter, revenue, cost, x_value, y_value)) in rows.iter().enumerate() {
        let row = (row + 1) as u32;
        worksheet.write_string(row, 0, *quarter)?;
        worksheet.write_number(row, 1, *revenue)?;
        worksheet.write_number(row, 2, *cost)?;
        worksheet.write_number(row, 3, *x_value)?;
        worksheet.write_number(row, 4, *y_value)?;
    }

    let mut column = Chart::new(ChartType::Column);
    column.title().set_name("Quarterly revenue");
    column.x_axis().set_name("Quarter");
    column.y_axis().set_name("Amount");
    column.legend().set_position(ChartLegendPosition::Bottom);
    column
        .add_series()
        .set_name("Revenue")
        .set_categories(("Chart Matrix", 1, 0, 4, 0))
        .set_values(("Chart Matrix", 1, 1, 4, 1))
        .set_format(
            ChartFormat::new()
                .set_solid_fill(ChartSolidFill::new().set_color(Color::RGB(0x2A6FDB)))
                .set_line(ChartLine::new().set_color(Color::RGB(0x2A6FDB))),
        )
        .set_data_label(ChartDataLabel::new().show_value());
    column
        .add_series()
        .set_name("Cost")
        .set_categories(("Chart Matrix", 1, 0, 4, 0))
        .set_values(("Chart Matrix", 1, 2, 4, 2))
        .set_format(
            ChartFormat::new()
                .set_solid_fill(ChartSolidFill::new().set_color(Color::RGB(0xE45756)))
                .set_line(ChartLine::new().set_color(Color::RGB(0xE45756))),
        )
        .set_data_label(ChartDataLabel::new().show_value());
    worksheet.insert_chart(7, 0, &column)?;

    let mut line = Chart::new(ChartType::Line);
    line.title().set_name("Revenue trend");
    line.x_axis().set_name("Quarter");
    line.y_axis().set_name("Amount");
    line.legend().set_position(ChartLegendPosition::Right);
    line.add_series()
        .set_name("Revenue")
        .set_categories(("Chart Matrix", 1, 0, 4, 0))
        .set_values(("Chart Matrix", 1, 1, 4, 1))
        .set_format(
            ChartFormat::new().set_line(
                ChartLine::new()
                    .set_color(Color::RGB(0x16A085))
                    .set_width(2.25),
            ),
        )
        .set_data_label(ChartDataLabel::new().show_value());
    worksheet.insert_chart(7, 9, &line)?;

    let mut pie = Chart::new(ChartType::Pie);
    pie.title().set_name("Quarterly share");
    pie.legend().set_position(ChartLegendPosition::Bottom);
    pie.add_series()
        .set_name("Revenue share")
        .set_categories(("Chart Matrix", 1, 0, 4, 0))
        .set_values(("Chart Matrix", 1, 1, 4, 1))
        .set_data_label(ChartDataLabel::new().show_category_name().show_percentage());
    worksheet.insert_chart(27, 0, &pie)?;

    let mut scatter = Chart::new(ChartType::Scatter);
    scatter.title().set_name("Correlation");
    scatter.x_axis().set_name("X value");
    scatter.y_axis().set_name("Y value");
    scatter.legend().set_position(ChartLegendPosition::Top);
    scatter
        .add_series()
        .set_name("Observations")
        .set_categories(("Chart Matrix", 1, 3, 4, 3))
        .set_values(("Chart Matrix", 1, 4, 4, 4))
        .set_format(
            ChartFormat::new().set_line(
                ChartLine::new()
                    .set_color(Color::RGB(0x7B61A8))
                    .set_width(2.0),
            ),
        )
        .set_data_label(ChartDataLabel::new().show_value());
    worksheet.insert_chart(27, 9, &scatter)?;

    workbook.save(output)
}
