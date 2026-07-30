use crate::formats::odf::{inspect_odf_package, OdfPackageReport, MAX_ODF_FILE_BYTES};
use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::io::{Cursor, Read};
use zip::ZipArchive;

const MAX_CONTENT_XML_BYTES: u64 = 16 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 4_000_000;
const MAX_ODS_SHEETS: usize = 128;
const MAX_ODS_ROWS: usize = 20_000;
const MAX_ODS_COLUMNS: usize = 1_024;
const MAX_ODS_CELLS: usize = 200_000;
const MAX_ODP_SLIDES: usize = 2_000;
const MAX_REPEAT: usize = 1_048_576;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdsCell {
    pub address: String,
    pub column: usize,
    pub text: String,
    pub value_type: Option<String>,
    pub formula: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdsRow {
    pub row: usize,
    pub cells: Vec<OdsCell>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdsSheet {
    pub id: String,
    pub name: String,
    pub rows: Vec<OdsRow>,
    pub formula_count: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdpSlide {
    pub id: String,
    pub index: usize,
    pub name: String,
    pub text: String,
    pub notes: String,
    pub image_count: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdfContentModel {
    pub format: String,
    pub package: OdfPackageReport,
    pub sheets: Vec<OdsSheet>,
    pub slides: Vec<OdpSlide>,
    pub plain_text: String,
    pub formula_count: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OdfContentSearchSegment {
    pub text: String,
    pub match_kind: String,
    pub locator_kind: String,
    pub locator_object_id: String,
    pub location_label: String,
    pub page: Option<u32>,
}

#[derive(Default)]
struct CellDraft {
    column: usize,
    repeat: usize,
    text: String,
    value_type: Option<String>,
    formula: Option<String>,
}

#[derive(Default)]
struct RowDraft {
    row: usize,
    repeat: usize,
    cells: Vec<OdsCell>,
}

#[derive(Default)]
struct SheetDraft {
    id: String,
    name: String,
    rows: Vec<OdsRow>,
    next_row: usize,
    next_column: usize,
    formula_count: usize,
    current_row: Option<RowDraft>,
    current_cell: Option<CellDraft>,
}

#[derive(Default)]
struct SlideDraft {
    id: String,
    index: usize,
    name: String,
    text_parts: Vec<String>,
    note_parts: Vec<String>,
    image_count: usize,
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODF 内容属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("ODF 内容属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn repeat_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<usize, String> {
    let repeat = attribute_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "ODF 重复计数不是有效整数".to_string())
        })
        .transpose()?
        .unwrap_or(1);
    if repeat == 0 || repeat > MAX_REPEAT {
        return Err(format!("ODF 重复计数必须位于 1..={MAX_REPEAT}"));
    }
    Ok(repeat)
}

fn entity_text(reference: &BytesRef<'_>) -> Result<String, String> {
    if let Some(value) = reference
        .resolve_char_ref()
        .map_err(|error| format!("ODF 字符引用损坏: {error}"))?
    {
        return Ok(value.to_string());
    }
    let value: &[u8] = reference;
    match value {
        b"amp" => Ok("&".into()),
        b"lt" => Ok("<".into()),
        b"gt" => Ok(">".into()),
        b"quot" => Ok("\"".into()),
        b"apos" => Ok("'".into()),
        _ => Err("ODF 内容包含未声明的实体引用".into()),
    }
}

fn append_bounded(target: &mut String, value: &str, total: &mut usize) -> Result<(), String> {
    *total = total.saturating_add(value.chars().count());
    if *total > MAX_TEXT_CHARS {
        return Err("ODF 可见文本超过读取上限".into());
    }
    target.push_str(value);
    Ok(())
}

fn read_content_xml(source: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(source)).map_err(|error| format!("打开 ODF 失败: {error}"))?;
    let mut entry = archive
        .by_name("content.xml")
        .map_err(|error| format!("ODF 缺少 content.xml: {error}"))?;
    if entry.size() > MAX_CONTENT_XML_BYTES {
        return Err("ODF content.xml 超过 16 MiB 读取上限".into());
    }
    let mut xml = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut xml)
        .map_err(|error| format!("读取 ODF content.xml 失败: {error}"))?;
    Ok(xml)
}

fn column_name(mut column: usize) -> String {
    let mut name = String::new();
    while column > 0 {
        column -= 1;
        name.insert(0, (b'A' + (column % 26) as u8) as char);
        column /= 26;
    }
    name
}

fn complete_cell(sheet: &mut SheetDraft, cell: CellDraft, warnings: &mut Vec<String>) {
    let meaningful = !cell.text.trim().is_empty() || cell.formula.is_some();
    if meaningful {
        let available = MAX_ODS_COLUMNS
            .saturating_sub(cell.column)
            .saturating_add(1);
        let stored_repeat = cell.repeat.min(available);
        if stored_repeat < cell.repeat
            && !warnings
                .iter()
                .any(|item| item == "ods-column-preview-truncated")
        {
            warnings.push("ods-column-preview-truncated".into());
        }
        if let Some(row) = sheet.current_row.as_mut() {
            for offset in 0..stored_repeat {
                let column = cell.column + offset;
                row.cells.push(OdsCell {
                    address: format!("{}{}", column_name(column), row.row),
                    column,
                    text: cell.text.trim().to_string(),
                    value_type: cell.value_type.clone(),
                    formula: cell.formula.clone(),
                });
                if cell.formula.is_some() {
                    sheet.formula_count += 1;
                }
            }
        }
    }
    sheet.next_column = sheet.next_column.saturating_add(cell.repeat);
}

fn complete_row(
    sheet: &mut SheetDraft,
    row: RowDraft,
    cell_count: &mut usize,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    if row.cells.is_empty() {
        sheet.next_row = sheet.next_row.saturating_add(row.repeat);
        return Ok(());
    }
    let available = MAX_ODS_ROWS.saturating_sub(sheet.rows.len());
    let stored_repeat = row.repeat.min(available);
    if stored_repeat < row.repeat
        && !warnings
            .iter()
            .any(|item| item == "ods-row-preview-truncated")
    {
        warnings.push("ods-row-preview-truncated".into());
    }
    for offset in 0..stored_repeat {
        *cell_count = cell_count.saturating_add(row.cells.len());
        if *cell_count > MAX_ODS_CELLS {
            return Err("ODS 非空单元格数量超过读取上限".into());
        }
        let row_number = row.row.saturating_add(offset);
        let cells = row
            .cells
            .iter()
            .cloned()
            .map(|mut cell| {
                cell.address = format!("{}{}", column_name(cell.column), row_number);
                cell
            })
            .collect();
        sheet.rows.push(OdsRow {
            row: row_number,
            cells,
        });
    }
    sheet.next_row = sheet.next_row.saturating_add(row.repeat);
    Ok(())
}

fn parse_ods(xml: &[u8], package: OdfPackageReport) -> Result<OdfContentModel, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut sheets = Vec::new();
    let mut sheet: Option<SheetDraft> = None;
    let mut paragraph = String::new();
    let mut paragraph_active = false;
    let mut total_chars = 0usize;
    let mut cell_count = 0usize;
    let mut warnings = Vec::new();

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODS content.xml 损坏: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"table" if sheet.is_none() => {
                    if sheets.len() >= MAX_ODS_SHEETS {
                        return Err("ODS 工作表数量超过读取上限".into());
                    }
                    let index = sheets.len() + 1;
                    sheet = Some(SheetDraft {
                        id: format!("ods-sheet-{index}"),
                        name: attribute_value(event, b"name", reader.decoder())?
                            .unwrap_or_else(|| format!("Sheet {index}")),
                        next_row: 1,
                        ..SheetDraft::default()
                    });
                }
                b"table-row" => {
                    if let Some(sheet) = sheet.as_mut() {
                        sheet.next_column = 1;
                        sheet.current_row = Some(RowDraft {
                            row: sheet.next_row,
                            repeat: repeat_value(event, b"number-rows-repeated", reader.decoder())?,
                            ..RowDraft::default()
                        });
                    }
                }
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(sheet) = sheet.as_mut() {
                        sheet.current_cell = Some(CellDraft {
                            column: sheet.next_column,
                            repeat: repeat_value(
                                event,
                                b"number-columns-repeated",
                                reader.decoder(),
                            )?,
                            value_type: attribute_value(event, b"value-type", reader.decoder())?,
                            formula: attribute_value(event, b"formula", reader.decoder())?,
                            ..CellDraft::default()
                        });
                    }
                }
                b"p" if sheet
                    .as_ref()
                    .is_some_and(|value| value.current_cell.is_some()) =>
                {
                    paragraph.clear();
                    paragraph_active = true;
                }
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(sheet) = sheet.as_mut() {
                        let cell = CellDraft {
                            column: sheet.next_column,
                            repeat: repeat_value(
                                event,
                                b"number-columns-repeated",
                                reader.decoder(),
                            )?,
                            value_type: attribute_value(event, b"value-type", reader.decoder())?,
                            formula: attribute_value(event, b"formula", reader.decoder())?,
                            ..CellDraft::default()
                        };
                        complete_cell(sheet, cell, &mut warnings);
                    }
                }
                b"s" if paragraph_active => {
                    let count = repeat_value(event, b"c", reader.decoder())?.min(1_024);
                    append_bounded(&mut paragraph, &" ".repeat(count), &mut total_chars)?;
                }
                b"tab" if paragraph_active => {
                    append_bounded(&mut paragraph, "\t", &mut total_chars)?
                }
                b"line-break" if paragraph_active => {
                    append_bounded(&mut paragraph, "\n", &mut total_chars)?
                }
                _ => {}
            },
            Event::Text(text) if paragraph_active => {
                append_bounded(
                    &mut paragraph,
                    &text
                        .xml10_content()
                        .map_err(|error| format!("ODS 单元格文本损坏: {error}"))?,
                    &mut total_chars,
                )?;
            }
            Event::GeneralRef(reference) if paragraph_active => {
                append_bounded(&mut paragraph, &entity_text(&reference)?, &mut total_chars)?;
            }
            Event::End(event) => match event.local_name().as_ref() {
                b"p" if paragraph_active => {
                    if let Some(cell) = sheet.as_mut().and_then(|value| value.current_cell.as_mut())
                    {
                        if !cell.text.is_empty() && !paragraph.trim().is_empty() {
                            cell.text.push('\n');
                        }
                        cell.text.push_str(paragraph.trim());
                    }
                    paragraph_active = false;
                }
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(sheet) = sheet.as_mut() {
                        if let Some(cell) = sheet.current_cell.take() {
                            complete_cell(sheet, cell, &mut warnings);
                        }
                    }
                }
                b"table-row" => {
                    if let Some(sheet) = sheet.as_mut() {
                        if let Some(row) = sheet.current_row.take() {
                            complete_row(sheet, row, &mut cell_count, &mut warnings)?;
                        }
                    }
                }
                b"table" => {
                    if let Some(completed) = sheet.take() {
                        sheets.push(OdsSheet {
                            id: completed.id,
                            name: completed.name,
                            rows: completed.rows,
                            formula_count: completed.formula_count,
                        });
                    }
                }
                _ => {}
            },
            Event::DocType(_) => return Err("ODS content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    if sheet.is_some() || paragraph_active {
        return Err("ODS content.xml 结构未闭合".into());
    }
    let plain_text = sheets
        .iter()
        .flat_map(|sheet| sheet.rows.iter())
        .flat_map(|row| row.cells.iter())
        .map(|cell| cell.text.as_str())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let formula_count = sheets.iter().map(|sheet| sheet.formula_count).sum();
    Ok(OdfContentModel {
        format: "ods".into(),
        package,
        sheets,
        slides: Vec::new(),
        plain_text,
        formula_count,
        warnings,
    })
}

fn parse_odp(xml: &[u8], package: OdfPackageReport) -> Result<OdfContentModel, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut slides = Vec::new();
    let mut slide: Option<SlideDraft> = None;
    let mut notes_depth = 0usize;
    let mut paragraph = String::new();
    let mut paragraph_active = false;
    let mut total_chars = 0usize;

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODP content.xml 损坏: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"page" if slide.is_none() && notes_depth == 0 => {
                    if slides.len() >= MAX_ODP_SLIDES {
                        return Err("ODP 幻灯片数量超过读取上限".into());
                    }
                    let index = slides.len() + 1;
                    slide = Some(SlideDraft {
                        id: format!("odp-slide-{index}"),
                        index,
                        name: attribute_value(event, b"name", reader.decoder())?
                            .unwrap_or_else(|| format!("Slide {index}")),
                        ..SlideDraft::default()
                    });
                }
                b"notes" if slide.is_some() => notes_depth += 1,
                b"p" | b"h" if slide.is_some() => {
                    paragraph.clear();
                    paragraph_active = true;
                }
                b"image" if slide.is_some() => {
                    slide.as_mut().unwrap().image_count += 1;
                }
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"image" if slide.is_some() => slide.as_mut().unwrap().image_count += 1,
                b"s" if paragraph_active => {
                    let count = repeat_value(event, b"c", reader.decoder())?.min(1_024);
                    append_bounded(&mut paragraph, &" ".repeat(count), &mut total_chars)?;
                }
                b"tab" if paragraph_active => {
                    append_bounded(&mut paragraph, "\t", &mut total_chars)?
                }
                b"line-break" if paragraph_active => {
                    append_bounded(&mut paragraph, "\n", &mut total_chars)?
                }
                _ => {}
            },
            Event::Text(text) if paragraph_active => {
                append_bounded(
                    &mut paragraph,
                    &text
                        .xml10_content()
                        .map_err(|error| format!("ODP 文本损坏: {error}"))?,
                    &mut total_chars,
                )?;
            }
            Event::GeneralRef(reference) if paragraph_active => {
                append_bounded(&mut paragraph, &entity_text(&reference)?, &mut total_chars)?;
            }
            Event::End(event) => match event.local_name().as_ref() {
                b"p" | b"h" if paragraph_active => {
                    let value = paragraph.trim();
                    if !value.is_empty() {
                        let target = if notes_depth > 0 {
                            &mut slide.as_mut().unwrap().note_parts
                        } else {
                            &mut slide.as_mut().unwrap().text_parts
                        };
                        target.push(value.to_string());
                    }
                    paragraph_active = false;
                }
                b"notes" => notes_depth = notes_depth.saturating_sub(1),
                b"page" if slide.is_some() && notes_depth == 0 => {
                    let completed = slide.take().unwrap();
                    slides.push(OdpSlide {
                        id: completed.id,
                        index: completed.index,
                        name: completed.name,
                        text: completed.text_parts.join("\n"),
                        notes: completed.note_parts.join("\n"),
                        image_count: completed.image_count,
                    });
                }
                _ => {}
            },
            Event::DocType(_) => return Err("ODP content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    if slide.is_some() || paragraph_active || notes_depth != 0 {
        return Err("ODP content.xml 结构未闭合".into());
    }
    let plain_text = slides
        .iter()
        .flat_map(|slide| [slide.text.as_str(), slide.notes.as_str()])
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(OdfContentModel {
        format: "odp".into(),
        package,
        sheets: Vec::new(),
        slides,
        plain_text,
        formula_count: 0,
        warnings: Vec::new(),
    })
}

pub fn parse_odf_content(source: &[u8], extension: &str) -> Result<OdfContentModel, String> {
    if source.len() as u64 > MAX_ODF_FILE_BYTES {
        return Err("ODF 文件超过 64 MiB 读取上限".into());
    }
    let normalized = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if !matches!(normalized.as_str(), "ods" | "odp") {
        return Err("E1C 语义读取仅接受 ODS 或 ODP".into());
    }
    let package = inspect_odf_package(source, &normalized)?;
    if package.risks.encrypted_entry_count > 0 {
        return Err("加密 ODF 内容不进入语义预览".into());
    }
    let xml = read_content_xml(source)?;
    match normalized.as_str() {
        "ods" => parse_ods(&xml, package),
        "odp" => parse_odp(&xml, package),
        _ => unreachable!(),
    }
}

pub fn odf_content_search_segments(model: &OdfContentModel) -> Vec<OdfContentSearchSegment> {
    if model.format == "ods" {
        model
            .sheets
            .iter()
            .flat_map(|sheet| {
                sheet.rows.iter().flat_map(move |row| {
                    row.cells.iter().filter_map(move |cell| {
                        (!cell.text.trim().is_empty()).then(|| OdfContentSearchSegment {
                            text: cell.text.clone(),
                            match_kind: "body".into(),
                            locator_kind: "ods-cell".into(),
                            locator_object_id: format!("{}:{}", sheet.id, cell.address),
                            location_label: format!("{} · {}", sheet.name, cell.address),
                            page: None,
                        })
                    })
                })
            })
            .collect()
    } else {
        model
            .slides
            .iter()
            .flat_map(|slide| {
                let body = (!slide.text.trim().is_empty()).then(|| OdfContentSearchSegment {
                    text: slide.text.clone(),
                    match_kind: "body".into(),
                    locator_kind: "odp-slide".into(),
                    locator_object_id: slide.id.clone(),
                    location_label: format!("幻灯片 {}", slide.index),
                    page: Some(slide.index as u32),
                });
                let notes = (!slide.notes.trim().is_empty()).then(|| OdfContentSearchSegment {
                    text: slide.notes.clone(),
                    match_kind: "notes".into(),
                    locator_kind: "odp-notes".into(),
                    locator_object_id: slide.id.clone(),
                    location_label: format!("幻灯片 {} · 备注", slide.index),
                    page: Some(slide.index as u32),
                });
                body.into_iter().chain(notes)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_ods_and_odp_and_builds_precise_segments() {
        let ods = parse_odf_content(
            include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-spreadsheet.ods"),
            "ods",
        )
        .unwrap();
        assert_eq!(ods.sheets.len(), 2);
        assert!(ods.plain_text.contains("LongEdit E1C ODS fixture"));
        assert!(ods.formula_count >= 1);
        assert!(odf_content_search_segments(&ods)
            .iter()
            .any(|segment| segment.locator_kind == "ods-cell"));

        let odp = parse_odf_content(
            include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-presentation.odp"),
            "odp",
        )
        .unwrap();
        assert_eq!(odp.slides.len(), 2);
        assert!(odp.plain_text.contains("LongEdit E1C ODP fixture"));
        assert!(odf_content_search_segments(&odp)
            .iter()
            .any(|segment| segment.locator_kind == "odp-slide"));
    }

    #[test]
    fn parses_odp_notes_when_the_producer_preserves_them() {
        let source =
            include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-presentation.odp");
        let package = inspect_odf_package(source, "odp").unwrap();
        let xml = br#"<office:document-content
          xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
          xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
          xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
          xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
          <office:body><office:presentation><draw:page draw:name="One">
          <draw:frame><draw:text-box><text:p>Body</text:p></draw:text-box></draw:frame>
          <presentation:notes><draw:frame><draw:text-box><text:p>Speaker note</text:p></draw:text-box></draw:frame></presentation:notes>
          </draw:page></office:presentation></office:body></office:document-content>"#;
        let model = parse_odp(xml, package).unwrap();
        assert_eq!(model.slides[0].notes, "Speaker note");
        assert!(odf_content_search_segments(&model)
            .iter()
            .any(|segment| segment.locator_kind == "odp-notes"));
    }

    #[test]
    fn rejects_cross_format_and_unknown_extension() {
        let ods = include_bytes!("../../tests/fixtures/odf-content/longedit-e1c-spreadsheet.ods");
        assert!(parse_odf_content(ods, "odp").is_err());
        assert!(parse_odf_content(ods, "odt").is_err());
    }
}
