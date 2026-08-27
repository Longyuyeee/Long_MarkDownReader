use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::io::{Cursor, Read};
use zip::{CompressionMethod, ZipArchive};

pub const MAX_ODF_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ODF_ENTRIES: usize = 4_096;
const MAX_ODF_UNCOMPRESSED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ODF_XML_ENTRY_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ODF_XML_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ODF_COMPRESSION_RATIO: u64 = 200;
const MAX_ODF_XML_DEPTH: usize = 256;
const MAX_ODF_XML_EVENTS: usize = 1_000_000;

const ODT_MIME: &str = "application/vnd.oasis.opendocument.text";
const ODS_MIME: &str = "application/vnd.oasis.opendocument.spreadsheet";
const ODP_MIME: &str = "application/vnd.oasis.opendocument.presentation";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdfPackageRiskReport {
    pub risk_codes: Vec<String>,
    pub encrypted_entry_count: usize,
    pub signature_part_count: usize,
    pub script_marker_count: usize,
    pub external_link_count: usize,
    pub embedded_object_count: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdfPackageReport {
    pub format: String,
    pub root_mime_type: String,
    pub manifest_version: Option<String>,
    pub entry_count: usize,
    pub compressed_bytes: u64,
    pub uncompressed_bytes: u64,
    pub xml_bytes: u64,
    pub has_content: bool,
    pub has_styles: bool,
    pub has_meta: bool,
    pub has_settings: bool,
    pub risks: OdfPackageRiskReport,
}

#[derive(Clone, Copy)]
struct OdfLimits {
    file_bytes: u64,
    entries: usize,
    uncompressed_bytes: u64,
    xml_entry_bytes: u64,
    xml_total_bytes: u64,
    compression_ratio: u64,
    xml_depth: usize,
    xml_events: usize,
}

const DEFAULT_LIMITS: OdfLimits = OdfLimits {
    file_bytes: MAX_ODF_FILE_BYTES,
    entries: MAX_ODF_ENTRIES,
    uncompressed_bytes: MAX_ODF_UNCOMPRESSED_BYTES,
    xml_entry_bytes: MAX_ODF_XML_ENTRY_BYTES,
    xml_total_bytes: MAX_ODF_XML_TOTAL_BYTES,
    compression_ratio: MAX_ODF_COMPRESSION_RATIO,
    xml_depth: MAX_ODF_XML_DEPTH,
    xml_events: MAX_ODF_XML_EVENTS,
};

#[derive(Clone)]
struct EntryMetadata {
    name: String,
    size: u64,
    compressed_size: u64,
}

#[derive(Default)]
struct ManifestSummary {
    version: Option<String>,
    root_mime: Option<String>,
    listed_paths: HashSet<String>,
    encrypted_paths: HashSet<String>,
    embedded_paths: HashSet<String>,
}

#[derive(Default)]
struct RiskAccumulator {
    signature_parts: BTreeSet<String>,
    script_markers: BTreeSet<String>,
    external_links: usize,
    embedded_objects: BTreeSet<String>,
}

fn expected_format(extension: &str) -> Result<(&'static str, &'static str), String> {
    match extension.trim().to_ascii_lowercase().as_str() {
        ".odt" | "odt" => Ok(("odt", ODT_MIME)),
        ".ods" | "ods" => Ok(("ods", ODS_MIME)),
        ".odp" | "odp" => Ok(("odp", ODP_MIME)),
        _ => Err("ODF E1A 仅接受 .odt、.ods 或 .odp 预期格式".into()),
    }
}

fn normalize_entry_name(raw: &[u8], is_dir: bool) -> Result<String, String> {
    let name = std::str::from_utf8(raw).map_err(|_| "ODF ZIP 条目名称不是 UTF-8")?;
    if name.is_empty()
        || name.starts_with('/')
        || name.starts_with('\\')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err("ODF ZIP 包含不安全路径".into());
    }
    let trimmed = if is_dir {
        name.trim_end_matches('/')
    } else {
        name
    };
    if trimmed.is_empty()
        || trimmed
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || trimmed
            .split('/')
            .next()
            .is_some_and(|segment| segment.contains(':'))
    {
        return Err("ODF ZIP 包含不安全路径".into());
    }
    Ok(trimmed.to_string())
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODF XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("ODF XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn validate_reference(reference: &BytesRef<'_>) -> Result<(), String> {
    if reference
        .resolve_char_ref()
        .map_err(|error| format!("ODF XML 字符引用损坏: {error}"))?
        .is_some()
    {
        return Ok(());
    }
    let value: &[u8] = reference;
    if matches!(value, b"amp" | b"lt" | b"gt" | b"quot" | b"apos") {
        Ok(())
    } else {
        Err("ODF XML 包含未声明的实体引用".into())
    }
}

fn is_external_href(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("//")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("ftp:")
        || lower.starts_with("file:")
        || lower.starts_with("mailto:")
        || lower.starts_with("data:")
        || lower.starts_with("../")
}

fn is_script_element(local_name: &[u8]) -> bool {
    matches!(local_name, b"script" | b"event-listener")
}

fn inspect_common_xml(
    part_name: &str,
    xml: &[u8],
    limits: OdfLimits,
    risks: &mut RiskAccumulator,
) -> Result<(), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut event_count = 0_usize;
    loop {
        let event = reader
            .read_event()
            .map_err(|error| format!("ODF XML 部件 {part_name} 损坏: {error}"))?;
        event_count += 1;
        if event_count > limits.xml_events {
            return Err(format!("ODF XML 部件 {part_name} 事件数超过安全上限"));
        }
        match event {
            Event::Start(ref element) => {
                depth += 1;
                if depth > limits.xml_depth {
                    return Err(format!("ODF XML 部件 {part_name} 嵌套深度超过安全上限"));
                }
                if is_script_element(element.local_name().as_ref()) {
                    risks.script_markers.insert(part_name.to_string());
                }
                inspect_external_attributes(element, reader.decoder(), risks)?;
            }
            Event::Empty(ref element) => {
                if is_script_element(element.local_name().as_ref()) {
                    risks.script_markers.insert(part_name.to_string());
                }
                inspect_external_attributes(element, reader.decoder(), risks)?;
            }
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::DocType(_) => {
                return Err(format!("ODF XML 部件 {part_name} 不允许 DOCTYPE"));
            }
            Event::GeneralRef(ref reference) => validate_reference(reference)?,
            Event::Eof => break,
            _ => {}
        }
    }
    if depth != 0 {
        return Err(format!("ODF XML 部件 {part_name} 标签未闭合"));
    }
    Ok(())
}

fn inspect_external_attributes(
    element: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    risks: &mut RiskAccumulator,
) -> Result<(), String> {
    for attribute in element.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("ODF XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() != b"href" {
            continue;
        }
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
            .map_err(|error| format!("ODF XML 链接属性解码失败: {error}"))?;
        if is_external_href(&value) {
            risks.external_links = risks.external_links.saturating_add(1);
        }
    }
    Ok(())
}

fn parse_manifest(
    xml: &[u8],
    limits: OdfLimits,
    risks: &mut RiskAccumulator,
) -> Result<ManifestSummary, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut summary = ManifestSummary::default();
    let mut current_entry: Option<String> = None;
    let mut depth = 0_usize;
    let mut event_count = 0_usize;
    loop {
        let event = reader
            .read_event()
            .map_err(|error| format!("ODF manifest.xml 损坏: {error}"))?;
        event_count += 1;
        if event_count > limits.xml_events {
            return Err("ODF manifest.xml 事件数超过安全上限".into());
        }
        match event {
            Event::Start(ref element) => {
                depth += 1;
                if depth > limits.xml_depth {
                    return Err("ODF manifest.xml 嵌套深度超过安全上限".into());
                }
                let local_name = element.local_name();
                if local_name.as_ref() == b"manifest" && summary.version.is_none() {
                    summary.version = attribute_value(element, b"version", reader.decoder())?;
                }
                if local_name.as_ref() == b"file-entry" {
                    let path = attribute_value(element, b"full-path", reader.decoder())?
                        .ok_or("ODF manifest file-entry 缺少 full-path")?;
                    let media_type = attribute_value(element, b"media-type", reader.decoder())?
                        .unwrap_or_default();
                    if path == "/" {
                        if summary.root_mime.is_some() {
                            return Err("ODF manifest 包含重复根 file-entry".into());
                        }
                        summary.root_mime = Some(media_type);
                    } else {
                        if path.contains('\\')
                            || path.starts_with('/')
                            || path.trim_end_matches('/').split('/').any(|segment| {
                                segment.is_empty() || segment == "." || segment == ".."
                            })
                        {
                            return Err("ODF manifest 包含不安全路径".into());
                        }
                        if !summary.listed_paths.insert(path.clone()) {
                            return Err("ODF manifest 包含重复 file-entry".into());
                        }
                        if is_embedded_object(&path, &media_type) {
                            summary.embedded_paths.insert(path.clone());
                        }
                    }
                    current_entry = Some(path);
                } else if local_name.as_ref() == b"encryption-data" {
                    let path = current_entry
                        .clone()
                        .ok_or("ODF manifest encryption-data 缺少所属 file-entry")?;
                    summary.encrypted_paths.insert(path);
                }
                if is_script_element(local_name.as_ref()) {
                    risks.script_markers.insert("META-INF/manifest.xml".into());
                }
                inspect_external_attributes(element, reader.decoder(), risks)?;
            }
            Event::Empty(ref element) => {
                let local_name = element.local_name();
                if local_name.as_ref() == b"file-entry" {
                    let path = attribute_value(element, b"full-path", reader.decoder())?
                        .ok_or("ODF manifest file-entry 缺少 full-path")?;
                    let media_type = attribute_value(element, b"media-type", reader.decoder())?
                        .unwrap_or_default();
                    if path == "/" {
                        if summary.root_mime.is_some() {
                            return Err("ODF manifest 包含重复根 file-entry".into());
                        }
                        summary.root_mime = Some(media_type);
                    } else {
                        if path.contains('\\')
                            || path.starts_with('/')
                            || path.trim_end_matches('/').split('/').any(|segment| {
                                segment.is_empty() || segment == "." || segment == ".."
                            })
                        {
                            return Err("ODF manifest 包含不安全路径".into());
                        }
                        if !summary.listed_paths.insert(path.clone()) {
                            return Err("ODF manifest 包含重复 file-entry".into());
                        }
                        if is_embedded_object(&path, &media_type) {
                            summary.embedded_paths.insert(path);
                        }
                    }
                } else if local_name.as_ref() == b"encryption-data" {
                    let path = current_entry
                        .clone()
                        .ok_or("ODF manifest encryption-data 缺少所属 file-entry")?;
                    summary.encrypted_paths.insert(path);
                }
                inspect_external_attributes(element, reader.decoder(), risks)?;
            }
            Event::End(ref element) => {
                if element.local_name().as_ref() == b"file-entry" {
                    current_entry = None;
                }
                depth = depth.saturating_sub(1);
            }
            Event::DocType(_) => return Err("ODF manifest.xml 不允许 DOCTYPE".into()),
            Event::GeneralRef(ref reference) => validate_reference(reference)?,
            Event::Eof => break,
            _ => {}
        }
    }
    if depth != 0 {
        return Err("ODF manifest.xml 标签未闭合".into());
    }
    Ok(summary)
}

fn is_embedded_object(path: &str, media_type: &str) -> bool {
    let normalized = path.trim_end_matches('/');
    let lower_path = normalized.to_ascii_lowercase();
    let lower_mime = media_type.to_ascii_lowercase();
    lower_path.starts_with("object ")
        || lower_path.starts_with("objects/")
        || lower_mime.contains("ole")
        || lower_mime.contains("object")
}

fn read_entry(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    let mut entry = archive
        .by_name(name)
        .map_err(|error| format!("ODF 缺少或无法读取 {name}: {error}"))?;
    if entry.size() > max_bytes {
        return Err(format!("ODF XML 部件 {name} 超过安全上限"));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取 ODF 部件 {name} 失败: {error}"))?;
    Ok(bytes)
}

fn inspect_odf_package_with_limits(
    source: &[u8],
    expected_extension: &str,
    limits: OdfLimits,
) -> Result<OdfPackageReport, String> {
    let (format, expected_mime) = expected_format(expected_extension)?;
    if source.len() as u64 > limits.file_bytes {
        return Err("ODF 文件超过读取安全上限".into());
    }
    if !source.starts_with(b"PK") {
        return Err("ODF 文件不是 ZIP 包".into());
    }

    let mut archive =
        ZipArchive::new(Cursor::new(source)).map_err(|error| format!("ODF ZIP 包损坏: {error}"))?;
    if archive.len() == 0 || archive.len() > limits.entries {
        return Err("ODF ZIP 条目数量超出安全范围".into());
    }

    {
        let first = archive
            .by_index(0)
            .map_err(|error| format!("读取 ODF 首条目失败: {error}"))?;
        if first.name_raw() != b"mimetype"
            || first.compression() != CompressionMethod::Stored
            || first.extra_data().is_some_and(|value| !value.is_empty())
        {
            return Err("ODF 首条目必须是无压缩、无额外字段的 mimetype".into());
        }
    }

    let mut entries = Vec::with_capacity(archive.len());
    let mut canonical_names = HashSet::new();
    let mut total_uncompressed = 0_u64;
    let mut total_compressed = 0_u64;
    let mut total_xml = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("读取 ODF ZIP 目录失败: {error}"))?;
        if entry.enclosed_name().is_none() {
            return Err(format!("ODF ZIP 包含不安全路径: {}", entry.name()));
        }
        let name = normalize_entry_name(entry.name_raw(), entry.is_dir())?;
        if !canonical_names.insert(name.to_ascii_lowercase()) {
            return Err("ODF ZIP 包含重复或大小写冲突条目".into());
        }
        total_uncompressed = total_uncompressed.saturating_add(entry.size());
        total_compressed = total_compressed.saturating_add(entry.compressed_size());
        if total_uncompressed > limits.uncompressed_bytes {
            return Err("ODF 解压后总量超过安全上限".into());
        }
        if !entry.is_dir()
            && entry.size() > 1024 * 1024
            && entry.compressed_size() > 0
            && entry.size() / entry.compressed_size() > limits.compression_ratio
        {
            return Err(format!("ODF ZIP 条目压缩比超过安全上限: {name}"));
        }
        if name.to_ascii_lowercase().ends_with(".xml") {
            if entry.size() > limits.xml_entry_bytes {
                return Err(format!("ODF XML 部件 {name} 超过安全上限"));
            }
            total_xml = total_xml.saturating_add(entry.size());
            if total_xml > limits.xml_total_bytes {
                return Err("ODF XML 累计大小超过安全上限".into());
            }
        }
        entries.push(EntryMetadata {
            name,
            size: entry.size(),
            compressed_size: entry.compressed_size(),
        });
    }

    let mut mimetype = String::new();
    archive
        .by_name("mimetype")
        .map_err(|error| format!("ODF mimetype 缺失: {error}"))?
        .take(256)
        .read_to_string(&mut mimetype)
        .map_err(|error| format!("ODF mimetype 读取失败: {error}"))?;
    if mimetype != expected_mime {
        return Err(format!(
            "ODF 扩展名与 mimetype 不一致: 预期 {expected_mime}"
        ));
    }

    if !canonical_names.contains("meta-inf/manifest.xml")
        || !canonical_names.contains("content.xml")
    {
        return Err("ODF 包缺少 META-INF/manifest.xml 或 content.xml".into());
    }
    let manifest_xml = read_entry(
        &mut archive,
        "META-INF/manifest.xml",
        limits.xml_entry_bytes,
    )?;
    let mut risk_accumulator = RiskAccumulator::default();
    let manifest = parse_manifest(&manifest_xml, limits, &mut risk_accumulator)?;
    if manifest.root_mime.as_deref() != Some(expected_mime) {
        return Err("ODF manifest 根媒体类型与扩展名/mimetype 不一致".into());
    }
    if !manifest.listed_paths.contains("content.xml") {
        return Err("ODF manifest 未登记 content.xml".into());
    }

    for entry in &entries {
        let lower = entry.name.to_ascii_lowercase();
        if lower.starts_with("meta-inf/")
            && (lower.contains("signature") || lower.ends_with("signatures.xml"))
        {
            risk_accumulator.signature_parts.insert(entry.name.clone());
        }
        if lower.starts_with("scripts/")
            || lower.starts_with("basic/")
            || lower.ends_with(".js")
            || lower.ends_with(".class")
        {
            risk_accumulator.script_markers.insert(entry.name.clone());
        }
        if is_embedded_object(&entry.name, "") {
            risk_accumulator.embedded_objects.insert(entry.name.clone());
        }
    }
    risk_accumulator
        .embedded_objects
        .extend(manifest.embedded_paths.iter().cloned());

    for entry in &entries {
        if !entry.name.to_ascii_lowercase().ends_with(".xml")
            || entry.name == "META-INF/manifest.xml"
            || manifest.encrypted_paths.contains(&entry.name)
        {
            continue;
        }
        let xml = read_entry(&mut archive, &entry.name, limits.xml_entry_bytes)?;
        inspect_common_xml(&entry.name, &xml, limits, &mut risk_accumulator)?;
    }

    let mut risk_codes = BTreeSet::new();
    if !manifest.encrypted_paths.is_empty() {
        risk_codes.insert("encrypted-content".to_string());
    }
    if !risk_accumulator.signature_parts.is_empty() {
        risk_codes.insert("digital-signature".to_string());
    }
    if !risk_accumulator.script_markers.is_empty() {
        risk_codes.insert("script-or-macro".to_string());
    }
    if risk_accumulator.external_links > 0 {
        risk_codes.insert("external-link".to_string());
    }
    if !risk_accumulator.embedded_objects.is_empty() {
        risk_codes.insert("embedded-object".to_string());
    }

    let by_name: HashMap<&str, &EntryMetadata> = entries
        .iter()
        .map(|entry| (entry.name.as_str(), entry))
        .collect();
    let _mimetype_metadata = by_name
        .get("mimetype")
        .filter(|entry| entry.size <= 255 && entry.compressed_size == entry.size)
        .ok_or("ODF mimetype 条目大小或存储方式无效")?;

    Ok(OdfPackageReport {
        format: format.into(),
        root_mime_type: expected_mime.into(),
        manifest_version: manifest.version,
        entry_count: entries.len(),
        compressed_bytes: total_compressed,
        uncompressed_bytes: total_uncompressed,
        xml_bytes: total_xml,
        has_content: canonical_names.contains("content.xml"),
        has_styles: canonical_names.contains("styles.xml"),
        has_meta: canonical_names.contains("meta.xml"),
        has_settings: canonical_names.contains("settings.xml"),
        risks: OdfPackageRiskReport {
            risk_codes: risk_codes.into_iter().collect(),
            encrypted_entry_count: manifest.encrypted_paths.len(),
            signature_part_count: risk_accumulator.signature_parts.len(),
            script_marker_count: risk_accumulator.script_markers.len(),
            external_link_count: risk_accumulator.external_links,
            embedded_object_count: risk_accumulator.embedded_objects.len(),
        },
    })
}

pub fn inspect_odf_package(
    source: &[u8],
    expected_extension: &str,
) -> Result<OdfPackageReport, String> {
    inspect_odf_package_with_limits(source, expected_extension, DEFAULT_LIMITS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[derive(Clone, Copy)]
    struct FixtureEntry<'a> {
        name: &'a str,
        content: &'a [u8],
        compression: CompressionMethod,
    }

    fn fixture(extension: &str, extras: &[FixtureEntry<'_>]) -> Vec<u8> {
        let (_, mime) = expected_format(extension).unwrap();
        let manifest = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="{mime}"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>"#
        );
        let content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:mimetype="{mime}"><office:body/></office:document-content>"#
        );
        let mut entries = vec![
            FixtureEntry {
                name: "mimetype",
                content: mime.as_bytes(),
                compression: CompressionMethod::Stored,
            },
            FixtureEntry {
                name: "META-INF/manifest.xml",
                content: manifest.as_bytes(),
                compression: CompressionMethod::Deflated,
            },
            FixtureEntry {
                name: "content.xml",
                content: content.as_bytes(),
                compression: CompressionMethod::Deflated,
            },
        ];
        entries.extend(extras.iter().copied());
        package(&entries)
    }

    fn package(entries: &[FixtureEntry<'_>]) -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut output);
            for entry in entries {
                writer
                    .start_file(
                        entry.name,
                        SimpleFileOptions::default().compression_method(entry.compression),
                    )
                    .unwrap();
                writer.write_all(entry.content).unwrap();
            }
            writer.finish().unwrap();
        }
        output.into_inner()
    }

    fn manifest_fixture(extension: &str, manifest: &str, extras: &[FixtureEntry<'_>]) -> Vec<u8> {
        let (_, mime) = expected_format(extension).unwrap();
        let content = format!(
            r#"<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"><office:body><office:text/></office:body></office:document-content>"#
        );
        let mut entries = vec![
            FixtureEntry {
                name: "mimetype",
                content: mime.as_bytes(),
                compression: CompressionMethod::Stored,
            },
            FixtureEntry {
                name: "META-INF/manifest.xml",
                content: manifest.as_bytes(),
                compression: CompressionMethod::Deflated,
            },
            FixtureEntry {
                name: "content.xml",
                content: content.as_bytes(),
                compression: CompressionMethod::Deflated,
            },
        ];
        entries.extend(extras.iter().map(|entry| FixtureEntry {
            name: entry.name,
            content: entry.content,
            compression: entry.compression,
        }));
        package(&entries)
    }

    #[test]
    fn accepts_minimal_odt_ods_and_odp_packages() {
        for extension in [".odt", ".ods", ".odp"] {
            let source = fixture(extension, &[]);
            let original = source.clone();
            let report = inspect_odf_package(&source, extension).unwrap();
            assert_eq!(report.format, extension.trim_start_matches('.'));
            assert_eq!(report.manifest_version.as_deref(), Some("1.3"));
            assert!(report.has_content);
            assert!(report.risks.risk_codes.is_empty());
            assert!(report.xml_bytes > 0);
            assert_eq!(source, original);
        }
    }

    #[test]
    fn rejects_non_zip_unknown_extension_and_mime_spoofing() {
        assert!(inspect_odf_package(b"not zip", ".odt")
            .unwrap_err()
            .contains("ZIP"));
        assert!(inspect_odf_package(&fixture(".odt", &[]), ".unknown")
            .unwrap_err()
            .contains("仅接受"));
        assert!(inspect_odf_package(&fixture(".odt", &[]), ".ods")
            .unwrap_err()
            .contains("mimetype"));
    }

    #[test]
    fn rejects_mimetype_that_is_not_first_or_is_compressed() {
        let (_, mime) = expected_format(".odt").unwrap();
        let later_mimetype = package(&[
            FixtureEntry {
                name: "content.xml",
                content: b"<content/>",
                compression: CompressionMethod::Deflated,
            },
            FixtureEntry {
                name: "mimetype",
                content: mime.as_bytes(),
                compression: CompressionMethod::Stored,
            },
        ]);
        assert!(inspect_odf_package(&later_mimetype, ".odt")
            .unwrap_err()
            .contains("首条目"));

        let compressed = package(&[FixtureEntry {
            name: "mimetype",
            content: mime.as_bytes(),
            compression: CompressionMethod::Deflated,
        }]);
        assert!(inspect_odf_package(&compressed, ".odt")
            .unwrap_err()
            .contains("无压缩"));
    }

    #[test]
    fn rejects_missing_or_inconsistent_manifest_contract() {
        let (_, mime) = expected_format(".odt").unwrap();
        let missing = package(&[
            FixtureEntry {
                name: "mimetype",
                content: mime.as_bytes(),
                compression: CompressionMethod::Stored,
            },
            FixtureEntry {
                name: "content.xml",
                content: b"<content/>",
                compression: CompressionMethod::Deflated,
            },
        ]);
        assert!(inspect_odf_package(&missing, ".odt")
            .unwrap_err()
            .contains("manifest"));

        let wrong_root = r#"<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>"#;
        assert!(
            inspect_odf_package(&manifest_fixture(".odt", wrong_root, &[]), ".odt")
                .unwrap_err()
                .contains("根媒体类型")
        );

        let duplicate_entry = format!(
            r#"<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="{ODT_MIME}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>"#
        );
        assert!(
            inspect_odf_package(&manifest_fixture(".odt", &duplicate_entry, &[]), ".odt")
                .unwrap_err()
                .contains("重复 file-entry")
        );
    }

    #[test]
    fn rejects_unsafe_duplicate_and_case_conflicting_paths() {
        let unsafe_package = fixture(
            ".odt",
            &[FixtureEntry {
                name: "../outside.xml",
                content: b"<x/>",
                compression: CompressionMethod::Deflated,
            }],
        );
        assert!(inspect_odf_package(&unsafe_package, ".odt")
            .unwrap_err()
            .contains("不安全路径"));

        let duplicate = fixture(
            ".odt",
            &[FixtureEntry {
                name: "CONTENT.XML",
                content: b"<x/>",
                compression: CompressionMethod::Deflated,
            }],
        );
        assert!(inspect_odf_package(&duplicate, ".odt")
            .unwrap_err()
            .contains("大小写冲突"));
    }

    #[test]
    fn rejects_doctype_custom_entities_and_excessive_xml_depth() {
        for malicious in [
            br#"<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>"#.as_slice(),
            br#"<x>&custom;</x>"#.as_slice(),
        ] {
            let source = fixture(
                ".odt",
                &[FixtureEntry {
                    name: "styles.xml",
                    content: malicious,
                    compression: CompressionMethod::Deflated,
                }],
            );
            let error = inspect_odf_package(&source, ".odt").unwrap_err();
            assert!(error.contains("DOCTYPE") || error.contains("实体"));
        }

        let deep_xml = format!("{}{}", "<x>".repeat(12), "</x>".repeat(12));
        let source = fixture(
            ".odt",
            &[FixtureEntry {
                name: "styles.xml",
                content: deep_xml.as_bytes(),
                compression: CompressionMethod::Deflated,
            }],
        );
        let mut limits = DEFAULT_LIMITS;
        limits.xml_depth = 8;
        assert!(inspect_odf_package_with_limits(&source, ".odt", limits)
            .unwrap_err()
            .contains("嵌套深度"));
    }

    #[test]
    fn reports_encryption_signatures_scripts_external_links_and_embedded_objects() {
        let mime = ODT_MIME;
        let manifest = format!(
            r#"<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="{mime}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"><manifest:encryption-data/></manifest:file-entry>
<manifest:file-entry manifest:full-path="Object 1/" manifest:media-type="application/vnd.sun.star.oleobject"/>
</manifest:manifest>"#
        );
        let source = manifest_fixture(
            ".odt",
            &manifest,
            &[
                FixtureEntry {
                    name: "META-INF/documentsignatures.xml",
                    content: b"<signatures/>",
                    compression: CompressionMethod::Deflated,
                },
                FixtureEntry {
                    name: "Scripts/python/start.py",
                    content: b"print('never executed')",
                    compression: CompressionMethod::Deflated,
                },
                FixtureEntry {
                    name: "Object 1/object.bin",
                    content: b"embedded",
                    compression: CompressionMethod::Stored,
                },
                FixtureEntry {
                    name: "settings.xml",
                    content: br#"<config xmlns:xlink="x"><link xlink:href="https://example.com/data"/></config>"#,
                    compression: CompressionMethod::Deflated,
                },
            ],
        );
        let report = inspect_odf_package(&source, ".odt").unwrap();
        assert_eq!(
            report.risks.risk_codes,
            vec![
                "digital-signature",
                "embedded-object",
                "encrypted-content",
                "external-link",
                "script-or-macro"
            ]
        );
        assert_eq!(report.risks.encrypted_entry_count, 1);
        assert_eq!(report.risks.signature_part_count, 1);
        assert!(report.risks.script_marker_count >= 1);
        assert_eq!(report.risks.external_link_count, 1);
        assert!(report.risks.embedded_object_count >= 1);
    }

    #[test]
    fn empty_script_containers_are_not_reported_as_macros() {
        let source = fixture(
            ".ods",
            &[FixtureEntry {
                name: "settings.xml",
                content: br#"<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:scripts/><office:event-listeners/></office:document-settings>"#,
                compression: CompressionMethod::Deflated,
            }],
        );
        let report = inspect_odf_package(&source, ".ods").unwrap();
        assert_eq!(report.risks.script_marker_count, 0);
        assert!(!report
            .risks
            .risk_codes
            .iter()
            .any(|code| code == "script-or-macro"));

        let scripted = fixture(
            ".ods",
            &[FixtureEntry {
                name: "settings.xml",
                content: br#"<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:scripts><office:script/></office:scripts></office:document-settings>"#,
                compression: CompressionMethod::Deflated,
            }],
        );
        assert!(inspect_odf_package(&scripted, ".ods")
            .unwrap()
            .risks
            .risk_codes
            .iter()
            .any(|code| code == "script-or-macro"));
    }

    #[test]
    fn enforces_entry_uncompressed_xml_and_compression_ratio_budgets() {
        let source = fixture(
            ".odt",
            &[FixtureEntry {
                name: "Pictures/large.bin",
                content: &[0_u8; 4096],
                compression: CompressionMethod::Deflated,
            }],
        );

        let mut entry_limits = DEFAULT_LIMITS;
        entry_limits.entries = 2;
        assert!(
            inspect_odf_package_with_limits(&source, ".odt", entry_limits)
                .unwrap_err()
                .contains("条目数量")
        );

        let mut file_limits = DEFAULT_LIMITS;
        file_limits.file_bytes = source.len() as u64 - 1;
        assert!(
            inspect_odf_package_with_limits(&source, ".odt", file_limits)
                .unwrap_err()
                .contains("文件超过")
        );

        let mut uncompressed_limits = DEFAULT_LIMITS;
        uncompressed_limits.uncompressed_bytes = 1024;
        assert!(
            inspect_odf_package_with_limits(&source, ".odt", uncompressed_limits)
                .unwrap_err()
                .contains("解压后总量")
        );

        let xml_source = fixture(
            ".odt",
            &[FixtureEntry {
                name: "styles.xml",
                content: b"<styles/>",
                compression: CompressionMethod::Deflated,
            }],
        );
        let mut xml_limits = DEFAULT_LIMITS;
        xml_limits.xml_total_bytes = 64;
        assert!(
            inspect_odf_package_with_limits(&xml_source, ".odt", xml_limits)
                .unwrap_err()
                .contains("XML 累计")
        );

        let mut xml_entry_limits = DEFAULT_LIMITS;
        xml_entry_limits.xml_entry_bytes = 32;
        assert!(
            inspect_odf_package_with_limits(&xml_source, ".odt", xml_entry_limits)
                .unwrap_err()
                .contains("XML 部件")
        );

        let mut xml_event_limits = DEFAULT_LIMITS;
        xml_event_limits.xml_events = 2;
        assert!(
            inspect_odf_package_with_limits(&xml_source, ".odt", xml_event_limits)
                .unwrap_err()
                .contains("事件数")
        );

        let mut ratio_limits = DEFAULT_LIMITS;
        ratio_limits.compression_ratio = 1;
        let ratio_source = fixture(
            ".odt",
            &[FixtureEntry {
                name: "Pictures/repeated.bin",
                content: &[0_u8; 2 * 1024 * 1024],
                compression: CompressionMethod::Deflated,
            }],
        );
        assert!(
            inspect_odf_package_with_limits(&ratio_source, ".odt", ratio_limits)
                .unwrap_err()
                .contains("压缩比")
        );
    }

    #[test]
    fn report_serializes_with_stable_camel_case_contract() {
        let report = inspect_odf_package(&fixture(".odt", &[]), ".odt").unwrap();
        let value = serde_json::to_value(report).unwrap();
        assert_eq!(value["rootMimeType"], ODT_MIME);
        assert!(value["risks"]["riskCodes"].is_array());
        assert!(value.get("uncompressedBytes").is_some());
    }
}
