use crate::formats::workbook::{
    WorkbookCellEdit, WorkbookPivotDataField, WorkbookPivotPreviewGroup, WorkbookPivotPreviewKey,
    WorkbookPivotPreviewMeasure, WorkbookPivotPreviewResult, WorkbookPivotTable,
};
use crate::formats::workbook_ooxml::validate_edit;
use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Cursor;

const MAX_PIVOT_SOURCE_ROWS: usize = 50_000;
const MAX_PIVOT_SOURCE_COLUMNS: usize = 256;
const MAX_PIVOT_PREVIEW_GROUPS: usize = 10_000;
const MAX_PIVOT_PREVIEW_EDITS: usize = 10_000;

#[derive(Clone, Debug)]
pub(crate) struct PivotSourceSnapshot {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Data>>,
}

#[derive(Clone, Debug)]
struct SourceRange {
    top: usize,
    bottom: usize,
    left: usize,
    right: usize,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PivotScalar {
    kind: String,
    value: String,
}

impl PivotScalar {
    fn empty() -> Self {
        Self {
            kind: "empty".into(),
            value: "(空白)".into(),
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct MeasureAccumulator {
    definition: WorkbookPivotDataField,
    sum: f64,
    product: f64,
    min: Option<f64>,
    max: Option<f64>,
    numeric_count: usize,
    non_empty_count: usize,
}

impl MeasureAccumulator {
    pub(crate) fn new(definition: &WorkbookPivotDataField) -> Self {
        Self {
            definition: definition.clone(),
            sum: 0.0,
            product: 1.0,
            min: None,
            max: None,
            numeric_count: 0,
            non_empty_count: 0,
        }
    }

    pub(crate) fn add(&mut self, value: &Data, source_row: usize) -> Result<(), String> {
        if !matches!(value, Data::Empty) {
            self.non_empty_count += 1;
        }
        let numeric = match value {
            Data::Int(value) => Some(*value as f64),
            Data::Float(value) => Some(*value),
            Data::DateTime(value) => Some(value.as_f64()),
            Data::Error(value) => {
                return Err(format!(
                    "透视预览值字段在来源第 {} 行包含错误值 {}",
                    source_row + 1,
                    value
                ));
            }
            _ => None,
        };
        if let Some(value) = numeric {
            if !value.is_finite() {
                return Err("透视预览遇到非有限数值".into());
            }
            self.sum += value;
            self.product *= value;
            self.min = Some(self.min.map_or(value, |current| current.min(value)));
            self.max = Some(self.max.map_or(value, |current| current.max(value)));
            self.numeric_count += 1;
            if !self.sum.is_finite() || !self.product.is_finite() {
                return Err("透视预览聚合结果超出有限数值范围".into());
            }
        }
        Ok(())
    }

    pub(crate) fn finish(self) -> WorkbookPivotPreviewMeasure {
        let value = match self.definition.aggregation.as_str() {
            "count" => Some(self.non_empty_count as f64),
            "countNums" => Some(self.numeric_count as f64),
            "sum" if self.numeric_count > 0 => Some(self.sum),
            "average" if self.numeric_count > 0 => Some(self.sum / self.numeric_count as f64),
            "max" => self.max,
            "min" => self.min,
            "product" if self.numeric_count > 0 => Some(self.product),
            _ => None,
        };
        let contributing_count = if self.definition.aggregation == "count" {
            self.non_empty_count
        } else {
            self.numeric_count
        };
        WorkbookPivotPreviewMeasure {
            source_index: self.definition.source_index,
            name: self.definition.name,
            aggregation: self.definition.aggregation,
            formatted_value: value.map(format_number).unwrap_or_default(),
            value,
            contributing_count,
        }
    }
}

fn parse_cell(reference: &str) -> Result<(usize, usize), String> {
    let reference = reference.replace('$', "");
    let split = reference
        .find(|character: char| character.is_ascii_digit())
        .ok_or("透视来源单元格引用无效")?;
    let (column_text, row_text) = reference.split_at(split);
    if column_text.is_empty()
        || row_text.is_empty()
        || !column_text.chars().all(|value| value.is_ascii_alphabetic())
        || !row_text.chars().all(|value| value.is_ascii_digit())
    {
        return Err("透视来源单元格引用无效".into());
    }
    let mut column = 0usize;
    for character in column_text.bytes() {
        column = column
            .checked_mul(26)
            .and_then(|value| {
                value.checked_add((character.to_ascii_uppercase() - b'A' + 1) as usize)
            })
            .ok_or("透视来源列坐标溢出")?;
    }
    let row = row_text
        .parse::<usize>()
        .map_err(|_| "透视来源行坐标无效")?;
    if row == 0 || column == 0 {
        return Err("透视来源单元格引用无效".into());
    }
    Ok((row - 1, column - 1))
}

fn parse_source_range(reference: &str) -> Result<SourceRange, String> {
    let mut parts = reference.split(':');
    let start = parts.next().unwrap_or_default();
    let end = parts.next().unwrap_or(start);
    if parts.next().is_some() {
        return Err("透视来源必须是单一连续 A1 区域".into());
    }
    let (start_row, start_column) = parse_cell(start)?;
    let (end_row, end_column) = parse_cell(end)?;
    let range = SourceRange {
        top: start_row.min(end_row),
        bottom: start_row.max(end_row),
        left: start_column.min(end_column),
        right: start_column.max(end_column),
    };
    let rows = range.bottom - range.top + 1;
    let columns = range.right - range.left + 1;
    if rows < 2 {
        return Err("透视来源至少需要一行表头和一行数据".into());
    }
    if rows - 1 > MAX_PIVOT_SOURCE_ROWS {
        return Err(format!(
            "透视内存预览最多读取 {MAX_PIVOT_SOURCE_ROWS} 条来源记录"
        ));
    }
    if columns > MAX_PIVOT_SOURCE_COLUMNS {
        return Err(format!(
            "透视内存预览最多读取 {MAX_PIVOT_SOURCE_COLUMNS} 个字段"
        ));
    }
    Ok(range)
}

fn scalar_from_data(value: &Data) -> PivotScalar {
    match value {
        Data::Empty => PivotScalar::empty(),
        Data::String(value) => PivotScalar {
            kind: "text".into(),
            value: value.clone(),
        },
        Data::Int(value) => PivotScalar {
            kind: "number".into(),
            value: value.to_string(),
        },
        Data::Float(value) => PivotScalar {
            kind: "number".into(),
            value: format_number(*value),
        },
        Data::Bool(value) => PivotScalar {
            kind: "boolean".into(),
            value: value.to_string(),
        },
        Data::DateTime(value) => PivotScalar {
            kind: "date".into(),
            value: value.to_string(),
        },
        Data::DateTimeIso(value) | Data::DurationIso(value) => PivotScalar {
            kind: "date".into(),
            value: value.clone(),
        },
        Data::Error(value) => PivotScalar {
            kind: "error".into(),
            value: value.to_string(),
        },
    }
}

fn data_from_edit(edit: &WorkbookCellEdit) -> Result<Data, String> {
    validate_edit(edit)?;
    Ok(match edit.kind.as_str() {
        "string" => Data::String(edit.input.clone()),
        "number" => Data::Float(edit.input.parse().map_err(|_| "透视预览草稿数字无效")?),
        "boolean" => Data::Bool(edit.input.eq_ignore_ascii_case("true")),
        "empty" => Data::Empty,
        "formula" => {
            return Err("透视来源区域包含未保存公式草稿；请先保存并重算后再预览".into());
        }
        _ => return Err("透视预览草稿类型无效".into()),
    })
}

fn format_number(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() <= i64::MAX as f64 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

pub(crate) fn read_pivot_source_snapshot(
    source: &[u8],
    pivot: &WorkbookPivotTable,
) -> Result<PivotSourceSnapshot, String> {
    if pivot.audit.writeback.status != "structure_candidate"
        || pivot.audit.page_field_count > 0
        || pivot.source_type != "worksheet"
    {
        return Err("该透视表未通过隔离 Cache 重建门禁".into());
    }
    let source_sheet = pivot
        .source_sheet
        .as_deref()
        .ok_or("透视表缺少本地来源工作表")?;
    let source_reference = pivot
        .source_range
        .as_deref()
        .ok_or("透视表缺少本地来源区域")?;
    let range = parse_source_range(source_reference)?;
    let width = range.right - range.left + 1;
    if width != pivot.audit.fields.len() {
        return Err("透视来源区域列数与 Pivot Cache 字段数不一致".into());
    }
    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(source))
        .map_err(|error| format!("读取透视来源工作簿失败: {error}"))?;
    if !workbook
        .sheet_names()
        .iter()
        .any(|name| name == source_sheet)
    {
        return Err("透视来源工作表不存在".into());
    }
    let values = workbook
        .worksheet_range(source_sheet)
        .map_err(|error| format!("读取透视来源工作表失败: {error}"))?;
    let formulas = workbook
        .worksheet_formula(source_sheet)
        .map_err(|error| format!("读取透视来源公式失败: {error}"))?;
    for row in range.top..=range.bottom {
        for column in range.left..=range.right {
            if formulas
                .get_value((row as u32, column as u32))
                .is_some_and(|formula| !formula.is_empty())
            {
                return Err("隔离 Cache 重建暂不接受来源区域公式".into());
            }
        }
    }
    let cell = |row: usize, column: usize| {
        values
            .get_value((row as u32, column as u32))
            .cloned()
            .unwrap_or(Data::Empty)
    };
    let mut headers = Vec::with_capacity(width);
    for (index, field) in pivot.audit.fields.iter().enumerate() {
        let header = scalar_from_data(&cell(range.top, range.left + index));
        if header.kind != "text" || header.value.trim() != field.name.trim() {
            return Err(format!(
                "透视来源表头与 Pivot Cache 字段不一致：期望“{}”",
                field.name
            ));
        }
        headers.push(header.value);
    }
    let rows = (range.top + 1..=range.bottom)
        .map(|row| {
            (range.left..=range.right)
                .map(|column| cell(row, column))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Ok(PivotSourceSnapshot { headers, rows })
}

fn preview_key(field_index: usize, name: &str, scalar: &PivotScalar) -> WorkbookPivotPreviewKey {
    WorkbookPivotPreviewKey {
        field_index,
        field_name: name.into(),
        value: scalar.value.clone(),
        kind: scalar.kind.clone(),
    }
}

pub fn preview_pivot(
    source: &[u8],
    pivot: &WorkbookPivotTable,
    edits: Vec<WorkbookCellEdit>,
) -> Result<WorkbookPivotPreviewResult, String> {
    if !pivot.audit.rebuild_candidate {
        return Err("该透视表未通过重建候选审计，只能查看结构".into());
    }
    if pivot.audit.page_field_count > 0 {
        return Err("S8-7C 暂不计算包含筛选字段的透视表".into());
    }
    if edits.len() > MAX_PIVOT_PREVIEW_EDITS {
        return Err(format!(
            "透视预览最多应用 {MAX_PIVOT_PREVIEW_EDITS} 个单元格草稿"
        ));
    }
    let source_sheet = pivot
        .source_sheet
        .as_deref()
        .ok_or("透视表缺少本地来源工作表")?;
    let source_reference = pivot
        .source_range
        .as_deref()
        .ok_or("透视表缺少本地来源区域")?;
    let range = parse_source_range(source_reference)?;
    let width = range.right - range.left + 1;
    if width != pivot.audit.fields.len() {
        return Err("透视来源区域列数与 Pivot Cache 字段数不一致".into());
    }
    if pivot
        .audit
        .data_fields
        .iter()
        .any(|field| field.source_index >= width || !field.supported)
    {
        return Err("透视值字段超出来源范围或包含未验证聚合".into());
    }

    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(source))
        .map_err(|error| format!("读取透视来源工作簿失败: {error}"))?;
    if !workbook
        .sheet_names()
        .iter()
        .any(|name| name == source_sheet)
    {
        return Err("透视来源工作表不存在".into());
    }
    let values = workbook
        .worksheet_range(source_sheet)
        .map_err(|error| format!("读取透视来源工作表失败: {error}"))?;

    let mut relevant_edits = HashMap::new();
    let mut seen_edits = HashSet::new();
    for edit in edits {
        validate_edit(&edit)?;
        if !seen_edits.insert((edit.sheet.clone(), edit.row, edit.column)) {
            return Err("透视预览请求包含重复单元格草稿".into());
        }
        if edit.sheet == source_sheet
            && edit.row >= range.top
            && edit.row <= range.bottom
            && edit.column >= range.left
            && edit.column <= range.right
        {
            relevant_edits.insert((edit.row, edit.column), data_from_edit(&edit)?);
        }
    }
    let cell = |row: usize, column: usize| {
        relevant_edits
            .get(&(row, column))
            .cloned()
            .or_else(|| values.get_value((row as u32, column as u32)).cloned())
            .unwrap_or(Data::Empty)
    };
    for (index, field) in pivot.audit.fields.iter().enumerate() {
        let header = scalar_from_data(&cell(range.top, range.left + index));
        if header.kind != "text" || header.value.trim() != field.name.trim() {
            return Err(format!(
                "透视来源表头与 Pivot Cache 字段不一致：期望“{}”",
                field.name
            ));
        }
    }

    let row_fields = pivot
        .audit
        .fields
        .iter()
        .filter(|field| field.role == "row")
        .collect::<Vec<_>>();
    let column_fields = pivot
        .audit
        .fields
        .iter()
        .filter(|field| field.role == "column")
        .collect::<Vec<_>>();
    let mut groups =
        BTreeMap::<(Vec<PivotScalar>, Vec<PivotScalar>), Vec<MeasureAccumulator>>::new();
    for row in range.top + 1..=range.bottom {
        let row_key = row_fields
            .iter()
            .map(|field| scalar_from_data(&cell(row, range.left + field.index)))
            .collect::<Vec<_>>();
        let column_key = column_fields
            .iter()
            .map(|field| scalar_from_data(&cell(row, range.left + field.index)))
            .collect::<Vec<_>>();
        if !groups.contains_key(&(row_key.clone(), column_key.clone()))
            && groups.len() >= MAX_PIVOT_PREVIEW_GROUPS
        {
            return Err(format!(
                "透视内存预览最多生成 {MAX_PIVOT_PREVIEW_GROUPS} 个分组"
            ));
        }
        let measures = groups.entry((row_key, column_key)).or_insert_with(|| {
            pivot
                .audit
                .data_fields
                .iter()
                .map(MeasureAccumulator::new)
                .collect()
        });
        for measure in measures {
            let value = cell(row, range.left + measure.definition.source_index);
            measure.add(&value, row)?;
        }
    }

    let groups = groups
        .into_iter()
        .map(
            |((row_values, column_values), measures)| WorkbookPivotPreviewGroup {
                row_keys: row_fields
                    .iter()
                    .zip(row_values.iter())
                    .map(|(field, value)| preview_key(field.index, &field.name, value))
                    .collect(),
                column_keys: column_fields
                    .iter()
                    .zip(column_values.iter())
                    .map(|(field, value)| preview_key(field.index, &field.name, value))
                    .collect(),
                measures: measures
                    .into_iter()
                    .map(MeasureAccumulator::finish)
                    .collect(),
            },
        )
        .collect();
    Ok(WorkbookPivotPreviewResult {
        pivot_name: pivot.name.clone(),
        source_sheet: source_sheet.into(),
        source_range: source_reference.into(),
        source_row_count: range.bottom - range.top,
        applied_draft_count: relevant_edits.len(),
        groups,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_source_range, preview_pivot};
    use crate::formats::workbook::{
        WorkbookCellEdit, WorkbookPivotAudit, WorkbookPivotDataField, WorkbookPivotField,
        WorkbookPivotTable,
    };
    use crate::formats::workbook_ooxml::read_workbook_linked_data;
    use rust_xlsxwriter::Workbook;

    const FIXTURE: &[u8] =
        include_bytes!("../../tests/fixtures/workbook/compatibility-baseline.xlsx");

    #[test]
    fn previews_candidate_pivot_from_current_sheet_values_and_drafts() {
        let linked = read_workbook_linked_data(FIXTURE).unwrap();
        let pivot = &linked.pivot_tables[0];
        let preview = preview_pivot(
            FIXTURE,
            pivot,
            vec![WorkbookCellEdit {
                sheet: "Inventory".into(),
                row: 1,
                column: 1,
                input: "18".into(),
                kind: "number".into(),
            }],
        )
        .unwrap();
        assert_eq!(preview.source_row_count, 2);
        assert_eq!(preview.applied_draft_count, 1);
        assert_eq!(preview.groups.len(), 2);
        assert_eq!(preview.groups[0].row_keys[0].value, "Keyboard");
        assert_eq!(preview.groups[0].column_keys[0].value, "Hardware");
        assert_eq!(preview.groups[0].measures[0].value, Some(18.0));
        assert_eq!(preview.groups[1].measures[0].value, Some(30.0));

        let formula_error = preview_pivot(
            FIXTURE,
            pivot,
            vec![WorkbookCellEdit {
                sheet: "Inventory".into(),
                row: 1,
                column: 1,
                input: "=10+8".into(),
                kind: "formula".into(),
            }],
        )
        .unwrap_err();
        assert!(formula_error.contains("公式草稿"));
    }

    #[test]
    fn rejects_oversized_or_non_rectangular_sources() {
        assert!(parse_source_range("A1:A50002").is_err());
        assert!(parse_source_range("A1:B2:C3").is_err());
    }

    #[test]
    fn verifies_all_preview_aggregations_and_non_numeric_semantics() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name("Data").unwrap();
        sheet.write_string(0, 0, "Group").unwrap();
        sheet.write_string(0, 1, "Value").unwrap();
        sheet.write_string(1, 0, "A").unwrap();
        sheet.write_number(1, 1, 2).unwrap();
        sheet.write_string(2, 0, "A").unwrap();
        sheet.write_number(2, 1, 3).unwrap();
        sheet.write_string(3, 0, "B").unwrap();
        sheet.write_string(3, 1, "text").unwrap();
        sheet.write_string(4, 0, "B").unwrap();
        let source = workbook.save_to_buffer().unwrap();
        let aggregations = [
            "sum",
            "count",
            "average",
            "max",
            "min",
            "product",
            "countNums",
        ];
        let pivot = WorkbookPivotTable {
            name: "AggregationPivot".into(),
            part: "xl/pivotTables/pivotTable1.xml".into(),
            sheet: Some("Data".into()),
            cache_id: Some(1),
            source_type: "worksheet".into(),
            source_sheet: Some("Data".into()),
            source_range: Some("A1:B5".into()),
            connection_id: None,
            refresh_on_load: false,
            audit: WorkbookPivotAudit {
                status: "candidate_for_rebuild".into(),
                rebuild_candidate: true,
                blockers: Vec::new(),
                layout_range: Some("D1:K5".into()),
                cache_field_count: 2,
                cache_record_count: Some(4),
                row_field_count: 1,
                column_field_count: 0,
                page_field_count: 0,
                data_field_count: aggregations.len(),
                fields: vec![
                    WorkbookPivotField {
                        index: 0,
                        name: "Group".into(),
                        role: "row".into(),
                        value_type: "string".into(),
                    },
                    WorkbookPivotField {
                        index: 1,
                        name: "Value".into(),
                        role: "data".into(),
                        value_type: "mixed".into(),
                    },
                ],
                data_fields: aggregations
                    .iter()
                    .map(|aggregation| WorkbookPivotDataField {
                        source_index: 1,
                        name: aggregation.to_string(),
                        aggregation: aggregation.to_string(),
                        supported: true,
                    })
                    .collect(),
                writeback: Default::default(),
            },
        };
        let preview = preview_pivot(&source, &pivot, Vec::new()).unwrap();
        assert_eq!(preview.groups.len(), 2);
        let group_a = &preview.groups[0].measures;
        assert_eq!(
            group_a
                .iter()
                .map(|measure| measure.value)
                .collect::<Vec<_>>(),
            [
                Some(5.0),
                Some(2.0),
                Some(2.5),
                Some(3.0),
                Some(2.0),
                Some(6.0),
                Some(2.0),
            ]
        );
        let group_b = &preview.groups[1].measures;
        assert_eq!(group_b[0].value, None);
        assert_eq!(group_b[1].value, Some(1.0));
        assert_eq!(group_b[6].value, Some(0.0));
        assert_eq!(group_b[1].contributing_count, 1);
        assert_eq!(group_b[6].contributing_count, 0);
    }
}
