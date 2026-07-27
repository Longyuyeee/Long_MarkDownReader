use crate::formats::pptx::parse_pptx;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use zip::ZipArchive;

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
    pub parts: Vec<PptxPackagePartSnapshot>,
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
}
