use crate::formats::pdf_forms::{inspect_pdf_forms, MAX_PDF_FORM_INPUT_BYTES};
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use subsetter::{subset, GlyphRemapper};
use ttf_parser::Face;

const MAX_TEXT_CHANGES: usize = 128;
const MAX_TEXT_VALUE_CHARS: usize = 1024;
const MAX_FIELD_DEPTH: usize = 64;
const NOTO_SANS_CJK_SC: &[u8] = include_bytes!("../../assets/fonts/NotoSansCJKsc-Regular.otf");

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormTextChange {
    pub field_name: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFormTextFillReport {
    pub status: String,
    pub engine: String,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub output_bytes: usize,
    pub changed_fields: Vec<String>,
    pub appearance_streams_written: usize,
    pub widget_states_written: usize,
    pub field_tree_verified: bool,
    pub widget_appearances_verified: bool,
    pub blockers: Vec<String>,
}

#[derive(Clone)]
struct TextFieldTarget {
    field_id: ObjectId,
    widget_ids: Vec<ObjectId>,
    field_type: String,
    flags: i64,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn dictionary_for(document: &Document, object: &Object) -> Option<(Option<ObjectId>, Dictionary)> {
    let (id, resolved) = document.dereference(object).ok()?;
    Some((id, resolved.as_dict().ok()?.clone()))
}

fn name_value(dictionary: &Dictionary, key: &[u8]) -> Option<String> {
    dictionary
        .get(key)
        .ok()
        .and_then(|value| value.as_name().ok())
        .map(|value| String::from_utf8_lossy(value).into_owned())
}

fn string_value(dictionary: &Dictionary, key: &[u8]) -> String {
    dictionary
        .get(key)
        .ok()
        .and_then(|value| value.as_str().ok())
        .map(decode_pdf_text)
        .unwrap_or_default()
}

fn decode_pdf_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xfe, 0xff]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]));
        String::from_utf16_lossy(&units.collect::<Vec<_>>())
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

fn is_widget(dictionary: &Dictionary) -> bool {
    name_value(dictionary, b"Subtype").as_deref() == Some("Widget")
}

fn collect_text_fields(
    document: &Document,
    object: &Object,
    parent_name: &str,
    inherited_type: Option<String>,
    inherited_flags: i64,
    depth: usize,
    targets: &mut HashMap<String, TextFieldTarget>,
) -> Result<(), String> {
    if depth > MAX_FIELD_DEPTH {
        return Err("PDF 表单字段树超过 64 层安全上限".into());
    }
    let (object_id, dictionary) =
        dictionary_for(document, object).ok_or("PDF 表单包含无法解析的字段引用")?;
    let partial_name = string_value(&dictionary, b"T");
    let full_name = match (parent_name.is_empty(), partial_name.is_empty()) {
        (true, true) => return Err("PDF 表单包含未命名字段，不能可靠填写".into()),
        (true, false) => partial_name,
        (false, true) => parent_name.to_string(),
        (false, false) => format!("{parent_name}.{partial_name}"),
    };
    let field_type = name_value(&dictionary, b"FT").or(inherited_type);
    let flags = dictionary
        .get(b"Ff")
        .ok()
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(inherited_flags);
    let kids = dictionary
        .get(b"Kids")
        .ok()
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .unwrap_or_default();
    let mut widgets = Vec::new();
    let mut child_fields = Vec::new();
    for kid in kids {
        let (kid_id, kid_dictionary) =
            dictionary_for(document, &kid).ok_or("PDF 表单包含无法解析的子字段引用")?;
        if is_widget(&kid_dictionary) {
            widgets.push(kid_id.ok_or("PDF Widget 必须使用间接对象")?);
        } else {
            child_fields.push(kid);
        }
    }
    if !child_fields.is_empty() {
        for child in child_fields {
            collect_text_fields(
                document,
                &child,
                &full_name,
                field_type.clone(),
                flags,
                depth + 1,
                targets,
            )?;
        }
        return Ok(());
    }
    let field_id = object_id.ok_or("PDF 直接字段字典不能可靠填写")?;
    if is_widget(&dictionary) {
        widgets.push(field_id);
    }
    let target = TextFieldTarget {
        field_id,
        widget_ids: widgets,
        field_type: field_type.unwrap_or_else(|| "Unknown".into()),
        flags,
    };
    if targets.insert(full_name, target).is_some() {
        return Err("PDF 表单字段名重复，不能可靠填写".into());
    }
    Ok(())
}

fn collect_targets(document: &Document) -> Result<HashMap<String, TextFieldTarget>, String> {
    let catalog = document
        .catalog()
        .map_err(|error| format!("PDF Catalog 无效: {error}"))?;
    let acro_form = catalog
        .get(b"AcroForm")
        .map_err(|_| "PDF 没有 AcroForm 表单")?;
    let (_, acro_form) = dictionary_for(document, acro_form).ok_or("PDF AcroForm 无效")?;
    let fields = acro_form
        .get(b"Fields")
        .ok()
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok())
        .cloned()
        .ok_or("PDF AcroForm 缺少字段树")?;
    let mut targets = HashMap::new();
    for field in fields {
        collect_text_fields(document, &field, "", None, 0, 0, &mut targets)?;
    }
    Ok(targets)
}

fn validate_changes(changes: &[PdfFormTextChange]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > MAX_TEXT_CHANGES {
        return Err("PDF 文本填写必须包含 1～128 个字段".into());
    }
    let mut names = HashSet::new();
    for change in changes {
        if change.field_name.trim().is_empty() || !names.insert(change.field_name.as_str()) {
            return Err("PDF 文本填写字段名不能为空或重复".into());
        }
        if change.value.chars().count() > MAX_TEXT_VALUE_CHARS {
            return Err("PDF 文本字段值超过 1024 字符安全上限".into());
        }
        if change.value.chars().any(|value| value.is_control()) {
            return Err("PDF 单行文本字段不接受换行、制表符或其他控制字符".into());
        }
        if change.value.chars().any(requires_complex_shaping) {
            return Err("当前可靠外观暂不支持需要复杂字形塑形的文字".into());
        }
    }
    Ok(())
}

fn requires_complex_shaping(value: char) -> bool {
    matches!(value as u32,
        0x0300..=0x036f | 0x0590..=0x08ff | 0x0900..=0x109f |
        0x1100..=0x11ff | 0x1780..=0x18af | 0x1ab0..=0x1aff |
        0x1dc0..=0x1dff | 0x20d0..=0x20ff | 0xfe00..=0xfe0f |
        0xfe20..=0xfe2f | 0x1f1e6..=0x1f1ff | 0x1f3fb..=0x1f3ff |
        0xe0100..=0xe01ef
    )
}

fn pdf_text_string(value: &str) -> Object {
    let mut bytes = vec![0xfe, 0xff];
    bytes.extend(value.encode_utf16().flat_map(u16::to_be_bytes));
    Object::String(bytes, StringFormat::Hexadecimal)
}

struct EmbeddedFont {
    font_id: ObjectId,
    encoded: HashMap<char, u16>,
}

fn scale_font_metric(value: i16, units_per_em: u16) -> i64 {
    ((i64::from(value) * 1000) / i64::from(units_per_em)).clamp(-32_768, 32_767)
}

fn unicode_hex(value: char) -> String {
    value
        .encode_utf16(&mut [0; 2])
        .iter()
        .map(|unit| format!("{unit:04X}"))
        .collect()
}

fn build_to_unicode(mapping: &BTreeMap<u16, char>) -> Vec<u8> {
    let mut cmap = String::from("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /LongEditUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n");
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

fn embed_unicode_font(document: &mut Document, values: &[&str]) -> Result<EmbeddedFont, String> {
    let face = Face::parse(NOTO_SANS_CJK_SC, 0).map_err(|_| "内置 Noto Sans CJK SC 字体无效")?;
    let mut remapper = GlyphRemapper::new();
    remapper.remap(0);
    let mut original_glyphs = BTreeMap::new();
    for character in values.iter().flat_map(|value| value.chars()) {
        let glyph = face
            .glyph_index(character)
            .ok_or_else(|| format!("内置字体不包含字符 U+{:04X}", character as u32))?;
        remapper.remap(glyph.0);
        original_glyphs.insert(character, glyph);
    }
    let subset = subset(NOTO_SANS_CJK_SC, 0, &remapper)
        .map_err(|error| format!("无法生成 PDF 字体子集: {error:?}"))?;
    let mut encoded = HashMap::new();
    let mut reverse = BTreeMap::new();
    let mut widths = Vec::new();
    for (character, glyph) in original_glyphs {
        let cid = remapper.get(glyph.0).ok_or("PDF 字体字形映射丢失")?;
        encoded.insert(character, cid);
        reverse.insert(cid, character);
        let width = face.glyph_hor_advance(glyph).unwrap_or(face.units_per_em());
        let scaled = (u64::from(width) * 1000 / u64::from(face.units_per_em())) as i64;
        widths.push(Object::Integer(i64::from(cid)));
        widths.push(Object::Array(vec![Object::Integer(scaled)]));
    }
    let font_file_id =
        document.add_object(Stream::new(dictionary! { "Subtype" => "OpenType" }, subset));
    let bbox = face.global_bounding_box();
    let descriptor_id = document.add_object(dictionary! {
        "Type" => "FontDescriptor", "FontName" => "LEPDF+NotoSansCJKsc-Regular",
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
        "Type" => "Font", "Subtype" => "CIDFontType0", "BaseFont" => "LEPDF+NotoSansCJKsc-Regular",
        "CIDSystemInfo" => dictionary! { "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 },
        "FontDescriptor" => Object::Reference(descriptor_id), "DW" => 1000,
        "W" => Object::Array(widths)
    });
    let to_unicode_id =
        document.add_object(Stream::new(dictionary! {}, build_to_unicode(&reverse)));
    let font_id = document.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "LEPDF+NotoSansCJKsc-Regular",
        "Encoding" => "Identity-H", "DescendantFonts" => vec![Object::Reference(descendant_id)],
        "ToUnicode" => Object::Reference(to_unicode_id)
    });
    Ok(EmbeddedFont { font_id, encoded })
}

fn encoded_glyphs(value: &str, font: &EmbeddedFont) -> Result<String, String> {
    let mut output = String::with_capacity(value.chars().count() * 4);
    for character in value.chars() {
        let cid = font
            .encoded
            .get(&character)
            .ok_or_else(|| format!("字符 U+{:04X} 缺少 PDF 字形映射", character as u32))?;
        output.push_str(&format!("{cid:04X}"));
    }
    Ok(output)
}

fn checkbox_export_value(
    document: &Document,
    target: &TextFieldTarget,
    field_name: &str,
) -> Result<String, String> {
    if target.flags & (1 << 15) != 0 || target.flags & (1 << 16) != 0 {
        return Err(format!("PDF 字段不是可可靠填写的复选框：{field_name}"));
    }
    let mut export_value = None;
    for widget_id in &target.widget_ids {
        let widget = document
            .get_dictionary(*widget_id)
            .map_err(|_| format!("PDF 复选框 Widget 无效：{field_name}"))?;
        let (_, appearance) = dictionary_for(
            document,
            widget
                .get(b"AP")
                .map_err(|_| format!("PDF 复选框缺少外观：{field_name}"))?,
        )
        .ok_or_else(|| format!("PDF 复选框外观无效：{field_name}"))?;
        let (_, normal) = dictionary_for(
            document,
            appearance
                .get(b"N")
                .map_err(|_| format!("PDF 复选框缺少正常外观：{field_name}"))?,
        )
        .ok_or_else(|| format!("PDF 复选框正常外观不是状态字典：{field_name}"))?;
        if !normal.has(b"Off") {
            return Err(format!("PDF 复选框缺少 Off 状态：{field_name}"));
        }
        let enabled = normal
            .iter()
            .filter_map(|(name, appearance)| {
                (name != b"Off")
                    .then(|| {
                        document
                            .dereference(appearance)
                            .ok()
                            .is_some_and(|(_, value)| {
                                value
                                    .as_stream()
                                    .is_ok_and(|stream| !stream.content.is_empty())
                            })
                            .then(|| String::from_utf8_lossy(name).into_owned())
                    })
                    .flatten()
            })
            .collect::<Vec<_>>();
        if enabled.len() != 1 {
            return Err(format!(
                "PDF 复选框必须只有一个非 Off 外观状态：{field_name}"
            ));
        }
        if export_value
            .as_ref()
            .is_some_and(|value| value != &enabled[0])
        {
            return Err(format!(
                "PDF 复选框各 Widget 的导出状态不一致：{field_name}"
            ));
        }
        export_value = Some(enabled[0].clone());
    }
    export_value.ok_or_else(|| format!("PDF 复选框没有可用导出状态：{field_name}"))
}

fn widget_size(document: &Document, widget_id: ObjectId) -> (f32, f32) {
    let rect = document
        .get_dictionary(widget_id)
        .ok()
        .and_then(|widget| widget.get(b"Rect").ok())
        .and_then(|value| document.dereference(value).ok())
        .and_then(|(_, value)| value.as_array().ok());
    let number = |object: &Object| match object {
        Object::Integer(value) => Some(*value as f32),
        Object::Real(value) => Some(*value),
        _ => None,
    };
    if let Some(rect) = rect.filter(|rect| rect.len() == 4) {
        if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (
            number(&rect[0]),
            number(&rect[1]),
            number(&rect[2]),
            number(&rect[3]),
        ) {
            return ((x2 - x1).abs().max(1.0), (y2 - y1).abs().max(1.0));
        }
    }
    (200.0, 20.0)
}

pub fn build_pdf_text_form_copy(
    source: &[u8],
    expected_source_digest: &str,
    changes: &[PdfFormTextChange],
) -> Result<(PdfFormTextFillReport, Option<Vec<u8>>), String> {
    if source.is_empty() || source.len() > MAX_PDF_FORM_INPUT_BYTES {
        return Err("PDF 文本填写输入必须在 1 byte～128 MiB 之间".into());
    }
    validate_changes(changes)?;
    let source_digest = digest(source);
    if !source_digest.eq_ignore_ascii_case(expected_source_digest.trim()) {
        return Err("PDF 源摘要已变化，请重新检查表单".into());
    }
    let inspection = inspect_pdf_forms(source)?;
    if !inspection.blockers.is_empty() {
        return Ok((
            PdfFormTextFillReport {
                status: "blocked".into(),
                engine: "lopdf 0.42.0 + subsetter 0.2.6 + Noto Sans CJK SC 2.004".into(),
                source_digest,
                output_digest: None,
                output_bytes: 0,
                changed_fields: Vec::new(),
                appearance_streams_written: 0,
                widget_states_written: 0,
                field_tree_verified: false,
                widget_appearances_verified: false,
                blockers: inspection.blockers,
            },
            None,
        ));
    }
    let mut document =
        Document::load_mem(source).map_err(|error| format!("无法解析 PDF 表单结构: {error}"))?;
    let targets = collect_targets(&document)?;
    let mut text_values = Vec::new();
    for change in changes {
        let target = targets
            .get(&change.field_name)
            .ok_or_else(|| format!("PDF 字段不存在：{}", change.field_name))?;
        if target.flags & 1 != 0 || target.widget_ids.is_empty() {
            return Err(format!(
                "PDF 字段不属于可可靠填写子集：{}",
                change.field_name
            ));
        }
        match target.field_type.as_str() {
            "Tx" if target.flags & (1 << 13) == 0 => text_values.push(change.value.as_str()),
            "Btn" => {
                let export = checkbox_export_value(&document, target, &change.field_name)?;
                if change.value != "Off" && change.value != export {
                    return Err(format!("PDF 复选框状态无效：{}", change.field_name));
                }
            }
            _ => {
                return Err(format!(
                    "PDF 字段不属于可可靠填写子集：{}",
                    change.field_name
                ))
            }
        }
    }
    let font = (!text_values.is_empty())
        .then(|| embed_unicode_font(&mut document, &text_values))
        .transpose()?;
    let mut appearance_streams_written = 0;
    let mut widget_states_written = 0;
    let mut changed_fields = Vec::new();
    for change in changes {
        let target = targets
            .get(&change.field_name)
            .ok_or_else(|| format!("PDF 字段不存在：{}", change.field_name))?;
        if target.field_type == "Tx" {
            document
                .get_dictionary_mut(target.field_id)
                .map_err(|_| format!("PDF 字段对象无效：{}", change.field_name))?
                .set("V", pdf_text_string(&change.value));
            let font = font.as_ref().ok_or("PDF 文本字体没有初始化")?;
            for widget_id in &target.widget_ids {
                let (width, height) = widget_size(&document, *widget_id);
                let glyphs = encoded_glyphs(&change.value, font)?;
                let content = format!(
                    "q BT /LECJK 10 Tf 0 g 2 {} Td <{}> Tj ET Q",
                    (height - 12.0).max(2.0),
                    glyphs
                );
                let appearance_id = document.add_object(Stream::new(dictionary! {
                    "Type" => "XObject", "Subtype" => "Form", "FormType" => 1,
                    "BBox" => vec![0.into(), 0.into(), Object::Real(width), Object::Real(height)],
                    "Resources" => dictionary! { "Font" => dictionary! { "LECJK" => Object::Reference(font.font_id) } }
                }, content.into_bytes()));
                document
                    .get_dictionary_mut(*widget_id)
                    .map_err(|_| format!("PDF Widget 对象无效：{}", change.field_name))?
                    .set(
                        "AP",
                        dictionary! { "N" => Object::Reference(appearance_id) },
                    );
                appearance_streams_written += 1;
            }
        } else {
            let state = change.value.as_bytes().to_vec();
            document
                .get_dictionary_mut(target.field_id)
                .map_err(|_| format!("PDF 复选框字段对象无效：{}", change.field_name))?
                .set("V", Object::Name(state.clone()));
            for widget_id in &target.widget_ids {
                document
                    .get_dictionary_mut(*widget_id)
                    .map_err(|_| format!("PDF 复选框 Widget 无效：{}", change.field_name))?
                    .set("AS", Object::Name(state.clone()));
                widget_states_written += 1;
            }
        }
        changed_fields.push(change.field_name.clone());
    }
    if let Ok(catalog) = document.catalog().cloned() {
        if let Ok(acro) = catalog.get(b"AcroForm") {
            if let Ok(id) = acro.as_reference() {
                if let Ok(dictionary) = document.get_dictionary_mut(id) {
                    dictionary.set("NeedAppearances", false);
                }
            }
        }
    }
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| format!("生成 PDF 表单副本失败: {error}"))?;
    let verified = inspect_pdf_forms(&output)?;
    let reopened =
        Document::load_mem(&output).map_err(|error| format!("无法复读 PDF 表单副本: {error}"))?;
    let reopened_targets = collect_targets(&reopened)?;
    let field_tree_verified = changes.iter().all(|change| {
        verified.fields.iter().any(|field| {
            field.name == change.field_name && field.value.as_deref() == Some(change.value.as_str())
        }) && reopened_targets
            .get(&change.field_name)
            .is_some_and(|target| {
                reopened
                    .get_dictionary(target.field_id)
                    .ok()
                    .and_then(|field| field.get(b"V").ok())
                    .is_some_and(|value| match value {
                        Object::String(bytes, _) => decode_pdf_text(bytes) == change.value,
                        Object::Name(bytes) => bytes == change.value.as_bytes(),
                        _ => false,
                    })
            })
    });
    let widget_appearances_verified = changes.iter().all(|change| {
        let widgets = verified
            .widgets
            .iter()
            .filter(|widget| widget.field_name == change.field_name)
            .collect::<Vec<_>>();
        let effective_values_agree =
            reopened_targets
                .get(&change.field_name)
                .is_some_and(|target| {
                    let field_value = reopened
                        .get_dictionary(target.field_id)
                        .ok()
                        .and_then(|field| field.get(b"V").ok());
                    !target.widget_ids.is_empty()
                        && target.widget_ids.iter().all(|widget_id| {
                            reopened
                                .get_dictionary(*widget_id)
                                .ok()
                                .and_then(|widget| widget.get(b"V").ok().or(field_value))
                                .is_some_and(|value| match value {
                                    Object::String(bytes, _) => {
                                        decode_pdf_text(bytes) == change.value
                                    }
                                    Object::Name(bytes) => bytes == change.value.as_bytes(),
                                    _ => false,
                                })
                        })
                });
        let appearance_state_agrees =
            reopened_targets
                .get(&change.field_name)
                .is_some_and(|target| {
                    target.field_type != "Btn"
                        || target.widget_ids.iter().all(|widget_id| {
                            reopened
                                .get_dictionary(*widget_id)
                                .ok()
                                .and_then(|widget| widget.get(b"AS").ok())
                                .and_then(|value| value.as_name().ok())
                                .is_some_and(|state| state == change.value.as_bytes())
                        })
                });
        !widgets.is_empty()
            && widgets.iter().all(|widget| widget.has_normal_appearance)
            && effective_values_agree
            && appearance_state_agrees
    });
    if !field_tree_verified || !widget_appearances_verified {
        return Err("PDF 表单副本的字段树、Widget 或外观复读不一致".into());
    }
    let output_digest = digest(&output);
    Ok((
        PdfFormTextFillReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 + subsetter 0.2.6 + Noto Sans CJK SC 2.004".into(),
            source_digest,
            output_digest: Some(output_digest),
            output_bytes: output.len(),
            changed_fields,
            appearance_streams_written,
            widget_states_written,
            field_tree_verified,
            widget_appearances_verified,
            blockers: Vec::new(),
        },
        Some(output),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_form_fixture(with_action: bool) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let field_id = document.new_object_id();
        let widget_id = document.new_object_id();
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
        let mut field = dictionary! {
            "FT" => "Tx", "T" => Object::string_literal("customer.name"),
            "V" => Object::string_literal("Alice"), "Kids" => vec![Object::Reference(widget_id)]
        };
        if with_action {
            field.set("AA", dictionary! { "K" => dictionary! { "S" => "JavaScript", "JS" => Object::string_literal("noop") } });
        }
        document.objects.insert(field_id, Object::Dictionary(field));
        document.objects.insert(widget_id, Object::Dictionary(dictionary! {
            "Type" => "Annot", "Subtype" => "Widget", "Parent" => Object::Reference(field_id),
            "Rect" => vec![10.into(), 10.into(), 210.into(), 40.into()], "P" => Object::Reference(page_id)
        }));
        document.objects.insert(page_id, Object::Dictionary(dictionary! {
            "Type" => "Page", "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Contents" => Object::Reference(content_id), "Annots" => vec![Object::Reference(widget_id)]
        }));
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1
            }),
        );
        let acro_form_id =
            document.add_object(dictionary! { "Fields" => vec![Object::Reference(field_id)] });
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog", "Pages" => Object::Reference(pages_id), "AcroForm" => Object::Reference(acro_form_id)
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn button_form_fixture(flags: i64) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let field_id = document.new_object_id();
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
        let off_id = document.add_object(Stream::new(
            dictionary! { "BBox" => vec![0.into(), 0.into(), 20.into(), 20.into()] },
            b"q 1 g 0 0 20 20 re f 0 G 0 0 20 20 re S Q".to_vec(),
        ));
        let yes_id = document.add_object(Stream::new(
            dictionary! { "BBox" => vec![0.into(), 0.into(), 20.into(), 20.into()] },
            b"q 1 g 0 0 20 20 re f 0 G 0 0 20 20 re S 2 w 4 10 m 8 5 l 16 16 l S Q".to_vec(),
        ));
        document.objects.insert(
            field_id,
            Object::Dictionary(dictionary! {
                "Type" => "Annot", "Subtype" => "Widget", "FT" => "Btn",
                "T" => Object::string_literal("consent"), "V" => "Off", "AS" => "Off", "Ff" => flags,
                "Rect" => vec![10.into(), 10.into(), 30.into(), 30.into()], "P" => Object::Reference(page_id),
                "AP" => dictionary! { "N" => dictionary! { "Off" => Object::Reference(off_id), "Approved" => Object::Reference(yes_id) } }
            }),
        );
        document.objects.insert(
            page_id,
            Object::Dictionary(dictionary! {
                "Type" => "Page", "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
                "Contents" => Object::Reference(content_id), "Annots" => vec![Object::Reference(field_id)]
            }),
        );
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1
            }),
        );
        let acro_form_id =
            document.add_object(dictionary! { "Fields" => vec![Object::Reference(field_id)] });
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog", "Pages" => Object::Reference(pages_id), "AcroForm" => Object::Reference(acro_form_id)
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn writes_text_value_and_non_empty_widget_appearance_in_isolated_copy() {
        let source = text_form_fixture(false);
        let source_digest = digest(&source);
        let changes = vec![PdfFormTextChange {
            field_name: "customer.name".into(),
            value: "Bob (QA)".into(),
        }];
        let (report, output) = build_pdf_text_form_copy(&source, &source_digest, &changes).unwrap();
        let output = output.unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert!(report.field_tree_verified);
        assert!(report.widget_appearances_verified);
        assert_eq!(report.appearance_streams_written, 1);
        assert_ne!(source, output);
        assert_eq!(digest(&source), source_digest);
        let reopened = inspect_pdf_forms(&output).unwrap();
        assert_eq!(reopened.fields[0].value.as_deref(), Some("Bob (QA)"));
        assert!(reopened.widgets[0].has_normal_appearance);
    }

    #[test]
    fn writes_unicode_value_with_subset_font_and_blocks_unsafe_inputs() {
        let risky = text_form_fixture(true);
        let (report, output) = build_pdf_text_form_copy(
            &risky,
            &digest(&risky),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "Bob".into(),
            }],
        )
        .unwrap();
        assert_eq!(report.status, "blocked");
        assert!(output.is_none());
        let source = text_form_fixture(false);
        assert!(build_pdf_text_form_copy(
            &source,
            &"0".repeat(64),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "Bob".into()
            }],
        )
        .is_err());
        let (unicode_report, unicode_output) = build_pdf_text_form_copy(
            &source,
            &digest(&source),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "中文 QA".into(),
            }],
        )
        .unwrap();
        let unicode_output = unicode_output.unwrap();
        assert_eq!(unicode_report.status, "isolated_verified");
        assert!(unicode_output.len() < 1_000_000, "font must be subsetted");
        let reopened = inspect_pdf_forms(&unicode_output).unwrap();
        assert_eq!(reopened.fields[0].value.as_deref(), Some("中文 QA"));
        assert!(reopened.widgets[0].has_normal_appearance);
        assert!(build_pdf_text_form_copy(
            &source,
            &digest(&source),
            &[PdfFormTextChange {
                field_name: "customer.name".into(),
                value: "line\nbreak".into()
            }],
        )
        .is_err());
    }

    #[test]
    fn writes_checkbox_export_value_and_widget_appearance_state() {
        let source = button_form_fixture(0);
        let changes = [PdfFormTextChange {
            field_name: "consent".into(),
            value: "Approved".into(),
        }];
        let (report, output) =
            build_pdf_text_form_copy(&source, &digest(&source), &changes).unwrap();
        let output = output.unwrap();
        assert_eq!(report.widget_states_written, 1);
        assert_eq!(report.appearance_streams_written, 0);
        assert!(report.field_tree_verified);
        assert!(report.widget_appearances_verified);
        let inspection = inspect_pdf_forms(&output).unwrap();
        assert_eq!(inspection.fields[0].value.as_deref(), Some("Approved"));
        assert_eq!(
            inspection.fields[0].button_kind.as_deref(),
            Some("checkbox")
        );
        assert_eq!(inspection.fields[0].button_export_values, vec!["Approved"]);
        assert_eq!(
            inspection.widgets[0].appearance_states,
            vec!["Approved", "Off"]
        );
        let reopened = Document::load_mem(&output).unwrap();
        let target = collect_targets(&reopened)
            .unwrap()
            .remove("consent")
            .unwrap();
        assert_eq!(
            reopened
                .get_dictionary(target.field_id)
                .unwrap()
                .get(b"V")
                .unwrap()
                .as_name()
                .unwrap(),
            b"Approved"
        );
        assert_eq!(
            reopened
                .get_dictionary(target.widget_ids[0])
                .unwrap()
                .get(b"AS")
                .unwrap()
                .as_name()
                .unwrap(),
            b"Approved"
        );
        assert!(build_pdf_text_form_copy(
            &source,
            &digest(&source),
            &[PdfFormTextChange {
                field_name: "consent".into(),
                value: "Maybe".into()
            }],
        )
        .is_err());
        let radio = button_form_fixture(1 << 15);
        assert!(build_pdf_text_form_copy(
            &radio,
            &digest(&radio),
            &[PdfFormTextChange {
                field_name: "consent".into(),
                value: "Approved".into()
            }],
        )
        .is_err());
    }
}
