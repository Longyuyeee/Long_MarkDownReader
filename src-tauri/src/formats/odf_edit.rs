use crate::formats::odf::inspect_odf_package;
use crate::formats::odf_content::parse_odf_content;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Cursor, Read, Write};
use std::ops::Range;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const ODF_EDITABLE_PART: &str = "content.xml";
const MAX_ODS_REPLACEMENT_CHARS: usize = 32_767;
const ODS_PATCH_DEFLATE_LEVEL: i64 = 4;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfPackagePartSnapshot {
    pub part_name: String,
    pub size: usize,
    pub digest: String,
    pub editable_candidate: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfEditBaselineReport {
    pub status: String,
    pub engine: String,
    pub format: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub part_count: usize,
    pub raw_copied_part_count: usize,
    pub protected_part_count: usize,
    pub editable_candidate_parts: Vec<String>,
    pub changed_parts: Vec<String>,
    pub added_parts: Vec<String>,
    pub removed_parts: Vec<String>,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub source_unchanged: bool,
    pub editing_enabled: bool,
    pub blockers: Vec<String>,
    pub next_stage: String,
    pub parts: Vec<OdfPackagePartSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsEditableCellTarget {
    pub id: String,
    pub sheet_name: String,
    pub address: String,
    pub text: String,
    pub value_type: String,
    pub expected_value_digest: String,
    pub current_style_name: String,
    pub expected_style_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsNamedCellStyle {
    pub name: String,
    pub label: String,
    pub parent_style_name: Option<String>,
    pub background_color: Option<String>,
    pub text_color: Option<String>,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsBlockedCellTarget {
    pub sheet_name: String,
    pub address: String,
    pub text: String,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsCellEditInventory {
    pub status: String,
    pub source_digest: String,
    pub editable_cells: Vec<OdsEditableCellTarget>,
    pub blocked_cells: Vec<OdsBlockedCellTarget>,
    pub named_cell_styles: Vec<OdsNamedCellStyle>,
    pub blockers: Vec<String>,
    pub writes_user_file: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsCellStylePatchReport {
    pub status: String,
    pub engine: String,
    pub target_id: String,
    pub sheet_name: String,
    pub address: String,
    pub style_name: String,
    pub automatic_style_name: String,
    pub source_digest: String,
    pub output_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsCellValuePatchReport {
    pub status: String,
    pub engine: String,
    pub target_id: String,
    pub sheet_name: String,
    pub address: String,
    pub value_type: String,
    pub source_digest: String,
    pub output_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
}

#[derive(Default)]
struct SheetScan {
    index: usize,
    name: String,
    next_row: usize,
    current_row: usize,
    row_repeat: usize,
    next_column: usize,
}

struct CellScan {
    sheet_index: usize,
    sheet_name: String,
    row: usize,
    column: usize,
    row_repeat: usize,
    column_repeat: usize,
    value_type: String,
    formula: Option<String>,
    style_name: Option<String>,
    merged: bool,
    start_tag_range: Range<usize>,
    paragraph_count: usize,
    text_event_count: usize,
    text_range: Option<Range<usize>>,
    text: String,
    complex_inline: bool,
    in_paragraph: bool,
}

struct OdsEditableCellInternal {
    public: OdsEditableCellTarget,
    start_tag_range: Range<usize>,
    text_range: Range<usize>,
}

#[derive(Clone, Debug, Default)]
struct NamedCellStyleDraft {
    name: String,
    label: String,
    parent_style_name: Option<String>,
    background_color: Option<String>,
    text_color: Option<String>,
    bold: bool,
    italic: bool,
    unsafe_property: bool,
}

fn package_digest(source: &[u8]) -> String {
    format!("{:x}", Sha256::digest(source))
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODS 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("ODS 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn repeat_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<usize, String> {
    attribute_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "ODS 重复计数不是有效整数".to_string())
        })
        .transpose()
        .map(|value| value.unwrap_or(1))
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

fn xml_escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn xml_escape_attribute(value: &str) -> String {
    xml_escape_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn validate_replacement(value: &str) -> Result<(), String> {
    if value.chars().count() > MAX_ODS_REPLACEMENT_CHARS {
        return Err(format!(
            "ODS 单元格值超过 {MAX_ODS_REPLACEMENT_CHARS} 字符上限"
        ));
    }
    if value
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
    {
        return Err("ODS 单元格值包含不支持的控制字符".into());
    }
    Ok(())
}

fn value_digest(id: &str, value_type: &str, text: &str) -> String {
    package_digest(format!("{id}\0{value_type}\0{text}").as_bytes())
}

fn style_digest(id: &str, text: &str, style_name: &str) -> String {
    package_digest(format!("{id}\0{text}\0{style_name}").as_bytes())
}

fn package_part(source: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODS 包失败: {error}"))?;
    let mut file = archive
        .by_name(part_name)
        .map_err(|error| format!("ODS 缺少 {part_name}: {error}"))?;
    let mut bytes = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("读取 ODS {part_name} 失败: {error}"))?;
    Ok(bytes)
}

fn content_xml(source: &[u8]) -> Result<Vec<u8>, String> {
    package_part(source, ODF_EDITABLE_PART)
}

fn collect_style_properties(
    event: &BytesStart<'_>,
    draft: &mut NamedCellStyleDraft,
    property_kind: &str,
    decoder: quick_xml::encoding::Decoder,
) -> Result<(), String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODS 样式属性损坏: {error}"))?;
        let key = std::str::from_utf8(attribute.key.local_name().as_ref())
            .map_err(|_| "ODS 样式属性名不是 UTF-8")?
            .to_string();
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
            .map_err(|error| format!("ODS 样式属性解码失败: {error}"))?
            .into_owned();
        match (property_kind, key.as_str()) {
            ("cell", "background-color") => {
                if value == "transparent"
                    || Regex::new(r"^#[0-9a-fA-F]{6}$")
                        .expect("static ODF color pattern")
                        .is_match(&value)
                {
                    draft.background_color = Some(value);
                } else {
                    draft.unsafe_property = true;
                }
            }
            ("text", "color") => {
                if Regex::new(r"^#[0-9a-fA-F]{6}$")
                    .expect("static ODF color pattern")
                    .is_match(&value)
                {
                    draft.text_color = Some(value);
                } else {
                    draft.unsafe_property = true;
                }
            }
            ("text", "font-weight" | "font-weight-asian" | "font-weight-complex") => {
                if matches!(value.as_str(), "normal" | "bold") {
                    draft.bold |= value == "bold";
                } else {
                    draft.unsafe_property = true;
                }
            }
            ("text", "font-style" | "font-style-asian" | "font-style-complex") => {
                if matches!(value.as_str(), "normal" | "italic") {
                    draft.italic |= value == "italic";
                } else {
                    draft.unsafe_property = true;
                }
            }
            (
                "cell",
                "wrap-option" | "shrink-to-fit" | "diagonal-bl-tr" | "diagonal-tl-br" | "border",
            )
            | (
                "text",
                "font-size"
                | "font-size-asian"
                | "font-size-complex"
                | "text-underline-style"
                | "text-underline-width"
                | "text-underline-color",
            ) => {}
            _ => draft.unsafe_property = true,
        }
    }
    Ok(())
}

fn parse_named_cell_style_drafts(
    source: &[u8],
) -> Result<BTreeMap<String, NamedCellStyleDraft>, String> {
    let xml = package_part(source, "styles.xml")?;
    let mut reader = Reader::from_reader(xml.as_slice());
    reader.config_mut().trim_text(false);
    let mut current: Option<NamedCellStyleDraft> = None;
    let mut styles = BTreeMap::new();
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODS styles.xml 损坏: {error}"))?
        {
            Event::Start(ref element)
                if element.local_name().as_ref() == b"style" && current.is_none() =>
            {
                if attribute_value(element, b"family", reader.decoder())?.as_deref()
                    == Some("table-cell")
                {
                    let name = attribute_value(element, b"name", reader.decoder())?
                        .ok_or("ODS 单元格样式缺少名称")?;
                    current = Some(NamedCellStyleDraft {
                        label: attribute_value(element, b"display-name", reader.decoder())?
                            .unwrap_or_else(|| name.clone()),
                        parent_style_name: attribute_value(
                            element,
                            b"parent-style-name",
                            reader.decoder(),
                        )?,
                        name,
                        ..NamedCellStyleDraft::default()
                    });
                }
            }
            Event::Empty(ref element)
                if element.local_name().as_ref() == b"style" && current.is_none() =>
            {
                if attribute_value(element, b"family", reader.decoder())?.as_deref()
                    == Some("table-cell")
                {
                    let name = attribute_value(element, b"name", reader.decoder())?
                        .ok_or("ODS 单元格样式缺少名称")?;
                    let style = NamedCellStyleDraft {
                        label: attribute_value(element, b"display-name", reader.decoder())?
                            .unwrap_or_else(|| name.clone()),
                        parent_style_name: attribute_value(
                            element,
                            b"parent-style-name",
                            reader.decoder(),
                        )?,
                        name,
                        ..NamedCellStyleDraft::default()
                    };
                    if styles.insert(style.name.clone(), style).is_some() {
                        return Err("ODS styles.xml 包含重复的单元格样式名".into());
                    }
                }
            }
            Event::Start(ref element) | Event::Empty(ref element) if current.is_some() => {
                let kind = match element.local_name().as_ref() {
                    b"table-cell-properties" => Some("cell"),
                    b"text-properties" => Some("text"),
                    _ => None,
                };
                if let Some(kind) = kind {
                    collect_style_properties(
                        element,
                        current.as_mut().unwrap(),
                        kind,
                        reader.decoder(),
                    )?;
                } else if element.local_name().as_ref() != b"style" {
                    current.as_mut().unwrap().unsafe_property = true;
                }
            }
            Event::End(ref element) if element.local_name().as_ref() == b"style" => {
                if let Some(style) = current.take() {
                    if styles.insert(style.name.clone(), style).is_some() {
                        return Err("ODS styles.xml 包含重复的单元格样式名".into());
                    }
                }
            }
            Event::DocType(_) => return Err("ODS styles.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(styles)
}

fn resolve_named_cell_style(
    name: &str,
    drafts: &BTreeMap<String, NamedCellStyleDraft>,
    visiting: &mut BTreeSet<String>,
) -> Result<NamedCellStyleDraft, String> {
    if !visiting.insert(name.to_string()) {
        return Err("ODS 单元格样式继承存在循环".into());
    }
    let own = drafts
        .get(name)
        .ok_or_else(|| format!("ODS 单元格样式缺少父级或定义: {name}"))?;
    if own.unsafe_property {
        return Err(format!("ODS 单元格样式包含未验证属性: {name}"));
    }
    let mut resolved = if let Some(parent) = own.parent_style_name.as_deref() {
        resolve_named_cell_style(parent, drafts, visiting)?
    } else {
        NamedCellStyleDraft::default()
    };
    visiting.remove(name);
    resolved.name = own.name.clone();
    resolved.label = own.label.clone();
    resolved.parent_style_name = own.parent_style_name.clone();
    if own.background_color.is_some() {
        resolved.background_color = own.background_color.clone();
    }
    if own.text_color.is_some() {
        resolved.text_color = own.text_color.clone();
    }
    resolved.bold |= own.bold;
    resolved.italic |= own.italic;
    Ok(resolved)
}

fn inspect_named_cell_styles(source: &[u8]) -> Result<Vec<OdsNamedCellStyle>, String> {
    let drafts = parse_named_cell_style_drafts(source)?;
    let mut styles = Vec::new();
    for name in drafts.keys() {
        let Ok(style) = resolve_named_cell_style(name, &drafts, &mut BTreeSet::new()) else {
            continue;
        };
        styles.push(OdsNamedCellStyle {
            name: style.name,
            label: style.label,
            parent_style_name: style.parent_style_name,
            background_color: style.background_color,
            text_color: style.text_color,
            bold: style.bold,
            italic: style.italic,
        });
    }
    Ok(styles)
}

fn parse_content_cell_styles(xml: &[u8]) -> Result<BTreeMap<String, Option<String>>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut styles = BTreeMap::new();
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODS content.xml 样式损坏: {error}"))?
        {
            Event::Start(ref element) | Event::Empty(ref element)
                if element.local_name().as_ref() == b"style"
                    && attribute_value(element, b"family", reader.decoder())?.as_deref()
                        == Some("table-cell") =>
            {
                let name = attribute_value(element, b"name", reader.decoder())?
                    .ok_or("ODS 自动单元格样式缺少名称")?;
                let parent = attribute_value(element, b"parent-style-name", reader.decoder())?;
                if styles.insert(name, parent).is_some() {
                    return Err("ODS content.xml 包含重复自动单元格样式".into());
                }
            }
            Event::DocType(_) => return Err("ODS content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(styles)
}

fn finalize_cell(
    cell: CellScan,
    editable: &mut Vec<OdsEditableCellInternal>,
    blocked: &mut Vec<OdsBlockedCellTarget>,
) {
    if cell.text.is_empty() && cell.formula.is_none() {
        return;
    }
    let address = format!("{}{}", column_name(cell.column), cell.row);
    let reason = if cell.row_repeat != 1 {
        Some("repeated-row")
    } else if cell.column_repeat != 1 {
        Some("repeated-cell")
    } else if cell.merged {
        Some("merged-cell")
    } else if cell.formula.is_some() {
        Some("formula-readonly")
    } else if !matches!(cell.value_type.as_str(), "string" | "float") {
        Some("unsupported-value-type")
    } else if cell.paragraph_count != 1 || cell.text_event_count != 1 || cell.complex_inline {
        Some("rich-text-readonly")
    } else if cell.text_range.is_none() {
        Some("empty-text-node")
    } else {
        None
    };
    if let Some(reason) = reason {
        blocked.push(OdsBlockedCellTarget {
            sheet_name: cell.sheet_name,
            address,
            text: cell.text,
            reason: reason.into(),
        });
        return;
    }
    let id = format!("ods-cell:{}:{address}", cell.sheet_index);
    let expected_value_digest = value_digest(&id, &cell.value_type, &cell.text);
    let direct_style_name = cell.style_name.unwrap_or_default();
    let expected_style_digest = style_digest(&id, &cell.text, &direct_style_name);
    let public = OdsEditableCellTarget {
        id,
        sheet_name: cell.sheet_name,
        address,
        text: cell.text,
        value_type: cell.value_type,
        expected_value_digest,
        current_style_name: direct_style_name,
        expected_style_digest,
    };
    editable.push(OdsEditableCellInternal {
        public,
        start_tag_range: cell.start_tag_range,
        text_range: cell.text_range.expect("eligible text range"),
    });
}

fn scan_ods_cells(
    source: &[u8],
) -> Result<(Vec<OdsEditableCellInternal>, Vec<OdsBlockedCellTarget>), String> {
    let xml = content_xml(source)?;
    let mut reader = Reader::from_reader(xml.as_slice());
    reader.config_mut().trim_text(false);
    let mut sheet: Option<SheetScan> = None;
    let mut cell: Option<CellScan> = None;
    let mut editable = Vec::new();
    let mut blocked = Vec::new();
    let mut sheet_count = 0usize;

    loop {
        let event = reader
            .read_event()
            .map_err(|error| format!("ODS content.xml 损坏: {error}"))?;
        let position =
            usize::try_from(reader.buffer_position()).map_err(|_| "ODS XML 位置超过平台上限")?;
        match event {
            Event::Start(ref element)
                if element.local_name().as_ref() == b"table" && sheet.is_none() =>
            {
                sheet_count += 1;
                sheet = Some(SheetScan {
                    index: sheet_count,
                    name: attribute_value(element, b"name", reader.decoder())?
                        .unwrap_or_else(|| format!("Sheet {sheet_count}")),
                    next_row: 1,
                    ..SheetScan::default()
                });
            }
            Event::Start(ref element) if element.local_name().as_ref() == b"table-row" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.current_row = sheet.next_row;
                    sheet.row_repeat =
                        repeat_value(element, b"number-rows-repeated", reader.decoder())?;
                    sheet.next_column = 1;
                }
            }
            Event::Start(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(sheet) = sheet.as_ref() {
                    let raw_element: &[u8] = element.as_ref();
                    let start = position
                        .checked_sub(raw_element.len() + 2)
                        .ok_or("ODS 单元格开始位置无效")?;
                    cell = Some(CellScan {
                        sheet_index: sheet.index,
                        sheet_name: sheet.name.clone(),
                        row: sheet.current_row,
                        column: sheet.next_column,
                        row_repeat: sheet.row_repeat,
                        column_repeat: repeat_value(
                            element,
                            b"number-columns-repeated",
                            reader.decoder(),
                        )?,
                        value_type: attribute_value(element, b"value-type", reader.decoder())?
                            .unwrap_or_default(),
                        formula: attribute_value(element, b"formula", reader.decoder())?,
                        style_name: attribute_value(element, b"style-name", reader.decoder())?,
                        merged: attribute_value(
                            element,
                            b"number-columns-spanned",
                            reader.decoder(),
                        )?
                        .is_some()
                            || attribute_value(element, b"number-rows-spanned", reader.decoder())?
                                .is_some(),
                        start_tag_range: start..position,
                        paragraph_count: 0,
                        text_event_count: 0,
                        text_range: None,
                        text: String::new(),
                        complex_inline: false,
                        in_paragraph: false,
                    });
                }
            }
            Event::Start(ref element)
                if element.local_name().as_ref() == b"p" && cell.is_some() =>
            {
                let cell = cell.as_mut().unwrap();
                cell.paragraph_count += 1;
                if cell.in_paragraph {
                    cell.complex_inline = true;
                }
                cell.in_paragraph = true;
            }
            Event::Start(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::Empty(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::Text(ref text) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                let raw_text: &[u8] = text.as_ref();
                let start = position
                    .checked_sub(raw_text.len())
                    .ok_or("ODS 文本位置无效")?;
                let cell = cell.as_mut().unwrap();
                cell.text_event_count += 1;
                if cell.text_event_count == 1 {
                    cell.text_range = Some(start..position);
                }
                cell.text.push_str(
                    &text
                        .xml10_content()
                        .map_err(|error| format!("ODS 单元格文本损坏: {error}"))?,
                );
            }
            Event::GeneralRef(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::End(ref element) if element.local_name().as_ref() == b"p" && cell.is_some() => {
                cell.as_mut().unwrap().in_paragraph = false;
            }
            Event::End(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(completed) = cell.take() {
                    if let Some(sheet) = sheet.as_mut() {
                        sheet.next_column =
                            sheet.next_column.saturating_add(completed.column_repeat);
                    }
                    finalize_cell(completed, &mut editable, &mut blocked);
                }
            }
            Event::Empty(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.next_column = sheet.next_column.saturating_add(repeat_value(
                        element,
                        b"number-columns-repeated",
                        reader.decoder(),
                    )?);
                }
            }
            Event::End(ref element) if element.local_name().as_ref() == b"table-row" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.next_row = sheet.next_row.saturating_add(sheet.row_repeat.max(1));
                    sheet.current_row = 0;
                }
            }
            Event::End(ref element)
                if element.local_name().as_ref() == b"table" && cell.is_none() =>
            {
                sheet = None;
            }
            Event::DocType(_) => return Err("ODS content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok((editable, blocked))
}

fn package_parts(source: &[u8]) -> Result<BTreeMap<String, OdfPackagePartSnapshot>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODF 隔离包失败: {error}"))?;
    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODF 隔离部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        let mut bytes = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 ODF 部件 {name} 失败: {error}"))?;
        let snapshot = OdfPackagePartSnapshot {
            part_name: name.clone(),
            size: bytes.len(),
            digest: package_digest(&bytes),
            editable_candidate: name == ODF_EDITABLE_PART,
        };
        if parts.insert(name, snapshot).is_some() {
            return Err("ODF 隔离审计发现重复部件".into());
        }
    }
    Ok(parts)
}

fn raw_copy_package(source: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODF 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODF 原始部件失败: {error}"))?;
        writer
            .raw_copy_file(file)
            .map_err(|error| format!("逐字节复制 ODF 部件失败: {error}"))?;
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 ODF 隔离包失败: {error}"))
}

fn rewrite_content_part(source: &[u8], replacement: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODS 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = false;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODS 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if name == ODF_EDITABLE_PART {
            if replaced {
                return Err("ODS content.xml 重复".into());
            }
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(ODS_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(ODF_EDITABLE_PART, options)
                .map_err(|error| format!("创建 ODS content.xml 失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 ODS content.xml 失败: {error}"))?;
            replaced = true;
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("逐字节复制受保护 ODS 部件失败: {error}"))?;
        }
    }
    if !replaced {
        return Err("ODS 缺少 content.xml".into());
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 ODS 隔离补丁包失败: {error}"))
}

pub fn inspect_ods_cell_edit_inventory(source: &[u8]) -> Result<OdsCellEditInventory, String> {
    let (baseline, _) = inspect_odf_edit_baseline(source, "ods")?;
    if !baseline.editing_enabled {
        return Ok(OdsCellEditInventory {
            status: "blocked".into(),
            source_digest: baseline.source_package_digest,
            editable_cells: Vec::new(),
            blocked_cells: Vec::new(),
            named_cell_styles: Vec::new(),
            blockers: baseline.blockers,
            writes_user_file: false,
        });
    }
    let named_cell_styles = inspect_named_cell_styles(source)?;
    let named_style_names = named_cell_styles
        .iter()
        .map(|style| style.name.as_str())
        .collect::<BTreeSet<_>>();
    let automatic_styles = parse_content_cell_styles(&content_xml(source)?)?;
    let (mut editable, blocked_cells) = scan_ods_cells(source)?;
    for target in &mut editable {
        let direct = target.public.current_style_name.clone();
        target.public.current_style_name = if direct.is_empty() {
            if named_style_names.contains("Default") {
                "Default".into()
            } else {
                String::new()
            }
        } else if let Some(Some(parent)) = automatic_styles.get(&direct) {
            if named_style_names.contains(parent.as_str()) {
                parent.clone()
            } else {
                direct
            }
        } else {
            direct
        };
    }
    Ok(OdsCellEditInventory {
        status: "candidate".into(),
        source_digest: baseline.source_package_digest,
        editable_cells: editable.into_iter().map(|target| target.public).collect(),
        blocked_cells,
        named_cell_styles,
        blockers: Vec::new(),
        writes_user_file: false,
    })
}

pub fn build_ods_cell_value_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_value_digest: &str,
    replacement_value: &str,
) -> Result<(OdsCellValuePatchReport, Vec<u8>), String> {
    validate_replacement(replacement_value)?;
    let source_digest = package_digest(source);
    let baseline = inspect_ods_cell_edit_inventory(source)?;
    if baseline.status != "candidate" {
        return Err(format!(
            "ODS 文件不满足安全编辑条件: {}",
            baseline.blockers.join(", ")
        ));
    }
    let (mut internal_targets, _) = scan_ods_cells(source)?;
    let target = internal_targets
        .drain(..)
        .find(|target| target.public.id == target_id)
        .ok_or_else(|| "ODS 单元格不是可编辑的简单值目标".to_string())?;
    if target.public.expected_value_digest != expected_value_digest {
        return Err("ODS 单元格值已变化，请重新读取后再编辑".into());
    }
    if target.public.text == replacement_value {
        return Err("ODS 单元格新值与当前值相同".into());
    }

    let mut xml = content_xml(source)?;
    let mut patches = vec![(
        target.text_range.clone(),
        xml_escape_text(replacement_value).into_bytes(),
    )];
    if target.public.value_type == "float" {
        let trimmed = replacement_value.trim();
        let numeric = trimmed
            .parse::<f64>()
            .map_err(|_| "数值单元格只接受有限数字".to_string())?;
        if !numeric.is_finite() || trimmed.is_empty() {
            return Err("数值单元格只接受有限数字".into());
        }
        let tag = std::str::from_utf8(&xml[target.start_tag_range.clone()])
            .map_err(|_| "ODS 单元格开始标签不是 UTF-8")?;
        let value_attribute = Regex::new(r#"office:value="[^"]*""#)
            .map_err(|error| format!("初始化 ODS 数值属性规则失败: {error}"))?;
        if !value_attribute.is_match(tag) {
            return Err("数值单元格缺少规范 office:value 属性".into());
        }
        let replacement_tag = value_attribute
            .replace(tag, format!("office:value=\"{trimmed}\""))
            .into_owned();
        patches.push((target.start_tag_range.clone(), replacement_tag.into_bytes()));
    }
    patches.sort_by(|left, right| right.0.start.cmp(&left.0.start));
    for (range, replacement) in patches {
        xml.splice(range, replacement);
    }

    let output = rewrite_content_part(source, &xml)?;
    let output_digest = package_digest(&output);
    let source_parts = package_parts(source)?;
    let output_parts = package_parts(&output)?;
    let mut changed_parts = Vec::new();
    for (name, before) in &source_parts {
        let after = output_parts
            .get(name)
            .ok_or_else(|| format!("ODS 输出缺少部件 {name}"))?;
        if before != after {
            changed_parts.push(name.clone());
        }
    }
    if source_parts.len() != output_parts.len() || changed_parts != [ODF_EDITABLE_PART] {
        return Err("ODS 单元格补丁修改了 content.xml 之外的受保护部件".into());
    }
    let output_package = inspect_odf_package(&output, "ods")?;
    let output_model = parse_odf_content(&output, "ods")?;
    let semantic_reparse_verified = output_model
        .sheets
        .iter()
        .find(|sheet| sheet.name == target.public.sheet_name)
        .and_then(|sheet| {
            sheet
                .rows
                .iter()
                .flat_map(|row| row.cells.iter())
                .find(|cell| cell.address == target.public.address)
        })
        .is_some_and(|cell| cell.text == replacement_value && cell.formula.is_none());
    if !semantic_reparse_verified {
        return Err("ODS 单元格补丁语义复读不一致".into());
    }
    let report = OdsCellValuePatchReport {
        status: "isolated-copy-verified".into(),
        engine: "longedit-ods-cell-value-patch-v1".into(),
        target_id: target.public.id,
        sheet_name: target.public.sheet_name,
        address: target.public.address,
        value_type: target.public.value_type,
        source_digest: source_digest.clone(),
        output_digest,
        changed_parts,
        unchanged_part_count: source_parts.len().saturating_sub(1),
        unchanged_parts_verified: source_parts
            .iter()
            .filter(|(name, _)| name.as_str() != ODF_EDITABLE_PART)
            .all(|(name, before)| output_parts.get(name) == Some(before)),
        structural_reparse_verified: output_package.format == "ods",
        semantic_reparse_verified,
        source_unchanged: package_digest(source) == source_digest,
        writes_user_file: false,
        output_bytes: output.len(),
    };
    Ok((report, output))
}

pub fn build_ods_cell_style_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_style_digest: &str,
    style_name: &str,
) -> Result<(OdsCellStylePatchReport, Vec<u8>), String> {
    let source_digest = package_digest(source);
    let baseline = inspect_ods_cell_edit_inventory(source)?;
    if baseline.status != "candidate" {
        return Err(format!(
            "ODS 文件不满足安全编辑条件: {}",
            baseline.blockers.join(", ")
        ));
    }
    if !baseline
        .named_cell_styles
        .iter()
        .any(|style| style.name == style_name)
    {
        return Err("ODS 样式不存在、继承无效或包含未验证属性".into());
    }
    let (mut internal_targets, _) = scan_ods_cells(source)?;
    let target = internal_targets
        .drain(..)
        .find(|target| target.public.id == target_id)
        .ok_or_else(|| "ODS 单元格不是可设置样式的简单值目标".to_string())?;
    if target.public.expected_style_digest != expected_style_digest {
        return Err("ODS 单元格样式或内容已变化，请重新读取后再编辑".into());
    }

    let mut xml = content_xml(source)?;
    let automatic_styles = parse_content_cell_styles(&xml)?;
    let current_direct_style = target.public.current_style_name.as_str();
    let current_named_style = automatic_styles
        .get(current_direct_style)
        .and_then(|parent| parent.as_deref())
        .unwrap_or(if current_direct_style.is_empty() {
            "Default"
        } else {
            current_direct_style
        });
    if current_named_style == style_name {
        return Err("ODS 单元格已经使用所选样式".into());
    }

    let automatic_style_name =
        format!("ceLongEdit{}", &package_digest(style_name.as_bytes())[..12]);
    let mut patches = Vec::<(Range<usize>, Vec<u8>)>::new();
    match automatic_styles.get(&automatic_style_name) {
        Some(Some(parent)) if parent == style_name => {}
        Some(_) => return Err("ODS 自动样式名称与现有定义冲突".into()),
        None => {
            let marker = b"</office:automatic-styles>";
            let insertion = xml
                .windows(marker.len())
                .position(|window| window == marker)
                .ok_or("ODS content.xml 缺少 automatic-styles 结束标记")?;
            let style = format!(
                "<style:style style:name=\"{}\" style:family=\"table-cell\" style:parent-style-name=\"{}\"/>",
                xml_escape_attribute(&automatic_style_name),
                xml_escape_attribute(style_name)
            );
            patches.push((insertion..insertion, style.into_bytes()));
        }
    }

    let tag = std::str::from_utf8(&xml[target.start_tag_range.clone()])
        .map_err(|_| "ODS 单元格开始标签不是 UTF-8")?;
    let style_attribute = Regex::new(r#"table:style-name="[^"]*""#)
        .map_err(|error| format!("初始化 ODS 样式属性规则失败: {error}"))?;
    let replacement_tag = if style_attribute.is_match(tag) {
        style_attribute
            .replace(
                tag,
                format!(
                    "table:style-name=\"{}\"",
                    xml_escape_attribute(&automatic_style_name)
                ),
            )
            .into_owned()
    } else {
        tag.replacen(
            "<table:table-cell",
            &format!(
                "<table:table-cell table:style-name=\"{}\"",
                xml_escape_attribute(&automatic_style_name)
            ),
            1,
        )
    };
    patches.push((target.start_tag_range.clone(), replacement_tag.into_bytes()));
    patches.sort_by(|left, right| right.0.start.cmp(&left.0.start));
    for (range, replacement) in patches {
        xml.splice(range, replacement);
    }

    let output = rewrite_content_part(source, &xml)?;
    let output_digest = package_digest(&output);
    let source_parts = package_parts(source)?;
    let output_parts = package_parts(&output)?;
    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, before)| {
            output_parts
                .get(name)
                .filter(|after| *after != before)
                .map(|_| name.clone())
        })
        .collect::<Vec<_>>();
    if source_parts.len() != output_parts.len() || changed_parts != [ODF_EDITABLE_PART] {
        return Err("ODS 样式补丁修改了 content.xml 之外的受保护部件".into());
    }
    let output_package = inspect_odf_package(&output, "ods")?;
    parse_odf_content(&output, "ods")?;
    let output_automatic_styles = parse_content_cell_styles(&content_xml(&output)?)?;
    let (output_targets, _) = scan_ods_cells(&output)?;
    let semantic_reparse_verified = output_automatic_styles
        .get(&automatic_style_name)
        .is_some_and(|parent| parent.as_deref() == Some(style_name))
        && output_targets.iter().any(|candidate| {
            candidate.public.id == target.public.id
                && candidate.public.current_style_name == automatic_style_name
                && candidate.public.text == target.public.text
        });
    if !semantic_reparse_verified {
        return Err("ODS 单元格样式补丁语义复读不一致".into());
    }
    let report = OdsCellStylePatchReport {
        status: "isolated-copy-verified".into(),
        engine: "longedit-ods-existing-style-patch-v1".into(),
        target_id: target.public.id,
        sheet_name: target.public.sheet_name,
        address: target.public.address,
        style_name: style_name.into(),
        automatic_style_name,
        source_digest: source_digest.clone(),
        output_digest,
        changed_parts,
        unchanged_part_count: source_parts.len().saturating_sub(1),
        unchanged_parts_verified: source_parts
            .iter()
            .filter(|(name, _)| name.as_str() != ODF_EDITABLE_PART)
            .all(|(name, before)| output_parts.get(name) == Some(before)),
        structural_reparse_verified: output_package.format == "ods",
        semantic_reparse_verified,
        source_unchanged: package_digest(source) == source_digest,
        writes_user_file: false,
        output_bytes: output.len(),
    };
    Ok((report, output))
}

pub fn inspect_odf_edit_baseline(
    source: &[u8],
    extension: &str,
) -> Result<(OdfEditBaselineReport, Vec<u8>), String> {
    let source_report = inspect_odf_package(source, extension)?;
    let source_digest = package_digest(source);
    let source_parts = package_parts(source)?;
    let isolated = raw_copy_package(source)?;
    let isolated_report = inspect_odf_package(&isolated, extension)?;
    let isolated_parts = package_parts(&isolated)?;

    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, before)| {
            isolated_parts
                .get(name)
                .filter(|after| *after != before)
                .map(|_| name.clone())
        })
        .collect::<Vec<_>>();
    let added_parts = isolated_parts
        .keys()
        .filter(|name| !source_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    let removed_parts = source_parts
        .keys()
        .filter(|name| !isolated_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    let unchanged_parts_verified =
        changed_parts.is_empty() && added_parts.is_empty() && removed_parts.is_empty();
    if !unchanged_parts_verified {
        return Err("ODF 隔离复制没有逐字节保持全部部件".into());
    }

    let mut blockers = Vec::new();
    let risks = &source_report.risks;
    if risks.encrypted_entry_count > 0 {
        blockers.push("encrypted-content".into());
    }
    if risks.signature_part_count > 0 {
        blockers.push("digital-signature".into());
    }
    if risks.script_marker_count > 0 {
        blockers.push("script-or-macro".into());
    }
    if risks.external_link_count > 0 {
        blockers.push("external-link".into());
    }
    if risks.embedded_object_count > 0 {
        blockers.push("embedded-object".into());
    }
    let editing_enabled = blockers.is_empty();
    let format = source_report.format.clone();
    let next_stage = match format.as_str() {
        "ods" => "bounded-cell-value-candidate",
        "odp" => "bounded-slide-text-candidate",
        _ => "readonly",
    };
    let editable_candidate_parts = source_parts
        .values()
        .filter(|part| part.editable_candidate)
        .map(|part| part.part_name.clone())
        .collect::<Vec<_>>();
    if editable_candidate_parts != [ODF_EDITABLE_PART] {
        return Err("ODF 隔离包缺少唯一 content.xml 候选部件".into());
    }
    let part_count = source_parts.len();
    let source_unchanged = package_digest(source) == source_digest;
    let report = OdfEditBaselineReport {
        status: if editing_enabled {
            "candidate"
        } else {
            "blocked"
        }
        .into(),
        engine: "longedit-odf-isolated-baseline-v1".into(),
        format,
        execution: "memory-only".into(),
        writes_user_file: false,
        source_package_digest: source_digest,
        isolated_package_digest: package_digest(&isolated),
        part_count,
        raw_copied_part_count: part_count,
        protected_part_count: part_count.saturating_sub(1),
        editable_candidate_parts,
        changed_parts,
        added_parts,
        removed_parts,
        unchanged_parts_verified,
        structural_reparse_verified: source_report.format == isolated_report.format
            && source_report.root_mime_type == isolated_report.root_mime_type
            && source_report.entry_count == isolated_report.entry_count,
        source_unchanged,
        editing_enabled,
        blockers,
        next_stage: next_stage.into(),
        parts: source_parts.into_values().collect(),
    };
    Ok((report, isolated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("odf-content")
            .join(name)
    }

    #[test]
    fn real_ods_and_odp_are_isolated_without_part_drift() {
        for (name, extension, next_stage) in [
            (
                "longedit-e1c-spreadsheet.ods",
                "ods",
                "bounded-cell-value-candidate",
            ),
            (
                "longedit-e1c-presentation.odp",
                "odp",
                "bounded-slide-text-candidate",
            ),
        ] {
            let source = fs::read(fixture(name)).unwrap();
            let source_digest = package_digest(&source);
            let (report, isolated) = inspect_odf_edit_baseline(&source, extension).unwrap();
            assert_eq!(report.status, "candidate", "{name}: {:?}", report.blockers);
            assert!(report.editing_enabled);
            assert!(report.unchanged_parts_verified);
            assert!(report.structural_reparse_verified);
            assert!(report.source_unchanged);
            assert!(report.blockers.is_empty());
            assert_eq!(report.editable_candidate_parts, [ODF_EDITABLE_PART]);
            assert_eq!(report.raw_copied_part_count, report.part_count);
            assert_eq!(report.protected_part_count + 1, report.part_count);
            assert_eq!(report.next_stage, next_stage);
            assert_eq!(
                package_parts(&source).unwrap(),
                package_parts(&isolated).unwrap()
            );
            assert_eq!(package_digest(&source), source_digest);
        }
    }

    #[test]
    fn real_ods_exposes_only_simple_values_and_blocks_formula_cells() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        assert_eq!(inventory.status, "candidate");
        assert!(inventory.writes_user_file == false);
        assert!(inventory.blockers.is_empty());
        assert!(inventory
            .editable_cells
            .iter()
            .any(|cell| cell.sheet_name == "Overview" && cell.address == "A1"));
        assert!(inventory
            .editable_cells
            .iter()
            .any(|cell| cell.address == "A2" && cell.value_type == "float"));
        assert!(inventory
            .blocked_cells
            .iter()
            .any(|cell| cell.address == "B2" && cell.reason == "formula-readonly"));
    }

    #[test]
    fn real_ods_string_and_float_values_patch_without_protected_part_drift() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let source_digest = package_digest(&source);
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        for (address, replacement) in [("A1", "LongEdit & ODS <copy>"), ("A2", "84.5")] {
            let target = inventory
                .editable_cells
                .iter()
                .find(|cell| cell.sheet_name == "Overview" && cell.address == address)
                .unwrap();
            let (report, output) = build_ods_cell_value_patch_isolated(
                &source,
                &target.id,
                &target.expected_value_digest,
                replacement,
            )
            .unwrap();
            assert_eq!(report.status, "isolated-copy-verified");
            assert_eq!(report.changed_parts, [ODF_EDITABLE_PART]);
            assert!(report.unchanged_parts_verified);
            assert!(report.structural_reparse_verified);
            assert!(report.semantic_reparse_verified);
            assert!(report.source_unchanged);
            assert!(!report.writes_user_file);
            assert_eq!(package_digest(&source), source_digest);
            assert_ne!(package_digest(&output), source_digest);
        }
    }

    #[test]
    fn real_ods_existing_named_style_patches_only_content_xml() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let good = inventory
            .named_cell_styles
            .iter()
            .find(|style| style.name == "Good")
            .unwrap();
        assert_eq!(good.parent_style_name.as_deref(), Some("Status"));
        assert_eq!(good.background_color.as_deref(), Some("#ccffcc"));
        assert_eq!(good.text_color.as_deref(), Some("#006600"));
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.sheet_name == "Overview" && cell.address == "A1")
            .unwrap();
        assert_eq!(target.current_style_name, "Default");
        let (report, output) = build_ods_cell_style_patch_isolated(
            &source,
            &target.id,
            &target.expected_style_digest,
            "Good",
        )
        .unwrap();
        assert_eq!(report.changed_parts, [ODF_EDITABLE_PART]);
        assert_eq!(report.style_name, "Good");
        assert!(report.unchanged_parts_verified && report.semantic_reparse_verified);
        assert_eq!(
            package_part(&source, "styles.xml").unwrap(),
            package_part(&output, "styles.xml").unwrap()
        );
        assert_eq!(package_digest(&source), report.source_digest);
    }

    #[test]
    fn ods_style_patch_rejects_stale_unknown_and_automatic_style_collision() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.address == "A1")
            .unwrap();
        assert!(
            build_ods_cell_style_patch_isolated(&source, &target.id, "stale", "Good")
                .unwrap_err()
                .contains("已变化")
        );
        assert!(build_ods_cell_style_patch_isolated(
            &source,
            &target.id,
            &target.expected_style_digest,
            "UnknownStyle",
        )
        .unwrap_err()
        .contains("不存在"));

        let automatic_name = format!("ceLongEdit{}", &package_digest(b"Good")[..12]);
        let mut xml = content_xml(&source).unwrap();
        let marker = b"</office:automatic-styles>";
        let insertion = xml
            .windows(marker.len())
            .position(|window| window == marker)
            .unwrap();
        let collision = format!(
            "<style:style style:name=\"{automatic_name}\" style:family=\"table-cell\" style:parent-style-name=\"Bad\"/>"
        );
        xml.splice(insertion..insertion, collision.into_bytes());
        let collision_source = rewrite_content_part(&source, &xml).unwrap();
        let collision_inventory = inspect_ods_cell_edit_inventory(&collision_source).unwrap();
        let collision_target = collision_inventory
            .editable_cells
            .iter()
            .find(|cell| cell.address == "A1")
            .unwrap();
        assert!(build_ods_cell_style_patch_isolated(
            &collision_source,
            &collision_target.id,
            &collision_target.expected_style_digest,
            "Good",
        )
        .unwrap_err()
        .contains("冲突"));
    }

    #[test]
    fn ods_named_style_resolution_rejects_cycles_missing_parents_and_unknown_properties() {
        let mut drafts = BTreeMap::new();
        drafts.insert(
            "A".into(),
            NamedCellStyleDraft {
                name: "A".into(),
                parent_style_name: Some("B".into()),
                ..NamedCellStyleDraft::default()
            },
        );
        drafts.insert(
            "B".into(),
            NamedCellStyleDraft {
                name: "B".into(),
                parent_style_name: Some("A".into()),
                ..NamedCellStyleDraft::default()
            },
        );
        assert!(resolve_named_cell_style("A", &drafts, &mut BTreeSet::new())
            .unwrap_err()
            .contains("循环"));
        drafts.get_mut("B").unwrap().parent_style_name = Some("Missing".into());
        assert!(resolve_named_cell_style("A", &drafts, &mut BTreeSet::new())
            .unwrap_err()
            .contains("缺少"));
        drafts.get_mut("B").unwrap().parent_style_name = None;
        drafts.get_mut("B").unwrap().unsafe_property = true;
        assert!(resolve_named_cell_style("A", &drafts, &mut BTreeSet::new())
            .unwrap_err()
            .contains("未验证属性"));
    }

    #[test]
    #[ignore = "writes an isolated audit artifact for the M1C-C LibreOffice producer check"]
    fn export_m1cc_formula_precedent_copy() {
        let output = std::env::var_os("LONGEDIT_M1CC_OUTPUT")
            .map(PathBuf::from)
            .expect("LONGEDIT_M1CC_OUTPUT is required");
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.sheet_name == "Overview" && cell.address == "A2")
            .unwrap();
        let (report, patched) = build_ods_cell_value_patch_isolated(
            &source,
            &target.id,
            &target.expected_value_digest,
            "84.5",
        )
        .unwrap();
        assert_eq!(report.changed_parts, [ODF_EDITABLE_PART]);
        assert!(report.unchanged_parts_verified && report.semantic_reparse_verified);
        fs::write(output, patched).unwrap();
    }

    #[test]
    fn stale_or_formula_targets_cannot_be_patched() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.address == "A1")
            .unwrap();
        assert!(build_ods_cell_value_patch_isolated(
            &source,
            &target.id,
            "stale-digest",
            "replacement",
        )
        .unwrap_err()
        .contains("已变化"));
        assert!(build_ods_cell_value_patch_isolated(
            &source,
            "ods-cell:1:B2",
            "not-editable",
            "99",
        )
        .unwrap_err()
        .contains("不是可编辑"));
    }
}
