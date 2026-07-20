use crate::formats::workbook::{WorkbookCellStyle, WorkbookCellStyleEdit, WorkbookStylePatch};
use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer};
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
struct BorderDef {
    style: String,
    color: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct XfDef {
    number_format_id: u32,
    font_id: usize,
    fill_id: usize,
    border_id: usize,
    horizontal_alignment: String,
    wrap_text: bool,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct StyleCatalog {
    fonts: Vec<FontDef>,
    fills: Vec<FillDef>,
    borders: Vec<BorderDef>,
    xfs: Vec<XfDef>,
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
                .decode_and_unescape_value(decoder)
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

fn parse_color(event: &BytesStart<'_>, decoder: quick_xml::encoding::Decoder) -> Option<String> {
    let value = xml_value(event, b"rgb", decoder).ok().flatten()?;
    let rgb = if value.len() == 8 {
        &value[2..]
    } else {
        &value
    };
    (rgb.len() == 6 && rgb.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| format!("#{}", rgb.to_ascii_uppercase()))
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

pub(crate) fn parse_styles(xml: &[u8]) -> Result<StyleCatalog, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut catalog = StyleCatalog::default();
    let mut section = String::new();
    let mut font: Option<FontDef> = None;
    let mut fill: Option<FillDef> = None;
    let mut border: Option<BorderDef> = None;
    let mut border_side = false;
    let mut xf: Option<XfDef> = None;

    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("解析 styles.xml 失败: {error}"))?;
        match event {
            Event::Start(ref start) => {
                let name = start.local_name();
                match name.as_ref() {
                    b"numFmts" | b"fonts" | b"fills" | b"borders" | b"cellXfs" => {
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
                        border = Some(BorderDef {
                            style: "none".into(),
                            color: None,
                        });
                    }
                    b"xf" if section == "cellXfs" => {
                        xf = Some(parse_xf(start, reader.decoder()));
                    }
                    b"left" | b"right" | b"top" | b"bottom" if border.is_some() => {
                        border_side = true;
                        if let Some(style) = xml_value(start, b"style", reader.decoder())? {
                            if style != "none"
                                && border.as_ref().is_some_and(|item| item.style == "none")
                            {
                                border.as_mut().unwrap().style = style;
                            }
                        }
                    }
                    _ => parse_style_child(
                        start,
                        reader.decoder(),
                        font.as_mut(),
                        fill.as_mut(),
                        border.as_mut().filter(|_| border_side),
                        xf.as_mut(),
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
                } else {
                    parse_style_child(
                        start,
                        reader.decoder(),
                        font.as_mut(),
                        fill.as_mut(),
                        border.as_mut().filter(|_| border_side),
                        xf.as_mut(),
                    )?;
                    if matches!(
                        start.local_name().as_ref(),
                        b"left" | b"right" | b"top" | b"bottom"
                    ) {
                        if let Some(style) = xml_value(start, b"style", reader.decoder())? {
                            if style != "none"
                                && border.as_ref().is_some_and(|item| item.style == "none")
                            {
                                border.as_mut().unwrap().style = style;
                            }
                        }
                    }
                }
            }
            Event::End(ref end) => match end.local_name().as_ref() {
                b"font" if font.is_some() => catalog.fonts.push(font.take().unwrap()),
                b"fill" if fill.is_some() => catalog.fills.push(fill.take().unwrap()),
                b"border" if border.is_some() => catalog.borders.push(border.take().unwrap()),
                b"xf" if xf.is_some() => catalog.xfs.push(xf.take().unwrap()),
                b"left" | b"right" | b"top" | b"bottom" => border_side = false,
                b"numFmts" | b"fonts" | b"fills" | b"borders" | b"cellXfs" => section.clear(),
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
        horizontal_alignment: "general".into(),
        wrap_text: false,
    }
}

fn parse_style_child(
    event: &BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    font: Option<&mut FontDef>,
    fill: Option<&mut FillDef>,
    border: Option<&mut BorderDef>,
    xf: Option<&mut XfDef>,
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
            b"color" => font.color = parse_color(event, decoder),
            _ => {}
        }
    }
    if let Some(fill) = fill {
        if name.as_ref() == b"fgColor" {
            fill.color = parse_color(event, decoder);
        }
    }
    if let Some(border) = border {
        if name.as_ref() == b"color" && border.color.is_none() {
            border.color = parse_color(event, decoder);
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
    pub(crate) fn public_style(&self, style_id: usize) -> WorkbookCellStyle {
        let xf = self.xfs.get(style_id).unwrap_or(&self.xfs[0]);
        let font = self.fonts.get(xf.font_id).unwrap_or(&self.fonts[0]);
        let fill = self.fills.get(xf.fill_id).unwrap_or(&self.fills[0]);
        let border = self.borders.get(xf.border_id).unwrap_or(&self.borders[0]);
        WorkbookCellStyle {
            style_id: style_id.min(self.xfs.len().saturating_sub(1)),
            number_format: number_format_name(xf.number_format_id, &self.custom_formats),
            font_name: font.name.clone(),
            font_size: font.size,
            bold: font.bold,
            italic: font.italic,
            underline: font.underline,
            font_color: font.color.clone(),
            fill_color: fill.color.clone(),
            border_style: border.style.clone(),
            border_color: border.color.clone(),
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
        .is_some_and(|value| number_format_id(value).is_none())
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
    if patch
        .horizontal_alignment
        .as_deref()
        .is_some_and(|value| !matches!(value, "general" | "left" | "center" | "right"))
    {
        return Err("不支持的水平对齐方式".into());
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
    if let Some(value) = &patch.number_format {
        xf.number_format_id = number_format_id(value).unwrap();
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
        border.style = value.clone();
    }
    if let Some(value) = &patch.border_color {
        border.color = (!value.is_empty()).then(|| value.to_ascii_uppercase());
    }
    if let Some(value) = &patch.horizontal_alignment {
        xf.horizontal_alignment = value.clone();
    }
    if let Some(value) = patch.wrap_text {
        xf.wrap_text = value;
    }
    Ok((font, fill, border, xf))
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
    let mut catalog = parse_styles(styles_xml)?;
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
    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("重写 styles.xml 失败: {error}"))?;
        match event {
            Event::Start(ref start) if start.local_name().as_ref() == b"fonts" => {
                found.insert("fonts");
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
    for side in ["left", "right", "top", "bottom"] {
        let mut start = BytesStart::new(side);
        if border.style != "none" {
            start.push_attribute(("style", border.style.as_str()));
        }
        if border.style == "none" || border.color.is_none() {
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
                        &format!("FF{}", &border.color.as_ref().unwrap()[1..]),
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
    start.push_attribute(("xfId", "0"));
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
