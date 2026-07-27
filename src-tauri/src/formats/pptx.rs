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
    pub opacity: Option<u32>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxTableCell {
    pub text: String,
    pub grid_span: Option<u32>,
    pub row_span: Option<u32>,
    pub horizontal_merge: bool,
    pub vertical_merge: bool,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxTableRow {
    pub height: Option<i64>,
    pub cells: Vec<PptxTableCell>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxTable {
    pub column_widths: Vec<i64>,
    pub rows: Vec<PptxTableRow>,
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
    pub fill_opacity: Option<u32>,
    pub line_opacity: Option<u32>,
    pub image_opacity: Option<u32>,
    pub crop_left: Option<i64>,
    pub crop_top: Option<i64>,
    pub crop_right: Option<i64>,
    pub crop_bottom: Option<i64>,
    pub parent_group_id: Option<String>,
    pub group_level: usize,
    pub child_count: usize,
    pub text_run_count: usize,
    pub mixed_text_style: bool,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub line_dash: Option<String>,
    pub line_head: Option<String>,
    pub line_tail: Option<String>,
    pub graphic_type: Option<String>,
    pub related_part: Option<String>,
    pub table: Option<PptxTable>,
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

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PptxSearchSegment {
    pub match_kind: String,
    pub text: String,
    pub slide_number: u32,
    pub locator_kind: String,
    pub locator_object_id: String,
    pub location_label: String,
}

pub fn pptx_slide_location_label(slide: &PptxSlide, slide_number: u32) -> String {
    if slide.hidden {
        format!("幻灯片 {slide_number}（隐藏）：{}", slide.title)
    } else {
        format!("幻灯片 {slide_number}：{}", slide.title)
    }
}

fn pptx_object_search_text(object: &PptxObject) -> String {
    let mut parts = Vec::new();
    if !object.text.trim().is_empty() {
        parts.push(object.text.trim().to_string());
    }
    if let Some(alt_text) = object
        .alt_text
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(alt_text.trim().to_string());
    }
    if let Some(table) = &object.table {
        let table_text = table
            .rows
            .iter()
            .flat_map(|row| row.cells.iter())
            .map(|cell| cell.text.trim())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if !table_text.is_empty() {
            parts.push(table_text);
        }
    }
    parts.sort();
    parts.dedup();
    parts.join("\n")
}

pub fn pptx_search_segments(model: &PptxPresentationModel) -> Vec<PptxSearchSegment> {
    let mut segments = Vec::new();
    for (index, slide) in model.slides.iter().enumerate() {
        let slide_number = (index + 1) as u32;
        let slide_label = pptx_slide_location_label(slide, slide_number);
        if !slide.title.trim().is_empty() {
            segments.push(PptxSearchSegment {
                match_kind: "slide-title".into(),
                text: slide.title.clone(),
                slide_number,
                locator_kind: "pptx-slide".into(),
                locator_object_id: slide.id.clone(),
                location_label: slide_label.clone(),
            });
        }
        if !slide.text.trim().is_empty() {
            segments.push(PptxSearchSegment {
                match_kind: "body".into(),
                text: slide.text.clone(),
                slide_number,
                locator_kind: "pptx-slide".into(),
                locator_object_id: slide.id.clone(),
                location_label: slide_label.clone(),
            });
        }
        for object in &slide.objects {
            let text = pptx_object_search_text(object);
            if text.is_empty() {
                continue;
            }
            let object_label = if object.name.trim().is_empty() {
                format!("幻灯片 {slide_number} · 对象 {}", object.id)
            } else {
                format!("幻灯片 {slide_number} · {}", object.name)
            };
            segments.push(PptxSearchSegment {
                match_kind: "object".into(),
                text,
                slide_number,
                locator_kind: "pptx-object".into(),
                locator_object_id: object.id.clone(),
                location_label: object_label,
            });
        }
        if !slide.notes.trim().is_empty() {
            segments.push(PptxSearchSegment {
                match_kind: "notes".into(),
                text: slide.notes.clone(),
                slide_number,
                locator_kind: "pptx-slide".into(),
                locator_object_id: slide.id.clone(),
                location_label: format!("幻灯片 {slide_number} · 备注"),
            });
        }
    }
    segments
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
    fill_opacity: Option<u32>,
    line_opacity: Option<u32>,
    image_opacity: Option<u32>,
    crop_left: Option<i64>,
    crop_top: Option<i64>,
    crop_right: Option<i64>,
    crop_bottom: Option<i64>,
    child_x: Option<i64>,
    child_y: Option<i64>,
    child_width: Option<i64>,
    child_height: Option<i64>,
    parent_group_id: Option<String>,
    group_level: usize,
    child_count: usize,
    in_run: bool,
    current_run_style: PptxTextStyle,
    first_run_style: Option<PptxTextStyle>,
    text_run_count: usize,
    mixed_text_style: bool,
    flip_horizontal: bool,
    flip_vertical: bool,
    line_dash: Option<String>,
    line_head: Option<String>,
    line_tail: Option<String>,
    graphic_type: Option<String>,
    graphic_relationship_id: Option<String>,
    table: Option<PptxTable>,
    current_table_row: Option<PptxTableRow>,
    current_table_cell: Option<PptxTableCell>,
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

fn parse_hex_rgb(color: &str) -> Option<(f64, f64, f64)> {
    let value = color.trim_start_matches('#');
    if value.len() != 6 {
        return None;
    }
    Some((
        u8::from_str_radix(&value[0..2], 16).ok()? as f64 / 255.0,
        u8::from_str_radix(&value[2..4], 16).ok()? as f64 / 255.0,
        u8::from_str_radix(&value[4..6], 16).ok()? as f64 / 255.0,
    ))
}

fn format_hex_rgb(red: f64, green: f64, blue: f64) -> String {
    format!(
        "#{:02X}{:02X}{:02X}",
        (red.clamp(0.0, 1.0) * 255.0).round() as u8,
        (green.clamp(0.0, 1.0) * 255.0).round() as u8,
        (blue.clamp(0.0, 1.0) * 255.0).round() as u8
    )
}

fn rgb_to_hsl(red: f64, green: f64, blue: f64) -> (f64, f64, f64) {
    let maximum = red.max(green).max(blue);
    let minimum = red.min(green).min(blue);
    let lightness = (maximum + minimum) / 2.0;
    if (maximum - minimum).abs() < f64::EPSILON {
        return (0.0, 0.0, lightness);
    }
    let delta = maximum - minimum;
    let saturation = if lightness > 0.5 {
        delta / (2.0 - maximum - minimum)
    } else {
        delta / (maximum + minimum)
    };
    let mut hue = if (maximum - red).abs() < f64::EPSILON {
        (green - blue) / delta + if green < blue { 6.0 } else { 0.0 }
    } else if (maximum - green).abs() < f64::EPSILON {
        (blue - red) / delta + 2.0
    } else {
        (red - green) / delta + 4.0
    };
    hue /= 6.0;
    (hue, saturation, lightness)
}

fn hue_to_rgb(p: f64, q: f64, mut hue: f64) -> f64 {
    if hue < 0.0 {
        hue += 1.0;
    }
    if hue > 1.0 {
        hue -= 1.0;
    }
    if hue < 1.0 / 6.0 {
        p + (q - p) * 6.0 * hue
    } else if hue < 0.5 {
        q
    } else if hue < 2.0 / 3.0 {
        p + (q - p) * (2.0 / 3.0 - hue) * 6.0
    } else {
        p
    }
}

fn hsl_to_rgb(hue: f64, saturation: f64, lightness: f64) -> (f64, f64, f64) {
    if saturation.abs() < f64::EPSILON {
        return (lightness, lightness, lightness);
    }
    let q = if lightness < 0.5 {
        lightness * (1.0 + saturation)
    } else {
        lightness + saturation - lightness * saturation
    };
    let p = 2.0 * lightness - q;
    (
        hue_to_rgb(p, q, hue + 1.0 / 3.0),
        hue_to_rgb(p, q, hue),
        hue_to_rgb(p, q, hue - 1.0 / 3.0),
    )
}

fn apply_color_transform(color: &str, transform: &[u8], value: u32) -> Option<String> {
    let (red, green, blue) = parse_hex_rgb(color)?;
    let factor = value.min(100_000) as f64 / 100_000.0;
    let (red, green, blue) = match transform {
        b"shade" => (red * factor, green * factor, blue * factor),
        b"tint" => (
            1.0 - (1.0 - red) * factor,
            1.0 - (1.0 - green) * factor,
            1.0 - (1.0 - blue) * factor,
        ),
        b"lumMod" | b"lumOff" => {
            let (hue, saturation, lightness) = rgb_to_hsl(red, green, blue);
            let lightness = if transform == b"lumMod" {
                lightness * factor
            } else {
                lightness + factor
            };
            hsl_to_rgb(hue, saturation, lightness.clamp(0.0, 1.0))
        }
        _ => return None,
    };
    Some(format_hex_rgb(red, green, blue))
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
    let mut color = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let name = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                if stack.iter().any(|value| value == "bg")
                    && matches!(name.as_str(), "srgbClr" | "sysClr" | "schemeClr")
                    && color.is_none()
                {
                    color = color_from_event(&event, theme, color_map, reader.decoder())?;
                } else if stack.iter().any(|value| value == "bg")
                    && matches!(name.as_str(), "shade" | "tint" | "lumMod" | "lumOff")
                {
                    if let (Some(current), Some(value)) = (
                        color.as_deref(),
                        parse_u32(attribute_value(&event, b"val", reader.decoder())?),
                    ) {
                        color = apply_color_transform(current, name.as_bytes(), value);
                    }
                }
                stack.push(name);
            }
            Ok(Event::Empty(event)) => {
                let name = event.local_name();
                let name = name.as_ref();
                if stack.iter().any(|value| value == "bg")
                    && matches!(name, b"srgbClr" | b"sysClr" | b"schemeClr")
                    && color.is_none()
                {
                    color = color_from_event(&event, theme, color_map, reader.decoder())?;
                } else if stack.iter().any(|value| value == "bg")
                    && matches!(name, b"shade" | b"tint" | b"lumMod" | b"lumOff")
                {
                    if let (Some(current), Some(value)) = (
                        color.as_deref(),
                        parse_u32(attribute_value(&event, b"val", reader.decoder())?),
                    ) {
                        color = apply_color_transform(current, name, value);
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
    Ok(color)
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
        b"custGeom" => state.shape_type = Some("custom".into()),
        b"off" => {
            state.x = parse_i64(attribute_value(event, b"x", decoder)?);
            state.y = parse_i64(attribute_value(event, b"y", decoder)?);
        }
        b"chOff" => {
            state.child_x = parse_i64(attribute_value(event, b"x", decoder)?);
            state.child_y = parse_i64(attribute_value(event, b"y", decoder)?);
        }
        b"ext" => {
            state.width = parse_i64(attribute_value(event, b"cx", decoder)?);
            state.height = parse_i64(attribute_value(event, b"cy", decoder)?);
        }
        b"chExt" => {
            state.child_width = parse_i64(attribute_value(event, b"cx", decoder)?);
            state.child_height = parse_i64(attribute_value(event, b"cy", decoder)?);
        }
        b"xfrm" => {
            state.rotation = parse_i64(attribute_value(event, b"rot", decoder)?);
            state.flip_horizontal =
                parse_bool(attribute_value(event, b"flipH", decoder)?).unwrap_or(false);
            state.flip_vertical =
                parse_bool(attribute_value(event, b"flipV", decoder)?).unwrap_or(false);
        }
        b"blip" => state.relationship_id = attribute_value(event, b"embed", decoder)?,
        b"srcRect" => {
            state.crop_left = parse_i64(attribute_value(event, b"l", decoder)?);
            state.crop_top = parse_i64(attribute_value(event, b"t", decoder)?);
            state.crop_right = parse_i64(attribute_value(event, b"r", decoder)?);
            state.crop_bottom = parse_i64(attribute_value(event, b"b", decoder)?);
        }
        b"alphaModFix" if stack.iter().any(|value| value == "blip") => {
            state.image_opacity =
                parse_u32(attribute_value(event, b"amt", decoder)?).map(|value| value.min(100_000));
        }
        b"ln" => {
            state.line_width = parse_i64(attribute_value(event, b"w", decoder)?);
        }
        b"prstDash" => state.line_dash = attribute_value(event, b"val", decoder)?,
        b"headEnd" => state.line_head = attribute_value(event, b"type", decoder)?,
        b"tailEnd" => state.line_tail = attribute_value(event, b"type", decoder)?,
        b"tbl" => {
            state.graphic_type = Some("table".into());
            state.table = Some(PptxTable::default());
        }
        b"gridCol" => {
            if let (Some(table), Some(width)) = (
                state.table.as_mut(),
                parse_i64(attribute_value(event, b"w", decoder)?),
            ) {
                table.column_widths.push(width);
            }
        }
        b"tr" if state.table.is_some() => {
            state.current_table_row = Some(PptxTableRow {
                height: parse_i64(attribute_value(event, b"h", decoder)?),
                cells: Vec::new(),
            });
        }
        b"tc" if state.current_table_row.is_some() => {
            state.current_table_cell = Some(PptxTableCell {
                grid_span: parse_u32(attribute_value(event, b"gridSpan", decoder)?),
                row_span: parse_u32(attribute_value(event, b"rowSpan", decoder)?),
                horizontal_merge: parse_bool(attribute_value(event, b"hMerge", decoder)?)
                    .unwrap_or(false),
                vertical_merge: parse_bool(attribute_value(event, b"vMerge", decoder)?)
                    .unwrap_or(false),
                ..PptxTableCell::default()
            });
        }
        b"chart" => {
            state.graphic_type = Some("chart".into());
            state.graphic_relationship_id = attribute_value(event, b"id", decoder)?;
        }
        b"relIds" => {
            state.graphic_type = Some("smartArt".into());
            state.graphic_relationship_id = attribute_value(event, b"dm", decoder)?;
        }
        b"oleObj" => {
            state.graphic_type = Some("embedded".into());
            state.graphic_relationship_id = attribute_value(event, b"id", decoder)?;
        }
        b"videoFile" => {
            state.graphic_type = Some("video".into());
            state.graphic_relationship_id = attribute_value(event, b"link", decoder)?;
        }
        b"audioFile" => {
            state.graphic_type = Some("audio".into());
            state.graphic_relationship_id = attribute_value(event, b"link", decoder)?;
        }
        b"media" => {
            state.graphic_type = Some("media".into());
            state.graphic_relationship_id = attribute_value(event, b"embed", decoder)?;
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
                if state.in_run {
                    state.current_run_style.font_size_hundredth_points = Some(value);
                }
            }
            if let Some(value) = parse_bool(attribute_value(event, b"b", decoder)?) {
                state.text_style.bold = Some(value);
                if state.in_run {
                    state.current_run_style.bold = Some(value);
                }
            }
            if let Some(value) = parse_bool(attribute_value(event, b"i", decoder)?) {
                state.text_style.italic = Some(value);
                if state.in_run {
                    state.current_run_style.italic = Some(value);
                }
            }
            if let Some(value) = attribute_value(event, b"u", decoder)? {
                state.text_style.underline = Some(value != "none");
                if state.in_run {
                    state.current_run_style.underline = Some(value != "none");
                }
            }
        }
        b"latin"
            if stack
                .iter()
                .any(|value| matches!(value.as_str(), "rPr" | "defRPr" | "endParaRPr")) =>
        {
            if let Some(value) = attribute_value(event, b"typeface", decoder)? {
                let font_family = match value.as_str() {
                    "+mj-lt" => theme.major_font.clone(),
                    "+mn-lt" => theme.minor_font.clone(),
                    _ if value.is_empty() => None,
                    _ => Some(value),
                };
                state.text_style.font_family = font_family.clone();
                if state.in_run {
                    state.current_run_style.font_family = font_family;
                }
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
                    state.text_style.color = Some(color.clone());
                    if state.in_run {
                        state.current_run_style.color = Some(color);
                    }
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
        b"shade" | b"tint" | b"lumMod" | b"lumOff" => {
            if let Some(value) = parse_u32(attribute_value(event, b"val", decoder)?) {
                let in_text_style = stack.iter().any(|value| {
                    matches!(value.as_str(), "rPr" | "defRPr" | "endParaRPr" | "fontRef")
                });
                let in_line = stack.iter().any(|value| value == "ln")
                    || stack.iter().any(|value| value == "lnRef");
                let in_fill = stack.iter().any(|value| value == "solidFill")
                    || stack.iter().any(|value| value == "fillRef");
                if in_text_style {
                    if let Some(color) = state
                        .text_style
                        .color
                        .as_deref()
                        .and_then(|color| apply_color_transform(color, name, value))
                    {
                        state.text_style.color = Some(color.clone());
                        if state.in_run {
                            state.current_run_style.color = Some(color);
                        }
                    }
                } else if in_line {
                    if let Some(color) = state
                        .line_color
                        .as_deref()
                        .and_then(|color| apply_color_transform(color, name, value))
                    {
                        state.line_color = Some(color);
                    }
                } else if in_fill {
                    if let Some(color) = state
                        .fill_color
                        .as_deref()
                        .and_then(|color| apply_color_transform(color, name, value))
                    {
                        state.fill_color = Some(color);
                    }
                }
            }
        }
        b"alpha" | b"alphaMod" => {
            if let Some(value) = parse_u32(attribute_value(event, b"val", decoder)?) {
                let value = value.min(100_000);
                let in_text_style = stack.iter().any(|value| {
                    matches!(value.as_str(), "rPr" | "defRPr" | "endParaRPr" | "fontRef")
                });
                let in_line = stack.iter().any(|value| value == "ln")
                    || stack.iter().any(|value| value == "lnRef");
                let in_fill = stack.iter().any(|value| value == "solidFill")
                    || stack.iter().any(|value| value == "fillRef");
                let current = |existing: Option<u32>| {
                    if name == b"alphaMod" {
                        existing.unwrap_or(100_000).saturating_mul(value) / 100_000
                    } else {
                        value
                    }
                };
                if stack.iter().any(|value| value == "blip") {
                    state.image_opacity = Some(current(state.image_opacity));
                } else if in_text_style {
                    let opacity = current(state.text_style.opacity);
                    state.text_style.opacity = Some(opacity);
                    if state.in_run {
                        state.current_run_style.opacity = Some(opacity);
                    }
                } else if in_line {
                    state.line_opacity = Some(current(state.line_opacity));
                } else if in_fill {
                    state.fill_opacity = Some(current(state.fill_opacity));
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn transform_axis(
    value: Option<i64>,
    size: Option<i64>,
    group_offset: Option<i64>,
    group_size: Option<i64>,
    child_offset: Option<i64>,
    child_size: Option<i64>,
) -> (Option<i64>, Option<i64>) {
    let (
        Some(value),
        Some(size),
        Some(group_offset),
        Some(group_size),
        Some(child_offset),
        Some(child_size),
    ) = (
        value,
        size,
        group_offset,
        group_size,
        child_offset,
        child_size,
    )
    else {
        return (value, size);
    };
    if child_size <= 0 {
        return (Some(value), Some(size));
    }
    let transformed_value = group_offset as i128
        + (value as i128 - child_offset as i128) * group_size as i128 / child_size as i128;
    let transformed_size = size as i128 * group_size as i128 / child_size as i128;
    (
        i64::try_from(transformed_value).ok(),
        i64::try_from(transformed_size).ok(),
    )
}

fn apply_group_transforms(state: &mut ObjectState, groups: &[ObjectState]) {
    for group in groups
        .iter()
        .rev()
        .filter(|group| group.root_name == "grpSp")
    {
        let (x, width) = transform_axis(
            state.x,
            state.width,
            group.x,
            group.width,
            group.child_x,
            group.child_width,
        );
        let (y, height) = transform_axis(
            state.y,
            state.height,
            group.y,
            group.height,
            group.child_y,
            group.child_height,
        );
        state.x = x;
        state.y = y;
        state.width = width;
        state.height = height;
    }
}

fn finalize_object(
    mut state: ObjectState,
    relationships: &HashMap<String, Relationship>,
    groups: &[ObjectState],
) -> PptxObject {
    apply_group_transforms(&mut state, groups);
    let media_part = state
        .relationship_id
        .as_ref()
        .and_then(|id| relationships.get(id))
        .filter(|relationship| relationship.relation_type.ends_with("/image"))
        .map(|relationship| relationship.target.clone());
    let graphic_relationship = state
        .graphic_relationship_id
        .as_ref()
        .and_then(|id| relationships.get(id));
    if state.graphic_type.as_deref() != Some("table") {
        state.graphic_type = graphic_relationship
            .map(|relationship| {
                if relationship.relation_type.ends_with("/chart") {
                    "chart"
                } else if relationship.relation_type.ends_with("/diagramData") {
                    "smartArt"
                } else if relationship.relation_type.ends_with("/video") {
                    "video"
                } else if relationship.relation_type.ends_with("/audio") {
                    "audio"
                } else if relationship.relation_type.ends_with("/oleObject")
                    || relationship.relation_type.ends_with("/package")
                {
                    "embedded"
                } else {
                    "unknown"
                }
                .into()
            })
            .or(state.graphic_type);
    }
    let related_part = graphic_relationship.map(|relationship| relationship.target.clone());
    let kind = match state.root_name.as_str() {
        "pic" => "picture",
        "grpSp" => "group",
        "cxnSp" => "connector",
        "graphicFrame" => "graphic",
        _ if state.shape_type.as_deref() == Some("line") => "connector",
        _ if state.shape_type.as_deref() == Some("custom") => "custom",
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
        fill_opacity: state.fill_opacity,
        line_opacity: state.line_opacity,
        image_opacity: state.image_opacity,
        crop_left: state.crop_left,
        crop_top: state.crop_top,
        crop_right: state.crop_right,
        crop_bottom: state.crop_bottom,
        parent_group_id: state.parent_group_id,
        group_level: state.group_level,
        child_count: state.child_count,
        text_run_count: state.text_run_count,
        mixed_text_style: state.mixed_text_style,
        flip_horizontal: state.flip_horizontal,
        flip_vertical: state.flip_vertical,
        line_dash: state.line_dash,
        line_head: state.line_head,
        line_tail: state.line_tail,
        graphic_type: state.graphic_type,
        related_part,
        table: state.table,
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
    let mut object_stack: Vec<ObjectState> = Vec::new();
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
                if matches!(name, b"sp" | b"pic" | b"grpSp" | b"graphicFrame" | b"cxnSp") {
                    let parent_group_id = object_stack
                        .iter()
                        .rev()
                        .find(|state| state.root_name == "grpSp")
                        .map(|state| state.id.clone())
                        .filter(|id| !id.is_empty());
                    let group_level = object_stack
                        .iter()
                        .filter(|state| state.root_name == "grpSp")
                        .count();
                    object_stack.push(ObjectState {
                        root_name: String::from_utf8_lossy(name).into_owned(),
                        depth,
                        parent_group_id,
                        group_level,
                        ..ObjectState::default()
                    });
                } else if let Some(state) = object_stack.last_mut() {
                    if name == b"r" {
                        state.in_run = true;
                        state.current_run_style = PptxTextStyle::default();
                    }
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
                if let Some(state) = object_stack.last_mut() {
                    update_object_event(state, &event, &stack, theme, color_map, reader.decoder())?;
                }
            }
            Ok(Event::Text(event)) if in_text => {
                if let Some(state) = object_stack.last_mut() {
                    let value = event
                        .decode()
                        .map_err(|error| format!("PPTX 幻灯片文本解码失败: {error}"))?;
                    if !state.text.is_empty() && !value.trim().is_empty() {
                        state.text.push('\n');
                    }
                    state.text.push_str(&value);
                    if let Some(cell) = state.current_table_cell.as_mut() {
                        if !cell.text.is_empty() && !value.trim().is_empty() {
                            cell.text.push('\n');
                        }
                        cell.text.push_str(&value);
                    }
                }
            }
            Ok(Event::End(event)) => {
                let end_name = event.local_name();
                let end_name = end_name.as_ref();
                if end_name == b"t" {
                    in_text = false;
                }
                if end_name == b"r" {
                    if let Some(state) = object_stack.last_mut().filter(|state| state.in_run) {
                        state.text_run_count += 1;
                        if let Some(first) = &state.first_run_style {
                            if first != &state.current_run_style {
                                state.mixed_text_style = true;
                            }
                        } else {
                            state.first_run_style = Some(state.current_run_style.clone());
                        }
                        state.in_run = false;
                    }
                }
                if end_name == b"tc" {
                    if let Some(state) = object_stack.last_mut() {
                        if let (Some(row), Some(mut cell)) = (
                            state.current_table_row.as_mut(),
                            state.current_table_cell.take(),
                        ) {
                            cell.text = cell.text.trim().into();
                            row.cells.push(cell);
                        }
                    }
                }
                if end_name == b"tr" {
                    if let Some(state) = object_stack.last_mut() {
                        if let (Some(table), Some(row)) =
                            (state.table.as_mut(), state.current_table_row.take())
                        {
                            table.rows.push(row);
                        }
                    }
                }
                let should_finalize = object_stack.last().is_some_and(|state| {
                    state.depth == depth && end_name == state.root_name.as_bytes()
                });
                if should_finalize {
                    let state = object_stack.pop().expect("checked object state");
                    if let Some(parent) = object_stack
                        .iter_mut()
                        .rev()
                        .find(|parent| parent.root_name == "grpSp")
                    {
                        parent.child_count += 1;
                    }
                    objects.push(finalize_object(state, relationships, &object_stack));
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
    if objects
        .iter()
        .any(|object| object.kind == "graphic" && object.graphic_type.as_deref() != Some("table"))
    {
        warnings.push("图表、SmartArt、媒体和嵌入对象当前按类型分级只读呈现".into());
    }
    if objects.iter().any(|object| object.mixed_text_style) {
        warnings.push("混合文本样式已安全降级为基础文本框样式".into());
    }
    if objects
        .iter()
        .any(|object| object.kind == "group" && object.rotation.is_some_and(|value| value != 0))
    {
        warnings.push("旋转组合对象的子对象坐标当前仅近似呈现".into());
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
        .filter(|object| matches!(object.kind.as_str(), "shape" | "connector" | "custom"))
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
        warnings.push("图表、SmartArt 和嵌入对象当前按类型分级只读呈现，不执行外部内容".into());
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
    fn expands_group_coordinates_and_preserves_crop_transparency_and_mixed_text() {
        let xml = br#"<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>
            <p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Scaled group"/></p:nvGrpSpPr>
              <p:grpSpPr><a:xfrm><a:off x="1000" y="2000"/><a:ext cx="4000" cy="2000"/><a:chOff x="0" y="0"/><a:chExt cx="2000" cy="1000"/></a:xfrm></p:grpSpPr>
              <p:sp><p:nvSpPr><p:cNvPr id="11" name="Scaled child"/></p:nvSpPr>
                <p:spPr><a:xfrm><a:off x="500" y="250"/><a:ext cx="1000" cy="500"/></a:xfrm><a:solidFill><a:schemeClr val="accent1"><a:shade val="50000"/><a:alpha val="75000"/></a:schemeClr></a:solidFill></p:spPr>
                <p:txBody><a:p><a:r><a:rPr sz="1000"/><a:t>First</a:t></a:r><a:r><a:rPr sz="2000" b="1"/><a:t>Second</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </p:grpSp>
            <p:pic><p:nvPicPr><p:cNvPr id="12" name="Cropped image"/></p:nvPicPr>
              <p:blipFill><a:blip r:embed="rIdImage"><a:alphaModFix amt="50000"/></a:blip><a:srcRect l="10000" t="20000" r="30000" b="0"/></p:blipFill>
              <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm></p:spPr>
            </p:pic>
        </p:spTree></p:cSld></p:sld>"#;
        let relationships = HashMap::from([(
            "rIdImage".into(),
            Relationship {
                target: "ppt/media/crop.png".into(),
                relation_type:
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
                        .into(),
            },
        )]);
        let theme = ThemeData {
            colors: HashMap::from([("accent1".into(), "#808080".into())]),
            ..ThemeData::default()
        };
        let (objects, _, _, warnings) =
            parse_slide(xml, &relationships, &theme, &default_color_map()).unwrap();

        let child = objects.iter().find(|object| object.id == "11").unwrap();
        assert_eq!(
            (child.x, child.y, child.width, child.height),
            (Some(2000), Some(2500), Some(2000), Some(1000))
        );
        assert_eq!(child.parent_group_id.as_deref(), Some("10"));
        assert_eq!(child.group_level, 1);
        assert_eq!(child.fill_color.as_deref(), Some("#404040"));
        assert_eq!(child.fill_opacity, Some(75_000));
        assert_eq!(child.text_run_count, 2);
        assert!(child.mixed_text_style);

        let group = objects.iter().find(|object| object.id == "10").unwrap();
        assert_eq!(group.child_count, 1);
        let picture = objects.iter().find(|object| object.id == "12").unwrap();
        assert_eq!(picture.image_opacity, Some(50_000));
        assert_eq!(
            (
                picture.crop_left,
                picture.crop_top,
                picture.crop_right,
                picture.crop_bottom
            ),
            (Some(10_000), Some(20_000), Some(30_000), Some(0))
        );
        assert!(warnings.iter().any(|warning| warning.contains("混合文本")));
    }

    #[test]
    fn applies_ooxml_color_transforms_in_document_order() {
        assert_eq!(
            apply_color_transform("#808080", b"shade", 50_000).as_deref(),
            Some("#404040")
        );
        assert_eq!(
            apply_color_transform("#808080", b"tint", 50_000).as_deref(),
            Some("#C0C0C0")
        );
        assert_eq!(
            apply_color_transform("#808080", b"lumMod", 50_000).as_deref(),
            Some("#404040")
        );
        assert_eq!(
            parse_background_color(
                br#"<p:cSld xmlns:p="p" xmlns:a="a"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="808080"><a:tint val="50000"/></a:srgbClr></a:solidFill></p:bgPr></p:bg></p:cSld>"#,
                &ThemeData::default(),
                &default_color_map(),
            )
            .unwrap()
            .as_deref(),
            Some("#C0C0C0")
        );
    }

    #[test]
    fn parses_connectors_custom_shapes_tables_and_typed_graphic_frames() {
        let xml = br#"<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r" xmlns:c="c"><p:cSld><p:spTree>
          <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="20" name="Arrow connector"/></p:nvCxnSpPr>
            <p:spPr><a:xfrm flipV="1"><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="line"/><a:ln w="12700"><a:prstDash val="dash"/><a:headEnd type="oval"/><a:tailEnd type="triangle"/></a:ln></p:spPr>
          </p:cxnSp>
          <p:sp><p:nvSpPr><p:cNvPr id="21" name="Freeform"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500" y="600"/><a:ext cx="700" cy="800"/></a:xfrm><a:custGeom/></p:spPr></p:sp>
          <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="22" name="Basic table"/></p:nvGraphicFramePr><p:xfrm><a:off x="1000" y="1200"/><a:ext cx="3000" cy="1600"/></p:xfrm>
            <a:graphic><a:graphicData><a:tbl><a:tblGrid><a:gridCol w="1000"/><a:gridCol w="2000"/></a:tblGrid>
              <a:tr h="800"><a:tc gridSpan="2"><a:txBody><a:p><a:r><a:t>Header</a:t></a:r></a:p></a:txBody></a:tc><a:tc hMerge="1"><a:txBody><a:p/></a:txBody></a:tc></a:tr>
              <a:tr h="800"><a:tc><a:txBody><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
            </a:tbl></a:graphicData></a:graphic>
          </p:graphicFrame>
          <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="23" name="Revenue chart"/></p:nvGraphicFramePr><p:xfrm><a:off x="4500" y="1200"/><a:ext cx="3000" cy="1600"/></p:xfrm><a:graphic><a:graphicData><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></p:graphicFrame>
        </p:spTree></p:cSld></p:sld>"#;
        let relationships = HashMap::from([(
            "rIdChart".into(),
            Relationship {
                target: "ppt/charts/chart1.xml".into(),
                relation_type:
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"
                        .into(),
            },
        )]);
        let (objects, _, _, warnings) = parse_slide(
            xml,
            &relationships,
            &ThemeData::default(),
            &default_color_map(),
        )
        .unwrap();

        let connector = objects.iter().find(|object| object.id == "20").unwrap();
        assert_eq!(connector.kind, "connector");
        assert!(connector.flip_vertical);
        assert_eq!(connector.line_dash.as_deref(), Some("dash"));
        assert_eq!(connector.line_head.as_deref(), Some("oval"));
        assert_eq!(connector.line_tail.as_deref(), Some("triangle"));

        let custom = objects.iter().find(|object| object.id == "21").unwrap();
        assert_eq!(custom.kind, "custom");
        assert_eq!(custom.shape_type.as_deref(), Some("custom"));

        let table = objects.iter().find(|object| object.id == "22").unwrap();
        assert_eq!(table.graphic_type.as_deref(), Some("table"));
        let table = table.table.as_ref().unwrap();
        assert_eq!(table.column_widths, vec![1000, 2000]);
        assert_eq!(table.rows.len(), 2);
        assert_eq!(table.rows[0].cells[0].text, "Header");
        assert_eq!(table.rows[0].cells[0].grid_span, Some(2));
        assert!(table.rows[0].cells[1].horizontal_merge);

        let chart = objects.iter().find(|object| object.id == "23").unwrap();
        assert_eq!(chart.graphic_type.as_deref(), Some("chart"));
        assert_eq!(chart.related_part.as_deref(), Some("ppt/charts/chart1.xml"));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("按类型分级只读呈现")));
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
            if producer == "Microsoft PowerPoint" {
                assert!(
                    model
                        .slides
                        .iter()
                        .any(|slide| slide.objects.iter().any(|object| {
                            object.parent_group_id.is_some() && object.group_level >= 1
                        })),
                    "PowerPoint group children must be expanded"
                );
                assert!(
                    model.slides.iter().any(|slide| slide
                        .objects
                        .iter()
                        .any(|object| object.kind == "group" && object.child_count >= 2)),
                    "PowerPoint group boundary must retain child count"
                );
            }
        }
    }

    #[test]
    fn builds_stable_search_segments_for_titles_objects_and_notes() {
        let bytes = include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let model = parse_pptx(bytes).unwrap();
        let segments = pptx_search_segments(&model);

        let slide_title = segments
            .iter()
            .find(|segment| {
                segment.match_kind == "slide-title"
                    && segment.text.contains("PowerPoint Producer Fixture")
            })
            .unwrap();
        assert_eq!(slide_title.slide_number, 1);
        assert_eq!(slide_title.locator_kind, "pptx-slide");
        assert_eq!(slide_title.locator_object_id, model.slides[0].id);

        let object = segments
            .iter()
            .find(|segment| {
                segment.match_kind == "object" && segment.text.contains("Structured slide reading")
            })
            .unwrap();
        assert_eq!(object.slide_number, 1);
        assert_eq!(object.locator_kind, "pptx-object");
        assert!(!object.locator_object_id.is_empty());
        assert!(object.location_label.starts_with("幻灯片 1 ·"));

        let notes = segments
            .iter()
            .find(|segment| {
                segment.match_kind == "notes" && segment.text.contains("speaker note evidence")
            })
            .unwrap();
        assert_eq!(notes.slide_number, 1);
        assert_eq!(notes.locator_kind, "pptx-slide");
        assert_eq!(notes.location_label, "幻灯片 1 · 备注");

        let libreoffice = parse_pptx(include_bytes!(
            "../../../fixtures/pptx/producers/libreoffice-impress.pptx"
        ))
        .unwrap();
        assert!(pptx_search_segments(&libreoffice).iter().any(|segment| {
            segment
                .text
                .contains("LibreOffice Impress Producer Fixture")
                && segment.locator_kind == "pptx-slide"
        }));
    }
}
