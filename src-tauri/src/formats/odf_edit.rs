use crate::formats::odf::inspect_odf_package;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use zip::{ZipArchive, ZipWriter};

const ODF_EDITABLE_PART: &str = "content.xml";

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

fn package_digest(source: &[u8]) -> String {
    format!("{:x}", Sha256::digest(source))
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
}
