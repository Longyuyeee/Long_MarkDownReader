use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
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
    pub list_kind: Option<String>,
    pub style_id: Option<String>,
    pub rows: Vec<DocxTableRow>,
    pub image_count: usize,
    pub image_parts: Vec<String>,
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
    pub renderable_image_count: usize,
    pub style_count: usize,
    pub numbering_definition_count: usize,
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
    num_id: Option<String>,
    image_count: usize,
    image_parts: Vec<String>,
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
    if lower == "title" || style == "标题" {
        return Some(1);
    }
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

#[derive(Default)]
struct DocxStyleInfo {
    name: Option<String>,
    based_on: Option<String>,
    outline_level: Option<u8>,
}

fn parse_styles(bytes: Option<&[u8]>) -> Result<HashMap<String, DocxStyleInfo>, String> {
    let Some(bytes) = bytes else {
        return Ok(HashMap::new());
    };
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut styles = HashMap::new();
    let mut current: Option<(String, DocxStyleInfo)> = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX styles.xml 损坏: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"style" => {
                let style_type = attribute_value(event, b"type", reader.decoder())?;
                let style_id = attribute_value(event, b"styleId", reader.decoder())?;
                current = if style_type.as_deref() == Some("paragraph") {
                    style_id.map(|id| (id, DocxStyleInfo::default()))
                } else {
                    None
                };
            }
            Event::Start(ref event) | Event::Empty(ref event) => {
                if let Some((_, info)) = current.as_mut() {
                    match event.local_name().as_ref() {
                        b"name" => info.name = attribute_value(event, b"val", reader.decoder())?,
                        b"basedOn" => {
                            info.based_on = attribute_value(event, b"val", reader.decoder())?
                        }
                        b"outlineLvl" => {
                            info.outline_level = attribute_value(event, b"val", reader.decoder())?
                                .and_then(|value| value.parse::<u8>().ok())
                                .filter(|level| *level < 9)
                                .map(|level| level + 1);
                        }
                        _ => {}
                    }
                }
            }
            Event::End(event) if event.local_name().as_ref() == b"style" => {
                if let Some((id, info)) = current.take() {
                    styles.insert(id, info);
                }
            }
            Event::DocType(_) => return Err("DOCX styles.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(styles)
}

fn resolved_heading_level(
    style_id: Option<&str>,
    styles: &HashMap<String, DocxStyleInfo>,
) -> Option<u8> {
    let mut current = style_id?;
    let mut visited = HashSet::new();
    for _ in 0..16 {
        if !visited.insert(current.to_string()) {
            return None;
        }
        if let Some(level) = heading_level(Some(current)) {
            return Some(level);
        }
        let Some(style) = styles.get(current) else {
            return None;
        };
        if let Some(level) = style.outline_level {
            return Some(level);
        }
        if let Some(level) = heading_level(style.name.as_deref()) {
            return Some(level);
        }
        let Some(parent) = style.based_on.as_deref() else {
            return None;
        };
        current = parent;
    }
    None
}

fn parse_numbering(bytes: Option<&[u8]>) -> Result<HashMap<(String, u8), String>, String> {
    let Some(bytes) = bytes else {
        return Ok(HashMap::new());
    };
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut current_abstract: Option<String> = None;
    let mut current_level: Option<u8> = None;
    let mut abstract_levels: HashMap<(String, u8), String> = HashMap::new();
    let mut current_num: Option<String> = None;
    let mut num_to_abstract = HashMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX numbering.xml 损坏: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event) => {
                match event.local_name().as_ref() {
                    b"abstractNum" => {
                        current_abstract =
                            attribute_value(event, b"abstractNumId", reader.decoder())?
                    }
                    b"lvl" => {
                        current_level = attribute_value(event, b"ilvl", reader.decoder())?
                            .and_then(|value| value.parse::<u8>().ok());
                    }
                    b"numFmt" => {
                        if let (Some(abstract_id), Some(level), Some(format)) = (
                            current_abstract.as_ref(),
                            current_level,
                            attribute_value(event, b"val", reader.decoder())?,
                        ) {
                            let kind = if format.eq_ignore_ascii_case("bullet") {
                                "bullet"
                            } else {
                                "ordered"
                            };
                            abstract_levels.insert((abstract_id.clone(), level), kind.to_string());
                        }
                    }
                    b"num" => current_num = attribute_value(event, b"numId", reader.decoder())?,
                    b"abstractNumId" => {
                        if let (Some(num_id), Some(abstract_id)) = (
                            current_num.as_ref(),
                            attribute_value(event, b"val", reader.decoder())?,
                        ) {
                            num_to_abstract.insert(num_id.clone(), abstract_id);
                        }
                    }
                    _ => {}
                }
            }
            Event::End(event) => match event.local_name().as_ref() {
                b"abstractNum" => current_abstract = None,
                b"lvl" => current_level = None,
                b"num" => current_num = None,
                _ => {}
            },
            Event::DocType(_) => return Err("DOCX numbering.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let mut numbering = HashMap::new();
    for (num_id, abstract_id) in num_to_abstract {
        for ((candidate, level), kind) in &abstract_levels {
            if candidate == &abstract_id {
                numbering.insert((num_id.clone(), *level), kind.clone());
            }
        }
    }
    Ok(numbering)
}

fn resolve_document_relationship_target(target: &str) -> Option<String> {
    let target = target.replace('\\', "/");
    let mut segments = if target.starts_with('/') {
        Vec::new()
    } else {
        vec!["word".to_string()]
    };
    for segment in target.trim_start_matches('/').split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.len() <= 1 {
                    return None;
                }
                segments.pop();
            }
            value => segments.push(value.to_string()),
        }
    }
    let resolved = segments.join("/");
    if resolved.starts_with("word/media/") {
        Some(resolved)
    } else {
        None
    }
}

fn parse_document_relationships(bytes: Option<&[u8]>) -> Result<HashMap<String, String>, String> {
    let Some(bytes) = bytes else {
        return Ok(HashMap::new());
    };
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut relationships = HashMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX document.xml.rels 损坏: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"Relationship" =>
            {
                let external = attribute_value(event, b"TargetMode", reader.decoder())?
                    .is_some_and(|mode| mode.eq_ignore_ascii_case("external"));
                if !external {
                    if let (Some(id), Some(target)) = (
                        attribute_value(event, b"Id", reader.decoder())?,
                        attribute_value(event, b"Target", reader.decoder())?,
                    ) {
                        if let Some(target) = resolve_document_relationship_target(&target) {
                            relationships.insert(id, target);
                        }
                    }
                }
            }
            Event::DocType(_) => return Err("DOCX document.xml.rels 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(relationships)
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

fn capture_image_part(
    paragraph: &mut Option<ParagraphState>,
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    relationships: &HashMap<String, String>,
) -> Result<(), String> {
    let Some(paragraph) = paragraph.as_mut() else {
        return Ok(());
    };
    let relationship_id =
        attribute_value(event, b"embed", decoder)?.or(attribute_value(event, b"id", decoder)?);
    if let Some(part) = relationship_id.and_then(|id| relationships.get(&id).cloned()) {
        if !paragraph.image_parts.contains(&part) {
            paragraph.image_parts.push(part);
        }
    }
    Ok(())
}

fn finalize_paragraph(
    paragraph: ParagraphState,
    table: &mut Option<TableState>,
    blocks: &mut Vec<DocxBlock>,
    headings: &mut Vec<DocxHeading>,
    paragraph_count: &mut usize,
    list_item_count: &mut usize,
    styles: &HashMap<String, DocxStyleInfo>,
    numbering: &HashMap<(String, u8), String>,
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
    let level = resolved_heading_level(paragraph.style.as_deref(), styles);
    let list_kind = paragraph
        .num_id
        .as_ref()
        .zip(paragraph.list_level)
        .and_then(|(num_id, list_level)| numbering.get(&(num_id.clone(), list_level)))
        .cloned()
        .or_else(|| paragraph.list_level.map(|_| "bullet".to_string()));
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
        list_kind,
        style_id: paragraph.style,
        rows: Vec::new(),
        image_count: paragraph.image_count,
        image_parts: paragraph.image_parts,
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
    let styles_xml = read_zip_part(&mut archive, "word/styles.xml", false)?;
    let numbering_xml = read_zip_part(&mut archive, "word/numbering.xml", false)?;
    let relationships_xml = read_zip_part(&mut archive, "word/_rels/document.xml.rels", false)?;
    let styles = parse_styles(styles_xml.as_deref())?;
    let numbering = parse_numbering(numbering_xml.as_deref())?;
    let relationships = parse_document_relationships(relationships_xml.as_deref())?;
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
                b"numId" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.num_id = attribute_value(event, b"val", reader.decoder())?;
                    }
                }
                b"drawing" | b"pict" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.image_count += 1;
                    }
                }
                b"blip" | b"imagedata" => {
                    capture_image_part(&mut paragraph, event, reader.decoder(), &relationships)?;
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
                b"numId" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.num_id = attribute_value(event, b"val", reader.decoder())?;
                    }
                }
                b"drawing" | b"pict" => {
                    if let Some(paragraph) = paragraph.as_mut() {
                        paragraph.image_count += 1;
                    }
                }
                b"blip" | b"imagedata" => {
                    capture_image_part(&mut paragraph, event, reader.decoder(), &relationships)?;
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
                            &styles,
                            &numbering,
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
                            list_kind: None,
                            style_id: None,
                            rows: table.rows,
                            image_count: 0,
                            image_parts: Vec::new(),
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
    let renderable_image_count = blocks
        .iter()
        .flat_map(|block| block.image_parts.iter())
        .collect::<HashSet<_>>()
        .len();
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
        renderable_image_count,
        style_count: styles.len(),
        numbering_definition_count: numbering.len(),
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
    fn resolves_inherited_heading_numbering_and_internal_image_relationships() {
        let source = fixture(
            r#"<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r" xmlns:a="a"><w:body>
            <w:p><w:pPr><w:pStyle w:val="CustomHeading"/></w:pPr><w:r><w:t>Inherited heading</w:t></w:r></w:p>
            <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>Bullet item</w:t></w:r></w:p>
            <w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>
            </w:body></w:document>"#,
            &[
                (
                    "word/styles.xml",
                    r#"<w:styles xmlns:w="w"><w:style w:type="paragraph" w:styleId="CustomHeading"><w:name w:val="Project section"/><w:basedOn w:val="Heading2"/></w:style></w:styles>"#,
                ),
                (
                    "word/numbering.xml",
                    r#"<w:numbering xmlns:w="w"><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="3"/></w:num></w:numbering>"#,
                ),
                (
                    "word/_rels/document.xml.rels",
                    r#"<Relationships><Relationship Id="rId5" Target="media/image1.png"/><Relationship Id="external" TargetMode="External" Target="https://example.com/image.png"/></Relationships>"#,
                ),
                ("word/media/image1.png", "image"),
            ],
        );
        let model = parse_docx(&source).unwrap();
        assert_eq!(model.headings[0].text, "Inherited heading");
        assert_eq!(model.headings[0].level, 2);
        let list = model
            .blocks
            .iter()
            .find(|block| block.kind == "list-item")
            .unwrap();
        assert_eq!(list.list_kind.as_deref(), Some("bullet"));
        let image = model
            .blocks
            .iter()
            .find(|block| block.kind == "image")
            .unwrap();
        assert_eq!(image.image_parts, ["word/media/image1.png"]);
        assert_eq!(model.compatibility.renderable_image_count, 1);
        assert_eq!(model.compatibility.style_count, 1);
        assert_eq!(model.compatibility.numbering_definition_count, 1);
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
        let mut missing_output = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut missing_output);
            zip.start_file(
                "[Content_Types].xml",
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
            )
            .unwrap();
            zip.write_all(b"<Types/>").unwrap();
            zip.finish().unwrap();
        }
        assert!(parse_docx(&missing_output.into_inner())
            .unwrap_err()
            .contains("完整"));
        let doctype = fixture(
            r#"<!DOCTYPE x [<!ENTITY y "boom">]><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>&y;</w:t></w:r></w:p></w:body></w:document>"#,
            &[],
        );
        assert!(parse_docx(&doctype).unwrap_err().contains("DOCTYPE"));
    }
}
