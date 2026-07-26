use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::collections::HashSet;
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub const MAX_DOCX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_DOCX_ENTRIES: usize = 10_000;
const MAX_DOCX_UNCOMPRESSED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_DOCX_XML_BYTES: u64 = 32 * 1024 * 1024;
const MAX_DOCX_BLOCKS: usize = 50_000;
const MAX_DOCX_TEXT_CHARS: usize = 2_000_000;
const MAX_DOCX_TABLE_CELLS: usize = 100_000;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxTableRow {
    pub cells: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxBlock {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub level: Option<u8>,
    pub list_level: Option<u8>,
    pub rows: Vec<DocxTableRow>,
    pub image_count: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxHeading {
    pub block_id: String,
    pub text: String,
    pub level: u8,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxCompatibilityProfile {
    pub producer: Option<String>,
    pub application: Option<String>,
    pub paragraph_count: usize,
    pub heading_count: usize,
    pub list_item_count: usize,
    pub table_count: usize,
    pub image_count: usize,
    pub header_count: usize,
    pub footer_count: usize,
    pub footnotes: bool,
    pub endnotes: bool,
    pub comments: bool,
    pub tracked_changes: bool,
    pub fields: bool,
    pub content_controls: bool,
    pub equations: bool,
    pub embedded_objects: bool,
    pub alt_chunks: bool,
    pub unknown_word_parts: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxDocumentModel {
    pub blocks: Vec<DocxBlock>,
    pub headings: Vec<DocxHeading>,
    pub plain_text: String,
    pub compatibility: DocxCompatibilityProfile,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct ParagraphState {
    text: String,
    style: Option<String>,
    list_level: Option<u8>,
    image_count: usize,
}

#[derive(Default)]
struct TableState {
    rows: Vec<DocxTableRow>,
    current_row: Vec<String>,
    current_cell: String,
    in_cell: bool,
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("DOCX XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("DOCX XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn normalized_text(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn heading_level(style: Option<&str>) -> Option<u8> {
    let style = style?.trim();
    let lower = style.to_ascii_lowercase();
    let digits = lower
        .strip_prefix("heading")
        .or_else(|| lower.strip_prefix("title"))
        .or_else(|| style.strip_prefix("标题"))
        .map(str::trim)
        .unwrap_or_default();
    digits
        .parse::<u8>()
        .ok()
        .filter(|level| (1..=9).contains(level))
}

fn read_zip_part(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    required: bool,
) -> Result<Option<Vec<u8>>, String> {
    let mut file = match archive.by_name(name) {
        Ok(file) => file,
        Err(zip::result::ZipError::FileNotFound) if !required => return Ok(None),
        Err(error) => return Err(format!("DOCX 缺少或无法读取 {name}: {error}")),
    };
    if file.size() > MAX_DOCX_XML_BYTES {
        return Err(format!("DOCX 部件 {name} 超过 32 MiB 安全上限"));
    }
    let mut bytes = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("读取 DOCX 部件 {name} 失败: {error}"))?;
    Ok(Some(bytes))
}

fn simple_property(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    part: &str,
    property: &[u8],
) -> Result<Option<String>, String> {
    let Some(bytes) = read_zip_part(archive, part, false)? else {
        return Ok(None);
    };
    let mut reader = Reader::from_reader(bytes.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 DOCX 属性 {part} 失败: {error}"))?
        {
            Event::Start(event) if event.local_name().as_ref() == property => {
                let text = reader
                    .read_text(event.name())
                    .map_err(|error| format!("读取 DOCX 属性 {part} 失败: {error}"))?
                    .xml10_content()
                    .map_err(|error| format!("解码 DOCX 属性 {part} 失败: {error}"))?
                    .into_owned();
                return Ok(Some(text));
            }
            Event::DocType(_) => return Err(format!("DOCX 属性部件 {part} 不允许 DOCTYPE")),
            Event::Eof => return Ok(None),
            _ => {}
        }
        buffer.clear();
    }
}

fn append_text(target: &mut String, value: &str) -> Result<(), String> {
    if target.chars().count().saturating_add(value.chars().count()) > MAX_DOCX_TEXT_CHARS {
        return Err("DOCX 可见文本超过 2,000,000 字符安全上限".into());
    }
    target.push_str(value);
    Ok(())
}

fn finalize_paragraph(
    paragraph: ParagraphState,
    table: &mut Option<TableState>,
    blocks: &mut Vec<DocxBlock>,
    headings: &mut Vec<DocxHeading>,
    paragraph_count: &mut usize,
    list_item_count: &mut usize,
) -> Result<(), String> {
    let text = normalized_text(&paragraph.text);
    if let Some(table) = table.as_mut() {
        if table.in_cell && !text.is_empty() {
            if !table.current_cell.is_empty() {
                table.current_cell.push('\n');
            }
            table.current_cell.push_str(&text);
        }
        return Ok(());
    }
    if text.is_empty() && paragraph.image_count == 0 {
        return Ok(());
    }
    if blocks.len() >= MAX_DOCX_BLOCKS {
        return Err("DOCX 结构超过 50,000 个可见块安全上限".into());
    }
    *paragraph_count += 1;
    let level = heading_level(paragraph.style.as_deref());
    let kind = if level.is_some() {
        "heading"
    } else if paragraph.list_level.is_some() {
        *list_item_count += 1;
        "list-item"
    } else if text.is_empty() && paragraph.image_count > 0 {
        "image"
    } else {
        "paragraph"
    };
    let id = format!("docx-block-{}", blocks.len() + 1);
    if let Some(level) = level {
        headings.push(DocxHeading {
            block_id: id.clone(),
            text: text.clone(),
            level,
        });
    }
    blocks.push(DocxBlock {
        id,
        kind: kind.into(),
        text,
        level,
        list_level: paragraph.list_level,
        rows: Vec::new(),
        image_count: paragraph.image_count,
    });
    Ok(())
}

pub fn parse_docx(source: &[u8]) -> Result<DocxDocumentModel, String> {
    if source.len() as u64 > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 读取上限".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("DOCX ZIP 包损坏: {error}"))?;
    if archive.len() > MAX_DOCX_ENTRIES {
        return Err("DOCX ZIP 条目超过 10,000 个安全上限".into());
    }
    let mut names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 DOCX ZIP 条目失败: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .ok_or("DOCX ZIP 包含不安全路径")?
            .to_string_lossy()
            .replace('\\', "/");
        if !names.insert(enclosed) {
            return Err("DOCX ZIP 包含重复条目".into());
        }
        total_uncompressed = total_uncompressed.saturating_add(file.size());
        if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES {
            return Err("DOCX 解压后总量超过 256 MiB 安全上限".into());
        }
    }
    if !names.contains("[Content_Types].xml") || !names.contains("word/document.xml") {
        return Err("文件不是完整的 DOCX OOXML 包".into());
    }

    let producer = simple_property(&mut archive, "docProps/core.xml", b"creator")?;
    let application = simple_property(&mut archive, "docProps/app.xml", b"Application")?;
    let document_xml =
        read_zip_part(&mut archive, "word/document.xml", true)?.ok_or("DOCX 主文档部件缺失")?;

    let mut reader = Reader::from_reader(document_xml.as_slice());
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut paragraph: Option<ParagraphState> = None;
    let mut table: Option<TableState> = None;
    let mut in_text = false;
    let mut blocks = Vec::new();
    let mut headings = Vec::new();
    let mut paragraph_count = 0;
    let mut list_item_count = 0;
    let mut table_count = 0;
    let mut table_cells = 0;
    let mut tracked_changes = false;
    let mut fields = false;
    let mut content_controls = false;
    let mut equations = false;
    let mut embedded_objects = false;
    let mut alt_chunks = false;

    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX 主文档 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"p" => paragraph = Some(ParagraphState::default()),
                b"t" => in_text = true,
                b"pStyle" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.style = attribute_value(event, b"val", reader.decoder())?;
                    }
                }
                b"ilvl" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.list_level = attribute_value(event, b"val", reader.decoder())?
                            .and_then(|value| value.parse::<u8>().ok());
                    }
                }
                b"drawing" | b"pict" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.image_count += 1;
                    }
                }
                b"tbl" => table = Some(TableState::default()),
                b"tr" => {
                    if let Some(table) = table.as_mut() {
                        table.current_row.clear();
                    }
                }
                b"tc" => {
                    if let Some(table) = table.as_mut() {
                        table.current_cell.clear();
                        table.in_cell = true;
                    }
                }
                b"ins" | b"del" | b"moveFrom" | b"moveTo" => tracked_changes = true,
                b"fldChar" | b"instrText" | b"fldSimple" => fields = true,
                b"sdt" => content_controls = true,
                b"oMath" | b"oMathPara" => equations = true,
                b"object" | b"oleObject" => embedded_objects = true,
                b"altChunk" => alt_chunks = true,
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"pStyle" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.style = attribute_value(event, b"val", reader.decoder())?;
                    }
                }
                b"ilvl" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.list_level = attribute_value(event, b"val", reader.decoder())?
                            .and_then(|value| value.parse::<u8>().ok());
                    }
                }
                b"drawing" | b"pict" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.image_count += 1;
                    }
                }
                b"tab" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        append_text(&mut paragraph.text, "\t")?;
                    }
                }
                b"br" | b"cr" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        append_text(&mut paragraph.text, "\n")?;
                    }
                }
                b"ins" | b"del" | b"moveFrom" | b"moveTo" => tracked_changes = true,
                b"fldChar" | b"instrText" | b"fldSimple" => fields = true,
                b"sdt" => content_controls = true,
                b"oMath" | b"oMathPara" => equations = true,
                b"object" | b"oleObject" => embedded_objects = true,
                b"altChunk" => alt_chunks = true,
                _ => {}
            },
            Event::Text(text) if in_text => {
                let value = text
                    .xml10_content()
                    .map_err(|error| format!("DOCX 文本解码失败: {error}"))?;
                if let Some(paragraph) = paragraph.as_mut() {
                    append_text(&mut paragraph.text, &value)?;
                }
            }
            Event::End(event) => match event.local_name().as_ref() {
                b"t" => in_text = false,
                b"p" => {
                    if let Some(paragraph) = paragraph.take() {
                        finalize_paragraph(
                            paragraph,
                            &mut table,
                            &mut blocks,
                            &mut headings,
                            &mut paragraph_count,
                            &mut list_item_count,
                        )?;
                    }
                }
                b"tc" => {
                    if let Some(table) = table.as_mut() {
                        table.current_row.push(normalized_text(&table.current_cell));
                        table.current_cell.clear();
                        table.in_cell = false;
                        table_cells += 1;
                        if table_cells > MAX_DOCX_TABLE_CELLS {
                            return Err("DOCX 表格超过 100,000 个单元格安全上限".into());
                        }
                    }
                }
                b"tr" => {
                    if let Some(table) = table.as_mut() {
                        if !table.current_row.is_empty() {
                            table.rows.push(DocxTableRow {
                                cells: std::mem::take(&mut table.current_row),
                            });
                        }
                    }
                }
                b"tbl" => {
                    if let Some(table) = table.take() {
                        if blocks.len() >= MAX_DOCX_BLOCKS {
                            return Err("DOCX 结构超过 50,000 个可见块安全上限".into());
                        }
                        table_count += 1;
                        blocks.push(DocxBlock {
                            id: format!("docx-block-{}", blocks.len() + 1),
                            kind: "table".into(),
                            text: table
                                .rows
                                .iter()
                                .flat_map(|row| row.cells.iter())
                                .cloned()
                                .collect::<Vec<_>>()
                                .join(" "),
                            level: None,
                            list_level: None,
                            rows: table.rows,
                            image_count: 0,
                        });
                    }
                }
                _ => {}
            },
            Event::DocType(_) => return Err("DOCX XML 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let image_count = names
        .iter()
        .filter(|name| name.starts_with("word/media/") && !name.ends_with('/'))
        .count();
    let known_word_roots = [
        "word/document.xml",
        "word/styles.xml",
        "word/settings.xml",
        "word/fontTable.xml",
        "word/numbering.xml",
        "word/comments.xml",
        "word/footnotes.xml",
        "word/endnotes.xml",
        "word/webSettings.xml",
        "word/theme/",
        "word/media/",
        "word/header",
        "word/footer",
        "word/_rels/",
        "word/embeddings/",
    ];
    let mut unknown_word_parts = names
        .iter()
        .filter(|name| {
            name.starts_with("word/")
                && !known_word_roots.iter().any(|known| name.starts_with(known))
        })
        .cloned()
        .collect::<Vec<_>>();
    unknown_word_parts.sort();
    unknown_word_parts.truncate(32);

    let compatibility = DocxCompatibilityProfile {
        producer,
        application,
        paragraph_count,
        heading_count: headings.len(),
        list_item_count,
        table_count,
        image_count,
        header_count: names
            .iter()
            .filter(|name| name.starts_with("word/header") && name.ends_with(".xml"))
            .count(),
        footer_count: names
            .iter()
            .filter(|name| name.starts_with("word/footer") && name.ends_with(".xml"))
            .count(),
        footnotes: names.contains("word/footnotes.xml"),
        endnotes: names.contains("word/endnotes.xml"),
        comments: names.contains("word/comments.xml"),
        tracked_changes,
        fields,
        content_controls,
        equations,
        embedded_objects,
        alt_chunks,
        unknown_word_parts,
    };
    let mut warnings = Vec::new();
    if compatibility.tracked_changes {
        warnings.push("检测到修订记录；当前仅按可见文本只读展示".into());
    }
    if compatibility.fields {
        warnings.push("检测到域代码；当前仅展示已有结果，不计算或写回域".into());
    }
    if compatibility.comments {
        warnings.push("检测到批注；批注内容和锚点尚未进入首批阅读模型".into());
    }
    if compatibility.content_controls
        || compatibility.embedded_objects
        || compatibility.alt_chunks
        || !compatibility.unknown_word_parts.is_empty()
    {
        warnings.push("检测到未进入首批模型的高级对象；文档保持只读".into());
    }
    let plain_text = blocks
        .iter()
        .map(|block| block.text.as_str())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(DocxDocumentModel {
        blocks,
        headings,
        plain_text,
        compatibility,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    fn fixture(document: &str, extras: &[(&str, &str)]) -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut output);
            let options =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            for (name, content) in [
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
                ),
                ("word/document.xml", document),
                (
                    "docProps/core.xml",
                    r#"<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Fixture Producer</dc:creator></cp:coreProperties>"#,
                ),
                (
                    "docProps/app.xml",
                    r#"<?xml version="1.0"?><Properties><Application>Fixture Office</Application></Properties>"#,
                ),
            ]
            .into_iter()
            .chain(extras.iter().copied())
            {
                zip.start_file(name, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        output.into_inner()
    }

    #[test]
    fn parses_headings_paragraphs_lists_tables_images_and_breaks() {
        let source = fixture(
            r#"<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r"><w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Title</w:t></w:r></w:p>
            <w:p><w:r><w:t xml:space="preserve">First </w:t><w:tab/><w:t>paragraph</w:t><w:br/><w:t>line</w:t></w:r></w:p>
            <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item</w:t></w:r></w:p>
            <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
            <w:p><w:r><w:drawing/><w:t>Diagram</w:t></w:r></w:p>
            </w:body></w:document>"#,
            &[("word/media/image1.png", "image")],
        );
        let model = parse_docx(&source).unwrap();
        assert_eq!(model.headings[0].text, "Project Title");
        assert_eq!(model.headings[0].level, 1);
        assert!(model
            .blocks
            .iter()
            .any(|block| block.kind == "list-item" && block.list_level == Some(1)));
        let table = model
            .blocks
            .iter()
            .find(|block| block.kind == "table")
            .unwrap();
        assert_eq!(table.rows[0].cells, ["A1", "B1"]);
        assert_eq!(model.compatibility.table_count, 1);
        assert_eq!(model.compatibility.image_count, 1);
        assert!(model.plain_text.contains("First paragraph line"));
    }

    #[test]
    fn reports_advanced_read_only_features_without_dropping_visible_text() {
        let source = fixture(
            r#"<?xml version="1.0"?><w:document xmlns:w="w" xmlns:m="m"><w:body>
            <w:sdt><w:sdtContent><w:p><w:ins><w:r><w:t>Tracked visible text</w:t></w:r></w:ins><w:fldSimple w:instr="DATE"/></w:p></w:sdtContent></w:sdt>
            <w:p><m:oMath/><w:object/><w:altChunk/></w:p>
            </w:body></w:document>"#,
            &[
                ("word/comments.xml", "<comments/>"),
                ("word/header1.xml", "<hdr/>"),
                ("word/footer1.xml", "<ftr/>"),
                ("word/customUnknown.xml", "<unknown/>"),
            ],
        );
        let model = parse_docx(&source).unwrap();
        assert!(model.plain_text.contains("Tracked visible text"));
        assert!(model.compatibility.tracked_changes);
        assert!(model.compatibility.fields);
        assert!(model.compatibility.comments);
        assert!(model.compatibility.content_controls);
        assert!(model.compatibility.equations);
        assert!(model.compatibility.embedded_objects);
        assert!(model.compatibility.alt_chunks);
        assert_eq!(model.compatibility.header_count, 1);
        assert_eq!(model.compatibility.footer_count, 1);
        assert_eq!(
            model.compatibility.unknown_word_parts,
            ["word/customUnknown.xml"]
        );
        assert!(!model.warnings.is_empty());
    }

    #[test]
    fn rejects_non_docx_doctype_and_unsafe_package_shape() {
        assert!(parse_docx(b"not a zip").unwrap_err().contains("ZIP"));
        let missing = fixture("<root/>", &[]);
        let mut archive = ZipArchive::new(Cursor::new(&missing)).unwrap();
        assert!(archive.by_name("word/document.xml").is_ok());
        let doctype = fixture(
            r#"<!DOCTYPE x [<!ENTITY y "boom">]><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>&y;</w:t></w:r></w:p></w:body></w:document>"#,
            &[],
        );
        assert!(parse_docx(&doctype).unwrap_err().contains("DOCTYPE"));
    }
}
