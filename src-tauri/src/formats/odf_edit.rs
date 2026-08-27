use crate::formats::odf::inspect_odf_package;
use crate::formats::odf_content::parse_odf_content;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use std::ops::Range;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const ODF_EDITABLE_PART: &str = "content.xml";
const MAX_ODS_REPLACEMENT_CHARS: usize = 32_767;
const ODS_PATCH_DEFLATE_LEVEL: i64 = 4;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfPackagePartSnapshot {
    pub part_name: String,
    pub size: usize,
    pub digest: String,
    pub editable_candidate: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdfEditBaselineReport {
    pub status: String,
    pub engine: String,
    pub format: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub part_count: usize,
    pub raw_copied_part_count: usize,
    pub protected_part_count: usize,
    pub editable_candidate_parts: Vec<String>,
    pub changed_parts: Vec<String>,
    pub added_parts: Vec<String>,
    pub removed_parts: Vec<String>,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub source_unchanged: bool,
    pub editing_enabled: bool,
    pub blockers: Vec<String>,
    pub next_stage: String,
    pub parts: Vec<OdfPackagePartSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsEditableCellTarget {
    pub id: String,
    pub sheet_name: String,
    pub address: String,
    pub text: String,
    pub value_type: String,
    pub expected_value_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsBlockedCellTarget {
    pub sheet_name: String,
    pub address: String,
    pub text: String,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsCellEditInventory {
    pub status: String,
    pub source_digest: String,
    pub editable_cells: Vec<OdsEditableCellTarget>,
    pub blocked_cells: Vec<OdsBlockedCellTarget>,
    pub blockers: Vec<String>,
    pub writes_user_file: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdsCellValuePatchReport {
    pub status: String,
    pub engine: String,
    pub target_id: String,
    pub sheet_name: String,
    pub address: String,
    pub value_type: String,
    pub source_digest: String,
    pub output_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
}

#[derive(Default)]
struct SheetScan {
    index: usize,
    name: String,
    next_row: usize,
    current_row: usize,
    row_repeat: usize,
    next_column: usize,
}

struct CellScan {
    sheet_index: usize,
    sheet_name: String,
    row: usize,
    column: usize,
    row_repeat: usize,
    column_repeat: usize,
    value_type: String,
    formula: Option<String>,
    merged: bool,
    start_tag_range: Range<usize>,
    paragraph_count: usize,
    text_event_count: usize,
    text_range: Option<Range<usize>>,
    text: String,
    complex_inline: bool,
    in_paragraph: bool,
}

struct OdsEditableCellInternal {
    public: OdsEditableCellTarget,
    start_tag_range: Range<usize>,
    text_range: Range<usize>,
}

fn package_digest(source: &[u8]) -> String {
    format!("{:x}", Sha256::digest(source))
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODS 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("ODS 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn repeat_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<usize, String> {
    attribute_value(event, key, decoder)?
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "ODS 重复计数不是有效整数".to_string())
        })
        .transpose()
        .map(|value| value.unwrap_or(1))
}

fn column_name(mut column: usize) -> String {
    let mut name = String::new();
    while column > 0 {
        column -= 1;
        name.insert(0, (b'A' + (column % 26) as u8) as char);
        column /= 26;
    }
    name
}

fn xml_escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn validate_replacement(value: &str) -> Result<(), String> {
    if value.chars().count() > MAX_ODS_REPLACEMENT_CHARS {
        return Err(format!(
            "ODS 单元格值超过 {MAX_ODS_REPLACEMENT_CHARS} 字符上限"
        ));
    }
    if value
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
    {
        return Err("ODS 单元格值包含不支持的控制字符".into());
    }
    Ok(())
}

fn value_digest(id: &str, value_type: &str, text: &str) -> String {
    package_digest(format!("{id}\0{value_type}\0{text}").as_bytes())
}

fn content_xml(source: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODS 包失败: {error}"))?;
    let mut file = archive
        .by_name(ODF_EDITABLE_PART)
        .map_err(|error| format!("ODS 缺少 content.xml: {error}"))?;
    let mut xml = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut xml)
        .map_err(|error| format!("读取 ODS content.xml 失败: {error}"))?;
    Ok(xml)
}

fn finalize_cell(
    cell: CellScan,
    editable: &mut Vec<OdsEditableCellInternal>,
    blocked: &mut Vec<OdsBlockedCellTarget>,
) {
    if cell.text.is_empty() && cell.formula.is_none() {
        return;
    }
    let address = format!("{}{}", column_name(cell.column), cell.row);
    let reason = if cell.row_repeat != 1 {
        Some("repeated-row")
    } else if cell.column_repeat != 1 {
        Some("repeated-cell")
    } else if cell.merged {
        Some("merged-cell")
    } else if cell.formula.is_some() {
        Some("formula-readonly")
    } else if !matches!(cell.value_type.as_str(), "string" | "float") {
        Some("unsupported-value-type")
    } else if cell.paragraph_count != 1 || cell.text_event_count != 1 || cell.complex_inline {
        Some("rich-text-readonly")
    } else if cell.text_range.is_none() {
        Some("empty-text-node")
    } else {
        None
    };
    if let Some(reason) = reason {
        blocked.push(OdsBlockedCellTarget {
            sheet_name: cell.sheet_name,
            address,
            text: cell.text,
            reason: reason.into(),
        });
        return;
    }
    let id = format!("ods-cell:{}:{address}", cell.sheet_index);
    let expected_value_digest = value_digest(&id, &cell.value_type, &cell.text);
    let public = OdsEditableCellTarget {
        id,
        sheet_name: cell.sheet_name,
        address,
        text: cell.text,
        value_type: cell.value_type,
        expected_value_digest,
    };
    editable.push(OdsEditableCellInternal {
        public,
        start_tag_range: cell.start_tag_range,
        text_range: cell.text_range.expect("eligible text range"),
    });
}

fn scan_ods_cells(
    source: &[u8],
) -> Result<(Vec<OdsEditableCellInternal>, Vec<OdsBlockedCellTarget>), String> {
    let xml = content_xml(source)?;
    let mut reader = Reader::from_reader(xml.as_slice());
    reader.config_mut().trim_text(false);
    let mut sheet: Option<SheetScan> = None;
    let mut cell: Option<CellScan> = None;
    let mut editable = Vec::new();
    let mut blocked = Vec::new();
    let mut sheet_count = 0usize;

    loop {
        let event = reader
            .read_event()
            .map_err(|error| format!("ODS content.xml 损坏: {error}"))?;
        let position =
            usize::try_from(reader.buffer_position()).map_err(|_| "ODS XML 位置超过平台上限")?;
        match event {
            Event::Start(ref element)
                if element.local_name().as_ref() == b"table" && sheet.is_none() =>
            {
                sheet_count += 1;
                sheet = Some(SheetScan {
                    index: sheet_count,
                    name: attribute_value(element, b"name", reader.decoder())?
                        .unwrap_or_else(|| format!("Sheet {sheet_count}")),
                    next_row: 1,
                    ..SheetScan::default()
                });
            }
            Event::Start(ref element) if element.local_name().as_ref() == b"table-row" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.current_row = sheet.next_row;
                    sheet.row_repeat =
                        repeat_value(element, b"number-rows-repeated", reader.decoder())?;
                    sheet.next_column = 1;
                }
            }
            Event::Start(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(sheet) = sheet.as_ref() {
                    let raw_element: &[u8] = element.as_ref();
                    let start = position
                        .checked_sub(raw_element.len() + 2)
                        .ok_or("ODS 单元格开始位置无效")?;
                    cell = Some(CellScan {
                        sheet_index: sheet.index,
                        sheet_name: sheet.name.clone(),
                        row: sheet.current_row,
                        column: sheet.next_column,
                        row_repeat: sheet.row_repeat,
                        column_repeat: repeat_value(
                            element,
                            b"number-columns-repeated",
                            reader.decoder(),
                        )?,
                        value_type: attribute_value(element, b"value-type", reader.decoder())?
                            .unwrap_or_default(),
                        formula: attribute_value(element, b"formula", reader.decoder())?,
                        merged: attribute_value(
                            element,
                            b"number-columns-spanned",
                            reader.decoder(),
                        )?
                        .is_some()
                            || attribute_value(element, b"number-rows-spanned", reader.decoder())?
                                .is_some(),
                        start_tag_range: start..position,
                        paragraph_count: 0,
                        text_event_count: 0,
                        text_range: None,
                        text: String::new(),
                        complex_inline: false,
                        in_paragraph: false,
                    });
                }
            }
            Event::Start(ref element)
                if element.local_name().as_ref() == b"p" && cell.is_some() =>
            {
                let cell = cell.as_mut().unwrap();
                cell.paragraph_count += 1;
                if cell.in_paragraph {
                    cell.complex_inline = true;
                }
                cell.in_paragraph = true;
            }
            Event::Start(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::Empty(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::Text(ref text) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                let raw_text: &[u8] = text.as_ref();
                let start = position
                    .checked_sub(raw_text.len())
                    .ok_or("ODS 文本位置无效")?;
                let cell = cell.as_mut().unwrap();
                cell.text_event_count += 1;
                if cell.text_event_count == 1 {
                    cell.text_range = Some(start..position);
                }
                cell.text.push_str(
                    &text
                        .xml10_content()
                        .map_err(|error| format!("ODS 单元格文本损坏: {error}"))?,
                );
            }
            Event::GeneralRef(_) if cell.as_ref().is_some_and(|value| value.in_paragraph) => {
                cell.as_mut().unwrap().complex_inline = true;
            }
            Event::End(ref element) if element.local_name().as_ref() == b"p" && cell.is_some() => {
                cell.as_mut().unwrap().in_paragraph = false;
            }
            Event::End(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(completed) = cell.take() {
                    if let Some(sheet) = sheet.as_mut() {
                        sheet.next_column =
                            sheet.next_column.saturating_add(completed.column_repeat);
                    }
                    finalize_cell(completed, &mut editable, &mut blocked);
                }
            }
            Event::Empty(ref element) if element.local_name().as_ref() == b"table-cell" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.next_column = sheet.next_column.saturating_add(repeat_value(
                        element,
                        b"number-columns-repeated",
                        reader.decoder(),
                    )?);
                }
            }
            Event::End(ref element) if element.local_name().as_ref() == b"table-row" => {
                if let Some(sheet) = sheet.as_mut() {
                    sheet.next_row = sheet.next_row.saturating_add(sheet.row_repeat.max(1));
                    sheet.current_row = 0;
                }
            }
            Event::End(ref element)
                if element.local_name().as_ref() == b"table" && cell.is_none() =>
            {
                sheet = None;
            }
            Event::DocType(_) => return Err("ODS content.xml 不允许 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok((editable, blocked))
}

fn package_parts(source: &[u8]) -> Result<BTreeMap<String, OdfPackagePartSnapshot>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODF 隔离包失败: {error}"))?;
    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODF 隔离部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        let mut bytes = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 ODF 部件 {name} 失败: {error}"))?;
        let snapshot = OdfPackagePartSnapshot {
            part_name: name.clone(),
            size: bytes.len(),
            digest: package_digest(&bytes),
            editable_candidate: name == ODF_EDITABLE_PART,
        };
        if parts.insert(name, snapshot).is_some() {
            return Err("ODF 隔离审计发现重复部件".into());
        }
    }
    Ok(parts)
}

fn raw_copy_package(source: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODF 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODF 原始部件失败: {error}"))?;
        writer
            .raw_copy_file(file)
            .map_err(|error| format!("逐字节复制 ODF 部件失败: {error}"))?;
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 ODF 隔离包失败: {error}"))
}

fn rewrite_content_part(source: &[u8], replacement: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 ODS 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = false;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODS 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if name == ODF_EDITABLE_PART {
            if replaced {
                return Err("ODS content.xml 重复".into());
            }
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(ODS_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(ODF_EDITABLE_PART, options)
                .map_err(|error| format!("创建 ODS content.xml 失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 ODS content.xml 失败: {error}"))?;
            replaced = true;
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("逐字节复制受保护 ODS 部件失败: {error}"))?;
        }
    }
    if !replaced {
        return Err("ODS 缺少 content.xml".into());
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 ODS 隔离补丁包失败: {error}"))
}

pub fn inspect_ods_cell_edit_inventory(source: &[u8]) -> Result<OdsCellEditInventory, String> {
    let (baseline, _) = inspect_odf_edit_baseline(source, "ods")?;
    if !baseline.editing_enabled {
        return Ok(OdsCellEditInventory {
            status: "blocked".into(),
            source_digest: baseline.source_package_digest,
            editable_cells: Vec::new(),
            blocked_cells: Vec::new(),
            blockers: baseline.blockers,
            writes_user_file: false,
        });
    }
    let (editable, blocked_cells) = scan_ods_cells(source)?;
    Ok(OdsCellEditInventory {
        status: "candidate".into(),
        source_digest: baseline.source_package_digest,
        editable_cells: editable.into_iter().map(|target| target.public).collect(),
        blocked_cells,
        blockers: Vec::new(),
        writes_user_file: false,
    })
}

pub fn build_ods_cell_value_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_value_digest: &str,
    replacement_value: &str,
) -> Result<(OdsCellValuePatchReport, Vec<u8>), String> {
    validate_replacement(replacement_value)?;
    let source_digest = package_digest(source);
    let baseline = inspect_ods_cell_edit_inventory(source)?;
    if baseline.status != "candidate" {
        return Err(format!(
            "ODS 文件不满足安全编辑条件: {}",
            baseline.blockers.join(", ")
        ));
    }
    let (mut internal_targets, _) = scan_ods_cells(source)?;
    let target = internal_targets
        .drain(..)
        .find(|target| target.public.id == target_id)
        .ok_or_else(|| "ODS 单元格不是可编辑的简单值目标".to_string())?;
    if target.public.expected_value_digest != expected_value_digest {
        return Err("ODS 单元格值已变化，请重新读取后再编辑".into());
    }
    if target.public.text == replacement_value {
        return Err("ODS 单元格新值与当前值相同".into());
    }

    let mut xml = content_xml(source)?;
    let mut patches = vec![(
        target.text_range.clone(),
        xml_escape_text(replacement_value).into_bytes(),
    )];
    if target.public.value_type == "float" {
        let trimmed = replacement_value.trim();
        let numeric = trimmed
            .parse::<f64>()
            .map_err(|_| "数值单元格只接受有限数字".to_string())?;
        if !numeric.is_finite() || trimmed.is_empty() {
            return Err("数值单元格只接受有限数字".into());
        }
        let tag = std::str::from_utf8(&xml[target.start_tag_range.clone()])
            .map_err(|_| "ODS 单元格开始标签不是 UTF-8")?;
        let value_attribute = Regex::new(r#"office:value="[^"]*""#)
            .map_err(|error| format!("初始化 ODS 数值属性规则失败: {error}"))?;
        if !value_attribute.is_match(tag) {
            return Err("数值单元格缺少规范 office:value 属性".into());
        }
        let replacement_tag = value_attribute
            .replace(tag, format!("office:value=\"{trimmed}\""))
            .into_owned();
        patches.push((target.start_tag_range.clone(), replacement_tag.into_bytes()));
    }
    patches.sort_by(|left, right| right.0.start.cmp(&left.0.start));
    for (range, replacement) in patches {
        xml.splice(range, replacement);
    }

    let output = rewrite_content_part(source, &xml)?;
    let output_digest = package_digest(&output);
    let source_parts = package_parts(source)?;
    let output_parts = package_parts(&output)?;
    let mut changed_parts = Vec::new();
    for (name, before) in &source_parts {
        let after = output_parts
            .get(name)
            .ok_or_else(|| format!("ODS 输出缺少部件 {name}"))?;
        if before != after {
            changed_parts.push(name.clone());
        }
    }
    if source_parts.len() != output_parts.len() || changed_parts != [ODF_EDITABLE_PART] {
        return Err("ODS 单元格补丁修改了 content.xml 之外的受保护部件".into());
    }
    let output_package = inspect_odf_package(&output, "ods")?;
    let output_model = parse_odf_content(&output, "ods")?;
    let semantic_reparse_verified = output_model
        .sheets
        .iter()
        .find(|sheet| sheet.name == target.public.sheet_name)
        .and_then(|sheet| {
            sheet
                .rows
                .iter()
                .flat_map(|row| row.cells.iter())
                .find(|cell| cell.address == target.public.address)
        })
        .is_some_and(|cell| cell.text == replacement_value && cell.formula.is_none());
    if !semantic_reparse_verified {
        return Err("ODS 单元格补丁语义复读不一致".into());
    }
    let report = OdsCellValuePatchReport {
        status: "isolated-copy-verified".into(),
        engine: "longedit-ods-cell-value-patch-v1".into(),
        target_id: target.public.id,
        sheet_name: target.public.sheet_name,
        address: target.public.address,
        value_type: target.public.value_type,
        source_digest: source_digest.clone(),
        output_digest,
        changed_parts,
        unchanged_part_count: source_parts.len().saturating_sub(1),
        unchanged_parts_verified: source_parts
            .iter()
            .filter(|(name, _)| name.as_str() != ODF_EDITABLE_PART)
            .all(|(name, before)| output_parts.get(name) == Some(before)),
        structural_reparse_verified: output_package.format == "ods",
        semantic_reparse_verified,
        source_unchanged: package_digest(source) == source_digest,
        writes_user_file: false,
        output_bytes: output.len(),
    };
    Ok((report, output))
}

pub fn inspect_odf_edit_baseline(
    source: &[u8],
    extension: &str,
) -> Result<(OdfEditBaselineReport, Vec<u8>), String> {
    let source_report = inspect_odf_package(source, extension)?;
    let source_digest = package_digest(source);
    let source_parts = package_parts(source)?;
    let isolated = raw_copy_package(source)?;
    let isolated_report = inspect_odf_package(&isolated, extension)?;
    let isolated_parts = package_parts(&isolated)?;

    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, before)| {
            isolated_parts
                .get(name)
                .filter(|after| *after != before)
                .map(|_| name.clone())
        })
        .collect::<Vec<_>>();
    let added_parts = isolated_parts
        .keys()
        .filter(|name| !source_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    let removed_parts = source_parts
        .keys()
        .filter(|name| !isolated_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    let unchanged_parts_verified =
        changed_parts.is_empty() && added_parts.is_empty() && removed_parts.is_empty();
    if !unchanged_parts_verified {
        return Err("ODF 隔离复制没有逐字节保持全部部件".into());
    }

    let mut blockers = Vec::new();
    let risks = &source_report.risks;
    if risks.encrypted_entry_count > 0 {
        blockers.push("encrypted-content".into());
    }
    if risks.signature_part_count > 0 {
        blockers.push("digital-signature".into());
    }
    if risks.script_marker_count > 0 {
        blockers.push("script-or-macro".into());
    }
    if risks.external_link_count > 0 {
        blockers.push("external-link".into());
    }
    if risks.embedded_object_count > 0 {
        blockers.push("embedded-object".into());
    }
    let editing_enabled = blockers.is_empty();
    let format = source_report.format.clone();
    let next_stage = match format.as_str() {
        "ods" => "bounded-cell-value-candidate",
        "odp" => "bounded-slide-text-candidate",
        _ => "readonly",
    };
    let editable_candidate_parts = source_parts
        .values()
        .filter(|part| part.editable_candidate)
        .map(|part| part.part_name.clone())
        .collect::<Vec<_>>();
    if editable_candidate_parts != [ODF_EDITABLE_PART] {
        return Err("ODF 隔离包缺少唯一 content.xml 候选部件".into());
    }
    let part_count = source_parts.len();
    let source_unchanged = package_digest(source) == source_digest;
    let report = OdfEditBaselineReport {
        status: if editing_enabled {
            "candidate"
        } else {
            "blocked"
        }
        .into(),
        engine: "longedit-odf-isolated-baseline-v1".into(),
        format,
        execution: "memory-only".into(),
        writes_user_file: false,
        source_package_digest: source_digest,
        isolated_package_digest: package_digest(&isolated),
        part_count,
        raw_copied_part_count: part_count,
        protected_part_count: part_count.saturating_sub(1),
        editable_candidate_parts,
        changed_parts,
        added_parts,
        removed_parts,
        unchanged_parts_verified,
        structural_reparse_verified: source_report.format == isolated_report.format
            && source_report.root_mime_type == isolated_report.root_mime_type
            && source_report.entry_count == isolated_report.entry_count,
        source_unchanged,
        editing_enabled,
        blockers,
        next_stage: next_stage.into(),
        parts: source_parts.into_values().collect(),
    };
    Ok((report, isolated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("odf-content")
            .join(name)
    }

    #[test]
    fn real_ods_and_odp_are_isolated_without_part_drift() {
        for (name, extension, next_stage) in [
            (
                "longedit-e1c-spreadsheet.ods",
                "ods",
                "bounded-cell-value-candidate",
            ),
            (
                "longedit-e1c-presentation.odp",
                "odp",
                "bounded-slide-text-candidate",
            ),
        ] {
            let source = fs::read(fixture(name)).unwrap();
            let source_digest = package_digest(&source);
            let (report, isolated) = inspect_odf_edit_baseline(&source, extension).unwrap();
            assert_eq!(report.status, "candidate", "{name}: {:?}", report.blockers);
            assert!(report.editing_enabled);
            assert!(report.unchanged_parts_verified);
            assert!(report.structural_reparse_verified);
            assert!(report.source_unchanged);
            assert!(report.blockers.is_empty());
            assert_eq!(report.editable_candidate_parts, [ODF_EDITABLE_PART]);
            assert_eq!(report.raw_copied_part_count, report.part_count);
            assert_eq!(report.protected_part_count + 1, report.part_count);
            assert_eq!(report.next_stage, next_stage);
            assert_eq!(
                package_parts(&source).unwrap(),
                package_parts(&isolated).unwrap()
            );
            assert_eq!(package_digest(&source), source_digest);
        }
    }

    #[test]
    fn real_ods_exposes_only_simple_values_and_blocks_formula_cells() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        assert_eq!(inventory.status, "candidate");
        assert!(inventory.writes_user_file == false);
        assert!(inventory.blockers.is_empty());
        assert!(inventory
            .editable_cells
            .iter()
            .any(|cell| cell.sheet_name == "Overview" && cell.address == "A1"));
        assert!(inventory
            .editable_cells
            .iter()
            .any(|cell| cell.address == "A2" && cell.value_type == "float"));
        assert!(inventory
            .blocked_cells
            .iter()
            .any(|cell| cell.address == "B2" && cell.reason == "formula-readonly"));
    }

    #[test]
    fn real_ods_string_and_float_values_patch_without_protected_part_drift() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let source_digest = package_digest(&source);
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        for (address, replacement) in [("A1", "LongEdit & ODS <copy>"), ("A2", "84.5")] {
            let target = inventory
                .editable_cells
                .iter()
                .find(|cell| cell.sheet_name == "Overview" && cell.address == address)
                .unwrap();
            let (report, output) = build_ods_cell_value_patch_isolated(
                &source,
                &target.id,
                &target.expected_value_digest,
                replacement,
            )
            .unwrap();
            assert_eq!(report.status, "isolated-copy-verified");
            assert_eq!(report.changed_parts, [ODF_EDITABLE_PART]);
            assert!(report.unchanged_parts_verified);
            assert!(report.structural_reparse_verified);
            assert!(report.semantic_reparse_verified);
            assert!(report.source_unchanged);
            assert!(!report.writes_user_file);
            assert_eq!(package_digest(&source), source_digest);
            assert_ne!(package_digest(&output), source_digest);
        }
    }

    #[test]
    #[ignore = "writes an isolated audit artifact for the M1C-C LibreOffice producer check"]
    fn export_m1cc_formula_precedent_copy() {
        let output = std::env::var_os("LONGEDIT_M1CC_OUTPUT")
            .map(PathBuf::from)
            .expect("LONGEDIT_M1CC_OUTPUT is required");
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.sheet_name == "Overview" && cell.address == "A2")
            .unwrap();
        let (report, patched) = build_ods_cell_value_patch_isolated(
            &source,
            &target.id,
            &target.expected_value_digest,
            "84.5",
        )
        .unwrap();
        assert_eq!(report.changed_parts, [ODF_EDITABLE_PART]);
        assert!(report.unchanged_parts_verified && report.semantic_reparse_verified);
        fs::write(output, patched).unwrap();
    }

    #[test]
    fn stale_or_formula_targets_cannot_be_patched() {
        let source = fs::read(fixture("longedit-e1c-spreadsheet.ods")).unwrap();
        let inventory = inspect_ods_cell_edit_inventory(&source).unwrap();
        let target = inventory
            .editable_cells
            .iter()
            .find(|cell| cell.address == "A1")
            .unwrap();
        assert!(build_ods_cell_value_patch_isolated(
            &source,
            &target.id,
            "stale-digest",
            "replacement",
        )
        .unwrap_err()
        .contains("已变化"));
        assert!(build_ods_cell_value_patch_isolated(
            &source,
            "ods-cell:1:B2",
            "not-editable",
            "99",
        )
        .unwrap_err()
        .contains("不是可编辑"));
    }
}
