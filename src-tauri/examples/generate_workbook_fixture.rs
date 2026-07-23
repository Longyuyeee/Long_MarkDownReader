use base64::Engine;
use rust_xlsxwriter::{
    Chart, ChartType, Color, ConditionalFormatCell, ConditionalFormatCellRule, DataValidation,
    ExcelDateTime, Format, Formula, Image, Table, TableColumn, Workbook,
};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

fn insert_before(xml: &mut String, marker: &str, fragment: &str) -> Result<(), String> {
    let index = xml
        .rfind(marker)
        .ok_or_else(|| format!("fixture XML missing {marker}"))?;
    xml.insert_str(index, fragment);
    Ok(())
}

fn augment_linked_data_fixture(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let bytes = fs::read(path)?;
    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;
        entries.push((entry.name().to_string(), entry.compression(), data));
    }
    for (name, _, data) in &mut entries {
        let fragment = match name.as_str() {
            "xl/workbook.xml" => Some((
                "</workbook>",
                r#"<externalReferences><externalReference r:id="rIdExternalFixture"/></externalReferences><pivotCaches><pivotCache cacheId="1" r:id="rIdPivotCacheFixture"/></pivotCaches><workbookProtection lockStructure="1" workbookPassword="ABCD"/>"#,
            )),
            "xl/_rels/workbook.xml.rels" => Some((
                "</Relationships>",
                r#"<Relationship Id="rIdPivotCacheFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/><Relationship Id="rIdExternalFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/><Relationship Id="rIdConnectionsFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/>"#,
            )),
            "xl/worksheets/sheet3.xml" => Some((
                "</worksheet>",
                r#"<pivotTableParts count="1"><pivotTablePart r:id="rIdPivotFixture"/></pivotTableParts>"#,
            )),
            "xl/worksheets/_rels/sheet3.xml.rels" => Some((
                "</Relationships>",
                r#"<Relationship Id="rIdPivotFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/><Relationship Id="rIdSlicerFixture" Type="http://schemas.microsoft.com/office/2007/relationships/slicer" Target="../slicers/slicer1.xml"/>"#,
            )),
            "[Content_Types].xml" => Some((
                "</Types>",
                r#"<Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/><Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/><Override PartName="/xl/pivotCache/pivotCacheRecords1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/><Override PartName="/xl/slicers/slicer1.xml" ContentType="application/vnd.ms-excel.slicer+xml"/><Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/><Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/>"#,
            )),
            _ => None,
        };
        if let Some((marker, addition)) = fragment {
            let mut xml = String::from_utf8(data.clone())?;
            insert_before(&mut xml, marker, addition)?;
            *data = xml.into_bytes();
        }
    }
    entries.extend([
        ("xl/pivotTables/pivotTable1.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="InventoryPivot" cacheId="1"><location ref="E2:G6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1"/><pivotFields count="3"><pivotField axis="axisRow" showAll="0"/><pivotField axis="axisCol" showAll="0"/><pivotField dataField="1" showAll="0"/></pivotFields><rowFields count="1"><field x="0"/></rowFields><colFields count="1"><field x="2"/></colFields><dataFields count="1"><dataField name="Sum of Stock" fld="1" subtotal="sum"/></dataFields></pivotTableDefinition>"#.to_vec()),
        ("xl/pivotCache/pivotCacheDefinition1.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdRecords" recordCount="2" refreshOnLoad="1"><cacheSource type="worksheet"><worksheetSource ref="A1:C3" sheet="Inventory"/></cacheSource><cacheFields count="3"><cacheField name="Product"><sharedItems containsString="1" count="2"><s v="Keyboard"/><s v="Notebook"/></sharedItems></cacheField><cacheField name="Stock"><sharedItems containsNumber="1" count="2" minValue="12" maxValue="30"/></cacheField><cacheField name="Category"><sharedItems containsString="1" count="2"><s v="Hardware"/><s v="Stationery"/></sharedItems></cacheField></cacheFields></pivotCacheDefinition>"#.to_vec()),
        ("xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdRecords" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords" Target="pivotCacheRecords1.xml"/></Relationships>"#.to_vec()),
        ("xl/pivotCache/pivotCacheRecords1.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2"><r><x v="0"/><n v="12"/><x v="0"/></r><r><x v="1"/><n v="30"/><x v="1"/></r></pivotCacheRecords>"#.to_vec()),
        ("xl/slicers/slicer1.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><slicers xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><slicer name="CategorySlicer" cache="CategorySlicerCache"/></slicers>"#.to_vec()),
        ("xl/externalLinks/externalLink1.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><externalBook r:id="rId1"><sheetNames><sheetName val="ExternalData"/></sheetNames><sheetDataSet><sheetData sheetId="0"/></sheetDataSet></externalBook></externalLink>"#.to_vec()),
        ("xl/externalLinks/_rels/externalLink1.xml.rels".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///C:/fixtures/external-data.xlsx" TargetMode="External"/></Relationships>"#.to_vec()),
        ("xl/connections.xml".into(), zip::CompressionMethod::Deflated, br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><connection id="7" name="Warehouse fixture" type="5" refreshOnLoad="1" background="0" saveData="1"><dbPr connection="Server=secret.example;Password=not-for-ui" command="SELECT 1"/></connection></connections>"#.to_vec()),
    ]);
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    for (name, compression, data) in entries {
        writer.start_file(
            name,
            SimpleFileOptions::default().compression_method(compression),
        )?;
        writer.write_all(&data)?;
    }
    fs::write(path, writer.finish()?.into_inner())?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbook/compatibility-baseline.xlsx");
    let mut workbook = Workbook::new();
    let header = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x2563EB));
    let currency = Format::new().set_num_format("$#,##0.00");
    let warning = Format::new()
        .set_font_color(Color::RGB(0x9C0006))
        .set_background_color(Color::RGB(0xFFC7CE));
    let date = Format::new().set_num_format("yyyy-mm-dd");
    let date_time = Format::new().set_num_format("yyyy-mm-dd hh:mm:ss");

    let summary = workbook.add_worksheet();
    summary.set_name("Summary")?;
    summary.set_freeze_panes(1, 1)?;
    summary.write_with_format(0, 0, "Item", &header)?;
    summary.write_with_format(0, 1, "Amount", &header)?;
    summary.write_with_format(0, 2, "Approved", &header)?;
    summary.write_with_format(0, 3, "Due date", &header)?;
    summary.write_with_format(0, 4, "Reviewed at", &header)?;
    summary.write_with_format(0, 5, "Formula error", &header)?;
    summary.write_string(1, 0, "Alpha")?;
    summary.write_with_format(1, 1, 1250.5, &currency)?;
    summary.add_conditional_format(
        1,
        1,
        1,
        1,
        &ConditionalFormatCell::new()
            .set_rule(ConditionalFormatCellRule::GreaterThan(1000))
            .set_format(&warning),
    )?;
    summary.write_boolean(1, 2, true)?;
    summary.write_datetime_with_format(1, 3, ExcelDateTime::from_ymd(2026, 7, 20)?, &date)?;
    summary.write_datetime_with_format(
        1,
        4,
        ExcelDateTime::from_ymd(2026, 7, 20)?.and_hms(14, 30, 15)?,
        &date_time,
    )?;
    summary.write_formula(1, 5, Formula::new("=1/0").set_result("#DIV/0!"))?;
    summary.set_row_height(1, 28)?;
    summary.write_string(2, 0, "Total")?;
    summary.write_formula(2, 1, Formula::new("=SUM(B2:B2)").set_result("1250.5"))?;
    summary.write_string(3, 0, "Named total")?;
    summary.write_formula(3, 1, Formula::new("=SUM(AmountRange)").set_result("1250.5"))?;
    summary.merge_range(4, 0, 4, 2, "Merged fixture title", &header)?;
    summary.set_column_width(0, 22)?;
    summary.set_column_width(1, 16)?;
    summary.set_print_area(0, 0, 4, 5)?;
    summary.set_landscape();
    summary.set_paper_size(9);
    summary.set_print_fit_to_pages(1, 0);
    summary.set_margins(0.5, 0.5, 0.7, 0.7, 0.3, 0.3);
    summary.set_header("&LConfidential&CQuarterly summary&RPage &P of &N");
    summary.set_footer("&CGenerated by LongEdit fixture");
    summary.set_print_gridlines(true);
    summary.set_print_headings(true);
    summary.set_print_center_horizontally(true);

    let details = workbook.add_worksheet();
    details.set_name("Details")?;
    details.write_string(0, 0, "Code")?;
    details.write_string(0, 1, "Status")?;
    details.write_string(1, 0, "A-001")?;
    details.write_string(1, 1, "Active")?;
    details.autofilter(0, 0, 1, 1)?;
    let status_validation = DataValidation::new()
        .allow_list_strings(&["Active", "Paused", "Closed"])?
        .set_input_title("Status")?
        .set_input_message("Choose an approved status")?
        .set_error_title("Invalid status")?
        .set_error_message("Use Active, Paused, or Closed")?;
    details.add_data_validation(1, 1, 100, 1, &status_validation)?;

    let inventory = workbook.add_worksheet();
    inventory.set_name("Inventory")?;
    inventory.write_string(1, 0, "Keyboard")?;
    inventory.write_number(1, 1, 12)?;
    inventory.write_string(1, 2, "Hardware")?;
    inventory.write_string(2, 0, "Notebook")?;
    inventory.write_number(2, 1, 30)?;
    inventory.write_string(2, 2, "Stationery")?;
    let columns = [
        TableColumn::new().set_header("Product"),
        TableColumn::new().set_header("Stock"),
        TableColumn::new().set_header("Category"),
    ];
    let table = Table::new()
        .set_name("InventoryTable")
        .set_columns(&columns);
    inventory.add_table(0, 0, 2, 2, &table)?;
    let mut chart = Chart::new(ChartType::Column);
    chart.set_name("InventoryStockChart");
    chart.title().set_name("Inventory stock");
    chart
        .add_series()
        .set_name("Stock")
        .set_categories("Inventory!$A$2:$A$3")
        .set_values("Inventory!$B$2:$B$3");
    inventory.insert_chart(1, 4, &chart)?;
    let png = base64::engine::general_purpose::STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        .expect("valid embedded PNG fixture");
    let image = Image::new_from_buffer(&png)?.set_alt_text("Inventory marker");
    inventory.insert_image(18, 4, &image)?;

    let protected = workbook.add_worksheet();
    protected.set_name("Protected")?;
    protected.write_string(0, 0, "Locked content")?;
    protected.write_string(1, 0, "Read-only fixture")?;
    protected.protect_with_password("fixture-protection");

    workbook.define_name("AmountRange", "=Summary!$B$2:$B$2")?;
    workbook.define_name("ReportWindow", "=Summary!$A$1:$F$4")?;
    workbook.define_name("TaxRate", "=0.13")?;
    workbook.define_name("TeamLabel", "=\"R&D\"")?;
    workbook.define_name("Details!Codes", "=Details!$A$2:$A$2")?;

    workbook.save(&output)?;
    augment_linked_data_fixture(&output)
}
