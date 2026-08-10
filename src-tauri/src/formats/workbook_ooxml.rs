use crate::formats::workbook::{
    WorkbookArrayFormula, WorkbookCellEdit, WorkbookCellStyle, WorkbookCellStyleEdit,
    WorkbookChart, WorkbookChartDataLabels, WorkbookChartSeries, WorkbookColumnState,
    WorkbookColumnStateEdit, WorkbookColumnWidth, WorkbookColumnWidthEdit,
    WorkbookConditionalColorScale, WorkbookConditionalColorScalePoint, WorkbookConditionalDataBar,
    WorkbookConditionalFormatAction, WorkbookConditionalFormatChange,
    WorkbookConditionalFormatRule, WorkbookConditionalFormatStyle, WorkbookConditionalIconSet,
    WorkbookConditionalIconThreshold, WorkbookConditionalThreshold, WorkbookDataConnection,
    WorkbookDataValidation, WorkbookDataValidationAction, WorkbookDataValidationChange,
    WorkbookDefinedName, WorkbookDefinedNameAction, WorkbookDefinedNameChange,
    WorkbookDrawingAction, WorkbookDrawingAnchor, WorkbookDrawingChange, WorkbookDrawingObject,
    WorkbookExternalLink, WorkbookFilterAction, WorkbookFilterChange, WorkbookFilterState,
    WorkbookFilterTarget, WorkbookFreezePane, WorkbookHeaderFooterChange, WorkbookLinkedData,
    WorkbookMergeEdit, WorkbookMergeRange, WorkbookNamedStyle, WorkbookPageLayout,
    WorkbookPageLayoutChange, WorkbookPageMargins, WorkbookPivotAggregationVariant,
    WorkbookPivotAxisHierarchyAudit, WorkbookPivotCacheFieldRebuild,
    WorkbookPivotCacheRebuildResult, WorkbookPivotExpandedRebuildResult,
    WorkbookPivotLayoutVariant, WorkbookPivotMultiAxisAuditResult, WorkbookPivotRebuildGate,
    WorkbookPivotRebuildImpact, WorkbookPivotRebuildPlan, WorkbookPivotSynchronizedRebuildResult,
    WorkbookPivotTable, WorkbookPivotVariantVerificationResult, WorkbookPrintOptions,
    WorkbookPrintOptionsChange, WorkbookProtection, WorkbookRangeReference, WorkbookRowHeight,
    WorkbookRowHeightEdit, WorkbookRowState, WorkbookRowStateEdit, WorkbookSlicer,
    WorkbookStructureAction, WorkbookStructureAxis, WorkbookStructureChange, WorkbookTable,
    WorkbookTableAction, WorkbookTableChange,
};
use crate::formats::workbook_chart::{
    build_standard_chart_xml, chart_series_from_selection, supported_chart_type,
};
use crate::formats::workbook_formula::{
    migrate_workbook_formula, migrate_workbook_reference, translate_formula,
    validate_workbook_structure_change,
};
use crate::formats::workbook_linked_data::{
    build_workbook_linked_data, inspect_pivot_cache, inspect_pivot_table, PivotCacheAudit,
};
use crate::formats::workbook_pivot::{
    preview_pivot, read_pivot_source_snapshot, MeasureAccumulator,
};
use crate::formats::workbook_styles::{parse_styles, resolve_style_edits, ResolvedStyleEdit};
use calamine::{open_workbook_from_rs, Data, Reader as CalamineReader, Xlsx};
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::name::QName;
use quick_xml::{Reader, Writer, XmlVersion};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_CELL_EDITS: usize = 10_000;
const MAX_CELL_TEXT: usize = 32_767;
const MAX_FORMULA_TEXT: usize = 8_192;
const EDITABLE_ERROR_VALUES: [&str; 7] = [
    "#NULL!",
    "#DIV/0!",
    "#VALUE!",
    "#REF!",
    "#NAME?",
    "#NUM!",
    "#N/A",
];
const MAX_ARRAY_FORMULAS: usize = 1_024;
const MAX_ARRAY_FORMULA_CELLS: usize = 1_000_000;
const MAX_ARRAY_DIAGNOSTIC_CELLS: usize = 256;
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
const MAX_CONDITIONAL_FORMAT_RULES: usize = 10_000;
const MAX_DRAWING_OBJECTS: usize = 1_024;
const MAX_CHART_SERIES: usize = 256;
const MAX_DRAWING_TEXT: usize = 1_024;
const MAX_LINKED_DATA_OBJECTS: usize = 4_096;
const MAX_LINKED_DATA_TEXT: usize = 1_024;
const MAX_PIVOT_CACHE_REBUILD_FIELDS: usize = 256;
const MAX_HEADER_FOOTER_TEXT: usize = 8_192;
const MAX_EDITABLE_HEADER_FOOTER_TEXT: usize = 255;
const CELL_PATCH_DEFLATE_LEVEL: i64 = 4;

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
    pub auto_filter_state: WorkbookFilterState,
    pub tables: Vec<WorkbookTable>,
    pub data_validations: Vec<WorkbookDataValidation>,
    pub conditional_formats: Vec<WorkbookConditionalFormatRule>,
    pub array_formulas: Vec<WorkbookArrayFormula>,
    pub drawings: Vec<WorkbookDrawingObject>,
    pub page_layout: WorkbookPageLayout,
}

fn is_dynamic_array_formula(formula: &str) -> bool {
    let normalized = formula.to_ascii_uppercase();
    [
        "SEQUENCE(",
        "FILTER(",
        "UNIQUE(",
        "SORT(",
        "SORTBY(",
        "RANDARRAY(",
        "TOCOL(",
        "TOROW(",
        "TAKE(",
        "DROP(",
        "EXPAND(",
        "VSTACK(",
        "HSTACK(",
        "WRAPROWS(",
        "WRAPCOLS(",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn empty_array_cache_type_counts() -> BTreeMap<String, usize> {
    ["number", "text", "boolean", "error", "date", "other"]
        .into_iter()
        .map(|kind| (kind.into(), 0))
        .collect()
}

fn array_cache_value_kind(cell_type: Option<&str>) -> &'static str {
    match cell_type {
        None | Some("n") => "number",
        Some("s" | "str" | "inlineStr") => "text",
        Some("b") => "boolean",
        Some("e") => "error",
        Some("d") => "date",
        _ => "other",
    }
}

fn read_array_formulas(xml: &[u8]) -> Result<Vec<WorkbookArrayFormula>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut current_cell = None;
    let mut current_cell_has_metadata = false;
    let mut formulas = Vec::new();
    let mut declared_cells = 0usize;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析数组公式结构失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
                current_cell_has_metadata = xml_value(event, b"cm", reader.decoder())?.is_some();
            }
            Event::End(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = None;
                current_cell_has_metadata = false;
            }
            Event::Start(ref event)
                if event.local_name().as_ref() == b"f"
                    && xml_value(event, b"t", reader.decoder())?.as_deref() == Some("array") =>
            {
                let anchor = current_cell.ok_or("数组公式缺少 anchor 单元格")?;
                let declared_range =
                    xml_value(event, b"ref", reader.decoder())?.ok_or("数组公式缺少声明范围")?;
                let range = parse_range_reference(&declared_range)?;
                if anchor != (range.top, range.left) {
                    return Err("数组公式 anchor 必须位于声明范围左上角".into());
                }
                let text = reader
                    .read_text(event.name())
                    .map_err(|error| format!("读取数组公式失败: {error}"))?
                    .xml10_content()
                    .map_err(|error| format!("解码数组公式失败: {error}"))?;
                let text = quick_xml::escape::unescape(&text)
                    .map_err(|error| format!("还原数组公式失败: {error}"))?
                    .into_owned();
                if text.is_empty() {
                    return Err("数组公式内容不能为空".into());
                }
                let formula = format!("={text}");
                if formula.len() > MAX_FORMULA_TEXT {
                    return Err(format!("数组公式不能超过 {MAX_FORMULA_TEXT} 字节"));
                }
                let height = range
                    .bottom
                    .checked_sub(range.top)
                    .and_then(|value| value.checked_add(1))
                    .ok_or("数组公式范围行数溢出")?;
                let width = range
                    .right
                    .checked_sub(range.left)
                    .and_then(|value| value.checked_add(1))
                    .ok_or("数组公式范围列数溢出")?;
                let cell_count = height.checked_mul(width).ok_or("数组公式范围大小溢出")?;
                declared_cells = declared_cells
                    .checked_add(cell_count)
                    .ok_or("数组公式总范围大小溢出")?;
                if cell_count > MAX_ARRAY_FORMULA_CELLS || declared_cells > MAX_ARRAY_FORMULA_CELLS
                {
                    return Err(format!(
                        "数组公式声明范围合计不能超过 {MAX_ARRAY_FORMULA_CELLS} 个单元格"
                    ));
                }
                let dynamic = current_cell_has_metadata || is_dynamic_array_formula(&formula);
                formulas.push(WorkbookArrayFormula {
                    kind: if dynamic {
                        "dynamic_array".into()
                    } else {
                        "legacy_array".into()
                    },
                    anchor_row: anchor.0,
                    anchor_column: anchor.1,
                    range,
                    formula,
                    declared_cell_count: cell_count,
                    cached_cell_count: 0,
                    occupied_cell_count: 0,
                    missing_cached_cell_count: cell_count,
                    foreign_formula_cell_count: 0,
                    cached_value_types: empty_array_cache_type_counts(),
                    error_cache_count: 0,
                    error_cache_cells: Vec::new(),
                    conflict_cells: Vec::new(),
                    diagnostic_cells_truncated: false,
                    spill_status: if dynamic {
                        "cache_pending".into()
                    } else {
                        "not_applicable".into()
                    },
                    calculation_status: "blocked".into(),
                    write_status: "blocked".into(),
                    blocker: if dynamic {
                        "动态数组只读展示；本地重算、溢出冲突处理和写回尚未开放".into()
                    } else {
                        "传统数组公式只读展示；多单元格数组重算和写回尚未开放".into()
                    },
                });
                if formulas.len() > MAX_ARRAY_FORMULAS {
                    return Err(format!(
                        "单个工作表最多读取 {MAX_ARRAY_FORMULAS} 个数组公式"
                    ));
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut ranges_by_row = HashMap::<usize, Vec<(usize, usize, usize)>>::new();
    for (index, formula) in formulas.iter().enumerate() {
        for row in formula.range.top..=formula.range.bottom {
            ranges_by_row.entry(row).or_default().push((
                formula.range.left,
                formula.range.right,
                index,
            ));
        }
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    buffer.clear();
    current_cell = None;
    let mut current_cell_type = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析数组公式缓存失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
                current_cell_type = xml_value(event, b"t", reader.decoder())?;
                if let Some((row, column)) = current_cell {
                    if let Some(ranges) = ranges_by_row.get(&row) {
                        for &(left, right, index) in ranges {
                            if column >= left && column <= right {
                                formulas[index].occupied_cell_count += 1;
                            }
                        }
                    }
                }
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"c" => {
                if let Some((row, column)) = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?
                {
                    if let Some(ranges) = ranges_by_row.get(&row) {
                        for &(left, right, index) in ranges {
                            if column >= left && column <= right {
                                formulas[index].occupied_cell_count += 1;
                            }
                        }
                    }
                }
                current_cell = None;
                current_cell_type = None;
            }
            Event::End(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = None;
                current_cell_type = None;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"v" =>
            {
                if let Some((row, column)) = current_cell {
                    if let Some(ranges) = ranges_by_row.get(&row) {
                        for &(left, right, index) in ranges {
                            if column >= left && column <= right {
                                formulas[index].cached_cell_count += 1;
                                let kind = array_cache_value_kind(current_cell_type.as_deref());
                                *formulas[index]
                                    .cached_value_types
                                    .entry(kind.into())
                                    .or_default() += 1;
                                if kind == "error" {
                                    formulas[index].error_cache_count += 1;
                                    if formulas[index].error_cache_cells.len()
                                        < MAX_ARRAY_DIAGNOSTIC_CELLS
                                    {
                                        formulas[index]
                                            .error_cache_cells
                                            .push(cell_reference(row, column)?);
                                    } else {
                                        formulas[index].diagnostic_cells_truncated = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"f" =>
            {
                if let Some((row, column)) = current_cell {
                    if let Some(ranges) = ranges_by_row.get(&row) {
                        for &(left, right, index) in ranges {
                            if column >= left
                                && column <= right
                                && (row, column)
                                    != (formulas[index].anchor_row, formulas[index].anchor_column)
                            {
                                formulas[index].foreign_formula_cell_count += 1;
                                if formulas[index].conflict_cells.len() < MAX_ARRAY_DIAGNOSTIC_CELLS
                                {
                                    formulas[index]
                                        .conflict_cells
                                        .push(cell_reference(row, column)?);
                                } else {
                                    formulas[index].diagnostic_cells_truncated = true;
                                }
                            }
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    for formula in &mut formulas {
        formula.missing_cached_cell_count = formula
            .declared_cell_count
            .saturating_sub(formula.cached_cell_count);
        if formula.kind == "dynamic_array" {
            formula.spill_status = if formula.foreign_formula_cell_count > 0 {
                "potential_conflict".into()
            } else if formula.missing_cached_cell_count > 0 {
                "cache_incomplete".into()
            } else {
                "cached_complete".into()
            };
        }
    }
    Ok(formulas)
}

fn read_sheet_formulas_and_style_ids(
    xml: &[u8],
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<
    (
        BTreeMap<(usize, usize), String>,
        HashMap<(usize, usize), usize>,
    ),
    String,
> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut current_cell = None;
    let mut shared = HashMap::<String, ((usize, usize), String)>::new();
    let mut formulas = BTreeMap::new();
    let mut style_ids = HashMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表公式失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"c" => {
                current_cell = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
                if current_cell.is_some_and(|(row, _)| row >= row_end) {
                    break;
                }
                if let Some(coordinate) = current_cell.filter(|(row, column)| {
                    *row >= row_start && *row < row_end && *column < max_columns
                }) {
                    let style_id = xml_value(event, b"s", reader.decoder())?
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or_default();
                    if style_id > 0 {
                        style_ids.insert(coordinate, style_id);
                    }
                }
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"c" => {
                let coordinate = xml_value(event, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
                if coordinate.is_some_and(|(row, _)| row >= row_end) {
                    break;
                }
                if let Some(coordinate) = coordinate.filter(|(row, column)| {
                    *row >= row_start && *row < row_end && *column < max_columns
                }) {
                    let style_id = xml_value(event, b"s", reader.decoder())?
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or_default();
                    if style_id > 0 {
                        style_ids.insert(coordinate, style_id);
                    }
                }
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
    Ok((formulas, style_ids))
}

#[cfg(test)]
fn read_sheet_formulas(
    xml: &[u8],
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<BTreeMap<(usize, usize), String>, String> {
    read_sheet_formulas_and_style_ids(xml, row_start, row_end, max_columns)
        .map(|(formulas, _)| formulas)
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
    auto_filter_state: WorkbookFilterState,
    data_validations: Vec<WorkbookDataValidation>,
    page_layout: WorkbookPageLayout,
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

fn usize_xml_attribute(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<usize>, String> {
    xml_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| format!("XML 属性 {} 不是有效非负整数", String::from_utf8_lossy(key)))
        })
        .transpose()
}

fn decode_contains_filter(value: &str) -> Option<String> {
    let inner = value.strip_prefix('*')?.strip_suffix('*')?;
    let mut output = String::new();
    let mut chars = inner.chars();
    while let Some(character) = chars.next() {
        if character == '~' {
            output.push(chars.next()?);
        } else if matches!(character, '*' | '?') {
            return None;
        } else {
            output.push(character);
        }
    }
    Some(output)
}

fn read_auto_filter_state(
    xml: &[u8],
    range: &WorkbookMergeRange,
) -> Result<WorkbookFilterState, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut inside = false;
    let mut current_column = None;
    let mut filter_count = 0usize;
    let mut sort_count = 0usize;
    let mut state = WorkbookFilterState {
        editable: true,
        ..WorkbookFilterState::default()
    };
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse AutoFilter state: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"autoFilter" => {
                inside = true;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"autoFilter" => {
                return Ok(state);
            }
            Event::End(ref end) if inside && end.local_name().as_ref() == b"autoFilter" => break,
            Event::Start(ref start) if inside && start.local_name().as_ref() == b"filterColumn" => {
                let column = xml_value(start, b"colId", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok());
                current_column = column.and_then(|offset| range.left.checked_add(offset));
                if current_column.is_none()
                    || current_column.is_some_and(|column| column > range.right)
                {
                    state.editable = false;
                }
            }
            Event::Empty(ref start) if inside && start.local_name().as_ref() == b"filterColumn" => {
                let column = xml_value(start, b"colId", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok())
                    .and_then(|offset| range.left.checked_add(offset));
                if column.is_none() || column.is_some_and(|value| value > range.right) {
                    state.editable = false;
                }
            }
            Event::End(ref end) if inside && end.local_name().as_ref() == b"filterColumn" => {
                current_column = None;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside && start.local_name().as_ref() == b"customFilter" =>
            {
                filter_count += 1;
                let operator = xml_value(start, b"operator", reader.decoder())?
                    .unwrap_or_else(|| "equal".into());
                let value = xml_value(start, b"val", reader.decoder())?;
                if filter_count == 1 && operator == "equal" {
                    if let (Some(column), Some(query)) = (
                        current_column,
                        value.as_deref().and_then(decode_contains_filter),
                    ) {
                        state.filter_column = Some(column);
                        state.query = Some(query);
                    } else {
                        state.editable = false;
                    }
                } else {
                    state.editable = false;
                }
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside
                    && matches!(
                        start.local_name().as_ref(),
                        b"filters"
                            | b"filter"
                            | b"dateGroupItem"
                            | b"top10"
                            | b"dynamicFilter"
                            | b"colorFilter"
                            | b"iconFilter"
                    ) =>
            {
                state.editable = false;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside && start.local_name().as_ref() == b"sortCondition" =>
            {
                sort_count += 1;
                let reference = xml_value(start, b"ref", reader.decoder())?;
                let column = reference
                    .as_deref()
                    .and_then(|value| parse_range_reference(value).ok())
                    .map(|value| value.left);
                if sort_count == 1
                    && column.is_some_and(|value| value >= range.left && value <= range.right)
                {
                    state.sort_column = column;
                    state.sort_direction = Some(
                        if bool_attribute(start, b"descending", reader.decoder(), false)? {
                            "desc"
                        } else {
                            "asc"
                        }
                        .into(),
                    );
                } else {
                    state.editable = false;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(state)
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
        "error" if EDITABLE_ERROR_VALUES.contains(&edit.input.as_str()) => Ok(()),
        "empty" if edit.input.is_empty() => Ok(()),
        "formula"
            if edit.input.starts_with('=')
                && edit.input.len() > 1
                && length <= MAX_FORMULA_TEXT =>
        {
            Ok(())
        }
        "string" => Err(format!("单元格文本不能超过 {MAX_CELL_TEXT} 个字符")),
        "error" => Err("错误值必须是受支持的标准 Excel 错误常量".into()),
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
        "error" => cell.push_attribute(("t", "e")),
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
        "error" => {
            writer
                .write_event(Event::Start(BytesStart::new("v")))
                .and_then(|_| writer.write_event(Event::Text(BytesText::new(&edit.input))))
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new("v"))))
                .map_err(|error| format!("写入错误值单元格失败: {error}"))?;
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
    if !xml
        .windows(b"mergeCell".len())
        .any(|window| window == b"mergeCell")
    {
        return Ok(());
    }
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
        if found_sheet_data && inside_sheet_data && pending.is_empty() {
            // The remaining worksheet suffix is outside every requested patch and stays byte-identical.
            let position = reader.buffer_position() as usize;
            if position > xml.len() {
                return Err("工作表 XML 读取位置无效".into());
            }
            let mut output = writer.into_inner();
            output.extend_from_slice(&xml[position..]);
            return Ok(output);
        }
        buffer.clear();
    }
    if !found_sheet_data || !pending.is_empty() {
        return Err("XLSX 工作表缺少可写入的 sheetData".into());
    }
    Ok(writer.into_inner())
}

fn load_package(source: &[u8]) -> Result<Vec<PackageEntry>, String> {
    load_package_selected(source, None)
}

fn load_package_selected(
    source: &[u8],
    selected_paths: Option<&HashSet<String>>,
) -> Result<Vec<PackageEntry>, String> {
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
        if selected_paths.is_none_or(|paths| paths.contains(file.name())) {
            file.read_to_end(&mut data)
                .map_err(|error| format!("读取 XLSX 部件内容失败: {error}"))?;
        }
        entries.push(PackageEntry {
            name: file.name().to_string(),
            is_dir: file.is_dir(),
            compression: file.compression(),
            data,
        });
    }
    Ok(entries)
}

fn load_package_for_cell_patch(
    source: &[u8],
    touched_sheets: &HashSet<String>,
    load_styles: bool,
) -> Result<Vec<PackageEntry>, String> {
    let mut selected = HashSet::from([
        "xl/workbook.xml".to_string(),
        "xl/_rels/workbook.xml.rels".to_string(),
    ]);
    let inventory = load_package_selected(source, Some(&selected))?;
    let sheet_paths = workbook_sheet_paths(&inventory)?;
    for sheet in touched_sheets {
        selected.insert(
            sheet_paths
                .get(sheet)
                .cloned()
                .ok_or_else(|| format!("工作表不存在: {sheet}"))?,
        );
    }
    if load_styles {
        selected.insert("xl/styles.xml".into());
        selected.insert("xl/theme/theme1.xml".into());
    }
    load_package_selected(source, Some(&selected))
}

pub(super) fn defined_name_reference(
    formula: &str,
    scope: Option<&str>,
) -> Option<WorkbookRangeReference> {
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

fn apply_page_layout_attributes(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    result: &mut WorkbookPageLayout,
) -> Result<(), String> {
    match event.local_name().as_ref() {
        b"pageMargins" => {
            result.margins = WorkbookPageMargins {
                left: parse_f64_attribute(event, b"left", decoder)?,
                right: parse_f64_attribute(event, b"right", decoder)?,
                top: parse_f64_attribute(event, b"top", decoder)?,
                bottom: parse_f64_attribute(event, b"bottom", decoder)?,
                header: parse_f64_attribute(event, b"header", decoder)?,
                footer: parse_f64_attribute(event, b"footer", decoder)?,
            };
        }
        b"pageSetup" => {
            result.setup.orientation = xml_value(event, b"orientation", decoder)?;
            result.setup.paper_size = parse_u32_value(xml_value(event, b"paperSize", decoder)?);
            result.setup.scale = parse_u32_value(xml_value(event, b"scale", decoder)?);
            result.setup.fit_to_width = parse_u32_value(xml_value(event, b"fitToWidth", decoder)?);
            result.setup.fit_to_height =
                parse_u32_value(xml_value(event, b"fitToHeight", decoder)?);
            result.setup.first_page_number =
                parse_u32_value(xml_value(event, b"firstPageNumber", decoder)?);
            result.setup.use_first_page_number =
                bool_attribute(event, b"useFirstPageNumber", decoder, false)?;
            result.setup.horizontal_dpi =
                parse_u32_value(xml_value(event, b"horizontalDpi", decoder)?);
            result.setup.vertical_dpi = parse_u32_value(xml_value(event, b"verticalDpi", decoder)?);
            result.setup.black_and_white = bool_attribute(event, b"blackAndWhite", decoder, false)?;
            result.setup.draft = bool_attribute(event, b"draft", decoder, false)?;
        }
        b"pageSetUpPr" => {
            result.setup.fit_to_page = bool_attribute(event, b"fitToPage", decoder, false)?;
        }
        b"printOptions" => {
            result.options = WorkbookPrintOptions {
                grid_lines: bool_attribute(event, b"gridLines", decoder, false)?,
                headings: bool_attribute(event, b"headings", decoder, false)?,
                horizontal_centered: bool_attribute(event, b"horizontalCentered", decoder, false)?,
                vertical_centered: bool_attribute(event, b"verticalCentered", decoder, false)?,
            };
        }
        b"headerFooter" => {
            result.header_footer.different_odd_even =
                bool_attribute(event, b"differentOddEven", decoder, false)?;
            result.header_footer.different_first_page =
                bool_attribute(event, b"differentFirst", decoder, false)?;
            result.header_footer.scale_with_document =
                bool_attribute(event, b"scaleWithDoc", decoder, true)?;
            result.header_footer.align_with_margins =
                bool_attribute(event, b"alignWithMargins", decoder, true)?;
        }
        b"sheetProtection" => {
            result.protection.enabled = bool_attribute(event, b"sheet", decoder, false)?;
            result.protection.password_protected = xml_value(event, b"password", decoder)?
                .is_some()
                || xml_value(event, b"hashValue", decoder)?.is_some();
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
                if bool_attribute(event, attribute, decoder, false)? {
                    result.protection.blocked_actions.push(label.into());
                }
            }
        }
        _ => {}
    }
    Ok(())
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
    let mut page_layout = WorkbookPageLayout::default();
    let mut current_validation: Option<WorkbookDataValidation> = None;
    let mut validation_formula: Option<u8> = None;
    let mut validation_formula_text = String::new();
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
                validation_formula_text.clear();
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"formula2" => {
                validation_formula = Some(2);
                validation_formula_text.clear();
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
                validation_formula_text.push_str(&value);
            }
            Event::CData(ref event) if validation_formula.is_some() => {
                validation_formula_text.push_str(
                    &event
                        .decode()
                        .map_err(|error| format!("解码数据验证公式失败: {error}"))?,
                );
            }
            Event::GeneralRef(ref event) if validation_formula.is_some() => {
                let decoded = event
                    .decode()
                    .map_err(|error| format!("解码数据验证公式实体失败: {error}"))?;
                if let Some(value) = quick_xml::escape::resolve_xml_entity(&decoded) {
                    validation_formula_text.push_str(value);
                } else if let Some(value) = event
                    .resolve_char_ref()
                    .map_err(|error| format!("解码数据验证公式字符实体失败: {error}"))?
                {
                    validation_formula_text.push(value);
                } else {
                    return Err(format!("数据验证公式包含未知 XML 实体: &{decoded};"));
                }
            }
            Event::End(ref event)
                if matches!(event.local_name().as_ref(), b"formula1" | b"formula2") =>
            {
                if validation_formula_text.chars().count() > MAX_FORMULA_TEXT {
                    return Err("数据验证公式过长".into());
                }
                if let Some(validation) = current_validation.as_mut() {
                    if validation_formula == Some(1) {
                        validation.formula1 = Some(validation_formula_text.clone());
                    } else {
                        validation.formula2 = Some(validation_formula_text.clone());
                    }
                }
                validation_formula = None;
                validation_formula_text.clear();
            }
            Event::End(ref event) if event.local_name().as_ref() == b"dataValidation" => {
                if let Some(validation) = current_validation.take() {
                    data_validations.push(validation);
                }
                validation_formula = None;
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"row" => {
                let attributes = row_structure_attributes(event, reader.decoder())?;
                if attributes.row.is_some_and(|row| row < row_start) {
                    reader
                        .read_to_end(event.name())
                        .map_err(|error| format!("跳过分页前的工作表行失败: {error}"))?;
                } else if attributes.row.is_some_and(|row| row >= row_end) {
                    reader
                        .read_to_end(event.name())
                        .map_err(|error| format!("跳过分页后的工作表行失败: {error}"))?;
                    reader
                        .read_to_end(QName(b"sheetData"))
                        .map_err(|error| format!("跳过分页后的单元格数据失败: {error}"))?;
                } else {
                    if let (Some(row), Some(height)) = (attributes.row, attributes.height) {
                        if height.is_finite() && height > 0.0 {
                            row_heights.push(WorkbookRowHeight { row, height });
                        }
                    }
                    if let Some(row) = attributes.row {
                        if attributes.hidden || attributes.collapsed || attributes.outline_level > 0
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
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"row" => {
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
                    "oddHeader" => page_layout.header_footer.odd_header = Some(value),
                    "oddFooter" => page_layout.header_footer.odd_footer = Some(value),
                    "evenHeader" => page_layout.header_footer.even_header = Some(value),
                    "evenFooter" => page_layout.header_footer.even_footer = Some(value),
                    "firstHeader" => page_layout.header_footer.first_header = Some(value),
                    "firstFooter" => page_layout.header_footer.first_footer = Some(value),
                    _ => {}
                }
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if matches!(
                    event.local_name().as_ref(),
                    b"pageMargins"
                        | b"pageSetup"
                        | b"pageSetUpPr"
                        | b"printOptions"
                        | b"headerFooter"
                        | b"sheetProtection"
                ) =>
            {
                apply_page_layout_attributes(event, reader.decoder(), &mut page_layout)?;
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
    let auto_filter_state = auto_filter
        .as_ref()
        .map(|range| read_auto_filter_state(xml, range))
        .transpose()?
        .unwrap_or_default();
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
        auto_filter_state,
        data_validations,
        page_layout,
    })
}

fn rgb_style_color(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Option<String> {
    xml_value(event, b"rgb", decoder)
        .ok()
        .flatten()
        .and_then(|value| {
            let value = value.trim_start_matches('#');
            let value = if value.len() == 8 { &value[2..] } else { value };
            (value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
                .then(|| format!("#{}", value.to_ascii_uppercase()))
        })
}

fn read_conditional_dxf_styles(xml: &[u8]) -> Result<Vec<WorkbookConditionalFormatStyle>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut inside_dxfs = false;
    let mut inside_dxf = false;
    let mut inside_font = false;
    let mut inside_fill = false;
    let mut current = WorkbookConditionalFormatStyle::default();
    let mut result = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse conditional-format styles: {error}"))?
        {
            Event::Start(ref start) if start.local_name().as_ref() == b"dxfs" => inside_dxfs = true,
            Event::End(ref end) if end.local_name().as_ref() == b"dxfs" => inside_dxfs = false,
            Event::Start(ref start) if inside_dxfs && start.local_name().as_ref() == b"dxf" => {
                if result.len() >= MAX_CONDITIONAL_FORMAT_RULES {
                    return Err("Too many conditional-format styles.".into());
                }
                inside_dxf = true;
                current = WorkbookConditionalFormatStyle::default();
            }
            Event::End(ref end) if inside_dxf && end.local_name().as_ref() == b"dxf" => {
                inside_dxf = false;
                inside_font = false;
                inside_fill = false;
                result.push(current.clone());
            }
            Event::Start(ref start) if inside_dxf && start.local_name().as_ref() == b"font" => {
                inside_font = true
            }
            Event::End(ref end) if inside_font && end.local_name().as_ref() == b"font" => {
                inside_font = false
            }
            Event::Start(ref start) if inside_dxf && start.local_name().as_ref() == b"fill" => {
                inside_fill = true
            }
            Event::End(ref end) if inside_fill && end.local_name().as_ref() == b"fill" => {
                inside_fill = false
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_font && start.local_name().as_ref() == b"b" =>
            {
                current.bold = bool_attribute(start, b"val", reader.decoder(), true)?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_font && start.local_name().as_ref() == b"color" =>
            {
                current.font_color = rgb_style_color(start, reader.decoder());
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_fill && start.local_name().as_ref() == b"fgColor" =>
            {
                current.fill_color = rgb_style_color(start, reader.decoder());
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn append_formula_general_reference(
    target: &mut String,
    event: &quick_xml::events::BytesRef<'_>,
) -> Result<(), String> {
    let decoded = event
        .decode()
        .map_err(|error| format!("Failed to decode conditional-format formula entity: {error}"))?;
    if let Some(value) = quick_xml::escape::resolve_xml_entity(&decoded) {
        target.push_str(value);
    } else if let Some(value) = event
        .resolve_char_ref()
        .map_err(|error| format!("Failed to decode conditional-format character entity: {error}"))?
    {
        target.push(value);
    } else {
        return Err(format!(
            "Unknown conditional-format XML entity: &{decoded};"
        ));
    }
    Ok(())
}

fn conditional_operator_supported(operator: Option<&str>) -> bool {
    matches!(
        operator,
        Some(
            "between"
                | "notBetween"
                | "equal"
                | "notEqual"
                | "lessThan"
                | "lessThanOrEqual"
                | "greaterThan"
                | "greaterThanOrEqual"
        )
    )
}

const MAX_CONDITIONAL_EXPRESSION_LENGTH: usize = 512;
const MAX_CONDITIONAL_EXPRESSION_DEPTH: usize = 8;
const MAX_CONDITIONAL_EXPRESSION_ARGUMENTS: usize = 8;
const MAX_CONDITIONAL_EXPRESSION_REFERENCES: usize = 8;

#[derive(Clone, Debug, PartialEq)]
enum ConditionalExpressionToken {
    Reference(String),
    Number,
    Text,
    Boolean,
    And,
    Or,
    Not,
    Compare(bool),
    LeftParen,
    RightParen,
    Comma,
}

fn tokenize_conditional_expression(
    formula: &str,
) -> Option<(Vec<ConditionalExpressionToken>, usize)> {
    let source = formula
        .trim()
        .strip_prefix('=')
        .unwrap_or(formula.trim())
        .trim();
    if source.is_empty() || source.chars().count() > MAX_CONDITIONAL_EXPRESSION_LENGTH {
        return None;
    }
    let bytes = source.as_bytes();
    let mut tokens = Vec::new();
    let mut references = 0usize;
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index].is_ascii_whitespace() {
            index += 1;
            continue;
        }
        match bytes[index] {
            b'(' => {
                tokens.push(ConditionalExpressionToken::LeftParen);
                index += 1;
            }
            b')' => {
                tokens.push(ConditionalExpressionToken::RightParen);
                index += 1;
            }
            b',' => {
                tokens.push(ConditionalExpressionToken::Comma);
                index += 1;
            }
            b'<' | b'>' | b'=' => {
                let first = bytes[index];
                let second = bytes.get(index + 1).copied();
                let equality = first == b'=' || (first == b'<' && second == Some(b'>'));
                if index + 1 < bytes.len()
                    && matches!(
                        (bytes[index], bytes[index + 1]),
                        (b'<', b'=') | (b'>', b'=') | (b'<', b'>')
                    )
                {
                    index += 2;
                } else {
                    index += 1;
                }
                tokens.push(ConditionalExpressionToken::Compare(equality));
            }
            b'"' => {
                index += 1;
                let mut closed = false;
                while index < bytes.len() {
                    if bytes[index] == b'"' {
                        if index + 1 < bytes.len() && bytes[index + 1] == b'"' {
                            index += 2;
                        } else {
                            index += 1;
                            closed = true;
                            break;
                        }
                    } else {
                        index += 1;
                    }
                }
                if !closed {
                    return None;
                }
                tokens.push(ConditionalExpressionToken::Text);
            }
            b'+' | b'-' | b'.' | b'0'..=b'9' => {
                let start = index;
                if matches!(bytes[index], b'+' | b'-') {
                    index += 1;
                }
                let integer_start = index;
                while index < bytes.len() && bytes[index].is_ascii_digit() {
                    index += 1;
                }
                let mut digits = index > integer_start;
                if index < bytes.len() && bytes[index] == b'.' {
                    index += 1;
                    let fraction_start = index;
                    while index < bytes.len() && bytes[index].is_ascii_digit() {
                        index += 1;
                    }
                    digits |= index > fraction_start;
                }
                if !digits {
                    return None;
                }
                if index < bytes.len() && matches!(bytes[index], b'e' | b'E') {
                    index += 1;
                    if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
                        index += 1;
                    }
                    let exponent_start = index;
                    while index < bytes.len() && bytes[index].is_ascii_digit() {
                        index += 1;
                    }
                    if exponent_start == index {
                        return None;
                    }
                }
                if source[start..index]
                    .parse::<f64>()
                    .ok()
                    .is_none_or(|value| !value.is_finite())
                {
                    return None;
                }
                tokens.push(ConditionalExpressionToken::Number);
            }
            b'$' | b'A'..=b'Z' | b'a'..=b'z' => {
                let start = index;
                if bytes[index] == b'$' {
                    index += 1;
                }
                let letters_start = index;
                while index < bytes.len() && bytes[index].is_ascii_alphabetic() {
                    index += 1;
                }
                if letters_start == index {
                    return None;
                }
                let word = &source[letters_start..index];
                if index < bytes.len() && bytes[index] == b'$' {
                    index += 1;
                }
                let row_start = index;
                while index < bytes.len() && bytes[index].is_ascii_digit() {
                    index += 1;
                }
                if row_start < index {
                    let reference = &source[start..index];
                    if word.len() > 3 || parse_cell_reference(&reference.replace('$', "")).is_err()
                    {
                        return None;
                    }
                    references += 1;
                    if references > MAX_CONDITIONAL_EXPRESSION_REFERENCES {
                        return None;
                    }
                    tokens.push(ConditionalExpressionToken::Reference(
                        reference.to_ascii_uppercase(),
                    ));
                } else {
                    if start != letters_start {
                        return None;
                    }
                    let token = if word.eq_ignore_ascii_case("AND") {
                        ConditionalExpressionToken::And
                    } else if word.eq_ignore_ascii_case("OR") {
                        ConditionalExpressionToken::Or
                    } else if word.eq_ignore_ascii_case("NOT") {
                        ConditionalExpressionToken::Not
                    } else if word.eq_ignore_ascii_case("TRUE")
                        || word.eq_ignore_ascii_case("FALSE")
                    {
                        ConditionalExpressionToken::Boolean
                    } else {
                        return None;
                    };
                    tokens.push(token);
                }
            }
            _ => return None,
        }
    }
    Some((tokens, references))
}

struct ConditionalExpressionParser {
    tokens: Vec<ConditionalExpressionToken>,
    position: usize,
}

impl ConditionalExpressionParser {
    fn parse(mut self, references: usize) -> bool {
        references > 0 && self.parse_expression(0) && self.position == self.tokens.len()
    }

    fn parse_expression(&mut self, depth: usize) -> bool {
        if depth > MAX_CONDITIONAL_EXPRESSION_DEPTH {
            return false;
        }
        match self.tokens.get(self.position) {
            Some(ConditionalExpressionToken::And | ConditionalExpressionToken::Or) => {
                self.position += 1;
                if !self.take(&ConditionalExpressionToken::LeftParen) {
                    return false;
                }
                let mut arguments = 0usize;
                loop {
                    if arguments >= MAX_CONDITIONAL_EXPRESSION_ARGUMENTS
                        || !self.parse_expression(depth + 1)
                    {
                        return false;
                    }
                    arguments += 1;
                    if self.take(&ConditionalExpressionToken::Comma) {
                        continue;
                    }
                    return arguments >= 2 && self.take(&ConditionalExpressionToken::RightParen);
                }
            }
            Some(ConditionalExpressionToken::Not) => {
                self.position += 1;
                self.take(&ConditionalExpressionToken::LeftParen)
                    && self.parse_expression(depth + 1)
                    && self.take(&ConditionalExpressionToken::RightParen)
            }
            _ => self.parse_comparison(),
        }
    }

    fn parse_comparison(&mut self) -> bool {
        let Some(left) = self.parse_operand() else {
            return false;
        };
        let Some(equality) = self.take_compare() else {
            return false;
        };
        let Some(right) = self.parse_operand() else {
            return false;
        };
        equality
            || !matches!(
                left,
                ConditionalExpressionToken::Text | ConditionalExpressionToken::Boolean
            ) && !matches!(
                right,
                ConditionalExpressionToken::Text | ConditionalExpressionToken::Boolean
            )
    }

    fn parse_operand(&mut self) -> Option<ConditionalExpressionToken> {
        let token = self.tokens.get(self.position)?.clone();
        if matches!(
            token,
            ConditionalExpressionToken::Reference(_)
                | ConditionalExpressionToken::Number
                | ConditionalExpressionToken::Text
                | ConditionalExpressionToken::Boolean
        ) {
            self.position += 1;
            Some(token)
        } else {
            None
        }
    }

    fn take_compare(&mut self) -> Option<bool> {
        let ConditionalExpressionToken::Compare(equality) = self.tokens.get(self.position)? else {
            return None;
        };
        let equality = *equality;
        self.position += 1;
        Some(equality)
    }

    fn take(&mut self, expected: &ConditionalExpressionToken) -> bool {
        if self.tokens.get(self.position) == Some(expected) {
            self.position += 1;
            true
        } else {
            false
        }
    }
}

fn safe_conditional_expression_supported(formula: &str) -> bool {
    let Some((tokens, references)) = tokenize_conditional_expression(formula) else {
        return false;
    };
    ConditionalExpressionParser {
        tokens,
        position: 0,
    }
    .parse(references)
}

fn standard_icon_set_count(icon_set: &str) -> Option<usize> {
    match icon_set {
        "3Arrows" | "3ArrowsGray" | "3Flags" | "3TrafficLights1" | "3TrafficLights2" | "3Signs"
        | "3Symbols" | "3Symbols2" => Some(3),
        "4Arrows" | "4ArrowsGray" | "4RedToBlack" | "4Rating" | "4TrafficLights" => Some(4),
        "5Arrows" | "5ArrowsGray" | "5Rating" | "5Quarters" => Some(5),
        _ => None,
    }
}

fn read_conditional_formats(
    xml: &[u8],
    dxf_styles: &[WorkbookConditionalFormatStyle],
) -> Result<Vec<WorkbookConditionalFormatRule>, String> {
    if !xml
        .windows(b"conditionalFormatting".len())
        .any(|window| window == b"conditionalFormatting")
    {
        return Ok(Vec::new());
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut group_index = 0usize;
    let mut ranges = Vec::new();
    let mut group_rules = Vec::new();
    let mut current: Option<WorkbookConditionalFormatRule> = None;
    let mut formula_text = String::new();
    let mut inside_formula = false;
    let mut inside_color_scale = false;
    let mut color_scale_values: Vec<(String, Option<String>)> = Vec::new();
    let mut color_scale_colors: Vec<String> = Vec::new();
    let mut inside_data_bar = false;
    let mut data_bar_values: Vec<(String, Option<String>)> = Vec::new();
    let mut data_bar_color: Option<String> = None;
    let mut data_bar_show_value = true;
    let mut data_bar_min_length = 10u8;
    let mut data_bar_max_length = 90u8;
    let mut inside_icon_set = false;
    let mut icon_set_name = String::new();
    let mut icon_set_thresholds = Vec::new();
    let mut icon_set_reverse = false;
    let mut icon_set_show_value = true;
    let mut result = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse conditional formats: {error}"))?
        {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                ranges = xml_value(start, b"sqref", reader.decoder())?
                    .ok_or("Conditional formatting is missing sqref.")?
                    .split_ascii_whitespace()
                    .map(parse_range_reference)
                    .collect::<Result<Vec<_>, _>>()?;
                group_rules.clear();
            }
            Event::Start(ref start) if start.name().as_ref() == b"cfRule" => {
                if result.len() + group_rules.len() >= MAX_CONDITIONAL_FORMAT_RULES {
                    return Err("Too many conditional-format rules.".into());
                }
                let kind = xml_value(start, b"type", reader.decoder())?
                    .unwrap_or_else(|| "unknown".into());
                let operator = xml_value(start, b"operator", reader.decoder())?;
                let priority = xml_value(start, b"priority", reader.decoder())?
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(0);
                let dxf_id = xml_value(start, b"dxfId", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok());
                current = Some(WorkbookConditionalFormatRule {
                    group_index,
                    rule_index: group_rules.len(),
                    ranges: ranges.clone(),
                    kind: kind.clone(),
                    operator: operator.clone(),
                    formula1: None,
                    formula2: None,
                    priority,
                    stop_if_true: bool_attribute(start, b"stopIfTrue", reader.decoder(), false)?,
                    style: dxf_id
                        .and_then(|index| dxf_styles.get(index).cloned())
                        .unwrap_or_default(),
                    color_scale: None,
                    data_bar: None,
                    icon_set: None,
                    editable: if matches!(kind.as_str(), "colorScale" | "dataBar" | "iconSet") {
                        dxf_id.is_none()
                    } else {
                        matches!(kind.as_str(), "cellIs" | "expression")
                            && (kind != "cellIs"
                                || conditional_operator_supported(operator.as_deref()))
                            && dxf_id.is_some_and(|index| dxf_styles.get(index).is_some())
                    },
                });
            }
            Event::Start(ref start)
                if current.as_ref().is_some_and(|rule| rule.kind == "dataBar")
                    && start.local_name().as_ref() == b"dataBar" =>
            {
                inside_data_bar = true;
                data_bar_values.clear();
                data_bar_color = None;
                data_bar_show_value = bool_attribute(start, b"showValue", reader.decoder(), true)?;
                data_bar_min_length = xml_value(start, b"minLength", reader.decoder())?
                    .and_then(|value| value.parse::<u8>().ok())
                    .unwrap_or(10);
                data_bar_max_length = xml_value(start, b"maxLength", reader.decoder())?
                    .and_then(|value| value.parse::<u8>().ok())
                    .unwrap_or(90);
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_data_bar && start.local_name().as_ref() == b"cfvo" =>
            {
                let kind = xml_value(start, b"type", reader.decoder())?
                    .unwrap_or_else(|| "unknown".into());
                let value = xml_value(start, b"val", reader.decoder())?;
                if data_bar_values.len() >= 2 {
                    if let Some(rule) = current.as_mut() {
                        rule.editable = false;
                    }
                }
                data_bar_values.push((kind, value));
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_data_bar && start.local_name().as_ref() == b"color" =>
            {
                data_bar_color = rgb_style_color(start, reader.decoder());
                if data_bar_color.is_none() {
                    if let Some(rule) = current.as_mut() {
                        rule.editable = false;
                    }
                }
            }
            Event::End(ref end) if inside_data_bar && end.local_name().as_ref() == b"dataBar" => {
                inside_data_bar = false;
                if let Some(rule) = current.as_mut() {
                    let thresholds = data_bar_values
                        .iter()
                        .map(|(kind, value)| WorkbookConditionalThreshold {
                            kind: kind.clone(),
                            value: value.clone(),
                            resolved_value: (kind == "num").then(|| value.clone()).flatten(),
                        })
                        .collect::<Vec<_>>();
                    if thresholds.len() == 2 && data_bar_color.is_some() {
                        let valid_threshold =
                            |point: &WorkbookConditionalThreshold| match point.kind.as_str() {
                                "min" | "max" => point.value.is_none(),
                                "num" => point.value.as_deref().is_some_and(|value| {
                                    value.parse::<f64>().is_ok_and(|number| number.is_finite())
                                }),
                                "percent" | "percentile" => {
                                    point.value.as_deref().is_some_and(|value| {
                                        value.parse::<f64>().is_ok_and(|number| {
                                            number.is_finite() && (0.0..=100.0).contains(&number)
                                        })
                                    })
                                }
                                _ => false,
                            };
                        let fixed_values =
                            thresholds.iter().all(|point| point.kind == "num").then(|| {
                                thresholds
                                    .iter()
                                    .filter_map(|point| point.value.as_deref()?.parse::<f64>().ok())
                                    .collect::<Vec<_>>()
                            });
                        if !thresholds.iter().all(valid_threshold)
                            || thresholds[0].kind == "max"
                            || thresholds[1].kind == "min"
                            || fixed_values
                                .as_ref()
                                .is_some_and(|values| values.len() != 2 || values[0] >= values[1])
                            || data_bar_min_length > data_bar_max_length
                            || data_bar_max_length > 100
                        {
                            rule.editable = false;
                        }
                        rule.data_bar = Some(WorkbookConditionalDataBar {
                            minimum: thresholds[0].clone(),
                            maximum: thresholds[1].clone(),
                            color: data_bar_color.clone().unwrap_or_default(),
                            show_value: data_bar_show_value,
                            min_length: data_bar_min_length,
                            max_length: data_bar_max_length,
                        });
                    } else {
                        rule.editable = false;
                    }
                }
            }
            Event::Start(ref start)
                if current.as_ref().is_some_and(|rule| rule.kind == "iconSet")
                    && start.local_name().as_ref() == b"iconSet" =>
            {
                inside_icon_set = true;
                icon_set_name = xml_value(start, b"iconSet", reader.decoder())?
                    .unwrap_or_else(|| "3TrafficLights1".into());
                icon_set_reverse = bool_attribute(start, b"reverse", reader.decoder(), false)?;
                icon_set_show_value = bool_attribute(start, b"showValue", reader.decoder(), true)?;
                icon_set_thresholds.clear();
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_icon_set && start.local_name().as_ref() == b"cfvo" =>
            {
                let kind = xml_value(start, b"type", reader.decoder())?
                    .unwrap_or_else(|| "unknown".into());
                let value = xml_value(start, b"val", reader.decoder())?;
                let inclusive = bool_attribute(start, b"gte", reader.decoder(), true)?;
                icon_set_thresholds.push(WorkbookConditionalIconThreshold {
                    resolved_value: (kind == "num").then(|| value.clone()).flatten(),
                    kind,
                    value,
                    inclusive,
                });
            }
            Event::End(ref end) if inside_icon_set && end.local_name().as_ref() == b"iconSet" => {
                inside_icon_set = false;
                if let Some(rule) = current.as_mut() {
                    let expected = standard_icon_set_count(&icon_set_name);
                    let valid_threshold = |point: &WorkbookConditionalIconThreshold| match point
                        .kind
                        .as_str()
                    {
                        "num" => point.value.as_deref().is_some_and(|value| {
                            value.parse::<f64>().is_ok_and(|number| number.is_finite())
                        }),
                        "percent" | "percentile" => point.value.as_deref().is_some_and(|value| {
                            value.parse::<f64>().is_ok_and(|number| {
                                number.is_finite() && (0.0..=100.0).contains(&number)
                            })
                        }),
                        _ => false,
                    };
                    if !expected.is_some_and(|count| count == icon_set_thresholds.len())
                        || !icon_set_thresholds.iter().all(valid_threshold)
                        || !icon_set_thresholds.first().is_some_and(|point| {
                            point.kind == "percent"
                                && point.value.as_deref() == Some("0")
                                && point.inclusive
                        })
                    {
                        rule.editable = false;
                    }
                    rule.icon_set = Some(WorkbookConditionalIconSet {
                        icon_set: icon_set_name.clone(),
                        thresholds: icon_set_thresholds.clone(),
                        reverse: icon_set_reverse,
                        show_value: icon_set_show_value,
                    });
                }
            }
            Event::Start(ref start)
                if current
                    .as_ref()
                    .is_some_and(|rule| rule.kind == "colorScale")
                    && start.local_name().as_ref() == b"colorScale" =>
            {
                inside_color_scale = true;
                color_scale_values.clear();
                color_scale_colors.clear();
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_color_scale && start.local_name().as_ref() == b"cfvo" =>
            {
                let kind = xml_value(start, b"type", reader.decoder())?
                    .unwrap_or_else(|| "unknown".into());
                let value = xml_value(start, b"val", reader.decoder())?;
                let valid = matches!(kind.as_str(), "min" | "max")
                    || (matches!(kind.as_str(), "num" | "percent" | "percentile")
                        && value.as_deref().is_some_and(|value| {
                            value.parse::<f64>().is_ok_and(|number| {
                                number.is_finite()
                                    && (kind == "num" || (0.0..=100.0).contains(&number))
                            })
                        }));
                if !valid || color_scale_values.len() >= 3 {
                    if let Some(rule) = current.as_mut() {
                        rule.editable = false;
                    }
                }
                color_scale_values.push((kind, value));
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if inside_color_scale && start.local_name().as_ref() == b"color" =>
            {
                if let Some(color) = rgb_style_color(start, reader.decoder()) {
                    color_scale_colors.push(color);
                } else if let Some(rule) = current.as_mut() {
                    rule.editable = false;
                }
            }
            Event::End(ref end)
                if inside_color_scale && end.local_name().as_ref() == b"colorScale" =>
            {
                inside_color_scale = false;
                if let Some(rule) = current.as_mut() {
                    if matches!(color_scale_values.len(), 2 | 3)
                        && color_scale_values.len() == color_scale_colors.len()
                    {
                        let scale = WorkbookConditionalColorScale {
                            points: color_scale_values
                                .iter()
                                .zip(&color_scale_colors)
                                .map(
                                    |((kind, value), color)| WorkbookConditionalColorScalePoint {
                                        kind: kind.clone(),
                                        value: value.clone(),
                                        color: color.clone(),
                                        resolved_value: None,
                                    },
                                )
                                .collect(),
                        };
                        let fixed = scale.points.iter().all(|point| point.kind == "num");
                        let fixed_values = fixed.then(|| {
                            scale
                                .points
                                .iter()
                                .filter_map(|point| point.value.as_deref()?.parse::<f64>().ok())
                                .collect::<Vec<_>>()
                        });
                        let invalid_order = scale
                            .points
                            .first()
                            .is_some_and(|point| point.kind == "max")
                            || scale.points.last().is_some_and(|point| point.kind == "min")
                            || scale.points.iter().enumerate().any(|(index, point)| {
                                (point.kind == "min" && index != 0)
                                    || (point.kind == "max" && index + 1 != scale.points.len())
                            });
                        if invalid_order
                            || fixed_values.as_ref().is_some_and(|values| {
                                values.len() != scale.points.len()
                                    || !values.windows(2).all(|pair| pair[0] < pair[1])
                            })
                        {
                            rule.editable = false;
                        }
                        rule.color_scale = Some(scale);
                    } else {
                        rule.editable = false;
                    }
                }
            }
            Event::Start(ref start)
                if current.is_some() && start.local_name().as_ref() == b"formula" =>
            {
                inside_formula = true;
                formula_text.clear();
            }
            Event::Text(ref text) if inside_formula => {
                let decoded = text.xml10_content().map_err(|error| {
                    format!("Failed to decode conditional-format formula: {error}")
                })?;
                formula_text.push_str(&quick_xml::escape::unescape(&decoded).map_err(|error| {
                    format!("Failed to unescape conditional-format formula: {error}")
                })?);
            }
            Event::CData(ref text) if inside_formula => {
                formula_text.push_str(&text.decode().map_err(|error| {
                    format!("Failed to decode conditional-format formula: {error}")
                })?);
            }
            Event::GeneralRef(ref reference) if inside_formula => {
                append_formula_general_reference(&mut formula_text, reference)?
            }
            Event::End(ref end) if end.local_name().as_ref() == b"formula" => {
                inside_formula = false;
                if formula_text.chars().count() > MAX_FORMULA_TEXT {
                    return Err("Conditional-format formula is too long.".into());
                }
                if let Some(rule) = current.as_mut() {
                    if rule.formula1.is_none() {
                        rule.formula1 = Some(formula_text.clone());
                    } else if rule.formula2.is_none() {
                        rule.formula2 = Some(formula_text.clone());
                    } else {
                        rule.editable = false;
                    }
                }
                formula_text.clear();
            }
            Event::Start(ref start)
                if current.is_some()
                    && !inside_formula
                    && !matches!(
                        start.local_name().as_ref(),
                        b"cfRule"
                            | b"formula"
                            | b"colorScale"
                            | b"dataBar"
                            | b"iconSet"
                            | b"cfvo"
                            | b"color"
                    ) =>
            {
                if let Some(rule) = current.as_mut() {
                    rule.editable = false;
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"cfRule" => {
                if let Some(mut rule) = current.take() {
                    let supported_formula = if rule.kind == "cellIs" {
                        rule.formula1.as_deref().is_some_and(|value| {
                            value.trim_start_matches('=').parse::<f64>().is_ok()
                        }) && (!matches!(rule.operator.as_deref(), Some("between" | "notBetween"))
                            || rule.formula2.as_deref().is_some_and(|value| {
                                value.trim_start_matches('=').parse::<f64>().is_ok()
                            }))
                    } else if rule.kind == "expression" {
                        rule.formula1
                            .as_deref()
                            .is_some_and(safe_conditional_expression_supported)
                            && rule.formula2.is_none()
                    } else if rule.kind == "colorScale" {
                        rule.color_scale.is_some()
                            && rule.formula1.is_none()
                            && rule.formula2.is_none()
                            && rule.operator.is_none()
                    } else if rule.kind == "dataBar" {
                        rule.data_bar.is_some()
                            && rule.formula1.is_none()
                            && rule.formula2.is_none()
                            && rule.operator.is_none()
                    } else {
                        rule.icon_set.is_some()
                            && rule.formula1.is_none()
                            && rule.formula2.is_none()
                            && rule.operator.is_none()
                    };
                    rule.editable &= supported_formula;
                    group_rules.push(rule);
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => {
                result.append(&mut group_rules);
                group_index += 1;
                ranges.clear();
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

const MAX_DYNAMIC_COLOR_SCALE_RULES: usize = 64;
const MAX_COLOR_SCALE_PERCENTILE_VALUES: usize = 1_000_000;

#[derive(Default)]
struct ColorScaleStatistics {
    minimum: Option<f64>,
    maximum: Option<f64>,
    percentile_values: Vec<f64>,
    needs_percentile: bool,
    overflowed: bool,
}

fn resolve_dynamic_color_scales(
    xml: &[u8],
    rules: &mut [WorkbookConditionalFormatRule],
) -> Result<(), String> {
    let mut dynamic = Vec::new();
    for (index, rule) in rules.iter_mut().enumerate() {
        let mut has_dynamic = false;
        if let Some(scale) = rule.color_scale.as_mut() {
            for point in &mut scale.points {
                point.resolved_value = if point.kind == "num" {
                    point.value.clone()
                } else {
                    has_dynamic = true;
                    None
                };
                if !matches!(
                    point.kind.as_str(),
                    "min" | "max" | "num" | "percent" | "percentile"
                ) {
                    rule.editable = false;
                }
            }
        } else if let Some(bar) = rule.data_bar.as_mut() {
            for point in [&mut bar.minimum, &mut bar.maximum] {
                point.resolved_value = if point.kind == "num" {
                    point.value.clone()
                } else {
                    has_dynamic = true;
                    None
                };
                if !matches!(
                    point.kind.as_str(),
                    "min" | "max" | "num" | "percent" | "percentile"
                ) {
                    rule.editable = false;
                }
            }
        } else if let Some(icon_set) = rule.icon_set.as_mut() {
            for point in &mut icon_set.thresholds {
                point.resolved_value = if point.kind == "num" {
                    point.value.clone()
                } else {
                    has_dynamic = true;
                    None
                };
                if !matches!(point.kind.as_str(), "num" | "percent" | "percentile") {
                    rule.editable = false;
                }
            }
        } else {
            continue;
        }
        if has_dynamic && rule.editable {
            dynamic.push(index);
        }
    }
    if dynamic.is_empty() {
        return Ok(());
    }
    if dynamic.len() > MAX_DYNAMIC_COLOR_SCALE_RULES {
        for index in dynamic {
            rules[index].editable = false;
        }
        return Ok(());
    }

    let mut statistics = dynamic
        .iter()
        .map(|index| {
            let needs_percentile =
                rules[*index].color_scale.as_ref().is_some_and(|scale| {
                    scale.points.iter().any(|point| point.kind == "percentile")
                }) || rules[*index].data_bar.as_ref().is_some_and(|bar| {
                    [&bar.minimum, &bar.maximum]
                        .iter()
                        .any(|point| point.kind == "percentile")
                }) || rules[*index].icon_set.as_ref().is_some_and(|icon_set| {
                    icon_set
                        .thresholds
                        .iter()
                        .any(|point| point.kind == "percentile")
                });
            (
                *index,
                ColorScaleStatistics {
                    needs_percentile,
                    ..Default::default()
                },
            )
        })
        .collect::<HashMap<_, _>>();
    let mut total_percentile_values = 0usize;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut current_cell: Option<((usize, usize), bool)> = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to scan color-scale values: {error}"))?
        {
            Event::Start(ref start) if start.local_name().as_ref() == b"c" => {
                let coordinate = xml_value(start, b"r", reader.decoder())?
                    .map(|reference| parse_cell_reference(&reference))
                    .transpose()?;
                let kind = xml_value(start, b"t", reader.decoder())?;
                current_cell = coordinate
                    .map(|coordinate| (coordinate, kind.as_deref().is_none_or(|kind| kind == "n")));
            }
            Event::End(ref end) if end.local_name().as_ref() == b"c" => current_cell = None,
            Event::Start(ref start) if start.local_name().as_ref() == b"v" => {
                let Some((coordinate, true)) = current_cell else {
                    continue;
                };
                let text = reader
                    .read_text(start.name())
                    .map_err(|error| format!("Failed to read a color-scale cell value: {error}"))?;
                let text = text.xml10_content().map_err(|error| {
                    format!("Failed to decode a color-scale cell value: {error}")
                })?;
                let Ok(value) = text.trim().parse::<f64>() else {
                    continue;
                };
                if !value.is_finite() {
                    continue;
                }
                for index in &dynamic {
                    if !rules[*index]
                        .ranges
                        .iter()
                        .any(|range| contains_coordinate(range, coordinate))
                    {
                        continue;
                    }
                    let stats = statistics
                        .get_mut(index)
                        .expect("dynamic scale stats exist");
                    stats.minimum = Some(stats.minimum.map_or(value, |current| current.min(value)));
                    stats.maximum = Some(stats.maximum.map_or(value, |current| current.max(value)));
                    if stats.needs_percentile {
                        if total_percentile_values >= MAX_COLOR_SCALE_PERCENTILE_VALUES {
                            stats.overflowed = true;
                        } else {
                            stats.percentile_values.push(value);
                            total_percentile_values += 1;
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    for index in dynamic {
        let stats = statistics
            .get_mut(&index)
            .expect("dynamic scale stats exist");
        if stats.overflowed {
            rules[index].editable = false;
            continue;
        }
        if stats.needs_percentile {
            stats.percentile_values.sort_by(f64::total_cmp);
        }
        let resolve = |point: &WorkbookConditionalThreshold| match point.kind.as_str() {
            "num" => point
                .value
                .as_deref()
                .and_then(|value| value.parse::<f64>().ok()),
            "min" => stats.minimum,
            "max" => stats.maximum,
            "percent" => point
                .value
                .as_deref()
                .and_then(|value| value.parse::<f64>().ok())
                .and_then(|percent| {
                    Some(stats.minimum? + (stats.maximum? - stats.minimum?) * percent / 100.0)
                }),
            "percentile" => point
                .value
                .as_deref()
                .and_then(|value| value.parse::<f64>().ok())
                .and_then(|percentile| percentile_value(&stats.percentile_values, percentile)),
            _ => None,
        };
        if let Some(scale) = rules[index].color_scale.as_mut() {
            for point in &mut scale.points {
                let threshold = WorkbookConditionalThreshold {
                    kind: point.kind.clone(),
                    value: point.value.clone(),
                    resolved_value: None,
                };
                point.resolved_value = resolve(&threshold).map(|value| value.to_string());
            }
            let resolved = scale
                .points
                .iter()
                .map(|point| point.resolved_value.as_deref()?.parse::<f64>().ok())
                .collect::<Option<Vec<_>>>();
            if resolved
                .as_ref()
                .is_some_and(|values| !values.windows(2).all(|pair| pair[0] <= pair[1]))
            {
                rules[index].editable = false;
            }
        } else if let Some(bar) = rules[index].data_bar.as_mut() {
            for point in [&mut bar.minimum, &mut bar.maximum] {
                point.resolved_value = resolve(point).map(|value| value.to_string());
            }
            let resolved = [&bar.minimum, &bar.maximum]
                .iter()
                .map(|point| point.resolved_value.as_deref()?.parse::<f64>().ok())
                .collect::<Option<Vec<_>>>();
            if resolved
                .as_ref()
                .is_some_and(|values| values.len() != 2 || values[0] >= values[1])
            {
                rules[index].editable = false;
            }
        } else if let Some(icon_set) = rules[index].icon_set.as_mut() {
            for point in &mut icon_set.thresholds {
                let threshold = WorkbookConditionalThreshold {
                    kind: point.kind.clone(),
                    value: point.value.clone(),
                    resolved_value: None,
                };
                point.resolved_value = resolve(&threshold).map(|value| value.to_string());
            }
            let resolved = icon_set
                .thresholds
                .iter()
                .map(|point| point.resolved_value.as_deref()?.parse::<f64>().ok())
                .collect::<Option<Vec<_>>>();
            if resolved.as_ref().is_some_and(|values| {
                values.len() != icon_set.thresholds.len()
                    || !values.windows(2).all(|pair| pair[0] <= pair[1])
            }) {
                rules[index].editable = false;
            }
        }
    }
    Ok(())
}

fn contains_coordinate(range: &WorkbookMergeRange, coordinate: (usize, usize)) -> bool {
    coordinate.0 >= range.top
        && coordinate.0 <= range.bottom
        && coordinate.1 >= range.left
        && coordinate.1 <= range.right
}

fn percentile_value(values: &[f64], percentile: f64) -> Option<f64> {
    if values.is_empty() || !(0.0..=100.0).contains(&percentile) {
        return None;
    }
    let rank = percentile / 100.0 * (values.len() - 1) as f64;
    let lower = rank.floor() as usize;
    let upper = rank.ceil() as usize;
    let ratio = rank - lower as f64;
    Some(values[lower] + (values[upper] - values[lower]) * ratio)
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
    if !sheet_xml
        .windows(b"tablePart".len())
        .any(|window| window == b"tablePart")
    {
        return Ok(Vec::new());
    }
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
                        show_first_column: false,
                        show_last_column: false,
                        show_row_stripes: true,
                        show_column_stripes: false,
                        filter_state: WorkbookFilterState::default(),
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
                        table.show_first_column =
                            bool_attribute(event, b"showFirstColumn", reader.decoder(), false)?;
                        table.show_last_column =
                            bool_attribute(event, b"showLastColumn", reader.decoder(), false)?;
                        table.show_row_stripes =
                            bool_attribute(event, b"showRowStripes", reader.decoder(), true)?;
                        table.show_column_stripes =
                            bool_attribute(event, b"showColumnStripes", reader.decoder(), false)?;
                    }
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        let mut table = table.ok_or("Excel Table 部件缺少 table 根节点")?;
        table.filter_state = read_auto_filter_state(&part.data, &table.range)?;
        tables.push(table);
    }
    Ok(tables)
}

#[derive(Default)]
struct PendingDrawing {
    object_id: String,
    anchor_index: usize,
    anchor_kind: String,
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

fn normalize_chart_series_color(value: &str) -> Result<String, String> {
    let value = value.trim().trim_start_matches('#');
    if value.len() != 6 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("A chart series color must be a six-digit RGB value.".into());
    }
    Ok(format!("#{}", value.to_ascii_uppercase()))
}

fn chart_color_node_attributes_safe(event: &BytesStart<'_>) -> Result<bool, String> {
    let local = event.local_name();
    for attribute in event.attributes().with_checks(false) {
        let attribute =
            attribute.map_err(|error| format!("Failed to inspect chart color XML: {error}"))?;
        let key = attribute.key.as_ref();
        if key == b"xmlns" || key.starts_with(b"xmlns:") {
            continue;
        }
        if local.as_ref() != b"srgbClr" || key != b"val" {
            return Ok(false);
        }
    }
    Ok(true)
}

fn parse_chart_part(xml: &[u8]) -> Result<WorkbookChart, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut chart_type = "unknown".to_string();
    let mut title_parts = Vec::new();
    let mut category_axis_title_parts = Vec::new();
    let mut value_axis_title_parts = Vec::new();
    let mut category_axis_count = 0usize;
    let mut value_axis_count = 0usize;
    let mut next_scatter_axis = 0usize;
    let mut active_axis: Option<bool> = None;
    let mut legend_present = false;
    let mut legend_position = "none".to_string();
    let mut chart_type_count = 0usize;
    let mut has_extensions = false;
    let mut data_labels = WorkbookChartDataLabels::default();
    let mut data_labels_present = false;
    let mut data_labels_safe = true;
    let mut series = Vec::new();
    let mut series_color_safety = Vec::new();
    let mut current_series: Option<WorkbookChartSeries> = None;
    let mut current_series_color_safe = true;
    let mut current_series_style_seen = false;
    let mut current_series_style_depth = None;
    let mut current_series_style_supported = true;
    let mut current_series_style_colors = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Excel 图表失败: {error}"))?
        {
            Event::Start(ref event) => {
                let local = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                if let Some(value) = chart_type_from_name(event.local_name().as_ref()) {
                    chart_type_count += 1;
                    if chart_type == "unknown" {
                        chart_type = value.into();
                    }
                }
                if local == "extLst" {
                    has_extensions = true;
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
                        index: series.len(),
                        name: None,
                        name_editable: false,
                        color: None,
                        color_editable: false,
                        categories: None,
                        values: None,
                        editable: false,
                    });
                    current_series_color_safe = true;
                    current_series_style_seen = false;
                    current_series_style_depth = None;
                    current_series_style_supported = true;
                    current_series_style_colors.clear();
                }
                if current_series.is_some() {
                    let direct_series_style =
                        local == "spPr" && stack.last().is_some_and(|parent| parent == "ser");
                    if direct_series_style {
                        if current_series_style_seen {
                            current_series_color_safe = false;
                        }
                        current_series_style_seen = true;
                        current_series_style_depth = Some(stack.len());
                        current_series_style_supported = chart_color_node_attributes_safe(event)?;
                        current_series_style_colors.clear();
                    } else if current_series_style_depth.is_some() {
                        if !matches!(local.as_str(), "solidFill" | "ln" | "srgbClr")
                            || !chart_color_node_attributes_safe(event)?
                        {
                            current_series_style_supported = false;
                        }
                        if local == "srgbClr" {
                            if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                                match normalize_chart_series_color(&value) {
                                    Ok(color) => current_series_style_colors.push(color),
                                    Err(_) => current_series_style_supported = false,
                                }
                            } else {
                                current_series_style_supported = false;
                            }
                        }
                    } else if local == "spPr"
                        || matches!(local.as_str(), "dPt" | "trendline" | "errBars" | "extLst")
                    {
                        current_series_color_safe = false;
                    }
                }
                if local == "catAx" {
                    category_axis_count += 1;
                    active_axis = Some(true);
                } else if local == "valAx" {
                    if chart_type == "scatter" && next_scatter_axis == 0 {
                        category_axis_count += 1;
                        active_axis = Some(true);
                    } else {
                        value_axis_count += 1;
                        active_axis = Some(false);
                    }
                    next_scatter_axis += usize::from(chart_type == "scatter");
                } else if local == "legend" {
                    legend_present = true;
                    legend_position = "right".into();
                }
                if local == "legendPos" {
                    if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                        legend_position = match value.as_str() {
                            "l" => "left",
                            "t" => "top",
                            "b" => "bottom",
                            "tr" => "top_right",
                            _ => "right",
                        }
                        .into();
                    }
                }
                if local == "dLbls" {
                    let chart_level = stack
                        .last()
                        .is_some_and(|parent| chart_type_from_name(parent.as_bytes()).is_some());
                    if chart_level && !data_labels_present {
                        data_labels_present = true;
                    } else {
                        data_labels_safe = false;
                    }
                } else if stack.last().is_some_and(|parent| parent == "dLbls") {
                    let enabled = bool_attribute(event, b"val", reader.decoder(), false)?;
                    match local.as_str() {
                        "showVal" => data_labels.show_value = enabled,
                        "showCatName" => data_labels.show_category_name = enabled,
                        "showSerName" => data_labels.show_series_name = enabled,
                        "showPercent" => data_labels.show_percent = enabled,
                        "delete" | "showLegendKey" | "showBubbleSize" | "showLeaderLines"
                            if !enabled => {}
                        _ => data_labels_safe = false,
                    }
                }
                stack.push(local);
            }
            Event::Empty(ref event) => {
                let local = event.local_name();
                if let Some(value) = chart_type_from_name(local.as_ref()) {
                    chart_type_count += 1;
                    if chart_type == "unknown" {
                        chart_type = value.into();
                    }
                }
                if local.as_ref() == b"extLst" {
                    has_extensions = true;
                }
                if current_series.is_some() {
                    let local_text = String::from_utf8_lossy(local.as_ref());
                    let direct_series_style = local.as_ref() == b"spPr"
                        && stack.last().is_some_and(|parent| parent == "ser");
                    if direct_series_style {
                        current_series_color_safe &=
                            !current_series_style_seen && chart_color_node_attributes_safe(event)?;
                        current_series_style_seen = true;
                    } else if current_series_style_depth.is_some() {
                        if !matches!(local.as_ref(), b"solidFill" | b"ln" | b"srgbClr")
                            || !chart_color_node_attributes_safe(event)?
                        {
                            current_series_style_supported = false;
                        }
                        if local.as_ref() == b"srgbClr" {
                            if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                                match normalize_chart_series_color(&value) {
                                    Ok(color) => current_series_style_colors.push(color),
                                    Err(_) => current_series_style_supported = false,
                                }
                            } else {
                                current_series_style_supported = false;
                            }
                        }
                    } else if local.as_ref() == b"spPr"
                        || matches!(
                            local_text.as_ref(),
                            "dPt" | "trendline" | "errBars" | "extLst"
                        )
                    {
                        current_series_color_safe = false;
                    }
                }
                if local.as_ref() == b"barDir" && chart_type == "bar" {
                    if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                        chart_type = if value == "col" { "column" } else { "bar" }.into();
                    }
                }
                if local.as_ref() == b"legendPos" {
                    if let Some(value) = xml_value(event, b"val", reader.decoder())? {
                        legend_position = match value.as_str() {
                            "l" => "left",
                            "t" => "top",
                            "b" => "bottom",
                            "tr" => "top_right",
                            _ => "right",
                        }
                        .into();
                    }
                }
                if local.as_ref() == b"dLbls" {
                    let chart_level = stack
                        .last()
                        .is_some_and(|parent| chart_type_from_name(parent.as_bytes()).is_some());
                    if chart_level && !data_labels_present {
                        data_labels_present = true;
                    } else {
                        data_labels_safe = false;
                    }
                } else if stack
                    .last()
                    .is_some_and(|parent| parent.as_bytes() == b"dLbls")
                {
                    let enabled = bool_attribute(event, b"val", reader.decoder(), false)?;
                    match local.as_ref() {
                        b"showVal" => data_labels.show_value = enabled,
                        b"showCatName" => data_labels.show_category_name = enabled,
                        b"showSerName" => data_labels.show_series_name = enabled,
                        b"showPercent" => data_labels.show_percent = enabled,
                        b"delete" | b"showLegendKey" | b"showBubbleSize" | b"showLeaderLines"
                            if !enabled => {}
                        _ => data_labels_safe = false,
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
                if stack.iter().any(|item| item == "title") && last == Some("t") {
                    let parts = match active_axis {
                        Some(true) => &mut category_axis_title_parts,
                        Some(false) => &mut value_axis_title_parts,
                        None => &mut title_parts,
                    };
                    if parts.iter().map(String::len).sum::<usize>() + value.len()
                        <= MAX_DRAWING_TEXT
                    {
                        parts.push(value.clone());
                    }
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
                if event.local_name().as_ref() == b"spPr"
                    && current_series_style_depth.is_some_and(|depth| stack.len() == depth + 1)
                {
                    let uniform_color =
                        current_series_style_colors
                            .first()
                            .cloned()
                            .filter(|color| {
                                current_series_style_colors
                                    .iter()
                                    .all(|candidate| candidate == color)
                            });
                    current_series_color_safe &= current_series_style_supported
                        && (current_series_style_colors.is_empty() || uniform_color.is_some());
                    if let (Some(item), Some(color)) = (current_series.as_mut(), uniform_color) {
                        item.color = Some(color);
                    }
                    current_series_style_depth = None;
                }
                if event.local_name().as_ref() == b"ser" {
                    if let Some(mut item) = current_series.take() {
                        item.editable = item
                            .categories
                            .as_deref()
                            .and_then(|formula| defined_name_reference(formula, None))
                            .is_some()
                            && item
                                .values
                                .as_deref()
                                .and_then(|formula| defined_name_reference(formula, None))
                                .is_some();
                        series.push(item);
                        series_color_safety.push(current_series_color_safe);
                    }
                }
                if matches!(event.local_name().as_ref(), b"catAx" | b"valAx") {
                    active_axis = None;
                }
                stack.pop();
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let title = (!title_parts.is_empty()).then(|| title_parts.join(""));
    let category_axis_title =
        (!category_axis_title_parts.is_empty()).then(|| category_axis_title_parts.join(""));
    let value_axis_title =
        (!value_axis_title_parts.is_empty()).then(|| value_axis_title_parts.join(""));
    if !legend_present {
        legend_position = "none".into();
    }
    let standard_axes = match chart_type.as_str() {
        "column" | "bar" | "line" | "scatter" => category_axis_count == 1 && value_axis_count == 1,
        "pie" => category_axis_count == 0 && value_axis_count == 0,
        _ => false,
    };
    let standard_chart = chart_type_count == 1 && !has_extensions && standard_axes;
    if chart_type != "pie" && data_labels.show_percent {
        data_labels_safe = false;
    }
    for (index, item) in series.iter_mut().enumerate() {
        item.name_editable = standard_chart;
        item.color_editable =
            standard_chart && series_color_safety.get(index).copied().unwrap_or(false);
    }
    Ok(WorkbookChart {
        chart_type,
        title_editable: title.is_some(),
        title,
        category_axis_title,
        value_axis_title,
        legend_position,
        presentation_editable: standard_chart,
        data_labels,
        data_labels_editable: standard_chart && data_labels_safe,
        series,
    })
}

fn read_sheet_drawings(
    entries: &[PackageEntry],
    sheet_path: &str,
    sheet_xml: &[u8],
) -> Result<Vec<WorkbookDrawingObject>, String> {
    if !sheet_xml
        .windows(b"drawing".len())
        .any(|window| window == b"drawing")
    {
        return Ok(Vec::new());
    }
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
        let mut next_anchor_index = 0usize;
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
                    current = Some(PendingDrawing {
                        anchor_index: next_anchor_index,
                        anchor_kind: match event.local_name().as_ref() {
                            b"twoCellAnchor" => "two_cell",
                            b"oneCellAnchor" => "one_cell",
                            _ => "absolute",
                        }
                        .into(),
                        ..Default::default()
                    });
                    next_anchor_index += 1;
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
                        if item.object_id.is_empty() {
                            item.object_id = xml_value(event, b"id", reader.decoder())?
                                .unwrap_or_else(|| (result.len() + 1).to_string());
                            item.name = xml_value(event, b"name", reader.decoder())?
                                .unwrap_or_else(|| format!("Drawing {}", item.object_id));
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
                            id: format!(
                                "{}#{}:{}",
                                drawing_path, item.anchor_index, item.object_id
                            ),
                            object_id: item.object_id.clone(),
                            drawing_part: drawing_path.clone(),
                            anchor_index: item.anchor_index,
                            anchor_kind: item.anchor_kind.clone(),
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
                            editable: item.anchor_kind == "two_cell" && !item.object_id.is_empty(),
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

fn validate_drawing_anchor(anchor: &WorkbookDrawingAnchor, endpoint: bool) -> Result<(), String> {
    let row_limit = if endpoint {
        MAX_XLSX_ROWS
    } else {
        MAX_XLSX_ROWS - 1
    };
    let column_limit = if endpoint {
        MAX_XLSX_COLUMNS
    } else {
        MAX_XLSX_COLUMNS - 1
    };
    if anchor.row > row_limit || anchor.column > column_limit {
        return Err("The Drawing anchor is outside the XLSX grid.".into());
    }
    if !(0..=100_000_000).contains(&anchor.row_offset)
        || !(0..=100_000_000).contains(&anchor.column_offset)
    {
        return Err("Drawing anchor offsets must be between 0 and 100,000,000 EMU.".into());
    }
    Ok(())
}

fn patch_drawing_object_xml(xml: &[u8], change: &WorkbookDrawingChange) -> Result<Vec<u8>, String> {
    let (from, to) = if change.action == WorkbookDrawingAction::MoveResize {
        let from = change
            .from
            .as_ref()
            .ok_or("Moving a Drawing object requires a start anchor.")?;
        let to = change
            .to
            .as_ref()
            .ok_or("Moving a Drawing object requires an end anchor.")?;
        validate_drawing_anchor(from, false)?;
        validate_drawing_anchor(to, true)?;
        if to.row < from.row
            || to.column < from.column
            || (to.row == from.row
                && to.column == from.column
                && to.row_offset <= from.row_offset
                && to.column_offset <= from.column_offset)
        {
            return Err("The Drawing end anchor must follow its start anchor.".into());
        }
        (Some(from), Some(to))
    } else {
        let name = change
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or("A Drawing object name is required.")?;
        if name.chars().count() > 255 {
            return Err("A Drawing object name cannot exceed 255 characters.".into());
        }
        if change
            .description
            .as_deref()
            .is_none_or(|value| value.chars().count() > MAX_DRAWING_TEXT)
        {
            return Err(format!(
                "A Drawing description is required and cannot exceed {MAX_DRAWING_TEXT} characters."
            ));
        }
        (None, None)
    };

    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 128));
    let mut buffer = Vec::new();
    let mut next_anchor = 0usize;
    let mut active_anchor = None;
    let mut anchor_section: Option<bool> = None;
    let mut anchor_field: Option<Vec<u8>> = None;
    let mut identity_found = false;
    let mut patched_metadata = false;
    let mut patched_coordinates = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Drawing object XML: {error}"))?;
        match event {
            Event::Start(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                ) =>
            {
                active_anchor = Some(next_anchor);
                next_anchor += 1;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy Drawing anchor: {error}"))?;
            }
            Event::End(ref end)
                if matches!(
                    end.local_name().as_ref(),
                    b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                ) =>
            {
                active_anchor = None;
                anchor_section = None;
                anchor_field = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Drawing anchor: {error}"))?;
            }
            Event::Start(ref start)
                if active_anchor == Some(change.anchor_index)
                    && matches!(start.local_name().as_ref(), b"from" | b"to") =>
            {
                anchor_section = Some(start.local_name().as_ref() == b"to");
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy Drawing marker: {error}"))?;
            }
            Event::End(ref end)
                if active_anchor == Some(change.anchor_index)
                    && matches!(end.local_name().as_ref(), b"from" | b"to") =>
            {
                anchor_section = None;
                anchor_field = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Drawing marker: {error}"))?;
            }
            Event::Start(ref start)
                if active_anchor == Some(change.anchor_index)
                    && anchor_section.is_some()
                    && matches!(
                        start.local_name().as_ref(),
                        b"row" | b"col" | b"rowOff" | b"colOff"
                    ) =>
            {
                anchor_field = Some(start.local_name().as_ref().to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy Drawing coordinate: {error}"))?;
            }
            Event::Text(_)
                if change.action == WorkbookDrawingAction::MoveResize
                    && active_anchor == Some(change.anchor_index)
                    && anchor_section.is_some()
                    && anchor_field.is_some() =>
            {
                let anchor = if anchor_section == Some(true) {
                    to.expect("validated Drawing end anchor")
                } else {
                    from.expect("validated Drawing start anchor")
                };
                let value = match anchor_field.as_deref() {
                    Some(b"row") => anchor.row.to_string(),
                    Some(b"col") => anchor.column.to_string(),
                    Some(b"rowOff") => anchor.row_offset.to_string(),
                    Some(b"colOff") => anchor.column_offset.to_string(),
                    _ => return Err("Unknown Drawing anchor coordinate.".into()),
                };
                writer
                    .write_event(Event::Text(BytesText::new(&value)))
                    .map_err(|error| format!("Failed to write Drawing coordinate: {error}"))?;
                patched_coordinates += 1;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if active_anchor == Some(change.anchor_index)
                    && start.local_name().as_ref() == b"cNvPr" =>
            {
                let object_id = xml_value(start, b"id", reader.decoder())?.unwrap_or_default();
                if object_id == change.object_id {
                    identity_found = true;
                    if change.action == WorkbookDrawingAction::UpdateMetadata {
                        let updated = replace_xml_attribute(
                            start,
                            b"name",
                            change
                                .name
                                .as_deref()
                                .expect("validated Drawing name")
                                .trim(),
                            false,
                        )?;
                        let updated = replace_xml_attribute(
                            &updated,
                            b"descr",
                            change
                                .description
                                .as_deref()
                                .expect("validated Drawing description"),
                            false,
                        )?;
                        let output = match event {
                            Event::Start(_) => Event::Start(updated),
                            Event::Empty(_) => Event::Empty(updated),
                            _ => unreachable!(),
                        };
                        writer.write_event(output).map_err(|error| {
                            format!("Failed to update Drawing metadata: {error}")
                        })?;
                        patched_metadata = true;
                    } else {
                        writer
                            .write_event(event.into_owned())
                            .map_err(|error| format!("Failed to copy Drawing identity: {error}"))?;
                    }
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy Drawing metadata: {error}"))?;
                }
            }
            Event::End(ref end)
                if active_anchor == Some(change.anchor_index)
                    && matches!(
                        end.local_name().as_ref(),
                        b"row" | b"col" | b"rowOff" | b"colOff"
                    ) =>
            {
                anchor_field = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Drawing coordinate: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy Drawing XML: {error}"))?,
        }
        buffer.clear();
    }
    if !identity_found {
        return Err("The selected Drawing object no longer exists.".into());
    }
    if change.action == WorkbookDrawingAction::UpdateMetadata && !patched_metadata {
        return Err("The selected Drawing metadata could not be updated.".into());
    }
    if change.action == WorkbookDrawingAction::MoveResize && patched_coordinates != 8 {
        return Err("Only standard two-cell Drawing anchors can be moved or resized.".into());
    }
    Ok(writer.into_inner())
}

fn validate_chart_range_formula(
    formula: &str,
    sheet_paths: &HashMap<String, String>,
) -> Result<(String, WorkbookRangeReference, usize), String> {
    let normalized = formula.trim().strip_prefix('=').unwrap_or(formula.trim());
    if normalized.is_empty() || normalized.chars().count() > MAX_FORMULA_TEXT {
        return Err("A chart series reference is empty or too long.".into());
    }
    if !normalized.contains('!') || normalized.contains(['[', ']', ',', ';']) {
        return Err("Chart series references must use one internal worksheet A1 range.".into());
    }
    let reference = defined_name_reference(normalized, None)
        .ok_or("Chart series references must use one internal worksheet A1 range.")?;
    if !sheet_paths.contains_key(&reference.sheet) {
        return Err("The chart series worksheet does not exist in this workbook.".into());
    }
    let rows = reference.bottom - reference.top + 1;
    let columns = reference.right - reference.left + 1;
    if rows > 1 && columns > 1 {
        return Err("Chart series references must be one-dimensional ranges.".into());
    }
    let points = rows.max(columns);
    if points > 10_000 {
        return Err(
            "A chart series cannot reference more than 10,000 points in this stage.".into(),
        );
    }
    Ok((normalized.to_string(), reference, points))
}

fn patch_chart_title_xml(xml: &[u8], title: &str) -> Result<Vec<u8>, String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > MAX_DRAWING_TEXT {
        return Err(format!(
            "A chart title is required and cannot exceed {MAX_DRAWING_TEXT} characters."
        ));
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + title.len()));
    let mut buffer = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut patched = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart title XML: {error}"))?;
        match event {
            Event::Start(ref start) => {
                stack.push(start.local_name().as_ref().to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart title XML: {error}"))?;
            }
            Event::Text(_)
                if stack.last().is_some_and(|name| name.as_slice() == b"t")
                    && stack.iter().any(|name| name.as_slice() == b"title") =>
            {
                let replacement = if patched == 0 { title } else { "" };
                writer
                    .write_event(Event::Text(BytesText::new(replacement)))
                    .map_err(|error| format!("Failed to update chart title: {error}"))?;
                patched += 1;
            }
            Event::End(_) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart title XML: {error}"))?;
                stack.pop();
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart title XML: {error}"))?,
        }
        buffer.clear();
    }
    if patched == 0 {
        return Err("Only existing standard chart titles can be edited in this stage.".into());
    }
    Ok(writer.into_inner())
}

fn chart_axis_title_fragment(title: &str) -> Result<Vec<u8>, String> {
    let title = title.trim();
    if title.chars().count() > MAX_DRAWING_TEXT {
        return Err(format!(
            "A chart axis title cannot exceed {MAX_DRAWING_TEXT} characters."
        ));
    }
    if title.is_empty() {
        return Ok(Vec::new());
    }
    let title = quick_xml::escape::escape(title);
    Ok(format!(
        "<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"zh-CN\"/><a:t>{title}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>"
    )
    .into_bytes())
}

fn chart_legend_fragment(position: &str) -> Result<Vec<u8>, String> {
    let value = match position {
        "none" => return Ok(Vec::new()),
        "left" => "l",
        "top" => "t",
        "bottom" => "b",
        "top_right" => "tr",
        "right" => "r",
        _ => return Err("Unsupported chart legend position.".into()),
    };
    Ok(format!("<c:legend><c:legendPos val=\"{value}\"/><c:layout/></c:legend>").into_bytes())
}

fn patch_chart_presentation_xml(
    xml: &[u8],
    chart_type: &str,
    category_axis_title: &str,
    value_axis_title: &str,
    legend_position: &str,
) -> Result<Vec<u8>, String> {
    let category_title = chart_axis_title_fragment(category_axis_title)?;
    let value_title = chart_axis_title_fragment(value_axis_title)?;
    let legend = chart_legend_fragment(legend_position)?;
    if chart_type == "pie" && (!category_title.is_empty() || !value_title.is_empty()) {
        return Err("Pie charts do not have editable category or value axes.".into());
    }

    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(
        xml.len() + category_title.len() + value_title.len() + legend.len(),
    ));
    let mut buffer = Vec::new();
    let mut active_axis: Option<bool> = None;
    let mut next_scatter_axis = 0usize;
    let mut category_axis_count = 0usize;
    let mut value_axis_count = 0usize;
    let mut axis_title_handled = false;
    let mut legend_handled = false;
    let mut chart_depth = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart presentation XML: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"chart" => {
                chart_depth += 1;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart XML: {error}"))?;
            }
            Event::Start(ref start)
                if matches!(start.local_name().as_ref(), b"catAx" | b"valAx") =>
            {
                let category = if start.local_name().as_ref() == b"catAx" {
                    category_axis_count += 1;
                    true
                } else if chart_type == "scatter" && next_scatter_axis == 0 {
                    next_scatter_axis += 1;
                    category_axis_count += 1;
                    true
                } else {
                    next_scatter_axis += usize::from(chart_type == "scatter");
                    value_axis_count += 1;
                    false
                };
                active_axis = Some(category);
                axis_title_handled = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart axis XML: {error}"))?;
            }
            Event::Start(ref start)
                if active_axis.is_some() && start.local_name().as_ref() == b"title" =>
            {
                let fragment = if active_axis == Some(true) {
                    &category_title
                } else {
                    &value_title
                };
                skip_element(&mut reader, b"title", &mut buffer)?;
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, fragment)?;
                }
                axis_title_handled = true;
            }
            Event::Empty(ref empty)
                if active_axis.is_some() && empty.local_name().as_ref() == b"title" =>
            {
                let fragment = if active_axis == Some(true) {
                    &category_title
                } else {
                    &value_title
                };
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, fragment)?;
                }
                axis_title_handled = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if active_axis.is_some()
                    && !axis_title_handled
                    && matches!(
                        start.local_name().as_ref(),
                        b"numFmt"
                            | b"majorTickMark"
                            | b"minorTickMark"
                            | b"tickLblPos"
                            | b"spPr"
                            | b"txPr"
                            | b"crossAx"
                    ) =>
            {
                let fragment = if active_axis == Some(true) {
                    &category_title
                } else {
                    &value_title
                };
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, fragment)?;
                }
                axis_title_handled = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart axis XML: {error}"))?;
            }
            Event::End(ref end) if matches!(end.local_name().as_ref(), b"catAx" | b"valAx") => {
                if !axis_title_handled {
                    let fragment = if active_axis == Some(true) {
                        &category_title
                    } else {
                        &value_title
                    };
                    if !fragment.is_empty() {
                        write_xml_fragment(&mut writer, fragment)?;
                    }
                }
                active_axis = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart axis XML: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"legend" => {
                skip_element(&mut reader, b"legend", &mut buffer)?;
                if !legend.is_empty() {
                    write_xml_fragment(&mut writer, &legend)?;
                }
                legend_handled = true;
            }
            Event::Empty(ref empty) if empty.local_name().as_ref() == b"legend" => {
                if !legend.is_empty() {
                    write_xml_fragment(&mut writer, &legend)?;
                }
                legend_handled = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if chart_depth == 1
                    && !legend_handled
                    && matches!(
                        start.local_name().as_ref(),
                        b"plotVisOnly" | b"dispBlanksAs" | b"showDLblsOverMax" | b"extLst"
                    ) =>
            {
                if !legend.is_empty() {
                    write_xml_fragment(&mut writer, &legend)?;
                }
                legend_handled = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart tail XML: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"chart" => {
                if chart_depth == 1 && !legend_handled && !legend.is_empty() {
                    write_xml_fragment(&mut writer, &legend)?;
                    legend_handled = true;
                }
                chart_depth = chart_depth.saturating_sub(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart XML: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart presentation XML: {error}"))?,
        }
        buffer.clear();
    }
    let valid_axes = match chart_type {
        "column" | "bar" | "line" | "scatter" => category_axis_count == 1 && value_axis_count == 1,
        "pie" => category_axis_count == 0 && value_axis_count == 0,
        _ => false,
    };
    if !valid_axes {
        return Err("Only standard single-axis charts can edit presentation settings.".into());
    }
    Ok(writer.into_inner())
}

fn chart_data_labels_fragment(
    chart_type: &str,
    labels: &WorkbookChartDataLabels,
) -> Result<Vec<u8>, String> {
    if chart_type != "pie" && labels.show_percent {
        return Err("Percentage data labels are only supported for pie charts.".into());
    }
    if !labels.show_value
        && !labels.show_category_name
        && !labels.show_series_name
        && !labels.show_percent
    {
        return Ok(Vec::new());
    }
    let flag = |value| if value { "1" } else { "0" };
    Ok(format!(
        "<c:dLbls><c:showVal val=\"{}\"/><c:showCatName val=\"{}\"/><c:showSerName val=\"{}\"/><c:showPercent val=\"{}\"/></c:dLbls>",
        flag(labels.show_value),
        flag(labels.show_category_name),
        flag(labels.show_series_name),
        flag(labels.show_percent)
    )
    .into_bytes())
}

fn patch_chart_data_labels_xml(
    xml: &[u8],
    chart_type: &str,
    labels: &WorkbookChartDataLabels,
) -> Result<Vec<u8>, String> {
    let chart_element = match chart_type {
        "column" | "bar" => b"barChart".as_slice(),
        "line" => b"lineChart".as_slice(),
        "pie" => b"pieChart".as_slice(),
        "scatter" => b"scatterChart".as_slice(),
        _ => return Err("Only standard charts can edit data labels.".into()),
    };
    let fragment = chart_data_labels_fragment(chart_type, labels)?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + fragment.len()));
    let mut buffer = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut target_found = 0usize;
    let mut labels_handled = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart data-label XML: {error}"))?;
        let is_start_event = matches!(&event, Event::Start(_));
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == chart_element => {
                target_found += 1;
                stack.push(chart_element.to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart type XML: {error}"))?;
            }
            Event::Start(ref start)
                if stack
                    .last()
                    .is_some_and(|name| name.as_slice() == chart_element)
                    && start.local_name().as_ref() == b"dLbls" =>
            {
                skip_element(&mut reader, b"dLbls", &mut buffer)?;
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                labels_handled = true;
            }
            Event::Empty(ref empty)
                if stack
                    .last()
                    .is_some_and(|name| name.as_slice() == chart_element)
                    && empty.local_name().as_ref() == b"dLbls" =>
            {
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                labels_handled = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if stack
                    .last()
                    .is_some_and(|name| name.as_slice() == chart_element)
                    && !labels_handled
                    && matches!(
                        start.local_name().as_ref(),
                        b"gapWidth"
                            | b"overlap"
                            | b"serLines"
                            | b"dropLines"
                            | b"hiLowLines"
                            | b"upDownBars"
                            | b"marker"
                            | b"smooth"
                            | b"firstSliceAng"
                            | b"axId"
                            | b"extLst"
                    ) =>
            {
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                labels_handled = true;
                if is_start_event {
                    stack.push(start.local_name().as_ref().to_vec());
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart type tail XML: {error}"))?;
            }
            Event::Start(ref start) => {
                stack.push(start.local_name().as_ref().to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart data-label XML: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == chart_element => {
                if !labels_handled {
                    if !fragment.is_empty() {
                        write_xml_fragment(&mut writer, &fragment)?;
                    }
                    labels_handled = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart type XML: {error}"))?;
                stack.pop();
            }
            Event::End(_) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart data-label XML: {error}"))?;
                stack.pop();
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart data-label XML: {error}"))?,
        }
        buffer.clear();
    }
    if target_found != 1 || !labels_handled {
        return Err("The standard chart type container could not be updated safely.".into());
    }
    Ok(writer.into_inner())
}

fn chart_series_name_fragment(name: &str) -> Result<Vec<u8>, String> {
    let name = name.trim();
    if name.chars().count() > MAX_DRAWING_TEXT {
        return Err(format!(
            "A chart series name cannot exceed {MAX_DRAWING_TEXT} characters."
        ));
    }
    if name.is_empty() {
        return Ok(Vec::new());
    }
    let name = quick_xml::escape::escape(name);
    Ok(format!("<c:tx><c:v>{name}</c:v></c:tx>").into_bytes())
}

fn patch_chart_series_name_xml(
    xml: &[u8],
    series_index: usize,
    name: &str,
) -> Result<Vec<u8>, String> {
    let fragment = chart_series_name_fragment(name)?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + fragment.len()));
    let mut buffer = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut next_series = 0usize;
    let mut active_series = None;
    let mut name_handled = false;
    let mut target_found = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart series-name XML: {error}"))?;
        let is_start_event = matches!(&event, Event::Start(_));
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"ser" => {
                active_series = Some(next_series);
                target_found |= next_series == series_index;
                next_series += 1;
                stack.push(b"ser".to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series XML: {error}"))?;
            }
            Event::Start(ref start)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && start.local_name().as_ref() == b"tx" =>
            {
                skip_element(&mut reader, b"tx", &mut buffer)?;
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                name_handled = true;
            }
            Event::Empty(ref empty)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && empty.local_name().as_ref() == b"tx" =>
            {
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                name_handled = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && !name_handled
                    && matches!(
                        start.local_name().as_ref(),
                        b"spPr"
                            | b"invertIfNegative"
                            | b"marker"
                            | b"dPt"
                            | b"dLbls"
                            | b"trendline"
                            | b"errBars"
                            | b"cat"
                            | b"val"
                            | b"xVal"
                            | b"yVal"
                            | b"smooth"
                            | b"extLst"
                    ) =>
            {
                if !fragment.is_empty() {
                    write_xml_fragment(&mut writer, &fragment)?;
                }
                name_handled = true;
                if is_start_event {
                    stack.push(start.local_name().as_ref().to_vec());
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series content: {error}"))?;
            }
            Event::Start(ref start) => {
                stack.push(start.local_name().as_ref().to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series-name XML: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"ser" => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart series XML: {error}"))?;
                stack.pop();
                active_series = None;
            }
            Event::End(_) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart series-name XML: {error}"))?;
                stack.pop();
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart series-name XML: {error}"))?,
        }
        buffer.clear();
    }
    if !target_found || !name_handled {
        return Err("The selected standard chart series could not be renamed safely.".into());
    }
    Ok(writer.into_inner())
}

fn chart_series_color_fragment(color: &str) -> Result<Vec<u8>, String> {
    let color = normalize_chart_series_color(color)?;
    let rgb = color.trim_start_matches('#');
    Ok(format!(
        "<c:spPr xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:solidFill><a:srgbClr val=\"{rgb}\"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val=\"{rgb}\"/></a:solidFill></a:ln></c:spPr>"
    )
    .into_bytes())
}

fn patch_chart_series_color_xml(
    xml: &[u8],
    series_index: usize,
    color: &str,
) -> Result<Vec<u8>, String> {
    let fragment = chart_series_color_fragment(color)?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + fragment.len()));
    let mut buffer = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut next_series = 0usize;
    let mut active_series = None;
    let mut color_handled = false;
    let mut target_found = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart series-color XML: {error}"))?;
        let is_start_event = matches!(&event, Event::Start(_));
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"ser" => {
                active_series = Some(next_series);
                target_found |= next_series == series_index;
                next_series += 1;
                stack.push(b"ser".to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series XML: {error}"))?;
            }
            Event::Start(ref start)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && start.local_name().as_ref() == b"spPr" =>
            {
                skip_element(&mut reader, b"spPr", &mut buffer)?;
                write_xml_fragment(&mut writer, &fragment)?;
                color_handled = true;
            }
            Event::Empty(ref empty)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && empty.local_name().as_ref() == b"spPr" =>
            {
                write_xml_fragment(&mut writer, &fragment)?;
                color_handled = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|item| item.as_slice() == b"ser")
                    && !color_handled
                    && matches!(
                        start.local_name().as_ref(),
                        b"invertIfNegative"
                            | b"marker"
                            | b"dPt"
                            | b"dLbls"
                            | b"trendline"
                            | b"errBars"
                            | b"cat"
                            | b"val"
                            | b"xVal"
                            | b"yVal"
                            | b"smooth"
                            | b"extLst"
                    ) =>
            {
                write_xml_fragment(&mut writer, &fragment)?;
                color_handled = true;
                if is_start_event {
                    stack.push(start.local_name().as_ref().to_vec());
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series content: {error}"))?;
            }
            Event::Start(ref start) => {
                stack.push(start.local_name().as_ref().to_vec());
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy chart series-color XML: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"ser" => {
                if active_series == Some(series_index) && !color_handled {
                    write_xml_fragment(&mut writer, &fragment)?;
                    color_handled = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart series XML: {error}"))?;
                stack.pop();
                active_series = None;
            }
            Event::End(_) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart series-color XML: {error}"))?;
                stack.pop();
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart series-color XML: {error}"))?,
        }
        buffer.clear();
    }
    if !target_found || !color_handled {
        return Err("The selected standard chart series color could not be updated safely.".into());
    }
    Ok(writer.into_inner())
}

fn chart_series_context(stack: &[Vec<u8>]) -> Option<bool> {
    if stack
        .iter()
        .any(|name| matches!(name.as_slice(), b"cat" | b"xVal"))
    {
        Some(false)
    } else if stack
        .iter()
        .any(|name| matches!(name.as_slice(), b"val" | b"yVal"))
    {
        Some(true)
    } else {
        None
    }
}

fn patch_chart_series_xml(
    xml: &[u8],
    series_index: usize,
    categories: &str,
    values: &str,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(
        xml.len() + categories.len() + values.len(),
    ));
    let mut buffer = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut next_series = 0usize;
    let mut active_series = None;
    let mut skip_depth = 0usize;
    let mut patched_categories = 0usize;
    let mut patched_values = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse chart series XML: {error}"))?;
        if skip_depth > 0 {
            match event {
                Event::Start(_) => skip_depth += 1,
                Event::End(_) => skip_depth -= 1,
                Event::Eof => return Err("The chart series cache XML is incomplete.".into()),
                _ => {}
            }
            buffer.clear();
            continue;
        }
        match event {
            Event::Start(ref start) => {
                let local = start.local_name().as_ref().to_vec();
                if local.as_slice() == b"ser" {
                    active_series = Some(next_series);
                    next_series += 1;
                }
                if active_series == Some(series_index)
                    && matches!(local.as_slice(), b"numCache" | b"strCache")
                    && chart_series_context(&stack).is_some()
                {
                    skip_depth = 1;
                } else {
                    stack.push(local);
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy chart series XML: {error}"))?;
                }
            }
            Event::Empty(ref empty)
                if active_series == Some(series_index)
                    && matches!(empty.local_name().as_ref(), b"numCache" | b"strCache")
                    && chart_series_context(&stack).is_some() => {}
            Event::Text(_)
                if active_series == Some(series_index)
                    && stack.last().is_some_and(|name| name.as_slice() == b"f") =>
            {
                match chart_series_context(&stack) {
                    Some(false) => {
                        writer
                            .write_event(Event::Text(BytesText::new(categories)))
                            .map_err(|error| {
                                format!("Failed to update chart categories: {error}")
                            })?;
                        patched_categories += 1;
                    }
                    Some(true) => {
                        writer
                            .write_event(Event::Text(BytesText::new(values)))
                            .map_err(|error| format!("Failed to update chart values: {error}"))?;
                        patched_values += 1;
                    }
                    None => writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy chart series formula: {error}"))?,
                }
            }
            Event::End(ref end) => {
                let is_series = end.local_name().as_ref() == b"ser";
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish chart series XML: {error}"))?;
                stack.pop();
                if is_series {
                    active_series = None;
                }
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy chart series XML: {error}"))?,
        }
        buffer.clear();
    }
    if patched_categories != 1 || patched_values != 1 {
        return Err(
            "Only formula-based chart series with one category and value reference can be edited."
                .into(),
        );
    }
    Ok(writer.into_inner())
}

const CHART_RELATIONSHIP_TYPE: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const DRAWING_RELATIONSHIP_TYPE: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CHART_CONTENT_TYPE: &str =
    "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const DRAWING_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.drawing+xml";

fn relationship_part_path(source_path: &str) -> Result<String, String> {
    let (directory, file) = source_path
        .rsplit_once('/')
        .ok_or("The OOXML source part path is invalid.")?;
    Ok(format!("{directory}/_rels/{file}.rels"))
}

fn relationship_ids(xml: &[u8]) -> Result<HashSet<String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut result = HashSet::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse OOXML relationships: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"Relationship" =>
            {
                if let Some(id) = xml_value(event, b"Id", reader.decoder())? {
                    result.insert(id);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn next_relationship_id(xml: Option<&[u8]>) -> Result<String, String> {
    let used = xml.map(relationship_ids).transpose()?.unwrap_or_default();
    (1usize..)
        .map(|number| format!("rId{number}"))
        .find(|candidate| !used.contains(candidate))
        .ok_or("Could not allocate an OOXML relationship id.".into())
}

fn append_relationship(
    xml: &[u8],
    relation_id: &str,
    relationship_type: &str,
    target: &str,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 192));
    let mut buffer = Vec::new();
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse OOXML relationships: {error}"))?;
        match event {
            Event::End(ref end) if end.local_name().as_ref() == b"Relationships" => {
                let mut relationship = BytesStart::new("Relationship");
                relationship.push_attribute(("Id", relation_id));
                relationship.push_attribute(("Type", relationship_type));
                relationship.push_attribute(("Target", target));
                writer
                    .write_event(Event::Empty(relationship))
                    .map_err(|error| format!("Failed to append an OOXML relationship: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish OOXML relationships: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy OOXML relationships: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("The OOXML relationship root is missing.".into());
    }
    Ok(writer.into_inner())
}

fn new_relationships(relation_id: &str, relationship_type: &str, target: &str) -> Vec<u8> {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"{relation_id}\" Type=\"{relationship_type}\" Target=\"{target}\"/></Relationships>"
    )
    .into_bytes()
}

fn remove_relationship(xml: &[u8], relation_id: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut removed = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse OOXML relationships: {error}"))?;
        match event {
            Event::Start(ref start)
                if start.local_name().as_ref() == b"Relationship"
                    && xml_value(start, b"Id", reader.decoder())?.as_deref()
                        == Some(relation_id) =>
            {
                skip_element(&mut reader, b"Relationship", &mut buffer)?;
                removed = true;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"Relationship"
                    && xml_value(start, b"Id", reader.decoder())?.as_deref()
                        == Some(relation_id) =>
            {
                removed = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy OOXML relationships: {error}"))?,
        }
        buffer.clear();
    }
    if !removed {
        return Err("The target OOXML relationship is missing.".into());
    }
    Ok(writer.into_inner())
}

fn append_content_type(xml: &[u8], part_name: &str, content_type: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 192));
    let mut buffer = Vec::new();
    let mut exists = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse content types: {error}"))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"Override"
                    && xml_value(start, b"PartName", reader.decoder())?.as_deref()
                        == Some(part_name) =>
            {
                exists = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy a content type: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"Types" && !exists => {
                let mut item = BytesStart::new("Override");
                item.push_attribute(("PartName", part_name));
                item.push_attribute(("ContentType", content_type));
                writer
                    .write_event(Event::Empty(item))
                    .map_err(|error| format!("Failed to append a content type: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish content types: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy content types: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn write_xml_fragment(writer: &mut Writer<Vec<u8>>, fragment: &[u8]) -> Result<(), String> {
    let mut reader = Reader::from_reader(fragment);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse an OOXML fragment: {error}"))?
        {
            Event::Eof => break,
            event => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to write an OOXML fragment: {error}"))?,
        }
        buffer.clear();
    }
    Ok(())
}

fn drawing_anchor_xml(
    relation_id: &str,
    object_id: usize,
    from: &WorkbookDrawingAnchor,
    to: &WorkbookDrawingAnchor,
) -> Vec<u8> {
    format!(
        "<xdr:twoCellAnchor><xdr:from><xdr:col>{}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{}</xdr:row><xdr:rowOff>{}</xdr:rowOff></xdr:from><xdr:to><xdr:col>{}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{}</xdr:row><xdr:rowOff>{}</xdr:rowOff></xdr:to><xdr:graphicFrame macro=\"\"><xdr:nvGraphicFramePr><xdr:cNvPr id=\"{object_id}\" name=\"Chart {object_id}\" descr=\"Chart created by LongEdit\"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" r:id=\"{relation_id}\"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>",
        from.column,
        from.column_offset,
        from.row,
        from.row_offset,
        to.column,
        to.column_offset,
        to.row,
        to.row_offset
    )
    .into_bytes()
}

fn append_drawing_anchor(xml: &[u8], anchor: &[u8]) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + anchor.len()));
    let mut buffer = Vec::new();
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Drawing XML: {error}"))?;
        match event {
            Event::End(ref end) if end.local_name().as_ref() == b"wsDr" => {
                write_xml_fragment(&mut writer, anchor)?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Drawing XML: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy Drawing XML: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("The Drawing root is missing.".into());
    }
    Ok(writer.into_inner())
}

fn new_drawing(anchor: &[u8]) -> Result<Vec<u8>, String> {
    let mut output = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><xdr:wsDr xmlns:xdr=\"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">".to_vec();
    output.extend_from_slice(anchor);
    output.extend_from_slice(b"</xdr:wsDr>");
    Ok(output)
}

fn patch_sheet_with_drawing(xml: &[u8], relation_id: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 96));
    let mut buffer = Vec::new();
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet Drawing references: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"worksheet" => {
                let mut root = start.to_owned();
                if xml_value(start, b"xmlns:r", reader.decoder())?.is_none() {
                    root.push_attribute((
                        "xmlns:r",
                        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                    ));
                }
                writer
                    .write_event(Event::Start(root))
                    .map_err(|error| format!("Failed to write the worksheet root: {error}"))?;
            }
            Event::Start(ref start)
                if !inserted
                    && matches!(
                        start.local_name().as_ref(),
                        b"legacyDrawing" | b"tableParts" | b"extLst"
                    ) =>
            {
                let mut drawing = BytesStart::new("drawing");
                drawing.push_attribute(("r:id", relation_id));
                writer
                    .write_event(Event::Empty(drawing))
                    .map_err(|error| format!("Failed to add the Drawing reference: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy worksheet XML: {error}"))?;
                inserted = true;
            }
            Event::End(ref end) if !inserted && end.local_name().as_ref() == b"worksheet" => {
                let mut drawing = BytesStart::new("drawing");
                drawing.push_attribute(("r:id", relation_id));
                writer
                    .write_event(Event::Empty(drawing))
                    .map_err(|error| format!("Failed to add the Drawing reference: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish the worksheet: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet XML: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("Could not add the Drawing reference to the worksheet.".into());
    }
    Ok(writer.into_inner())
}

fn drawing_object_count_and_max_id(xml: &[u8]) -> Result<(usize, usize), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut count = 0usize;
    let mut max_id = 0usize;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to inspect Drawing identities: {error}"))?
        {
            Event::Start(ref event)
                if matches!(
                    event.local_name().as_ref(),
                    b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                ) =>
            {
                count += 1;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"cNvPr" =>
            {
                max_id = max_id.max(
                    xml_value(event, b"id", reader.decoder())?
                        .and_then(|value| value.parse().ok())
                        .unwrap_or_default(),
                );
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok((count, max_id))
}

fn remove_drawing_anchor(xml: &[u8], anchor_index: usize) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut next_anchor = 0usize;
    let mut removed = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Drawing XML: {error}"))?;
        match event {
            Event::Start(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"twoCellAnchor" | b"oneCellAnchor" | b"absoluteAnchor"
                ) =>
            {
                let current = next_anchor;
                next_anchor += 1;
                if current == anchor_index {
                    let name = start.local_name().as_ref().to_vec();
                    skip_element(&mut reader, &name, &mut buffer)?;
                    removed = true;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy Drawing XML: {error}"))?;
                }
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy Drawing XML: {error}"))?,
        }
        buffer.clear();
    }
    if !removed {
        return Err("The target Drawing anchor is missing.".into());
    }
    Ok(writer.into_inner())
}

fn drawing_uses_relationship(xml: &[u8], relation_id: &str) -> Result<bool, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Drawing XML: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event) => {
                if xml_value(event, b"r:id", reader.decoder())?.as_deref() == Some(relation_id) {
                    return Ok(true);
                }
            }
            Event::Eof => return Ok(false),
            _ => {}
        }
        buffer.clear();
    }
}

fn chart_type_element_count(xml: &[u8]) -> Result<usize, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut count = 0usize;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to inspect chart structure: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if chart_type_from_name(event.local_name().as_ref()).is_some() =>
            {
                count += 1;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(count)
}

pub fn patch_workbook_drawing(
    source: &[u8],
    change: &WorkbookDrawingChange,
) -> Result<Vec<u8>, String> {
    let mut entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let sheet_path = paths
        .get(&change.sheet)
        .cloned()
        .ok_or("The Drawing worksheet no longer exists.")?;
    let sheet_xml = entries
        .iter()
        .find(|entry| entry.name == sheet_path)
        .map(|entry| entry.data.clone())
        .ok_or("The Drawing worksheet part is missing.")?;
    if parse_page_layout(&sheet_xml)?.protection.enabled {
        return Err("The protected worksheet cannot modify Drawing objects.".into());
    }
    if change.action == WorkbookDrawingAction::CreateChart {
        let chart_type = change
            .chart_type
            .as_deref()
            .ok_or("A chart type is required.")?;
        supported_chart_type(chart_type)?;
        let source_range = change
            .source_range
            .as_ref()
            .ok_or("A source range is required to create a chart.")?;
        let series = chart_series_from_selection(&change.sheet, source_range, chart_type)?;
        let from = change
            .from
            .as_ref()
            .ok_or("A chart start anchor is required.")?;
        let to = change
            .to
            .as_ref()
            .ok_or("A chart end anchor is required.")?;
        validate_drawing_anchor(from, false)?;
        validate_drawing_anchor(to, true)?;
        if to.row <= from.row || to.column <= from.column {
            return Err(
                "The chart end anchor must be below and to the right of its start anchor.".into(),
            );
        }
        let title = change
            .chart_title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Chart");
        let chart_xml = build_standard_chart_xml(chart_type, Some(title), &series)?;
        let mut chart_number = 1usize;
        let chart_path = loop {
            let candidate = format!("xl/charts/chart{chart_number}.xml");
            if !entries.iter().any(|entry| entry.name == candidate) {
                break candidate;
            }
            chart_number += 1;
        };

        let drawing_paths = part_relationships(&entries, &sheet_path)?
            .into_values()
            .filter(|path| path.starts_with("xl/drawings/") && path.ends_with(".xml"))
            .collect::<Vec<_>>();
        if drawing_paths.len() > 1 {
            return Err(
                "Worksheets with multiple Drawing parts cannot create charts safely yet.".into(),
            );
        }
        let (drawing_path, drawing_xml, drawing_was_created) =
            if let Some(path) = drawing_paths.first() {
                let xml = entries
                    .iter()
                    .find(|entry| &entry.name == path)
                    .map(|entry| entry.data.clone())
                    .ok_or("The worksheet Drawing part is missing.")?;
                (path.clone(), xml, false)
            } else {
                let mut drawing_number = 1usize;
                let path = loop {
                    let candidate = format!("xl/drawings/drawing{drawing_number}.xml");
                    if !entries.iter().any(|entry| entry.name == candidate) {
                        break candidate;
                    }
                    drawing_number += 1;
                };
                (path, Vec::new(), true)
            };
        let drawing_relationship_path = relationship_part_path(&drawing_path)?;
        let drawing_relationship_xml = entries
            .iter()
            .find(|entry| entry.name == drawing_relationship_path)
            .map(|entry| entry.data.as_slice());
        let chart_relation_id = next_relationship_id(drawing_relationship_xml)?;
        let (anchor_index, max_object_id) = if drawing_was_created {
            (0, 0)
        } else {
            drawing_object_count_and_max_id(&drawing_xml)?
        };
        if anchor_index >= MAX_DRAWING_OBJECTS {
            return Err(format!(
                "A worksheet Drawing part cannot contain more than {MAX_DRAWING_OBJECTS} objects."
            ));
        }
        let object_id = max_object_id
            .checked_add(1)
            .ok_or("The Drawing object id overflowed.")?;
        let anchor = drawing_anchor_xml(&chart_relation_id, object_id, from, to);
        let updated_drawing = if drawing_was_created {
            new_drawing(&anchor)?
        } else {
            append_drawing_anchor(&drawing_xml, &anchor)?
        };

        let chart_target = format!(
            "../charts/{}",
            chart_path.rsplit('/').next().unwrap_or_default()
        );
        if let Some(entry) = entries
            .iter_mut()
            .find(|entry| entry.name == drawing_relationship_path)
        {
            entry.data = append_relationship(
                &entry.data,
                &chart_relation_id,
                CHART_RELATIONSHIP_TYPE,
                &chart_target,
            )?;
        } else {
            entries.push(PackageEntry {
                name: drawing_relationship_path.clone(),
                is_dir: false,
                compression: CompressionMethod::Deflated,
                data: new_relationships(&chart_relation_id, CHART_RELATIONSHIP_TYPE, &chart_target),
            });
        }
        if drawing_was_created {
            let sheet_relationship_path = relationship_part_path(&sheet_path)?;
            let sheet_relationship_xml = entries
                .iter()
                .find(|entry| entry.name == sheet_relationship_path)
                .map(|entry| entry.data.as_slice());
            let drawing_relation_id = next_relationship_id(sheet_relationship_xml)?;
            let drawing_target = format!(
                "../drawings/{}",
                drawing_path.rsplit('/').next().unwrap_or_default()
            );
            if let Some(entry) = entries
                .iter_mut()
                .find(|entry| entry.name == sheet_relationship_path)
            {
                entry.data = append_relationship(
                    &entry.data,
                    &drawing_relation_id,
                    DRAWING_RELATIONSHIP_TYPE,
                    &drawing_target,
                )?;
            } else {
                entries.push(PackageEntry {
                    name: sheet_relationship_path,
                    is_dir: false,
                    compression: CompressionMethod::Deflated,
                    data: new_relationships(
                        &drawing_relation_id,
                        DRAWING_RELATIONSHIP_TYPE,
                        &drawing_target,
                    ),
                });
            }
            let sheet_entry = entries
                .iter_mut()
                .find(|entry| entry.name == sheet_path)
                .ok_or("The worksheet part is missing.")?;
            sheet_entry.data = patch_sheet_with_drawing(&sheet_entry.data, &drawing_relation_id)?;
            entries.push(PackageEntry {
                name: drawing_path.clone(),
                is_dir: false,
                compression: CompressionMethod::Deflated,
                data: updated_drawing,
            });
        } else {
            let drawing_entry = entries
                .iter_mut()
                .find(|entry| entry.name == drawing_path)
                .ok_or("The Drawing part is missing.")?;
            drawing_entry.data = updated_drawing;
        }
        let content_types = entries
            .iter_mut()
            .find(|entry| entry.name == "[Content_Types].xml")
            .ok_or("XLSX is missing [Content_Types].xml")?;
        if drawing_was_created {
            content_types.data = append_content_type(
                &content_types.data,
                &format!("/{drawing_path}"),
                DRAWING_CONTENT_TYPE,
            )?;
        }
        content_types.data = append_content_type(
            &content_types.data,
            &format!("/{chart_path}"),
            CHART_CONTENT_TYPE,
        )?;
        entries.push(PackageEntry {
            name: chart_path.clone(),
            is_dir: false,
            compression: CompressionMethod::Deflated,
            data: chart_xml,
        });
        let updated_sheet_xml = entries
            .iter()
            .find(|entry| entry.name == sheet_path)
            .map(|entry| entry.data.as_slice())
            .ok_or("The updated worksheet part is missing.")?;
        let created = read_sheet_drawings(&entries, &sheet_path, updated_sheet_xml)?
            .into_iter()
            .find(|item| item.part.as_deref() == Some(chart_path.as_str()))
            .ok_or("The created chart could not be read back.")?;
        if created.object_id != object_id.to_string()
            || created.anchor_index != anchor_index
            || created
                .chart
                .as_ref()
                .map(|chart| chart.chart_type.as_str())
                != Some(chart_type)
        {
            return Err("The created chart failed semantic verification.".into());
        }
        return write_package(entries, source.len() + 4096);
    }
    let target = read_sheet_drawings(&entries, &sheet_path, &sheet_xml)?
        .into_iter()
        .find(|item| {
            item.drawing_part == change.drawing_part
                && item.anchor_index == change.anchor_index
                && item.object_id == change.object_id
        })
        .ok_or("The selected Drawing object no longer exists.")?;
    if !target.editable || target.anchor_kind != "two_cell" {
        return Err("Only standard two-cell Drawing objects can be edited in this stage.".into());
    }
    match change.action {
        WorkbookDrawingAction::DeleteChart => {
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The selected Drawing object is not a safe chart.")?
                .to_string();
            let drawing_relationship_path = relationship_part_path(&change.drawing_part)?;
            let relation_id = part_relationships(&entries, &change.drawing_part)?
                .into_iter()
                .find_map(|(id, path)| (path == chart_part).then_some(id))
                .ok_or("The chart relationship is missing.")?;
            let drawing_entry = entries
                .iter_mut()
                .find(|entry| entry.name == change.drawing_part)
                .ok_or("The Drawing part is missing.")?;
            drawing_entry.data = remove_drawing_anchor(&drawing_entry.data, change.anchor_index)?;
            if !drawing_uses_relationship(&drawing_entry.data, &relation_id)? {
                let relationship_entry = entries
                    .iter_mut()
                    .find(|entry| entry.name == drawing_relationship_path)
                    .ok_or("The Drawing relationship part is missing.")?;
                relationship_entry.data =
                    remove_relationship(&relationship_entry.data, &relation_id)?;
            }
            let still_referenced = entries
                .iter()
                .filter(|entry| {
                    entry.name.starts_with("xl/drawings/")
                        && entry.name.ends_with(".xml")
                        && !entry.name.contains("/_rels/")
                })
                .map(|entry| part_relationships(&entries, &entry.name))
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .any(|relationships| relationships.into_values().any(|path| path == chart_part));
            if !still_referenced {
                entries.retain(|entry| entry.name != chart_part);
                let content_types = entries
                    .iter_mut()
                    .find(|entry| entry.name == "[Content_Types].xml")
                    .ok_or("XLSX is missing [Content_Types].xml")?;
                content_types.data =
                    remove_table_content_type(&content_types.data, &format!("/{chart_part}"))
                        .map_err(|_| "The chart content type is missing.")?;
            }
            if read_sheet_drawings(&entries, &sheet_path, &sheet_xml)?
                .iter()
                .any(|item| {
                    item.drawing_part == change.drawing_part && item.object_id == change.object_id
                })
            {
                return Err("The chart deletion failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::ChangeChartType => {
            let chart_type = change
                .chart_type
                .as_deref()
                .ok_or("A target chart type is required.")?;
            supported_chart_type(chart_type)?;
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            supported_chart_type(&chart.chart_type)
                .map_err(|_| "The existing chart type cannot be rebuilt safely.")?;
            if chart.series.is_empty()
                || chart.series.iter().any(|series| !series.editable)
                || (chart_type == "pie" && chart.series.len() != 1)
            {
                return Err(
                    "Only simple standard charts with internal formula series can change type."
                        .into(),
                );
            }
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            if chart_type_element_count(&chart_entry.data)? != 1
                || chart_entry
                    .data
                    .windows(b"extLst".len())
                    .any(|window| window == b"extLst")
            {
                return Err(
                    "Combination charts and charts with extensions cannot change type.".into(),
                );
            }
            chart_entry.data =
                build_standard_chart_xml(chart_type, chart.title.as_deref(), &chart.series)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            if verified.chart_type != chart_type || verified.series.len() != chart.series.len() {
                return Err("The chart type change failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateChartPresentation => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            if !chart.presentation_editable {
                return Err(
                    "Only simple standard charts can edit axis titles and legend position.".into(),
                );
            }
            let category_axis_title = change
                .category_axis_title
                .as_deref()
                .ok_or("A category-axis title value is required.")?
                .trim();
            let value_axis_title = change
                .value_axis_title
                .as_deref()
                .ok_or("A value-axis title value is required.")?
                .trim();
            let legend_position = change
                .legend_position
                .as_deref()
                .ok_or("A legend position is required.")?;
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data = patch_chart_presentation_xml(
                &chart_entry.data,
                &chart.chart_type,
                category_axis_title,
                value_axis_title,
                legend_position,
            )?;
            let verified = parse_chart_part(&chart_entry.data)?;
            if verified.category_axis_title.as_deref()
                != (!category_axis_title.is_empty()).then_some(category_axis_title)
                || verified.value_axis_title.as_deref()
                    != (!value_axis_title.is_empty()).then_some(value_axis_title)
                || verified.legend_position != legend_position
            {
                return Err("The chart presentation settings failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateChartDataLabels => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            if !chart.data_labels_editable {
                return Err("Only simple standard chart-level data labels can be edited.".into());
            }
            let labels = change
                .data_labels
                .as_ref()
                .ok_or("Chart data-label settings are required.")?;
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data =
                patch_chart_data_labels_xml(&chart_entry.data, &chart.chart_type, labels)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            if &verified.data_labels != labels || !verified.data_labels_editable {
                return Err("The chart data-label settings failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateChartSeriesName => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            let series_index = change.series_index.ok_or("A chart series is required.")?;
            let series = chart
                .series
                .iter()
                .find(|item| item.index == series_index)
                .ok_or("The selected chart series does not exist.")?;
            if !series.name_editable {
                return Err("Only series in simple standard charts can be renamed.".into());
            }
            let series_name = change
                .series_name
                .as_deref()
                .ok_or("A chart series name value is required.")?
                .trim();
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data =
                patch_chart_series_name_xml(&chart_entry.data, series_index, series_name)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            let expected = (!series_name.is_empty()).then_some(series_name);
            if verified
                .series
                .iter()
                .find(|item| item.index == series_index)
                .and_then(|item| item.name.as_deref())
                != expected
            {
                return Err("The chart series name failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateChartSeriesColor => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            let series_index = change.series_index.ok_or("A chart series is required.")?;
            let series = chart
                .series
                .iter()
                .find(|item| item.index == series_index)
                .ok_or("The selected chart series does not exist.")?;
            if !series.color_editable {
                return Err(
                    "Only series with simple direct RGB formatting can change color.".into(),
                );
            }
            let color = normalize_chart_series_color(
                change
                    .series_color
                    .as_deref()
                    .ok_or("A chart series color is required.")?,
            )?;
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data =
                patch_chart_series_color_xml(&chart_entry.data, series_index, &color)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            let updated = verified
                .series
                .iter()
                .find(|item| item.index == series_index)
                .ok_or("The updated chart series could not be read back.")?;
            if updated.color.as_deref() != Some(color.as_str()) || !updated.color_editable {
                return Err("The chart series color failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateMetadata | WorkbookDrawingAction::MoveResize => {
            let drawing_entry = entries
                .iter_mut()
                .find(|entry| entry.name == change.drawing_part)
                .ok_or("The Drawing part is missing.")?;
            drawing_entry.data = patch_drawing_object_xml(&drawing_entry.data, change)?;
            let updated = read_sheet_drawings(&entries, &sheet_path, &sheet_xml)?
                .into_iter()
                .find(|item| {
                    item.drawing_part == change.drawing_part
                        && item.anchor_index == change.anchor_index
                        && item.object_id == change.object_id
                })
                .ok_or("The updated Drawing object could not be read back.")?;
            if change.action == WorkbookDrawingAction::UpdateMetadata {
                if updated.name != change.name.as_deref().unwrap_or_default().trim()
                    || updated.description.as_deref() != change.description.as_deref()
                {
                    return Err("The Drawing metadata failed semantic verification.".into());
                }
            } else {
                if Some(&updated.from) != change.from.as_ref()
                    || updated.to.as_ref() != change.to.as_ref()
                {
                    return Err("The Drawing anchor failed semantic verification.".into());
                }
            }
        }
        WorkbookDrawingAction::UpdateChartTitle => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            if !chart.title_editable {
                return Err(
                    "Only existing standard chart titles can be edited in this stage.".into(),
                );
            }
            let title = change
                .chart_title
                .as_deref()
                .ok_or("A chart title is required.")?;
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data = patch_chart_title_xml(&chart_entry.data, title)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            if verified.title.as_deref() != Some(title.trim()) {
                return Err("The chart title failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::UpdateChartSeries => {
            let chart = target
                .chart
                .as_ref()
                .ok_or("The selected Drawing object is not a chart.")?;
            let series_index = change
                .series_index
                .ok_or("A chart series index is required.")?;
            if !chart
                .series
                .get(series_index)
                .is_some_and(|series| series.editable)
            {
                return Err("The selected chart series is not safely editable.".into());
            }
            let (categories, _, category_points) = validate_chart_range_formula(
                change
                    .series_categories
                    .as_deref()
                    .ok_or("A chart category reference is required.")?,
                &paths,
            )?;
            let (values, _, value_points) = validate_chart_range_formula(
                change
                    .series_values
                    .as_deref()
                    .ok_or("A chart value reference is required.")?,
                &paths,
            )?;
            if category_points != value_points {
                return Err(
                    "Chart category and value references must contain the same number of points."
                        .into(),
                );
            }
            let chart_part = target
                .part
                .as_deref()
                .filter(|part| part.starts_with("xl/charts/") && part.ends_with(".xml"))
                .ok_or("The chart part is missing or unsafe.")?;
            let chart_entry = entries
                .iter_mut()
                .find(|entry| entry.name == chart_part)
                .ok_or("The chart part is missing.")?;
            chart_entry.data =
                patch_chart_series_xml(&chart_entry.data, series_index, &categories, &values)?;
            let verified = parse_chart_part(&chart_entry.data)?;
            let series = verified
                .series
                .get(series_index)
                .ok_or("The updated chart series could not be read back.")?;
            if series.categories.as_deref() != Some(categories.as_str())
                || series.values.as_deref() != Some(values.as_str())
            {
                return Err("The chart series references failed semantic verification.".into());
            }
        }
        WorkbookDrawingAction::CreateChart => unreachable!("handled before target lookup"),
    }
    write_package(entries, source.len() + 512)
}

#[derive(Default)]
struct PivotCacheMetadata {
    source_type: String,
    source_sheet: Option<String>,
    source_range: Option<String>,
    connection_id: Option<u32>,
    refresh_on_load: bool,
    audit: PivotCacheAudit,
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

fn pivot_layout_reference(xml: &[u8]) -> Result<Option<String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析透视输出区域失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"location" =>
            {
                return xml_value(event, b"ref", reader.decoder());
            }
            Event::Eof => return Ok(None),
            _ => {}
        }
        buffer.clear();
    }
}

fn worksheet_cell_count_in_range(xml: &[u8], reference: &str) -> Result<usize, String> {
    let range = parse_range_reference(reference)?;
    let mut count = 0usize;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析透视输出单元格失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"c" =>
            {
                if let Some(reference) = xml_value(event, b"r", reader.decoder())? {
                    let (row, column) = parse_cell_reference(&reference)?;
                    if row >= range.top
                        && row <= range.bottom
                        && column >= range.left
                        && column <= range.right
                    {
                        count = count.saturating_add(1);
                    }
                }
            }
            Event::Eof => return Ok(count),
            _ => {}
        }
        buffer.clear();
    }
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
            let mut metadata = parse_pivot_cache_metadata(&entry.data)?;
            let records_path = part_relationships(&entries, &path)?
                .into_values()
                .find(|target| {
                    target.starts_with("xl/pivotCache/pivotCacheRecords")
                        && target.ends_with(".xml")
                });
            let records = records_path
                .as_deref()
                .and_then(|path| entries.iter().find(|candidate| candidate.name == path))
                .map(|entry| entry.data.as_slice());
            metadata.audit = inspect_pivot_cache(&entry.data, records)?;
            cache_metadata.insert(cache_id, metadata);
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
        let output_cell_count = part_sheets
            .get(&entry.name)
            .zip(pivot_layout_reference(&entry.data)?.as_deref())
            .and_then(|(sheet, reference)| {
                sheet_paths
                    .get(sheet)
                    .and_then(|path| entries.iter().find(|candidate| candidate.name == *path))
                    .map(|sheet_entry| worksheet_cell_count_in_range(&sheet_entry.data, reference))
            })
            .transpose()?;
        let audit = inspect_pivot_table(
            &entry.data,
            metadata.map_or("unknown", |item| item.source_type.as_str()),
            metadata.and_then(|item| item.source_sheet.as_deref()),
            metadata.and_then(|item| item.source_range.as_deref()),
            metadata.map(|item| &item.audit),
            output_cell_count,
        )?;
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
            audit,
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

    Ok(build_workbook_linked_data(
        pivot_tables,
        slicers,
        external_links,
        connections,
        external_relationship_count,
    ))
}

pub fn plan_workbook_pivot_rebuild(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<WorkbookPivotRebuildPlan, String> {
    validate_workbook_package(source)?;
    let isolated = source.to_vec();
    validate_workbook_package(&isolated)?;
    let source_digest = format!("{:x}", md5::compute(source));
    let isolated_digest = format!("{:x}", md5::compute(&isolated));
    if source_digest != isolated_digest {
        return Err("透视隔离副本与源包摘要不一致".into());
    }

    let entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let (output_sheet, output_sheet_part) = sheet_paths
        .iter()
        .find_map(|(sheet, part)| {
            part_relationships(&entries, part)
                .ok()?
                .into_values()
                .any(|target| target == pivot.part)
                .then(|| (sheet.clone(), part.clone()))
        })
        .map_or((None, None), |(sheet, part)| (Some(sheet), Some(part)));

    let workbook = entries
        .iter()
        .find(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let workbook_relations = part_relationships(&entries, "xl/workbook.xml")?;
    let mut cache_definition_part = None;
    let mut reader = Reader::from_reader(workbook.data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Cache 影响范围失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"pivotCache" =>
            {
                let cache_id = parse_u32_value(xml_value(event, b"cacheId", reader.decoder())?);
                let relation_id = xml_value(event, b"r:id", reader.decoder())?;
                if cache_id == pivot.cache_id {
                    cache_definition_part =
                        relation_id.and_then(|id| workbook_relations.get(&id).cloned());
                    break;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let cache_records_part = cache_definition_part
        .as_deref()
        .map(|part| part_relationships(&entries, part))
        .transpose()?
        .and_then(|relations| {
            relations.into_values().find(|target| {
                target.starts_with("xl/pivotCache/pivotCacheRecords") && target.ends_with(".xml")
            })
        });

    let mut blockers = Vec::new();
    if pivot.audit.writeback.status != "structure_candidate" {
        blockers.push("透视表尚未通过完整写回结构审计".into());
        blockers.extend(pivot.audit.writeback.blockers.iter().cloned());
    }
    if pivot.source_type != "worksheet"
        || pivot.source_sheet.is_none()
        || pivot.source_range.is_none()
    {
        blockers.push("隔离原型仅接受具有明确范围的本地工作表来源".into());
    }
    if pivot.audit.page_field_count > 0 {
        blockers.push("隔离原型不支持页面筛选字段".into());
    }
    if cache_definition_part.is_none() {
        blockers.push("无法定位 Pivot Cache Definition 部件".into());
    }
    if cache_records_part.is_none() {
        blockers.push("无法定位 Pivot Cache Records 部件".into());
    }
    if output_sheet_part.is_none() {
        blockers.push("无法定位透视输出工作表部件".into());
    }

    let mut affected_parts = Vec::new();
    let mut add_impact = |part: Option<String>, role: &str, planned_action: &str| {
        if let Some(part) = part {
            if !affected_parts
                .iter()
                .any(|impact: &WorkbookPivotRebuildImpact| impact.part == part)
            {
                affected_parts.push(WorkbookPivotRebuildImpact {
                    part,
                    role: role.into(),
                    planned_action: planned_action.into(),
                });
            }
        }
    };
    add_impact(
        cache_definition_part,
        "cache_definition",
        "rebuild_metadata",
    );
    add_impact(cache_records_part, "cache_records", "rebuild_records");
    add_impact(
        Some(pivot.part.clone()),
        "pivot_table",
        "rebuild_layout_items",
    );
    add_impact(
        output_sheet_part,
        "output_worksheet",
        "replace_output_cells",
    );
    let all_parts_exist = affected_parts
        .iter()
        .all(|impact| entries.iter().any(|entry| entry.name == impact.part));
    if !all_parts_exist {
        blockers.push("影响清单包含不存在的 OOXML 部件".into());
    }
    if blockers.is_empty() && affected_parts.len() != 4 {
        blockers.push("隔离原型要求四类影响部件完整且互不重复".into());
    }
    blockers.sort();
    blockers.dedup();
    let ready = blockers.is_empty();
    let preserved_part_count = entries.len().saturating_sub(affected_parts.len());
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };

    Ok(WorkbookPivotRebuildPlan {
        pivot_name: pivot.name.clone(),
        status: if ready {
            "isolated_dry_run_ready".into()
        } else {
            "blocked".into()
        },
        execution: "temporary_copy_only".into(),
        writes_user_file: false,
        temporary_copy_verified: true,
        source_package_digest: source_digest,
        isolated_package_digest: isolated_digest,
        source_sheet: pivot.source_sheet.clone(),
        source_range: pivot.source_range.clone(),
        output_sheet,
        output_range: pivot.audit.layout_range.clone(),
        affected_parts,
        preserved_part_count,
        blockers,
        gates: vec![
            gate("signature_check", "passed"),
            gate("structure_audit", if ready { "passed" } else { "blocked" }),
            gate("impact_inventory", if ready { "passed" } else { "blocked" }),
            gate("temporary_copy_validation", "passed"),
            gate("isolated_rebuild", "pending"),
            gate("atomic_replace", "blocked"),
            gate("rollback", "pending"),
            gate("excel_or_libreoffice_round_trip", "pending"),
        ],
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PivotCacheScalar {
    kind: String,
    value: String,
}

#[derive(Clone, Debug)]
struct PivotCacheFieldTemplate {
    name: String,
    shared_items: Vec<PivotCacheScalar>,
}

fn pivot_cache_number(value: f64) -> Result<String, String> {
    if !value.is_finite() {
        return Err("Pivot Cache 不能包含非有限数值".into());
    }
    Ok(if value.fract() == 0.0 && value.abs() <= i64::MAX as f64 {
        format!("{value:.0}")
    } else {
        value.to_string()
    })
}

fn pivot_cache_scalar(value: &Data) -> Result<PivotCacheScalar, String> {
    let (kind, value) = match value {
        Data::Empty => ("m", String::new()),
        Data::String(value) => ("s", value.clone()),
        Data::Int(value) => ("n", value.to_string()),
        Data::Float(value) => ("n", pivot_cache_number(*value)?),
        Data::Bool(value) => ("b", if *value { "1" } else { "0" }.into()),
        Data::DateTime(value) if value.is_datetime() => {
            let (year, month, day, hour, minute, second, millis) = value.to_ymd_hms_milli();
            let value = if millis > 0 {
                format!(
                    "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}"
                )
            } else {
                format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}")
            };
            ("d", value)
        }
        Data::DateTime(_) | Data::DurationIso(_) => {
            return Err("隔离 Cache 重建暂不支持持续时间字段".into());
        }
        Data::DateTimeIso(value) => ("d", value.clone()),
        Data::Error(value) => ("e", value.to_string()),
    };
    Ok(PivotCacheScalar {
        kind: kind.into(),
        value,
    })
}

fn parse_pivot_cache_field_templates(xml: &[u8]) -> Result<Vec<PivotCacheFieldTemplate>, String> {
    let mut fields = Vec::new();
    let mut current_field = None;
    let mut inside_shared_items = false;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Cache 字段模板失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"cacheField" => {
                if fields.len() >= MAX_PIVOT_CACHE_REBUILD_FIELDS {
                    return Err("Pivot Cache 字段数量超过隔离重建上限".into());
                }
                fields.push(PivotCacheFieldTemplate {
                    name: xml_value(event, b"name", reader.decoder())?
                        .unwrap_or_else(|| format!("Field{}", fields.len() + 1)),
                    shared_items: Vec::new(),
                });
                current_field = Some(fields.len() - 1);
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"cacheField" => {
                fields.push(PivotCacheFieldTemplate {
                    name: xml_value(event, b"name", reader.decoder())?
                        .unwrap_or_else(|| format!("Field{}", fields.len() + 1)),
                    shared_items: Vec::new(),
                });
            }
            Event::Start(ref event) if event.local_name().as_ref() == b"sharedItems" => {
                inside_shared_items = true;
            }
            Event::Empty(ref event) if event.local_name().as_ref() == b"sharedItems" => {}
            Event::Start(ref event) | Event::Empty(ref event)
                if inside_shared_items
                    && matches!(
                        event.local_name().as_ref(),
                        b"s" | b"n" | b"d" | b"b" | b"e" | b"m"
                    ) =>
            {
                let index = current_field.ok_or("Pivot Cache sharedItems 缺少所属字段")?;
                let kind = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                let value = xml_value(event, b"v", reader.decoder())?.unwrap_or_default();
                fields[index]
                    .shared_items
                    .push(PivotCacheScalar { kind, value });
            }
            Event::End(ref event) if event.local_name().as_ref() == b"sharedItems" => {
                inside_shared_items = false;
            }
            Event::End(ref event) if event.local_name().as_ref() == b"cacheField" => {
                current_field = None;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(fields)
}

fn rebuild_pivot_cache_records(
    rows: &[Vec<Data>],
    fields: &[PivotCacheFieldTemplate],
) -> Result<(Vec<u8>, Vec<WorkbookPivotCacheFieldRebuild>), String> {
    let mut writer = Writer::new(Vec::new());
    writer
        .write_event(Event::Decl(BytesDecl::new(
            "1.0",
            Some("UTF-8"),
            Some("yes"),
        )))
        .map_err(|error| format!("写入 Pivot Cache Records 声明失败: {error}"))?;
    let mut root = BytesStart::new("pivotCacheRecords");
    root.push_attribute((
        "xmlns",
        "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    ));
    let count = rows.len().to_string();
    root.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(root))
        .map_err(|error| format!("写入 Pivot Cache Records 根节点失败: {error}"))?;
    for row in rows {
        if row.len() != fields.len() {
            return Err("透视来源记录宽度与 Cache 字段数不一致".into());
        }
        writer
            .write_event(Event::Start(BytesStart::new("r")))
            .map_err(|error| format!("写入 Pivot Cache 记录失败: {error}"))?;
        for (value, field) in row.iter().zip(fields.iter()) {
            let scalar = pivot_cache_scalar(value)?;
            let mut item = if field.shared_items.is_empty() {
                BytesStart::new(scalar.kind.as_str())
            } else {
                let index = field
                    .shared_items
                    .iter()
                    .position(|item| item == &scalar)
                    .ok_or_else(|| {
                        format!(
                            "字段“{}”出现未进入现有 sharedItems 的新值；需先进入 Pivot items 重建阶段",
                            field.name
                        )
                    })?;
                let mut item = BytesStart::new("x");
                let index = index.to_string();
                item.push_attribute(("v", index.as_str()));
                writer
                    .write_event(Event::Empty(item))
                    .map_err(|error| format!("写入 Pivot Cache 共享项索引失败: {error}"))?;
                continue;
            };
            if scalar.kind != "m" {
                item.push_attribute(("v", scalar.value.as_str()));
            }
            writer
                .write_event(Event::Empty(item))
                .map_err(|error| format!("写入 Pivot Cache 字段值失败: {error}"))?;
        }
        writer
            .write_event(Event::End(BytesEnd::new("r")))
            .map_err(|error| format!("结束 Pivot Cache 记录失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("pivotCacheRecords")))
        .map_err(|error| format!("结束 Pivot Cache Records 失败: {error}"))?;
    let summaries = fields
        .iter()
        .enumerate()
        .map(|(index, field)| WorkbookPivotCacheFieldRebuild {
            index,
            name: field.name.clone(),
            value_type: rows
                .iter()
                .filter_map(|row| row.get(index))
                .filter_map(|value| pivot_cache_scalar(value).ok())
                .find(|value| value.kind != "m")
                .map(|value| match value.kind.as_str() {
                    "s" => "string",
                    "n" => "number",
                    "d" => "date",
                    "b" => "boolean",
                    "e" => "error",
                    _ => "blank",
                })
                .unwrap_or("blank")
                .into(),
            shared_item_count: field.shared_items.len(),
            record_encoding: if field.shared_items.is_empty() {
                "direct".into()
            } else {
                "shared_index".into()
            },
        })
        .collect();
    Ok((writer.into_inner(), summaries))
}

fn rebuild_pivot_cache_definition(
    xml: &[u8],
    record_count: usize,
    fields: &[PivotCacheFieldTemplate],
    rows: &[Vec<Data>],
    rewrite_shared_item_values: bool,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 64));
    let mut buffer = Vec::new();
    let mut current_field = None;
    let mut field_index = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Cache Definition 重建失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"pivotCacheDefinition" => {
                let updated =
                    replace_xml_attribute(start, b"recordCount", &record_count.to_string(), false)?;
                writer
                    .write_event(Event::Start(updated))
                    .map_err(|error| format!("写入 Pivot Cache 记录计数失败: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"cacheField" => {
                current_field = Some(field_index);
                field_index += 1;
                writer
                    .write_event(Event::Start(start.to_owned()))
                    .map_err(|error| format!("复制 Pivot Cache 字段失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"cacheField" => {
                field_index += 1;
                writer
                    .write_event(Event::Empty(start.to_owned()))
                    .map_err(|error| format!("复制 Pivot Cache 空字段失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"sharedItems" =>
            {
                let original_is_start = matches!(event, Event::Start(_));
                let index = current_field.ok_or("Pivot Cache sharedItems 缺少字段上下文")?;
                let field = fields.get(index).ok_or("Pivot Cache 字段索引越界")?;
                let mut updated = start.to_owned();
                if !field.shared_items.is_empty() {
                    updated = replace_xml_attribute(
                        &updated,
                        b"count",
                        &field.shared_items.len().to_string(),
                        false,
                    )?;
                }
                let scalars = rows
                    .iter()
                    .filter_map(|row| row.get(index))
                    .map(pivot_cache_scalar)
                    .collect::<Result<Vec<_>, _>>()?;
                let non_empty = scalars
                    .iter()
                    .filter(|value| value.kind != "m")
                    .collect::<Vec<_>>();
                if non_empty.iter().all(|value| value.kind == "n") && !non_empty.is_empty() {
                    let mut values = non_empty
                        .iter()
                        .map(|value| value.value.parse::<f64>())
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|_| "Pivot Cache 数值元数据无效")?;
                    values.sort_by(|left, right| left.total_cmp(right));
                    updated = replace_xml_attribute(
                        &updated,
                        b"minValue",
                        &pivot_cache_number(values[0])?,
                        false,
                    )?;
                    updated = replace_xml_attribute(
                        &updated,
                        b"maxValue",
                        &pivot_cache_number(*values.last().unwrap())?,
                        false,
                    )?;
                }
                if non_empty.iter().all(|value| value.kind == "d") && !non_empty.is_empty() {
                    let mut values = non_empty
                        .iter()
                        .map(|value| value.value.as_str())
                        .collect::<Vec<_>>();
                    values.sort_unstable();
                    updated = replace_xml_attribute(&updated, b"minDate", values[0], false)?;
                    updated = replace_xml_attribute(
                        &updated,
                        b"maxDate",
                        values.last().copied().unwrap(),
                        false,
                    )?;
                }
                if rewrite_shared_item_values && !field.shared_items.is_empty() {
                    writer
                        .write_event(Event::Start(updated))
                        .map_err(|error| format!("写入 Pivot Cache sharedItems 失败: {error}"))?;
                    for scalar in &field.shared_items {
                        let mut item = BytesStart::new(scalar.kind.as_str());
                        if scalar.kind != "m" {
                            item.push_attribute(("v", scalar.value.as_str()));
                        }
                        writer.write_event(Event::Empty(item)).map_err(|error| {
                            format!("写入 Pivot Cache shared item 失败: {error}")
                        })?;
                    }
                    writer
                        .write_event(Event::End(BytesEnd::new("sharedItems")))
                        .map_err(|error| format!("结束 Pivot Cache sharedItems 失败: {error}"))?;
                    if original_is_start {
                        skip_xml_element(&mut reader, &mut buffer)?;
                    }
                    buffer.clear();
                    continue;
                } else {
                    writer
                        .write_event(if original_is_start {
                            Event::Start(updated)
                        } else {
                            Event::Empty(updated)
                        })
                        .map_err(|error| {
                            format!("写入 Pivot Cache sharedItems 元数据失败: {error}")
                        })?;
                }
            }
            Event::End(ref end) if end.local_name().as_ref() == b"cacheField" => {
                current_field = None;
                writer
                    .write_event(Event::End(end.to_owned()))
                    .map_err(|error| format!("结束 Pivot Cache 字段失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制 Pivot Cache Definition 失败: {error}"))?,
        }
        buffer.clear();
    }
    if field_index != fields.len() {
        return Err("Pivot Cache Definition 字段数量在重建时发生漂移".into());
    }
    Ok(writer.into_inner())
}

pub(crate) fn rebuild_workbook_pivot_cache_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<(Vec<u8>, WorkbookPivotCacheRebuildResult), String> {
    let plan = plan_workbook_pivot_rebuild(source, pivot)?;
    if plan.status != "isolated_dry_run_ready" {
        return Err(format!(
            "透视表未通过隔离重建计划：{}",
            plan.blockers.join("；")
        ));
    }
    let definition_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "cache_definition")
        .map(|impact| impact.part.clone())
        .ok_or("隔离计划缺少 Cache Definition 部件")?;
    let records_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "cache_records")
        .map(|impact| impact.part.clone())
        .ok_or("隔离计划缺少 Cache Records 部件")?;
    let snapshot = read_pivot_source_snapshot(source, pivot)?;
    let mut entries = load_package(source)?;
    let definition_index = entries
        .iter()
        .position(|entry| entry.name == definition_part)
        .ok_or("Cache Definition 部件不存在")?;
    let records_index = entries
        .iter()
        .position(|entry| entry.name == records_part)
        .ok_or("Cache Records 部件不存在")?;
    let fields = parse_pivot_cache_field_templates(&entries[definition_index].data)?;
    if fields.len() != snapshot.headers.len()
        || fields
            .iter()
            .zip(snapshot.headers.iter())
            .any(|(field, header)| field.name.trim() != header.trim())
    {
        return Err("来源表头与 Cache Definition 字段模板不一致".into());
    }
    for (index, audit_field) in pivot.audit.fields.iter().enumerate() {
        let kinds = snapshot
            .rows
            .iter()
            .filter_map(|row| row.get(index))
            .map(pivot_cache_scalar)
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|value| value.kind != "m")
            .map(|value| value.kind)
            .collect::<HashSet<_>>();
        if kinds.len() > 1 {
            return Err(format!(
                "字段“{}”包含混合类型；隔离 Cache 重建要求单一稳定类型",
                audit_field.name
            ));
        }
        let actual_type = kinds
            .iter()
            .next()
            .map_or("blank", |kind| match kind.as_str() {
                "s" => "string",
                "n" => "number",
                "d" => "date",
                "b" => "boolean",
                "e" => "error",
                _ => "unknown",
            });
        if !matches!(audit_field.value_type.as_str(), "unknown" | "mixed")
            && audit_field.value_type != actual_type
        {
            return Err(format!(
                "字段“{}”来源类型与 Cache Definition 不一致",
                audit_field.name
            ));
        }
    }
    let (records_xml, field_summaries) = rebuild_pivot_cache_records(&snapshot.rows, &fields)?;
    let definition_xml = rebuild_pivot_cache_definition(
        &entries[definition_index].data,
        snapshot.rows.len(),
        &fields,
        &snapshot.rows,
        false,
    )?;
    entries[definition_index].data = definition_xml;
    entries[records_index].data = records_xml;
    let modified_paths = HashSet::from([definition_part.clone(), records_part.clone()]);
    let isolated = write_package_preserving_unchanged(source, entries, &modified_paths)?;
    validate_workbook_package(&isolated)?;
    let linked = read_workbook_linked_data(&isolated)?;
    let rebuilt = linked
        .pivot_tables
        .iter()
        .find(|candidate| candidate.part == pivot.part)
        .ok_or("隔离重建后透视表身份丢失")?;
    let semantic_reparse_valid = rebuilt.audit.cache_record_count == Some(snapshot.rows.len())
        && rebuilt.audit.writeback.status == "structure_candidate";
    if !semantic_reparse_valid {
        return Err("隔离 Cache 重建后的语义复读未通过".into());
    }
    let source_entries = load_package(source)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let isolated_entries = load_package(&isolated)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let untouched_parts_preserved = source_entries.iter().all(|(name, data)| {
        modified_paths.contains(name)
            || isolated_entries
                .get(name)
                .is_some_and(|candidate| candidate == data)
    });
    if !untouched_parts_preserved {
        return Err("隔离 Cache 重建改写了影响清单外的部件".into());
    }
    let source_digest = format!("{:x}", md5::compute(source));
    let isolated_digest = format!("{:x}", md5::compute(&isolated));
    if source_digest == isolated_digest {
        return Err("隔离 Cache 重建未产生新的包摘要".into());
    }
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };
    Ok((
        isolated,
        WorkbookPivotCacheRebuildResult {
            pivot_name: pivot.name.clone(),
            status: "isolated_cache_rebuilt".into(),
            execution: "temporary_copy_only".into(),
            writes_user_file: false,
            source_record_count: pivot.audit.cache_record_count.unwrap_or_default(),
            rebuilt_record_count: snapshot.rows.len(),
            rebuilt_parts: vec![definition_part, records_part],
            preserved_part_count: plan.preserved_part_count + 2,
            source_package_digest: source_digest,
            isolated_package_digest: isolated_digest,
            package_valid: true,
            semantic_reparse_valid,
            untouched_parts_preserved,
            fields: field_summaries,
            gates: vec![
                gate("signature_check", "passed"),
                gate("impact_inventory", "passed"),
                gate("cache_definition_rebuild", "passed"),
                gate("cache_records_rebuild", "passed"),
                gate("package_validation", "passed"),
                gate("semantic_reparse", "passed"),
                gate("untouched_part_preservation", "passed"),
                gate("pivot_items_rebuild", "pending"),
                gate("output_cells_rebuild", "pending"),
                gate("atomic_replace", "blocked"),
                gate("excel_or_libreoffice_round_trip", "pending"),
            ],
        },
    ))
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PivotHierarchyAudit {
    field_indices: Vec<usize>,
    field_names: Vec<String>,
    detail_keys: Vec<Vec<usize>>,
    detail_item_count: usize,
    subtotal_item_count: usize,
    grand_total_item_count: usize,
    compressed_item_count: usize,
}

#[derive(Debug)]
struct PivotHierarchyItem {
    kind: String,
    repeat: usize,
    values: Vec<usize>,
}

fn parse_pivot_hierarchy_axis(
    xml: &[u8],
    fields: &[PivotCacheFieldTemplate],
    fields_element: &[u8],
    items_element: &[u8],
) -> Result<PivotHierarchyAudit, String> {
    let mut field_indices = Vec::new();
    let mut items = Vec::<PivotHierarchyItem>::new();
    let mut in_fields = false;
    let mut in_items = false;
    let mut current_item = None::<PivotHierarchyItem>;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse multi-axis Pivot hierarchy: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == fields_element => {
                in_fields = true;
            }
            Event::Start(ref event) if event.local_name().as_ref() == items_element => {
                in_items = true;
            }
            Event::Start(ref event) if in_items && event.local_name().as_ref() == b"i" => {
                if current_item.is_some() {
                    return Err("Nested Pivot hierarchy items are not supported".into());
                }
                current_item = Some(PivotHierarchyItem {
                    kind: xml_value(event, b"t", reader.decoder())?.unwrap_or_default(),
                    repeat: usize_xml_attribute(event, b"r", reader.decoder())?.unwrap_or_default(),
                    values: Vec::new(),
                });
            }
            Event::Empty(ref event) if in_fields && event.local_name().as_ref() == b"field" => {
                field_indices.push(
                    usize_xml_attribute(event, b"x", reader.decoder())?
                        .ok_or("Pivot hierarchy field is missing its cache index")?,
                );
            }
            Event::Empty(ref event) if in_items && event.local_name().as_ref() == b"x" => {
                current_item
                    .as_mut()
                    .ok_or("Pivot hierarchy value appears outside an item")?
                    .values
                    .push(usize_xml_attribute(event, b"v", reader.decoder())?.unwrap_or_default());
            }
            Event::Empty(ref event) if in_items && event.local_name().as_ref() == b"i" => {
                items.push(PivotHierarchyItem {
                    kind: xml_value(event, b"t", reader.decoder())?.unwrap_or_default(),
                    repeat: usize_xml_attribute(event, b"r", reader.decoder())?.unwrap_or_default(),
                    values: Vec::new(),
                });
            }
            Event::End(ref event) if event.local_name().as_ref() == b"i" && in_items => {
                items.push(
                    current_item
                        .take()
                        .ok_or("Pivot hierarchy item ended without a start")?,
                );
            }
            Event::End(ref event) if event.local_name().as_ref() == fields_element => {
                in_fields = false;
            }
            Event::End(ref event) if event.local_name().as_ref() == items_element => {
                in_items = false;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if field_indices.len() < 2 {
        return Err("Multi-axis hierarchy audit requires at least two fields on each axis".into());
    }
    let field_names = field_indices
        .iter()
        .map(|index| {
            fields
                .get(*index)
                .map(|field| field.name.clone())
                .ok_or("Pivot hierarchy field index exceeds the cache field inventory")
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut previous = Vec::<usize>::new();
    let mut seen_details = HashSet::<Vec<usize>>::new();
    let mut detail_keys = Vec::<Vec<usize>>::new();
    let mut detail_item_count = 0usize;
    let mut subtotal_item_count = 0usize;
    let mut grand_total_item_count = 0usize;
    let mut compressed_item_count = 0usize;
    for item in items {
        match item.kind.as_str() {
            "" => {
                if item.repeat > previous.len()
                    || item.repeat + item.values.len() != field_indices.len()
                {
                    return Err("Pivot hierarchy detail item has an invalid compressed key".into());
                }
                let mut decoded = previous[..item.repeat].to_vec();
                decoded.extend(item.values);
                for (level, shared_index) in decoded.iter().enumerate() {
                    let field = &fields[field_indices[level]];
                    if *shared_index >= field.shared_items.len() {
                        return Err("Pivot hierarchy item exceeds cache sharedItems".into());
                    }
                }
                if !seen_details.insert(decoded.clone()) {
                    return Err("Pivot hierarchy contains a duplicate detail key".into());
                }
                if item.repeat > 0 {
                    compressed_item_count += 1;
                }
                previous = decoded;
                detail_keys.push(previous.clone());
                detail_item_count += 1;
            }
            "default" => {
                if item.repeat + item.values.len() >= field_indices.len() {
                    return Err("Pivot hierarchy subtotal does not identify a parent level".into());
                }
                subtotal_item_count += 1;
            }
            "grand" => {
                if item.values.len() > 1 || item.values.iter().any(|value| *value != 0) {
                    return Err(
                        "Pivot hierarchy grand total contains a non-placeholder item value".into(),
                    );
                }
                grand_total_item_count += 1;
            }
            kind => return Err(format!("Unsupported Pivot hierarchy item type: {kind}")),
        }
    }
    if detail_item_count == 0
        || subtotal_item_count == 0
        || grand_total_item_count != 1
        || seen_details.len() != detail_item_count
    {
        return Err("Pivot hierarchy is missing detail, subtotal, or grand-total structure".into());
    }
    Ok(PivotHierarchyAudit {
        field_indices,
        field_names,
        detail_keys,
        detail_item_count,
        subtotal_item_count,
        grand_total_item_count,
        compressed_item_count,
    })
}

fn public_hierarchy_audit(value: PivotHierarchyAudit) -> WorkbookPivotAxisHierarchyAudit {
    WorkbookPivotAxisHierarchyAudit {
        field_indices: value.field_indices,
        field_names: value.field_names,
        detail_item_count: value.detail_item_count,
        subtotal_item_count: value.subtotal_item_count,
        grand_total_item_count: value.grand_total_item_count,
        compressed_item_count: value.compressed_item_count,
    }
}

#[derive(Clone, Debug)]
struct PivotMultiAxisTemplate {
    field_indices: Vec<usize>,
    detail_keys: Vec<Vec<usize>>,
}

#[derive(Clone, Debug)]
enum PivotMultiAxisOutputItem {
    Detail(Vec<usize>),
    Subtotal(Vec<usize>),
    Grand,
}

fn common_prefix_len(left: &[usize], right: &[usize]) -> usize {
    left.iter()
        .zip(right.iter())
        .take_while(|(left, right)| left == right)
        .count()
}

fn pivot_scalar_label(scalar: &PivotCacheScalar) -> String {
    match scalar.kind.as_str() {
        "m" => "(空白)".into(),
        "b" if scalar.value == "1" => "TRUE".into(),
        "b" if scalar.value == "0" => "FALSE".into(),
        _ => scalar.value.clone(),
    }
}

fn pivot_scalar_edit(
    scalar: &PivotCacheScalar,
    sheet: &str,
    row: usize,
    column: usize,
) -> WorkbookCellEdit {
    WorkbookCellEdit {
        sheet: sheet.into(),
        row,
        column,
        input: pivot_scalar_label(scalar),
        kind: if scalar.kind == "n" {
            "number".into()
        } else if scalar.kind == "b" {
            "boolean".into()
        } else if scalar.kind == "m" {
            "string".into()
        } else {
            "string".into()
        },
    }
}

fn multi_axis_key_label(
    key: &[usize],
    fields: &[PivotCacheFieldTemplate],
    field_indices: &[usize],
) -> Result<String, String> {
    let labels = key
        .iter()
        .enumerate()
        .map(|(level, shared_index)| {
            let field = fields
                .get(field_indices[level])
                .ok_or("多层轴字段索引超出 Cache 字段范围")?;
            let scalar = field
                .shared_items
                .get(*shared_index)
                .ok_or("多层轴共享项索引超出 Cache 字段范围")?;
            Ok(pivot_scalar_label(scalar))
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(labels.join(" / "))
}

fn build_multi_axis_template_from_source(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    fields: &[PivotCacheFieldTemplate],
    field_indices: &[usize],
) -> Result<PivotMultiAxisTemplate, String> {
    if field_indices.len() < 2 {
        return Err("多层轴模板至少需要两个字段".into());
    }
    let mut detail_keys = Vec::<Vec<usize>>::new();
    for record in &snapshot.rows {
        let mut key = Vec::with_capacity(field_indices.len());
        for field_index in field_indices {
            let scalar =
                pivot_cache_scalar(record.get(*field_index).ok_or("多层轴来源记录缺少字段")?)?;
            let shared_index = fields
                .get(*field_index)
                .ok_or("多层轴字段索引超出 Cache 字段范围")?
                .shared_items
                .iter()
                .position(|item| item == &scalar)
                .ok_or("多层轴来源值不在 sharedItems 中")?;
            key.push(shared_index);
        }
        if !detail_keys.contains(&key) {
            detail_keys.push(key);
        }
    }
    if detail_keys.is_empty() {
        return Err("多层轴没有可重建明细项".into());
    }
    Ok(PivotMultiAxisTemplate {
        field_indices: field_indices.to_vec(),
        detail_keys,
    })
}

fn parse_pivot_output_layout(xml: &[u8]) -> Result<PivotOutputLayout, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot 输出布局失败: {error}"))?
        {
            Event::Empty(ref event) if event.local_name().as_ref() == b"location" => {
                let reference =
                    xml_value(event, b"ref", reader.decoder())?.ok_or("Pivot 输出缺少范围")?;
                let mut parts = reference.split(':');
                let (top, left) = parse_cell_reference(parts.next().unwrap_or_default())?;
                let (bottom, right) = parse_cell_reference(parts.next().unwrap_or(&reference))?;
                if parts.next().is_some() || bottom < top || right < left {
                    return Err("Pivot 输出范围无效".into());
                }
                return Ok(PivotOutputLayout {
                    top,
                    bottom,
                    left,
                    right,
                    first_data_row: usize_xml_attribute(event, b"firstDataRow", reader.decoder())?
                        .ok_or("Pivot 输出缺少 firstDataRow")?,
                    first_data_column: usize_xml_attribute(
                        event,
                        b"firstDataCol",
                        reader.decoder(),
                    )?
                    .ok_or("Pivot 输出缺少 firstDataCol")?,
                });
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Err("Pivot 表缺少输出布局".into())
}

fn multi_axis_output_items(detail_keys: &[Vec<usize>]) -> Vec<PivotMultiAxisOutputItem> {
    let mut items = Vec::new();
    let mut current_parent: Option<Vec<usize>> = None;
    for key in detail_keys {
        let parent = key[..key.len().saturating_sub(1)].to_vec();
        if current_parent
            .as_ref()
            .is_some_and(|current| current != &parent)
        {
            items.push(PivotMultiAxisOutputItem::Subtotal(
                current_parent.take().unwrap(),
            ));
        }
        current_parent = Some(parent);
        items.push(PivotMultiAxisOutputItem::Detail(key.clone()));
    }
    if let Some(parent) = current_parent {
        items.push(PivotMultiAxisOutputItem::Subtotal(parent));
    }
    items.push(PivotMultiAxisOutputItem::Grand);
    items
}

fn write_pivot_hierarchy_x(writer: &mut Writer<Vec<u8>>, value: usize) -> Result<(), String> {
    let mut x = BytesStart::new("x");
    if value != 0 {
        let value = value.to_string();
        x.push_attribute(("v", value.as_str()));
        writer
            .write_event(Event::Empty(x))
            .map_err(|error| format!("写入多层轴项坐标失败: {error}"))
    } else {
        writer
            .write_event(Event::Empty(x))
            .map_err(|error| format!("写入多层轴项坐标失败: {error}"))
    }
}

fn write_pivot_hierarchy_items(
    writer: &mut Writer<Vec<u8>>,
    element: &str,
    template: &PivotMultiAxisTemplate,
) -> Result<(), String> {
    let items = multi_axis_output_items(&template.detail_keys);
    let count = items.len().to_string();
    let mut container = BytesStart::new(element);
    container.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(container))
        .map_err(|error| format!("写入 {element} 失败: {error}"))?;
    let mut previous = Vec::<usize>::new();
    for item in items {
        match item {
            PivotMultiAxisOutputItem::Detail(key) => {
                let repeat = common_prefix_len(&previous, &key);
                let mut start = BytesStart::new("i");
                if repeat > 0 {
                    let repeat_text = repeat.to_string();
                    start.push_attribute(("r", repeat_text.as_str()));
                    writer
                        .write_event(Event::Start(start))
                        .map_err(|error| format!("写入 {element} 压缩明细项失败: {error}"))?;
                } else {
                    writer
                        .write_event(Event::Start(start))
                        .map_err(|error| format!("写入 {element} 明细项失败: {error}"))?;
                }
                for value in key.iter().skip(repeat) {
                    write_pivot_hierarchy_x(writer, *value)?;
                }
                writer
                    .write_event(Event::End(BytesEnd::new("i")))
                    .map_err(|error| format!("结束 {element} 明细项失败: {error}"))?;
                previous = key;
            }
            PivotMultiAxisOutputItem::Subtotal(prefix) => {
                let mut start = BytesStart::new("i");
                start.push_attribute(("t", "default"));
                writer
                    .write_event(Event::Start(start))
                    .map_err(|error| format!("写入 {element} 父级小计失败: {error}"))?;
                for value in prefix {
                    write_pivot_hierarchy_x(writer, value)?;
                }
                writer
                    .write_event(Event::End(BytesEnd::new("i")))
                    .map_err(|error| format!("结束 {element} 父级小计失败: {error}"))?;
            }
            PivotMultiAxisOutputItem::Grand => {
                let mut grand = BytesStart::new("i");
                grand.push_attribute(("t", "grand"));
                writer
                    .write_event(Event::Start(grand))
                    .and_then(|_| writer.write_event(Event::Empty(BytesStart::new("x"))))
                    .and_then(|_| writer.write_event(Event::End(BytesEnd::new("i"))))
                    .map_err(|error| format!("写入 {element} 总计项失败: {error}"))?;
            }
        }
    }
    writer
        .write_event(Event::End(BytesEnd::new(element)))
        .map_err(|error| format!("结束 {element} 失败: {error}"))
}

fn write_pivot_multi_axis_fields(
    writer: &mut Writer<Vec<u8>>,
    element: &str,
    field_indices: &[usize],
) -> Result<(), String> {
    let count = field_indices.len().to_string();
    let mut fields = BytesStart::new(element);
    fields.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(fields))
        .map_err(|error| format!("写入 {element} 失败: {error}"))?;
    for field_index in field_indices {
        let value = field_index.to_string();
        let mut field = BytesStart::new("field");
        field.push_attribute(("x", value.as_str()));
        writer
            .write_event(Event::Empty(field))
            .map_err(|error| format!("写入 {element} 字段失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new(element)))
        .map_err(|error| format!("结束 {element} 失败: {error}"))
}

fn rebuild_pivot_table_multi_axis_layout(
    xml: &[u8],
    fields: &[PivotCacheFieldTemplate],
    row_axis: &PivotMultiAxisTemplate,
    column_axis: &PivotMultiAxisTemplate,
    output_layout: &PivotOutputLayout,
) -> Result<Vec<u8>, String> {
    let row_fields = row_axis
        .field_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let column_fields = column_axis
        .field_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 512));
    let mut buffer = Vec::new();
    let mut pivot_field_index = 0usize;
    let mut current_field = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析多层 Pivot Table 布局失败: {error}"))?;
        match event {
            Event::Empty(ref start) if start.local_name().as_ref() == b"location" => {
                let reference = output_layout_reference(output_layout)?;
                let updated = replace_xml_attribute(start, b"ref", &reference, false)?;
                let updated = replace_xml_attribute(
                    &updated,
                    b"firstDataRow",
                    &output_layout.first_data_row.to_string(),
                    false,
                )?;
                let updated = replace_xml_attribute(
                    &updated,
                    b"firstDataCol",
                    &output_layout.first_data_column.to_string(),
                    false,
                )?;
                writer
                    .write_event(Event::Empty(updated))
                    .map_err(|error| format!("写入多层 Pivot 输出范围失败: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"pivotField" => {
                current_field = Some(pivot_field_index);
                pivot_field_index = pivot_field_index.saturating_add(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制多层 pivotField 失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"pivotField" => {
                pivot_field_index = pivot_field_index.saturating_add(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制多层 pivotField 失败: {error}"))?;
            }
            Event::Start(ref start)
                if start.local_name().as_ref() == b"items"
                    && current_field.is_some_and(|field| {
                        row_fields.contains(&field) || column_fields.contains(&field)
                    }) =>
            {
                let field_index = current_field.expect("checked above");
                let item_count = fields
                    .get(field_index)
                    .ok_or("多层 Pivot 字段索引超出 Cache 字段范围")?
                    .shared_items
                    .len();
                write_pivot_dimension_items(
                    &mut writer,
                    &PivotAxisRebuildTemplate {
                        field_index,
                        hidden: vec![false; item_count],
                    },
                )?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"rowFields" => {
                write_pivot_multi_axis_fields(&mut writer, "rowFields", &row_axis.field_indices)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"colFields" => {
                write_pivot_multi_axis_fields(
                    &mut writer,
                    "colFields",
                    &column_axis.field_indices,
                )?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"rowItems" => {
                write_pivot_hierarchy_items(&mut writer, "rowItems", row_axis)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"colItems" => {
                write_pivot_hierarchy_items(&mut writer, "colItems", column_axis)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"pivotField" => {
                current_field = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束多层 pivotField 失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制多层 Pivot Table 布局失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn multi_axis_item_matches(key: &[usize], item: &PivotMultiAxisOutputItem) -> bool {
    match item {
        PivotMultiAxisOutputItem::Detail(candidate) => candidate == key,
        PivotMultiAxisOutputItem::Subtotal(prefix) => key.starts_with(prefix),
        PivotMultiAxisOutputItem::Grand => true,
    }
}

fn multi_axis_item_label(
    item: &PivotMultiAxisOutputItem,
    fields: &[PivotCacheFieldTemplate],
    field_indices: &[usize],
) -> Result<String, String> {
    match item {
        PivotMultiAxisOutputItem::Detail(key) => multi_axis_key_label(key, fields, field_indices),
        PivotMultiAxisOutputItem::Subtotal(prefix) => Ok(format!(
            "{} Total",
            multi_axis_key_label(prefix, fields, field_indices)?
        )),
        PivotMultiAxisOutputItem::Grand => Ok("Grand Total".into()),
    }
}

#[allow(dead_code)]
fn multi_axis_aggregate_edit(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    pivot: &WorkbookPivotTable,
    row_axis: &PivotMultiAxisTemplate,
    column_axis: &PivotMultiAxisTemplate,
    row_item: &PivotMultiAxisOutputItem,
    column_item: &PivotMultiAxisOutputItem,
    output_sheet: &str,
    row: usize,
    column: usize,
) -> Result<WorkbookCellEdit, String> {
    let data_field = pivot.audit.data_fields.first().ok_or("透视表缺少值字段")?;
    let mut accumulator = MeasureAccumulator::new(data_field);
    let mut matched = false;
    for (source_row, record) in snapshot.rows.iter().enumerate() {
        let row_key = row_axis
            .field_indices
            .iter()
            .map(|field_index| {
                let scalar = pivot_cache_scalar(
                    record.get(*field_index).ok_or("多层行轴来源记录缺少字段")?,
                )?;
                Ok(scalar)
            })
            .collect::<Result<Vec<_>, String>>()?;
        let column_key = column_axis
            .field_indices
            .iter()
            .map(|field_index| {
                let scalar = pivot_cache_scalar(
                    record.get(*field_index).ok_or("多层列轴来源记录缺少字段")?,
                )?;
                Ok(scalar)
            })
            .collect::<Result<Vec<_>, String>>()?;
        let row_indices = row_key
            .iter()
            .enumerate()
            .map(|(level, scalar)| {
                let field_index = row_axis.field_indices[level];
                fields_shared_item_index(record, field_index, scalar)
            })
            .collect::<Result<Vec<_>, String>>()?;
        let column_indices = column_key
            .iter()
            .enumerate()
            .map(|(level, scalar)| {
                let field_index = column_axis.field_indices[level];
                fields_shared_item_index(record, field_index, scalar)
            })
            .collect::<Result<Vec<_>, String>>()?;
        if multi_axis_item_matches(&row_indices, row_item)
            && multi_axis_item_matches(&column_indices, column_item)
        {
            let value = record
                .get(data_field.source_index)
                .ok_or("多层透视来源记录缺少值字段")?;
            accumulator.add(value, source_row + 1)?;
            matched = true;
        }
    }
    if matched {
        pivot_measure_edit(accumulator, output_sheet, row, column)
    } else {
        Ok(WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: String::new(),
            kind: "empty".into(),
        })
    }
}

#[allow(dead_code)]
fn fields_shared_item_index(
    _record: &[Data],
    _field_index: usize,
    _scalar: &PivotCacheScalar,
) -> Result<usize, String> {
    unreachable!("replaced by closure in build_pivot_multi_axis_output_edits")
}

fn build_pivot_multi_axis_output_edits(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    pivot: &WorkbookPivotTable,
    fields: &[PivotCacheFieldTemplate],
    row_axis: &PivotMultiAxisTemplate,
    column_axis: &PivotMultiAxisTemplate,
    layout: &PivotOutputLayout,
    output_sheet: &str,
) -> Result<(Vec<WorkbookCellEdit>, PivotOutputLayout), String> {
    let row_items = multi_axis_output_items(&row_axis.detail_keys);
    let column_items = multi_axis_output_items(&column_axis.detail_keys);
    let header_rows = column_axis.field_indices.len() + 1;
    let first_data_column = row_axis.field_indices.len();
    let data_start_row = layout.top + header_rows;
    let data_start_column = layout.left + first_data_column;
    let new_bottom = data_start_row + row_items.len() - 1;
    let new_right = data_start_column + column_items.len() - 1;
    let mut edits = Vec::new();
    for (level, field_index) in column_axis.field_indices.iter().enumerate() {
        edits.push(WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: layout.top + level,
            column: layout.left,
            input: fields
                .get(*field_index)
                .map(|field| field.name.clone())
                .unwrap_or_else(|| "Column Labels".into()),
            kind: "string".into(),
        });
        for (position, item) in column_items.iter().enumerate() {
            let column = data_start_column + position;
            let edit = match item {
                PivotMultiAxisOutputItem::Detail(key) => fields
                    .get(column_axis.field_indices[level])
                    .and_then(|field| field.shared_items.get(key[level]))
                    .map(|scalar| {
                        pivot_scalar_edit(scalar, output_sheet, layout.top + level, column)
                    })
                    .ok_or("多层列轴标签超出 Cache 字段范围")?,
                PivotMultiAxisOutputItem::Subtotal(prefix) if level + 1 == prefix.len() => {
                    WorkbookCellEdit {
                        sheet: output_sheet.into(),
                        row: layout.top + level,
                        column,
                        input: "Total".into(),
                        kind: "string".into(),
                    }
                }
                PivotMultiAxisOutputItem::Grand if level == 0 => WorkbookCellEdit {
                    sheet: output_sheet.into(),
                    row: layout.top + level,
                    column,
                    input: "Grand Total".into(),
                    kind: "string".into(),
                },
                _ => WorkbookCellEdit {
                    sheet: output_sheet.into(),
                    row: layout.top + level,
                    column,
                    input: String::new(),
                    kind: "empty".into(),
                },
            };
            edits.push(edit);
        }
    }
    for (level, field_index) in row_axis.field_indices.iter().enumerate() {
        edits.push(WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: layout.top + header_rows - 1,
            column: layout.left + level,
            input: fields
                .get(*field_index)
                .map(|field| field.name.clone())
                .unwrap_or_else(|| "Row Labels".into()),
            kind: "string".into(),
        });
    }
    for (row_position, item) in row_items.iter().enumerate() {
        let row = data_start_row + row_position;
        match item {
            PivotMultiAxisOutputItem::Detail(key) => {
                for (level, shared_index) in key.iter().enumerate() {
                    let field = fields
                        .get(row_axis.field_indices[level])
                        .ok_or("多层行轴字段索引超出 Cache 字段范围")?;
                    let scalar = field
                        .shared_items
                        .get(*shared_index)
                        .ok_or("多层行轴标签超出 Cache 字段范围")?;
                    edits.push(pivot_scalar_edit(
                        scalar,
                        output_sheet,
                        row,
                        layout.left + level,
                    ));
                }
            }
            PivotMultiAxisOutputItem::Subtotal(prefix) => {
                edits.push(WorkbookCellEdit {
                    sheet: output_sheet.into(),
                    row,
                    column: layout.left,
                    input: multi_axis_item_label(item, fields, &row_axis.field_indices)?,
                    kind: "string".into(),
                });
                for level in 1..row_axis.field_indices.len() {
                    edits.push(WorkbookCellEdit {
                        sheet: output_sheet.into(),
                        row,
                        column: layout.left + level,
                        input: String::new(),
                        kind: if level < prefix.len() {
                            "string"
                        } else {
                            "empty"
                        }
                        .into(),
                    });
                }
            }
            PivotMultiAxisOutputItem::Grand => {
                edits.push(WorkbookCellEdit {
                    sheet: output_sheet.into(),
                    row,
                    column: layout.left,
                    input: "Grand Total".into(),
                    kind: "string".into(),
                });
            }
        }
        for (column_position, column_item) in column_items.iter().enumerate() {
            let data_field = pivot.audit.data_fields.first().ok_or("透视表缺少值字段")?;
            let mut accumulator = MeasureAccumulator::new(data_field);
            let mut matched = false;
            for (source_row, record) in snapshot.rows.iter().enumerate() {
                let row_key = row_axis
                    .field_indices
                    .iter()
                    .map(|field_index| {
                        let scalar = pivot_cache_scalar(
                            record
                                .get(*field_index)
                                .ok_or_else(|| "多层行轴来源记录缺少字段".to_string())?,
                        )?;
                        fields
                            .get(*field_index)
                            .ok_or_else(|| "多层行轴字段索引超出 Cache 字段范围".to_string())?
                            .shared_items
                            .iter()
                            .position(|item| item == &scalar)
                            .ok_or_else(|| "多层行轴来源值不在 sharedItems 中".to_string())
                    })
                    .collect::<Result<Vec<_>, String>>()?;
                let column_key = column_axis
                    .field_indices
                    .iter()
                    .map(|field_index| {
                        let scalar = pivot_cache_scalar(
                            record
                                .get(*field_index)
                                .ok_or_else(|| "多层列轴来源记录缺少字段".to_string())?,
                        )?;
                        fields
                            .get(*field_index)
                            .ok_or_else(|| "多层列轴字段索引超出 Cache 字段范围".to_string())?
                            .shared_items
                            .iter()
                            .position(|item| item == &scalar)
                            .ok_or_else(|| "多层列轴来源值不在 sharedItems 中".to_string())
                    })
                    .collect::<Result<Vec<_>, String>>()?;
                if multi_axis_item_matches(&row_key, item)
                    && multi_axis_item_matches(&column_key, column_item)
                {
                    accumulator.add(
                        record
                            .get(data_field.source_index)
                            .ok_or("多层透视来源记录缺少值字段")?,
                        source_row + 1,
                    )?;
                    matched = true;
                }
            }
            edits.push(if matched {
                pivot_measure_edit(
                    accumulator,
                    output_sheet,
                    row,
                    data_start_column + column_position,
                )?
            } else {
                WorkbookCellEdit {
                    sheet: output_sheet.into(),
                    row,
                    column: data_start_column + column_position,
                    input: String::new(),
                    kind: "empty".into(),
                }
            });
        }
    }
    Ok((
        edits,
        PivotOutputLayout {
            top: layout.top,
            bottom: new_bottom,
            left: layout.left,
            right: new_right,
            first_data_row: header_rows,
            first_data_column,
        },
    ))
}

pub(crate) fn audit_workbook_pivot_multi_axis_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<(Vec<u8>, WorkbookPivotMultiAxisAuditResult), String> {
    if pivot.audit.row_field_count < 2
        || pivot.audit.column_field_count < 2
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
    {
        return Err(
            "Multi-axis prototype requires at least two row fields, two column fields, one data field, and no page fields"
                .into(),
        );
    }
    let plan = plan_workbook_pivot_rebuild(source, pivot)?;
    let pivot_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "pivot_table")
        .map(|impact| impact.part.clone())
        .ok_or("Multi-axis audit plan is missing the Pivot definition part")?;
    let output_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "output_worksheet")
        .map(|impact| impact.part.clone())
        .ok_or("Multi-axis audit plan is missing the output worksheet part")?;
    let definition_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "cache_definition")
        .map(|impact| impact.part.clone())
        .ok_or("Multi-axis audit plan is missing the cache definition part")?;
    let source_entries = load_package(source)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let fields = parse_pivot_cache_field_templates(
        source_entries
            .get(&definition_part)
            .ok_or("Multi-axis audit package is missing the cache definition")?,
    )?;
    let pivot_xml = source_entries
        .get(&pivot_part)
        .ok_or("Multi-axis audit package is missing the Pivot definition")?;
    let row_axis = parse_pivot_hierarchy_axis(pivot_xml, &fields, b"rowFields", b"rowItems")?;
    let column_axis = parse_pivot_hierarchy_axis(pivot_xml, &fields, b"colFields", b"colItems")?;
    let preview = preview_pivot(source, pivot, Vec::new())?;
    if preview.groups.is_empty()
        || preview.groups.iter().any(|group| {
            group.row_keys.len() != row_axis.field_indices.len()
                || group.column_keys.len() != column_axis.field_indices.len()
                || group.measures.len() != 1
        })
    {
        return Err("Multi-axis preview did not preserve all hierarchy levels".into());
    }

    let (cache_isolated, cache_result) = rebuild_workbook_pivot_cache_isolated(source, pivot)?;
    let mut entries = load_package(&cache_isolated)?;
    let definition_index = entries
        .iter()
        .position(|entry| entry.name == definition_part)
        .ok_or("Multi-axis isolated package is missing the cache definition")?;
    let pivot_index = entries
        .iter()
        .position(|entry| entry.name == pivot_part)
        .ok_or("Multi-axis isolated package is missing the Pivot definition")?;
    let output_index = entries
        .iter()
        .position(|entry| entry.name == output_part)
        .ok_or("Multi-axis isolated package is missing the output worksheet")?;
    let isolated_fields = parse_pivot_cache_field_templates(&entries[definition_index].data)?;
    let old_layout = parse_pivot_output_layout(&entries[pivot_index].data)?;
    let row_template = build_multi_axis_template_from_source(
        &read_pivot_source_snapshot(source, pivot)?,
        &isolated_fields,
        &row_axis.field_indices,
    )?;
    let column_template = build_multi_axis_template_from_source(
        &read_pivot_source_snapshot(source, pivot)?,
        &isolated_fields,
        &column_axis.field_indices,
    )?;
    let output_sheet = plan
        .output_sheet
        .as_deref()
        .ok_or("Multi-axis audit plan is missing the output sheet name")?;
    let snapshot = read_pivot_source_snapshot(source, pivot)?;
    let (output_edits, output_layout) = build_pivot_multi_axis_output_edits(
        &snapshot,
        pivot,
        &isolated_fields,
        &row_template,
        &column_template,
        &old_layout,
        output_sheet,
    )?;
    let mut patches = SheetPatches::new();
    for edit in &output_edits {
        patches.entry(edit.row).or_default().insert(
            edit.column,
            CellPatch {
                edit: Some(edit),
                style_id: None,
            },
        );
    }
    entries[pivot_index].data = rebuild_pivot_table_multi_axis_layout(
        &entries[pivot_index].data,
        &isolated_fields,
        &row_template,
        &column_template,
        &output_layout,
    )?;
    entries[output_index].data = patch_sheet_xml(&entries[output_index].data, &patches)?;
    let modified_paths = plan
        .affected_parts
        .iter()
        .map(|impact| impact.part.clone())
        .collect::<HashSet<_>>();
    let isolated = write_package_preserving_unchanged(source, entries, &modified_paths)?;
    validate_workbook_package(&isolated)?;
    let isolated_entries = load_package(&isolated)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let isolated_fields = parse_pivot_cache_field_templates(
        isolated_entries
            .get(&definition_part)
            .ok_or("Multi-axis isolated package is missing the cache definition")?,
    )?;
    let isolated_pivot_xml = isolated_entries
        .get(&pivot_part)
        .ok_or("Multi-axis isolated package is missing the Pivot definition")?;
    let isolated_row = parse_pivot_hierarchy_axis(
        isolated_pivot_xml,
        &isolated_fields,
        b"rowFields",
        b"rowItems",
    )?;
    let isolated_column = parse_pivot_hierarchy_axis(
        isolated_pivot_xml,
        &isolated_fields,
        b"colFields",
        b"colItems",
    )?;
    let isolated_linked = read_workbook_linked_data(&isolated)?;
    let isolated_pivot = isolated_linked
        .pivot_tables
        .iter()
        .find(|candidate| candidate.part == pivot.part)
        .ok_or("Multi-axis Pivot identity was lost in the isolated package")?;
    let isolated_preview = preview_pivot(&isolated, isolated_pivot, Vec::new())?;
    let semantic_reparse_valid = isolated_row.field_indices == row_template.field_indices
        && isolated_row.detail_keys == row_template.detail_keys
        && isolated_row.detail_item_count == row_template.detail_keys.len()
        && isolated_column.field_indices == column_template.field_indices
        && isolated_column.detail_keys == column_template.detail_keys
        && isolated_column.detail_item_count == column_template.detail_keys.len()
        && isolated_preview.groups == preview.groups
        && isolated_pivot.audit.writeback.status == "structure_candidate";
    if !semantic_reparse_valid {
        return Err("Multi-axis hierarchy or preview semantics drifted after cache rebuild".into());
    }
    let output_values_verified =
        verify_pivot_output_values(&isolated, output_sheet, &output_edits)?;
    if !output_values_verified {
        return Err("Multi-axis output values drifted after isolated rebuild".into());
    }
    let untouched_parts_preserved = source_entries.iter().all(|(name, data)| {
        modified_paths.contains(name)
            || isolated_entries
                .get(name)
                .is_some_and(|candidate| candidate == data)
    });
    if !untouched_parts_preserved {
        return Err(
            "Multi-axis isolated rebuild changed a part outside the impact inventory".into(),
        );
    }
    let pivot_definition_preserved = false;
    let output_worksheet_preserved = false;
    let isolated_package_digest = format!("{:x}", md5::compute(&isolated));
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };
    Ok((
        isolated,
        WorkbookPivotMultiAxisAuditResult {
            pivot_name: pivot.name.clone(),
            status: "multi_axis_output_rebuilt".into(),
            execution: "temporary_copy_only".into(),
            writes_user_file: false,
            source_record_count: cache_result.rebuilt_record_count,
            preview_group_count: preview.groups.len(),
            output_range: output_layout_reference(&output_layout)?,
            output_cell_count: output_edits.len(),
            row_axis: public_hierarchy_audit(row_axis),
            column_axis: public_hierarchy_audit(column_axis),
            rebuilt_parts: plan
                .affected_parts
                .iter()
                .map(|impact| impact.part.clone())
                .collect(),
            source_package_digest: cache_result.source_package_digest,
            isolated_package_digest,
            package_valid: true,
            semantic_reparse_valid,
            pivot_definition_preserved,
            output_worksheet_preserved,
            untouched_parts_preserved,
            gates: vec![
                gate("signature_check", "passed"),
                gate("multi_axis_field_inventory", "passed"),
                gate("compressed_hierarchy_decode", "passed"),
                gate("detail_subtotal_grand_total_audit", "passed"),
                gate("multi_axis_preview_semantics", "passed"),
                gate("cache_definition_rebuild", "passed"),
                gate("cache_records_rebuild", "passed"),
                gate("package_validation", "passed"),
                gate("semantic_reparse", "passed"),
                gate("pivot_definition_rebuild", "passed"),
                gate("output_worksheet_rebuild", "passed"),
                gate("multi_axis_output_rebuild", "passed"),
                gate("output_value_reparse", "passed"),
                gate("atomic_replace", "blocked"),
                gate("producer_round_trip", "pending"),
            ],
        },
    ))
}

#[derive(Clone, Debug)]
struct PivotAxisRebuildTemplate {
    field_index: usize,
    hidden: Vec<bool>,
}

#[derive(Clone, Debug)]
struct PivotOutputLayout {
    top: usize,
    bottom: usize,
    left: usize,
    right: usize,
    first_data_row: usize,
    first_data_column: usize,
}

fn parse_pivot_axis_templates(
    xml: &[u8],
    pivot: &WorkbookPivotTable,
    fields: &[PivotCacheFieldTemplate],
) -> Result<
    (
        PivotAxisRebuildTemplate,
        PivotAxisRebuildTemplate,
        PivotOutputLayout,
    ),
    String,
> {
    if pivot.audit.row_field_count != 1
        || pivot.audit.column_field_count != 1
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
    {
        return Err("隔离同步重建当前仅支持一个行字段、一个列字段、一个值字段且无页面筛选".into());
    }
    let row_field = pivot
        .audit
        .fields
        .iter()
        .find(|field| field.role == "row")
        .map(|field| field.index)
        .ok_or("透视表缺少唯一行字段")?;
    let column_field = pivot
        .audit
        .fields
        .iter()
        .find(|field| field.role == "column")
        .map(|field| field.index)
        .ok_or("透视表缺少唯一列字段")?;
    let data_field = pivot.audit.data_fields.first().ok_or("透视表缺少值字段")?;
    if !data_field.supported {
        return Err("隔离同步重建包含尚未验证的聚合方式".into());
    }

    let mut item_states = HashMap::<usize, HashMap<usize, bool>>::new();
    let mut default_items = HashMap::<usize, usize>::new();
    let mut pivot_field_index = 0usize;
    let mut current_field = None;
    let mut active_items_field = None;
    let mut layout = None;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot items 重建模板失败: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"pivotField" => {
                    current_field = Some(pivot_field_index);
                    pivot_field_index = pivot_field_index.saturating_add(1);
                }
                b"items" => active_items_field = current_field,
                b"item" => {
                    if let Some(field_index) = active_items_field {
                        for attribute in event.attributes() {
                            let attribute = attribute
                                .map_err(|error| format!("读取 Pivot item 属性失败: {error}"))?;
                            if !matches!(attribute.key.as_ref(), b"x" | b"h" | b"t") {
                                return Err(
                                    "Pivot item 包含尚未验证的扩展属性，隔离同步重建已阻断".into(),
                                );
                            }
                        }
                        if xml_value(event, b"t", reader.decoder())?.as_deref() == Some("default") {
                            *default_items.entry(field_index).or_insert(0) += 1;
                        } else {
                            let index = usize_xml_attribute(event, b"x", reader.decoder())?
                                .ok_or("Pivot item 缺少共享项索引")?;
                            let hidden = bool_attribute(event, b"h", reader.decoder(), false)?;
                            if item_states
                                .entry(field_index)
                                .or_default()
                                .insert(index, hidden)
                                .is_some()
                            {
                                return Err("Pivot item 共享项索引重复".into());
                            }
                        }
                    }
                }
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"location" => {
                    let reference =
                        xml_value(event, b"ref", reader.decoder())?.ok_or("透视输出缺少范围")?;
                    let mut parts = reference.split(':');
                    let (top, left) = parse_cell_reference(parts.next().unwrap_or_default())?;
                    let (bottom, right) = parse_cell_reference(parts.next().unwrap_or(&reference))?;
                    if parts.next().is_some() || bottom < top || right < left {
                        return Err("透视输出范围无效".into());
                    }
                    layout = Some(PivotOutputLayout {
                        top,
                        bottom,
                        left,
                        right,
                        first_data_row: usize_xml_attribute(
                            event,
                            b"firstDataRow",
                            reader.decoder(),
                        )?
                        .ok_or("透视输出缺少 firstDataRow")?,
                        first_data_column: usize_xml_attribute(
                            event,
                            b"firstDataCol",
                            reader.decoder(),
                        )?
                        .ok_or("透视输出缺少 firstDataCol")?,
                    });
                }
                b"pivotField" => pivot_field_index = pivot_field_index.saturating_add(1),
                b"items" => {}
                b"item" => {
                    if let Some(field_index) = active_items_field {
                        for attribute in event.attributes() {
                            let attribute = attribute
                                .map_err(|error| format!("读取 Pivot item 属性失败: {error}"))?;
                            if !matches!(attribute.key.as_ref(), b"x" | b"h" | b"t") {
                                return Err(
                                    "Pivot item 包含尚未验证的扩展属性，隔离同步重建已阻断".into(),
                                );
                            }
                        }
                        if xml_value(event, b"t", reader.decoder())?.as_deref() == Some("default") {
                            *default_items.entry(field_index).or_insert(0) += 1;
                        } else {
                            let index = usize_xml_attribute(event, b"x", reader.decoder())?
                                .ok_or("Pivot item 缺少共享项索引")?;
                            let hidden = bool_attribute(event, b"h", reader.decoder(), false)?;
                            if item_states
                                .entry(field_index)
                                .or_default()
                                .insert(index, hidden)
                                .is_some()
                            {
                                return Err("Pivot item 共享项索引重复".into());
                            }
                        }
                    }
                }
                _ => {}
            },
            Event::End(ref event) => match event.local_name().as_ref() {
                b"items" => active_items_field = None,
                b"pivotField" => current_field = None,
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let axis = |field_index: usize| -> Result<PivotAxisRebuildTemplate, String> {
        let field = fields
            .get(field_index)
            .ok_or("Pivot items 字段索引超出 Cache 字段范围")?;
        if field.shared_items.is_empty() {
            return Err("行列维度必须使用可验证的 sharedItems".into());
        }
        let states = item_states
            .get(&field_index)
            .ok_or("行列维度缺少 Pivot items")?;
        if states.len() != field.shared_items.len()
            || (0..field.shared_items.len()).any(|index| !states.contains_key(&index))
            || default_items.get(&field_index).copied() != Some(1)
        {
            return Err("Pivot items 与 Cache sharedItems 未形成完整一一映射".into());
        }
        Ok(PivotAxisRebuildTemplate {
            field_index,
            hidden: (0..field.shared_items.len())
                .map(|index| states[&index])
                .collect(),
        })
    };
    let layout = layout.ok_or("透视表缺少输出布局")?;
    if layout.first_data_row != 2 || layout.first_data_column != 1 {
        return Err("隔离同步重建当前只验证标准紧凑单值布局".into());
    }
    Ok((axis(row_field)?, axis(column_field)?, layout))
}

fn skip_xml_element(reader: &mut Reader<&[u8]>, buffer: &mut Vec<u8>) -> Result<(), String> {
    let mut depth = 1usize;
    buffer.clear();
    while depth > 0 {
        match reader
            .read_event_into(buffer)
            .map_err(|error| format!("跳过原 Pivot 布局节点失败: {error}"))?
        {
            Event::Start(_) => depth = depth.saturating_add(1),
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::Eof => return Err("Pivot 布局 XML 意外结束".into()),
            _ => {}
        }
        buffer.clear();
    }
    Ok(())
}

fn write_pivot_dimension_items(
    writer: &mut Writer<Vec<u8>>,
    template: &PivotAxisRebuildTemplate,
) -> Result<(), String> {
    let count = (template.hidden.len() + 1).to_string();
    let mut items = BytesStart::new("items");
    items.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(items))
        .map_err(|error| format!("写入 Pivot items 失败: {error}"))?;
    for (index, hidden) in template.hidden.iter().enumerate() {
        let index = index.to_string();
        let mut item = BytesStart::new("item");
        item.push_attribute(("x", index.as_str()));
        if *hidden {
            item.push_attribute(("h", "1"));
        }
        writer
            .write_event(Event::Empty(item))
            .map_err(|error| format!("写入 Pivot item 失败: {error}"))?;
    }
    let mut default_item = BytesStart::new("item");
    default_item.push_attribute(("t", "default"));
    writer
        .write_event(Event::Empty(default_item))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new("items"))))
        .map_err(|error| format!("结束 Pivot items 失败: {error}"))
}

fn write_pivot_axis_items(
    writer: &mut Writer<Vec<u8>>,
    element: &str,
    visible: &[usize],
) -> Result<(), String> {
    let count = (visible.len() + 1).to_string();
    let mut items = BytesStart::new(element);
    items.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(items))
        .map_err(|error| format!("写入 {element} 失败: {error}"))?;
    for index in visible {
        writer
            .write_event(Event::Start(BytesStart::new("i")))
            .map_err(|error| format!("写入 {element} 项失败: {error}"))?;
        let index = index.to_string();
        let mut value = BytesStart::new("x");
        value.push_attribute(("v", index.as_str()));
        writer
            .write_event(Event::Empty(value))
            .and_then(|_| writer.write_event(Event::End(BytesEnd::new("i"))))
            .map_err(|error| format!("结束 {element} 项失败: {error}"))?;
    }
    let mut grand = BytesStart::new("i");
    grand.push_attribute(("t", "grand"));
    writer
        .write_event(Event::Start(grand))
        .and_then(|_| writer.write_event(Event::Empty(BytesStart::new("x"))))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new("i"))))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new(element))))
        .map_err(|error| format!("结束 {element} 失败: {error}"))
}

fn rebuild_pivot_table_layout(
    xml: &[u8],
    row_axis: &PivotAxisRebuildTemplate,
    column_axis: &PivotAxisRebuildTemplate,
    output_layout: Option<&PivotOutputLayout>,
) -> Result<Vec<u8>, String> {
    let row_visible = row_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    let column_visible = column_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut pivot_field_index = 0usize;
    let mut current_field = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Table 重建布局失败: {error}"))?;
        match event {
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"location" && output_layout.is_some() =>
            {
                let layout = output_layout.unwrap();
                let reference = format!(
                    "{}:{}",
                    cell_reference(layout.top, layout.left)?,
                    cell_reference(layout.bottom, layout.right)?
                );
                let updated = replace_xml_attribute(start, b"ref", &reference, false)?;
                writer
                    .write_event(Event::Empty(updated))
                    .map_err(|error| format!("写入 Pivot 输出范围失败: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"pivotField" => {
                current_field = Some(pivot_field_index);
                pivot_field_index = pivot_field_index.saturating_add(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制 pivotField 失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"pivotField" => {
                pivot_field_index = pivot_field_index.saturating_add(1);
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制 pivotField 失败: {error}"))?;
            }
            Event::Start(ref start)
                if start.local_name().as_ref() == b"items"
                    && current_field == Some(row_axis.field_index) =>
            {
                write_pivot_dimension_items(&mut writer, row_axis)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start)
                if start.local_name().as_ref() == b"items"
                    && current_field == Some(column_axis.field_index) =>
            {
                write_pivot_dimension_items(&mut writer, column_axis)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"items"
                    && current_field == Some(row_axis.field_index) =>
            {
                write_pivot_dimension_items(&mut writer, row_axis)?;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"items"
                    && current_field == Some(column_axis.field_index) =>
            {
                write_pivot_dimension_items(&mut writer, column_axis)?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"rowItems" => {
                write_pivot_axis_items(&mut writer, "rowItems", &row_visible)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"colItems" => {
                write_pivot_axis_items(&mut writer, "colItems", &column_visible)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"rowItems" => {
                write_pivot_axis_items(&mut writer, "rowItems", &row_visible)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"colItems" => {
                write_pivot_axis_items(&mut writer, "colItems", &column_visible)?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"pivotField" => {
                current_field = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束 pivotField 失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制 Pivot Table 布局失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn pivot_axis_edit(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    field_index: usize,
    scalar: &PivotCacheScalar,
    row: usize,
    column: usize,
    sheet: &str,
) -> Result<WorkbookCellEdit, String> {
    let value = snapshot
        .rows
        .iter()
        .filter_map(|record| record.get(field_index))
        .find(|value| pivot_cache_scalar(value).ok().as_ref() == Some(scalar))
        .ok_or("无法从来源记录恢复 Pivot 轴标签")?;
    let (kind, input) = match value {
        Data::String(value) => ("string", value.clone()),
        Data::Int(value) => ("number", value.to_string()),
        Data::Float(value) => ("number", pivot_cache_number(*value)?),
        Data::Bool(value) => ("boolean", value.to_string()),
        Data::DateTime(value) => ("number", pivot_cache_number(value.as_f64())?),
        Data::DateTimeIso(value) => ("string", value.clone()),
        Data::Empty => ("string", "(空白)".into()),
        Data::Error(_) | Data::DurationIso(_) => {
            return Err("隔离同步重建暂不支持该轴标签类型".into())
        }
    };
    Ok(WorkbookCellEdit {
        sheet: sheet.into(),
        row,
        column,
        input,
        kind: kind.into(),
    })
}

fn pivot_measure_edit(
    accumulator: MeasureAccumulator,
    output_sheet: &str,
    row: usize,
    column: usize,
) -> Result<WorkbookCellEdit, String> {
    let measure = accumulator.finish();
    Ok(match measure.value {
        Some(value) => WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: pivot_cache_number(value)?,
            kind: "number".into(),
        },
        None => WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: String::new(),
            kind: "empty".into(),
        },
    })
}

fn build_pivot_output_edits(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    pivot: &WorkbookPivotTable,
    fields: &[PivotCacheFieldTemplate],
    row_axis: &PivotAxisRebuildTemplate,
    column_axis: &PivotAxisRebuildTemplate,
    layout: &PivotOutputLayout,
    output_sheet: &str,
    allow_resize: bool,
) -> Result<(Vec<WorkbookCellEdit>, PivotOutputLayout), String> {
    let row_visible = row_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    let column_visible = column_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    if row_visible.is_empty() || column_visible.is_empty() {
        return Err("隔离同步重建要求至少一个可见行项和列项".into());
    }
    let data_start_row = layout
        .top
        .checked_add(layout.first_data_row)
        .ok_or("透视输出行坐标溢出")?;
    let data_start_column = layout
        .left
        .checked_add(layout.first_data_column)
        .ok_or("透视输出列坐标溢出")?;
    let new_bottom = data_start_row + row_visible.len();
    let new_right = data_start_column + column_visible.len();
    if !allow_resize && (layout.bottom != new_bottom || layout.right != new_right) {
        return Err("透视输出声明范围与可见行列项数量不一致".into());
    }
    let data_field = pivot.audit.data_fields.first().ok_or("透视表缺少值字段")?;
    let mut values = (0..row_visible.len())
        .map(|_| {
            (0..column_visible.len())
                .map(|_| MeasureAccumulator::new(data_field))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let mut row_totals = (0..row_visible.len())
        .map(|_| MeasureAccumulator::new(data_field))
        .collect::<Vec<_>>();
    let mut column_totals = (0..column_visible.len())
        .map(|_| MeasureAccumulator::new(data_field))
        .collect::<Vec<_>>();
    let mut grand_total = MeasureAccumulator::new(data_field);
    let row_positions = row_visible
        .iter()
        .enumerate()
        .map(|(position, index)| (*index, position))
        .collect::<HashMap<_, _>>();
    let column_positions = column_visible
        .iter()
        .enumerate()
        .map(|(position, index)| (*index, position))
        .collect::<HashMap<_, _>>();
    for (source_row, record) in snapshot.rows.iter().enumerate() {
        let row_scalar = pivot_cache_scalar(
            record
                .get(row_axis.field_index)
                .ok_or("透视来源记录缺少行字段")?,
        )?;
        let column_scalar = pivot_cache_scalar(
            record
                .get(column_axis.field_index)
                .ok_or("透视来源记录缺少列字段")?,
        )?;
        let row_index = fields[row_axis.field_index]
            .shared_items
            .iter()
            .position(|item| item == &row_scalar)
            .ok_or("行字段来源值不在 sharedItems 中")?;
        let column_index = fields[column_axis.field_index]
            .shared_items
            .iter()
            .position(|item| item == &column_scalar)
            .ok_or("列字段来源值不在 sharedItems 中")?;
        let (Some(row_position), Some(column_position)) = (
            row_positions.get(&row_index),
            column_positions.get(&column_index),
        ) else {
            continue;
        };
        let value = record
            .get(data_field.source_index)
            .ok_or("透视来源记录缺少值字段")?;
        values[*row_position][*column_position].add(value, source_row + 1)?;
        row_totals[*row_position].add(value, source_row + 1)?;
        column_totals[*column_position].add(value, source_row + 1)?;
        grand_total.add(value, source_row + 1)?;
    }

    let mut edits = Vec::new();
    for (position, index) in column_visible.iter().enumerate() {
        edits.push(pivot_axis_edit(
            snapshot,
            column_axis.field_index,
            &fields[column_axis.field_index].shared_items[*index],
            data_start_row - 1,
            data_start_column + position,
            output_sheet,
        )?);
    }
    for (position, index) in row_visible.iter().enumerate() {
        edits.push(pivot_axis_edit(
            snapshot,
            row_axis.field_index,
            &fields[row_axis.field_index].shared_items[*index],
            data_start_row + position,
            layout.left,
            output_sheet,
        )?);
    }
    for (row, values) in values.iter().enumerate() {
        for (column, value) in values.iter().cloned().enumerate() {
            edits.push(pivot_measure_edit(
                value,
                output_sheet,
                data_start_row + row,
                data_start_column + column,
            )?);
        }
        edits.push(pivot_measure_edit(
            row_totals[row].clone(),
            output_sheet,
            data_start_row + row,
            new_right,
        )?);
    }
    for (column, value) in column_totals.into_iter().enumerate() {
        edits.push(pivot_measure_edit(
            value,
            output_sheet,
            new_bottom,
            data_start_column + column,
        )?);
    }
    edits.push(pivot_measure_edit(
        grand_total,
        output_sheet,
        new_bottom,
        new_right,
    )?);
    Ok((
        edits,
        PivotOutputLayout {
            top: layout.top,
            bottom: new_bottom,
            left: layout.left,
            right: new_right,
            first_data_row: layout.first_data_row,
            first_data_column: layout.first_data_column,
        },
    ))
}

fn verify_pivot_output_values(
    source: &[u8],
    output_sheet: &str,
    edits: &[WorkbookCellEdit],
) -> Result<bool, String> {
    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(source))
        .map_err(|error| format!("复读隔离透视输出失败: {error}"))?;
    let values = workbook
        .worksheet_range(output_sheet)
        .map_err(|error| format!("读取隔离透视输出工作表失败: {error}"))?;
    for edit in edits {
        let actual = values
            .get_value((edit.row as u32, edit.column as u32))
            .cloned()
            .unwrap_or(Data::Empty);
        let matches = match edit.kind.as_str() {
            "string" => matches!(actual, Data::String(ref value) if value == &edit.input),
            "boolean" => {
                matches!(actual, Data::Bool(value) if value == edit.input.eq_ignore_ascii_case("true"))
            }
            "number" => {
                let expected = edit
                    .input
                    .parse::<f64>()
                    .map_err(|_| "隔离透视输出验证数字无效")?;
                let actual = match actual {
                    Data::Int(value) => Some(value as f64),
                    Data::Float(value) => Some(value),
                    Data::DateTime(value) => Some(value.as_f64()),
                    _ => None,
                };
                actual.is_some_and(|actual| (actual - expected).abs() <= 1e-9)
            }
            "empty" => matches!(actual, Data::Empty),
            _ => false,
        };
        if !matches {
            return Err(format!(
                "Pivot output mismatch at R{}C{}: expected {} {:?}, got {:?}",
                edit.row, edit.column, edit.kind, edit.input, actual
            ));
        }
    }
    Ok(true)
}

pub(crate) fn rebuild_workbook_pivot_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<(Vec<u8>, WorkbookPivotSynchronizedRebuildResult), String> {
    let plan = plan_workbook_pivot_rebuild(source, pivot)?;
    let (cache_isolated, cache_result) = rebuild_workbook_pivot_cache_isolated(source, pivot)?;
    let pivot_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "pivot_table")
        .map(|impact| impact.part.clone())
        .ok_or("隔离计划缺少 Pivot Table 部件")?;
    let output_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "output_worksheet")
        .map(|impact| impact.part.clone())
        .ok_or("隔离计划缺少输出工作表部件")?;
    let output_sheet = plan
        .output_sheet
        .as_deref()
        .ok_or("隔离计划缺少输出工作表")?;
    let definition_part = plan
        .affected_parts
        .iter()
        .find(|impact| impact.role == "cache_definition")
        .map(|impact| impact.part.clone())
        .ok_or("隔离计划缺少 Cache Definition 部件")?;
    let snapshot = read_pivot_source_snapshot(source, pivot)?;
    let mut entries = load_package(&cache_isolated)?;
    let definition_index = entries
        .iter()
        .position(|entry| entry.name == definition_part)
        .ok_or("隔离包缺少 Cache Definition 部件")?;
    let pivot_index = entries
        .iter()
        .position(|entry| entry.name == pivot_part)
        .ok_or("隔离包缺少 Pivot Table 部件")?;
    let output_index = entries
        .iter()
        .position(|entry| entry.name == output_part)
        .ok_or("隔离包缺少输出工作表部件")?;
    let fields = parse_pivot_cache_field_templates(&entries[definition_index].data)?;
    let (row_axis, column_axis, layout) =
        parse_pivot_axis_templates(&entries[pivot_index].data, pivot, &fields)?;
    let (output_edits, rebuilt_layout) = build_pivot_output_edits(
        &snapshot,
        pivot,
        &fields,
        &row_axis,
        &column_axis,
        &layout,
        output_sheet,
        false,
    )?;
    let mut patches = SheetPatches::new();
    for edit in &output_edits {
        patches.entry(edit.row).or_default().insert(
            edit.column,
            CellPatch {
                edit: Some(edit),
                style_id: None,
            },
        );
    }
    entries[pivot_index].data = rebuild_pivot_table_layout(
        &entries[pivot_index].data,
        &row_axis,
        &column_axis,
        Some(&rebuilt_layout),
    )?;
    entries[output_index].data = patch_sheet_xml(&entries[output_index].data, &patches)?;
    let modified_paths = plan
        .affected_parts
        .iter()
        .map(|impact| impact.part.clone())
        .collect::<HashSet<_>>();
    let isolated = write_package_preserving_unchanged(source, entries, &modified_paths)?;
    validate_workbook_package(&isolated)?;
    let linked = read_workbook_linked_data(&isolated)?;
    let rebuilt = linked
        .pivot_tables
        .iter()
        .find(|candidate| candidate.part == pivot.part)
        .ok_or("同步重建后透视表身份丢失")?;
    let semantic_reparse_valid = rebuilt.audit.cache_record_count == Some(snapshot.rows.len())
        && rebuilt.audit.writeback.status == "structure_candidate";
    if !semantic_reparse_valid {
        return Err("隔离同步重建后的语义复读未通过".into());
    }
    let output_values_verified =
        verify_pivot_output_values(&isolated, output_sheet, &output_edits)?;
    if !output_values_verified {
        return Err("隔离同步重建后的输出值复读未通过".into());
    }
    let source_entries = load_package(source)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let isolated_entries = load_package(&isolated)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let untouched_parts_preserved = source_entries.iter().all(|(name, data)| {
        modified_paths.contains(name)
            || isolated_entries
                .get(name)
                .is_some_and(|candidate| candidate == data)
    });
    if !untouched_parts_preserved {
        return Err("隔离同步重建改写了四类影响清单外的部件".into());
    }
    let source_digest = format!("{:x}", md5::compute(source));
    let isolated_digest = format!("{:x}", md5::compute(&isolated));
    if source_digest == isolated_digest {
        return Err("隔离同步重建未产生新的包摘要".into());
    }
    let visible_row_item_count = row_axis.hidden.iter().filter(|hidden| !**hidden).count();
    let visible_column_item_count = column_axis.hidden.iter().filter(|hidden| !**hidden).count();
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };
    Ok((
        isolated,
        WorkbookPivotSynchronizedRebuildResult {
            pivot_name: pivot.name.clone(),
            status: "isolated_pivot_rebuilt".into(),
            execution: "temporary_copy_only".into(),
            writes_user_file: false,
            source_record_count: cache_result.source_record_count,
            rebuilt_record_count: cache_result.rebuilt_record_count,
            visible_row_item_count,
            visible_column_item_count,
            output_cell_count: output_edits.len(),
            rebuilt_parts: plan
                .affected_parts
                .iter()
                .map(|impact| impact.part.clone())
                .collect(),
            preserved_part_count: plan.preserved_part_count,
            source_package_digest: source_digest,
            isolated_package_digest: isolated_digest,
            package_valid: true,
            semantic_reparse_valid,
            output_values_verified,
            untouched_parts_preserved,
            fields: cache_result.fields,
            gates: vec![
                gate("signature_check", "passed"),
                gate("impact_inventory", "passed"),
                gate("cache_definition_rebuild", "passed"),
                gate("cache_records_rebuild", "passed"),
                gate("pivot_items_rebuild", "passed"),
                gate("row_items_rebuild", "passed"),
                gate("column_items_rebuild", "passed"),
                gate("output_cells_rebuild", "passed"),
                gate("package_validation", "passed"),
                gate("semantic_reparse", "passed"),
                gate("output_value_reparse", "passed"),
                gate("untouched_part_preservation", "passed"),
                gate("atomic_replace", "blocked"),
                gate("excel_or_libreoffice_round_trip", "pending"),
            ],
        },
    ))
}

fn reconcile_pivot_axis_shared_items(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    fields: &mut [PivotCacheFieldTemplate],
    axis: &mut PivotAxisRebuildTemplate,
) -> Result<(usize, usize), String> {
    let field = fields
        .get_mut(axis.field_index)
        .ok_or("Pivot 轴字段索引超出 Cache 字段范围")?;
    let mut source_items = Vec::<PivotCacheScalar>::new();
    for record in &snapshot.rows {
        let scalar = pivot_cache_scalar(
            record
                .get(axis.field_index)
                .ok_or("透视来源记录缺少轴字段")?,
        )?;
        if !source_items.contains(&scalar) {
            source_items.push(scalar);
        }
    }
    if source_items.is_empty() {
        return Err("透视轴字段没有可重建项".into());
    }
    let existing_kind = field
        .shared_items
        .iter()
        .find(|item| item.kind != "m")
        .map(|item| item.kind.as_str());
    if let Some(existing_kind) = existing_kind {
        if source_items
            .iter()
            .any(|item| item.kind != "m" && item.kind != existing_kind)
        {
            return Err("新增 Pivot sharedItem 与原字段类型不一致".into());
        }
    }
    let old_items = field.shared_items.clone();
    let old_hidden = axis.hidden.clone();
    let mut reconciled = old_items
        .iter()
        .filter(|item| source_items.contains(item))
        .cloned()
        .collect::<Vec<_>>();
    let removed = old_items.len().saturating_sub(reconciled.len());
    let mut added = 0usize;
    for item in source_items {
        if !reconciled.contains(&item) {
            reconciled.push(item);
            added = added.saturating_add(1);
        }
    }
    axis.hidden = reconciled
        .iter()
        .map(|item| {
            old_items
                .iter()
                .position(|old| old == item)
                .and_then(|index| old_hidden.get(index).copied())
                .unwrap_or(false)
        })
        .collect();
    field.shared_items = reconciled;
    Ok((added, removed))
}

fn output_layout_reference(layout: &PivotOutputLayout) -> Result<String, String> {
    Ok(format!(
        "{}:{}",
        cell_reference(layout.top, layout.left)?,
        cell_reference(layout.bottom, layout.right)?
    ))
}

fn read_pivot_output_labels(
    source: &[u8],
    output_sheet: &str,
    layout: &PivotOutputLayout,
    fallback_row_header: &str,
) -> Result<(String, String, String), String> {
    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(source))
        .map_err(|error| format!("读取原透视输出标签失败: {error}"))?;
    let values = workbook
        .worksheet_range(output_sheet)
        .map_err(|error| format!("读取原透视输出工作表失败: {error}"))?;
    let header_row = layout.top + layout.first_data_row - 1;
    let text_at = |row: usize, column: usize, fallback: &str| {
        values
            .get_value((row as u32, column as u32))
            .filter(|value| !matches!(value, Data::Empty))
            .map(ToString::to_string)
            .unwrap_or_else(|| fallback.into())
    };
    Ok((
        text_at(header_row, layout.left, fallback_row_header),
        text_at(header_row, layout.right, "Grand Total"),
        text_at(layout.bottom, layout.left, "Grand Total"),
    ))
}

pub(crate) fn rebuild_workbook_pivot_expanded_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<(Vec<u8>, WorkbookPivotExpandedRebuildResult), String> {
    let plan = plan_workbook_pivot_rebuild(source, pivot)?;
    if plan.status != "isolated_dry_run_ready" {
        return Err(format!(
            "透视表未通过隔离扩缩容计划：{}",
            plan.blockers.join("；")
        ));
    }
    let part_for = |role: &str| {
        plan.affected_parts
            .iter()
            .find(|impact| impact.role == role)
            .map(|impact| impact.part.clone())
            .ok_or_else(|| format!("隔离计划缺少 {role} 部件"))
    };
    let definition_part = part_for("cache_definition")?;
    let records_part = part_for("cache_records")?;
    let pivot_part = part_for("pivot_table")?;
    let output_part = part_for("output_worksheet")?;
    let output_sheet = plan
        .output_sheet
        .as_deref()
        .ok_or("隔离计划缺少输出工作表")?;
    let snapshot = read_pivot_source_snapshot(source, pivot)?;
    let mut entries = load_package(source)?;
    let definition_index = entries
        .iter()
        .position(|entry| entry.name == definition_part)
        .ok_or("源包缺少 Cache Definition 部件")?;
    let records_index = entries
        .iter()
        .position(|entry| entry.name == records_part)
        .ok_or("源包缺少 Cache Records 部件")?;
    let pivot_index = entries
        .iter()
        .position(|entry| entry.name == pivot_part)
        .ok_or("源包缺少 Pivot Table 部件")?;
    let output_index = entries
        .iter()
        .position(|entry| entry.name == output_part)
        .ok_or("源包缺少输出工作表部件")?;
    let mut fields = parse_pivot_cache_field_templates(&entries[definition_index].data)?;
    if fields.len() != snapshot.headers.len()
        || fields
            .iter()
            .zip(snapshot.headers.iter())
            .any(|(field, header)| field.name.trim() != header.trim())
    {
        return Err("来源表头与 Cache Definition 字段模板不一致".into());
    }
    let (mut row_axis, mut column_axis, old_layout) =
        parse_pivot_axis_templates(&entries[pivot_index].data, pivot, &fields)?;
    let (row_added, row_removed) =
        reconcile_pivot_axis_shared_items(&snapshot, &mut fields, &mut row_axis)?;
    let (column_added, column_removed) =
        reconcile_pivot_axis_shared_items(&snapshot, &mut fields, &mut column_axis)?;
    let added_shared_item_count = row_added.saturating_add(column_added);
    let removed_shared_item_count = row_removed.saturating_add(column_removed);

    let (records_xml, field_summaries) = rebuild_pivot_cache_records(&snapshot.rows, &fields)?;
    let definition_xml = rebuild_pivot_cache_definition(
        &entries[definition_index].data,
        snapshot.rows.len(),
        &fields,
        &snapshot.rows,
        true,
    )?;
    let (mut output_edits, new_layout) = build_pivot_output_edits(
        &snapshot,
        pivot,
        &fields,
        &row_axis,
        &column_axis,
        &old_layout,
        output_sheet,
        true,
    )?;
    let row_field_name = fields
        .get(row_axis.field_index)
        .map(|field| field.name.as_str())
        .unwrap_or("Row Labels");
    let (row_header, grand_header, grand_row) =
        read_pivot_output_labels(source, output_sheet, &old_layout, row_field_name)?;
    let new_header_row = new_layout.top + new_layout.first_data_row - 1;
    output_edits.extend([
        WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: new_header_row,
            column: new_layout.left,
            input: row_header,
            kind: "string".into(),
        },
        WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: new_header_row,
            column: new_layout.right,
            input: grand_header,
            kind: "string".into(),
        },
        WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: new_layout.bottom,
            column: new_layout.left,
            input: grand_row,
            kind: "string".into(),
        },
    ]);
    let desired_coordinates = output_edits
        .iter()
        .map(|edit| (edit.row, edit.column))
        .collect::<HashSet<_>>();
    let old_header_row = old_layout.top + old_layout.first_data_row - 1;
    let stale_coordinates = (old_header_row..=old_layout.bottom)
        .flat_map(|row| (old_layout.left..=old_layout.right).map(move |column| (row, column)))
        .filter(|coordinate| !desired_coordinates.contains(coordinate))
        .collect::<Vec<_>>();
    let cleared_stale_cell_count = stale_coordinates.len();
    let mut edit_map = BTreeMap::<(usize, usize), WorkbookCellEdit>::new();
    for (row, column) in stale_coordinates {
        edit_map.insert(
            (row, column),
            WorkbookCellEdit {
                sheet: output_sheet.into(),
                row,
                column,
                input: String::new(),
                kind: "empty".into(),
            },
        );
    }
    for edit in output_edits {
        edit_map.insert((edit.row, edit.column), edit);
    }
    let all_edits = edit_map.into_values().collect::<Vec<_>>();

    let (_, old_styles) = read_sheet_formulas_and_style_ids(
        &entries[output_index].data,
        old_header_row,
        old_layout.bottom + 1,
        old_layout.right + 1,
    )?;
    let data_start_row = old_layout.top + old_layout.first_data_row;
    let data_start_column = old_layout.left + old_layout.first_data_column;
    let header_style = old_styles
        .get(&(old_header_row, data_start_column))
        .copied();
    let header_total_style = old_styles
        .get(&(old_header_row, old_layout.right))
        .copied()
        .or(header_style);
    let row_label_style = old_styles.get(&(data_start_row, old_layout.left)).copied();
    let grand_label_style = old_styles
        .get(&(old_layout.bottom, old_layout.left))
        .copied()
        .or(row_label_style);
    let value_style = old_styles
        .get(&(data_start_row, data_start_column))
        .copied();
    let style_for = |edit: &WorkbookCellEdit| {
        if edit.kind == "empty" {
            None
        } else if edit.row == new_header_row {
            if edit.column == new_layout.right {
                header_total_style
            } else {
                header_style
            }
        } else if edit.column == new_layout.left {
            if edit.row == new_layout.bottom {
                grand_label_style
            } else {
                row_label_style
            }
        } else {
            value_style
        }
    };
    let extended_style_cell_count = all_edits
        .iter()
        .filter(|edit| {
            (edit.row > old_layout.bottom || edit.column > old_layout.right)
                && style_for(edit).is_some()
        })
        .count();
    let mut patches = SheetPatches::new();
    for edit in &all_edits {
        patches.entry(edit.row).or_default().insert(
            edit.column,
            CellPatch {
                edit: Some(edit),
                style_id: style_for(edit),
            },
        );
    }
    entries[definition_index].data = definition_xml;
    entries[records_index].data = records_xml;
    entries[pivot_index].data = rebuild_pivot_table_layout(
        &entries[pivot_index].data,
        &row_axis,
        &column_axis,
        Some(&new_layout),
    )?;
    entries[output_index].data = patch_sheet_xml(&entries[output_index].data, &patches)?;
    let modified_paths = plan
        .affected_parts
        .iter()
        .map(|impact| impact.part.clone())
        .collect::<HashSet<_>>();
    let isolated = write_package_preserving_unchanged(source, entries, &modified_paths)?;
    validate_workbook_package(&isolated)?;
    let linked = read_workbook_linked_data(&isolated)?;
    let rebuilt = linked
        .pivot_tables
        .iter()
        .find(|candidate| candidate.part == pivot.part)
        .ok_or("扩缩容重建后透视表身份丢失")?;
    let new_output_range = output_layout_reference(&new_layout)?;
    let semantic_reparse_valid = rebuilt.audit.cache_record_count == Some(snapshot.rows.len())
        && rebuilt.audit.layout_range.as_deref() == Some(new_output_range.as_str())
        && rebuilt.audit.writeback.status == "structure_candidate";
    if !semantic_reparse_valid {
        return Err("隔离扩缩容重建后的语义复读未通过".into());
    }
    let output_values_verified = verify_pivot_output_values(&isolated, output_sheet, &all_edits)?;
    if !output_values_verified {
        return Err("隔离扩缩容重建后的输出值或旧区域清理复读未通过".into());
    }
    let source_entries = load_package(source)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let isolated_entries = load_package(&isolated)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let untouched_parts_preserved = source_entries.iter().all(|(name, data)| {
        modified_paths.contains(name)
            || isolated_entries
                .get(name)
                .is_some_and(|candidate| candidate == data)
    });
    if !untouched_parts_preserved {
        return Err("隔离扩缩容重建改写了四类影响清单外的部件".into());
    }
    let source_digest = format!("{:x}", md5::compute(source));
    let isolated_digest = format!("{:x}", md5::compute(&isolated));
    if source_digest == isolated_digest {
        return Err("隔离扩缩容重建未产生新的包摘要".into());
    }
    let visible_row_item_count = row_axis.hidden.iter().filter(|hidden| !**hidden).count();
    let visible_column_item_count = column_axis.hidden.iter().filter(|hidden| !**hidden).count();
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };
    Ok((
        isolated,
        WorkbookPivotExpandedRebuildResult {
            pivot_name: pivot.name.clone(),
            status: "isolated_layout_resized".into(),
            execution: "temporary_copy_only".into(),
            writes_user_file: false,
            rebuilt_record_count: snapshot.rows.len(),
            added_shared_item_count,
            removed_shared_item_count,
            visible_row_item_count,
            visible_column_item_count,
            old_output_range: output_layout_reference(&old_layout)?,
            new_output_range,
            output_cell_count: desired_coordinates.len(),
            cleared_stale_cell_count,
            extended_style_cell_count,
            rebuilt_parts: plan
                .affected_parts
                .iter()
                .map(|impact| impact.part.clone())
                .collect(),
            preserved_part_count: plan.preserved_part_count,
            source_package_digest: source_digest,
            isolated_package_digest: isolated_digest,
            package_valid: true,
            semantic_reparse_valid,
            output_values_verified,
            untouched_parts_preserved,
            fields: field_summaries,
            gates: vec![
                gate("signature_check", "passed"),
                gate("impact_inventory", "passed"),
                gate("shared_items_reconcile", "passed"),
                gate("cache_definition_rebuild", "passed"),
                gate("cache_records_rebuild", "passed"),
                gate("pivot_items_rebuild", "passed"),
                gate("axis_items_rebuild", "passed"),
                gate("location_resize", "passed"),
                gate("stale_output_cleanup", "passed"),
                gate("style_extension", "passed"),
                gate("output_cells_rebuild", "passed"),
                gate("package_validation", "passed"),
                gate("semantic_reparse", "passed"),
                gate("output_value_reparse", "passed"),
                gate("untouched_part_preservation", "passed"),
                gate("atomic_replace", "blocked"),
                gate("excel_or_libreoffice_round_trip", "pending"),
            ],
        },
    ))
}

fn pivot_layout_variant(
    pivot: &WorkbookPivotTable,
    row_field_count: usize,
    column_field_count: usize,
    aggregations: &[&str],
) -> Result<WorkbookPivotTable, String> {
    let mut variant = pivot.clone();
    for field in &mut variant.audit.fields {
        if field.role == "row" && row_field_count == 0 {
            field.role = "unused".into();
        }
        if field.role == "column" && column_field_count == 0 {
            field.role = "unused".into();
        }
    }
    variant.audit.row_field_count = row_field_count;
    variant.audit.column_field_count = column_field_count;
    let template = variant
        .audit
        .data_fields
        .first()
        .cloned()
        .ok_or("布局变体缺少值字段模板")?;
    let count_source = variant
        .audit
        .fields
        .iter()
        .find(|field| field.role == "row")
        .map(|field| (field.index, field.name.clone()));
    variant.audit.data_fields = aggregations
        .iter()
        .map(|aggregation| {
            let mut field = template.clone();
            field.aggregation = (*aggregation).into();
            if aggregations.len() > 1 && *aggregation == "count" {
                if let Some((source_index, source_name)) = &count_source {
                    field.source_index = *source_index;
                    field.name = format!("{source_name} ({aggregation})");
                }
            } else {
                field.name = format!("{} ({aggregation})", template.name);
            }
            field
        })
        .collect();
    variant.audit.data_field_count = variant.audit.data_fields.len();
    Ok(variant)
}

fn verify_pivot_semantic_layout_variant(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    layout: &str,
    row_field_count: usize,
    column_field_count: usize,
    aggregations: &[&str],
) -> Result<WorkbookPivotLayoutVariant, String> {
    let variant = pivot_layout_variant(pivot, row_field_count, column_field_count, aggregations)?;
    let preview = preview_pivot(source, &variant, Vec::new())?;
    let semantic_shape_valid = preview.groups.iter().all(|group| {
        group.row_keys.len() == row_field_count
            && group.column_keys.len() == column_field_count
            && group.measures.len() == aggregations.len()
            && group
                .measures
                .iter()
                .zip(aggregations.iter())
                .all(|(measure, aggregation)| measure.aggregation == *aggregation)
    });
    if preview.groups.is_empty() || !semantic_shape_valid {
        return Err(format!("{layout} 布局变体的分组或度量语义未通过"));
    }
    Ok(WorkbookPivotLayoutVariant {
        layout: layout.into(),
        row_field_count,
        column_field_count,
        data_field_count: aggregations.len(),
        group_count: preview.groups.len(),
        measure_count: aggregations.len(),
        output_value_count: preview.groups.len().saturating_mul(aggregations.len()),
        output_range: String::new(),
        output_cell_count: 0,
        styled_output_cell_count: 0,
        isolated_package_digest: String::new(),
        status: "semantic_verified".into(),
    })
}

fn pivot_field_for_layout(
    start: &BytesStart<'_>,
    field_index: usize,
    row_field: Option<usize>,
    column_field: Option<usize>,
    data_fields: &[usize],
) -> Result<BytesStart<'static>, String> {
    let name = String::from_utf8_lossy(start.name().as_ref()).into_owned();
    let mut updated = BytesStart::new(name);
    for attribute in start.attributes().with_checks(false) {
        let attribute =
            attribute.map_err(|error| format!("解析布局变体 pivotField 属性失败: {error}"))?;
        if !matches!(attribute.key.as_ref(), b"axis" | b"dataField") {
            updated.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    if row_field == Some(field_index) {
        updated.push_attribute(("axis", "axisRow"));
    } else if column_field == Some(field_index) {
        updated.push_attribute(("axis", "axisCol"));
    }
    if data_fields.contains(&field_index) {
        updated.push_attribute(("dataField", "1"));
    }
    Ok(updated.into_owned())
}

fn write_pivot_axis_fields(
    writer: &mut Writer<Vec<u8>>,
    element: &str,
    fields: &[i32],
) -> Result<(), String> {
    if fields.is_empty() {
        return Ok(());
    }
    let count = fields.len().to_string();
    let mut container = BytesStart::new(element);
    container.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(container))
        .map_err(|error| format!("写入布局变体 {element} 失败: {error}"))?;
    for field in fields {
        let value = field.to_string();
        let mut item = BytesStart::new("field");
        item.push_attribute(("x", value.as_str()));
        writer
            .write_event(Event::Empty(item))
            .map_err(|error| format!("写入布局变体 {element} 字段失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new(element)))
        .map_err(|error| format!("结束布局变体 {element} 失败: {error}"))
}

fn write_pivot_multi_measure_column_items(
    writer: &mut Writer<Vec<u8>>,
    visible: &[usize],
    measure_count: usize,
) -> Result<(), String> {
    let count = visible
        .len()
        .saturating_add(1)
        .saturating_mul(measure_count)
        .to_string();
    let mut items = BytesStart::new("colItems");
    items.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(items))
        .map_err(|error| format!("写入多度量 colItems 失败: {error}"))?;
    for field_index in visible {
        for measure_index in 0..measure_count {
            writer
                .write_event(Event::Start(BytesStart::new("i")))
                .map_err(|error| format!("写入多度量列项失败: {error}"))?;
            for value in [*field_index, measure_index] {
                let value = value.to_string();
                let mut coordinate = BytesStart::new("x");
                coordinate.push_attribute(("v", value.as_str()));
                writer
                    .write_event(Event::Empty(coordinate))
                    .map_err(|error| format!("写入多度量列项坐标失败: {error}"))?;
            }
            writer
                .write_event(Event::End(BytesEnd::new("i")))
                .map_err(|error| format!("结束多度量列项失败: {error}"))?;
        }
    }
    for measure_index in 0..measure_count {
        let mut grand = BytesStart::new("i");
        grand.push_attribute(("t", "grand"));
        writer
            .write_event(Event::Start(grand))
            .and_then(|_| writer.write_event(Event::Empty(BytesStart::new("x"))))
            .map_err(|error| format!("写入多度量总计列项失败: {error}"))?;
        let value = measure_index.to_string();
        let mut measure = BytesStart::new("x");
        measure.push_attribute(("v", value.as_str()));
        writer
            .write_event(Event::Empty(measure))
            .and_then(|_| writer.write_event(Event::End(BytesEnd::new("i"))))
            .map_err(|error| format!("结束多度量总计列项失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("colItems")))
        .map_err(|error| format!("结束多度量 colItems 失败: {error}"))
}

fn write_pivot_data_fields(
    writer: &mut Writer<Vec<u8>>,
    fields: &[crate::formats::workbook::WorkbookPivotDataField],
) -> Result<(), String> {
    let count = fields.len().to_string();
    let mut data_fields = BytesStart::new("dataFields");
    data_fields.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(data_fields))
        .map_err(|error| format!("写入布局变体 dataFields 失败: {error}"))?;
    for field in fields {
        let source = field.source_index.to_string();
        let mut data_field = BytesStart::new("dataField");
        data_field.push_attribute(("name", field.name.as_str()));
        data_field.push_attribute(("fld", source.as_str()));
        data_field.push_attribute(("subtotal", field.aggregation.as_str()));
        writer
            .write_event(Event::Empty(data_field))
            .map_err(|error| format!("写入布局变体 dataField 失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("dataFields")))
        .map_err(|error| format!("结束布局变体 dataFields 失败: {error}"))
}

fn rewrite_pivot_layout_variant_xml(
    xml: &[u8],
    variant: &WorkbookPivotTable,
    row_axis: &PivotAxisRebuildTemplate,
    column_axis: &PivotAxisRebuildTemplate,
    output_layout: &PivotOutputLayout,
) -> Result<Vec<u8>, String> {
    let row_field = (variant.audit.row_field_count == 1).then_some(row_axis.field_index);
    let column_field = (variant.audit.column_field_count == 1).then_some(column_axis.field_index);
    let data_fields = variant
        .audit
        .data_fields
        .iter()
        .map(|field| field.source_index)
        .collect::<Vec<_>>();
    if data_fields.is_empty() {
        return Err("布局变体缺少值字段".into());
    }
    let row_visible = row_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    let column_visible = column_axis
        .hidden
        .iter()
        .enumerate()
        .filter_map(|(index, hidden)| (!hidden).then_some(index))
        .collect::<Vec<_>>();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 512));
    let mut buffer = Vec::new();
    let mut pivot_field_index = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析布局变体 Pivot XML 失败: {error}"))?;
        match event {
            Event::Empty(ref start) if start.local_name().as_ref() == b"location" => {
                let reference = output_layout_reference(output_layout)?;
                let updated = replace_xml_attribute(start, b"ref", &reference, false)?;
                let updated = replace_xml_attribute(
                    &updated,
                    b"firstDataRow",
                    &output_layout.first_data_row.to_string(),
                    false,
                )?;
                let updated = replace_xml_attribute(
                    &updated,
                    b"firstDataCol",
                    &output_layout.first_data_column.to_string(),
                    false,
                )?;
                writer
                    .write_event(Event::Empty(updated))
                    .map_err(|error| format!("写入布局变体 location 失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"pivotField" =>
            {
                let updated = pivot_field_for_layout(
                    start,
                    pivot_field_index,
                    row_field,
                    column_field,
                    &data_fields,
                )?;
                pivot_field_index = pivot_field_index.saturating_add(1);
                let updated = if matches!(event, Event::Start(_)) {
                    Event::Start(updated)
                } else {
                    Event::Empty(updated)
                };
                writer
                    .write_event(updated)
                    .map_err(|error| format!("写入布局变体 pivotField 失败: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"rowFields" => {
                if let Some(index) = row_field {
                    write_pivot_axis_fields(&mut writer, "rowFields", &[index as i32])?;
                }
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"colFields" => {
                if let Some(index) = column_field {
                    let mut fields = vec![index as i32];
                    if variant.audit.data_field_count > 1 {
                        fields.push(-2);
                    }
                    write_pivot_axis_fields(&mut writer, "colFields", &fields)?;
                }
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"rowItems" => {
                if row_field.is_some() {
                    write_pivot_axis_items(&mut writer, "rowItems", &row_visible)?;
                }
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"colItems" => {
                if column_field.is_some() {
                    if variant.audit.data_field_count > 1 {
                        write_pivot_multi_measure_column_items(
                            &mut writer,
                            &column_visible,
                            variant.audit.data_field_count,
                        )?;
                    } else {
                        write_pivot_axis_items(&mut writer, "colItems", &column_visible)?;
                    }
                }
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"dataFields" => {
                write_pivot_data_fields(&mut writer, &variant.audit.data_fields)?;
                skip_xml_element(&mut reader, &mut buffer)?;
                continue;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制布局变体 Pivot XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn pivot_preview_key(keys: &[crate::formats::workbook::WorkbookPivotPreviewKey]) -> String {
    keys.iter()
        .map(|key| format!("{}\u{1f}{}", key.kind, key.value))
        .collect::<Vec<_>>()
        .join("\u{1e}")
}

fn pivot_preview_label(
    keys: &[crate::formats::workbook::WorkbookPivotPreviewKey],
    fallback: &str,
) -> String {
    if keys.is_empty() {
        fallback.into()
    } else {
        keys.iter()
            .map(|key| key.value.clone())
            .collect::<Vec<_>>()
            .join(" / ")
    }
}

fn preview_measure_edit(
    value: Option<f64>,
    output_sheet: &str,
    row: usize,
    column: usize,
) -> Result<WorkbookCellEdit, String> {
    Ok(match value {
        Some(value) => WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: pivot_cache_number(value)?,
            kind: "number".into(),
        },
        None => WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: String::new(),
            kind: "empty".into(),
        },
    })
}

fn pivot_preview_value_from_data(value: &Data) -> Result<String, String> {
    Ok(match value {
        Data::Empty => "(空白)".into(),
        Data::String(value) => value.clone(),
        Data::Int(value) => value.to_string(),
        Data::Float(value) => pivot_cache_number(*value)?,
        Data::Bool(value) => value.to_string(),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) | Data::DurationIso(value) => value.clone(),
        Data::Error(value) => value.to_string(),
    })
}

fn pivot_visible_axis_values(
    snapshot: &crate::formats::workbook_pivot::PivotSourceSnapshot,
    axis: &PivotAxisRebuildTemplate,
    fields: &[PivotCacheFieldTemplate],
) -> Result<HashSet<String>, String> {
    let field = fields
        .get(axis.field_index)
        .ok_or("Pivot 可见轴字段不存在")?;
    let mut visible = HashSet::new();
    for record in &snapshot.rows {
        let value = record
            .get(axis.field_index)
            .ok_or("Pivot 来源记录缺少可见轴字段")?;
        let scalar = pivot_cache_scalar(value)?;
        let index = field
            .shared_items
            .iter()
            .position(|item| item == &scalar)
            .ok_or("Pivot 可见轴值不在 sharedItems 中")?;
        if axis.hidden.get(index) == Some(&false) {
            visible.insert(pivot_preview_value_from_data(value)?);
        }
    }
    Ok(visible)
}

fn build_pivot_layout_output_edits(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    output_sheet: &str,
    top: usize,
    left: usize,
    row_axis: &PivotAxisRebuildTemplate,
    column_axis: &PivotAxisRebuildTemplate,
    fields: &[PivotCacheFieldTemplate],
) -> Result<(Vec<WorkbookCellEdit>, PivotOutputLayout), String> {
    let row_count = pivot.audit.row_field_count;
    let column_count = pivot.audit.column_field_count;
    let snapshot = read_pivot_source_snapshot(source, pivot)?;
    let visible_row_values = pivot_visible_axis_values(&snapshot, row_axis, fields)?;
    let visible_column_values = pivot_visible_axis_values(&snapshot, column_axis, fields)?;
    let main = preview_pivot(source, pivot, Vec::new())?;
    let mut row_keys = Vec::<(String, String)>::new();
    let mut column_keys = Vec::<(String, String)>::new();
    let visible_groups = main
        .groups
        .iter()
        .filter(|group| {
            (row_count == 0
                || group
                    .row_keys
                    .first()
                    .is_some_and(|key| visible_row_values.contains(&key.value)))
                && (column_count == 0
                    || group
                        .column_keys
                        .first()
                        .is_some_and(|key| visible_column_values.contains(&key.value)))
        })
        .collect::<Vec<_>>();
    for group in &visible_groups {
        let row_key = pivot_preview_key(&group.row_keys);
        if row_count > 0 && !row_keys.iter().any(|(key, _)| key == &row_key) {
            row_keys.push((row_key, pivot_preview_label(&group.row_keys, "Values")));
        }
        let column_key = pivot_preview_key(&group.column_keys);
        if column_count > 0 && !column_keys.iter().any(|(key, _)| key == &column_key) {
            column_keys.push((
                column_key,
                pivot_preview_label(&group.column_keys, "Values"),
            ));
        }
    }
    if row_keys.is_empty() {
        row_keys.push((String::new(), "Values".into()));
    }
    if column_keys.is_empty() {
        column_keys.push((String::new(), String::new()));
    }
    let measure_count = pivot.audit.data_fields.len();
    let detail_column_count = if column_count > 0 {
        column_keys.len().saturating_mul(measure_count)
    } else {
        measure_count
    };
    let total_column_count = if column_count > 0 {
        detail_column_count.saturating_add(measure_count)
    } else {
        detail_column_count
    };
    let header_row_count = if row_count == 0 {
        2
    } else if column_count > 0 && measure_count > 1 {
        3
    } else {
        1
    };
    let data_start_row = top + header_row_count;
    let data_start_column = left + 1;
    let bottom = data_start_row + row_keys.len() - 1 + usize::from(row_count > 0);
    let right = left + total_column_count;
    let mut edits = Vec::new();
    for header_offset in 0..header_row_count {
        for column in left..=right {
            let value_column = column.saturating_sub(data_start_column);
            let input = if header_row_count == 1 {
                if column == left {
                    "Row Labels".into()
                } else {
                    pivot
                        .audit
                        .data_fields
                        .get(value_column)
                        .map(|measure| measure.name.clone())
                        .unwrap_or_default()
                }
            } else if header_offset == 0 {
                if column == data_start_column {
                    "Column Labels".into()
                } else {
                    String::new()
                }
            } else if header_row_count == 2 {
                if column == left {
                    String::new()
                } else if value_column < detail_column_count {
                    column_keys
                        .get(value_column / measure_count)
                        .map(|(_, label)| label.clone())
                        .unwrap_or_default()
                } else {
                    "Grand Total".into()
                }
            } else if header_offset == 1 {
                if column == left {
                    String::new()
                } else if value_column < detail_column_count
                    && value_column.is_multiple_of(measure_count)
                {
                    column_keys
                        .get(value_column / measure_count)
                        .map(|(_, label)| label.clone())
                        .unwrap_or_default()
                } else if value_column >= detail_column_count {
                    pivot
                        .audit
                        .data_fields
                        .get(value_column - detail_column_count)
                        .map(|measure| format!("Grand Total · {}", measure.name))
                        .unwrap_or_default()
                } else {
                    String::new()
                }
            } else if column == left {
                "Row Labels".into()
            } else {
                pivot
                    .audit
                    .data_fields
                    .get(value_column % measure_count)
                    .map(|measure| measure.name.clone())
                    .unwrap_or_default()
            };
            edits.push(WorkbookCellEdit {
                sheet: output_sheet.into(),
                row: top + header_offset,
                column,
                kind: if input.is_empty() {
                    "empty".into()
                } else {
                    "string".into()
                },
                input,
            });
        }
    }
    let value_for = |row_key: Option<&str>, column_key: Option<&str>, measure_index: usize| {
        let measures = visible_groups
            .iter()
            .filter(|group| {
                row_key.is_none_or(|key| pivot_preview_key(&group.row_keys) == key)
                    && column_key.is_none_or(|key| pivot_preview_key(&group.column_keys) == key)
            })
            .filter_map(|group| group.measures.get(measure_index))
            .collect::<Vec<_>>();
        match pivot.audit.data_fields[measure_index].aggregation.as_str() {
            "average" => {
                let count = measures
                    .iter()
                    .map(|measure| measure.contributing_count)
                    .sum::<usize>();
                (count > 0).then(|| {
                    measures
                        .iter()
                        .filter_map(|measure| {
                            measure
                                .value
                                .map(|value| value * measure.contributing_count as f64)
                        })
                        .sum::<f64>()
                        / count as f64
                })
            }
            aggregation => {
                let values = measures
                    .iter()
                    .filter_map(|measure| measure.value)
                    .collect::<Vec<_>>();
                (!values.is_empty()).then(|| match aggregation {
                    "max" => values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                    "min" => values.iter().copied().fold(f64::INFINITY, f64::min),
                    "product" => values.iter().product(),
                    _ => values.iter().sum(),
                })
            }
        }
    };
    for (row_position, (row_key, row_label)) in row_keys.iter().enumerate() {
        let row = data_start_row + row_position;
        edits.push(WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column: left,
            input: if row_count == 0 {
                pivot.audit.data_fields[0].name.clone()
            } else {
                row_label.clone()
            },
            kind: "string".into(),
        });
        for (column_position, (column_key, _)) in column_keys.iter().enumerate() {
            for measure_position in 0..measure_count {
                edits.push(preview_measure_edit(
                    value_for(Some(row_key), Some(column_key), measure_position),
                    output_sheet,
                    row,
                    data_start_column + column_position * measure_count + measure_position,
                )?);
            }
        }
        if column_count > 0 {
            for measure_position in 0..measure_count {
                edits.push(preview_measure_edit(
                    value_for(Some(row_key), None, measure_position),
                    output_sheet,
                    row,
                    data_start_column + detail_column_count + measure_position,
                )?);
            }
        }
    }
    if row_count > 0 {
        edits.push(WorkbookCellEdit {
            sheet: output_sheet.into(),
            row: bottom,
            column: left,
            input: "Grand Total".into(),
            kind: "string".into(),
        });
        for (column_position, (column_key, _)) in column_keys.iter().enumerate() {
            for measure_position in 0..measure_count {
                edits.push(preview_measure_edit(
                    value_for(None, Some(column_key), measure_position),
                    output_sheet,
                    bottom,
                    data_start_column + column_position * measure_count + measure_position,
                )?);
            }
        }
        if column_count > 0 {
            for measure_position in 0..measure_count {
                edits.push(preview_measure_edit(
                    value_for(None, None, measure_position),
                    output_sheet,
                    bottom,
                    data_start_column + detail_column_count + measure_position,
                )?);
            }
        }
    }
    Ok((
        edits,
        PivotOutputLayout {
            top,
            bottom,
            left,
            right,
            first_data_row: header_row_count,
            first_data_column: 1,
        },
    ))
}

fn build_pivot_layout_variant_package(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    variant: &WorkbookPivotTable,
) -> Result<(Vec<u8>, String, usize, usize), String> {
    let plan = plan_workbook_pivot_rebuild(source, pivot)?;
    let part_for = |role: &str| {
        plan.affected_parts
            .iter()
            .find(|impact| impact.role == role)
            .map(|impact| impact.part.clone())
            .ok_or_else(|| format!("布局变体隔离计划缺少 {role} 部件"))
    };
    let definition_part = part_for("cache_definition")?;
    let pivot_part = part_for("pivot_table")?;
    let output_part = part_for("output_worksheet")?;
    let output_sheet = plan
        .output_sheet
        .as_deref()
        .ok_or("布局变体缺少输出工作表")?;
    let mut entries = load_package(source)?;
    let definition_index = entries
        .iter()
        .position(|entry| entry.name == definition_part)
        .ok_or("布局变体缺少 Cache Definition")?;
    let pivot_index = entries
        .iter()
        .position(|entry| entry.name == pivot_part)
        .ok_or("布局变体缺少 Pivot Table")?;
    let output_index = entries
        .iter()
        .position(|entry| entry.name == output_part)
        .ok_or("布局变体缺少输出工作表部件")?;
    let fields = parse_pivot_cache_field_templates(&entries[definition_index].data)?;
    let (row_axis, column_axis, old_layout) =
        parse_pivot_axis_templates(&entries[pivot_index].data, pivot, &fields)?;
    let (output_edits, output_layout) = build_pivot_layout_output_edits(
        source,
        variant,
        output_sheet,
        old_layout.top,
        old_layout.left,
        &row_axis,
        &column_axis,
        &fields,
    )?;
    let desired = output_edits
        .iter()
        .map(|edit| (edit.row, edit.column))
        .collect::<HashSet<_>>();
    let output_cell_count = output_edits.len();
    let mut all_edits = (old_layout.top..=old_layout.bottom)
        .flat_map(|row| (old_layout.left..=old_layout.right).map(move |column| (row, column)))
        .filter(|coordinate| !desired.contains(coordinate))
        .map(|(row, column)| WorkbookCellEdit {
            sheet: output_sheet.into(),
            row,
            column,
            input: String::new(),
            kind: "empty".into(),
        })
        .collect::<Vec<_>>();
    all_edits.extend(output_edits);
    let old_header_row = old_layout.top + old_layout.first_data_row - 1;
    let old_data_start_row = old_layout.top + old_layout.first_data_row;
    let old_data_start_column = old_layout.left + old_layout.first_data_column;
    let (_, old_styles) = read_sheet_formulas_and_style_ids(
        &entries[output_index].data,
        old_header_row,
        old_layout.bottom + 1,
        old_layout.right + 1,
    )?;
    let header_style = old_styles
        .get(&(old_header_row, old_data_start_column))
        .copied();
    let header_total_style = old_styles
        .get(&(old_header_row, old_layout.right))
        .copied()
        .or(header_style);
    let row_label_style = old_styles
        .get(&(old_data_start_row, old_layout.left))
        .copied();
    let grand_label_style = old_styles
        .get(&(old_layout.bottom, old_layout.left))
        .copied()
        .or(row_label_style);
    let value_style = old_styles
        .get(&(old_data_start_row, old_data_start_column))
        .copied();
    let style_for = |edit: &WorkbookCellEdit| {
        if edit.kind == "empty" {
            None
        } else if edit.row == output_layout.top {
            if edit.column == output_layout.right {
                header_total_style
            } else {
                header_style
            }
        } else if edit.column == output_layout.left {
            if edit.row == output_layout.bottom {
                grand_label_style
            } else {
                row_label_style
            }
        } else {
            value_style
        }
    };
    let styled_output_cell_count = all_edits
        .iter()
        .filter(|edit| style_for(edit).is_some())
        .count();
    let mut patches = SheetPatches::new();
    for edit in &all_edits {
        patches.entry(edit.row).or_default().insert(
            edit.column,
            CellPatch {
                edit: Some(edit),
                style_id: style_for(edit),
            },
        );
    }
    entries[pivot_index].data = rewrite_pivot_layout_variant_xml(
        &entries[pivot_index].data,
        variant,
        &row_axis,
        &column_axis,
        &output_layout,
    )?;
    entries[output_index].data = patch_sheet_xml(&entries[output_index].data, &patches)?;
    let modified_paths = HashSet::from([pivot_part.clone(), output_part.clone()]);
    let isolated = write_package_preserving_unchanged(source, entries, &modified_paths)?;
    validate_workbook_package(&isolated)?;
    let linked = read_workbook_linked_data(&isolated)?;
    let rebuilt = linked
        .pivot_tables
        .iter()
        .find(|candidate| candidate.part == pivot.part)
        .ok_or("布局变体包中的 Pivot 身份丢失")?;
    let output_range = output_layout_reference(&output_layout)?;
    if rebuilt.audit.row_field_count != variant.audit.row_field_count
        || rebuilt.audit.column_field_count != variant.audit.column_field_count
        || rebuilt.audit.data_field_count != variant.audit.data_field_count
        || rebuilt.audit.layout_range.as_deref() != Some(output_range.as_str())
        || rebuilt
            .audit
            .data_fields
            .iter()
            .zip(variant.audit.data_fields.iter())
            .any(|(actual, expected)| {
                actual.source_index != expected.source_index
                    || actual.aggregation != expected.aggregation
            })
    {
        return Err("布局变体包语义复读失败".into());
    }
    if !verify_pivot_output_values(&isolated, output_sheet, &all_edits)? {
        return Err("布局变体包输出值复读失败".into());
    }
    let isolated_output = load_package(&isolated)?
        .into_iter()
        .find(|entry| entry.name == output_part)
        .ok_or("布局变体包缺少输出工作表部件")?;
    let (_, isolated_styles) = read_sheet_formulas_and_style_ids(
        &isolated_output.data,
        output_layout.top,
        output_layout.bottom + 1,
        output_layout.right + 1,
    )?;
    if all_edits.iter().any(|edit| {
        style_for(edit).is_some()
            && isolated_styles.get(&(edit.row, edit.column)).copied() != style_for(edit)
    }) {
        return Err("布局变体包输出样式复读失败".into());
    }
    let source_entries = load_package(source)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    let isolated_entries = load_package(&isolated)?
        .into_iter()
        .map(|entry| (entry.name, entry.data))
        .collect::<HashMap<_, _>>();
    if source_entries.iter().any(|(name, data)| {
        !modified_paths.contains(name)
            && isolated_entries
                .get(name)
                .is_none_or(|candidate| candidate != data)
    }) {
        return Err("布局变体包改写了影响清单外的部件".into());
    }
    Ok((
        isolated,
        output_range,
        output_cell_count,
        styled_output_cell_count,
    ))
}

pub(crate) fn rebuild_workbook_pivot_layout_variant_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    layout: &str,
) -> Result<(Vec<u8>, WorkbookPivotLayoutVariant), String> {
    let (row_fields, column_fields, aggregations) = match layout {
        "row_only" => (1, 0, vec!["sum"]),
        "column_only" => (0, 1, vec!["sum"]),
        "multi_measure" => (1, 1, vec!["sum", "count", "average"]),
        _ => return Err(format!("Pivot 布局新副本不支持 {layout}")),
    };
    if pivot.audit.row_field_count != 1
        || pivot.audit.column_field_count != 1
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
        || pivot
            .audit
            .data_fields
            .first()
            .is_none_or(|field| field.aggregation != "sum" || !field.supported)
    {
        return Err(
            "Pivot 布局新副本要求一个行字段、一个列字段、一个 sum 值字段且无页面筛选的标准来源"
                .into(),
        );
    }
    let mut result = verify_pivot_semantic_layout_variant(
        source,
        pivot,
        layout,
        row_fields,
        column_fields,
        &aggregations,
    )?;
    let variant = pivot_layout_variant(pivot, row_fields, column_fields, &aggregations)?;
    let (isolated, output_range, output_cell_count, styled_output_cell_count) =
        build_pivot_layout_variant_package(source, pivot, &variant)?;
    result.output_range = output_range;
    result.output_cell_count = output_cell_count;
    result.styled_output_cell_count = styled_output_cell_count;
    result.isolated_package_digest = format!("{:x}", md5::compute(&isolated));
    result.status = "package_verified".into();
    Ok((isolated, result))
}

pub(crate) fn rebuild_workbook_pivot_aggregation_variant_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    aggregation: &str,
) -> Result<(Vec<u8>, WorkbookPivotAggregationVariant), String> {
    if !matches!(
        aggregation,
        "sum" | "count" | "average" | "max" | "min" | "product" | "countNums"
    ) {
        return Err(format!("Pivot 聚合新副本不支持 {aggregation}"));
    }
    if pivot.audit.row_field_count != 1
        || pivot.audit.column_field_count != 1
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
        || pivot
            .audit
            .data_fields
            .first()
            .is_none_or(|field| field.aggregation != "sum" || !field.supported)
    {
        return Err(
            "Pivot 聚合新副本要求一个行字段、一个列字段、一个 sum 值字段且无页面筛选的标准来源"
                .into(),
        );
    }
    verify_pivot_semantic_layout_variant(source, pivot, aggregation, 1, 1, &[aggregation])?;
    let variant = pivot_layout_variant(pivot, 1, 1, &[aggregation])?;
    let (isolated, output_range, output_cell_count, styled_output_cell_count) =
        build_pivot_layout_variant_package(source, pivot, &variant)?;
    Ok((
        isolated.clone(),
        WorkbookPivotAggregationVariant {
            aggregation: aggregation.into(),
            status: "package_verified".into(),
            output_range,
            output_cell_count,
            styled_output_cell_count,
            isolated_package_digest: format!("{:x}", md5::compute(&isolated)),
        },
    ))
}

pub(crate) fn verify_workbook_pivot_variants_isolated(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<WorkbookPivotVariantVerificationResult, String> {
    if pivot.audit.row_field_count != 1
        || pivot.audit.column_field_count != 1
        || pivot.audit.data_field_count != 1
        || pivot.audit.page_field_count != 0
    {
        return Err(
            "聚合与布局变体隔离验证要求一个行字段、一个列字段、一个值字段且无页面筛选".into(),
        );
    }
    let aggregations = [
        "sum",
        "count",
        "average",
        "max",
        "min",
        "product",
        "countNums",
    ];
    let mut aggregation_variants = Vec::with_capacity(aggregations.len());
    for aggregation in aggregations {
        let (_, result) =
            rebuild_workbook_pivot_aggregation_variant_isolated(source, pivot, aggregation)?;
        aggregation_variants.push(result);
    }

    let layout_specs = [
        ("row_only", 1, 0, vec!["sum"]),
        ("column_only", 0, 1, vec!["sum"]),
        ("multi_measure", 1, 1, vec!["sum", "count", "average"]),
    ];
    let mut layout_variants = Vec::with_capacity(layout_specs.len());
    for (layout, row_fields, column_fields, aggregations) in layout_specs {
        let _ = (row_fields, column_fields, aggregations);
        let (_, result) = rebuild_workbook_pivot_layout_variant_isolated(source, pivot, layout)?;
        layout_variants.push(result);
    }
    let package_variants_verified = aggregation_variants.len() == aggregations.len()
        && aggregation_variants
            .iter()
            .all(|variant| variant.status == "package_verified");
    let semantic_variants_verified = layout_variants.len() == 3
        && layout_variants
            .iter()
            .all(|variant| variant.status == "package_verified");
    if !package_variants_verified || !semantic_variants_verified {
        return Err("聚合与布局变体隔离验证未完整通过".into());
    }
    let gate = |id: &str, status: &str| WorkbookPivotRebuildGate {
        id: id.into(),
        status: status.into(),
    };
    Ok(WorkbookPivotVariantVerificationResult {
        pivot_name: pivot.name.clone(),
        status: "isolated_variants_verified".into(),
        execution: "temporary_copy_and_memory_only".into(),
        writes_user_file: false,
        package_variant_count: aggregation_variants.len() + layout_variants.len(),
        layout_package_variant_count: layout_variants.len(),
        semantic_variant_count: layout_variants.len(),
        source_package_digest: format!("{:x}", md5::compute(source)),
        aggregation_variants,
        layout_variants,
        package_variants_verified,
        semantic_variants_verified,
        gates: vec![
            gate("signature_check", "passed"),
            gate("aggregation_variant_packages", "passed"),
            gate("non_sum_output_reparse", "passed"),
            gate("single_axis_semantics", "passed"),
            gate("multi_measure_semantics", "passed"),
            gate("single_axis_package_rewrite", "passed"),
            gate("multi_measure_package_rewrite", "passed"),
            gate("package_validation", "passed"),
            gate("semantic_reparse", "passed"),
            gate("output_value_reparse", "passed"),
            gate("output_style_reparse", "passed"),
            gate("untouched_part_preservation", "passed"),
            gate("source_package_unchanged", "passed"),
            gate("atomic_replace", "blocked"),
            gate("excel_or_libreoffice_round_trip", "pending"),
        ],
    })
}

pub fn validate_workbook_calculation_boundary(source: &[u8]) -> Result<(), String> {
    let entries = load_package(source)?;
    if entries.iter().any(|entry| {
        entry.name.starts_with("xl/externalLinks/externalLink") && entry.name.ends_with(".xml")
    }) {
        return Err(
            "公式重算保持离线：包含外部工作簿链接的 XLSX 只保留公式和缓存结果，不执行重算".into(),
        );
    }
    for entry in entries
        .iter()
        .filter(|entry| entry.name.starts_with("xl/worksheets/") && entry.name.ends_with(".xml"))
    {
        let mut reader = Reader::from_reader(entry.data.as_slice());
        let mut buffer = Vec::new();
        let mut array_formula = false;
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Excel 数组公式边界失败: {error}"))?
            {
                Event::Start(ref event) if event.local_name().as_ref() == b"f" => {
                    array_formula =
                        xml_value(event, b"t", reader.decoder())?.as_deref() == Some("array");
                    if array_formula
                        && xml_value(event, b"ref", reader.decoder())?
                            .is_some_and(|range| range.contains(':'))
                    {
                        return Err(
                            "当前公式引擎不支持数组公式、动态数组和溢出区域；已保留原公式与缓存结果"
                                .into(),
                        );
                    }
                }
                Event::Text(ref event) if array_formula => {
                    let formula = event
                        .decode()
                        .map_err(|error| format!("解析 Excel 数组公式文本失败: {error}"))?
                        .to_ascii_uppercase();
                    if [
                        "SEQUENCE(",
                        "FILTER(",
                        "UNIQUE(",
                        "SORT(",
                        "SORTBY(",
                        "RANDARRAY(",
                        "TOCOL(",
                        "TOROW(",
                        "TAKE(",
                        "DROP(",
                        "EXPAND(",
                        "VSTACK(",
                        "HSTACK(",
                        "WRAPROWS(",
                        "WRAPCOLS(",
                    ]
                    .iter()
                    .any(|marker| formula.contains(marker))
                    {
                        return Err(
                            "当前公式引擎不支持数组公式、动态数组和溢出区域；已保留原公式与缓存结果"
                                .into(),
                        );
                    }
                }
                Event::End(ref event) if event.local_name().as_ref() == b"f" => {
                    array_formula = false;
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
    }
    Ok(())
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
    const PAGE_LAYOUT_ELEMENTS: [&[u8]; 12] = [
        b"pageMargins",
        b"pageSetup",
        b"pageSetUpPr",
        b"printOptions",
        b"headerFooter",
        b"oddHeader",
        b"oddFooter",
        b"evenHeader",
        b"evenFooter",
        b"firstHeader",
        b"firstFooter",
        b"sheetProtection",
    ];
    if !PAGE_LAYOUT_ELEMENTS
        .iter()
        .any(|name| xml.windows(name.len()).any(|window| window == *name))
    {
        return Ok(WorkbookPageLayout::default());
    }
    let mut result = WorkbookPageLayout::default();
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Excel 页面布局失败: {error}"))?
        {
            Event::Start(ref event) if event.local_name().as_ref() == b"sheetData" => {
                reader
                    .read_to_end(event.name())
                    .map_err(|error| format!("跳过 Excel 单元格数据失败: {error}"))?;
            }
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
                result.setup.use_first_page_number =
                    bool_attribute(event, b"useFirstPageNumber", reader.decoder(), false)?;
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
    let conditional_dxf_styles = read_conditional_dxf_styles(&styles.data)?;
    let catalog = parse_styles(&styles.data, theme)?;
    let extent = sheet_extent(&sheet_xml.data)?;
    let (formulas, style_ids) =
        read_sheet_formulas_and_style_ids(&sheet_xml.data, row_start, row_end, max_columns)?;
    let styles = style_ids
        .into_iter()
        .map(|(coordinate, style_id)| (coordinate, catalog.public_style(style_id)))
        .collect();
    let structure = read_sheet_structure(&sheet_xml.data, row_start, row_end, max_columns)?;
    let mut conditional_formats =
        read_conditional_formats(&sheet_xml.data, &conditional_dxf_styles)?;
    resolve_dynamic_color_scales(&sheet_xml.data, &mut conditional_formats)?;
    let array_formulas = read_array_formulas(&sheet_xml.data)?;
    let tables = read_sheet_tables(&entries, sheet_path, &sheet_xml.data)?;
    let drawings = read_sheet_drawings(&entries, sheet_path, &sheet_xml.data)?;
    let mut page_layout = structure.page_layout.clone();
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
        auto_filter_state: structure.auto_filter_state,
        tables,
        data_validations: structure.data_validations,
        conditional_formats,
        array_formulas,
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
            // Preserve unchanged compressed streams instead of inflating and recompressing the package.
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

fn validate_page_layout_change(change: &WorkbookPageLayoutChange) -> Result<(), String> {
    if !matches!(change.orientation.as_str(), "portrait" | "landscape") {
        return Err("页面方向只支持 portrait 或 landscape".into());
    }
    if !matches!(change.paper_size, 1 | 5 | 8 | 9 | 11) {
        return Err("纸张只支持 Letter、Legal、A3、A4 或 A5".into());
    }
    if let Some(range) = change.print_area.as_ref() {
        if range.top > range.bottom
            || range.left > range.right
            || range.bottom >= MAX_XLSX_ROWS
            || range.right >= MAX_XLSX_COLUMNS
        {
            return Err("打印区域超出 XLSX 网格".into());
        }
    }
    for (name, value) in [
        ("left", change.margins.left),
        ("right", change.margins.right),
        ("top", change.margins.top),
        ("bottom", change.margins.bottom),
        ("header", change.margins.header),
        ("footer", change.margins.footer),
    ] {
        if !value.is_finite() || !(0.0..=10.0).contains(&value) {
            return Err(format!("页边距 {name} 必须在 0 到 10 英寸之间"));
        }
    }
    match (change.scale, change.fit_to_width, change.fit_to_height) {
        (Some(scale), None, None) if (10..=400).contains(&scale) => {}
        (None, Some(width), Some(height))
            if width <= 100 && height <= 100 && (width > 0 || height > 0) => {}
        _ => return Err("缩放必须使用 10–400% 或 0–100 页的适页设置".into()),
    }
    Ok(())
}

fn page_margins_event(change: &WorkbookPageLayoutChange) -> BytesStart<'static> {
    let mut event = BytesStart::new("pageMargins");
    let values = [
        ("left", change.margins.left.to_string()),
        ("right", change.margins.right.to_string()),
        ("top", change.margins.top.to_string()),
        ("bottom", change.margins.bottom.to_string()),
        ("header", change.margins.header.to_string()),
        ("footer", change.margins.footer.to_string()),
    ];
    for (name, value) in &values {
        event.push_attribute((*name, value.as_str()));
    }
    event.into_owned()
}

fn page_setup_event(
    original: Option<&BytesStart<'_>>,
    change: &WorkbookPageLayoutChange,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("pageSetup");
    if let Some(original) = original {
        for attribute in original.attributes().with_checks(false) {
            let attribute = attribute.map_err(|error| format!("解析页面设置属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"orientation" | b"paperSize" | b"scale" | b"fitToWidth" | b"fitToHeight"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    let paper_size = change.paper_size.to_string();
    event.push_attribute(("orientation", change.orientation.as_str()));
    event.push_attribute(("paperSize", paper_size.as_str()));
    if let Some(scale) = change.scale {
        let scale = scale.to_string();
        event.push_attribute(("scale", scale.as_str()));
    } else {
        let width = change.fit_to_width.unwrap_or_default().to_string();
        let height = change.fit_to_height.unwrap_or_default().to_string();
        event.push_attribute(("fitToWidth", width.as_str()));
        event.push_attribute(("fitToHeight", height.as_str()));
    }
    Ok(event.into_owned())
}

fn page_setup_properties_event(
    original: Option<&BytesStart<'_>>,
    fit_to_page: bool,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("pageSetUpPr");
    if let Some(original) = original {
        for attribute in original.attributes().with_checks(false) {
            let attribute = attribute.map_err(|error| format!("解析页面设置属性失败: {error}"))?;
            if attribute.key.as_ref() != b"fitToPage" {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    event.push_attribute(("fitToPage", if fit_to_page { "1" } else { "0" }));
    Ok(event.into_owned())
}

fn patch_page_setup_properties_xml(xml: &[u8], fit_to_page: bool) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 80));
    let mut buffer = Vec::new();
    let mut inside_sheet_properties = false;
    let mut found_sheet_properties = false;
    let mut wrote_setup_properties = false;
    let mut inserted_sheet_properties = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析页面设置属性失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"sheetPr" => {
                found_sheet_properties = true;
                inside_sheet_properties = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("写入页面设置属性失败: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"sheetPr" => {
                found_sheet_properties = true;
                writer
                    .write_event(Event::Start(start.to_owned().into_owned()))
                    .map_err(|error| format!("写入页面设置属性失败: {error}"))?;
                writer
                    .write_event(Event::Empty(page_setup_properties_event(
                        None,
                        fit_to_page,
                    )?))
                    .map_err(|error| format!("写入页面设置属性失败: {error}"))?;
                writer
                    .write_event(Event::End(BytesEnd::new("sheetPr")))
                    .map_err(|error| format!("写入页面设置属性失败: {error}"))?;
                wrote_setup_properties = true;
            }
            Event::Start(ref start)
                if inside_sheet_properties && start.local_name().as_ref() == b"pageSetUpPr" =>
            {
                writer
                    .write_event(Event::Empty(page_setup_properties_event(
                        Some(start),
                        fit_to_page,
                    )?))
                    .map_err(|error| format!("更新页面设置属性失败: {error}"))?;
                skip_element(&mut reader, b"pageSetUpPr", &mut buffer)?;
                wrote_setup_properties = true;
            }
            Event::Empty(ref start)
                if inside_sheet_properties && start.local_name().as_ref() == b"pageSetUpPr" =>
            {
                writer
                    .write_event(Event::Empty(page_setup_properties_event(
                        Some(start),
                        fit_to_page,
                    )?))
                    .map_err(|error| format!("更新页面设置属性失败: {error}"))?;
                wrote_setup_properties = true;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"sheetPr" => {
                if !wrote_setup_properties {
                    writer
                        .write_event(Event::Empty(page_setup_properties_event(
                            None,
                            fit_to_page,
                        )?))
                        .map_err(|error| format!("新增页面设置属性失败: {error}"))?;
                    wrote_setup_properties = true;
                }
                inside_sheet_properties = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束页面设置属性失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !found_sheet_properties
                    && !inserted_sheet_properties
                    && start.local_name().as_ref() != b"worksheet" =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("sheetPr")))
                    .map_err(|error| format!("新增工作表属性失败: {error}"))?;
                writer
                    .write_event(Event::Empty(page_setup_properties_event(
                        None,
                        fit_to_page,
                    )?))
                    .map_err(|error| format!("新增页面设置属性失败: {error}"))?;
                writer
                    .write_event(Event::End(BytesEnd::new("sheetPr")))
                    .map_err(|error| format!("结束工作表属性失败: {error}"))?;
                inserted_sheet_properties = true;
                wrote_setup_properties = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
            }
            Event::End(ref end)
                if end.local_name().as_ref() == b"worksheet"
                    && !found_sheet_properties
                    && !inserted_sheet_properties =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("sheetPr")))
                    .map_err(|error| format!("新增工作表属性失败: {error}"))?;
                writer
                    .write_event(Event::Empty(page_setup_properties_event(
                        None,
                        fit_to_page,
                    )?))
                    .map_err(|error| format!("新增页面设置属性失败: {error}"))?;
                writer
                    .write_event(Event::End(BytesEnd::new("sheetPr")))
                    .map_err(|error| format!("结束工作表属性失败: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表 XML 失败: {error}"))?;
                inserted_sheet_properties = true;
                wrote_setup_properties = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if !wrote_setup_properties {
        return Err("无法写入页面设置属性".into());
    }
    Ok(writer.into_inner())
}

fn patch_page_layout_xml(xml: &[u8], change: &WorkbookPageLayoutChange) -> Result<Vec<u8>, String> {
    let with_properties = patch_page_setup_properties_xml(xml, change.scale.is_none())?;
    let mut reader = Reader::from_reader(with_properties.as_slice());
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(with_properties.len() + 180));
    let mut buffer = Vec::new();
    let mut inserted = false;
    let mut original_setup = None;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析页面布局失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"pageMargins" => {
                skip_element(&mut reader, b"pageMargins", &mut buffer)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"pageMargins" => {}
            Event::Start(ref start) if start.local_name().as_ref() == b"pageSetup" => {
                original_setup = Some(start.to_owned().into_owned());
                skip_element(&mut reader, b"pageSetup", &mut buffer)?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"pageSetup" => {
                original_setup = Some(start.to_owned().into_owned());
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !inserted
                    && matches!(
                        start.local_name().as_ref(),
                        b"headerFooter"
                            | b"rowBreaks"
                            | b"colBreaks"
                            | b"customProperties"
                            | b"drawing"
                            | b"legacyDrawing"
                            | b"legacyDrawingHF"
                            | b"picture"
                            | b"oleObjects"
                            | b"controls"
                            | b"webPublishItems"
                            | b"tableParts"
                            | b"extLst"
                    ) =>
            {
                writer
                    .write_event(Event::Empty(page_margins_event(change)))
                    .map_err(|error| format!("写入页边距失败: {error}"))?;
                writer
                    .write_event(Event::Empty(page_setup_event(
                        original_setup.as_ref(),
                        change,
                    )?))
                    .map_err(|error| format!("写入页面设置失败: {error}"))?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
            }
            Event::End(ref end) if !inserted && end.local_name().as_ref() == b"worksheet" => {
                writer
                    .write_event(Event::Empty(page_margins_event(change)))
                    .map_err(|error| format!("写入页边距失败: {error}"))?;
                writer
                    .write_event(Event::Empty(page_setup_event(
                        original_setup.as_ref(),
                        change,
                    )?))
                    .map_err(|error| format!("写入页面设置失败: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表 XML 失败: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("无法写入页面布局".into());
    }
    Ok(writer.into_inner())
}

fn patch_print_area_xml(
    xml: &[u8],
    sheet: &str,
    local_sheet_id: usize,
    formula: Option<&str>,
) -> Result<Vec<u8>, String> {
    let defined_names = read_workbook_defined_names_xml(xml)?;
    let target_exists = defined_names.iter().any(|name| {
        name.name.eq_ignore_ascii_case("_xlnm.Print_Area") && name.scope.as_deref() == Some(sheet)
    });
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 120));
    let mut buffer = Vec::new();
    let mut has_container = false;
    let mut inserted = false;
    let mut patched = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析打印区域定义失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"definedNames" => {
                has_container = true;
                if formula.is_none() && target_exists && defined_names.len() == 1 {
                    skip_element(&mut reader, b"definedNames", &mut buffer)?;
                    patched = true;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制定义名称失败: {error}"))?;
                }
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"definedName" => {
                let name = xml_value(start, b"name", reader.decoder())?;
                let scope = xml_value(start, b"localSheetId", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok());
                if name
                    .as_deref()
                    .is_some_and(|name| name.eq_ignore_ascii_case("_xlnm.Print_Area"))
                    && scope == Some(local_sheet_id)
                {
                    if let Some(formula) = formula {
                        writer
                            .write_event(Event::Start(start.to_owned().into_owned()))
                            .map_err(|error| format!("写入打印区域定义失败: {error}"))?;
                        writer
                            .write_event(Event::Text(BytesText::new(formula)))
                            .map_err(|error| format!("写入打印区域范围失败: {error}"))?;
                        writer
                            .write_event(Event::End(BytesEnd::new("definedName")))
                            .map_err(|error| format!("结束打印区域定义失败: {error}"))?;
                    }
                    skip_element(&mut reader, b"definedName", &mut buffer)?;
                    patched = true;
                    inserted = formula.is_some();
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("复制定义名称失败: {error}"))?;
                }
            }
            Event::End(ref end)
                if end.local_name().as_ref() == b"definedNames"
                    && formula.is_some()
                    && !inserted =>
            {
                write_defined_name(
                    &mut writer,
                    "_xlnm.Print_Area",
                    Some(local_sheet_id),
                    formula.unwrap(),
                )?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束定义名称失败: {error}"))?;
                inserted = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !has_container
                    && formula.is_some()
                    && !inserted
                    && matches!(
                        start.local_name().as_ref(),
                        b"calcPr"
                            | b"oleSize"
                            | b"customWorkbookViews"
                            | b"pivotCaches"
                            | b"extLst"
                    ) =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("definedNames")))
                    .map_err(|error| format!("新增定义名称容器失败: {error}"))?;
                write_defined_name(
                    &mut writer,
                    "_xlnm.Print_Area",
                    Some(local_sheet_id),
                    formula.unwrap(),
                )?;
                writer
                    .write_event(Event::End(BytesEnd::new("definedNames")))
                    .map_err(|error| format!("结束定义名称容器失败: {error}"))?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作簿 XML 失败: {error}"))?;
            }
            Event::End(ref end)
                if end.local_name().as_ref() == b"workbook" && formula.is_some() && !inserted =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("definedNames")))
                    .map_err(|error| format!("新增定义名称容器失败: {error}"))?;
                write_defined_name(
                    &mut writer,
                    "_xlnm.Print_Area",
                    Some(local_sheet_id),
                    formula.unwrap(),
                )?;
                writer
                    .write_event(Event::End(BytesEnd::new("definedNames")))
                    .map_err(|error| format!("结束定义名称容器失败: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作簿 XML 失败: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作簿 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if formula.is_some() && !inserted {
        return Err("无法写入打印区域定义".into());
    }
    if formula.is_none() && target_exists && !patched {
        return Err("无法清除打印区域定义".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_page_layout(
    source: &[u8],
    change: &WorkbookPageLayoutChange,
) -> Result<Vec<u8>, String> {
    validate_page_layout_change(change)?;
    let mut entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let sheet_path = paths
        .get(change.sheet.trim())
        .ok_or_else(|| format!("工作表不存在: {}", change.sheet))?
        .clone();
    let sheet_index = entries
        .iter()
        .position(|entry| entry.name == sheet_path)
        .ok_or("工作表部件缺失")?;
    if parse_page_layout(&entries[sheet_index].data)?
        .protection
        .enabled
    {
        return Err("受保护的工作表不能修改页面布局；LongEdit 不会绕过 Excel 保护".into());
    }
    let workbook_index = entries
        .iter()
        .position(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX 缺少 xl/workbook.xml")?;
    let workbook_xml = entries[workbook_index].data.clone();
    let sheets = workbook_sheet_names(&workbook_xml)?;
    let local_sheet_id = sheets
        .iter()
        .position(|sheet| sheet == change.sheet.trim())
        .ok_or_else(|| format!("工作表不存在: {}", change.sheet))?;
    let current_print_area = read_workbook_defined_names_xml(&workbook_xml)?
        .into_iter()
        .find(|name| {
            name.name.eq_ignore_ascii_case("_xlnm.Print_Area")
                && name.scope.as_deref() == Some(change.sheet.trim())
        })
        .and_then(|name| name.reference)
        .map(|range| WorkbookMergeRange {
            top: range.top,
            bottom: range.bottom,
            left: range.left,
            right: range.right,
        });
    if read_workbook_protection(source)?.lock_structure && current_print_area != change.print_area {
        return Err("工作簿结构已保护，不能修改打印区域定义".into());
    }
    let formula = change
        .print_area
        .as_ref()
        .map(|range| defined_name_range_formula(change.sheet.trim(), range))
        .transpose()?;
    entries[sheet_index].data = patch_page_layout_xml(&entries[sheet_index].data, change)?;
    if current_print_area != change.print_area {
        entries[workbook_index].data = patch_print_area_xml(
            &workbook_xml,
            change.sheet.trim(),
            local_sheet_id,
            formula.as_deref(),
        )?;
    }
    let parsed = parse_page_layout(&entries[sheet_index].data)?;
    if parsed.setup.orientation.as_deref() != Some(change.orientation.as_str())
        || parsed.setup.paper_size != Some(change.paper_size)
        || parsed.margins.left != Some(change.margins.left)
        || parsed.setup.scale != change.scale
        || parsed.setup.fit_to_width != change.fit_to_width
        || parsed.setup.fit_to_height != change.fit_to_height
    {
        return Err("页面布局写回后的语义校验失败".into());
    }
    write_package(entries, source.len() + 512)
}

fn validate_print_options_change(change: &WorkbookPrintOptionsChange) -> Result<(), String> {
    if change.sheet.trim().is_empty() {
        return Err("工作表名称不能为空".into());
    }
    if change
        .first_page_number
        .is_some_and(|number| !(1..=32_767).contains(&number))
    {
        return Err("首页页码必须在 1 到 32767 之间".into());
    }
    Ok(())
}

fn print_options_event(
    original: Option<&BytesStart<'_>>,
    change: &WorkbookPrintOptionsChange,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("printOptions");
    if let Some(original) = original {
        for attribute in original.attributes().with_checks(false) {
            let attribute = attribute.map_err(|error| format!("解析打印选项属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"gridLines" | b"headings" | b"horizontalCentered" | b"verticalCentered"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    for (name, enabled) in [
        ("gridLines", change.grid_lines),
        ("headings", change.headings),
        ("horizontalCentered", change.horizontal_centered),
        ("verticalCentered", change.vertical_centered),
    ] {
        event.push_attribute((name, if enabled { "1" } else { "0" }));
    }
    Ok(event.into_owned())
}

fn print_page_setup_event(
    original: Option<&BytesStart<'_>>,
    change: &WorkbookPrintOptionsChange,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("pageSetup");
    if let Some(original) = original {
        for attribute in original.attributes().with_checks(false) {
            let attribute = attribute.map_err(|error| format!("解析打印页面属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"blackAndWhite" | b"draft" | b"firstPageNumber" | b"useFirstPageNumber"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    event.push_attribute((
        "blackAndWhite",
        if change.black_and_white { "1" } else { "0" },
    ));
    event.push_attribute(("draft", if change.draft { "1" } else { "0" }));
    if let Some(number) = change.first_page_number {
        let number = number.to_string();
        event.push_attribute(("firstPageNumber", number.as_str()));
        event.push_attribute(("useFirstPageNumber", "1"));
    } else {
        event.push_attribute(("useFirstPageNumber", "0"));
    }
    Ok(event.into_owned())
}

fn patch_print_options_xml(
    xml: &[u8],
    change: &WorkbookPrintOptionsChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 160));
    let mut buffer = Vec::new();
    let mut wrote_options = false;
    let mut wrote_setup = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析打印选项失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"printOptions" => {
                writer
                    .write_event(Event::Empty(print_options_event(Some(start), change)?))
                    .map_err(|error| format!("写入打印选项失败: {error}"))?;
                skip_element(&mut reader, b"printOptions", &mut buffer)?;
                wrote_options = true;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"printOptions" => {
                writer
                    .write_event(Event::Empty(print_options_event(Some(start), change)?))
                    .map_err(|error| format!("写入打印选项失败: {error}"))?;
                wrote_options = true;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"pageSetup" => {
                if !wrote_options {
                    writer
                        .write_event(Event::Empty(print_options_event(None, change)?))
                        .map_err(|error| format!("新增打印选项失败: {error}"))?;
                    wrote_options = true;
                }
                writer
                    .write_event(Event::Empty(print_page_setup_event(Some(start), change)?))
                    .map_err(|error| format!("写入打印页面属性失败: {error}"))?;
                skip_element(&mut reader, b"pageSetup", &mut buffer)?;
                wrote_setup = true;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"pageSetup" => {
                if !wrote_options {
                    writer
                        .write_event(Event::Empty(print_options_event(None, change)?))
                        .map_err(|error| format!("新增打印选项失败: {error}"))?;
                    wrote_options = true;
                }
                writer
                    .write_event(Event::Empty(print_page_setup_event(Some(start), change)?))
                    .map_err(|error| format!("写入打印页面属性失败: {error}"))?;
                wrote_setup = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !wrote_options && start.local_name().as_ref() == b"pageMargins" =>
            {
                writer
                    .write_event(Event::Empty(print_options_event(None, change)?))
                    .map_err(|error| format!("新增打印选项失败: {error}"))?;
                wrote_options = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if (!wrote_options || !wrote_setup)
                    && matches!(
                        start.local_name().as_ref(),
                        b"headerFooter"
                            | b"rowBreaks"
                            | b"colBreaks"
                            | b"customProperties"
                            | b"drawing"
                            | b"legacyDrawing"
                            | b"legacyDrawingHF"
                            | b"picture"
                            | b"oleObjects"
                            | b"controls"
                            | b"webPublishItems"
                            | b"tableParts"
                            | b"extLst"
                    ) =>
            {
                if !wrote_options {
                    writer
                        .write_event(Event::Empty(print_options_event(None, change)?))
                        .map_err(|error| format!("新增打印选项失败: {error}"))?;
                    wrote_options = true;
                }
                if !wrote_setup {
                    writer
                        .write_event(Event::Empty(print_page_setup_event(None, change)?))
                        .map_err(|error| format!("新增打印页面属性失败: {error}"))?;
                    wrote_setup = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
            }
            Event::End(ref end)
                if end.local_name().as_ref() == b"worksheet"
                    && (!wrote_options || !wrote_setup) =>
            {
                if !wrote_options {
                    writer
                        .write_event(Event::Empty(print_options_event(None, change)?))
                        .map_err(|error| format!("新增打印选项失败: {error}"))?;
                    wrote_options = true;
                }
                if !wrote_setup {
                    writer
                        .write_event(Event::Empty(print_page_setup_event(None, change)?))
                        .map_err(|error| format!("新增打印页面属性失败: {error}"))?;
                    wrote_setup = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表 XML 失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if !wrote_options || !wrote_setup {
        return Err("无法写入打印选项".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_print_options(
    source: &[u8],
    change: &WorkbookPrintOptionsChange,
) -> Result<Vec<u8>, String> {
    validate_print_options_change(change)?;
    let mut entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let sheet_path = paths
        .get(change.sheet.trim())
        .ok_or_else(|| format!("工作表不存在: {}", change.sheet))?
        .clone();
    let sheet_index = entries
        .iter()
        .position(|entry| entry.name == sheet_path)
        .ok_or("工作表部件缺失")?;
    if parse_page_layout(&entries[sheet_index].data)?
        .protection
        .enabled
    {
        return Err("受保护的工作表不能修改打印选项；LongEdit 不会绕过 Excel 保护".into());
    }
    entries[sheet_index].data = patch_print_options_xml(&entries[sheet_index].data, change)?;
    let parsed = parse_page_layout(&entries[sheet_index].data)?;
    let expected_options = WorkbookPrintOptions {
        grid_lines: change.grid_lines,
        headings: change.headings,
        horizontal_centered: change.horizontal_centered,
        vertical_centered: change.vertical_centered,
    };
    if parsed.options != expected_options
        || parsed.setup.black_and_white != change.black_and_white
        || parsed.setup.draft != change.draft
        || parsed.setup.first_page_number != change.first_page_number
        || parsed.setup.use_first_page_number != change.first_page_number.is_some()
    {
        return Err("打印选项写回后的语义校验失败".into());
    }
    write_package(entries, source.len() + 256)
}

fn validate_header_footer_change(change: &WorkbookHeaderFooterChange) -> Result<(), String> {
    if change.sheet.trim().is_empty() {
        return Err("工作表名称不能为空".into());
    }
    for (name, value) in [
        ("奇数页页眉", &change.odd_header),
        ("奇数页页脚", &change.odd_footer),
        ("偶数页页眉", &change.even_header),
        ("偶数页页脚", &change.even_footer),
        ("首页页眉", &change.first_header),
        ("首页页脚", &change.first_footer),
    ] {
        if value.chars().count() > MAX_EDITABLE_HEADER_FOOTER_TEXT {
            return Err(format!(
                "{name}不能超过 {MAX_EDITABLE_HEADER_FOOTER_TEXT} 个字符"
            ));
        }
        if value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
        {
            return Err(format!("{name}包含不受支持的控制字符"));
        }
    }
    Ok(())
}

fn header_footer_start_event(
    original: Option<&BytesStart<'_>>,
    change: &WorkbookHeaderFooterChange,
) -> Result<BytesStart<'static>, String> {
    let mut event = BytesStart::new("headerFooter");
    if let Some(original) = original {
        for attribute in original.attributes().with_checks(false) {
            let attribute = attribute.map_err(|error| format!("解析页眉页脚属性失败: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"differentOddEven" | b"differentFirst" | b"scaleWithDoc" | b"alignWithMargins"
            ) {
                event.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    }
    event.push_attribute((
        "differentOddEven",
        if change.different_odd_even { "1" } else { "0" },
    ));
    event.push_attribute((
        "differentFirst",
        if change.different_first_page {
            "1"
        } else {
            "0"
        },
    ));
    event.push_attribute((
        "scaleWithDoc",
        if change.scale_with_document { "1" } else { "0" },
    ));
    event.push_attribute((
        "alignWithMargins",
        if change.align_with_margins { "1" } else { "0" },
    ));
    Ok(event.into_owned())
}

fn write_header_footer_element(
    writer: &mut Writer<Vec<u8>>,
    original: Option<&BytesStart<'_>>,
    change: &WorkbookHeaderFooterChange,
) -> Result<(), String> {
    writer
        .write_event(Event::Start(header_footer_start_event(original, change)?))
        .map_err(|error| format!("写入页眉页脚失败: {error}"))?;
    for (element, value) in [
        ("oddHeader", &change.odd_header),
        ("oddFooter", &change.odd_footer),
        ("evenHeader", &change.even_header),
        ("evenFooter", &change.even_footer),
        ("firstHeader", &change.first_header),
        ("firstFooter", &change.first_footer),
    ] {
        if value.is_empty() {
            continue;
        }
        writer
            .write_event(Event::Start(BytesStart::new(element)))
            .and_then(|_| writer.write_event(Event::Text(BytesText::new(value))))
            .and_then(|_| writer.write_event(Event::End(BytesEnd::new(element))))
            .map_err(|error| format!("写入页眉页脚文本失败: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("headerFooter")))
        .map_err(|error| format!("结束页眉页脚失败: {error}"))
}

fn patch_header_footer_xml(
    xml: &[u8],
    change: &WorkbookHeaderFooterChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 256));
    let mut buffer = Vec::new();
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析页眉页脚失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"headerFooter" => {
                write_header_footer_element(&mut writer, Some(start), change)?;
                skip_element(&mut reader, b"headerFooter", &mut buffer)?;
                inserted = true;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"headerFooter" => {
                write_header_footer_element(&mut writer, Some(start), change)?;
                inserted = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !inserted
                    && matches!(
                        start.local_name().as_ref(),
                        b"rowBreaks"
                            | b"colBreaks"
                            | b"customProperties"
                            | b"drawing"
                            | b"legacyDrawing"
                            | b"legacyDrawingHF"
                            | b"picture"
                            | b"oleObjects"
                            | b"controls"
                            | b"webPublishItems"
                            | b"tableParts"
                            | b"extLst"
                    ) =>
            {
                write_header_footer_element(&mut writer, None, change)?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("复制工作表 XML 失败: {error}"))?;
            }
            Event::End(ref end) if !inserted && end.local_name().as_ref() == b"worksheet" => {
                write_header_footer_element(&mut writer, None, change)?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("结束工作表 XML 失败: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制工作表 XML 失败: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("无法写入页眉页脚".into());
    }
    Ok(writer.into_inner())
}

fn normalized_header_footer_text(value: &str) -> Option<&str> {
    (!value.is_empty()).then_some(value)
}

pub fn patch_workbook_header_footer(
    source: &[u8],
    change: &WorkbookHeaderFooterChange,
) -> Result<Vec<u8>, String> {
    validate_header_footer_change(change)?;
    let mut entries = load_package(source)?;
    let paths = workbook_sheet_paths(&entries)?;
    let sheet_path = paths
        .get(change.sheet.trim())
        .ok_or_else(|| format!("工作表不存在: {}", change.sheet))?
        .clone();
    let sheet_index = entries
        .iter()
        .position(|entry| entry.name == sheet_path)
        .ok_or("工作表部件缺失")?;
    if parse_page_layout(&entries[sheet_index].data)?
        .protection
        .enabled
    {
        return Err("受保护的工作表不能修改页眉页脚；LongEdit 不会绕过 Excel 保护".into());
    }
    entries[sheet_index].data = patch_header_footer_xml(&entries[sheet_index].data, change)?;
    let parsed = parse_page_layout(&entries[sheet_index].data)?.header_footer;
    if parsed.odd_header.as_deref() != normalized_header_footer_text(&change.odd_header)
        || parsed.odd_footer.as_deref() != normalized_header_footer_text(&change.odd_footer)
        || parsed.even_header.as_deref() != normalized_header_footer_text(&change.even_header)
        || parsed.even_footer.as_deref() != normalized_header_footer_text(&change.even_footer)
        || parsed.first_header.as_deref() != normalized_header_footer_text(&change.first_header)
        || parsed.first_footer.as_deref() != normalized_header_footer_text(&change.first_footer)
        || parsed.different_odd_even != change.different_odd_even
        || parsed.different_first_page != change.different_first_page
        || parsed.scale_with_document != change.scale_with_document
        || parsed.align_with_margins != change.align_with_margins
    {
        return Err("页眉页脚写回后的语义校验失败".into());
    }
    write_package(entries, source.len() + 384)
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
        let may_have_sheet_protection = xml
            .data
            .windows(b"sheetProtection".len())
            .any(|window| window == b"sheetProtection");
        if may_have_sheet_protection && parse_page_layout(&xml.data)?.protection.enabled {
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

fn write_package_preserving_unchanged(
    source: &[u8],
    entries: Vec<PackageEntry>,
    modified_paths: &HashSet<String>,
) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 XLSX 原始包失败: {error}"))?;
    let cursor = Cursor::new(Vec::with_capacity(source.len()));
    let mut output = ZipWriter::new(cursor);
    let mut entries = entries
        .into_iter()
        .map(|entry| (entry.name.clone(), entry))
        .collect::<HashMap<_, _>>();

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 XLSX 原始部件失败: {error}"))?;
        let name = file.name().to_string();
        let entry = entries
            .remove(&name)
            .ok_or_else(|| format!("XLSX 写回部件清单缺少: {name}"))?;
        if modified_paths.contains(&name) {
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(entry.compression);
            if entry.compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(CELL_PATCH_DEFLATE_LEVEL));
            }
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
        } else {
            output
                .raw_copy_file(file)
                .map_err(|error| format!("复制未修改 XLSX 部件失败: {error}"))?;
        }
    }
    if !entries.is_empty() {
        return Err("普通工作簿写回不允许隐式新增 XLSX 部件".into());
    }
    output
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 XLSX 写回失败: {error}"))
}

fn table_reference(range: &WorkbookMergeRange) -> Result<String, String> {
    Ok(format!(
        "{}:{}",
        cell_reference(range.top, range.left)?,
        cell_reference(range.bottom, range.right)?
    ))
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct TableStyleSettings {
    name: Option<String>,
    show_first_column: bool,
    show_last_column: bool,
    show_row_stripes: bool,
    show_column_stripes: bool,
}

impl Default for TableStyleSettings {
    fn default() -> Self {
        Self {
            name: Some("TableStyleMedium2".into()),
            show_first_column: false,
            show_last_column: false,
            show_row_stripes: true,
            show_column_stripes: false,
        }
    }
}

fn validate_table_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 255 {
        return Err("The Table name must contain 1 to 255 characters.".into());
    }
    let mut chars = name.chars();
    if !chars
        .next()
        .is_some_and(|value| value.is_ascii_alphabetic() || matches!(value, '_' | '\\'))
        || !chars.all(|value| value.is_ascii_alphanumeric() || matches!(value, '_' | '.'))
    {
        return Err(
            "The Table name must start with a letter or underscore and contain no spaces.".into(),
        );
    }
    if parse_cell_reference(name).is_ok() {
        return Err("The Table name cannot be a cell reference.".into());
    }
    Ok(())
}

fn is_builtin_table_style(name: &str) -> bool {
    [
        ("TableStyleLight", 21u8),
        ("TableStyleMedium", 28u8),
        ("TableStyleDark", 11u8),
    ]
    .iter()
    .any(|(prefix, maximum)| {
        name.strip_prefix(prefix)
            .and_then(|suffix| suffix.parse::<u8>().ok())
            .is_some_and(|number| (1..=*maximum).contains(&number))
    })
}

fn validate_table_change(change: &WorkbookTableChange) -> Result<(), String> {
    let range = &change.range;
    if range.top > range.bottom
        || range.left > range.right
        || range.bottom >= MAX_XLSX_ROWS
        || range.right >= MAX_XLSX_COLUMNS
    {
        return Err("The Table range is outside the XLSX grid.".into());
    }
    if range.top == range.bottom {
        return Err("A Table needs a header row and at least one data row.".into());
    }
    let name = change.table_name.trim();
    validate_table_name(name)?;
    if let Some(new_name) = change.new_table_name.as_deref().map(str::trim) {
        validate_table_name(new_name)?;
    }
    if matches!(
        change.action,
        WorkbookTableAction::Create | WorkbookTableAction::Resize
    ) {
        let width = range.right - range.left + 1;
        if change.columns.len() != width {
            return Err("The Table column count must match the selected range width.".into());
        }
        let mut column_names = HashSet::new();
        for column in &change.columns {
            let column = column.trim();
            if column.is_empty() || column.len() > 255 {
                return Err("Table headers must contain 1 to 255 characters.".into());
            }
            if !column_names.insert(column.to_lowercase()) {
                return Err(format!("Table headers must be unique: {column}"));
            }
        }
    }
    if let Some(style_name) = change.style_name.as_deref().map(str::trim) {
        if !is_builtin_table_style(style_name) {
            return Err("The Table style must be a supported built-in Excel Table style.".into());
        }
    }
    Ok(())
}

fn table_root(xml: &[u8]) -> Result<(u32, String, WorkbookMergeRange, TableStyleSettings), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Excel Table: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"table" =>
            {
                let id = xml_value(event, b"id", reader.decoder())?
                    .ok_or("Excel Table is missing id")?
                    .parse::<u32>()
                    .map_err(|_| "Excel Table id is invalid")?;
                let name = xml_value(event, b"displayName", reader.decoder())?
                    .or(xml_value(event, b"name", reader.decoder())?)
                    .ok_or("Excel Table is missing a name")?;
                let range = parse_range_reference(
                    &xml_value(event, b"ref", reader.decoder())?
                        .ok_or("Excel Table is missing ref")?,
                )?;
                let style = read_table_style(xml)?;
                return Ok((id, name, range, style));
            }
            Event::Eof => return Err("Excel Table is missing its root element.".into()),
            _ => {}
        }
        buffer.clear();
    }
}

fn read_table_style(xml: &[u8]) -> Result<TableStyleSettings, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Excel Table style: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"tableStyleInfo" =>
            {
                return Ok(TableStyleSettings {
                    name: xml_value(event, b"name", reader.decoder())?,
                    show_first_column: bool_attribute(
                        event,
                        b"showFirstColumn",
                        reader.decoder(),
                        false,
                    )?,
                    show_last_column: bool_attribute(
                        event,
                        b"showLastColumn",
                        reader.decoder(),
                        false,
                    )?,
                    show_row_stripes: bool_attribute(
                        event,
                        b"showRowStripes",
                        reader.decoder(),
                        true,
                    )?,
                    show_column_stripes: bool_attribute(
                        event,
                        b"showColumnStripes",
                        reader.decoder(),
                        false,
                    )?,
                });
            }
            Event::Eof => return Ok(TableStyleSettings::default()),
            _ => {}
        }
        buffer.clear();
    }
}

fn ensure_simple_resizable_table(xml: &[u8]) -> Result<(), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to inspect Excel Table: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event) => {
                match event.local_name().as_ref() {
                    b"table"
                        if bool_attribute(event, b"totalsRowShown", reader.decoder(), false)? =>
                    {
                        return Err("Tables with a totals row cannot be resized yet.".into());
                    }
                    b"filterColumn" => {
                        return Err(
                            "Tables with active filter criteria cannot be resized yet.".into()
                        );
                    }
                    b"calculatedColumnFormula" | b"totalsRowFormula" => {
                        return Err(
                            "Tables with calculated or totals formulas cannot be resized yet."
                                .into(),
                        );
                    }
                    b"extLst" => {
                        return Err(
                            "Tables with extension metadata cannot be resized safely.".into()
                        );
                    }
                    _ => {}
                }
            }
            Event::Eof => return Ok(()),
            _ => {}
        }
        buffer.clear();
    }
}

fn build_table_xml(
    id: u32,
    name: &str,
    range: &WorkbookMergeRange,
    columns: &[String],
    style: &TableStyleSettings,
) -> Result<Vec<u8>, String> {
    let reference = table_reference(range)?;
    let mut writer = Writer::new(Vec::new());
    writer
        .write_event(Event::Decl(quick_xml::events::BytesDecl::new(
            "1.0",
            Some("UTF-8"),
            Some("yes"),
        )))
        .map_err(|error| format!("Failed to write Table declaration: {error}"))?;
    let mut table = BytesStart::new("table");
    let id_text = id.to_string();
    table.push_attribute((
        "xmlns",
        "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    ));
    table.push_attribute(("id", id_text.as_str()));
    table.push_attribute(("name", name));
    table.push_attribute(("displayName", name));
    table.push_attribute(("ref", reference.as_str()));
    table.push_attribute(("totalsRowShown", "0"));
    writer
        .write_event(Event::Start(table))
        .map_err(|error| format!("Failed to write Table: {error}"))?;
    let mut filter = BytesStart::new("autoFilter");
    filter.push_attribute(("ref", reference.as_str()));
    writer
        .write_event(Event::Empty(filter))
        .map_err(|error| format!("Failed to write Table filter: {error}"))?;
    let mut table_columns = BytesStart::new("tableColumns");
    let count = columns.len().to_string();
    table_columns.push_attribute(("count", count.as_str()));
    writer
        .write_event(Event::Start(table_columns))
        .map_err(|error| format!("Failed to write Table columns: {error}"))?;
    for (index, name) in columns.iter().enumerate() {
        let mut column = BytesStart::new("tableColumn");
        let id = (index + 1).to_string();
        column.push_attribute(("id", id.as_str()));
        column.push_attribute(("name", name.trim()));
        writer
            .write_event(Event::Empty(column))
            .map_err(|error| format!("Failed to write Table column: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("tableColumns")))
        .map_err(|error| format!("Failed to finish Table columns: {error}"))?;
    write_table_style(&mut writer, style)?;
    writer
        .write_event(Event::End(BytesEnd::new("table")))
        .map_err(|error| format!("Failed to finish Table: {error}"))?;
    Ok(writer.into_inner())
}

fn write_table_style(
    writer: &mut Writer<Vec<u8>>,
    style: &TableStyleSettings,
) -> Result<(), String> {
    let mut event = BytesStart::new("tableStyleInfo");
    if let Some(name) = style.name.as_deref() {
        event.push_attribute(("name", name));
    }
    event.push_attribute((
        "showFirstColumn",
        if style.show_first_column { "1" } else { "0" },
    ));
    event.push_attribute((
        "showLastColumn",
        if style.show_last_column { "1" } else { "0" },
    ));
    event.push_attribute((
        "showRowStripes",
        if style.show_row_stripes { "1" } else { "0" },
    ));
    event.push_attribute((
        "showColumnStripes",
        if style.show_column_stripes { "1" } else { "0" },
    ));
    writer
        .write_event(Event::Empty(event))
        .map_err(|error| format!("Failed to write Table style: {error}"))
}

fn patch_table_identity(xml: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut patched = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Excel Table name: {error}"))?;
        match event {
            Event::Start(ref start) if !patched && start.local_name().as_ref() == b"table" => {
                let updated = replace_xml_attribute(start, b"name", name, false)?;
                let updated = replace_xml_attribute(&updated, b"displayName", name, false)?;
                writer
                    .write_event(Event::Start(updated))
                    .map_err(|error| format!("Failed to write Excel Table name: {error}"))?;
                patched = true;
            }
            Event::Empty(ref start) if !patched && start.local_name().as_ref() == b"table" => {
                let updated = replace_xml_attribute(start, b"name", name, false)?;
                let updated = replace_xml_attribute(&updated, b"displayName", name, false)?;
                writer
                    .write_event(Event::Empty(updated))
                    .map_err(|error| format!("Failed to write Excel Table name: {error}"))?;
                patched = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy Excel Table: {error}"))?,
        }
        buffer.clear();
    }
    if !patched {
        return Err("Excel Table is missing its root element.".into());
    }
    Ok(writer.into_inner())
}

fn patch_table_style(xml: &[u8], style: &TableStyleSettings) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 100));
    let mut buffer = Vec::new();
    let mut patched = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse Excel Table style: {error}"))?;
        match event {
            Event::Start(ref start)
                if !patched && start.local_name().as_ref() == b"tableStyleInfo" =>
            {
                write_table_style(&mut writer, style)?;
                skip_element(&mut reader, b"tableStyleInfo", &mut buffer)?;
                patched = true;
            }
            Event::Empty(ref start)
                if !patched && start.local_name().as_ref() == b"tableStyleInfo" =>
            {
                write_table_style(&mut writer, style)?;
                patched = true;
            }
            Event::End(ref end) if !patched && end.local_name().as_ref() == b"table" => {
                write_table_style(&mut writer, style)?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Excel Table: {error}"))?;
                patched = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy Excel Table style: {error}"))?,
        }
        buffer.clear();
    }
    if !patched {
        return Err("Excel Table is missing its root element.".into());
    }
    Ok(writer.into_inner())
}

fn package_has_structured_table_reference(
    entries: &[PackageEntry],
    table_path: &str,
    table_name: &str,
) -> bool {
    let needle = format!("{}[", table_name.to_lowercase());
    entries.iter().any(|entry| {
        entry.name != table_path
            && entry.name.ends_with(".xml")
            && String::from_utf8_lossy(&entry.data)
                .to_lowercase()
                .contains(&needle)
    })
}

fn remove_table_relationship(xml: &[u8], relation_id: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut removed = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet relationships: {error}"))?;
        match event {
            Event::Start(ref start)
                if start.local_name().as_ref() == b"Relationship"
                    && xml_value(start, b"Id", reader.decoder())?.as_deref()
                        == Some(relation_id) =>
            {
                skip_element(&mut reader, b"Relationship", &mut buffer)?;
                removed = true;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"Relationship"
                    && xml_value(start, b"Id", reader.decoder())?.as_deref()
                        == Some(relation_id) =>
            {
                removed = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet relationships: {error}"))?,
        }
        buffer.clear();
    }
    if !removed {
        return Err("The worksheet Table relationship is missing.".into());
    }
    Ok(writer.into_inner())
}

fn remove_sheet_table_part(xml: &[u8], relation_id: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut part_count = 0usize;
    let mut found = false;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to inspect worksheet Table references: {error}"))?
        {
            Event::Start(ref start) | Event::Empty(ref start)
                if start.local_name().as_ref() == b"tablePart" =>
            {
                if xml_value(start, b"r:id", reader.decoder())?.as_deref() == Some(relation_id) {
                    found = true;
                } else {
                    part_count += 1;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if !found {
        return Err("The worksheet Table reference is missing.".into());
    }

    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet Table references: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"tableParts" => {
                if part_count == 0 {
                    skip_element(&mut reader, b"tableParts", &mut buffer)?;
                } else {
                    let updated =
                        replace_xml_attribute(start, b"count", &part_count.to_string(), false)?;
                    writer.write_event(Event::Start(updated)).map_err(|error| {
                        format!("Failed to update Table reference count: {error}")
                    })?;
                }
            }
            Event::Start(ref start)
                if start.local_name().as_ref() == b"tablePart"
                    && xml_value(start, b"r:id", reader.decoder())?.as_deref()
                        == Some(relation_id) =>
            {
                skip_element(&mut reader, b"tablePart", &mut buffer)?;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"tablePart"
                    && xml_value(start, b"r:id", reader.decoder())?.as_deref()
                        == Some(relation_id) => {}
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet Table references: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn remove_table_content_type(xml: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut removed = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse content types: {error}"))?;
        match event {
            Event::Start(ref start)
                if start.local_name().as_ref() == b"Override"
                    && xml_value(start, b"PartName", reader.decoder())?.as_deref()
                        == Some(part_name) =>
            {
                skip_element(&mut reader, b"Override", &mut buffer)?;
                removed = true;
            }
            Event::Empty(ref start)
                if start.local_name().as_ref() == b"Override"
                    && xml_value(start, b"PartName", reader.decoder())?.as_deref()
                        == Some(part_name) =>
            {
                removed = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy content types: {error}"))?,
        }
        buffer.clear();
    }
    if !removed {
        return Err("The Excel Table content type is missing.".into());
    }
    Ok(writer.into_inner())
}

fn patch_relationships_with_table(
    xml: &[u8],
    relation_id: &str,
    target: &str,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 180));
    let mut buffer = Vec::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet relationships: {error}"))?;
        match event {
            Event::End(ref end) if end.local_name().as_ref() == b"Relationships" => {
                let mut relationship = BytesStart::new("Relationship");
                relationship.push_attribute(("Id", relation_id));
                relationship.push_attribute((
                    "Type",
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/table",
                ));
                relationship.push_attribute(("Target", target));
                writer
                    .write_event(Event::Empty(relationship))
                    .map_err(|error| format!("Failed to add Table relationship: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish relationships: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy relationships: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn new_table_relationships(relation_id: &str, target: &str) -> Vec<u8> {
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"{relation_id}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/table\" Target=\"{target}\"/></Relationships>").into_bytes()
}

fn patch_sheet_with_table_part(xml: &[u8], relation_id: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 120));
    let mut buffer = Vec::new();
    let mut has_parts = false;
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet Table references: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"worksheet" => {
                let mut root = start.to_owned();
                if xml_value(start, b"xmlns:r", reader.decoder())?.is_none() {
                    root.push_attribute((
                        "xmlns:r",
                        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                    ));
                }
                writer
                    .write_event(Event::Start(root))
                    .map_err(|error| format!("Failed to write worksheet root: {error}"))?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"tableParts" => {
                has_parts = true;
                let count = xml_value(start, b"count", reader.decoder())?
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(0)
                    + 1;
                let updated = replace_xml_attribute(start, b"count", &count.to_string(), false)?;
                writer
                    .write_event(Event::Start(updated))
                    .map_err(|error| format!("Failed to update Table reference count: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"tableParts" => {
                let mut part = BytesStart::new("tablePart");
                part.push_attribute(("r:id", relation_id));
                writer
                    .write_event(Event::Empty(part))
                    .map_err(|error| format!("Failed to add Table reference: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish Table references: {error}"))?;
                inserted = true;
            }
            Event::Start(ref start)
                if !has_parts && !inserted && start.local_name().as_ref() == b"extLst" =>
            {
                write_new_table_parts(&mut writer, relation_id)?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy worksheet extensions: {error}"))?;
            }
            Event::End(ref end)
                if !has_parts && !inserted && end.local_name().as_ref() == b"worksheet" =>
            {
                write_new_table_parts(&mut writer, relation_id)?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish worksheet: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("Could not add the Table reference to the worksheet.".into());
    }
    Ok(writer.into_inner())
}

fn write_new_table_parts(writer: &mut Writer<Vec<u8>>, relation_id: &str) -> Result<(), String> {
    let mut parts = BytesStart::new("tableParts");
    parts.push_attribute(("count", "1"));
    writer
        .write_event(Event::Start(parts))
        .map_err(|error| format!("Failed to add Table references: {error}"))?;
    let mut part = BytesStart::new("tablePart");
    part.push_attribute(("r:id", relation_id));
    writer
        .write_event(Event::Empty(part))
        .map_err(|error| format!("Failed to add Table reference: {error}"))?;
    writer
        .write_event(Event::End(BytesEnd::new("tableParts")))
        .map_err(|error| format!("Failed to finish Table references: {error}"))
}

fn patch_content_types_with_table(xml: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 180));
    let mut buffer = Vec::new();
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse content types: {error}"))?;
        match event {
            Event::End(ref end) if end.local_name().as_ref() == b"Types" => {
                let mut item = BytesStart::new("Override");
                item.push_attribute(("PartName", part_name));
                item.push_attribute((
                    "ContentType",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
                ));
                writer
                    .write_event(Event::Empty(item))
                    .map_err(|error| format!("Failed to add Table content type: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish content types: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy content types: {error}"))?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

fn validate_conditional_format_ranges(ranges: &[WorkbookMergeRange]) -> Result<(), String> {
    if ranges.is_empty() || ranges.len() > MAX_VALIDATION_RANGES {
        return Err("A conditional-format rule must target at least one valid range.".into());
    }
    for range in ranges {
        if range.top > range.bottom
            || range.left > range.right
            || range.bottom >= MAX_XLSX_ROWS
            || range.right >= MAX_XLSX_COLUMNS
        {
            return Err("A conditional-format range is outside the XLSX grid.".into());
        }
    }
    Ok(())
}

fn validate_conditional_format_rule(rule: &WorkbookConditionalFormatRule) -> Result<(), String> {
    validate_conditional_format_ranges(&rule.ranges)?;
    if rule.kind == "cellIs" {
        if !conditional_operator_supported(rule.operator.as_deref()) {
            return Err("The cell-value conditional-format operator is unsupported.".into());
        }
        rule.formula1
            .as_deref()
            .map(str::trim)
            .and_then(|value| value.trim_start_matches('=').parse::<f64>().ok())
            .filter(|value| value.is_finite())
            .ok_or("The first conditional-format threshold must be a finite number.")?;
        if matches!(rule.operator.as_deref(), Some("between" | "notBetween")) {
            rule.formula2
                .as_deref()
                .map(str::trim)
                .and_then(|value| value.trim_start_matches('=').parse::<f64>().ok())
                .filter(|value| value.is_finite())
                .ok_or("Between and not-between rules require a finite second threshold.")?;
        }
    } else if rule.kind == "expression" {
        if rule.operator.is_some() || rule.formula2.is_some() {
            return Err(
                "Expression conditional formats cannot have an operator or second formula.".into(),
            );
        }
        let formula = rule
            .formula1
            .as_deref()
            .ok_or("An expression conditional format requires a formula.")?;
        if !safe_conditional_expression_supported(formula) {
            return Err("The expression must use the safe AND/OR/NOT subset with A1 references and literal comparisons.".into());
        }
    } else if rule.kind == "colorScale" {
        if rule.operator.is_some() || rule.formula1.is_some() || rule.formula2.is_some() {
            return Err("Color scales cannot have an operator or formula.".into());
        }
        let points = rule
            .color_scale
            .as_ref()
            .map(|scale| scale.points.as_slice())
            .ok_or("A color scale requires threshold and color points.")?;
        if !matches!(points.len(), 2 | 3) {
            return Err("A color scale must have two or three points.".into());
        }
        for (index, point) in points.iter().enumerate() {
            let valid = match point.kind.as_str() {
                "min" | "max" => point.value.is_none(),
                "num" => point.value.as_deref().is_some_and(|value| {
                    value.parse::<f64>().is_ok_and(|number| number.is_finite())
                }),
                "percent" | "percentile" => point.value.as_deref().is_some_and(|value| {
                    value
                        .parse::<f64>()
                        .is_ok_and(|number| number.is_finite() && (0.0..=100.0).contains(&number))
                }),
                _ => false,
            };
            if !valid {
                return Err(
                    "Color-scale thresholds must use min, max, num, percent, or percentile.".into(),
                );
            }
            if (point.kind == "min" && index != 0)
                || (point.kind == "max" && index + 1 != points.len())
            {
                return Err("Min and max color-scale thresholds must be endpoints.".into());
            }
        }
        if points.iter().all(|point| point.kind == "num") {
            let values = points
                .iter()
                .filter_map(|point| point.value.as_deref()?.parse::<f64>().ok())
                .collect::<Vec<_>>();
            if values.len() != points.len() || !values.windows(2).all(|pair| pair[0] < pair[1]) {
                return Err("Fixed color-scale thresholds must be strictly increasing.".into());
            }
        }
        if rule.style != WorkbookConditionalFormatStyle::default() {
            return Err("Color scales store colors in the scale instead of a DXF style.".into());
        }
    } else if rule.kind == "dataBar" {
        if rule.operator.is_some() || rule.formula1.is_some() || rule.formula2.is_some() {
            return Err("Data bars cannot have an operator or formula.".into());
        }
        let bar = rule
            .data_bar
            .as_ref()
            .ok_or("A data-bar rule requires bar settings.")?;
        let threshold = |point: &WorkbookConditionalThreshold| match point.kind.as_str() {
            "min" | "max" => point.value.is_none(),
            "num" => point
                .value
                .as_deref()
                .is_some_and(|value| value.parse::<f64>().is_ok_and(|number| number.is_finite())),
            "percent" | "percentile" => point.value.as_deref().is_some_and(|value| {
                value
                    .parse::<f64>()
                    .is_ok_and(|number| number.is_finite() && (0.0..=100.0).contains(&number))
            }),
            _ => false,
        };
        if !threshold(&bar.minimum) || !threshold(&bar.maximum) {
            return Err(
                "Data-bar thresholds must use min, max, num, percent, or percentile.".into(),
            );
        }
        if bar.minimum.kind == "max" || bar.maximum.kind == "min" {
            return Err("Min and max data-bar thresholds must be endpoints.".into());
        }
        if bar.minimum.kind == "num" && bar.maximum.kind == "num" {
            let minimum = bar
                .minimum
                .value
                .as_deref()
                .and_then(|value| value.parse::<f64>().ok())
                .ok_or("The data-bar minimum must be a finite number.")?;
            let maximum = bar
                .maximum
                .value
                .as_deref()
                .and_then(|value| value.parse::<f64>().ok())
                .ok_or("The data-bar maximum must be a finite number.")?;
            if minimum >= maximum {
                return Err("Fixed data-bar thresholds must be strictly increasing.".into());
            }
        }
        if bar.min_length > bar.max_length || bar.max_length > 100 {
            return Err("Data-bar lengths must satisfy 0 <= minLength <= maxLength <= 100.".into());
        }
        if rule.style != WorkbookConditionalFormatStyle::default() || rule.color_scale.is_some() {
            return Err("Data bars cannot include a DXF style or color scale.".into());
        }
    } else if rule.kind == "iconSet" {
        if rule.operator.is_some() || rule.formula1.is_some() || rule.formula2.is_some() {
            return Err("Icon sets cannot have an operator or formula.".into());
        }
        let icon_set = rule
            .icon_set
            .as_ref()
            .ok_or("An icon-set rule requires icon settings.")?;
        let expected = standard_icon_set_count(&icon_set.icon_set)
            .ok_or("The selected icon set requires an x14 extension and is read-only.")?;
        if icon_set.thresholds.len() != expected {
            return Err("The icon threshold count must match the selected icon set.".into());
        }
        for point in &icon_set.thresholds {
            let valid = match point.kind.as_str() {
                "num" => point.value.as_deref().is_some_and(|value| {
                    value.parse::<f64>().is_ok_and(|number| number.is_finite())
                }),
                "percent" | "percentile" => point.value.as_deref().is_some_and(|value| {
                    value
                        .parse::<f64>()
                        .is_ok_and(|number| number.is_finite() && (0.0..=100.0).contains(&number))
                }),
                _ => false,
            };
            if !valid {
                return Err("Icon thresholds must use num, percent, or percentile.".into());
            }
        }
        if !icon_set.thresholds.first().is_some_and(|point| {
            point.kind == "percent" && point.value.as_deref() == Some("0") && point.inclusive
        }) {
            return Err("The first icon threshold must be inclusive percent:0.".into());
        }
        if icon_set
            .thresholds
            .windows(2)
            .all(|pair| pair[0].kind == pair[1].kind)
        {
            let values = icon_set
                .thresholds
                .iter()
                .filter_map(|point| point.value.as_deref()?.parse::<f64>().ok())
                .collect::<Vec<_>>();
            if values.len() != expected || !values.windows(2).all(|pair| pair[0] <= pair[1]) {
                return Err("Icon thresholds must be ordered from low to high.".into());
            }
        }
        if rule.style != WorkbookConditionalFormatStyle::default()
            || rule.color_scale.is_some()
            || rule.data_bar.is_some()
        {
            return Err("Icon sets cannot include a DXF style, color scale, or data bar.".into());
        }
    } else {
        return Err("Only basic cell-value and direct-reference expression conditional formats can be edited.".into());
    }
    let valid_color = |value: &str| {
        value.len() == 7
            && value.starts_with('#')
            && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    };
    for color in [
        rule.style.font_color.as_deref(),
        rule.style.fill_color.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if !valid_color(color) {
            return Err("Conditional-format colors must use #RRGGBB.".into());
        }
    }
    if let Some(scale) = rule.color_scale.as_ref() {
        if scale.points.iter().any(|point| !valid_color(&point.color)) {
            return Err("Color-scale colors must use #RRGGBB.".into());
        }
    }
    if let Some(bar) = rule.data_bar.as_ref() {
        if !valid_color(&bar.color) {
            return Err("Data-bar colors must use #RRGGBB.".into());
        }
    }
    if !matches!(rule.kind.as_str(), "colorScale" | "dataBar" | "iconSet")
        && rule.style.font_color.is_none()
        && rule.style.fill_color.is_none()
        && !rule.style.bold
    {
        return Err("Choose at least one conditional-format visual style.".into());
    }
    Ok(())
}

fn write_conditional_dxf(
    writer: &mut Writer<Vec<u8>>,
    style: &WorkbookConditionalFormatStyle,
) -> Result<(), String> {
    writer
        .write_event(Event::Start(BytesStart::new("dxf")))
        .map_err(|error| format!("Failed to write conditional-format style: {error}"))?;
    if style.font_color.is_some() || style.bold {
        writer
            .write_event(Event::Start(BytesStart::new("font")))
            .map_err(|error| format!("Failed to write conditional-format font: {error}"))?;
        if style.bold {
            writer
                .write_event(Event::Empty(BytesStart::new("b")))
                .map_err(|error| {
                    format!("Failed to write conditional-format bold style: {error}")
                })?;
        }
        if let Some(color) = style.font_color.as_deref() {
            let value = format!("FF{}", color.trim_start_matches('#').to_ascii_uppercase());
            let mut item = BytesStart::new("color");
            item.push_attribute(("rgb", value.as_str()));
            writer.write_event(Event::Empty(item)).map_err(|error| {
                format!("Failed to write conditional-format font color: {error}")
            })?;
        }
        writer
            .write_event(Event::End(BytesEnd::new("font")))
            .map_err(|error| format!("Failed to finish conditional-format font: {error}"))?;
    }
    if let Some(color) = style.fill_color.as_deref() {
        let value = format!("FF{}", color.trim_start_matches('#').to_ascii_uppercase());
        writer
            .write_event(Event::Start(BytesStart::new("fill")))
            .map_err(|error| format!("Failed to write conditional-format fill: {error}"))?;
        let mut pattern = BytesStart::new("patternFill");
        pattern.push_attribute(("patternType", "solid"));
        writer
            .write_event(Event::Start(pattern))
            .map_err(|error| format!("Failed to write conditional-format fill pattern: {error}"))?;
        let mut foreground = BytesStart::new("fgColor");
        foreground.push_attribute(("rgb", value.as_str()));
        writer
            .write_event(Event::Empty(foreground))
            .map_err(|error| format!("Failed to write conditional-format fill color: {error}"))?;
        let mut background = BytesStart::new("bgColor");
        background.push_attribute(("indexed", "64"));
        writer
            .write_event(Event::Empty(background))
            .map_err(|error| format!("Failed to write conditional-format background: {error}"))?;
        writer
            .write_event(Event::End(BytesEnd::new("patternFill")))
            .map_err(|error| {
                format!("Failed to finish conditional-format fill pattern: {error}")
            })?;
        writer
            .write_event(Event::End(BytesEnd::new("fill")))
            .map_err(|error| format!("Failed to finish conditional-format fill: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("dxf")))
        .map_err(|error| format!("Failed to finish conditional-format style: {error}"))
}

fn patch_styles_add_conditional_dxf(
    xml: &[u8],
    style: &WorkbookConditionalFormatStyle,
) -> Result<(Vec<u8>, usize), String> {
    let existing_count = read_conditional_dxf_styles(xml)?.len();
    if existing_count >= MAX_CONDITIONAL_FORMAT_RULES {
        return Err("Too many conditional-format styles.".into());
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 180));
    let mut buffer = Vec::new();
    let mut found = false;
    let mut inserted = false;
    loop {
        let event = reader.read_event_into(&mut buffer).map_err(|error| {
            format!("Failed to parse styles for conditional formatting: {error}")
        })?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"dxfs" => {
                found = true;
                let mut container = BytesStart::new("dxfs");
                for attribute in start.attributes() {
                    let attribute = attribute
                        .map_err(|error| format!("Failed to read dxfs attributes: {error}"))?;
                    if attribute.key.as_ref() != b"count" {
                        container
                            .push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
                    }
                }
                let count = (existing_count + 1).to_string();
                container.push_attribute(("count", count.as_str()));
                writer
                    .write_event(Event::Start(container))
                    .map_err(|error| format!("Failed to write dxfs: {error}"))?;
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"dxfs" => {
                found = true;
                let mut container = BytesStart::new("dxfs");
                container.push_attribute(("count", "1"));
                writer
                    .write_event(Event::Start(container))
                    .map_err(|error| format!("Failed to write dxfs: {error}"))?;
                write_conditional_dxf(&mut writer, style)?;
                writer
                    .write_event(Event::End(BytesEnd::new("dxfs")))
                    .map_err(|error| format!("Failed to finish dxfs: {error}"))?;
                inserted = true;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"dxfs" => {
                write_conditional_dxf(&mut writer, style)?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish dxfs: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !found
                    && !inserted
                    && matches!(
                        start.local_name().as_ref(),
                        b"tableStyles" | b"colors" | b"extLst"
                    ) =>
            {
                let mut container = BytesStart::new("dxfs");
                container.push_attribute(("count", "1"));
                writer
                    .write_event(Event::Start(container))
                    .map_err(|error| format!("Failed to insert dxfs: {error}"))?;
                write_conditional_dxf(&mut writer, style)?;
                writer
                    .write_event(Event::End(BytesEnd::new("dxfs")))
                    .map_err(|error| format!("Failed to finish dxfs: {error}"))?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy styles: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"styleSheet" => {
                if !inserted {
                    let mut container = BytesStart::new("dxfs");
                    container.push_attribute(("count", "1"));
                    writer
                        .write_event(Event::Start(container))
                        .map_err(|error| format!("Failed to insert dxfs: {error}"))?;
                    write_conditional_dxf(&mut writer, style)?;
                    writer
                        .write_event(Event::End(BytesEnd::new("dxfs")))
                        .map_err(|error| format!("Failed to finish dxfs: {error}"))?;
                    inserted = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish styles: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy styles: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("Could not append the conditional-format style.".into());
    }
    Ok((writer.into_inner(), existing_count))
}

fn write_conditional_format_group(
    writer: &mut Writer<Vec<u8>>,
    rule: &WorkbookConditionalFormatRule,
    dxf_id: Option<usize>,
) -> Result<(), String> {
    let references = rule
        .ranges
        .iter()
        .map(table_reference)
        .collect::<Result<Vec<_>, _>>()?
        .join(" ");
    let mut group = BytesStart::new("conditionalFormatting");
    group.push_attribute(("sqref", references.as_str()));
    writer
        .write_event(Event::Start(group))
        .map_err(|error| format!("Failed to write conditional-format group: {error}"))?;
    let mut item = BytesStart::new("cfRule");
    item.push_attribute(("type", rule.kind.as_str()));
    if rule.kind == "cellIs" {
        item.push_attribute(("operator", rule.operator.as_deref().unwrap_or("equal")));
    }
    let priority = rule.priority.to_string();
    let dxf = dxf_id.map(|value| value.to_string());
    if let Some(dxf) = dxf.as_deref() {
        item.push_attribute(("dxfId", dxf));
    }
    item.push_attribute(("priority", priority.as_str()));
    if rule.stop_if_true {
        item.push_attribute(("stopIfTrue", "1"));
    }
    writer
        .write_event(Event::Start(item))
        .map_err(|error| format!("Failed to write conditional-format rule: {error}"))?;
    if let Some(scale) = rule.color_scale.as_ref() {
        writer
            .write_event(Event::Start(BytesStart::new("colorScale")))
            .map_err(|error| format!("Failed to write color scale: {error}"))?;
        for point in &scale.points {
            let mut threshold = BytesStart::new("cfvo");
            threshold.push_attribute(("type", point.kind.as_str()));
            if let Some(value) = point.value.as_deref() {
                threshold.push_attribute(("val", value));
            }
            writer
                .write_event(Event::Empty(threshold))
                .map_err(|error| format!("Failed to write color-scale threshold: {error}"))?;
        }
        for point in &scale.points {
            let argb = format!(
                "FF{}",
                point.color.trim_start_matches('#').to_ascii_uppercase()
            );
            let mut color = BytesStart::new("color");
            color.push_attribute(("rgb", argb.as_str()));
            writer
                .write_event(Event::Empty(color))
                .map_err(|error| format!("Failed to write color-scale color: {error}"))?;
        }
        writer
            .write_event(Event::End(BytesEnd::new("colorScale")))
            .map_err(|error| format!("Failed to finish color scale: {error}"))?;
    } else if let Some(bar) = rule.data_bar.as_ref() {
        let mut data_bar = BytesStart::new("dataBar");
        let min_length = bar.min_length.to_string();
        let max_length = bar.max_length.to_string();
        data_bar.push_attribute(("minLength", min_length.as_str()));
        data_bar.push_attribute(("maxLength", max_length.as_str()));
        if !bar.show_value {
            data_bar.push_attribute(("showValue", "0"));
        }
        writer
            .write_event(Event::Start(data_bar))
            .map_err(|error| format!("Failed to write data bar: {error}"))?;
        for point in [&bar.minimum, &bar.maximum] {
            let mut threshold = BytesStart::new("cfvo");
            threshold.push_attribute(("type", point.kind.as_str()));
            if let Some(value) = point.value.as_deref() {
                threshold.push_attribute(("val", value));
            }
            writer
                .write_event(Event::Empty(threshold))
                .map_err(|error| format!("Failed to write data-bar threshold: {error}"))?;
        }
        let argb = format!(
            "FF{}",
            bar.color.trim_start_matches('#').to_ascii_uppercase()
        );
        let mut color = BytesStart::new("color");
        color.push_attribute(("rgb", argb.as_str()));
        writer
            .write_event(Event::Empty(color))
            .map_err(|error| format!("Failed to write data-bar color: {error}"))?;
        writer
            .write_event(Event::End(BytesEnd::new("dataBar")))
            .map_err(|error| format!("Failed to finish data bar: {error}"))?;
    } else if let Some(icon_set) = rule.icon_set.as_ref() {
        let mut item = BytesStart::new("iconSet");
        item.push_attribute(("iconSet", icon_set.icon_set.as_str()));
        if icon_set.reverse {
            item.push_attribute(("reverse", "1"));
        }
        if !icon_set.show_value {
            item.push_attribute(("showValue", "0"));
        }
        writer
            .write_event(Event::Start(item))
            .map_err(|error| format!("Failed to write icon set: {error}"))?;
        for point in &icon_set.thresholds {
            let mut threshold = BytesStart::new("cfvo");
            threshold.push_attribute(("type", point.kind.as_str()));
            if let Some(value) = point.value.as_deref() {
                threshold.push_attribute(("val", value));
            }
            if !point.inclusive {
                threshold.push_attribute(("gte", "0"));
            }
            writer
                .write_event(Event::Empty(threshold))
                .map_err(|error| format!("Failed to write icon-set threshold: {error}"))?;
        }
        writer
            .write_event(Event::End(BytesEnd::new("iconSet")))
            .map_err(|error| format!("Failed to finish icon set: {error}"))?;
    } else {
        for formula in [rule.formula1.as_deref(), rule.formula2.as_deref()]
            .into_iter()
            .flatten()
        {
            writer
                .write_event(Event::Start(BytesStart::new("formula")))
                .map_err(|error| format!("Failed to write conditional-format formula: {error}"))?;
            writer
                .write_event(Event::Text(BytesText::new(formula.trim())))
                .map_err(|error| format!("Failed to write conditional-format formula: {error}"))?;
            writer
                .write_event(Event::End(BytesEnd::new("formula")))
                .map_err(|error| format!("Failed to finish conditional-format formula: {error}"))?;
        }
    }
    writer
        .write_event(Event::End(BytesEnd::new("cfRule")))
        .map_err(|error| format!("Failed to finish conditional-format rule: {error}"))?;
    writer
        .write_event(Event::End(BytesEnd::new("conditionalFormatting")))
        .map_err(|error| format!("Failed to finish conditional-format group: {error}"))
}

fn write_conditional_format_rule(
    writer: &mut Writer<Vec<u8>>,
    rule: &WorkbookConditionalFormatRule,
    dxf_id: Option<usize>,
) -> Result<(), String> {
    let mut group_writer = Writer::new(Vec::new());
    write_conditional_format_group(&mut group_writer, rule, dxf_id)?;
    let generated = group_writer.into_inner();
    let mut reader = Reader::from_reader(generated.as_slice());
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut inside_group = false;
    loop {
        let event = reader.read_event_into(&mut buffer).map_err(|error| {
            format!("Failed to parse generated conditional-format rule: {error}")
        })?;
        match event {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                inside_group = true;
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => break,
            Event::Eof => {
                return Err("Generated conditional-format rule ended unexpectedly.".into())
            }
            _ if inside_group => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to write conditional-format rule: {error}"))?,
            _ => {}
        }
        buffer.clear();
    }
    Ok(())
}

fn patch_sheet_conditional_format_group_rule(
    xml: &[u8],
    change: &WorkbookConditionalFormatChange,
    rule: Option<&WorkbookConditionalFormatRule>,
    dxf_id: Option<usize>,
) -> Result<Vec<u8>, String> {
    let target_group = change
        .group_index
        .ok_or("The selected conditional-format group no longer exists.")?;
    let target_rule = change
        .rule_index
        .ok_or("The selected conditional-format rule no longer exists.")?;
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 256));
    let mut buffer = Vec::new();
    let mut next_group = 0usize;
    let mut current_group = None;
    let mut next_rule = 0usize;
    let mut skip_depth = 0usize;
    let mut patched = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse grouped conditional formats: {error}"))?;
        if skip_depth > 0 {
            match event {
                Event::Start(_) => skip_depth += 1,
                Event::End(_) => skip_depth -= 1,
                Event::Eof => {
                    return Err("Grouped conditional-format XML ended unexpectedly.".into())
                }
                _ => {}
            }
            buffer.clear();
            continue;
        }
        match event {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                current_group = Some(next_group);
                next_group += 1;
                next_rule = 0;
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to copy grouped conditional formatting: {error}")
                })?;
            }
            Event::Start(ref start)
                if start.name().as_ref() == b"cfRule" && current_group == Some(target_group) =>
            {
                let current_rule = next_rule;
                next_rule += 1;
                if current_rule == target_rule {
                    if change.action == WorkbookConditionalFormatAction::Update {
                        write_conditional_format_rule(
                            &mut writer,
                            rule.ok_or("A replacement rule is required.")?,
                            dxf_id,
                        )?;
                    }
                    patched = true;
                    skip_depth = 1;
                } else {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to copy grouped conditional-format rule: {error}")
                    })?;
                }
            }
            Event::Empty(ref start)
                if start.name().as_ref() == b"cfRule" && current_group == Some(target_group) =>
            {
                let current_rule = next_rule;
                next_rule += 1;
                if current_rule == target_rule {
                    if change.action == WorkbookConditionalFormatAction::Update {
                        write_conditional_format_rule(
                            &mut writer,
                            rule.ok_or("A replacement rule is required.")?,
                            dxf_id,
                        )?;
                    }
                    patched = true;
                } else {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to copy grouped conditional-format rule: {error}")
                    })?;
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => {
                current_group = None;
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to finish grouped conditional formatting: {error}")
                })?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy grouped conditional formats: {error}"))?,
        }
        buffer.clear();
    }
    if !patched {
        return Err("The selected conditional-format rule no longer exists.".into());
    }
    Ok(writer.into_inner())
}

fn extract_conditional_format_rule_xml(
    xml: &[u8],
    target_group: usize,
    target_rule: usize,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::new());
    let mut buffer = Vec::new();
    let mut next_group = 0usize;
    let mut current_group = None;
    let mut next_rule = 0usize;
    let mut capture_depth = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse conditional-format rule XML: {error}"))?;
        if capture_depth > 0 {
            match &event {
                Event::Start(_) => capture_depth += 1,
                Event::End(_) => capture_depth -= 1,
                Event::Eof => return Err("Conditional-format rule XML ended unexpectedly.".into()),
                _ => {}
            }
            writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to capture conditional-format rule: {error}"))?;
            if capture_depth == 0 {
                return Ok(writer.into_inner());
            }
            buffer.clear();
            continue;
        }
        match event {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                current_group = Some(next_group);
                next_group += 1;
                next_rule = 0;
            }
            Event::Start(ref start)
                if start.name().as_ref() == b"cfRule" && current_group == Some(target_group) =>
            {
                let current_rule = next_rule;
                next_rule += 1;
                if current_rule == target_rule {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to capture conditional-format rule: {error}")
                    })?;
                    capture_depth = 1;
                }
            }
            Event::Empty(ref start)
                if start.name().as_ref() == b"cfRule" && current_group == Some(target_group) =>
            {
                let current_rule = next_rule;
                next_rule += 1;
                if current_rule == target_rule {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to capture conditional-format rule: {error}")
                    })?;
                    return Ok(writer.into_inner());
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => {
                current_group = None;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Err("The selected conditional-format rule no longer exists.".into())
}

fn write_conditional_format_rule_fragment(
    writer: &mut Writer<Vec<u8>>,
    rule_xml: &[u8],
) -> Result<(), String> {
    let mut reader = Reader::from_reader(rule_xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    loop {
        let event = reader.read_event_into(&mut buffer).map_err(|error| {
            format!("Failed to parse conditional-format rule fragment: {error}")
        })?;
        if matches!(event, Event::Eof) {
            break;
        }
        writer.write_event(event.into_owned()).map_err(|error| {
            format!("Failed to write conditional-format rule fragment: {error}")
        })?;
        buffer.clear();
    }
    Ok(())
}

fn write_raw_conditional_format_group(
    writer: &mut Writer<Vec<u8>>,
    ranges: &[WorkbookMergeRange],
    rule_xml: &[u8],
) -> Result<(), String> {
    let references = ranges
        .iter()
        .map(table_reference)
        .collect::<Result<Vec<_>, _>>()?
        .join(" ");
    let mut group = BytesStart::new("conditionalFormatting");
    group.push_attribute(("sqref", references.as_str()));
    writer
        .write_event(Event::Start(group))
        .map_err(|error| format!("Failed to write split conditional-format group: {error}"))?;
    write_conditional_format_rule_fragment(writer, rule_xml)?;
    writer
        .write_event(Event::End(BytesEnd::new("conditionalFormatting")))
        .map_err(|error| format!("Failed to finish split conditional-format group: {error}"))
}

fn insert_raw_conditional_format_group(
    xml: &[u8],
    ranges: &[WorkbookMergeRange],
    rule_xml: &[u8],
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + rule_xml.len() + 96));
    let mut buffer = Vec::new();
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet for split rule: {error}"))?;
        match event {
            Event::Start(ref start) | Event::Empty(ref start)
                if !inserted && conditional_format_later_element(start.local_name().as_ref()) =>
            {
                write_raw_conditional_format_group(&mut writer, ranges, rule_xml)?;
                inserted = true;
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to copy worksheet after split rule: {error}")
                })?;
            }
            Event::End(ref end) if end.name().as_ref() == b"worksheet" => {
                if !inserted {
                    write_raw_conditional_format_group(&mut writer, ranges, rule_xml)?;
                    inserted = true;
                }
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to finish worksheet after split rule: {error}")
                })?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet for split rule: {error}"))?,
        }
        buffer.clear();
    }
    if !inserted {
        return Err("Could not insert the split conditional-format group.".into());
    }
    Ok(writer.into_inner())
}

fn append_raw_conditional_format_rule(
    xml: &[u8],
    target_group: usize,
    rule_xml: &[u8],
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + rule_xml.len()));
    let mut buffer = Vec::new();
    let mut next_group = 0usize;
    let mut current_group = None;
    let mut appended = false;
    loop {
        let event = reader.read_event_into(&mut buffer).map_err(|error| {
            format!("Failed to parse worksheet for grouped rule merge: {error}")
        })?;
        match event {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                current_group = Some(next_group);
                next_group += 1;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy merge target group: {error}"))?;
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => {
                if current_group == Some(target_group) {
                    write_conditional_format_rule_fragment(&mut writer, rule_xml)?;
                    appended = true;
                }
                current_group = None;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish merge target group: {error}"))?;
            }
            Event::Eof => break,
            _ => writer.write_event(event.into_owned()).map_err(|error| {
                format!("Failed to copy worksheet for grouped rule merge: {error}")
            })?,
        }
        buffer.clear();
    }
    if !appended {
        return Err("The compatible conditional-format merge target no longer exists.".into());
    }
    Ok(writer.into_inner())
}

fn conditional_format_later_element(name: &[u8]) -> bool {
    matches!(
        name,
        b"dataValidations"
            | b"hyperlinks"
            | b"printOptions"
            | b"pageMargins"
            | b"pageSetup"
            | b"headerFooter"
            | b"rowBreaks"
            | b"colBreaks"
            | b"customProperties"
            | b"cellWatches"
            | b"ignoredErrors"
            | b"smartTags"
            | b"drawing"
            | b"legacyDrawing"
            | b"legacyDrawingHF"
            | b"picture"
            | b"oleObjects"
            | b"controls"
            | b"webPublishItems"
            | b"tableParts"
            | b"extLst"
    )
}

fn patch_sheet_conditional_formats(
    xml: &[u8],
    change: &WorkbookConditionalFormatChange,
    rule: Option<&WorkbookConditionalFormatRule>,
    dxf_id: Option<usize>,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 420));
    let mut buffer = Vec::new();
    let mut group_index = 0usize;
    let mut skip_depth = 0usize;
    let mut inserted = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet conditional formats: {error}"))?;
        if skip_depth > 0 {
            match event {
                Event::Start(_) => skip_depth += 1,
                Event::End(_) => skip_depth -= 1,
                Event::Eof => return Err("Conditional-format XML ended unexpectedly.".into()),
                _ => {}
            }
            buffer.clear();
            continue;
        }
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"conditionalFormatting" => {
                let current = group_index;
                group_index += 1;
                if change.group_index == Some(current)
                    && change.action != WorkbookConditionalFormatAction::Create
                {
                    if change.action == WorkbookConditionalFormatAction::Update {
                        write_conditional_format_group(
                            &mut writer,
                            rule.ok_or("A replacement rule is required.")?,
                            dxf_id,
                        )?;
                    }
                    skip_depth = 1;
                } else {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to copy conditional formatting: {error}")
                    })?;
                }
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"conditionalFormatting" => {
                let current = group_index;
                group_index += 1;
                if change.group_index == Some(current)
                    && change.action == WorkbookConditionalFormatAction::Update
                {
                    write_conditional_format_group(
                        &mut writer,
                        rule.ok_or("A replacement rule is required.")?,
                        dxf_id,
                    )?;
                } else if change.group_index != Some(current)
                    || change.action == WorkbookConditionalFormatAction::Create
                {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to copy conditional formatting: {error}")
                    })?;
                }
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if change.action == WorkbookConditionalFormatAction::Create
                    && !inserted
                    && conditional_format_later_element(start.local_name().as_ref()) =>
            {
                write_conditional_format_group(
                    &mut writer,
                    rule.ok_or("A conditional-format rule is required.")?,
                    dxf_id,
                )?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy worksheet: {error}"))?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"worksheet" => {
                if change.action == WorkbookConditionalFormatAction::Create && !inserted {
                    write_conditional_format_group(
                        &mut writer,
                        rule.ok_or("A conditional-format rule is required.")?,
                        dxf_id,
                    )?;
                    inserted = true;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish worksheet: {error}"))?;
            }
            Event::Eof => break,
            _ => writer.write_event(event.into_owned()).map_err(|error| {
                format!("Failed to copy worksheet conditional formats: {error}")
            })?,
        }
        buffer.clear();
    }
    if change.action == WorkbookConditionalFormatAction::Create && !inserted {
        return Err("Could not insert the conditional-format rule.".into());
    }
    Ok(writer.into_inner())
}

fn patch_sheet_conditional_format_priorities(
    xml: &[u8],
    priorities: &HashMap<(usize, usize), u32>,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut buffer = Vec::new();
    let mut next_group_index = 0usize;
    let mut current_group_index = None;
    let mut next_rule_index = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse conditional-format priorities: {error}"))?;
        match event {
            Event::Start(ref start) if start.name().as_ref() == b"conditionalFormatting" => {
                current_group_index = Some(next_group_index);
                next_group_index += 1;
                next_rule_index = 0;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy conditional-format group: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if start.name().as_ref() == b"cfRule" && current_group_index.is_some() =>
            {
                let identity = (current_group_index.unwrap_or_default(), next_rule_index);
                next_rule_index += 1;
                if let Some(priority) = priorities.get(&identity) {
                    let mut patched = start.to_owned();
                    patched.clear_attributes();
                    for attribute in start.attributes().with_checks(false) {
                        let attribute = attribute.map_err(|error| {
                            format!("Failed to parse conditional-format priority: {error}")
                        })?;
                        if attribute.key.as_ref() != b"priority" {
                            patched.push_attribute(attribute);
                        }
                    }
                    let priority = priority.to_string();
                    patched.push_attribute(("priority", priority.as_str()));
                    let patched_event = if matches!(event, Event::Start(_)) {
                        Event::Start(patched)
                    } else {
                        Event::Empty(patched)
                    };
                    writer.write_event(patched_event).map_err(|error| {
                        format!("Failed to write conditional-format priority: {error}")
                    })?;
                } else {
                    writer.write_event(event.into_owned()).map_err(|error| {
                        format!("Failed to copy conditional-format rule: {error}")
                    })?;
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"conditionalFormatting" => {
                current_group_index = None;
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to finish conditional-format group: {error}")
                })?;
            }
            Event::Eof => break,
            _ => writer.write_event(event.into_owned()).map_err(|error| {
                format!("Failed to copy worksheet conditional formats: {error}")
            })?,
        }
        buffer.clear();
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_conditional_format(
    source: &[u8],
    change: &WorkbookConditionalFormatChange,
) -> Result<Vec<u8>, String> {
    let mut entries = load_package(source)?;
    let sheet_path = workbook_sheet_paths(&entries)?
        .remove(&change.sheet)
        .ok_or_else(|| format!("Worksheet does not exist: {}", change.sheet))?;
    if read_workbook_sheet_layout(source, &change.sheet, 0, 1, 1)?
        .page_layout
        .protection
        .enabled
    {
        return Err("Protected worksheets cannot change conditional-format rules.".into());
    }
    let styles_xml = entries
        .iter()
        .find(|entry| entry.name == "xl/styles.xml")
        .ok_or("XLSX is missing xl/styles.xml")?
        .data
        .clone();
    let dxf_styles = read_conditional_dxf_styles(&styles_xml)?;
    let sheet_xml = entries
        .iter()
        .find(|entry| entry.name == sheet_path)
        .ok_or("The worksheet part is missing.")?
        .data
        .clone();
    let existing = read_conditional_formats(&sheet_xml, &dxf_styles)?;
    let mut normalized_rule = change.rule.clone();
    if matches!(
        change.action,
        WorkbookConditionalFormatAction::Split | WorkbookConditionalFormatAction::Merge
    ) {
        let group_index = change
            .group_index
            .ok_or("The selected conditional-format group no longer exists.")?;
        let rule_index = change
            .rule_index
            .ok_or("The selected conditional-format rule no longer exists.")?;
        let current = existing
            .iter()
            .find(|rule| rule.group_index == group_index && rule.rule_index == rule_index)
            .ok_or("The selected conditional-format rule no longer exists.")?;
        if !current.editable {
            return Err("This conditional-format rule is complex and cannot change groups.".into());
        }
        let source_group_size = existing
            .iter()
            .filter(|rule| rule.group_index == group_index)
            .count();
        let rule_xml = extract_conditional_format_rule_xml(&sheet_xml, group_index, rule_index)?;
        let patched = if change.action == WorkbookConditionalFormatAction::Split {
            if source_group_size < 2 {
                return Err(
                    "This conditional-format rule is already in an independent group.".into(),
                );
            }
            let ranges = &change
                .rule
                .as_ref()
                .ok_or("Splitting a conditional-format rule requires a target range.")?
                .ranges;
            validate_conditional_format_ranges(ranges)?;
            if ranges == &current.ranges {
                return Err("Choose a different target range when splitting a shared rule.".into());
            }
            let delete_change = WorkbookConditionalFormatChange {
                sheet: change.sheet.clone(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(group_index),
                rule_index: Some(rule_index),
                rule: None,
            };
            let without_rule =
                patch_sheet_conditional_format_group_rule(&sheet_xml, &delete_change, None, None)?;
            insert_raw_conditional_format_group(&without_rule, ranges, &rule_xml)?
        } else {
            if change.rule.is_some() {
                return Err(
                    "Merging a conditional-format rule must not replace its content.".into(),
                );
            }
            if source_group_size != 1 {
                return Err("Only an independent conditional-format rule can be merged into another shared-range group.".into());
            }
            let destination_group = existing
                .iter()
                .filter(|rule| rule.group_index != group_index && rule.ranges == current.ranges)
                .min_by_key(|rule| (rule.priority, rule.group_index, rule.rule_index))
                .map(|rule| rule.group_index)
                .ok_or("No compatible conditional-format group has the same range.")?;
            let with_appended =
                append_raw_conditional_format_rule(&sheet_xml, destination_group, &rule_xml)?;
            let delete_change = WorkbookConditionalFormatChange {
                sheet: change.sheet.clone(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(group_index),
                rule_index: Some(rule_index),
                rule: None,
            };
            patch_sheet_conditional_formats(&with_appended, &delete_change, None, None)?
        };
        let sheet = entries
            .iter_mut()
            .find(|entry| entry.name == sheet_path)
            .ok_or("The worksheet part is missing.")?;
        sheet.data = patched;
        return write_package(entries, source.len() + 1024);
    }
    if matches!(
        change.action,
        WorkbookConditionalFormatAction::MoveUp | WorkbookConditionalFormatAction::MoveDown
    ) {
        if change.rule.is_some() {
            return Err("Moving a conditional-format rule must not replace its content.".into());
        }
        let group_index = change
            .group_index
            .ok_or("The selected conditional-format group no longer exists.")?;
        let rule_index = change
            .rule_index
            .ok_or("The selected conditional-format rule no longer exists.")?;
        let current = existing
            .iter()
            .find(|rule| rule.group_index == group_index && rule.rule_index == rule_index)
            .ok_or("The selected conditional-format rule no longer exists.")?;
        if !current.editable {
            return Err("This conditional-format rule is complex and cannot be reordered.".into());
        }
        let mut ordered = existing.iter().collect::<Vec<_>>();
        ordered.sort_by_key(|rule| (rule.priority, rule.group_index, rule.rule_index));
        let current_index = ordered
            .iter()
            .position(|rule| rule.group_index == group_index && rule.rule_index == rule_index)
            .ok_or("The selected conditional-format rule no longer exists.")?;
        let target_index = if change.action == WorkbookConditionalFormatAction::MoveUp {
            current_index.checked_sub(1)
        } else if current_index + 1 < ordered.len() {
            Some(current_index + 1)
        } else {
            None
        }
        .ok_or("The conditional-format rule is already at that priority boundary.")?;
        ordered.swap(current_index, target_index);
        let priorities = ordered
            .iter()
            .enumerate()
            .map(|(index, rule)| ((rule.group_index, rule.rule_index), (index + 1) as u32))
            .collect::<HashMap<_, _>>();
        let sheet = entries
            .iter_mut()
            .find(|entry| entry.name == sheet_path)
            .ok_or("The worksheet part is missing.")?;
        sheet.data = patch_sheet_conditional_format_priorities(&sheet_xml, &priorities)?;
        return write_package(entries, source.len() + 1024);
    }
    match change.action {
        WorkbookConditionalFormatAction::Create => {
            if change.group_index.is_some() || change.rule_index.is_some() {
                return Err(
                    "Creating a conditional-format rule must not include an existing rule identity."
                        .into(),
                );
            }
            let next_priority = existing
                .iter()
                .map(|rule| rule.priority)
                .max()
                .unwrap_or(0)
                .saturating_add(1);
            let rule = normalized_rule
                .as_mut()
                .ok_or("A conditional-format rule is required.")?;
            rule.priority = next_priority;
            rule.group_index = existing
                .iter()
                .map(|rule| rule.group_index)
                .max()
                .map_or(0, |value| value + 1);
            rule.rule_index = 0;
            rule.editable = true;
            validate_conditional_format_rule(rule)?;
        }
        WorkbookConditionalFormatAction::Update | WorkbookConditionalFormatAction::Delete => {
            let group_index = change
                .group_index
                .ok_or("The selected conditional-format group no longer exists.")?;
            let rule_index = change
                .rule_index
                .ok_or("The selected conditional-format rule no longer exists.")?;
            let current = existing
                .iter()
                .find(|rule| rule.group_index == group_index && rule.rule_index == rule_index)
                .ok_or("The selected conditional-format rule no longer exists.")?;
            if !current.editable {
                return Err("This conditional-format rule is complex and read-only.".into());
            }
            if change.action == WorkbookConditionalFormatAction::Update {
                let rule = normalized_rule
                    .as_mut()
                    .ok_or("A replacement conditional-format rule is required.")?;
                let group_size = existing
                    .iter()
                    .filter(|rule| rule.group_index == group_index)
                    .count();
                if group_size > 1 && rule.ranges != current.ranges {
                    return Err("A rule in a shared-range conditional-format group cannot change its range until it is split into an independent group.".into());
                }
                rule.priority = current.priority;
                rule.group_index = group_index;
                rule.rule_index = rule_index;
                rule.editable = true;
                validate_conditional_format_rule(rule)?;
            } else if change.rule.is_some() {
                return Err(
                    "Deleting a conditional-format rule must not include a replacement rule."
                        .into(),
                );
            }
        }
        WorkbookConditionalFormatAction::MoveUp
        | WorkbookConditionalFormatAction::MoveDown
        | WorkbookConditionalFormatAction::Split
        | WorkbookConditionalFormatAction::Merge => {
            unreachable!("priority moves return before content patching")
        }
    }
    let dxf_id = if let Some(rule) = normalized_rule
        .as_ref()
        .filter(|rule| !matches!(rule.kind.as_str(), "colorScale" | "dataBar" | "iconSet"))
    {
        let (patched, id) = patch_styles_add_conditional_dxf(&styles_xml, &rule.style)?;
        entries
            .iter_mut()
            .find(|entry| entry.name == "xl/styles.xml")
            .ok_or("XLSX is missing xl/styles.xml")?
            .data = patched;
        Some(id)
    } else {
        None
    };
    let sheet = entries
        .iter_mut()
        .find(|entry| entry.name == sheet_path)
        .ok_or("The worksheet part is missing.")?;
    let selected_group_size = change.group_index.map_or(0, |group_index| {
        existing
            .iter()
            .filter(|rule| rule.group_index == group_index)
            .count()
    });
    sheet.data = if selected_group_size > 1
        && matches!(
            change.action,
            WorkbookConditionalFormatAction::Update | WorkbookConditionalFormatAction::Delete
        ) {
        patch_sheet_conditional_format_group_rule(
            &sheet_xml,
            change,
            normalized_rule.as_ref(),
            dxf_id,
        )?
    } else {
        patch_sheet_conditional_formats(&sheet_xml, change, normalized_rule.as_ref(), dxf_id)?
    };
    write_package(entries, source.len() + 2048)
}

fn validate_data_validation_rule(validation: &WorkbookDataValidation) -> Result<(), String> {
    if validation.ranges.is_empty() || validation.ranges.len() > MAX_VALIDATION_RANGES {
        return Err(format!(
            "A data validation rule must target 1 to {MAX_VALIDATION_RANGES} ranges."
        ));
    }
    for range in &validation.ranges {
        if range.top > range.bottom
            || range.left > range.right
            || range.bottom >= MAX_XLSX_ROWS
            || range.right >= MAX_XLSX_COLUMNS
        {
            return Err("A data validation range is outside the XLSX grid.".into());
        }
    }
    if !matches!(
        validation.kind.as_str(),
        "list" | "whole" | "decimal" | "textLength" | "custom"
    ) {
        return Err("Only list, whole-number, decimal, text-length, and custom validation rules can be edited safely.".into());
    }
    let formula1 = validation
        .formula1
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("The first validation formula is required.")?;
    for formula in [Some(formula1), validation.formula2.as_deref()]
        .into_iter()
        .flatten()
    {
        if formula.chars().count() > MAX_FORMULA_TEXT {
            return Err(format!(
                "A data validation formula cannot exceed {MAX_FORMULA_TEXT} characters."
            ));
        }
        if formula.contains('[') || formula.contains(']') {
            return Err(
                "External-workbook references are not allowed in editable validation rules.".into(),
            );
        }
        if formula.chars().any(|character| {
            matches!(character, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}')
        }) {
            return Err("A validation formula contains unsupported control characters.".into());
        }
    }
    if validation.kind == "list"
        && formula1.starts_with('"')
        && formula1.ends_with('"')
        && formula1.chars().count() > 255
    {
        return Err("An inline validation list cannot exceed 255 characters.".into());
    }
    let needs_operator = matches!(validation.kind.as_str(), "whole" | "decimal" | "textLength");
    if needs_operator
        && !matches!(
            validation.operator.as_deref(),
            Some(
                "between"
                    | "notBetween"
                    | "equal"
                    | "notEqual"
                    | "lessThan"
                    | "lessThanOrEqual"
                    | "greaterThan"
                    | "greaterThanOrEqual"
            )
        )
    {
        return Err("The data validation operator is not supported.".into());
    }
    if needs_operator
        && matches!(
            validation.operator.as_deref(),
            Some("between" | "notBetween")
        )
        && validation
            .formula2
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        return Err("Between and not-between validation rules require a second formula.".into());
    }
    for (value, limit, label) in [
        (validation.error_title.as_deref(), 32, "error title"),
        (validation.prompt_title.as_deref(), 32, "prompt title"),
        (validation.error.as_deref(), 255, "error message"),
        (validation.prompt.as_deref(), 255, "input prompt"),
    ] {
        if value.is_some_and(|value| value.chars().count() > limit) {
            return Err(format!(
                "The validation {label} cannot exceed {limit} characters."
            ));
        }
    }
    Ok(())
}

fn validation_ranges_overlap(
    left: &WorkbookDataValidation,
    right: &WorkbookDataValidation,
) -> bool {
    left.ranges.iter().any(|left| {
        right.ranges.iter().any(|right| {
            left.top <= right.bottom
                && right.top <= left.bottom
                && left.left <= right.right
                && right.left <= left.right
        })
    })
}

fn ensure_simple_data_validation(xml: &[u8], target_index: usize) -> Result<(), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut index = 0usize;
    let mut target_depth = 0usize;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to inspect data validation XML: {error}"))?
        {
            Event::Start(ref start)
                if target_depth == 0 && start.local_name().as_ref() == b"dataValidation" =>
            {
                if index == target_index {
                    target_depth = 1;
                }
                index += 1;
            }
            Event::Empty(ref start)
                if target_depth == 0 && start.local_name().as_ref() == b"dataValidation" =>
            {
                if index == target_index {
                    return Ok(());
                }
                index += 1;
            }
            Event::Start(ref start) if target_depth > 0 => {
                if target_depth != 1
                    || !matches!(start.local_name().as_ref(), b"formula1" | b"formula2")
                {
                    return Err(
                        "This validation rule contains extension content and is read-only.".into(),
                    );
                }
                target_depth += 1;
            }
            Event::Empty(_) if target_depth > 0 => {
                return Err(
                    "This validation rule contains extension content and is read-only.".into(),
                );
            }
            Event::End(_) if target_depth > 0 => {
                target_depth -= 1;
                if target_depth == 0 {
                    return Ok(());
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Err("The selected data validation rule no longer exists.".into())
}

fn write_data_validation(
    writer: &mut Writer<Vec<u8>>,
    validation: &WorkbookDataValidation,
    template: Option<&BytesStart<'_>>,
) -> Result<(), String> {
    let references = validation
        .ranges
        .iter()
        .map(table_reference)
        .collect::<Result<Vec<_>, _>>()?
        .join(" ");
    let mut item = BytesStart::new("dataValidation");
    if let Some(template) = template {
        for attribute in template.attributes() {
            let attribute = attribute
                .map_err(|error| format!("Failed to read data validation attributes: {error}"))?;
            if !matches!(
                attribute.key.as_ref(),
                b"type"
                    | b"operator"
                    | b"sqref"
                    | b"allowBlank"
                    | b"showErrorMessage"
                    | b"errorTitle"
                    | b"error"
                    | b"promptTitle"
                    | b"prompt"
            ) {
                item.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
            }
        }
    } else if validation.prompt.is_some() || validation.prompt_title.is_some() {
        item.push_attribute(("showInputMessage", "1"));
    }
    item.push_attribute(("type", validation.kind.as_str()));
    if let Some(operator) = validation.operator.as_deref() {
        item.push_attribute(("operator", operator));
    }
    item.push_attribute(("allowBlank", if validation.allow_blank { "1" } else { "0" }));
    item.push_attribute((
        "showErrorMessage",
        if validation.show_error_message {
            "1"
        } else {
            "0"
        },
    ));
    if let Some(value) = validation.error_title.as_deref() {
        item.push_attribute(("errorTitle", value));
    }
    if let Some(value) = validation.error.as_deref() {
        item.push_attribute(("error", value));
    }
    if let Some(value) = validation.prompt_title.as_deref() {
        item.push_attribute(("promptTitle", value));
    }
    if let Some(value) = validation.prompt.as_deref() {
        item.push_attribute(("prompt", value));
    }
    item.push_attribute(("sqref", references.as_str()));
    writer
        .write_event(Event::Start(item))
        .map_err(|error| format!("Failed to write data validation: {error}"))?;
    for (name, formula) in [
        ("formula1", validation.formula1.as_deref()),
        ("formula2", validation.formula2.as_deref()),
    ] {
        if let Some(formula) = formula.map(str::trim).filter(|value| !value.is_empty()) {
            writer
                .write_event(Event::Start(BytesStart::new(name)))
                .map_err(|error| format!("Failed to write validation formula: {error}"))?;
            writer
                .write_event(Event::Text(BytesText::new(formula)))
                .map_err(|error| format!("Failed to write validation formula: {error}"))?;
            writer
                .write_event(Event::End(BytesEnd::new(name)))
                .map_err(|error| format!("Failed to finish validation formula: {error}"))?;
        }
    }
    writer
        .write_event(Event::End(BytesEnd::new("dataValidation")))
        .map_err(|error| format!("Failed to finish data validation: {error}"))
}

fn data_validation_later_element(name: &[u8]) -> bool {
    matches!(
        name,
        b"hyperlinks"
            | b"printOptions"
            | b"pageMargins"
            | b"pageSetup"
            | b"headerFooter"
            | b"rowBreaks"
            | b"colBreaks"
            | b"customProperties"
            | b"cellWatches"
            | b"ignoredErrors"
            | b"smartTags"
            | b"drawing"
            | b"legacyDrawing"
            | b"legacyDrawingHF"
            | b"picture"
            | b"oleObjects"
            | b"controls"
            | b"webPublishItems"
            | b"tableParts"
            | b"extLst"
    )
}

fn write_data_validations_container(
    writer: &mut Writer<Vec<u8>>,
    validation: &WorkbookDataValidation,
) -> Result<(), String> {
    let mut container = BytesStart::new("dataValidations");
    container.push_attribute(("count", "1"));
    writer
        .write_event(Event::Start(container))
        .map_err(|error| format!("Failed to write data validations: {error}"))?;
    write_data_validation(writer, validation, None)?;
    writer
        .write_event(Event::End(BytesEnd::new("dataValidations")))
        .map_err(|error| format!("Failed to finish data validations: {error}"))
}

fn patch_sheet_data_validations(
    xml: &[u8],
    change: &WorkbookDataValidationChange,
    existing_count: usize,
) -> Result<Vec<u8>, String> {
    let target_index = change.validation_index;
    let replacement = change.validation.as_ref();
    let new_count = match change.action {
        WorkbookDataValidationAction::Create => existing_count + 1,
        WorkbookDataValidationAction::Update => existing_count,
        WorkbookDataValidationAction::Delete => existing_count.saturating_sub(1),
    };
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 512));
    let mut buffer = Vec::new();
    let mut inside_container = false;
    let mut container_seen = false;
    let mut inserted = false;
    let mut index = 0usize;
    let mut skip_depth = 0usize;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse worksheet data validations: {error}"))?;
        if skip_depth > 0 {
            match event {
                Event::Start(_) => skip_depth += 1,
                Event::End(_) => skip_depth -= 1,
                Event::Eof => return Err("Data validation XML ended unexpectedly.".into()),
                _ => {}
            }
            buffer.clear();
            continue;
        }
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"dataValidations" => {
                container_seen = true;
                if new_count == 0 {
                    skip_depth = 1;
                } else {
                    let mut container = BytesStart::new("dataValidations");
                    for attribute in start.attributes() {
                        let attribute = attribute.map_err(|error| {
                            format!("Failed to read data validation container: {error}")
                        })?;
                        if attribute.key.as_ref() != b"count" {
                            container
                                .push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
                        }
                    }
                    let count = new_count.to_string();
                    container.push_attribute(("count", count.as_str()));
                    writer
                        .write_event(Event::Start(container))
                        .map_err(|error| {
                            format!("Failed to write data validation container: {error}")
                        })?;
                    inside_container = true;
                }
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"dataValidations" => {
                container_seen = true;
                if let Some(validation) =
                    replacement.filter(|_| change.action == WorkbookDataValidationAction::Create)
                {
                    write_data_validations_container(&mut writer, validation)?;
                    inserted = true;
                }
            }
            Event::Start(ref start)
                if inside_container && start.local_name().as_ref() == b"dataValidation" =>
            {
                let current = index;
                index += 1;
                if target_index == Some(current)
                    && change.action != WorkbookDataValidationAction::Create
                {
                    if let Some(validation) = replacement
                        .filter(|_| change.action == WorkbookDataValidationAction::Update)
                    {
                        write_data_validation(&mut writer, validation, Some(start))?;
                    }
                    skip_depth = 1;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy data validation: {error}"))?;
                }
            }
            Event::Empty(ref start)
                if inside_container && start.local_name().as_ref() == b"dataValidation" =>
            {
                let current = index;
                index += 1;
                if target_index == Some(current)
                    && change.action != WorkbookDataValidationAction::Create
                {
                    if let Some(validation) = replacement
                        .filter(|_| change.action == WorkbookDataValidationAction::Update)
                    {
                        write_data_validation(&mut writer, validation, Some(start))?;
                    }
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy data validation: {error}"))?;
                }
            }
            Event::End(ref end) if end.local_name().as_ref() == b"dataValidations" => {
                if let Some(validation) =
                    replacement.filter(|_| change.action == WorkbookDataValidationAction::Create)
                {
                    write_data_validation(&mut writer, validation, None)?;
                    inserted = true;
                }
                inside_container = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish data validations: {error}"))?;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !container_seen
                    && !inserted
                    && data_validation_later_element(start.local_name().as_ref()) =>
            {
                if let Some(validation) =
                    replacement.filter(|_| change.action == WorkbookDataValidationAction::Create)
                {
                    write_data_validations_container(&mut writer, validation)?;
                    inserted = true;
                }
                writer.write_event(event.into_owned()).map_err(|error| {
                    format!("Failed to copy worksheet after data validations: {error}")
                })?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"worksheet" => {
                if !container_seen && !inserted {
                    if let Some(validation) = replacement
                        .filter(|_| change.action == WorkbookDataValidationAction::Create)
                    {
                        write_data_validations_container(&mut writer, validation)?;
                        inserted = true;
                    }
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish worksheet: {error}"))?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy worksheet data validations: {error}"))?,
        }
        buffer.clear();
    }
    if change.action == WorkbookDataValidationAction::Create && !inserted {
        return Err("Could not insert the data validation rule.".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_data_validation(
    source: &[u8],
    change: &WorkbookDataValidationChange,
) -> Result<Vec<u8>, String> {
    let mut entries = load_package(source)?;
    let sheet_path = workbook_sheet_paths(&entries)?
        .remove(&change.sheet)
        .ok_or_else(|| format!("Worksheet does not exist: {}", change.sheet))?;
    let sheet = entries
        .iter()
        .find(|entry| entry.name == sheet_path)
        .ok_or("The worksheet part is missing.")?;
    let structure = read_sheet_structure(&sheet.data, 0, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS)?;
    if read_workbook_sheet_layout(source, &change.sheet, 0, 1, 1)?
        .page_layout
        .protection
        .enabled
    {
        return Err("Protected worksheets cannot change data validation rules.".into());
    }
    let existing_count = structure.data_validations.len();
    match change.action {
        WorkbookDataValidationAction::Create => {
            if change.validation_index.is_some() {
                return Err(
                    "Creating a validation rule must not include an existing index.".into(),
                );
            }
            if existing_count >= MAX_DATA_VALIDATIONS {
                return Err(format!(
                    "A worksheet cannot exceed {MAX_DATA_VALIDATIONS} validation rules."
                ));
            }
        }
        WorkbookDataValidationAction::Update | WorkbookDataValidationAction::Delete => {
            let index = change
                .validation_index
                .filter(|index| *index < existing_count)
                .ok_or("The selected data validation rule no longer exists.")?;
            ensure_simple_data_validation(&sheet.data, index)?;
        }
    }
    if change.action == WorkbookDataValidationAction::Delete {
        if change.validation.is_some() {
            return Err("Deleting a validation rule must not include a replacement rule.".into());
        }
    } else {
        let validation = change
            .validation
            .as_ref()
            .ok_or("A validation rule is required.")?;
        validate_data_validation_rule(validation)?;
        for (index, existing) in structure.data_validations.iter().enumerate() {
            if change.validation_index == Some(index) {
                continue;
            }
            if validation_ranges_overlap(validation, existing) {
                return Err(
                    "The validation range overlaps another rule. Merge or remove that rule first."
                        .into(),
                );
            }
        }
    }
    let sheet = entries
        .iter_mut()
        .find(|entry| entry.name == sheet_path)
        .ok_or("The worksheet part is missing.")?;
    sheet.data = patch_sheet_data_validations(&sheet.data, change, existing_count)?;
    write_package(entries, source.len() + 1024)
}

fn validate_filter_change(change: &WorkbookFilterChange) -> Result<(), String> {
    let range = &change.range;
    if range.top > range.bottom
        || range.left > range.right
        || range.bottom >= MAX_XLSX_ROWS
        || range.right >= MAX_XLSX_COLUMNS
    {
        return Err("The AutoFilter range is outside the XLSX grid.".into());
    }
    if change.target == WorkbookFilterTarget::Table
        && change
            .table_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        return Err("A Table name is required for a Table filter.".into());
    }
    if change.action == WorkbookFilterAction::Clear {
        return Ok(());
    }
    if let Some(query) = change.query.as_deref() {
        if query.chars().count() > 255 {
            return Err("The filter query cannot exceed 255 characters.".into());
        }
        if !query.is_empty() && change.filter_column.is_none() {
            return Err("Choose a filter column before applying a filter query.".into());
        }
    }
    for column in [change.filter_column, change.sort_column]
        .into_iter()
        .flatten()
    {
        if column < range.left || column > range.right {
            return Err("The filter or sort column is outside the AutoFilter range.".into());
        }
    }
    if change.sort_column.is_some()
        && !matches!(change.sort_direction.as_deref(), Some("asc" | "desc"))
    {
        return Err("The sort direction must be asc or desc.".into());
    }
    if change.query.as_deref().unwrap_or_default().is_empty() && change.sort_column.is_none() {
        return Err("Choose a filter query or sort column before applying.".into());
    }
    Ok(())
}

fn encode_contains_filter(query: &str) -> String {
    let mut encoded = String::with_capacity(query.len() + 2);
    encoded.push('*');
    for character in query.chars() {
        if matches!(character, '~' | '*' | '?') {
            encoded.push('~');
        }
        encoded.push(character);
    }
    encoded.push('*');
    encoded
}

fn write_auto_filter(
    writer: &mut Writer<Vec<u8>>,
    range: &WorkbookMergeRange,
    change: &WorkbookFilterChange,
) -> Result<(), String> {
    let reference = table_reference(range)?;
    let mut filter = BytesStart::new("autoFilter");
    filter.push_attribute(("ref", reference.as_str()));
    let query = if change.action == WorkbookFilterAction::Apply {
        change.query.as_deref().filter(|value| !value.is_empty())
    } else {
        None
    };
    let sort_column = if change.action == WorkbookFilterAction::Apply {
        change.sort_column
    } else {
        None
    };
    if query.is_none() && sort_column.is_none() {
        writer
            .write_event(Event::Empty(filter))
            .map_err(|error| format!("Failed to clear AutoFilter conditions: {error}"))?;
        return Ok(());
    }
    writer
        .write_event(Event::Start(filter))
        .map_err(|error| format!("Failed to write AutoFilter: {error}"))?;
    if let (Some(column), Some(query)) = (change.filter_column, query) {
        let mut filter_column = BytesStart::new("filterColumn");
        let column_id = (column - range.left).to_string();
        filter_column.push_attribute(("colId", column_id.as_str()));
        writer
            .write_event(Event::Start(filter_column))
            .map_err(|error| format!("Failed to write filter column: {error}"))?;
        writer
            .write_event(Event::Start(BytesStart::new("customFilters")))
            .map_err(|error| format!("Failed to write custom filters: {error}"))?;
        let mut custom = BytesStart::new("customFilter");
        let value = encode_contains_filter(query);
        custom.push_attribute(("operator", "equal"));
        custom.push_attribute(("val", value.as_str()));
        writer
            .write_event(Event::Empty(custom))
            .map_err(|error| format!("Failed to write custom filter: {error}"))?;
        writer
            .write_event(Event::End(BytesEnd::new("customFilters")))
            .map_err(|error| format!("Failed to finish custom filters: {error}"))?;
        writer
            .write_event(Event::End(BytesEnd::new("filterColumn")))
            .map_err(|error| format!("Failed to finish filter column: {error}"))?;
    }
    if let Some(column) = sort_column {
        if range.top == range.bottom {
            return Err("The AutoFilter has no data rows to sort.".into());
        }
        let data_range = WorkbookMergeRange {
            top: range.top + 1,
            bottom: range.bottom,
            left: range.left,
            right: range.right,
        };
        let condition_range = WorkbookMergeRange {
            left: column,
            right: column,
            ..data_range.clone()
        };
        let mut sort_state = BytesStart::new("sortState");
        let sort_reference = table_reference(&data_range)?;
        sort_state.push_attribute(("ref", sort_reference.as_str()));
        writer
            .write_event(Event::Start(sort_state))
            .map_err(|error| format!("Failed to write sort state: {error}"))?;
        let mut condition = BytesStart::new("sortCondition");
        let condition_reference = table_reference(&condition_range)?;
        condition.push_attribute(("ref", condition_reference.as_str()));
        if change.sort_direction.as_deref() == Some("desc") {
            condition.push_attribute(("descending", "1"));
        }
        writer
            .write_event(Event::Empty(condition))
            .map_err(|error| format!("Failed to write sort condition: {error}"))?;
        writer
            .write_event(Event::End(BytesEnd::new("sortState")))
            .map_err(|error| format!("Failed to finish sort state: {error}"))?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("autoFilter")))
        .map_err(|error| format!("Failed to finish AutoFilter: {error}"))
}

fn patch_auto_filter(
    xml: &[u8],
    range: &WorkbookMergeRange,
    change: &WorkbookFilterChange,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 220));
    let mut buffer = Vec::new();
    let mut patched = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse AutoFilter: {error}"))?;
        match event {
            Event::Start(ref start) if !patched && start.local_name().as_ref() == b"autoFilter" => {
                write_auto_filter(&mut writer, range, change)?;
                skip_element(&mut reader, b"autoFilter", &mut buffer)?;
                patched = true;
            }
            Event::Empty(ref start) if !patched && start.local_name().as_ref() == b"autoFilter" => {
                write_auto_filter(&mut writer, range, change)?;
                patched = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy AutoFilter XML: {error}"))?,
        }
        buffer.clear();
    }
    if !patched {
        return Err("The target AutoFilter definition is missing.".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_filter(
    source: &[u8],
    change: &WorkbookFilterChange,
) -> Result<Vec<u8>, String> {
    validate_filter_change(change)?;
    let mut entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let sheet_path = sheet_paths
        .get(&change.sheet)
        .cloned()
        .ok_or_else(|| format!("Worksheet does not exist: {}", change.sheet))?;
    let sheet_xml = entries
        .iter()
        .find(|entry| entry.name == sheet_path)
        .ok_or("Worksheet part is missing")?
        .data
        .clone();
    if has_element(&sheet_xml, b"sheetProtection")? {
        return Err("The current Sheet is protected and its filters cannot be edited.".into());
    }
    let (path, range, state) = match change.target {
        WorkbookFilterTarget::Worksheet => {
            let structure = read_sheet_structure(&sheet_xml, 0, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS)?;
            let range = structure
                .auto_filter
                .ok_or("The worksheet AutoFilter definition is missing.")?;
            (sheet_path.clone(), range, structure.auto_filter_state)
        }
        WorkbookFilterTarget::Table => {
            let relationships = part_relationships(&entries, &sheet_path)?;
            let expected_name = change.table_name.as_deref().unwrap_or_default();
            let mut target = None;
            for path in relationships
                .into_values()
                .filter(|path| path.starts_with("xl/tables/"))
            {
                let entry = entries
                    .iter()
                    .find(|entry| entry.name == path)
                    .ok_or("Table part is missing")?;
                let (_, name, range, _) = table_root(&entry.data)?;
                if name.eq_ignore_ascii_case(expected_name) {
                    let state = read_auto_filter_state(&entry.data, &range)?;
                    target = Some((path, range, state));
                    break;
                }
            }
            target.ok_or_else(|| format!("Table does not exist: {expected_name}"))?
        }
    };
    if range != change.range {
        return Err("The AutoFilter range changed. Reload the worksheet before editing it.".into());
    }
    if change.action == WorkbookFilterAction::Apply && !state.editable {
        return Err(
            "This AutoFilter uses advanced or multi-column conditions that cannot be overwritten safely yet."
                .into(),
        );
    }
    let entry = entries
        .iter_mut()
        .find(|entry| entry.name == path)
        .ok_or("AutoFilter part is missing")?;
    entry.data = patch_auto_filter(&entry.data, &range, change)?;
    write_package(entries, source.len() + 512)
}

fn validate_defined_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.chars().count() > MAX_DEFINED_NAME_LENGTH {
        return Err("A defined name must contain 1 to 255 characters.".into());
    }
    let mut characters = name.chars();
    if !characters
        .next()
        .is_some_and(|value| value.is_ascii_alphabetic() || matches!(value, '_' | '\\'))
        || !characters
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '_' | '.' | '\\'))
    {
        return Err(
            "A defined name must start with a letter, underscore, or backslash and contain no spaces."
                .into(),
        );
    }
    if matches!(name.to_ascii_lowercase().as_str(), "r" | "c") || parse_cell_reference(name).is_ok()
    {
        return Err(
            "A defined name cannot be a cell reference or the reserved name R or C.".into(),
        );
    }
    if name.to_ascii_lowercase().starts_with("_xlnm.") {
        return Err("Built-in _xlnm names cannot be edited through this command.".into());
    }
    Ok(())
}

fn same_defined_name_scope(left: Option<&str>, right: Option<&str>) -> bool {
    match (left, right) {
        (None, None) => true,
        (Some(left), Some(right)) => left.eq_ignore_ascii_case(right),
        _ => false,
    }
}

fn defined_name_key_matches(item: &WorkbookDefinedName, name: &str, scope: Option<&str>) -> bool {
    item.name.eq_ignore_ascii_case(name) && same_defined_name_scope(item.scope.as_deref(), scope)
}

pub(super) fn absolute_cell_reference(row: usize, column: usize) -> Result<String, String> {
    let reference = cell_reference(row, column)?;
    let split = reference
        .find(|character: char| character.is_ascii_digit())
        .ok_or("Could not build an absolute cell reference.")?;
    Ok(format!("${}${}", &reference[..split], &reference[split..]))
}

fn defined_name_range_formula(sheet: &str, range: &WorkbookMergeRange) -> Result<String, String> {
    let quoted_sheet = sheet.replace('\'', "''");
    Ok(format!(
        "'{quoted_sheet}'!{}:{}",
        absolute_cell_reference(range.top, range.left)?,
        absolute_cell_reference(range.bottom, range.right)?
    ))
}

fn is_defined_name_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '\\')
}

fn formula_references_defined_name(formula: &str, name: &str) -> bool {
    let formula = formula.to_ascii_lowercase();
    let name = name.to_ascii_lowercase();
    let mut offset = 0usize;
    while let Some(found) = formula[offset..].find(&name) {
        let start = offset + found;
        let end = start + name.len();
        let before = formula[..start].chars().next_back();
        let after = formula[end..].chars().next();
        if !before.is_some_and(is_defined_name_character)
            && !after.is_some_and(is_defined_name_character)
        {
            return true;
        }
        offset = end;
    }
    false
}

fn xml_formulas_reference_defined_name(xml: &[u8], name: &str) -> Result<bool, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut formula_depth = 0usize;
    loop {
        match reader.read_event_into(&mut buffer).map_err(|error| {
            format!("Failed to inspect formulas for defined-name usage: {error}")
        })? {
            Event::Start(ref start)
                if matches!(
                    start.local_name().as_ref(),
                    b"f" | b"formula" | b"formula1" | b"formula2"
                ) =>
            {
                formula_depth += 1;
            }
            Event::Text(ref text) if formula_depth > 0 => {
                if formula_references_defined_name(
                    &decode_xml_text(text, "formula while checking defined-name usage")?,
                    name,
                ) {
                    return Ok(true);
                }
            }
            Event::End(ref end)
                if formula_depth > 0
                    && matches!(
                        end.local_name().as_ref(),
                        b"f" | b"formula" | b"formula1" | b"formula2"
                    ) =>
            {
                formula_depth -= 1;
            }
            Event::Eof => return Ok(false),
            _ => {}
        }
        buffer.clear();
    }
}

fn write_defined_name(
    writer: &mut Writer<Vec<u8>>,
    name: &str,
    local_sheet_id: Option<usize>,
    formula: &str,
) -> Result<(), String> {
    let mut element = BytesStart::new("definedName");
    element.push_attribute(("name", name));
    let local_sheet_id = local_sheet_id.map(|value| value.to_string());
    if let Some(local_sheet_id) = local_sheet_id.as_deref() {
        element.push_attribute(("localSheetId", local_sheet_id));
    }
    writer
        .write_event(Event::Start(element))
        .map_err(|error| format!("Failed to write defined name: {error}"))?;
    writer
        .write_event(Event::Text(BytesText::new(formula)))
        .map_err(|error| format!("Failed to write defined-name range: {error}"))?;
    writer
        .write_event(Event::End(BytesEnd::new("definedName")))
        .map_err(|error| format!("Failed to finish defined name: {error}"))
}

fn patch_workbook_defined_names(
    xml: &[u8],
    change: &WorkbookDefinedNameChange,
    local_sheet_id: Option<usize>,
    formula: Option<&str>,
    existing_count: usize,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + 180));
    let mut buffer = Vec::new();
    let mut has_container = false;
    let mut inserted = false;
    let mut patched = false;
    let mut inside_target = false;
    let mut target_text_written = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Failed to parse workbook defined names: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"definedNames" => {
                has_container = true;
                if change.action == WorkbookDefinedNameAction::Delete && existing_count == 1 {
                    skip_element(&mut reader, b"definedNames", &mut buffer)?;
                    patched = true;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to write definedNames: {error}"))?;
                }
            }
            Event::Empty(ref start) if start.local_name().as_ref() == b"definedNames" => {
                has_container = true;
                if change.action == WorkbookDefinedNameAction::Create {
                    writer
                        .write_event(Event::Start(BytesStart::new("definedNames")))
                        .map_err(|error| format!("Failed to create definedNames: {error}"))?;
                    write_defined_name(
                        &mut writer,
                        change.name.trim(),
                        local_sheet_id,
                        formula.ok_or("A range formula is required.")?,
                    )?;
                    writer
                        .write_event(Event::End(BytesEnd::new("definedNames")))
                        .map_err(|error| format!("Failed to finish definedNames: {error}"))?;
                    inserted = true;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy definedNames: {error}"))?;
                }
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"definedName" => {
                let event_name = xml_value(start, b"name", reader.decoder())?;
                let event_scope = xml_value(start, b"localSheetId", reader.decoder())?
                    .map(|value| {
                        value
                            .parse::<usize>()
                            .map_err(|_| "Defined-name scope is invalid.")
                    })
                    .transpose()?;
                let matches = event_name
                    .as_deref()
                    .is_some_and(|name| name.eq_ignore_ascii_case(change.name.trim()))
                    && event_scope == local_sheet_id;
                if matches && change.action == WorkbookDefinedNameAction::Delete {
                    skip_element(&mut reader, b"definedName", &mut buffer)?;
                    patched = true;
                } else if matches {
                    inside_target = true;
                    target_text_written = false;
                    let output = if change.action == WorkbookDefinedNameAction::Rename {
                        replace_xml_attribute(
                            start,
                            b"name",
                            change
                                .new_name
                                .as_deref()
                                .map(str::trim)
                                .ok_or("A new defined name is required.")?,
                            false,
                        )?
                    } else {
                        start.to_owned().into_owned()
                    };
                    writer
                        .write_event(Event::Start(output))
                        .map_err(|error| format!("Failed to update defined name: {error}"))?;
                    if change.action == WorkbookDefinedNameAction::UpdateRange {
                        writer
                            .write_event(Event::Text(BytesText::new(
                                formula.ok_or("A range formula is required.")?,
                            )))
                            .map_err(|error| {
                                format!("Failed to update defined-name range: {error}")
                            })?;
                        target_text_written = true;
                    }
                    patched = true;
                } else {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| format!("Failed to copy defined name: {error}"))?;
                }
            }
            Event::End(ref end) if end.local_name().as_ref() == b"definedName" => {
                inside_target = false;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish defined name: {error}"))?;
            }
            Event::Text(_) | Event::CData(_) | Event::GeneralRef(_)
                if inside_target
                    && target_text_written
                    && change.action == WorkbookDefinedNameAction::UpdateRange => {}
            Event::End(ref end)
                if end.local_name().as_ref() == b"definedNames"
                    && change.action == WorkbookDefinedNameAction::Create
                    && !inserted =>
            {
                write_defined_name(
                    &mut writer,
                    change.name.trim(),
                    local_sheet_id,
                    formula.ok_or("A range formula is required.")?,
                )?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish definedNames: {error}"))?;
                inserted = true;
            }
            Event::Start(ref start) | Event::Empty(ref start)
                if !has_container
                    && !inserted
                    && change.action == WorkbookDefinedNameAction::Create
                    && matches!(
                        start.local_name().as_ref(),
                        b"calcPr"
                            | b"oleSize"
                            | b"customWorkbookViews"
                            | b"pivotCaches"
                            | b"smartTagPr"
                            | b"smartTagTypes"
                            | b"webPublishing"
                            | b"fileRecoveryPr"
                            | b"webPublishObjects"
                            | b"extLst"
                    ) =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("definedNames")))
                    .map_err(|error| format!("Failed to create definedNames: {error}"))?;
                write_defined_name(
                    &mut writer,
                    change.name.trim(),
                    local_sheet_id,
                    formula.ok_or("A range formula is required.")?,
                )?;
                writer
                    .write_event(Event::End(BytesEnd::new("definedNames")))
                    .map_err(|error| format!("Failed to finish definedNames: {error}"))?;
                inserted = true;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to copy workbook XML: {error}"))?;
            }
            Event::End(ref end)
                if end.local_name().as_ref() == b"workbook"
                    && !inserted
                    && change.action == WorkbookDefinedNameAction::Create =>
            {
                writer
                    .write_event(Event::Start(BytesStart::new("definedNames")))
                    .map_err(|error| format!("Failed to create definedNames: {error}"))?;
                write_defined_name(
                    &mut writer,
                    change.name.trim(),
                    local_sheet_id,
                    formula.ok_or("A range formula is required.")?,
                )?;
                writer
                    .write_event(Event::End(BytesEnd::new("definedNames")))
                    .map_err(|error| format!("Failed to finish definedNames: {error}"))?;
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| format!("Failed to finish workbook: {error}"))?;
                inserted = true;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("Failed to copy workbook defined names: {error}"))?,
        }
        buffer.clear();
    }
    if change.action == WorkbookDefinedNameAction::Create {
        if !inserted {
            return Err("Could not insert the defined name into workbook.xml.".into());
        }
    } else if !patched {
        return Err("The target defined name was not found.".into());
    }
    Ok(writer.into_inner())
}

pub fn patch_workbook_defined_name(
    source: &[u8],
    change: &WorkbookDefinedNameChange,
) -> Result<Vec<u8>, String> {
    let name = change.name.trim();
    validate_defined_name(name)?;
    if let Some(new_name) = change.new_name.as_deref().map(str::trim) {
        validate_defined_name(new_name)?;
    }
    if read_workbook_protection(source)?.lock_structure {
        return Err(
            "The workbook structure is protected and defined names cannot be edited.".into(),
        );
    }
    let mut entries = load_package(source)?;
    let workbook_index = entries
        .iter()
        .position(|entry| entry.name == "xl/workbook.xml")
        .ok_or("XLSX is missing xl/workbook.xml")?;
    let workbook_xml = entries[workbook_index].data.clone();
    let sheets = workbook_sheet_names(&workbook_xml)?;
    let scope = change
        .scope
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let local_sheet_id = scope
        .map(|scope| {
            sheets
                .iter()
                .position(|sheet| sheet.eq_ignore_ascii_case(scope))
                .ok_or_else(|| format!("Defined-name scope worksheet does not exist: {scope}"))
        })
        .transpose()?;
    let defined_names = read_workbook_defined_names_xml(&workbook_xml)?;
    let existing = defined_names
        .iter()
        .find(|item| defined_name_key_matches(item, name, scope));
    if change.action == WorkbookDefinedNameAction::Create {
        if defined_names.len() >= MAX_DEFINED_NAMES {
            return Err(format!(
                "A workbook cannot contain more than {MAX_DEFINED_NAMES} names."
            ));
        }
        if existing.is_some() {
            return Err(format!(
                "A defined name named {name} already exists in this scope."
            ));
        }
    } else {
        let existing = existing.ok_or_else(|| format!("Defined name does not exist: {name}"))?;
        if existing.hidden || existing.name.to_ascii_lowercase().starts_with("_xlnm.") {
            return Err("Hidden and built-in defined names cannot be edited.".into());
        }
    }
    if change.action == WorkbookDefinedNameAction::Rename {
        let new_name = change
            .new_name
            .as_deref()
            .map(str::trim)
            .ok_or("A new defined name is required.")?;
        if !new_name.eq_ignore_ascii_case(name)
            && defined_names
                .iter()
                .any(|item| defined_name_key_matches(item, new_name, scope))
        {
            return Err(format!(
                "A defined name named {new_name} already exists in this scope."
            ));
        }
    }
    let formula = if matches!(
        change.action,
        WorkbookDefinedNameAction::Create | WorkbookDefinedNameAction::UpdateRange
    ) {
        let target_sheet = change
            .target_sheet
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or("A target worksheet is required.")?;
        if !sheets
            .iter()
            .any(|sheet| sheet.eq_ignore_ascii_case(target_sheet))
        {
            return Err(format!("Target worksheet does not exist: {target_sheet}"));
        }
        let range = change.range.as_ref().ok_or("A target range is required.")?;
        if range.top > range.bottom
            || range.left > range.right
            || range.bottom >= MAX_XLSX_ROWS
            || range.right >= MAX_XLSX_COLUMNS
        {
            return Err("The defined-name range is outside the XLSX grid.".into());
        }
        Some(defined_name_range_formula(target_sheet, range)?)
    } else {
        None
    };
    if matches!(
        change.action,
        WorkbookDefinedNameAction::Rename | WorkbookDefinedNameAction::Delete
    ) && !(change.action == WorkbookDefinedNameAction::Rename
        && change
            .new_name
            .as_deref()
            .is_some_and(|new_name| new_name.trim().eq_ignore_ascii_case(name)))
    {
        let referenced_by_name = defined_names.iter().any(|item| {
            !defined_name_key_matches(item, name, scope)
                && formula_references_defined_name(&item.formula, name)
        });
        let referenced_by_formula = entries
            .iter()
            .filter(|entry| entry.name != "xl/workbook.xml" && entry.name.ends_with(".xml"))
            .map(|entry| xml_formulas_reference_defined_name(&entry.data, name))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .any(|value| value);
        if referenced_by_name || referenced_by_formula {
            return Err(
                "This defined name is referenced by a formula and cannot be renamed or deleted safely yet."
                    .into(),
            );
        }
    }
    entries[workbook_index].data = patch_workbook_defined_names(
        &workbook_xml,
        change,
        local_sheet_id,
        formula.as_deref(),
        defined_names.len(),
    )?;
    write_package(entries, source.len() + 256)
}

pub fn patch_workbook_table(
    source: &[u8],
    change: &WorkbookTableChange,
) -> Result<Vec<u8>, String> {
    validate_table_change(change)?;
    let mut entries = load_package(source)?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    let sheet_path = sheet_paths
        .get(&change.sheet)
        .cloned()
        .ok_or_else(|| format!("Worksheet does not exist: {}", change.sheet))?;
    let sheet_xml = entries
        .iter()
        .find(|entry| entry.name == sheet_path)
        .ok_or("Worksheet part is missing")?
        .data
        .clone();
    if has_element(&sheet_xml, b"sheetProtection")? {
        return Err("The current Sheet is protected and its Tables cannot be edited.".into());
    }
    let structure = read_sheet_structure(&sheet_xml, 0, MAX_XLSX_ROWS, MAX_XLSX_COLUMNS)?;
    if structure
        .merged_cells
        .iter()
        .any(|range| ranges_overlap(range, &change.range))
    {
        return Err("A Table cannot overlap merged cells.".into());
    }

    let relationships = part_relationships(&entries, &sheet_path)?;
    let mut max_id = 0u32;
    let mut all_names = HashSet::new();
    let mut target: Option<(String, u32, WorkbookMergeRange, TableStyleSettings)> = None;
    for (path, xml) in entries
        .iter()
        .filter(|entry| entry.name.starts_with("xl/tables/") && entry.name.ends_with(".xml"))
        .map(|entry| (entry.name.clone(), entry.data.as_slice()))
    {
        let (id, name, range, style) = table_root(xml)?;
        max_id = max_id.max(id);
        all_names.insert(name.to_lowercase());
        if relationships.values().any(|value| value == &path) {
            if name.eq_ignore_ascii_case(&change.table_name) {
                target = Some((path.clone(), id, range, style));
            } else if ranges_overlap(&range, &change.range) {
                return Err(format!("The selected range overlaps Table {name}."));
            }
        }
    }

    match change.action {
        WorkbookTableAction::Resize => {
            let (path, id, _, style) = target.ok_or_else(|| {
                format!(
                    "Table does not exist on this worksheet: {}",
                    change.table_name
                )
            })?;
            let entry = entries
                .iter_mut()
                .find(|entry| entry.name == path)
                .ok_or("Table part is missing")?;
            ensure_simple_resizable_table(&entry.data)?;
            entry.data = build_table_xml(
                id,
                change.table_name.trim(),
                &change.range,
                &change.columns,
                &style,
            )?;
        }
        WorkbookTableAction::Create => {
            if all_names.contains(&change.table_name.trim().to_lowercase()) {
                return Err(format!(
                    "A Table named {} already exists.",
                    change.table_name.trim()
                ));
            }
            let id = max_id.checked_add(1).ok_or("Excel Table id overflow")?;
            let mut number = 1usize;
            let path = loop {
                let candidate = format!("xl/tables/table{number}.xml");
                if !entries.iter().any(|entry| entry.name == candidate) {
                    break candidate;
                }
                number += 1;
            };
            let used_relation_ids = relationships.keys().cloned().collect::<HashSet<_>>();
            let mut relation_number = 1usize;
            let relation_id = loop {
                let candidate = format!("rId{relation_number}");
                if !used_relation_ids.contains(&candidate) {
                    break candidate;
                }
                relation_number += 1;
            };
            let relation_path = {
                let (directory, file) = sheet_path
                    .rsplit_once('/')
                    .ok_or("Worksheet path is invalid")?;
                format!("{directory}/_rels/{file}.rels")
            };
            let target_path = format!("../tables/{}", path.rsplit('/').next().unwrap_or_default());
            if let Some(entry) = entries.iter_mut().find(|entry| entry.name == relation_path) {
                entry.data =
                    patch_relationships_with_table(&entry.data, &relation_id, &target_path)?;
            } else {
                entries.push(PackageEntry {
                    name: relation_path,
                    is_dir: false,
                    compression: CompressionMethod::Deflated,
                    data: new_table_relationships(&relation_id, &target_path),
                });
            }
            let sheet = entries
                .iter_mut()
                .find(|entry| entry.name == sheet_path)
                .ok_or("Worksheet part is missing")?;
            sheet.data = patch_sheet_with_table_part(&sheet.data, &relation_id)?;
            let content_types = entries
                .iter_mut()
                .find(|entry| entry.name == "[Content_Types].xml")
                .ok_or("XLSX is missing [Content_Types].xml")?;
            content_types.data =
                patch_content_types_with_table(&content_types.data, &format!("/{path}"))?;
            entries.push(PackageEntry {
                name: path,
                is_dir: false,
                compression: CompressionMethod::Deflated,
                data: build_table_xml(
                    id,
                    change.table_name.trim(),
                    &change.range,
                    &change.columns,
                    &TableStyleSettings::default(),
                )?,
            });
        }
        WorkbookTableAction::Rename => {
            let (path, _, _, _) = target.ok_or_else(|| {
                format!(
                    "Table does not exist on this worksheet: {}",
                    change.table_name
                )
            })?;
            let new_name = change
                .new_table_name
                .as_deref()
                .map(str::trim)
                .ok_or("A new Table name is required.")?;
            if !new_name.eq_ignore_ascii_case(change.table_name.trim())
                && all_names.contains(&new_name.to_lowercase())
            {
                return Err(format!("A Table named {new_name} already exists."));
            }
            if package_has_structured_table_reference(&entries, &path, change.table_name.trim()) {
                return Err(
                    "This Table is used by a structured reference and cannot be renamed safely yet."
                        .into(),
                );
            }
            let entry = entries
                .iter_mut()
                .find(|entry| entry.name == path)
                .ok_or("Table part is missing")?;
            entry.data = patch_table_identity(&entry.data, new_name)?;
        }
        WorkbookTableAction::SetStyle => {
            let (path, _, _, mut style) = target.ok_or_else(|| {
                format!(
                    "Table does not exist on this worksheet: {}",
                    change.table_name
                )
            })?;
            if let Some(name) = change.style_name.as_deref().map(str::trim) {
                style.name = Some(name.into());
            }
            if let Some(value) = change.show_first_column {
                style.show_first_column = value;
            }
            if let Some(value) = change.show_last_column {
                style.show_last_column = value;
            }
            if let Some(value) = change.show_row_stripes {
                style.show_row_stripes = value;
            }
            if let Some(value) = change.show_column_stripes {
                style.show_column_stripes = value;
            }
            let entry = entries
                .iter_mut()
                .find(|entry| entry.name == path)
                .ok_or("Table part is missing")?;
            entry.data = patch_table_style(&entry.data, &style)?;
        }
        WorkbookTableAction::ConvertToRange | WorkbookTableAction::Delete => {
            let (path, _, _, _) = target.ok_or_else(|| {
                format!(
                    "Table does not exist on this worksheet: {}",
                    change.table_name
                )
            })?;
            let table_xml = entries
                .iter()
                .find(|entry| entry.name == path)
                .ok_or("Table part is missing")?
                .data
                .clone();
            ensure_simple_resizable_table(&table_xml)?;
            if package_has_structured_table_reference(&entries, &path, change.table_name.trim()) {
                return Err(
                    "This Table is used by a structured reference and cannot be removed safely yet."
                        .into(),
                );
            }
            let relation_id = relationships
                .iter()
                .find_map(|(id, target)| (target == &path).then(|| id.clone()))
                .ok_or("The worksheet Table relationship is missing.")?;
            let relation_path = {
                let (directory, file) = sheet_path
                    .rsplit_once('/')
                    .ok_or("Worksheet path is invalid")?;
                format!("{directory}/_rels/{file}.rels")
            };
            let relationship_entry = entries
                .iter_mut()
                .find(|entry| entry.name == relation_path)
                .ok_or("The worksheet relationship part is missing.")?;
            relationship_entry.data =
                remove_table_relationship(&relationship_entry.data, &relation_id)?;
            let sheet = entries
                .iter_mut()
                .find(|entry| entry.name == sheet_path)
                .ok_or("Worksheet part is missing")?;
            sheet.data = remove_sheet_table_part(&sheet.data, &relation_id)?;
            let content_types = entries
                .iter_mut()
                .find(|entry| entry.name == "[Content_Types].xml")
                .ok_or("XLSX is missing [Content_Types].xml")?;
            content_types.data =
                remove_table_content_type(&content_types.data, &format!("/{path}"))?;
            entries.retain(|entry| entry.name != path);
        }
    }
    write_package(entries, source.len() + 1024)
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
    let target_xml = entries
        .iter()
        .find(|entry| entry.name == target_path)
        .ok_or("XLSX worksheet part is missing")?;
    if !read_array_formulas(&target_xml.data)?.is_empty() {
        return Err(
            "Array and dynamic-array worksheets are read-only for row/column structure changes."
                .into(),
        );
    }
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

    let touched_sheets = edits
        .iter()
        .map(|edit| edit.sheet.clone())
        .chain(style_edits.iter().map(|edit| edit.sheet.clone()))
        .chain(row_height_edits.iter().map(|edit| edit.sheet.clone()))
        .chain(column_width_edits.iter().map(|edit| edit.sheet.clone()))
        .chain(merge_edits.iter().map(|edit| edit.sheet.clone()))
        .collect::<HashSet<_>>();
    let mut entries =
        load_package_for_cell_patch(source, &touched_sheets, !style_edits.is_empty())?;
    let sheet_paths = workbook_sheet_paths(&entries)?;
    for sheet in &touched_sheets {
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
        let array_formulas = read_array_formulas(&xml.data)?;
        let touches_array = |row: usize, column: usize| {
            array_formulas.iter().any(|formula| {
                row >= formula.range.top
                    && row <= formula.range.bottom
                    && column >= formula.range.left
                    && column <= formula.range.right
            })
        };
        if let Some((row, column)) = edits
            .iter()
            .filter(|edit| &edit.sheet == sheet)
            .map(|edit| (edit.row, edit.column))
            .chain(
                style_edits
                    .iter()
                    .filter(|edit| &edit.sheet == sheet)
                    .map(|edit| (edit.row, edit.column)),
            )
            .find(|(row, column)| touches_array(*row, *column))
        {
            return Err(format!(
                "Cell {} is inside an array or dynamic-array range and is read-only.",
                cell_reference(row, column)?
            ));
        }
        if merge_edits
            .iter()
            .filter(|edit| &edit.sheet == sheet)
            .any(|edit| {
                array_formulas.iter().any(|formula| {
                    edit.top <= formula.range.bottom
                        && formula.range.top <= edit.bottom
                        && edit.left <= formula.range.right
                        && formula.range.left <= edit.right
                })
            })
        {
            return Err("Merge changes cannot overlap a read-only array formula range.".into());
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
        if !xml
            .data
            .windows(b"dataValidation".len())
            .any(|window| window == b"dataValidation")
        {
            continue;
        }
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
    let mut modified_paths = HashSet::new();
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
            modified_paths.insert(entry.name.clone());
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
        modified_paths.insert("xl/styles.xml".into());
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
            modified_paths.insert(entry.name.clone());
        }
    }
    if !patches_by_path.is_empty() {
        return Err("XLSX 工作表部件缺失".into());
    }

    write_package_preserving_unchanged(source, entries, &modified_paths)
}

#[cfg(test)]
mod tests {
    use super::{
        audit_workbook_pivot_multi_axis_isolated, parse_chart_part, patch_calc_chain_rows,
        patch_sheet_structure_axis, patch_workbook, patch_workbook_conditional_format,
        patch_workbook_data_validation, patch_workbook_defined_name, patch_workbook_drawing,
        patch_workbook_filter, patch_workbook_structure, patch_workbook_table, read_array_formulas,
        read_sheet_formulas, read_workbook_defined_names, read_workbook_linked_data,
        read_workbook_sheet_layout, rebuild_workbook_pivot_aggregation_variant_isolated,
        validate_plain_structure_sheet, validate_workbook_package, MAX_ARRAY_DIAGNOSTIC_CELLS,
    };
    use crate::formats::workbook::{
        WorkbookCellEdit, WorkbookChartDataLabels, WorkbookConditionalColorScale,
        WorkbookConditionalColorScalePoint, WorkbookConditionalDataBar,
        WorkbookConditionalFormatAction, WorkbookConditionalFormatChange,
        WorkbookConditionalFormatRule, WorkbookConditionalFormatStyle, WorkbookConditionalIconSet,
        WorkbookConditionalIconThreshold, WorkbookConditionalThreshold, WorkbookDataValidation,
        WorkbookDataValidationAction, WorkbookDataValidationChange, WorkbookDefinedNameAction,
        WorkbookDefinedNameChange, WorkbookDrawingAction, WorkbookDrawingAnchor,
        WorkbookDrawingChange, WorkbookFilterAction, WorkbookFilterChange, WorkbookFilterState,
        WorkbookFilterTarget, WorkbookMergeRange, WorkbookStructureAction, WorkbookStructureAxis,
        WorkbookStructureChange, WorkbookTableAction, WorkbookTableChange,
    };
    use calamine::{open_workbook_from_rs, Data, Reader as CalamineReader, Xlsx};
    use rust_xlsxwriter::{
        Chart, ChartType, ConditionalFormat2ColorScale, ConditionalFormatCell,
        ConditionalFormatCellRule, ConditionalFormatDataBar, ConditionalFormatFormula,
        ConditionalFormatIconSet, ConditionalFormatIconType, DataValidation, Format, Formula,
        Table, TableColumn, Workbook,
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

    fn zip_has(source: &[u8], name: &str) -> bool {
        ZipArchive::new(Cursor::new(source))
            .unwrap()
            .by_name(name)
            .is_ok()
    }

    #[test]
    fn reads_array_formula_inventory_without_mutating_the_fixture() {
        const FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/array-formula-boundary.xlsx");
        let source_hash = md5::compute(FIXTURE);
        validate_workbook_package(FIXTURE).unwrap();
        let layout = read_workbook_sheet_layout(FIXTURE, "Array Boundary", 0, 10, 16).unwrap();

        assert_eq!(layout.array_formulas.len(), 2);
        let legacy = &layout.array_formulas[0];
        assert_eq!(legacy.kind, "legacy_array");
        assert_eq!((legacy.anchor_row, legacy.anchor_column), (1, 1));
        assert_eq!((legacy.range.top, legacy.range.bottom), (1, 3));
        assert_eq!((legacy.range.left, legacy.range.right), (1, 1));
        assert_eq!(legacy.formula, "=A2:A4*2");
        assert_eq!(legacy.declared_cell_count, 3);
        assert_eq!(legacy.cached_cell_count, 3);
        assert_eq!(legacy.occupied_cell_count, 3);
        assert_eq!(legacy.missing_cached_cell_count, 0);
        assert_eq!(legacy.foreign_formula_cell_count, 0);
        assert_eq!(legacy.cached_value_types["number"], 3);
        assert_eq!(legacy.error_cache_count, 0);
        assert!(legacy.error_cache_cells.is_empty());
        assert!(legacy.conflict_cells.is_empty());
        assert_eq!(legacy.spill_status, "not_applicable");
        assert_eq!(legacy.calculation_status, "blocked");
        assert_eq!(legacy.write_status, "blocked");

        let dynamic = &layout.array_formulas[1];
        assert_eq!(dynamic.kind, "dynamic_array");
        assert_eq!((dynamic.anchor_row, dynamic.anchor_column), (1, 3));
        assert_eq!((dynamic.range.top, dynamic.range.bottom), (1, 3));
        assert_eq!((dynamic.range.left, dynamic.range.right), (3, 3));
        assert_eq!(dynamic.formula, "=_xlfn.SEQUENCE(3,1,10,1)");
        assert_eq!(dynamic.declared_cell_count, 3);
        assert_eq!(dynamic.cached_cell_count, 3);
        assert_eq!(dynamic.occupied_cell_count, 3);
        assert_eq!(dynamic.missing_cached_cell_count, 0);
        assert_eq!(dynamic.foreign_formula_cell_count, 0);
        assert_eq!(dynamic.cached_value_types["number"], 3);
        assert_eq!(dynamic.error_cache_count, 0);
        assert_eq!(dynamic.spill_status, "cached_complete");
        assert_eq!(md5::compute(FIXTURE), source_hash);
    }

    #[test]
    fn reads_wps_array_formula_round_trip_with_recalculated_cache() {
        const FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/array-formula-wps-spreadsheets.xlsx");
        let source_hash = md5::compute(FIXTURE);
        let layout = read_workbook_sheet_layout(FIXTURE, "Array Boundary", 0, 10, 16).unwrap();
        assert_eq!(layout.array_formulas.len(), 2);
        assert_eq!(layout.array_formulas[0].kind, "legacy_array");
        assert_eq!(layout.array_formulas[0].cached_cell_count, 3);
        assert_eq!(layout.array_formulas[1].kind, "dynamic_array");
        assert_eq!(layout.array_formulas[1].cached_cell_count, 3);
        assert_eq!(layout.array_formulas[1].cached_value_types["number"], 3);
        assert_eq!(layout.array_formulas[1].error_cache_count, 0);
        assert!(layout.array_formulas[1].conflict_cells.is_empty());
        assert_eq!(layout.array_formulas[1].spill_status, "cached_complete");
        assert_eq!(layout.formulas.get(&(1, 1)).unwrap(), "=A2:A4*2");
        assert_eq!(
            layout.formulas.get(&(1, 3)).unwrap(),
            "=_xlfn.SEQUENCE(3,1,10,1)"
        );
        assert_eq!(md5::compute(FIXTURE), source_hash);
    }

    #[test]
    fn reads_controlled_array_conflict_and_error_cache_fixture() {
        const FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/array-formula-conflict-diagnostic.xlsx");
        let source_hash = md5::compute(FIXTURE);
        validate_workbook_package(FIXTURE).unwrap();
        let layout = read_workbook_sheet_layout(FIXTURE, "Array Boundary", 0, 10, 16).unwrap();
        let dynamic = &layout.array_formulas[1];

        assert_eq!(dynamic.kind, "dynamic_array");
        assert_eq!(dynamic.cached_cell_count, 3);
        assert_eq!(dynamic.cached_value_types["number"], 2);
        assert_eq!(dynamic.cached_value_types["error"], 1);
        assert_eq!(dynamic.error_cache_count, 1);
        assert_eq!(dynamic.error_cache_cells, ["D4"]);
        assert_eq!(dynamic.foreign_formula_cell_count, 1);
        assert_eq!(dynamic.conflict_cells, ["D3"]);
        assert!(!dynamic.diagnostic_cells_truncated);
        assert_eq!(dynamic.spill_status, "potential_conflict");
        assert_eq!(md5::compute(FIXTURE), source_hash);
    }

    #[test]
    fn array_formula_inventory_ignores_scalar_formulas_and_limits_declared_cells() {
        let scalar = br#"<worksheet><sheetData><row r="1"><c r="A1"><f>XMATCH(1,B1:B3)</f><v>1</v></c></row></sheetData></worksheet>"#;
        assert!(read_array_formulas(scalar).unwrap().is_empty());

        let oversized = br#"<worksheet><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:XFD1048576">SEQUENCE(1048576,16384)</f><v>1</v></c></row></sheetData></worksheet>"#;
        let error = read_array_formulas(oversized).unwrap_err();
        assert!(error.contains("1000000"));

        let conflict = br#"<worksheet><sheetData><row r="1"><c r="A1" cm="1"><f t="array" ref="A1:A3">SEQUENCE(3)</f><v>1</v></c></row><row r="2"><c r="A2" t="e"><f>1+1</f><v>#SPILL!</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>"#;
        let formulas = read_array_formulas(conflict).unwrap();
        assert_eq!(formulas[0].occupied_cell_count, 3);
        assert_eq!(formulas[0].cached_cell_count, 2);
        assert_eq!(formulas[0].missing_cached_cell_count, 1);
        assert_eq!(formulas[0].foreign_formula_cell_count, 1);
        assert_eq!(formulas[0].cached_value_types["number"], 1);
        assert_eq!(formulas[0].cached_value_types["error"], 1);
        assert_eq!(formulas[0].error_cache_count, 1);
        assert_eq!(formulas[0].error_cache_cells, ["A2"]);
        assert_eq!(formulas[0].conflict_cells, ["A2"]);
        assert!(!formulas[0].diagnostic_cells_truncated);
        assert_eq!(formulas[0].spill_status, "potential_conflict");
    }

    #[test]
    fn bounds_array_formula_diagnostic_addresses_without_hiding_totals() {
        let mut xml = String::from(
            r#"<worksheet><sheetData><row r="1"><c r="A1" t="e"><f t="array" ref="A1:A258">SEQUENCE(258)</f><v>#SPILL!</v></c></row>"#,
        );
        for row in 2..=258 {
            xml.push_str(&format!(
                r#"<row r="{row}"><c r="A{row}" t="e"><f>1+1</f><v>#SPILL!</v></c></row>"#
            ));
        }
        xml.push_str("</sheetData></worksheet>");

        let formulas = read_array_formulas(xml.as_bytes()).unwrap();
        let dynamic = &formulas[0];
        assert_eq!(dynamic.error_cache_count, 258);
        assert_eq!(dynamic.foreign_formula_cell_count, 257);
        assert_eq!(dynamic.error_cache_cells.len(), MAX_ARRAY_DIAGNOSTIC_CELLS);
        assert_eq!(dynamic.conflict_cells.len(), MAX_ARRAY_DIAGNOSTIC_CELLS);
        assert_eq!(dynamic.error_cache_cells.first().unwrap(), "A1");
        assert_eq!(dynamic.error_cache_cells.last().unwrap(), "A256");
        assert_eq!(dynamic.conflict_cells.first().unwrap(), "A2");
        assert_eq!(dynamic.conflict_cells.last().unwrap(), "A257");
        assert!(dynamic.diagnostic_cells_truncated);
    }

    #[test]
    fn blocks_array_formula_content_and_structure_writes() {
        const FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/array-formula-boundary.xlsx");
        let content_error = patch_workbook(
            FIXTURE,
            &[WorkbookCellEdit {
                sheet: "Array Boundary".into(),
                row: 2,
                column: 1,
                input: "99".into(),
                kind: "number".into(),
            }],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap_err();
        assert!(content_error.contains("read-only"));

        let structure_error = patch_workbook_structure(
            FIXTURE,
            &WorkbookStructureChange {
                sheet: "Array Boundary".into(),
                axis: WorkbookStructureAxis::Row,
                action: WorkbookStructureAction::Insert,
                index: 0,
                count: 1,
            },
        )
        .unwrap_err();
        assert!(structure_error.contains("read-only"));
    }

    #[test]
    fn audits_real_multi_axis_pivot_hierarchy_in_an_isolated_cache_package() {
        const FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/pivot-multi-axis-microsoft-excel.xlsx");
        validate_workbook_package(FIXTURE).unwrap();
        let linked = read_workbook_linked_data(FIXTURE).unwrap();
        let pivot = linked
            .pivot_tables
            .iter()
            .find(|pivot| pivot.name == "MultiAxisPivot")
            .unwrap();
        assert_eq!(pivot.audit.writeback.status, "structure_candidate");
        assert_eq!(pivot.audit.row_field_count, 2);
        assert_eq!(pivot.audit.column_field_count, 2);
        assert_eq!(pivot.audit.data_field_count, 1);
        assert_eq!(pivot.audit.page_field_count, 0);

        let (isolated, result) = audit_workbook_pivot_multi_axis_isolated(FIXTURE, pivot).unwrap();
        assert_eq!(result.status, "multi_axis_output_rebuilt");
        assert_eq!(result.execution, "temporary_copy_only");
        assert!(!result.writes_user_file);
        assert_eq!(result.source_record_count, 16);
        assert_eq!(result.preview_group_count, 16);
        assert_eq!(result.output_range, "A3:I12");
        assert_eq!(result.output_cell_count, 80);
        assert_eq!(result.row_axis.field_names, ["Region", "City"]);
        assert_eq!(result.row_axis.detail_item_count, 4);
        assert_eq!(result.row_axis.subtotal_item_count, 2);
        assert_eq!(result.row_axis.grand_total_item_count, 1);
        assert_eq!(result.row_axis.compressed_item_count, 2);
        assert_eq!(result.column_axis.field_names, ["Year", "Quarter"]);
        assert_eq!(result.column_axis.detail_item_count, 4);
        assert_eq!(result.column_axis.subtotal_item_count, 2);
        assert_eq!(result.column_axis.grand_total_item_count, 1);
        assert_eq!(result.column_axis.compressed_item_count, 2);
        assert!(result.package_valid);
        assert!(result.semantic_reparse_valid);
        assert!(!result.pivot_definition_preserved);
        assert!(!result.output_worksheet_preserved);
        assert!(result.untouched_parts_preserved);
        assert_ne!(result.source_package_digest, result.isolated_package_digest);
        assert_eq!(FIXTURE.len(), 14_433);

        let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(isolated)).unwrap();
        let output = workbook.worksheet_range("Pivot").unwrap();
        assert!(
            matches!(output.get_value((11, 8)), Some(Data::Float(value)) if *value == 424.0)
                || matches!(output.get_value((11, 8)), Some(Data::Int(424)))
        );
    }

    #[test]
    fn rebuilds_all_pivot_aggregations_from_raw_records_before_totals() {
        const PIVOT_FIXTURE: &[u8] =
            include_bytes!("../../tests/fixtures/workbook/pivot-producer-apache-poi.xlsx");
        let collapsed = super::patch_workbook(
            PIVOT_FIXTURE,
            &[
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 2,
                    column: 0,
                    input: "a".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 3,
                    column: 0,
                    input: "a".into(),
                    kind: "string".into(),
                },
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 2,
                    column: 2,
                    input: "44562".into(),
                    kind: "number".into(),
                },
                WorkbookCellEdit {
                    sheet: "Tabelle1".into(),
                    row: 3,
                    column: 2,
                    input: "44562".into(),
                    kind: "number".into(),
                },
            ],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let pivot = read_workbook_linked_data(&collapsed)
            .unwrap()
            .pivot_tables
            .into_iter()
            .find(|pivot| pivot.audit.writeback.status == "structure_candidate")
            .unwrap();
        for (aggregation, expected) in [
            ("sum", 6.0),
            ("count", 3.0),
            ("average", 2.0),
            ("max", 3.0),
            ("min", 1.0),
            ("product", 6.0),
            ("countNums", 3.0),
        ] {
            let (rebuilt, result) = rebuild_workbook_pivot_aggregation_variant_isolated(
                &collapsed,
                &pivot,
                aggregation,
            )
            .unwrap();
            assert_eq!(result.output_range, "A3:C5", "{aggregation}");
            let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(rebuilt)).unwrap();
            let output = workbook.worksheet_range("Tabelle2").unwrap();
            assert_eq!(
                output.get_value((4, 2)),
                Some(&Data::Float(expected)),
                "{aggregation}"
            );
        }
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

    #[test]
    fn creates_and_resizes_excel_table_package_parts() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Item").unwrap();
        sheet.write_string(0, 1, "Amount").unwrap();
        sheet.write_string(0, 2, "Region").unwrap();
        sheet.write_string(1, 0, "A").unwrap();
        sheet.write_number(1, 1, 10).unwrap();
        sheet.write_string(1, 2, "East").unwrap();
        sheet.write_string(2, 0, "B").unwrap();
        sheet.write_number(2, 1, 20).unwrap();
        sheet.write_string(2, 2, "West").unwrap();
        let source = workbook.save_to_buffer().unwrap();

        let created = patch_workbook_table(
            &source,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::Create,
                table_name: "SalesTable".into(),
                new_table_name: None,
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 1,
                },
                columns: vec!["Item".into(), "Amount".into()],
            },
        )
        .unwrap();
        validate_workbook_package(&created).unwrap();
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.tables.len(), 1);
        assert_eq!(layout.tables[0].display_name, "SalesTable");
        assert_eq!(layout.tables[0].columns, vec!["Item", "Amount"]);
        assert!(zip_text(&created, "xl/worksheets/sheet1.xml").contains("tableParts count=\"1\""));
        assert!(zip_text(&created, "xl/worksheets/_rels/sheet1.xml.rels")
            .contains("../tables/table1.xml"));
        assert!(zip_text(&created, "[Content_Types].xml").contains("/xl/tables/table1.xml"));

        let resized = patch_workbook_table(
            &created,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::Resize,
                table_name: "SalesTable".into(),
                new_table_name: None,
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: vec!["Item".into(), "Amount".into(), "Region".into()],
            },
        )
        .unwrap();
        validate_workbook_package(&resized).unwrap();
        let layout = read_workbook_sheet_layout(&resized, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.tables[0].range.right, 2);
        assert_eq!(layout.tables[0].columns, vec!["Item", "Amount", "Region"]);
        assert!(zip_text(&resized, "xl/tables/table1.xml").contains("ref=\"A1:C3\""));

        let renamed = patch_workbook_table(
            &resized,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::Rename,
                table_name: "SalesTable".into(),
                new_table_name: Some("RevenueTable".into()),
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: Vec::new(),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&renamed, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.tables[0].display_name, "RevenueTable");

        let styled = patch_workbook_table(
            &renamed,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::SetStyle,
                table_name: "RevenueTable".into(),
                new_table_name: None,
                style_name: Some("TableStyleMedium4".into()),
                show_first_column: Some(true),
                show_last_column: Some(true),
                show_row_stripes: Some(false),
                show_column_stripes: Some(true),
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: Vec::new(),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&styled, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.tables[0].style_name.as_deref(),
            Some("TableStyleMedium4")
        );
        assert!(layout.tables[0].show_first_column);
        assert!(layout.tables[0].show_last_column);
        assert!(!layout.tables[0].show_row_stripes);
        assert!(layout.tables[0].show_column_stripes);

        let filtered = patch_workbook_filter(
            &styled,
            &WorkbookFilterChange {
                sheet: "Data".into(),
                target: WorkbookFilterTarget::Table,
                action: WorkbookFilterAction::Apply,
                table_name: Some("RevenueTable".into()),
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                filter_column: Some(2),
                query: Some("Ea*?".into()),
                sort_column: Some(1),
                sort_direction: Some("desc".into()),
            },
        )
        .unwrap();
        validate_workbook_package(&filtered).unwrap();
        let layout = read_workbook_sheet_layout(&filtered, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.tables[0].filter_state.filter_column, Some(2));
        assert_eq!(layout.tables[0].filter_state.query.as_deref(), Some("Ea*?"));
        assert_eq!(layout.tables[0].filter_state.sort_column, Some(1));
        assert_eq!(
            layout.tables[0].filter_state.sort_direction.as_deref(),
            Some("desc")
        );
        assert!(layout.tables[0].filter_state.editable);

        let cleared = patch_workbook_filter(
            &filtered,
            &WorkbookFilterChange {
                sheet: "Data".into(),
                target: WorkbookFilterTarget::Table,
                action: WorkbookFilterAction::Clear,
                table_name: Some("RevenueTable".into()),
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                filter_column: None,
                query: None,
                sort_column: None,
                sort_direction: None,
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&cleared, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.tables[0].filter_state,
            WorkbookFilterState {
                editable: true,
                ..WorkbookFilterState::default()
            }
        );

        let converted = patch_workbook_table(
            &cleared,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::ConvertToRange,
                table_name: "RevenueTable".into(),
                new_table_name: None,
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: Vec::new(),
            },
        )
        .unwrap();
        validate_workbook_package(&converted).unwrap();
        let layout = read_workbook_sheet_layout(&converted, "Data", 0, 10, 10).unwrap();
        assert!(layout.tables.is_empty());
        assert!(!zip_has(&converted, "xl/tables/table1.xml"));
        assert!(!zip_text(&converted, "xl/worksheets/sheet1.xml").contains("tableParts"));
        assert!(!zip_text(&converted, "xl/worksheets/_rels/sheet1.xml.rels")
            .contains("relationships/table"));
        assert!(!zip_text(&converted, "[Content_Types].xml").contains("/xl/tables/table1.xml"));

        let recreated = patch_workbook_table(
            &converted,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::Create,
                table_name: "ReplacementTable".into(),
                new_table_name: None,
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: vec!["Item".into(), "Amount".into(), "Region".into()],
            },
        )
        .unwrap();
        let deleted = patch_workbook_table(
            &recreated,
            &WorkbookTableChange {
                sheet: "Data".into(),
                action: WorkbookTableAction::Delete,
                table_name: "ReplacementTable".into(),
                new_table_name: None,
                style_name: None,
                show_first_column: None,
                show_last_column: None,
                show_row_stripes: None,
                show_column_stripes: None,
                range: WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 2,
                },
                columns: Vec::new(),
            },
        )
        .unwrap();
        validate_workbook_package(&deleted).unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10)
            .unwrap()
            .tables
            .is_empty());
    }

    #[test]
    fn persists_and_clears_worksheet_auto_filter_state() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Item").unwrap();
        sheet.write_string(0, 1, "Amount").unwrap();
        sheet.write_string(1, 0, "Alpha").unwrap();
        sheet.write_number(1, 1, 20).unwrap();
        sheet.write_string(2, 0, "Beta").unwrap();
        sheet.write_number(2, 1, 10).unwrap();
        sheet.autofilter(0, 0, 2, 1).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let range = WorkbookMergeRange {
            top: 0,
            bottom: 2,
            left: 0,
            right: 1,
        };
        let filtered = patch_workbook_filter(
            &source,
            &WorkbookFilterChange {
                sheet: "Data".into(),
                target: WorkbookFilterTarget::Worksheet,
                action: WorkbookFilterAction::Apply,
                table_name: None,
                range: range.clone(),
                filter_column: Some(0),
                query: Some("Al".into()),
                sort_column: Some(1),
                sort_direction: Some("asc".into()),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&filtered, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.auto_filter_state.filter_column, Some(0));
        assert_eq!(layout.auto_filter_state.query.as_deref(), Some("Al"));
        assert_eq!(layout.auto_filter_state.sort_column, Some(1));
        assert_eq!(
            layout.auto_filter_state.sort_direction.as_deref(),
            Some("asc")
        );
        assert!(layout.auto_filter_state.editable);

        let cleared = patch_workbook_filter(
            &filtered,
            &WorkbookFilterChange {
                sheet: "Data".into(),
                target: WorkbookFilterTarget::Worksheet,
                action: WorkbookFilterAction::Clear,
                table_name: None,
                range,
                filter_column: None,
                query: None,
                sort_column: None,
                sort_direction: None,
            },
        )
        .unwrap();
        validate_workbook_package(&cleared).unwrap();
        let layout = read_workbook_sheet_layout(&cleared, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.auto_filter_state,
            WorkbookFilterState {
                editable: true,
                ..WorkbookFilterState::default()
            }
        );
    }

    #[test]
    fn marks_advanced_and_multi_column_filters_read_only() {
        let range = WorkbookMergeRange {
            top: 0,
            bottom: 5,
            left: 0,
            right: 2,
        };
        let advanced = br#"<worksheet><autoFilter ref="A1:C6"><filterColumn colId="0"><top10 val="10"/></filterColumn></autoFilter></worksheet>"#;
        assert!(
            !super::read_auto_filter_state(advanced, &range)
                .unwrap()
                .editable
        );
        let multiple = br#"<worksheet><autoFilter ref="A1:C6"><filterColumn colId="0"><customFilters><customFilter val="*A*"/></customFilters></filterColumn><filterColumn colId="1"><customFilters><customFilter val="*B*"/></customFilters></filterColumn></autoFilter></worksheet>"#;
        assert!(
            !super::read_auto_filter_state(multiple, &range)
                .unwrap()
                .editable
        );
    }

    #[test]
    fn creates_updates_and_deletes_basic_conditional_format_rules() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 2).unwrap();
        sheet.write_number(1, 0, 8).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let rule = |range: WorkbookMergeRange,
                    operator: &str,
                    first: &str,
                    second: Option<&str>,
                    fill: &str| WorkbookConditionalFormatRule {
            group_index: 0,
            rule_index: 0,
            ranges: vec![range],
            kind: "cellIs".into(),
            operator: Some(operator.into()),
            formula1: Some(first.into()),
            formula2: second.map(str::to_string),
            priority: 0,
            stop_if_true: true,
            style: WorkbookConditionalFormatStyle {
                font_color: None,
                fill_color: Some(fill.into()),
                bold: true,
            },
            color_scale: None,
            data_bar: None,
            icon_set: None,
            editable: true,
        };
        let created = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(rule(
                    WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    },
                    "greaterThan",
                    "5",
                    None,
                    "#FFC7CE",
                )),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 1);
        assert!(layout.conditional_formats[0].editable);
        assert_eq!(
            layout.conditional_formats[0].style.fill_color.as_deref(),
            Some("#FFC7CE")
        );
        assert_eq!(layout.conditional_formats[0].priority, 1);

        let updated = patch_workbook_conditional_format(
            &created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(0),
                rule_index: Some(0),
                rule: Some(rule(
                    WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 1,
                        right: 1,
                    },
                    "between",
                    "1",
                    Some("10"),
                    "#C6EFCE",
                )),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.conditional_formats[0].operator.as_deref(),
            Some("between")
        );
        assert_eq!(
            layout.conditional_formats[0].formula2.as_deref(),
            Some("10")
        );
        assert_eq!(layout.conditional_formats[0].ranges[0].left, 1);
        assert_eq!(
            layout.conditional_formats[0].style.fill_color.as_deref(),
            Some("#C6EFCE")
        );

        let deleted = patch_workbook_conditional_format(
            &updated,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(0),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        validate_workbook_package(&deleted).unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10)
            .unwrap()
            .conditional_formats
            .is_empty());
    }

    #[test]
    fn reorders_overlapping_conditional_formats_without_rewriting_rule_content() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 50).unwrap();
        let mut source = workbook.save_to_buffer().unwrap();
        let rule = |threshold: &str, fill: &str| WorkbookConditionalFormatRule {
            group_index: 0,
            rule_index: 0,
            ranges: vec![WorkbookMergeRange {
                top: 0,
                bottom: 9,
                left: 0,
                right: 0,
            }],
            kind: "cellIs".into(),
            operator: Some("greaterThan".into()),
            formula1: Some(threshold.into()),
            formula2: None,
            priority: 0,
            stop_if_true: threshold == "10",
            style: WorkbookConditionalFormatStyle {
                fill_color: Some(fill.into()),
                ..Default::default()
            },
            color_scale: None,
            data_bar: None,
            icon_set: None,
            editable: true,
        };
        for (threshold, fill) in [("10", "#FFC7CE"), ("20", "#FFEB9C"), ("30", "#C6EFCE")] {
            source = patch_workbook_conditional_format(
                &source,
                &WorkbookConditionalFormatChange {
                    sheet: "Data".into(),
                    action: WorkbookConditionalFormatAction::Create,
                    group_index: None,
                    rule_index: None,
                    rule: Some(rule(threshold, fill)),
                },
            )
            .unwrap();
        }
        let styles_before = zip_text(&source, "xl/styles.xml");
        let xml_before = zip_text(&source, "xl/worksheets/sheet1.xml");
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout
                .conditional_formats
                .iter()
                .map(|rule| (rule.group_index, rule.priority))
                .collect::<Vec<_>>(),
            vec![(0, 1), (1, 2), (2, 3)]
        );
        assert!(layout.conditional_formats[0].stop_if_true);

        let moved_down = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::MoveDown,
                group_index: Some(0),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        validate_workbook_package(&moved_down).unwrap();
        assert_eq!(styles_before, zip_text(&moved_down, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&moved_down, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout
                .conditional_formats
                .iter()
                .map(|rule| (rule.group_index, rule.priority))
                .collect::<Vec<_>>(),
            vec![(0, 2), (1, 1), (2, 3)]
        );
        let xml_after = zip_text(&moved_down, "xl/worksheets/sheet1.xml");
        for formula in [
            "<formula>10</formula>",
            "<formula>20</formula>",
            "<formula>30</formula>",
        ] {
            assert_eq!(
                xml_before.matches(formula).count(),
                xml_after.matches(formula).count()
            );
        }

        let moved_up = patch_workbook_conditional_format(
            &moved_down,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::MoveUp,
                group_index: Some(2),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&moved_up, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout
                .conditional_formats
                .iter()
                .map(|rule| (rule.group_index, rule.priority))
                .collect::<Vec<_>>(),
            vec![(0, 3), (1, 1), (2, 2)]
        );
        assert_eq!(styles_before, zip_text(&moved_up, "xl/styles.xml"));

        let boundary_error = patch_workbook_conditional_format(
            &moved_up,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::MoveUp,
                group_index: Some(1),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap_err();
        assert!(boundary_error.contains("priority boundary"));
    }

    #[test]
    fn updates_and_deletes_one_rule_inside_a_shared_range_group() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 15).unwrap();
        let red = Format::new().set_background_color("#FFC7CE");
        let green = Format::new().set_background_color("#C6EFCE");
        sheet
            .add_conditional_format(
                0,
                0,
                9,
                0,
                &ConditionalFormatCell::new()
                    .set_rule(ConditionalFormatCellRule::GreaterThan(10))
                    .set_format(&red),
            )
            .unwrap();
        sheet
            .add_conditional_format(
                0,
                0,
                9,
                0,
                &ConditionalFormatCell::new()
                    .set_rule(ConditionalFormatCellRule::LessThan(20))
                    .set_format(&green),
            )
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 2);
        assert!(layout.conditional_formats.iter().all(|rule| rule.editable));
        assert_eq!(layout.conditional_formats[0].group_index, 0);
        assert_eq!(layout.conditional_formats[0].rule_index, 0);
        assert_eq!(layout.conditional_formats[1].group_index, 0);
        assert_eq!(layout.conditional_formats[1].rule_index, 1);

        let mut invalid_range = layout.conditional_formats[1].clone();
        invalid_range.ranges[0].right = 1;
        let error = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(0),
                rule_index: Some(1),
                rule: Some(invalid_range),
            },
        )
        .unwrap_err();
        assert!(error.contains("shared-range"));

        let mut replacement = layout.conditional_formats[1].clone();
        replacement.formula1 = Some("25".into());
        replacement.stop_if_true = true;
        replacement.style.fill_color = Some("#C6EFCE".into());
        let updated = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(0),
                rule_index: Some(1),
                rule: Some(replacement),
            },
        )
        .unwrap();
        validate_workbook_package(&updated).unwrap();
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 2);
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("10")
        );
        assert_eq!(
            layout.conditional_formats[1].formula1.as_deref(),
            Some("25")
        );
        assert!(layout.conditional_formats[1].stop_if_true);
        let xml = zip_text(&updated, "xl/worksheets/sheet1.xml");
        assert_eq!(xml.matches("<conditionalFormatting").count(), 1);
        assert_eq!(xml.matches("<cfRule").count(), 2);

        let deleted_first = patch_workbook_conditional_format(
            &updated,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(0),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&deleted_first, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 1);
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("25")
        );
        assert_eq!(layout.conditional_formats[0].rule_index, 0);

        let deleted_last = patch_workbook_conditional_format(
            &deleted_first,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(0),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        assert!(read_workbook_sheet_layout(&deleted_last, "Data", 0, 10, 10)
            .unwrap()
            .conditional_formats
            .is_empty());
    }

    #[test]
    fn splits_and_recombines_shared_range_rules_without_rebuilding_rule_xml() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        let red = Format::new().set_background_color("#FFC7CE");
        let green = Format::new().set_background_color("#C6EFCE");
        for conditional_format in [
            ConditionalFormatCell::new()
                .set_rule(ConditionalFormatCellRule::GreaterThan(10))
                .set_format(&red),
            ConditionalFormatCell::new()
                .set_rule(ConditionalFormatCellRule::LessThan(20))
                .set_format(&green),
        ] {
            sheet
                .add_conditional_format(0, 0, 9, 0, &conditional_format)
                .unwrap();
        }
        let source = workbook.save_to_buffer().unwrap();
        let styles_before = zip_text(&source, "xl/styles.xml");
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        let mut split_request = layout.conditional_formats[1].clone();
        split_request.ranges = vec![WorkbookMergeRange {
            top: 0,
            bottom: 9,
            left: 1,
            right: 1,
        }];
        let split = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Split,
                group_index: Some(0),
                rule_index: Some(1),
                rule: Some(split_request),
            },
        )
        .unwrap();
        validate_workbook_package(&split).unwrap();
        assert_eq!(styles_before, zip_text(&split, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&split, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 2);
        assert_eq!(layout.conditional_formats[0].group_index, 0);
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("10")
        );
        assert_eq!(layout.conditional_formats[1].group_index, 1);
        assert_eq!(
            layout.conditional_formats[1].formula1.as_deref(),
            Some("20")
        );
        assert_eq!(layout.conditional_formats[1].ranges[0].left, 1);

        let mut independent = layout.conditional_formats[1].clone();
        independent.ranges = layout.conditional_formats[0].ranges.clone();
        independent.style.fill_color = Some("#C6EFCE".into());
        let aligned = patch_workbook_conditional_format(
            &split,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(1),
                rule_index: Some(0),
                rule: Some(independent),
            },
        )
        .unwrap();
        let styles_aligned = zip_text(&aligned, "xl/styles.xml");
        let merged = patch_workbook_conditional_format(
            &aligned,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Merge,
                group_index: Some(1),
                rule_index: Some(0),
                rule: None,
            },
        )
        .unwrap();
        validate_workbook_package(&merged).unwrap();
        assert_eq!(styles_aligned, zip_text(&merged, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&merged, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 2);
        assert!(layout
            .conditional_formats
            .iter()
            .all(|rule| rule.group_index == 0));
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("10")
        );
        assert_eq!(
            layout.conditional_formats[1].formula1.as_deref(),
            Some("20")
        );
        let xml = zip_text(&merged, "xl/worksheets/sheet1.xml");
        assert_eq!(xml.matches("<conditionalFormatting").count(), 1);
        assert_eq!(xml.matches("<cfRule").count(), 2);
    }

    #[test]
    fn updates_two_cell_drawing_metadata_and_anchor_without_rebuilding_chart_parts() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Category").unwrap();
        sheet.write_number(0, 1, 10).unwrap();
        sheet.write_string(1, 0, "Other").unwrap();
        sheet.write_number(1, 1, 20).unwrap();
        let mut chart = Chart::new(ChartType::Column);
        chart
            .add_series()
            .set_categories("Data!$A$1:$A$2")
            .set_values("Data!$B$1:$B$2");
        sheet.insert_chart(1, 3, &chart).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let chart_before = zip_text(&source, "xl/charts/chart1.xml");
        let relationships_before = zip_text(&source, "xl/drawings/_rels/drawing1.xml.rels");
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        let drawing = layout.drawings.first().unwrap();
        assert_eq!(drawing.anchor_kind, "two_cell");
        assert!(drawing.editable);

        let metadata = patch_workbook_drawing(
            &source,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateMetadata,
                name: Some("Quarterly chart".into()),
                description: Some("Local inventory summary".into()),
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&metadata).unwrap();
        assert_eq!(chart_before, zip_text(&metadata, "xl/charts/chart1.xml"));
        assert_eq!(
            relationships_before,
            zip_text(&metadata, "xl/drawings/_rels/drawing1.xml.rels")
        );
        let layout = read_workbook_sheet_layout(&metadata, "Data", 0, 10, 10).unwrap();
        let drawing = layout.drawings.first().unwrap();
        assert_eq!(drawing.name, "Quarterly chart");
        assert_eq!(
            drawing.description.as_deref(),
            Some("Local inventory summary")
        );

        let from = WorkbookDrawingAnchor {
            row: 4,
            column: 5,
            row_offset: 0,
            column_offset: 0,
        };
        let to = WorkbookDrawingAnchor {
            row: 16,
            column: 11,
            row_offset: 0,
            column_offset: 0,
        };
        let moved = patch_workbook_drawing(
            &metadata,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::MoveResize,
                name: None,
                description: None,
                from: Some(from.clone()),
                to: Some(to.clone()),
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&moved).unwrap();
        assert_eq!(chart_before, zip_text(&moved, "xl/charts/chart1.xml"));
        assert_eq!(
            relationships_before,
            zip_text(&moved, "xl/drawings/_rels/drawing1.xml.rels")
        );
        let layout = read_workbook_sheet_layout(&moved, "Data", 0, 20, 20).unwrap();
        assert_eq!(layout.drawings[0].from, from);
        assert_eq!(layout.drawings[0].to.as_ref(), Some(&to));
        assert_eq!(layout.drawings[0].name, "Quarterly chart");

        let error = patch_workbook_drawing(
            &moved,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: "stale-id".into(),
                action: WorkbookDrawingAction::UpdateMetadata,
                name: Some("Invalid".into()),
                description: Some(String::new()),
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap_err();
        assert!(error.contains("no longer exists"));
    }

    #[test]
    fn creates_changes_and_deletes_standard_chart_lifecycle() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Month").unwrap();
        sheet.write_string(0, 1, "Revenue").unwrap();
        for (row, (month, revenue)) in [("Jan", 12.0), ("Feb", 18.0), ("Mar", 15.0)]
            .into_iter()
            .enumerate()
        {
            sheet.write_string((row + 1) as u32, 0, month).unwrap();
            sheet.write_number((row + 1) as u32, 1, revenue).unwrap();
        }
        let source = workbook.save_to_buffer().unwrap();
        let created = patch_workbook_drawing(
            &source,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: String::new(),
                anchor_index: 0,
                object_id: String::new(),
                action: WorkbookDrawingAction::CreateChart,
                name: None,
                description: None,
                from: Some(WorkbookDrawingAnchor {
                    row: 1,
                    column: 3,
                    row_offset: 0,
                    column_offset: 0,
                }),
                to: Some(WorkbookDrawingAnchor {
                    row: 16,
                    column: 11,
                    row_offset: 0,
                    column_offset: 0,
                }),
                chart_title: Some("Revenue trend".into()),
                chart_type: Some("column".into()),
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: Some(WorkbookMergeRange {
                    top: 0,
                    bottom: 3,
                    left: 0,
                    right: 1,
                }),
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&created).unwrap();
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 20, 20).unwrap();
        assert_eq!(layout.drawings.len(), 1);
        let drawing = &layout.drawings[0];
        assert_eq!(drawing.anchor_kind, "two_cell");
        let chart = drawing.chart.as_ref().unwrap();
        assert_eq!(chart.chart_type, "column");
        assert_eq!(chart.title.as_deref(), Some("Revenue trend"));
        assert_eq!(chart.series.len(), 1);
        assert_eq!(
            chart.series[0].categories.as_deref(),
            Some("Data!$A$2:$A$4")
        );
        assert_eq!(chart.series[0].values.as_deref(), Some("Data!$B$2:$B$4"));
        let chart_path = drawing.part.clone().unwrap();

        let changed = patch_workbook_drawing(
            &created,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::ChangeChartType,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: Some("line".into()),
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&changed).unwrap();
        let layout = read_workbook_sheet_layout(&changed, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        assert_eq!(
            drawing
                .chart
                .as_ref()
                .map(|chart| chart.chart_type.as_str()),
            Some("line")
        );

        let presented = patch_workbook_drawing(
            &changed,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartPresentation,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: Some("Month".into()),
                value_axis_title: Some("Revenue".into()),
                legend_position: Some("bottom".into()),
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&presented).unwrap();
        let layout = read_workbook_sheet_layout(&presented, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        let chart = drawing.chart.as_ref().unwrap();
        assert_eq!(chart.title.as_deref(), Some("Revenue trend"));
        assert_eq!(chart.category_axis_title.as_deref(), Some("Month"));
        assert_eq!(chart.value_axis_title.as_deref(), Some("Revenue"));
        assert_eq!(chart.legend_position, "bottom");
        assert!(chart.presentation_editable);
        assert_eq!(chart.series.len(), 1);
        assert_eq!(chart.series[0].values.as_deref(), Some("Data!$B$2:$B$4"));

        let renamed = patch_workbook_drawing(
            &presented,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartSeriesName,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: Some("Net revenue".into()),
                series_color: None,
                source_range: None,
                series_index: Some(0),
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&renamed).unwrap();
        let layout = read_workbook_sheet_layout(&renamed, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        let labeled = patch_workbook_drawing(
            &renamed,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartDataLabels,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: Some(WorkbookChartDataLabels {
                    show_value: true,
                    show_category_name: true,
                    show_series_name: false,
                    show_percent: false,
                }),
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&labeled).unwrap();
        let layout = read_workbook_sheet_layout(&labeled, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        let chart = drawing.chart.as_ref().unwrap();
        assert_eq!(chart.title.as_deref(), Some("Revenue trend"));
        assert_eq!(chart.category_axis_title.as_deref(), Some("Month"));
        assert_eq!(chart.value_axis_title.as_deref(), Some("Revenue"));
        assert_eq!(chart.legend_position, "bottom");
        assert_eq!(chart.series[0].name.as_deref(), Some("Net revenue"));
        assert_eq!(chart.series[0].values.as_deref(), Some("Data!$B$2:$B$4"));
        assert!(chart.series[0].name_editable);
        assert_eq!(
            chart.data_labels,
            WorkbookChartDataLabels {
                show_value: true,
                show_category_name: true,
                show_series_name: false,
                show_percent: false,
            }
        );
        assert!(chart.data_labels_editable);

        let colored = patch_workbook_drawing(
            &labeled,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartSeriesColor,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: Some("#2a6fdb".into()),
                source_range: None,
                series_index: Some(0),
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&colored).unwrap();
        let layout = read_workbook_sheet_layout(&colored, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        let chart = drawing.chart.as_ref().unwrap();
        assert_eq!(chart.series[0].color.as_deref(), Some("#2A6FDB"));
        assert!(chart.series[0].color_editable);
        assert_eq!(chart.series[0].name.as_deref(), Some("Net revenue"));
        assert_eq!(chart.category_axis_title.as_deref(), Some("Month"));
        assert!(chart.data_labels.show_value);

        let retyped = patch_workbook_drawing(
            &colored,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::ChangeChartType,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: Some("column".into()),
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&retyped).unwrap();
        let layout = read_workbook_sheet_layout(&retyped, "Data", 0, 20, 20).unwrap();
        let drawing = &layout.drawings[0];
        let chart = drawing.chart.as_ref().unwrap();
        assert_eq!(chart.chart_type, "column");
        assert_eq!(chart.series[0].color.as_deref(), Some("#2A6FDB"));
        assert!(chart.series[0].color_editable);

        let deleted = patch_workbook_drawing(
            &retyped,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::DeleteChart,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&deleted).unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 20, 20)
            .unwrap()
            .drawings
            .is_empty());
        assert!(!super::load_package(&deleted)
            .unwrap()
            .iter()
            .any(|entry| entry.name == chart_path));
        assert!(!zip_text(&deleted, "[Content_Types].xml").contains(&format!("/{chart_path}")));
    }

    #[test]
    fn keeps_advanced_point_data_labels_read_only() {
        let chart = parse_chart_part(
            br#"<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Revenue</c:v></c:tx><c:spPr><a:gradFill><a:gsLst/></a:gradFill></c:spPr><c:cat><c:strRef><c:f>Data!$A$1:$A$2</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Data!$B$1:$B$2</c:f></c:numRef></c:val></c:ser><c:dLbls><c:dLbl><c:idx val="0"/><c:tx><c:rich/></c:tx></c:dLbl><c:showVal val="1"/></c:dLbls><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx></c:catAx><c:valAx></c:valAx></c:plotArea></c:chart></c:chartSpace>"#,
        )
        .unwrap();
        assert!(chart.presentation_editable);
        assert!(chart.data_labels.show_value);
        assert!(!chart.data_labels_editable);
        assert!(chart.series[0].name_editable);
        assert!(!chart.series[0].color_editable);
    }

    #[test]
    fn updates_chart_title_and_internal_series_references_with_semantic_verification() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        for (row, (category, value)) in [("North", 10.0), ("South", 20.0), ("West", 30.0)]
            .into_iter()
            .enumerate()
        {
            sheet.write_string(row as u32, 0, category).unwrap();
            sheet.write_number(row as u32, 1, value).unwrap();
        }
        let mut chart = Chart::new(ChartType::Column);
        chart.title().set_name("Original title");
        chart
            .add_series()
            .set_categories("Data!$A$1:$A$2")
            .set_values("Data!$B$1:$B$2");
        sheet.insert_chart(1, 3, &chart).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let drawing_before = zip_text(&source, "xl/drawings/drawing1.xml");
        let relationships_before = zip_text(&source, "xl/drawings/_rels/drawing1.xml.rels");
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        let drawing = layout.drawings.first().unwrap();
        let parsed = drawing.chart.as_ref().unwrap();
        assert!(parsed.title_editable);
        assert!(parsed.series[0].editable);

        let titled = patch_workbook_drawing(
            &source,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartTitle,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: Some("Regional inventory".into()),
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: None,
                series_categories: None,
                series_values: None,
            },
        )
        .unwrap();
        validate_workbook_package(&titled).unwrap();
        assert_eq!(
            drawing_before,
            zip_text(&titled, "xl/drawings/drawing1.xml")
        );
        assert_eq!(
            relationships_before,
            zip_text(&titled, "xl/drawings/_rels/drawing1.xml.rels")
        );
        let layout = read_workbook_sheet_layout(&titled, "Data", 0, 10, 10).unwrap();
        let drawing = layout.drawings.first().unwrap();
        assert_eq!(
            drawing.chart.as_ref().unwrap().title.as_deref(),
            Some("Regional inventory")
        );

        let updated = patch_workbook_drawing(
            &titled,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartSeries,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: Some(0),
                series_categories: Some("Data!$A$2:$A$3".into()),
                series_values: Some("Data!$B$2:$B$3".into()),
            },
        )
        .unwrap();
        validate_workbook_package(&updated).unwrap();
        assert_eq!(
            drawing_before,
            zip_text(&updated, "xl/drawings/drawing1.xml")
        );
        assert_eq!(
            relationships_before,
            zip_text(&updated, "xl/drawings/_rels/drawing1.xml.rels")
        );
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        let series = &layout.drawings[0].chart.as_ref().unwrap().series[0];
        assert_eq!(series.categories.as_deref(), Some("Data!$A$2:$A$3"));
        assert_eq!(series.values.as_deref(), Some("Data!$B$2:$B$3"));

        let error = patch_workbook_drawing(
            &updated,
            &WorkbookDrawingChange {
                sheet: "Data".into(),
                drawing_part: drawing.drawing_part.clone(),
                anchor_index: drawing.anchor_index,
                object_id: drawing.object_id.clone(),
                action: WorkbookDrawingAction::UpdateChartSeries,
                name: None,
                description: None,
                from: None,
                to: None,
                chart_title: None,
                chart_type: None,
                category_axis_title: None,
                value_axis_title: None,
                legend_position: None,
                data_labels: None,
                series_name: None,
                series_color: None,
                source_range: None,
                series_index: Some(0),
                series_categories: Some("[External.xlsx]Data!$A$1:$A$2".into()),
                series_values: Some("Data!$B$1:$B$2".into()),
            },
        )
        .unwrap_err();
        assert!(error.contains("internal worksheet"));
    }

    #[test]
    fn edits_safe_conditional_expressions_and_keeps_unsupported_formulas_read_only() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Late").unwrap();
        sheet
            .add_conditional_format(
                0,
                0,
                1,
                0,
                &ConditionalFormatFormula::new()
                    .set_rule("=$A1=\"Late\"")
                    .set_format(Format::new().set_background_color("#FFC7CE")),
            )
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let layout = read_workbook_sheet_layout(&source, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats.len(), 1);
        assert_eq!(layout.conditional_formats[0].kind, "expression");
        assert!(layout.conditional_formats[0].editable);
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("$A1=\"Late\"")
        );

        let updated = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(0),
                rule_index: Some(0),
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 1,
                        left: 0,
                        right: 1,
                    }],
                    kind: "expression".into(),
                    operator: None,
                    formula1: Some("AND($A1=\"Closed\",B1<100)".into()),
                    formula2: None,
                    priority: 1,
                    stop_if_true: true,
                    style: WorkbookConditionalFormatStyle {
                        fill_color: Some("#FFEB9C".into()),
                        ..Default::default()
                    },
                    color_scale: None,
                    data_bar: None,
                    icon_set: None,
                    editable: true,
                }),
            },
        )
        .unwrap();
        validate_workbook_package(&updated).unwrap();
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        assert!(layout.conditional_formats[0].editable);
        assert_eq!(
            layout.conditional_formats[0].formula1.as_deref(),
            Some("AND($A1=\"Closed\",B1<100)")
        );
        let sheet_xml = zip_text(&updated, "xl/worksheets/sheet1.xml");
        assert!(sheet_xml.contains("type=\"expression\""));
        assert!(!sheet_xml.contains("operator="));

        let xml = br#"<worksheet><conditionalFormatting sqref="A1"><cfRule type="expression" dxfId="0" priority="1"><formula>AND(A1&gt;0,A1&lt;10)</formula></cfRule></conditionalFormatting></worksheet>"#;
        let rules =
            super::read_conditional_formats(xml, &[WorkbookConditionalFormatStyle::default()])
                .unwrap();
        assert_eq!(rules[0].kind, "expression");
        assert!(rules[0].editable);
        assert_eq!(rules[0].formula1.as_deref(), Some("AND(A1>0,A1<10)"));
        assert!(super::safe_conditional_expression_supported("A1>0"));
        assert!(super::safe_conditional_expression_supported("$D2=\"Late\""));
        assert!(super::safe_conditional_expression_supported(
            "AND($D2=\"逾期\",OR(E2<100,NOT(F2=TRUE)))"
        ));
        assert!(super::safe_conditional_expression_supported("A1<=$B$2"));
        assert!(!super::safe_conditional_expression_supported("A1>\"Late\""));
        assert!(!super::safe_conditional_expression_supported("Other!A1>0"));
        assert!(!super::safe_conditional_expression_supported("SUM(A1)>0"));
        assert!(!super::safe_conditional_expression_supported("A1:A2>0"));
        let too_many_references = format!(
            "AND({})",
            (1..=9)
                .map(|row| format!("A{row}>0"))
                .collect::<Vec<_>>()
                .join(",")
        );
        assert!(!super::safe_conditional_expression_supported(
            &too_many_references
        ));
        let too_deep = format!("{}A1>0{}", "NOT(".repeat(9), ")".repeat(9));
        assert!(!super::safe_conditional_expression_supported(&too_deep));

        let unsupported = br#"<worksheet><conditionalFormatting sqref="A1"><cfRule type="expression" dxfId="0" priority="1"><formula>SUM(A1)&gt;0</formula></cfRule></conditionalFormatting></worksheet>"#;
        let rules = super::read_conditional_formats(
            unsupported,
            &[WorkbookConditionalFormatStyle::default()],
        )
        .unwrap();
        assert!(!rules[0].editable);
        assert_eq!(rules[0].formula1.as_deref(), Some("SUM(A1)>0"));
    }

    #[test]
    fn writes_fixed_numeric_color_scales_without_adding_dxf_styles() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 0).unwrap();
        sheet.write_number(1, 0, 50).unwrap();
        sheet.write_number(2, 0, 100).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let styles_before = zip_text(&source, "xl/styles.xml");
        let point = |value: &str, color: &str| WorkbookConditionalColorScalePoint {
            kind: "num".into(),
            value: Some(value.into()),
            color: color.into(),
            resolved_value: Some(value.into()),
        };
        let created = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    }],
                    kind: "colorScale".into(),
                    operator: None,
                    formula1: None,
                    formula2: None,
                    priority: 0,
                    stop_if_true: false,
                    style: WorkbookConditionalFormatStyle::default(),
                    color_scale: Some(WorkbookConditionalColorScale {
                        points: vec![
                            point("0", "#F8696B"),
                            point("50", "#FFEB84"),
                            point("100", "#63BE7B"),
                        ],
                    }),
                    data_bar: None,
                    icon_set: None,
                    editable: true,
                }),
            },
        )
        .unwrap();
        validate_workbook_package(&created).unwrap();
        assert_eq!(styles_before, zip_text(&created, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        let rule = &layout.conditional_formats[0];
        assert_eq!(rule.kind, "colorScale");
        assert!(rule.editable);
        assert_eq!(rule.color_scale.as_ref().unwrap().points.len(), 3);
        assert!(zip_text(&created, "xl/worksheets/sheet1.xml")
            .contains("<cfvo type=\"num\" val=\"50\"/>"));

        let mut replacement = rule.clone();
        replacement.color_scale = Some(WorkbookConditionalColorScale {
            points: vec![point("10", "#F8696B"), point("90", "#63BE7B")],
        });
        let updated = patch_workbook_conditional_format(
            &created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(rule.group_index),
                rule_index: Some(rule.rule_index),
                rule: Some(replacement),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.conditional_formats[0]
                .color_scale
                .as_ref()
                .unwrap()
                .points
                .len(),
            2
        );
        let deleted = patch_workbook_conditional_format(
            &updated,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(layout.conditional_formats[0].group_index),
                rule_index: Some(layout.conditional_formats[0].rule_index),
                rule: None,
            },
        )
        .unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10)
            .unwrap()
            .conditional_formats
            .is_empty());
        assert_eq!(styles_before, zip_text(&deleted, "xl/styles.xml"));

        let dynamic_point =
            |kind: &str, value: Option<&str>, color: &str| WorkbookConditionalColorScalePoint {
                kind: kind.into(),
                value: value.map(str::to_string),
                color: color.into(),
                resolved_value: None,
            };
        let dynamic_created = patch_workbook_conditional_format(
            &deleted,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    }],
                    kind: "colorScale".into(),
                    operator: None,
                    formula1: None,
                    formula2: None,
                    priority: 0,
                    stop_if_true: false,
                    style: WorkbookConditionalFormatStyle::default(),
                    color_scale: Some(WorkbookConditionalColorScale {
                        points: vec![
                            dynamic_point("min", None, "#F8696B"),
                            dynamic_point("percentile", Some("50"), "#FFEB84"),
                            dynamic_point("max", None, "#63BE7B"),
                        ],
                    }),
                    data_bar: None,
                    icon_set: None,
                    editable: true,
                }),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&dynamic_created, "Data", 0, 10, 10).unwrap();
        let points = &layout.conditional_formats[0]
            .color_scale
            .as_ref()
            .unwrap()
            .points;
        assert!(layout.conditional_formats[0].editable);
        assert_eq!(points[0].resolved_value.as_deref(), Some("0"));
        assert_eq!(points[1].resolved_value.as_deref(), Some("50"));
        assert_eq!(points[2].resolved_value.as_deref(), Some("100"));
        assert_eq!(styles_before, zip_text(&dynamic_created, "xl/styles.xml"));

        let mut percent_rule = layout.conditional_formats[0].clone();
        let midpoint = &mut percent_rule.color_scale.as_mut().unwrap().points[1];
        midpoint.kind = "percent".into();
        midpoint.resolved_value = None;
        let percent_updated = patch_workbook_conditional_format(
            &dynamic_created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(percent_rule.group_index),
                rule_index: Some(percent_rule.rule_index),
                rule: Some(percent_rule),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&percent_updated, "Data", 0, 10, 10).unwrap();
        assert_eq!(
            layout.conditional_formats[0]
                .color_scale
                .as_ref()
                .unwrap()
                .points[1]
                .resolved_value
                .as_deref(),
            Some("50")
        );

        let mut dynamic = Workbook::new();
        let sheet = dynamic.add_worksheet();
        sheet.write_number(0, 0, 1).unwrap();
        sheet.write_number(1, 0, 2).unwrap();
        sheet
            .add_conditional_format(0, 0, 1, 0, &ConditionalFormat2ColorScale::new())
            .unwrap();
        let dynamic = dynamic.save_to_buffer().unwrap();
        let layout = read_workbook_sheet_layout(&dynamic, "Sheet1", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats[0].kind, "colorScale");
        assert!(layout.conditional_formats[0].editable);
        let points = &layout.conditional_formats[0]
            .color_scale
            .as_ref()
            .unwrap()
            .points;
        assert_eq!(points[0].resolved_value.as_deref(), Some("1"));
        assert_eq!(points[1].resolved_value.as_deref(), Some("2"));
    }

    #[test]
    fn writes_dynamic_and_negative_data_bars_without_adding_dxf_styles() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, -100).unwrap();
        sheet.write_number(1, 0, 0).unwrap();
        sheet.write_number(2, 0, 100).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let styles_before = zip_text(&source, "xl/styles.xml");
        let threshold = |value: &str| WorkbookConditionalThreshold {
            kind: "num".into(),
            value: Some(value.into()),
            resolved_value: Some(value.into()),
        };
        let created = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    }],
                    kind: "dataBar".into(),
                    operator: None,
                    formula1: None,
                    formula2: None,
                    priority: 0,
                    stop_if_true: false,
                    style: WorkbookConditionalFormatStyle::default(),
                    color_scale: None,
                    data_bar: Some(WorkbookConditionalDataBar {
                        minimum: threshold("0"),
                        maximum: threshold("100"),
                        color: "#638EC6".into(),
                        show_value: true,
                        min_length: 10,
                        max_length: 90,
                    }),
                    icon_set: None,
                    editable: true,
                }),
            },
        )
        .unwrap();
        validate_workbook_package(&created).unwrap();
        assert_eq!(styles_before, zip_text(&created, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        let rule = &layout.conditional_formats[0];
        assert_eq!(rule.kind, "dataBar");
        assert!(rule.editable);
        let bar = rule.data_bar.as_ref().unwrap();
        assert_eq!(bar.minimum.value.as_deref(), Some("0"));
        assert_eq!(bar.maximum.value.as_deref(), Some("100"));
        assert_eq!(bar.color, "#638EC6");
        assert!(bar.show_value);
        assert_eq!((bar.min_length, bar.max_length), (10, 90));

        let mut replacement = rule.clone();
        replacement.data_bar = Some(WorkbookConditionalDataBar {
            minimum: threshold("-100"),
            maximum: threshold("100"),
            color: "#5B9BD5".into(),
            show_value: false,
            min_length: 5,
            max_length: 95,
        });
        let updated = patch_workbook_conditional_format(
            &created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(rule.group_index),
                rule_index: Some(rule.rule_index),
                rule: Some(replacement),
            },
        )
        .unwrap();
        validate_workbook_package(&updated).unwrap();
        assert_eq!(styles_before, zip_text(&updated, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        let bar = layout.conditional_formats[0].data_bar.as_ref().unwrap();
        assert_eq!(bar.minimum.value.as_deref(), Some("-100"));
        assert_eq!(bar.maximum.value.as_deref(), Some("100"));
        assert_eq!(bar.color, "#5B9BD5");
        assert!(!bar.show_value);
        assert_eq!((bar.min_length, bar.max_length), (5, 95));

        let deleted = patch_workbook_conditional_format(
            &updated,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(layout.conditional_formats[0].group_index),
                rule_index: Some(layout.conditional_formats[0].rule_index),
                rule: None,
            },
        )
        .unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10)
            .unwrap()
            .conditional_formats
            .is_empty());
        assert_eq!(styles_before, zip_text(&deleted, "xl/styles.xml"));

        let dynamic_created = patch_workbook_conditional_format(
            &deleted,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    }],
                    kind: "dataBar".into(),
                    operator: None,
                    formula1: None,
                    formula2: None,
                    priority: 0,
                    stop_if_true: false,
                    style: WorkbookConditionalFormatStyle::default(),
                    color_scale: None,
                    data_bar: Some(WorkbookConditionalDataBar {
                        minimum: WorkbookConditionalThreshold {
                            kind: "min".into(),
                            value: None,
                            resolved_value: None,
                        },
                        maximum: WorkbookConditionalThreshold {
                            kind: "max".into(),
                            value: None,
                            resolved_value: None,
                        },
                        color: "#638EC6".into(),
                        show_value: true,
                        min_length: 10,
                        max_length: 90,
                    }),
                    icon_set: None,
                    editable: true,
                }),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&dynamic_created, "Data", 0, 10, 10).unwrap();
        let rule = &layout.conditional_formats[0];
        assert!(rule.editable);
        let bar = rule.data_bar.as_ref().unwrap();
        assert_eq!(bar.minimum.resolved_value.as_deref(), Some("-100"));
        assert_eq!(bar.maximum.resolved_value.as_deref(), Some("100"));
        assert_eq!(styles_before, zip_text(&dynamic_created, "xl/styles.xml"));

        let mut percentile_rule = rule.clone();
        let bar = percentile_rule.data_bar.as_mut().unwrap();
        bar.minimum = WorkbookConditionalThreshold {
            kind: "percentile".into(),
            value: Some("25".into()),
            resolved_value: None,
        };
        bar.maximum = WorkbookConditionalThreshold {
            kind: "percentile".into(),
            value: Some("75".into()),
            resolved_value: None,
        };
        let percentile_updated = patch_workbook_conditional_format(
            &dynamic_created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(rule.group_index),
                rule_index: Some(rule.rule_index),
                rule: Some(percentile_rule),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&percentile_updated, "Data", 0, 10, 10).unwrap();
        let bar = layout.conditional_formats[0].data_bar.as_ref().unwrap();
        assert_eq!(bar.minimum.resolved_value.as_deref(), Some("-50"));
        assert_eq!(bar.maximum.resolved_value.as_deref(), Some("50"));
        assert_eq!(
            styles_before,
            zip_text(&percentile_updated, "xl/styles.xml")
        );

        let mut dynamic = Workbook::new();
        let sheet = dynamic.add_worksheet();
        sheet.write_number(0, 0, 1).unwrap();
        sheet.write_number(1, 0, 2).unwrap();
        sheet
            .add_conditional_format(0, 0, 1, 0, &ConditionalFormatDataBar::new())
            .unwrap();
        let dynamic = dynamic.save_to_buffer().unwrap();
        let layout = read_workbook_sheet_layout(&dynamic, "Sheet1", 0, 10, 10).unwrap();
        assert_eq!(layout.conditional_formats[0].kind, "dataBar");
        assert!(layout.conditional_formats[0].data_bar.is_some());
        assert!(!layout.conditional_formats[0].editable);
    }

    #[test]
    fn writes_standard_icon_sets_and_keeps_advanced_variants_read_only() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 0).unwrap();
        sheet.write_number(1, 0, 50).unwrap();
        sheet.write_number(2, 0, 100).unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let styles_before = zip_text(&source, "xl/styles.xml");
        let threshold =
            |kind: &str, value: &str, inclusive: bool| WorkbookConditionalIconThreshold {
                kind: kind.into(),
                value: Some(value.into()),
                resolved_value: (kind == "num").then(|| value.into()),
                inclusive,
            };
        let created = patch_workbook_conditional_format(
            &source,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Create,
                group_index: None,
                rule_index: None,
                rule: Some(WorkbookConditionalFormatRule {
                    group_index: 0,
                    rule_index: 0,
                    ranges: vec![WorkbookMergeRange {
                        top: 0,
                        bottom: 2,
                        left: 0,
                        right: 0,
                    }],
                    kind: "iconSet".into(),
                    operator: None,
                    formula1: None,
                    formula2: None,
                    priority: 0,
                    stop_if_true: false,
                    style: WorkbookConditionalFormatStyle::default(),
                    color_scale: None,
                    data_bar: None,
                    icon_set: Some(WorkbookConditionalIconSet {
                        icon_set: "3TrafficLights1".into(),
                        thresholds: vec![
                            threshold("percent", "0", true),
                            threshold("percent", "33", true),
                            threshold("percent", "67", false),
                        ],
                        reverse: false,
                        show_value: true,
                    }),
                    editable: true,
                }),
            },
        )
        .unwrap();
        validate_workbook_package(&created).unwrap();
        assert_eq!(styles_before, zip_text(&created, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        let rule = &layout.conditional_formats[0];
        assert_eq!(rule.kind, "iconSet");
        assert!(rule.editable);
        let icons = rule.icon_set.as_ref().unwrap();
        assert_eq!(icons.icon_set, "3TrafficLights1");
        assert_eq!(icons.thresholds.len(), 3);
        assert_eq!(icons.thresholds[0].resolved_value.as_deref(), Some("0"));
        assert_eq!(icons.thresholds[1].resolved_value.as_deref(), Some("33"));
        assert_eq!(icons.thresholds[2].resolved_value.as_deref(), Some("67"));
        assert!(!icons.thresholds[2].inclusive);
        let sheet_xml = zip_text(&created, "xl/worksheets/sheet1.xml");
        assert!(sheet_xml.contains("<iconSet iconSet=\"3TrafficLights1\""));
        assert!(sheet_xml.contains("type=\"percent\" val=\"67\" gte=\"0\""));

        let mut replacement = rule.clone();
        replacement.icon_set = Some(WorkbookConditionalIconSet {
            icon_set: "4Arrows".into(),
            thresholds: vec![
                threshold("percent", "0", true),
                threshold("percent", "25", true),
                threshold("percent", "50", true),
                threshold("percent", "75", true),
            ],
            reverse: true,
            show_value: false,
        });
        let updated = patch_workbook_conditional_format(
            &created,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Update,
                group_index: Some(rule.group_index),
                rule_index: Some(rule.rule_index),
                rule: Some(replacement),
            },
        )
        .unwrap();
        validate_workbook_package(&updated).unwrap();
        assert_eq!(styles_before, zip_text(&updated, "xl/styles.xml"));
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        let icons = layout.conditional_formats[0].icon_set.as_ref().unwrap();
        assert_eq!(icons.icon_set, "4Arrows");
        assert_eq!(icons.thresholds.len(), 4);
        assert!(icons.reverse);
        assert!(!icons.show_value);
        let sheet_xml = zip_text(&updated, "xl/worksheets/sheet1.xml");
        assert!(sheet_xml.contains("reverse=\"1\""));
        assert!(sheet_xml.contains("showValue=\"0\""));

        let deleted = patch_workbook_conditional_format(
            &updated,
            &WorkbookConditionalFormatChange {
                sheet: "Data".into(),
                action: WorkbookConditionalFormatAction::Delete,
                group_index: Some(layout.conditional_formats[0].group_index),
                rule_index: Some(layout.conditional_formats[0].rule_index),
                rule: None,
            },
        )
        .unwrap();
        assert!(read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10)
            .unwrap()
            .conditional_formats
            .is_empty());
        assert_eq!(styles_before, zip_text(&deleted, "xl/styles.xml"));

        let mut standard = Workbook::new();
        let sheet = standard.add_worksheet();
        sheet.write_number(0, 0, 0).unwrap();
        sheet.write_number(1, 0, 50).unwrap();
        sheet.write_number(2, 0, 100).unwrap();
        sheet
            .add_conditional_format(
                0,
                0,
                2,
                0,
                &ConditionalFormatIconSet::new()
                    .set_icon_type(ConditionalFormatIconType::ThreeArrows),
            )
            .unwrap();
        let standard = standard.save_to_buffer().unwrap();
        let layout = read_workbook_sheet_layout(&standard, "Sheet1", 0, 10, 10).unwrap();
        let rule = &layout.conditional_formats[0];
        assert_eq!(rule.kind, "iconSet");
        assert!(rule.editable);
        assert_eq!(rule.icon_set.as_ref().unwrap().icon_set, "3Arrows");

        let formula_threshold = br#"<worksheet><conditionalFormatting sqref="A1:A3"><cfRule type="iconSet" priority="1"><iconSet iconSet="3Arrows"><cfvo type="percent" val="0"/><cfvo type="formula" val="A1"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting></worksheet>"#;
        let rules = super::read_conditional_formats(formula_threshold, &[]).unwrap();
        assert_eq!(rules[0].kind, "iconSet");
        assert!(rules[0].icon_set.is_some());
        assert!(!rules[0].editable);

        let x14_only = br#"<worksheet><conditionalFormatting sqref="A1:A3"><cfRule type="iconSet" priority="1"><iconSet iconSet="3Stars"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting></worksheet>"#;
        let rules = super::read_conditional_formats(x14_only, &[]).unwrap();
        assert_eq!(rules[0].icon_set.as_ref().unwrap().icon_set, "3Stars");
        assert!(!rules[0].editable);
    }

    #[test]
    fn creates_updates_and_deletes_formula_data_validation_rules() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Status").unwrap();
        sheet.write_string(0, 1, "Amount").unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let rule = |kind: &str, range: WorkbookMergeRange, formula1: &str| WorkbookDataValidation {
            ranges: vec![range],
            kind: kind.into(),
            operator: None,
            formula1: Some(formula1.into()),
            formula2: None,
            allow_blank: true,
            show_error_message: true,
            error_title: Some("Invalid value".into()),
            error: Some("Enter a value accepted by this rule.".into()),
            prompt_title: Some("Data validation".into()),
            prompt: Some("This cell is validated.".into()),
        };
        let created = patch_workbook_data_validation(
            &source,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Create,
                validation_index: None,
                validation: Some(rule(
                    "list",
                    WorkbookMergeRange {
                        top: 1,
                        bottom: 3,
                        left: 0,
                        right: 0,
                    },
                    "\"Active,Paused,Closed\"",
                )),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&created, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.data_validations.len(), 1);
        assert_eq!(layout.data_validations[0].kind, "list");

        let updated = patch_workbook_data_validation(
            &created,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Update,
                validation_index: Some(0),
                validation: Some(rule(
                    "custom",
                    WorkbookMergeRange {
                        top: 1,
                        bottom: 3,
                        left: 1,
                        right: 1,
                    },
                    "B2>0",
                )),
            },
        )
        .unwrap();
        let layout = read_workbook_sheet_layout(&updated, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.data_validations[0].kind, "custom");
        assert_eq!(layout.data_validations[0].formula1.as_deref(), Some("B2>0"));
        assert_eq!(layout.data_validations[0].ranges[0].left, 1);

        let second = patch_workbook_data_validation(
            &updated,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Create,
                validation_index: None,
                validation: Some(WorkbookDataValidation {
                    operator: Some("greaterThan".into()),
                    ..rule(
                        "whole",
                        WorkbookMergeRange {
                            top: 1,
                            bottom: 3,
                            left: 2,
                            right: 2,
                        },
                        "0",
                    )
                }),
            },
        )
        .unwrap();
        assert_eq!(
            read_workbook_sheet_layout(&second, "Data", 0, 10, 10)
                .unwrap()
                .data_validations
                .len(),
            2
        );

        let deleted = patch_workbook_data_validation(
            &second,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Delete,
                validation_index: Some(0),
                validation: None,
            },
        )
        .unwrap();
        validate_workbook_package(&deleted).unwrap();
        let layout = read_workbook_sheet_layout(&deleted, "Data", 0, 10, 10).unwrap();
        assert_eq!(layout.data_validations.len(), 1);
        assert_eq!(layout.data_validations[0].kind, "whole");
    }

    #[test]
    fn rejects_overlapping_and_external_data_validation_rules() {
        let mut workbook = Workbook::new();
        workbook.add_worksheet().set_name("Data").unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let validation = WorkbookDataValidation {
            ranges: vec![WorkbookMergeRange {
                top: 0,
                bottom: 2,
                left: 0,
                right: 0,
            }],
            kind: "custom".into(),
            operator: None,
            formula1: Some("[Other.xlsx]Data!A1>0".into()),
            formula2: None,
            allow_blank: false,
            show_error_message: true,
            error_title: None,
            error: None,
            prompt_title: None,
            prompt: None,
        };
        let error = patch_workbook_data_validation(
            &source,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Create,
                validation_index: None,
                validation: Some(validation.clone()),
            },
        )
        .unwrap_err();
        assert!(error.contains("External-workbook"));

        let first = patch_workbook_data_validation(
            &source,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Create,
                validation_index: None,
                validation: Some(WorkbookDataValidation {
                    formula1: Some("A1>0".into()),
                    ..validation.clone()
                }),
            },
        )
        .unwrap();
        let error = patch_workbook_data_validation(
            &first,
            &WorkbookDataValidationChange {
                sheet: "Data".into(),
                action: WorkbookDataValidationAction::Create,
                validation_index: None,
                validation: Some(WorkbookDataValidation {
                    formula1: Some("A2<10".into()),
                    ..validation
                }),
            },
        )
        .unwrap_err();
        assert!(error.contains("overlaps another rule"));
    }

    #[test]
    fn creates_updates_renames_and_deletes_defined_name_ranges() {
        let mut workbook = Workbook::new();
        workbook.add_worksheet().set_name("Data Sheet").unwrap();
        workbook.add_worksheet().set_name("Archive").unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let created = patch_workbook_defined_name(
            &source,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Create,
                name: "ProjectRange".into(),
                new_name: None,
                scope: None,
                target_sheet: Some("Data Sheet".into()),
                range: Some(WorkbookMergeRange {
                    top: 0,
                    bottom: 2,
                    left: 0,
                    right: 1,
                }),
            },
        )
        .unwrap();
        let names = read_workbook_defined_names(&created).unwrap();
        assert_eq!(names.len(), 1);
        assert_eq!(names[0].formula, "'Data Sheet'!$A$1:$B$3");
        assert_eq!(names[0].reference.as_ref().unwrap().sheet, "Data Sheet");

        let local = patch_workbook_defined_name(
            &created,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Create,
                name: "ProjectRange".into(),
                new_name: None,
                scope: Some("Archive".into()),
                target_sheet: Some("Archive".into()),
                range: Some(WorkbookMergeRange {
                    top: 4,
                    bottom: 5,
                    left: 2,
                    right: 3,
                }),
            },
        )
        .unwrap();
        assert_eq!(read_workbook_defined_names(&local).unwrap().len(), 2);

        let updated = patch_workbook_defined_name(
            &local,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::UpdateRange,
                name: "ProjectRange".into(),
                new_name: None,
                scope: None,
                target_sheet: Some("Data Sheet".into()),
                range: Some(WorkbookMergeRange {
                    top: 1,
                    bottom: 3,
                    left: 1,
                    right: 2,
                }),
            },
        )
        .unwrap();
        assert_eq!(
            read_workbook_defined_names(&updated)
                .unwrap()
                .iter()
                .find(|item| item.scope.is_none())
                .unwrap()
                .formula,
            "'Data Sheet'!$B$2:$C$4"
        );

        let renamed = patch_workbook_defined_name(
            &updated,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Rename,
                name: "ProjectRange".into(),
                new_name: Some("ActiveRange".into()),
                scope: None,
                target_sheet: None,
                range: None,
            },
        )
        .unwrap();
        assert!(read_workbook_defined_names(&renamed)
            .unwrap()
            .iter()
            .any(|item| item.name == "ActiveRange" && item.scope.is_none()));

        let deleted = patch_workbook_defined_name(
            &renamed,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Delete,
                name: "ActiveRange".into(),
                new_name: None,
                scope: None,
                target_sheet: None,
                range: None,
            },
        )
        .unwrap();
        validate_workbook_package(&deleted).unwrap();
        let names = read_workbook_defined_names(&deleted).unwrap();
        assert_eq!(names.len(), 1);
        assert_eq!(names[0].scope.as_deref(), Some("Archive"));
    }

    #[test]
    fn refuses_to_rename_or_delete_referenced_defined_names() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_number(0, 0, 1).unwrap();
        sheet
            .write_formula(0, 1, Formula::new("=SUM(ProjectRange)").set_result("1"))
            .unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let created = patch_workbook_defined_name(
            &source,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Create,
                name: "ProjectRange".into(),
                new_name: None,
                scope: None,
                target_sheet: Some("Data".into()),
                range: Some(WorkbookMergeRange {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                }),
            },
        )
        .unwrap();
        let error = patch_workbook_defined_name(
            &created,
            &WorkbookDefinedNameChange {
                action: WorkbookDefinedNameAction::Delete,
                name: "ProjectRange".into(),
                new_name: None,
                scope: None,
                target_sheet: None,
                range: None,
            },
        )
        .unwrap_err();
        assert!(error.contains("referenced by a formula"));
    }
}
