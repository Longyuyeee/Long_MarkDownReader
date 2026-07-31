use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};

const MAX_SOURCE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_TOTAL_PAGE_BYTES: usize = 40 * 1024 * 1024;
const MAX_PAGES: usize = 100;
const MAX_CELLS_PER_PAGE: usize = 50_000;
const MAX_DEPTH: usize = 96;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawioDiagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub page_id: Option<String>,
    pub cell_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawioCell {
    pub id: String,
    pub parent: Option<String>,
    pub source: Option<String>,
    pub target: Option<String>,
    pub kind: String,
    pub label: String,
    pub style: String,
    pub shape: Option<String>,
    pub fill_color: Option<String>,
    pub stroke_color: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub editable: bool,
    pub unknown_attribute_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawioPage {
    pub id: String,
    pub name: String,
    pub compressed: bool,
    pub cell_count: usize,
    pub vertex_count: usize,
    pub edge_count: usize,
    pub width: f64,
    pub height: f64,
    pub cells: Vec<DrawioCell>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawioAnalysis {
    pub valid: bool,
    pub page_count: usize,
    pub compressed_page_count: usize,
    pub total_cell_count: usize,
    pub external_link_count: usize,
    pub external_image_count: usize,
    pub pages: Vec<DrawioPage>,
    pub diagnostics: Vec<DrawioDiagnostic>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawioCellPatch {
    pub page_id: String,
    pub cell_id: String,
    pub label: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub fill_color: Option<String>,
    pub stroke_color: Option<String>,
}

#[derive(Debug)]
struct PageSource {
    id: String,
    name: String,
    content_start: usize,
    content_end: usize,
    content: String,
    compressed: bool,
}

pub fn analyze_drawio_source(content: &str) -> DrawioAnalysis {
    let mut analysis = DrawioAnalysis {
        valid: true,
        page_count: 0,
        compressed_page_count: 0,
        total_cell_count: 0,
        external_link_count: 0,
        external_image_count: 0,
        pages: Vec::new(),
        diagnostics: Vec::new(),
    };
    if content.len() > MAX_SOURCE_BYTES {
        analysis.valid = false;
        analysis.diagnostics.push(diagnostic(
            "error",
            "source-too-large",
            format!("Draw.io source exceeds the {MAX_SOURCE_BYTES} byte budget"),
            None,
            None,
        ));
        return analysis;
    }

    let page_sources = match extract_pages(content) {
        Ok(pages) => pages,
        Err(message) => {
            analysis.valid = false;
            analysis.diagnostics.push(diagnostic(
                "error",
                "invalid-drawio-container",
                message,
                None,
                None,
            ));
            return analysis;
        }
    };
    if page_sources.is_empty() || page_sources.len() > MAX_PAGES {
        analysis.valid = false;
        analysis.diagnostics.push(diagnostic(
            "error",
            "page-budget-exceeded",
            format!("Draw.io files must contain between 1 and {MAX_PAGES} pages"),
            None,
            None,
        ));
        return analysis;
    }

    let mut inflated_total = 0usize;
    for source in page_sources {
        let model = match decode_page(&source.content, source.compressed) {
            Ok(model) => model,
            Err(message) => {
                analysis.valid = false;
                analysis.diagnostics.push(diagnostic(
                    "error",
                    "page-decode-failed",
                    message,
                    Some(source.id),
                    None,
                ));
                continue;
            }
        };
        inflated_total = inflated_total.saturating_add(model.len());
        if model.len() > MAX_PAGE_BYTES || inflated_total > MAX_TOTAL_PAGE_BYTES {
            analysis.valid = false;
            analysis.diagnostics.push(diagnostic(
                "error",
                "inflated-budget-exceeded",
                "The decompressed Draw.io page budget was exceeded".into(),
                Some(source.id),
                None,
            ));
            continue;
        }
        match parse_page_model(&source.id, &source.name, source.compressed, &model) {
            Ok((page, diagnostics, links, images)) => {
                analysis.total_cell_count += page.cell_count;
                analysis.external_link_count += links;
                analysis.external_image_count += images;
                analysis.diagnostics.extend(diagnostics);
                analysis.pages.push(page);
            }
            Err(message) => {
                analysis.valid = false;
                analysis.diagnostics.push(diagnostic(
                    "error",
                    "invalid-page-model",
                    message,
                    Some(source.id),
                    None,
                ));
            }
        }
    }
    analysis.page_count = analysis.pages.len();
    analysis.compressed_page_count = analysis.pages.iter().filter(|page| page.compressed).count();
    if analysis
        .diagnostics
        .iter()
        .any(|item| item.severity == "error")
    {
        analysis.valid = false;
    }
    analysis
}

pub fn transform_drawio_cell_source(
    content: &str,
    patch: &DrawioCellPatch,
) -> Result<String, String> {
    validate_patch(patch)?;
    let pages = extract_pages(content)?;
    let page = pages
        .iter()
        .find(|page| page.id == patch.page_id)
        .ok_or_else(|| format!("Draw.io page '{}' was not found", patch.page_id))?;
    let model = decode_page(&page.content, page.compressed)?;
    let changed = patch_model(&model, patch)?;
    let encoded = encode_page(&changed, page.compressed)?;
    let mut output = String::with_capacity(content.len() + encoded.len());
    output.push_str(&content[..page.content_start]);
    output.push_str(&encoded);
    output.push_str(&content[page.content_end..]);
    let analysis = analyze_drawio_source(&output);
    if !analysis.valid {
        return Err("The transformed Draw.io source did not pass the safety contract".into());
    }
    Ok(output)
}

fn extract_pages(content: &str) -> Result<Vec<PageSource>, String> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut pages = Vec::new();
    let mut active: Option<(String, String, usize, usize)> = None;
    let mut root_seen = false;

    loop {
        let event_start = reader.buffer_position() as usize;
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Invalid Draw.io XML container: {error}"))?;
        match event {
            Event::Start(start) => {
                let name = local_name(start.name().as_ref());
                if !root_seen {
                    if name != "mxfile" {
                        return Err("The root element must be <mxfile>".into());
                    }
                    root_seen = true;
                } else if let Some((_, _, _, depth)) = active.as_mut() {
                    *depth += 1;
                    if *depth > MAX_DEPTH {
                        return Err("The Draw.io container depth budget was exceeded".into());
                    }
                } else if name == "diagram" {
                    if pages.len() >= MAX_PAGES {
                        return Err("The Draw.io page budget was exceeded".into());
                    }
                    let id = attr_value(&reader, &start, b"id")
                        .unwrap_or_else(|| format!("page-{}", pages.len() + 1));
                    let name = attr_value(&reader, &start, b"name")
                        .unwrap_or_else(|| format!("Page {}", pages.len() + 1));
                    active = Some((id, name, reader.buffer_position() as usize, 0));
                }
            }
            Event::End(end) => {
                if let Some((id, name, content_start, depth)) = active.as_mut() {
                    if *depth > 0 {
                        *depth -= 1;
                    } else if local_name(end.name().as_ref()) == "diagram" {
                        let raw = content[*content_start..event_start].trim().to_string();
                        let compressed = !raw.trim_start().starts_with('<');
                        pages.push(PageSource {
                            id: std::mem::take(id),
                            name: std::mem::take(name),
                            content_start: *content_start,
                            content_end: event_start,
                            content: raw,
                            compressed,
                        });
                        active = None;
                    }
                }
            }
            Event::DocType(_) => return Err("DOCTYPE is not allowed in Draw.io files".into()),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    if !root_seen || active.is_some() {
        return Err("The Draw.io container is incomplete".into());
    }
    Ok(pages)
}

fn decode_page(content: &str, compressed: bool) -> Result<String, String> {
    if !compressed {
        return Ok(content.to_string());
    }
    let bytes = STANDARD
        .decode(content.trim())
        .map_err(|error| format!("Invalid page Base64: {error}"))?;
    let decoder = DeflateDecoder::new(bytes.as_slice());
    let mut encoded = Vec::new();
    decoder
        .take((MAX_PAGE_BYTES + 1) as u64)
        .read_to_end(&mut encoded)
        .map_err(|error| format!("Invalid raw deflate page: {error}"))?;
    if encoded.len() > MAX_PAGE_BYTES {
        return Err("The decompressed page exceeds its safety budget".into());
    }
    let encoded = String::from_utf8(encoded)
        .map_err(|_| "The compressed page is not URI-encoded UTF-8".to_string())?;
    urlencoding::decode(&encoded)
        .map(|value| value.into_owned())
        .map_err(|error| format!("Invalid page URI encoding: {error}"))
}

fn encode_page(content: &str, compressed: bool) -> Result<String, String> {
    if !compressed {
        return Ok(content.to_string());
    }
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(urlencoding::encode(content).as_bytes())
        .map_err(|error| format!("Could not compress Draw.io page: {error}"))?;
    let bytes = encoder
        .finish()
        .map_err(|error| format!("Could not finish Draw.io compression: {error}"))?;
    Ok(STANDARD.encode(bytes))
}

fn parse_page_model(
    page_id: &str,
    page_name: &str,
    compressed: bool,
    model: &str,
) -> Result<(DrawioPage, Vec<DrawioDiagnostic>, usize, usize), String> {
    let mut reader = Reader::from_str(model);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut cells = Vec::<DrawioCell>::new();
    let mut current_cell: Option<usize> = None;
    let mut current_depth = 0usize;
    let mut max_x = 800.0f64;
    let mut max_y = 600.0f64;
    let mut diagnostics = Vec::new();
    let mut links = 0usize;
    let mut images = 0usize;
    let mut root_seen = false;

    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Invalid mxGraph XML: {error}"))?;
        match event {
            Event::Start(start) => {
                current_depth += 1;
                if current_depth > MAX_DEPTH {
                    return Err("The mxGraph depth budget was exceeded".into());
                }
                let name = local_name(start.name().as_ref());
                if !root_seen {
                    if name != "mxGraphModel" {
                        return Err("Each diagram page must contain an <mxGraphModel>".into());
                    }
                    root_seen = true;
                }
                if name == "mxCell" {
                    current_cell = Some(push_cell(&reader, &start, &mut cells)?);
                } else if name == "mxGeometry" {
                    if let Some(index) = current_cell {
                        apply_geometry(&reader, &start, &mut cells[index]);
                    }
                }
            }
            Event::Empty(start) => {
                let name = local_name(start.name().as_ref());
                if name == "mxCell" {
                    push_cell(&reader, &start, &mut cells)?;
                } else if name == "mxGeometry" {
                    if let Some(index) = current_cell {
                        apply_geometry(&reader, &start, &mut cells[index]);
                    }
                }
            }
            Event::End(end) => {
                if local_name(end.name().as_ref()) == "mxCell" {
                    current_cell = None;
                }
                current_depth = current_depth.saturating_sub(1);
            }
            Event::DocType(_) => return Err("DOCTYPE is not allowed in mxGraph pages".into()),
            Event::Eof => break,
            _ => {}
        }
        if cells.len() > MAX_CELLS_PER_PAGE {
            return Err("The per-page cell budget was exceeded".into());
        }
        buffer.clear();
    }
    if !root_seen {
        return Err("The page does not contain an mxGraph model".into());
    }

    for cell in &cells {
        if let (Some(x), Some(y), Some(width), Some(height)) =
            (cell.x, cell.y, cell.width, cell.height)
        {
            max_x = max_x.max(x + width + 40.0);
            max_y = max_y.max(y + height + 40.0);
        }
        let values = [
            cell.label.as_str(),
            cell.style.as_str(),
            cell.source.as_deref().unwrap_or_default(),
            cell.target.as_deref().unwrap_or_default(),
        ];
        for value in values {
            let lower = value.to_ascii_lowercase();
            if lower.contains("javascript:") || lower.contains("data:") || lower.contains("file:") {
                diagnostics.push(diagnostic(
                    "error",
                    "unsafe-resource-scheme",
                    "A blocked active or local resource scheme was found".into(),
                    Some(page_id.to_string()),
                    Some(cell.id.clone()),
                ));
            } else if lower.contains("http://") || lower.contains("https://") {
                links += 1;
                diagnostics.push(diagnostic(
                    "warning",
                    "external-link-preserved",
                    "An external link is preserved as data and is never opened automatically"
                        .into(),
                    Some(page_id.to_string()),
                    Some(cell.id.clone()),
                ));
            }
            if lower.contains("image=http://") || lower.contains("image=https://") {
                images += 1;
                diagnostics.push(diagnostic(
                    "warning",
                    "external-image-not-loaded",
                    "An external image reference is preserved but is not loaded by the editor"
                        .into(),
                    Some(page_id.to_string()),
                    Some(cell.id.clone()),
                ));
            }
        }
    }
    let vertex_count = cells.iter().filter(|cell| cell.kind == "vertex").count();
    let edge_count = cells.iter().filter(|cell| cell.kind == "edge").count();
    Ok((
        DrawioPage {
            id: page_id.to_string(),
            name: page_name.to_string(),
            compressed,
            cell_count: cells.len(),
            vertex_count,
            edge_count,
            width: max_x.min(100_000.0),
            height: max_y.min(100_000.0),
            cells,
        },
        diagnostics,
        links,
        images,
    ))
}

fn push_cell(
    reader: &Reader<&[u8]>,
    start: &BytesStart<'_>,
    cells: &mut Vec<DrawioCell>,
) -> Result<usize, String> {
    let id = attr_value(reader, start, b"id")
        .ok_or_else(|| "Every mxCell must have an id".to_string())?;
    let style = attr_value(reader, start, b"style").unwrap_or_default();
    let vertex = attr_value(reader, start, b"vertex").as_deref() == Some("1");
    let edge = attr_value(reader, start, b"edge").as_deref() == Some("1");
    let known = [
        "id",
        "parent",
        "source",
        "target",
        "value",
        "style",
        "vertex",
        "edge",
        "connectable",
        "visible",
        "collapsed",
    ];
    let unknown_attribute_count = start
        .attributes()
        .with_checks(false)
        .filter_map(Result::ok)
        .filter(|attribute| !known.contains(&local_name(attribute.key.as_ref()).as_str()))
        .count();
    let values = parse_style(&style);
    cells.push(DrawioCell {
        id,
        parent: attr_value(reader, start, b"parent"),
        source: attr_value(reader, start, b"source"),
        target: attr_value(reader, start, b"target"),
        kind: if vertex {
            "vertex"
        } else if edge {
            "edge"
        } else {
            "layer"
        }
        .into(),
        label: attr_value(reader, start, b"value").unwrap_or_default(),
        shape: values.get("shape").cloned(),
        fill_color: values.get("fillColor").cloned(),
        stroke_color: values.get("strokeColor").cloned(),
        style,
        x: None,
        y: None,
        width: None,
        height: None,
        editable: vertex,
        unknown_attribute_count,
    });
    Ok(cells.len() - 1)
}

fn apply_geometry(reader: &Reader<&[u8]>, start: &BytesStart<'_>, cell: &mut DrawioCell) {
    cell.x = parse_number(attr_value(reader, start, b"x"));
    cell.y = parse_number(attr_value(reader, start, b"y"));
    cell.width = parse_number(attr_value(reader, start, b"width"));
    cell.height = parse_number(attr_value(reader, start, b"height"));
}

fn patch_model(model: &str, patch: &DrawioCellPatch) -> Result<String, String> {
    let mut reader = Reader::from_str(model);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(model.len() + 128));
    let mut buffer = Vec::new();
    let mut target_depth: Option<usize> = None;
    let mut depth = 0usize;
    let mut found = false;

    loop {
        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("Invalid mxGraph XML: {error}"))?;
        let eof = matches!(event, Event::Eof);
        let output = match event {
            Event::Start(start) => {
                depth += 1;
                let name = local_name(start.name().as_ref());
                if name == "mxCell"
                    && attr_value(&reader, &start, b"id").as_deref() == Some(patch.cell_id.as_str())
                {
                    found = true;
                    target_depth = Some(depth);
                    Event::Start(rewrite_cell(&reader, &start, patch))
                } else if name == "mxGeometry" && target_depth.is_some() {
                    Event::Start(rewrite_geometry(&reader, &start, patch))
                } else {
                    Event::Start(start.into_owned())
                }
            }
            Event::Empty(start) => {
                let name = local_name(start.name().as_ref());
                if name == "mxCell"
                    && attr_value(&reader, &start, b"id").as_deref() == Some(patch.cell_id.as_str())
                {
                    found = true;
                    Event::Empty(rewrite_cell(&reader, &start, patch))
                } else if name == "mxGeometry" && target_depth.is_some() {
                    Event::Empty(rewrite_geometry(&reader, &start, patch))
                } else {
                    Event::Empty(start.into_owned())
                }
            }
            Event::End(end) => {
                if target_depth == Some(depth) && local_name(end.name().as_ref()) == "mxCell" {
                    target_depth = None;
                }
                depth = depth.saturating_sub(1);
                Event::End(end.into_owned())
            }
            other => other.into_owned(),
        };
        writer
            .write_event(output)
            .map_err(|error| format!("Could not rewrite mxGraph XML: {error}"))?;
        if eof {
            break;
        }
        buffer.clear();
    }
    if !found {
        return Err(format!("Draw.io cell '{}' was not found", patch.cell_id));
    }
    String::from_utf8(writer.into_inner()).map_err(|error| error.to_string())
}

fn rewrite_cell(
    reader: &Reader<&[u8]>,
    start: &BytesStart<'_>,
    patch: &DrawioCellPatch,
) -> BytesStart<'static> {
    let mut attributes = collect_attributes(reader, start);
    if let Some(label) = &patch.label {
        set_attribute(&mut attributes, "value", label.clone());
    }
    let mut style = attributes
        .iter()
        .find(|(name, _)| name == "style")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    if let Some(color) = &patch.fill_color {
        style = set_style_value(&style, "fillColor", color);
    }
    if let Some(color) = &patch.stroke_color {
        style = set_style_value(&style, "strokeColor", color);
    }
    if patch.fill_color.is_some() || patch.stroke_color.is_some() {
        set_attribute(&mut attributes, "style", style);
    }
    build_start(start, attributes)
}

fn rewrite_geometry(
    reader: &Reader<&[u8]>,
    start: &BytesStart<'_>,
    patch: &DrawioCellPatch,
) -> BytesStart<'static> {
    let mut attributes = collect_attributes(reader, start);
    for (name, value) in [
        ("x", patch.x),
        ("y", patch.y),
        ("width", patch.width),
        ("height", patch.height),
    ] {
        if let Some(value) = value {
            set_attribute(&mut attributes, name, compact_number(value));
        }
    }
    build_start(start, attributes)
}

fn collect_attributes(reader: &Reader<&[u8]>, start: &BytesStart<'_>) -> Vec<(String, String)> {
    start
        .attributes()
        .with_checks(false)
        .filter_map(Result::ok)
        .map(|attribute| {
            (
                String::from_utf8_lossy(attribute.key.as_ref()).into_owned(),
                attribute
                    .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                    .map(|value| value.into_owned())
                    .unwrap_or_default(),
            )
        })
        .collect()
}

fn build_start(
    original: &BytesStart<'_>,
    attributes: Vec<(String, String)>,
) -> BytesStart<'static> {
    let mut output =
        BytesStart::new(String::from_utf8_lossy(original.name().as_ref()).into_owned());
    for (name, value) in attributes {
        output.push_attribute((name.as_str(), value.as_str()));
    }
    output.into_owned()
}

fn set_attribute(attributes: &mut Vec<(String, String)>, name: &str, value: String) {
    if let Some((_, current)) = attributes.iter_mut().find(|(key, _)| key == name) {
        *current = value;
    } else {
        attributes.push((name.into(), value));
    }
}

fn parse_style(style: &str) -> HashMap<String, String> {
    style
        .split(';')
        .filter_map(|part| part.split_once('='))
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}

fn set_style_value(style: &str, key: &str, value: &str) -> String {
    let mut parts: Vec<String> = style
        .split(';')
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect();
    if let Some(part) = parts
        .iter_mut()
        .find(|part| part.split_once('=').map(|(name, _)| name) == Some(key))
    {
        *part = format!("{key}={value}");
    } else {
        parts.push(format!("{key}={value}"));
    }
    format!("{};", parts.join(";"))
}

fn validate_patch(patch: &DrawioCellPatch) -> Result<(), String> {
    if patch.label.as_ref().is_some_and(|label| label.len() > 1000) {
        return Err("Cell labels may not exceed 1000 bytes".into());
    }
    for value in [patch.x, patch.y, patch.width, patch.height]
        .into_iter()
        .flatten()
    {
        if !value.is_finite() || value.abs() > 100_000.0 {
            return Err("Geometry values must be finite and within the editing budget".into());
        }
    }
    if patch.width.is_some_and(|value| value <= 0.0)
        || patch.height.is_some_and(|value| value <= 0.0)
    {
        return Err("Cell width and height must be positive".into());
    }
    for color in [&patch.fill_color, &patch.stroke_color]
        .into_iter()
        .flatten()
    {
        let valid = color == "none"
            || (color.len() == 7
                && color.starts_with('#')
                && color[1..]
                    .chars()
                    .all(|character| character.is_ascii_hexdigit()));
        if !valid {
            return Err("Colors must use #RRGGBB or none".into());
        }
    }
    Ok(())
}

fn attr_value(reader: &Reader<&[u8]>, start: &BytesStart<'_>, name: &[u8]) -> Option<String> {
    start
        .attributes()
        .with_checks(false)
        .filter_map(Result::ok)
        .find(|attribute| local_name(attribute.key.as_ref()).as_bytes() == name)
        .and_then(|attribute| {
            attribute
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                .ok()
                .map(|value| value.into_owned())
        })
}

fn local_name(name: &[u8]) -> String {
    String::from_utf8_lossy(name)
        .rsplit(':')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn parse_number(value: Option<String>) -> Option<f64> {
    value.and_then(|value| value.parse().ok())
}

fn compact_number(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

fn diagnostic(
    severity: &str,
    code: &str,
    message: String,
    page_id: Option<String>,
    cell_id: Option<String>,
) -> DrawioDiagnostic {
    DrawioDiagnostic {
        severity: severity.into(),
        code: code.into(),
        message,
        page_id,
        cell_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/formats/drawio-uncompressed.drawio");

    fn compressed() -> String {
        let model = r#"<mxGraphModel customModel="keep"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="v1" parent="1" value="Before" vertex="1" style="fillColor=#ffffff;" customFlag="keep"><mxGeometry x="10" y="20" width="80" height="40" as="geometry" customGeometry="keep"/></mxCell></root></mxGraphModel>"#;
        format!(
            r#"<mxfile host="app.diagrams.net"><diagram id="compressed" name="Compressed">{}</diagram></mxfile>"#,
            encode_page(model, true).unwrap()
        )
    }

    #[test]
    fn analyzes_pages_cells_and_external_resources() {
        let analysis = analyze_drawio_source(FIXTURE);
        assert!(analysis.valid);
        assert_eq!(analysis.page_count, 2);
        assert_eq!(analysis.total_cell_count, 8);
        assert_eq!(analysis.external_link_count, 2);
        assert_eq!(analysis.external_image_count, 1);
    }

    #[test]
    fn patches_uncompressed_page_and_preserves_unknown_attributes() {
        let output = transform_drawio_cell_source(
            FIXTURE,
            &DrawioCellPatch {
                page_id: "page-1".into(),
                cell_id: "node-a".into(),
                label: Some("Changed".into()),
                x: Some(42.0),
                y: None,
                width: None,
                height: None,
                fill_color: Some("#112233".into()),
                stroke_color: None,
            },
        )
        .unwrap();
        assert!(output.contains("customFlag=\"preserve-me\""));
        assert!(output.contains("value=\"Changed\""));
        assert!(output.contains("x=\"42\""));
        assert!(output.contains("fillColor=#112233"));
    }

    #[test]
    fn compressed_page_round_trip_preserves_unknown_model_and_cell_data() {
        let source = compressed();
        let output = transform_drawio_cell_source(
            &source,
            &DrawioCellPatch {
                page_id: "compressed".into(),
                cell_id: "v1".into(),
                label: Some("After".into()),
                x: None,
                y: None,
                width: Some(90.0),
                height: None,
                fill_color: None,
                stroke_color: None,
            },
        )
        .unwrap();
        let page = extract_pages(&output).unwrap().remove(0);
        let decoded = decode_page(&page.content, true).unwrap();
        assert!(decoded.contains("customModel=\"keep\""));
        assert!(decoded.contains("customFlag=\"keep\""));
        assert!(decoded.contains("customGeometry=\"keep\""));
        assert!(decoded.contains("value=\"After\""));
        assert!(analyze_drawio_source(&output).valid);
    }

    #[test]
    fn blocks_active_schemes_and_malformed_compressed_pages() {
        let unsafe_source = FIXTURE.replace("https://example.com", "javascript:alert(1)");
        assert!(!analyze_drawio_source(&unsafe_source).valid);
        assert!(
            !analyze_drawio_source(
                r#"<mxfile><diagram id="bad" name="Bad">not-base64</diagram></mxfile>"#
            )
            .valid
        );
    }
}
