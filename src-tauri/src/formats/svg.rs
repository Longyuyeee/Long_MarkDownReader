use crate::formats::xml::{analyze_xml_source, XmlDiagnostic, XmlSourceAnalysis};
use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer, XmlVersion};
use serde::Serialize;

const MAX_SVG_SOURCE_BYTES: usize = 5 * 1024 * 1024;
const MAX_SVG_VIEWPORT: f64 = 16_384.0;
const MAX_SVG_ELEMENTS: usize = 20_000;
const MAX_SVG_ATTRIBUTES: usize = 100_000;
const MAX_SVG_DEPTH: usize = 64;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SvgSourceAnalysis {
    #[serde(flatten)]
    pub xml: XmlSourceAnalysis,
    pub sanitized_svg: Option<String>,
    pub preview_available: bool,
    pub blocked_element_count: usize,
    pub blocked_attribute_count: usize,
    pub external_reference_count: usize,
}

pub fn analyze_svg_source(content: &str) -> SvgSourceAnalysis {
    let mut xml = analyze_xml_source(content);
    if content.len() > MAX_SVG_SOURCE_BYTES {
        xml.valid = false;
        xml.diagnostics.push(svg_diagnostic(
            content,
            "svg-source-too-large",
            format!("SVG 源码超过 {MAX_SVG_SOURCE_BYTES} 字节安全分析上限"),
            0,
        ));
        return failed(xml);
    }
    if !xml.valid {
        return failed(xml);
    }
    if xml.root_name.as_deref() != Some("svg") {
        xml.valid = false;
        xml.diagnostics.push(svg_diagnostic(
            content,
            "svg-root-required",
            "SVG 文档必须使用无前缀的 <svg> 根元素".into(),
            0,
        ));
        return failed(xml);
    }
    if xml.element_count > MAX_SVG_ELEMENTS
        || xml.attribute_count > MAX_SVG_ATTRIBUTES
        || xml.max_depth > MAX_SVG_DEPTH
    {
        xml.valid = false;
        xml.diagnostics.push(svg_diagnostic(
            content,
            "svg-structure-budget-exceeded",
            format!(
                "SVG 结构超过 {MAX_SVG_ELEMENTS} 个元素、{MAX_SVG_ATTRIBUTES} 个属性或 {MAX_SVG_DEPTH} 层安全预算"
            ),
            0,
        ));
        return failed(xml);
    }

    let mut reader = Reader::from_str(content.trim_start_matches('\u{feff}'));
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::new());
    let mut buffer = Vec::new();
    let mut written_stack = Vec::<String>::new();
    let mut skipped_depth = 0usize;
    let mut blocked_element_count = 0usize;
    let mut blocked_attribute_count = 0usize;
    let mut external_reference_count = 0usize;

    loop {
        let offset = reader.buffer_position() as usize;
        let event = match reader.read_event_into(&mut buffer) {
            Ok(event) => event,
            Err(_) => return failed(xml),
        };
        let is_eof = matches!(event, Event::Eof);
        let result = match event {
            Event::Start(start) => {
                if skipped_depth > 0 {
                    skipped_depth += 1;
                    Ok(())
                } else {
                    let name = decoded_name(start.name().as_ref());
                    if !is_allowed_element(&name) {
                        blocked_element_count += 1;
                        skipped_depth = 1;
                        xml.diagnostics.push(svg_diagnostic(
                            content,
                            "svg-element-blocked",
                            format!("元素 <{name}> 不在安全预览白名单中"),
                            offset,
                        ));
                        Ok(())
                    } else {
                        let clean = sanitize_start(
                            content,
                            &reader,
                            &start,
                            offset,
                            &mut xml.diagnostics,
                            &mut blocked_attribute_count,
                            &mut external_reference_count,
                        );
                        written_stack.push(name);
                        writer.write_event(Event::Start(clean))
                    }
                }
            }
            Event::Empty(start) => {
                if skipped_depth > 0 {
                    Ok(())
                } else {
                    let name = decoded_name(start.name().as_ref());
                    if !is_allowed_element(&name) {
                        blocked_element_count += 1;
                        xml.diagnostics.push(svg_diagnostic(
                            content,
                            "svg-element-blocked",
                            format!("元素 <{name}> 不在安全预览白名单中"),
                            offset,
                        ));
                        Ok(())
                    } else {
                        let clean = sanitize_start(
                            content,
                            &reader,
                            &start,
                            offset,
                            &mut xml.diagnostics,
                            &mut blocked_attribute_count,
                            &mut external_reference_count,
                        );
                        writer.write_event(Event::Empty(clean))
                    }
                }
            }
            Event::End(_) => {
                if skipped_depth > 0 {
                    skipped_depth -= 1;
                    Ok(())
                } else if let Some(name) = written_stack.pop() {
                    writer.write_event(Event::End(BytesEnd::new(name)))
                } else {
                    Ok(())
                }
            }
            Event::Text(text) if skipped_depth == 0 => {
                writer.write_event(Event::Text(text.into_owned()))
            }
            Event::CData(text) if skipped_depth == 0 => {
                writer.write_event(Event::CData(text.into_owned()))
            }
            Event::PI(_) => {
                blocked_element_count += 1;
                xml.diagnostics.push(svg_diagnostic(
                    content,
                    "svg-processing-instruction-blocked",
                    "SVG 安全预览不接受处理指令".into(),
                    offset,
                ));
                Ok(())
            }
            Event::Decl(_) | Event::Comment(_) | Event::Eof => Ok(()),
            _ => Ok(()),
        };
        if result.is_err() {
            xml.valid = false;
            xml.diagnostics.push(svg_diagnostic(
                content,
                "svg-sanitizer-failed",
                "SVG 安全预览重写失败".into(),
                offset,
            ));
            return failed(xml);
        }
        if is_eof {
            break;
        }
        buffer.clear();
    }

    let sanitized_svg = String::from_utf8(writer.into_inner()).ok();
    xml.valid = xml.diagnostics.is_empty();
    SvgSourceAnalysis {
        preview_available: sanitized_svg.is_some(),
        sanitized_svg,
        xml,
        blocked_element_count,
        blocked_attribute_count,
        external_reference_count,
    }
}

fn sanitize_start(
    content: &str,
    reader: &Reader<&[u8]>,
    start: &BytesStart<'_>,
    offset: usize,
    diagnostics: &mut Vec<XmlDiagnostic>,
    blocked_attribute_count: &mut usize,
    external_reference_count: &mut usize,
) -> BytesStart<'static> {
    let name = decoded_name(start.name().as_ref());
    let mut clean = BytesStart::new(name.clone());
    for attribute in start.attributes().flatten() {
        let key = decoded_name(attribute.key.as_ref());
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
            .map(|value| value.into_owned())
            .unwrap_or_default();
        let lower_key = key.to_ascii_lowercase();
        let lower_value = value.trim().to_ascii_lowercase();

        let blocked = lower_key.starts_with("on")
            || lower_key == "style"
            || lower_key == "src"
            || (matches!(lower_key.as_str(), "href" | "xlink:href")
                && !lower_value.starts_with('#'))
            || (matches!(
                lower_key.as_str(),
                "fill" | "stroke" | "filter" | "clip-path" | "mask"
            ) && !is_safe_paint_reference(&lower_value))
            || (matches!(lower_key.as_str(), "width" | "height")
                && exceeds_viewport_limit(&lower_value))
            || (lower_key == "viewbox" && exceeds_viewbox_limit(&lower_value));

        if blocked {
            *blocked_attribute_count += 1;
            if matches!(lower_key.as_str(), "href" | "xlink:href" | "src")
                || lower_value.contains("url(")
            {
                *external_reference_count += 1;
            }
            diagnostics.push(svg_diagnostic(
                content,
                "svg-attribute-blocked",
                format!("属性 {key} 的值不满足安全预览策略"),
                offset,
            ));
            continue;
        }
        if is_allowed_attribute(&lower_key) {
            clean.push_attribute((key.as_str(), value.as_str()));
        }
    }
    clean.into_owned()
}

fn decoded_name(value: &[u8]) -> String {
    String::from_utf8_lossy(value).into_owned()
}

fn is_allowed_element(name: &str) -> bool {
    matches!(
        name,
        "svg"
            | "g"
            | "defs"
            | "symbol"
            | "use"
            | "path"
            | "rect"
            | "circle"
            | "ellipse"
            | "line"
            | "polyline"
            | "polygon"
            | "text"
            | "tspan"
            | "textPath"
            | "title"
            | "desc"
            | "metadata"
            | "linearGradient"
            | "radialGradient"
            | "stop"
            | "clipPath"
            | "mask"
            | "pattern"
            | "marker"
    )
}

fn is_allowed_attribute(key: &str) -> bool {
    matches!(
        key,
        "xmlns"
            | "xmlns:xlink"
            | "xml:space"
            | "id"
            | "class"
            | "viewbox"
            | "preserveaspectratio"
            | "width"
            | "height"
            | "x"
            | "y"
            | "x1"
            | "y1"
            | "x2"
            | "y2"
            | "cx"
            | "cy"
            | "r"
            | "rx"
            | "ry"
            | "d"
            | "points"
            | "transform"
            | "fill"
            | "fill-opacity"
            | "fill-rule"
            | "stroke"
            | "stroke-width"
            | "stroke-linecap"
            | "stroke-linejoin"
            | "stroke-dasharray"
            | "stroke-dashoffset"
            | "stroke-opacity"
            | "opacity"
            | "color"
            | "display"
            | "visibility"
            | "clip-path"
            | "clip-rule"
            | "mask"
            | "filter"
            | "href"
            | "xlink:href"
            | "offset"
            | "stop-color"
            | "stop-opacity"
            | "gradientunits"
            | "gradienttransform"
            | "spreadmethod"
            | "fx"
            | "fy"
            | "fr"
            | "patternunits"
            | "patterncontentunits"
            | "patterntransform"
            | "markerwidth"
            | "markerheight"
            | "markerunits"
            | "refx"
            | "refy"
            | "orient"
            | "font-family"
            | "font-size"
            | "font-style"
            | "font-weight"
            | "text-anchor"
            | "dominant-baseline"
            | "dx"
            | "dy"
            | "rotate"
            | "textlength"
            | "lengthadjust"
    )
}

fn is_safe_paint_reference(value: &str) -> bool {
    !value.contains("url(")
        || (value.starts_with("url(#")
            && value.ends_with(')')
            && !value[5..value.len() - 1].contains(['"', '\'', '(', ')']))
}

fn exceeds_viewport_limit(value: &str) -> bool {
    let number = value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic())
        .trim();
    number
        .parse::<f64>()
        .is_ok_and(|parsed| parsed.is_finite() && parsed.abs() > MAX_SVG_VIEWPORT)
}

fn exceeds_viewbox_limit(value: &str) -> bool {
    let values = value
        .split(|character: char| character.is_ascii_whitespace() || character == ',')
        .filter(|part| !part.is_empty())
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>();
    values.is_ok_and(|values| {
        values.len() != 4
            || values
                .iter()
                .any(|value| !value.is_finite() || value.abs() > MAX_SVG_VIEWPORT)
    })
}

fn svg_diagnostic(content: &str, code: &str, message: String, offset: usize) -> XmlDiagnostic {
    let prefix = &content[..offset.min(content.len())];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix
        .rsplit_once('\n')
        .map(|(_, tail)| tail.chars().count() + 1)
        .unwrap_or_else(|| prefix.chars().count() + 1);
    XmlDiagnostic {
        severity: "error".into(),
        code: code.into(),
        message,
        start: offset,
        end: offset,
        line,
        column,
        path: None,
    }
}

fn failed(xml: XmlSourceAnalysis) -> SvgSourceAnalysis {
    SvgSourceAnalysis {
        xml,
        sanitized_svg: None,
        preview_available: false,
        blocked_element_count: 0,
        blocked_attribute_count: 0,
        external_reference_count: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_a_bounded_svg_fixture() {
        let source = include_str!("../../tests/fixtures/formats/svg-safe.svg");
        let analysis = analyze_svg_source(source);
        assert!(analysis.xml.valid, "{:?}", analysis.xml.diagnostics);
        assert!(analysis.preview_available);
        let sanitized = analysis.sanitized_svg.unwrap();
        assert!(sanitized.contains("<linearGradient"));
        assert!(sanitized.contains("url(#paint)"));
        assert!(!sanitized.contains("<?xml"));
    }

    #[test]
    fn removes_active_content_and_external_references() {
        let analysis = analyze_svg_source(
            r#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="run()" fill="url(https://example.invalid/a)"/><use href="https://example.invalid/a"/></svg>"#,
        );
        assert!(!analysis.xml.valid);
        assert!(analysis.preview_available);
        assert_eq!(analysis.blocked_element_count, 1);
        assert_eq!(analysis.blocked_attribute_count, 3);
        assert_eq!(analysis.external_reference_count, 2);
        let sanitized = analysis.sanitized_svg.unwrap();
        assert!(!sanitized.contains("script"));
        assert!(!sanitized.contains("onclick"));
        assert!(!sanitized.contains("https://"));
    }

    #[test]
    fn rejects_non_svg_roots_and_doctype() {
        assert!(!analyze_svg_source("<root/>").preview_available);
        assert!(!analyze_svg_source("<!DOCTYPE svg><svg/>").preview_available);
    }

    #[test]
    fn blocks_oversized_viewboxes_from_preview_and_save() {
        let analysis = analyze_svg_source(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20000 100"><rect width="1" height="1"/></svg>"#,
        );
        assert!(!analysis.xml.valid);
        assert!(analysis.preview_available);
        assert!(analysis
            .xml
            .diagnostics
            .iter()
            .any(|item| item.code == "svg-attribute-blocked"));
        assert!(!analysis.sanitized_svg.unwrap().contains("viewBox"));
    }
}
