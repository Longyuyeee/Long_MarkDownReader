use crate::formats::pptx::parse_pptx;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_PPTX_EDITABLE_TEXT_CHARS: usize = 32_767;
const MAX_PPTX_ALT_TEXT_CHARS: usize = 1_024;
const MAX_PPTX_REPLACEMENT_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const PPTX_PATCH_DEFLATE_LEVEL: i64 = 4;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxPackagePartSnapshot {
    pub part_name: String,
    pub size: usize,
    pub digest: String,
    pub editable_candidate: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditBaselineReport {
    pub status: String,
    pub engine: String,
    pub execution: String,
    pub writes_user_file: bool,
    pub source_signature: String,
    pub source_package_digest: String,
    pub isolated_package_digest: String,
    pub part_count: usize,
    pub raw_copied_part_count: usize,
    pub unchanged_part_count: usize,
    pub protected_part_count: usize,
    pub editable_candidate_parts: Vec<String>,
    pub changed_parts: Vec<String>,
    pub added_parts: Vec<String>,
    pub removed_parts: Vec<String>,
    pub exact_package_copy_verified: bool,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub editing_enabled: bool,
    pub next_stage: String,
    pub editable_text_targets: Vec<PptxEditableTextTarget>,
    pub editable_notes_targets: Vec<PptxEditableTextTarget>,
    pub editable_style_targets: Vec<PptxEditableStyleTarget>,
    pub editable_alt_text_targets: Vec<PptxEditableAltTextTarget>,
    pub editable_image_targets: Vec<PptxEditableImageTarget>,
    pub editable_shape_slides: Vec<PptxEditableShapeSlide>,
    pub editable_shape_targets: Vec<PptxEditableShapeTarget>,
    pub editable_slide_targets: Vec<PptxEditableSlideTarget>,
    pub parts: Vec<PptxPackagePartSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableTextTarget {
    pub id: String,
    pub kind: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub part_name: String,
    pub object_id: String,
    pub object_name: String,
    pub text: String,
    pub expected_text_digest: String,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxIsolatedTextPatchReport {
    pub status: String,
    pub engine: String,
    pub target_id: String,
    pub target_kind: String,
    pub target_part: String,
    pub source_digest: String,
    pub output_digest: String,
    pub source_part_digest: String,
    pub output_part_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableStyleTarget {
    pub id: String,
    pub kind: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub part_name: String,
    pub object_id: String,
    pub object_name: String,
    pub text: String,
    pub font_size_hundredth_points: Option<u32>,
    pub font_family: Option<String>,
    pub color: Option<String>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub alignment: String,
    pub expected_style_digest: String,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableAltTextTarget {
    pub id: String,
    pub kind: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub part_name: String,
    pub object_id: String,
    pub object_name: String,
    pub alt_text: String,
    pub expected_metadata_digest: String,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableImageTarget {
    pub id: String,
    pub kind: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub object_id: String,
    pub object_name: String,
    pub part_name: String,
    pub mime_type: String,
    pub source_bytes: usize,
    pub reference_count: usize,
    pub expected_media_digest: String,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableShapeSlide {
    pub id: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub part_name: String,
    pub next_object_id: u32,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableShapeTarget {
    pub id: String,
    pub kind: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub part_name: String,
    pub object_id: String,
    pub object_name: String,
    pub shape_type: String,
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
    pub expected_shape_digest: String,
    pub expected_part_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxEditableSlideTarget {
    pub id: String,
    pub slide_number: usize,
    pub slide_id: String,
    pub relationship_id: String,
    pub part_name: String,
    pub title: String,
    pub hidden: bool,
    pub safe_copy: bool,
    pub safe_delete: bool,
    pub blockers: Vec<String>,
    pub expected_slide_digest: String,
    pub expected_presentation_digest: String,
    pub expected_relationships_digest: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxSlideLifecycleReport {
    pub status: String,
    pub engine: String,
    pub operation: String,
    pub target_id: String,
    pub source_digest: String,
    pub output_digest: String,
    pub changed_parts: Vec<String>,
    pub added_parts: Vec<String>,
    pub removed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
    pub slide_count_before: usize,
    pub slide_count_after: usize,
    pub resulting_slide_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxIsolatedMetadataPatchReport {
    pub status: String,
    pub engine: String,
    pub operation: String,
    pub target_id: String,
    pub target_kind: String,
    pub target_part: String,
    pub source_digest: String,
    pub output_digest: String,
    pub source_part_digest: String,
    pub output_part_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub semantic_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub writes_user_file: bool,
    pub output_bytes: usize,
}

#[derive(Clone, Debug)]
struct EditableTargetSpan {
    target: PptxEditableTextTarget,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct EditableStyleTargetSpan {
    target: PptxEditableStyleTarget,
    run_properties_span: Option<(usize, usize)>,
    run_content_start: usize,
    paragraph_properties_span: Option<(usize, usize)>,
    paragraph_content_start: usize,
    preserved_language: Option<String>,
    preserved_alt_language: Option<String>,
    preserved_strike: Option<String>,
    preserve_effect_list: bool,
    preserve_underline_fill_text: bool,
}

#[derive(Clone, Debug)]
struct EditableAltTextTargetSpan {
    target: PptxEditableAltTextTarget,
    metadata_tag_span: (usize, usize),
    metadata_tag_name: String,
    metadata_attributes: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
struct EditableShapeTargetSpan {
    target: PptxEditableShapeTarget,
    start: usize,
    end: usize,
}

#[derive(Default)]
struct ShapeLifecycleScan {
    root_name: String,
    depth: usize,
    start: usize,
    end: usize,
    object_id: String,
    object_name: String,
    shape_type: String,
    has_text_body: bool,
    has_placeholder: bool,
    has_relationship: bool,
    has_connection: bool,
    is_text_box: bool,
}

#[derive(Clone, Debug)]
struct SlideIdEntry {
    slide_id: String,
    relationship_id: String,
    hidden: bool,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct RelationshipEntry {
    id: String,
    relation_type: String,
    target: String,
    target_mode: Option<String>,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct OverrideEntry {
    part_name: String,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct XmlListScan<T> {
    entries: Vec<T>,
    insertion_offset: usize,
}

#[derive(Clone, Debug)]
struct SlideLifecycleTargetInternal {
    target: PptxEditableSlideTarget,
    notes_part: Option<String>,
    notes_relationship_part: Option<String>,
    slide_relationship_part: String,
    layout_target: String,
}

#[derive(Default)]
struct PackageMutation {
    replacements: BTreeMap<String, Vec<u8>>,
    additions: BTreeMap<String, Vec<u8>>,
    removals: BTreeSet<String>,
}

struct SlideShapeScan {
    insertion_offset: usize,
    next_object_id: u32,
    shapes: Vec<ShapeLifecycleScan>,
}

#[derive(Default)]
struct ShapeTextScan {
    depth: usize,
    id: String,
    name: String,
    placeholder_type: Option<String>,
    has_text_body: bool,
    text_element_count: usize,
    text_event_count: usize,
    text: String,
    span: Option<(usize, usize)>,
    in_text: bool,
    safe: bool,
    shape_start: usize,
    shape_end: usize,
    paragraph_count: usize,
    run_count: usize,
    is_text_box: bool,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_editable_candidate_part(part_name: &str) -> bool {
    (part_name.starts_with("ppt/slides/slide") && part_name.ends_with(".xml"))
        || (part_name.starts_with("ppt/notesSlides/notesSlide") && part_name.ends_with(".xml"))
}

fn inspect_package_parts(source: &[u8]) -> Result<Vec<PptxPackagePartSnapshot>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 PPTX OOXML 包失败: {error}"))?;
    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
        let mut part = archive
            .by_index(index)
            .map_err(|error| format!("读取 PPTX OOXML 部件失败: {error}"))?;
        if part.is_dir() {
            continue;
        }
        if part.enclosed_name().is_none() {
            return Err(format!("PPTX OOXML 部件路径不安全: {}", part.name()));
        }
        let part_name = part.name().replace('\\', "/");
        let mut bytes = Vec::with_capacity(part.size() as usize);
        part.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 PPTX OOXML 部件 {part_name} 失败: {error}"))?;
        let snapshot = PptxPackagePartSnapshot {
            editable_candidate: is_editable_candidate_part(&part_name),
            part_name: part_name.clone(),
            size: bytes.len(),
            digest: digest(&bytes),
        };
        if parts.insert(part_name.clone(), snapshot).is_some() {
            return Err(format!("PPTX OOXML 包含重复部件: {part_name}"));
        }
    }
    if parts.is_empty() {
        return Err("PPTX OOXML 包没有可审计部件".into());
    }
    Ok(parts.into_values().collect())
}

fn read_part(source: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 PPTX OOXML 包失败: {error}"))?;
    let mut part = archive
        .by_name(part_name)
        .map_err(|error| format!("PPTX 部件 {part_name} 缺失: {error}"))?;
    if part.enclosed_name().is_none() {
        return Err(format!("PPTX 部件路径不安全: {part_name}"));
    }
    let mut bytes = Vec::with_capacity(part.size() as usize);
    part.read_to_end(&mut bytes)
        .map_err(|error| format!("读取 PPTX 部件 {part_name} 失败: {error}"))?;
    Ok(bytes)
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("PPTX C4B XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("PPTX C4B XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn opening_tag_span(
    buffer_position: u64,
    event: &BytesStart<'_>,
) -> Result<(usize, usize), String> {
    let end = usize::try_from(buffer_position).map_err(|_| "PPTX XML 范围超过平台上限")?;
    let event_bytes: &[u8] = event.as_ref();
    let start = end
        .checked_sub(event_bytes.len().saturating_add(2))
        .ok_or("PPTX XML 开始标签范围无效")?;
    Ok((start, end))
}

fn empty_tag_span(buffer_position: u64, event: &BytesStart<'_>) -> Result<(usize, usize), String> {
    let end = usize::try_from(buffer_position).map_err(|_| "PPTX XML 范围超过平台上限")?;
    let event_bytes: &[u8] = event.as_ref();
    let start = end
        .checked_sub(event_bytes.len().saturating_add(3))
        .ok_or("PPTX XML 空标签范围无效")?;
    Ok((start, end))
}

fn forbidden_text_carrier(name: &[u8]) -> bool {
    matches!(
        name,
        b"fld" | b"br" | b"tab" | b"hlinkClick" | b"hlinkMouseOver" | b"custData" | b"contentPart"
    )
}

fn scan_safe_text_shapes(xml: &[u8]) -> Result<Vec<ShapeTextScan>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut current: Option<ShapeTextScan> = None;
    let mut candidates = Vec::new();

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C4B XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                depth += 1;
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"sp" && current.is_none() {
                    let (shape_start, _) = opening_tag_span(reader.buffer_position(), event)?;
                    current = Some(ShapeTextScan {
                        depth,
                        safe: true,
                        shape_start,
                        ..Default::default()
                    });
                    continue;
                }
                if let Some(shape) = current.as_mut() {
                    if forbidden_text_carrier(name) {
                        shape.safe = false;
                    }
                    match name {
                        b"cNvPr" => {
                            shape.id = attribute_value(event, b"id", reader.decoder())?
                                .unwrap_or_default();
                            shape.name = attribute_value(event, b"name", reader.decoder())?
                                .unwrap_or_default();
                        }
                        b"ph" => {
                            shape.placeholder_type =
                                attribute_value(event, b"type", reader.decoder())?;
                        }
                        b"txBody" => shape.has_text_body = true,
                        b"cNvSpPr" => {
                            shape.is_text_box = attribute_value(event, b"txBox", reader.decoder())?
                                .as_deref()
                                == Some("1");
                        }
                        b"p" if shape.has_text_body => shape.paragraph_count += 1,
                        b"r" if shape.has_text_body => shape.run_count += 1,
                        b"t" => {
                            shape.text_element_count += 1;
                            shape.in_text = true;
                        }
                        _ => {}
                    }
                }
            }
            Event::Empty(ref event) => {
                if let Some(shape) = current.as_mut() {
                    let name = event.local_name();
                    let name = name.as_ref();
                    if forbidden_text_carrier(name) {
                        shape.safe = false;
                    }
                    match name {
                        b"cNvPr" => {
                            shape.id = attribute_value(event, b"id", reader.decoder())?
                                .unwrap_or_default();
                            shape.name = attribute_value(event, b"name", reader.decoder())?
                                .unwrap_or_default();
                        }
                        b"ph" => {
                            shape.placeholder_type =
                                attribute_value(event, b"type", reader.decoder())?;
                        }
                        b"cNvSpPr" => {
                            shape.is_text_box = attribute_value(event, b"txBox", reader.decoder())?
                                .as_deref()
                                == Some("1");
                        }
                        b"p" if shape.has_text_body => shape.paragraph_count += 1,
                        b"r" if shape.has_text_body => shape.run_count += 1,
                        b"t" => {
                            shape.text_element_count += 1;
                            shape.safe = false;
                        }
                        _ => {}
                    }
                }
            }
            Event::Text(ref event) => {
                if let Some(shape) = current.as_mut().filter(|shape| shape.in_text) {
                    shape.text_event_count += 1;
                    let raw: &[u8] = event.as_ref();
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "PPTX C4B 文本范围超过平台上限")?;
                    let start = end.checked_sub(raw.len()).ok_or("PPTX C4B 文本范围无效")?;
                    if shape.span.is_none() {
                        shape.span = Some((start, end));
                    }
                    shape.text.push_str(
                        &event
                            .decode()
                            .map_err(|error| format!("PPTX C4B 文本解码失败: {error}"))?,
                    );
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if let Some(shape) = current.as_mut() {
                    if name == b"t" {
                        shape.in_text = false;
                    }
                    if name == b"sp" && shape.depth == depth {
                        shape.shape_end = usize::try_from(reader.buffer_position())
                            .map_err(|_| "PPTX C4C 形状范围超过平台上限")?;
                        let shape = current.take().expect("shape exists");
                        if shape.safe
                            && shape.has_text_body
                            && shape.text_element_count == 1
                            && shape.text_event_count == 1
                            && shape.span.is_some()
                            && !shape.id.is_empty()
                            && !shape.text.trim().is_empty()
                            && shape.text.chars().count() <= MAX_PPTX_EDITABLE_TEXT_CHARS
                        {
                            candidates.push(shape);
                        }
                    }
                }
                depth = depth.saturating_sub(1);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(candidates)
}

fn all_attributes(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    stage: &str,
) -> Result<Vec<(String, String)>, String> {
    event
        .attributes()
        .with_checks(false)
        .map(|attribute| {
            let attribute =
                attribute.map_err(|error| format!("PPTX {stage} XML 属性损坏: {error}"))?;
            let key = std::str::from_utf8(attribute.key.as_ref())
                .map_err(|_| format!("PPTX {stage} XML 属性名称不是 UTF-8"))?
                .to_string();
            let value = attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map_err(|error| format!("PPTX {stage} XML 属性解码失败: {error}"))?
                .into_owned();
            Ok((key, value))
        })
        .collect()
}

fn local_attribute_map(
    attributes: &[(String, String)],
) -> Result<BTreeMap<String, String>, String> {
    let mut values = BTreeMap::new();
    for (key, value) in attributes {
        let local = key.rsplit(':').next().unwrap_or(key).to_string();
        if values.insert(local.clone(), value.clone()).is_some() {
            return Err(format!("PPTX C4C XML 属性局部名称重复: {local}"));
        }
    }
    Ok(values)
}

fn parse_ooxml_bool(value: Option<&String>) -> Result<bool, String> {
    match value.map(String::as_str).unwrap_or("0") {
        "1" | "true" | "on" => Ok(true),
        "0" | "false" | "off" => Ok(false),
        value => Err(format!("PPTX C4C 布尔样式值不安全: {value}")),
    }
}

fn style_digest(
    font_size_hundredth_points: Option<u32>,
    font_family: Option<&str>,
    color: Option<&str>,
    bold: bool,
    italic: bool,
    underline: bool,
    alignment: &str,
) -> String {
    digest(
        format!(
            "size={:?}|font={}|color={}|b={bold}|i={italic}|u={underline}|align={alignment}",
            font_size_hundredth_points,
            font_family.unwrap_or(""),
            color.unwrap_or("")
        )
        .as_bytes(),
    )
}

#[derive(Default)]
struct StyleMarkupScan {
    safe: bool,
    run_count: usize,
    run_depth: usize,
    run_content_start: usize,
    paragraph_content_start: usize,
    run_properties_depth: usize,
    run_properties_start: usize,
    run_properties_span: Option<(usize, usize)>,
    paragraph_properties_depth: usize,
    paragraph_properties_start: usize,
    paragraph_properties_span: Option<(usize, usize)>,
    run_attributes: Vec<(String, String)>,
    paragraph_attributes: Vec<(String, String)>,
    font_family: Option<String>,
    color: Option<String>,
    preserve_effect_list: bool,
    preserve_underline_fill_text: bool,
}

fn scan_safe_style_markup(
    xml: &[u8],
    shape: &ShapeTextScan,
) -> Result<Option<StyleMarkupScan>, String> {
    if shape.paragraph_count != 1 || shape.run_count != 1 || shape.shape_end <= shape.shape_start {
        return Ok(None);
    }
    let fragment = &xml[shape.shape_start..shape.shape_end];
    let mut reader = Reader::from_reader(fragment);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut scan = StyleMarkupScan {
        safe: true,
        ..Default::default()
    };

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C4C 字符样式 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                depth += 1;
                let name = event.local_name();
                let name = name.as_ref();
                if scan.run_properties_depth > 0 && depth > scan.run_properties_depth {
                    match name {
                        b"solidFill" | b"srgbClr" | b"effectLst" | b"uFillTx" | b"latin" => {}
                        _ => scan.safe = false,
                    }
                    if name == b"srgbClr" {
                        scan.color = attribute_value(event, b"val", reader.decoder())?;
                    } else if name == b"latin" {
                        scan.font_family = attribute_value(event, b"typeface", reader.decoder())?;
                    } else if name == b"effectLst" {
                        scan.preserve_effect_list = true;
                    } else if name == b"uFillTx" {
                        scan.preserve_underline_fill_text = true;
                    }
                    continue;
                }
                if scan.paragraph_properties_depth > 0 && depth > scan.paragraph_properties_depth {
                    scan.safe = false;
                    continue;
                }
                match name {
                    b"p" => {
                        scan.paragraph_content_start = usize::try_from(reader.buffer_position())
                            .map_err(|_| "PPTX C4C 段落范围超过平台上限")?;
                    }
                    b"pPr" => {
                        if scan.paragraph_properties_span.is_some()
                            || scan.paragraph_properties_depth > 0
                        {
                            scan.safe = false;
                        }
                        let (start, _) = opening_tag_span(reader.buffer_position(), event)?;
                        scan.paragraph_properties_start = start;
                        scan.paragraph_properties_depth = depth;
                        scan.paragraph_attributes = all_attributes(event, reader.decoder(), "C4C")?;
                        if local_attribute_map(&scan.paragraph_attributes)?
                            .keys()
                            .any(|key| key != "algn")
                        {
                            scan.safe = false;
                        }
                    }
                    b"r" => {
                        scan.run_count += 1;
                        scan.run_depth = depth;
                        scan.run_content_start = usize::try_from(reader.buffer_position())
                            .map_err(|_| "PPTX C4C 运行范围超过平台上限")?;
                    }
                    b"rPr" if scan.run_depth > 0 => {
                        if scan.run_properties_span.is_some() || scan.run_properties_depth > 0 {
                            scan.safe = false;
                        }
                        let (start, _) = opening_tag_span(reader.buffer_position(), event)?;
                        scan.run_properties_start = start;
                        scan.run_properties_depth = depth;
                        scan.run_attributes = all_attributes(event, reader.decoder(), "C4C")?;
                        let allowed = ["lang", "altLang", "sz", "b", "i", "u", "strike"];
                        if local_attribute_map(&scan.run_attributes)?
                            .keys()
                            .any(|key| !allowed.contains(&key.as_str()))
                        {
                            scan.safe = false;
                        }
                    }
                    _ => {}
                }
            }
            Event::Empty(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if scan.run_properties_depth > 0 {
                    match name {
                        b"srgbClr" => {
                            scan.color = attribute_value(event, b"val", reader.decoder())?;
                        }
                        b"latin" => {
                            scan.font_family =
                                attribute_value(event, b"typeface", reader.decoder())?;
                        }
                        b"effectLst" => scan.preserve_effect_list = true,
                        b"uFillTx" => scan.preserve_underline_fill_text = true,
                        _ => scan.safe = false,
                    }
                    continue;
                }
                match name {
                    b"pPr" => {
                        if scan.paragraph_properties_span.is_some() {
                            scan.safe = false;
                        }
                        let span = empty_tag_span(reader.buffer_position(), event)?;
                        scan.paragraph_properties_span = Some(span);
                        scan.paragraph_attributes = all_attributes(event, reader.decoder(), "C4C")?;
                        if local_attribute_map(&scan.paragraph_attributes)?
                            .keys()
                            .any(|key| key != "algn")
                        {
                            scan.safe = false;
                        }
                    }
                    b"rPr" if scan.run_depth > 0 => {
                        if scan.run_properties_span.is_some() {
                            scan.safe = false;
                        }
                        let span = empty_tag_span(reader.buffer_position(), event)?;
                        scan.run_properties_span = Some(span);
                        scan.run_attributes = all_attributes(event, reader.decoder(), "C4C")?;
                        let allowed = ["lang", "altLang", "sz", "b", "i", "u", "strike"];
                        if local_attribute_map(&scan.run_attributes)?
                            .keys()
                            .any(|key| !allowed.contains(&key.as_str()))
                        {
                            scan.safe = false;
                        }
                    }
                    _ => {
                        if scan.paragraph_properties_depth > 0 {
                            scan.safe = false;
                        }
                    }
                }
            }
            Event::Text(ref event) => {
                if scan.run_properties_depth > 0
                    && !event
                        .decode()
                        .map_err(|error| format!("PPTX C4C 样式文本解码失败: {error}"))?
                        .trim()
                        .is_empty()
                {
                    scan.safe = false;
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"rPr" && scan.run_properties_depth == depth {
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "PPTX C4C 运行属性范围超过平台上限")?;
                    scan.run_properties_span = Some((scan.run_properties_start, end));
                    scan.run_properties_depth = 0;
                } else if name == b"pPr" && scan.paragraph_properties_depth == depth {
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "PPTX C4C 段落属性范围超过平台上限")?;
                    scan.paragraph_properties_span = Some((scan.paragraph_properties_start, end));
                    scan.paragraph_properties_depth = 0;
                } else if name == b"r" && scan.run_depth == depth {
                    scan.run_depth = 0;
                }
                depth = depth.saturating_sub(1);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !scan.safe
        || scan.run_count != 1
        || scan.run_content_start == 0
        || scan.paragraph_content_start == 0
    {
        return Ok(None);
    }
    if let Some(color) = scan.color.as_ref() {
        if color.len() != 6 || !color.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Ok(None);
        }
    }
    Ok(Some(scan))
}

#[derive(Default)]
struct PictureMetadataScan {
    depth: usize,
    safe: bool,
    id: String,
    name: String,
    alt_text: String,
    metadata_tag_span: Option<(usize, usize)>,
    metadata_tag_name: String,
    metadata_attributes: Vec<(String, String)>,
    metadata_count: usize,
    embedded_blip_count: usize,
}

fn scan_safe_picture_metadata(xml: &[u8]) -> Result<Vec<PictureMetadataScan>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut current: Option<PictureMetadataScan> = None;
    let mut candidates = Vec::new();
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C4C 图片元数据 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                depth += 1;
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"pic" && current.is_none() {
                    current = Some(PictureMetadataScan {
                        depth,
                        safe: true,
                        ..Default::default()
                    });
                    continue;
                }
                if let Some(picture) = current.as_mut() {
                    if name == b"cNvPr" {
                        picture.metadata_count += 1;
                        let span = opening_tag_span(reader.buffer_position(), event)?;
                        picture.metadata_tag_span = Some(span);
                        picture.metadata_tag_name =
                            String::from_utf8_lossy(event.name().as_ref()).into_owned();
                        picture.metadata_attributes =
                            all_attributes(event, reader.decoder(), "C4C")?;
                        picture.id =
                            attribute_value(event, b"id", reader.decoder())?.unwrap_or_default();
                        picture.name =
                            attribute_value(event, b"name", reader.decoder())?.unwrap_or_default();
                        picture.alt_text =
                            attribute_value(event, b"descr", reader.decoder())?.unwrap_or_default();
                    } else if name == b"blip" {
                        if attribute_value(event, b"link", reader.decoder())?.is_some() {
                            picture.safe = false;
                        }
                        if attribute_value(event, b"embed", reader.decoder())?.is_some() {
                            picture.embedded_blip_count += 1;
                        }
                    }
                }
            }
            Event::Empty(ref event) => {
                if let Some(picture) = current.as_mut() {
                    let name = event.local_name();
                    let name = name.as_ref();
                    if name == b"cNvPr" {
                        picture.metadata_count += 1;
                        picture.metadata_tag_span =
                            Some(empty_tag_span(reader.buffer_position(), event)?);
                        picture.metadata_tag_name =
                            String::from_utf8_lossy(event.name().as_ref()).into_owned();
                        picture.metadata_attributes =
                            all_attributes(event, reader.decoder(), "C4C")?;
                        picture.id =
                            attribute_value(event, b"id", reader.decoder())?.unwrap_or_default();
                        picture.name =
                            attribute_value(event, b"name", reader.decoder())?.unwrap_or_default();
                        picture.alt_text =
                            attribute_value(event, b"descr", reader.decoder())?.unwrap_or_default();
                    } else if name == b"blip" {
                        if attribute_value(event, b"link", reader.decoder())?.is_some() {
                            picture.safe = false;
                        }
                        if attribute_value(event, b"embed", reader.decoder())?.is_some() {
                            picture.embedded_blip_count += 1;
                        }
                    }
                }
            }
            Event::End(ref event) => {
                if let Some(picture) = current.as_ref() {
                    if event.local_name().as_ref() == b"pic" && picture.depth == depth {
                        let picture = current.take().expect("picture exists");
                        if picture.safe
                            && picture.metadata_count == 1
                            && picture.embedded_blip_count == 1
                            && !picture.id.is_empty()
                            && picture.metadata_tag_span.is_some()
                        {
                            candidates.push(picture);
                        }
                    }
                }
                depth = depth.saturating_sub(1);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(candidates)
}

fn relationship_part(part_name: &str) -> Result<String, String> {
    let (directory, file_name) = part_name
        .rsplit_once('/')
        .ok_or("PPTX 幻灯片部件缺少父目录")?;
    Ok(format!("{directory}/_rels/{file_name}.rels"))
}

fn resolve_relationship_target(source_part: &str, target: &str) -> Result<String, String> {
    if target.contains('\\') || target.contains("://") || target.starts_with('/') {
        return Err("PPTX C4B 备注关系目标不安全".into());
    }
    let mut parts = source_part.split('/').collect::<Vec<_>>();
    parts.pop();
    for segment in target.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err("PPTX C4B 备注关系越界".into());
                }
            }
            value => parts.push(value),
        }
    }
    Ok(parts.join("/"))
}

fn notes_part_for_slide(source: &[u8], slide_part: &str) -> Result<Option<String>, String> {
    let rels_part = relationship_part(slide_part)?;
    let rels = match read_part(source, &rels_part) {
        Ok(bytes) => bytes,
        Err(error) if error.contains("缺失") => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut reader = Reader::from_reader(rels.as_slice());
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C4B 关系 XML 损坏: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"Relationship" =>
            {
                let relation_type =
                    attribute_value(event, b"Type", reader.decoder())?.unwrap_or_default();
                if relation_type.ends_with("/notesSlide") {
                    let target = attribute_value(event, b"Target", reader.decoder())?
                        .ok_or("PPTX C4B 备注关系缺少 Target")?;
                    return resolve_relationship_target(slide_part, &target).map(Some);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(None)
}

fn editable_targets_with_spans(
    source: &[u8],
) -> Result<(Vec<EditableTargetSpan>, Vec<EditableTargetSpan>), String> {
    let model = parse_pptx(source)?;
    let part_digests = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let mut text_targets = Vec::new();
    let mut notes_targets = Vec::new();

    for (slide_index, slide) in model.slides.iter().enumerate() {
        let slide_xml = read_part(source, &slide.part_name)?;
        let slide_part_digest = part_digests
            .get(&slide.part_name)
            .ok_or("PPTX C4B 幻灯片部件摘要缺失")?;
        for shape in scan_safe_text_shapes(&slide_xml)? {
            let (start, end) = shape.span.expect("safe shape span exists");
            let target = PptxEditableTextTarget {
                id: format!(
                    "pptx-text-{}-{}-{}",
                    slide_index + 1,
                    shape.id,
                    &digest(slide.part_name.as_bytes())[..10]
                ),
                kind: "slide-text".into(),
                slide_number: slide_index + 1,
                slide_id: slide.id.clone(),
                part_name: slide.part_name.clone(),
                object_id: shape.id,
                object_name: shape.name,
                expected_text_digest: digest(shape.text.as_bytes()),
                expected_part_digest: slide_part_digest.clone(),
                text: shape.text,
            };
            text_targets.push(EditableTargetSpan { target, start, end });
        }

        let Some(notes_part) = notes_part_for_slide(source, &slide.part_name)? else {
            continue;
        };
        let notes_xml = read_part(source, &notes_part)?;
        let candidates = scan_safe_text_shapes(&notes_xml)?;
        let body_candidates = candidates
            .iter()
            .filter(|shape| shape.placeholder_type.as_deref() == Some("body"))
            .collect::<Vec<_>>();
        let notes_shape = if body_candidates.len() == 1 {
            Some(body_candidates[0])
        } else if body_candidates.is_empty() && candidates.len() == 1 {
            candidates.first()
        } else {
            None
        };
        let Some(shape) = notes_shape else {
            continue;
        };
        let notes_part_digest = part_digests
            .get(&notes_part)
            .ok_or("PPTX C4B 备注部件摘要缺失")?;
        let (start, end) = shape.span.expect("safe notes span exists");
        let target = PptxEditableTextTarget {
            id: format!(
                "pptx-notes-{}-{}",
                slide_index + 1,
                &digest(notes_part.as_bytes())[..10]
            ),
            kind: "speaker-notes".into(),
            slide_number: slide_index + 1,
            slide_id: slide.id.clone(),
            part_name: notes_part,
            object_id: shape.id.clone(),
            object_name: shape.name.clone(),
            expected_text_digest: digest(shape.text.as_bytes()),
            expected_part_digest: notes_part_digest.clone(),
            text: shape.text.clone(),
        };
        notes_targets.push(EditableTargetSpan { target, start, end });
    }
    Ok((text_targets, notes_targets))
}

pub fn inspect_pptx_editable_text_targets(
    source: &[u8],
) -> Result<(Vec<PptxEditableTextTarget>, Vec<PptxEditableTextTarget>), String> {
    let (text, notes) = editable_targets_with_spans(source)?;
    Ok((
        text.into_iter().map(|target| target.target).collect(),
        notes.into_iter().map(|target| target.target).collect(),
    ))
}

fn editable_style_targets_with_spans(
    source: &[u8],
) -> Result<Vec<EditableStyleTargetSpan>, String> {
    let model = parse_pptx(source)?;
    let part_digests = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let mut targets = Vec::new();
    for (slide_index, slide) in model.slides.iter().enumerate() {
        let slide_xml = read_part(source, &slide.part_name)?;
        let part_digest = part_digests
            .get(&slide.part_name)
            .ok_or("PPTX C4C 幻灯片部件摘要缺失")?;
        for shape in scan_safe_text_shapes(&slide_xml)? {
            let Some(markup) = scan_safe_style_markup(&slide_xml, &shape)? else {
                continue;
            };
            let run_attributes = local_attribute_map(&markup.run_attributes)?;
            let paragraph_attributes = local_attribute_map(&markup.paragraph_attributes)?;
            let font_size_hundredth_points = match run_attributes.get("sz") {
                Some(value) => match value.parse::<u32>() {
                    Ok(value) if (100..=400_000).contains(&value) => Some(value),
                    _ => continue,
                },
                None => None,
            };
            let bold = match parse_ooxml_bool(run_attributes.get("b")) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let italic = match parse_ooxml_bool(run_attributes.get("i")) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let underline = match run_attributes
                .get("u")
                .map(String::as_str)
                .unwrap_or("none")
            {
                "sng" | "single" => true,
                "none" => false,
                _ => continue,
            };
            let alignment = match paragraph_attributes.get("algn").map(String::as_str) {
                None | Some("l") => "left",
                Some("ctr") => "center",
                Some("r") => "right",
                Some("just") => "justify",
                _ => continue,
            }
            .to_string();
            let font_family = markup
                .font_family
                .filter(|value| !value.trim().is_empty() && value.chars().count() <= 100);
            let color = markup.color.map(|value| value.to_ascii_uppercase());
            let expected_style_digest = style_digest(
                font_size_hundredth_points,
                font_family.as_deref(),
                color.as_deref(),
                bold,
                italic,
                underline,
                &alignment,
            );
            let id = format!(
                "pptx-style-{}-{}-{}",
                slide_index + 1,
                shape.id,
                &digest(slide.part_name.as_bytes())[..10]
            );
            let target = PptxEditableStyleTarget {
                id,
                kind: if shape.is_text_box {
                    "text-box-style".into()
                } else {
                    "shape-text-style".into()
                },
                slide_number: slide_index + 1,
                slide_id: slide.id.clone(),
                part_name: slide.part_name.clone(),
                object_id: shape.id,
                object_name: shape.name,
                text: shape.text,
                font_size_hundredth_points,
                font_family,
                color,
                bold,
                italic,
                underline,
                alignment,
                expected_style_digest,
                expected_part_digest: part_digest.clone(),
            };
            targets.push(EditableStyleTargetSpan {
                target,
                run_properties_span: markup
                    .run_properties_span
                    .map(|(start, end)| (shape.shape_start + start, shape.shape_start + end)),
                run_content_start: shape.shape_start + markup.run_content_start,
                paragraph_properties_span: markup
                    .paragraph_properties_span
                    .map(|(start, end)| (shape.shape_start + start, shape.shape_start + end)),
                paragraph_content_start: shape.shape_start + markup.paragraph_content_start,
                preserved_language: run_attributes.get("lang").cloned(),
                preserved_alt_language: run_attributes.get("altLang").cloned(),
                preserved_strike: run_attributes.get("strike").cloned(),
                preserve_effect_list: markup.preserve_effect_list,
                preserve_underline_fill_text: markup.preserve_underline_fill_text,
            });
        }
    }
    Ok(targets)
}

pub fn inspect_pptx_editable_style_targets(
    source: &[u8],
) -> Result<Vec<PptxEditableStyleTarget>, String> {
    Ok(editable_style_targets_with_spans(source)?
        .into_iter()
        .map(|target| target.target)
        .collect())
}

fn editable_alt_text_targets_with_spans(
    source: &[u8],
) -> Result<Vec<EditableAltTextTargetSpan>, String> {
    let model = parse_pptx(source)?;
    let part_digests = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let mut targets = Vec::new();
    for (slide_index, slide) in model.slides.iter().enumerate() {
        let slide_xml = read_part(source, &slide.part_name)?;
        let part_digest = part_digests
            .get(&slide.part_name)
            .ok_or("PPTX C4C 幻灯片部件摘要缺失")?;
        for picture in scan_safe_picture_metadata(&slide_xml)? {
            let metadata_tag_span = picture
                .metadata_tag_span
                .ok_or("PPTX C4C 图片元数据范围缺失")?;
            let expected_metadata_digest = digest(
                format!(
                    "id={}|name={}|descr={}",
                    picture.id, picture.name, picture.alt_text
                )
                .as_bytes(),
            );
            let target = PptxEditableAltTextTarget {
                id: format!(
                    "pptx-alt-{}-{}-{}",
                    slide_index + 1,
                    picture.id,
                    &digest(slide.part_name.as_bytes())[..10]
                ),
                kind: "picture-alt-text".into(),
                slide_number: slide_index + 1,
                slide_id: slide.id.clone(),
                part_name: slide.part_name.clone(),
                object_id: picture.id,
                object_name: picture.name,
                alt_text: picture.alt_text,
                expected_metadata_digest,
                expected_part_digest: part_digest.clone(),
            };
            targets.push(EditableAltTextTargetSpan {
                target,
                metadata_tag_span,
                metadata_tag_name: picture.metadata_tag_name,
                metadata_attributes: picture.metadata_attributes,
            });
        }
    }
    Ok(targets)
}

pub fn inspect_pptx_editable_alt_text_targets(
    source: &[u8],
) -> Result<Vec<PptxEditableAltTextTarget>, String> {
    Ok(editable_alt_text_targets_with_spans(source)?
        .into_iter()
        .map(|target| target.target)
        .collect())
}

fn editable_image_mime(part_name: &str) -> Option<&'static str> {
    match part_name.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        _ => None,
    }
}

fn valid_replacement_image(bytes: &[u8], mime_type: &str) -> bool {
    if bytes.is_empty() || bytes.len() > MAX_PPTX_REPLACEMENT_IMAGE_BYTES {
        return false;
    }
    match mime_type {
        "image/png" => bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => {
            bytes.len() >= 4
                && bytes.starts_with(&[0xff, 0xd8, 0xff])
                && bytes.ends_with(&[0xff, 0xd9])
        }
        _ => false,
    }
}

pub fn inspect_pptx_editable_image_targets(
    source: &[u8],
) -> Result<Vec<PptxEditableImageTarget>, String> {
    let model = parse_pptx(source)?;
    let mut reference_counts = BTreeMap::<String, usize>::new();
    for object in model.slides.iter().flat_map(|slide| slide.objects.iter()) {
        if let Some(part_name) = object.media_part.as_ref() {
            *reference_counts.entry(part_name.clone()).or_default() += 1;
        }
    }

    let mut targets = Vec::new();
    for (slide_index, slide) in model.slides.iter().enumerate() {
        for object in &slide.objects {
            let Some(part_name) = object.media_part.as_ref() else {
                continue;
            };
            let reference_count = reference_counts.get(part_name).copied().unwrap_or_default();
            let Some(mime_type) = editable_image_mime(part_name) else {
                continue;
            };
            if object.kind != "picture" || reference_count != 1 {
                continue;
            }
            let media = read_part(source, part_name)?;
            if !valid_replacement_image(&media, mime_type) {
                continue;
            }
            let media_digest = digest(&media);
            targets.push(PptxEditableImageTarget {
                id: format!(
                    "pptx-image-{}-{}-{}",
                    slide_index + 1,
                    object.id,
                    &digest(part_name.as_bytes())[..10]
                ),
                kind: "picture-binary".into(),
                slide_number: slide_index + 1,
                slide_id: slide.id.clone(),
                object_id: object.id.clone(),
                object_name: object.name.clone(),
                part_name: part_name.clone(),
                mime_type: mime_type.into(),
                source_bytes: media.len(),
                reference_count,
                expected_media_digest: media_digest.clone(),
                expected_part_digest: media_digest,
            });
        }
    }
    Ok(targets)
}

fn update_shape_lifecycle_scan(
    shape: &mut ShapeLifecycleScan,
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<(), String> {
    let name = event.local_name();
    match name.as_ref() {
        b"cNvPr" => {
            shape.object_id = attribute_value(event, b"id", decoder)?.unwrap_or_default();
            shape.object_name = attribute_value(event, b"name", decoder)?.unwrap_or_default();
        }
        b"cNvSpPr" => {
            shape.is_text_box = attribute_value(event, b"txBox", decoder)?.as_deref() == Some("1");
        }
        b"prstGeom" => {
            shape.shape_type = attribute_value(event, b"prst", decoder)?.unwrap_or_default();
        }
        b"custGeom" => shape.shape_type = "custom".into(),
        b"txBody" => shape.has_text_body = true,
        b"ph" => shape.has_placeholder = true,
        b"stCxn" | b"endCxn" => shape.has_connection = true,
        _ => {}
    }
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("PPTX C5B XML 属性损坏: {error}"))?;
        let key = attribute.key.as_ref();
        if matches!(key, b"r:id" | b"r:embed" | b"r:link") {
            shape.has_relationship = true;
        }
    }
    Ok(())
}

fn scan_slide_shape_lifecycle(xml: &[u8]) -> Result<SlideShapeScan, String> {
    let xml_text = std::str::from_utf8(xml).map_err(|_| "PPTX C5B 幻灯片 XML 必须是 UTF-8")?;
    if !xml_text.contains("xmlns:p=") || !xml_text.contains("xmlns:a=") {
        return Err("PPTX C5B 仅支持声明标准 p/a 命名空间前缀的幻灯片".into());
    }
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut sp_tree_depth = None;
    let mut insertion_offset = None;
    let mut current: Option<ShapeLifecycleScan> = None;
    let mut shapes = Vec::new();
    let mut object_ids = BTreeMap::<u32, usize>::new();

    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C5B 幻灯片 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                depth += 1;
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"cNvPr" {
                    let id = attribute_value(event, b"id", reader.decoder())?
                        .ok_or("PPTX C5B 对象缺少 cNvPr id")?
                        .parse::<u32>()
                        .map_err(|_| "PPTX C5B 只支持数值型 cNvPr id")?;
                    if object_ids.insert(id, 1).is_some() {
                        return Err(format!("PPTX C5B 幻灯片对象 id 重复: {id}"));
                    }
                }
                if name == b"spTree" {
                    if sp_tree_depth.replace(depth).is_some() {
                        return Err("PPTX C5B 幻灯片包含多个形状树".into());
                    }
                } else if current.is_none()
                    && sp_tree_depth.is_some_and(|tree_depth| depth == tree_depth + 1)
                    && matches!(name, b"sp" | b"cxnSp")
                {
                    let (start, _) = opening_tag_span(reader.buffer_position(), event)?;
                    current = Some(ShapeLifecycleScan {
                        root_name: String::from_utf8_lossy(name).into_owned(),
                        depth,
                        start,
                        ..Default::default()
                    });
                } else if let Some(shape) = current.as_mut() {
                    update_shape_lifecycle_scan(shape, event, reader.decoder())?;
                }
            }
            Event::Empty(ref event) => {
                let name = event.local_name();
                if name.as_ref() == b"cNvPr" {
                    let id = attribute_value(event, b"id", reader.decoder())?
                        .ok_or("PPTX C5B 对象缺少 cNvPr id")?
                        .parse::<u32>()
                        .map_err(|_| "PPTX C5B 只支持数值型 cNvPr id")?;
                    if object_ids.insert(id, 1).is_some() {
                        return Err(format!("PPTX C5B 幻灯片对象 id 重复: {id}"));
                    }
                }
                if let Some(shape) = current.as_mut() {
                    update_shape_lifecycle_scan(shape, event, reader.decoder())?;
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if current
                    .as_ref()
                    .is_some_and(|shape| shape.depth == depth && shape.root_name.as_bytes() == name)
                {
                    let mut shape = current.take().expect("shape exists");
                    shape.end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "PPTX C5B 形状范围超过平台上限")?;
                    shapes.push(shape);
                }
                if name == b"spTree" && sp_tree_depth == Some(depth) {
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "PPTX C5B 形状树范围超过平台上限")?;
                    let qualified_name_len = event.name().as_ref().len();
                    insertion_offset = Some(
                        end.checked_sub(qualified_name_len.saturating_add(3))
                            .ok_or("PPTX C5B 形状树结束范围无效")?,
                    );
                    sp_tree_depth = None;
                }
                depth = depth.saturating_sub(1);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if current.is_some() {
        return Err("PPTX C5B 形状节点未闭合".into());
    }
    let insertion_offset = insertion_offset.ok_or("PPTX C5B 幻灯片缺少形状树")?;
    let max_object_id = object_ids.keys().next_back().copied().unwrap_or(0);
    let next_object_id = max_object_id
        .checked_add(1)
        .ok_or("PPTX C5B 对象 id 已达到上限")?;
    Ok(SlideShapeScan {
        insertion_offset,
        next_object_id,
        shapes,
    })
}

fn editable_shape_targets_with_spans(
    source: &[u8],
) -> Result<(Vec<PptxEditableShapeSlide>, Vec<EditableShapeTargetSpan>), String> {
    let model = parse_pptx(source)?;
    let mut slides = Vec::new();
    let mut targets = Vec::new();
    for (slide_index, slide) in model.slides.iter().enumerate() {
        let xml = read_part(source, &slide.part_name)?;
        let scan = scan_slide_shape_lifecycle(&xml)?;
        let part_digest = digest(&xml);
        slides.push(PptxEditableShapeSlide {
            id: format!("pptx-shape-slide-{}-{}", slide_index + 1, slide.id),
            slide_number: slide_index + 1,
            slide_id: slide.id.clone(),
            part_name: slide.part_name.clone(),
            next_object_id: scan.next_object_id,
            expected_part_digest: part_digest.clone(),
        });
        for scanned in scan.shapes {
            let Some(object) = slide.objects.iter().find(|object| {
                object.id == scanned.object_id
                    && object.parent_group_id.is_none()
                    && object.group_level == 0
            }) else {
                continue;
            };
            if scanned.has_text_body
                || scanned.has_placeholder
                || scanned.has_relationship
                || scanned.has_connection
                || scanned.is_text_box
                || !matches!(scanned.shape_type.as_str(), "rect" | "ellipse" | "line")
                || !matches!(object.kind.as_str(), "shape" | "connector")
                || !object.text.is_empty()
                || object.media_part.is_some()
                || object.related_part.is_some()
                || object.child_count != 0
                || object.rotation.is_some_and(|value| value != 0)
                || object.flip_horizontal
                || object.flip_vertical
            {
                continue;
            }
            let (Some(x), Some(y), Some(width), Some(height)) =
                (object.x, object.y, object.width, object.height)
            else {
                continue;
            };
            if x < 0 || y < 0 || width <= 0 || height <= 0 {
                continue;
            }
            let shape_digest = digest(
                xml.get(scanned.start..scanned.end)
                    .ok_or("PPTX C5B 形状范围无效")?,
            );
            targets.push(EditableShapeTargetSpan {
                target: PptxEditableShapeTarget {
                    id: format!(
                        "pptx-shape-{}-{}-{}",
                        slide_index + 1,
                        object.id,
                        &shape_digest[..10]
                    ),
                    kind: "basic-shape-delete".into(),
                    slide_number: slide_index + 1,
                    slide_id: slide.id.clone(),
                    part_name: slide.part_name.clone(),
                    object_id: object.id.clone(),
                    object_name: object.name.clone(),
                    shape_type: scanned.shape_type,
                    x,
                    y,
                    width,
                    height,
                    expected_shape_digest: shape_digest,
                    expected_part_digest: part_digest.clone(),
                },
                start: scanned.start,
                end: scanned.end,
            });
        }
    }
    Ok((slides, targets))
}

pub fn inspect_pptx_editable_shape_targets(
    source: &[u8],
) -> Result<(Vec<PptxEditableShapeSlide>, Vec<PptxEditableShapeTarget>), String> {
    let (slides, targets) = editable_shape_targets_with_spans(source)?;
    Ok((
        slides,
        targets.into_iter().map(|target| target.target).collect(),
    ))
}

fn rewrite_package_part(
    source: &[u8],
    target_part: &str,
    replacement: &[u8],
) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 PPTX 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = false;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 PPTX 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if name == target_part {
            if replaced {
                return Err("PPTX C4B 目标部件重复".into());
            }
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(PPTX_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(target_part, options)
                .map_err(|error| format!("创建 PPTX C4B 目标部件失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 PPTX C4B 目标部件失败: {error}"))?;
            replaced = true;
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("原样复制未修改 PPTX 部件失败: {error}"))?;
        }
    }
    if !replaced {
        return Err(format!("PPTX C4B 目标部件缺失: {target_part}"));
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 PPTX C4B 隔离包失败: {error}"))
}

fn valid_replacement_text(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= MAX_PPTX_EDITABLE_TEXT_CHARS
        && !value.contains(['\r', '\n', '\t'])
        && value.chars().all(|character| {
            matches!(character, '\u{9}' | '\u{A}' | '\u{D}')
                || ('\u{20}'..='\u{D7FF}').contains(&character)
                || ('\u{E000}'..='\u{FFFD}').contains(&character)
                || ('\u{10000}'..='\u{10FFFF}').contains(&character)
        })
}

pub fn build_pptx_text_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_text_digest: &str,
    expected_part_digest: &str,
    replacement_text: &str,
) -> Result<(PptxIsolatedTextPatchReport, Vec<u8>), String> {
    if !valid_replacement_text(replacement_text) {
        return Err("PPTX C4B 替换文本必须为 1～32767 个安全单行字符".into());
    }
    let expected_text_digest = expected_text_digest.trim().to_ascii_lowercase();
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if expected_text_digest.len() != 64
        || expected_part_digest.len() != 64
        || !expected_text_digest
            .bytes()
            .chain(expected_part_digest.bytes())
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("PPTX C4B 目标摘要无效".into());
    }

    let (text_targets, notes_targets) = editable_targets_with_spans(source)?;
    let target = text_targets
        .into_iter()
        .chain(notes_targets)
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C4B 编辑目标不存在或不再安全")?;
    if target.target.expected_text_digest != expected_text_digest {
        return Err("PPTX C4B 目标文本已变化，请重新建立编辑基线".into());
    }
    if target.target.expected_part_digest != expected_part_digest {
        return Err("PPTX C4B 目标部件已变化，请重新建立编辑基线".into());
    }

    let target_xml = read_part(source, &target.target.part_name)?;
    let escaped = quick_xml::escape::escape(replacement_text).into_owned();
    let mut replacement_xml = Vec::with_capacity(
        target_xml.len() + escaped.len().saturating_sub(target.end - target.start),
    );
    replacement_xml.extend_from_slice(&target_xml[..target.start]);
    replacement_xml.extend_from_slice(escaped.as_bytes());
    replacement_xml.extend_from_slice(&target_xml[target.end..]);
    let output = rewrite_package_part(source, &target.target.part_name, &replacement_xml)?;

    let source_parts = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let output_parts = inspect_package_parts(&output)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    if source_parts.keys().ne(output_parts.keys()) {
        return Err("PPTX C4B 隔离补丁增加或删除了 OOXML 部件".into());
    }
    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, digest)| {
            (output_parts.get(name) != Some(digest)).then_some(name.clone())
        })
        .collect::<Vec<_>>();
    if changed_parts != [target.target.part_name.clone()] {
        return Err(format!(
            "PPTX C4B 差异白名单失败: {}",
            changed_parts.join(", ")
        ));
    }

    parse_pptx(&output).map_err(|error| format!("PPTX C4B 隔离输出结构复读失败: {error}"))?;
    let (reopened_text_targets, reopened_notes_targets) =
        inspect_pptx_editable_text_targets(&output)?;
    let semantic_reparse_verified = reopened_text_targets
        .into_iter()
        .chain(reopened_notes_targets)
        .any(|reopened| {
            reopened.id == target.target.id
                && reopened.part_name == target.target.part_name
                && reopened.text == replacement_text
        });
    if !semantic_reparse_verified {
        return Err("PPTX C4B 隔离输出语义复读失败".into());
    }
    let source_part_digest = source_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4B 源目标部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4B 输出目标部件摘要缺失")?;

    Ok((
        PptxIsolatedTextPatchReport {
            status: "isolated_text_patch_verified".into(),
            engine: "LongEdit C4B isolated PPTX text patch".into(),
            target_id: target.target.id,
            target_kind: target.target.kind,
            target_part: target.target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn apply_xml_replacements(
    xml: &[u8],
    mut replacements: Vec<(usize, usize, String)>,
) -> Result<Vec<u8>, String> {
    replacements.sort_by(|left, right| right.0.cmp(&left.0));
    let mut output = xml.to_vec();
    let mut previous_start = xml.len();
    for (start, end, replacement) in replacements {
        if start > end || end > previous_start || end > output.len() {
            return Err("PPTX C4C XML 补丁范围重叠或越界".into());
        }
        output.splice(start..end, replacement.bytes());
        previous_start = start;
    }
    Ok(output)
}

fn verify_isolated_part_change(
    source: &[u8],
    output: &[u8],
    target_part: &str,
) -> Result<
    (
        BTreeMap<String, String>,
        BTreeMap<String, String>,
        Vec<String>,
    ),
    String,
> {
    let source_parts = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let output_parts = inspect_package_parts(output)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    if source_parts.keys().ne(output_parts.keys()) {
        return Err("PPTX C4C 隔离补丁增加或删除了 OOXML 部件".into());
    }
    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, part_digest)| {
            (output_parts.get(name) != Some(part_digest)).then_some(name.clone())
        })
        .collect::<Vec<_>>();
    if changed_parts != [target_part.to_string()] {
        return Err(format!(
            "PPTX C4C 差异白名单失败: {}",
            changed_parts.join(", ")
        ));
    }
    Ok((source_parts, output_parts, changed_parts))
}

fn valid_font_family(value: &str) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= 100
        && value.chars().all(|character| {
            !character.is_control() && !matches!(character, '<' | '>' | '"' | '\'' | '&')
        })
}

fn valid_rgb_color(value: &str) -> bool {
    value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn style_run_properties_xml(
    target: &EditableStyleTargetSpan,
    font_size_hundredth_points: u32,
    font_family: &str,
    color: &str,
    bold: bool,
    italic: bool,
    underline: bool,
) -> String {
    let mut attributes = Vec::new();
    if let Some(value) = target.preserved_language.as_deref() {
        attributes.push(format!("lang=\"{}\"", quick_xml::escape::escape(value)));
    }
    if let Some(value) = target.preserved_alt_language.as_deref() {
        attributes.push(format!("altLang=\"{}\"", quick_xml::escape::escape(value)));
    }
    if let Some(value) = target.preserved_strike.as_deref() {
        attributes.push(format!("strike=\"{}\"", quick_xml::escape::escape(value)));
    }
    attributes.push(format!("sz=\"{font_size_hundredth_points}\""));
    attributes.push(format!("b=\"{}\"", u8::from(bold)));
    attributes.push(format!("i=\"{}\"", u8::from(italic)));
    attributes.push(format!("u=\"{}\"", if underline { "sng" } else { "none" }));
    let mut children = format!(
        "<a:solidFill><a:srgbClr val=\"{}\"/></a:solidFill>",
        color.to_ascii_uppercase()
    );
    if target.preserve_effect_list {
        children.push_str("<a:effectLst/>");
    }
    if target.preserve_underline_fill_text {
        children.push_str("<a:uFillTx/>");
    }
    children.push_str(&format!(
        "<a:latin typeface=\"{}\"/>",
        quick_xml::escape::escape(font_family.trim())
    ));
    format!("<a:rPr {}>{children}</a:rPr>", attributes.join(" "))
}

pub fn build_pptx_style_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_style_digest: &str,
    expected_part_digest: &str,
    font_size_hundredth_points: u32,
    font_family: &str,
    color: &str,
    bold: bool,
    italic: bool,
    underline: bool,
    alignment: &str,
) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String> {
    let expected_style_digest = expected_style_digest.trim().to_ascii_lowercase();
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_style_digest) || !valid_sha256(&expected_part_digest) {
        return Err("PPTX C4C 字符样式目标摘要无效".into());
    }
    if !(100..=400_000).contains(&font_size_hundredth_points) {
        return Err("PPTX C4C 字号必须位于 1～4000 pt".into());
    }
    if !valid_font_family(font_family) {
        return Err("PPTX C4C 字体名称必须为 1～100 个安全字符".into());
    }
    let color = color.trim().trim_start_matches('#').to_ascii_uppercase();
    if !valid_rgb_color(&color) {
        return Err("PPTX C4C 颜色必须为 6 位 RGB 十六进制值".into());
    }
    let alignment_value = match alignment {
        "left" => "l",
        "center" => "ctr",
        "right" => "r",
        "justify" => "just",
        _ => return Err("PPTX C4C 对齐方式不在安全白名单".into()),
    };

    let target = editable_style_targets_with_spans(source)?
        .into_iter()
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C4C 字符样式目标不存在或不再安全")?;
    if target.target.expected_style_digest != expected_style_digest {
        return Err("PPTX C4C 字符样式已变化，请重新建立编辑基线".into());
    }
    if target.target.expected_part_digest != expected_part_digest {
        return Err("PPTX C4C 字符样式部件已变化，请重新建立编辑基线".into());
    }
    let requested_style_digest = style_digest(
        Some(font_size_hundredth_points),
        Some(font_family.trim()),
        Some(&color),
        bold,
        italic,
        underline,
        alignment,
    );
    if requested_style_digest == target.target.expected_style_digest {
        return Err("PPTX C4C 字符样式没有变化".into());
    }

    let target_xml = read_part(source, &target.target.part_name)?;
    let run_properties = style_run_properties_xml(
        &target,
        font_size_hundredth_points,
        font_family,
        &color,
        bold,
        italic,
        underline,
    );
    let run_span = target
        .run_properties_span
        .unwrap_or((target.run_content_start, target.run_content_start));
    let paragraph_span = target.paragraph_properties_span.unwrap_or((
        target.paragraph_content_start,
        target.paragraph_content_start,
    ));
    let replacement_xml = apply_xml_replacements(
        &target_xml,
        vec![
            (run_span.0, run_span.1, run_properties),
            (
                paragraph_span.0,
                paragraph_span.1,
                format!("<a:pPr algn=\"{alignment_value}\"/>"),
            ),
        ],
    )?;
    let output = rewrite_package_part(source, &target.target.part_name, &replacement_xml)?;
    let (source_parts, output_parts, changed_parts) =
        verify_isolated_part_change(source, &output, &target.target.part_name)?;
    parse_pptx(&output).map_err(|error| format!("PPTX C4C 字符样式输出结构复读失败: {error}"))?;
    let semantic_reparse_verified = inspect_pptx_editable_style_targets(&output)?
        .into_iter()
        .any(|reopened| {
            reopened.id == target.target.id
                && reopened.part_name == target.target.part_name
                && reopened.text == target.target.text
                && reopened.font_size_hundredth_points == Some(font_size_hundredth_points)
                && reopened.font_family.as_deref() == Some(font_family.trim())
                && reopened.color.as_deref() == Some(color.as_str())
                && reopened.bold == bold
                && reopened.italic == italic
                && reopened.underline == underline
                && reopened.alignment == alignment
        });
    if !semantic_reparse_verified {
        return Err("PPTX C4C 字符样式输出语义复读失败".into());
    }
    let source_part_digest = source_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4C 源样式部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4C 输出样式部件摘要缺失")?;
    Ok((
        PptxIsolatedMetadataPatchReport {
            status: "isolated_style_patch_verified".into(),
            engine: "LongEdit C4C isolated PPTX character style patch".into(),
            operation: "character-style".into(),
            target_id: target.target.id,
            target_kind: target.target.kind,
            target_part: target.target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

fn valid_alt_text(value: &str) -> bool {
    value.chars().count() <= MAX_PPTX_ALT_TEXT_CHARS
        && value.chars().all(|character| {
            !character.is_control()
                && (('\u{20}'..='\u{D7FF}').contains(&character)
                    || ('\u{E000}'..='\u{FFFD}').contains(&character)
                    || ('\u{10000}'..='\u{10FFFF}').contains(&character))
        })
}

fn picture_metadata_tag_xml(
    target: &EditableAltTextTargetSpan,
    alt_text: &str,
    self_closing: bool,
) -> String {
    let mut attributes = target
        .metadata_attributes
        .iter()
        .filter(|(key, _)| key.rsplit(':').next().unwrap_or(key) != "descr")
        .cloned()
        .collect::<Vec<_>>();
    if !alt_text.is_empty() {
        attributes.push(("descr".into(), alt_text.into()));
    }
    let serialized = attributes
        .into_iter()
        .map(|(key, value)| format!("{key}=\"{}\"", quick_xml::escape::escape(value.as_str())))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "<{}{}{}",
        target.metadata_tag_name,
        if serialized.is_empty() {
            String::new()
        } else {
            format!(" {serialized}")
        },
        if self_closing { "/>" } else { ">" }
    )
}

pub fn build_pptx_alt_text_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_metadata_digest: &str,
    expected_part_digest: &str,
    alt_text: &str,
) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String> {
    let expected_metadata_digest = expected_metadata_digest.trim().to_ascii_lowercase();
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_metadata_digest) || !valid_sha256(&expected_part_digest) {
        return Err("PPTX C4C 图片替代文本目标摘要无效".into());
    }
    if !valid_alt_text(alt_text) {
        return Err("PPTX C4C 图片替代文本必须不超过 1024 个安全字符".into());
    }
    let target = editable_alt_text_targets_with_spans(source)?
        .into_iter()
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C4C 图片替代文本目标不存在或不再安全")?;
    if target.target.expected_metadata_digest != expected_metadata_digest {
        return Err("PPTX C4C 图片元数据已变化，请重新建立编辑基线".into());
    }
    if target.target.expected_part_digest != expected_part_digest {
        return Err("PPTX C4C 图片元数据部件已变化，请重新建立编辑基线".into());
    }
    if target.target.alt_text == alt_text {
        return Err("PPTX C4C 图片替代文本没有变化".into());
    }
    let target_xml = read_part(source, &target.target.part_name)?;
    let (start, end) = target.metadata_tag_span;
    let self_closing = target_xml
        .get(start..end)
        .is_some_and(|tag| tag.ends_with(b"/>"));
    let metadata_tag = picture_metadata_tag_xml(&target, alt_text, self_closing);
    let replacement_xml = apply_xml_replacements(&target_xml, vec![(start, end, metadata_tag)])?;
    let output = rewrite_package_part(source, &target.target.part_name, &replacement_xml)?;
    let (source_parts, output_parts, changed_parts) =
        verify_isolated_part_change(source, &output, &target.target.part_name)?;
    parse_pptx(&output)
        .map_err(|error| format!("PPTX C4C 图片替代文本输出结构复读失败: {error}"))?;
    let semantic_reparse_verified = inspect_pptx_editable_alt_text_targets(&output)?
        .into_iter()
        .any(|reopened| {
            reopened.id == target.target.id
                && reopened.part_name == target.target.part_name
                && reopened.object_name == target.target.object_name
                && reopened.alt_text == alt_text
        });
    if !semantic_reparse_verified {
        return Err("PPTX C4C 图片替代文本输出语义复读失败".into());
    }
    let source_part_digest = source_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4C 源图片元数据部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C4C 输出图片元数据部件摘要缺失")?;
    Ok((
        PptxIsolatedMetadataPatchReport {
            status: "isolated_alt_text_patch_verified".into(),
            engine: "LongEdit C4C isolated PPTX picture alt-text patch".into(),
            operation: "picture-alt-text".into(),
            target_id: target.target.id,
            target_kind: target.target.kind,
            target_part: target.target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

pub fn build_pptx_image_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_media_digest: &str,
    expected_part_digest: &str,
    replacement_mime_type: &str,
    replacement: &[u8],
) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String> {
    let expected_media_digest = expected_media_digest.trim().to_ascii_lowercase();
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_media_digest) || !valid_sha256(&expected_part_digest) {
        return Err("PPTX C5A 图片目标摘要无效".into());
    }
    let target = inspect_pptx_editable_image_targets(source)?
        .into_iter()
        .find(|target| target.id == target_id)
        .ok_or("PPTX C5A 图片目标不存在、被共享或不再安全")?;
    if target.expected_media_digest != expected_media_digest
        || target.expected_part_digest != expected_part_digest
    {
        return Err("PPTX C5A 图片部件已变化，请重新建立编辑基线".into());
    }
    if replacement_mime_type != target.mime_type {
        return Err("PPTX C5A 只允许使用与原图片相同的 PNG/JPEG 格式".into());
    }
    if !valid_replacement_image(replacement, replacement_mime_type) {
        return Err("PPTX C5A 替换图片必须是 1～8 MiB 内的有效 PNG/JPEG".into());
    }
    if digest(replacement) == target.expected_media_digest {
        return Err("PPTX C5A 替换图片与原图片相同".into());
    }

    let output = rewrite_package_part(source, &target.part_name, replacement)?;
    let (source_parts, output_parts, changed_parts) =
        verify_isolated_part_change(source, &output, &target.part_name)?;
    parse_pptx(&output).map_err(|error| format!("PPTX C5A 图片替换输出结构复读失败: {error}"))?;
    let replacement_digest = digest(replacement);
    let semantic_reparse_verified = inspect_pptx_editable_image_targets(&output)?
        .into_iter()
        .any(|reopened| {
            reopened.id == target.id
                && reopened.part_name == target.part_name
                && reopened.mime_type == target.mime_type
                && reopened.reference_count == 1
                && reopened.expected_media_digest == replacement_digest
        });
    if !semantic_reparse_verified {
        return Err("PPTX C5A 图片替换输出语义复读失败".into());
    }
    let source_part_digest = source_parts
        .get(&target.part_name)
        .cloned()
        .ok_or("PPTX C5A 源图片部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.part_name)
        .cloned()
        .ok_or("PPTX C5A 输出图片部件摘要缺失")?;

    Ok((
        PptxIsolatedMetadataPatchReport {
            status: "isolated_image_patch_verified".into(),
            engine: "LongEdit C5A isolated PPTX picture binary patch".into(),
            operation: "picture-binary".into(),
            target_id: target.id,
            target_kind: target.kind,
            target_part: target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

fn valid_shape_color(value: &str) -> bool {
    value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn shape_preset(shape_type: &str) -> Option<(&'static str, &'static str)> {
    match shape_type {
        "rectangle" => Some(("rect", "Rectangle")),
        "ellipse" => Some(("ellipse", "Ellipse")),
        "line" => Some(("line", "Line")),
        _ => None,
    }
}

fn validate_shape_geometry(
    presentation_width: i64,
    presentation_height: i64,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    line_width: i64,
) -> Result<(), String> {
    if x < 0
        || y < 0
        || width <= 0
        || height <= 0
        || x.checked_add(width)
            .is_none_or(|right| right > presentation_width)
        || y.checked_add(height)
            .is_none_or(|bottom| bottom > presentation_height)
    {
        return Err("PPTX C5B 形状必须完整位于幻灯片范围内".into());
    }
    if !(12_700..=254_000).contains(&line_width) {
        return Err("PPTX C5B 描边宽度必须在 1～20 pt 之间".into());
    }
    Ok(())
}

fn build_basic_shape_xml(
    object_id: u32,
    shape_type: &str,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    fill_color: &str,
    line_color: &str,
    line_width: i64,
) -> Result<(String, String, String), String> {
    let (preset, label) = shape_preset(shape_type).ok_or("PPTX C5B 只允许矩形、椭圆和线条")?;
    let fill_color = fill_color.trim().to_ascii_uppercase();
    let line_color = line_color.trim().to_ascii_uppercase();
    if !valid_shape_color(&fill_color) || !valid_shape_color(&line_color) {
        return Err("PPTX C5B 填充和描边颜色必须是 6 位十六进制颜色".into());
    }
    let name = format!("LongEdit {label} {object_id}");
    let fill = if preset == "line" {
        "<a:noFill/>".to_string()
    } else {
        format!("<a:solidFill><a:srgbClr val=\"{fill_color}\"/></a:solidFill>")
    };
    let xml = format!(
        "<p:sp><p:nvSpPr><p:cNvPr id=\"{object_id}\" name=\"{name}\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"{x}\" y=\"{y}\"/><a:ext cx=\"{width}\" cy=\"{height}\"/></a:xfrm><a:prstGeom prst=\"{preset}\"><a:avLst/></a:prstGeom>{fill}<a:ln w=\"{line_width}\"><a:solidFill><a:srgbClr val=\"{line_color}\"/></a:solidFill></a:ln></p:spPr></p:sp>"
    );
    Ok((xml, name, preset.into()))
}

#[allow(clippy::too_many_arguments)]
pub fn build_pptx_shape_add_isolated(
    source: &[u8],
    slide_target_id: &str,
    expected_part_digest: &str,
    shape_type: &str,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    fill_color: &str,
    line_color: &str,
    line_width: i64,
) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String> {
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_part_digest) {
        return Err("PPTX C5B 幻灯片部件摘要无效".into());
    }
    let model = parse_pptx(source)?;
    let (slides, _) = inspect_pptx_editable_shape_targets(source)?;
    let target = slides
        .into_iter()
        .find(|target| target.id == slide_target_id)
        .ok_or("PPTX C5B 幻灯片新增目标不存在")?;
    if target.expected_part_digest != expected_part_digest {
        return Err("PPTX C5B 幻灯片已变化，请重新建立编辑基线".into());
    }
    validate_shape_geometry(model.width, model.height, x, y, width, height, line_width)?;
    let source_part = read_part(source, &target.part_name)?;
    let scan = scan_slide_shape_lifecycle(&source_part)?;
    if scan.next_object_id != target.next_object_id {
        return Err("PPTX C5B 下一对象 id 已变化，请重新建立编辑基线".into());
    }
    let (shape_xml, object_name, preset) = build_basic_shape_xml(
        target.next_object_id,
        shape_type,
        x,
        y,
        width,
        height,
        fill_color,
        line_color,
        line_width,
    )?;
    let mut replacement = Vec::with_capacity(source_part.len() + shape_xml.len());
    replacement.extend_from_slice(&source_part[..scan.insertion_offset]);
    replacement.extend_from_slice(shape_xml.as_bytes());
    replacement.extend_from_slice(&source_part[scan.insertion_offset..]);

    let output = rewrite_package_part(source, &target.part_name, &replacement)?;
    let (source_parts, output_parts, changed_parts) =
        verify_isolated_part_change(source, &output, &target.part_name)?;
    let reopened = parse_pptx(&output)
        .map_err(|error| format!("PPTX C5B 形状新增输出结构复读失败: {error}"))?;
    let object_id = target.next_object_id.to_string();
    let expected_fill = format!("#{}", fill_color.trim().to_ascii_uppercase());
    let expected_line = format!("#{}", line_color.trim().to_ascii_uppercase());
    let reopened_object = reopened
        .slides
        .get(target.slide_number.saturating_sub(1))
        .and_then(|slide| slide.objects.iter().find(|object| object.id == object_id));
    let semantic_reparse_verified = reopened_object.is_some_and(|object| {
        object.name == object_name
            && object.shape_type.as_deref() == Some(preset.as_str())
            && object.x == Some(x)
            && object.y == Some(y)
            && object.width == Some(width)
            && object.height == Some(height)
            && object.line_color.as_deref() == Some(expected_line.as_str())
            && object.line_width == Some(line_width)
            && if preset == "line" {
                object.kind == "connector" && object.no_fill
            } else {
                object.kind == "shape"
                    && object.fill_color.as_deref() == Some(expected_fill.as_str())
            }
    });
    if !semantic_reparse_verified {
        return Err(format!(
            "PPTX C5B 形状新增输出语义复读失败: {:?}",
            reopened_object
        ));
    }
    let source_part_digest = source_parts
        .get(&target.part_name)
        .cloned()
        .ok_or("PPTX C5B 源幻灯片部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.part_name)
        .cloned()
        .ok_or("PPTX C5B 输出幻灯片部件摘要缺失")?;
    Ok((
        PptxIsolatedMetadataPatchReport {
            status: "isolated_shape_add_verified".into(),
            engine: "LongEdit C5B isolated PPTX basic-shape add".into(),
            operation: "basic-shape-add".into(),
            target_id: target.id,
            target_kind: shape_type.into(),
            target_part: target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

pub fn build_pptx_shape_delete_isolated(
    source: &[u8],
    target_id: &str,
    expected_shape_digest: &str,
    expected_part_digest: &str,
) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String> {
    let expected_shape_digest = expected_shape_digest.trim().to_ascii_lowercase();
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_shape_digest) || !valid_sha256(&expected_part_digest) {
        return Err("PPTX C5B 形状删除目标摘要无效".into());
    }
    let (_, targets) = editable_shape_targets_with_spans(source)?;
    let target = targets
        .into_iter()
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C5B 形状删除目标不存在或不再安全")?;
    if target.target.expected_shape_digest != expected_shape_digest
        || target.target.expected_part_digest != expected_part_digest
    {
        return Err("PPTX C5B 形状或幻灯片已变化，请重新建立编辑基线".into());
    }
    let source_part = read_part(source, &target.target.part_name)?;
    if digest(
        source_part
            .get(target.start..target.end)
            .ok_or("PPTX C5B 形状删除范围无效")?,
    ) != expected_shape_digest
    {
        return Err("PPTX C5B 形状删除范围摘要不一致".into());
    }
    let mut replacement = Vec::with_capacity(source_part.len() - (target.end - target.start));
    replacement.extend_from_slice(&source_part[..target.start]);
    replacement.extend_from_slice(&source_part[target.end..]);
    let output = rewrite_package_part(source, &target.target.part_name, &replacement)?;
    let (source_parts, output_parts, changed_parts) =
        verify_isolated_part_change(source, &output, &target.target.part_name)?;
    let reopened = parse_pptx(&output)
        .map_err(|error| format!("PPTX C5B 形状删除输出结构复读失败: {error}"))?;
    let semantic_reparse_verified = reopened
        .slides
        .get(target.target.slide_number.saturating_sub(1))
        .is_some_and(|slide| {
            !slide
                .objects
                .iter()
                .any(|object| object.id == target.target.object_id)
        });
    if !semantic_reparse_verified {
        return Err("PPTX C5B 形状删除输出语义复读失败".into());
    }
    let source_part_digest = source_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C5B 源幻灯片部件摘要缺失")?;
    let output_part_digest = output_parts
        .get(&target.target.part_name)
        .cloned()
        .ok_or("PPTX C5B 输出幻灯片部件摘要缺失")?;
    Ok((
        PptxIsolatedMetadataPatchReport {
            status: "isolated_shape_delete_verified".into(),
            engine: "LongEdit C5B isolated PPTX basic-shape delete".into(),
            operation: "basic-shape-delete".into(),
            target_id: target.target.id,
            target_kind: target.target.shape_type,
            target_part: target.target.part_name,
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
        },
        output,
    ))
}

fn attribute_value_exact(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("PPTX C5C XML 属性损坏: {error}"))?;
        if attribute.key.as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("PPTX C5C XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn end_tag_start(
    buffer_position: u64,
    event: &quick_xml::events::BytesEnd<'_>,
) -> Result<usize, String> {
    let end = usize::try_from(buffer_position).map_err(|_| "PPTX C5C XML 范围超出平台上限")?;
    end.checked_sub(event.name().as_ref().len().saturating_add(3))
        .ok_or_else(|| "PPTX C5C XML 结束标签范围无效".into())
}

fn scan_slide_id_list(xml: &[u8]) -> Result<XmlListScan<SlideIdEntry>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut in_list = false;
    let mut entries = Vec::new();
    let mut insertion_offset = None;
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C5C presentation.xml 损坏: {error}"))?
        {
            Event::Start(event) if event.local_name().as_ref() == b"sldIdLst" => {
                if in_list {
                    return Err("PPTX C5C 检测到嵌套的幻灯片顺序列表".into());
                }
                in_list = true;
            }
            Event::Empty(event) if in_list && event.local_name().as_ref() == b"sldId" => {
                let slide_id = attribute_value_exact(&event, b"id", reader.decoder())?
                    .ok_or("PPTX C5C 幻灯片缺少 id")?;
                let relationship_id = attribute_value_exact(&event, b"r:id", reader.decoder())?
                    .ok_or("PPTX C5C 幻灯片缺少 r:id")?;
                let hidden = attribute_value_exact(&event, b"show", reader.decoder())?
                    .is_some_and(|value| value == "0" || value.eq_ignore_ascii_case("false"));
                let (start, end) = empty_tag_span(reader.buffer_position(), &event)?;
                entries.push(SlideIdEntry {
                    slide_id,
                    relationship_id,
                    hidden,
                    start,
                    end,
                });
            }
            Event::Start(event) if in_list && event.local_name().as_ref() == b"sldId" => {
                return Err("PPTX C5C 不支持非空的 p:sldId 元素".into());
            }
            Event::End(event) if event.local_name().as_ref() == b"sldIdLst" => {
                if !in_list || insertion_offset.is_some() {
                    return Err("PPTX C5C 幻灯片顺序列表边界无效".into());
                }
                insertion_offset = Some(end_tag_start(reader.buffer_position(), &event)?);
                in_list = false;
            }
            Event::Eof => break,
            _ => {}
        }
    }
    let insertion_offset = insertion_offset.ok_or("PPTX C5C presentation.xml 缺少 p:sldIdLst")?;
    if entries.is_empty() {
        return Err("PPTX C5C 演示文稿至少需要一张幻灯片".into());
    }
    let mut slide_ids = BTreeSet::new();
    let mut relationship_ids = BTreeSet::new();
    for entry in &entries {
        if entry.slide_id.parse::<u32>().is_err()
            || !slide_ids.insert(entry.slide_id.clone())
            || !relationship_ids.insert(entry.relationship_id.clone())
        {
            return Err("PPTX C5C 幻灯片 id 或关系 id 无效/重复".into());
        }
    }
    Ok(XmlListScan {
        entries,
        insertion_offset,
    })
}

fn scan_relationship_list(xml: &[u8]) -> Result<XmlListScan<RelationshipEntry>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut entries = Vec::new();
    let mut insertion_offset = None;
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C5C 关系 XML 损坏: {error}"))?
        {
            Event::Empty(event) if event.local_name().as_ref() == b"Relationship" => {
                let id = attribute_value_exact(&event, b"Id", reader.decoder())?
                    .ok_or("PPTX C5C 关系缺少 Id")?;
                let relation_type = attribute_value_exact(&event, b"Type", reader.decoder())?
                    .ok_or("PPTX C5C 关系缺少 Type")?;
                let target = attribute_value_exact(&event, b"Target", reader.decoder())?
                    .ok_or("PPTX C5C 关系缺少 Target")?;
                let target_mode = attribute_value_exact(&event, b"TargetMode", reader.decoder())?;
                let (start, end) = empty_tag_span(reader.buffer_position(), &event)?;
                entries.push(RelationshipEntry {
                    id,
                    relation_type,
                    target,
                    target_mode,
                    start,
                    end,
                });
            }
            Event::Start(event) if event.local_name().as_ref() == b"Relationship" => {
                return Err("PPTX C5C 不支持非空 Relationship 元素".into());
            }
            Event::End(event) if event.local_name().as_ref() == b"Relationships" => {
                insertion_offset = Some(end_tag_start(reader.buffer_position(), &event)?);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    let insertion_offset = insertion_offset.ok_or("PPTX C5C 关系 XML 缺少 Relationships 根元素")?;
    let mut ids = BTreeSet::new();
    if entries.iter().any(|entry| !ids.insert(entry.id.clone())) {
        return Err("PPTX C5C 关系 XML 包含重复 Id".into());
    }
    Ok(XmlListScan {
        entries,
        insertion_offset,
    })
}

fn scan_content_type_overrides(xml: &[u8]) -> Result<XmlListScan<OverrideEntry>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut entries = Vec::new();
    let mut insertion_offset = None;
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("PPTX C5C [Content_Types].xml 损坏: {error}"))?
        {
            Event::Empty(event) if event.local_name().as_ref() == b"Override" => {
                let part_name = attribute_value_exact(&event, b"PartName", reader.decoder())?
                    .ok_or("PPTX C5C 内容类型覆盖缺少 PartName")?;
                let (start, end) = empty_tag_span(reader.buffer_position(), &event)?;
                entries.push(OverrideEntry {
                    part_name,
                    start,
                    end,
                });
            }
            Event::Start(event) if event.local_name().as_ref() == b"Override" => {
                return Err("PPTX C5C 不支持非空 Override 元素".into());
            }
            Event::End(event) if event.local_name().as_ref() == b"Types" => {
                insertion_offset = Some(end_tag_start(reader.buffer_position(), &event)?);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    let insertion_offset =
        insertion_offset.ok_or("PPTX C5C [Content_Types].xml 缺少 Types 根元素")?;
    let mut names = BTreeSet::new();
    if entries
        .iter()
        .any(|entry| !names.insert(entry.part_name.clone()))
    {
        return Err("PPTX C5C 内容类型覆盖包含重复 PartName".into());
    }
    Ok(XmlListScan {
        entries,
        insertion_offset,
    })
}

fn xml_attribute(value: &str) -> String {
    quick_xml::escape::escape(value).into_owned()
}

fn relationship_xml(
    id: &str,
    relation_type: &str,
    target: &str,
    target_mode: Option<&str>,
) -> String {
    let target_mode = target_mode
        .map(|value| format!(" TargetMode=\"{}\"", xml_attribute(value)))
        .unwrap_or_default();
    format!(
        "<Relationship Id=\"{}\" Type=\"{}\" Target=\"{}\"{target_mode}/>",
        xml_attribute(id),
        xml_attribute(relation_type),
        xml_attribute(target)
    )
}

fn splice_xml(xml: &[u8], replacements: Vec<(usize, usize, String)>) -> Result<Vec<u8>, String> {
    apply_xml_replacements(xml, replacements)
        .map_err(|error| format!("PPTX C5C XML 补丁失败: {error}"))
}

fn relationship_part_source(part_name: &str) -> Option<String> {
    let (parent, file) = part_name.rsplit_once("/_rels/")?;
    let file = file.strip_suffix(".rels")?;
    Some(format!("{parent}/{file}"))
}

fn resolve_relative_part(base_part: &str, target: &str) -> Option<String> {
    if target.contains('\\') || target.contains(':') || target.starts_with("//") {
        return None;
    }
    let mut segments = if target.starts_with('/') {
        Vec::new()
    } else {
        base_part
            .rsplit_once('/')
            .map(|(parent, _)| parent.split('/').collect::<Vec<_>>())
            .unwrap_or_default()
    };
    for segment in target.trim_start_matches('/').split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop()?;
            }
            value => segments.push(value),
        }
    }
    Some(segments.join("/"))
}

fn next_numbered_part(
    parts: &BTreeSet<String>,
    prefix: &str,
    suffix: &str,
) -> Result<(u32, String), String> {
    let maximum = parts
        .iter()
        .filter_map(|name| {
            name.strip_prefix(prefix)
                .and_then(|value| value.strip_suffix(suffix))
                .and_then(|value| value.parse::<u32>().ok())
        })
        .max()
        .unwrap_or(0);
    let next = maximum
        .checked_add(1)
        .ok_or("PPTX C5C 部件编号已达到上限")?;
    let part_name = format!("{prefix}{next}{suffix}");
    if parts.contains(&part_name) {
        return Err("PPTX C5C 新部件名称冲突".into());
    }
    Ok((next, part_name))
}

fn next_relationship_id(entries: &[RelationshipEntry]) -> Result<String, String> {
    let maximum = entries
        .iter()
        .filter_map(|entry| entry.id.strip_prefix("rId")?.parse::<u32>().ok())
        .max()
        .unwrap_or(0);
    let next = maximum
        .checked_add(1)
        .ok_or("PPTX C5C 关系编号已达到上限")?;
    let id = format!("rId{next}");
    if entries.iter().any(|entry| entry.id == id) {
        return Err("PPTX C5C 新关系 Id 冲突".into());
    }
    Ok(id)
}

fn next_slide_id(entries: &[SlideIdEntry]) -> Result<String, String> {
    entries
        .iter()
        .map(|entry| entry.slide_id.parse::<u32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "PPTX C5C 幻灯片 id 不是数字".to_string())?
        .into_iter()
        .max()
        .unwrap_or(255)
        .max(255)
        .checked_add(1)
        .map(|value| value.to_string())
        .ok_or_else(|| "PPTX C5C 幻灯片 id 已达到上限".into())
}

fn rewrite_package(source: &[u8], mutation: &PackageMutation) -> Result<Vec<u8>, String> {
    if mutation
        .replacements
        .keys()
        .any(|name| mutation.removals.contains(name) || mutation.additions.contains_key(name))
        || mutation
            .additions
            .keys()
            .any(|name| mutation.removals.contains(name))
    {
        return Err("PPTX C5C 包事务包含冲突的部件操作".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 PPTX C5C 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = BTreeSet::new();
    let mut removed = BTreeSet::new();
    let mut existing = BTreeSet::new();
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 PPTX C5C 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if !existing.insert(name.clone()) {
            return Err(format!("PPTX C5C 原始包包含重复部件: {name}"));
        }
        if mutation.additions.contains_key(&name) {
            return Err(format!("PPTX C5C 新增部件已存在: {name}"));
        }
        if mutation.removals.contains(&name) {
            removed.insert(name);
            continue;
        }
        if let Some(replacement) = mutation.replacements.get(&name) {
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(PPTX_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(&name, options)
                .map_err(|error| format!("创建 PPTX C5C 替换部件 {name} 失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 PPTX C5C 替换部件 {name} 失败: {error}"))?;
            replaced.insert(name);
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("原样复制未修改 PPTX 部件失败: {error}"))?;
        }
    }
    if replaced.len() != mutation.replacements.len() || removed.len() != mutation.removals.len() {
        return Err("PPTX C5C 替换或删除目标部件缺失".into());
    }
    for (name, bytes) in &mutation.additions {
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .compression_level(Some(PPTX_PATCH_DEFLATE_LEVEL));
        writer
            .start_file(name, options)
            .map_err(|error| format!("创建 PPTX C5C 新部件 {name} 失败: {error}"))?;
        writer
            .write_all(bytes)
            .map_err(|error| format!("写入 PPTX C5C 新部件 {name} 失败: {error}"))?;
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 PPTX C5C 包事务失败: {error}"))
}

fn verify_package_mutation(
    source: &[u8],
    output: &[u8],
    mutation: &PackageMutation,
) -> Result<(Vec<String>, Vec<String>, Vec<String>, usize), String> {
    let source_parts = inspect_package_parts(source)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let output_parts = inspect_package_parts(output)?
        .into_iter()
        .map(|part| (part.part_name, part.digest))
        .collect::<BTreeMap<_, _>>();
    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, source_digest)| {
            output_parts
                .get(name)
                .is_some_and(|output_digest| output_digest != source_digest)
                .then_some(name.clone())
        })
        .collect::<Vec<_>>();
    let added_parts = output_parts
        .keys()
        .filter(|name| !source_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    let removed_parts = source_parts
        .keys()
        .filter(|name| !output_parts.contains_key(*name))
        .cloned()
        .collect::<Vec<_>>();
    if changed_parts.iter().cloned().collect::<BTreeSet<_>>()
        != mutation.replacements.keys().cloned().collect()
        || added_parts.iter().cloned().collect::<BTreeSet<_>>()
            != mutation.additions.keys().cloned().collect()
        || removed_parts.iter().cloned().collect::<BTreeSet<_>>() != mutation.removals
    {
        return Err(format!(
            "PPTX C5C 包差异白名单失败: changed=[{}], added=[{}], removed=[{}]",
            changed_parts.join(", "),
            added_parts.join(", "),
            removed_parts.join(", ")
        ));
    }
    let unchanged_part_count = source_parts
        .iter()
        .filter(|(name, source_digest)| output_parts.get(*name) == Some(*source_digest))
        .count();
    Ok((
        changed_parts,
        added_parts,
        removed_parts,
        unchanged_part_count,
    ))
}

fn inspect_pptx_slide_targets_internal(
    source: &[u8],
) -> Result<Vec<SlideLifecycleTargetInternal>, String> {
    let model = parse_pptx(source)?;
    let presentation = read_part(source, "ppt/presentation.xml")?;
    let presentation_relationships = read_part(source, "ppt/_rels/presentation.xml.rels")?;
    let slide_list = scan_slide_id_list(&presentation)?;
    let relationship_list = scan_relationship_list(&presentation_relationships)?;
    if slide_list.entries.len() != model.slides.len() {
        return Err("PPTX C5C 幻灯片顺序与结构化复读数量不一致".into());
    }
    let relationship_by_id = relationship_list
        .entries
        .iter()
        .map(|entry| (entry.id.as_str(), entry))
        .collect::<BTreeMap<_, _>>();
    let package_parts = inspect_package_parts(source)?;
    let part_names = package_parts
        .iter()
        .map(|part| part.part_name.clone())
        .collect::<BTreeSet<_>>();
    let content_types = read_part(source, "[Content_Types].xml")?;
    let content_type_list = scan_content_type_overrides(&content_types)?;
    let override_names = content_type_list
        .entries
        .iter()
        .map(|entry| entry.part_name.trim_start_matches('/').to_string())
        .collect::<BTreeSet<_>>();
    let presentation_digest = digest(&presentation);
    let relationships_digest = digest(&presentation_relationships);

    let relationship_parts = part_names
        .iter()
        .filter(|name| name.ends_with(".rels"))
        .filter_map(|name| {
            relationship_part_source(name).map(|source_part| (name.clone(), source_part))
        })
        .collect::<Vec<_>>();
    let mut targets = Vec::with_capacity(slide_list.entries.len());
    for (index, entry) in slide_list.entries.iter().enumerate() {
        let mut blockers = Vec::new();
        let presentation_relation = relationship_by_id
            .get(entry.relationship_id.as_str())
            .ok_or_else(|| format!("PPTX C5C 幻灯片关系缺失: {}", entry.relationship_id))?;
        if !presentation_relation.relation_type.ends_with("/slide")
            || presentation_relation.target_mode.is_some()
        {
            return Err("PPTX C5C 幻灯片顺序引用了非内部 slide 关系".into());
        }
        let part_name =
            resolve_relative_part("ppt/presentation.xml", &presentation_relation.target)
                .ok_or("PPTX C5C 幻灯片目标路径无效")?;
        let slide = model.slides.get(index).ok_or("PPTX C5C 结构化幻灯片缺失")?;
        if slide.id != entry.slide_id || slide.part_name != part_name {
            return Err("PPTX C5C 幻灯片身份与结构化复读不一致".into());
        }
        let slide_bytes = read_part(source, &part_name)?;
        let slide_relationship_part = relationship_part(&part_name)?;
        let slide_relationship_bytes = read_part(source, &slide_relationship_part)?;
        let slide_relationships = scan_relationship_list(&slide_relationship_bytes)?;
        let mut layout_target = None;
        let mut notes_part = None;
        for relation in &slide_relationships.entries {
            if relation.target_mode.is_some() {
                blockers.push(format!("外部关系 {}", relation.id));
                continue;
            }
            if relation.relation_type.ends_with("/slideLayout") {
                if layout_target.replace(relation.target.clone()).is_some() {
                    blockers.push("多个版式关系".into());
                }
            } else if relation.relation_type.ends_with("/notesSlide") {
                let resolved = resolve_relative_part(&part_name, &relation.target)
                    .ok_or("PPTX C5C 备注目标路径无效")?;
                if notes_part.replace(resolved).is_some() {
                    blockers.push("多个备注关系".into());
                }
            } else if !relation.relation_type.ends_with("/image") {
                blockers.push(format!("非白名单关系 {}", relation.relation_type));
            }
        }
        let layout_target = layout_target.ok_or("PPTX C5C 幻灯片缺少版式关系")?;
        let notes_relationship_part = notes_part
            .as_ref()
            .map(|part| relationship_part(part))
            .transpose()?;
        if !override_names.contains(&part_name) {
            blockers.push("幻灯片内容类型缺失".into());
        }
        if let Some(notes_part) = &notes_part {
            if !part_names.contains(notes_part) || !override_names.contains(notes_part) {
                blockers.push("备注部件或内容类型缺失".into());
            }
            let notes_rels = relationship_part(notes_part)?;
            if !part_names.contains(&notes_rels) {
                blockers.push("备注关系部件缺失".into());
            } else {
                let entries = scan_relationship_list(&read_part(source, &notes_rels)?)?;
                let slide_backlinks = entries
                    .entries
                    .iter()
                    .filter(|relation| relation.relation_type.ends_with("/slide"))
                    .collect::<Vec<_>>();
                if slide_backlinks.len() != 1
                    || resolve_relative_part(notes_part, &slide_backlinks[0].target).as_deref()
                        != Some(part_name.as_str())
                    || entries.entries.iter().any(|relation| {
                        relation.target_mode.is_some()
                            || (!relation.relation_type.ends_with("/slide")
                                && !relation.relation_type.ends_with("/notesMaster"))
                    })
                {
                    blockers.push("备注回链或关系超出白名单".into());
                }
            }
        }
        for (relationship_part_name, relationship_source) in &relationship_parts {
            let relationships =
                scan_relationship_list(&read_part(source, relationship_part_name)?)?;
            for relation in relationships.entries {
                if relation.target_mode.is_some()
                    || resolve_relative_part(relationship_source, &relation.target).as_deref()
                        != Some(part_name.as_str())
                {
                    continue;
                }
                let allowed_presentation = relationship_source == "ppt/presentation.xml"
                    && relation.id == entry.relationship_id;
                let allowed_notes = notes_part
                    .as_ref()
                    .is_some_and(|notes| notes == relationship_source)
                    && relation.relation_type.ends_with("/slide");
                if !allowed_presentation && !allowed_notes {
                    blockers.push(format!("被其他部件引用: {relationship_source}"));
                }
            }
        }
        blockers.sort();
        blockers.dedup();
        let safe_copy = blockers.is_empty();
        let safe_delete = safe_copy && slide_list.entries.len() > 1;
        if slide_list.entries.len() == 1 {
            blockers.push("演示文稿必须至少保留一张幻灯片".into());
        }
        targets.push(SlideLifecycleTargetInternal {
            target: PptxEditableSlideTarget {
                id: format!("slide-lifecycle:{}:{}", entry.slide_id, part_name),
                slide_number: index + 1,
                slide_id: entry.slide_id.clone(),
                relationship_id: entry.relationship_id.clone(),
                part_name: part_name.clone(),
                title: slide.title.clone(),
                hidden: entry.hidden,
                safe_copy,
                safe_delete,
                blockers,
                expected_slide_digest: digest(&slide_bytes),
                expected_presentation_digest: presentation_digest.clone(),
                expected_relationships_digest: relationships_digest.clone(),
            },
            notes_part,
            notes_relationship_part,
            slide_relationship_part,
            layout_target,
        });
    }
    Ok(targets)
}

pub fn inspect_pptx_editable_slide_targets(
    source: &[u8],
) -> Result<Vec<PptxEditableSlideTarget>, String> {
    Ok(inspect_pptx_slide_targets_internal(source)?
        .into_iter()
        .map(|target| target.target)
        .collect())
}

fn validate_slide_target_digests(
    target: &PptxEditableSlideTarget,
    expected_slide_digest: &str,
    expected_presentation_digest: &str,
    expected_relationships_digest: &str,
) -> Result<(), String> {
    let expected_slide_digest = expected_slide_digest.trim().to_ascii_lowercase();
    let expected_presentation_digest = expected_presentation_digest.trim().to_ascii_lowercase();
    let expected_relationships_digest = expected_relationships_digest.trim().to_ascii_lowercase();
    if !valid_sha256(&expected_slide_digest)
        || !valid_sha256(&expected_presentation_digest)
        || !valid_sha256(&expected_relationships_digest)
        || target.expected_slide_digest != expected_slide_digest
        || target.expected_presentation_digest != expected_presentation_digest
        || target.expected_relationships_digest != expected_relationships_digest
    {
        return Err("PPTX C5C 幻灯片或演示文稿已变化，请重新建立编辑基线".into());
    }
    Ok(())
}

fn content_type_override(part_name: &str, content_type: &str) -> String {
    format!(
        "<Override PartName=\"/{}\" ContentType=\"{}\"/>",
        xml_attribute(part_name),
        xml_attribute(content_type)
    )
}

fn blank_slide_xml() -> Vec<u8> {
    br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#.to_vec()
}

fn finalize_slide_lifecycle(
    source: &[u8],
    mutation: PackageMutation,
    operation: &str,
    target_id: String,
    expected_slide_ids: Vec<String>,
    slide_count_before: usize,
) -> Result<(PptxSlideLifecycleReport, Vec<u8>), String> {
    let output = rewrite_package(source, &mutation)?;
    let (changed_parts, added_parts, removed_parts, unchanged_part_count) =
        verify_package_mutation(source, &output, &mutation)?;
    let reopened =
        parse_pptx(&output).map_err(|error| format!("PPTX C5C 输出结构复读失败: {error}"))?;
    let resulting_slide_ids = reopened
        .slides
        .iter()
        .map(|slide| slide.id.clone())
        .collect::<Vec<_>>();
    let semantic_reparse_verified = resulting_slide_ids == expected_slide_ids;
    if !semantic_reparse_verified {
        return Err(format!(
            "PPTX C5C 输出顺序复读失败: expected=[{}], actual=[{}]",
            expected_slide_ids.join(", "),
            resulting_slide_ids.join(", ")
        ));
    }
    Ok((
        PptxSlideLifecycleReport {
            status: "isolated_slide_lifecycle_verified".into(),
            engine: "LongEdit C5C isolated PPTX slide lifecycle".into(),
            operation: operation.into(),
            target_id,
            source_digest: digest(source),
            output_digest: digest(&output),
            changed_parts,
            added_parts,
            removed_parts,
            unchanged_part_count,
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            semantic_reparse_verified,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            writes_user_file: false,
            output_bytes: output.len(),
            slide_count_before,
            slide_count_after: reopened.slides.len(),
            resulting_slide_ids,
        },
        output,
    ))
}

#[allow(clippy::too_many_arguments)]
pub fn build_pptx_slide_add_isolated(
    source: &[u8],
    after_target_id: &str,
    expected_slide_digest: &str,
    expected_presentation_digest: &str,
    expected_relationships_digest: &str,
) -> Result<(PptxSlideLifecycleReport, Vec<u8>), String> {
    let targets = inspect_pptx_slide_targets_internal(source)?;
    let target = targets
        .iter()
        .find(|target| target.target.id == after_target_id)
        .ok_or("PPTX C5C 新增位置不存在")?;
    validate_slide_target_digests(
        &target.target,
        expected_slide_digest,
        expected_presentation_digest,
        expected_relationships_digest,
    )?;
    let presentation = read_part(source, "ppt/presentation.xml")?;
    let presentation_relationships = read_part(source, "ppt/_rels/presentation.xml.rels")?;
    let content_types = read_part(source, "[Content_Types].xml")?;
    let slide_list = scan_slide_id_list(&presentation)?;
    let relationship_list = scan_relationship_list(&presentation_relationships)?;
    let content_type_list = scan_content_type_overrides(&content_types)?;
    let part_names = inspect_package_parts(source)?
        .into_iter()
        .map(|part| part.part_name)
        .collect::<BTreeSet<_>>();
    let (_, new_slide_part) = next_numbered_part(&part_names, "ppt/slides/slide", ".xml")?;
    let new_slide_relationship_part = relationship_part(&new_slide_part)?;
    if part_names.contains(&new_slide_relationship_part) {
        return Err("PPTX C5C 新幻灯片关系部件冲突".into());
    }
    let new_relationship_id = next_relationship_id(&relationship_list.entries)?;
    let new_slide_id = next_slide_id(&slide_list.entries)?;
    let target_entry = slide_list
        .entries
        .iter()
        .find(|entry| entry.slide_id == target.target.slide_id)
        .ok_or("PPTX C5C 新增位置身份失效")?;
    let new_slide_id_xml = format!(
        "<p:sldId id=\"{}\" r:id=\"{}\"/>",
        new_slide_id, new_relationship_id
    );
    let new_presentation = splice_xml(
        &presentation,
        vec![(target_entry.end, target_entry.end, new_slide_id_xml)],
    )?;
    let slide_target = new_slide_part
        .strip_prefix("ppt/")
        .ok_or("PPTX C5C 新幻灯片路径无效")?;
    let new_presentation_relationships = splice_xml(
        &presentation_relationships,
        vec![(
            relationship_list.insertion_offset,
            relationship_list.insertion_offset,
            relationship_xml(
                &new_relationship_id,
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
                slide_target,
                None,
            ),
        )],
    )?;
    let new_content_types = splice_xml(
        &content_types,
        vec![(
            content_type_list.insertion_offset,
            content_type_list.insertion_offset,
            content_type_override(
                &new_slide_part,
                "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
            ),
        )],
    )?;
    let slide_relationships = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{}</Relationships>",
        relationship_xml(
            "rId1",
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
            &target.layout_target,
            None,
        )
    )
    .into_bytes();
    let mut mutation = PackageMutation::default();
    mutation
        .replacements
        .insert("ppt/presentation.xml".into(), new_presentation);
    mutation.replacements.insert(
        "ppt/_rels/presentation.xml.rels".into(),
        new_presentation_relationships,
    );
    mutation
        .replacements
        .insert("[Content_Types].xml".into(), new_content_types);
    mutation.additions.insert(new_slide_part, blank_slide_xml());
    mutation
        .additions
        .insert(new_slide_relationship_part, slide_relationships);
    let mut expected_ids = slide_list
        .entries
        .iter()
        .map(|entry| entry.slide_id.clone())
        .collect::<Vec<_>>();
    expected_ids.insert(target.target.slide_number, new_slide_id);
    finalize_slide_lifecycle(
        source,
        mutation,
        "slide-add",
        target.target.id.clone(),
        expected_ids,
        slide_list.entries.len(),
    )
}

fn replace_relationship_entry_target(
    xml: &[u8],
    relation: &RelationshipEntry,
    target: &str,
) -> Result<Vec<u8>, String> {
    splice_xml(
        xml,
        vec![(
            relation.start,
            relation.end,
            relationship_xml(
                &relation.id,
                &relation.relation_type,
                target,
                relation.target_mode.as_deref(),
            ),
        )],
    )
}

#[allow(clippy::too_many_arguments)]
pub fn build_pptx_slide_copy_isolated(
    source: &[u8],
    target_id: &str,
    expected_slide_digest: &str,
    expected_presentation_digest: &str,
    expected_relationships_digest: &str,
) -> Result<(PptxSlideLifecycleReport, Vec<u8>), String> {
    let targets = inspect_pptx_slide_targets_internal(source)?;
    let target = targets
        .iter()
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C5C 复制目标不存在")?;
    if !target.target.safe_copy {
        return Err(format!(
            "PPTX C5C 复制目标不安全: {}",
            target.target.blockers.join("；")
        ));
    }
    validate_slide_target_digests(
        &target.target,
        expected_slide_digest,
        expected_presentation_digest,
        expected_relationships_digest,
    )?;
    let presentation = read_part(source, "ppt/presentation.xml")?;
    let presentation_relationships = read_part(source, "ppt/_rels/presentation.xml.rels")?;
    let content_types = read_part(source, "[Content_Types].xml")?;
    let slide_list = scan_slide_id_list(&presentation)?;
    let relationship_list = scan_relationship_list(&presentation_relationships)?;
    let content_type_list = scan_content_type_overrides(&content_types)?;
    let part_names = inspect_package_parts(source)?
        .into_iter()
        .map(|part| part.part_name)
        .collect::<BTreeSet<_>>();
    let (_, new_slide_part) = next_numbered_part(&part_names, "ppt/slides/slide", ".xml")?;
    let new_slide_relationship_part = relationship_part(&new_slide_part)?;
    let new_relationship_id = next_relationship_id(&relationship_list.entries)?;
    let new_slide_id = next_slide_id(&slide_list.entries)?;
    let target_entry = slide_list
        .entries
        .iter()
        .find(|entry| entry.slide_id == target.target.slide_id)
        .ok_or("PPTX C5C 复制目标身份失效")?;
    let hidden = if target.target.hidden {
        " show=\"0\""
    } else {
        ""
    };
    let new_presentation = splice_xml(
        &presentation,
        vec![(
            target_entry.end,
            target_entry.end,
            format!(
                "<p:sldId id=\"{}\" r:id=\"{}\"{hidden}/>",
                new_slide_id, new_relationship_id
            ),
        )],
    )?;
    let slide_target = new_slide_part
        .strip_prefix("ppt/")
        .ok_or("PPTX C5C 新幻灯片路径无效")?;
    let new_presentation_relationships = splice_xml(
        &presentation_relationships,
        vec![(
            relationship_list.insertion_offset,
            relationship_list.insertion_offset,
            relationship_xml(
                &new_relationship_id,
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
                slide_target,
                None,
            ),
        )],
    )?;
    let source_slide = read_part(source, &target.target.part_name)?;
    let source_slide_relationships = read_part(source, &target.slide_relationship_part)?;
    let source_slide_relationship_list = scan_relationship_list(&source_slide_relationships)?;
    let mut new_slide_relationships = source_slide_relationships.clone();
    let mut new_notes = None;
    if let Some(notes_part) = &target.notes_part {
        let (_, new_notes_part) =
            next_numbered_part(&part_names, "ppt/notesSlides/notesSlide", ".xml")?;
        let new_notes_relationship_part = relationship_part(&new_notes_part)?;
        let notes_relation = source_slide_relationship_list
            .entries
            .iter()
            .find(|entry| entry.relation_type.ends_with("/notesSlide"))
            .ok_or("PPTX C5C 源幻灯片备注关系缺失")?;
        let new_notes_target = format!(
            "../notesSlides/{}",
            new_notes_part
                .rsplit_once('/')
                .map(|(_, file)| file)
                .ok_or("PPTX C5C 新备注路径无效")?
        );
        new_slide_relationships = replace_relationship_entry_target(
            &source_slide_relationships,
            notes_relation,
            &new_notes_target,
        )?;
        let source_notes = read_part(source, notes_part)?;
        let source_notes_relationship_part = target
            .notes_relationship_part
            .as_ref()
            .ok_or("PPTX C5C 源备注关系部件缺失")?;
        let source_notes_relationships = read_part(source, source_notes_relationship_part)?;
        let source_notes_relationship_list = scan_relationship_list(&source_notes_relationships)?;
        let slide_backlink = source_notes_relationship_list
            .entries
            .iter()
            .find(|entry| entry.relation_type.ends_with("/slide"))
            .ok_or("PPTX C5C 源备注缺少幻灯片回链")?;
        let new_slide_target = format!(
            "../slides/{}",
            new_slide_part
                .rsplit_once('/')
                .map(|(_, file)| file)
                .ok_or("PPTX C5C 新幻灯片路径无效")?
        );
        let new_notes_relationships = replace_relationship_entry_target(
            &source_notes_relationships,
            slide_backlink,
            &new_slide_target,
        )?;
        new_notes = Some((
            new_notes_part,
            source_notes,
            new_notes_relationship_part,
            new_notes_relationships,
        ));
    }
    let mut content_type_insertions = content_type_override(
        &new_slide_part,
        "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
    );
    if let Some((new_notes_part, _, _, _)) = &new_notes {
        content_type_insertions.push_str(&content_type_override(
            new_notes_part,
            "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
        ));
    }
    let new_content_types = splice_xml(
        &content_types,
        vec![(
            content_type_list.insertion_offset,
            content_type_list.insertion_offset,
            content_type_insertions,
        )],
    )?;
    let mut mutation = PackageMutation::default();
    mutation
        .replacements
        .insert("ppt/presentation.xml".into(), new_presentation);
    mutation.replacements.insert(
        "ppt/_rels/presentation.xml.rels".into(),
        new_presentation_relationships,
    );
    mutation
        .replacements
        .insert("[Content_Types].xml".into(), new_content_types);
    mutation.additions.insert(new_slide_part, source_slide);
    mutation
        .additions
        .insert(new_slide_relationship_part, new_slide_relationships);
    if let Some((notes_part, notes, notes_rels_part, notes_rels)) = new_notes {
        mutation.additions.insert(notes_part, notes);
        mutation.additions.insert(notes_rels_part, notes_rels);
    }
    let mut expected_ids = slide_list
        .entries
        .iter()
        .map(|entry| entry.slide_id.clone())
        .collect::<Vec<_>>();
    expected_ids.insert(target.target.slide_number, new_slide_id.clone());
    let (report, output) = finalize_slide_lifecycle(
        source,
        mutation,
        "slide-copy",
        target.target.id.clone(),
        expected_ids,
        slide_list.entries.len(),
    )?;
    let reopened = parse_pptx(&output)?;
    let source_slide_model = reopened
        .slides
        .get(target.target.slide_number.saturating_sub(1))
        .ok_or("PPTX C5C 复制后源幻灯片复读缺失")?;
    let copied_slide_model = reopened
        .slides
        .get(target.target.slide_number)
        .ok_or("PPTX C5C 复制后新幻灯片复读缺失")?;
    if copied_slide_model.id != new_slide_id
        || copied_slide_model.title != source_slide_model.title
        || copied_slide_model.text != source_slide_model.text
        || copied_slide_model.notes != source_slide_model.notes
        || copied_slide_model.objects != source_slide_model.objects
    {
        return Err("PPTX C5C 复制页内容或备注语义复读不一致".into());
    }
    Ok((report, output))
}

#[allow(clippy::too_many_arguments)]
pub fn build_pptx_slide_delete_isolated(
    source: &[u8],
    target_id: &str,
    expected_slide_digest: &str,
    expected_presentation_digest: &str,
    expected_relationships_digest: &str,
) -> Result<(PptxSlideLifecycleReport, Vec<u8>), String> {
    let targets = inspect_pptx_slide_targets_internal(source)?;
    let target = targets
        .iter()
        .find(|target| target.target.id == target_id)
        .ok_or("PPTX C5C 删除目标不存在")?;
    if !target.target.safe_delete {
        return Err(format!(
            "PPTX C5C 删除目标不安全: {}",
            target.target.blockers.join("；")
        ));
    }
    validate_slide_target_digests(
        &target.target,
        expected_slide_digest,
        expected_presentation_digest,
        expected_relationships_digest,
    )?;
    let presentation = read_part(source, "ppt/presentation.xml")?;
    let presentation_relationships = read_part(source, "ppt/_rels/presentation.xml.rels")?;
    let content_types = read_part(source, "[Content_Types].xml")?;
    let slide_list = scan_slide_id_list(&presentation)?;
    let relationship_list = scan_relationship_list(&presentation_relationships)?;
    let content_type_list = scan_content_type_overrides(&content_types)?;
    let target_entry = slide_list
        .entries
        .iter()
        .find(|entry| entry.slide_id == target.target.slide_id)
        .ok_or("PPTX C5C 删除目标身份失效")?;
    let target_relationship = relationship_list
        .entries
        .iter()
        .find(|entry| entry.id == target.target.relationship_id)
        .ok_or("PPTX C5C 删除目标关系失效")?;
    let mut content_type_removals = vec![target.target.part_name.clone()];
    if let Some(notes_part) = &target.notes_part {
        content_type_removals.push(notes_part.clone());
    }
    let content_type_replacements = content_type_removals
        .iter()
        .map(|part_name| {
            let entry = content_type_list
                .entries
                .iter()
                .find(|entry| entry.part_name.trim_start_matches('/') == part_name)
                .ok_or_else(|| format!("PPTX C5C 删除内容类型缺失: {part_name}"))?;
            Ok((entry.start, entry.end, String::new()))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let new_presentation = splice_xml(
        &presentation,
        vec![(target_entry.start, target_entry.end, String::new())],
    )?;
    let new_presentation_relationships = splice_xml(
        &presentation_relationships,
        vec![(
            target_relationship.start,
            target_relationship.end,
            String::new(),
        )],
    )?;
    let new_content_types = splice_xml(&content_types, content_type_replacements)?;
    let mut mutation = PackageMutation::default();
    mutation
        .replacements
        .insert("ppt/presentation.xml".into(), new_presentation);
    mutation.replacements.insert(
        "ppt/_rels/presentation.xml.rels".into(),
        new_presentation_relationships,
    );
    mutation
        .replacements
        .insert("[Content_Types].xml".into(), new_content_types);
    mutation.removals.insert(target.target.part_name.clone());
    mutation
        .removals
        .insert(target.slide_relationship_part.clone());
    if let Some(notes_part) = &target.notes_part {
        mutation.removals.insert(notes_part.clone());
    }
    if let Some(notes_relationship_part) = &target.notes_relationship_part {
        mutation.removals.insert(notes_relationship_part.clone());
    }
    let expected_ids = slide_list
        .entries
        .iter()
        .filter(|entry| entry.slide_id != target.target.slide_id)
        .map(|entry| entry.slide_id.clone())
        .collect::<Vec<_>>();
    finalize_slide_lifecycle(
        source,
        mutation,
        "slide-delete",
        target.target.id.clone(),
        expected_ids,
        slide_list.entries.len(),
    )
}

pub fn build_pptx_slide_reorder_isolated(
    source: &[u8],
    ordered_target_ids: &[String],
    expected_presentation_digest: &str,
) -> Result<(PptxSlideLifecycleReport, Vec<u8>), String> {
    let expected_presentation_digest = expected_presentation_digest.trim().to_ascii_lowercase();
    let targets = inspect_pptx_slide_targets_internal(source)?;
    if !valid_sha256(&expected_presentation_digest)
        || targets.first().is_none_or(|target| {
            target.target.expected_presentation_digest != expected_presentation_digest
        })
    {
        return Err("PPTX C5C 演示文稿顺序已变化，请重新建立编辑基线".into());
    }
    if ordered_target_ids.len() != targets.len() {
        return Err("PPTX C5C 排序必须包含全部幻灯片且只出现一次".into());
    }
    let target_by_id = targets
        .iter()
        .map(|target| (target.target.id.as_str(), target))
        .collect::<BTreeMap<_, _>>();
    let mut seen = BTreeSet::new();
    let ordered_targets = ordered_target_ids
        .iter()
        .map(|id| {
            if !seen.insert(id.as_str()) {
                return Err("PPTX C5C 排序包含重复幻灯片".to_string());
            }
            target_by_id
                .get(id.as_str())
                .copied()
                .ok_or_else(|| "PPTX C5C 排序包含未知幻灯片".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let current_ids = targets
        .iter()
        .map(|target| target.target.id.as_str())
        .collect::<Vec<_>>();
    if ordered_target_ids
        .iter()
        .map(String::as_str)
        .eq(current_ids.iter().copied())
    {
        return Err("PPTX C5C 新顺序与当前顺序相同".into());
    }
    let presentation = read_part(source, "ppt/presentation.xml")?;
    let slide_list = scan_slide_id_list(&presentation)?;
    let entry_by_slide_id = slide_list
        .entries
        .iter()
        .map(|entry| (entry.slide_id.as_str(), entry))
        .collect::<BTreeMap<_, _>>();
    let first_start = slide_list
        .entries
        .first()
        .map(|entry| entry.start)
        .ok_or("PPTX C5C 幻灯片顺序列表为空")?;
    let mut ordered_xml = String::new();
    for target in &ordered_targets {
        let entry = entry_by_slide_id
            .get(target.target.slide_id.as_str())
            .ok_or("PPTX C5C 幻灯片顺序身份失效")?;
        ordered_xml.push_str(
            std::str::from_utf8(&presentation[entry.start..entry.end])
                .map_err(|_| "PPTX C5C 幻灯片顺序 XML 不是 UTF-8")?,
        );
    }
    let new_presentation = splice_xml(
        &presentation,
        vec![(first_start, slide_list.insertion_offset, ordered_xml)],
    )?;
    let mut mutation = PackageMutation::default();
    mutation
        .replacements
        .insert("ppt/presentation.xml".into(), new_presentation);
    let expected_ids = ordered_targets
        .iter()
        .map(|target| target.target.slide_id.clone())
        .collect::<Vec<_>>();
    finalize_slide_lifecycle(
        source,
        mutation,
        "slide-reorder",
        "presentation-slide-order".into(),
        expected_ids,
        slide_list.entries.len(),
    )
}

pub fn build_pptx_edit_baseline(
    source: &[u8],
    source_signature: String,
) -> Result<(PptxEditBaselineReport, Vec<u8>), String> {
    parse_pptx(source).map_err(|error| format!("PPTX C4A 源包结构校验失败: {error}"))?;
    let source_parts = inspect_package_parts(source)?;

    // C4A deliberately performs an exact byte clone. Later edit stages may only
    // replace allowlisted slide or notes parts after this preservation gate passes.
    let isolated = source.to_vec();
    parse_pptx(&isolated).map_err(|error| format!("PPTX C4A 隔离包结构复读失败: {error}"))?;
    let isolated_parts = inspect_package_parts(&isolated)?;
    let unchanged_parts_verified = source_parts == isolated_parts;
    if !unchanged_parts_verified {
        return Err("PPTX C4A 隔离副本部件与源包不一致".into());
    }

    let source_package_digest = digest(source);
    let isolated_package_digest = digest(&isolated);
    let exact_package_copy_verified = source_package_digest == isolated_package_digest;
    if !exact_package_copy_verified {
        return Err("PPTX C4A 隔离副本摘要与源包不一致".into());
    }

    let editable_candidate_parts = source_parts
        .iter()
        .filter(|part| part.editable_candidate)
        .map(|part| part.part_name.clone())
        .collect::<Vec<_>>();
    let part_count = source_parts.len();
    let protected_part_count = part_count.saturating_sub(editable_candidate_parts.len());
    let (editable_text_targets, editable_notes_targets) =
        inspect_pptx_editable_text_targets(source)?;
    let editable_style_targets = inspect_pptx_editable_style_targets(source)?;
    let editable_alt_text_targets = inspect_pptx_editable_alt_text_targets(source)?;
    let editable_image_targets = inspect_pptx_editable_image_targets(source)?;
    let (editable_shape_slides, editable_shape_targets) =
        inspect_pptx_editable_shape_targets(source)?;
    let editable_slide_targets = inspect_pptx_editable_slide_targets(source)?;

    Ok((
        PptxEditBaselineReport {
            status: "isolated_baseline_verified".into(),
            engine: "LongEdit C4A PPTX package preservation baseline".into(),
            execution: "memory_and_temporary_copy_only".into(),
            writes_user_file: false,
            source_signature,
            source_package_digest,
            isolated_package_digest,
            part_count,
            raw_copied_part_count: part_count,
            unchanged_part_count: part_count,
            protected_part_count,
            editable_candidate_parts,
            changed_parts: Vec::new(),
            added_parts: Vec::new(),
            removed_parts: Vec::new(),
            exact_package_copy_verified,
            unchanged_parts_verified,
            structural_reparse_verified: true,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            editing_enabled: false,
            next_stage: "C5A isolated picture binary replacement".into(),
            editable_text_targets,
            editable_notes_targets,
            editable_style_targets,
            editable_alt_text_targets,
            editable_image_targets,
            editable_shape_slides,
            editable_shape_targets,
            editable_slide_targets,
            parts: source_parts,
        },
        isolated,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn real_producer_fixtures() -> [(&'static str, &'static [u8]); 3] {
        [
            (
                "powerpoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
            ),
        ]
    }

    #[test]
    fn c5b_adds_and_deletes_basic_shapes_for_all_real_producers() {
        for (producer, source) in real_producer_fixtures() {
            let original_model =
                parse_pptx(source).unwrap_or_else(|error| panic!("{producer}: {error}"));
            let (slides, safe_deletions) = inspect_pptx_editable_shape_targets(source)
                .unwrap_or_else(|error| panic!("{producer} targets: {error}"));
            assert_eq!(slides.len(), original_model.slides.len(), "{producer}");
            assert!(safe_deletions.iter().all(|target| {
                matches!(target.shape_type.as_str(), "rect" | "ellipse" | "line")
            }));
            let slide = slides.first().expect("fixture slide");

            for shape_type in ["rectangle", "ellipse", "line"] {
                let (add_report, added) = build_pptx_shape_add_isolated(
                    source,
                    &slide.id,
                    &slide.expected_part_digest,
                    shape_type,
                    914_400,
                    914_400,
                    2_743_200,
                    1_371_600,
                    "DDEEFF",
                    "2255AA",
                    25_400,
                )
                .unwrap_or_else(|error| panic!("{producer} {shape_type} add: {error}"));
                assert_eq!(add_report.operation, "basic-shape-add", "{producer}");
                assert_eq!(add_report.changed_parts, [slide.part_name.clone()]);
                assert!(add_report.unchanged_parts_verified);
                assert!(add_report.structural_reparse_verified);
                assert!(add_report.semantic_reparse_verified);

                let (_, added_targets) = inspect_pptx_editable_shape_targets(&added)
                    .unwrap_or_else(|error| panic!("{producer} added targets: {error}"));
                let preset = shape_preset(shape_type).unwrap().0;
                let added_target = added_targets
                    .iter()
                    .find(|target| {
                        target.object_name.starts_with("LongEdit ") && target.shape_type == preset
                    })
                    .unwrap_or_else(|| panic!("{producer} {shape_type} delete target"));
                let (delete_report, deleted) = build_pptx_shape_delete_isolated(
                    &added,
                    &added_target.id,
                    &added_target.expected_shape_digest,
                    &added_target.expected_part_digest,
                )
                .unwrap_or_else(|error| panic!("{producer} {shape_type} delete: {error}"));
                assert_eq!(delete_report.operation, "basic-shape-delete");
                assert_eq!(delete_report.changed_parts, [slide.part_name.clone()]);
                assert!(delete_report.unchanged_parts_verified);
                assert!(delete_report.structural_reparse_verified);
                assert!(delete_report.semantic_reparse_verified);
                assert_eq!(
                    read_part(&deleted, &slide.part_name).unwrap(),
                    read_part(source, &slide.part_name).unwrap(),
                    "{producer} {shape_type} slide bytes after add/delete"
                );
            }
        }
    }

    #[test]
    fn c5b_rejects_stale_unsafe_and_out_of_bounds_shape_operations() {
        let source = include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx");
        let (slides, safe_targets) = inspect_pptx_editable_shape_targets(source).unwrap();
        let slide = slides.first().unwrap();
        assert!(build_pptx_shape_add_isolated(
            source,
            &slide.id,
            &"0".repeat(64),
            "rectangle",
            10,
            10,
            100,
            100,
            "DDEEFF",
            "2255AA",
            12_700,
        )
        .unwrap_err()
        .contains("已变化"));
        assert!(build_pptx_shape_add_isolated(
            source,
            &slide.id,
            &slide.expected_part_digest,
            "triangle",
            10,
            10,
            100,
            100,
            "DDEEFF",
            "2255AA",
            12_700,
        )
        .unwrap_err()
        .contains("矩形、椭圆和线条"));
        assert!(build_pptx_shape_add_isolated(
            source,
            &slide.id,
            &slide.expected_part_digest,
            "rectangle",
            10,
            10,
            i64::MAX,
            100,
            "DDEEFF",
            "2255AA",
            12_700,
        )
        .unwrap_err()
        .contains("幻灯片范围"));
        assert!(build_pptx_shape_add_isolated(
            source,
            &slide.id,
            &slide.expected_part_digest,
            "rectangle",
            10,
            10,
            100,
            100,
            "not-a-color",
            "2255AA",
            12_700,
        )
        .unwrap_err()
        .contains("十六进制"));
        assert!(safe_targets.iter().all(|target| {
            let object = parse_pptx(source).unwrap().slides[target.slide_number - 1]
                .objects
                .iter()
                .find(|object| object.id == target.object_id)
                .cloned()
                .unwrap();
            object.text.is_empty()
                && object.parent_group_id.is_none()
                && object.media_part.is_none()
                && object.related_part.is_none()
        }));
        if let Some(target) = safe_targets.first() {
            assert!(build_pptx_shape_delete_isolated(
                source,
                &target.id,
                &"0".repeat(64),
                &target.expected_part_digest,
            )
            .unwrap_err()
            .contains("已变化"));
        }
    }

    #[test]
    fn c5a_replaces_one_unshared_image_part_for_all_real_producers() {
        for (producer, source) in real_producer_fixtures() {
            let target = inspect_pptx_editable_image_targets(source)
                .unwrap_or_else(|error| panic!("{producer} targets: {error}"))
                .into_iter()
                .next()
                .unwrap_or_else(|| panic!("{producer} has no safe image target"));
            assert_eq!(target.reference_count, 1, "{producer}");
            assert!(matches!(
                target.mime_type.as_str(),
                "image/png" | "image/jpeg"
            ));
            let mut replacement = read_part(source, &target.part_name).unwrap();
            let mutation_index = replacement.len() / 2;
            replacement[mutation_index] ^= 0x01;
            let (report, output) = build_pptx_image_patch_isolated(
                source,
                &target.id,
                &target.expected_media_digest,
                &target.expected_part_digest,
                &target.mime_type,
                &replacement,
            )
            .unwrap_or_else(|error| panic!("{producer}: {error}"));
            assert_eq!(report.operation, "picture-binary", "{producer}");
            assert_eq!(
                report.changed_parts,
                [target.part_name.clone()],
                "{producer}"
            );
            assert!(report.unchanged_parts_verified, "{producer}");
            assert!(report.structural_reparse_verified, "{producer}");
            assert!(report.semantic_reparse_verified, "{producer}");
            assert!(!report.writes_user_file, "{producer}");
            assert_ne!(output, source, "{producer}");
        }
    }

    #[test]
    fn c5a_rejects_stale_digest_mime_change_oversize_and_noop() {
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let target = inspect_pptx_editable_image_targets(source)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let original = read_part(source, &target.part_name).unwrap();
        assert!(build_pptx_image_patch_isolated(
            source,
            &target.id,
            &"0".repeat(64),
            &target.expected_part_digest,
            &target.mime_type,
            &original,
        )
        .unwrap_err()
        .contains("已变化"));
        let different_mime = if target.mime_type == "image/png" {
            "image/jpeg"
        } else {
            "image/png"
        };
        assert!(build_pptx_image_patch_isolated(
            source,
            &target.id,
            &target.expected_media_digest,
            &target.expected_part_digest,
            different_mime,
            &original,
        )
        .unwrap_err()
        .contains("相同"));
        assert!(build_pptx_image_patch_isolated(
            source,
            &target.id,
            &target.expected_media_digest,
            &target.expected_part_digest,
            &target.mime_type,
            &vec![0; MAX_PPTX_REPLACEMENT_IMAGE_BYTES + 1],
        )
        .unwrap_err()
        .contains("8 MiB"));
        assert!(build_pptx_image_patch_isolated(
            source,
            &target.id,
            &target.expected_media_digest,
            &target.expected_part_digest,
            &target.mime_type,
            &original,
        )
        .unwrap_err()
        .contains("相同"));
    }

    #[test]
    fn c4a_preserves_every_part_for_all_real_producers() {
        let fixtures: [(&str, &[u8]); 3] = [
            (
                "powerpoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
            ),
        ];

        for (producer, source) in fixtures {
            let (report, isolated) =
                build_pptx_edit_baseline(source, format!("{producer}-signature")).unwrap();
            assert_eq!(report.status, "isolated_baseline_verified", "{producer}");
            assert!(!report.writes_user_file, "{producer}");
            assert!(!report.editing_enabled, "{producer}");
            assert!(report.exact_package_copy_verified, "{producer}");
            assert!(report.unchanged_parts_verified, "{producer}");
            assert_eq!(
                report.part_count, report.raw_copied_part_count,
                "{producer}"
            );
            assert_eq!(report.part_count, report.unchanged_part_count, "{producer}");
            assert!(report.editable_candidate_parts.len() >= 3, "{producer}");
            assert!(report.changed_parts.is_empty(), "{producer}");
            assert_eq!(isolated, source, "{producer}");
        }
    }

    #[test]
    fn c4b_patches_safe_slide_text_and_notes_for_all_real_producers() {
        let fixtures: [(&str, &[u8]); 3] = [
            (
                "powerpoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
            ),
        ];

        for (producer, source) in fixtures {
            let (text_targets, notes_targets) = inspect_pptx_editable_text_targets(source).unwrap();
            assert!(!text_targets.is_empty(), "{producer}");
            assert!(!notes_targets.is_empty(), "{producer}");
            for (kind, target) in [
                ("slide", text_targets.first().unwrap()),
                ("notes", notes_targets.first().unwrap()),
            ] {
                let replacement = format!("LongEdit C4B {producer} {kind} preview");
                let (report, output) = build_pptx_text_patch_isolated(
                    source,
                    &target.id,
                    &target.expected_text_digest,
                    &target.expected_part_digest,
                    &replacement,
                )
                .unwrap_or_else(|error| panic!("{producer} {kind}: {error}"));
                assert_eq!(
                    report.changed_parts,
                    [target.part_name.clone()],
                    "{producer} {kind}"
                );
                assert!(report.unchanged_parts_verified, "{producer} {kind}");
                assert!(report.structural_reparse_verified, "{producer} {kind}");
                assert!(report.semantic_reparse_verified, "{producer} {kind}");
                assert!(!report.writes_user_file, "{producer} {kind}");
                assert_ne!(output, source, "{producer} {kind}");
            }
        }
    }

    #[test]
    fn c4b_rejects_stale_digests_and_multiline_or_unknown_targets() {
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let (text_targets, _) = inspect_pptx_editable_text_targets(source).unwrap();
        let target = text_targets.first().unwrap();
        assert!(build_pptx_text_patch_isolated(
            source,
            &target.id,
            &"0".repeat(64),
            &target.expected_part_digest,
            "replacement",
        )
        .unwrap_err()
        .contains("文本已变化"));
        assert!(build_pptx_text_patch_isolated(
            source,
            "unknown-target",
            &target.expected_text_digest,
            &target.expected_part_digest,
            "replacement",
        )
        .unwrap_err()
        .contains("不存在"));
        assert!(build_pptx_text_patch_isolated(
            source,
            &target.id,
            &target.expected_text_digest,
            &target.expected_part_digest,
            "line one\nline two",
        )
        .unwrap_err()
        .contains("安全单行"));
    }

    #[test]
    fn c4c_patches_safe_styles_and_alt_text_for_all_real_producers() {
        let fixtures: [(&str, &[u8]); 3] = [
            (
                "powerpoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
            ),
        ];

        for (producer, source) in fixtures {
            let style_targets = inspect_pptx_editable_style_targets(source).unwrap();
            assert!(!style_targets.is_empty(), "{producer} style targets");
            assert!(
                style_targets
                    .iter()
                    .any(|target| target.kind == "shape-text-style"),
                "{producer} shape text"
            );
            let style = style_targets.first().unwrap();
            let size = style
                .font_size_hundredth_points
                .unwrap_or(1_800)
                .saturating_add(100);
            let alignment = if style.alignment == "center" {
                "left"
            } else {
                "center"
            };
            let (style_report, styled) = build_pptx_style_patch_isolated(
                source,
                &style.id,
                &style.expected_style_digest,
                &style.expected_part_digest,
                size,
                "Aptos",
                "336699",
                !style.bold,
                true,
                true,
                alignment,
            )
            .unwrap_or_else(|error| panic!("{producer} style: {error}"));
            assert_eq!(style_report.changed_parts, [style.part_name.clone()]);
            assert!(style_report.unchanged_parts_verified);
            assert!(style_report.structural_reparse_verified);
            assert!(style_report.semantic_reparse_verified);
            assert!(!style_report.writes_user_file);
            assert_ne!(styled, source);

            let alt_targets = inspect_pptx_editable_alt_text_targets(source).unwrap();
            assert!(!alt_targets.is_empty(), "{producer} alt-text targets");
            let alt = alt_targets.first().unwrap();
            let replacement = format!("LongEdit C4C {producer} image description");
            let (alt_report, patched) = build_pptx_alt_text_patch_isolated(
                source,
                &alt.id,
                &alt.expected_metadata_digest,
                &alt.expected_part_digest,
                &replacement,
            )
            .unwrap_or_else(|error| panic!("{producer} alt text: {error}"));
            assert_eq!(alt_report.changed_parts, [alt.part_name.clone()]);
            assert!(alt_report.unchanged_parts_verified);
            assert!(alt_report.structural_reparse_verified);
            assert!(alt_report.semantic_reparse_verified);
            assert!(!alt_report.writes_user_file);
            assert_ne!(patched, source);
        }
    }

    #[test]
    fn c4c_rejects_stale_digests_and_unsafe_style_or_alt_text() {
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let style = inspect_pptx_editable_style_targets(source)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert!(build_pptx_style_patch_isolated(
            source,
            &style.id,
            &"0".repeat(64),
            &style.expected_part_digest,
            2_000,
            "Aptos",
            "336699",
            true,
            false,
            false,
            "left",
        )
        .unwrap_err()
        .contains("样式已变化"));
        assert!(build_pptx_style_patch_isolated(
            source,
            &style.id,
            &style.expected_style_digest,
            &style.expected_part_digest,
            2_000,
            "Unsafe<script>",
            "336699",
            true,
            false,
            false,
            "left",
        )
        .unwrap_err()
        .contains("字体名称"));

        let alt = inspect_pptx_editable_alt_text_targets(source)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert!(build_pptx_alt_text_patch_isolated(
            source,
            &alt.id,
            &"0".repeat(64),
            &alt.expected_part_digest,
            "replacement",
        )
        .unwrap_err()
        .contains("元数据已变化"));
        assert!(build_pptx_alt_text_patch_isolated(
            source,
            &alt.id,
            &alt.expected_metadata_digest,
            &alt.expected_part_digest,
            "unsafe\u{0001}description",
        )
        .unwrap_err()
        .contains("安全字符"));
    }

    #[test]
    fn c5c_manages_slide_lifecycle_for_all_real_producers() {
        for (producer, source) in real_producer_fixtures() {
            let original = parse_pptx(source).unwrap();
            let targets = inspect_pptx_editable_slide_targets(source)
                .unwrap_or_else(|error| panic!("{producer} targets: {error}"));
            assert_eq!(targets.len(), original.slides.len(), "{producer}");
            assert!(targets.iter().all(|target| target.safe_copy), "{producer}");
            assert!(
                targets.iter().all(|target| target.safe_delete),
                "{producer}"
            );

            let first = targets.first().unwrap();
            let (add_report, added) = build_pptx_slide_add_isolated(
                source,
                &first.id,
                &first.expected_slide_digest,
                &first.expected_presentation_digest,
                &first.expected_relationships_digest,
            )
            .unwrap_or_else(|error| panic!("{producer} add: {error}"));
            assert_eq!(add_report.operation, "slide-add");
            assert_eq!(add_report.slide_count_after, original.slides.len() + 1);
            assert_eq!(add_report.changed_parts.len(), 3);
            assert_eq!(add_report.added_parts.len(), 2);
            assert!(add_report.removed_parts.is_empty());
            assert!(add_report.unchanged_parts_verified);
            assert_eq!(
                parse_pptx(&added).unwrap().slides.len(),
                original.slides.len() + 1
            );

            let copy_target = targets.last().unwrap();
            let (copy_report, copied) = build_pptx_slide_copy_isolated(
                source,
                &copy_target.id,
                &copy_target.expected_slide_digest,
                &copy_target.expected_presentation_digest,
                &copy_target.expected_relationships_digest,
            )
            .unwrap_or_else(|error| panic!("{producer} copy: {error}"));
            assert_eq!(copy_report.operation, "slide-copy");
            assert_eq!(copy_report.slide_count_after, original.slides.len() + 1);
            assert_eq!(copy_report.changed_parts.len(), 3);
            assert_eq!(copy_report.added_parts.len(), 4);
            assert!(copy_report.removed_parts.is_empty());
            let copied_model = parse_pptx(&copied).unwrap();
            assert_eq!(
                copied_model.slides[copy_target.slide_number].notes,
                original.slides[copy_target.slide_number - 1].notes,
                "{producer} copied notes"
            );

            let delete_target = targets.last().unwrap();
            let (delete_report, deleted) = build_pptx_slide_delete_isolated(
                source,
                &delete_target.id,
                &delete_target.expected_slide_digest,
                &delete_target.expected_presentation_digest,
                &delete_target.expected_relationships_digest,
            )
            .unwrap_or_else(|error| panic!("{producer} delete: {error}"));
            assert_eq!(delete_report.operation, "slide-delete");
            assert_eq!(delete_report.slide_count_after, original.slides.len() - 1);
            assert_eq!(delete_report.changed_parts.len(), 3);
            assert_eq!(delete_report.removed_parts.len(), 4);
            assert!(delete_report.added_parts.is_empty());
            assert!(
                parse_pptx(&deleted)
                    .unwrap()
                    .slides
                    .iter()
                    .all(|slide| slide.id != delete_target.slide_id),
                "{producer} deleted identity"
            );

            let ordered_target_ids = targets
                .iter()
                .rev()
                .map(|target| target.id.clone())
                .collect::<Vec<_>>();
            let (reorder_report, reordered) = build_pptx_slide_reorder_isolated(
                source,
                &ordered_target_ids,
                &first.expected_presentation_digest,
            )
            .unwrap_or_else(|error| panic!("{producer} reorder: {error}"));
            assert_eq!(reorder_report.operation, "slide-reorder");
            assert_eq!(reorder_report.changed_parts, ["ppt/presentation.xml"]);
            assert!(reorder_report.added_parts.is_empty());
            assert!(reorder_report.removed_parts.is_empty());
            assert_eq!(
                parse_pptx(&reordered)
                    .unwrap()
                    .slides
                    .iter()
                    .map(|slide| slide.id.clone())
                    .collect::<Vec<_>>(),
                targets
                    .iter()
                    .rev()
                    .map(|target| target.slide_id.clone())
                    .collect::<Vec<_>>(),
                "{producer} reordered identities"
            );
        }
    }

    #[test]
    fn c5c_rejects_stale_and_ambiguous_slide_operations() {
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let targets = inspect_pptx_editable_slide_targets(source).unwrap();
        let first = targets.first().unwrap();
        assert!(build_pptx_slide_add_isolated(
            source,
            &first.id,
            &"0".repeat(64),
            &first.expected_presentation_digest,
            &first.expected_relationships_digest,
        )
        .unwrap_err()
        .contains("已变化"));
        let duplicate_order = vec![first.id.clone(); targets.len()];
        assert!(build_pptx_slide_reorder_isolated(
            source,
            &duplicate_order,
            &first.expected_presentation_digest,
        )
        .unwrap_err()
        .contains("重复"));
        let unchanged_order = targets
            .iter()
            .map(|target| target.id.clone())
            .collect::<Vec<_>>();
        assert!(build_pptx_slide_reorder_isolated(
            source,
            &unchanged_order,
            &first.expected_presentation_digest,
        )
        .unwrap_err()
        .contains("相同"));
    }
}
