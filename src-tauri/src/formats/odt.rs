use crate::formats::odf::{inspect_odf_package, OdfPackageReport, MAX_ODF_FILE_BYTES};
use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::io::{Cursor, Read};
use zip::ZipArchive;

const MAX_ODT_BLOCKS: usize = 50_000;
const MAX_ODT_TEXT_CHARS: usize = 8_000_000;
const MAX_ODT_TABLE_CELLS: usize = 100_000;
const MAX_ODT_TABLE_ROWS: usize = 50_000;
const MAX_ODT_REPEAT: usize = 1_024;
const MAX_ODT_IMAGE_REFS: usize = 256;
const MAX_ODT_XML_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdtTableCell {
    pub text: String,
    pub column_span: usize,
    pub row_span: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdtDocumentBlock {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub level: Option<u8>,
    pub list_level: Option<usize>,
    pub rows: Vec<Vec<OdtTableCell>>,
    pub image_parts: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdtHeading {
    pub id: String,
    pub text: String,
    pub level: u8,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdtDocumentModel {
    pub blocks: Vec<OdtDocumentBlock>,
    pub headings: Vec<OdtHeading>,
    pub plain_text: String,
    pub title: Option<String>,
    pub creator: Option<String>,
    pub generator: Option<String>,
    pub package: OdfPackageReport,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct TextDraft {
    kind: String,
    text: String,
    level: Option<u8>,
    list_level: Option<usize>,
    image_parts: Vec<String>,
}

#[derive(Default)]
struct TableDraft {
    rows: Vec<Vec<OdtTableCell>>,
    current_row: Vec<OdtTableCell>,
    current_row_repeat: usize,
    current_cell: Option<OdtTableCell>,
    current_cell_repeat: usize,
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODT XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("ODT XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn parse_bounded_repeat(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<usize, String> {
    let value = attribute_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "ODT 重复计数不是有效整数".to_string())
        })
        .transpose()?
        .unwrap_or(1);
    if value == 0 || value > MAX_ODT_REPEAT {
        return Err(format!("ODT 重复计数必须位于 1..={MAX_ODT_REPEAT}"));
    }
    Ok(value)
}

fn validate_reference(reference: &BytesRef<'_>) -> Result<String, String> {
    if let Some(value) = reference
        .resolve_char_ref()
        .map_err(|error| format!("ODT XML 字符引用损坏: {error}"))?
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
        _ => Err("ODT XML 包含未声明的实体引用".into()),
    }
}

fn append_text(target: &mut String, value: &str, total: &mut usize) -> Result<(), String> {
    *total = total.saturating_add(value.chars().count());
    if *total > MAX_ODT_TEXT_CHARS {
        return Err("ODT 文本字符数超过安全上限".into());
    }
    target.push_str(value);
    Ok(())
}

fn normalize_internal_image(href: &str) -> Option<String> {
    let value = href.trim().trim_start_matches("./");
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("file:")
        || lower.starts_with("data:")
    {
        return None;
    }
    Some(value.to_string())
}

fn push_block(
    blocks: &mut Vec<OdtDocumentBlock>,
    headings: &mut Vec<OdtHeading>,
    mut draft: TextDraft,
) -> Result<(), String> {
    draft.text = draft.text.trim().to_string();
    if draft.text.is_empty() && draft.image_parts.is_empty() {
        return Ok(());
    }
    if blocks.len() >= MAX_ODT_BLOCKS {
        return Err("ODT 结构块数量超过安全上限".into());
    }
    let id = format!("odt-block-{}", blocks.len() + 1);
    if draft.kind == "heading" {
        headings.push(OdtHeading {
            id: id.clone(),
            text: draft.text.clone(),
            level: draft.level.unwrap_or(1),
        });
    }
    blocks.push(OdtDocumentBlock {
        id,
        kind: draft.kind,
        text: draft.text,
        level: draft.level,
        list_level: draft.list_level,
        rows: Vec::new(),
        image_parts: draft.image_parts,
    });
    Ok(())
}

fn read_zip_part(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    required: bool,
) -> Result<Option<Vec<u8>>, String> {
    let Ok(mut entry) = archive.by_name(name) else {
        return if required {
            Err(format!("ODT 缺少 {name}"))
        } else {
            Ok(None)
        };
    };
    if entry.size() > MAX_ODT_XML_BYTES {
        return Err(format!("ODT 部件 {name} 超过 16 MiB 读取上限"));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取 ODT 部件 {name} 失败: {error}"))?;
    Ok(Some(bytes))
}

fn simple_meta_property(xml: Option<&[u8]>, property: &[u8]) -> Result<Option<String>, String> {
    let Some(xml) = xml else {
        return Ok(None);
    };
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut active = false;
    let mut value = String::new();
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODT meta.xml 损坏: {error}"))?
        {
            Event::Start(event) if event.local_name().as_ref() == property => active = true,
            Event::Text(text) if active => value.push_str(
                &text
                    .xml10_content()
                    .map_err(|error| format!("ODT 元数据文本损坏: {error}"))?,
            ),
            Event::GeneralRef(reference) if active => {
                value.push_str(&validate_reference(&reference)?)
            }
            Event::End(event) if event.local_name().as_ref() == property => break,
            Event::DocType(_) => return Err("ODT meta.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    let value = value.trim();
    Ok((!value.is_empty()).then(|| value.to_string()))
}

fn parse_content(xml: &[u8]) -> Result<(Vec<OdtDocumentBlock>, Vec<OdtHeading>), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut blocks = Vec::new();
    let mut headings = Vec::new();
    let mut draft: Option<TextDraft> = None;
    let mut table: Option<TableDraft> = None;
    let mut list_depth = 0_usize;
    let mut total_chars = 0_usize;
    let mut table_cells = 0_usize;
    let mut image_refs = 0_usize;
    let mut binary_data_depth = 0_usize;

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("ODT content.xml 损坏: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"list" => list_depth = list_depth.saturating_add(1),
                b"binary-data" => binary_data_depth = binary_data_depth.saturating_add(1),
                b"h" | b"p" if draft.is_none() => {
                    let heading = event.local_name().as_ref() == b"h";
                    draft = Some(TextDraft {
                        kind: if heading {
                            "heading".into()
                        } else if list_depth > 0 {
                            "list-item".into()
                        } else {
                            "paragraph".into()
                        },
                        level: if heading {
                            Some(
                                attribute_value(event, b"outline-level", reader.decoder())?
                                    .and_then(|value| value.parse::<u8>().ok())
                                    .unwrap_or(1)
                                    .clamp(1, 10),
                            )
                        } else {
                            None
                        },
                        list_level: (list_depth > 0).then_some(list_depth),
                        ..TextDraft::default()
                    });
                }
                b"table" if table.is_none() => table = Some(TableDraft::default()),
                b"table-row" => {
                    if let Some(table) = table.as_mut() {
                        table.current_row.clear();
                        table.current_row_repeat =
                            parse_bounded_repeat(event, b"number-rows-repeated", reader.decoder())?;
                    }
                }
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(table) = table.as_mut() {
                        table.current_cell_repeat = parse_bounded_repeat(
                            event,
                            b"number-columns-repeated",
                            reader.decoder(),
                        )?;
                        table.current_cell = Some(OdtTableCell {
                            text: String::new(),
                            column_span: attribute_value(
                                event,
                                b"number-columns-spanned",
                                reader.decoder(),
                            )?
                            .and_then(|value| value.parse().ok())
                            .unwrap_or(1)
                            .clamp(1, 256),
                            row_span: attribute_value(
                                event,
                                b"number-rows-spanned",
                                reader.decoder(),
                            )?
                            .and_then(|value| value.parse().ok())
                            .unwrap_or(1)
                            .clamp(1, 256),
                        });
                    }
                }
                b"image" => {
                    if let Some(href) = attribute_value(event, b"href", reader.decoder())?
                        .and_then(|value| normalize_internal_image(&value))
                    {
                        image_refs += 1;
                        if image_refs > MAX_ODT_IMAGE_REFS {
                            return Err("ODT 图片引用数量超过安全上限".into());
                        }
                        if let Some(draft) = draft.as_mut() {
                            if !draft.image_parts.contains(&href) {
                                draft.image_parts.push(href);
                            }
                        }
                    }
                }
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"s" => {
                    let count = parse_bounded_repeat(event, b"c", reader.decoder())?;
                    if let Some(draft) = draft.as_mut() {
                        append_text(&mut draft.text, &" ".repeat(count), &mut total_chars)?;
                    }
                }
                b"tab" => {
                    if let Some(draft) = draft.as_mut() {
                        append_text(&mut draft.text, "\t", &mut total_chars)?;
                    }
                }
                b"line-break" => {
                    if let Some(draft) = draft.as_mut() {
                        append_text(&mut draft.text, "\n", &mut total_chars)?;
                    }
                }
                b"image" => {
                    if let Some(href) = attribute_value(event, b"href", reader.decoder())?
                        .and_then(|value| normalize_internal_image(&value))
                    {
                        image_refs += 1;
                        if image_refs > MAX_ODT_IMAGE_REFS {
                            return Err("ODT 图片引用数量超过安全上限".into());
                        }
                        if let Some(draft) = draft.as_mut() {
                            if !draft.image_parts.contains(&href) {
                                draft.image_parts.push(href);
                            }
                        }
                    }
                }
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(table) = table.as_mut() {
                        let repeat = parse_bounded_repeat(
                            event,
                            b"number-columns-repeated",
                            reader.decoder(),
                        )?;
                        table_cells = table_cells.saturating_add(repeat);
                        if table_cells > MAX_ODT_TABLE_CELLS {
                            return Err("ODT 表格单元格数量超过安全上限".into());
                        }
                        table.current_row.extend(std::iter::repeat_n(
                            OdtTableCell {
                                text: String::new(),
                                column_span: 1,
                                row_span: 1,
                            },
                            repeat,
                        ));
                    }
                }
                _ => {}
            },
            Event::Text(text) if draft.is_some() && binary_data_depth == 0 => {
                let value = text
                    .xml10_content()
                    .map_err(|error| format!("ODT 正文文本损坏: {error}"))?;
                append_text(&mut draft.as_mut().unwrap().text, &value, &mut total_chars)?;
            }
            Event::GeneralRef(reference) if draft.is_some() && binary_data_depth == 0 => {
                let value = validate_reference(&reference)?;
                append_text(&mut draft.as_mut().unwrap().text, &value, &mut total_chars)?;
            }
            Event::End(event) => match event.local_name().as_ref() {
                b"h" | b"p" => {
                    if let Some(completed) = draft.take() {
                        if let Some(cell) =
                            table.as_mut().and_then(|table| table.current_cell.as_mut())
                        {
                            if !cell.text.is_empty() && !completed.text.trim().is_empty() {
                                cell.text.push('\n');
                            }
                            cell.text.push_str(completed.text.trim());
                        } else {
                            push_block(&mut blocks, &mut headings, completed)?;
                        }
                    }
                }
                b"table-cell" | b"covered-table-cell" => {
                    if let Some(table) = table.as_mut() {
                        if let Some(cell) = table.current_cell.take() {
                            let repeat = table.current_cell_repeat.max(1);
                            table_cells = table_cells.saturating_add(repeat);
                            if table_cells > MAX_ODT_TABLE_CELLS {
                                return Err("ODT 表格单元格数量超过安全上限".into());
                            }
                            table.current_row.extend(std::iter::repeat_n(cell, repeat));
                        }
                    }
                }
                b"table-row" => {
                    if let Some(table) = table.as_mut() {
                        let row = std::mem::take(&mut table.current_row);
                        let repeat = table.current_row_repeat.max(1);
                        table_cells = table_cells
                            .saturating_add(row.len().saturating_mul(repeat.saturating_sub(1)));
                        if table_cells > MAX_ODT_TABLE_CELLS {
                            return Err("ODT 表格单元格数量超过安全上限".into());
                        }
                        if table.rows.len().saturating_add(repeat) > MAX_ODT_TABLE_ROWS {
                            return Err("ODT 表格行数量超过安全上限".into());
                        }
                        table.rows.extend(std::iter::repeat_n(row, repeat));
                    }
                }
                b"table" => {
                    if let Some(table) = table.take() {
                        if blocks.len() >= MAX_ODT_BLOCKS {
                            return Err("ODT 结构块数量超过安全上限".into());
                        }
                        let text = table
                            .rows
                            .iter()
                            .flat_map(|row| row.iter())
                            .map(|cell| cell.text.trim())
                            .filter(|value| !value.is_empty())
                            .collect::<Vec<_>>()
                            .join(" ");
                        let id = format!("odt-block-{}", blocks.len() + 1);
                        blocks.push(OdtDocumentBlock {
                            id,
                            kind: "table".into(),
                            text,
                            level: None,
                            list_level: None,
                            rows: table.rows,
                            image_parts: Vec::new(),
                        });
                    }
                }
                b"binary-data" => binary_data_depth = binary_data_depth.saturating_sub(1),
                b"list" => list_depth = list_depth.saturating_sub(1),
                _ => {}
            },
            Event::DocType(_) => return Err("ODT content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok((blocks, headings))
}

pub fn parse_odt(source: &[u8]) -> Result<OdtDocumentModel, String> {
    if source.len() as u64 > MAX_ODF_FILE_BYTES {
        return Err("ODT 文件超过 64 MiB 读取上限".into());
    }
    let package = inspect_odf_package(source, ".odt")?;
    if package
        .risks
        .risk_codes
        .iter()
        .any(|risk| risk == "encrypted-content")
    {
        return Err("ODT 正文已加密，当前只读解析器不会请求或缓存密码".into());
    }
    let warnings = package
        .risks
        .risk_codes
        .iter()
        .map(|risk| format!("已忽略 ODT 风险内容：{risk}"))
        .collect::<Vec<_>>();
    let mut archive =
        ZipArchive::new(Cursor::new(source)).map_err(|error| format!("打开 ODT 失败: {error}"))?;
    let content = read_zip_part(&mut archive, "content.xml", true)?.unwrap();
    let meta = read_zip_part(&mut archive, "meta.xml", false)?;
    let (blocks, headings) = parse_content(&content)?;
    let plain_text = blocks
        .iter()
        .map(|block| block.text.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(OdtDocumentModel {
        blocks,
        headings,
        plain_text,
        title: simple_meta_property(meta.as_deref(), b"title")?,
        creator: simple_meta_property(meta.as_deref(), b"creator")?,
        generator: simple_meta_property(meta.as_deref(), b"generator")?,
        package,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    fn fixture(content: &str, meta: Option<&str>) -> Vec<u8> {
        let manifest = r#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#;
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file(
                "mimetype",
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .unwrap();
        writer
            .write_all(b"application/vnd.oasis.opendocument.text")
            .unwrap();
        for (name, value) in [
            ("META-INF/manifest.xml", manifest),
            ("content.xml", content),
            ("meta.xml", meta.unwrap_or("<office:document-meta/>")),
        ] {
            writer
                .start_file(
                    name,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(value.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn parses_headings_lists_tables_images_and_metadata() {
        let content = r#"<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink">
<office:body><office:text>
<text:h text:outline-level="2">Audit heading</text:h>
<text:p>Paragraph<text:s text:c="2"/>body<text:tab/>tail</text:p>
<text:list><text:list-item><text:p>List item</text:p></text:list-item></text:list>
<table:table><table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>A1</text:p></table:table-cell><table:table-cell table:number-columns-spanned="2"><text:p>B1</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/></table:table-row></table:table>
<text:p>Image<draw:image xlink:href="Pictures/a.png"><office:binary-data>SHOULD_NOT_BE_INDEXED</office:binary-data></draw:image></text:p>
</office:text></office:body></office:document-content>"#;
        let meta = r#"<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"><office:meta><dc:title>E1B fixture</dc:title><dc:creator>LongEdit</dc:creator><meta:generator>Test</meta:generator></office:meta></office:document-meta>"#;
        let model = parse_odt(&fixture(content, Some(meta))).unwrap();
        assert_eq!(model.blocks.len(), 5);
        assert_eq!(model.headings[0].level, 2);
        assert_eq!(model.blocks[2].kind, "list-item");
        assert_eq!(model.blocks[3].rows[0][1].column_span, 2);
        assert_eq!(model.blocks[3].rows.len(), 2);
        assert_eq!(model.blocks[3].rows[0].len(), 4);
        assert_eq!(model.blocks[4].image_parts, ["Pictures/a.png"]);
        assert!(!model.plain_text.contains("SHOULD_NOT_BE_INDEXED"));
        assert_eq!(model.title.as_deref(), Some("E1B fixture"));
        assert!(model.plain_text.contains("List item"));
    }

    #[test]
    fn ignores_external_images_and_rejects_repeat_bombs() {
        let external = r#"<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"><office:body><office:text><text:p>Safe<draw:image xlink:href="https://example.com/a.png"/></text:p></office:text></office:body></office:document-content>"#;
        let model = parse_odt(&fixture(external, None)).unwrap();
        assert!(model.blocks[0].image_parts.is_empty());

        let bomb = r#"<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>x<text:s text:c="999999"/></text:p></office:text></office:body></office:document-content>"#;
        assert!(parse_odt(&fixture(bomb, None))
            .unwrap_err()
            .contains("重复计数"));
    }

    #[test]
    fn parses_real_libreoffice_producer_fixture() {
        let model = parse_odt(include_bytes!(
            "../../../fixtures/odt/producers/libreoffice-writer.odt"
        ))
        .unwrap();
        assert!(model
            .plain_text
            .contains("LibreOffice Writer Producer Fixture"));
        assert!(!model.headings.is_empty());
        assert!(model.blocks.iter().any(|block| block.kind == "table"));
        assert!(model
            .blocks
            .iter()
            .any(|block| !block.image_parts.is_empty()));
        assert!(model
            .generator
            .as_deref()
            .is_some_and(|value| value.contains("LibreOffice")));
    }
}
