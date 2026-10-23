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
    pub attribute_insertion: Option<usize>,
    pub text: Option<XmlTextEntry>,
    pub text_edit_unavailable_reason: Option<String>,
    pub copy: Option<XmlElementCopy>,
    pub copy_unavailable_reason: Option<String>,
    pub order: Option<XmlElementOrder>,
    pub move_unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlElementRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlElementOrder {
    pub previous: Option<XmlElementRange>,
    pub next: Option<XmlElementRange>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlElementMove {
    pub content: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlElementDeletion {
    pub content: String,
    pub anchor: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlElementCopy {
    pub separator_start: usize,
    pub separator_end: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlTextEntry {
    pub kind: String,
    pub value: String,
    pub start: usize,
    pub end: usize,
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
    pub syntax: Option<XmlAttributeSyntax>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlAttributeSyntax {
    pub start: usize,
    pub end: usize,
    pub separator_start: usize,
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
    content_start: usize,
    text_segments: Vec<XmlTextEntry>,
    children: Vec<usize>,
    children_truncated: bool,
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
                        finish_element_copy(content, &frame, event_start, &mut state.outline);
                        finish_text(
                            content,
                            frame,
                            event_start,
                            xml_version,
                            &mut state.outline[index],
                        );
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
                record_text(
                    &mut stack,
                    content,
                    event_start + 9,
                    event_end - 3,
                    "cdata",
                    xml_version,
                );
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
            Event::GeneralRef(_) if stack.is_empty() => {
                state.diagnostics.push(diagnostic(
                    content,
                    "syntax-error",
                    "根元素之外不能包含实体引用".into(),
                    event_start,
                    None,
                ));
                break;
            }
            Event::Text(_) | Event::GeneralRef(_) => {
                record_text(
                    &mut stack,
                    content,
                    event_start,
                    event_end,
                    "text",
                    xml_version,
                );
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
    let mut attribute_cursor = event_start + 1 + start.name().as_ref().len();
    let mut syntax_complete = true;
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
            let syntax = range.and_then(|(from, to)| {
                let key_bytes = attribute.key.as_ref();
                let key_offset = (key_bytes.as_ptr() as usize).checked_sub(tag.as_ptr() as usize)?;
                let key_start = event_start.checked_add(1)?.checked_add(key_offset)?;
                let key_end = key_start.checked_add(key_bytes.len())?;
                let between = content.get(key_end..from.checked_sub(1)?)?;
                let separator = content.get(attribute_cursor..key_start)?;
                (content.as_bytes().get(key_start..key_end) == Some(key_bytes)
                    && !separator.is_empty()
                    && separator.bytes().all(xml_space)
                    && between.trim_matches([' ', '\t', '\n', '\r']) == "=")
                    .then_some(XmlAttributeSyntax {
                        start: key_start,
                        end: to + 1,
                        separator_start: attribute_cursor,
                    })
            });
            syntax_complete &= syntax.is_some();
            if let Some(syntax) = &syntax {
                attribute_cursor = syntax.end;
            }
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
                syntax,
            });
            state.attribute_details += 1;
        }
    }
    state.attribute_count += attribute_count;
    let tag_end = event_start + 1 + start.len();
    let attribute_insertion = (syntax_complete
        && attributes.len() == attribute_count
        && content
            .get(attribute_cursor..tag_end)
            .is_some_and(|s| s.bytes().all(xml_space)))
    .then_some(attribute_cursor);

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
            attribute_insertion,
            attributes,
            text: None,
            text_edit_unavailable_reason: Some("自闭合元素请在源码中展开后修改文字".into()),
            copy: None,
            order: None,
            move_unavailable_reason: Some(if depth == 0 {
                "根元素没有同级元素，请在源码中调整".into()
            } else {
                "父元素结构无法完整确认，请在源码中调整顺序".into()
            }),
            copy_unavailable_reason: Some(if depth == 0 {
                "根元素不能在同一文档中复制，请在源码中编辑".into()
            } else {
                "父元素结构无法完整确认，请在源码中复制".into()
            }),
        });
        Some(state.outline.len() - 1)
    } else {
        state.outline_truncated = true;
        None
    };

    if let Some(parent) = stack.last_mut() {
        if let Some(index) = outline_index {
            parent.children.push(index);
        } else {
            parent.children_truncated = true;
        }
    }
    if !empty {
        stack.push(ElementFrame {
            path,
            outline_index,
            child_counts: HashMap::new(),
            content_start: event_end,
            text_segments: Vec::new(),
            children: Vec::new(),
            children_truncated: false,
        });
    }
    true
}

fn finish_element_copy(
    content: &str,
    parent: &ElementFrame,
    closing_start: usize,
    outline: &mut [XmlOutlineEntry],
) {
    if parent.children_truncated || parent.children.is_empty() {
        return;
    }
    // A child owns its complete source, including internal comments. Only XML
    // whitespace may separate siblings: outer comments, PIs and mixed prose
    // have no unambiguous owner and must never be silently duplicated.
    let mut previous_end = parent.content_start;
    let mut separators = Vec::new();
    for &index in &parent.children {
        let child = &outline[index];
        if !content[previous_end..child.start]
            .bytes()
            .all(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
        {
            break;
        }
        separators.push((previous_end, child.start));
        previous_end = child.end;
    }
    let unambiguous = separators.len() == parent.children.len()
        && content[previous_end..closing_start]
            .bytes()
            .all(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'));
    for (position, &index) in parent.children.iter().enumerate() {
        let range = |i: &usize| XmlElementRange {
            start: outline[*i].start,
            end: outline[*i].end,
        };
        let previous = position
            .checked_sub(1)
            .and_then(|i| parent.children.get(i))
            .map(&range);
        let next = parent.children.get(position + 1).map(range);
        let child = &mut outline[index];
        if unambiguous {
            child.copy = Some(XmlElementCopy {
                separator_start: separators[position].0,
                separator_end: separators[position].1,
            });
            child.copy_unavailable_reason = None;
            child.order = Some(XmlElementOrder { previous, next });
            child.move_unavailable_reason = None;
        } else {
            child.copy_unavailable_reason =
                Some("同级内容含正文、注释或处理指令，请在源码中确认要复制的范围".into());
            child.move_unavailable_reason =
                Some("同级内容含正文、注释或处理指令，请在源码中确认要移动的范围".into());
        }
    }
}

pub fn move_xml_element_source(
    content: &str,
    start: usize,
    end: usize,
    direction: &str,
) -> Result<XmlElementMove, String> {
    if !matches!(direction, "up" | "down") {
        return Err("请选择上移或下移；当前草稿未变".into());
    }
    let analysis = analyze_xml_source(content);
    if !analysis.valid || analysis.outline_truncated {
        return Err("XML 结构尚未完整确认，请先在源码中检查；当前草稿未变".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|e| e.start == start && e.end == end)
        .ok_or("元素位置已过期，请重新选择；当前草稿未变")?;
    let order = entry.order.as_ref().ok_or_else(|| {
        entry
            .move_unavailable_reason
            .clone()
            .unwrap_or_else(|| "此元素请在源码中调整顺序；当前草稿未变".into())
    })?;
    let neighbor = if direction == "up" {
        &order.previous
    } else {
        &order.next
    };
    let neighbor = neighbor.as_ref().ok_or(if direction == "up" {
        "已经是第一个同级元素；当前草稿未变"
    } else {
        "已经是最后一个同级元素；当前草稿未变"
    })?;
    let selected = XmlElementRange { start, end };
    let (left, right) = if direction == "up" {
        (neighbor, &selected)
    } else {
        (&selected, neighbor)
    };
    let gap = &content[left.end..right.start];
    let candidate = format!(
        "{}{}{}{}{}",
        &content[..left.start],
        &content[right.start..right.end],
        gap,
        &content[left.start..left.end],
        &content[right.end..]
    );
    let moved_start = if direction == "up" {
        left.start
    } else {
        left.start + (right.end - right.start) + gap.len()
    };
    let moved_end = moved_start + (end - start);
    let checked = analyze_xml_source(&candidate);
    if !checked.valid
        || checked.outline_truncated
        || candidate.len() != content.len()
        || checked.element_count != analysis.element_count
        || checked.attribute_count != analysis.attribute_count
        || checked.namespace_count != analysis.namespace_count
        || checked.comment_count != analysis.comment_count
        || checked.cdata_count != analysis.cdata_count
        || checked.processing_instruction_count != analysis.processing_instruction_count
        || !checked.outline.iter().any(|e| {
            e.start == moved_start
                && e.end == moved_end
                && e.name == entry.name
                && e.depth == entry.depth
        })
        || candidate.get(moved_start..moved_end) != content.get(start..end)
    {
        return Err("无法完整保留这些元素，请在源码中调整顺序；当前草稿未变".into());
    }
    Ok(XmlElementMove {
        content: candidate,
        start: moved_start,
        end: moved_end,
    })
}

pub fn delete_xml_element_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<XmlElementDeletion, String> {
    let analysis = analyze_xml_source(content);
    if !analysis.valid || analysis.outline_truncated {
        return Err("XML 结构尚未完整确认，请先在源码中检查；当前草稿未变".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|e| e.start == start && e.end == end)
        .ok_or("元素位置已过期，请重新选择；当前草稿未变")?;
    if entry.depth == 0 {
        return Err("根元素不能删除，请在源码中编辑；当前草稿未变".into());
    }
    let (Some(separator), Some(order)) = (&entry.copy, &entry.order) else {
        return Err(
            "同级内容含正文、注释或处理指令，请在源码中确认要删除的范围；当前草稿未变".into(),
        );
    };
    let cut = separator.separator_start;
    if separator.separator_end != start || cut > start {
        return Err("元素范围无法完整确认，请在源码中删除；当前草稿未变".into());
    }
    // Remove only the selected subtree and its proven XML-whitespace prefix.
    // The next sibling's own spacing and the parent's closing spelling remain raw.
    let removed = end - cut;
    let candidate = format!("{}{}", &content[..cut], &content[end..]);
    let anchor = if let Some(next) = &order.next {
        next.start - removed
    } else if let Some(previous) = &order.previous {
        previous.start
    } else {
        analysis
            .outline
            .iter()
            .filter(|e| e.start < start && e.end > end)
            .max_by_key(|e| e.depth)
            .map(|e| e.start)
            .ok_or("父元素无法完整确认；当前草稿未变")?
    };
    let subtree = |e: &&XmlOutlineEntry| e.start >= start && e.end <= end;
    let deleted: Vec<_> = analysis.outline.iter().filter(subtree).collect();
    let retained: Vec<_> = analysis.outline.iter().filter(|e| !subtree(e)).collect();
    let checked = analyze_xml_source(&candidate);
    let shifted = |offset: usize| {
        if offset >= end {
            offset - removed
        } else {
            offset
        }
    };
    if !checked.valid
        || checked.outline_truncated
        || checked.element_count != analysis.element_count - deleted.len()
        || checked.attribute_count
            != analysis.attribute_count - deleted.iter().map(|e| e.attribute_count).sum::<usize>()
        || checked.root_name != analysis.root_name
        || checked.outline.len() != retained.len()
        || !checked.outline.iter().zip(retained).all(|(after, before)| {
            after.name == before.name
                && after.depth == before.depth
                && after.start == shifted(before.start)
                && after.end == shifted(before.end)
        })
        || !checked.outline.iter().any(|e| e.start == anchor)
    {
        return Err("无法完整保留相邻内容，请在源码中删除；当前草稿未变".into());
    }
    Ok(XmlElementDeletion {
        content: candidate,
        anchor,
    })
}

pub fn copy_xml_element_source(content: &str, start: usize, end: usize) -> Result<String, String> {
    let analysis = analyze_xml_source(content);
    if !analysis.valid || analysis.outline_truncated {
        return Err("XML 结构尚未完整确认，请先在源码中检查；当前草稿未变".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|e| e.start == start && e.end == end)
        .ok_or("元素位置已过期，请重新选择；当前草稿未变")?;
    let copy = entry.copy.as_ref().ok_or_else(|| {
        entry
            .copy_unavailable_reason
            .clone()
            .unwrap_or_else(|| "此元素请在源码中复制；当前草稿未变".into())
    })?;
    let separator = &content[copy.separator_start..copy.separator_end];
    let fragment = &content[start..end];
    if content.len() + separator.len() + fragment.len() > MAX_XML_SOURCE_BYTES {
        return Err("复制后源码超过编辑上限；当前草稿未变".into());
    }
    let candidate = format!(
        "{}{}{}{}",
        &content[..end],
        separator,
        fragment,
        &content[end..]
    );
    let checked = analyze_xml_source(&candidate);
    let subtree: Vec<_> = analysis
        .outline
        .iter()
        .filter(|e| e.start >= start && e.end <= end)
        .collect();
    let cloned_start = end + separator.len();
    if !checked.valid
        || checked.outline_truncated
        || checked.element_count != analysis.element_count + subtree.len()
        || checked.attribute_count
            != analysis.attribute_count + subtree.iter().map(|e| e.attribute_count).sum::<usize>()
        || !checked.outline.iter().any(|e| {
            e.start == cloned_start
                && e.end == cloned_start + fragment.len()
                && e.name == entry.name
        })
    {
        return Err("无法完整保留这个元素，请在源码中复制；当前草稿未变".into());
    }
    Ok(candidate)
}

fn normalize_text_lines(raw: &str, version: XmlVersion) -> String {
    let raw = if version == XmlVersion::Explicit1_1 {
        raw.replace("\r\u{85}", "\n")
    } else {
        raw.into()
    };
    let raw = raw.replace("\r\n", "\n").replace('\r', "\n");
    if version == XmlVersion::Explicit1_1 {
        raw.replace(['\u{85}', '\u{2028}'], "\n")
    } else {
        raw
    }
}

fn record_text(
    stack: &mut [ElementFrame],
    content: &str,
    start: usize,
    end: usize,
    kind: &str,
    version: XmlVersion,
) {
    let Some(frame) = stack.last_mut() else {
        return;
    };
    if frame.outline_index.is_none() || frame.text_segments.len() > 1 {
        return;
    }
    let value = if kind == "cdata" {
        normalize_text_lines(&content[start..end], version)
    } else {
        String::new()
    };
    if let Some(previous) = frame.text_segments.last_mut() {
        let adjacent = if kind == "cdata" {
            previous.end.checked_add(3) == start.checked_sub(9)
        } else {
            previous.end == start
        };
        if previous.kind == kind && adjacent {
            previous.end = end;
            previous.value.push_str(&value);
            return;
        }
    }
    frame.text_segments.push(XmlTextEntry {
        kind: kind.into(),
        value,
        start,
        end,
    });
}

fn finish_text(
    content: &str,
    frame: ElementFrame,
    closing_start: usize,
    version: XmlVersion,
    entry: &mut XmlOutlineEntry,
) {
    let reason = if !frame.child_counts.is_empty() {
        Some("此元素包含子元素，请在源码中修改文字")
    } else if frame.text_segments.len() > 1 {
        Some("此元素含多段或混合文字，请在源码中修改")
    } else {
        None
    };
    entry.text_edit_unavailable_reason = reason.map(str::to_owned);
    if reason.is_some() {
        return;
    }
    let mut text = frame
        .text_segments
        .into_iter()
        .next()
        .unwrap_or(XmlTextEntry {
            kind: "text".into(),
            value: String::new(),
            start: closing_start,
            end: closing_start,
        });
    if text.start < frame.content_start || text.end > closing_start {
        entry.text_edit_unavailable_reason = Some("文字位置无法确认，请在源码中修改".into());
        return;
    }
    if text.kind == "text" {
        let normalized = normalize_text_lines(&content[text.start..text.end], version);
        match quick_xml::escape::unescape(&normalized) {
            Ok(value) => text.value = value.into_owned(),
            Err(_) => {
                entry.text_edit_unavailable_reason =
                    Some("文字含未解析实体，请在源码中修改".into());
                return;
            }
        }
    }
    if text.value.chars().any(|c| !attribute_input_char(c)) {
        entry.text_edit_unavailable_reason = Some("文字含需特殊处理的字符，请在源码中修改".into());
        return;
    }
    entry.text = Some(text);
}

pub fn replace_xml_text_source(
    content: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<String, String> {
    let analysis = analyze_xml_source(content);
    if !analysis.valid {
        return Err("XML 存在语法问题，请先在源码中修复；当前草稿未变".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|entry| {
            entry
                .text
                .as_ref()
                .is_some_and(|text| text.start == start && text.end == end)
        })
        .ok_or("文字位置已过期或不能直接修改，请重新选择；当前草稿未变")?;
    let text = entry.text.as_ref().unwrap();
    if replacement.len() > MAX_XML_SOURCE_BYTES {
        return Err("文字超过编辑上限，请缩短输入；当前草稿未变".into());
    }
    if replacement.chars().any(|c| !attribute_input_char(c)) {
        return Err("文字含 XML 不支持的字符，请删除后重试；输入与草稿仍保留".into());
    }
    if replacement == text.value {
        return Ok(content.into());
    }
    let escaped = if text.kind == "cdata" {
        if replacement.contains(['\r', '\u{85}', '\u{2028}']) {
            return Err("CDATA 的特殊换行请使用普通换行或在源码中修改；输入仍保留".into());
        }
        // Adjacent CDATA sections retain the exact text, including the closing delimiter.
        replacement.replace("]]>", "]]]]><![CDATA[>")
    } else {
        replacement
            .chars()
            .map(|c| match c {
                '&' => "&amp;".into(),
                '<' => "&lt;".into(),
                '>' => "&gt;".into(),
                '\r' => "&#xD;".into(),
                c @ '\u{7f}'..='\u{9f}' => format!("&#x{:X};", c as u32),
                '\u{2028}' => "&#x2028;".into(),
                other => other.to_string(),
            })
            .collect::<String>()
    };
    if content.len() - (end - start) + escaped.len() > MAX_XML_SOURCE_BYTES {
        return Err("修改后源码超过编辑上限，请缩短输入；当前草稿未变".into());
    }
    let candidate = format!("{}{}{}", &content[..start], escaped, &content[end..]);
    let checked = analyze_xml_source(&candidate);
    let changed = checked
        .outline
        .iter()
        .find(|node| node.path == entry.path)
        .and_then(|node| node.text.as_ref());
    if !checked.valid
        || checked.element_count != analysis.element_count
        || checked.attribute_count != analysis.attribute_count
        || !changed.is_some_and(|node| {
            node.kind == text.kind
                && node.value == replacement
                && ((replacement.is_empty() && text.kind == "text")
                    || (node.start == start && node.end == start + escaped.len()))
        })
    {
        return Err(
            "无法在当前位置完整保留这段文字，请调整输入或在源码中修改；当前草稿未变".into(),
        );
    }
    Ok(candidate)
}

fn attribute_input_char(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}')
}

fn xml_space(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\r' | b'\n')
}

// XML 1.0 Fifth Edition NameStartChar / NameChar, excluding namespace colons.
// https://www.w3.org/TR/xml/#NT-NameStartChar
fn plain_attribute_name(name: &str) -> bool {
    let start = |c: char| {
        matches!(c, 'A'..='Z' | '_' | 'a'..='z' | '\u{c0}'..='\u{d6}'
        | '\u{d8}'..='\u{f6}' | '\u{f8}'..='\u{2ff}' | '\u{370}'..='\u{37d}'
        | '\u{37f}'..='\u{1fff}' | '\u{200c}'..='\u{200d}' | '\u{2070}'..='\u{218f}'
        | '\u{2c00}'..='\u{2fef}' | '\u{3001}'..='\u{d7ff}' | '\u{f900}'..='\u{fdcf}'
        | '\u{fdf0}'..='\u{fffd}' | '\u{10000}'..='\u{effff}')
    };
    let mut chars = name.chars();
    chars.next().is_some_and(start) && chars.all(|c| start(c) || matches!(c, '-' | '.' | '0'..='9' | '\u{b7}' | '\u{300}'..='\u{36f}' | '\u{203f}'..='\u{2040}'))
}

fn escape_attribute(value: &str, quote: u8) -> String {
    let mut escaped = String::new();
    for c in value.chars() {
        match c {
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
    escaped
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XmlAttributeChange {
    pub content: String,
    pub anchor: usize,
}

fn attribute_management_entry(
    analysis: &XmlSourceAnalysis,
    start: usize,
    end: usize,
) -> Result<&XmlOutlineEntry, String> {
    if !analysis.valid || analysis.outline_truncated {
        return Err("XML 存在语法问题或结构无法完整确认，请在源码中处理；当前草稿未变".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|e| e.start == start && e.end == end)
        .ok_or("元素位置已变化，请重新选择；当前草稿未变")?;
    if entry.attributes_truncated || entry.attribute_insertion.is_none() {
        return Err("属性过多或原文位置无法完整确认，请在源码中处理；当前草稿未变".into());
    }
    Ok(entry)
}

pub fn add_xml_attribute_source(
    content: &str,
    start: usize,
    end: usize,
    name: &str,
    value: &str,
) -> Result<XmlAttributeChange, String> {
    let analysis = analyze_xml_source(content);
    let entry = attribute_management_entry(&analysis, start, end)?;
    if name == "xmlns" || name.contains(':') {
        return Err("命名空间声明及带前缀属性请在源码中新增；当前草稿未变".into());
    }
    if !plain_attribute_name(name) {
        return Err("请输入有效的 XML 属性名，不能含空格或以数字开头；输入仍保留".into());
    }
    if entry.attributes.iter().any(|a| a.name == name) {
        return Err("此元素已有同名属性，请选择已有属性修改；输入仍保留".into());
    }
    if entry.attribute_count >= MAX_XML_ELEMENT_ATTRIBUTES {
        return Err("此元素属性较多，请在源码中新增；当前草稿未变".into());
    }
    if name.len() > MAX_XML_SOURCE_BYTES
        || value.len() > MAX_XML_SOURCE_BYTES
        || value.chars().any(|c| !attribute_input_char(c))
    {
        return Err("属性名或值超过上限，或含 XML 不支持的字符；输入仍保留".into());
    }
    let insertion = entry.attribute_insertion.unwrap();
    let last = entry.attributes.last();
    let separator = last
        .and_then(|a| a.syntax.as_ref())
        .map(|r| &content[r.separator_start..r.start])
        .unwrap_or(" ");
    let quote = last
        .map(|a| content.as_bytes()[a.start - 1])
        .unwrap_or(b'"');
    let literal = format!(
        "{separator}{name}={q}{}{q}",
        escape_attribute(value, quote),
        q = quote as char
    );
    if content.len() + literal.len() > MAX_XML_SOURCE_BYTES {
        return Err("新增后源码超过编辑上限，请缩短输入；当前草稿未变".into());
    }
    let candidate = format!(
        "{}{}{}",
        &content[..insertion],
        literal,
        &content[insertion..]
    );
    let checked = analyze_xml_source(&candidate);
    let changed = checked.outline.iter().find(|e| e.path == entry.path);
    if !checked.valid
        || checked.outline_truncated
        || checked.element_count != analysis.element_count
        || checked.root_name != analysis.root_name
        || checked.namespace_count != analysis.namespace_count
        || checked.attribute_count != analysis.attribute_count + 1
        || !changed.is_some_and(|e| {
            !e.attributes_truncated
                && e.attributes
                    .last()
                    .is_some_and(|a| a.name == name && a.value == value && a.editable)
        })
    {
        return Err("无法完整保留这个属性，请在源码中新增；当前草稿未变".into());
    }
    Ok(XmlAttributeChange {
        content: candidate,
        anchor: insertion + separator.len(),
    })
}

pub fn remove_xml_attribute_source(
    content: &str,
    start: usize,
    end: usize,
    name: &str,
) -> Result<XmlAttributeChange, String> {
    let analysis = analyze_xml_source(content);
    let entry = attribute_management_entry(&analysis, start, end)?;
    if name == "xmlns" || name.contains(':') {
        return Err("命名空间声明及带前缀属性请在源码中移除；当前草稿未变".into());
    }
    let attribute = entry
        .attributes
        .iter()
        .find(|a| a.name == name)
        .ok_or("此属性已变化，请重新选择；当前草稿未变")?;
    let range = attribute
        .syntax
        .as_ref()
        .ok_or("属性原文位置无法确认，请在源码中移除；当前草稿未变")?;
    let candidate = format!(
        "{}{}",
        &content[..range.separator_start],
        &content[range.end..]
    );
    let checked = analyze_xml_source(&candidate);
    let changed = checked.outline.iter().find(|e| e.path == entry.path);
    if !checked.valid
        || checked.outline_truncated
        || checked.element_count != analysis.element_count
        || checked.root_name != analysis.root_name
        || checked.namespace_count != analysis.namespace_count
        || checked.attribute_count + 1 != analysis.attribute_count
        || !changed.is_some_and(|e| {
            !e.attributes_truncated
                && e.attribute_count + 1 == entry.attribute_count
                && !e.attributes.iter().any(|a| a.name == name)
        })
    {
        return Err("无法完整保留其他属性，请在源码中移除；当前草稿未变".into());
    }
    Ok(XmlAttributeChange {
        content: candidate,
        anchor: entry.start,
    })
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
    let escaped = escape_attribute(replacement, content.as_bytes()[start - 1]);
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

    fn delete_at(source: &str, path: &str) -> Result<XmlElementDeletion, String> {
        let a = analyze_xml_source(source);
        let n = a.outline.iter().find(|n| n.path == path).unwrap();
        delete_xml_element_source(source, n.start, n.end)
    }

    #[test]
    fn element_delete_preserves_bom_crlf_namespace_and_unselected_raw_source() {
        let fragment = "<doc:item id='9007199254740993123456789'><title>中文 &amp; 😀</title><!-- 内部 --><?keep value?><literal><![CDATA[< > &]]></literal></doc:item>";
        let source = format!("\u{feff}<?xml version='1.0'?>\r\n<!-- 外部保留 -->\r\n<r xmlns:doc='urn:docs'>\r\n  <doc:item id='first'/>\r\n\t{fragment}\r\n  <tail keep=\"raw\"></tail>\r\n</r>\r\n");
        let changed = delete_at(&source, "/r[1]/doc:item[2]").unwrap();
        assert_eq!(
            changed.content,
            source.replace(&format!("\r\n\t{fragment}"), "")
        );
        assert!(changed.content[changed.anchor..].starts_with("<tail"));
        let a = analyze_xml_source(&changed.content);
        assert!(a.valid);
        assert_eq!(a.element_count, 3);
        assert_eq!(a.namespace_count, 1);
        assert_eq!(a.comment_count, 1);
        assert_eq!(a.cdata_count, 0);
        assert_eq!(a.processing_instruction_count, 0);
    }

    #[test]
    fn element_delete_first_last_and_only_child_choose_nearest_retained_element() {
        for (source, path, expected, anchor) in [
            (
                "<r>\n  <a/>\n\t<b/>\n</r>",
                "/r[1]/a[1]",
                "<r>\n\t<b/>\n</r>",
                "<b/>",
            ),
            (
                "<r>\n  <a/>\n\t<b/>\n</r>",
                "/r[1]/b[1]",
                "<r>\n  <a/>\n</r>",
                "<a/>",
            ),
            (
                "<r>\r\n  <only></only>\r\n</r>",
                "/r[1]/only[1]",
                "<r>\r\n</r>",
                "<r>",
            ),
            ("<r><only/></r>", "/r[1]/only[1]", "<r></r>", "<r>"),
        ] {
            let changed = delete_at(source, path).unwrap();
            assert_eq!(changed.content, expected);
            assert!(changed.content[changed.anchor..].starts_with(anchor));
        }
    }

    #[test]
    fn element_delete_repeated_siblings_refresh_paths_without_losing_nested_content() {
        let source = "<r><item id='a'/><item id='b'><child/></item><item id='c'><child>😀</child></item></r>";
        let changed = delete_at(source, "/r[1]/item[2]").unwrap();
        assert_eq!(
            changed.content,
            "<r><item id='a'/><item id='c'><child>😀</child></item></r>"
        );
        let a = analyze_xml_source(&changed.content);
        assert_eq!(
            a.outline
                .iter()
                .find(|n| n.start == changed.anchor)
                .unwrap()
                .path,
            "/r[1]/item[2]"
        );
        assert!(a.outline.iter().any(|n| n.path == "/r[1]/item[2]/child[1]"));
    }

    #[test]
    fn element_delete_root_and_ambiguous_parent_keep_local_source_fallback() {
        assert!(delete_at("<r><a/></r>", "/r[1]")
            .unwrap_err()
            .contains("根元素不能"));
        for source in [
            "<r>before<a/>after</r>",
            "<r><!-- 外部 --><a/></r>",
            "<r><?keep here?><a/></r>",
            "<r><a/><!-- 外部 --></r>",
            "<r>&#32;<a/></r>",
            "<r><![CDATA[ ]]><a/></r>",
        ] {
            assert!(analyze_xml_source(source).valid);
            assert!(delete_at(source, "/r[1]/a[1]")
                .unwrap_err()
                .contains("同级内容含"));
        }
    }

    #[test]
    fn element_delete_stale_invalid_and_oversized_ranges_never_form_a_candidate() {
        let source = "<r><a>😀</a></r>";
        for (start, end) in [(usize::MAX, usize::MAX), (0, 3), (5, 4), (7, 9)] {
            assert!(delete_xml_element_source(source, start, end).is_err());
        }
        assert!(delete_xml_element_source("<r><a></r>", 3, 6).is_err());
        assert!(delete_xml_element_source(&"a".repeat(MAX_XML_SOURCE_BYTES + 1), 0, 0).is_err());
    }

    #[test]
    fn element_delete_consecutive_empty_and_self_closing_elements_retain_parent_spelling() {
        let mut source =
            "<?xml version='1.0'?>\n<r>\n\t<empty></empty> \t <selfClosing/>\n  <empty/>\n</r>"
                .to_string();
        for path in ["/r[1]/empty[1]", "/r[1]/selfClosing[1]", "/r[1]/empty[1]"] {
            source = delete_at(&source, path).unwrap().content;
            assert!(analyze_xml_source(&source).valid);
        }
        assert_eq!(source, "<?xml version='1.0'?>\n<r>\n</r>");
    }

    fn move_at(source: &str, path: &str, direction: &str) -> Result<XmlElementMove, String> {
        let a = analyze_xml_source(source);
        let node = a.outline.iter().find(|n| n.path == path).unwrap();
        move_xml_element_source(source, node.start, node.end, direction)
    }

    #[test]
    fn element_order_preserves_exact_bom_crlf_namespace_and_internal_markup() {
        let first = "<x:item id='first'/>";
        let second = "<x:item id=\"900719925474099312345\">😀 &amp; 文字<!-- 内部 --><?keep value?><nested><![CDATA[< > &]]></nested></x:item>";
        let source = format!("\u{feff}<?xml version='1.0'?>\r\n<!-- 原稿 -->\r\n<root xmlns:x='urn:x'>\r\n\t{first}\r\n\t{second}\r\n  <last/>\r\n</root>\r\n");
        let moved = move_at(&source, "/root[1]/x:item[2]", "up").unwrap();
        assert_eq!(
            moved.content,
            source.replace(
                &format!("{first}\r\n\t{second}"),
                &format!("{second}\r\n\t{first}")
            )
        );
        assert_eq!(&moved.content[moved.start..moved.end], second);
        assert_eq!(moved.content.len(), source.len());
        let restored =
            move_xml_element_source(&moved.content, moved.start, moved.end, "down").unwrap();
        assert_eq!(restored.content, source);
    }

    #[test]
    fn element_order_down_retains_slot_whitespace_and_self_closing_or_paired_empty_source() {
        for (first, second) in [
            ("<a/>", "<b>正文😀</b>"),
            ("<a></a>", "<b/>"),
            ("<a/>", "<b></b>"),
        ] {
            let source = format!("<r> {first}\r\n\t{second}\n</r>");
            let moved = move_at(&source, "/r[1]/a[1]", "down").unwrap();
            assert_eq!(moved.content, format!("<r> {second}\r\n\t{first}\n</r>"));
            assert_eq!(&moved.content[moved.start..moved.end], first);
            assert_eq!(
                move_xml_element_source(&moved.content, moved.start, moved.end, "up")
                    .unwrap()
                    .content,
                source
            );
        }
        assert_eq!(
            move_at("<r><a/><b/></r>", "/r[1]/a[1]", "down")
                .unwrap()
                .content,
            "<r><b/><a/></r>"
        );
    }

    #[test]
    fn element_order_boundaries_and_root_remain_explicit_without_changing_source() {
        let source = "<r><a/><b/></r>";
        let a = analyze_xml_source(source);
        assert!(a.outline[0].order.is_none());
        assert!(a.outline[1].order.as_ref().unwrap().previous.is_none());
        assert!(a.outline[1].order.as_ref().unwrap().next.is_some());
        assert!(a.outline[2].order.as_ref().unwrap().next.is_none());
        assert!(move_at(source, "/r[1]/a[1]", "up")
            .unwrap_err()
            .contains("第一个"));
        assert!(move_at(source, "/r[1]/b[1]", "down")
            .unwrap_err()
            .contains("最后一个"));
        assert!(move_at(source, "/r[1]", "down")
            .unwrap_err()
            .contains("根元素"));
        let single = analyze_xml_source("<r><a/></r>");
        let order = single.outline[1].order.as_ref().unwrap();
        assert!(order.previous.is_none() && order.next.is_none());
    }

    #[test]
    fn element_order_ambiguous_outer_text_comments_and_instructions_stay_local() {
        for source in [
            "<r>before<a/><b/>after</r>",
            "<r><!-- owner? --><a/><b/></r>",
            "<r><a/><?keep value?><b/></r>",
            "<r><a/><b/><!-- tail --></r>",
            "<r>&#32;<a/><b/></r>",
        ] {
            let a = analyze_xml_source(source);
            assert!(a.valid);
            assert!(a.outline.iter().skip(1).all(|e| e.order.is_none()));
            assert!(move_at(source, "/r[1]/a[1]", "down")
                .unwrap_err()
                .contains("同级内容"));
        }
    }

    #[test]
    fn element_order_stale_invalid_direction_and_oversized_source_are_rejected() {
        let source = "<r><a>😀</a><b/></r>";
        for (start, end) in [(0, 0), (4, 8), (usize::MAX, usize::MAX), (10, 3)] {
            assert!(move_xml_element_source(source, start, end, "up").is_err());
        }
        assert!(move_at(source, "/r[1]/a[1]", "left").is_err());
        assert!(move_xml_element_source("<r><a></r>", 3, 6, "up").is_err());
        assert!(
            move_xml_element_source(&"a".repeat(MAX_XML_SOURCE_BYTES + 1), 0, 0, "down").is_err()
        );
    }

    #[test]
    fn element_order_repeated_same_named_siblings_refresh_paths_and_moved_selection() {
        let source = "<r>\n  <item id='1'/>\n  <item id='2'><child>二 😀</child></item>\n  <item id='3'/>\n</r>";
        let moved = move_at(source, "/r[1]/item[2]", "down").unwrap();
        let analysis = analyze_xml_source(&moved.content);
        let selected = analysis
            .outline
            .iter()
            .find(|e| e.start == moved.start && e.end == moved.end)
            .unwrap();
        assert_eq!(selected.path, "/r[1]/item[3]");
        assert!(analysis
            .outline
            .iter()
            .any(|e| e.path == "/r[1]/item[3]/child[1]"));
        let up = move_xml_element_source(&moved.content, moved.start, moved.end, "up").unwrap();
        assert_eq!(up.content, source);
        let first = move_xml_element_source(&up.content, up.start, up.end, "up").unwrap();
        assert!(analyze_xml_source(&first.content)
            .outline
            .iter()
            .any(|e| e.path == "/r[1]/item[1]" && e.start == first.start));
    }

    fn copy_at(source: &str, path: &str) -> Result<String, String> {
        let analysis = analyze_xml_source(source);
        let entry = analysis.outline.iter().find(|e| e.path == path).unwrap();
        copy_xml_element_source(source, entry.start, entry.end)
    }

    #[test]
    fn element_copy_retains_exact_bom_crlf_unicode_and_entire_subtree() {
        let source = "\u{feff}<?xml version='1.0'?>\r\n<!-- outer -->\r\n<root xmlns:x='urn:x'>\r\n\t<x:item id='900719925474099312345'>😀 &amp; 文字<!-- 内部 --><?keep value?><nested><![CDATA[< > &]]></nested></x:item>\r\n\t<other/>\r\n</root>\r\n";
        let fragment = "<x:item id='900719925474099312345'>😀 &amp; 文字<!-- 内部 --><?keep value?><nested><![CDATA[< > &]]></nested></x:item>";
        let expected = source.replacen(fragment, &format!("{fragment}\r\n\t{fragment}"), 1);
        let copied = copy_at(source, "/root[1]/x:item[1]").unwrap();
        assert_eq!(copied, expected);
        let a = analyze_xml_source(&copied);
        assert!(a.valid);
        assert_eq!(a.element_count, 6);
        assert_eq!(a.namespace_count, 1);
        assert_eq!(a.comment_count, 3);
        assert!(a
            .outline
            .iter()
            .any(|e| e.path == "/root[1]/x:item[2]/nested[1]"));
    }

    #[test]
    fn element_copy_targets_exact_same_named_sibling_and_preserves_spacing() {
        let source = "<r><a id='first'/>\n  <a id=\"second\">two</a>\n\t<b/></r>";
        assert_eq!(copy_at(source, "/r[1]/a[2]").unwrap(), "<r><a id='first'/>\n  <a id=\"second\">two</a>\n  <a id=\"second\">two</a>\n\t<b/></r>");
        assert_eq!(
            copy_at("<r><a/><b/></r>", "/r[1]/a[1]").unwrap(),
            "<r><a/><a/><b/></r>"
        );
    }

    #[test]
    fn element_copy_supports_empty_and_local_namespace_and_can_repeat() {
        let source = "<r>\n  <x:e xmlns:x='urn:local'></x:e>\n</r>";
        let first = copy_at(source, "/r[1]/x:e[1]").unwrap();
        let second = copy_at(&first, "/r[1]/x:e[2]").unwrap();
        assert_eq!(second.matches("<x:e xmlns:x='urn:local'></x:e>").count(), 3);
        assert_eq!(analyze_xml_source(&second).namespace_count, 3);
    }

    #[test]
    fn element_copy_rejects_root_and_ambiguous_outer_content_but_not_internal_markup() {
        for source in [
            "<r>before<a/>after</r>",
            "<r><!-- owner? --><a/></r>",
            "<r><a/><!-- owner? --></r>",
            "<r><a/><?keep v?><b/></r>",
            "<r><![CDATA[ ]]><a/></r>",
            "<r>&#32;<a/></r>",
        ] {
            let a = analyze_xml_source(source);
            assert!(a.valid);
            assert!(a.outline[1].copy.is_none(), "{source}");
            assert!(copy_at(source, "/r[1]/a[1]").is_err());
        }
        assert!(copy_at("<r><a/></r>", "/r[1]")
            .unwrap_err()
            .contains("根元素"));
        let source = "<r><a><!-- inside -->before<c/>after</a></r>";
        assert_eq!(
            copy_at(source, "/r[1]/a[1]").unwrap(),
            "<r><a><!-- inside -->before<c/>after</a><a><!-- inside -->before<c/>after</a></r>"
        );
    }

    #[test]
    fn element_copy_rejects_invalid_and_stale_ranges_without_panicking() {
        assert!(copy_xml_element_source("<r><a></r>", 3, 10).is_err());
        for (start, end) in [(0, 0), (4, 7), (usize::MAX, usize::MAX), (10, 3)] {
            assert!(copy_xml_element_source("<r>😀<a/></r>", start, end).is_err());
        }
    }

    #[test]
    fn element_copy_obeys_result_byte_and_outline_budgets() {
        let source = format!("<r><a>{}</a></r>", "a".repeat(MAX_XML_SOURCE_BYTES / 2));
        assert!(copy_at(&source, "/r[1]/a[1]").unwrap_err().contains("上限"));
        let source = format!("<r>{}</r>", "<a/>".repeat(MAX_XML_OUTLINE_ENTRIES));
        let a = analyze_xml_source(&source);
        assert!(a.valid && a.outline_truncated);
        assert!(a.outline[1].copy.is_none());
        assert!(copy_xml_element_source(&source, 3, 7).is_err());
    }

    fn text(source: &str, path: &str) -> XmlTextEntry {
        let a = analyze_xml_source(source);
        assert!(a.valid, "{:?}", a.diagnostics);
        a.outline
            .iter()
            .find(|e| e.path == path)
            .unwrap()
            .text
            .clone()
            .expect(path)
    }
    fn edit_text(source: &str, path: &str, value: &str) -> String {
        let t = text(source, path);
        replace_xml_text_source(source, t.start, t.end, value).unwrap()
    }
    #[test]
    fn xml_text_unicode_bom_entities_and_exact_source_ranges() {
        let s = "\u{feff}<?xml version=\"1.0\"?>\r\n<r><a x='long'>中文😀 &amp; &#x1F600;\r\ntext</a></r>";
        let t = text(s, "/r[1]/a[1]");
        assert_eq!(t.value, "中文😀 & 😀\ntext");
        assert_eq!(&s[t.start..t.end], "中文😀 &amp; &#x1F600;\r\ntext");
        assert_eq!(edit_text(s, "/r[1]/a[1]", &t.value), s);
        assert_eq!(
            edit_text(s, "/r[1]/a[1]", "新<&>"),
            s.replace("中文😀 &amp; &#x1F600;\r\ntext", "新&lt;&amp;&gt;")
        );
    }
    #[test]
    fn xml_text_same_named_sibling_keeps_attributes_and_intentional_whitespace() {
        let s="<r xmlns:d='urn:d'><d:a id='1'>same</d:a><d:a id=\"9007199254740993123456789\">same</d:a></r>";
        let v = " first\nsecond\t\r ";
        let got = edit_text(s, "/r[1]/d:a[2]", v);
        assert_eq!(
            got,
            s.replace(">same</d:a></r>", "> first\nsecond\t&#xD; </d:a></r>")
        );
        assert_eq!(text(&got, "/r[1]/d:a[2]").value, v);
    }
    #[test]
    fn xml_cdata_delimiter_splits_and_remains_editable_as_one_continuous_block() {
        let s = "<r><a><![CDATA[原始 <&>😀]]></a></r>";
        assert_eq!(text(s, "/r[1]/a[1]").kind, "cdata");
        let v = "中文 ]]> & < > 😀\nline";
        let got = edit_text(s, "/r[1]/a[1]", v);
        assert_eq!(
            got,
            s.replace("原始 <&>😀", "中文 ]]]]><![CDATA[> & < > 😀\nline")
        );
        assert_eq!(text(&got, "/r[1]/a[1]").value, v);
        let empty = edit_text(&got, "/r[1]/a[1]", "");
        assert_eq!(empty, "<r><a><![CDATA[]]></a></r>");
        assert_eq!(
            edit_text(&empty, "/r[1]/a[1]", "again"),
            "<r><a><![CDATA[again]]></a></r>"
        );
    }
    #[test]
    fn xml_paired_empty_text_can_be_filled_cleared_and_filled_again() {
        let s = "<r><a ></a><b/></r>";
        assert_eq!(text(s, "/r[1]/a[1]").value, "");
        let filled = edit_text(s, "/r[1]/a[1]", "<&>");
        assert_eq!(filled, "<r><a >&lt;&amp;&gt;</a><b/></r>");
        assert_eq!(edit_text(&filled, "/r[1]/a[1]", ""), s);
        let b = analyze_xml_source(s)
            .outline
            .into_iter()
            .find(|e| e.name == "b")
            .unwrap();
        assert!(b.text.is_none());
        assert!(b.text_edit_unavailable_reason.unwrap().contains("自闭合"));
    }
    #[test]
    fn xml_text_neighbour_comments_and_instructions_stay_byte_exact() {
        let s = "<a><!-- keep -->old<?keep value?></a>";
        assert_eq!(
            edit_text(s, "/a[1]", "new"),
            "<a><!-- keep -->new<?keep value?></a>"
        );
        let empty = edit_text(s, "/a[1]", "");
        assert_eq!(empty, "<a><!-- keep --><?keep value?></a>");
        assert_eq!(
            edit_text(&empty, "/a[1]", "next"),
            "<a><!-- keep --><?keep value?>next</a>"
        );
    }
    #[test]
    fn xml_mixed_split_and_unresolved_text_keep_local_source_fallback() {
        for s in [
            "<a>before<b/>after</a>",
            "<a>one<!--c-->two</a>",
            "<a>one<![CDATA[two]]></a>",
            "<a>&unknown;</a>",
        ] {
            let a = analyze_xml_source(s);
            assert!(a.valid);
            assert!(a.outline[0].text.is_none());
            assert!(a.outline[0].text_edit_unavailable_reason.is_some());
            assert!(replace_xml_text_source(s, 3, s.len() - 4, "x").is_err());
        }
        assert_eq!(text("<r><a>x</a></r>", "/r[1]/a[1]").value, "x");
    }
    #[test]
    fn xml_text_invalid_input_stale_ranges_and_invalid_source_keep_drafts() {
        let s = "<a>old</a>";
        let t = text(s, "/a[1]");
        for v in ["bad\0", "bad\u{fffe}", "bad\u{ffff}", "bad\u{b}"] {
            assert!(replace_xml_text_source(s, t.start, t.end, v).is_err())
        }
        assert!(replace_xml_text_source(s, t.start + 1, t.end, "x").is_err());
        assert!(replace_xml_text_source(s, usize::MAX, usize::MAX, "x").is_err());
        for s in ["<a>old", "<a>old</a>&amp;", "<a><b></a>"] {
            assert!(replace_xml_text_source(s, 3, 6, "x").is_err())
        }
        let c = "<a><![CDATA[x]]></a>";
        let t = text(c, "/a[1]");
        assert!(replace_xml_text_source(c, t.start, t.end, "\r").is_err());
    }
    #[test]
    fn xml_text_versioned_line_normalization_and_edit_budgets() {
        let s = "<?xml version='1.1'?><a>A\r\u{85}B\u{85}C\u{2028}D&#xD;&#x85;</a>";
        assert_eq!(text(s, "/a[1]").value, "A\nB\nC\nD\r\u{85}");
        let v = "A\r\u{85}\u{2028}";
        assert_eq!(text(&edit_text(s, "/a[1]", v), "/a[1]").value, v);
        let t = text("<a>x</a>", "/a[1]");
        assert!(replace_xml_text_source(
            "<a>x</a>",
            t.start,
            t.end,
            &"<".repeat(MAX_XML_SOURCE_BYTES / 2)
        )
        .is_err());
    }

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

    fn add(
        source: &str,
        path: &str,
        name: &str,
        value: &str,
    ) -> Result<XmlAttributeChange, String> {
        let entry = analyze_xml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap();
        add_xml_attribute_source(source, entry.start, entry.end, name, value)
    }
    fn remove(source: &str, path: &str, name: &str) -> Result<XmlAttributeChange, String> {
        let entry = analyze_xml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap();
        remove_xml_attribute_source(source, entry.start, entry.end, name)
    }

    #[test]
    fn attribute_management_ranges_cover_complete_literal_and_only_its_separator() {
        let source = "\u{feff}<配置 \t标题 \n= \"\"\r\n  second='😀' />";
        let analysis = analyze_xml_source(source);
        for (a, raw, separator) in [(0, "标题 \n= \"\"", " \t"), (1, "second='😀'", "\r\n  ")] {
            let syntax = analysis.outline[0].attributes[a].syntax.as_ref().unwrap();
            assert_eq!(&source[syntax.start..syntax.end], raw);
            assert_eq!(&source[syntax.separator_start..syntax.start], separator);
        }
        assert_eq!(
            analysis.outline[0].attribute_insertion,
            Some(source.find(" />").unwrap())
        );
    }

    #[test]
    fn attribute_add_keeps_bom_crlf_namespace_raw_values_and_other_nodes() {
        let source = "\u{feff}<?xml version='1.0'?>\r\n<!-- 原文😀 -->\r\n<r xmlns:p='urn:p'><p:item id='9007199254740993123456789'>正文<![CDATA[keep]]></p:item><p:item/></r>\r\n";
        let value = "'\" & < > \t\n\r 中文😀";
        let changed = add(source, "/r[1]/p:item[1]", "标题", value).unwrap();
        assert_eq!(
            attribute(&changed.content, "/r[1]/p:item[1]", "标题").value,
            value
        );
        assert_eq!(
            &changed.content[changed.anchor..changed.anchor + "标题".len()],
            "标题"
        );
        assert_eq!(
            remove(&changed.content, "/r[1]/p:item[1]", "标题")
                .unwrap()
                .content,
            source
        );
    }

    #[test]
    fn attribute_add_follows_multiline_separator_and_last_quote_without_reformatting() {
        let source = "<r\r\n  a = 'A&amp;B'\r\n\tb=\"B\"\r\n />";
        let changed = add(source, "/r[1]", "new", "\"value\"").unwrap();
        assert_eq!(
            changed.content,
            "<r\r\n  a = 'A&amp;B'\r\n\tb=\"B\"\r\n\tnew=\"&quot;value&quot;\"\r\n />"
        );
        assert_eq!(
            remove(&changed.content, "/r[1]", "new").unwrap().content,
            source
        );
    }

    #[test]
    fn attribute_add_supports_attribute_free_self_closing_paired_and_root_elements() {
        for source in [
            "<r/>",
            "<r />",
            "<r></r>",
            "<r\n></r>",
            "<r>正文<!--keep--></r>",
        ] {
            let changed = add(source, "/r[1]", "empty", "").unwrap();
            assert_eq!(changed.content, source.replacen("<r", "<r empty=\"\"", 1));
            assert_eq!(
                remove(&changed.content, "/r[1]", "empty").unwrap().content,
                source
            );
        }
    }

    #[test]
    fn attribute_remove_first_middle_last_and_only_retains_remaining_raw_bytes() {
        let source = "<r \ta='1'\r\n  b = \"B&amp;C\"   c='3'\r\n />";
        for (name, expected) in [
            ("a", "<r\r\n  b = \"B&amp;C\"   c='3'\r\n />"),
            ("b", "<r \ta='1'   c='3'\r\n />"),
            ("c", "<r \ta='1'\r\n  b = \"B&amp;C\"\r\n />"),
        ] {
            assert_eq!(remove(source, "/r[1]", name).unwrap().content, expected);
        }
        assert_eq!(
            remove("<r\r\n  only = ''\r\n />", "/r[1]", "only")
                .unwrap()
                .content,
            "<r\r\n />"
        );
    }

    #[test]
    fn attribute_management_names_duplicates_namespace_and_input_errors_stay_local() {
        let source = "<r xmlns:p='urn:p' p:label='yes' id='old'/>";
        for name in [
            "",
            "1id",
            "has space",
            "x=",
            "x\"",
            "x\0",
            "xmlns",
            "xmlns:p",
            "p:new",
            "id",
        ] {
            assert!(add(source, "/r[1]", name, "value").is_err(), "{name:?}");
        }
        for name in ["_id", "版本号", "😀", "a-b.c", "a\u{301}"] {
            assert!(add(source, "/r[1]", name, "").is_ok(), "{name}");
        }
        for value in ["\0", "\u{b}", "\u{fffe}"] {
            assert!(add(source, "/r[1]", "new", value).is_err());
        }
        for name in ["xmlns:p", "p:label", "missing"] {
            assert!(remove(source, "/r[1]", name).is_err());
        }
        assert_eq!(
            edit(source, "/r[1]", "p:label", "still editable").unwrap(),
            source.replace("label='yes'", "label='still editable'")
        );
    }

    #[test]
    fn attribute_management_rejects_stale_invalid_partial_and_oversized_candidates() {
        for (start, end) in [(0, 3), (usize::MAX, 0), (1, 4)] {
            assert!(add_xml_attribute_source("<r/>", start, end, "x", "v").is_err());
            assert!(remove_xml_attribute_source("<r a='v'/>", start, end, "a").is_err());
        }
        assert!(add_xml_attribute_source("<r>", 0, 3, "x", "v").is_err());
        let source = format!(
            "<r {}/>",
            (0..300)
                .map(|i| format!("a{i}='{i}'"))
                .collect::<Vec<_>>()
                .join(" ")
        );
        assert!(add(&source, "/r[1]", "new", "v").is_err());
        assert!(remove(&source, "/r[1]", "a0").is_err());
        assert!(add(
            "<r/>",
            "/r[1]",
            "new",
            &"&".repeat(MAX_XML_SOURCE_BYTES / 2)
        )
        .is_err());
    }

    #[test]
    fn attribute_management_consecutive_operations_refresh_repeated_element_ranges() {
        let source = "<r><item id='first'/><item id='second' keep='&amp;'/></r>";
        let added = add(source, "/r[1]/item[2]", "new", "first value").unwrap();
        let added_twice = add(&added.content, "/r[1]/item[2]", "other", "two").unwrap();
        let changed = edit(&added_twice.content, "/r[1]/item[2]", "new", "changed").unwrap();
        let removed = remove(&changed, "/r[1]/item[2]", "id").unwrap();
        assert_eq!(
            removed.content,
            "<r><item id='first'/><item keep='&amp;' new='changed' other='two'/></r>"
        );
        assert_eq!(removed.anchor, source.find("<item id='second'").unwrap());
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
