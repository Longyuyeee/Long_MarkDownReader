use crate::formats::workbook::{
    WorkbookCellEdit, WorkbookCellStyle, WorkbookCellStyleEdit, WorkbookChart, WorkbookChartSeries,
    WorkbookColumnState, WorkbookColumnStateEdit, WorkbookColumnWidth, WorkbookColumnWidthEdit,
    WorkbookDataConnection, WorkbookDataValidation, WorkbookDefinedName, WorkbookDrawingAnchor,
    WorkbookDrawingObject, WorkbookExternalLink, WorkbookFreezePane, WorkbookLinkedData,
    WorkbookMergeEdit, WorkbookMergeRange, WorkbookNamedStyle, WorkbookPageLayout,
    WorkbookPageMargins, WorkbookPivotTable, WorkbookPrintOptions, WorkbookProtection,
    WorkbookRangeReference, WorkbookRowHeight, WorkbookRowHeightEdit, WorkbookRowState,
    WorkbookRowStateEdit, WorkbookSlicer, WorkbookStructureAction, WorkbookStructureAxis,
    WorkbookStructureChange, WorkbookTable,
};
use crate::formats::workbook_formula::{
    migrate_workbook_formula, migrate_workbook_reference, translate_formula,
    validate_workbook_structure_change,
};
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
const MAX_STRUCTURE_EDITS: usize = 10_000;
const MIN_ROW_HEIGHT: f64 = 2.0;
const MAX_ROW_HEIGHT: f64 = 409.5;
const MIN_COLUMN_WIDTH: f64 = 0.1;
const MAX_COLUMN_WIDTH: f64 = 255.0;
const MAX_UNCOMPRESSED_PART_BYTES: u64 = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_PACKAGE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DEFINED_NAMES: usize = 10_000;
const MAX_DEFINED_NAME_LENGTH: usize = 255;
const MAX_DEFINED_NAME_FORMULA_LENGTH: usize = 8_192;
const MAX_DATA_VALIDATIONS: usize = 10_000;
const MAX_VALIDATION_RANGES: usize = 10_000;
const MAX_DRAWING_OBJECTS: usize = 1_024;
const MAX_CHART_SERIES: usize = 256;
const MAX_DRAWING_TEXT: usize = 1_024;
const MAX_LINKED_DATA_OBJECTS: usize = 4_096;
const MAX_LINKED_DATA_TEXT: usize = 1_024;
const MAX_HEADER_FOOTER_TEXT: usize = 8_192;

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

pub(crate) struct WorkbookSheetLayout {
    pub extent: (usize, usize),
    pub formulas: BTreeMap<(usize, usize), String>,
    pub styles: SheetStyleMap,
    pub named_styles: Vec<WorkbookNamedStyle>,
    pub default_row_height: f64,
    pub default_column_width: f64,
    pub row_heights: Vec<WorkbookRowHeight>,
    pub column_widths: Vec<WorkbookColumnWidth>,
    pub row_states: Vec<WorkbookRowState>,
    pub column_states: Vec<WorkbookColumnState>,
    pub merged_cells: Vec<WorkbookMergeRange>,
    pub freeze_pane: WorkbookFreezePane,
    pub auto_filter: Option<WorkbookMergeRange>,
    pub tables: Vec<WorkbookTable>,
    pub data_validations: Vec<WorkbookDataValidation>,
    pub drawings: Vec<WorkbookDrawingObject>,
    pub page_layout: WorkbookPageLayout,
}

fn read_sheet_formulas(
    xml: &[u8],
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<BTreeMap<(usize, usize), String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut current_cell = None;
    let mut shared = HashMap::<String, ((usize, usize), String)>::new();
    let mut formulas = BTreeMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表公式失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
            }
            Event::End(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = None;
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"f" => {
                let Some(coordinate) = current_cell else {
                    continue;
                };
                if xml_value(event, b"t", reader.decoder())?.as_deref() != Some("shared") {
                    continue;
                }
                let Some(index) = xml_value(event, b"si", reader.decoder())? else {
                    continue;
                };
                let Some((origin, master)) = shared.get(&index) else {
                    continue;
                };
                if coordinate.0 >= row_start && coordinate.0 < row_end && coordinate.1 < max_columns
                {
                    formulas.insert(
                        coordinate,
                        translate_formula(
                            master,
                            coordinate.0 as i32 - origin.0 as i32,
                            coordinate.1 as i32 - origin.1 as i32,
                        )?,
                    );
                }
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"f" => {
                let formula_type = xml_value(event, b"t", reader.decoder())?;
                let shared_index = xml_value(event, b"si", reader.decoder())?;
                let text = reader
                    .read_text(event.name())
                    .map_err(|error| format!("读取工作表公式失败: {error}"))?
                    .xml10_content()
                    .map_err(|error| format!("解码工作表公式失败: {error}"))?;
                let text = quick_xml::escape::unescape(&text)
                    .map_err(|error| format!("还原工作表公式失败: {error}"))?
                    .into_owned();
                let Some(coordinate) = current_cell else {
                    continue;
                };
                let formula = if formula_type.as_deref() == Some("shared") {
                    let Some(index) = shared_index else {
                        continue;
                    };
                    if !text.is_empty() {
                        let formula = format!("={text}");
                        shared.insert(index, (coordinate, formula.clone()));
                        formula
                    } else if let Some((origin, master)) = shared.get(&index) {
                        translate_formula(
                            master,
                            coordinate.0 as i32 - origin.0 as i32,
                            coordinate.1 as i32 - origin.1 as i32,
                        )?
                    } else {
                        continue;
                    }
                } else if text.is_empty() {
                    continue;
                } else {
                    format!("={text}")
                };
                if formula.len() > MAX_FORMULA_TEXT {
                    return Err(format!("公式不能超过 {MAX_FORMULA_TEXT} 字节"));
                }
                if coordinate.0 >= row_start && coordinate.0 < row_end && coordinate.1 < max_columns
                {
                    formulas.insert(coordinate, formula);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(formulas)
}

struct SheetStructureSummary {
    default_row_height: f64,
    default_column_width: f64,
    row_heights: Vec<WorkbookRowHeight>,
    column_widths: Vec<WorkbookColumnWidth>,
    row_states: Vec<WorkbookRowState>,
    column_states: Vec<WorkbookColumnState>,
    merged_cells: Vec<WorkbookMergeRange>,
    freeze_pane: WorkbookFreezePane,
    auto_filter: Option<WorkbookMergeRange>,
    data_validations: Vec<WorkbookDataValidation>,
}

fn parse_range_reference(reference: &str) -> Result<WorkbookMergeRange, String> {
    let mut parts = reference.split(':');
    let start = parts.next().unwrap_or_default().replace('$', "");
    let end = parts.next().unwrap_or(&start).replace('$', "");
    if parts.next().is_some() {
        return Err(format!("XLSX 区域引用无效: {reference}"));
    }
    let (start_row, start_column) = parse_cell_reference(&start)?;
    let (end_row, end_column) = parse_cell_reference(&end)?;
    Ok(WorkbookMergeRange {
        top: start_row.min(end_row),
        bottom: start_row.max(end_row),
        left: start_column.min(end_column),
        right: start_column.max(end_column),
    })
}

fn bool_attribute(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
    default: bool,
) -> Result<bool, String> {
    Ok(xml_value(event, key, decoder)?
        .map(|value| matches!(value.as_str(), "1" | "true"))
        .unwrap_or(default))
}

fn validation_from_event(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<WorkbookDataValidation, String> {
    let ranges = xml_value(event, b"sqref", decoder)?
        .ok_or("数据验证缺少 sqref")?
        .split_ascii_whitespace()
        .map(parse_range_reference)
        .collect::<Result<Vec<_>, _>>()?;
    if ranges.is_empty() || ranges.len() > MAX_VALIDATION_RANGES {
        return Err("数据验证区域数量无效".into());
    }
    Ok(WorkbookDataValidation {
        ranges,
        kind: xml_value(event, b"type", decoder)?.unwrap_or_else(|| "none".into()),
        operator: xml_value(event, b"operator", decoder)?,
        formula1: None,
        formula2: None,
        allow_blank: bool_attribute(event, b"allowBlank", decoder, false)?,
        show_error_message: bool_attribute(event, b"showErrorMessage", decoder, false)?,
        error_title: xml_value(event, b"errorTitle", decoder)?,
        error: xml_value(event, b"error", decoder)?,
        prompt_title: xml_value(event, b"promptTitle", decoder)?,
        prompt: xml_value(event, b"prompt", decoder)?,
    })
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

fn validation_contains(validation: &WorkbookDataValidation, row: usize, column: usize) -> bool {
    validation.ranges.iter().any(|range| {
        row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
    })
}

fn compare_validation_number(value: f64, validation: &WorkbookDataValidation) -> Option<bool> {
    let first = validation.formula1.as_deref()?.parse::<f64>().ok()?;
    let second = validation
        .formula2
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok());
    Some(match validation.operator.as_deref().unwrap_or("between") {
        "between" => value >= first && value <= second?,
        "notBetween" => value < first || value > second?,
        "equal" => value == first,
        "notEqual" => value != first,
        "lessThan" => value < first,
        "lessThanOrEqual" => value <= first,
        "greaterThan" => value > first,
        "greaterThanOrEqual" => value >= first,
        _ => return None,
    })
}

fn validate_edit_against_rules(
    edit: &WorkbookCellEdit,
    validations: &[WorkbookDataValidation],
) -> Result<(), String> {
    for validation in validations
        .iter()
        .filter(|rule| rule.show_error_message && validation_contains(rule, edit.row, edit.column))
    {
        if edit.kind == "empty" || edit.input.is_empty() {
            if validation.allow_blank {
                continue;
            }
            return Err(validation
                .error
                .clone()
                .unwrap_or_else(|| "该单元格不允许空值".into()));
        }
        if edit.kind == "formula" {
            continue;
        }
        let accepted = match validation.kind.as_str() {
            "list" => validation.formula1.as_deref().and_then(|formula| {
                let formula = formula.strip_prefix('=').unwrap_or(formula);
                if formula.starts_with('"') && formula.ends_with('"') && formula.len() >= 2 {
                    Some(
                        formula[1..formula.len() - 1]
                            .split(',')
                            .any(|item| item == edit.input),
                    )
                } else {
                    None
                }
            }),
            "whole" | "decimal" => edit
                .input
                .parse::<f64>()
                .ok()
                .and_then(|value| compare_validation_number(value, validation)),
            "textLength" => {
                compare_validation_number(edit.input.chars().count() as f64, validation)
            }
            "none" => Some(true),
            _ => None,
        };
        if accepted == Some(false) {
            return Err(validation
                .error
                .clone()
                .unwrap_or_else(|| "输入不符合单元格的数据验证规则".into()));
        }
    }
    Ok(())
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

fn defined_name_reference(formula: &str, scope: Option<&str>) -> Option<WorkbookRangeReference> {
    let formula = formula.trim().strip_prefix('=').unwrap_or(formula.trim());
    if formula.contains(['[', ']', ',', ';']) {
        return None;
    }
    let (sheet, range) = match formula.rsplit_once('!') {
        Some((sheet, range)) => {
            let sheet = sheet.trim();
            let sheet = if sheet.starts_with('\'') && sheet.ends_with('\'') && sheet.len() >= 2 {
                sheet[1..sheet.len() - 1].replace("''", "'")
            } else {
                sheet.to_string()
            };
            (sheet, range)
        }
        None => (scope?.to_string(), formula),
    };
    let mut parts = range.split(':');
    let start = parts.next()?.replace('$', "");
    let end = parts.next().unwrap_or(&start).replace('$', "");
    if parts.next().is_some() {
        return None;
    }
    let (start_row, start_column) = parse_cell_reference(&start).ok()?;
    let (end_row, end_column) = parse_cell_reference(&end).ok()?;
    Some(WorkbookRangeReference {
        sheet,
        top: start_row.min(end_row),
        bottom: start_row.max(end_row),
        left: start_column.min(end_column),
        right: start_column.max(end_column),
    })
}

pub fn read_workbook_defined_names(source: &[u8]) -> Result<Vec<WorkbookDefinedName>, String> {
    let entries = load_package(source)?;
    let workbook = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    read_workbook_defined_names_xml(&workbook.data)
}

fn read_workbook_defined_names_xml(xml: &[u8]) -> Result<Vec<WorkbookDefinedName>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut sheets = Vec::new();
    let mut names = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 XLSX 命名区域失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sheet" =>
            {
                if let Some(name) = xml_value(event, b"name", reader.decoder())? {
                    sheets.push(name);
                }
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"definedName" => {
                if names.len() >= MAX_DEFINED_NAMES {
                    return Err(format!("XLSX 命名区域不能超过 {MAX_DEFINED_NAMES} 个"));
                }
                let name =
                    xml_value(event, b"name", reader.decoder())?.ok_or("XLSX 命名区域缺少名称")?;
                if name.is_empty() || name.chars().count() > MAX_DEFINED_NAME_LENGTH {
                    return Err("XLSX 命名区域名称无效".into());
                }
                let local_sheet_id = xml_value(event, b"localSheetId", reader.decoder())?
                    .map(|value| value.parse::<usize>().map_err(|_| "命名区域作用域无效"))
                    .transpose()?;
                let scope = local_sheet_id
                    .map(|index| sheets.get(index).cloned().ok_or("命名区域作用域越界"))
                    .transpose()?;
                let hidden = xml_value(event, b"hidden", reader.decoder())?
                    .is_some_and(|value| matches!(value.as_str(), "1" | "true"));
                let formula_text = reader
                    .read_text(event.name())
                    .map_err(|error| format!("读取 XLSX 命名区域公式失败: {error}"))?
                    .xml10_content()
                    .map_err(|error| format!("解码 XLSX 命名区域公式失败: {error}"))?;
                let formula = quick_xml::escape::unescape(&formula_text)
                    .map_err(|error| format!("还原 XLSX 命名区域公式失败: {error}"))?
                    .into_owned();
                if formula.chars().count() > MAX_DEFINED_NAME_FORMULA_LENGTH {
                    return Err("XLSX 命名区域公式过长".into());
                }
                let reference = defined_name_reference(&formula, scope.as_deref());
                names.push(WorkbookDefinedName {
                    name,
                    formula,
                    scope,
                    hidden,
                    reference,
                });
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(names)
}

fn parse_f64_attribute(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<f64>, String> {
    xml_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<f64>()
                .map_err(|_| format!("XLSX 尺寸属性无效: {value}"))
        })
        .transpose()
}

#[derive(Default)]
struct RowStructureAttributes {
    row: Option<usize>,
    height: Option<f64>,
    hidden: bool,
    outline_level: u8,
    collapsed: bool,
}

fn row_structure_attributes(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<RowStructureAttributes, String> {
    let mut result = RowStructureAttributes::default();
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析 XLSX XML 属性失败: {error}"))?;
        let key = attribute.key.as_ref();
        if !matches!(
            key,
            b"r" | b"ht" | b"hidden" | b"outlineLevel" | b"collapsed"
        ) {
            continue;
        }
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
            .map_err(|error| format!("解码 XLSX XML 属性失败: {error}"))?;
        match key {
            b"r" => {
                result.row = value
                    .parse::<usize>()
                    .ok()
                    .and_then(|value| value.checked_sub(1));
            }
            b"ht" => {
                result.height = Some(
                    value
                        .parse::<f64>()
                        .map_err(|_| format!("XLSX 尺寸属性无效: {value}"))?,
                );
            }
            b"hidden" => result.hidden = matches!(value.as_ref(), "1" | "true"),
            b"outlineLevel" => {
                result.outline_level = value.parse::<u8>().unwrap_or(0).min(7);
            }
            b"collapsed" => result.collapsed = matches!(value.as_ref(), "1" | "true"),
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn read_sheet_structure(
    xml: &[u8],
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<SheetStructureSummary, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut default_row_height = 15.0;
    let mut default_column_width = 8.43;
    let mut row_heights = Vec::new();
    let mut column_widths = Vec::new();
    let mut row_states = Vec::new();
    let mut column_states = Vec::new();
    let mut merged_cells = Vec::new();
    let mut freeze_pane = WorkbookFreezePane::default();
    let mut auto_filter = None;
    let mut data_validations = Vec::new();
    let mut current_validation: Option<WorkbookDataValidation> = None;
    let mut validation_formula: Option<u8> = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表结构失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sheetFormatPr" =>
            {
                if let Some(height) =
                    parse_f64_attribute(event, b"defaultRowHeight", reader.decoder())?
                {
                    if height.is_finite() && height > 0.0 {
                        default_row_height = height;
                    }
                }
                if let Some(width) =
                    parse_f64_attribute(event, b"defaultColWidth", reader.decoder())?
                {
                    if width.is_finite() && width > 0.0 {
                        default_column_width = width;
                    }
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pane" =>
            {
                let state = xml_value(event, b"state", reader.decoder())?;
                if matches!(state.as_deref(), Some("frozen" | "frozenSplit")) {
                    let rows = parse_f64_attribute(event, b"ySplit", reader.decoder())?
                        .unwrap_or_default();
                    let columns = parse_f64_attribute(event, b"xSplit", reader.decoder())?
                        .unwrap_or_default();
                    if rows >= 0.0
                        && columns >= 0.0
                        && rows.fract() == 0.0
                        && columns.fract() == 0.0
                    {
                        freeze_pane = WorkbookFreezePane {
                            rows: (rows as usize).min(MAX_XLSX_ROWS),
                            columns: (columns as usize).min(MAX_XLSX_COLUMNS),
                        };
                    }
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"autoFilter" =>
            {
                if let Some(reference) = xml_value(event, b"ref", reader.decoder())? {
                    auto_filter = Some(parse_range_reference(&reference)?);
                }
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"dataValidation" => {
                if data_validations.len() >= MAX_DATA_VALIDATIONS {
                    return Err(format!("数据验证不能超过 {MAX_DATA_VALIDATIONS} 条"));
                }
                current_validation = Some(validation_from_event(event, reader.decoder())?);
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"dataValidation" => {
                if data_validations.len() >= MAX_DATA_VALIDATIONS {
                    return Err(format!("数据验证不能超过 {MAX_DATA_VALIDATIONS} 条"));
                }
                data_validations.push(validation_from_event(event, reader.decoder())?);
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"formula1" => {
                validation_formula = Some(1);
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"formula2" => {
                validation_formula = Some(2);
            }
            Event::Text(ref event) if validation_formula.is_some() => {
                let decoded = event
                    .xml10_content()
                    .map_err(|error| format!("解码数据验证公式失败: {error}"))?;
                let value = quick_xml::escape::unescape(&decoded)
                    .map_err(|error| format!("还原数据验证公式失败: {error}"))?
                    .into_owned();
                if value.chars().count() > MAX_FORMULA_TEXT {
                    return Err("数据验证公式过长".into());
                }
                if let Some(validation) = current_validation.as_mut() {
                    if validation_formula == Some(1) {
                        validation.formula1 = Some(value);
                    } else {
                        validation.formula2 = Some(value);
                    }
                }
            }
            Event::End(ref event)
                if matches!(event.local_name().as_ref(), b"formula1" | b"formula2") =>
            {
                validation_formula = None;
            }
            Event::End(ref event) if event.local_name().as_ref() == b"dataValidation" => {
                if let Some(validation) = current_validation.take() {
                    data_validations.push(validation);
                }
                validation_formula = None;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"row" =>
            {
                let attributes = row_structure_attributes(event, reader.decoder())?;
                if let (Some(row), Some(height)) = (attributes.row, attributes.height) {
                    if row >= row_start && row < row_end && height.is_finite() && height > 0.0 {
                        row_heights.push(WorkbookRowHeight { row, height });
                    }
                }
                if let Some(row) = attributes.row {
                    if row >= row_start
                        && row < row_end
                        && (attributes.hidden
                            || attributes.collapsed
                            || attributes.outline_level > 0)
                    {
                        row_states.push(WorkbookRowState {
                            row,
                            hidden: attributes.hidden,
                            outline_level: attributes.outline_level,
                            collapsed: attributes.collapsed,
                        });
                    }
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"col" =>
            {
                let min = xml_value(event, b"min", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok());
                let max = xml_value(event, b"max", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok());
                let width = parse_f64_attribute(event, b"width", reader.decoder())?;
                if let (Some(min), Some(max), Some(width)) = (min, max, width) {
                    if min > 0 && max >= min && width.is_finite() && width > 0.0 {
                        let start_column = min - 1;
                        let end_column = (max - 1).min(max_columns.saturating_sub(1));
                        if start_column <= end_column && start_column < max_columns {
                            column_widths.push(WorkbookColumnWidth {
                                start_column,
                                end_column,
                                width,
                            });
                        }
                    }
                }
                if let (Some(min), Some(max)) = (min, max) {
                    if min > 0 && max >= min {
                        let start_column = min - 1;
                        let end_column = (max - 1).min(max_columns.saturating_sub(1));
                        let hidden = bool_attribute(event, b"hidden", reader.decoder(), false)?;
                        let collapsed =
                            bool_attribute(event, b"collapsed", reader.decoder(), false)?;
                        let outline_level = xml_value(event, b"outlineLevel", reader.decoder())?
                            .and_then(|value| value.parse::<u8>().ok())
                            .unwrap_or(0)
                            .min(7);
                        if start_column <= end_column
                            && start_column < max_columns
                            && (hidden || collapsed || outline_level > 0)
                        {
                            column_states.push(WorkbookColumnState {
                                start_column,
                                end_column,
                                hidden,
                                outline_level,
                                collapsed,
                            });
                        }
                    }
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"mergeCell" =>
            {
                let reference =
                    xml_value(event, b"ref", reader.decoder())?.ok_or("合并单元格缺少范围")?;
                let mut parts = reference.split(':');
                let (top, left) = parse_cell_reference(parts.next().unwrap_or_default())?;
                let (bottom, right) = parse_cell_reference(parts.next().unwrap_or(&reference))?;
                if parts.next().is_some() || bottom < top || right < left {
                    return Err(format!("合并单元格范围无效: {reference}"));
                }
                if left < max_columns && bottom >= row_start && top < row_end {
                    merged_cells.push(WorkbookMergeRange {
                        top,
                        bottom,
                        left,
                        right,
                    });
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    row_heights.sort_by_key(|item| item.row);
    column_widths.sort_by_key(|item| (item.start_column, item.end_column));
    row_states.sort_by_key(|item| item.row);
    column_states.sort_by_key(|item| (item.start_column, item.end_column));
    merged_cells.sort_by_key(|item| (item.top, item.left, item.bottom, item.right));
    Ok(SheetStructureSummary {
        default_row_height,
        default_column_width,
        row_heights,
        column_widths,
        row_states,
        column_states,
        merged_cells,
        freeze_pane,
        auto_filter,
        data_validations,
    })
}

fn related_part_path(source_part: &str, target: &str) -> Result<String, String> {
    let mut parts = if target.starts_with('/') {
        Vec::new()
    } else {
        source_part
            .split('/')
            .take(source_part.split('/').count().saturating_sub(1))
            .map(str::to_string)
            .collect::<Vec<_>>()
    };
    for part in target.trim_start_matches('/').replace('\\', "/").split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop().ok_or("OOXML 关系路径越界")?;
            }
            value => parts.push(value.to_string()),
        }
    }
    let path = parts.join("/");
    if !path.starts_with("xl/") || path.split('/').any(|part| part == "..") {
        return Err("OOXML 关系目标越过 xl 包边界".into());
    }
    Ok(path)
}

fn part_relationships(
    entries: &[PackageEntry],
    source_path: &str,
) -> Result<HashMap<String, String>, String> {
    let (directory, file_name) = source_path.rsplit_once('/').ok_or("OOXML 部件路径无效")?;
    let relationship_path = format!("{directory}/_rels/{file_name}.rels");
    let Some(relationships) = entries.iter().find(|entry| entry.name == relationship_path) else {
        return Ok(HashMap::new());
    };
    let mut result = HashMap::new();
    let mut reader = Reader::from_reader(relationships.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表关系失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"Relationship" =>
            {
                let id = xml_value(event, b"Id", reader.decoder())?;
                let target = xml_value(event, b"Target", reader.decoder())?;
                let external = xml_value(event, b"TargetMode", reader.decoder())?
                    .is_some_and(|value| value.eq_ignore_ascii_case("external"));
                if let (Some(id), Some(target)) = (id, target) {
                    if !external {
                        result.insert(id, related_part_path(source_path, &target)?);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn read_sheet_tables(
    entries: &[PackageEntry],
    sheet_path: &str,
    sheet_xml: &[u8],
) -> Result<Vec<WorkbookTable>, String> {
    let relationships = part_relationships(entries, sheet_path)?;
    let mut relation_ids = Vec::new();
    let mut reader = Reader::from_reader(sheet_xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表 Table 引用失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"tablePart" =>
            {
                if let Some(id) = xml_value(event, b"r:id", reader.decoder())? {
                    relation_ids.push(id);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if relation_ids.len() > 1_024 {
        return Err("单个工作表的 Excel Table 不能超过 1024 个".into());
    }
    let mut tables = Vec::new();
    for relation_id in relation_ids {
        let path = relationships
            .get(&relation_id)
            .ok_or_else(|| format!("Table 关系不存在: {relation_id}"))?;
        let part = entries
            .iter()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("Table 部件不存在: {path}"))?;
        let mut reader = Reader::from_reader(part.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        let mut table: Option<WorkbookTable> = None;
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel Table 失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"table" =>
                {
                    let name = xml_value(event, b"name", reader.decoder())?
                        .ok_or("Excel Table 缺少 name")?;
                    let display_name = xml_value(event, b"displayName", reader.decoder())?
                        .unwrap_or_else(|| name.clone());
                    let reference = xml_value(event, b"ref", reader.decoder())?
                        .ok_or("Excel Table 缺少 ref")?;
                    table = Some(WorkbookTable {
                        name,
                        display_name,
                        range: parse_range_reference(&reference)?,
                        columns: Vec::new(),
                        totals_row_shown: bool_attribute(
                            event,
                            b"totalsRowShown",
                            reader.decoder(),
                            false,
                        )?,
                        style_name: None,
                    });
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"tableColumn" =>
                {
                    if let (Some(table), Some(name)) =
                        (table.as_mut(), xml_value(event, b"name", reader.decoder())?)
                    {
                        if table.columns.len() >= MAX_XLSX_COLUMNS {
                            return Err("Excel Table 列数超过 XLSX 上限".into());
                        }
                        table.columns.push(name);
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"tableStyleInfo" =>
                {
                    if let Some(table) = table.as_mut() {
                        table.style_name = xml_value(event, b"name", reader.decoder())?;
                    }
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        tables.push(table.ok_or("Excel Table 部件缺少 table 根节点")?);
    }
    Ok(tables)
}

#[derive(Default)]
struct PendingDrawing {
    id: String,
    name: String,
    description: Option<String>,
    kind: String,
    from: WorkbookDrawingAnchor,
    to: Option<WorkbookDrawingAnchor>,
    relation_id: Option<String>,
}

fn chart_type_from_name(name: &[u8]) -> Option<&'static str> {
    match name {
        b"barChart" => Some("bar"),
        b"lineChart" => Some("line"),
        b"pieChart" => Some("pie"),
        b"pie3DChart" => Some("pie_3d"),
        b"doughnutChart" => Some("doughnut"),
        b"areaChart" => Some("area"),
        b"scatterChart" => Some("scatter"),
        b"bubbleChart" => Some("bubble"),
        b"radarChart" => Some("radar"),
        b"stockChart" => Some("stock"),
        b"surfaceChart" | b"surface3DChart" => Some("surface"),
        _ => None,
    }
}

fn parse_chart_part(xml: &[u8]) -> Result<WorkbookChart, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut chart_type = "unknown".to_string();
    let mut title_parts = Vec::new();
    let mut series = Vec::new();
    let mut current_series: Option<WorkbookChartSeries> = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Excel 图表失败: {error}"))?
        {
            Event::Start(ref event) => {
                let local = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                if chart_type == "unknown" {
                    if let Some(value) = chart_type_from_name(event.local_name().as_ref()) {
                        chart_type = value.into();
                    }
                }
                if local == "barDir" && chart_type == "bar" {
                    if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                        chart_type = if value == "col" { "column" } else { "bar" }.into();
                    }
                }
                if local == "ser" {
                    if series.len() >= MAX_CHART_SERIES {
                        return Err(format!("单个图表系列不能超过 {MAX_CHART_SERIES} 个"));
                    }
                    current_series = Some(WorkbookChartSeries {
                        name: None,
                        categories: None,
                        values: None,
                    });
                }
                stack.push(local);
            }
            Event::Empty(ref event) => {
                let local = event.local_name();
                if chart_type == "unknown" {
                    if let Some(value) = chart_type_from_name(local.as_ref()) {
                        chart_type = value.into();
                    }
                }
                if local.as_ref() == b"barDir" && chart_type == "bar" {
                    if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                        chart_type = if value == "col" { "column" } else { "bar" }.into();
                    }
                }
            }
            Event::Text(ref event) => {
                let decoded = event
                    .xml10_content()
                    .map_err(|error| format!("解码 Excel 图表文本失败: {error}"))?;
                let value = quick_xml::escape::unescape(&decoded)
                    .map_err(|error| format!("还原 Excel 图表文本失败: {error}"))?
                    .into_owned();
                if value.chars().count() > MAX_FORMULA_TEXT {
                    return Err("Excel 图表公式或文本过长".into());
                }
                let last = stack.last().map(String::as_str);
                if stack.iter().any(|item| item == "title")
                    && last == Some("t")
                    && title_parts.iter().map(String::len).sum::<usize>() + value.len()
                        <= MAX_DRAWING_TEXT
                {
                    title_parts.push(value.clone());
                }
                if let Some(item) = current_series.as_mut() {
                    if last == Some("f") {
                        if stack.iter().any(|entry| entry == "cat") {
                            item.categories = Some(value.clone());
                        } else if stack
                            .iter()
                            .any(|entry| matches!(entry.as_str(), "val" | "yVal"))
                        {
                            item.values = Some(value.clone());
                        } else if stack.iter().any(|entry| entry == "xVal") {
                            item.categories = Some(value.clone());
                        } else if stack.iter().any(|entry| entry == "tx") {
                            item.name = Some(value.clone());
                        }
                    } else if last == Some("v") && stack.iter().any(|entry| entry == "tx") {
                        item.name = Some(value);
                    }
                }
            }
            Event::End(ref event) => {
                if event.local_name().as_ref() == b"ser" {
                    if let Some(item) = current_series.take() {
                        series.push(item);
                    }
                }
                stack.pop();
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let title = (!title_parts.is_empty()).then(|| title_parts.join(""));
    Ok(WorkbookChart {
        chart_type,
        title,
        series,
    })
}

fn read_sheet_drawings(
    entries: &[PackageEntry],
    sheet_path: &str,
    sheet_xml: &[u8],
) -> Result<Vec<WorkbookDrawingObject>, String> {
    let sheet_relations = part_relationships(entries, sheet_path)?;
    let mut drawing_ids = Vec::new();
    let mut reader = Reader::from_reader(sheet_xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表 Drawing 引用失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"drawing" =>
            {
                if let Some(id) = xml_value(event, b"r:id", reader.decoder())? {
                    drawing_ids.push(id);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut result = Vec::new();
    for drawing_id in drawing_ids {
        let drawing_path = sheet_relations
            .get(&drawing_id)
            .ok_or_else(|| format!("Drawing 关系不存在: {drawing_id}"))?;
        let drawing_part = entries
            .iter()
            .find(|entry| &entry.name == drawing_path)
            .ok_or_else(|| format!("Drawing 部件不存在: {drawing_path}"))?;
        let drawing_relations = part_relationships(entries, drawing_path)?;
        let mut reader = Reader::from_reader(drawing_part.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        let mut current: Option<PendingDrawing> = None;
        let mut anchor_section: Option<bool> = None;
        let mut anchor_field: Option<String> = None;
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Drawing 对象失败: {error}"))?
            {
                Event::Start(ref event)
                    if matches!(
                        event.local_name().as_ref(),
                        b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                    ) =>
                {
                    if result.len() >= MAX_DRAWING_OBJECTS {
                        return Err(format!(
                            "单个 Sheet 绘图对象不能超过 {MAX_DRAWING_OBJECTS} 个"
                        ));
                    }
                    current = Some(PendingDrawing::default());
                }
                Event::Start(ref event) if event.local_name().as_ref() == b"from" => {
                    anchor_section = Some(false);
                }
                Event::Start(ref event) if event.local_name().as_ref() == b"to" => {
                    anchor_section = Some(true);
                    if let Some(item) = current.as_mut() {
                        item.to = Some(WorkbookDrawingAnchor::default());
                    }
                }
                Event::Start(ref event)
                    if matches!(
                        event.local_name().as_ref(),
                        b"row" | b"col" | b"rowOff" | b"colOff"
                    ) && anchor_section.is_some() =>
                {
                    anchor_field =
                        Some(String::from_utf8_lossy(event.local_name().as_ref()).into_owned());
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"graphicFrame" =>
                {
                    if let Some(item) = current.as_mut() {
                        item.kind = "chart".into();
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"pic" =>
                {
                    if let Some(item) = current.as_mut() {
                        item.kind = "image".into();
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if matches!(event.local_name().as_ref(), b"sp" | b"cxnSp" | b"grpSp") =>
                {
                    if let Some(item) = current.as_mut() {
                        if item.kind.is_empty() {
                            item.kind = "shape".into();
                        }
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"cNvPr" =>
                {
                    if let Some(item) = current.as_mut() {
                        if item.id.is_empty() {
                            item.id = xml_value(event, b"id", reader.decoder())?
                                .unwrap_or_else(|| (result.len() + 1).to_string());
                            item.name = xml_value(event, b"name", reader.decoder())?
                                .unwrap_or_else(|| format!("Drawing {}", item.id));
                            item.description = xml_value(event, b"descr", reader.decoder())?;
                        }
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"chart" =>
                {
                    if let Some(item) = current.as_mut() {
                        item.kind = "chart".into();
                        item.relation_id = xml_value(event, b"r:id", reader.decoder())?;
                    }
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"blip" =>
                {
                    if let Some(item) = current.as_mut() {
                        item.kind = "image".into();
                        item.relation_id = xml_value(event, b"r:embed", reader.decoder())?;
                    }
                }
                Event::Text(ref event) if anchor_field.is_some() => {
                    let value = event
                        .xml10_content()
                        .map_err(|error| format!("解码 Drawing 锚点失败: {error}"))?
                        .parse::<i64>()
                        .map_err(|_| "Drawing 锚点不是整数")?;
                    if let (Some(item), Some(section), Some(field)) =
                        (current.as_mut(), anchor_section, anchor_field.as_deref())
                    {
                        let anchor = if section {
                            item.to.get_or_insert_with(WorkbookDrawingAnchor::default)
                        } else {
                            &mut item.from
                        };
                        match field {
                            "row" if value >= 0 => anchor.row = value as usize,
                            "col" if value >= 0 => anchor.column = value as usize,
                            "rowOff" => anchor.row_offset = value,
                            "colOff" => anchor.column_offset = value,
                            _ => {}
                        }
                    }
                }
                Event::End(ref event) if matches!(event.local_name().as_ref(), b"from" | b"to") => {
                    anchor_section = None;
                    anchor_field = None;
                }
                Event::End(ref event)
                    if matches!(
                        event.local_name().as_ref(),
                        b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                    ) =>
                {
                    if let Some(item) = current.take() {
                        let part = item
                            .relation_id
                            .as_ref()
                            .and_then(|id| drawing_relations.get(id))
                            .cloned();
                        let chart = if item.kind == "chart" {
                            part.as_ref()
                                .and_then(|path| entries.iter().find(|entry| &entry.name == path))
                                .map(|entry| parse_chart_part(&entry.data))
                                .transpose()?
                        } else {
                            None
                        };
                        result.push(WorkbookDrawingObject {
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            kind: if item.kind.is_empty() {
                                "unknown".into()
                            } else {
                                item.kind
                            },
                            from: item.from,
                            to: item.to,
                            part,
                            chart,
                        });
                    }
                }
                Event::End(ref event)
                    if matches!(
                        event.local_name().as_ref(),
                        b"row" | b"col" | b"rowOff" | b"colOff"
                    ) =>
                {
                    anchor_field = None;
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
    }
    Ok(result)
}

#[derive(Default)]
struct PivotCacheMetadata {
    source_type: String,
    source_sheet: Option<String>,
    source_range: Option<String>,
    connection_id: Option<u32>,
    refresh_on_load: bool,
}

fn bounded_linked_data_text(value: String) -> Result<String, String> {
    if value.chars().count() > MAX_LINKED_DATA_TEXT {
        return Err("Excel 外部数据元数据过长".into());
    }
    Ok(value)
}

fn parse_u32_value(value: Option<String>) -> Option<u32> {
    value.and_then(|value| value.parse().ok())
}

fn external_target_kind(target: &str) -> String {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        "web".into()
    } else if lower.starts_with("file:") || lower.starts_with("\\\\") || lower.contains(':') {
        "file".into()
    } else {
        "relative_file".into()
    }
}

fn external_relationship_summary(
    entries: &[PackageEntry],
) -> Result<(usize, HashMap<String, String>), String> {
    let mut count = 0usize;
    let mut by_source = HashMap::new();
    for entry in entries.iter().filter(|entry| entry.name.ends_with(".rels")) {
        let mut reader = Reader::from_reader(entry.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 外部关系失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"Relationship" =>
                {
                    let external = xml_value(event, b"TargetMode", reader.decoder())?
                        .is_some_and(|value| value.eq_ignore_ascii_case("external"));
                    if external {
                        count = count.saturating_add(1);
                        if count > MAX_LINKED_DATA_OBJECTS {
                            return Err("Excel 外部关系数量过多".into());
                        }
                        if let Some(target) = xml_value(event, b"Target", reader.decoder())? {
                            by_source
                                .entry(entry.name.clone())
                                .or_insert_with(|| external_target_kind(&target));
                        }
                    }
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
    }
    Ok((count, by_source))
}

fn parse_pivot_cache_metadata(xml: &[u8]) -> Result<PivotCacheMetadata, String> {
    let mut result = PivotCacheMetadata::default();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Cache 失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pivotCacheDefinition" =>
            {
                result.refresh_on_load =
                    bool_attribute(event, b"refreshOnLoad", reader.decoder(), false)?;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"cacheSource" =>
            {
                result.source_type = bounded_linked_data_text(
                    xml_value(event, b"type", reader.decoder())?
                        .unwrap_or_else(|| "unknown".into()),
                )?;
                result.connection_id =
                    parse_u32_value(xml_value(event, b"connectionId", reader.decoder())?);
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"worksheetSource" =>
            {
                result.source_sheet = xml_value(event, b"sheet", reader.decoder())?
                    .map(bounded_linked_data_text)
                    .transpose()?;
                result.source_range = xml_value(event, b"ref", reader.decoder())?
                    .map(bounded_linked_data_text)
                    .transpose()?;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if result.source_type.is_empty() {
        result.source_type = "unknown".into();
    }
    Ok(result)
}

pub fn read_workbook_linked_data(source: &[u8]) -> Result<WorkbookLinkedData, String> {
    let entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let mut part_sheets = HashMap::new();
    for (sheet, path) in &sheet_paths {
        for target in part_relationships(&entries, path)?.into_values() {
            if target.starts_with("xl/pivotTables/") || target.starts_with("xl/slicers/") {
                part_sheets.insert(target, sheet.clone());
            }
        }
    }

    let workbook = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let workbook_relations = part_relationships(&entries, "xl/workbook.xml")?;
    let mut cache_parts = HashMap::new();
    let mut reader = Reader::from_reader(workbook.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿 Pivot Cache 引用失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pivotCache" =>
            {
                let cache_id = parse_u32_value(xml_value(event, b"cacheId", reader.decoder())?);
                let relation_id = xml_value(event, b"r:id", reader.decoder())?;
                if let (Some(cache_id), Some(relation_id)) = (cache_id, relation_id) {
                    if let Some(path) = workbook_relations.get(&relation_id) {
                        cache_parts.insert(cache_id, path.clone());
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let mut cache_metadata = HashMap::new();
    for (cache_id, path) in cache_parts {
        if let Some(entry) = entries.iter().find(|entry| entry.name == path) {
            cache_metadata.insert(cache_id, parse_pivot_cache_metadata(&entry.data)?);
        }
    }

    let mut pivot_tables = Vec::new();
    for entry in entries
        .iter()
        .filter(|entry| entry.name.starts_with("xl/pivotTables/") && entry.name.ends_with(".xml"))
    {
        if pivot_tables.len() >= MAX_LINKED_DATA_OBJECTS {
            return Err("Excel 透视表数量过多".into());
        }
        let mut name = None;
        let mut cache_id = None;
        let mut reader = Reader::from_reader(entry.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 透视表失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"pivotTableDefinition" =>
                {
                    name = xml_value(event, b"name", reader.decoder())?
                        .map(bounded_linked_data_text)
                        .transpose()?;
                    cache_id = parse_u32_value(xml_value(event, b"cacheId", reader.decoder())?);
                    break;
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        let metadata = cache_id.and_then(|id| cache_metadata.get(&id));
        pivot_tables.push(WorkbookPivotTable {
            name: name.unwrap_or_else(|| entry.name.clone()),
            part: entry.name.clone(),
            sheet: part_sheets.get(&entry.name).cloned(),
            cache_id,
            source_type: metadata
                .map(|item| item.source_type.clone())
                .unwrap_or_else(|| "unknown".into()),
            source_sheet: metadata.and_then(|item| item.source_sheet.clone()),
            source_range: metadata.and_then(|item| item.source_range.clone()),
            connection_id: metadata.and_then(|item| item.connection_id),
            refresh_on_load: metadata.is_some_and(|item| item.refresh_on_load),
        });
    }

    let mut slicers = Vec::new();
    for entry in entries
        .iter()
        .filter(|entry| entry.name.starts_with("xl/slicers/") && entry.name.ends_with(".xml"))
    {
        if slicers.len() >= MAX_LINKED_DATA_OBJECTS {
            return Err("Excel 切片器数量过多".into());
        }
        let mut name = None;
        let mut cache_name = None;
        let mut reader = Reader::from_reader(entry.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 切片器失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"slicer" =>
                {
                    name = xml_value(event, b"name", reader.decoder())?
                        .map(bounded_linked_data_text)
                        .transpose()?;
                    cache_name = xml_value(event, b"cache", reader.decoder())?
                        .map(bounded_linked_data_text)
                        .transpose()?;
                    break;
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        slicers.push(WorkbookSlicer {
            name: name.unwrap_or_else(|| entry.name.clone()),
            part: entry.name.clone(),
            sheet: part_sheets.get(&entry.name).cloned(),
            cache_name,
        });
    }

    let (external_relationship_count, external_targets) = external_relationship_summary(&entries)?;
    let mut external_links = Vec::new();
    for entry in entries.iter().filter(|entry| {
        entry.name.starts_with("xl/externalLinks/externalLink") && entry.name.ends_with(".xml")
    }) {
        let mut kind = "unknown".to_string();
        let mut cached_item_count = 0usize;
        let mut reader = Reader::from_reader(entry.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 外部链接失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event) => {
                    kind = match event.local_name().as_ref() {
                        b"externalBook" => "external_workbook",
                        b"ddeLink" => "dde",
                        b"oleLink" => "ole",
                        _ => kind.as_str(),
                    }
                    .into();
                    if matches!(
                        event.local_name().as_ref(),
                        b"sheetData" | b"ddeItem" | b"oleItem"
                    ) {
                        cached_item_count = cached_item_count.saturating_add(1);
                    }
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        let (directory, file) = entry.name.rsplit_once('/').unwrap_or(("", &entry.name));
        let rel_path = format!("{directory}/_rels/{file}.rels");
        external_links.push(WorkbookExternalLink {
            part: entry.name.clone(),
            kind,
            cached_item_count,
            target_kind: external_targets.get(&rel_path).cloned(),
        });
    }

    let mut connections = Vec::new();
    if let Some(entry) = entries
        .iter()
        .find(|entry| entry.name == "xl/connections.xml")
    {
        let mut reader = Reader::from_reader(entry.data.as_slice());
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 数据连接失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"connection" =>
                {
                    if connections.len() >= MAX_LINKED_DATA_OBJECTS {
                        return Err("Excel 数据连接数量过多".into());
                    }
                    connections.push(WorkbookDataConnection {
                        id: parse_u32_value(xml_value(event, b"id", reader.decoder())?),
                        name: bounded_linked_data_text(
                            xml_value(event, b"name", reader.decoder())?
                                .unwrap_or_else(|| "Unnamed connection".into()),
                        )?,
                        kind: bounded_linked_data_text(
                            xml_value(event, b"type", reader.decoder())?
                                .unwrap_or_else(|| "unknown".into()),
                        )?,
                        refresh_on_load: bool_attribute(
                            event,
                            b"refreshOnLoad",
                            reader.decoder(),
                            false,
                        )?,
                        background: bool_attribute(event, b"background", reader.decoder(), false)?,
                        save_data: bool_attribute(event, b"saveData", reader.decoder(), false)?,
                    });
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
    }

    Ok(WorkbookLinkedData {
        pivot_tables,
        slicers,
        external_links,
        connections,
        external_relationship_count,
    })
}

pub fn read_workbook_protection(source: &[u8]) -> Result<WorkbookProtection, String> {
    let entries = load_package(source)?;
    let workbook = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let mut result = WorkbookProtection::default();
    let mut reader = Reader::from_reader(workbook.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿保护失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"workbookProtection" =>
            {
                result.lock_structure =
                    bool_attribute(event, b"lockStructure", reader.decoder(), false)?;
                result.lock_windows =
                    bool_attribute(event, b"lockWindows", reader.decoder(), false)?;
                result.lock_revision =
                    bool_attribute(event, b"lockRevision", reader.decoder(), false)?;
                result.password_protected =
                    xml_value(event, b"workbookPassword", reader.decoder())?.is_some()
                        || xml_value(event, b"revisionsPassword", reader.decoder())?.is_some()
                        || xml_value(event, b"workbookHashValue", reader.decoder())?.is_some();
                result.enabled = result.lock_structure
                    || result.lock_windows
                    || result.lock_revision
                    || result.password_protected;
                break;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn parse_page_layout(xml: &[u8]) -> Result<WorkbookPageLayout, String> {
    let mut result = WorkbookPageLayout::default();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Excel 页面布局失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pageMargins" =>
            {
                result.margins = WorkbookPageMargins {
                    left: parse_f64_attribute(event, b"left", reader.decoder())?,
                    right: parse_f64_attribute(event, b"right", reader.decoder())?,
                    top: parse_f64_attribute(event, b"top", reader.decoder())?,
                    bottom: parse_f64_attribute(event, b"bottom", reader.decoder())?,
                    header: parse_f64_attribute(event, b"header", reader.decoder())?,
                    footer: parse_f64_attribute(event, b"footer", reader.decoder())?,
                };
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pageSetup" =>
            {
                result.setup.orientation = xml_value(event, b"orientation", reader.decoder())?;
                result.setup.paper_size =
                    parse_u32_value(xml_value(event, b"paperSize", reader.decoder())?);
                result.setup.scale = parse_u32_value(xml_value(event, b"scale", reader.decoder())?);
                result.setup.fit_to_width =
                    parse_u32_value(xml_value(event, b"fitToWidth", reader.decoder())?);
                result.setup.fit_to_height =
                    parse_u32_value(xml_value(event, b"fitToHeight", reader.decoder())?);
                result.setup.first_page_number =
                    parse_u32_value(xml_value(event, b"firstPageNumber", reader.decoder())?);
                result.setup.horizontal_dpi =
                    parse_u32_value(xml_value(event, b"horizontalDpi", reader.decoder())?);
                result.setup.vertical_dpi =
                    parse_u32_value(xml_value(event, b"verticalDpi", reader.decoder())?);
                result.setup.black_and_white =
                    bool_attribute(event, b"blackAndWhite", reader.decoder(), false)?;
                result.setup.draft = bool_attribute(event, b"draft", reader.decoder(), false)?;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pageSetUpPr" =>
            {
                result.setup.fit_to_page =
                    bool_attribute(event, b"fitToPage", reader.decoder(), false)?;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"printOptions" =>
            {
                result.options = WorkbookPrintOptions {
                    grid_lines: bool_attribute(event, b"gridLines", reader.decoder(), false)?,
                    headings: bool_attribute(event, b"headings", reader.decoder(), false)?,
                    horizontal_centered: bool_attribute(
                        event,
                        b"horizontalCentered",
                        reader.decoder(),
                        false,
                    )?,
                    vertical_centered: bool_attribute(
                        event,
                        b"verticalCentered",
                        reader.decoder(),
                        false,
                    )?,
                };
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"headerFooter" =>
            {
                result.header_footer.different_odd_even =
                    bool_attribute(event, b"differentOddEven", reader.decoder(), false)?;
                result.header_footer.different_first_page =
                    bool_attribute(event, b"differentFirst", reader.decoder(), false)?;
                result.header_footer.scale_with_document =
                    bool_attribute(event, b"scaleWithDoc", reader.decoder(), true)?;
                result.header_footer.align_with_margins =
                    bool_attribute(event, b"alignWithMargins", reader.decoder(), true)?;
            }
            Event::Start(ref event)
                if matches!(
                    event.local_name().as_ref(),
                    b"oddHeader"
                        | b"oddFooter"
                        | b"evenHeader"
                        | b"evenFooter"
                        | b"firstHeader"
                        | b"firstFooter"
                ) =>
            {
                let field = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                let value = reader
                    .read_text(event.name())
                    .map_err(|error| format!("读取 Excel 页眉页脚失败: {error}"))?
                    .xml10_content()
                    .map_err(|error| format!("解码 Excel 页眉页脚失败: {error}"))?;
                let value = quick_xml::escape::unescape(&value)
                    .map_err(|error| format!("还原 Excel 页眉页脚失败: {error}"))?
                    .into_owned();
                if value.chars().count() > MAX_HEADER_FOOTER_TEXT {
                    return Err("Excel 页眉页脚文本过长".into());
                }
                match field.as_str() {
                    "oddHeader" => result.header_footer.odd_header = Some(value),
                    "oddFooter" => result.header_footer.odd_footer = Some(value),
                    "evenHeader" => result.header_footer.even_header = Some(value),
                    "evenFooter" => result.header_footer.even_footer = Some(value),
                    "firstHeader" => result.header_footer.first_header = Some(value),
                    "firstFooter" => result.header_footer.first_footer = Some(value),
                    _ => {}
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sheetProtection" =>
            {
                result.protection.enabled =
                    bool_attribute(event, b"sheet", reader.decoder(), false)?;
                result.protection.password_protected =
                    xml_value(event, b"password", reader.decoder())?.is_some()
                        || xml_value(event, b"hashValue", reader.decoder())?.is_some();
                for (attribute, label) in [
                    (b"objects".as_slice(), "objects"),
                    (b"scenarios".as_slice(), "scenarios"),
                    (b"formatCells".as_slice(), "format_cells"),
                    (b"formatColumns".as_slice(), "format_columns"),
                    (b"formatRows".as_slice(), "format_rows"),
                    (b"insertColumns".as_slice(), "insert_columns"),
                    (b"insertRows".as_slice(), "insert_rows"),
                    (b"deleteColumns".as_slice(), "delete_columns"),
                    (b"deleteRows".as_slice(), "delete_rows"),
                    (b"sort".as_slice(), "sort"),
                    (b"autoFilter".as_slice(), "auto_filter"),
                    (b"pivotTables".as_slice(), "pivot_tables"),
                    (b"selectLockedCells".as_slice(), "select_locked_cells"),
                    (b"selectUnlockedCells".as_slice(), "select_unlocked_cells"),
                ] {
                    if bool_attribute(event, attribute, reader.decoder(), false)? {
                        result.protection.blocked_actions.push(label.into());
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

pub fn read_workbook_sheet_layout(
    source: &[u8],
    sheet: &str,
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<WorkbookSheetLayout, String> {
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
    let workbook_xml = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let theme = entries
        .iter()
        .find(|entry| entry.name == "xl/theme/theme1.xml")
        .map(|entry| entry.data.as_slice());
    let catalog = parse_styles(&styles.data, theme)?;
    let extent = sheet_extent(&sheet_xml.data)?;
    let formulas = read_sheet_formulas(&sheet_xml.data, row_start, row_end, max_columns)?;
    let styles = read_sheet_style_ids(&sheet_xml.data, row_start, row_end, max_columns)?
        .into_iter()
        .map(|(coordinate, style_id)| (coordinate, catalog.public_style(style_id)))
        .collect();
    let structure = read_sheet_structure(&sheet_xml.data, row_start, row_end, max_columns)?;
    let tables = read_sheet_tables(&entries, sheet_path, &sheet_xml.data)?;
    let drawings = read_sheet_drawings(&entries, sheet_path, &sheet_xml.data)?;
    let mut page_layout = parse_page_layout(&sheet_xml.data)?;
    page_layout.print_area = read_workbook_defined_names_xml(&workbook_xml.data)?
        .into_iter()
        .find(|name| {
            name.name == "_xlnm.Print_Area"
                && name
                    .reference
                    .as_ref()
                    .is_some_and(|range| range.sheet == sheet)
        })
        .and_then(|name| name.reference)
        .map(|range| WorkbookMergeRange {
            top: range.top,
            bottom: range.bottom,
            left: range.left,
            right: range.right,
        });
    Ok(WorkbookSheetLayout {
        extent,
        formulas,
        styles,
        named_styles: catalog.named_styles(),
        default_row_height: structure.default_row_height,
        default_column_width: structure.default_column_width,
        row_heights: structure.row_heights,
        column_widths: structure.column_widths,
        row_states: structure.row_states,
        column_states: structure.column_states,
        merged_cells: structure.merged_cells,
        freeze_pane: structure.freeze_pane,
        auto_filter: structure.auto_filter,
        tables,
        data_validations: structure.data_validations,
        drawings,
        page_layout,
    })
}

pub fn validate_workbook_package(source: &[u8]) -> Result<(), String> {
    load_package(source).map(drop)
}

fn freeze_pane_event(rows: usize, columns: usize) -> Result<BytesStart<'static>, String> {
    let mut pane = BytesStart::new("pane");
    let x_split = columns.to_string();
    let y_split = rows.to_string();
    let top_left = cell_reference(rows, columns)?;
    if columns > 0 {
        pane.push_attribute(("xSplit", x_split.as_str()));
    }
    if rows > 0 {
        pane.push_attribute(("ySplit", y_split.as_str()));
    }
    pane.push_attribute(("topLeftCell", top_left.as_str()));
    pane.push_attribute((
        "activePane",
        if rows > 0 && columns > 0 {
            "bottomRight"
        } else if rows > 0 {
            "bottomLeft"
        } else {
            "topRight"
        },
    ));
    pane.push_attribute(("state", "frozen"));
    Ok(pane)
}

fn patch_freeze_pane_xml(xml: &[u8], rows: usize, columns: usize) -> Result<Vec<u8>, String> {
    if rows >= MAX_XLSX_ROWS || columns >= MAX_XLSX_COLUMNS {
        return Err("冻结窗格坐标超过 XLSX 上限".into());
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Cursor::new(Vec::with_capacity(xml.len() + 128)));
    let mut buffer = Vec::new();
    let mut inside_view = false;
    let mut found_view = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析冻结窗格失败: {error}"))?;
        match event {
            Event::Start(ref start)
                if !found_view && start.local_name().as_ref() == b"sheetView" =>
            {
                found_view = true;
                inside_view = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入工作表视图失败: {error}"))?;
                if rows > 0 || columns > 0 {
                    writer
                        .write_event(Event::Empty(freeze_pane_event(rows, columns)?))
                        .map_err(|error| format!("写入冻结窗格失败: {error}"))?;
                }
            }
            Event::Empty(ref start)
                if !found_view && start.local_name().as_ref() == b"sheetView" =>
            {
                found_view = true;
                if rows == 0 && columns == 0 {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("写入工作表视图失败: {error}"))?;
                } else {
                    writer
                        .write_event(Event::Start(start.to_owned()))
                        .map_err(|error| format!("写入冻结窗格失败: {error}"))?;
                    writer
                        .write_event(Event::Empty(freeze_pane_event(rows, columns)?))
                        .map_err(|error| format!("写入冻结窗格失败: {error}"))?;
                    writer
                        .write_event(Event::End(BytesEnd::new("sheetView")))
                        .map_err(|error| format!("写入冻结窗格失败: {error}"))?;
                }
            }
            Event::Empty(ref start) if inside_view && start.local_name().as_ref() == b"pane" => {}
            Event::Start(ref start) if inside_view && start.local_name().as_ref() == b"pane" => {
                reader
                    .read_to_end(start.name())
                    .map_err(|error| format!("跳过旧冻结窗格失败: {error}"))?;
            }
            Event::End(ref end) if inside_view && end.local_name().as_ref() == b"sheetView" => {
                inside_view = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表视图失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表视图失败: {error}"))?,
        }
        buffer.clear();
    }
    if !found_view && (rows > 0 || columns > 0) {
        return Err("工作表缺少可写入的 sheetView".into());
    }
    Ok(writer.into_inner().into_inner())
}

pub fn patch_workbook_freeze_pane(
    source: &[u8],
    sheet: &str,
    rows: usize,
    columns: usize,
) -> Result<Vec<u8>, String> {
    let mut entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let path = paths
        .get(sheet)
        .ok_or_else(|| format!("工作表不存在: {sheet}"))?;
    let original = &entries
        .iter()
        .find(|entry| &entry.name == path)
        .ok_or("工作表部件缺失")?
        .data;
    if parse_page_layout(original)?.protection.enabled {
        return Err("受保护的工作表不能修改；LongEdit 不会绕过 Excel 工作表保护".into());
    }
    let updated = patch_freeze_pane_xml(original, rows, columns)?;
    entries
        .iter_mut()
        .find(|entry| &entry.name == path)
        .ok_or("工作表部件缺失")?
        .data = updated;

    let cursor = Cursor::new(Vec::with_capacity(source.len() + 128));
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
        .map_err(|error| format!("完成冻结窗格写回失败: {error}"))
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

#[derive(Clone)]
struct ColumnRecord {
    start: usize,
    end: usize,
    event: BytesStart<'static>,
}

fn validate_row_height_edit(edit: &WorkbookRowHeightEdit) -> Result<(), String> {
    if edit.sheet.is_empty() || edit.sheet.chars().count() > 31 || edit.row >= MAX_XLSX_ROWS {
        return Err("行高编辑目标无效".into());
    }
    if let Some(height) = edit.height {
        if !height.is_finite() || !(MIN_ROW_HEIGHT..=MAX_ROW_HEIGHT).contains(&height) {
            return Err(format!(
                "行高必须在 {MIN_ROW_HEIGHT} 到 {MAX_ROW_HEIGHT} 磅之间"
            ));
        }
    }
    Ok(())
}

fn validate_column_width_edit(edit: &WorkbookColumnWidthEdit) -> Result<(), String> {
    if edit.sheet.is_empty()
        || edit.sheet.chars().count() > 31
        || edit.start_column > edit.end_column
        || edit.end_column >= MAX_XLSX_COLUMNS
    {
        return Err("列宽编辑目标无效".into());
    }
    if let Some(width) = edit.width {
        if !width.is_finite() || !(MIN_COLUMN_WIDTH..=MAX_COLUMN_WIDTH).contains(&width) {
            return Err(format!(
                "列宽必须在 {MIN_COLUMN_WIDTH} 到 {MAX_COLUMN_WIDTH} 之间"
            ));
        }
    }
    Ok(())
}

fn validate_merge_edit(edit: &WorkbookMergeEdit) -> Result<(), String> {
    if edit.sheet.is_empty()
        || edit.sheet.chars().count() > 31
        || edit.top > edit.bottom
        || edit.left > edit.right
        || edit.bottom >= MAX_XLSX_ROWS
        || edit.right >= MAX_XLSX_COLUMNS
        || (edit.top == edit.bottom && edit.left == edit.right)
        || !matches!(edit.action.as_str(), "merge" | "unmerge")
    {
        return Err("合并区域编辑无效".into());
    }
    Ok(())
}

fn ranges_overlap(left: &WorkbookMergeRange, right: &WorkbookMergeRange) -> bool {
    left.top <= right.bottom
        && right.top <= left.bottom
        && left.left <= right.right
        && right.left <= left.right
}

fn has_element(xml: &[u8], name: &[u8]) -> Result<bool, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表 XML 失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == name =>
            {
                return Ok(true)
            }
            Event::Eof => return Ok(false),
            _ => {}
        }
        buffer.clear();
    }
}

fn read_column_records(xml: &[u8]) -> Result<Vec<ColumnRecord>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut records = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表列定义失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"col" =>
            {
                let start = xml_value(event, b"min", reader.decoder())?
                    .ok_or("列定义缺少 min")?
                    .parse::<usize>()
                    .map_err(|_| "列定义 min 无效")?;
                let end = xml_value(event, b"max", reader.decoder())?
                    .ok_or("列定义缺少 max")?
                    .parse::<usize>()
                    .map_err(|_| "列定义 max 无效")?;
                if start == 0 || end < start || end > MAX_XLSX_COLUMNS {
                    return Err("列定义范围无效".into());
                }
                records.push(ColumnRecord {
                    start: start - 1,
                    end: end - 1,
                    event: event.to_owned().into_owned(),
                });
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    records.sort_by_key(|record| (record.start, record.end));
    if records
        .windows(2)
        .any(|window| window[0].end >= window[1].start)
    {
        return Err("工作表列定义存在重叠范围".into());
    }
    Ok(records)
}

fn raw_f64_attribute(event: &BytesStart<'_>, key: &[u8]) -> Result<Option<f64>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("读取列定义属性失败: {error}"))?;
        if attribute.key.as_ref() == key {
            let value =
                std::str::from_utf8(attribute.value.as_ref()).map_err(|_| "列宽属性不是 UTF-8")?;
            return value
                .parse::<f64>()
                .map(Some)
                .map_err(|_| format!("列宽属性无效: {value}"));
        }
    }
    Ok(None)
}

fn column_event(
    original: Option<&BytesStart<'_>>,
    start: usize,
    end: usize,
    width: Option<f64>,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("col");
    if let Some(original) = original {
        for attribute in original.attributes() {
            let attribute = attribute.map_err(|error| format!("读取列定义属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"min" | b"max" | b"width" | b"customWidth"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    let min = (start + 1).to_string();
    let max = (end + 1).to_string();
    let width_text = width.map(|value| value.to_string());
    event.push_attribute(("min", min.as_str()));
    event.push_attribute(("max", max.as_str()));
    if let Some(width_text) = &width_text {
        event.push_attribute(("width", width_text.as_str()));
        event.push_attribute(("customWidth", "1"));
    }
    Ok(event.into_owned())
}

fn apply_column_edit(
    records: Vec<ColumnRecord>,
    edit: &WorkbookColumnWidthEdit,
) -> Result<Vec<ColumnRecord>, String> {
    let mut output = Vec::with_capacity(records.len() + 3);
    let mut cursor = edit.start_column;
    for record in records {
        if record.end < edit.start_column || record.start > edit.end_column {
            output.push(record);
            continue;
        }
        if record.start < edit.start_column {
            output.push(ColumnRecord {
                start: record.start,
                end: edit.start_column - 1,
                event: column_event(
                    Some(&record.event),
                    record.start,
                    edit.start_column - 1,
                    raw_f64_attribute(&record.event, b"width")?,
                )?,
            });
        }
        let overlap_start = record.start.max(edit.start_column);
        let overlap_end = record.end.min(edit.end_column);
        if cursor < overlap_start && edit.width.is_some() {
            output.push(ColumnRecord {
                start: cursor,
                end: overlap_start - 1,
                event: column_event(None, cursor, overlap_start - 1, edit.width)?,
            });
        }
        output.push(ColumnRecord {
            start: overlap_start,
            end: overlap_end,
            event: column_event(Some(&record.event), overlap_start, overlap_end, edit.width)?,
        });
        cursor = overlap_end.saturating_add(1);
        if record.end > edit.end_column {
            output.push(ColumnRecord {
                start: edit.end_column + 1,
                end: record.end,
                event: column_event(
                    Some(&record.event),
                    edit.end_column + 1,
                    record.end,
                    raw_f64_attribute(&record.event, b"width")?,
                )?,
            });
        }
    }
    if cursor <= edit.end_column && edit.width.is_some() {
        output.push(ColumnRecord {
            start: cursor,
            end: edit.end_column,
            event: column_event(None, cursor, edit.end_column, edit.width)?,
        });
    }
    output.sort_by_key(|record| (record.start, record.end));
    Ok(output)
}

fn read_meaningful_cells(xml: &[u8]) -> Result<HashSet<(usize, usize)>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut current: Option<((usize, usize), usize, bool)> = None;
    let mut cells = HashSet::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表单元格内容失败: {error}"))?;
        match event {
            Event::Start(ref event) if event.local_name().as_ref() == b"c" => {
                let reference =
                    xml_value(event, b"r", reader.decoder())?.ok_or("工作表单元格缺少坐标")?;
                current = Some((parse_cell_reference(&reference)?, 1, false));
            }
            Event::Start(ref event) => {
                if let Some((_, depth, has_content)) = &mut current {
                    *depth += 1;
                    if matches!(event.local_name().as_ref(), b"f" | b"is") {
                        *has_content = true;
                    }
                }
            }
            Event::Text(ref text) => {
                if let Some((_, _, has_content)) = &mut current {
                    let bytes: &[u8] = text.as_ref();
                    if !bytes.iter().all(|byte| byte.is_ascii_whitespace()) {
                        *has_content = true;
                    }
                }
            }
            Event::End(ref event) => {
                if let Some((coordinate, depth, has_content)) = &mut current {
                    if event.local_name().as_ref() == b"c" && *depth == 1 {
                        if *has_content {
                            cells.insert(*coordinate);
                        }
                        current = None;
                    } else {
                        *depth = depth.saturating_sub(1);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(cells)
}

fn write_columns(writer: &mut Writer<Vec<u8>>, records: &[ColumnRecord]) -> Result<(), String> {
    if records.is_empty() {
        return Ok(());
    }
    writer
        .write_event(Event::Start(BytesStart::new("cols")))
        .map_err(|error| format!("写入列定义失败: {error}"))?;
    for record in records {
        writer
            .write_event(Event::Empty(record.event.borrow()))
            .map_err(|error| format!("写入列宽失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("cols")))
        .map_err(|error| format!("结束列定义失败: {error}"))
}

fn write_merge_cells(
    writer: &mut Writer<Vec<u8>>,
    ranges: &[WorkbookMergeRange],
) -> Result<(), String> {
    if ranges.is_empty() {
        return Ok(());
    }
    let count = ranges.len().to_string();
    let mut start = BytesStart::new("mergeCells");
    start.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(start))
        .map_err(|error| format!("写入合并区域失败: {error}"))?;
    for range in ranges {
        let reference = format!(
            "{}:{}",
            cell_reference(range.top, range.left)?,
            cell_reference(range.bottom, range.right)?
        );
        let mut event = BytesStart::new("mergeCell");
        event.push_attribute(("ref", reference.as_str()));
        writer
            .write_event(Event::Empty(event))
            .map_err(|error| format!("写入合并范围失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("mergeCells")))
        .map_err(|error| format!("结束合并区域失败: {error}"))
}

fn row_event_with_height(
    original: &BytesStart<'_>,
    height: Option<f64>,
) -> Result<BytesStart<'static>, String> {
    let mut row = BytesStart::new("row");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取行属性失败: {error}"))?;
        if !matches!(attribute.key.as_ref(), b"ht" | b"customHeight") {
            row.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    let height_text = height.map(|value| value.to_string());
    if let Some(height_text) = &height_text {
        row.push_attribute(("ht", height_text.as_str()));
        row.push_attribute(("customHeight", "1"));
    }
    Ok(row.into_owned())
}

fn write_height_row(writer: &mut Writer<Vec<u8>>, row: usize, height: f64) -> Result<(), String> {
    let row_number = (row + 1).to_string();
    let height_text = height.to_string();
    let mut event = BytesStart::new("row");
    event.push_attribute(("r", row_number.as_str()));
    event.push_attribute(("ht", height_text.as_str()));
    event.push_attribute(("customHeight", "1"));
    writer
        .write_event(Event::Empty(event))
        .map_err(|error| format!("创建自定义行高失败: {error}"))
}

fn skip_element(
    reader: &mut Reader<&[u8]>,
    name: &[u8],
    buffer: &mut Vec<u8>,
) -> Result<(), String> {
    let mut depth = 1usize;
    while depth > 0 {
        buffer.clear();
        match reader
            .read_event_into(buffer)
            .map_err(|error| format!("跳过工作表结构失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == name => depth += 1,
            Event::End(ref event) if event.local_name().as_ref() == name => depth -= 1,
            Event::Eof => return Err("工作表结构 XML 意外结束".into()),
            _ => {}
        }
    }
    Ok(())
}

fn patch_sheet_structure(
    xml: &[u8],
    row_edits: &[&WorkbookRowHeightEdit],
    column_edits: &[&WorkbookColumnWidthEdit],
    merge_edits: &[&WorkbookMergeEdit],
) -> Result<Vec<u8>, String> {
    let mut row_heights = BTreeMap::new();
    for edit in row_edits {
        validate_row_height_edit(edit)?;
        if row_heights.insert(edit.row, edit.height).is_some() {
            return Err("保存请求包含重复行高编辑".into());
        }
    }
    let mut column_ranges = Vec::new();
    for edit in column_edits {
        validate_column_width_edit(edit)?;
        if column_ranges
            .iter()
            .any(|(start, end)| *start <= edit.end_column && edit.start_column <= *end)
        {
            return Err("保存请求包含重叠列宽编辑".into());
        }
        column_ranges.push((edit.start_column, edit.end_column));
    }
    let mut columns = read_column_records(xml)?;
    for edit in column_edits {
        columns = apply_column_edit(columns, edit)?;
    }
    let mut merges = read_sheet_structure(xml, 0, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS)?.merged_cells;
    let meaningful_cells = read_meaningful_cells(xml)?;
    let mut seen_merge_edits = HashSet::new();
    for edit in merge_edits {
        validate_merge_edit(edit)?;
        let range = WorkbookMergeRange {
            top: edit.top,
            bottom: edit.bottom,
            left: edit.left,
            right: edit.right,
        };
        if !seen_merge_edits.insert((range.top, range.bottom, range.left, range.right)) {
            return Err("保存请求包含重复合并区域编辑".into());
        }
        if edit.action == "unmerge" {
            let index = merges
                .iter()
                .position(|item| item == &range)
                .ok_or_else(|| {
                    format!(
                        "找不到要取消的合并区域 {}:{}",
                        cell_reference(range.top, range.left).unwrap_or_default(),
                        cell_reference(range.bottom, range.right).unwrap_or_default()
                    )
                })?;
            merges.remove(index);
        } else {
            if merges.iter().any(|item| ranges_overlap(item, &range)) {
                return Err("新的合并区域与已有合并区域重叠".into());
            }
            for row in range.top..=range.bottom {
                for column in range.left..=range.right {
                    if (row != range.top || column != range.left)
                        && meaningful_cells.contains(&(row, column))
                    {
                        return Err(format!(
                            "合并区域包含非空单元格 {}，为避免数据丢失已拒绝保存",
                            cell_reference(row, column)?
                        ));
                    }
                }
            }
            merges.push(range);
        }
    }
    merges.sort_by_key(|item| (item.top, item.left, item.bottom, item.right));

    let has_columns = has_element(xml, b"cols")?;
    let has_merges = has_element(xml, b"mergeCells")?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut inside_sheet_data = false;
    let mut pending_rows = row_heights;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表结构失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"cols" => {
                skip_element(&mut reader, b"cols", &mut buffer)?;
                write_columns(&mut writer, &columns)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"cols" => {
                write_columns(&mut writer, &columns)?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"mergeCells" => {
                skip_element(&mut reader, b"mergeCells", &mut buffer)?;
                write_merge_cells(&mut writer, &merges)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"mergeCells" => {
                write_merge_cells(&mut writer, &merges)?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"sheetData" => {
                if !has_columns && !column_edits.is_empty() {
                    write_columns(&mut writer, &columns)?;
                }
                inside_sheet_data = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入工作表数据失败: {error}"))?;
            }
            Event::Start(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?
                    .checked_sub(1)
                    .ok_or("工作表行号无效")?;
                let missing = pending_rows
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in missing {
                    if let Some(Some(height)) = pending_rows.remove(&missing_row) {
                        write_height_row(&mut writer, missing_row, height)?;
                    }
                }
                if let Some(height) = pending_rows.remove(&row) {
                    writer
                        .write_event(Event::Start(row_event_with_height(start, height)?))
                        .map_err(|error| format!("写入自定义行高失败: {error}"))?;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制工作表行失败: {error}"))?;
                }
            }
            Event::Empty(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?
                    .checked_sub(1)
                    .ok_or("工作表行号无效")?;
                let missing = pending_rows
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in missing {
                    if let Some(Some(height)) = pending_rows.remove(&missing_row) {
                        write_height_row(&mut writer, missing_row, height)?;
                    }
                }
                let replacement = pending_rows.remove(&row);
                writer
                    .write_event(Event::Empty(if let Some(height) = replacement {
                        row_event_with_height(start, height)?
                    } else {
                        start.to_owned().into_owned()
                    }))
                    .map_err(|error| format!("写入空工作表行失败: {error}"))?;
            }
            Event::End(ref end)
                if inside_sheet_data && end.local_name().as_ref() == b"sheetData" =>
            {
                for (row, height) in std::mem::take(&mut pending_rows) {
                    if let Some(height) = height {
                        write_height_row(&mut writer, row, height)?;
                    }
                }
                inside_sheet_data = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表数据失败: {error}"))?;
                if !has_merges && !merges.is_empty() {
                    write_merge_cells(&mut writer, &merges)?;
                }
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"sheetData" => {
                if !has_columns && !column_edits.is_empty() {
                    write_columns(&mut writer, &columns)?;
                }
                writer
                    .write_event(Event::Start(start.to_owned()))
                    .map_err(|error| format!("扩展工作表数据失败: {error}"))?;
                for (row, height) in std::mem::take(&mut pending_rows) {
                    if let Some(height) = height {
                        write_height_row(&mut writer, row, height)?;
                    }
                }
                writer
                    .write_event(Event::End(BytesEnd::new("sheetData")))
                    .map_err(|error| format!("结束工作表数据失败: {error}"))?;
                if !has_merges && !merges.is_empty() {
                    write_merge_cells(&mut writer, &merges)?;
                }
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表结构失败: {error}"))?,
        }
        buffer.clear();
    }
    if !pending_rows.is_empty() {
        return Err("XLSX 工作表缺少可写入的 sheetData".into());
    }
    Ok(writer.into_inner())
}

fn validate_row_state_edit(edit: &WorkbookRowStateEdit) -> Result<(), String> {
    if edit.sheet.is_empty()
        || edit.sheet.chars().count() > 31
        || edit.row >= MAX_XLSX_ROWS
        || edit.outline_level > 7
    {
        return Err("行隐藏分组编辑目标无效".into());
    }
    Ok(())
}

fn validate_column_state_edit(edit: &WorkbookColumnStateEdit) -> Result<(), String> {
    if edit.sheet.is_empty()
        || edit.sheet.chars().count() > 31
        || edit.start_column > edit.end_column
        || edit.end_column >= MAX_XLSX_COLUMNS
        || edit.outline_level > 7
    {
        return Err("列隐藏分组编辑目标无效".into());
    }
    Ok(())
}

fn state_is_visible(hidden: bool, outline_level: u8, collapsed: bool) -> bool {
    hidden || outline_level > 0 || collapsed
}

fn push_outline_attributes(
    event: &mut BytesStart<'_>,
    hidden: bool,
    outline_level: u8,
    collapsed: bool,
) {
    let outline_text = outline_level.to_string();
    if hidden {
        event.push_attribute(("hidden", "1"));
    }
    if outline_level > 0 {
        event.push_attribute(("outlineLevel", outline_text.as_str()));
    }
    if collapsed {
        event.push_attribute(("collapsed", "1"));
    }
}

fn row_event_with_state(
    original: &BytesStart<'_>,
    edit: &WorkbookRowStateEdit,
) -> Result<BytesStart<'static>, String> {
    let mut row = BytesStart::new("row");
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取行状态属性失败: {error}"))?;
        if !matches!(
            attribute.key.as_ref(),
            b"hidden" | b"outlineLevel" | b"collapsed"
        ) {
            row.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    push_outline_attributes(&mut row, edit.hidden, edit.outline_level, edit.collapsed);
    Ok(row.into_owned())
}

fn write_state_row(
    writer: &mut Writer<Vec<u8>>,
    edit: &WorkbookRowStateEdit,
) -> Result<(), String> {
    if !state_is_visible(edit.hidden, edit.outline_level, edit.collapsed) {
        return Ok(());
    }
    let row_number = (edit.row + 1).to_string();
    let mut event = BytesStart::new("row");
    event.push_attribute(("r", row_number.as_str()));
    push_outline_attributes(&mut event, edit.hidden, edit.outline_level, edit.collapsed);
    writer
        .write_event(Event::Empty(event))
        .map_err(|error| format!("创建行隐藏分组状态失败: {error}"))
}

fn column_event_with_state(
    original: Option<&BytesStart<'_>>,
    start: usize,
    end: usize,
    edit: &WorkbookColumnStateEdit,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("col");
    if let Some(original) = original {
        for attribute in original.attributes() {
            let attribute = attribute.map_err(|error| format!("读取列状态属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"min" | b"max" | b"hidden" | b"outlineLevel" | b"collapsed"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    let min = (start + 1).to_string();
    let max = (end + 1).to_string();
    event.push_attribute(("min", min.as_str()));
    event.push_attribute(("max", max.as_str()));
    push_outline_attributes(&mut event, edit.hidden, edit.outline_level, edit.collapsed);
    Ok(event.into_owned())
}

fn apply_column_state_edit(
    records: Vec<ColumnRecord>,
    edit: &WorkbookColumnStateEdit,
) -> Result<Vec<ColumnRecord>, String> {
    let mut output = Vec::with_capacity(records.len() + 3);
    let mut cursor = edit.start_column;
    for record in records {
        if record.end < edit.start_column || record.start > edit.end_column {
            output.push(record);
            continue;
        }
        if record.start < edit.start_column {
            output.push(ColumnRecord {
                start: record.start,
                end: edit.start_column - 1,
                event: column_event(
                    Some(&record.event),
                    record.start,
                    edit.start_column - 1,
                    raw_f64_attribute(&record.event, b"width")?,
                )?,
            });
        }
        let overlap_start = record.start.max(edit.start_column);
        let overlap_end = record.end.min(edit.end_column);
        if cursor < overlap_start
            && state_is_visible(edit.hidden, edit.outline_level, edit.collapsed)
        {
            output.push(ColumnRecord {
                start: cursor,
                end: overlap_start - 1,
                event: column_event_with_state(None, cursor, overlap_start - 1, edit)?,
            });
        }
        output.push(ColumnRecord {
            start: overlap_start,
            end: overlap_end,
            event: column_event_with_state(Some(&record.event), overlap_start, overlap_end, edit)?,
        });
        cursor = overlap_end.saturating_add(1);
        if record.end > edit.end_column {
            output.push(ColumnRecord {
                start: edit.end_column + 1,
                end: record.end,
                event: column_event(
                    Some(&record.event),
                    edit.end_column + 1,
                    record.end,
                    raw_f64_attribute(&record.event, b"width")?,
                )?,
            });
        }
    }
    if cursor <= edit.end_column
        && state_is_visible(edit.hidden, edit.outline_level, edit.collapsed)
    {
        output.push(ColumnRecord {
            start: cursor,
            end: edit.end_column,
            event: column_event_with_state(None, cursor, edit.end_column, edit)?,
        });
    }
    output.sort_by_key(|record| (record.start, record.end));
    Ok(output)
}

fn patch_sheet_outline(
    xml: &[u8],
    row_edits: &[&WorkbookRowStateEdit],
    column_edits: &[&WorkbookColumnStateEdit],
) -> Result<Vec<u8>, String> {
    let mut pending_rows = BTreeMap::new();
    for edit in row_edits {
        validate_row_state_edit(edit)?;
        if pending_rows.insert(edit.row, *edit).is_some() {
            return Err("保存请求包含重复行状态编辑".into());
        }
    }
    let mut column_ranges = Vec::new();
    let mut columns = read_column_records(xml)?;
    for edit in column_edits {
        validate_column_state_edit(edit)?;
        if column_ranges
            .iter()
            .any(|(start, end)| *start <= edit.end_column && edit.start_column <= *end)
        {
            return Err("保存请求包含重叠列状态编辑".into());
        }
        column_ranges.push((edit.start_column, edit.end_column));
        columns = apply_column_state_edit(columns, edit)?;
    }

    let has_columns = has_element(xml, b"cols")?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 256));
    let mut buffer = Vec::new();
    let mut inside_sheet_data = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表行列状态失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"cols" => {
                skip_element(&mut reader, b"cols", &mut buffer)?;
                write_columns(&mut writer, &columns)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"cols" => {
                write_columns(&mut writer, &columns)?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"sheetData" => {
                if !has_columns && !columns.is_empty() {
                    write_columns(&mut writer, &columns)?;
                }
                inside_sheet_data = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入工作表数据失败: {error}"))?;
            }
            Event::Start(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?
                    .checked_sub(1)
                    .ok_or("工作表行号无效")?;
                let missing = pending_rows
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in missing {
                    if let Some(edit) = pending_rows.remove(&missing_row) {
                        write_state_row(&mut writer, edit)?;
                    }
                }
                let replacement = pending_rows.remove(&row);
                writer
                    .write_event(Event::Start(if let Some(edit) = replacement {
                        row_event_with_state(start, edit)?
                    } else {
                        start.to_owned().into_owned()
                    }))
                    .map_err(|error| format!("写入行状态失败: {error}"))?;
            }
            Event::Empty(ref start)
                if inside_sheet_data && start.local_name().as_ref() == b"row" =>
            {
                let row = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?
                    .checked_sub(1)
                    .ok_or("工作表行号无效")?;
                let missing = pending_rows
                    .range(..row)
                    .map(|(row, _)| *row)
                    .collect::<Vec<_>>();
                for missing_row in missing {
                    if let Some(edit) = pending_rows.remove(&missing_row) {
                        write_state_row(&mut writer, edit)?;
                    }
                }
                let replacement = pending_rows.remove(&row);
                writer
                    .write_event(Event::Empty(if let Some(edit) = replacement {
                        row_event_with_state(start, edit)?
                    } else {
                        start.to_owned().into_owned()
                    }))
                    .map_err(|error| format!("写入空行状态失败: {error}"))?;
            }
            Event::End(ref end)
                if inside_sheet_data && end.local_name().as_ref() == b"sheetData" =>
            {
                for (_, edit) in std::mem::take(&mut pending_rows) {
                    write_state_row(&mut writer, edit)?;
                }
                inside_sheet_data = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表数据失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"sheetData" => {
                if !has_columns && !columns.is_empty() {
                    write_columns(&mut writer, &columns)?;
                }
                writer
                    .write_event(Event::Start(start.to_owned()))
                    .map_err(|error| format!("扩展工作表数据失败: {error}"))?;
                for (_, edit) in std::mem::take(&mut pending_rows) {
                    write_state_row(&mut writer, edit)?;
                }
                writer
                    .write_event(Event::End(BytesEnd::new("sheetData")))
                    .map_err(|error| format!("结束工作表数据失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表行列状态失败: {error}"))?,
        }
        buffer.clear();
    }
    if !pending_rows.is_empty() {
        return Err("XLSX 工作表缺少可写入的 sheetData".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_outline(
    source: &[u8],
    row_edits: &[WorkbookRowStateEdit],
    column_edits: &[WorkbookColumnStateEdit],
) -> Result<Vec<u8>, String> {
    if row_edits.is_empty() && column_edits.is_empty() {
        return Err("没有需要保存的行列隐藏分组变更".into());
    }
    if row_edits.len() + column_edits.len() > MAX_STRUCTURE_EDITS {
        return Err(format!("单次最多保存 {MAX_STRUCTURE_EDITS} 个行列状态变更"));
    }
    let mut entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let touched_sheets = row_edits
        .iter()
        .map(|edit| edit.sheet.as_str())
        .chain(column_edits.iter().map(|edit| edit.sheet.as_str()))
        .collect::<HashSet<_>>();
    for sheet in touched_sheets {
        let path = sheet_paths
            .get(sheet)
            .ok_or_else(|| format!("工作表不存在: {sheet}"))?;
        let xml = entries
            .iter()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("工作表部件不存在: {path}"))?;
        if parse_page_layout(&xml.data)?.protection.enabled {
            return Err(format!(
                "工作表 {sheet} 已受保护；LongEdit 不会绕过 Excel 工作表保护"
            ));
        }
    }
    for edit in row_edits {
        validate_row_state_edit(edit)?;
    }
    for edit in column_edits {
        validate_column_state_edit(edit)?;
    }
    for entry in &mut entries {
        let rows = row_edits
            .iter()
            .filter(|edit| sheet_paths.get(&edit.sheet) == Some(&entry.name))
            .collect::<Vec<_>>();
        let columns = column_edits
            .iter()
            .filter(|edit| sheet_paths.get(&edit.sheet) == Some(&entry.name))
            .collect::<Vec<_>>();
        if !rows.is_empty() || !columns.is_empty() {
            entry.data = patch_sheet_outline(&entry.data, &rows, &columns)?;
        }
    }
    let cursor = Cursor::new(Vec::with_capacity(source.len() + 256));
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
        .map_err(|error| format!("完成行列隐藏分组写回失败: {error}"))
}

fn migrated_axis_index(index: usize, change: &WorkbookStructureChange) -> Option<usize> {
    let limit = match change.axis {
        WorkbookStructureAxis::Row => MAX_XLSX_ROWS,
        WorkbookStructureAxis::Column => MAX_XLSX_COLUMNS,
    };
    match change.action {
        WorkbookStructureAction::Insert => {
            if index < change.index {
                Some(index)
            } else {
                index
                    .checked_add(change.count)
                    .filter(|value| *value < limit)
            }
        }
        WorkbookStructureAction::Delete => {
            let end = change.index + change.count;
            if index < change.index {
                Some(index)
            } else if index < end {
                None
            } else {
                Some(index - change.count)
            }
        }
    }
}

fn replace_column_range(
    event: &BytesStart<'_>,
    start: usize,
    end: usize,
) -> Result<BytesStart<'static>, String> {
    let mut updated = BytesStart::new("col");
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("解析列定义属性失败: {error}"))?;
        if !matches!(attribute.key.as_ref(), b"min" | b"max") {
            updated.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    let min = (start + 1).to_string();
    let max = (end + 1).to_string();
    updated.push_attribute(("min", min.as_str()));
    updated.push_attribute(("max", max.as_str()));
    Ok(updated.into_owned())
}

fn migrate_column_records(
    records: Vec<ColumnRecord>,
    change: &WorkbookStructureChange,
) -> Result<Vec<ColumnRecord>, String> {
    if change.axis != WorkbookStructureAxis::Column {
        return Ok(records);
    }
    let mut output = Vec::with_capacity(records.len() + 2);
    let change_end = change.index + change.count;
    for record in records {
        match change.action {
            WorkbookStructureAction::Insert if record.end < change.index => output.push(record),
            WorkbookStructureAction::Insert if record.start >= change.index => {
                let start = record
                    .start
                    .checked_add(change.count)
                    .ok_or("列定义迁移越界")?;
                let end = record
                    .end
                    .checked_add(change.count)
                    .ok_or("列定义迁移越界")?;
                if end >= MAX_XLSX_COLUMNS {
                    return Err("列定义迁移超过 XLSX 列上限".into());
                }
                output.push(ColumnRecord {
                    start,
                    end,
                    event: replace_column_range(&record.event, start, end)?,
                });
            }
            WorkbookStructureAction::Insert => {
                output.push(ColumnRecord {
                    start: record.start,
                    end: change.index - 1,
                    event: replace_column_range(&record.event, record.start, change.index - 1)?,
                });
                let start = change.index + change.count;
                let end = record.end + change.count;
                if end >= MAX_XLSX_COLUMNS {
                    return Err("列定义迁移超过 XLSX 列上限".into());
                }
                output.push(ColumnRecord {
                    start,
                    end,
                    event: replace_column_range(&record.event, start, end)?,
                });
            }
            WorkbookStructureAction::Delete if record.end < change.index => output.push(record),
            WorkbookStructureAction::Delete if record.start >= change_end => {
                let start = record.start - change.count;
                let end = record.end - change.count;
                output.push(ColumnRecord {
                    start,
                    end,
                    event: replace_column_range(&record.event, start, end)?,
                });
            }
            WorkbookStructureAction::Delete => {
                if record.start < change.index {
                    output.push(ColumnRecord {
                        start: record.start,
                        end: change.index - 1,
                        event: replace_column_range(&record.event, record.start, change.index - 1)?,
                    });
                }
                if record.end >= change_end {
                    let start = change.index;
                    let end = record.end - change.count;
                    output.push(ColumnRecord {
                        start,
                        end,
                        event: replace_column_range(&record.event, start, end)?,
                    });
                }
            }
        }
    }
    output.sort_by_key(|record| (record.start, record.end));
    Ok(output)
}

fn replace_xml_attribute(
    event: &BytesStart<'_>,
    key: &[u8],
    value: &str,
    remove_spans: bool,
) -> Result<BytesStart<'static>, String> {
    let name = String::from_utf8_lossy(event.name().as_ref()).into_owned();
    let mut updated = BytesStart::new(name);
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("解析 XLSX XML 属性失败: {error}"))?;
        if attribute.key.as_ref() != key && (!remove_spans || attribute.key.as_ref() != b"spans") {
            updated.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    updated.push_attribute((key, value.as_bytes()));
    Ok(updated.into_owned())
}

fn decode_xml_text(event: &BytesText<'_>, context: &str) -> Result<String, String> {
    let decoded = event
        .xml10_content()
        .map_err(|error| format!("解码 {context} 失败: {error}"))?;
    quick_xml::escape::unescape(&decoded)
        .map(|value| value.into_owned())
        .map_err(|error| format!("还原 {context} 失败: {error}"))
}

fn migrate_reference_list(
    references: &str,
    current_sheet: &str,
    change: &WorkbookStructureChange,
    context: &str,
) -> Result<String, String> {
    let migrated = references
        .split_ascii_whitespace()
        .map(|reference| migrate_workbook_reference(reference, Some(current_sheet), change))
        .collect::<Result<Vec<_>, _>>()?;
    if migrated.is_empty() || migrated.iter().all(|value| value == "#REF!") {
        return Err(format!("{context}会被本次删除完整移除，当前事务已取消"));
    }
    Ok(migrated
        .into_iter()
        .filter(|value| value != "#REF!")
        .collect::<Vec<_>>()
        .join(" "))
}

fn migrate_frozen_axis(
    value: usize,
    change: &WorkbookStructureChange,
    limit: usize,
    axis_name: &str,
) -> Result<usize, String> {
    match change.action {
        WorkbookStructureAction::Insert => {
            if change.index < value {
                value
                    .checked_add(change.count)
                    .filter(|value| *value < limit)
                    .ok_or_else(|| format!("冻结窗格迁移超过 XLSX {axis_name}上限"))
            } else {
                Ok(value)
            }
        }
        WorkbookStructureAction::Delete => {
            if change.index >= value {
                Ok(value)
            } else {
                Ok(value - change.count.min(value - change.index))
            }
        }
    }
}

fn migrate_selection_cell(
    reference: &str,
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<String, String> {
    let migrated = migrate_workbook_reference(reference, Some(current_sheet), change)?;
    if migrated != "#REF!" {
        return Ok(migrated);
    }
    let (row, column) = parse_cell_reference(reference)?;
    match change.axis {
        WorkbookStructureAxis::Row => cell_reference(change.index.min(MAX_XLSX_ROWS - 1), column),
        WorkbookStructureAxis::Column => {
            cell_reference(row, change.index.min(MAX_XLSX_COLUMNS - 1))
        }
    }
}

fn patch_table_structure(
    xml: &[u8],
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 64));
    let mut buffer = Vec::new();
    let mut formula_element = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Excel 表格部件失败: {error}"))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start)
                if matches!(start.local_name().as_ref(), b"table" | b"autoFilter") =>
            {
                let reference =
                    xml_value(start, b"ref", reader.decoder())?.ok_or("Excel 表格部件缺少范围")?;
                let migrated = migrate_workbook_reference(&reference, Some(current_sheet), change)?;
                if migrated == "#REF!" {
                    return Err("本次删除会完整移除 Excel 表格；请先将表格转换为普通区域".into());
                }
                if change.axis == WorkbookStructureAxis::Column {
                    let original = parse_range_reference(&reference)?;
                    let updated = parse_range_reference(&migrated)?;
                    if original.right - original.left != updated.right - updated.left {
                        return Err(
                            "本次列插删会改变 Excel Table 列结构；请先将表格转换为普通区域".into(),
                        );
                    }
                }
                let updated = replace_xml_attribute(start, b"ref", &migrated, false)?;
                writer
                    .write_event(if matches!(event, Event::Start(_)) {
                        Event::Start(updated)
                    } else {
                        Event::Empty(updated)
                    })
                    .map_err(|error| format!("写入 Excel 表格范围失败: {error}"))?;
            }
            Event::Start(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"calculatedColumnFormula" | b"totalsRowFormula"
                ) =>
            {
                formula_element = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入 Excel 表格公式节点失败: {error}"))?;
            }
            Event::Text(ref text) if formula_element => {
                let formula = decode_xml_text(text, "Excel 表格公式")?;
                let migrated =
                    migrate_workbook_formula(&format!("={formula}"), current_sheet, change)?;
                writer
                    .write_event(Event::Text(BytesText::new(&migrated[1..])))
                    .map_err(|error| format!("写入迁移后的 Excel 表格公式失败: {error}"))?;
            }
            Event::End(ref end)
                if formula_element
                    && matches!(
                        end.local_name().as_ref(),
                        b"calculatedColumnFormula" | b"totalsRowFormula"
                    ) =>
            {
                formula_element = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束 Excel 表格公式节点失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制 Excel 表格部件失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn patch_drawing_anchors(xml: &[u8], change: &WorkbookStructureChange) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 64));
    let mut buffer = Vec::new();
    let mut anchor_depth = 0usize;
    let coordinate_name = match change.axis {
        WorkbookStructureAxis::Row => b"row".as_slice(),
        WorkbookStructureAxis::Column => b"col".as_slice(),
    };
    let mut coordinate_element = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Drawing 锚点失败: {error}"))?;
        match event {
            Event::Start(ref start) if matches!(start.local_name().as_ref(), b"from" | b"to") => {
                anchor_depth += 1;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入 Drawing 锚点节点失败: {error}"))?;
            }
            Event::Start(ref start)
                if anchor_depth > 0 && start.local_name().as_ref() == coordinate_name =>
            {
                coordinate_element = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入 Drawing 行锚点失败: {error}"))?;
            }
            Event::Text(ref text) if coordinate_element => {
                let coordinate = decode_xml_text(text, "Drawing 锚点坐标")?
                    .parse::<usize>()
                    .map_err(|_| "Drawing 锚点坐标不是有效整数")?;
                let migrated = migrated_axis_index(coordinate, change).unwrap_or(change.index);
                writer
                    .write_event(Event::Text(BytesText::new(&migrated.to_string())))
                    .map_err(|error| format!("写入迁移后的 Drawing 行锚点失败: {error}"))?;
            }
            Event::End(ref end)
                if coordinate_element && end.local_name().as_ref() == coordinate_name =>
            {
                coordinate_element = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束 Drawing 行锚点失败: {error}"))?;
            }
            Event::End(ref end) if matches!(end.local_name().as_ref(), b"from" | b"to") => {
                anchor_depth = anchor_depth.saturating_sub(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束 Drawing 锚点节点失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制 Drawing 部件失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn patch_chart_row_formulas(
    xml: &[u8],
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 64));
    let mut buffer = Vec::new();
    let mut formula_element = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析图表公式失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"f" => {
                formula_element = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入图表公式节点失败: {error}"))?;
            }
            Event::Text(ref text) if formula_element => {
                let formula = decode_xml_text(text, "图表公式")?;
                let migrated =
                    migrate_workbook_formula(&format!("={formula}"), current_sheet, change)?;
                writer
                    .write_event(Event::Text(BytesText::new(&migrated[1..])))
                    .map_err(|error| format!("写入迁移后的图表公式失败: {error}"))?;
            }
            Event::End(ref end) if formula_element && end.local_name().as_ref() == b"f" => {
                formula_element = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束图表公式节点失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制图表部件失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn workbook_sheet_ids(xml: &[u8]) -> Result<HashMap<String, String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut result = HashMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿 Sheet ID 失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sheet" =>
            {
                let name =
                    xml_value(event, b"name", reader.decoder())?.ok_or("工作簿 Sheet 缺少名称")?;
                let id = xml_value(event, b"sheetId", reader.decoder())?
                    .ok_or("工作簿 Sheet 缺少 sheetId")?;
                result.insert(name, id);
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn patch_calc_chain_rows(
    xml: &[u8],
    target_sheet_id: &str,
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut current_sheet_id = String::new();
    let mut output_sheet_id = String::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析计算链失败: {error}"))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"c" =>
            {
                if let Some(id) = xml_value(start, b"i", reader.decoder())? {
                    current_sheet_id = id;
                }
                let reference =
                    xml_value(start, b"r", reader.decoder())?.ok_or("计算链条目缺少单元格坐标")?;
                let migrated = if current_sheet_id == target_sheet_id {
                    migrate_workbook_reference(&reference, Some(&change.sheet), change)?
                } else {
                    reference
                };
                if migrated == "#REF!" {
                    if matches!(event, Event::Start(_)) {
                        skip_element(&mut reader, b"c", &mut buffer)?;
                    }
                    buffer.clear();
                    continue;
                }
                let mut updated = replace_xml_attribute(start, b"r", &migrated, false)?;
                if current_sheet_id != output_sheet_id {
                    updated = replace_xml_attribute(&updated, b"i", &current_sheet_id, false)?;
                }
                output_sheet_id.clone_from(&current_sheet_id);
                writer
                    .write_event(if matches!(event, Event::Start(_)) {
                        Event::Start(updated)
                    } else {
                        Event::Empty(updated)
                    })
                    .map_err(|error| format!("写入计算链条目失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制计算链失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn reference_list_fully_deleted(
    references: &str,
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<bool, String> {
    let migrated = references
        .split_ascii_whitespace()
        .map(|reference| migrate_workbook_reference(reference, Some(current_sheet), change))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(!migrated.is_empty() && migrated.iter().all(|value| value == "#REF!"))
}

fn remove_deleted_sheet_range_objects(
    xml: &[u8],
    current_sheet: &str,
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    let mut surviving_merges = 0usize;
    let mut surviving_validations = 0usize;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("扫描工作表范围对象失败: {error}"))?
        {
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"mergeCell" =>
            {
                let reference =
                    xml_value(start, b"ref", reader.decoder())?.ok_or("合并单元格缺少范围")?;
                if migrate_workbook_reference(&reference, Some(current_sheet), change)? != "#REF!" {
                    surviving_merges += 1;
                }
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"dataValidation" =>
            {
                let references = xml_value(start, b"sqref", reader.decoder())?
                    .ok_or("数据验证范围缺少 sqref")?;
                if !reference_list_fully_deleted(&references, current_sheet, change)? {
                    surviving_validations += 1;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表范围对象失败: {error}"))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"mergeCells" | b"dataValidations"
                ) =>
            {
                let count = if start.local_name().as_ref() == b"mergeCells" {
                    surviving_merges
                } else {
                    surviving_validations
                };
                if count == 0 {
                    if matches!(event, Event::Start(_)) {
                        let name = start.local_name().as_ref().to_vec();
                        skip_element(&mut reader, &name, &mut buffer)?;
                    }
                    buffer.clear();
                    continue;
                }
                let updated = replace_xml_attribute(start, b"count", &count.to_string(), false)?;
                writer
                    .write_event(if matches!(event, Event::Start(_)) {
                        Event::Start(updated)
                    } else {
                        Event::Empty(updated)
                    })
                    .map_err(|error| format!("写入工作表范围对象计数失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"mergeCell"
                        | b"autoFilter"
                        | b"dataValidation"
                        | b"conditionalFormatting"
                        | b"hyperlink"
                ) =>
            {
                let attribute = if matches!(
                    start.local_name().as_ref(),
                    b"dataValidation" | b"conditionalFormatting"
                ) {
                    b"sqref".as_slice()
                } else {
                    b"ref".as_slice()
                };
                let references = xml_value(start, attribute, reader.decoder())?
                    .ok_or("工作表范围对象缺少坐标")?;
                if reference_list_fully_deleted(&references, current_sheet, change)? {
                    if matches!(event, Event::Start(_)) {
                        let name = start.local_name().as_ref().to_vec();
                        skip_element(&mut reader, &name, &mut buffer)?;
                    }
                    buffer.clear();
                    continue;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表范围对象失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表范围对象失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn patch_frozen_pane_event(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    change: &WorkbookStructureChange,
) -> Result<(BytesStart<'static>, String), String> {
    let state = xml_value(event, b"state", decoder)?.unwrap_or_default();
    if !matches!(state.as_str(), "frozen" | "frozenSplit") {
        return Err("当前行结构事务只支持冻结窗格，不支持普通拆分窗格".into());
    }
    let parse_split = |key: &[u8]| -> Result<usize, String> {
        let value = xml_value(event, key, decoder)?.unwrap_or_else(|| "0".into());
        let value = value.parse::<f64>().map_err(|_| "冻结窗格分隔坐标无效")?;
        if value < 0.0 || value.fract() != 0.0 {
            return Err("冻结窗格分隔坐标无效".into());
        }
        Ok(value as usize)
    };
    let original_rows = parse_split(b"ySplit")?;
    let original_columns = parse_split(b"xSplit")?;
    let rows = if change.axis == WorkbookStructureAxis::Row {
        migrate_frozen_axis(original_rows, change, MAX_XLSX_ROWS, "行")?
    } else {
        original_rows
    };
    let columns = if change.axis == WorkbookStructureAxis::Column {
        migrate_frozen_axis(original_columns, change, MAX_XLSX_COLUMNS, "列")?
    } else {
        original_columns
    };
    if rows == 0 && columns == 0 {
        return Err("本次删除会完整移除冻结窗格，请先手动取消冻结".into());
    }
    let active_pane = if rows > 0 && columns > 0 {
        "bottomRight"
    } else if rows > 0 {
        "bottomLeft"
    } else {
        "topRight"
    };
    let top_left = cell_reference(rows, columns)?;
    let rows_text = rows.to_string();
    let columns_text = columns.to_string();
    let updated = replace_xml_attribute(event, b"ySplit", &rows_text, false)?;
    let updated = replace_xml_attribute(&updated, b"xSplit", &columns_text, false)?;
    let updated = replace_xml_attribute(&updated, b"topLeftCell", &top_left, false)?;
    let updated = replace_xml_attribute(&updated, b"activePane", active_pane, false)?;
    Ok((updated, active_pane.into()))
}

fn validate_plain_structure_sheet(
    xml: &[u8],
    target_sheet: bool,
    change: &WorkbookStructureChange,
) -> Result<(), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表结构失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event) => {
                let feature = match event.local_name().as_ref() {
                    b"sheetProtection" if target_sheet => Some("工作表保护"),
                    b"legacyDrawing" | b"picture" | b"oleObjects" | b"controls" => {
                        Some("绘图、批注或嵌入对象")
                    }
                    b"pivotTableParts" | b"pivotTablePart" => Some("数据透视表"),
                    b"ignoredErrors" | b"protectedRanges" | b"scenarios" | b"rowBreaks"
                    | b"colBreaks"
                        if target_sheet =>
                    {
                        Some("带范围的工作表扩展结构")
                    }
                    b"filterColumn"
                        if target_sheet && change.axis == WorkbookStructureAxis::Column =>
                    {
                        Some("活动筛选条件")
                    }
                    b"extLst" => Some("未知工作表扩展结构"),
                    _ => None,
                };
                if let Some(feature) = feature {
                    return Err(format!(
                        "当前工作表结构事务暂不支持包含{feature}的目标工作表"
                    ));
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(())
}

fn sheet_has_cells(xml: &[u8]) -> Result<bool, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表单元格失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"c" =>
            {
                return Ok(true);
            }
            Event::Eof => return Ok(false),
            _ => {}
        }
        buffer.clear();
    }
}

fn patch_sheet_structure_axis(
    xml: &[u8],
    current_sheet: &str,
    change: &WorkbookStructureChange,
    target_sheet: bool,
) -> Result<Vec<u8>, String> {
    let target_has_cells = target_sheet && sheet_has_cells(xml)?;
    let has_columns =
        target_sheet && change.axis == WorkbookStructureAxis::Column && has_element(xml, b"cols")?;
    let columns = if target_sheet && change.axis == WorkbookStructureAxis::Column {
        migrate_column_records(read_column_records(xml)?, change)?
    } else {
        Vec::new()
    };
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 128));
    let mut buffer = Vec::new();
    let mut formula_element: Option<Vec<u8>> = None;
    let mut active_pane: Option<String> = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表行结构失败: {error}"))?;
        match event {
            Event::Start(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Column
                    && start.local_name().as_ref() == b"cols" =>
            {
                skip_element(&mut reader, b"cols", &mut buffer)?;
                write_columns(&mut writer, &columns)?;
            }
            Event::Empty(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Column
                    && start.local_name().as_ref() == b"cols" =>
            {
                write_columns(&mut writer, &columns)?;
            }
            Event::Start(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Column
                    && start.local_name().as_ref() == b"sheetData" =>
            {
                if !has_columns && !columns.is_empty() {
                    write_columns(&mut writer, &columns)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入工作表数据失败: {error}"))?;
            }
            Event::Start(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Row
                    && start.local_name().as_ref() == b"row" =>
            {
                let number = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?;
                let row = number.checked_sub(1).ok_or("工作表行号无效")?;
                let Some(migrated) = migrated_axis_index(row, change) else {
                    skip_element(&mut reader, b"row", &mut buffer)?;
                    buffer.clear();
                    continue;
                };
                let replacement = (migrated + 1).to_string();
                writer
                    .write_event(Event::Start(replace_xml_attribute(
                        start,
                        b"r",
                        &replacement,
                        true,
                    )?))
                    .map_err(|error| format!("写入迁移后的工作表行失败: {error}"))?;
            }
            Event::Empty(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Row
                    && start.local_name().as_ref() == b"row" =>
            {
                let number = xml_value(start, b"r", reader.decoder())?
                    .ok_or("工作表行缺少行号")?
                    .parse::<usize>()
                    .map_err(|_| "工作表行号无效")?;
                let row = number.checked_sub(1).ok_or("工作表行号无效")?;
                if let Some(migrated) = migrated_axis_index(row, change) {
                    let replacement = (migrated + 1).to_string();
                    writer
                        .write_event(Event::Empty(replace_xml_attribute(
                            start,
                            b"r",
                            &replacement,
                            true,
                        )?))
                        .map_err(|error| format!("写入迁移后的空工作表行失败: {error}"))?;
                }
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet
                    && change.axis == WorkbookStructureAxis::Column
                    && start.local_name().as_ref() == b"row" =>
            {
                let number = xml_value(start, b"r", reader.decoder())?.ok_or("工作表行缺少行号")?;
                let updated = replace_xml_attribute(start, b"r", &number, true)?;
                writer
                    .write_event(if matches!(event, Event::Start(_)) {
                        Event::Start(updated)
                    } else {
                        Event::Empty(updated)
                    })
                    .map_err(|error| format!("写入列迁移后的工作表行失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet && start.local_name().as_ref() == b"c" =>
            {
                let reference =
                    xml_value(start, b"r", reader.decoder())?.ok_or("工作表单元格缺少坐标")?;
                let migrated = migrate_workbook_reference(&reference, Some(current_sheet), change)?;
                if migrated == "#REF!" {
                    if matches!(event, Event::Start(_)) {
                        skip_element(&mut reader, b"c", &mut buffer)?;
                    }
                    buffer.clear();
                    continue;
                }
                let updated = replace_xml_attribute(start, b"r", &migrated, false)?;
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的单元格坐标失败: {error}"))?;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"dimension" && target_sheet =>
            {
                let reference =
                    xml_value(start, b"ref", reader.decoder())?.unwrap_or_else(|| "A1".into());
                let migrated = if target_has_cells {
                    migrate_workbook_reference(&reference, Some(current_sheet), change)?
                } else {
                    "A1".into()
                };
                let migrated = if migrated == "#REF!" { "A1" } else { &migrated };
                writer
                    .write_event(Event::Empty(replace_xml_attribute(
                        start, b"ref", migrated, false,
                    )?))
                    .map_err(|error| format!("写入迁移后的工作表范围失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet && start.local_name().as_ref() == b"pane" =>
            {
                let (updated, pane) = patch_frozen_pane_event(start, reader.decoder(), change)?;
                active_pane = Some(pane);
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的冻结窗格失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet && start.local_name().as_ref() == b"selection" =>
            {
                let updated = if let Some(pane) = active_pane.as_deref() {
                    if xml_value(start, b"pane", reader.decoder())?.is_some() {
                        replace_xml_attribute(start, b"pane", pane, false)?
                    } else {
                        start.to_owned()
                    }
                } else {
                    start.to_owned()
                };
                let updated =
                    if let Some(reference) = xml_value(start, b"activeCell", reader.decoder())? {
                        let migrated = migrate_selection_cell(&reference, current_sheet, change)?;
                        replace_xml_attribute(&updated, b"activeCell", &migrated, false)?
                    } else {
                        updated
                    };
                let updated =
                    if let Some(references) = xml_value(start, b"sqref", reader.decoder())? {
                        let fallback = xml_value(&updated, b"activeCell", reader.decoder())?
                            .unwrap_or_else(|| "A1".into());
                        let migrated = match migrate_reference_list(
                            &references,
                            current_sheet,
                            change,
                            "工作表选区",
                        ) {
                            Ok(migrated) => migrated,
                            Err(error) if error.contains("完整移除") => fallback,
                            Err(error) => return Err(error),
                        };
                        replace_xml_attribute(&updated, b"sqref", &migrated, false)?
                    } else {
                        updated
                    };
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的窗格选择失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet
                    && matches!(start.local_name().as_ref(), b"mergeCell" | b"autoFilter") =>
            {
                let context = if start.local_name().as_ref() == b"mergeCell" {
                    "合并单元格"
                } else {
                    "自动筛选"
                };
                let reference = xml_value(start, b"ref", reader.decoder())?
                    .ok_or_else(|| format!("{context}缺少范围"))?;
                let migrated = migrate_workbook_reference(&reference, Some(current_sheet), change)?;
                if migrated == "#REF!" {
                    return Err(format!("{context}会被本次删除完整移除，当前事务已取消"));
                }
                let updated = replace_xml_attribute(start, b"ref", &migrated, false)?;
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的{context}失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if target_sheet
                    && matches!(
                        start.local_name().as_ref(),
                        b"dataValidation" | b"conditionalFormatting"
                    ) =>
            {
                let context = if start.local_name().as_ref() == b"dataValidation" {
                    "数据验证范围"
                } else {
                    "条件格式范围"
                };
                let references = xml_value(start, b"sqref", reader.decoder())?
                    .ok_or_else(|| format!("{context}缺少 sqref"))?;
                let migrated = migrate_reference_list(&references, current_sheet, change, context)?;
                let updated = replace_xml_attribute(start, b"sqref", &migrated, false)?;
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的{context}失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"hyperlink" =>
            {
                let mut updated = start.to_owned();
                if target_sheet {
                    let reference = xml_value(start, b"ref", reader.decoder())?
                        .ok_or("超链接缺少单元格范围")?;
                    let migrated =
                        migrate_reference_list(&reference, current_sheet, change, "超链接范围")?;
                    updated = replace_xml_attribute(&updated, b"ref", &migrated, false)?;
                }
                if let Some(location) = xml_value(start, b"location", reader.decoder())? {
                    if let Ok(migrated) =
                        migrate_workbook_reference(&location, Some(current_sheet), change)
                    {
                        if migrated == "#REF!" {
                            return Err("超链接目标会被本次删除完整移除，当前事务已取消".into());
                        }
                        updated = replace_xml_attribute(&updated, b"location", &migrated, false)?;
                    }
                }
                let output = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(output)
                    .map_err(|error| format!("写入迁移后的超链接失败: {error}"))?;
            }
            Event::Start(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"f" | b"formula" | b"formula1" | b"formula2"
                ) =>
            {
                formula_element = Some(start.local_name().as_ref().to_vec());
                let updated = if target_sheet && start.local_name().as_ref() == b"f" {
                    if let Some(reference) = xml_value(start, b"ref", reader.decoder())? {
                        let migrated =
                            migrate_workbook_reference(&reference, Some(current_sheet), change)?;
                        if migrated == "#REF!" {
                            return Err("共享公式范围会被完整删除，当前事务已取消".into());
                        }
                        replace_xml_attribute(start, b"ref", &migrated, false)?
                    } else {
                        start.to_owned()
                    }
                } else {
                    start.to_owned()
                };
                writer
                    .write_event(Event::Start(updated))
                    .map_err(|error| format!("写入公式节点失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"f" => {
                let updated = if target_sheet {
                    if let Some(reference) = xml_value(start, b"ref", reader.decoder())? {
                        let migrated =
                            migrate_workbook_reference(&reference, Some(current_sheet), change)?;
                        if migrated == "#REF!" {
                            return Err("共享公式范围会被完整删除，当前事务已取消".into());
                        }
                        replace_xml_attribute(start, b"ref", &migrated, false)?
                    } else {
                        start.to_owned()
                    }
                } else {
                    start.to_owned()
                };
                writer
                    .write_event(Event::Empty(updated))
                    .map_err(|error| format!("写入空公式节点失败: {error}"))?;
            }
            Event::Text(ref text) if formula_element.is_some() => {
                let formula = decode_xml_text(text, "工作表公式")?;
                let migrated =
                    migrate_workbook_formula(&format!("={formula}"), current_sheet, change)?;
                writer
                    .write_event(Event::Text(BytesText::new(&migrated[1..])))
                    .map_err(|error| format!("写入迁移后的工作表公式失败: {error}"))?;
            }
            Event::End(ref end)
                if formula_element
                    .as_deref()
                    .is_some_and(|name| name == end.local_name().as_ref()) =>
            {
                formula_element = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表公式失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表结构失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn workbook_sheet_names(xml: &[u8]) -> Result<Vec<String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut sheets = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿工作表列表失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sheet" =>
            {
                sheets.push(
                    xml_value(event, b"name", reader.decoder())?.ok_or("工作簿工作表缺少名称")?,
                );
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(sheets)
}

fn patch_workbook_defined_name_formulas(
    xml: &[u8],
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    let sheets = workbook_sheet_names(xml)?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 128));
    let mut buffer = Vec::new();
    let mut defined_name_scope: Option<Option<String>> = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作簿定义名称失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"definedName" => {
                let scope = xml_value(start, b"localSheetId", reader.decoder())?
                    .map(|value| {
                        let index = value.parse::<usize>().map_err(|_| "定义名称作用域无效")?;
                        sheets
                            .get(index)
                            .cloned()
                            .ok_or_else(|| "定义名称作用域越界".to_string())
                    })
                    .transpose()?;
                defined_name_scope = Some(scope);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入定义名称节点失败: {error}"))?;
            }
            Event::Text(ref text) if defined_name_scope.is_some() => {
                let formula = decode_xml_text(text, "定义名称公式")?;
                let current_sheet = defined_name_scope
                    .as_ref()
                    .and_then(|scope| scope.as_deref())
                    .unwrap_or("");
                let had_equals = formula.starts_with('=');
                let normalized = if had_equals {
                    formula.clone()
                } else {
                    format!("={formula}")
                };
                let migrated = migrate_workbook_formula(&normalized, current_sheet, change)?;
                let output = if had_equals {
                    &migrated
                } else {
                    &migrated[1..]
                };
                writer
                    .write_event(Event::Text(BytesText::new(output)))
                    .map_err(|error| format!("写入迁移后的定义名称失败: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"definedName" => {
                defined_name_scope = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束定义名称节点失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作簿定义名称失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn write_package(entries: Vec<PackageEntry>, capacity: usize) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::with_capacity(capacity));
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
        .map_err(|error| format!("完成 XLSX 结构事务失败: {error}"))
}

pub fn patch_workbook_structure(
    source: &[u8],
    change: &WorkbookStructureChange,
) -> Result<Vec<u8>, String> {
    validate_workbook_structure_change(change)?;
    let mut entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let target_path = sheet_paths
        .get(&change.sheet)
        .cloned()
        .ok_or_else(|| format!("工作表不存在: {}", change.sheet))?;
    let workbook_xml = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let target_sheet_id = workbook_sheet_ids(&workbook_xml.data)?
        .remove(&change.sheet)
        .ok_or_else(|| format!("工作表缺少 sheetId: {}", change.sheet))?;

    let mut table_owners = HashMap::new();
    let mut drawing_owners = HashMap::new();
    for (sheet, path) in &sheet_paths {
        for target in part_relationships(&entries, path)?.into_values() {
            if target.starts_with("xl/tables/") {
                table_owners.insert(target, sheet.clone());
            } else if target.starts_with("xl/drawings/") && target.ends_with(".xml") {
                drawing_owners.insert(target, sheet.clone());
            }
        }
    }
    let mut chart_owners = HashMap::new();
    for (drawing_path, sheet) in &drawing_owners {
        for target in part_relationships(&entries, drawing_path)?.into_values() {
            if target.starts_with("xl/charts/") && target.ends_with(".xml") {
                chart_owners.insert(target, sheet.clone());
            }
        }
    }
    for (sheet, path) in &sheet_paths {
        let xml = entries
            .iter()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("工作表部件不存在: {path}"))?;
        validate_plain_structure_sheet(&xml.data, path == &target_path, change)
            .map_err(|error| format!("工作表 {sheet}: {error}"))?;
    }

    for (sheet, path) in &sheet_paths {
        let entry = entries
            .iter_mut()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("工作表部件不存在: {path}"))?;
        if path == &target_path {
            entry.data = remove_deleted_sheet_range_objects(&entry.data, sheet, change)?;
        }
        entry.data = patch_sheet_structure_axis(&entry.data, sheet, change, path == &target_path)?;
    }
    for entry in &mut entries {
        if let Some(sheet) = table_owners.get(&entry.name) {
            entry.data = patch_table_structure(&entry.data, sheet, change)?;
        } else if let Some(sheet) = drawing_owners.get(&entry.name) {
            if sheet == &change.sheet {
                entry.data = patch_drawing_anchors(&entry.data, change)?;
            }
        } else if let Some(sheet) = chart_owners.get(&entry.name) {
            entry.data = patch_chart_row_formulas(&entry.data, sheet, change)?;
        } else if entry.name == "xl/calcChain.xml" {
            entry.data = patch_calc_chain_rows(&entry.data, &target_sheet_id, change)?;
        }
    }
    let workbook = entries
        .iter_mut()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    workbook.data = patch_workbook_defined_name_formulas(&workbook.data, change)?;
    write_package(entries, source.len() + 256)
}

pub fn patch_workbook(
    source: &[u8],
    edits: &[WorkbookCellEdit],
    style_edits: &[WorkbookCellStyleEdit],
    row_height_edits: &[WorkbookRowHeightEdit],
    column_width_edits: &[WorkbookColumnWidthEdit],
    merge_edits: &[WorkbookMergeEdit],
) -> Result<Vec<u8>, String> {
    if edits.is_empty()
        && style_edits.is_empty()
        && row_height_edits.is_empty()
        && column_width_edits.is_empty()
        && merge_edits.is_empty()
    {
        return Err("没有需要保存的单元格变更".into());
    }
    if row_height_edits.len() + column_width_edits.len() + merge_edits.len() > MAX_STRUCTURE_EDITS {
        return Err(format!(
            "单次最多保存 {MAX_STRUCTURE_EDITS} 个工作表结构变更"
        ));
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
    let touched_sheets = edits
        .iter()
        .map(|edit| edit.sheet.as_str())
        .chain(style_edits.iter().map(|edit| edit.sheet.as_str()))
        .chain(row_height_edits.iter().map(|edit| edit.sheet.as_str()))
        .chain(column_width_edits.iter().map(|edit| edit.sheet.as_str()))
        .chain(merge_edits.iter().map(|edit| edit.sheet.as_str()))
        .collect::<HashSet<_>>();
    for sheet in touched_sheets {
        let path = sheet_paths
            .get(sheet)
            .ok_or_else(|| format!("工作表不存在: {sheet}"))?;
        let xml = entries
            .iter()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("工作表部件不存在: {path}"))?;
        if parse_page_layout(&xml.data)?.protection.enabled {
            return Err(format!(
                "工作表 {sheet} 已受保护；LongEdit 不会绕过 Excel 工作表保护"
            ));
        }
    }
    for (sheet, path) in &sheet_paths {
        let sheet_edits = edits
            .iter()
            .filter(|edit| &edit.sheet == sheet)
            .collect::<Vec<_>>();
        if sheet_edits.is_empty() {
            continue;
        }
        let xml = entries
            .iter()
            .find(|entry| &entry.name == path)
            .ok_or_else(|| format!("工作表部件不存在: {path}"))?;
        let structure = read_sheet_structure(&xml.data, 0, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS)?;
        for edit in sheet_edits {
            validate_edit_against_rules(edit, &structure.data_validations)?;
        }
    }
    for edit in row_height_edits {
        validate_row_height_edit(edit)?;
        if !sheet_paths.contains_key(&edit.sheet) {
            return Err(format!("工作表不存在: {}", edit.sheet));
        }
    }
    for edit in column_width_edits {
        validate_column_width_edit(edit)?;
        if !sheet_paths.contains_key(&edit.sheet) {
            return Err(format!("工作表不存在: {}", edit.sheet));
        }
    }
    for edit in merge_edits {
        validate_merge_edit(edit)?;
        if !sheet_paths.contains_key(&edit.sheet) {
            return Err(format!("工作表不存在: {}", edit.sheet));
        }
    }
    for entry in &mut entries {
        let row_edits = row_height_edits
            .iter()
            .filter(|edit| sheet_paths.get(&edit.sheet) == Some(&entry.name))
            .collect::<Vec<_>>();
        let column_edits = column_width_edits
            .iter()
            .filter(|edit| sheet_paths.get(&edit.sheet) == Some(&entry.name))
            .collect::<Vec<_>>();
        let merge_edits = merge_edits
            .iter()
            .filter(|edit| sheet_paths.get(&edit.sheet) == Some(&entry.name))
            .collect::<Vec<_>>();
        if !row_edits.is_empty() || !column_edits.is_empty() || !merge_edits.is_empty() {
            entry.data =
                patch_sheet_structure(&entry.data, &row_edits, &column_edits, &merge_edits)?;
        }
    }
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
        let theme = entries
            .iter()
            .find(|entry| entry.name == "xl/theme/theme1.xml")
            .map(|entry| entry.data.as_slice());
        let (updated, resolved) =
            resolve_style_edits(&styles.data, theme, &style_sheet_xml, style_edits)?;
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

#[cfg(test)]
mod tests {
    use super::{
        patch_calc_chain_rows, patch_sheet_structure_axis, patch_workbook_structure,
        read_sheet_formulas, read_workbook_defined_names, read_workbook_sheet_layout,
        validate_plain_structure_sheet, validate_workbook_package,
    };
    use crate::formats::workbook::{
        WorkbookStructureAction, WorkbookStructureAxis, WorkbookStructureChange,
    };
    use rust_xlsxwriter::{
        Chart, ChartType, ConditionalFormatCell, ConditionalFormatCellRule, DataValidation, Format,
        Formula, Table, TableColumn, Workbook,
    };
    use std::io::{Cursor, Read};
    use zip::ZipArchive;

    fn zip_text(source: &[u8], name: &str) -> String {
        let mut archive = ZipArchive::new(Cursor::new(source)).unwrap();
        let mut text = String::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        text
    }

    #[test]
    fn reads_regular_and_shared_formulas_for_requested_page() {
        let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData>
                <row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>3</v></c></row>
                <row r="2"><c r="A2"><f t="shared" si="0" ref="A2:A3">B2+C2</f><v>3</v></c></row>
                <row r="3"><c r="A3"><f t="shared" si="0"/><v>6</v></c></row>
              </sheetData>
            </worksheet>"#;
        let formulas = read_sheet_formulas(xml, 0, 3, 1).unwrap();
        assert_eq!(
            formulas.get(&(0, 0)).map(String::as_str),
            Some("=SUM(B1:C1)")
        );
        assert_eq!(formulas.get(&(1, 0)).map(String::as_str), Some("=B2+C2"));
        assert_eq!(formulas.get(&(2, 0)).map(String::as_str), Some("=B3+C3"));
        let page = read_sheet_formulas(xml, 2, 3, 1).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page.get(&(2, 0)).map(String::as_str), Some("=B3+C3"));
    }

    #[test]
    fn inserts_and_deletes_plain_rows_with_cross_sheet_reference_migration() {
        let mut workbook = Workbook::new();
        let data = workbook.add_worksheet();
        data.set_name("Data").unwrap();
        data.write_string(0, 0, "Header").unwrap();
        data.write_number(1, 0, 10).unwrap();
        data.write_number(2, 0, 20).unwrap();
        data.write_formula(2, 1, Formula::new("=SUM(A2:A3)").set_result("30"))
            .unwrap();
        data.set_freeze_panes(1, 0).unwrap();
        data.autofilter(0, 0, 2, 1).unwrap();
        data.add_conditional_format(
            1,
            0,
            2,
            0,
            &ConditionalFormatCell::new().set_rule(ConditionalFormatCellRule::GreaterThan(5)),
        )
        .unwrap();
        data.add_data_validation(
            1,
            0,
            2,
            0,
            &DataValidation::new()
                .allow_list_strings(&["10", "20"])
                .unwrap(),
        )
        .unwrap();
        data.merge_range(3, 0, 3, 1, "Footer", &Format::new())
            .unwrap();
        let summary = workbook.add_worksheet();
        summary.set_name("Summary").unwrap();
        summary
            .write_formula(0, 0, Formula::new("=Data!A2").set_result("10"))
            .unwrap();
        workbook
            .define_name("DataWindow", "=Data!$A$2:$A$3")
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();

        let inserted = patch_workbook_structure(
            &source,
            &WorkbookStructureChange {
                sheet: "Data".into(),
                axis: WorkbookStructureAxis::Row,
                action: WorkbookStructureAction::Insert,
                index: 1,
                count: 2,
            },
        )
        .unwrap();
        validate_workbook_package(&inserted).unwrap();
        let data_xml = zip_text(&inserted, "xl/worksheets/sheet1.xml");
        let summary_xml = zip_text(&inserted, "xl/worksheets/sheet2.xml");
        assert!(data_xml.contains("r=\"A4\""));
        assert!(data_xml.contains("r=\"A5\""));
        assert!(data_xml.contains("r=\"B5\""));
        assert!(data_xml.contains("SUM(A4:A5)"));
        assert!(data_xml.contains("ref=\"A1:B5\""));
        assert!(data_xml.contains("ref=\"A6:B6\""));
        assert!(data_xml.contains("sqref=\"A4:A5\""));
        assert!(summary_xml.contains("Data!A4"));
        let layout = read_workbook_sheet_layout(&inserted, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.freeze_pane.rows, 1);
        assert_eq!(layout.auto_filter.unwrap().bottom, 4);
        assert_eq!(layout.merged_cells[0].top, 5);
        assert_eq!(layout.data_validations[0].ranges[0].top, 3);
        assert_eq!(layout.data_validations[0].ranges[0].bottom, 4);
        assert_eq!(
            read_workbook_defined_names(&inserted)
                .unwrap()
                .into_iter()
                .find(|name| name.name == "DataWindow")
                .unwrap()
                .formula,
            "Data!$A$4:$A$5"
        );

        let restored = patch_workbook_structure(
            &inserted,
            &WorkbookStructureChange {
                sheet: "Data".into(),
                axis: WorkbookStructureAxis::Row,
                action: WorkbookStructureAction::Delete,
                index: 1,
                count: 2,
            },
        )
        .unwrap();
        let restored_data = zip_text(&restored, "xl/worksheets/sheet1.xml");
        let restored_summary = zip_text(&restored, "xl/worksheets/sheet2.xml");
        assert!(restored_data.contains("r=\"A2\""));
        assert!(restored_data.contains("SUM(A2:A3)"));
        assert!(restored_data.contains("ref=\"A1:B3\""));
        assert!(restored_data.contains("ref=\"A4:B4\""));
        assert!(restored_data.contains("sqref=\"A2:A3\""));
        assert!(restored_summary.contains("Data!A2"));
    }

    #[test]
    fn inserts_and_deletes_columns_with_layout_and_relationship_migration() {
        let mut workbook = Workbook::new();
        let data = workbook.add_worksheet();
        data.set_name("Data").unwrap();
        data.write_string(0, 0, "Category").unwrap();
        data.write_number(0, 1, 10).unwrap();
        data.write_number(0, 2, 20).unwrap();
        data.write_string(1, 0, "Total").unwrap();
        data.write_formula(1, 3, Formula::new("=SUM(B1:C1)").set_result("30"))
            .unwrap();
        data.set_column_width(1, 14).unwrap();
        data.set_column_width(2, 16).unwrap();
        data.set_freeze_panes(0, 2).unwrap();
        data.autofilter(0, 0, 1, 2).unwrap();
        data.merge_range(2, 1, 2, 2, "Merged", &Format::new())
            .unwrap();
        data.add_data_validation(
            0,
            1,
            1,
            2,
            &DataValidation::new()
                .allow_list_strings(&["10", "20"])
                .unwrap(),
        )
        .unwrap();
        let mut chart = Chart::new(ChartType::Column);
        chart
            .add_series()
            .set_categories("Data!$A$1:$A$2")
            .set_values("Data!$B$1:$B$2");
        data.insert_chart(0, 4, &chart).unwrap();
        let summary = workbook.add_worksheet();
        summary.set_name("Summary").unwrap();
        summary
            .write_formula(0, 0, Formula::new("=Data!B1").set_result("10"))
            .unwrap();
        workbook
            .define_name("DataColumns", "=Data!$B$1:$C$2")
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let source_layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        let source_b_width = source_layout
            .column_widths
            .iter()
            .find(|width| width.start_column == 1)
            .unwrap()
            .width;
        let source_c_width = source_layout
            .column_widths
            .iter()
            .find(|width| width.start_column == 2)
            .unwrap()
            .width;
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Column,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 1,
        };

        let inserted = patch_workbook_structure(&source, &change).unwrap();
        validate_workbook_package(&inserted).unwrap();
        let data_xml = zip_text(&inserted, "xl/worksheets/sheet1.xml");
        let summary_xml = zip_text(&inserted, "xl/worksheets/sheet2.xml");
        let chart_xml = zip_text(&inserted, "xl/charts/chart1.xml");
        let drawing_xml = zip_text(&inserted, "xl/drawings/drawing1.xml");
        assert!(data_xml.contains("r=\"C1\""));
        assert!(data_xml.contains("r=\"D1\""));
        assert!(data_xml.contains("r=\"E2\""));
        assert!(data_xml.contains("SUM(C1:D1)"));
        assert!(data_xml.contains("ref=\"A1:D2\""));
        assert!(data_xml.contains("ref=\"C3:D3\""));
        assert!(data_xml.contains("sqref=\"C1:D2\""));
        assert!(summary_xml.contains("Data!C1"));
        assert!(chart_xml.contains("Data!$C$1:$C$2"));
        assert!(drawing_xml.contains("<xdr:col>5</xdr:col>"));
        let layout = read_workbook_sheet_layout(&inserted, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.freeze_pane.columns, 3);
        assert!(layout
            .column_widths
            .iter()
            .any(|width| width.start_column == 2
                && (width.width - source_b_width).abs() < f64::EPSILON));
        assert!(layout
            .column_widths
            .iter()
            .any(|width| width.start_column == 3
                && (width.width - source_c_width).abs() < f64::EPSILON));
        assert_eq!(
            read_workbook_defined_names(&inserted)
                .unwrap()
                .into_iter()
                .find(|name| name.name == "DataColumns")
                .unwrap()
                .formula,
            "Data!$C$1:$D$2"
        );

        let restored = patch_workbook_structure(
            &inserted,
            &WorkbookStructureChange {
                action: WorkbookStructureAction::Delete,
                ..change
            },
        )
        .unwrap();
        let restored_data = zip_text(&restored, "xl/worksheets/sheet1.xml");
        let restored_summary = zip_text(&restored, "xl/worksheets/sheet2.xml");
        assert!(restored_data.contains("r=\"B1\""));
        assert!(restored_data.contains("r=\"D2\""));
        assert!(restored_data.contains("SUM(B1:C1)"));
        assert!(restored_data.contains("ref=\"B3:C3\""));
        assert!(restored_summary.contains("Data!B1"));
        let layout = read_workbook_sheet_layout(&restored, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.freeze_pane.columns, 2);
    }

    #[test]
    fn rejects_unsafe_column_structure_carriers() {
        let table = br#"<table ref="A1:B3"><autoFilter ref="A1:B3"/><tableColumns count="2"><tableColumn id="1" name="A"/><tableColumn id="2" name="B"/></tableColumns></table>"#;
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Column,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 1,
        };
        assert!(super::patch_table_structure(table, "Data", &change)
            .unwrap_err()
            .contains("Table 列结构"));
        assert!(validate_plain_structure_sheet(
            br#"<worksheet><autoFilter ref="A1:B3"><filterColumn colId="0"/></autoFilter></worksheet>"#,
            true,
            &change,
        )
        .unwrap_err()
        .contains("活动筛选条件"));
    }

    #[test]
    fn migrates_sheet_local_range_carriers_and_rejects_unsafe_deletions() {
        let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <dimension ref="A1:B3"/>
              <sheetViews><sheetView workbookViewId="0">
                <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
                <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
              </sheetView></sheetViews>
              <sheetData>
                <row r="1"><c r="A1"><v>1</v></c></row>
                <row r="2"><c r="A2"><v>2</v></c></row>
                <row r="3"><c r="A3"><v>3</v></c></row>
              </sheetData>
              <autoFilter ref="A1:B3"/>
              <mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells>
              <conditionalFormatting sqref="A2:B3"><cfRule type="expression" priority="1"><formula>A2&gt;0</formula></cfRule></conditionalFormatting>
              <dataValidations count="1"><dataValidation type="custom" sqref="A2:A3"><formula1>Data!A2&gt;0</formula1></dataValidation></dataValidations>
              <hyperlinks><hyperlink ref="A2" location="Data!A2" display="jump"/></hyperlinks>
            </worksheet>"#;
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 0,
            count: 1,
        };
        let output =
            String::from_utf8(patch_sheet_structure_axis(xml, "Data", &change, true).unwrap())
                .unwrap();
        assert!(output.contains("ySplit=\"2\""));
        assert!(output.contains("topLeftCell=\"A3\""));
        assert!(output.contains("activeCell=\"A3\" sqref=\"A3\""));
        assert!(output.contains("ref=\"A2:B4\""));
        assert!(output.contains("ref=\"A3:B3\""));
        assert!(output.contains("sqref=\"A3:B4\""));
        assert!(output.contains("sqref=\"A3:A4\""));
        assert!(output.contains("A3&gt;0"));
        assert!(output.contains("Data!A3&gt;0"));
        assert!(output.contains("ref=\"A3\" location=\"Data!A3\""));

        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "A").unwrap();
        sheet
            .merge_range(1, 0, 1, 1, "Merged", &Format::new())
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let mut change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Column,
            action: WorkbookStructureAction::Insert,
            index: 0,
            count: 1,
        };
        let column_output = patch_workbook_structure(&source, &change).unwrap();
        assert!(zip_text(&column_output, "xl/worksheets/sheet1.xml").contains("ref=\"B2:C2\""));
        change.axis = WorkbookStructureAxis::Row;
        let output = patch_workbook_structure(&source, &change).unwrap();
        assert!(zip_text(&output, "xl/worksheets/sheet1.xml").contains("ref=\"A3:B3\""));
        change.action = WorkbookStructureAction::Delete;
        change.index = 1;
        let deleted = patch_workbook_structure(&source, &change).unwrap();
        let deleted_xml = zip_text(&deleted, "xl/worksheets/sheet1.xml");
        assert!(!deleted_xml.contains("mergeCells"));

        let mut workbook = Workbook::new();
        workbook.add_worksheet().set_name("Data").unwrap();
        let source = workbook.save_to_buffer().unwrap();
        change.action = WorkbookStructureAction::Insert;
        change.index = 0;
        let output = patch_workbook_structure(&source, &change).unwrap();
        assert!(!zip_text(&output, "xl/worksheets/sheet1.xml").contains("ref=\"A2\""));

        assert!(validate_plain_structure_sheet(
            br#"<worksheet><tableParts count="1"/></worksheet>"#,
            false,
            &change,
        )
        .is_ok());
    }

    #[test]
    fn migrates_table_chart_drawing_and_calc_chain_parts() {
        let mut workbook = Workbook::new();
        let data = workbook.add_worksheet();
        data.set_name("Data").unwrap();
        data.write_string(0, 0, "Category").unwrap();
        data.write_string(0, 1, "Value").unwrap();
        data.write_string(1, 0, "A").unwrap();
        data.write_number(1, 1, 10).unwrap();
        data.write_string(2, 0, "B").unwrap();
        data.write_number(2, 1, 20).unwrap();
        let columns = [
            TableColumn::new().set_header("Category"),
            TableColumn::new().set_header("Value"),
        ];
        data.add_table(
            0,
            0,
            2,
            1,
            &Table::new().set_name("DataTable").set_columns(&columns),
        )
        .unwrap();
        let mut chart = Chart::new(ChartType::Column);
        chart
            .add_series()
            .set_categories("Data!$A$2:$A$3")
            .set_values("Data!$B$2:$B$3");
        data.insert_chart(1, 3, &chart).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Insert,
            index: 1,
            count: 2,
        };
        let output = patch_workbook_structure(&source, &change).unwrap();
        validate_workbook_package(&output).unwrap();
        let table = zip_text(&output, "xl/tables/table1.xml");
        let chart = zip_text(&output, "xl/charts/chart1.xml");
        let drawing = zip_text(&output, "xl/drawings/drawing1.xml");
        assert!(table.contains("ref=\"A1:B5\""));
        assert!(chart.contains("Data!$A$4:$A$5"));
        assert!(chart.contains("Data!$B$4:$B$5"));
        assert!(drawing.contains("<xdr:row>3</xdr:row>"));

        let calc_chain = br#"<?xml version="1.0" encoding="UTF-8"?>
            <calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <c r="A2" i="1"/><c r="B3"/><c r="A1" i="2"/>
            </calcChain>"#;
        let deleted = WorkbookStructureChange {
            action: WorkbookStructureAction::Delete,
            index: 1,
            count: 1,
            ..change
        };
        let migrated =
            String::from_utf8(patch_calc_chain_rows(calc_chain, "1", &deleted).unwrap()).unwrap();
        assert!(!migrated.contains("r=\"A2\""));
        assert!(migrated.contains("r=\"B2\" i=\"1\""));
        assert!(migrated.contains("r=\"A1\" i=\"2\""));

        let table = br#"<table ref="A1:B3"><autoFilter ref="A1:B3"/></table>"#;
        let full_table_delete = WorkbookStructureChange {
            index: 0,
            count: 3,
            ..deleted
        };
        assert!(
            super::patch_table_structure(table, "Data", &full_table_delete)
                .unwrap_err()
                .contains("转换为普通区域")
        );
        assert!(validate_plain_structure_sheet(
            br#"<worksheet><legacyDrawing r:id="rId1"/></worksheet>"#,
            true,
            &full_table_delete,
        )
        .unwrap_err()
        .contains("批注"));
    }

    #[test]
    fn deletes_complete_sheet_range_objects_and_updates_counts() {
        let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <dimension ref="A1:B4"/>
              <sheetData>
                <row r="1"><c r="A1"><v>1</v></c></row>
                <row r="2"><c r="A2"><v>2</v></c></row>
                <row r="4"><c r="A4"><v>4</v></c></row>
              </sheetData>
              <autoFilter ref="A2:B2"><filterColumn colId="0"/></autoFilter>
              <mergeCells count="2"><mergeCell ref="A2:B2"/><mergeCell ref="A4:B4"/></mergeCells>
              <conditionalFormatting sqref="A2:B2"><cfRule type="expression"><formula>A2&gt;0</formula></cfRule></conditionalFormatting>
              <dataValidations count="2"><dataValidation sqref="A2"><formula1>A2&gt;0</formula1></dataValidation><dataValidation sqref="A4"/></dataValidations>
              <hyperlinks><hyperlink ref="A2" location="Data!A2"/><hyperlink ref="A4" location="Data!A4"/></hyperlinks>
            </worksheet>"#;
        let change = WorkbookStructureChange {
            sheet: "Data".into(),
            axis: WorkbookStructureAxis::Row,
            action: WorkbookStructureAction::Delete,
            index: 1,
            count: 1,
        };
        let pruned = super::remove_deleted_sheet_range_objects(xml, "Data", &change).unwrap();
        let output =
            String::from_utf8(patch_sheet_structure_axis(&pruned, "Data", &change, true).unwrap())
                .unwrap();
        assert!(!output.contains("autoFilter"));
        assert!(!output.contains("conditionalFormatting"));
        assert!(output.contains("mergeCells count=\"1\""));
        assert!(output.contains("mergeCell ref=\"A3:B3\""));
        assert!(output.contains("dataValidations count=\"1\""));
        assert!(output.contains("dataValidation sqref=\"A3\""));
        assert_eq!(output.matches("<hyperlink ").count(), 1);
        assert!(output.contains("hyperlink ref=\"A3\" location=\"Data!A3\""));
    }
}
