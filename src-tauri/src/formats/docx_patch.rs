use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const DOCX_EDITABLE_DOCUMENT_PART: &str = "word/document.xml";
const MAX_DOCX_DOCUMENT_PATCH_BYTES: usize = 32 * 1024 * 1024;
const MAX_DOCX_EDITABLE_TEXT_CHARS: usize = 32_767;
const DOCX_PATCH_DEFLATE_LEVEL: i64 = 4;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxEditableTextTarget {
    pub id: String,
    pub block_id: String,
    pub kind: String,
    pub text: String,
    pub expected_text_digest: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocxIsolatedPatchReport {
    pub status: String,
    pub engine: String,
    pub target_part: String,
    pub source_digest: String,
    pub output_digest: String,
    pub source_part_digest: String,
    pub output_part_digest: String,
    pub changed_parts: Vec<String>,
    pub unchanged_part_count: usize,
    pub unchanged_parts_verified: bool,
    pub structural_reparse_verified: bool,
    pub temporary_copy_reopen_verified: bool,
    pub source_unchanged: bool,
    pub output_bytes: usize,
    pub semantic_target_id: Option<String>,
    pub semantic_kind: Option<String>,
    pub semantic_reparse_verified: bool,
}

#[derive(Clone, Debug)]
struct ParagraphTextSpan {
    paragraph_index: usize,
    text: String,
    start: usize,
    end: usize,
    safe: bool,
}

#[derive(Default)]
struct ParagraphScanState {
    paragraph_index: usize,
    text: String,
    span: Option<(usize, usize)>,
    text_element_count: usize,
    safe: bool,
    in_text: bool,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn read_part(source: &[u8], part_name: &str) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX OOXML 包失败: {error}"))?;
    let mut part = archive
        .by_name(part_name)
        .map_err(|error| format!("DOCX 目标部件 {part_name} 缺失: {error}"))?;
    if part.enclosed_name().is_none() {
        return Err("DOCX 目标部件路径不安全".into());
    }
    let mut bytes = Vec::with_capacity(part.size() as usize);
    part.read_to_end(&mut bytes)
        .map_err(|error| format!("读取 DOCX 目标部件失败: {error}"))?;
    Ok(bytes)
}

pub fn docx_document_part_digest(source: &[u8]) -> Result<String, String> {
    parse_docx(source)?;
    read_part(source, DOCX_EDITABLE_DOCUMENT_PART).map(|bytes| digest(&bytes))
}

fn forbidden_text_carrier(name: &[u8]) -> bool {
    matches!(
        name,
        b"numPr"
            | b"ins"
            | b"del"
            | b"moveFrom"
            | b"moveTo"
            | b"fldSimple"
            | b"instrText"
            | b"fldChar"
            | b"sdt"
            | b"hyperlink"
            | b"smartTag"
            | b"customXml"
            | b"drawing"
            | b"object"
            | b"pict"
            | b"altChunk"
            | b"commentRangeStart"
            | b"commentRangeEnd"
            | b"commentReference"
            | b"footnoteReference"
            | b"endnoteReference"
            | b"bookmarkStart"
            | b"bookmarkEnd"
            | b"proofErr"
            | b"permStart"
            | b"permEnd"
            | b"br"
            | b"cr"
            | b"tab"
            | b"sym"
    )
}

fn scan_document_paragraphs(document_xml: &[u8]) -> Result<Vec<ParagraphTextSpan>, String> {
    let mut reader = Reader::from_reader(document_xml);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut in_body = false;
    let mut table_depth = 0_usize;
    let mut sdt_depth = 0_usize;
    let mut paragraph_number = 0_usize;
    let mut current: Option<ParagraphScanState> = None;
    let mut spans = Vec::new();

    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("DOCX C2B 主文档 XML 损坏: {error}"))?
        {
            Event::Start(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                match name {
                    b"body" => in_body = true,
                    b"tbl" => table_depth += 1,
                    b"sdt" => sdt_depth += 1,
                    b"p" if in_body && table_depth == 0 => {
                        paragraph_number += 1;
                        current = Some(ParagraphScanState {
                            paragraph_index: paragraph_number,
                            safe: sdt_depth == 0,
                            ..Default::default()
                        });
                    }
                    _ => {}
                }
                if let Some(paragraph) = current.as_mut() {
                    if forbidden_text_carrier(name) {
                        paragraph.safe = false;
                    }
                    if name == b"t" {
                        paragraph.text_element_count += 1;
                        paragraph.in_text = true;
                    }
                }
            }
            Event::Empty(ref event) => {
                if let Some(paragraph) = current.as_mut() {
                    let name = event.local_name();
                    let name = name.as_ref();
                    if forbidden_text_carrier(name) {
                        paragraph.safe = false;
                    }
                    if name == b"t" {
                        paragraph.text_element_count += 1;
                        paragraph.safe = false;
                    }
                }
            }
            Event::Text(ref text) => {
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_text) {
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "DOCX C2B 文本位置超出平台范围")?;
                    let start = end.checked_sub(text.len()).ok_or("DOCX C2B 文本位置无效")?;
                    paragraph.span = Some(match paragraph.span {
                        Some((existing_start, existing_end)) if existing_end <= start => {
                            (existing_start, end)
                        }
                        Some(_) => {
                            paragraph.safe = false;
                            (start, end)
                        }
                        None => (start, end),
                    });
                    let value = text
                        .xml10_content()
                        .map_err(|error| format!("DOCX C2B 文本解码失败: {error}"))?;
                    paragraph.text.push_str(&value);
                }
            }
            Event::GeneralRef(ref reference) => {
                if let Some(paragraph) = current.as_mut().filter(|value| value.in_text) {
                    let reference_bytes: &[u8] = reference;
                    let end = usize::try_from(reader.buffer_position())
                        .map_err(|_| "DOCX C2B 实体位置超出平台范围")?;
                    let start = end
                        .checked_sub(reference_bytes.len() + 2)
                        .ok_or("DOCX C2B 实体位置无效")?;
                    paragraph.span = Some(match paragraph.span {
                        Some((existing_start, existing_end)) if existing_end <= start => {
                            (existing_start, end)
                        }
                        Some(_) => {
                            paragraph.safe = false;
                            (start, end)
                        }
                        None => (start, end),
                    });
                    match reference.resolve_char_ref() {
                        Ok(Some(value)) => paragraph.text.push(value),
                        Ok(None) => match reference_bytes {
                            b"amp" => paragraph.text.push('&'),
                            b"lt" => paragraph.text.push('<'),
                            b"gt" => paragraph.text.push('>'),
                            b"quot" => paragraph.text.push('"'),
                            b"apos" => paragraph.text.push('\''),
                            _ => paragraph.safe = false,
                        },
                        Err(_) => paragraph.safe = false,
                    }
                }
            }
            Event::End(ref event) => {
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"t" {
                    if let Some(paragraph) = current.as_mut() {
                        paragraph.in_text = false;
                    }
                } else if name == b"p" {
                    if let Some(paragraph) = current.take() {
                        if let Some((start, end)) = paragraph.span {
                            spans.push(ParagraphTextSpan {
                                paragraph_index: paragraph.paragraph_index,
                                text: paragraph.text,
                                start,
                                end,
                                safe: paragraph.safe && paragraph.text_element_count == 1,
                            });
                        }
                    }
                } else if name == b"tbl" {
                    table_depth = table_depth.saturating_sub(1);
                } else if name == b"sdt" {
                    sdt_depth = sdt_depth.saturating_sub(1);
                } else if name == b"body" {
                    in_body = false;
                }
            }
            Event::DocType(_) => return Err("DOCX C2B 不允许包含 DOCTYPE".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(spans)
}

fn editable_targets_with_spans(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<(DocxEditableTextTarget, ParagraphTextSpan)>, String> {
    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let paragraphs = scan_document_paragraphs(&document_xml)?;
    let mut block_cursor = 0_usize;
    let mut targets = Vec::new();

    for paragraph in paragraphs {
        let Some((offset, block)) =
            model.blocks[block_cursor..]
                .iter()
                .enumerate()
                .find(|(_, block)| {
                    matches!(
                        block.kind.as_str(),
                        "paragraph" | "heading" | "list-item" | "image"
                    ) && block.text == paragraph.text
                })
        else {
            continue;
        };
        block_cursor += offset + 1;
        if !paragraph.safe
            || paragraph.text.is_empty()
            || !matches!(block.kind.as_str(), "paragraph" | "heading")
        {
            continue;
        }
        let text_digest = digest(paragraph.text.as_bytes());
        targets.push((
            DocxEditableTextTarget {
                id: format!(
                    "docx-text-{}-{}",
                    paragraph.paragraph_index,
                    &text_digest[..12]
                ),
                block_id: block.id.clone(),
                kind: block.kind.clone(),
                text: paragraph.text.clone(),
                expected_text_digest: text_digest,
            },
            paragraph,
        ));
    }
    Ok(targets)
}

pub fn inspect_docx_editable_text_targets(
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<Vec<DocxEditableTextTarget>, String> {
    editable_targets_with_spans(source, model)
        .map(|targets| targets.into_iter().map(|(target, _)| target).collect())
}

fn package_part_digests(source: &[u8]) -> Result<BTreeMap<String, String>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX 差异审计包失败: {error}"))?;
    let mut parts = BTreeMap::new();
    for index in 0..archive.len() {
        let mut part = archive
            .by_index(index)
            .map_err(|error| format!("读取 DOCX 差异审计部件失败: {error}"))?;
        let name = part
            .enclosed_name()
            .ok_or("DOCX 差异审计发现不安全路径")?
            .to_string_lossy()
            .replace('\\', "/");
        let mut bytes = Vec::with_capacity(part.size() as usize);
        part.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 DOCX 部件 {name} 失败: {error}"))?;
        if parts.insert(name, digest(&bytes)).is_some() {
            return Err("DOCX 差异审计发现重复部件".into());
        }
    }
    Ok(parts)
}

fn rewrite_document_part(source: &[u8], replacement: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("打开 DOCX 原始包失败: {error}"))?;
    let output = Cursor::new(Vec::with_capacity(source.len()));
    let mut writer = ZipWriter::new(output);
    let mut replaced = false;

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 DOCX 原始部件失败: {error}"))?;
        let name = file.name().replace('\\', "/");
        if name == DOCX_EDITABLE_DOCUMENT_PART {
            if replaced {
                return Err("DOCX 主文档部件重复".into());
            }
            let compression = file.compression();
            drop(file);
            let mut options = SimpleFileOptions::default().compression_method(compression);
            if compression == CompressionMethod::Deflated {
                options = options.compression_level(Some(DOCX_PATCH_DEFLATE_LEVEL));
            }
            writer
                .start_file(DOCX_EDITABLE_DOCUMENT_PART, options)
                .map_err(|error| format!("创建 DOCX 目标部件失败: {error}"))?;
            writer
                .write_all(replacement)
                .map_err(|error| format!("写入 DOCX 目标部件失败: {error}"))?;
            replaced = true;
        } else {
            writer
                .raw_copy_file(file)
                .map_err(|error| format!("逐字节复制未修改 DOCX 部件失败: {error}"))?;
        }
    }
    if !replaced {
        return Err("DOCX 主文档部件缺失".into());
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| format!("完成 DOCX 隔离包失败: {error}"))
}

pub fn build_docx_document_patch_isolated(
    source: &[u8],
    expected_part_digest: &str,
    replacement_xml: &str,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    if source.len() as u64 > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 隔离补丁上限".into());
    }
    if replacement_xml.len() > MAX_DOCX_DOCUMENT_PATCH_BYTES {
        return Err("DOCX 主文档补丁超过 32 MiB 上限".into());
    }
    let expected_part_digest = expected_part_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_part_digest) {
        return Err("DOCX 目标部件摘要无效".into());
    }

    parse_docx(source)?;
    let source_parts = package_part_digests(source)?;
    let source_part_digest = source_parts
        .get(DOCX_EDITABLE_DOCUMENT_PART)
        .ok_or("DOCX 主文档部件缺失")?
        .clone();
    if source_part_digest != expected_part_digest {
        return Err("DOCX 主文档部件已变化，请重新读取后再验证补丁".into());
    }

    let output = rewrite_document_part(source, replacement_xml.as_bytes())?;
    parse_docx(&output).map_err(|error| format!("DOCX 隔离补丁写后重读失败: {error}"))?;
    let output_parts = package_part_digests(&output)?;
    if source_parts.len() != output_parts.len() || source_parts.keys().ne(output_parts.keys()) {
        return Err("DOCX 隔离补丁意外改变了包部件清单".into());
    }

    let changed_parts = source_parts
        .iter()
        .filter_map(|(name, source_digest)| {
            (output_parts.get(name) != Some(source_digest)).then(|| name.clone())
        })
        .collect::<Vec<_>>();
    if changed_parts != [DOCX_EDITABLE_DOCUMENT_PART.to_string()] {
        return Err(format!(
            "DOCX 隔离补丁差异超出白名单: {}",
            changed_parts.join(", ")
        ));
    }
    let output_part_digest = output_parts
        .get(DOCX_EDITABLE_DOCUMENT_PART)
        .ok_or("DOCX 输出主文档部件缺失")?
        .clone();

    Ok((
        DocxIsolatedPatchReport {
            status: "isolated_verified".into(),
            engine: "LongEdit C2A OOXML package patch".into(),
            target_part: DOCX_EDITABLE_DOCUMENT_PART.into(),
            source_digest: digest(source),
            output_digest: digest(&output),
            source_part_digest,
            output_part_digest,
            changed_parts,
            unchanged_part_count: source_parts.len().saturating_sub(1),
            unchanged_parts_verified: true,
            structural_reparse_verified: true,
            temporary_copy_reopen_verified: false,
            source_unchanged: false,
            output_bytes: output.len(),
            semantic_target_id: None,
            semantic_kind: None,
            semantic_reparse_verified: false,
        },
        output,
    ))
}

pub fn build_docx_text_patch_isolated(
    source: &[u8],
    target_id: &str,
    expected_text_digest: &str,
    replacement_text: &str,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    if replacement_text.is_empty() {
        return Err("DOCX C2B 暂不允许删除整个段落文本".into());
    }
    if replacement_text.chars().count() > MAX_DOCX_EDITABLE_TEXT_CHARS {
        return Err("DOCX C2B 段落文本超过 32,767 字符上限".into());
    }
    if replacement_text.chars().any(char::is_control) {
        return Err("DOCX C2B 普通段落不允许换行、制表符或控制字符".into());
    }
    let expected_text_digest = expected_text_digest.trim().to_ascii_lowercase();
    if !valid_digest(&expected_text_digest) {
        return Err("DOCX C2B 原文本摘要无效".into());
    }

    let model = parse_docx(source)?;
    let targets = editable_targets_with_spans(source, &model)?;
    let (target, span) = targets
        .into_iter()
        .find(|(target, _)| target.id == target_id)
        .ok_or("DOCX C2B 目标不存在或包含只读复杂结构")?;
    if target.expected_text_digest != expected_text_digest {
        return Err("DOCX C2B 目标文本已变化，请重新读取".into());
    }
    if target.text == replacement_text {
        return Err("DOCX C2B 替换文本没有变化".into());
    }

    let document_xml = read_part(source, DOCX_EDITABLE_DOCUMENT_PART)?;
    let escaped = quick_xml::escape::escape(replacement_text);
    let mut replacement_xml = Vec::with_capacity(
        document_xml.len() + escaped.len().saturating_sub(span.end - span.start),
    );
    replacement_xml.extend_from_slice(&document_xml[..span.start]);
    replacement_xml.extend_from_slice(escaped.as_bytes());
    replacement_xml.extend_from_slice(&document_xml[span.end..]);
    let replacement_xml = String::from_utf8(replacement_xml)
        .map_err(|_| "DOCX C2B 主文档不是有效 UTF-8，当前保持只读")?;
    let part_digest = digest(&document_xml);
    let (mut report, output) =
        build_docx_document_patch_isolated(source, &part_digest, &replacement_xml)?;

    let output_model = parse_docx(&output)?;
    let output_targets = inspect_docx_editable_text_targets(&output, &output_model)?;
    let semantic_match = output_targets.iter().any(|candidate| {
        candidate.block_id == target.block_id
            && candidate.kind == target.kind
            && candidate.text == replacement_text
    });
    if !semantic_match {
        return Err("DOCX C2B 隔离输出语义复读与目标文本不一致".into());
    }
    report.engine = "LongEdit C2B isolated paragraph text patch".into();
    report.semantic_target_id = Some(target.id);
    report.semantic_kind = Some(target.kind);
    report.semantic_reparse_verified = true;
    Ok((report, output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replace_once(source: &str, before: &str, after: &str) -> String {
        assert_eq!(source.matches(before).count(), 1);
        source.replacen(before, after, 1)
    }

    #[test]
    fn patches_real_word_fixture_and_preserves_every_other_part() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let document =
            String::from_utf8(read_part(source, DOCX_EDITABLE_DOCUMENT_PART).unwrap()).unwrap();
        let replacement = replace_once(
            &document,
            "Before explicit page break.",
            "Before isolated page break.",
        );
        let expected_digest = docx_document_part_digest(source).unwrap();
        let (report, output) =
            build_docx_document_patch_isolated(source, &expected_digest, &replacement).unwrap();

        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(report.unchanged_parts_verified);
        assert!(report.unchanged_part_count > 10);
        assert_ne!(report.source_digest, report.output_digest);
        assert_ne!(report.source_part_digest, report.output_part_digest);
        assert!(parse_docx(&output)
            .unwrap()
            .plain_text
            .contains("Before isolated page break."));
        assert_eq!(
            digest(source),
            "cae776e43d5cf54cd48f849969430d44d1daed14de9f02c2a6cec2fa96e03176"
        );
    }

    #[test]
    fn rejects_stale_digest_unsafe_xml_and_oversized_patch() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let document =
            String::from_utf8(read_part(source, DOCX_EDITABLE_DOCUMENT_PART).unwrap()).unwrap();
        assert!(
            build_docx_document_patch_isolated(source, &"0".repeat(64), &document)
                .unwrap_err()
                .contains("已变化")
        );

        let expected_digest = docx_document_part_digest(source).unwrap();
        assert!(build_docx_document_patch_isolated(
            source,
            &expected_digest,
            r#"<!DOCTYPE x><w:document xmlns:w="w"><w:body/></w:document>"#
        )
        .unwrap_err()
        .contains("DOCTYPE"));

        let oversized = "x".repeat(MAX_DOCX_DOCUMENT_PATCH_BYTES + 1);
        assert!(
            build_docx_document_patch_isolated(source, &expected_digest, &oversized)
                .unwrap_err()
                .contains("32 MiB")
        );
    }

    #[test]
    fn lists_only_safe_plain_paragraph_and_heading_targets() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();

        assert!(targets.iter().any(|target| {
            target.kind == "heading" && target.text == "Microsoft Word Producer Fixture"
        }));
        assert!(targets
            .iter()
            .any(|target| target.text == "Before explicit page break."));
        assert!(!targets.iter().any(|target| target.text
            == "This document was created and saved by Microsoft Word for LongEdit compatibility auditing."));
        assert!(!targets
            .iter()
            .any(|target| target.text == "Structured reading"));
        assert!(targets.iter().all(|target| {
            matches!(target.kind.as_str(), "paragraph" | "heading")
                && target.expected_text_digest.len() == 64
        }));
    }

    #[test]
    fn patches_safe_text_semantically_and_rejects_stale_or_complex_targets() {
        let source = include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx");
        let model = parse_docx(source).unwrap();
        let targets = inspect_docx_editable_text_targets(source, &model).unwrap();
        let target = targets
            .iter()
            .find(|target| target.text == "Before explicit page break.")
            .unwrap();
        let replacement = "Before isolated & <verified> page break.";
        let (report, output) = build_docx_text_patch_isolated(
            source,
            &target.id,
            &target.expected_text_digest,
            replacement,
        )
        .unwrap();

        assert_eq!(report.engine, "LongEdit C2B isolated paragraph text patch");
        assert_eq!(
            report.semantic_target_id.as_deref(),
            Some(target.id.as_str())
        );
        assert_eq!(report.semantic_kind.as_deref(), Some("paragraph"));
        assert!(report.semantic_reparse_verified);
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(parse_docx(&output)
            .unwrap()
            .plain_text
            .contains(replacement));

        assert!(
            build_docx_text_patch_isolated(source, &target.id, &"0".repeat(64), replacement)
                .unwrap_err()
                .contains("文本已变化")
        );
        assert!(build_docx_text_patch_isolated(
            source,
            "docx-text-complex-comment",
            &digest(b"complex"),
            replacement
        )
        .unwrap_err()
        .contains("只读复杂结构"));
        assert!(build_docx_text_patch_isolated(
            source,
            &target.id,
            &target.expected_text_digest,
            "line one\nline two"
        )
        .unwrap_err()
        .contains("控制字符"));
    }
}
