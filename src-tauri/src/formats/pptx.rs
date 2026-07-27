use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub const MAX_PPTX_FILE_BYTES: u64 = 96 * 1024 * 1024;
const MAX_PPTX_ENTRIES: usize = 12_000;
const MAX_PPTX_UNCOMPRESSED_BYTES: u64 = 384 * 1024 * 1024;
const MAX_PPTX_XML_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PPTX_SLIDES: usize = 2_000;
const MAX_PPTX_OBJECTS: usize = 100_000;
const MAX_PPTX_TEXT_CHARS: usize = 2_000_000;

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxTextStyle {
    pub font_size_hundredth_points: Option<u32>,
    pub font_family: Option<String>,
    pub color: Option<String>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub alignment: Option<String>,
    pub vertical_anchor: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxObject {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub text: String,
    pub alt_text: Option<String>,
    pub shape_type: Option<String>,
    pub media_part: Option<String>,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub rotation: Option<i64>,
    pub fill_color: Option<String>,
    pub line_color: Option<String>,
    pub line_width: Option<i64>,
    pub no_fill: bool,
    pub text_style: PptxTextStyle,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxSlide {
    pub id: String,
    pub part_name: String,
    pub title: String,
    pub text: String,
    pub notes: String,
    pub hidden: bool,
    pub has_background: bool,
    pub background_color: String,
    pub background_source: String,
    pub theme_name: Option<String>,
    pub objects: Vec<PptxObject>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxCompatibilityProfile {
    pub producer: Option<String>,
    pub application: Option<String>,
    pub slide_count: usize,
    pub text_object_count: usize,
    pub image_count: usize,
    pub shape_count: usize,
    pub group_count: usize,
    pub chart_count: usize,
    pub smart_art_count: usize,
    pub animation_count: usize,
    pub notes_count: usize,
    pub embedded_object_count: usize,
    pub theme_count: usize,
    pub master_count: usize,
    pub unknown_presentation_parts: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxPresentationModel {
    pub width: i64,
    pub height: i64,
    pub slides: Vec<PptxSlide>,
    pub plain_text: String,
    pub compatibility: PptxCompatibilityProfile,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug)]
struct Relationship {
    target: String,
    relation_type: String,
}

#[derive(Clone, Debug, Default)]
struct ThemeData {
    name: Option<String>,
    colors: HashMap<String, String>,
    major_font: Option<String>,
    minor_font: Option<String>,
}

#[derive(Default)]
struct ObjectState {
    root_name: String,
    depth: usize,
    id: String,
    name: String,
    text: String,
    alt_text: Option<String>,
    shape_type: Option<String>,
    relationship_id: Option<String>,
    x: Option<i64>,
    y: Option<i64>,
    width: Option<i64>,
    height: Option<i64>,
    placeholder_type: Option<String>,
    rotation: Option<i64>,
    fill_color: Option<String>,
    line_color: Option<String>,
    line_width: Option<i64>,
    no_fill: bool,
    fill_explicit: bool,
    line_explicit: bool,
    text_style: PptxTextStyle,
}

fn attribute_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("PPTX XML 属性损坏: {error}"))?;
        if attribute.key.local_name().as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("PPTX XML 属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn parse_i64(value: Option<String>) -> Option<i64> {
    value.and_then(|value| value.parse().ok())
}

fn parse_u32(value: Option<String>) -> Option<u32> {
    value.and_then(|value| value.parse().ok())
}

fn parse_bool(value: Option<String>) -> Option<bool> {
    value.map(|value| {
        value == "1" || value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("on")
    })
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let value = value.trim().trim_start_matches('#');
    if value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Some(format!("#{}", value.to_ascii_uppercase()))
    } else {
        None
    }
}

fn default_color_map() -> HashMap<String, String> {
    [
        ("bg1", "lt1"),
        ("tx1", "dk1"),
        ("bg2", "lt2"),
        ("tx2", "dk2"),
        ("accent1", "accent1"),
        ("accent2", "accent2"),
        ("accent3", "accent3"),
        ("accent4", "accent4"),
        ("accent5", "accent5"),
        ("accent6", "accent6"),
        ("hlink", "hlink"),
        ("folHlink", "folHlink"),
    ]
    .into_iter()
    .map(|(key, value)| (key.into(), value.into()))
    .collect()
}

fn resolve_scheme_color(
    value: &str,
    theme: &ThemeData,
    color_map: &HashMap<String, String>,
) -> Option<String> {
    if value == "phClr" {
        return None;
    }
    let mapped = color_map.get(value).map(String::as_str).unwrap_or(value);
    theme.colors.get(mapped).cloned()
}

fn color_from_event(
    event: &BytesStart<'_>,
    theme: &ThemeData,
    color_map: &HashMap<String, String>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    match event.local_name().as_ref() {
        b"srgbClr" => Ok(attribute_value(event, b"val", decoder)?
            .as_deref()
            .and_then(normalize_hex_color)),
        b"sysClr" => Ok(attribute_value(event, b"lastClr", decoder)?
            .or(attribute_value(event, b"val", decoder)?)
            .as_deref()
            .and_then(normalize_hex_color)),
        b"schemeClr" => Ok(attribute_value(event, b"val", decoder)?
            .as_deref()
            .and_then(|value| resolve_scheme_color(value, theme, color_map))),
        _ => Ok(None),
    }
}

fn parse_theme(xml: &[u8]) -> Result<ThemeData, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut theme = ThemeData::default();
    let mut stack: Vec<String> = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let name = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                if name == "theme" {
                    theme.name = attribute_value(&event, b"name", reader.decoder())?;
                }
                if matches!(name.as_str(), "srgbClr" | "sysClr") {
                    if let Some(key) = stack.last() {
                        let value = if name == "srgbClr" {
                            attribute_value(&event, b"val", reader.decoder())?
                        } else {
                            attribute_value(&event, b"lastClr", reader.decoder())?
                                .or(attribute_value(&event, b"val", reader.decoder())?)
                        };
                        if let Some(color) = value.as_deref().and_then(normalize_hex_color) {
                            theme.colors.insert(key.clone(), color);
                        }
                    }
                }
                if name == "latin" {
                    let typeface = attribute_value(&event, b"typeface", reader.decoder())?;
                    if stack.iter().any(|value| value == "majorFont") {
                        theme.major_font = typeface.filter(|value| !value.is_empty());
                    } else if stack.iter().any(|value| value == "minorFont") {
                        theme.minor_font = typeface.filter(|value| !value.is_empty());
                    }
                }
                stack.push(name);
            }
            Ok(Event::Empty(event)) => {
                let name = event.local_name();
                let name = name.as_ref();
                if matches!(name, b"srgbClr" | b"sysClr") {
                    if let Some(key) = stack.last() {
                        let value = if name == b"srgbClr" {
                            attribute_value(&event, b"val", reader.decoder())?
                        } else {
                            attribute_value(&event, b"lastClr", reader.decoder())?
                                .or(attribute_value(&event, b"val", reader.decoder())?)
                        };
                        if let Some(color) = value.as_deref().and_then(normalize_hex_color) {
                            theme.colors.insert(key.clone(), color);
                        }
                    }
                }
                if name == b"latin" {
                    let typeface = attribute_value(&event, b"typeface", reader.decoder())?;
                    if stack.iter().any(|value| value == "majorFont") {
                        theme.major_font = typeface.filter(|value| !value.is_empty());
                    } else if stack.iter().any(|value| value == "minorFont") {
                        theme.minor_font = typeface.filter(|value| !value.is_empty());
                    }
                }
            }
            Ok(Event::End(_)) => {
                stack.pop();
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX theme XML is invalid: {error}")),
        }
    }
    Ok(theme)
}

fn parse_color_map(xml: &[u8]) -> Result<HashMap<String, String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event))
                if event.local_name().as_ref() == b"clrMap" =>
            {
                let mut map = default_color_map();
                for key in [
                    "bg1", "tx1", "bg2", "tx2", "accent1", "accent2", "accent3", "accent4",
                    "accent5", "accent6", "hlink", "folHlink",
                ] {
                    if let Some(value) = attribute_value(&event, key.as_bytes(), reader.decoder())?
                    {
                        map.insert(key.into(), value);
                    }
                }
                return Ok(map);
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX color map XML is invalid: {error}")),
        }
    }
    Ok(default_color_map())
}

fn parse_background_color(
    xml: &[u8],
    theme: &ThemeData,
    color_map: &HashMap<String, String>,
) -> Result<Option<String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut stack: Vec<String> = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let name = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                if stack.iter().any(|value| value == "bg")
                    && matches!(name.as_str(), "srgbClr" | "sysClr" | "schemeClr")
                {
                    if let Some(color) =
                        color_from_event(&event, theme, color_map, reader.decoder())?
                    {
                        return Ok(Some(color));
                    }
                }
                stack.push(name);
            }
            Ok(Event::Empty(event)) => {
                if stack.iter().any(|value| value == "bg")
                    && matches!(
                        event.local_name().as_ref(),
                        b"srgbClr" | b"sysClr" | b"schemeClr"
                    )
                {
                    if let Some(color) =
                        color_from_event(&event, theme, color_map, reader.decoder())?
                    {
                        return Ok(Some(color));
                    }
                }
            }
            Ok(Event::End(_)) => {
                stack.pop();
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX background XML is invalid: {error}")),
        }
    }
    Ok(None)
}

fn relationship_id(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| format!("PPTX XML 属性损坏: {error}"))?;
        if attribute.key.as_ref().ends_with(b":id") {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("PPTX 关系属性解码失败: {error}"));
        }
    }
    Ok(None)
}

fn read_entry(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    part_name: &str,
) -> Result<Option<Vec<u8>>, String> {
    let mut entry = match archive.by_name(part_name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(error) => return Err(format!("读取 PPTX 部件 {part_name} 失败: {error}")),
    };
    if entry.enclosed_name().is_none() {
        return Err(format!("PPTX 部件路径不安全: {part_name}"));
    }
    if entry.size() > MAX_PPTX_XML_BYTES {
        return Err(format!("PPTX XML 部件超过 32 MiB 上限: {part_name}"));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取 PPTX 部件 {part_name} 失败: {error}"))?;
    Ok(Some(bytes))
}

fn normalize_part(base_part: &str, target: &str) -> String {
    if target.starts_with('/') {
        return target.trim_start_matches('/').replace('\\', "/");
    }
    let mut components: Vec<&str> = base_part.split('/').collect();
    components.pop();
    let normalized_target = target.replace('\\', "/");
    for component in normalized_target.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                components.pop();
            }
            value => components.push(value),
        }
    }
    components.join("/")
}

fn relationship_part(part_name: &str) -> String {
    let mut segments: Vec<&str> = part_name.split('/').collect();
    let file_name = segments.pop().unwrap_or(part_name);
    let parent = segments.join("/");
    if parent.is_empty() {
        format!("_rels/{file_name}.rels")
    } else {
        format!("{parent}/_rels/{file_name}.rels")
    }
}

fn parse_relationships(
    xml: &[u8],
    base_part: &str,
) -> Result<HashMap<String, Relationship>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut relationships = HashMap::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event))
                if event.local_name().as_ref() == b"Relationship" =>
            {
                let id = attribute_value(&event, b"Id", reader.decoder())?.unwrap_or_default();
                let target =
                    attribute_value(&event, b"Target", reader.decoder())?.unwrap_or_default();
                let relation_type =
                    attribute_value(&event, b"Type", reader.decoder())?.unwrap_or_default();
                let target_mode =
                    attribute_value(&event, b"TargetMode", reader.decoder())?.unwrap_or_default();
                if !id.is_empty() && !target.is_empty() && target_mode != "External" {
                    relationships.insert(
                        id,
                        Relationship {
                            target: normalize_part(base_part, &target),
                            relation_type,
                        },
                    );
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX 关系 XML 损坏: {error}")),
        }
    }
    Ok(relationships)
}

fn extract_text(xml: &[u8]) -> Result<String, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut in_text = false;
    let mut values = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) if event.local_name().as_ref() == b"t" => in_text = true,
            Ok(Event::End(event)) if event.local_name().as_ref() == b"t" => in_text = false,
            Ok(Event::Text(event)) if in_text => {
                let value = event
                    .decode()
                    .map_err(|error| format!("PPTX 文本解码失败: {error}"))?;
                if !value.trim().is_empty() {
                    values.push(value.into_owned());
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX 文本 XML 损坏: {error}")),
        }
    }
    Ok(values.join("\n"))
}

fn parse_presentation(xml: &[u8]) -> Result<(i64, i64, Vec<(String, String, bool)>), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut width = 12_192_000;
    let mut height = 6_858_000;
    let mut slides = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event))
                if event.local_name().as_ref() == b"sldSz" =>
            {
                width =
                    parse_i64(attribute_value(&event, b"cx", reader.decoder())?).unwrap_or(width);
                height =
                    parse_i64(attribute_value(&event, b"cy", reader.decoder())?).unwrap_or(height);
            }
            Ok(Event::Start(event)) | Ok(Event::Empty(event))
                if event.local_name().as_ref() == b"sldId" =>
            {
                let id = attribute_value(&event, b"id", reader.decoder())?.unwrap_or_default();
                let relationship_id =
                    relationship_id(&event, reader.decoder())?.unwrap_or_default();
                let hidden = attribute_value(&event, b"show", reader.decoder())?
                    .is_some_and(|value| value == "0" || value.eq_ignore_ascii_case("false"));
                slides.push((id, relationship_id, hidden));
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX presentation.xml 损坏: {error}")),
        }
    }
    Ok((width, height, slides))
}

fn update_object_event(
    state: &mut ObjectState,
    event: &BytesStart<'_>,
    stack: &[String],
    theme: &ThemeData,
    color_map: &HashMap<String, String>,
    decoder: quick_xml::encoding::Decoder,
) -> Result<(), String> {
    let name = event.local_name();
    let name = name.as_ref();
    match name {
        b"cNvPr" => {
            state.id = attribute_value(event, b"id", decoder)?.unwrap_or_default();
            state.name = attribute_value(event, b"name", decoder)?.unwrap_or_default();
            state.alt_text = attribute_value(event, b"descr", decoder)?;
        }
        b"ph" => state.placeholder_type = attribute_value(event, b"type", decoder)?,
        b"prstGeom" => state.shape_type = attribute_value(event, b"prst", decoder)?,
        b"off" => {
            state.x = parse_i64(attribute_value(event, b"x", decoder)?);
            state.y = parse_i64(attribute_value(event, b"y", decoder)?);
        }
        b"ext" => {
            state.width = parse_i64(attribute_value(event, b"cx", decoder)?);
            state.height = parse_i64(attribute_value(event, b"cy", decoder)?);
        }
        b"xfrm" => state.rotation = parse_i64(attribute_value(event, b"rot", decoder)?),
        b"blip" => state.relationship_id = attribute_value(event, b"embed", decoder)?,
        b"ln" => {
            state.line_width = parse_i64(attribute_value(event, b"w", decoder)?);
        }
        b"noFill"
            if stack.iter().any(|value| value == "spPr")
                && !stack.iter().any(|value| value == "ln") =>
        {
            state.no_fill = true;
            state.fill_explicit = true;
            state.fill_color = None;
        }
        b"rPr" | b"defRPr" | b"endParaRPr" => {
            if let Some(value) = parse_u32(attribute_value(event, b"sz", decoder)?) {
                state.text_style.font_size_hundredth_points = Some(value);
            }
            if let Some(value) = parse_bool(attribute_value(event, b"b", decoder)?) {
                state.text_style.bold = Some(value);
            }
            if let Some(value) = parse_bool(attribute_value(event, b"i", decoder)?) {
                state.text_style.italic = Some(value);
            }
            if let Some(value) = attribute_value(event, b"u", decoder)? {
                state.text_style.underline = Some(value != "none");
            }
        }
        b"latin"
            if stack
                .iter()
                .any(|value| matches!(value.as_str(), "rPr" | "defRPr" | "endParaRPr")) =>
        {
            if let Some(value) = attribute_value(event, b"typeface", decoder)? {
                state.text_style.font_family = match value.as_str() {
                    "+mj-lt" => theme.major_font.clone(),
                    "+mn-lt" => theme.minor_font.clone(),
                    _ if value.is_empty() => None,
                    _ => Some(value),
                };
            }
        }
        b"pPr" => {
            state.text_style.alignment =
                attribute_value(event, b"algn", decoder)?.and_then(|value| {
                    Some(
                        match value.as_str() {
                            "l" => "left",
                            "ctr" => "center",
                            "r" => "right",
                            "just" | "justLow" | "dist" | "thaiDist" => "justify",
                            _ => return None,
                        }
                        .into(),
                    )
                });
        }
        b"bodyPr" => {
            state.text_style.vertical_anchor = attribute_value(event, b"anchor", decoder)?
                .and_then(|value| {
                    Some(
                        match value.as_str() {
                            "t" => "top",
                            "ctr" => "middle",
                            "b" => "bottom",
                            _ => return None,
                        }
                        .into(),
                    )
                });
        }
        b"fontRef" => {
            state.text_style.font_family = match attribute_value(event, b"idx", decoder)?.as_deref()
            {
                Some("major") => theme.major_font.clone(),
                Some("minor") => theme.minor_font.clone(),
                _ => state.text_style.font_family.clone(),
            };
        }
        b"srgbClr" | b"sysClr" | b"schemeClr" => {
            if let Some(color) = color_from_event(event, theme, color_map, decoder)? {
                let in_text_style = stack.iter().any(|value| {
                    matches!(value.as_str(), "rPr" | "defRPr" | "endParaRPr" | "fontRef")
                });
                let in_line = stack.iter().any(|value| value == "ln")
                    || stack.iter().any(|value| value == "lnRef");
                let in_fill_ref = stack.iter().any(|value| value == "fillRef");
                let in_shape_fill = stack.iter().any(|value| value == "spPr")
                    && stack.iter().any(|value| value == "solidFill")
                    && !in_line;
                if in_text_style {
                    state.text_style.color = Some(color);
                } else if in_line {
                    if !state.line_explicit || !stack.iter().any(|value| value == "lnRef") {
                        state.line_color = Some(color);
                        state.line_explicit = !stack.iter().any(|value| value == "lnRef");
                    }
                } else if in_shape_fill {
                    state.fill_color = Some(color);
                    state.fill_explicit = true;
                    state.no_fill = false;
                } else if in_fill_ref && !state.fill_explicit {
                    state.fill_color = Some(color);
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn finalize_object(
    state: ObjectState,
    relationships: &HashMap<String, Relationship>,
) -> PptxObject {
    let media_part = state
        .relationship_id
        .as_ref()
        .and_then(|id| relationships.get(id))
        .filter(|relationship| relationship.relation_type.ends_with("/image"))
        .map(|relationship| relationship.target.clone());
    let kind = match state.root_name.as_str() {
        "pic" => "picture",
        "grpSp" => "group",
        "graphicFrame" => "graphic",
        _ if !state.text.trim().is_empty() => "text",
        _ => "shape",
    };
    PptxObject {
        id: state.id,
        kind: kind.into(),
        name: state.name,
        text: state.text.trim().into(),
        alt_text: state.alt_text,
        shape_type: state.shape_type,
        media_part,
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        rotation: state.rotation,
        fill_color: state.fill_color,
        line_color: state.line_color,
        line_width: state.line_width,
        no_fill: state.no_fill,
        text_style: state.text_style,
    }
}

fn parse_slide(
    xml: &[u8],
    relationships: &HashMap<String, Relationship>,
    theme: &ThemeData,
    color_map: &HashMap<String, String>,
) -> Result<(Vec<PptxObject>, bool, bool, Vec<String>), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0_usize;
    let mut current: Option<ObjectState> = None;
    let mut objects = Vec::new();
    let mut in_text = false;
    let mut has_background = false;
    let mut has_animation = false;
    let mut warnings = Vec::new();
    let mut stack: Vec<String> = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                depth += 1;
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"bg" {
                    has_background = true;
                }
                if name == b"timing" {
                    has_animation = true;
                }
                if current.is_none() && matches!(name, b"sp" | b"pic" | b"grpSp" | b"graphicFrame")
                {
                    current = Some(ObjectState {
                        root_name: String::from_utf8_lossy(name).into_owned(),
                        depth,
                        ..ObjectState::default()
                    });
                } else if let Some(state) = current.as_mut() {
                    update_object_event(state, &event, &stack, theme, color_map, reader.decoder())?;
                    if name == b"t" {
                        in_text = true;
                    }
                }
                stack.push(String::from_utf8_lossy(name).into_owned());
            }
            Ok(Event::Empty(event)) => {
                let name = event.local_name();
                let name = name.as_ref();
                if name == b"bg" {
                    has_background = true;
                }
                if name == b"timing" {
                    has_animation = true;
                }
                if let Some(state) = current.as_mut() {
                    update_object_event(state, &event, &stack, theme, color_map, reader.decoder())?;
                }
            }
            Ok(Event::Text(event)) if in_text => {
                if let Some(state) = current.as_mut() {
                    let value = event
                        .decode()
                        .map_err(|error| format!("PPTX 幻灯片文本解码失败: {error}"))?;
                    if !state.text.is_empty() && !value.trim().is_empty() {
                        state.text.push('\n');
                    }
                    state.text.push_str(&value);
                }
            }
            Ok(Event::End(event)) => {
                if event.local_name().as_ref() == b"t" {
                    in_text = false;
                }
                let should_finalize = current.as_ref().is_some_and(|state| {
                    state.depth == depth
                        && event.local_name().as_ref() == state.root_name.as_bytes()
                });
                if should_finalize {
                    let state = current.take().expect("checked object state");
                    objects.push(finalize_object(state, relationships));
                    if objects.len() > MAX_PPTX_OBJECTS {
                        return Err("PPTX 对象数量超过 100,000 上限".into());
                    }
                }
                stack.pop();
                depth = depth.saturating_sub(1);
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX 幻灯片 XML 损坏: {error}")),
        }
    }
    if objects.iter().any(|object| object.kind == "graphic") {
        warnings.push("图表、SmartArt 或其他图形框架当前只显示占位".into());
    }
    if has_animation {
        warnings.push("动画和切换只读保真，当前不执行".into());
    }
    Ok((objects, has_background, has_animation, warnings))
}

fn app_property(xml: &[u8], property: &[u8]) -> Result<Option<String>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut active = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) if event.local_name().as_ref() == property => active = true,
            Ok(Event::End(event)) if event.local_name().as_ref() == property => active = false,
            Ok(Event::Text(event)) if active => {
                return event
                    .decode()
                    .map(|value| Some(value.into_owned()))
                    .map_err(|error| format!("PPTX 应用属性解码失败: {error}"));
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("PPTX 应用属性 XML 损坏: {error}")),
        }
    }
    Ok(None)
}

pub fn parse_pptx(bytes: &[u8]) -> Result<PptxPresentationModel, String> {
    if bytes.len() as u64 > MAX_PPTX_FILE_BYTES {
        return Err("PPTX 文件超过 96 MiB 读取上限".into());
    }
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("PPTX ZIP 损坏: {error}"))?;
    if archive.len() > MAX_PPTX_ENTRIES {
        return Err("PPTX ZIP 条目超过 12,000 上限".into());
    }
    let mut total_uncompressed = 0_u64;
    let mut part_names = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("读取 PPTX ZIP 目录失败: {error}"))?;
        if entry.enclosed_name().is_none() {
            return Err(format!("PPTX ZIP 包含不安全路径: {}", entry.name()));
        }
        total_uncompressed = total_uncompressed.saturating_add(entry.size());
        if total_uncompressed > MAX_PPTX_UNCOMPRESSED_BYTES {
            return Err("PPTX 解压总量超过 384 MiB 上限".into());
        }
        part_names.push(entry.name().replace('\\', "/"));
    }
    let presentation_xml = read_entry(&mut archive, "ppt/presentation.xml")?
        .ok_or_else(|| "PPTX 缺少 ppt/presentation.xml".to_string())?;
    let presentation_rels_xml = read_entry(&mut archive, "ppt/_rels/presentation.xml.rels")?
        .ok_or_else(|| "PPTX 缺少 presentation.xml.rels".to_string())?;
    let presentation_relationships =
        parse_relationships(&presentation_rels_xml, "ppt/presentation.xml")?;
    let (width, height, ordered_slide_ids) = parse_presentation(&presentation_xml)?;
    if ordered_slide_ids.len() > MAX_PPTX_SLIDES {
        return Err("PPTX 幻灯片超过 2,000 页上限".into());
    }

    let mut slides = Vec::with_capacity(ordered_slide_ids.len());
    let mut total_text_chars = 0_usize;
    let mut animation_count = 0_usize;
    let mut image_parts = HashSet::new();
    for (index, (slide_id, relationship_id, hidden)) in ordered_slide_ids.into_iter().enumerate() {
        let slide_part = presentation_relationships
            .get(&relationship_id)
            .filter(|relationship| relationship.relation_type.ends_with("/slide"))
            .map(|relationship| relationship.target.clone())
            .ok_or_else(|| format!("PPTX 幻灯片关系缺失: {relationship_id}"))?;
        let slide_xml = read_entry(&mut archive, &slide_part)?
            .ok_or_else(|| format!("PPTX 幻灯片部件缺失: {slide_part}"))?;
        let slide_relationships = match read_entry(&mut archive, &relationship_part(&slide_part))? {
            Some(xml) => parse_relationships(&xml, &slide_part)?,
            None => HashMap::new(),
        };
        let layout_part = slide_relationships
            .values()
            .find(|relationship| relationship.relation_type.ends_with("/slideLayout"))
            .map(|relationship| relationship.target.clone());
        let layout_xml = match layout_part.as_deref() {
            Some(part) => read_entry(&mut archive, part)?,
            None => None,
        };
        let layout_relationships = match layout_part.as_deref() {
            Some(part) => match read_entry(&mut archive, &relationship_part(part))? {
                Some(xml) => parse_relationships(&xml, part)?,
                None => HashMap::new(),
            },
            None => HashMap::new(),
        };
        let master_part = layout_relationships
            .values()
            .find(|relationship| relationship.relation_type.ends_with("/slideMaster"))
            .map(|relationship| relationship.target.clone());
        let master_xml = match master_part.as_deref() {
            Some(part) => read_entry(&mut archive, part)?,
            None => None,
        };
        let master_relationships = match master_part.as_deref() {
            Some(part) => match read_entry(&mut archive, &relationship_part(part))? {
                Some(xml) => parse_relationships(&xml, part)?,
                None => HashMap::new(),
            },
            None => HashMap::new(),
        };
        let theme_part = master_relationships
            .values()
            .find(|relationship| relationship.relation_type.ends_with("/theme"))
            .map(|relationship| relationship.target.clone());
        let theme = match theme_part.as_deref() {
            Some(part) => read_entry(&mut archive, part)?
                .as_deref()
                .map(parse_theme)
                .transpose()?
                .unwrap_or_default(),
            None => ThemeData::default(),
        };
        let color_map = master_xml
            .as_deref()
            .map(parse_color_map)
            .transpose()?
            .unwrap_or_else(default_color_map);
        let (background_color, background_source) =
            if let Some(color) = parse_background_color(&slide_xml, &theme, &color_map)? {
                (color, "slide".to_string())
            } else if let Some(color) = layout_xml
                .as_deref()
                .map(|xml| parse_background_color(xml, &theme, &color_map))
                .transpose()?
                .flatten()
            {
                (color, "layout".to_string())
            } else if let Some(color) = master_xml
                .as_deref()
                .map(|xml| parse_background_color(xml, &theme, &color_map))
                .transpose()?
                .flatten()
            {
                (color, "master".to_string())
            } else {
                ("#FFFFFF".to_string(), "default".to_string())
            };
        let (objects, has_background, has_animation, mut warnings) =
            parse_slide(&slide_xml, &slide_relationships, &theme, &color_map)?;
        if has_animation {
            animation_count += 1;
        }
        for object in &objects {
            if let Some(part) = &object.media_part {
                image_parts.insert(part.clone());
            }
        }
        let notes_part = slide_relationships
            .values()
            .find(|relationship| relationship.relation_type.ends_with("/notesSlide"))
            .map(|relationship| relationship.target.clone());
        let notes = match notes_part {
            Some(part) => read_entry(&mut archive, &part)?
                .map(|xml| extract_text(&xml))
                .transpose()?
                .unwrap_or_default(),
            None => String::new(),
        };
        let text = objects
            .iter()
            .filter_map(|object| (!object.text.is_empty()).then_some(object.text.as_str()))
            .collect::<Vec<_>>()
            .join("\n");
        total_text_chars = total_text_chars
            .saturating_add(text.chars().count())
            .saturating_add(notes.chars().count());
        if total_text_chars > MAX_PPTX_TEXT_CHARS {
            return Err("PPTX 可检索文本超过 2,000,000 字符上限".into());
        }
        let title = objects
            .iter()
            .find(|object| {
                object.kind == "text"
                    && (object.name.to_ascii_lowercase().contains("title")
                        || object.name.contains("标题"))
            })
            .or_else(|| objects.iter().find(|object| object.kind == "text"))
            .map(|object| {
                object
                    .text
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_string()
            })
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("幻灯片 {}", index + 1));
        if hidden {
            warnings.push("该幻灯片在原演示文稿中标记为隐藏".into());
        }
        slides.push(PptxSlide {
            id: if slide_id.is_empty() {
                format!("slide-{}", index + 1)
            } else {
                slide_id
            },
            part_name: slide_part,
            title,
            text,
            notes,
            hidden,
            has_background,
            background_color,
            background_source,
            theme_name: theme.name,
            objects,
            warnings,
        });
    }

    let app_xml = read_entry(&mut archive, "docProps/app.xml")?;
    let application = app_xml
        .as_deref()
        .map(|xml| app_property(xml, b"Application"))
        .transpose()?
        .flatten();
    let producer = application.clone();
    let chart_count = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/charts/") && part.ends_with(".xml"))
        .count();
    let smart_art_count = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/diagrams/") && part.ends_with(".xml"))
        .count();
    let embedded_object_count = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/embeddings/"))
        .count();
    let theme_count = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/theme/") && part.ends_with(".xml"))
        .count();
    let master_count = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/slideMasters/") && part.ends_with(".xml"))
        .count();
    let known_prefixes = [
        "ppt/slides/",
        "ppt/slideLayouts/",
        "ppt/slideMasters/",
        "ppt/theme/",
        "ppt/notesSlides/",
        "ppt/notesMasters/",
        "ppt/media/",
        "ppt/charts/",
        "ppt/diagrams/",
        "ppt/embeddings/",
        "ppt/presentation.xml",
        "ppt/presProps.xml",
        "ppt/viewProps.xml",
        "ppt/tableStyles.xml",
        "ppt/comment",
        "ppt/people.xml",
        "ppt/_rels/",
        "ppt/vbaProject.bin",
    ];
    let mut unknown_presentation_parts: Vec<String> = part_names
        .iter()
        .filter(|part| part.starts_with("ppt/"))
        .filter(|part| !known_prefixes.iter().any(|prefix| part.starts_with(prefix)))
        .cloned()
        .collect();
    unknown_presentation_parts.sort();
    unknown_presentation_parts.dedup();
    let text_object_count = slides
        .iter()
        .flat_map(|slide| slide.objects.iter())
        .filter(|object| object.kind == "text")
        .count();
    let shape_count = slides
        .iter()
        .flat_map(|slide| slide.objects.iter())
        .filter(|object| object.kind == "shape")
        .count();
    let group_count = slides
        .iter()
        .flat_map(|slide| slide.objects.iter())
        .filter(|object| object.kind == "group")
        .count();
    let notes_count = slides
        .iter()
        .filter(|slide| !slide.notes.is_empty())
        .count();
    let plain_text = slides
        .iter()
        .flat_map(|slide| [&slide.title, &slide.text, &slide.notes])
        .filter(|value| !value.is_empty())
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    let mut warnings = Vec::new();
    if chart_count + smart_art_count + embedded_object_count > 0 {
        warnings.push("图表、SmartArt 和嵌入对象只读保真，当前仅显示兼容占位".into());
    }
    if animation_count > 0 {
        warnings.push("动画和切换保留在原包中，当前放映不执行动画".into());
    }
    if !unknown_presentation_parts.is_empty() {
        warnings.push("检测到未知演示部件；当前严格只读，不会重写原包".into());
    }
    Ok(PptxPresentationModel {
        width,
        height,
        compatibility: PptxCompatibilityProfile {
            producer,
            application,
            slide_count: slides.len(),
            text_object_count,
            image_count: image_parts.len(),
            shape_count,
            group_count,
            chart_count,
            smart_art_count,
            animation_count,
            notes_count,
            embedded_object_count,
            theme_count,
            master_count,
            unknown_presentation_parts,
        },
        slides,
        plain_text,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn fixture() -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut output);
            let options = SimpleFileOptions::default();
            let entries = [
                (
                    "ppt/presentation.xml",
                    r#"<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>"#,
                ),
                (
                    "ppt/_rels/presentation.xml.rels",
                    r#"<Relationships xmlns="r"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>"#,
                ),
                (
                    "ppt/slides/slide1.xml",
                    r#"<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/></p:nvSpPr><p:spPr><a:xfrm rot="60000"><a:off x="10" y="20"/><a:ext cx="300" cy="100"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="102030"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:rPr><a:t>Audit title</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture" descr="Audit image"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic></p:spTree></p:cSld><p:timing/></p:sld>"#,
                ),
                (
                    "ppt/slides/_rels/slide1.xml.rels",
                    r#"<Relationships xmlns="r"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>"#,
                ),
                (
                    "ppt/slideLayouts/slideLayout1.xml",
                    r#"<p:sldLayout xmlns:p="p"><p:cSld/></p:sldLayout>"#,
                ),
                (
                    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
                    r#"<Relationships xmlns="r"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>"#,
                ),
                (
                    "ppt/slideMasters/slideMaster1.xml",
                    r#"<p:sldMaster xmlns:p="p" xmlns:a="a"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>"#,
                ),
                (
                    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
                    r#"<Relationships xmlns="r"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>"#,
                ),
                (
                    "ppt/theme/theme1.xml",
                    r#"<a:theme xmlns:a="a" name="Audit Theme"><a:themeElements><a:clrScheme name="Audit"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="F8F9FA"/></a:lt1><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme><a:fontScheme name="Audit Fonts"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>"#,
                ),
                (
                    "ppt/notesSlides/notesSlide1.xml",
                    r#"<p:notes xmlns:p="p" xmlns:a="a"><a:t>Speaker note</a:t></p:notes>"#,
                ),
                ("ppt/media/image1.png", "not-read-by-parser"),
                (
                    "docProps/app.xml",
                    r#"<Properties xmlns="p"><Application>Microsoft Office PowerPoint</Application></Properties>"#,
                ),
            ];
            for (name, content) in entries {
                writer.start_file(name, options).unwrap();
                writer.write_all(content.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        output.into_inner()
    }

    #[test]
    fn parses_ordered_slide_objects_notes_and_risk_profile() {
        let model = parse_pptx(&fixture()).unwrap();
        assert_eq!(model.width, 12_192_000);
        assert_eq!(model.slides.len(), 1);
        assert_eq!(model.slides[0].title, "Audit title");
        assert_eq!(model.slides[0].notes, "Speaker note");
        assert_eq!(model.slides[0].objects.len(), 2);
        assert_eq!(model.slides[0].background_color, "#F8F9FA");
        assert_eq!(model.slides[0].background_source, "master");
        assert_eq!(model.slides[0].theme_name.as_deref(), Some("Audit Theme"));
        assert_eq!(
            model.slides[0].objects[0].fill_color.as_deref(),
            Some("#4472C4")
        );
        assert_eq!(
            model.slides[0].objects[0].line_color.as_deref(),
            Some("#102030")
        );
        assert_eq!(model.slides[0].objects[0].rotation, Some(60_000));
        assert_eq!(
            model.slides[0].objects[0].text_style.font_family.as_deref(),
            Some("Aptos Display")
        );
        assert_eq!(
            model.slides[0].objects[0]
                .text_style
                .font_size_hundredth_points,
            Some(2400)
        );
        assert_eq!(
            model.slides[0].objects[0].text_style.color.as_deref(),
            Some("#111111")
        );
        assert_eq!(
            model.slides[0].objects[0].text_style.alignment.as_deref(),
            Some("center")
        );
        assert_eq!(
            model.slides[0].objects[1].media_part.as_deref(),
            Some("ppt/media/image1.png")
        );
        assert_eq!(model.compatibility.image_count, 1);
        assert_eq!(model.compatibility.animation_count, 1);
        assert_eq!(
            model.compatibility.application.as_deref(),
            Some("Microsoft Office PowerPoint")
        );
    }

    #[test]
    fn rejects_non_pptx_and_unsafe_archives() {
        assert!(parse_pptx(b"not a zip").is_err());
        let mut output = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut output);
            writer
                .start_file("../escape.xml", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"bad").unwrap();
            writer.finish().unwrap();
        }
        assert!(parse_pptx(&output.into_inner()).is_err());
    }

    #[test]
    fn parses_real_powerpoint_and_libreoffice_producer_fixtures() {
        let fixtures = [
            (
                "Microsoft PowerPoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx")
                    .as_slice(),
                3,
                "PowerPoint Producer Fixture",
            ),
            (
                "LibreOffice Impress",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx")
                    .as_slice(),
                2,
                "LibreOffice Impress Producer Fixture",
            ),
        ];
        for (producer, bytes, expected_slides, expected_text) in fixtures {
            let model = parse_pptx(bytes).unwrap_or_else(|error| {
                panic!("{producer} fixture must parse through C3A: {error}")
            });
            assert_eq!(model.slides.len(), expected_slides, "{producer}");
            assert!(model.plain_text.contains(expected_text), "{producer}");
            assert!(model.compatibility.theme_count >= 1, "{producer}");
            assert!(model.compatibility.master_count >= 1, "{producer}");
            assert!(model.compatibility.notes_count >= 1, "{producer}");
            assert!(model.compatibility.image_count >= 1, "{producer}");
            assert!(
                model
                    .slides
                    .iter()
                    .all(|slide| slide.background_color.starts_with('#')),
                "{producer}"
            );
            assert!(
                model.slides.iter().any(|slide| slide
                    .objects
                    .iter()
                    .any(|object| object.fill_color.is_some()
                        || object.text_style.font_size_hundredth_points.is_some())),
                "{producer}"
            );
        }
    }
}
