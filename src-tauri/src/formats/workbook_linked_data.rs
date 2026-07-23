use crate::formats::workbook::{
    WorkbookDataConnection, WorkbookExternalLink, WorkbookLinkedData, WorkbookLinkedDataPolicy,
    WorkbookLinkedDataSummary, WorkbookPivotAudit, WorkbookPivotDataField, WorkbookPivotField,
    WorkbookPivotTable, WorkbookPivotWritebackAudit, WorkbookSlicer,
};
use quick_xml::events::Event;
use quick_xml::{Reader, XmlVersion};
use std::collections::{HashMap, HashSet};

const MAX_PIVOT_FIELDS: usize = 16_384;
const MAX_PIVOT_RECORDS: usize = 1_048_576;
const MAX_PIVOT_TEXT: usize = 1_024;

#[derive(Clone, Debug, Default)]
pub(crate) struct PivotCacheAudit {
    fields: Vec<(String, String)>,
    declared_field_count: Option<usize>,
    declared_record_count: Option<usize>,
    record_count: Option<usize>,
    record_widths_valid: bool,
}

fn attribute(
    event: &quick_xml::events::BytesStart<'_>,
    name: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for item in event.attributes().with_checks(false) {
        let item = item.map_err(|error| format!("解析透视表属性失败: {error}"))?;
        if item.key.local_name().as_ref() == name {
            let value = item
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map_err(|error| format!("解析透视表属性失败: {error}"))?
                .into_owned();
            if value.chars().count() > MAX_PIVOT_TEXT {
                return Err("透视表元数据过长".into());
            }
            return Ok(Some(value));
        }
    }
    Ok(None)
}

fn usize_attribute(
    event: &quick_xml::events::BytesStart<'_>,
    name: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<usize>, String> {
    attribute(event, name, decoder)?
        .map(|value| value.parse().map_err(|_| "透视表数字属性无效".to_string()))
        .transpose()
}

fn bool_attribute(
    event: &quick_xml::events::BytesStart<'_>,
    name: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<bool, String> {
    Ok(attribute(event, name, decoder)?
        .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true")))
}

fn cache_value_type(
    event: &quick_xml::events::BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<String, String> {
    let flags = [
        (b"containsString".as_slice(), "string"),
        (b"containsNumber".as_slice(), "number"),
        (b"containsDate".as_slice(), "date"),
        (b"containsBoolean".as_slice(), "boolean"),
        (b"containsError".as_slice(), "error"),
        (b"containsBlank".as_slice(), "blank"),
    ];
    let mut values = Vec::new();
    for (name, label) in flags {
        if bool_attribute(event, name, decoder)? {
            values.push(label);
        }
    }
    Ok(match values.as_slice() {
        [] => "unknown".into(),
        [value] => (*value).into(),
        _ => "mixed".into(),
    })
}

pub(crate) fn inspect_pivot_cache(
    definition_xml: &[u8],
    records_xml: Option<&[u8]>,
) -> Result<PivotCacheAudit, String> {
    let mut audit = PivotCacheAudit::default();
    let mut reader = Reader::from_reader(definition_xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut current_field = None;
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 Pivot Cache 字段失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"cacheFields" =>
            {
                audit.declared_field_count = usize_attribute(event, b"count", reader.decoder())?;
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"cacheField" =>
            {
                if audit.fields.len() >= MAX_PIVOT_FIELDS {
                    return Err("Pivot Cache 字段数量过多".into());
                }
                let name = attribute(event, b"name", reader.decoder())?
                    .unwrap_or_else(|| format!("字段 {}", audit.fields.len() + 1));
                audit.fields.push((name, "unknown".into()));
                current_field = Some(audit.fields.len() - 1);
            }
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"sharedItems" =>
            {
                if let Some(index) = current_field {
                    audit.fields[index].1 = cache_value_type(event, reader.decoder())?;
                }
            }
            Event::End(ref event) if event.local_name().as_ref() == b"cacheField" => {
                current_field = None;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if let Some(records_xml) = records_xml {
        let mut reader = Reader::from_reader(records_xml);
        reader.config_mut().trim_text(true);
        let mut buffer = Vec::new();
        let mut actual_records = 0usize;
        let mut record_width = None;
        audit.record_widths_valid = true;
        loop {
            match reader
                .read_event_into(&mut buffer)
                .map_err(|error| format!("解析 Pivot Cache Records 失败: {error}"))?
            {
                Event::Start(ref event) | Event::Empty(ref event)
                    if event.local_name().as_ref() == b"pivotCacheRecords" =>
                {
                    audit.declared_record_count =
                        usize_attribute(event, b"count", reader.decoder())?;
                }
                Event::Start(ref event) if event.local_name().as_ref() == b"r" => {
                    if actual_records >= MAX_PIVOT_RECORDS {
                        return Err("Pivot Cache Records 数量过多".into());
                    }
                    actual_records += 1;
                    record_width = Some(0usize);
                }
                Event::Empty(ref event) if event.local_name().as_ref() == b"r" => {
                    if actual_records >= MAX_PIVOT_RECORDS {
                        return Err("Pivot Cache Records 数量过多".into());
                    }
                    actual_records += 1;
                    audit.record_widths_valid &= audit.fields.is_empty();
                }
                Event::Start(ref event) | Event::Empty(ref event)
                    if record_width.is_some()
                        && matches!(
                            event.local_name().as_ref(),
                            b"b" | b"d" | b"e" | b"m" | b"n" | b"s" | b"x"
                        ) =>
                {
                    record_width = record_width.map(|width| width.saturating_add(1));
                }
                Event::End(ref event) if event.local_name().as_ref() == b"r" => {
                    if let Some(width) = record_width.take() {
                        audit.record_widths_valid &= width == audit.fields.len();
                    }
                }
                Event::Eof => break,
                _ => {}
            }
            buffer.clear();
        }
        audit.record_count = Some(actual_records);
    }
    Ok(audit)
}

fn supported_aggregation(value: &str) -> bool {
    matches!(
        value,
        "sum" | "count" | "average" | "max" | "min" | "product" | "countNums"
    )
}

fn inspect_pivot_writeback(
    pivot_xml: &[u8],
    row_fields: &HashSet<usize>,
    column_fields: &HashSet<usize>,
    page_field_count: usize,
    rebuild_candidate: bool,
    output_cell_count: Option<usize>,
) -> Result<WorkbookPivotWritebackAudit, String> {
    let mut pivot_field_index = 0usize;
    let mut current_pivot_field = None;
    let mut active_items_field = None;
    let mut item_declared = HashMap::<usize, usize>::new();
    let mut item_actual = HashMap::<usize, usize>::new();
    let mut active_axis_items = "";
    let mut row_declared = None;
    let mut row_actual = 0usize;
    let mut column_declared = None;
    let mut column_actual = 0usize;
    let mut reader = Reader::from_reader(pivot_xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析透视写回结构失败: {error}"))?
        {
            Event::Start(ref event) => match event.local_name().as_ref() {
                b"pivotField" => {
                    current_pivot_field = Some(pivot_field_index);
                    pivot_field_index = pivot_field_index.saturating_add(1);
                }
                b"items" => {
                    if let Some(index) = current_pivot_field {
                        if let Some(count) = usize_attribute(event, b"count", reader.decoder())? {
                            item_declared.insert(index, count);
                        }
                        item_actual.entry(index).or_insert(0);
                        active_items_field = Some(index);
                    }
                }
                b"item" => {
                    if let Some(index) = active_items_field {
                        *item_actual.entry(index).or_insert(0) += 1;
                    }
                }
                b"rowItems" => {
                    row_declared = usize_attribute(event, b"count", reader.decoder())?;
                    active_axis_items = "row";
                }
                b"colItems" => {
                    column_declared = usize_attribute(event, b"count", reader.decoder())?;
                    active_axis_items = "column";
                }
                b"i" if active_axis_items == "row" => row_actual = row_actual.saturating_add(1),
                b"i" if active_axis_items == "column" => {
                    column_actual = column_actual.saturating_add(1)
                }
                _ => {}
            },
            Event::Empty(ref event) => match event.local_name().as_ref() {
                b"pivotField" => pivot_field_index = pivot_field_index.saturating_add(1),
                b"items" => {
                    if let Some(index) = current_pivot_field {
                        if let Some(count) = usize_attribute(event, b"count", reader.decoder())? {
                            item_declared.insert(index, count);
                        }
                        item_actual.entry(index).or_insert(0);
                    }
                }
                b"item" => {
                    if let Some(index) = active_items_field {
                        *item_actual.entry(index).or_insert(0) += 1;
                    }
                }
                b"rowItems" => {
                    row_declared = usize_attribute(event, b"count", reader.decoder())?;
                }
                b"colItems" => {
                    column_declared = usize_attribute(event, b"count", reader.decoder())?;
                }
                b"i" if active_axis_items == "row" => row_actual = row_actual.saturating_add(1),
                b"i" if active_axis_items == "column" => {
                    column_actual = column_actual.saturating_add(1)
                }
                _ => {}
            },
            Event::End(ref event) => match event.local_name().as_ref() {
                b"items" => active_items_field = None,
                b"pivotField" => current_pivot_field = None,
                b"rowItems" | b"colItems" => active_axis_items = "",
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    let dimension_fields = row_fields
        .iter()
        .chain(column_fields.iter())
        .copied()
        .collect::<HashSet<_>>();
    let pivot_field_items_complete = !dimension_fields.is_empty()
        && dimension_fields.iter().all(|index| {
            item_actual.get(index).is_some_and(|actual| {
                *actual > 0
                    && item_declared
                        .get(index)
                        .is_none_or(|declared| declared == actual)
            })
        });
    let row_items_complete = row_fields.is_empty()
        || (row_actual > 0 && row_declared.is_none_or(|declared| declared == row_actual));
    let column_items_complete = column_fields.is_empty()
        || (column_actual > 0 && column_declared.is_none_or(|declared| declared == column_actual));
    let output_cells_present = output_cell_count.is_some_and(|count| count > 0);
    let mut blockers = Vec::new();
    if !rebuild_candidate {
        blockers.push("尚未通过透视重建候选审计".into());
    }
    if page_field_count > 0 {
        blockers.push("页面筛选字段尚未纳入写回语义".into());
    }
    if !pivot_field_items_complete {
        blockers.push("透视字段缺少完整 items 索引".into());
    }
    if !row_items_complete {
        blockers.push("透视定义缺少完整 rowItems".into());
    }
    if !column_items_complete {
        blockers.push("透视定义缺少完整 colItems".into());
    }
    if !output_cells_present {
        blockers.push("声明的透视输出区域没有可验证单元格".into());
    }
    Ok(WorkbookPivotWritebackAudit {
        status: if blockers.is_empty() {
            "structure_candidate".into()
        } else {
            "blocked".into()
        },
        allowed: false,
        blockers,
        pivot_field_items_complete,
        row_items_complete,
        column_items_complete,
        output_cells_present,
    })
}

pub(crate) fn inspect_pivot_table(
    pivot_xml: &[u8],
    source_type: &str,
    source_sheet: Option<&str>,
    source_range: Option<&str>,
    cache: Option<&PivotCacheAudit>,
    output_cell_count: Option<usize>,
) -> Result<WorkbookPivotAudit, String> {
    let mut layout_range = None;
    let mut declared_pivot_fields = None;
    let mut pivot_field_count = 0usize;
    let mut roles = HashMap::<usize, String>::new();
    let mut row_fields = HashSet::new();
    let mut column_fields = HashSet::new();
    let mut page_fields = HashSet::new();
    let mut data_fields = Vec::new();
    let mut container = "";
    let mut reader = Reader::from_reader(pivot_xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析透视表布局失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event) => {
                match event.local_name().as_ref() {
                    b"location" => {
                        layout_range = attribute(event, b"ref", reader.decoder())?;
                    }
                    b"pivotFields" => {
                        declared_pivot_fields = usize_attribute(event, b"count", reader.decoder())?;
                        container = "pivotFields";
                    }
                    b"pivotField" => {
                        if pivot_field_count >= MAX_PIVOT_FIELDS {
                            return Err("透视表字段数量过多".into());
                        }
                        if let Some(axis) = attribute(event, b"axis", reader.decoder())? {
                            let role = match axis.as_str() {
                                "axisRow" => "row",
                                "axisCol" => "column",
                                "axisPage" => "page",
                                _ => "unused",
                            };
                            roles.insert(pivot_field_count, role.into());
                        }
                        if bool_attribute(event, b"dataField", reader.decoder())? {
                            roles.insert(pivot_field_count, "data".into());
                        }
                        pivot_field_count += 1;
                    }
                    b"rowFields" => container = "rowFields",
                    b"colFields" => container = "colFields",
                    b"pageFields" => container = "pageFields",
                    b"field" if container == "rowFields" || container == "colFields" => {
                        if row_fields.len() + column_fields.len() >= MAX_PIVOT_FIELDS {
                            return Err("透视表行列字段数量过多".into());
                        }
                        if let Some(index) = usize_attribute(event, b"x", reader.decoder())? {
                            if container == "rowFields" {
                                row_fields.insert(index);
                                roles.insert(index, "row".into());
                            } else {
                                column_fields.insert(index);
                                roles.insert(index, "column".into());
                            }
                        }
                    }
                    b"pageField" if container == "pageFields" => {
                        if page_fields.len() >= MAX_PIVOT_FIELDS {
                            return Err("透视表筛选字段数量过多".into());
                        }
                        if let Some(index) = usize_attribute(event, b"fld", reader.decoder())? {
                            page_fields.insert(index);
                            roles.insert(index, "page".into());
                        }
                    }
                    b"dataField" => {
                        if data_fields.len() >= MAX_PIVOT_FIELDS {
                            return Err("透视表值字段数量过多".into());
                        }
                        let source_index =
                            usize_attribute(event, b"fld", reader.decoder())?.unwrap_or(usize::MAX);
                        let aggregation = attribute(event, b"subtotal", reader.decoder())?
                            .unwrap_or_else(|| "sum".into());
                        let name = attribute(event, b"name", reader.decoder())?
                            .or_else(|| {
                                cache.and_then(|cache| {
                                    cache.fields.get(source_index).map(|field| field.0.clone())
                                })
                            })
                            .unwrap_or_else(|| "未命名值字段".into());
                        roles.insert(source_index, "data".into());
                        data_fields.push(WorkbookPivotDataField {
                            source_index,
                            name,
                            supported: supported_aggregation(&aggregation),
                            aggregation,
                        });
                    }
                    _ => {}
                }
            }
            Event::End(ref event)
                if matches!(
                    event.local_name().as_ref(),
                    b"rowFields" | b"colFields" | b"pageFields" | b"pivotFields"
                ) =>
            {
                container = "";
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut blockers = Vec::new();
    if source_type != "worksheet" {
        blockers.push("仅审计本地工作表来源".into());
    }
    if source_sheet.is_none() || source_range.is_none() {
        blockers.push("缺少有效的本地来源 Sheet 或区域".into());
    }
    if layout_range.is_none() {
        blockers.push("缺少透视表输出布局区域".into());
    }
    let cache_field_count = cache.map_or(0, |cache| cache.fields.len());
    let cache_record_count = cache.and_then(|cache| cache.record_count);
    if cache_field_count == 0 {
        blockers.push("Pivot Cache 缺少字段定义".into());
    }
    if cache_record_count.is_none() {
        blockers.push("Pivot Cache Records 不存在或未声明记录数".into());
    }
    if let Some(cache) = cache {
        if cache
            .declared_field_count
            .is_some_and(|count| count != cache.fields.len())
        {
            blockers.push("Pivot Cache 字段声明数量不一致".into());
        }
        if cache
            .declared_record_count
            .zip(cache.record_count)
            .is_some_and(|(declared, actual)| declared != actual)
        {
            blockers.push("Pivot Cache Records 声明数量与实际记录不一致".into());
        }
        if cache.record_count.is_some() && !cache.record_widths_valid {
            blockers.push("Pivot Cache Records 字段宽度与缓存字段不一致".into());
        }
    }
    if declared_pivot_fields.is_some_and(|count| count != pivot_field_count) {
        blockers.push("透视表字段声明数量不一致".into());
    }
    if cache_field_count > 0 && pivot_field_count != cache_field_count {
        blockers.push("透视字段与缓存字段数量不一致".into());
    }
    if data_fields.is_empty() {
        blockers.push("缺少值字段与聚合定义".into());
    }
    if data_fields.iter().any(|field| !field.supported) {
        blockers.push("包含尚未验证的聚合函数".into());
    }
    if data_fields
        .iter()
        .any(|field| field.source_index >= cache_field_count)
    {
        blockers.push("值字段引用超出 Pivot Cache 字段范围".into());
    }

    let fields = cache
        .map(|cache| {
            cache
                .fields
                .iter()
                .enumerate()
                .map(|(index, (name, value_type))| WorkbookPivotField {
                    index,
                    name: name.clone(),
                    role: roles
                        .get(&index)
                        .cloned()
                        .unwrap_or_else(|| "unused".into()),
                    value_type: value_type.clone(),
                })
                .collect()
        })
        .unwrap_or_default();
    let rebuild_candidate = blockers.is_empty();
    let writeback = inspect_pivot_writeback(
        pivot_xml,
        &row_fields,
        &column_fields,
        page_fields.len(),
        rebuild_candidate,
        output_cell_count,
    )?;
    Ok(WorkbookPivotAudit {
        status: if rebuild_candidate {
            "candidate_for_rebuild".into()
        } else {
            "inspection_only".into()
        },
        rebuild_candidate,
        blockers,
        layout_range,
        cache_field_count,
        cache_record_count,
        row_field_count: row_fields.len(),
        column_field_count: column_fields.len(),
        page_field_count: page_fields.len(),
        data_field_count: data_fields.len(),
        fields,
        data_fields,
        writeback,
    })
}

pub fn build_workbook_linked_data(
    pivot_tables: Vec<WorkbookPivotTable>,
    slicers: Vec<WorkbookSlicer>,
    external_links: Vec<WorkbookExternalLink>,
    connections: Vec<WorkbookDataConnection>,
    external_relationship_count: usize,
) -> WorkbookLinkedData {
    let local_pivot_count = pivot_tables
        .iter()
        .filter(|pivot| pivot.source_type == "worksheet")
        .count();
    let connection_backed_pivot_count = pivot_tables
        .iter()
        .filter(|pivot| pivot.connection_id.is_some() || pivot.source_type != "worksheet")
        .count();
    let refresh_risk_count = pivot_tables
        .iter()
        .filter(|pivot| pivot.refresh_on_load)
        .count()
        + connections
            .iter()
            .filter(|connection| connection.refresh_on_load)
            .count();
    let summary = WorkbookLinkedDataSummary {
        total_object_count: pivot_tables.len()
            + slicers.len()
            + external_links.len()
            + connections.len(),
        local_pivot_count,
        connection_backed_pivot_count,
        slicer_count: slicers.len(),
        external_link_count: external_links.len(),
        connection_count: connections.len(),
        refresh_risk_count,
    };
    WorkbookLinkedData {
        pivot_tables,
        slicers,
        external_links,
        connections,
        external_relationship_count,
        summary,
        policy: WorkbookLinkedDataPolicy {
            mode: "offline_read_only".into(),
            metadata_visible: true,
            refresh_allowed: false,
            object_editing_allowed: false,
            external_targets_followed: false,
            sensitive_fields_exposed: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{build_workbook_linked_data, inspect_pivot_cache, inspect_pivot_table};
    use crate::formats::workbook::{
        WorkbookDataConnection, WorkbookExternalLink, WorkbookPivotTable, WorkbookSlicer,
    };

    #[test]
    fn summarizes_objects_and_enforces_offline_read_only_policy() {
        let linked = build_workbook_linked_data(
            vec![
                WorkbookPivotTable {
                    name: "Local".into(),
                    part: "pivot1.xml".into(),
                    sheet: Some("Report".into()),
                    cache_id: Some(1),
                    source_type: "worksheet".into(),
                    source_sheet: Some("Data".into()),
                    source_range: Some("A1:C10".into()),
                    connection_id: None,
                    refresh_on_load: false,
                    audit: Default::default(),
                },
                WorkbookPivotTable {
                    name: "Connected".into(),
                    part: "pivot2.xml".into(),
                    sheet: Some("Report".into()),
                    cache_id: Some(2),
                    source_type: "external".into(),
                    source_sheet: None,
                    source_range: None,
                    connection_id: Some(7),
                    refresh_on_load: true,
                    audit: Default::default(),
                },
            ],
            vec![WorkbookSlicer {
                name: "Region".into(),
                part: "slicer1.xml".into(),
                sheet: Some("Report".into()),
                cache_name: Some("RegionCache".into()),
            }],
            vec![WorkbookExternalLink {
                part: "externalLink1.xml".into(),
                kind: "external_workbook".into(),
                cached_item_count: 2,
                target_kind: Some("file".into()),
            }],
            vec![WorkbookDataConnection {
                id: Some(7),
                name: "Warehouse".into(),
                kind: "5".into(),
                refresh_on_load: true,
                background: false,
                save_data: true,
            }],
            1,
        );
        assert_eq!(linked.summary.total_object_count, 5);
        assert_eq!(linked.summary.local_pivot_count, 1);
        assert_eq!(linked.summary.connection_backed_pivot_count, 1);
        assert_eq!(linked.summary.refresh_risk_count, 2);
        assert_eq!(linked.policy.mode, "offline_read_only");
        assert!(!linked.policy.refresh_allowed);
        assert!(!linked.policy.object_editing_allowed);
        assert!(!linked.policy.external_targets_followed);
        assert!(!linked.policy.sensitive_fields_exposed);
    }

    #[test]
    fn audits_local_pivot_fields_aggregation_and_cache_records() {
        let cache = inspect_pivot_cache(
            br#"<pivotCacheDefinition><cacheFields count="3"><cacheField name="Product"><sharedItems containsString="1"/></cacheField><cacheField name="Stock"><sharedItems containsNumber="1"/></cacheField><cacheField name="Category"><sharedItems containsString="1"/></cacheField></cacheFields></pivotCacheDefinition>"#,
            Some(
                br#"<pivotCacheRecords count="2"><r><s/><n/><s/></r><r><s/><n/><s/></r></pivotCacheRecords>"#,
            ),
        )
        .unwrap();
        let audit = inspect_pivot_table(
            br#"<pivotTableDefinition><location ref="E2:G6"/><pivotFields count="3"><pivotField axis="axisRow"/><pivotField dataField="1"/><pivotField axis="axisCol"/></pivotFields><rowFields count="1"><field x="0"/></rowFields><colFields count="1"><field x="2"/></colFields><dataFields count="1"><dataField name="Sum of Stock" fld="1" subtotal="sum"/></dataFields></pivotTableDefinition>"#,
            "worksheet",
            Some("Inventory"),
            Some("A1:C3"),
            Some(&cache),
            Some(0),
        )
        .unwrap();
        assert!(audit.rebuild_candidate);
        assert_eq!(audit.status, "candidate_for_rebuild");
        assert_eq!(audit.layout_range.as_deref(), Some("E2:G6"));
        assert_eq!(audit.cache_field_count, 3);
        assert_eq!(audit.cache_record_count, Some(2));
        assert_eq!(audit.row_field_count, 1);
        assert_eq!(audit.column_field_count, 1);
        assert_eq!(audit.data_field_count, 1);
        assert_eq!(audit.fields[0].role, "row");
        assert_eq!(audit.fields[1].value_type, "number");
        assert_eq!(audit.data_fields[0].aggregation, "sum");
        assert!(audit.data_fields[0].supported);
        assert!(audit.blockers.is_empty());
        assert_eq!(audit.writeback.status, "blocked");
        assert!(!audit.writeback.allowed);
        assert!(!audit.writeback.pivot_field_items_complete);
        assert!(!audit.writeback.row_items_complete);
        assert!(!audit.writeback.column_items_complete);
        assert!(!audit.writeback.output_cells_present);
    }

    #[test]
    fn keeps_unsupported_or_incomplete_pivots_inspection_only() {
        let cache = inspect_pivot_cache(
            br#"<pivotCacheDefinition><cacheFields count="1"><cacheField name="Value"/></cacheFields></pivotCacheDefinition>"#,
            None,
        )
        .unwrap();
        let audit = inspect_pivot_table(
            br#"<pivotTableDefinition><pivotFields count="1"><pivotField dataField="1"/></pivotFields><dataFields count="1"><dataField fld="3" subtotal="custom"/></dataFields></pivotTableDefinition>"#,
            "external",
            None,
            None,
            Some(&cache),
            None,
        )
        .unwrap();
        assert!(!audit.rebuild_candidate);
        assert_eq!(audit.status, "inspection_only");
        assert!(audit
            .blockers
            .iter()
            .any(|item| item.contains("本地工作表")));
        assert!(audit
            .blockers
            .iter()
            .any(|item| item.contains("Cache Records")));
        assert!(audit.blockers.iter().any(|item| item.contains("聚合函数")));
        assert!(audit.blockers.iter().any(|item| item.contains("超出")));
    }

    #[test]
    fn rejects_declared_or_misaligned_cache_records_as_rebuild_candidates() {
        let cache = inspect_pivot_cache(
            br#"<pivotCacheDefinition><cacheFields count="2"><cacheField name="Group"/><cacheField name="Value"/></cacheFields></pivotCacheDefinition>"#,
            Some(br#"<pivotCacheRecords count="2"><r><s/></r></pivotCacheRecords>"#),
        )
        .unwrap();
        let audit = inspect_pivot_table(
            br#"<pivotTableDefinition><location ref="D1:E3"/><pivotFields count="2"><pivotField axis="axisRow"/><pivotField dataField="1"/></pivotFields><rowFields count="1"><field x="0"/></rowFields><dataFields count="1"><dataField fld="1" subtotal="sum"/></dataFields></pivotTableDefinition>"#,
            "worksheet",
            Some("Data"),
            Some("A1:B2"),
            Some(&cache),
            Some(0),
        )
        .unwrap();
        assert!(!audit.rebuild_candidate);
        assert_eq!(audit.cache_record_count, Some(1));
        assert!(audit
            .blockers
            .iter()
            .any(|item| item.contains("声明数量与实际记录")));
        assert!(audit.blockers.iter().any(|item| item.contains("字段宽度")));
    }

    #[test]
    fn recognizes_complete_writeback_structure_without_enabling_writes() {
        let cache = inspect_pivot_cache(
            br#"<pivotCacheDefinition><cacheFields count="3"><cacheField name="Product"><sharedItems containsString="1"/></cacheField><cacheField name="Stock"><sharedItems containsNumber="1"/></cacheField><cacheField name="Category"><sharedItems containsString="1"/></cacheField></cacheFields></pivotCacheDefinition>"#,
            Some(
                br#"<pivotCacheRecords count="2"><r><s/><n/><s/></r><r><s/><n/><s/></r></pivotCacheRecords>"#,
            ),
        )
        .unwrap();
        let audit = inspect_pivot_table(
            br#"<pivotTableDefinition><location ref="E2:G6"/><pivotFields count="3"><pivotField axis="axisRow"><items count="2"><item x="0"/><item x="1"/></items></pivotField><pivotField dataField="1"/><pivotField axis="axisCol"><items count="2"><item x="0"/><item x="1"/></items></pivotField></pivotFields><rowFields count="1"><field x="0"/></rowFields><rowItems count="2"><i><x v="0"/></i><i><x v="1"/></i></rowItems><colFields count="1"><field x="2"/></colFields><colItems count="2"><i><x v="0"/></i><i><x v="1"/></i></colItems><dataFields count="1"><dataField name="Sum of Stock" fld="1" subtotal="sum"/></dataFields></pivotTableDefinition>"#,
            "worksheet",
            Some("Inventory"),
            Some("A1:C3"),
            Some(&cache),
            Some(4),
        )
        .unwrap();
        assert_eq!(audit.writeback.status, "structure_candidate");
        assert!(!audit.writeback.allowed);
        assert!(audit.writeback.blockers.is_empty());
        assert!(audit.writeback.pivot_field_items_complete);
        assert!(audit.writeback.row_items_complete);
        assert!(audit.writeback.column_items_complete);
        assert!(audit.writeback.output_cells_present);
    }
}
