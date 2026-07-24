use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use std::collections::HashMap;

const MAX_XML_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_XML_NODES: usize = 100_000;
const MAX_XML_DEPTH: usize = 128;
const MAX_XML_OUTLINE_ENTRIES: usize = 20_000;
const MAX_XML_PREVIEW_CHARS: usize = 120;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlDiagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlOutlineEntry {
    pub path: String,
    pub name: String,
    pub depth: usize,
    pub attribute_count: usize,
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlSourceAnalysis {
    pub valid: bool,
    pub root_name: Option<String>,
    pub element_count: usize,
    pub attribute_count: usize,
    pub namespace_count: usize,
    pub max_depth: usize,
    pub comment_count: usize,
    pub cdata_count: usize,
    pub processing_instruction_count: usize,
    pub doctype_count: usize,
    pub outline: Vec<XmlOutlineEntry>,
    pub outline_truncated: bool,
    pub diagnostics: Vec<XmlDiagnostic>,
}

struct ElementFrame {
    path: String,
    outline_index: Option<usize>,
    child_counts: HashMap<String, usize>,
}

#[derive(Default)]
struct AnalysisState {
    root_name: Option<String>,
    root_count: usize,
    element_count: usize,
    attribute_count: usize,
    namespace_count: usize,
    max_depth: usize,
    comment_count: usize,
    cdata_count: usize,
    processing_instruction_count: usize,
    doctype_count: usize,
    outline_truncated: bool,
    outline: Vec<XmlOutlineEntry>,
    diagnostics: Vec<XmlDiagnostic>,
}

pub fn analyze_xml_source(content: &str) -> XmlSourceAnalysis {
    if content.len() > MAX_XML_SOURCE_BYTES {
        return failed_analysis(diagnostic(
            content,
            "source-too-large",
            format!("XML 源码超过 {MAX_XML_SOURCE_BYTES} 字节分析上限"),
            0,
            None,
        ));
    }

    let mut reader = Reader::from_str(content.trim_start_matches('\u{feff}'));
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut stack = Vec::<ElementFrame>::new();
    let mut state = AnalysisState::default();

    loop {
        let event_start = reader.buffer_position() as usize;
        let event = match reader.read_event_into(&mut buffer) {
            Ok(event) => event,
            Err(error) => {
                state.diagnostics.push(diagnostic(
                    content,
                    "syntax-error",
                    format!("XML 语法错误：{error}"),
                    event_start.min(content.len()),
                    stack.last().map(|frame| frame.path.clone()),
                ));
                break;
            }
        };
        let event_end = (reader.buffer_position() as usize).min(content.len());
        match event {
            Event::Start(ref start) => {
                if !push_element(
                    content,
                    start,
                    event_start,
                    event_end,
                    false,
                    &mut stack,
                    &mut state,
                ) {
                    break;
                }
            }
            Event::Empty(ref start) => {
                if !push_element(
                    content,
                    start,
                    event_start,
                    event_end,
                    true,
                    &mut stack,
                    &mut state,
                ) {
                    break;
                }
            }
            Event::End(_) => {
                if let Some(frame) = stack.pop() {
                    if let Some(index) = frame.outline_index {
                        state.outline[index].end = event_end;
                    }
                }
            }
            Event::Comment(_) => state.comment_count += 1,
            Event::CData(_) => state.cdata_count += 1,
            Event::PI(_) => state.processing_instruction_count += 1,
            Event::DocType(_) => {
                state.doctype_count += 1;
                state.diagnostics.push(diagnostic(
                    content,
                    "doctype-blocked",
                    "为避免实体扩展和外部资源风险，XML 工作面不接受 DOCTYPE".into(),
                    event_start,
                    stack.last().map(|frame| frame.path.clone()),
                ));
                break;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    if state.diagnostics.is_empty() && state.root_count != 1 {
        state.diagnostics.push(diagnostic(
            content,
            "root-element-count",
            if state.root_count == 0 {
                "XML 必须包含一个根元素".into()
            } else {
                "XML 只能包含一个根元素".into()
            },
            0,
            None,
        ));
    }

    XmlSourceAnalysis {
        valid: state.diagnostics.is_empty(),
        root_name: state.root_name,
        element_count: state.element_count,
        attribute_count: state.attribute_count,
        namespace_count: state.namespace_count,
        max_depth: state.max_depth,
        comment_count: state.comment_count,
        cdata_count: state.cdata_count,
        processing_instruction_count: state.processing_instruction_count,
        doctype_count: state.doctype_count,
        outline: state.outline,
        outline_truncated: state.outline_truncated,
        diagnostics: state.diagnostics,
    }
}

fn push_element(
    content: &str,
    start: &BytesStart<'_>,
    event_start: usize,
    event_end: usize,
    empty: bool,
    stack: &mut Vec<ElementFrame>,
    state: &mut AnalysisState,
) -> bool {
    state.element_count += 1;
    let depth = stack.len();
    state.max_depth = state.max_depth.max(depth);
    if state.element_count > MAX_XML_NODES || depth > MAX_XML_DEPTH {
        state.diagnostics.push(diagnostic(
            content,
            "analysis-budget-exceeded",
            format!("XML 结构超过 {MAX_XML_NODES} 个元素或 {MAX_XML_DEPTH} 层分析上限"),
            event_start,
            stack.last().map(|frame| frame.path.clone()),
        ));
        return false;
    }

    let name = String::from_utf8_lossy(start.name().as_ref()).into_owned();
    let sibling_index = if let Some(parent) = stack.last_mut() {
        let count = parent.child_counts.entry(name.clone()).or_default();
        *count += 1;
        *count
    } else {
        state.root_count += 1;
        if state.root_name.is_none() {
            state.root_name = Some(name.clone());
        }
        state.root_count
    };
    let path = if let Some(parent) = stack.last() {
        format!("{}/{}[{sibling_index}]", parent.path, name)
    } else {
        format!("/{name}[{sibling_index}]")
    };

    let mut attribute_count = 0usize;
    let mut preview_parts = Vec::new();
    for attribute in start.attributes() {
        let attribute = match attribute {
            Ok(attribute) => attribute,
            Err(error) => {
                state.diagnostics.push(diagnostic(
                    content,
                    "attribute-error",
                    format!("XML 属性解析失败：{error}"),
                    event_start,
                    Some(path.clone()),
                ));
                return false;
            }
        };
        attribute_count += 1;
        let key = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
        if key == "xmlns" || key.starts_with("xmlns:") {
            state.namespace_count += 1;
        }
        if preview_parts.len() < 3 {
            let value = String::from_utf8_lossy(attribute.value.as_ref());
            preview_parts.push(format!("{key}=\"{}\"", truncate(&value)));
        }
    }
    state.attribute_count += attribute_count;

    let outline_index = if state.outline.len() < MAX_XML_OUTLINE_ENTRIES {
        let (line, column) = line_column(content, event_start);
        state.outline.push(XmlOutlineEntry {
            path: path.clone(),
            name: name.clone(),
            depth,
            attribute_count,
            start: event_start,
            end: event_end,
            line,
            column,
            preview: preview_parts.join(" "),
        });
        Some(state.outline.len() - 1)
    } else {
        state.outline_truncated = true;
        None
    };

    if !empty {
        stack.push(ElementFrame {
            path,
            outline_index,
            child_counts: HashMap::new(),
        });
    }
    true
}

fn truncate(value: &str) -> String {
    let mut result: String = value.chars().take(MAX_XML_PREVIEW_CHARS).collect();
    if value.chars().count() > MAX_XML_PREVIEW_CHARS {
        result.push('…');
    }
    result
}

fn line_column(content: &str, offset: usize) -> (usize, usize) {
    let prefix = &content[..offset.min(content.len())];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix
        .rsplit_once('\n')
        .map(|(_, tail)| tail.chars().count() + 1)
        .unwrap_or_else(|| prefix.chars().count() + 1);
    (line, column)
}

fn diagnostic(
    content: &str,
    code: &str,
    message: String,
    offset: usize,
    path: Option<String>,
) -> XmlDiagnostic {
    let (line, column) = line_column(content, offset);
    XmlDiagnostic {
        severity: "error".into(),
        code: code.into(),
        message,
        start: offset,
        end: offset,
        line,
        column,
        path,
    }
}

fn failed_analysis(diagnostic: XmlDiagnostic) -> XmlSourceAnalysis {
    XmlSourceAnalysis {
        valid: false,
        root_name: None,
        element_count: 0,
        attribute_count: 0,
        namespace_count: 0,
        max_depth: 0,
        comment_count: 0,
        cdata_count: 0,
        processing_instruction_count: 0,
        doctype_count: 0,
        outline: Vec::new(),
        outline_truncated: false,
        diagnostics: vec![diagnostic],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyzes_namespaces_cdata_comments_and_processing_instructions() {
        let source = include_str!("../../tests/fixtures/formats/xml-valid.xml");
        let analysis = analyze_xml_source(source);
        assert!(analysis.valid, "{:?}", analysis.diagnostics);
        assert_eq!(analysis.root_name.as_deref(), Some("catalog"));
        assert_eq!(analysis.element_count, 3);
        assert_eq!(analysis.namespace_count, 2);
        assert_eq!(analysis.comment_count, 1);
        assert_eq!(analysis.cdata_count, 1);
        assert_eq!(analysis.processing_instruction_count, 1);
        assert!(analysis.outline.iter().any(|item| {
            item.path == "/catalog[1]/doc:item[2]" && item.preview.contains("id=\"second\"")
        }));
    }

    #[test]
    fn reports_damaged_xml_with_a_stable_location() {
        let source = include_str!("../../tests/fixtures/formats/xml-invalid.xml");
        let analysis = analyze_xml_source(source);
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "syntax-error");
        assert!(analysis.diagnostics[0].line >= 2);
    }

    #[test]
    fn blocks_doctype_without_attempting_entity_resolution() {
        let analysis = analyze_xml_source(
            r#"<!DOCTYPE root SYSTEM "https://example.invalid/entity.dtd"><root/>"#,
        );
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "doctype-blocked");
        assert_eq!(analysis.doctype_count, 1);
    }

    #[test]
    fn rejects_oversized_source_before_parsing() {
        let analysis = analyze_xml_source(&"<root>".repeat(MAX_XML_SOURCE_BYTES));
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "source-too-large");
    }
}
