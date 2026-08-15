use crate::formats::pdf_watermark::{
    digest, has_digital_signature, has_embedded_files, has_pdfa_marker, page_geometry,
    preservation_inventory, validated_page_ids,
};
use lopdf::xref::XrefType;
use lopdf::{decode_text_string, text_string, Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_PDF_METADATA_SOURCE_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_PDF_METADATA_OUTPUT_BYTES: usize = 256 * 1024 * 1024;
const MAX_INFO_ENTRIES: usize = 32;
const MAX_DECODED_INFO_BYTES: usize = 64 * 1024;
const EDITABLE_KEYS: [&[u8]; 4] = [b"Title", b"Author", b"Subject", b"Keywords"];
const PRESERVED_KEYS: [&[u8]; 5] = [
    b"Creator",
    b"Producer",
    b"CreationDate",
    b"ModDate",
    b"Trapped",
];

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadataValues {
    pub title: String,
    pub author: String,
    pub subject: String,
    pub keywords: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadataCopyReport {
    pub status: String,
    pub engine: String,
    pub blockers: Vec<String>,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub source_pages: usize,
    pub output_bytes: usize,
    pub existing_values: PdfMetadataValues,
    pub requested_values: PdfMetadataValues,
    pub updated_fields: Vec<String>,
    pub removed_fields: Vec<String>,
    pub structural_reopen_verified: bool,
    pub metadata_reopen_verified: bool,
    pub preserved_info_verified: bool,
    pub preserved_structure_verified: bool,
    pub full_rewrite_verified: bool,
}

fn field_limit(key: &[u8]) -> usize {
    match key {
        b"Title" | b"Author" => 256,
        _ => 512,
    }
}

fn validate_value(key: &[u8], value: &str) -> Result<(), String> {
    if value.chars().count() > field_limit(key) {
        return Err(format!(
            "PDF 元数据 {} 超过 {} 个 Unicode 字符上限",
            String::from_utf8_lossy(key),
            field_limit(key)
        ));
    }
    if value.chars().any(|character| {
        character.is_control()
            || matches!(
                character as u32,
                0x061c | 0x200e..=0x200f | 0x202a..=0x202e | 0x2066..=0x2069
            )
    }) {
        return Err("PDF 元数据不支持控制符、空字符或双向覆盖字符".into());
    }
    Ok(())
}

fn requested_entries(values: &PdfMetadataValues) -> [(&'static [u8], &str); 4] {
    [
        (b"Title", values.title.as_str()),
        (b"Author", values.author.as_str()),
        (b"Subject", values.subject.as_str()),
        (b"Keywords", values.keywords.as_str()),
    ]
}

fn resolve_info<'a>(document: &'a Document) -> Result<(Option<ObjectId>, Dictionary), String> {
    let Ok(info) = document.trailer.get(b"Info") else {
        return Ok((None, Dictionary::new()));
    };
    let reference = info.as_reference().ok();
    let (_, resolved) = document
        .dereference(info)
        .map_err(|_| "malformed_or_cyclic_info_dictionary".to_string())?;
    let dictionary = resolved
        .as_dict()
        .map_err(|_| "malformed_or_cyclic_info_dictionary".to_string())?;
    Ok((reference, dictionary.clone()))
}

fn inspect_info(
    dictionary: &Dictionary,
) -> Result<(PdfMetadataValues, BTreeMap<Vec<u8>, Object>), String> {
    if dictionary.len() > MAX_INFO_ENTRIES {
        return Err("info_dictionary_budget_exceeded".into());
    }
    let allowed = EDITABLE_KEYS
        .iter()
        .chain(PRESERVED_KEYS.iter())
        .copied()
        .collect::<BTreeSet<_>>();
    let mut decoded = BTreeMap::new();
    let mut preserved = BTreeMap::new();
    let mut decoded_bytes = 0usize;
    for (key, value) in dictionary.iter() {
        if !allowed.contains(key.as_slice()) {
            return Err("custom_info_keys_present".into());
        }
        if EDITABLE_KEYS.contains(&key.as_slice()) {
            let text = decode_text_string(value)
                .map_err(|_| "invalid_text_encoding_or_forbidden_control".to_string())?;
            validate_value(key, &text)
                .map_err(|_| "invalid_text_encoding_or_forbidden_control".to_string())?;
            decoded_bytes = decoded_bytes.saturating_add(text.len());
            decoded.insert(key.clone(), text);
        } else {
            decoded_bytes = decoded_bytes.saturating_add(match value {
                Object::String(bytes, _) | Object::Name(bytes) => bytes.len(),
                _ => return Err("malformed_or_cyclic_info_dictionary".into()),
            });
            preserved.insert(key.clone(), value.clone());
        }
    }
    if decoded_bytes > MAX_DECODED_INFO_BYTES {
        return Err("info_dictionary_budget_exceeded".into());
    }
    Ok((
        PdfMetadataValues {
            title: decoded.remove(b"Title".as_slice()).unwrap_or_default(),
            author: decoded.remove(b"Author".as_slice()).unwrap_or_default(),
            subject: decoded.remove(b"Subject".as_slice()).unwrap_or_default(),
            keywords: decoded.remove(b"Keywords".as_slice()).unwrap_or_default(),
        },
        preserved,
    ))
}

fn contains_embedded_file_objects(document: &Document) -> bool {
    has_embedded_files(document)
        || document.objects.values().any(|object| {
            let dictionary = match object {
                Object::Dictionary(dictionary) => Some(dictionary),
                Object::Stream(stream) => Some(&stream.dict),
                _ => None,
            };
            dictionary.is_some_and(|dictionary| {
                dictionary
                    .get(b"Type")
                    .and_then(Object::as_name)
                    .is_ok_and(|name| matches!(name, b"EmbeddedFile" | b"Filespec"))
                    || dictionary
                        .get(b"Subtype")
                        .and_then(Object::as_name)
                        .is_ok_and(|name| name == b"FileAttachment")
            })
        })
}

fn non_info_objects(
    document: &Document,
    info_reference: Option<ObjectId>,
) -> BTreeMap<ObjectId, Object> {
    fn visit(
        document: &Document,
        object: &Object,
        info_reference: Option<ObjectId>,
        visited: &mut BTreeSet<ObjectId>,
        result: &mut BTreeMap<ObjectId, Object>,
    ) {
        match object {
            Object::Reference(id) if Some(*id) != info_reference && visited.insert(*id) => {
                if let Ok(resolved) = document.get_object(*id) {
                    result.insert(*id, resolved.clone());
                    visit(document, resolved, info_reference, visited, result);
                }
            }
            Object::Array(values) => {
                for value in values {
                    visit(document, value, info_reference, visited, result);
                }
            }
            Object::Dictionary(dictionary) => {
                for (_, value) in dictionary.iter() {
                    visit(document, value, info_reference, visited, result);
                }
            }
            Object::Stream(stream) => {
                for (_, value) in stream.dict.iter() {
                    visit(document, value, info_reference, visited, result);
                }
            }
            _ => {}
        }
    }

    let mut visited = BTreeSet::new();
    let mut result = BTreeMap::new();
    for (key, value) in document.trailer.iter() {
        if !matches!(key.as_slice(), b"Info" | b"Prev" | b"XRefStm" | b"Size") {
            visit(document, value, info_reference, &mut visited, &mut result);
        }
    }
    result
}

fn blocked_report(
    blockers: Vec<String>,
    source_digest: String,
    pages: usize,
    existing_values: PdfMetadataValues,
    requested_values: PdfMetadataValues,
) -> PdfMetadataCopyReport {
    PdfMetadataCopyReport {
        status: "blocked".into(),
        engine: "lopdf 0.42.0 full-rewrite Info allowlist".into(),
        blockers,
        source_digest,
        output_digest: None,
        source_pages: pages,
        output_bytes: 0,
        existing_values,
        requested_values,
        updated_fields: Vec::new(),
        removed_fields: Vec::new(),
        structural_reopen_verified: false,
        metadata_reopen_verified: false,
        preserved_info_verified: false,
        preserved_structure_verified: false,
        full_rewrite_verified: false,
    }
}

pub fn build_pdf_metadata_copy(
    source: &[u8],
    expected_source_digest: &str,
    requested_values: &PdfMetadataValues,
) -> Result<(PdfMetadataCopyReport, Option<Vec<u8>>), String> {
    if source.is_empty() || source.len() > MAX_PDF_METADATA_SOURCE_BYTES {
        return Err("PDF 元数据编辑目前只支持 1 字节～128 MiB 的源文件".into());
    }
    let requested_values = PdfMetadataValues {
        title: requested_values.title.trim().to_string(),
        author: requested_values.author.trim().to_string(),
        subject: requested_values.subject.trim().to_string(),
        keywords: requested_values.keywords.trim().to_string(),
    };
    for (key, value) in requested_entries(&requested_values) {
        validate_value(key, value)?;
    }
    let source_digest = digest(source);
    if source_digest != expected_source_digest.trim().to_ascii_lowercase() {
        return Err("PDF 内容已变化，请重新打开后再编辑元数据".into());
    }
    let mut document =
        Document::load_mem(source).map_err(|error| format!("PDF 结构解析失败: {error}"))?;
    let page_ids = validated_page_ids(&document)?;
    let geometries = page_ids
        .iter()
        .map(|page_id| page_geometry(&document, *page_id))
        .collect::<Option<Vec<_>>>();
    let (info_reference, info) = match resolve_info(&document) {
        Ok(value) => value,
        Err(blocker) => {
            return Ok((
                blocked_report(
                    vec![blocker],
                    source_digest,
                    page_ids.len(),
                    PdfMetadataValues::default(),
                    requested_values.clone(),
                ),
                None,
            ));
        }
    };
    let (existing_values, preserved_info) = match inspect_info(&info) {
        Ok(value) => value,
        Err(blocker) => {
            return Ok((
                blocked_report(
                    vec![blocker],
                    source_digest,
                    page_ids.len(),
                    PdfMetadataValues::default(),
                    requested_values.clone(),
                ),
                None,
            ));
        }
    };
    let mut blockers = Vec::new();
    if document.is_encrypted() {
        blockers.push("encrypted_pdf_unverified".into());
    }
    if has_digital_signature(&document) {
        blockers.push("digital_signature_or_certification_present".into());
    }
    if has_pdfa_marker(source) {
        blockers.push("pdfa_conformance_unverified".into());
    }
    if document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"Metadata"))
    {
        blockers.push("xmp_packet_present_write_unverified".into());
    }
    if contains_embedded_file_objects(&document) {
        blockers.push("embedded_file_metadata_cleanup_unverified".into());
    }
    if geometries.is_none() {
        blockers.push("missing_invalid_page_box_or_non_quarter_rotation".into());
    }
    if !blockers.is_empty() {
        return Ok((
            blocked_report(
                blockers,
                source_digest,
                page_ids.len(),
                existing_values,
                requested_values.clone(),
            ),
            None,
        ));
    }
    let geometries = geometries.expect("page geometry checked");
    let inventory = preservation_inventory(&document, &page_ids);
    let source_objects = non_info_objects(&document, info_reference);
    let mut canonical = Dictionary::new();
    for (key, value) in &preserved_info {
        canonical.set(key.clone(), value.clone());
    }
    let mut updated_fields = Vec::new();
    let mut removed_fields = Vec::new();
    for (key, value) in requested_entries(&requested_values) {
        let field = String::from_utf8_lossy(key).to_ascii_lowercase();
        let previous = info
            .get(key)
            .ok()
            .and_then(|object| decode_text_string(object).ok())
            .unwrap_or_default();
        if value.is_empty() {
            if info.has(key) {
                removed_fields.push(field);
            }
        } else {
            canonical.set(key, text_string(value));
            if previous != value {
                updated_fields.push(field);
            }
        }
    }
    if let Some(info_id) = info_reference {
        document
            .objects
            .insert(info_id, Object::Dictionary(canonical));
    } else if canonical.is_empty() {
        document.trailer.remove(b"Info");
    } else {
        document.trailer.set("Info", Object::Dictionary(canonical));
    }
    document.reference_table.cross_reference_type = XrefType::CrossReferenceTable;
    document.trailer.remove(b"Prev");
    document.trailer.remove(b"XRefStm");
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| format!("PDF 元数据副本生成失败: {error}"))?;
    if output.len() > MAX_PDF_METADATA_OUTPUT_BYTES {
        return Err("PDF 元数据副本超过 256 MiB 输出上限".into());
    }
    let reopened = Document::load_mem(&output)
        .map_err(|error| format!("PDF 元数据副本结构复读失败: {error}"))?;
    let reopened_page_ids = validated_page_ids(&reopened)?;
    let reopened_geometries = reopened_page_ids
        .iter()
        .map(|page_id| page_geometry(&reopened, *page_id))
        .collect::<Option<Vec<_>>>();
    let (reopened_info_reference, reopened_info) = resolve_info(&reopened)?;
    let (reopened_values, reopened_preserved) = inspect_info(&reopened_info)?;
    let metadata_reopen_verified = reopened_values == requested_values;
    let preserved_info_verified = reopened_preserved == preserved_info;
    let geometry_verified = reopened_geometries.as_deref() == Some(geometries.as_slice());
    let inventory_verified = preservation_inventory(&reopened, &reopened_page_ids) == inventory;
    let reopened_objects = non_info_objects(&reopened, reopened_info_reference);
    let objects_verified = reopened_objects == source_objects;
    let preserved_structure_verified = geometry_verified && inventory_verified && objects_verified;
    let full_rewrite_verified = !reopened.trailer.has(b"Prev") && !reopened.trailer.has(b"XRefStm");
    if reopened_page_ids.len() != page_ids.len()
        || !metadata_reopen_verified
        || !preserved_info_verified
        || !preserved_structure_verified
        || !full_rewrite_verified
    {
        return Err(format!(
            "PDF 元数据副本未通过复读验证（页数={}, 元数据={}, 保留Info={}, 几何={}, 清单={}, 可达对象={}/{}, 完整重写={}）",
            reopened_page_ids.len() == page_ids.len(),
            metadata_reopen_verified,
            preserved_info_verified,
            geometry_verified,
            inventory_verified,
            objects_verified,
            source_objects.len() == reopened_objects.len(),
            full_rewrite_verified
        ));
    }
    Ok((
        PdfMetadataCopyReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 full-rewrite Info allowlist".into(),
            blockers: Vec::new(),
            source_digest,
            output_digest: Some(digest(&output)),
            source_pages: page_ids.len(),
            output_bytes: output.len(),
            existing_values,
            requested_values,
            updated_fields,
            removed_fields,
            structural_reopen_verified: true,
            metadata_reopen_verified,
            preserved_info_verified,
            preserved_structure_verified,
            full_rewrite_verified,
        },
        Some(output),
    ))
}
