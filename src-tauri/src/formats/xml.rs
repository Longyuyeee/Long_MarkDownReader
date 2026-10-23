use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::Serialize;
use std::collections::HashMap;

const MAX_XML_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_XML_NODES: usize = 100_000;
const MAX_XML_DEPTH: usize = 128;
const MAX_XML_OUTLINE_ENTRIES: usize = 20_000;
const MAX_XML_PREVIEW_CHARS: usize = 120;
const MAX_XML_ATTRIBUTE_DETAILS: usize = 20_000;
const MAX_XML_ELEMENT_ATTRIBUTES: usize = 256;

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
    pub attributes: Vec<XmlAttributeEntry>,
    pub attributes_truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlAttributeEntry {
    pub name: String,
    pub value: String,
    pub start: usize,
    pub end: usize,
    pub editable: bool,
    pub edit_unavailable_reason: Option<String>,
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
    attribute_details: usize,
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

    let source = content.trim_start_matches('\u{feff}');
    let bom_bytes = content.len() - source.len();
    let mut reader = Reader::from_str(source);
    let mut xml_version = XmlVersion::Implicit1_0;
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut stack = Vec::<ElementFrame>::new();
    let mut state = AnalysisState::default();

    loop {
        let event_start = reader.buffer_position() as usize + bom_bytes;
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
        let event_end = (reader.buffer_position() as usize + bom_bytes).min(content.len());
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
                    xml_version,
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
                    xml_version,
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
            Event::CData(_) => {
                if stack.is_empty() {
                    state.diagnostics.push(diagnostic(
                        content,
                        "syntax-error",
                        "CDATA 必须放在元素内部".into(),
                        event_start,
                        None,
                    ));
                    break;
                }
                state.cdata_count += 1;
            }
            Event::PI(_) => state.processing_instruction_count += 1,
            Event::Decl(ref declaration) => {
                xml_version = if declaration.version().is_ok_and(|v| v.as_ref() == b"1.1") {
                    XmlVersion::Explicit1_1
                } else {
                    XmlVersion::Explicit1_0
                };
            }
            Event::Text(ref text)
                if stack.is_empty() && !text.iter().all(u8::is_ascii_whitespace) =>
            {
                state.diagnostics.push(diagnostic(
                    content,
                    "syntax-error",
                    "根元素之外不能包含正文文字".into(),
                    event_start,
                    None,
                ));
                break;
            }
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

    if state.diagnostics.is_empty() && !stack.is_empty() {
        state.diagnostics.push(diagnostic(
            content,
            "syntax-error",
            "元素尚未闭合，请补齐结束标签".into(),
            content.len(),
            stack.last().map(|frame| frame.path.clone()),
        ));
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
    xml_version: XmlVersion,
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
    let mut attributes = Vec::new();
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
        if state.outline.len() < MAX_XML_OUTLINE_ENTRIES
            && attributes.len() < MAX_XML_ELEMENT_ATTRIBUTES
            && state.attribute_details < MAX_XML_ATTRIBUTE_DETAILS
        {
            // The parser's borrowed value belongs to this exact start tag. Derive
            // its byte range from the buffer, then verify against the original
            // source and surrounding quotes; never search by name or value.
            let raw = attribute.value.as_ref();
            let tag: &[u8] = start;
            let offset = (raw.as_ptr() as usize).checked_sub(tag.as_ptr() as usize);
            let range = offset.and_then(|offset| {
                let from = event_start.checked_add(1)?.checked_add(offset)?;
                let to = from.checked_add(raw.len())?;
                let bytes = content.as_bytes();
                let tag_from = event_start.checked_add(1)?;
                let tag_end = tag_from.checked_add(start.len())?;
                let quote = *bytes.get(from.checked_sub(1)?)?;
                (bytes.get(tag_from..tag_end) == Some(tag)
                    && bytes.get(from..to) == Some(raw)
                    && matches!(quote, b'\'' | b'"')
                    && bytes.get(to) == Some(&quote))
                .then_some((from, to))
            });
            let decoded = attribute.normalized_value(xml_version);
            let reason = if key == "xmlns" || key.starts_with("xmlns:") {
                Some("命名空间声明请在源码中修改")
            } else if range.is_none() {
                Some("属性位置无法确认，请在源码中修改")
            } else if decoded.is_err() {
                Some("此属性含未解析实体，请在源码中修改")
            } else if decoded
                .as_ref()
                .is_ok_and(|value| value.chars().any(|c| !attribute_input_char(c)))
            {
                Some("此属性含需特殊处理的字符，请在源码中修改")
            } else {
                None
            };
            let (from, to) = range.unwrap_or((event_start, event_start));
            attributes.push(XmlAttributeEntry {
                name: key,
                value: decoded
                    .map(|v| v.into_owned())
                    .unwrap_or_else(|_| String::from_utf8_lossy(raw).into_owned()),
                start: from,
                end: to,
                editable: reason.is_none(),
                edit_unavailable_reason: reason.map(str::to_owned),
            });
            state.attribute_details += 1;
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
            attributes_truncated: attributes.len() < attribute_count,
            attributes,
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

fn attribute_input_char(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}')
}

pub fn replace_xml_attribute_source(
    content: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<String, String> {
    let analysis = analyze_xml_source(content);
    if !analysis.valid {
        return Err("XML 存在语法问题，请先在源码中修复；当前草稿未变".into());
    }
    let attribute = analysis
        .outline
        .iter()
        .flat_map(|entry| &entry.attributes)
        .find(|attribute| attribute.start == start && attribute.end == end)
        .ok_or("属性位置已过期，请重新选择")?;
    if !attribute.editable {
        return Err(attribute
            .edit_unavailable_reason
            .clone()
            .unwrap_or_else(|| "此属性请在源码中修改".into()));
    }
    if replacement.len() > MAX_XML_SOURCE_BYTES {
        return Err("属性值超过编辑上限，请缩短输入；当前草稿未变".into());
    }
    if replacement.chars().any(|c| !attribute_input_char(c)) {
        return Err("属性值含 XML 不支持的字符，请删除后重试；输入与草稿仍保留".into());
    }
    if replacement == attribute.value {
        // Preserve the original spelling (entities and whitespace included) when
        // the displayed value has not changed.
        return Ok(content.into());
    }
    let quote = content.as_bytes()[start - 1];
    let mut escaped = String::new();
    for character in replacement.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '\'' if quote == b'\'' => escaped.push_str("&apos;"),
            '"' if quote == b'"' => escaped.push_str("&quot;"),
            '\t' => escaped.push_str("&#x9;"),
            '\n' => escaped.push_str("&#xA;"),
            '\r' => escaped.push_str("&#xD;"),
            c @ '\u{7f}'..='\u{9f}' => escaped.push_str(&format!("&#x{:X};", c as u32)),
            '\u{2028}' => escaped.push_str("&#x2028;"),
            other => escaped.push(other),
        }
    }
    if content.len() - (end - start) + escaped.len() > MAX_XML_SOURCE_BYTES {
        return Err("修改后源码超过编辑上限，请缩短输入；当前草稿未变".into());
    }
    let candidate = format!("{}{}{}", &content[..start], escaped, &content[end..]);
    let checked = analyze_xml_source(&candidate);
    if !checked.valid
        || checked.element_count != analysis.element_count
        || checked.attribute_count != analysis.attribute_count
    {
        return Err("这个值在当前位置无效，请调整输入；当前草稿未变".into());
    }
    // Verify that normalization of the inserted literal yields exactly the
    // user's text. Every byte outside this proven attribute range is retained.
    let changed = checked
        .outline
        .iter()
        .flat_map(|entry| &entry.attributes)
        .find(|entry| entry.start == start && entry.end == start + escaped.len());
    if !changed.is_some_and(|entry| {
        entry.editable && entry.name == attribute.name && entry.value == replacement
    }) {
        return Err("无法完整保留这个属性值，请在源码中修改；当前草稿未变".into());
    }
    Ok(candidate)
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

    fn attribute(source: &str, path: &str, name: &str) -> XmlAttributeEntry {
        let analysis = analyze_xml_source(source);
        assert!(analysis.valid, "{:?}", analysis.diagnostics);
        analysis
            .outline
            .iter()
            .find(|entry| entry.path == path)
            .expect(path)
            .attributes
            .iter()
            .find(|entry| entry.name == name)
            .expect(name)
            .clone()
    }
    fn edit(source: &str, path: &str, name: &str, value: &str) -> Result<String, String> {
        let attribute = attribute(source, path, name);
        replace_xml_attribute_source(source, attribute.start, attribute.end, value)
    }

    #[test]
    fn xml_attribute_ranges_preserve_bom_unicode_comments_crlf_and_spacing() {
        let source = "\u{feff}<?xml version='1.0'?>\r\n<!-- 中文😀 -->\r\n<配置  标题 = '中文😀'  keep=\"9007199254740993123456789\" />\r\n";
        let entry = attribute(source, "/配置[1]", "标题");
        assert!(entry.editable);
        assert_eq!(&source[entry.start..entry.end], "中文😀");
        let analysis = analyze_xml_source(source);
        assert_eq!(
            &source[analysis.outline[0].start..analysis.outline[0].end],
            "<配置  标题 = '中文😀'  keep=\"9007199254740993123456789\" />"
        );
        assert_eq!(analysis.outline[0].line, 3);
        assert_eq!(
            edit(source, "/配置[1]", "标题", "更新😀").unwrap(),
            source.replace("标题 = '中文😀'", "标题 = '更新😀'")
        );
    }

    #[test]
    fn xml_attribute_prefill_decodes_entities_and_normalizes_original_whitespace() {
        let source = "<root title='A &amp; B &lt; &gt; &quot; &apos; &#x1F600;' spaces='a\r\nb\tc&#xA;d&#13;'/>";
        assert_eq!(
            attribute(source, "/root[1]", "title").value,
            "A & B < > \" ' 😀"
        );
        let entry = attribute(source, "/root[1]", "spaces");
        assert_eq!(entry.value, "a b c\nd\r");
        assert_eq!(
            edit(source, "/root[1]", "spaces", &entry.value).unwrap(),
            source
        );
        let source = "<?xml version='1.1'?><root value='a\u{85}b\u{2028}c'/>";
        assert_eq!(attribute(source, "/root[1]", "value").value, "a b c");
        assert_eq!(
            attribute(
                &edit(source, "/root[1]", "value", "a\u{85}\u{2028}b").unwrap(),
                "/root[1]",
                "value"
            )
            .value,
            "a\u{85}\u{2028}b"
        );
    }

    #[test]
    fn xml_attribute_quote_style_and_markup_input_do_not_change_other_nodes() {
        for quote in ['\'', '"'] {
            let source = format!(
                "<root value={quote}old{quote} keep='&amp;'><!-- untouched --><child/></root>"
            );
            let input = "'\" <child injected='yes'/> & &#x41; >";
            let changed = edit(&source, "/root[1]", "value", input).unwrap();
            assert_eq!(attribute(&changed, "/root[1]", "value").value, input);
            assert!(changed.contains(&format!("value={quote}")));
            assert!(changed.ends_with(" keep='&amp;'><!-- untouched --><child/></root>"));
            assert_eq!(analyze_xml_source(&changed).element_count, 2);
        }
    }

    #[test]
    fn xml_attribute_edits_distinguish_siblings_and_prefixed_names() {
        let source = "<root xmlns:p='urn:demo'><p:item id='same' p:label='first'/><p:item id='same' p:label='second'/></root>";
        assert_eq!(
            edit(source, "/root[1]/p:item[2]", "p:label", "changed").unwrap(),
            source.replace("p:label='second'", "p:label='changed'")
        );
        assert_eq!(
            edit(source, "/root[1]/p:item[2]", "id", "new-id").unwrap(),
            source.replacen(
                "id='same' p:label='second'",
                "id='new-id' p:label='second'",
                1
            )
        );
    }

    #[test]
    fn xml_attribute_empty_values_and_intentional_whitespace_are_retained() {
        let source = "<root value='' other='same'/>";
        for value in ["", " \t\n\r ", "line1\nline2", "  中文😀  "] {
            let changed = edit(source, "/root[1]", "value", value).unwrap();
            assert_eq!(attribute(&changed, "/root[1]", "value").value, value);
            assert!(changed.ends_with(" other='same'/>"));
        }
    }

    #[test]
    fn xml_attribute_invalid_input_and_stale_ranges_never_form_a_candidate() {
        let source = "<root value='old'/>";
        for value in ["\0", "\u{b}", "\u{fffe}", "\u{ffff}"] {
            assert!(edit(source, "/root[1]", "value", value).is_err());
        }
        for (start, end) in [(0, 1), (usize::MAX, 0), (13, 15)] {
            assert!(replace_xml_attribute_source(source, start, end, "new").is_err());
        }
        for invalid in [
            "<root value='old'>",
            "before<root value='old'/>",
            "<root value='old'/>after",
            "<![CDATA[bad]]><root value='old'/>",
            "<root value='x' value='y'/>",
        ] {
            assert!(!analyze_xml_source(invalid).valid, "{invalid}");
            assert!(replace_xml_attribute_source(invalid, 13, 16, "new").is_err());
        }
    }

    #[test]
    fn xml_attribute_namespace_and_unknown_entities_keep_a_local_source_fallback() {
        let source = "<root xmlns='urn:demo' xmlns:p='urn:p' custom='&external;' normal='safe'/>";
        for name in ["xmlns", "xmlns:p", "custom"] {
            let entry = attribute(source, "/root[1]", name);
            assert!(!entry.editable);
            assert!(entry.edit_unavailable_reason.is_some());
            assert!(replace_xml_attribute_source(source, entry.start, entry.end, "new").is_err());
        }
        assert_eq!(
            edit(source, "/root[1]", "normal", "changed").unwrap(),
            source.replace("normal='safe'", "normal='changed'")
        );
    }

    #[test]
    fn xml_attribute_detail_and_source_budgets_preserve_source_access() {
        let source = format!(
            "<root {}/>",
            (0..300)
                .map(|i| format!("a{i}='{i}'"))
                .collect::<Vec<_>>()
                .join(" ")
        );
        let analysis = analyze_xml_source(&source);
        assert!(analysis.valid);
        assert_eq!(analysis.attribute_count, 300);
        assert_eq!(
            analysis.outline[0].attributes.len(),
            MAX_XML_ELEMENT_ATTRIBUTES
        );
        assert!(analysis.outline[0].attributes_truncated);
        assert!(edit(&source, "/root[1]", "a255", "new").is_ok());
        let source = "<root value='old'/>";
        assert!(edit(
            source,
            "/root[1]",
            "value",
            &"&".repeat(MAX_XML_SOURCE_BYTES / 4)
        )
        .is_err());
    }

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
