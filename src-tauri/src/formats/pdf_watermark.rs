use lopdf::xref::XrefType;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use subsetter::{subset, GlyphRemapper};
use ttf_parser::Face;

pub const MAX_PDF_WATERMARK_SOURCE_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_PDF_WATERMARK_OUTPUT_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_PDF_WATERMARK_PAGES: usize = 512;
const NOTO_SANS_CJK_SC: &[u8] = include_bytes!("../../assets/fonts/NotoSansCJKsc-Regular.otf");

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfWatermarkSpec {
    pub text: String,
    pub angle_degrees: f32,
    pub opacity: f32,
    pub gray: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfWatermarkCopyReport {
    pub status: String,
    pub engine: String,
    pub blockers: Vec<String>,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub source_pages: usize,
    pub watermarked_pages: usize,
    pub output_bytes: usize,
    pub watermark_text: String,
    pub angle_degrees: f32,
    pub opacity: f32,
    pub gray: f32,
    pub minimum_font_size_points: Option<f32>,
    pub maximum_font_size_points: Option<f32>,
    pub structural_reopen_verified: bool,
    pub page_geometry_verified: bool,
    pub preserved_structure_verified: bool,
    pub watermark_streams_verified: bool,
    pub watermark_text_verified: bool,
    pub full_rewrite_verified: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PageGeometry {
    media_box: [f32; 4],
    crop_box: [f32; 4],
    rotation: i16,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PreservationInventory {
    acro_form: bool,
    outlines: bool,
    metadata: bool,
    tagged: bool,
    embedded_files: bool,
    annotations: Vec<usize>,
    links: Vec<usize>,
}

struct EmbeddedFont {
    font_id: ObjectId,
    encoded: HashMap<char, u16>,
    advances: HashMap<char, f32>,
}

pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn object_dictionary(object: &Object) -> Option<&Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Stream(stream) => Some(&stream.dict),
        _ => None,
    }
}

pub(crate) fn has_digital_signature(document: &Document) -> bool {
    document.objects.values().any(|object| {
        object_dictionary(object).is_some_and(|dictionary| {
            dictionary
                .get(b"Type")
                .and_then(Object::as_name)
                .is_ok_and(|value| value == b"Sig")
                || dictionary
                    .get(b"FT")
                    .and_then(Object::as_name)
                    .is_ok_and(|value| value == b"Sig")
                || dictionary.has(b"ByteRange")
        })
    }) || document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"Perms"))
}

fn inherited_page_value(document: &Document, page_id: ObjectId, key: &[u8]) -> Option<Object> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        let dictionary = document.get_dictionary(current).ok()?;
        if let Ok(value) = dictionary.get(key) {
            return Some(value.clone());
        }
        current = dictionary
            .get(b"Parent")
            .and_then(Object::as_reference)
            .ok()?;
    }
    None
}

pub(crate) fn validated_page_ids(document: &Document) -> Result<Vec<ObjectId>, String> {
    let root = document
        .catalog()
        .map_err(|_| "PDF Catalog 无效")?
        .get(b"Pages")
        .and_then(Object::as_reference)
        .map_err(|_| "PDF Catalog 缺少间接 Pages 根节点")?;
    let mut stack = vec![(root, 0usize)];
    let mut visited = HashSet::new();
    let mut pages = Vec::new();
    while let Some((object_id, depth)) = stack.pop() {
        if depth > 64 || !visited.insert(object_id) {
            return Err("invalid_or_cyclic_page_tree".into());
        }
        if visited.len() > MAX_PDF_WATERMARK_PAGES * 4 + 64 {
            return Err("invalid_or_cyclic_page_tree".into());
        }
        let dictionary = document
            .get_dictionary(object_id)
            .map_err(|_| "invalid_or_cyclic_page_tree")?;
        match dictionary
            .get(b"Type")
            .and_then(Object::as_name)
            .map_err(|_| "invalid_or_cyclic_page_tree")?
        {
            b"Page" => {
                pages.push(object_id);
                if pages.len() > MAX_PDF_WATERMARK_PAGES {
                    return Err("PDF 水印目前只支持 1～512 页 PDF".into());
                }
            }
            b"Pages" => {
                let kids = dictionary
                    .get(b"Kids")
                    .and_then(Object::as_array)
                    .map_err(|_| "invalid_or_cyclic_page_tree")?;
                if kids.is_empty() || kids.len() > MAX_PDF_WATERMARK_PAGES * 4 {
                    return Err("invalid_or_cyclic_page_tree".into());
                }
                for child in kids.iter().rev() {
                    stack.push((
                        child
                            .as_reference()
                            .map_err(|_| "invalid_or_cyclic_page_tree")?,
                        depth + 1,
                    ));
                }
            }
            _ => return Err("invalid_or_cyclic_page_tree".into()),
        }
    }
    if pages.is_empty() {
        return Err("invalid_or_cyclic_page_tree".into());
    }
    Ok(pages)
}

fn object_number(value: &Object) -> Option<f32> {
    match value {
        Object::Integer(value) => Some(*value as f32),
        Object::Real(value) => Some(*value),
        _ => None,
    }
}

fn resolved_box(document: &Document, page_id: ObjectId, key: &[u8]) -> Option<[f32; 4]> {
    let value = inherited_page_value(document, page_id, key)?;
    let (_, resolved) = document.dereference(&value).ok()?;
    let values = resolved.as_array().ok()?;
    if values.len() != 4 {
        return None;
    }
    let result = [
        object_number(&values[0])?,
        object_number(&values[1])?,
        object_number(&values[2])?,
        object_number(&values[3])?,
    ];
    (result.iter().all(|value| value.is_finite()) && result[2] > result[0] && result[3] > result[1])
        .then_some(result)
}

fn normalized_rotation(value: i64) -> i16 {
    (((value % 360) + 360) % 360) as i16
}

pub(crate) fn page_geometry(document: &Document, page_id: ObjectId) -> Option<PageGeometry> {
    let media_box = resolved_box(document, page_id, b"MediaBox")?;
    let crop_box = resolved_box(document, page_id, b"CropBox").unwrap_or(media_box);
    let rotation = inherited_page_value(document, page_id, b"Rotate")
        .and_then(|value| value.as_i64().ok())
        .map(normalized_rotation)
        .unwrap_or(0);
    matches!(rotation, 0 | 90 | 180 | 270).then_some(PageGeometry {
        media_box,
        crop_box,
        rotation,
    })
}

fn catalog_has(document: &Document, key: &[u8]) -> bool {
    document.catalog().is_ok_and(|catalog| catalog.has(key))
}

pub(crate) fn has_embedded_files(document: &Document) -> bool {
    let Ok(catalog) = document.catalog() else {
        return false;
    };
    let Ok(names) = catalog.get(b"Names") else {
        return false;
    };
    document
        .dereference(names)
        .ok()
        .and_then(|(_, value)| value.as_dict().ok())
        .is_some_and(|dictionary| dictionary.has(b"EmbeddedFiles"))
}

fn page_annotation_counts(document: &Document, page_id: ObjectId) -> (usize, usize) {
    let annotations = document
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Annots").ok())
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .unwrap_or_default();
    let links = annotations
        .iter()
        .filter(|annotation| {
            document
                .dereference(annotation)
                .ok()
                .and_then(|(_, value)| value.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Subtype").ok())
                .and_then(|value| value.as_name().ok())
                .is_some_and(|value| value == b"Link")
        })
        .count();
    (annotations.len(), links)
}

pub(crate) fn preservation_inventory(
    document: &Document,
    page_ids: &[ObjectId],
) -> PreservationInventory {
    let counts = page_ids
        .iter()
        .map(|page_id| page_annotation_counts(document, *page_id))
        .collect::<Vec<_>>();
    PreservationInventory {
        acro_form: catalog_has(document, b"AcroForm"),
        outlines: catalog_has(document, b"Outlines"),
        metadata: catalog_has(document, b"Metadata"),
        tagged: catalog_has(document, b"StructTreeRoot"),
        embedded_files: has_embedded_files(document),
        annotations: counts.iter().map(|value| value.0).collect(),
        links: counts.iter().map(|value| value.1).collect(),
    }
}

fn requires_complex_shaping(value: char) -> bool {
    matches!(value as u32,
        0x0300..=0x036f | 0x0590..=0x08ff | 0x0900..=0x109f |
        0x1100..=0x11ff | 0x1780..=0x18af | 0x1ab0..=0x1aff |
        0x1dc0..=0x1dff | 0x20d0..=0x20ff | 0xfe00..=0xfe0f |
        0xfe20..=0xfe2f | 0x1f1e6..=0x1f1ff | 0x1f3fb..=0x1f3ff |
        0xe0100..=0xe01ef | 0x1f000..=0x1faff
    )
}

fn is_bidi_override(value: char) -> bool {
    matches!(value as u32, 0x061c | 0x200e..=0x200f | 0x202a..=0x202e | 0x2066..=0x2069)
}

fn validate_spec(spec: &PdfWatermarkSpec) -> Result<String, String> {
    let text = spec.text.trim();
    let count = text.chars().count();
    if !(1..=64).contains(&count) {
        return Err("PDF 水印文字必须为 1～64 个 Unicode 字符".into());
    }
    if text.chars().any(|value| {
        value.is_control() || is_bidi_override(value) || requires_complex_shaping(value)
    }) {
        return Err("PDF 水印暂不支持控制符、双向覆盖、复杂塑形、Emoji 或竖排字符".into());
    }
    if !spec.angle_degrees.is_finite() || !(-60.0..=60.0).contains(&spec.angle_degrees) {
        return Err("PDF 水印角度必须在 -60～60 度之间".into());
    }
    if !spec.opacity.is_finite() || !(0.08..=0.5).contains(&spec.opacity) {
        return Err("PDF 水印透明度必须在 0.08～0.5 之间".into());
    }
    if !spec.gray.is_finite() || !(0.0..=0.85).contains(&spec.gray) {
        return Err("PDF 水印灰度必须在 0～0.85 之间".into());
    }
    Ok(text.to_string())
}

fn unicode_hex(value: char) -> String {
    value
        .encode_utf16(&mut [0; 2])
        .iter()
        .map(|unit| format!("{unit:04X}"))
        .collect()
}

fn build_to_unicode(mapping: &BTreeMap<u16, char>) -> Vec<u8> {
    let mut cmap = String::from("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /LongEditWatermarkUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n");
    for chunk in mapping.iter().collect::<Vec<_>>().chunks(100) {
        cmap.push_str(&format!("{} beginbfchar\n", chunk.len()));
        for (cid, character) in chunk {
            cmap.push_str(&format!("<{cid:04X}> <{}>\n", unicode_hex(**character)));
        }
        cmap.push_str("endbfchar\n");
    }
    cmap.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");
    cmap.into_bytes()
}

fn scale_font_metric(value: i16, units_per_em: u16) -> i64 {
    ((i64::from(value) * 1000) / i64::from(units_per_em)).clamp(-32_768, 32_767)
}

fn embed_font(document: &mut Document, text: &str) -> Result<EmbeddedFont, String> {
    let face = Face::parse(NOTO_SANS_CJK_SC, 0).map_err(|_| "内置 Noto Sans CJK SC 字体无效")?;
    let mut remapper = GlyphRemapper::new();
    remapper.remap(0);
    let mut glyphs = BTreeMap::new();
    for character in text.chars() {
        let glyph = face
            .glyph_index(character)
            .ok_or_else(|| format!("内置字体不包含字符 U+{:04X}", character as u32))?;
        remapper.remap(glyph.0);
        glyphs.insert(character, glyph);
    }
    let subset = subset(NOTO_SANS_CJK_SC, 0, &remapper)
        .map_err(|error| format!("无法生成 PDF 水印字体子集: {error:?}"))?;
    let mut encoded = HashMap::new();
    let mut advances = HashMap::new();
    let mut reverse = BTreeMap::new();
    let mut widths = Vec::new();
    for (character, glyph) in glyphs {
        let cid = remapper.get(glyph.0).ok_or("PDF 水印字体字形映射丢失")?;
        let advance = face.glyph_hor_advance(glyph).unwrap_or(face.units_per_em());
        let scaled = u64::from(advance) * 1000 / u64::from(face.units_per_em());
        encoded.insert(character, cid);
        advances.insert(character, scaled as f32 / 1000.0);
        reverse.insert(cid, character);
        widths.push(Object::Integer(i64::from(cid)));
        widths.push(Object::Array(vec![Object::Integer(scaled as i64)]));
    }
    let font_file_id =
        document.add_object(Stream::new(dictionary! { "Subtype" => "OpenType" }, subset));
    let bbox = face.global_bounding_box();
    let descriptor_id = document.add_object(dictionary! {
        "Type" => "FontDescriptor", "FontName" => "LEWM+NotoSansCJKsc-Regular",
        "Flags" => 4, "FontBBox" => vec![
            scale_font_metric(bbox.x_min, face.units_per_em()).into(),
            scale_font_metric(bbox.y_min, face.units_per_em()).into(),
            scale_font_metric(bbox.x_max, face.units_per_em()).into(),
            scale_font_metric(bbox.y_max, face.units_per_em()).into()
        ],
        "ItalicAngle" => 0, "Ascent" => scale_font_metric(face.ascender(), face.units_per_em()),
        "Descent" => scale_font_metric(face.descender(), face.units_per_em()),
        "CapHeight" => scale_font_metric(face.capital_height().unwrap_or(face.ascender()), face.units_per_em()),
        "StemV" => 80, "FontFile3" => Object::Reference(font_file_id)
    });
    let descendant_id = document.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "CIDFontType0", "BaseFont" => "LEWM+NotoSansCJKsc-Regular",
        "CIDSystemInfo" => dictionary! { "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 },
        "FontDescriptor" => Object::Reference(descriptor_id), "DW" => 1000,
        "W" => Object::Array(widths)
    });
    let to_unicode_id =
        document.add_object(Stream::new(Dictionary::new(), build_to_unicode(&reverse)));
    let font_id = document.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "LEWM+NotoSansCJKsc-Regular",
        "Encoding" => "Identity-H", "DescendantFonts" => vec![Object::Reference(descendant_id)],
        "ToUnicode" => Object::Reference(to_unicode_id)
    });
    Ok(EmbeddedFont {
        font_id,
        encoded,
        advances,
    })
}

fn encoded_glyphs(text: &str, font: &EmbeddedFont) -> Result<String, String> {
    text.chars()
        .map(|character| {
            font.encoded
                .get(&character)
                .map(|cid| format!("{cid:04X}"))
                .ok_or_else(|| format!("字符 U+{:04X} 缺少 PDF 水印字形映射", character as u32))
        })
        .collect()
}

fn resolved_dictionary(document: &Document, value: Option<&Object>) -> Result<Dictionary, String> {
    let Some(value) = value else {
        return Ok(Dictionary::new());
    };
    document
        .dereference(value)
        .map_err(|_| "PDF 资源字典引用无效".to_string())?
        .1
        .as_dict()
        .cloned()
        .map_err(|_| "PDF 资源对象不是字典".to_string())
}

fn unique_resource_name(dictionary: &Dictionary, prefix: &str) -> String {
    (0..10_000)
        .map(|index| format!("{prefix}{index}"))
        .find(|name| !dictionary.has(name.as_bytes()))
        .expect("bounded resource name search")
}

fn append_watermark(
    document: &mut Document,
    page_id: ObjectId,
    geometry: &PageGeometry,
    spec: &PdfWatermarkSpec,
    text: &str,
    font: &EmbeddedFont,
) -> Result<f32, String> {
    let inherited_resources = inherited_page_value(document, page_id, b"Resources");
    let mut resources = resolved_dictionary(document, inherited_resources.as_ref())?;
    let mut fonts = resolved_dictionary(document, resources.get(b"Font").ok())?;
    let mut graphics = resolved_dictionary(document, resources.get(b"ExtGState").ok())?;
    let font_name = unique_resource_name(&fonts, "LEWMF");
    let graphic_name = unique_resource_name(&graphics, "LEWMG");
    let graphic_id = document.add_object(dictionary! {
        "Type" => "ExtGState", "CA" => Object::Real(spec.opacity), "ca" => Object::Real(spec.opacity),
        "BM" => "Normal"
    });
    fonts.set(font_name.as_bytes(), Object::Reference(font.font_id));
    graphics.set(graphic_name.as_bytes(), Object::Reference(graphic_id));
    resources.set("Font", Object::Dictionary(fonts));
    resources.set("ExtGState", Object::Dictionary(graphics));

    let width_units = text
        .chars()
        .map(|character| font.advances.get(&character).copied().unwrap_or(1.0))
        .sum::<f32>();
    let width = geometry.crop_box[2] - geometry.crop_box[0];
    let height = geometry.crop_box[3] - geometry.crop_box[1];
    let angle = (spec.angle_degrees - f32::from(geometry.rotation)).to_radians();
    let (sin, cos) = angle.sin_cos();
    let horizontal_units = width_units * cos.abs() + sin.abs();
    let vertical_units = width_units * sin.abs() + cos.abs();
    let font_size = (width * 0.82 / horizontal_units.max(0.01))
        .min(height * 0.82 / vertical_units.max(0.01))
        .min(72.0);
    if font_size < 18.0 {
        return Err("PDF 水印文字在当前页面无法以至少 18pt 完整放置".into());
    }
    let text_width = width_units * font_size;
    let center_x = (geometry.crop_box[0] + geometry.crop_box[2]) / 2.0;
    let center_y = (geometry.crop_box[1] + geometry.crop_box[3]) / 2.0;
    let baseline = font_size * 0.35;
    let tx = center_x - cos * text_width / 2.0 + sin * baseline;
    let ty = center_y - sin * text_width / 2.0 - cos * baseline;
    let glyphs = encoded_glyphs(text, font)?;
    let content = format!(
        "q\n/Artifact << /Subtype /Watermark >> BDC\n/{graphic_name} gs\n{:.4} g\nBT\n/{font_name} {:.4} Tf\n{cos:.8} {sin:.8} {:.8} {cos:.8} {tx:.4} {ty:.4} Tm\n<{glyphs}> Tj\nET\nEMC\nQ\n",
        spec.gray,
        font_size,
        -sin
    );
    let content_id = document.add_object(Stream::new(
        dictionary! {
            "LongEditWatermark" => true,
            "LongEditWatermarkText" => Object::String({
                let mut value = vec![0xfe, 0xff];
                value.extend(text.encode_utf16().flat_map(u16::to_be_bytes));
                value
            }, StringFormat::Hexadecimal)
        },
        content.into_bytes(),
    ));
    let existing = document
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Contents").ok())
        .cloned();
    let contents = match existing {
        None => Object::Reference(content_id),
        Some(Object::Array(mut values)) => {
            values.push(Object::Reference(content_id));
            Object::Array(values)
        }
        Some(Object::Reference(id)) => match document.get_object(id) {
            Ok(Object::Array(values)) => {
                let mut values = values.clone();
                values.push(Object::Reference(content_id));
                Object::Array(values)
            }
            Ok(Object::Stream(_)) => {
                Object::Array(vec![Object::Reference(id), Object::Reference(content_id)])
            }
            _ => return Err("PDF 页面 Contents 引用不是内容流或内容流数组".into()),
        },
        Some(Object::Stream(stream)) => {
            let existing_id = document.add_object(Object::Stream(stream));
            Object::Array(vec![
                Object::Reference(existing_id),
                Object::Reference(content_id),
            ])
        }
        Some(_) => return Err("PDF 页面 Contents 类型无效".into()),
    };
    let page = document
        .get_dictionary_mut(page_id)
        .map_err(|_| "PDF 页面对象无效")?;
    page.set("Resources", Object::Dictionary(resources));
    page.set("Contents", contents);
    Ok(font_size)
}

fn watermark_stream_count(document: &Document, page_id: ObjectId) -> usize {
    let Some(contents) = document
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Contents").ok())
    else {
        return 0;
    };
    let values = match document.dereference(contents).ok().map(|(_, value)| value) {
        Some(Object::Array(values)) => values.clone(),
        Some(Object::Stream(_)) => vec![contents.clone()],
        _ => return 0,
    };
    values
        .iter()
        .filter(|value| {
            document
                .dereference(value)
                .ok()
                .and_then(|(_, value)| value.as_stream().ok())
                .is_some_and(|stream| {
                    stream
                        .dict
                        .get(b"LongEditWatermark")
                        .and_then(Object::as_bool)
                        .is_ok_and(|value| value)
                        && stream.content.starts_with(b"q\n/Artifact")
                        && stream.content.ends_with(b"EMC\nQ\n")
                })
        })
        .count()
}

pub(crate) fn has_pdfa_marker(source: &[u8]) -> bool {
    let lowered = String::from_utf8_lossy(source).to_ascii_lowercase();
    lowered.contains("pdfaid:part") || lowered.contains("pdfa1") || lowered.contains("pdfa2")
}

pub fn build_pdf_watermark_copy(
    source: &[u8],
    expected_source_digest: &str,
    spec: &PdfWatermarkSpec,
) -> Result<(PdfWatermarkCopyReport, Option<Vec<u8>>), String> {
    if source.is_empty() || source.len() > MAX_PDF_WATERMARK_SOURCE_BYTES {
        return Err("PDF 水印目前只支持 1 字节～128 MiB 的源文件".into());
    }
    let text = validate_spec(spec)?;
    let source_digest = digest(source);
    if source_digest != expected_source_digest.trim().to_ascii_lowercase() {
        return Err("PDF 内容已变化，请重新打开后再生成水印副本".into());
    }
    let mut document =
        Document::load_mem(source).map_err(|error| format!("PDF 结构解析失败: {error}"))?;
    let page_ids = validated_page_ids(&document)?;
    let geometries = page_ids
        .iter()
        .map(|page_id| page_geometry(&document, *page_id))
        .collect::<Option<Vec<_>>>();
    let unsupported_user_unit = page_ids.iter().any(|page_id| {
        inherited_page_value(&document, *page_id, b"UserUnit")
            .and_then(|value| object_number(&value))
            .is_some_and(|value| (value - 1.0).abs() > f32::EPSILON)
    });
    let mut blockers = Vec::new();
    if document.is_encrypted() {
        blockers.push("encrypted_pdf_unverified".into());
    }
    if has_digital_signature(&document) {
        blockers.push("digital_signature_or_certification_present".into());
    }
    if geometries.is_none() {
        blockers.push("missing_invalid_page_box_or_non_quarter_rotation".into());
    }
    if unsupported_user_unit {
        blockers.push("unsupported_user_unit".into());
    }
    if has_pdfa_marker(source) {
        blockers.push("pdfa_conformance_unverified".into());
    }
    let blocked_report = |blockers: Vec<String>| PdfWatermarkCopyReport {
        status: "blocked".into(),
        engine: "lopdf 0.42.0 + subsetter 0.2.3 + Noto Sans CJK SC 2.004".into(),
        blockers,
        source_digest: source_digest.clone(),
        output_digest: None,
        source_pages: page_ids.len(),
        watermarked_pages: 0,
        output_bytes: 0,
        watermark_text: text.clone(),
        angle_degrees: spec.angle_degrees,
        opacity: spec.opacity,
        gray: spec.gray,
        minimum_font_size_points: None,
        maximum_font_size_points: None,
        structural_reopen_verified: false,
        page_geometry_verified: false,
        preserved_structure_verified: false,
        watermark_streams_verified: false,
        watermark_text_verified: false,
        full_rewrite_verified: false,
    };
    if !blockers.is_empty() {
        return Ok((blocked_report(blockers), None));
    }
    let geometries = geometries.expect("checked page geometry");
    let inventory = preservation_inventory(&document, &page_ids);
    let font = embed_font(&mut document, &text)?;
    let mut font_sizes = Vec::with_capacity(page_ids.len());
    for (page_id, geometry) in page_ids.iter().zip(&geometries) {
        font_sizes.push(append_watermark(
            &mut document,
            *page_id,
            geometry,
            spec,
            &text,
            &font,
        )?);
    }
    document.reference_table.cross_reference_type = XrefType::CrossReferenceTable;
    document.trailer.remove(b"Prev");
    document.trailer.remove(b"XRefStm");
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| format!("PDF 水印副本生成失败: {error}"))?;
    if output.len() > MAX_PDF_WATERMARK_OUTPUT_BYTES {
        return Err("PDF 水印副本超过 256 MiB 输出上限".into());
    }
    let reopened = Document::load_mem(&output)
        .map_err(|error| format!("PDF 水印副本结构复读失败: {error}"))?;
    let reopened_page_ids = validated_page_ids(&reopened)
        .map_err(|error| format!("PDF 水印副本页树复读失败: {error}"))?;
    let reopened_geometries = reopened_page_ids
        .iter()
        .map(|page_id| page_geometry(&reopened, *page_id))
        .collect::<Option<Vec<_>>>();
    let page_geometry_verified = reopened_geometries.as_deref() == Some(geometries.as_slice());
    let preserved_structure_verified =
        preservation_inventory(&reopened, &reopened_page_ids) == inventory;
    let watermark_streams_verified = reopened_page_ids
        .iter()
        .all(|page_id| watermark_stream_count(&reopened, *page_id) == 1);
    let extracted = pdf_extract::extract_text_from_mem_by_pages(&output)
        .map_err(|error| format!("PDF 水印文字复读失败: {error}"))?;
    let watermark_text_verified = extracted.len() == page_ids.len()
        && extracted.iter().all(|page_text| page_text.contains(&text));
    let full_rewrite_verified = !reopened.trailer.has(b"Prev") && !reopened.trailer.has(b"XRefStm");
    if reopened_page_ids.len() != page_ids.len()
        || !page_geometry_verified
        || !preserved_structure_verified
        || !watermark_streams_verified
        || !watermark_text_verified
        || !full_rewrite_verified
    {
        return Err("PDF 水印副本未通过结构、保真、文字或完整重写复读验证".into());
    }
    Ok((
        PdfWatermarkCopyReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 + subsetter 0.2.3 + Noto Sans CJK SC 2.004".into(),
            blockers: Vec::new(),
            source_digest,
            output_digest: Some(digest(&output)),
            source_pages: page_ids.len(),
            watermarked_pages: reopened_page_ids.len(),
            output_bytes: output.len(),
            watermark_text: text,
            angle_degrees: spec.angle_degrees,
            opacity: spec.opacity,
            gray: spec.gray,
            minimum_font_size_points: font_sizes.iter().copied().reduce(f32::min),
            maximum_font_size_points: font_sizes.iter().copied().reduce(f32::max),
            structural_reopen_verified: true,
            page_geometry_verified,
            preserved_structure_verified,
            watermark_streams_verified,
            watermark_text_verified,
            full_rewrite_verified,
        },
        Some(output),
    ))
}
