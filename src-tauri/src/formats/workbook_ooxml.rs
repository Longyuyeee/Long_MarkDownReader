use crate::formats::workbook::WorkbookCellEdit;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_CELL_EDITS: usize = 10_000;
const MAX_CELL_TEXT: usize = 32_767;
const MAX_FORMULA_TEXT: usize = 8_192;
const MAX_XLSX_ROWS: usize = 1_048_576;
const MAX_XLSX_COLUMNS: usize = 16_384;
const MAX_UNCOMPRESSED_PART_BYTES: u64 = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_PACKAGE_BYTES: u64 = 512 * 1024 * 1024;

struct PackageEntry {
    name: String,
    is_dir: bool,
    compression: CompressionMethod,
    data: Vec<u8>,
}

fn xml_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析 XLSX XML 属性失败: {error}"))?;
        if attribute.key.as_ref() == key {
            return attribute
                .decode_and_unescape_value(decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("解码 XLSX XML 属性失败: {error}"));
        }
    }
    Ok(None)
}

fn workbook_sheet_paths(entries: &[PackageEntry]) -> Result<HashMap<String, String>, String> {
    let workbook = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let relationships = entries
        .iter()
        .find(|entry| entry.name == "xl/_rels/workbook.xml.rels")
        .ok_or("XLSX 缺少 workbook.xml.rels")?;

    let mut relation_targets = HashMap::new();
    let mut reader = Reader::from_reader(relationships.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿关系失败: {error}"))?
        {
            Event::Start(event) | Event::Empty(event)
                if event.local_name().as_ref() == b"Relationship" =>
            {
                let id = xml_value(&event, b"Id", reader.decoder())?;
                let target = xml_value(&event, b"Target", reader.decoder())?;
                if let (Some(id), Some(target)) = (id, target) {
                    relation_targets.insert(id, target);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut sheets = HashMap::new();
    let mut reader = Reader::from_reader(workbook.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿 Sheet 列表失败: {error}"))?
        {
            Event::Start(event) | Event::Empty(event)
                if event.local_name().as_ref() == b"sheet" =>
            {
                let name = xml_value(&event, b"name", reader.decoder())?;
                let relation_id = xml_value(&event, b"r:id", reader.decoder())?;
                if let (Some(name), Some(relation_id)) = (name, relation_id) {
                    let target = relation_targets
                        .get(&relation_id)
                        .ok_or_else(|| format!("工作表 {name} 缺少关系目标"))?;
                    let target = target.trim_start_matches('/').replace('\\', "/");
                    let path = if target.starts_with("xl/") {
                        target
                    } else {
                        format!("xl/{target}")
                    };
                    if path.split('/').any(|part| part == "..") {
                        return Err("工作表关系包含非法上级路径".into());
                    }
                    sheets.insert(name, path);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(sheets)
}

fn cell_reference(row: usize, column: usize) -> Result<String, String> {
    if row >= MAX_XLSX_ROWS || column >= MAX_XLSX_COLUMNS {
        return Err("单元格坐标超出 XLSX 上限".into());
    }
    let mut label = String::new();
    let mut current = column + 1;
    while current > 0 {
        label.insert(0, (b'A' + ((current - 1) % 26) as u8) as char);
        current = (current - 1) / 26;
    }
    Ok(format!("{label}{}", row + 1))
}

fn validate_edit(edit: &WorkbookCellEdit) -> Result<(), String> {
    if edit.sheet.is_empty() || edit.sheet.chars().count() > 31 {
        return Err("工作表名称无效".into());
    }
    let length = edit.input.chars().count();
    match edit.kind.as_str() {
        "string" if length <= MAX_CELL_TEXT => Ok(()),
        "number" => match edit.input.parse::<f64>() {
            Ok(value) if value.is_finite() => Ok(()),
            _ => Err("数字单元格内容无效".into()),
        },
        "boolean" if matches!(edit.input.to_ascii_lowercase().as_str(), "true" | "false") => Ok(()),
        "empty" if edit.input.is_empty() => Ok(()),
        "formula"
            if edit.input.starts_with('=')
                && edit.input.len() > 1
                && length <= MAX_FORMULA_TEXT =>
        {
            Ok(())
        }
        "string" => Err(format!("单元格文本不能超过 {MAX_CELL_TEXT} 个字符")),
        "formula" => Err("公式必须以 = 开头且不能超过 8192 个字符".into()),
        _ => Err("不支持的单元格编辑类型".into()),
    }
}

fn write_cell(
    writer: &mut Writer<Vec<u8>>,
    original: &BytesStart<'_>,
    edit: &WorkbookCellEdit,
) -> Result<(), String> {
    let mut cell = BytesStart::new("c");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取单元格属性失败: {error}"))?;
        if attribute.key.as_ref() != b"t" {
            cell.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    match edit.kind.as_str() {
        "string" => cell.push_attribute(("t", "inlineStr")),
        "boolean" => cell.push_attribute(("t", "b")),
        _ => {}
    }
    writer
        .write_event(Event::Start(cell))
        .map_err(|error| format!("写入单元格失败: {error}"))?;
    match edit.kind.as_str() {
        "string" => {
            writer
                .write_event(Event::Start(BytesStart::new("is")))
                .and_then(|_| {
                    let mut text = BytesStart::new("t");
                    text.push_attribute(("xml:space", "preserve"));
                    writer.write_event(Event::Start(text))
                })
                .and_then(|_| writer.write_event(Event::Text(BytesText::new(&edit.input))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("t"))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("is"))))
                .map_err(|error| format!("写入文本单元格失败: {error}"))?;
        }
        "number" => {
            writer
                .write_event(Event::Start(BytesStart::new("v")))
                .and_then(|_| writer.write_event(Event::Text(BytesText::new(&edit.input))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("v"))))
                .map_err(|error| format!("写入数字单元格失败: {error}"))?;
        }
        "boolean" => {
            let value = if edit.input.eq_ignore_ascii_case("true") {
                "1"
            } else {
                "0"
            };
            writer
                .write_event(Event::Start(BytesStart::new("v")))
                .and_then(|_| writer.write_event(Event::Text(BytesText::new(value))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("v"))))
                .map_err(|error| format!("写入布尔单元格失败: {error}"))?;
        }
        "formula" => {
            writer
                .write_event(Event::Start(BytesStart::new("f")))
                .and_then(|_| writer.write_event(Event::Text(BytesText::new(&edit.input[1..]))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("f"))))
                .and_then(|_| writer.write_event(Event::Start(BytesStart::new("v"))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("v"))))
                .map_err(|error| format!("写入公式单元格失败: {error}"))?;
        }
        "empty" => {}
        _ => return Err("不支持的单元格编辑类型".into()),
    }
    writer
        .write_event(Event::End(BytesEnd::new("c")))
        .map_err(|error| format!("结束单元格写入失败: {error}"))
}

fn patch_sheet_xml(
    xml: &[u8],
    edits: &HashMap<String, &WorkbookCellEdit>,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut applied = HashSet::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表 XML 失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"c" => {
                let reference = xml_value(start, b"r", reader.decoder())?;
                if let Some((reference, edit)) = reference
                    .as_ref()
                    .and_then(|reference| edits.get(reference).map(|edit| (reference, *edit)))
                {
                    write_cell(&mut writer, start, edit)?;
                    applied.insert(reference.clone());
                    let mut depth = 1usize;
                    buffer.clear();
                    while depth > 0 {
                        match reader
                            .read_event_into(&mut buffer)
                            .map_err(|error| format!("跳过原单元格内容失败: {error}"))?
                        {
                            Event::Start(_) => depth += 1,
                            Event::End(_) => depth -= 1,
                            Event::Eof => return Err("工作表单元格 XML 意外结束".into()),
                            _ => {}
                        }
                        buffer.clear();
                    }
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
                }
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"c" => {
                let reference = xml_value(start, b"r", reader.decoder())?;
                if let Some((reference, edit)) = reference
                    .as_ref()
                    .and_then(|reference| edits.get(reference).map(|edit| (reference, *edit)))
                {
                    write_cell(&mut writer, start, edit)?;
                    applied.insert(reference.clone());
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
                }
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    let missing = edits
        .keys()
        .filter(|reference| !applied.contains(*reference))
        .cloned()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(format!(
            "当前批次只能编辑工作簿中已存在的单元格，未找到: {}",
            missing.join(", ")
        ));
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook(source: &[u8], edits: &[WorkbookCellEdit]) -> Result<Vec<u8>, String> {
    if edits.is_empty() {
        return Err("没有需要保存的单元格变更".into());
    }
    if edits.len() > MAX_CELL_EDITS {
        return Err(format!("单次最多保存 {MAX_CELL_EDITS} 个单元格变更"));
    }
    let mut seen = HashSet::new();
    for edit in edits {
        validate_edit(edit)?;
        let reference = cell_reference(edit.row, edit.column)?;
        if !seen.insert((edit.sheet.clone(), reference)) {
            return Err("保存请求包含重复单元格".into());
        }
    }

    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 XLSX 容器失败: {error}"))?;
    let mut entries = Vec::with_capacity(archive.len());
    let mut entry_names = HashSet::new();
    let mut uncompressed_bytes = 0u64;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 XLSX 部件失败: {error}"))?;
        if !entry_names.insert(file.name().to_string()) {
            return Err(format!("XLSX 包含重复部件: {}", file.name()));
        }
        if file.size() > MAX_UNCOMPRESSED_PART_BYTES {
            return Err(format!("XLSX 部件解压后过大: {}", file.name()));
        }
        uncompressed_bytes = uncompressed_bytes
            .checked_add(file.size())
            .ok_or("XLSX 解压大小溢出")?;
        if uncompressed_bytes > MAX_UNCOMPRESSED_PACKAGE_BYTES {
            return Err("XLSX 解压后总大小不能超过 512 MB".into());
        }
        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|error| format!("读取 XLSX 部件内容失败: {error}"))?;
        entries.push(PackageEntry {
            name: file.name().to_string(),
            is_dir: file.is_dir(),
            compression: file.compression(),
            data,
        });
    }
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let mut edits_by_path: HashMap<String, HashMap<String, &WorkbookCellEdit>> = HashMap::new();
    for edit in edits {
        let path = sheet_paths
            .get(&edit.sheet)
            .ok_or_else(|| format!("工作表不存在: {}", edit.sheet))?;
        edits_by_path
            .entry(path.clone())
            .or_default()
            .insert(cell_reference(edit.row, edit.column)?, edit);
    }
    for entry in &mut entries {
        if let Some(sheet_edits) = edits_by_path.remove(&entry.name) {
            entry.data = patch_sheet_xml(&entry.data, &sheet_edits)?;
        }
    }
    if !edits_by_path.is_empty() {
        return Err("XLSX 工作表部件缺失".into());
    }

    let cursor = Cursor::new(Vec::with_capacity(source.len()));
    let mut output = ZipWriter::new(cursor);
    for entry in entries {
        let options = SimpleFileOptions::default().compression_method(entry.compression);
        if entry.is_dir {
            output
                .add_directory(entry.name, options)
                .map_err(|error| format!("写入 XLSX 目录失败: {error}"))?;
        } else {
            output
                .start_file(entry.name, options)
                .map_err(|error| format!("写入 XLSX 部件失败: {error}"))?;
            output
                .write_all(&entry.data)
                .map_err(|error| format!("写入 XLSX 部件内容失败: {error}"))?;
        }
    }
    output
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 XLSX 写回失败: {error}"))
}
