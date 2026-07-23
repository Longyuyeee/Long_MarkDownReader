use crate::formats::workbook::{WorkbookChartSeries, WorkbookMergeRange};
use crate::formats::workbook_ooxml::{absolute_cell_reference, defined_name_reference};
use rust_xlsxwriter::{Chart, ChartType, Workbook};
use std::io::{Cursor, Read};
use zip::ZipArchive;

const MAX_XLSX_ROWS: usize = 1_048_576;
const MAX_XLSX_COLUMNS: usize = 16_384;
const MAX_CHART_SERIES: usize = 256;
const MAX_CHART_TITLE: usize = 1_024;

pub(super) fn supported_chart_type(value: &str) -> Result<ChartType, String> {
    match value {
        "column" => Ok(ChartType::Column),
        "bar" => Ok(ChartType::Bar),
        "line" => Ok(ChartType::Line),
        "pie" => Ok(ChartType::Pie),
        "scatter" => Ok(ChartType::Scatter),
        _ => Err("Only column, bar, line, pie, and scatter charts are supported.".into()),
    }
}

fn chart_range_formula(
    sheet: &str,
    top: usize,
    bottom: usize,
    column: usize,
) -> Result<String, String> {
    let sheet = sheet.replace('\'', "''");
    Ok(format!(
        "'{sheet}'!{}:{}",
        absolute_cell_reference(top, column)?,
        absolute_cell_reference(bottom, column)?
    ))
}

pub(super) fn chart_series_from_selection(
    sheet: &str,
    range: &WorkbookMergeRange,
    chart_type: &str,
) -> Result<Vec<WorkbookChartSeries>, String> {
    if range.top >= range.bottom
        || range.left >= range.right
        || range.bottom >= MAX_XLSX_ROWS
        || range.right >= MAX_XLSX_COLUMNS
    {
        return Err(
            "Chart creation requires a continuous range with one header row and at least two columns."
                .into(),
        );
    }
    if chart_type == "pie" && range.right != range.left + 1 {
        return Err(
            "Pie chart creation requires exactly one category and one value column.".into(),
        );
    }
    let categories = chart_range_formula(sheet, range.top + 1, range.bottom, range.left)?;
    let mut series = Vec::new();
    for column in range.left + 1..=range.right {
        if series.len() >= MAX_CHART_SERIES {
            return Err(format!(
                "A chart cannot contain more than {MAX_CHART_SERIES} series."
            ));
        }
        series.push(WorkbookChartSeries {
            index: series.len(),
            name: Some(chart_range_formula(sheet, range.top, range.top, column)?),
            categories: Some(categories.clone()),
            values: Some(chart_range_formula(
                sheet,
                range.top + 1,
                range.bottom,
                column,
            )?),
            editable: true,
        });
    }
    Ok(series)
}

pub(super) fn build_standard_chart_xml(
    chart_type: &str,
    title: Option<&str>,
    series: &[WorkbookChartSeries],
) -> Result<Vec<u8>, String> {
    let mut workbook = Workbook::new();
    let mut sheet_names = Vec::new();
    for formula in series.iter().flat_map(|item| {
        [
            item.name.as_deref(),
            item.categories.as_deref(),
            item.values.as_deref(),
        ]
        .into_iter()
        .flatten()
    }) {
        if let Some(reference) = defined_name_reference(formula, None) {
            if !sheet_names.contains(&reference.sheet) {
                sheet_names.push(reference.sheet);
            }
        }
    }
    if sheet_names.is_empty() {
        sheet_names.push("Sheet1".into());
    }
    for name in &sheet_names {
        workbook
            .add_worksheet()
            .set_name(name)
            .map_err(|error| format!("Failed to prepare the chart template sheet: {error}"))?;
    }

    let mut chart = Chart::new(supported_chart_type(chart_type)?);
    if let Some(title) = title.map(str::trim).filter(|value| !value.is_empty()) {
        if title.chars().count() > MAX_CHART_TITLE {
            return Err(format!(
                "A chart title cannot exceed {MAX_CHART_TITLE} characters."
            ));
        }
        chart.title().set_name(title);
    }
    for item in series {
        let categories = item
            .categories
            .as_deref()
            .ok_or("A standard chart series requires categories.")?;
        let values = item
            .values
            .as_deref()
            .ok_or("A standard chart series requires values.")?;
        let chart_series = chart.add_series();
        chart_series.set_categories(categories).set_values(values);
        if let Some(name) = item.name.as_deref() {
            chart_series.set_name(name);
        }
    }
    workbook
        .worksheet_from_index(0)
        .map_err(|error| format!("Failed to access the chart template sheet: {error}"))?
        .insert_chart(0, 0, &chart)
        .map_err(|error| format!("Failed to build the standard chart template: {error}"))?;

    let package = workbook
        .save_to_buffer()
        .map_err(|error| format!("Failed to serialize the standard chart template: {error}"))?;
    let mut archive = ZipArchive::new(Cursor::new(package))
        .map_err(|error| format!("Failed to open the standard chart template: {error}"))?;
    let mut part = archive
        .by_name("xl/charts/chart1.xml")
        .map_err(|_| "The standard chart template is missing its chart part.".to_string())?;
    let mut xml = Vec::new();
    part.read_to_end(&mut xml)
        .map_err(|error| format!("Failed to read the standard chart template: {error}"))?;
    Ok(xml)
}
