use crate::formats::workbook::{WorkbookCellEdit, WorkbookCellStyle, WorkbookCellStyleEdit};
use crate::formats::workbook_styles::{
    parse_styles, read_sheet_style_ids, resolve_style_edits, ResolvedStyleEdit,
};
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use std::collections::{BTreeMap, HashMap, HashSet};
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

#[derive(Clone, Copy, Default)]
struct CellPatch<'a> {
    edit: Option<&'a WorkbookCellEdit>,
    style_id: Option<usize>,
}

type SheetPatches<'a> = BTreeMap<usize, BTreeMap<usize, CellPatch<'a>>>;
type SheetStyleMap = HashMap<(usize, usize), WorkbookCellStyle>;

fn xml_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析 XLSX XML 属性失败: {error}"))?;
        if attribute.key.as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
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

fn parse_cell_reference(reference: &str) -> Result<(usize, usize), String> {
    let reference = reference.trim_matches('$');
    let split = reference
        .find(|character: char| character.is_ascii_digit())
        .ok_or_else(|| format!("单元格坐标无效: {reference}"))?;
    let (column_text, row_text) = reference.split_at(split);
    if column_text.is_empty()
        || row_text.is_empty()
        || !row_text.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(format!("单元格坐标无效: {reference}"));
    }
    let mut column = 0usize;
    for byte in column_text.bytes() {
        if !byte.is_ascii_alphabetic() {
            return Err(format!("单元格坐标无效: {reference}"));
        }
        column = column
            .checked_mul(26)
            .and_then(|value| value.checked_add((byte.to_ascii_uppercase() - b'A' + 1) as usize))
            .ok_or("单元格列坐标溢出")?;
    }
    let row = row_text
        .parse::<usize>()
        .map_err(|_| format!("单元格行坐标无效: {reference}"))?;
    if row == 0 || column == 0 || row > MAX_XLSX_ROWS || column > MAX_XLSX_COLUMNS {
        return Err(format!("单元格坐标超出 XLSX 上限: {reference}"));
    }
    Ok((row - 1, column - 1))
}

pub(crate) fn validate_edit(edit: &WorkbookCellEdit) -> Result<(), String> {
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
    style_id: Option<usize>,
) -> Result<(), String> {
    let mut cell = BytesStart::new("c");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取单元格属性失败: {error}"))?;
        if attribute.key.as_ref() != b"t" && !(style_id.is_some() && attribute.key.as_ref() == b"s")
        {
            cell.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    let style_text = style_id
        .filter(|value| *value > 0)
        .map(|value| value.to_string());
    if let Some(style) = &style_text {
        cell.push_attribute(("s", style.as_str()));
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

fn styled_cell_start(
    original: &BytesStart<'_>,
    style_id: usize,
) -> Result<BytesStart<'static>, String> {
    let mut cell = BytesStart::new("c");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取单元格样式属性失败: {error}"))?;
        if attribute.key.as_ref() != b"s" {
            cell.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    if style_id > 0 {
        cell.push_attribute(("s", style_id.to_string().as_str()));
    }
    Ok(cell.into_owned())
}

fn write_new_cell(
    writer: &mut Writer<Vec<u8>>,
    row: usize,
    column: usize,
    patch: CellPatch<'_>,
) -> Result<(), String> {
    if patch.edit.is_some_and(|edit| edit.kind == "empty") && patch.style_id.is_none() {
        return Ok(());
    }
    let reference = cell_reference(row, column)?;
    let mut cell = BytesStart::new("c");
    cell.push_attribute(("r", reference.as_str()));
    if let Some(edit) = patch.edit {
        write_cell(writer, &cell, edit, patch.style_id)
    } else if let Some(style_id) = patch.style_id {
        let cell = styled_cell_start(&cell, style_id)?;
        writer
            .write_event(Event::Empty(cell))
            .map_err(|error| format!("创建样式单元格失败: {error}"))
    } else {
        Ok(())
    }
}

fn write_pending_cells(
    writer: &mut Writer<Vec<u8>>,
    row: usize,
    pending: &mut BTreeMap<usize, CellPatch<'_>>,
    before_column: Option<usize>,
) -> Result<(), String> {
    let columns = pending
        .range(..before_column.unwrap_or(usize::MAX))
        .map(|(column, _)| *column)
        .collect::<Vec<_>>();
    for column in columns {
        if let Some(patch) = pending.remove(&column) {
            write_new_cell(writer, row, column, patch)?;
        }
    }
    Ok(())
}

fn patch_existing_row(
    reader: &mut Reader<&[u8]>,
    writer: &mut Writer<Vec<u8>>,
    row_start: &BytesStart<'_>,
    row: usize,
    patches: &BTreeMap<usize, CellPatch<'_>>,
    buffer: &mut Vec<u8>,
) -> Result<(), String> {
    writer
        .write_event(Event::Start(row_start.to_owned()))
        .map_err(|error| format!("写入工作表行失败: {error}"))?;
    let mut pending = patches.clone();
    let mut last_column = None;
    buffer.clear();
    loop {
        let event = reader
            .read_event_into(buffer)
            .map_err(|error| format!("解析工作表行失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"c" => {
                let reference =
                    xml_value(start, b"r", reader.decoder())?.ok_or("工作表单元格缺少坐标")?;
                let (cell_row, column) = parse_cell_reference(&reference)?;
                if cell_row != row || last_column.is_some_and(|last| column <= last) {
                    return Err("工作表单元格坐标未按行列有序排列".into());
                }
                last_column = Some(column);
                write_pending_cells(writer, row, &mut pending, Some(column))?;
                if let Some(patch) = pending.remove(&column) {
                    if let Some(edit) = patch.edit {
                        write_cell(writer, start, edit, patch.style_id)?;
                    } else if let Some(style_id) = patch.style_id {
                        writer
                            .write_event(Event::Start(styled_cell_start(start, style_id)?))
                            .map_err(|error| format!("写入单元格样式失败: {error}"))?;
                    }
                    if patch.edit.is_none() {
                        buffer.clear();
                        continue;
                    }
                    let mut depth = 1usize;
                    buffer.clear();
                    while depth > 0 {
                        match reader
                            .read_event_into(buffer)
                            .map_err(|error| format!("跳过原单元格内容失败: {error}"))?
                        {
                            Event::Start(_) => depth += 1,
                            Event::End(_) => depth -= 1,
                            Event::Eof => return Err("工作表单元格 XML 意外结束".into()),
                            _ => {}
                        }
                        buffer.clear();
                    }
                    continue;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表单元格失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"c" => {
                let reference =
                    xml_value(start, b"r", reader.decoder())?.ok_or("工作表单元格缺少坐标")?;
                let (cell_row, column) = parse_cell_reference(&reference)?;
                if cell_row != row || last_column.is_some_and(|last| column <= last) {
                    return Err("工作表单元格坐标未按行列有序排列".into());
                }
                last_column = Some(column);
                write_pending_cells(writer, row, &mut pending, Some(column))?;
                if let Some(patch) = pending.remove(&column) {
                    if let Some(edit) = patch.edit {
                        write_cell(writer, start, edit, patch.style_id)?;
                    } else if let Some(style_id) = patch.style_id {
                        writer
                            .write_event(Event::Empty(styled_cell_start(start, style_id)?))
                            .map_err(|error| format!("写入空单元格样式失败: {error}"))?;
                    }
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表单元格失败: {error}"))?;
                }
            }
            Event::End(ref end) if end.local_name().as_ref() == b"row" => {
                write_pending_cells(writer, row, &mut pending, None)?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表行写入失败: {error}"))?;
                return Ok(());
            }
            Event::Eof => return Err("工作表行 XML 意外结束".into()),
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表行内容失败: {error}"))?,
        }
        buffer.clear();
    }
}

fn write_new_row(
    writer: &mut Writer<Vec<u8>>,
    row: usize,
    patches: &BTreeMap<usize, CellPatch<'_>>,
) -> Result<(), String> {
    if patches.values().all(|patch| {
        patch.style_id.is_none() && patch.edit.is_some_and(|edit| edit.kind == "empty")
    }) {
        return Ok(());
    }
    let row_number = (row + 1).to_string();
    let mut row_start = BytesStart::new("row");
    row_start.push_attribute(("r", row_number.as_str()));
    writer
        .write_event(Event::Start(row_start))
        .map_err(|error| format!("创建工作表行失败: {error}"))?;
    for (column, patch) in patches {
        write_new_cell(writer, row, *column, *patch)?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("row")))
        .map_err(|error| format!("结束新工作表行失败: {error}"))
}

fn write_dimension(
    writer: &mut Writer<Vec<u8>>,
    original: &BytesStart<'_>,
    min_row: usize,
    min_column: usize,
    max_row: usize,
    max_column: usize,
) -> Result<(), String> {
    let existing = original
        .attributes()
        .filter_map(Result::ok)
        .find(|attribute| attribute.key.as_ref() == b"ref")
        .and_then(|attribute| String::from_utf8(attribute.value.into_owned()).ok())
        .unwrap_or_else(|| "A1".into());
    let existing_first = existing.split(':').next().unwrap_or("A1");
    let existing_last = existing.rsplit(':').next().unwrap_or("A1");
    let (existing_first_row, existing_first_column) =
        parse_cell_reference(existing_first).unwrap_or((0, 0));
    let (existing_row, existing_column) = parse_cell_reference(existing_last).unwrap_or((0, 0));
    let first = cell_reference(
        existing_first_row.min(min_row),
        existing_first_column.min(min_column),
    )?;
    let last = cell_reference(existing_row.max(max_row), existing_column.max(max_column))?;
    let dimension_ref = if first == last {
        first
    } else {
        format!("{first}:{last}")
    };
    let mut dimension = BytesStart::new("dimension");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取工作表范围属性失败: {error}"))?;
        if attribute.key.as_ref() != b"ref" {
            dimension.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    dimension.push_attribute(("ref", dimension_ref.as_str()));
    writer
        .write_event(Event::Empty(dimension))
        .map_err(|error| format!("写入工作表范围失败: {error}"))
}

fn validate_merged_cells(xml: &[u8], patches: &SheetPatches<'_>) -> Result<(), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析合并单元格失败: {error}"))?
        {
            Event::Start(event) | Event::Empty(event)
                if event.local_name().as_ref() == b"mergeCell" =>
            {
                let reference =
                    xml_value(&event, b"ref", reader.decoder())?.ok_or("合并单元格缺少范围")?;
                let mut parts = reference.split(':');
                let (top, left) = parse_cell_reference(parts.next().unwrap_or_default())?;
                let (bottom, right) = parse_cell_reference(parts.next().unwrap_or(&reference))?;
                if parts.next().is_some() || bottom < top || right < left {
                    return Err(format!("合并单元格范围无效: {reference}"));
                }
                for (row, columns) in patches.range(top..=bottom) {
                    for (column, _) in columns.range(left..=right) {
                        if *row != top || *column != left {
                            return Err(format!(
                                "合并区域 {reference} 只能编辑左上角单元格 {}",
                                cell_reference(top, left)?
                            ));
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(())
}

fn patch_sheet_xml(xml: &[u8], patches: &SheetPatches<'_>) -> Result<Vec<u8>, String> {
    validate_merged_cells(xml, patches)?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut pending = patches.clone();
    let non_empty_coordinates = patches.iter().flat_map(|(row, columns)| {
        columns
            .iter()
            .filter(|(_, patch)| {
                patch.style_id.is_some() || patch.edit.is_some_and(|edit| edit.kind != "empty")
            })
            .map(move |(column, _)| (*row, *column))
    });
    let coordinates = non_empty_coordinates.collect::<Vec<_>>();
    let extent = if coordinates.is_empty() {
        None
    } else {
        Some((
            coordinates.iter().map(|(row, _)| *row).min().unwrap(),
            coordinates.iter().map(|(_, column)| *column).min().unwrap(),
            coordinates.iter().map(|(row, _)| *row).max().unwrap(),
            coordinates.iter().map(|(_, column)| *column).max().unwrap(),
        ))
    };
    let mut inside_sheet_data = false;
    let mut found_sheet_data = false;
    let mut last_row = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表 XML 失败: {error}"))?;
        match event {
            Event::Empty(ref start) if start.local_name().as_ref() == b"dimension" => {
                if let Some((min_row, min_column, max_row, max_column)) = extent {
                    write_dimension(&mut writer, start, min_row, min_column, max_row, max_column)?;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表范围失败: {error}"))?;
                }
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"sheetData" => {
                inside_sheet_data = true;
                found_sheet_data = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入工作表数据节点失败: {error}"))?;
            }
            Event::Start(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row_number = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?;
                if row_number == 0 || row_number > MAX_XLSX_ROWS {
                    return Err("工作表行号超出 XLSX 上限".into());
                }
                let row = row_number - 1;
                if last_row.is_some_and(|last| row <= last) {
                    return Err("工作表行未按行号有序排列".into());
                }
                last_row = Some(row);
                let rows_before = pending
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in rows_before {
                    if let Some(row_edits) = pending.remove(&missing_row) {
                        write_new_row(&mut writer, missing_row, &row_edits)?;
                    }
                }
                if let Some(row_edits) = pending.remove(&row) {
                    let row_start = start.to_owned();
                    patch_existing_row(
                        &mut reader,
                        &mut writer,
                        &row_start,
                        row,
                        &row_edits,
                        &mut buffer,
                    )?;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表行失败: {error}"))?;
                }
            }
            Event::Empty(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row_number = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?;
                if row_number == 0 || row_number > MAX_XLSX_ROWS {
                    return Err("工作表行号超出 XLSX 上限".into());
                }
                let row = row_number - 1;
                if last_row.is_some_and(|last| row <= last) {
                    return Err("工作表行未按行号有序排列".into());
                }
                last_row = Some(row);
                let rows_before = pending
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in rows_before {
                    if let Some(row_edits) = pending.remove(&missing_row) {
                        write_new_row(&mut writer, missing_row, &row_edits)?;
                    }
                }
                if let Some(row_edits) = pending.remove(&row) {
                    let row_start = start.to_owned();
                    writer
                        .write_event(Event::Start(row_start.borrow()))
                        .map_err(|error| format!("扩展空工作表行失败: {error}"))?;
                    for (column, patch) in &row_edits {
                        write_new_cell(&mut writer, row, *column, *patch)?;
                    }
                    writer
                        .write_event(Event::End(BytesEnd::new("row")))
                        .map_err(|error| format!("结束工作表行失败: {error}"))?;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制空工作表行失败: {error}"))?;
                }
            }
            Event::End(ref end)
                if inside_sheet_data && end.local_name().as_ref() == b"sheetData" =>
            {
                for (row, row_edits) in std::mem::take(&mut pending) {
                    write_new_row(&mut writer, row, &row_edits)?;
                }
                inside_sheet_data = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表数据节点失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if !found_sheet_data || !pending.is_empty() {
        return Err("XLSX 工作表缺少可写入的 sheetData".into());
    }
    Ok(writer.into_inner())
}

fn load_package(source: &[u8]) -> Result<Vec<PackageEntry>, String> {
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
    Ok(entries)
}

pub fn read_workbook_sheet_layout(
    source: &[u8],
    sheet: &str,
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<((usize, usize), SheetStyleMap), String> {
    let entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let sheet_path = paths
        .get(sheet)
        .ok_or_else(|| format!("工作表不存在: {sheet}"))?;
    let styles = entries
        .iter()
        .find(|entry| entry.name == "xl/styles.xml")
        .ok_or("XLSX 缺少 xl/styles.xml")?;
    let sheet_xml = entries
        .iter()
        .find(|entry| &entry.name == sheet_path)
        .ok_or("XLSX 工作表部件缺失")?;
    let catalog = parse_styles(&styles.data)?;
    let extent = sheet_extent(&sheet_xml.data)?;
    let styles = read_sheet_style_ids(&sheet_xml.data, row_start, row_end, max_columns)?
        .into_iter()
        .map(|(coordinate, style_id)| (coordinate, catalog.public_style(style_id)))
        .collect();
    Ok((extent, styles))
}

pub fn validate_workbook_package(source: &[u8]) -> Result<(), String> {
    load_package(source).map(drop)
}

fn sheet_extent(xml: &[u8]) -> Result<(usize, usize), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表范围失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"dimension" =>
            {
                let reference =
                    xml_value(event, b"ref", reader.decoder())?.unwrap_or_else(|| "A1".into());
                let last = reference.rsplit(':').next().unwrap_or("A1");
                let (row, column) = parse_cell_reference(last)?;
                return Ok((row + 1, column + 1));
            }
            Event::Eof => return Ok((0, 0)),
            _ => {}
        }
        buffer.clear();
    }
}

pub fn patch_workbook(
    source: &[u8],
    edits: &[WorkbookCellEdit],
    style_edits: &[WorkbookCellStyleEdit],
) -> Result<Vec<u8>, String> {
    if edits.is_empty() && style_edits.is_empty() {
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

    let mut entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let style_sheet_xml = style_edits
        .iter()
        .map(|edit| {
            let path = sheet_paths
                .get(&edit.sheet)
                .ok_or_else(|| format!("工作表不存在: {}", edit.sheet))?;
            let xml = entries
                .iter()
                .find(|entry| &entry.name == path)
                .ok_or("XLSX 工作表部件缺失")?;
            Ok((edit.sheet.clone(), xml.data.as_slice()))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;
    let resolved_styles = if style_edits.is_empty() {
        Vec::new()
    } else {
        let styles = entries
            .iter()
            .find(|entry| entry.name == "xl/styles.xml")
            .ok_or("XLSX 缺少 xl/styles.xml")?;
        let (updated, resolved) = resolve_style_edits(&styles.data, &style_sheet_xml, style_edits)?;
        entries
            .iter_mut()
            .find(|entry| entry.name == "xl/styles.xml")
            .ok_or("XLSX 缺少 xl/styles.xml")?
            .data = updated;
        resolved
    };
    let mut patches_by_path: HashMap<String, SheetPatches<'_>> = HashMap::new();
    for edit in edits {
        let path = sheet_paths
            .get(&edit.sheet)
            .ok_or_else(|| format!("工作表不存在: {}", edit.sheet))?;
        patches_by_path
            .entry(path.clone())
            .or_default()
            .entry(edit.row)
            .or_default()
            .entry(edit.column)
            .or_default()
            .edit = Some(edit);
    }
    for ResolvedStyleEdit {
        sheet,
        row,
        column,
        style_id,
    } in &resolved_styles
    {
        let path = sheet_paths
            .get(sheet)
            .ok_or_else(|| format!("工作表不存在: {sheet}"))?;
        patches_by_path
            .entry(path.clone())
            .or_default()
            .entry(*row)
            .or_default()
            .entry(*column)
            .or_default()
            .style_id = Some(*style_id);
    }
    for entry in &mut entries {
        if let Some(sheet_patches) = patches_by_path.remove(&entry.name) {
            entry.data = patch_sheet_xml(&entry.data, &sheet_patches)?;
        }
    }
    if !patches_by_path.is_empty() {
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
