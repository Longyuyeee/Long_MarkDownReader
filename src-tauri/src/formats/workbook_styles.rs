use crate::formats::workbook::{
    WorkbookBorderSide, WorkbookBorderSidePatch, WorkbookCellStyle, WorkbookCellStyleEdit,
    WorkbookNamedStyle, WorkbookStylePatch,
};
use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

const MAX_NEW_STYLES: usize = 256;
const MAX_STYLE_EDITS: usize = 10_000;

#[derive(Clone, Debug, Default, PartialEq)]
struct FontDef {
    name: String,
    size: f64,
    bold: bool,
    italic: bool,
    underline: bool,
    color: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct FillDef {
    color: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct BorderSideDef {
    style: String,
    color: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct BorderDef {
    left: BorderSideDef,
    right: BorderSideDef,
    top: BorderSideDef,
    bottom: BorderSideDef,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct XfDef {
    number_format_id: u32,
    font_id: usize,
    fill_id: usize,
    border_id: usize,
    xf_id: usize,
    horizontal_alignment: String,
    wrap_text: bool,
}

#[derive(Clone, Debug, PartialEq)]
struct NamedStyleDef {
    name: String,
    xf_id: usize,
    builtin_id: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct StyleCatalog {
    fonts: Vec<FontDef>,
    fills: Vec<FillDef>,
    borders: Vec<BorderDef>,
    xfs: Vec<XfDef>,
    style_xfs: Vec<XfDef>,
    named_styles: Vec<NamedStyleDef>,
    custom_formats: HashMap<u32, String>,
}

#[derive(Clone, Debug)]
pub(crate) struct ResolvedStyleEdit {
    pub sheet: String,
    pub row: usize,
    pub column: usize,
    pub style_id: usize,
}

fn xml_value(
    event: &BytesStart<'_>,
    key: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("解析样式属性失败: {error}"))?;
        if attribute.key.as_ref() == key {
            return attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| format!("解码样式属性失败: {error}"));
        }
    }
    Ok(None)
}

fn bool_value(event: &BytesStart<'_>, decoder: quick_xml::encoding::Decoder) -> bool {
    xml_value(event, b"val", decoder)
        .ok()
        .flatten()
        .is_none_or(|value| value != "0" && !value.eq_ignore_ascii_case("false"))
}

fn parse_color(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    theme: &[String],
) -> Option<String> {
    let raw = if let Some(value) = xml_value(event, b"rgb", decoder).ok().flatten() {
        Some(if value.len() == 8 {
            value[2..].to_string()
        } else {
            value
        })
    } else if let Some(index) = xml_value(event, b"theme", decoder)
        .ok()
        .flatten()
        .and_then(|value| value.parse::<usize>().ok())
    {
        theme
            .get(index)
            .map(|value| value.trim_start_matches('#').to_string())
    } else if let Some(index) = xml_value(event, b"indexed", decoder)
        .ok()
        .flatten()
        .and_then(|value| value.parse::<usize>().ok())
    {
        indexed_color(index).map(str::to_string)
    } else {
        None
    }?;
    if raw.len() != 6 || !raw.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let tint = xml_value(event, b"tint", decoder)
        .ok()
        .flatten()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);
    Some(apply_tint(&raw, tint))
}

fn indexed_color(index: usize) -> Option<&'static str> {
    const COLORS: [&str; 64] = [
        "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000",
        "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "800000", "008000",
        "000080", "808000", "800080", "008080", "C0C0C0", "808080", "9999FF", "993366", "FFFFCC",
        "CCFFFF", "660066", "FF8080", "0066CC", "CCCCCC", "000080", "FF00FF", "FFFF00", "00FFFF",
        "800080", "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF",
        "FF99CC", "CC99FF", "FFCC99", "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600",
        "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399",
        "333333",
    ];
    COLORS.get(index).copied()
}

fn apply_tint(rgb: &str, tint: f64) -> String {
    let channel = |start: usize| {
        let value = u8::from_str_radix(&rgb[start..start + 2], 16).unwrap_or_default() as f64;
        let adjusted = if tint < 0.0 {
            value * (1.0 + tint)
        } else {
            value + (255.0 - value) * tint
        };
        adjusted.clamp(0.0, 255.0).round() as u8
    };
    format!("#{:02X}{:02X}{:02X}", channel(0), channel(2), channel(4))
}

pub(crate) fn parse_theme_colors(xml: Option<&[u8]>) -> Vec<String> {
    let Some(xml) = xml else { return Vec::new() };
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut colors = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(ref event)) | Ok(Event::Empty(ref event))
                if matches!(event.local_name().as_ref(), b"srgbClr" | b"sysClr") =>
            {
                let valid = |value: &String| {
                    value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
                };
                let value = xml_value(event, b"val", reader.decoder())
                    .ok()
                    .flatten()
                    .filter(valid)
                    .or_else(|| {
                        xml_value(event, b"lastClr", reader.decoder())
                            .ok()
                            .flatten()
                            .filter(valid)
                    });
                if let Some(value) = value {
                    colors.push(format!("#{}", value.to_ascii_uppercase()));
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    colors
}

fn parse_usize(event: &BytesStart<'_>, key: &[u8], decoder: quick_xml::encoding::Decoder) -> usize {
    xml_value(event, key, decoder)
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
        .unwrap_or_default()
}

fn parse_u32(event: &BytesStart<'_>, key: &[u8], decoder: quick_xml::encoding::Decoder) -> u32 {
    parse_usize(event, key, decoder) as u32
}

pub(crate) fn parse_styles(xml: &[u8], theme_xml: Option<&[u8]>) -> Result<StyleCatalog, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut catalog = StyleCatalog::default();
    let mut section = String::new();
    let mut font: Option<FontDef> = None;
    let mut fill: Option<FillDef> = None;
    let mut border: Option<BorderDef> = None;
    let mut xf: Option<XfDef> = None;
    let theme = parse_theme_colors(theme_xml);
    let mut border_side: Option<Vec<u8>> = None;

    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 styles.xml 失败: {error}"))?;
        match event {
            Event::Start(ref start) => {
                let name = start.local_name();
                match name.as_ref() {
                    b"numFmts" | b"fonts" | b"fills" | b"borders" | b"cellXfs"
                    | b"cellStyleXfs" | b"cellStyles" => {
                        section = String::from_utf8_lossy(name.as_ref()).into_owned();
                    }
                    b"font" if section == "fonts" => {
                        font = Some(FontDef {
                            name: "Calibri".into(),
                            size: 11.0,
                            ..Default::default()
                        });
                    }
                    b"fill" if section == "fills" => fill = Some(FillDef::default()),
                    b"border" if section == "borders" => {
                        border = Some(BorderDef::default());
                    }
                    b"xf" if section == "cellXfs" => {
                        xf = Some(parse_xf(start, reader.decoder()));
                    }
                    b"xf" if section == "cellStyleXfs" => {
                        xf = Some(parse_xf(start, reader.decoder()))
                    }
                    b"cellStyle" if section == "cellStyles" => {
                        if let Some(name) = xml_value(start, b"name", reader.decoder())? {
                            catalog.named_styles.push(NamedStyleDef {
                                name,
                                xf_id: parse_usize(start, b"xfId", reader.decoder()),
                                builtin_id: xml_value(start, b"builtinId", reader.decoder())?
                                    .and_then(|value| value.parse().ok()),
                            });
                        }
                    }
                    b"left" | b"right" | b"top" | b"bottom" if border.is_some() => {
                        border_side = Some(name.as_ref().to_vec());
                        set_border_side_style(
                            border.as_mut().unwrap(),
                            name.as_ref(),
                            xml_value(start, b"style", reader.decoder())?,
                        );
                    }
                    _ => parse_style_child(
                        start,
                        reader.decoder(),
                        font.as_mut(),
                        fill.as_mut(),
                        border.as_mut().and_then(|border| {
                            border_side
                                .as_deref()
                                .and_then(|side| border_side_mut(border, side))
                        }),
                        xf.as_mut(),
                        &theme,
                    )?,
                }
            }
            Event::Empty(ref start) => {
                if section == "numFmts" && start.local_name().as_ref() == b"numFmt" {
                    if let (Some(id), Some(code)) = (
                        xml_value(start, b"numFmtId", reader.decoder())?
                            .and_then(|value| value.parse().ok()),
                        xml_value(start, b"formatCode", reader.decoder())?,
                    ) {
                        catalog.custom_formats.insert(id, code);
                    }
                } else if section == "cellXfs" && start.local_name().as_ref() == b"xf" {
                    catalog.xfs.push(parse_xf(start, reader.decoder()));
                } else if section == "cellStyleXfs" && start.local_name().as_ref() == b"xf" {
                    catalog.style_xfs.push(parse_xf(start, reader.decoder()));
                } else if section == "cellStyles" && start.local_name().as_ref() == b"cellStyle" {
                    if let Some(name) = xml_value(start, b"name", reader.decoder())? {
                        catalog.named_styles.push(NamedStyleDef {
                            name,
                            xf_id: parse_usize(start, b"xfId", reader.decoder()),
                            builtin_id: xml_value(start, b"builtinId", reader.decoder())?
                                .and_then(|value| value.parse().ok()),
                        });
                    }
                } else {
                    parse_style_child(
                        start,
                        reader.decoder(),
                        font.as_mut(),
                        fill.as_mut(),
                        border.as_mut().and_then(|border| {
                            border_side
                                .as_deref()
                                .and_then(|side| border_side_mut(border, side))
                        }),
                        xf.as_mut(),
                        &theme,
                    )?;
                    if matches!(
                        start.local_name().as_ref(),
                        b"left" | b"right" | b"top" | b"bottom"
                    ) {
                        if let Some(border) = border.as_mut() {
                            set_border_side_style(
                                border,
                                start.local_name().as_ref(),
                                xml_value(start, b"style", reader.decoder())?,
                            );
                        }
                    }
                }
            }
            Event::End(ref end) => match end.local_name().as_ref() {
                b"font" if font.is_some() => catalog.fonts.push(font.take().unwrap()),
                b"fill" if fill.is_some() => catalog.fills.push(fill.take().unwrap()),
                b"border" if border.is_some() => catalog.borders.push(border.take().unwrap()),
                b"xf" if xf.is_some() && section == "cellXfs" => {
                    catalog.xfs.push(xf.take().unwrap())
                }
                b"xf" if xf.is_some() && section == "cellStyleXfs" => {
                    catalog.style_xfs.push(xf.take().unwrap())
                }
                b"left" | b"right" | b"top" | b"bottom" => border_side = None,
                b"numFmts" | b"fonts" | b"fills" | b"borders" | b"cellXfs" | b"cellStyleXfs"
                | b"cellStyles" => section.clear(),
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if catalog.fonts.is_empty()
        || catalog.fills.is_empty()
        || catalog.borders.is_empty()
        || catalog.xfs.is_empty()
    {
        return Err("XLSX 样式表缺少基础 fonts、fills、borders 或 cellXfs".into());
    }
    Ok(catalog)
}

fn parse_xf(event: &BytesStart<'_>, decoder: quick_xml::encoding::Decoder) -> XfDef {
    XfDef {
        number_format_id: parse_u32(event, b"numFmtId", decoder),
        font_id: parse_usize(event, b"fontId", decoder),
        fill_id: parse_usize(event, b"fillId", decoder),
        border_id: parse_usize(event, b"borderId", decoder),
        xf_id: parse_usize(event, b"xfId", decoder),
        horizontal_alignment: "general".into(),
        wrap_text: false,
    }
}

fn border_side_mut<'a>(border: &'a mut BorderDef, side: &[u8]) -> Option<&'a mut BorderSideDef> {
    match side {
        b"left" => Some(&mut border.left),
        b"right" => Some(&mut border.right),
        b"top" => Some(&mut border.top),
        b"bottom" => Some(&mut border.bottom),
        _ => None,
    }
}

fn set_border_side_style(border: &mut BorderDef, side: &[u8], style: Option<String>) {
    if let Some(target) = border_side_mut(border, side) {
        target.style = style
            .filter(|value| value != "none")
            .unwrap_or_else(|| "none".into());
    }
}

fn parse_style_child(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    font: Option<&mut FontDef>,
    fill: Option<&mut FillDef>,
    border: Option<&mut BorderSideDef>,
    xf: Option<&mut XfDef>,
    theme: &[String],
) -> Result<(), String> {
    let name = event.local_name();
    if let Some(font) = font {
        match name.as_ref() {
            b"name" => {
                if let Some(value) = xml_value(event, b"val", decoder)? {
                    font.name = value;
                }
            }
            b"sz" => {
                if let Some(value) =
                    xml_value(event, b"val", decoder)?.and_then(|value| value.parse().ok())
                {
                    font.size = value;
                }
            }
            b"b" => font.bold = bool_value(event, decoder),
            b"i" => font.italic = bool_value(event, decoder),
            b"u" => font.underline = bool_value(event, decoder),
            b"color" => font.color = parse_color(event, decoder, theme),
            _ => {}
        }
    }
    if let Some(fill) = fill {
        if name.as_ref() == b"fgColor" {
            fill.color = parse_color(event, decoder, theme);
        }
    }
    if let Some(border) = border {
        if name.as_ref() == b"color" && border.color.is_none() {
            border.color = parse_color(event, decoder, theme);
        }
    }
    if let Some(xf) = xf {
        if name.as_ref() == b"alignment" {
            if let Some(value) = xml_value(event, b"horizontal", decoder)? {
                xf.horizontal_alignment = value;
            }
            xf.wrap_text = xml_value(event, b"wrapText", decoder)?
                .is_some_and(|value| value != "0" && !value.eq_ignore_ascii_case("false"));
        }
    }
    Ok(())
}

fn number_format_name(id: u32, custom: &HashMap<u32, String>) -> String {
    if let Some(code) = custom.get(&id) {
        let lower = code.to_ascii_lowercase();
        if code.contains('%') {
            return "percent".into();
        }
        if lower.contains('y') && (lower.contains('m') || lower.contains('d')) {
            return "date".into();
        }
        if ["$", "¥", "€", "£"]
            .iter()
            .any(|symbol| code.contains(symbol))
        {
            return "currency".into();
        }
        return format!("custom:{code}");
    }
    match id {
        0 => "general".into(),
        1 => "integer".into(),
        2 | 4 => "decimal".into(),
        9 | 10 => "percent".into(),
        14..=22 => "date".into(),
        49 => "text".into(),
        37..=44 => "currency".into(),
        _ => "general".into(),
    }
}

fn number_format_id(name: &str) -> Option<u32> {
    match name {
        "general" => Some(0),
        "integer" => Some(1),
        "decimal" => Some(4),
        "percent" => Some(10),
        "date" => Some(14),
        "currency" => Some(44),
        "text" => Some(49),
        _ => None,
    }
}

impl StyleCatalog {
    pub(crate) fn named_styles(&self) -> Vec<WorkbookNamedStyle> {
        self.named_styles
            .iter()
            .map(|style| WorkbookNamedStyle {
                name: style.name.clone(),
                builtin_id: style.builtin_id,
            })
            .collect()
    }

    pub(crate) fn public_style(&self, style_id: usize) -> WorkbookCellStyle {
        let xf = self.xfs.get(style_id).unwrap_or(&self.xfs[0]);
        let font = self.fonts.get(xf.font_id).unwrap_or(&self.fonts[0]);
        let fill = self.fills.get(xf.fill_id).unwrap_or(&self.fills[0]);
        let border = self.borders.get(xf.border_id).unwrap_or(&self.borders[0]);
        let named_style = self
            .named_styles
            .iter()
            .find(|style| style.xf_id == xf.xf_id)
            .map(|style| style.name.clone());
        let side = |value: &BorderSideDef| WorkbookBorderSide {
            style: if value.style.is_empty() {
                "none".into()
            } else {
                value.style.clone()
            },
            color: value.color.clone(),
        };
        let legacy = [&border.left, &border.right, &border.top, &border.bottom]
            .into_iter()
            .find(|value| !value.style.is_empty() && value.style != "none");
        WorkbookCellStyle {
            style_id: style_id.min(self.xfs.len().saturating_sub(1)),
            named_style,
            number_format: number_format_name(xf.number_format_id, &self.custom_formats),
            font_name: font.name.clone(),
            font_size: font.size,
            bold: font.bold,
            italic: font.italic,
            underline: font.underline,
            font_color: font.color.clone(),
            fill_color: fill.color.clone(),
            border_style: legacy
                .map(|value| value.style.clone())
                .unwrap_or_else(|| "none".into()),
            border_color: legacy.and_then(|value| value.color.clone()),
            border_top: side(&border.top),
            border_right: side(&border.right),
            border_bottom: side(&border.bottom),
            border_left: side(&border.left),
            horizontal_alignment: xf.horizontal_alignment.clone(),
            wrap_text: xf.wrap_text,
        }
    }
}

fn parse_reference(reference: &str) -> Option<(usize, usize)> {
    let split = reference.find(|character: char| character.is_ascii_digit())?;
    let (columns, rows) = reference.split_at(split);
    let row = rows.parse::<usize>().ok()?.checked_sub(1)?;
    let mut column = 0usize;
    for byte in columns.bytes() {
        if !byte.is_ascii_alphabetic() {
            return None;
        }
        column = column
            .checked_mul(26)?
            .checked_add((byte.to_ascii_uppercase() - b'A' + 1) as usize)?;
    }
    Some((row, column.checked_sub(1)?))
}

pub(crate) fn read_sheet_style_ids(
    xml: &[u8],
    row_start: usize,
    row_end: usize,
    max_columns: usize,
) -> Result<HashMap<(usize, usize), usize>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut result = HashMap::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析工作表样式失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"c" =>
            {
                if let Some((row, column)) = xml_value(event, b"r", reader.decoder())?
                    .and_then(|value| parse_reference(&value))
                {
                    if row >= row_start && row < row_end && column < max_columns {
                        let style_id = parse_usize(event, b"s", reader.decoder());
                        if style_id > 0 {
                            result.insert((row, column), style_id);
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(result)
}

fn validate_patch(patch: &WorkbookStylePatch) -> Result<(), String> {
    if patch == &WorkbookStylePatch::default() {
        return Err("样式变更不能为空".into());
    }
    if patch
        .number_format
        .as_deref()
        .is_some_and(|value| number_format_id(value).is_none() && !valid_custom_format(value))
    {
        return Err("不支持的数字格式预设".into());
    }
    if patch.font_name.as_ref().is_some_and(|value| {
        value.is_empty() || value.chars().count() > 64 || value.chars().any(char::is_control)
    }) {
        return Err("字体名称无效".into());
    }
    if patch
        .font_size
        .is_some_and(|value| !value.is_finite() || !(6.0..=72.0).contains(&value))
    {
        return Err("字号必须在 6 到 72 之间".into());
    }
    for color in [
        patch.font_color.as_deref(),
        patch.fill_color.as_deref(),
        patch.border_color.as_deref(),
        patch
            .border_top
            .as_ref()
            .and_then(|side| side.color.as_deref()),
        patch
            .border_right
            .as_ref()
            .and_then(|side| side.color.as_deref()),
        patch
            .border_bottom
            .as_ref()
            .and_then(|side| side.color.as_deref()),
        patch
            .border_left
            .as_ref()
            .and_then(|side| side.color.as_deref()),
    ]
    .into_iter()
    .flatten()
    {
        if !(color.is_empty()
            || color.len() == 7
                && color.starts_with('#')
                && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
        {
            return Err("样式颜色必须为空或 #RRGGBB".into());
        }
    }
    if patch
        .border_style
        .as_deref()
        .is_some_and(|value| !matches!(value, "none" | "thin" | "medium"))
    {
        return Err("不支持的边框样式".into());
    }
    for side in [
        &patch.border_top,
        &patch.border_right,
        &patch.border_bottom,
        &patch.border_left,
    ]
    .into_iter()
    .flatten()
    {
        validate_border_side(side)?;
    }
    if patch.named_style.as_ref().is_some_and(|value| {
        value.is_empty() || value.chars().count() > 64 || value.chars().any(char::is_control)
    }) {
        return Err("命名样式名称无效".into());
    }
    if patch
        .horizontal_alignment
        .as_deref()
        .is_some_and(|value| !matches!(value, "general" | "left" | "center" | "right"))
    {
        return Err("不支持的水平对齐方式".into());
    }
    Ok(())
}

fn valid_custom_format(value: &str) -> bool {
    value.strip_prefix("custom:").is_some_and(|code| {
        !code.is_empty() && code.chars().count() <= 128 && !code.chars().any(char::is_control)
    })
}

fn validate_border_side(side: &WorkbookBorderSidePatch) -> Result<(), String> {
    if !matches!(
        side.style.as_str(),
        "none" | "hair" | "dotted" | "dashed" | "thin" | "medium" | "thick" | "double"
    ) {
        return Err("不支持的分边框样式".into());
    }
    Ok(())
}

fn apply_patch(
    catalog: &StyleCatalog,
    base_id: usize,
    patch: &WorkbookStylePatch,
) -> Result<(FontDef, FillDef, BorderDef, XfDef), String> {
    validate_patch(patch)?;
    let mut xf = catalog.xfs.get(base_id).unwrap_or(&catalog.xfs[0]).clone();
    let mut font = catalog
        .fonts
        .get(xf.font_id)
        .unwrap_or(&catalog.fonts[0])
        .clone();
    let mut fill = catalog
        .fills
        .get(xf.fill_id)
        .unwrap_or(&catalog.fills[0])
        .clone();
    let mut border = catalog
        .borders
        .get(xf.border_id)
        .unwrap_or(&catalog.borders[0])
        .clone();
    if let Some(name) = &patch.named_style {
        let named = catalog
            .named_styles
            .iter()
            .find(|style| &style.name == name)
            .ok_or_else(|| format!("命名样式不存在: {name}"))?;
        xf = catalog
            .style_xfs
            .get(named.xf_id)
            .ok_or("命名样式引用无效")?
            .clone();
        xf.xf_id = named.xf_id;
        font = catalog
            .fonts
            .get(xf.font_id)
            .unwrap_or(&catalog.fonts[0])
            .clone();
        fill = catalog
            .fills
            .get(xf.fill_id)
            .unwrap_or(&catalog.fills[0])
            .clone();
        border = catalog
            .borders
            .get(xf.border_id)
            .unwrap_or(&catalog.borders[0])
            .clone();
    }
    if let Some(value) = &patch.number_format {
        xf.number_format_id = number_format_id(value)
            .or_else(|| {
                catalog
                    .custom_formats
                    .iter()
                    .find_map(|(id, code)| (value == &format!("custom:{code}")).then_some(*id))
            })
            .ok_or("自定义数字格式尚未注册")?;
    }
    if let Some(value) = &patch.font_name {
        font.name = value.clone();
    }
    if let Some(value) = patch.font_size {
        font.size = value;
    }
    if let Some(value) = patch.bold {
        font.bold = value;
    }
    if let Some(value) = patch.italic {
        font.italic = value;
    }
    if let Some(value) = patch.underline {
        font.underline = value;
    }
    if let Some(value) = &patch.font_color {
        font.color = (!value.is_empty()).then(|| value.to_ascii_uppercase());
    }
    if let Some(value) = &patch.fill_color {
        fill.color = (!value.is_empty()).then(|| value.to_ascii_uppercase());
    }
    if let Some(value) = &patch.border_style {
        for side in [
            &mut border.left,
            &mut border.right,
            &mut border.top,
            &mut border.bottom,
        ] {
            side.style = value.clone();
        }
    }
    if let Some(value) = &patch.border_color {
        for side in [
            &mut border.left,
            &mut border.right,
            &mut border.top,
            &mut border.bottom,
        ] {
            side.color = (!value.is_empty()).then(|| value.to_ascii_uppercase());
        }
    }
    apply_border_side_patch(&mut border.top, patch.border_top.as_ref());
    apply_border_side_patch(&mut border.right, patch.border_right.as_ref());
    apply_border_side_patch(&mut border.bottom, patch.border_bottom.as_ref());
    apply_border_side_patch(&mut border.left, patch.border_left.as_ref());
    if let Some(value) = &patch.horizontal_alignment {
        xf.horizontal_alignment = value.clone();
    }
    if let Some(value) = patch.wrap_text {
        xf.wrap_text = value;
    }
    Ok((font, fill, border, xf))
}

fn apply_border_side_patch(target: &mut BorderSideDef, patch: Option<&WorkbookBorderSidePatch>) {
    if let Some(patch) = patch {
        target.style = patch.style.clone();
        target.color = patch
            .color
            .as_ref()
            .and_then(|value| (!value.is_empty()).then(|| value.to_ascii_uppercase()));
    }
}

fn cell_style_id(
    xml: &[u8],
    targets: &HashSet<(usize, usize)>,
) -> Result<HashMap<(usize, usize), usize>, String> {
    let mut ids = read_sheet_style_ids(xml, 0, usize::MAX, usize::MAX)?;
    ids.retain(|coordinate, _| targets.contains(coordinate));
    Ok(ids)
}

pub(crate) fn resolve_style_edits(
    styles_xml: &[u8],
    theme_xml: Option<&[u8]>,
    sheet_xml: &HashMap<String, &[u8]>,
    edits: &[WorkbookCellStyleEdit],
) -> Result<(Vec<u8>, Vec<ResolvedStyleEdit>), String> {
    if edits.len() > MAX_STYLE_EDITS {
        return Err(format!("单次最多保存 {MAX_STYLE_EDITS} 个样式变更"));
    }
    let mut seen = HashSet::new();
    for edit in edits {
        if edit.sheet.is_empty()
            || edit.sheet.chars().count() > 31
            || edit.row >= 1_048_576
            || edit.column >= 16_384
        {
            return Err("样式编辑坐标无效".into());
        }
        if !seen.insert((edit.sheet.clone(), edit.row, edit.column)) {
            return Err("保存请求包含重复样式单元格".into());
        }
        validate_patch(&edit.patch)?;
    }
    let mut catalog = parse_styles(styles_xml, theme_xml)?;
    let original_custom_ids = catalog
        .custom_formats
        .keys()
        .copied()
        .collect::<HashSet<_>>();
    for code in edits
        .iter()
        .filter_map(|edit| edit.patch.number_format.as_deref()?.strip_prefix("custom:"))
    {
        if !catalog
            .custom_formats
            .values()
            .any(|existing| existing == code)
        {
            let id = (164u32..=65_535)
                .find(|id| !catalog.custom_formats.contains_key(id))
                .ok_or("自定义数字格式 ID 已耗尽")?;
            catalog.custom_formats.insert(id, code.to_string());
        }
    }
    let mut base_ids = HashMap::new();
    for (sheet, xml) in sheet_xml {
        let targets = edits
            .iter()
            .filter(|edit| &edit.sheet == sheet)
            .map(|edit| (edit.row, edit.column))
            .collect::<HashSet<_>>();
        for (coordinate, style_id) in cell_style_id(xml, &targets)? {
            base_ids.insert((sheet.clone(), coordinate.0, coordinate.1), style_id);
        }
    }
    let original_font_count = catalog.fonts.len();
    let original_fill_count = catalog.fills.len();
    let original_border_count = catalog.borders.len();
    let original_xf_count = catalog.xfs.len();
    let mut resolved = Vec::with_capacity(edits.len());
    for edit in edits {
        let base_id = *base_ids
            .get(&(edit.sheet.clone(), edit.row, edit.column))
            .unwrap_or(&0);
        let (font, fill, border, mut xf) = apply_patch(&catalog, base_id, &edit.patch)?;
        xf.font_id = catalog
            .fonts
            .iter()
            .position(|item| item == &font)
            .unwrap_or_else(|| {
                catalog.fonts.push(font);
                catalog.fonts.len() - 1
            });
        xf.fill_id = catalog
            .fills
            .iter()
            .position(|item| item == &fill)
            .unwrap_or_else(|| {
                catalog.fills.push(fill);
                catalog.fills.len() - 1
            });
        xf.border_id = catalog
            .borders
            .iter()
            .position(|item| item == &border)
            .unwrap_or_else(|| {
                catalog.borders.push(border);
                catalog.borders.len() - 1
            });
        let style_id = catalog
            .xfs
            .iter()
            .position(|item| item == &xf)
            .unwrap_or_else(|| {
                catalog.xfs.push(xf);
                catalog.xfs.len() - 1
            });
        resolved.push(ResolvedStyleEdit {
            sheet: edit.sheet.clone(),
            row: edit.row,
            column: edit.column,
            style_id,
        });
    }
    let new_xfs = catalog.xfs.len() - original_xf_count;
    if new_xfs > MAX_NEW_STYLES {
        return Err(format!("单次最多创建 {MAX_NEW_STYLES} 种新样式"));
    }
    if new_xfs == 0 {
        return Ok((styles_xml.to_vec(), resolved));
    }
    let updated = patch_styles_xml(
        styles_xml,
        &catalog
            .custom_formats
            .iter()
            .filter(|(id, _)| !original_custom_ids.contains(id))
            .map(|(id, code)| (*id, code.clone()))
            .collect::<Vec<_>>(),
        &catalog.fonts[original_font_count..],
        &catalog.fills[original_fill_count..],
        &catalog.borders[original_border_count..],
        &catalog.xfs[original_xf_count..],
        original_font_count,
        original_fill_count,
        original_border_count,
        original_xf_count,
    )?;
    Ok((updated, resolved))
}

fn collection_start(
    original: &BytesStart<'_>,
    count: usize,
) -> Result<BytesStart<'static>, String> {
    let mut start = BytesStart::new(String::from_utf8_lossy(original.name().as_ref()).into_owned());
    for attribute in original.attributes() {
        let attribute = attribute.map_err(|error| format!("读取样式集合属性失败: {error}"))?;
        if attribute.key.as_ref() != b"count" {
            start.push_attribute((attribute.key.as_ref(), attribute.value.as_ref()));
        }
    }
    start.push_attribute(("count", count.to_string().as_str()));
    Ok(start.into_owned())
}

#[allow(clippy::too_many_arguments)]
fn patch_styles_xml(
    xml: &[u8],
    custom_formats: &[(u32, String)],
    fonts: &[FontDef],
    fills: &[FillDef],
    borders: &[BorderDef],
    xfs: &[XfDef],
    font_count: usize,
    fill_count: usize,
    border_count: usize,
    xf_count: usize,
) -> Result<Vec<u8>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len() + xfs.len() * 300));
    let mut buffer = Vec::new();
    let mut found = HashSet::new();
    let mut has_num_formats = false;
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("重写 styles.xml 失败: {error}"))?;
        match event {
            Event::Empty(ref start) if start.local_name().as_ref() == b"numFmts" => {
                has_num_formats = true;
                if custom_formats.is_empty() {
                    writer
                        .write_event(event.into_owned())
                        .map_err(|error| error.to_string())?;
                } else {
                    let mut collection = BytesStart::new("numFmts");
                    collection.push_attribute(("count", custom_formats.len().to_string().as_str()));
                    writer
                        .write_event(Event::Start(collection))
                        .map_err(|error| error.to_string())?;
                    for (id, code) in custom_formats {
                        write_num_fmt(&mut writer, *id, code)?;
                    }
                    writer
                        .write_event(Event::End(BytesEnd::new("numFmts")))
                        .map_err(|error| error.to_string())?;
                }
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"numFmts" => {
                has_num_formats = true;
                writer
                    .write_event(Event::Start(collection_start(
                        start,
                        existing_num_fmt_count(xml)? + custom_formats.len(),
                    )?))
                    .map_err(|error| error.to_string())?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"numFmts" => {
                for (id, code) in custom_formats {
                    write_num_fmt(&mut writer, *id, code)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| error.to_string())?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"fonts" => {
                found.insert("fonts");
                if !has_num_formats && !custom_formats.is_empty() {
                    let mut num_fmts = BytesStart::new("numFmts");
                    num_fmts.push_attribute(("count", custom_formats.len().to_string().as_str()));
                    writer
                        .write_event(Event::Start(num_fmts))
                        .map_err(|error| error.to_string())?;
                    for (id, code) in custom_formats {
                        write_num_fmt(&mut writer, *id, code)?;
                    }
                    writer
                        .write_event(Event::End(BytesEnd::new("numFmts")))
                        .map_err(|error| error.to_string())?;
                }
                writer
                    .write_event(Event::Start(collection_start(
                        start,
                        font_count + fonts.len(),
                    )?))
                    .map_err(|error| error.to_string())?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"fills" => {
                found.insert("fills");
                writer
                    .write_event(Event::Start(collection_start(
                        start,
                        fill_count + fills.len(),
                    )?))
                    .map_err(|error| error.to_string())?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"borders" => {
                found.insert("borders");
                writer
                    .write_event(Event::Start(collection_start(
                        start,
                        border_count + borders.len(),
                    )?))
                    .map_err(|error| error.to_string())?;
            }
            Event::Start(ref start) if start.local_name().as_ref() == b"cellXfs" => {
                found.insert("cellXfs");
                writer
                    .write_event(Event::Start(collection_start(start, xf_count + xfs.len())?))
                    .map_err(|error| error.to_string())?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"fonts" => {
                for value in fonts {
                    write_font(&mut writer, value)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| error.to_string())?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"fills" => {
                for value in fills {
                    write_fill(&mut writer, value)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| error.to_string())?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"borders" => {
                for value in borders {
                    write_border(&mut writer, value)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| error.to_string())?;
            }
            Event::End(ref end) if end.local_name().as_ref() == b"cellXfs" => {
                for value in xfs {
                    write_xf(&mut writer, value)?;
                }
                writer
                    .write_event(event.into_owned())
                    .map_err(|error| error.to_string())?;
            }
            Event::Eof => break,
            _ => writer
                .write_event(event.into_owned())
                .map_err(|error| format!("复制 styles.xml 失败: {error}"))?,
        }
        buffer.clear();
    }
    if found.len() != 4 {
        return Err("styles.xml 缺少可扩展的样式集合".into());
    }
    Ok(writer.into_inner())
}

fn existing_num_fmt_count(xml: &[u8]) -> Result<usize, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析数字格式集合失败: {error}"))?
        {
            Event::Start(ref event) | Event::Empty(ref event)
                if event.local_name().as_ref() == b"numFmts" =>
            {
                return Ok(parse_usize(event, b"count", reader.decoder()))
            }
            Event::Eof => return Ok(0),
            _ => {}
        }
        buffer.clear();
    }
}

fn write_num_fmt(writer: &mut Writer<Vec<u8>>, id: u32, code: &str) -> Result<(), String> {
    let mut event = BytesStart::new("numFmt");
    event.push_attribute(("numFmtId", id.to_string().as_str()));
    event.push_attribute(("formatCode", code));
    writer
        .write_event(Event::Empty(event))
        .map_err(|error| error.to_string())
}

fn empty_value(name: &'static str, key: &'static str, value: &str) -> Event<'static> {
    let mut start = BytesStart::new(name);
    start.push_attribute((key, Cow::Owned(value.to_string())));
    Event::Empty(start.into_owned())
}

fn write_font(writer: &mut Writer<Vec<u8>>, font: &FontDef) -> Result<(), String> {
    writer
        .write_event(Event::Start(BytesStart::new("font")))
        .map_err(|error| error.to_string())?;
    if font.bold {
        writer
            .write_event(Event::Empty(BytesStart::new("b")))
            .map_err(|error| error.to_string())?;
    }
    if font.italic {
        writer
            .write_event(Event::Empty(BytesStart::new("i")))
            .map_err(|error| error.to_string())?;
    }
    if font.underline {
        writer
            .write_event(Event::Empty(BytesStart::new("u")))
            .map_err(|error| error.to_string())?;
    }
    writer
        .write_event(empty_value("sz", "val", &font.size.to_string()))
        .map_err(|error| error.to_string())?;
    if let Some(color) = &font.color {
        writer
            .write_event(empty_value("color", "rgb", &format!("FF{}", &color[1..])))
            .map_err(|error| error.to_string())?;
    }
    writer
        .write_event(empty_value("name", "val", &font.name))
        .map_err(|error| error.to_string())?;
    writer
        .write_event(Event::End(BytesEnd::new("font")))
        .map_err(|error| error.to_string())
}

fn write_fill(writer: &mut Writer<Vec<u8>>, fill: &FillDef) -> Result<(), String> {
    writer
        .write_event(Event::Start(BytesStart::new("fill")))
        .and_then(|_| {
            let mut pattern = BytesStart::new("patternFill");
            pattern.push_attribute((
                "patternType",
                if fill.color.is_some() {
                    "solid"
                } else {
                    "none"
                },
            ));
            writer.write_event(Event::Start(pattern))
        })
        .map_err(|error| error.to_string())?;
    if let Some(color) = &fill.color {
        writer
            .write_event(empty_value("fgColor", "rgb", &format!("FF{}", &color[1..])))
            .and_then(|_| writer.write_event(empty_value("bgColor", "indexed", "64")))
            .map_err(|error| error.to_string())?;
    }
    writer
        .write_event(Event::End(BytesEnd::new("patternFill")))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new("fill"))))
        .map_err(|error| error.to_string())
}

fn write_border(writer: &mut Writer<Vec<u8>>, border: &BorderDef) -> Result<(), String> {
    writer
        .write_event(Event::Start(BytesStart::new("border")))
        .map_err(|error| error.to_string())?;
    for (side, value) in [
        ("left", &border.left),
        ("right", &border.right),
        ("top", &border.top),
        ("bottom", &border.bottom),
    ] {
        let mut start = BytesStart::new(side);
        if !value.style.is_empty() && value.style != "none" {
            start.push_attribute(("style", value.style.as_str()));
        }
        if value.style.is_empty() || value.style == "none" || value.color.is_none() {
            writer
                .write_event(Event::Empty(start))
                .map_err(|error| error.to_string())?;
        } else {
            writer
                .write_event(Event::Start(start))
                .and_then(|_| {
                    writer.write_event(empty_value(
                        "color",
                        "rgb",
                        &format!("FF{}", &value.color.as_ref().unwrap()[1..]),
                    ))
                })
                .and_then(|_| writer.write_event(Event::End(BytesEnd::new(side))))
                .map_err(|error| error.to_string())?;
        }
    }
    writer
        .write_event(Event::Empty(BytesStart::new("diagonal")))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new("border"))))
        .map_err(|error| error.to_string())
}

fn write_xf(writer: &mut Writer<Vec<u8>>, xf: &XfDef) -> Result<(), String> {
    let mut start = BytesStart::new("xf");
    let number_format_id = xf.number_format_id.to_string();
    let font_id = xf.font_id.to_string();
    let fill_id = xf.fill_id.to_string();
    let border_id = xf.border_id.to_string();
    start.push_attribute(("numFmtId", number_format_id.as_str()));
    start.push_attribute(("fontId", font_id.as_str()));
    start.push_attribute(("fillId", fill_id.as_str()));
    start.push_attribute(("borderId", border_id.as_str()));
    let xf_id = xf.xf_id.to_string();
    start.push_attribute(("xfId", xf_id.as_str()));
    if xf.number_format_id != 0 {
        start.push_attribute(("applyNumberFormat", "1"));
    }
    if xf.font_id != 0 {
        start.push_attribute(("applyFont", "1"));
    }
    if xf.fill_id != 0 {
        start.push_attribute(("applyFill", "1"));
    }
    if xf.border_id != 0 {
        start.push_attribute(("applyBorder", "1"));
    }
    if xf.horizontal_alignment == "general" && !xf.wrap_text {
        return writer
            .write_event(Event::Empty(start))
            .map_err(|error| error.to_string());
    }
    start.push_attribute(("applyAlignment", "1"));
    writer
        .write_event(Event::Start(start))
        .map_err(|error| error.to_string())?;
    let mut alignment = BytesStart::new("alignment");
    if xf.horizontal_alignment != "general" {
        alignment.push_attribute(("horizontal", xf.horizontal_alignment.as_str()));
    }
    if xf.wrap_text {
        alignment.push_attribute(("wrapText", "1"));
    }
    writer
        .write_event(Event::Empty(alignment))
        .and_then(|_| writer.write_event(Event::End(BytesEnd::new("xf"))))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="0"/><fonts count="2"><font><sz val="11"/><color theme="4" tint="0.2"/><name val="Calibri"/></font><font><sz val="12"/><color indexed="2"/><name val="Aptos"/><b/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor theme="5"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="2"/></left><right/><top style="double"><color rgb="FF112233"/></top><bottom style="dashed"><color theme="4"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="1"/></cellXfs>
  <cellStyles count="2"><cellStyle name="Normal" xfId="0" builtinId="0"/><cellStyle name="Heading 1" xfId="1" builtinId="16"/></cellStyles>
</styleSheet>"#;

    const THEME: &str = r#"<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="336699"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2></a:clrScheme></a:themeElements></a:theme>"#;

    #[test]
    fn reads_named_styles_theme_indexed_colors_and_independent_borders() {
        let catalog = parse_styles(STYLES.as_bytes(), Some(THEME.as_bytes())).unwrap();
        let style = catalog.public_style(1);
        assert_eq!(style.named_style.as_deref(), Some("Heading 1"));
        assert_eq!(style.font_color.as_deref(), Some("#FF0000"));
        assert_eq!(style.fill_color.as_deref(), Some("#C0504D"));
        assert_eq!(style.border_left.style, "thin");
        assert_eq!(style.border_left.color.as_deref(), Some("#FF0000"));
        assert_eq!(style.border_top.style, "double");
        assert_eq!(style.border_top.color.as_deref(), Some("#112233"));
        assert_eq!(style.border_bottom.style, "dashed");
        assert_eq!(style.border_bottom.color.as_deref(), Some("#336699"));
        assert_eq!(catalog.named_styles().len(), 2);
    }

    #[test]
    fn writes_custom_number_format_named_style_and_per_side_border() {
        let sheet = br#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="0"/></row></sheetData><conditionalFormatting sqref="A1"><cfRule type="expression" priority="1"><formula>A1&gt;0</formula></cfRule></conditionalFormatting></worksheet>"#;
        let sheets = HashMap::from([("Sheet1".to_string(), sheet.as_slice())]);
        let edits = vec![WorkbookCellStyleEdit {
            sheet: "Sheet1".into(),
            row: 0,
            column: 0,
            patch: WorkbookStylePatch {
                named_style: Some("Heading 1".into()),
                number_format: Some("custom:0.000 \"kg\"".into()),
                border_right: Some(WorkbookBorderSidePatch {
                    style: "thick".into(),
                    color: Some("#ABCDEF".into()),
                }),
                ..Default::default()
            },
        }];
        let (updated, resolved) =
            resolve_style_edits(STYLES.as_bytes(), Some(THEME.as_bytes()), &sheets, &edits)
                .unwrap();
        let xml = String::from_utf8(updated).unwrap();
        assert!(xml.contains("formatCode=\"0.000 &quot;kg&quot;\""));
        assert!(xml.contains("style=\"thick\""));
        assert_eq!(resolved.len(), 1);
        let catalog = parse_styles(xml.as_bytes(), Some(THEME.as_bytes())).unwrap();
        let style = catalog.public_style(resolved[0].style_id);
        assert_eq!(style.number_format, "custom:0.000 \"kg\"");
        assert_eq!(style.named_style.as_deref(), Some("Heading 1"));
        assert_eq!(style.border_right.style, "thick");
    }
}
