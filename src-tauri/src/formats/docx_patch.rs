use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const DOCX_EDITABLE_DOCUMENT_PART: &str = "word/document.xml";
const MAX_DOCX_DOCUMENT_PATCH_BYTES: usize = 32 * 1024 * 1024;
const MAX_DOCX_EDITABLE_TEXT_CHARS: usize = 32_767;
const DOCX_PATCH_DEFLATE_LEVEL: i64 = 4;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxEditableTextTarget {
    pub id: String,
    pub block_id: String,
    pub kind: String,
    pub text: String,
    pub expected_text_digest: String,
    pub row_index: Option<usize>,
    pub column_index: Option<usize>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxEditableStyleTarget {
    pub id: String,
    pub block_id: String,
    pub kind: String,
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub font_color: Option<String>,
    pub font_size_half_points: Option<u16>,
    pub expected_style_digest: String,
    pub row_index: Option<usize>,
    pub column_index: Option<usize>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxEditableImageTarget {
    pub id: String,
    pub block_id: String,
    pub image_part: String,
    pub name: String,
    pub alt_text: String,
    pub expected_metadata_digest: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxIsolatedPatchReport {
    pub status: String,
    pub engine: String,
    pub target_part: String,
    pub source_digest: String,
    pub output_digest: String,
    pub source_part_digest: String,
    pub output_part_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub output_bytes: usize,
    pub semantic_target_id: Option<String>,
    pub semantic_kind: Option<String>,
    pub semantic_reparse_verified: bool,
}

#[derive(Clone, Debug)]
struct ParagraphTextSpan {
    paragraph_index: usize,
    text: String,
    start: usize,
    end: usize,
    safe: bool,
    table_index: Option<usize>,
    row_index: Option<usize>,
    column_index: Option<usize>,
    run_count: usize,
    run_insert_position: Option<usize>,
    run_properties_span: Option<(usize, usize)>,
    basic_style_safe: bool,
    bold: bool,
    italic: bool,
    underline: bool,
    font_color: Option<String>,
    font_size_half_points: Option<u16>,
}

#[derive(Default)]
struct ParagraphScanState {
    paragraph_index: usize,
    text: String,
    span: Option<(usize, usize)>,
    text_element_count: usize,
    safe: bool,
    in_text: bool,
    table_index: Option<usize>,
    row_index: Option<usize>,
    column_index: Option<usize>,
    run_count: usize,
    run_insert_position: Option<usize>,
    run_properties_span: Option<(usize, usize)>,
    run_properties_count: usize,
    in_run_properties: bool,
    basic_style_safe: bool,
    bold: bool,
    italic: bool,
    underline: bool,
    font_color: Option<String>,
    font_size_half_points: Option<u16>,
}

#[derive(Clone, Debug)]
struct ImageMetadataSpan {
    paragraph_index: usize,
    start: usize,
    end: usize,
    tag_name: String,
    attributes: Vec<(String, String)>,
    name: String,
    alt_text: String,
    safe: bool,
}

#[derive(Default)]
struct ImageParagraphScanState {
    paragraph_index: usize,
    top_level: bool,
    drawing_count: usize,
    image_carrier_count: usize,
    inline_depth: usize,
    anchor_depth: usize,
    picture_depth: usize,
    has_internal_blip: bool,
    doc_properties: Option<ImageMetadataSpan>,
    safe: bool,
}

#[derive(Clone, Debug)]
struct ImageParagraphCandidate {
    metadata: Option<ImageMetadataSpan>,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn read_part(source: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX OOXML 包失败: {error}"))?;
    let mut part = archive
        .by_name(part_name)
        .map_err(|error| format!("DOCX 目标部件 {part_name} 缺失: {error}"))?;
    if part.enclosed_name().is_none() {
        return Err("DOCX 目标部件路径不安全".into());
    }
    let mut bytes = Vec::with_capacity(part.size() as usize);
    part.read_to_end(&mut bytes)
        .map_err(|error| format!("读取 DOCX 目标部件失败: {error}"))?;
    Ok(bytes)
}

pub fn docx_document_part_digest(source: &[u8]) -> Result<String, String> {
    parse_docx(source)?;
    read_part(source, DOCX_EDITABLE_DOCUMENT_PART).map(|bytes| digest(&bytes))
}

fn forbidden_text_carrier(name: &[u8]) -> bool {
    matches!(
        name,
        b"ins"
            | b"del"
            | b"moveFrom"
            | b"moveTo"
            | b"fldSimple"
            | b"instrText"
            | b"fldChar"
            | b"sdt"
            | b"hyperlink"
            | b"smartTag"
            | b"customXml"
            | b"drawing"
            | b"object"
            | b"pict"
            | b"altChunk"
            | b"commentRangeStart"
            | b"commentRangeEnd"
            | b"commentReference"
            | b"footnoteReference"
            | b"endnoteReference"
            | b"bookmarkStart"
            | b"bookmarkEnd"
            | b"proofErr"
            | b"permStart"
            | b"permEnd"
            | b"br"
            | b"cr"
            | b"tab"
            | b"sym"
    )
}

fn attribute_value_bytes(event: &BytesStart<'_>, name: &[u8]) -> Result<Option<Vec<u8>>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("DOCX C2D 属性读取失败: {error}"))?;
        if attribute.key.local_name().as_ref() == name {
            return Ok(Some(attribute.value.into_owned()));
        }
    }
    Ok(None)
}

fn parse_basic_style_property(
    paragraph: &mut ParagraphScanState,
    event: &BytesStart<'_>,
) -> Result<(), String> {
    if event.attributes().any(|attribute| {
        attribute
            .map(|attribute| attribute.key.local_name().as_ref() != b"val")
            .unwrap_or(true)
    }) {
        paragraph.basic_style_safe = false;
        return Ok(());
    }
    let name = event.local_name();
    let value = attribute_value_bytes(event, b"val")?;
    match name.as_ref() {
        b"b" | b"i" => {
            let enabled = match value.as_deref() {
                None | Some(b"1") | Some(b"true") | Some(b"on") => true,
                Some(b"0") | Some(b"false") | Some(b"off") => false,
                _ => {
                    paragraph.basic_style_safe = false;
                    return Ok(());
                }
            };
            if name.as_ref() == b"b" {
                paragraph.bold = enabled;
            } else {
                paragraph.italic = enabled;
            }
        }
        b"u" => match value.as_deref() {
            None | Some(b"single") => paragraph.underline = true,
            Some(b"none") => paragraph.underline = false,
            _ => paragraph.basic_style_safe = false,
        },
        b"color" => {
            let Some(value) = value.and_then(|value| String::from_utf8(value).ok()) else {
                paragraph.basic_style_safe = false;
                return Ok(());
            };
            if value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                paragraph.font_color = Some(value.to_ascii_uppercase());
            } else {
                paragraph.basic_style_safe = false;
            }
        }
        b"sz" => {
            let Some(value) = value
                .and_then(|value| String::from_utf8(value).ok())
                .and_then(|value| value.parse::<u16>().ok())
                .filter(|value| (2..=400).contains(value))
            else {
                paragraph.basic_style_safe = false;
                return Ok(());
            };
            paragraph.font_size_half_points = Some(value);
        }
        _ => paragraph.basic_style_safe = false,
    }
    Ok(())
}

fn scan_document_paragraphs(document_xml: &[u8]) -> Result<Vec<ParagraphTextSpan>, String> {
    let mut reader = Reader::from_reader(document_xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut in_body = false;
    let mut table_depth = 0_usize;
    let mut table_number = 0_usize;
    let mut row_number = 0_usize;
    let mut cell_number = 0_usize;
    let mut sdt_depth = 0_usize;
    let mut paragraph_number = 0_usize;
    let mut current: Option<ParagraphScanState> = None;
    let mut spans = Vec::new();
    let mut cell_paragraph_counts = BTreeMap::new();

    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX C2B 主文档 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                match name {
                    b"body" => in_body = true,
                    b"tbl" => {
                        if table_depth == 0 {
                            table_number += 1;
                            row_number = 0;
                        }
                        table_depth += 1;
                    }
                    b"tr" if table_depth == 1 => {
                        row_number += 1;
                        cell_number = 0;
                    }
                    b"tc" if table_depth == 1 => cell_number += 1,
                    b"sdt" => sdt_depth += 1,
                    b"p" if in_body => {
                        paragraph_number += 1;
                        let in_simple_table_cell =
                            table_depth == 1 && row_number > 0 && cell_number > 0;
                        let (table_index, row_index, column_index) = if in_simple_table_cell {
                            let coordinates = (table_number - 1, row_number - 1, cell_number - 1);
                            *cell_paragraph_counts.entry(coordinates).or_insert(0_usize) += 1;
                            (
                                Some(coordinates.0),
                                Some(coordinates.1),
                                Some(coordinates.2),
                            )
                        } else {
                            (None, None, None)
                        };
                        current = Some(ParagraphScanState {
                            paragraph_index: paragraph_number,
                            safe: sdt_depth == 0 && (table_depth == 0 || in_simple_table_cell),
                            basic_style_safe: true,
                            table_index,
                            row_index,
                            column_index,
                            ..Default::default()
                        });
                    }
                    _ => {}
                }
                if let Some(paragraph) = current.as_mut() {
                    if name == b"r" {
                        paragraph.run_count += 1;
                        if paragraph.run_count == 1 {
                            paragraph.run_insert_position = Some(
                                usize::try_from(reader.buffer_position())
                                    .map_err(|_| "DOCX C2D 运行位置超出平台范围")?,
                            );
                        }
                    } else if name == b"rPr" {
                        paragraph.run_properties_count += 1;
                        paragraph.in_run_properties = true;
                        let end = usize::try_from(reader.buffer_position())
                            .map_err(|_| "DOCX C2D 样式位置超出平台范围")?;
                        let start = end
                            .checked_sub(event.len() + 2)
                            .ok_or("DOCX C2D 样式位置无效")?;
                        paragraph.run_properties_span = Some((start, end));
                    } else if paragraph.in_run_properties {
                        paragraph.basic_style_safe = false;
                    }
                    if forbidden_text_carrier(name) {
                        paragraph.safe = false;
                    }
                    if name == b"t" {
                        paragraph.text_element_count += 1;
                        paragraph.in_text = true;
                    }
                }
            }
            Event::Empty(ref event) => {
                if let Some(paragraph) = current.as_mut() {
                    let name = event.local_name();
                    let name = name.as_ref();
                    if name == b"rPr" {
                        paragraph.run_properties_count += 1;
                        let end = usize::try_from(reader.buffer_position())
                            .map_err(|_| "DOCX C2D 空样式位置超出平台范围")?;
                        let start = end
                            .checked_sub(event.len() + 3)
                            .ok_or("DOCX C2D 空样式位置无效")?;
                        paragraph.run_properties_span = Some((start, end));
                    } else if paragraph.in_run_properties {
                        parse_basic_style_property(paragraph, event)?;
                    }
                    if forbidden_text_carrier(name) {
                        paragraph.safe = false;
                    }
                    if name == b"t" {
                        paragraph.text_element_count += 1;
                        paragraph.safe = false;
                    }
                }
            }
            Event::Text(ref text) => {
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_run_properties) {
                    paragraph.basic_style_safe = false;
                }
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_text) {
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "DOCX C2B 文本位置超出平台范围")?;
                    let start = end.checked_sub(text.len()).ok_or("DOCX C2B 文本位置无效")?;
                    paragraph.span = Some(match paragraph.span {
                        Some((existing_start, existing_end)) if existing_end <= start => {
                            (existing_start, end)
                        }
                        Some(_) => {
                            paragraph.safe = false;
                            (start, end)
                        }
                        None => (start, end),
                    });
                    let value = text
                        .xml10_content()
                        .map_err(|error| format!("DOCX C2B 文本解码失败: {error}"))?;
                    paragraph.text.push_str(&value);
                }
            }
            Event::GeneralRef(ref reference) => {
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_run_properties) {
                    paragraph.basic_style_safe = false;
                }
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_text) {
                    let reference_bytes: &[u8] = reference;
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "DOCX C2B 实体位置超出平台范围")?;
                    let start = end
                        .checked_sub(reference_bytes.len() + 2)
                        .ok_or("DOCX C2B 实体位置无效")?;
                    paragraph.span = Some(match paragraph.span {
                        Some((existing_start, existing_end)) if existing_end <= start => {
                            (existing_start, end)
                        }
                        Some(_) => {
                            paragraph.safe = false;
                            (start, end)
                        }
                        None => (start, end),
                    });
                    match reference.resolve_char_ref() {
                        Ok(Some(value)) => paragraph.text.push(value),
                        Ok(None) => match reference_bytes {
                            b"amp" => paragraph.text.push('&'),
                            b"lt" => paragraph.text.push('<'),
                            b"gt" => paragraph.text.push('>'),
                            b"quot" => paragraph.text.push('"'),
                            b"apos" => paragraph.text.push('\''),
                            _ => paragraph.safe = false,
                        },
                        Err(_) => paragraph.safe = false,
                    }
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"t" {
                    if let Some(paragraph) = current.as_mut() {
                        paragraph.in_text = false;
                    }
                } else if name == b"rPr" {
                    if let Some(paragraph) = current.as_mut() {
                        paragraph.in_run_properties = false;
                        if let Some((start, _)) = paragraph.run_properties_span {
                            paragraph.run_properties_span = Some((
                                start,
                                usize::try_from(reader.buffer_position())
                                    .map_err(|_| "DOCX C2D 样式结束位置超出平台范围")?,
                            ));
                        }
                    }
                } else if name == b"p" {
                    if let Some(paragraph) = current.take() {
                        if let Some((start, end)) = paragraph.span {
                            spans.push(ParagraphTextSpan {
                                paragraph_index: paragraph.paragraph_index,
                                text: paragraph.text,
                                start,
                                end,
                                safe: paragraph.safe && paragraph.text_element_count == 1,
                                table_index: paragraph.table_index,
                                row_index: paragraph.row_index,
                                column_index: paragraph.column_index,
                                run_count: paragraph.run_count,
                                run_insert_position: paragraph.run_insert_position,
                                run_properties_span: paragraph.run_properties_span,
                                basic_style_safe: paragraph.basic_style_safe
                                    && paragraph.run_properties_count <= 1,
                                bold: paragraph.bold,
                                italic: paragraph.italic,
                                underline: paragraph.underline,
                                font_color: paragraph.font_color,
                                font_size_half_points: paragraph.font_size_half_points,
                            });
                        }
                    }
                } else if name == b"tbl" {
                    table_depth = table_depth.saturating_sub(1);
                } else if name == b"sdt" {
                    sdt_depth = sdt_depth.saturating_sub(1);
                } else if name == b"body" {
                    in_body = false;
                }
            }
            Event::Comment(_) | Event::CData(_) | Event::PI(_) => {
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_run_properties) {
                    paragraph.basic_style_safe = false;
                }
            }
            Event::DocType(_) => return Err("DOCX C2B 不允许包含 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    for span in &mut spans {
        if let (Some(table), Some(row), Some(column)) =
            (span.table_index, span.row_index, span.column_index)
        {
            span.safe &= cell_paragraph_counts
                .get(&(table, row, column))
                .is_some_and(|count| *count == 1);
        }
    }
    Ok(spans)
}

fn decoded_attributes(
    reader: &Reader<&[u8]>,
    event: &BytesStart<'_>,
) -> Result<Vec<(String, String)>, String> {
    event
        .attributes()
        .map(|attribute| {
            let attribute =
                attribute.map_err(|error| format!("DOCX C2D 图片属性读取失败: {error}"))?;
            let key = std::str::from_utf8(attribute.key.as_ref())
                .map_err(|_| "DOCX C2D 图片属性名不是 UTF-8")?
                .to_string();
            let value = attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                .map_err(|error| format!("DOCX C2D 图片属性解码失败: {error}"))?
                .into_owned();
            Ok((key, value))
        })
        .collect()
}

fn attribute_by_local_name<'a>(
    attributes: &'a [(String, String)],
    local_name: &str,
) -> Option<&'a str> {
    attributes
        .iter()
        .find(|(key, _)| key.rsplit(':').next() == Some(local_name))
        .map(|(_, value)| value.as_str())
}

fn scan_inline_image_metadata(document_xml: &[u8]) -> Result<Vec<ImageParagraphCandidate>, String> {
    let mut reader = Reader::from_reader(document_xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut in_body = false;
    let mut table_depth = 0_usize;
    let mut paragraph_number = 0_usize;
    let mut current: Option<ImageParagraphScanState> = None;
    let mut spans = Vec::new();

    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX C2D 图片元数据 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                match name {
                    b"body" => in_body = true,
                    b"tbl" => table_depth += 1,
                    b"p" if in_body => {
                        paragraph_number += 1;
                        current = Some(ImageParagraphScanState {
                            paragraph_index: paragraph_number,
                            top_level: table_depth == 0,
                            safe: table_depth == 0,
                            ..Default::default()
                        });
                    }
                    _ => {}
                }
                if let Some(paragraph) = current.as_mut() {
                    match name {
                        b"drawing" => {
                            paragraph.drawing_count += 1;
                            paragraph.image_carrier_count += 1;
                        }
                        b"pict" => {
                            paragraph.image_carrier_count += 1;
                            paragraph.safe = false;
                        }
                        b"inline" => paragraph.inline_depth += 1,
                        b"anchor" => {
                            paragraph.anchor_depth += 1;
                            paragraph.safe = false;
                        }
                        b"pic" => paragraph.picture_depth += 1,
                        b"blip" if paragraph.picture_depth > 0 && paragraph.inline_depth == 1 => {
                            paragraph.has_internal_blip |=
                                attribute_value_bytes(event, b"embed")?.is_some();
                        }
                        b"docPr" => paragraph.safe = false,
                        _ => {}
                    }
                }
            }
            Event::Empty(ref event) => {
                if let Some(paragraph) = current.as_mut() {
                    match event.local_name().as_ref() {
                        b"drawing" => {
                            paragraph.drawing_count += 1;
                            paragraph.image_carrier_count += 1;
                            paragraph.safe = false;
                        }
                        b"pict" => {
                            paragraph.image_carrier_count += 1;
                            paragraph.safe = false;
                        }
                        b"docPr"
                            if paragraph.inline_depth == 1
                                && paragraph.anchor_depth == 0
                                && paragraph.drawing_count == 1 =>
                        {
                            if paragraph.doc_properties.is_some() {
                                paragraph.safe = false;
                            } else {
                                let end = usize::try_from(reader.buffer_position())
                                    .map_err(|_| "DOCX C2D 图片元数据位置超出平台范围")?;
                                let start = end
                                    .checked_sub(event.len() + 3)
                                    .ok_or("DOCX C2D 图片元数据位置无效")?;
                                if !document_xml.get(start..end).is_some_and(|bytes| {
                                    bytes.starts_with(b"<") && bytes.ends_with(b"/>")
                                }) {
                                    return Err("DOCX C2D 图片元数据字节范围无效".into());
                                }
                                let attributes = decoded_attributes(&reader, event)?;
                                if !attribute_by_local_name(&attributes, "id")
                                    .is_some_and(|value| value.parse::<u32>().is_ok())
                                {
                                    paragraph.safe = false;
                                }
                                let name = attribute_by_local_name(&attributes, "name")
                                    .unwrap_or_default()
                                    .to_string();
                                let alt_text = attribute_by_local_name(&attributes, "descr")
                                    .unwrap_or_default()
                                    .to_string();
                                let tag_name = std::str::from_utf8(event.name().as_ref())
                                    .map_err(|_| "DOCX C2D 图片元数据标签不是 UTF-8")?
                                    .to_string();
                                paragraph.doc_properties = Some(ImageMetadataSpan {
                                    paragraph_index: paragraph.paragraph_index,
                                    start,
                                    end,
                                    tag_name,
                                    attributes,
                                    name,
                                    alt_text,
                                    safe: false,
                                });
                            }
                        }
                        b"blip" if paragraph.picture_depth > 0 && paragraph.inline_depth == 1 => {
                            paragraph.has_internal_blip |=
                                attribute_value_bytes(event, b"embed")?.is_some();
                        }
                        _ => {}
                    }
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if let Some(paragraph) = current.as_mut() {
                    match name {
                        b"inline" => {
                            paragraph.inline_depth = paragraph.inline_depth.saturating_sub(1)
                        }
                        b"anchor" => {
                            paragraph.anchor_depth = paragraph.anchor_depth.saturating_sub(1)
                        }
                        b"pic" => {
                            paragraph.picture_depth = paragraph.picture_depth.saturating_sub(1)
                        }
                        _ => {}
                    }
                }
                if name == b"p" {
                    if let Some(paragraph) = current.take() {
                        if paragraph.top_level && paragraph.image_carrier_count > 0 {
                            let metadata = paragraph.doc_properties.map(|mut span| {
                                span.safe = paragraph.safe
                                    && paragraph.drawing_count == 1
                                    && paragraph.image_carrier_count == 1
                                    && paragraph.has_internal_blip;
                                span
                            });
                            spans.push(ImageParagraphCandidate { metadata });
                        }
                    }
                } else if name == b"tbl" {
                    table_depth = table_depth.saturating_sub(1);
                } else if name == b"body" {
                    in_body = false;
                }
            }
            Event::DocType(_) => return Err("DOCX C2D 不允许图片元数据包含 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(spans)
}

fn editable_targets_with_spans(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<(DocxEditableTextTarget, ParagraphTextSpan)>, String> {
    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let paragraphs = scan_document_paragraphs(&document_xml)?;
    let mut block_cursor = 0_usize;
    let mut targets = Vec::new();

    for paragraph in paragraphs {
        if let (Some(table_index), Some(row_index), Some(column_index)) = (
            paragraph.table_index,
            paragraph.row_index,
            paragraph.column_index,
        ) {
            let Some(block) = model
                .blocks
                .iter()
                .filter(|block| block.kind == "table")
                .nth(table_index)
            else {
                continue;
            };
            let Some(cell) = block
                .rows
                .get(row_index)
                .and_then(|row| row.cells.get(column_index))
            else {
                continue;
            };
            if !paragraph.safe
                || paragraph.text.is_empty()
                || cell.text != paragraph.text
                || cell.continuation
                || cell.column_span != 1
                || cell.row_span != 1
            {
                continue;
            }
            let text_digest = digest(paragraph.text.as_bytes());
            targets.push((
                DocxEditableTextTarget {
                    id: format!(
                        "docx-table-{}-r{}-c{}-{}",
                        table_index + 1,
                        row_index + 1,
                        column_index + 1,
                        &text_digest[..12]
                    ),
                    block_id: block.id.clone(),
                    kind: "table-cell".into(),
                    text: paragraph.text.clone(),
                    expected_text_digest: text_digest,
                    row_index: Some(row_index),
                    column_index: Some(column_index),
                },
                paragraph,
            ));
            continue;
        }

        let Some((offset, block)) =
            model.blocks[block_cursor..]
                .iter()
                .enumerate()
                .find(|(_, block)| {
                    matches!(
                        block.kind.as_str(),
                        "paragraph" | "heading" | "list-item" | "image"
                    ) && block.text == paragraph.text
                })
        else {
            continue;
        };
        block_cursor += offset + 1;
        if !paragraph.safe
            || paragraph.text.is_empty()
            || !matches!(block.kind.as_str(), "paragraph" | "heading" | "list-item")
        {
            continue;
        }
        let text_digest = digest(paragraph.text.as_bytes());
        targets.push((
            DocxEditableTextTarget {
                id: format!(
                    "docx-text-{}-{}",
                    paragraph.paragraph_index,
                    &text_digest[..12]
                ),
                block_id: block.id.clone(),
                kind: block.kind.clone(),
                text: paragraph.text.clone(),
                expected_text_digest: text_digest,
                row_index: None,
                column_index: None,
            },
            paragraph,
        ));
    }
    Ok(targets)
}

pub fn inspect_docx_editable_text_targets(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<DocxEditableTextTarget>, String> {
    editable_targets_with_spans(source, model)
        .map(|targets| targets.into_iter().map(|(target, _)| target).collect())
}

fn editable_style_targets_with_spans(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<(DocxEditableStyleTarget, ParagraphTextSpan)>, String> {
    editable_targets_with_spans(source, model).map(|targets| {
        targets
            .into_iter()
            .filter_map(|(target, span)| {
                if span.run_count != 1
                    || span.run_insert_position.is_none()
                    || !span.basic_style_safe
                {
                    return None;
                }
                let style_digest = digest(
                    format!(
                        "{}:{}:{}:{}:{}:{}",
                        target.text,
                        span.bold,
                        span.italic,
                        span.underline,
                        span.font_color.as_deref().unwrap_or("inherit"),
                        span.font_size_half_points
                            .map(|value| value.to_string())
                            .unwrap_or_else(|| "inherit".into())
                    )
                    .as_bytes(),
                );
                Some((
                    DocxEditableStyleTarget {
                        id: format!(
                            "docx-style-{}-{}",
                            span.paragraph_index,
                            &digest(target.text.as_bytes())[..12]
                        ),
                        block_id: target.block_id,
                        kind: target.kind,
                        text: target.text,
                        bold: span.bold,
                        italic: span.italic,
                        underline: span.underline,
                        font_color: span.font_color.clone(),
                        font_size_half_points: span.font_size_half_points,
                        expected_style_digest: style_digest,
                        row_index: target.row_index,
                        column_index: target.column_index,
                    },
                    span,
                ))
            })
            .collect()
    })
}

pub fn inspect_docx_editable_style_targets(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<DocxEditableStyleTarget>, String> {
    editable_style_targets_with_spans(source, model)
        .map(|targets| targets.into_iter().map(|(target, _)| target).collect())
}

fn editable_image_targets_with_spans(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<(DocxEditableImageTarget, ImageMetadataSpan)>, String> {
    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let candidates = scan_inline_image_metadata(&document_xml)?;
    let image_blocks = model
        .blocks
        .iter()
        .filter(|block| block.image_count > 0)
        .collect::<Vec<_>>();
    let mut targets = Vec::new();

    for (index, candidate) in candidates.into_iter().enumerate() {
        let Some(block) = image_blocks.get(index) else {
            continue;
        };
        let Some(span) = candidate.metadata else {
            continue;
        };
        if !span.safe
            || block.kind != "image"
            || block.image_count != 1
            || block.image_parts.len() != 1
        {
            continue;
        }
        let image_part = block.image_parts[0].clone();
        let metadata_digest =
            digest(format!("{}:{}:{}", image_part, span.name, span.alt_text).as_bytes());
        targets.push((
            DocxEditableImageTarget {
                id: format!(
                    "docx-image-{}-{}",
                    span.paragraph_index,
                    &digest(image_part.as_bytes())[..12]
                ),
                block_id: block.id.clone(),
                image_part,
                name: span.name.clone(),
                alt_text: span.alt_text.clone(),
                expected_metadata_digest: metadata_digest,
            },
            span,
        ));
    }
    Ok(targets)
}

pub fn inspect_docx_editable_image_targets(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<DocxEditableImageTarget>, String> {
    editable_image_targets_with_spans(source, model)
        .map(|targets| targets.into_iter().map(|(target, _)| target).collect())
}

fn package_part_digests(source: &[u8]) -> Result<BTreeMap<String, String>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX 差异审计包失败: {error}"))?;
    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
        let mut part = archive
            .by_index(index)
            .map_err(|error| format!("读取 DOCX 差异审计部件失败: {error}"))?;
        let name = part
            .enclosed_name()
            .ok_or("DOCX 差异审计发现不安全路径")?
            .to_string_lossy()
            .replace('\\', "/");
        let mut bytes = Vec::with_capacity(part.size() as usize);
        part.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 DOCX 部件 {name} 失败: {error}"))?;
        if parts.insert(name, digest(&bytes)).is_some() {
            return Err("DOCX 差异审计发现重复部件".into());
        }
    }
    Ok(parts)
}

fn rewrite_document_part(source: &[u8], replacement: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = false;

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 DOCX 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if name == DOCX_EDITABLE_DOCUMENT_PART {
            if replaced {
                return Err("DOCX 主文档部件重复".into());
            }
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(DOCX_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(DOCX_EDITABLE_DOCUMENT_PART, options)
                .map_err(|error| format!("创建 DOCX 目标部件失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 DOCX 目标部件失败: {error}"))?;
            replaced = true;
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("逐字节复制未修改 DOCX 部件失败: {error}"))?;
        }
    }
    if !replaced {
        return Err("DOCX 主文档部件缺失".into());
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 DOCX 隔离包失败: {error}"))
}

pub fn build_docx_document_patch_isolated(
    source: &[u8],
    expected_part_digest: &str,
    replacement_xml: &str,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    if source.len() as u64 > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 隔离补丁上限".into());
    }
    if replacement_xml.len() > MAX_DOCX_DOCUMENT_PATCH_BYTES {
        return Err("DOCX 主文档补丁超过 32 MiB 上限".into());
    }
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_part_digest) {
        return Err("DOCX 目标部件摘要无效".into());
    }

    parse_docx(source)?;
    let source_parts = package_part_digests(source)?;
    let source_part_digest = source_parts
        .get(DOCX_EDITABLE_DOCUMENT_PART)
        .ok_or("DOCX 主文档部件缺失")?
        .clone();
    if source_part_digest != expected_part_digest {
        return Err("DOCX 主文档部件已变化，请重新读取后再验证补丁".into());
    }

    let output = rewrite_document_part(source, replacement_xml.as_bytes())?;
    parse_docx(&output).map_err(|error| format!("DOCX 隔离补丁写后重读失败: {error}"))?;
    let output_parts = package_part_digests(&output)?;
    if source_parts.len() != output_parts.len() || source_parts.keys().ne(output_parts.keys()) {
        return Err("DOCX 隔离补丁意外改变了包部件清单".into());
    }

    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, source_digest)| {
            (output_parts.get(name) != Some(source_digest)).then(|| name.clone())
        })
        .collect::<Vec<_>>();
    if changed_parts != [DOCX_EDITABLE_DOCUMENT_PART.to_string()] {
        return Err(format!(
            "DOCX 隔离补丁差异超出白名单: {}",
            changed_parts.join(", ")
        ));
    }
    let output_part_digest = output_parts
        .get(DOCX_EDITABLE_DOCUMENT_PART)
        .ok_or("DOCX 输出主文档部件缺失")?
        .clone();

    Ok((
        DocxIsolatedPatchReport {
            status: "isolated_verified".into(),
            engine: "LongEdit C2A OOXML package patch".into(),
            target_part: DOCX_EDITABLE_DOCUMENT_PART.into(),
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            output_bytes: output.len(),
            semantic_target_id: None,
            semantic_kind: None,
            semantic_reparse_verified: false,
        },
        output,
    ))
}

pub fn build_docx_text_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_text_digest: &str,
    replacement_text: &str,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    if replacement_text.is_empty() {
        return Err("DOCX C2B 暂不允许删除整个段落文本".into());
    }
    if replacement_text.chars().count() > MAX_DOCX_EDITABLE_TEXT_CHARS {
        return Err("DOCX C2B 段落文本超过 32,767 字符上限".into());
    }
    if replacement_text.chars().any(char::is_control) {
        return Err("DOCX C2B 普通段落不允许换行、制表符或控制字符".into());
    }
    let expected_text_digest = expected_text_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_text_digest) {
        return Err("DOCX C2B 原文本摘要无效".into());
    }

    let model = parse_docx(source)?;
    let targets = editable_targets_with_spans(source, &model)?;
    let (target, span) = targets
        .into_iter()
        .find(|(target, _)| target.id == target_id)
        .ok_or("DOCX C2B 目标不存在或包含只读复杂结构")?;
    if target.expected_text_digest != expected_text_digest {
        return Err("DOCX C2B 目标文本已变化，请重新读取".into());
    }
    if target.text == replacement_text {
        return Err("DOCX C2B 替换文本没有变化".into());
    }

    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let escaped = quick_xml::escape::escape(replacement_text);
    let mut replacement_xml = Vec::with_capacity(
        document_xml.len() + escaped.len().saturating_sub(span.end - span.start),
    );
    replacement_xml.extend_from_slice(&document_xml[..span.start]);
    replacement_xml.extend_from_slice(escaped.as_bytes());
    replacement_xml.extend_from_slice(&document_xml[span.end..]);
    let replacement_xml = String::from_utf8(replacement_xml)
        .map_err(|_| "DOCX C2B 主文档不是有效 UTF-8，当前保持只读")?;
    let part_digest = digest(&document_xml);
    let (mut report, output) =
        build_docx_document_patch_isolated(source, &part_digest, &replacement_xml)?;

    let output_model = parse_docx(&output)?;
    let output_targets = inspect_docx_editable_text_targets(&output, &output_model)?;
    let semantic_match = output_targets.iter().any(|candidate| {
        candidate.block_id == target.block_id
            && candidate.kind == target.kind
            && candidate.row_index == target.row_index
            && candidate.column_index == target.column_index
            && candidate.text == replacement_text
    });
    if !semantic_match {
        return Err("DOCX C2B/C2C 隔离输出语义复读与目标文本不一致".into());
    }
    report.engine = if matches!(target.kind.as_str(), "list-item" | "table-cell") {
        "LongEdit C2C isolated structured text patch"
    } else {
        "LongEdit C2B isolated paragraph text patch"
    }
    .into();
    report.semantic_target_id = Some(target.id);
    report.semantic_kind = Some(target.kind);
    report.semantic_reparse_verified = true;
    Ok((report, output))
}

pub fn build_docx_style_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_style_digest: &str,
    bold: bool,
    italic: bool,
    underline: bool,
    font_color: Option<&str>,
    font_size_half_points: Option<u16>,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    let expected_style_digest = expected_style_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_style_digest) {
        return Err("DOCX C2D 原字符样式摘要无效".into());
    }
    let model = parse_docx(source)?;
    let targets = editable_style_targets_with_spans(source, &model)?;
    let (target, span) = targets
        .into_iter()
        .find(|(target, _)| target.id == target_id)
        .ok_or("DOCX C2D 样式目标不存在或包含复杂运行属性")?;
    if target.expected_style_digest != expected_style_digest {
        return Err("DOCX C2D 目标字符样式已变化，请重新读取".into());
    }
    let font_color =
        font_color.map(|value| value.trim().trim_start_matches('#').to_ascii_uppercase());
    if font_color.as_deref().is_some_and(|value| {
        value.len() != 6 || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err("DOCX 字体颜色必须是 6 位 RGB 十六进制值".into());
    }
    if font_size_half_points.is_some_and(|value| !(16..=144).contains(&value)) {
        return Err("DOCX 字号必须在 8–72 磅之间".into());
    }
    if (
        target.bold,
        target.italic,
        target.underline,
        target.font_color.as_deref(),
        target.font_size_half_points,
    ) == (
        bold,
        italic,
        underline,
        font_color.as_deref(),
        font_size_half_points,
    ) {
        return Err("DOCX C2D 字符样式没有变化".into());
    }

    let mut run_properties = String::new();
    if bold || italic || underline || font_color.is_some() || font_size_half_points.is_some() {
        run_properties.push_str("<w:rPr>");
        if bold {
            run_properties.push_str("<w:b/>");
        }
        if italic {
            run_properties.push_str("<w:i/>");
        }
        if underline {
            run_properties.push_str(r#"<w:u w:val="single"/>"#);
        }
        if let Some(color) = &font_color {
            run_properties.push_str(&format!(r#"<w:color w:val="{color}"/>"#));
        }
        if let Some(size) = font_size_half_points {
            run_properties.push_str(&format!(r#"<w:sz w:val="{size}"/>"#));
        }
        run_properties.push_str("</w:rPr>");
    }

    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let (start, end) = span
        .run_properties_span
        .map(|(start, end)| (start, end))
        .or_else(|| {
            span.run_insert_position
                .map(|position| (position, position))
        })
        .ok_or("DOCX C2D 样式目标缺少运行位置")?;
    let mut replacement_xml =
        Vec::with_capacity(document_xml.len() + run_properties.len().saturating_sub(end - start));
    replacement_xml.extend_from_slice(&document_xml[..start]);
    replacement_xml.extend_from_slice(run_properties.as_bytes());
    replacement_xml.extend_from_slice(&document_xml[end..]);
    let replacement_xml = String::from_utf8(replacement_xml)
        .map_err(|_| "DOCX C2D 主文档不是有效 UTF-8，当前保持只读")?;
    let part_digest = digest(&document_xml);
    let (mut report, output) =
        build_docx_document_patch_isolated(source, &part_digest, &replacement_xml)?;

    let output_model = parse_docx(&output)?;
    let output_targets = inspect_docx_editable_style_targets(&output, &output_model)?;
    if !output_targets.iter().any(|candidate| {
        candidate.id == target.id
            && candidate.block_id == target.block_id
            && candidate.kind == target.kind
            && candidate.text == target.text
            && candidate.row_index == target.row_index
            && candidate.column_index == target.column_index
            && (candidate.bold, candidate.italic, candidate.underline) == (bold, italic, underline)
            && candidate.font_color == font_color
            && candidate.font_size_half_points == font_size_half_points
    }) {
        return Err("DOCX C2D 隔离输出字符样式复读不一致".into());
    }
    report.engine = "LongEdit C2D isolated basic character style patch".into();
    report.semantic_target_id = Some(target.id);
    report.semantic_kind = Some("character-style".into());
    report.semantic_reparse_verified = true;
    Ok((report, output))
}

pub fn build_docx_image_alt_text_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_metadata_digest: &str,
    replacement_alt_text: &str,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    if replacement_alt_text.chars().count() > 1_024 {
        return Err("DOCX C2D 图片替代文本超过 1,024 字符上限".into());
    }
    if replacement_alt_text.chars().any(char::is_control) {
        return Err("DOCX C2D 图片替代文本不允许控制字符".into());
    }
    let expected_metadata_digest = expected_metadata_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_metadata_digest) {
        return Err("DOCX C2D 图片元数据摘要无效".into());
    }
    let model = parse_docx(source)?;
    let targets = editable_image_targets_with_spans(source, &model)?;
    let (target, span) = targets
        .into_iter()
        .find(|(target, _)| target.id == target_id)
        .ok_or("DOCX C2D 图片目标不存在或不是安全内嵌图片")?;
    if target.expected_metadata_digest != expected_metadata_digest {
        return Err("DOCX C2D 图片元数据已变化，请重新读取".into());
    }
    if target.alt_text == replacement_alt_text {
        return Err("DOCX C2D 图片替代文本没有变化".into());
    }

    let mut updated = BytesStart::new(span.tag_name.as_str());
    for (key, value) in &span.attributes {
        if key.rsplit(':').next() != Some("descr") {
            updated.push_attribute((key.as_str(), value.as_str()));
        }
    }
    if !replacement_alt_text.is_empty() {
        updated.push_attribute(("descr", replacement_alt_text));
    }
    let mut writer = Writer::new(Vec::new());
    writer
        .write_event(Event::Empty(updated))
        .map_err(|error| format!("DOCX C2D 图片元数据编码失败: {error}"))?;
    let replacement_tag = writer.into_inner();

    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let mut replacement_xml = Vec::with_capacity(
        document_xml.len() + replacement_tag.len().saturating_sub(span.end - span.start),
    );
    replacement_xml.extend_from_slice(&document_xml[..span.start]);
    replacement_xml.extend_from_slice(&replacement_tag);
    replacement_xml.extend_from_slice(&document_xml[span.end..]);
    let replacement_xml = String::from_utf8(replacement_xml)
        .map_err(|_| "DOCX C2D 主文档不是有效 UTF-8，当前保持只读")?;
    let part_digest = digest(&document_xml);
    let (mut report, output) =
        build_docx_document_patch_isolated(source, &part_digest, &replacement_xml)?;

    let output_model = parse_docx(&output)?;
    let output_targets = inspect_docx_editable_image_targets(&output, &output_model)?;
    if !output_targets.iter().any(|candidate| {
        candidate.id == target.id
            && candidate.block_id == target.block_id
            && candidate.image_part == target.image_part
            && candidate.name == target.name
            && candidate.alt_text == replacement_alt_text
    }) {
        return Err("DOCX C2D 隔离输出图片替代文本复读不一致".into());
    }
    report.engine = "LongEdit C2D isolated inline image alt-text patch".into();
    report.semantic_target_id = Some(target.id);
    report.semantic_kind = Some("image-alt-text".into());
    report.semantic_reparse_verified = true;
    Ok((report, output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replace_once(source: &str, before: &str, after: &str) -> String {
        assert_eq!(source.matches(before).count(), 1);
        source.replacen(before, after, 1)
    }

    #[test]
    fn patches_real_word_fixture_and_preserves_every_other_part() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let document =
            String::from_utf8(read_part(source, DOCX_EDITABLE_DOCUMENT_PART).unwrap()).unwrap();
        let replacement = replace_once(
            &document,
            "Before explicit page break.",
            "Before isolated page break.",
        );
        let expected_digest = docx_document_part_digest(source).unwrap();
        let (report, output) =
            build_docx_document_patch_isolated(source, &expected_digest, &replacement).unwrap();

        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(report.unchanged_parts_verified);
        assert!(report.unchanged_part_count > 10);
        assert_ne!(report.source_digest, report.output_digest);
        assert_ne!(report.source_part_digest, report.output_part_digest);
        assert!(parse_docx(&output)
            .unwrap()
            .plain_text
            .contains("Before isolated page break."));
        assert_eq!(
            digest(source),
            "cae776e43d5cf54cd48f849969430d44d1daed14de9f02c2a6cec2fa96e03176"
        );
    }

    #[test]
    fn rejects_stale_digest_unsafe_xml_and_oversized_patch() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let document =
            String::from_utf8(read_part(source, DOCX_EDITABLE_DOCUMENT_PART).unwrap()).unwrap();
        assert!(
            build_docx_document_patch_isolated(source, &"0".repeat(64), &document)
                .unwrap_err()
                .contains("已变化")
        );

        let expected_digest = docx_document_part_digest(source).unwrap();
        assert!(build_docx_document_patch_isolated(
            source,
            &expected_digest,
            r#"<!DOCTYPE x><w:document xmlns:w="w"><w:body/></w:document>"#
        )
        .unwrap_err()
        .contains("DOCTYPE"));

        let oversized = "x".repeat(MAX_DOCX_DOCUMENT_PATCH_BYTES + 1);
        assert!(
            build_docx_document_patch_isolated(source, &expected_digest, &oversized)
                .unwrap_err()
                .contains("32 MiB")
        );
    }

    #[test]
    fn lists_only_safe_plain_paragraph_and_heading_targets() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();
        let narrative_targets = targets
            .iter()
            .filter(|target| matches!(target.kind.as_str(), "paragraph" | "heading"))
            .collect::<Vec<_>>();

        assert!(narrative_targets.iter().any(|target| {
            target.kind == "heading" && target.text == "Microsoft Word Producer Fixture"
        }));
        assert!(narrative_targets
            .iter()
            .any(|target| target.text == "Before explicit page break."));
        assert!(!narrative_targets.iter().any(|target| target.text
            == "This document was created and saved by Microsoft Word for LongEdit compatibility auditing."));
        assert!(narrative_targets.iter().all(|target| {
            matches!(target.kind.as_str(), "paragraph" | "heading")
                && target.expected_text_digest.len() == 64
                && target.row_index.is_none()
                && target.column_index.is_none()
        }));
    }

    #[test]
    fn lists_safe_list_items_and_unmerged_single_paragraph_table_cells() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();

        let list = targets
            .iter()
            .find(|target| target.kind == "list-item" && target.text == "Structured reading")
            .unwrap();
        assert!(list.row_index.is_none());
        assert!(list.column_index.is_none());

        let cell = targets
            .iter()
            .find(|target| target.kind == "table-cell" && target.text == "Available")
            .unwrap();
        assert_eq!(cell.row_index, Some(1));
        assert_eq!(cell.column_index, Some(1));
        assert!(!targets
            .iter()
            .any(|target| target.kind == "table-cell" && target.text == "Capability matrix"));
        assert!(!targets
            .iter()
            .any(|target| target.kind == "table-cell" && target.text == "Status"));
    }

    #[test]
    fn patches_safe_text_semantically_and_rejects_stale_or_complex_targets() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();
        let target = targets
            .iter()
            .find(|target| target.text == "Before explicit page break.")
            .unwrap();
        let replacement = "Before isolated & <verified> page break.";
        let (report, output) = build_docx_text_patch_isolated(
            source,
            &target.id,
            &target.expected_text_digest,
            replacement,
        )
        .unwrap();

        assert_eq!(report.engine, "LongEdit C2B isolated paragraph text patch");
        assert_eq!(
            report.semantic_target_id.as_deref(),
            Some(target.id.as_str())
        );
        assert_eq!(report.semantic_kind.as_deref(), Some("paragraph"));
        assert!(report.semantic_reparse_verified);
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(parse_docx(&output)
            .unwrap()
            .plain_text
            .contains(replacement));

        assert!(
            build_docx_text_patch_isolated(source, &target.id, &"0".repeat(64), replacement)
                .unwrap_err()
                .contains("文本已变化")
        );
        assert!(build_docx_text_patch_isolated(
            source,
            "docx-text-complex-comment",
            &digest(b"complex"),
            replacement
        )
        .unwrap_err()
        .contains("只读复杂结构"));
        assert!(build_docx_text_patch_isolated(
            source,
            &target.id,
            &target.expected_text_digest,
            "line one\nline two"
        )
        .unwrap_err()
        .contains("控制字符"));
    }

    #[test]
    fn patches_list_and_table_cell_targets_with_coordinate_stability() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();

        for (kind, original, replacement) in [
            ("list-item", "Structured reading", "Structured editing"),
            ("table-cell", "Available", "Audited"),
        ] {
            let target = targets
                .iter()
                .find(|target| target.kind == kind && target.text == original)
                .unwrap();
            let (report, output) = build_docx_text_patch_isolated(
                source,
                &target.id,
                &target.expected_text_digest,
                replacement,
            )
            .unwrap();
            assert!(report.semantic_reparse_verified);
            assert_eq!(report.semantic_kind.as_deref(), Some(kind));
            let output_model = parse_docx(&output).unwrap();
            let output_targets =
                inspect_docx_editable_text_targets(&output, &output_model).unwrap();
            assert!(output_targets.iter().any(|candidate| {
                candidate.block_id == target.block_id
                    && candidate.kind == kind
                    && candidate.row_index == target.row_index
                    && candidate.column_index == target.column_index
                    && candidate.text == replacement
            }));
        }
    }

    #[test]
    fn patches_and_clears_basic_character_styles_with_semantic_reread() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_style_targets(source, &model).unwrap();
        let target = targets
            .iter()
            .find(|target| target.text == "Microsoft Word Producer Fixture")
            .unwrap();
        let (report, styled) = build_docx_style_patch_isolated(
            source,
            &target.id,
            &target.expected_style_digest,
            true,
            false,
            true,
            Some("C62828"),
            Some(36),
        )
        .unwrap();
        assert_eq!(
            report.engine,
            "LongEdit C2D isolated basic character style patch"
        );
        assert!(report.semantic_reparse_verified);
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(build_docx_style_patch_isolated(
            source,
            &target.id,
            &"0".repeat(64),
            true,
            false,
            false,
            None,
            None,
        )
        .unwrap_err()
        .contains("样式已变化"));
        assert!(build_docx_style_patch_isolated(
            source,
            &target.id,
            &target.expected_style_digest,
            false,
            false,
            false,
            None,
            None,
        )
        .unwrap_err()
        .contains("没有变化"));
        assert!(build_docx_style_patch_isolated(
            source,
            &target.id,
            &target.expected_style_digest,
            false,
            false,
            false,
            Some("not-rgb"),
            None,
        )
        .unwrap_err()
        .contains("6 位 RGB"));
        assert!(build_docx_style_patch_isolated(
            source,
            &target.id,
            &target.expected_style_digest,
            false,
            false,
            false,
            None,
            Some(150),
        )
        .unwrap_err()
        .contains("8–72 磅"));

        let styled_model = parse_docx(&styled).unwrap();
        let styled_targets = inspect_docx_editable_style_targets(&styled, &styled_model).unwrap();
        let styled_target = styled_targets
            .iter()
            .find(|candidate| candidate.id == target.id)
            .unwrap();
        assert!(styled_target.bold);
        assert!(!styled_target.italic);
        assert!(styled_target.underline);
        assert_eq!(styled_target.font_color.as_deref(), Some("C62828"));
        assert_eq!(styled_target.font_size_half_points, Some(36));

        let (_, cleared) = build_docx_style_patch_isolated(
            &styled,
            &styled_target.id,
            &styled_target.expected_style_digest,
            false,
            false,
            false,
            None,
            None,
        )
        .unwrap();
        let cleared_model = parse_docx(&cleared).unwrap();
        let cleared_targets =
            inspect_docx_editable_style_targets(&cleared, &cleared_model).unwrap();
        let cleared_target = cleared_targets
            .iter()
            .find(|candidate| candidate.id == target.id)
            .unwrap();
        assert!(!cleared_target.bold);
        assert!(!cleared_target.italic);
        assert!(!cleared_target.underline);
        assert!(cleared_target.font_color.is_none());
        assert!(cleared_target.font_size_half_points.is_none());
    }

    #[test]
    fn ux33f_audits_all_producers_and_round_trips_only_safe_style_targets() {
        let fixtures = [
            (
                "microsoft-word",
                include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx")
                    .as_slice(),
            ),
            (
                "wps-writer",
                include_bytes!("../../../fixtures/docx/producers/wps-writer.docx").as_slice(),
            ),
            (
                "libreoffice-writer",
                include_bytes!("../../../fixtures/docx/producers/libreoffice-writer.docx")
                    .as_slice(),
            ),
        ];
        let mut verified = Vec::new();
        let mut read_only = Vec::new();
        for (producer, source) in fixtures {
            let model = parse_docx(source).unwrap();
            let Some(target) = inspect_docx_editable_style_targets(source, &model)
                .unwrap()
                .into_iter()
                .next()
            else {
                read_only.push(producer);
                continue;
            };
            let (report, output) = build_docx_style_patch_isolated(
                source,
                &target.id,
                &target.expected_style_digest,
                target.bold,
                target.italic,
                target.underline,
                Some("2F6FED"),
                Some(28),
            )
            .unwrap();
            assert!(report.unchanged_parts_verified);
            assert!(report.semantic_reparse_verified);
            let output_model = parse_docx(&output).unwrap();
            let output_target = inspect_docx_editable_style_targets(&output, &output_model)
                .unwrap()
                .into_iter()
                .find(|candidate| candidate.id == target.id)
                .unwrap();
            assert_eq!(output_target.font_color.as_deref(), Some("2F6FED"));
            assert_eq!(output_target.font_size_half_points, Some(28));
            verified.push(producer);
        }
        assert_eq!(verified, ["microsoft-word"]);
        assert_eq!(read_only, ["wps-writer", "libreoffice-writer"]);
    }

    #[test]
    fn patches_and_clears_inline_image_alt_text_without_changing_media() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let source_media = read_part(source, "word/media/image1.png").unwrap();
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_image_targets(source, &model).unwrap();
        let target = targets
            .iter()
            .find(|target| target.image_part == "word/media/image1.png")
            .unwrap();
        let (report, described) = build_docx_image_alt_text_patch_isolated(
            source,
            &target.id,
            &target.expected_metadata_digest,
            "LongEdit compatibility fixture",
        )
        .unwrap();
        assert_eq!(
            report.engine,
            "LongEdit C2D isolated inline image alt-text patch"
        );
        assert!(report.semantic_reparse_verified);
        assert_eq!(
            read_part(&described, "word/media/image1.png").unwrap(),
            source_media
        );
        assert!(build_docx_image_alt_text_patch_isolated(
            source,
            &target.id,
            &"0".repeat(64),
            "stale",
        )
        .unwrap_err()
        .contains("元数据已变化"));
        assert!(build_docx_image_alt_text_patch_isolated(
            source,
            &target.id,
            &target.expected_metadata_digest,
            "line one\nline two",
        )
        .unwrap_err()
        .contains("控制字符"));

        let described_model = parse_docx(&described).unwrap();
        let described_targets =
            inspect_docx_editable_image_targets(&described, &described_model).unwrap();
        let described_target = described_targets
            .iter()
            .find(|candidate| candidate.id == target.id)
            .unwrap();
        assert_eq!(described_target.alt_text, "LongEdit compatibility fixture");

        let (_, cleared) = build_docx_image_alt_text_patch_isolated(
            &described,
            &described_target.id,
            &described_target.expected_metadata_digest,
            "",
        )
        .unwrap();
        let cleared_model = parse_docx(&cleared).unwrap();
        let cleared_targets =
            inspect_docx_editable_image_targets(&cleared, &cleared_model).unwrap();
        assert!(cleared_targets
            .iter()
            .find(|candidate| candidate.id == target.id)
            .is_some_and(|candidate| candidate.alt_text.is_empty()));
        assert_eq!(
            read_part(&cleared, "word/media/image1.png").unwrap(),
            source_media
        );
    }

    #[test]
    fn excludes_complex_run_properties_and_floating_images() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART).unwrap();
        let document_xml = String::from_utf8(document_xml).unwrap();
        let complex_style_xml = document_xml.replacen(
            "<w:t>Microsoft Word Producer Fixture</w:t>",
            r#"<w:rPr><w:rFonts w:ascii="Aptos"/></w:rPr><w:t>Microsoft Word Producer Fixture</w:t>"#,
            1,
        );
        let part_digest = digest(document_xml.as_bytes());
        let (_, complex_style_docx) =
            build_docx_document_patch_isolated(source, &part_digest, &complex_style_xml).unwrap();
        let complex_model = parse_docx(&complex_style_docx).unwrap();
        assert!(
            !inspect_docx_editable_style_targets(&complex_style_docx, &complex_model)
                .unwrap()
                .iter()
                .any(|target| target.text == "Microsoft Word Producer Fixture")
        );

        let floating_xml = document_xml
            .replacen("<wp:inline ", "<wp:anchor ", 1)
            .replacen("</wp:inline>", "</wp:anchor>", 1);
        let (_, floating_docx) =
            build_docx_document_patch_isolated(source, &part_digest, &floating_xml).unwrap();
        let floating_model = parse_docx(&floating_docx).unwrap();
        assert!(
            inspect_docx_editable_image_targets(&floating_docx, &floating_model)
                .unwrap()
                .is_empty()
        );

        let image_run = document_xml.find("<w:r><w:rPr><w:noProof").unwrap();
        let image_paragraph = document_xml[..image_run].rfind("<w:p ").unwrap();
        let legacy_prefix = r#"<w:p><w:r><w:pict/></w:r></w:p>"#;
        let with_legacy_image = format!(
            "{}{}{}",
            &document_xml[..image_paragraph],
            legacy_prefix,
            &document_xml[image_paragraph..]
        );
        let (_, aligned_docx) =
            build_docx_document_patch_isolated(source, &part_digest, &with_legacy_image).unwrap();
        let aligned_model = parse_docx(&aligned_docx).unwrap();
        assert!(
            inspect_docx_editable_image_targets(&aligned_docx, &aligned_model)
                .unwrap()
                .iter()
                .any(|target| target.image_part == "word/media/image1.png")
        );
    }
}
