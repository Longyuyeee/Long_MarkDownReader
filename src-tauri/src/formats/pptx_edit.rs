use crate::formats::pptx::parse_pptx;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_PPTX_EDITABLE_TEXT_CHARS: usize = 32_767;
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

#[derive(Clone, Debug)]
struct EditableTargetSpan {
    target: PptxEditableTextTarget,
    start: usize,
    end: usize,
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

fn forbidden_text_carrier(name: &[u8]) -> bool {
    matches!(
        name,
        b"fld"
            | b"br"
            | b"tab"
            | b"hlinkClick"
            | b"hlinkMouseOver"
            | b"custData"
            | b"contentPart"
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
                    current = Some(ShapeTextScan {
                        depth,
                        safe: true,
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

    parse_pptx(&output)
        .map_err(|error| format!("PPTX C4B 隔离输出结构复读失败: {error}"))?;
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
            next_stage: "C4B isolated single-text and speaker-notes patch".into(),
            editable_text_targets,
            editable_notes_targets,
            parts: source_parts,
        },
        isolated,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
