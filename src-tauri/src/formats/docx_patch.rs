use crate::formats::docx::{parse_docx, MAX_DOCX_FILE_BYTES};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const DOCX_EDITABLE_DOCUMENT_PART: &str = "word/document.xml";
const MAX_DOCX_DOCUMENT_PATCH_BYTES: usize = 32 * 1024 * 1024;
const DOCX_PATCH_DEFLATE_LEVEL: i64 = 4;

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
        },
        output,
    ))
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
}
