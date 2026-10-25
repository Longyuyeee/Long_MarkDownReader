use saphyr::{LoadableYamlNode, MarkedYamlOwned, ScalarOwned, YamlDataOwned};
use saphyr_parser::{Event, Parser, ScalarStyle};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[path = "yaml_fields.rs"]
mod fields;
pub use fields::{add_yaml_field_source, remove_yaml_field_source, copy_yaml_field_source, move_yaml_field_source};

#[cfg(test)]
#[path = "yaml_field_copy_tests.rs"]
mod field_copy_tests;

#[path = "yaml_sequences.rs"]
mod sequences;
pub use sequences::{add_yaml_sequence_item_source, remove_yaml_sequence_item_source, copy_yaml_sequence_item_source, move_yaml_sequence_item_source};

#[path = "yaml_literal.rs"]
mod literal;
pub use literal::inspect_yaml_literal_source;

const MAX_YAML_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_YAML_NODES: usize = 100_000;
const MAX_YAML_OUTLINE_ENTRIES: usize = 20_000;
const MAX_YAML_DEPTH: usize = 128;
const MAX_YAML_PREVIEW_CHARS: usize = 120;

#[cfg(test)]
#[path = "yaml_literal_tests.rs"]
mod literal_tests;

fn parser_source(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YamlDiagnostic {
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
pub struct YamlOutlineEntry {
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub literal: bool,
    pub field: Option<YamlField>,
    pub document_index: usize,
    pub path: String,
    pub label: String,
    pub kind: String,
    pub depth: usize,
    pub child_count: usize,
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
    pub preview: String,
    pub editable: bool,
    pub edit_unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YamlField {
    pub name: String,
    pub start: usize,
    pub end: usize,
    pub rename_unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct YamlKeyChange {
    #[serde(rename = "valueType", skip_serializing_if = "Option::is_none")]
    pub value_type: Option<String>,
    pub content: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Default)]
struct YamlTokens {
    literals: HashSet<(usize, usize)>,
    scalars: HashMap<(usize, usize), ScalarStyle>,
    aliases: HashSet<(usize, usize)>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YamlSourceAnalysis {
    pub valid: bool,
    pub document_count: usize,
    pub node_count: usize,
    pub max_depth: usize,
    pub anchor_count: usize,
    pub alias_count: usize,
    pub tagged_node_count: usize,
    pub block_scalar_count: usize,
    pub outline: Vec<YamlOutlineEntry>,
    pub outline_truncated: bool,
    pub diagnostics: Vec<YamlDiagnostic>,
}

#[derive(Default)]
struct AnalysisCounters {
    nodes: usize,
    max_depth: usize,
    aliases: usize,
    anchors: usize,
    tagged_nodes: usize,
    block_scalars: usize,
    limit_exceeded: bool,
}

pub fn analyze_yaml_source(content: &str) -> YamlSourceAnalysis {
    if content.len() > MAX_YAML_SOURCE_BYTES {
        return failed_analysis(YamlDiagnostic {
            severity: "error".into(),
            code: "source-too-large".into(),
            message: format!("YAML 源码超过 {MAX_YAML_SOURCE_BYTES} 字节分析上限"),
            start: 0,
            end: 0,
            line: 1,
            column: 1,
            path: None,
        });
    }

    let offsets = source_offsets(content);
    let documents = match MarkedYamlOwned::load_from_str(parser_source(content)) {
        Ok(documents) => documents,
        Err(error) => {
            let marker = error.marker();
            return failed_analysis(YamlDiagnostic {
                severity: "error".into(),
                code: "syntax-error".into(),
                message: error.info().to_string(),
                start: byte_offset(&offsets, marker.index()),
                end: byte_offset(&offsets, marker.index()),
                line: marker.line().max(1),
                column: marker.col().saturating_add(1),
                path: None,
            });
        }
    };

    let mut counters = AnalysisCounters::default();
    let editable_spans = inspect_events(content, &mut counters, &offsets);
    let key_tokens = key_tokens(content, &offsets);
    let mut outline = Vec::new();
    for (document_index, document) in documents.iter().enumerate() {
        inspect_node(
            document,
            document_index,
            "$",
            &format!("文档 {}", document_index + 1),
            0,
            &mut counters,
            &mut outline,
            &offsets,
            &editable_spans,
            content,
            true,
            &key_tokens,
            None,
        );
        if counters.limit_exceeded {
            break;
        }
    }

    if documents.len() != 1 {
        for entry in &mut outline {
            entry.literal = false;
            entry.editable = false;
            entry.edit_unavailable_reason =
                Some("多文档 YAML 请在源码中修改，当前内容会保留".into());
            if let Some(field) = &mut entry.field {
                field.rename_unavailable_reason =
                    Some("多文档 YAML 请在源码中重命名，当前输入会保留".into());
            }
        }
    }

    let mut diagnostics = Vec::new();
    if counters.limit_exceeded {
        diagnostics.push(YamlDiagnostic {
            severity: "error".into(),
            code: "analysis-budget-exceeded".into(),
            message: format!("YAML 结构超过 {MAX_YAML_NODES} 个节点或 {MAX_YAML_DEPTH} 层分析上限"),
            start: 0,
            end: content.len(),
            line: 1,
            column: 1,
            path: Some("$".into()),
        });
    }

    YamlSourceAnalysis {
        valid: diagnostics.is_empty(),
        document_count: documents.len(),
        node_count: counters.nodes,
        max_depth: counters.max_depth,
        anchor_count: counters.anchors,
        alias_count: counters.aliases,
        tagged_node_count: counters.tagged_nodes,
        block_scalar_count: counters.block_scalars,
        outline_truncated: counters.nodes > outline.len(),
        outline,
        diagnostics,
    }
}

fn failed_analysis(diagnostic: YamlDiagnostic) -> YamlSourceAnalysis {
    YamlSourceAnalysis {
        valid: false,
        document_count: 0,
        node_count: 0,
        max_depth: 0,
        anchor_count: 0,
        alias_count: 0,
        tagged_node_count: 0,
        block_scalar_count: 0,
        outline: Vec::new(),
        outline_truncated: false,
        diagnostics: vec![diagnostic],
    }
}

fn inspect_node(
    node: &MarkedYamlOwned,
    document_index: usize,
    path: &str,
    label: &str,
    depth: usize,
    counters: &mut AnalysisCounters,
    outline: &mut Vec<YamlOutlineEntry>,
    offsets: &[usize],
    editable_spans: &HashSet<(usize, usize)>,
    content: &str,
    editable_context: bool,
    key_tokens: &YamlTokens,
    field: Option<YamlField>,
) {
    counters.nodes = counters.nodes.saturating_add(1);
    counters.max_depth = counters.max_depth.max(depth);
    if counters.nodes > MAX_YAML_NODES || depth > MAX_YAML_DEPTH {
        counters.limit_exceeded = true;
        return;
    }

    let is_alias = key_tokens.aliases.contains(&(
        byte_offset(offsets, node.span.start.index()),
        byte_offset(offsets, node.span.end.index()),
    ));

    if outline.len() < MAX_YAML_OUTLINE_ENTRIES {
        let start = byte_offset(offsets, node.span.start.index());
        let end = byte_offset(offsets, node.span.end.index());
        let end = if node_kind(node) == "scalar" {
            scalar_end(content, start, end)
        } else {
            end
        };
        let literal = key_tokens.literals.contains(&(start, end));
        let editable = editable_context
            && node_kind(node) == "scalar"
            && (start < end || literal)
            && editable_spans.contains(&(start, end))
            && (!literal || literal::available(content, field.as_ref(), end));
        outline.push(YamlOutlineEntry {
            literal: literal && editable,
            field,
            document_index,
            path: path.to_string(),
            label: truncate(label),
            kind: if is_alias { "alias" } else { node_kind(node) }.into(),
            depth,
            child_count: if is_alias { 0 } else { child_count(node) },
            start,
            end,
            line: node.span.start.line().max(1),
            column: node.span.start.col().saturating_add(1),
            preview: if is_alias {
                content.get(start..end).map(truncate).unwrap_or_default()
            } else if matches!(
                &node.data,
                YamlDataOwned::Value(ScalarOwned::Integer(_) | ScalarOwned::FloatingPoint(_))
            ) {
                content
                    .get(start..end)
                    .map(truncate)
                    .unwrap_or_else(|| node_preview(node))
            } else {
                node_preview(node)
            },
            editable,
            edit_unavailable_reason: (!editable).then(|| {
                if !editable_context {
                    "复杂键、合并键或标签下的内容请在源码中修改，其他内容会保留".into()
                } else {
                    "锚点、别名、标签、多行值或没有原文字面量的空值请在源码中修改".into()
                }
            }),
        });
    }

    // Saphyr expands aliases into cloned values whose children retain the
    // anchor's original spans. They must not become editable duplicate fields.
    if is_alias {
        return;
    }

    match &node.data {
        YamlDataOwned::Mapping(mapping) => {
            let has_merge = mapping
                .keys()
                .any(|key| scalar_label(key).as_deref() == Some("<<"));
            for (index, (key, value)) in mapping.iter().enumerate() {
                let key_label =
                    scalar_label(key).unwrap_or_else(|| format!("复杂键 {}", index + 1));
                let child_path = mapping_path(path, &key_label);
                inspect_node(
                    value,
                    document_index,
                    &child_path,
                    &key_label,
                    depth + 1,
                    counters,
                    outline,
                    offsets,
                    editable_spans,
                    content,
                    editable_context
                        && !has_merge
                        && matches!(&key.data, YamlDataOwned::Value(ScalarOwned::String(_))),
                    key_tokens,
                    Some(field_info(
                        key,
                        content,
                        offsets,
                        key_tokens,
                        editable_context && !has_merge,
                    )),
                );
                if counters.limit_exceeded {
                    return;
                }
            }
        }
        YamlDataOwned::Sequence(items) => {
            for (index, item) in items.iter().enumerate() {
                inspect_node(
                    item,
                    document_index,
                    &format!("{path}[{index}]"),
                    &format!("[{index}]"),
                    depth + 1,
                    counters,
                    outline,
                    offsets,
                    editable_spans,
                    content,
                    editable_context,
                    key_tokens,
                    None,
                );
                if counters.limit_exceeded {
                    return;
                }
            }
        }
        YamlDataOwned::Tagged(_, inner) => inspect_node(
            inner,
            document_index,
            path,
            label,
            depth + 1,
            counters,
            outline,
            offsets,
            editable_spans,
            content,
            false,
            key_tokens,
            None,
        ),
        _ => {}
    }
}

fn inspect_events(
    content: &str,
    counters: &mut AnalysisCounters,
    offsets: &[usize],
) -> HashSet<(usize, usize)> {
    let mut editable = HashSet::new();
    let mut blocked = Vec::new();
    for event in Parser::new_from_str(parser_source(content)) {
        let Ok((event, span)) = event else {
            return editable;
        };
        match event {
            Event::Alias(_) => counters.aliases += 1,
            Event::Scalar(_, style, anchor, tag) => {
                let start = byte_offset(offsets, span.start.index());
                let end = byte_offset(offsets, span.end.index());
                let end = scalar_end(content, start, end);
                if anchor == 0
                    && tag.is_none()
                    && !blocked.last().copied().unwrap_or(false)
                    && matches!(
                        style,
                        ScalarStyle::Plain | ScalarStyle::SingleQuoted | ScalarStyle::DoubleQuoted | ScalarStyle::Literal
                    )
                    && content
                        .get(start..end)
                        .is_some_and(|raw| style == ScalarStyle::Literal || !raw.contains(['\r', '\n']))
                {
                    editable.insert((start, end));
                }
                if anchor > 0 {
                    counters.anchors += 1;
                }
                if tag.is_some() {
                    counters.tagged_nodes += 1;
                }
                if matches!(style, ScalarStyle::Literal | ScalarStyle::Folded) {
                    counters.block_scalars += 1;
                }
            }
            Event::SequenceStart(anchor, tag) | Event::MappingStart(anchor, tag) => {
                blocked
                    .push(blocked.last().copied().unwrap_or(false) || anchor > 0 || tag.is_some());
                if anchor > 0 {
                    counters.anchors += 1;
                }
                if tag.is_some() {
                    counters.tagged_nodes += 1;
                }
            }
            Event::SequenceEnd | Event::MappingEnd => {
                blocked.pop();
            }
            _ => {}
        }
    }
    editable
}

// Saphyr scanner positions count Unicode scalar values, not UTF-8 bytes.
// Convert once for the byte ranges shared by the native command and editors.
fn source_offsets(content: &str) -> Vec<usize> {
    // ASCII positions already are byte positions; avoid an 8-byte lookup entry
    // for every character in large ordinary configuration files.
    if content.is_ascii() {
        return vec![content.len()];
    }
    content
        .char_indices()
        .skip(usize::from(content.starts_with('\u{feff}')))
        .map(|(index, _)| index)
        .chain(std::iter::once(content.len()))
        .collect()
}
fn byte_offset(offsets: &[usize], index: usize) -> usize {
    if offsets.len() == 1 {
        return index.min(offsets[0]);
    }
    offsets
        .get(index)
        .copied()
        .unwrap_or_else(|| *offsets.last().unwrap_or(&0))
}

// Quoted scalar event ends may include following whitespace and comments.
// Locate the closing quote using YAML's quote/escape rules, starting only at
// the parser-proven scalar position; never search by field name or value.
fn scalar_end(content: &str, start: usize, fallback: usize) -> usize {
    let Some(raw) = content.get(start..) else {
        return fallback;
    };
    let mut chars = raw.char_indices().peekable();
    let Some((_, quote @ ('\'' | '"'))) = chars.next() else {
        return fallback;
    };
    while let Some((index, character)) = chars.next() {
        if quote == '"' && character == '\\' {
            chars.next();
            continue;
        }
        if character == quote {
            if quote == '\'' && chars.peek().is_some_and(|(_, next)| *next == '\'') {
                chars.next();
                continue;
            }
            return start + index + 1;
        }
    }
    fallback
}

pub fn replace_yaml_value_source(
    content: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<String, String> {
    let analysis = analyze_yaml_source(content);
    if !analysis.valid {
        return Err("YAML 语法存在错误，请先在源码中修复".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|entry| entry.start == start && entry.end == end && entry.kind == "scalar")
        .ok_or("字段位置已过期，请重新选择")?;
    if !entry.editable {
        return Err(entry
            .edit_unavailable_reason
            .clone()
            .unwrap_or_else(|| "当前内容请在源码中修改".into()));
    }
    if entry.literal { return literal::replace(content, entry, replacement); }
    let value = replacement.trim();
    if value.is_empty() || value.len() > MAX_YAML_SOURCE_BYTES || value.contains(['\r', '\n']) {
        return Err("请输入一个单行 YAML 值；空值可输入 null，空字符串可输入引号".into());
    }
    let literal = MarkedYamlOwned::load_from_str(value)
        .map_err(|_| "请输入合法的 YAML 字符串、布尔、数字或 null")?;
    let node = literal
        .first()
        .filter(|_| literal.len() == 1)
        .filter(|node| matches!(&node.data, YamlDataOwned::Value(_)))
        .ok_or("只修改一个简单值，请勿加入其他字段、列表、标签或锚点")?;
    let mut counters = AnalysisCounters::default();
    let literal_spans = inspect_events(value, &mut counters, &source_offsets(value));
    if !literal_spans.contains(&(0, value.len()))
        || counters.anchors + counters.aliases + counters.tagged_nodes > 0
    {
        return Err("只修改当前值，请勿加入注释、其他字段、标签或锚点".into());
    }
    let mut expected = MarkedYamlOwned::load_from_str(parser_source(content))
        .map_err(|_| "当前源码已变化，请重新选择")?;
    let offsets = source_offsets(content);
    let replaced = replace_value_node(&mut expected[0], content, &offsets, start, end, node)?;
    if replaced != 1 {
        return Err("字段位置无法唯一确认，请在源码中修改".into());
    }
    let candidate = format!("{}{value}{}", &content[..start], &content[end..]);
    let parsed = MarkedYamlOwned::load_from_str(parser_source(&candidate))
        .map_err(|_| "这个值在当前位置无效，当前草稿未变")?;
    if parsed != expected || !analyze_yaml_source(&candidate).valid {
        return Err("这个值会改变其他字段、列表结构或类型，请调整引号；当前草稿未变".into());
    }
    Ok(candidate)
}

fn replace_value_node(
    node: &mut MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    start: usize,
    end: usize,
    value: &MarkedYamlOwned,
) -> Result<usize, String> {
    if byte_offset(offsets, node.span.start.index()) == start
        && scalar_end(content, start, byte_offset(offsets, node.span.end.index())) == end
        && matches!(&node.data, YamlDataOwned::Value(_))
    {
        if matches!(&node.data, YamlDataOwned::Value(ScalarOwned::String(_)))
            && !matches!(&value.data, YamlDataOwned::Value(ScalarOwned::String(_)))
        {
            return Err(
                "当前字段是字符串，请用引号保留字符串类型；需要改变类型时可在源码中修改".into(),
            );
        }
        node.data = value.data.clone();
        return Ok(1);
    }
    let mut count = 0;
    match &mut node.data {
        YamlDataOwned::Mapping(mapping) => {
            for child in mapping.values_mut() {
                count += replace_value_node(child, content, offsets, start, end, value)?;
            }
        }
        YamlDataOwned::Sequence(items) => {
            for child in items {
                count += replace_value_node(child, content, offsets, start, end, value)?;
            }
        }
        _ => {}
    }
    Ok(count)
}

// Intersect parser scalar tokens with AST mapping keys. A value span is never
// used as a key span, and aliases/anchors/tags cannot masquerade as key text.
fn key_tokens(content: &str, offsets: &[usize]) -> YamlTokens {
    let mut tokens = YamlTokens::default();
    for event in Parser::new_from_str(parser_source(content)) {
        if let Ok((Event::Alias(_), span)) = &event {
            tokens.aliases.insert((
                byte_offset(offsets, span.start.index()),
                byte_offset(offsets, span.end.index()),
            ));
        }
        if let Ok((Event::Scalar(_, style, 0, None), span)) = event {
            let start = byte_offset(offsets, span.start.index());
            let end = scalar_end(content, start, byte_offset(offsets, span.end.index()));
            if style == ScalarStyle::Literal { tokens.literals.insert((start, end)); }
            if matches!(
                style,
                ScalarStyle::Plain | ScalarStyle::SingleQuoted | ScalarStyle::DoubleQuoted
            ) && start < end
                && content
                    .get(start..end)
                    .is_some_and(|raw| !raw.contains(['\r', '\n']))
            {
                tokens.scalars.insert((start, end), style);
            }
        }
    }
    tokens
}

fn field_info(
    key: &MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    tokens: &YamlTokens,
    ordinary_context: bool,
) -> YamlField {
    let start = byte_offset(offsets, key.span.start.index());
    let end = scalar_end(content, start, byte_offset(offsets, key.span.end.index()));
    let name = scalar_label(key).unwrap_or_else(|| "复杂键".into());
    let supported = ordinary_context
        && name != "<<"
        && matches!(&key.data, YamlDataOwned::Value(ScalarOwned::String(_)))
        && tokens.scalars.contains_key(&(start, end));
    YamlField {
        name,
        start,
        end,
        rename_unavailable_reason: (!supported).then(|| {
            "此字段包含复杂键、合并键、锚点、标签或非字符串键，请在源码中重命名；输入会保留".into()
        }),
    }
}

fn string_key_literal(name: &str, style: ScalarStyle) -> String {
    if style == ScalarStyle::SingleQuoted && !name.chars().any(char::is_control) {
        return format!("'{}'", name.replace('\'', "''"));
    }
    if style == ScalarStyle::Plain && !name.chars().any(char::is_control) {
        // Confirm both block and flow contexts, including implicit key types.
        let plain = [format!("{name}: 0\n"), format!("{{{name}: 0}}")]
            .iter()
            .all(|source| {
                let Ok(docs) = MarkedYamlOwned::load_from_str(source) else {
                    return false;
                };
                let Some(doc) = docs.first().filter(|_| docs.len() == 1) else {
                    return false;
                };
                let YamlDataOwned::Mapping(mapping) = &doc.data else {
                    return false;
                };
                mapping.len() == 1
                    && mapping.keys().all(|key| {
                        matches!(&key.data,
                YamlDataOwned::Value(ScalarOwned::String(value)) if value == name)
                    })
            });
        if plain {
            return name.into();
        }
    }
    // JSON double quoted strings are also YAML strings; no implicit conversion.
    serde_json::to_string(name).expect("string encoding")
}

pub fn rename_yaml_key_source(
    content: &str,
    start: usize,
    end: usize,
    name: &str,
) -> Result<YamlKeyChange, String> {
    let analysis = analyze_yaml_source(content);
    if !analysis.valid {
        return Err("YAML 语法存在错误，请先在源码中修复；当前草稿未变".into());
    }
    if has_duplicate_string_keys(content) {
        return Err("YAML 中存在同级重复字段，请先在源码中整理；当前输入与草稿仍保留".into());
    }
    let field = analysis
        .outline
        .iter()
        .filter_map(|entry| entry.field.as_ref())
        .find(|field| field.start == start && field.end == end)
        .ok_or("字段位置已过期，请重新选择")?;
    if let Some(reason) = &field.rename_unavailable_reason {
        return Err(reason.clone());
    }
    if name.is_empty() || name.len() > 4096 || name.contains(['\r', '\n']) || name == "<<" {
        return Err("请输入单行字段名（最多 4096 字节）；合并键 << 请在源码中修改".into());
    }
    let offsets = source_offsets(content);
    let tokens = key_tokens(content, &offsets);
    let style = *tokens
        .scalars
        .get(&(start, end))
        .ok_or("无法确认字段原文，请在源码中修改")?;
    let literal = string_key_literal(name, style);
    let mut expected = MarkedYamlOwned::load_from_str(parser_source(content))
        .map_err(|_| "当前源码已变化，请重新选择")?;
    let changed = rename_key_node(&mut expected[0], content, &offsets, start, end, name)?;
    // Expanded alias copies share their anchor's key span. Update those only
    // in the expected semantic tree; the actual edit is one proven key token.
    if changed == 0 {
        return Err("字段归属无法唯一确认，请在源码中修改；当前草稿未变".into());
    }
    let candidate = format!("{}{literal}{}", &content[..start], &content[end..]);
    let parsed = MarkedYamlOwned::load_from_str(parser_source(&candidate))
        .map_err(|_| "新名称在此处无法表示，请调整输入；当前草稿未变")?;
    if parsed != expected || !analyze_yaml_source(&candidate).valid {
        return Err("新名称会改变其他字段、类型或结构，请在源码中修改；当前草稿未变".into());
    }
    Ok(YamlKeyChange {
        value_type: None,
        content: candidate,
        start,
        end: start + literal.len(),
    })
}

fn has_duplicate_string_keys(content: &str) -> bool {
    // The loader retains the last duplicate. Track keys in parser events before
    // that loss, including mappings nested in flow collections or sequences.
    let mut stack: Vec<Option<(bool, HashSet<String>)>> = Vec::new();
    for event in Parser::new_from_str(parser_source(content)) {
        let Ok((event, _)) = event else { return true };
        match event {
            Event::MappingEnd | Event::SequenceEnd => {
                stack.pop();
            }
            Event::Scalar(_, _, _, _)
            | Event::Alias(_)
            | Event::MappingStart(_, _)
            | Event::SequenceStart(_, _) => {
                if let Some(Some((is_key, seen))) = stack.last_mut() {
                    if *is_key {
                        if let Event::Scalar(value, style, _, _) = &event {
                            let string = *style != ScalarStyle::Plain
                                || MarkedYamlOwned::load_from_str(value).is_ok_and(|docs| {
                                    docs.len() == 1
                                        && matches!(
                                            &docs[0].data,
                                            YamlDataOwned::Value(ScalarOwned::String(_))
                                        )
                                });
                            if string && !seen.insert(value.to_string()) {
                                return true;
                            }
                        }
                    }
                    *is_key = !*is_key;
                }
                match event {
                    Event::MappingStart(_, _) => stack.push(Some((true, HashSet::new()))),
                    Event::SequenceStart(_, _) => stack.push(None),
                    _ => {}
                }
            }
            _ => {}
        }
    }
    false
}

fn rename_key_node(
    node: &mut MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    start: usize,
    end: usize,
    name: &str,
) -> Result<usize, String> {
    let mut count = 0;
    match &mut node.data {
        YamlDataOwned::Mapping(mapping) => {
            let target = mapping.keys().any(|key| {
                byte_offset(offsets, key.span.start.index()) == start
                    && scalar_end(content, start, byte_offset(offsets, key.span.end.index())) == end
            });
            if target && mapping.keys().any(|key| matches!(&key.data, YamlDataOwned::Value(ScalarOwned::String(value)) if value == name)
                && byte_offset(offsets,key.span.start.index()) != start) {
                return Err("同一层级已有这个字段名，请换一个名称；当前草稿未变".into());
            }
            let original = std::mem::take(mapping);
            for (mut key, mut value) in original {
                if byte_offset(offsets, key.span.start.index()) == start
                    && scalar_end(content, start, byte_offset(offsets, key.span.end.index())) == end
                {
                    key.data = YamlDataOwned::Value(ScalarOwned::String(name.into()));
                    count += 1;
                }
                count += rename_key_node(&mut value, content, offsets, start, end, name)?;
                mapping.insert(key, value);
            }
        }
        YamlDataOwned::Sequence(items) => {
            for item in items {
                count += rename_key_node(item, content, offsets, start, end, name)?;
            }
        }
        _ => {}
    }
    Ok(count)
}

fn node_kind(node: &MarkedYamlOwned) -> &'static str {
    match &node.data {
        YamlDataOwned::Mapping(_) => "mapping",
        YamlDataOwned::Sequence(_) => "sequence",
        YamlDataOwned::Tagged(_, _) => "tagged",
        YamlDataOwned::Alias(_) => "alias",
        YamlDataOwned::Representation(_, _, _) | YamlDataOwned::Value(_) => "scalar",
        YamlDataOwned::BadValue => "invalid",
    }
}

fn child_count(node: &MarkedYamlOwned) -> usize {
    match &node.data {
        YamlDataOwned::Mapping(mapping) => mapping.len(),
        YamlDataOwned::Sequence(items) => items.len(),
        YamlDataOwned::Tagged(_, _) => 1,
        _ => 0,
    }
}

fn scalar_label(node: &MarkedYamlOwned) -> Option<String> {
    match &node.data {
        YamlDataOwned::Representation(value, _, _) => Some(value.clone()),
        YamlDataOwned::Value(value) => Some(scalar_preview(value)),
        YamlDataOwned::Tagged(_, inner) => scalar_label(inner),
        _ => None,
    }
}

fn scalar_preview(value: &ScalarOwned) -> String {
    match value {
        ScalarOwned::Null => "null".into(),
        ScalarOwned::Boolean(value) => value.to_string(),
        ScalarOwned::Integer(value) => value.to_string(),
        ScalarOwned::FloatingPoint(value) => value.to_string(),
        ScalarOwned::String(value) => value.clone(),
    }
}

fn node_preview(node: &MarkedYamlOwned) -> String {
    match &node.data {
        YamlDataOwned::Representation(value, _, tag) => tag.as_ref().map_or_else(
            || truncate(value),
            |tag| truncate(&format!("{}{} {value}", tag.handle, tag.suffix)),
        ),
        YamlDataOwned::Value(value) => truncate(&scalar_preview(value)),
        YamlDataOwned::Sequence(items) => format!("{} 项", items.len()),
        YamlDataOwned::Mapping(mapping) => format!("{} 个键", mapping.len()),
        YamlDataOwned::Tagged(tag, inner) => truncate(&format!(
            "{}{} {}",
            tag.handle,
            tag.suffix,
            node_preview(inner)
        )),
        YamlDataOwned::Alias(id) => format!("别名 #{id}"),
        YamlDataOwned::BadValue => "无效值".into(),
    }
}

fn mapping_path(parent: &str, key: &str) -> String {
    if is_identifier(key) {
        format!("{parent}.{key}")
    } else {
        format!(
            "{parent}[{}]",
            serde_json::to_string(key).expect("string encoding")
        )
    }
}

fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first == '_' || first.is_alphabetic())
        && chars.all(|character| character == '_' || character.is_alphanumeric())
}

fn truncate(value: &str) -> String {
    let mut output = value
        .chars()
        .take(MAX_YAML_PREVIEW_CHARS)
        .collect::<String>();
    if value.chars().count() > MAX_YAML_PREVIEW_CHARS {
        output.push('…');
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rename(source: &str, path: &str, name: &str) -> Result<YamlKeyChange, String> {
        let analysis = analyze_yaml_source(source);
        assert!(analysis.valid, "{:?}", analysis.diagnostics);
        let field = analysis
            .outline
            .iter()
            .find(|entry| entry.path == path)
            .unwrap()
            .field
            .as_ref()
            .unwrap();
        rename_yaml_key_source(source, field.start, field.end, name)
    }

    #[test]
    fn key_rename_keeps_bom_crlf_unicode_comments_anchors_and_raw_numbers() {
        let source = "\u{feff}# 中文😀\r\ndefaults: &base {keep: 0xFF}\r\nuse: *base\r\nroot:\r\n  old: 9007199254740993123456789 # old\r\n";
        let changed = rename(source, "$.root.old", "字段😀").unwrap();
        assert_eq!(changed.content, source.replace("old:", "字段😀:"));
        assert_eq!(&changed.content[changed.start..changed.end], "字段😀");
        let anchored = rename(&changed.content, "$.defaults.keep", "留下").unwrap();
        assert_eq!(anchored.content, changed.content.replace("keep:", "留下:"));
        assert_eq!(analyze_yaml_source(&anchored.content).alias_count, 1);
        let analysis = analyze_yaml_source(&anchored.content);
        assert!(analysis
            .outline
            .iter()
            .any(|e| e.path == "$.use" && e.kind == "alias" && e.preview == "*base"));
        assert!(!analysis
            .outline
            .iter()
            .any(|e| e.path.starts_with("$.use.")));
    }

    #[test]
    fn key_rename_supports_mapping_sequence_alias_values_and_consecutive_paths() {
        let source =
            "base: &a hi\nold: {item: [1, 2]}\nref: *a\nlist: [{old: value}, {old: other}]\n";
        let a = rename(source, "$.old", "new").unwrap();
        let b = rename(&a.content, "$.new.item", "children").unwrap();
        let c = rename(&b.content, "$.list[1].old", "next").unwrap();
        let d = rename(&c.content, "$.ref", "reference").unwrap();
        assert_eq!(d.content,"base: &a hi\nnew: {children: [1, 2]}\nreference: *a\nlist: [{old: value}, {next: other}]\n");
    }

    #[test]
    fn key_rename_preserves_quotes_and_escapes_string_names() {
        let source = "'old': 1\n\"quoted\": 2\nplain: 3\n";
        assert_eq!(
            rename(source, "$.old", "it's new").unwrap().content,
            source.replace("'old'", "'it''s new'")
        );
        assert_eq!(
            rename(source, "$.quoted", "中\"文").unwrap().content,
            source.replace("\"quoted\"", "\"中\\\"文\"")
        );
        for name in [
            "true", "null", "123", "0xFF", "[a]", "a: b", " a ", "a,b", "#comment", "*alias",
            "a\tb",
        ] {
            let result = rename(source, "$.plain", name).unwrap();
            assert_eq!(
                analyze_yaml_source(&result.content)
                    .outline
                    .last()
                    .unwrap()
                    .field
                    .as_ref()
                    .unwrap()
                    .name,
                name
            );
            assert!(result
                .content
                .contains(&format!("{}: 3", serde_json::to_string(name).unwrap())));
        }
    }

    #[test]
    fn key_rename_rejects_sibling_duplicates_even_when_loader_discards_them() {
        for source in ["old: 1\nother: 2\n", "{old: 1, other: 2}"] {
            assert!(rename(source, "$.old", "other")
                .unwrap_err()
                .contains("同一层级"));
            assert_eq!(rename(source, "$.old", "old").unwrap().content, source);
        }
        for source in [
            "old: 1\nold: 2\n",
            "{old: 1, 'old': 2}",
            "x: [{old: 1, old: 2}]\nother: 3\n",
        ] {
            let path = if source.starts_with("x:") {
                "$.other"
            } else {
                "$.old"
            };
            assert!(rename(source, path, "new")
                .unwrap_err()
                .contains("重复字段"));
        }
        assert!(rename("a: {old: 1}\nb: {old: 2}\n", "$.a.old", "new").is_ok());
    }

    #[test]
    fn key_rename_rejects_nonstring_merge_alias_tagged_multiline_and_multiple_documents() {
        for (source, path) in [
            ("true: value\n", "$.true"),
            ("'<<': value\n", "$[\"<<\"]"),
            ("&k old: value\n", "$.old"),
            ("!!str old: value\n", "$.old"),
            ("? [a,b]\n: v\n", "$[\"复杂键 1\"]"),
            ("old: 1\n---\nother: 2\n", "$.old"),
            ("? 'old\n  name'\n: 1\n", "$[\"old name\"]"),
        ] {
            assert!(rename(source, path, "new").is_err(), "{source}");
        }
        let source = "base: &b {a: 1}\nmerged: {<<: *b, old: 2}\n";
        assert!(rename(source, "$.merged.old", "new").is_err());
    }

    #[test]
    fn key_rename_rejects_stale_value_ranges_and_invalid_input() {
        let source = "old: value\n";
        assert!(rename_yaml_key_source(source, 5, 10, "new").is_err());
        for name in ["", "<<", "new\nfield", "new\rfield"] {
            assert!(rename(source, "$.old", name).is_err());
        }
        assert!(rename(source, "$.old", &"a".repeat(4097)).is_err());
        assert!(rename_yaml_key_source("[broken", 0, 1, "new").is_err());
    }

    #[test]
    fn yaml_numeric_outline_keeps_original_digits_and_notation() {
        let source = "# 中文😀\nlarge: 9007199254740993123456789\nnegative: -9007199254740993123456789\nprecise: 1.234567890123456789e100\nhex: 0xFF\nquoted: '9007199254740993123456789'\n";
        let analysis = analyze_yaml_source(source);
        assert!(analysis.valid);
        for (path, expected) in [
            ("$.large", "9007199254740993123456789"),
            ("$.negative", "-9007199254740993123456789"),
            ("$.precise", "1.234567890123456789e100"),
            ("$.hex", "0xFF"),
            ("$.quoted", "9007199254740993123456789"),
        ] {
            assert_eq!(
                analysis
                    .outline
                    .iter()
                    .find(|e| e.path == path)
                    .unwrap()
                    .preview,
                expected
            );
        }
    }

    fn entry(source: &str, path: &str) -> YamlOutlineEntry {
        analyze_yaml_source(source)
            .outline
            .into_iter()
            .find(|entry| entry.path == path)
            .expect(path)
    }
    fn edit(source: &str, path: &str, value: &str) -> Result<String, String> {
        let entry = entry(source, path);
        replace_yaml_value_source(source, entry.start, entry.end, value)
    }

    #[test]
    fn yaml_edits_unicode_exact_byte_ranges_and_preserves_crlf_comments() {
        let source = "# 我的草稿\r\n配置:\r\n  标题: '中文😀' # 保留\r\n  数量: 12345678901234567890123456789\r\n";
        let selected = entry(source, "$.配置.标题");
        assert!(selected.editable);
        assert_eq!(&source[selected.start..selected.end], "'中文😀'");
        assert_eq!(selected.line, 3);
        assert_eq!(
            edit(source, "$.配置.标题", "\"更新😀\"").unwrap(),
            source.replace("'中文😀'", "\"更新😀\"")
        );
        for literal in ["'it''s 中文😀'", "\"escaped \\\"中文😀\\\"\""] {
            let source = format!("value: {literal} # 原注释\nnext: keep\n");
            let selected = entry(&source, "$.value");
            assert_eq!(&source[selected.start..selected.end], literal);
            assert_eq!(
                edit(&source, "$.value", "'changed'").unwrap(),
                source.replacen(literal, "'changed'", 1)
            );
        }
    }

    #[test]
    fn yaml_edits_nested_same_names_quoted_keys_and_sequence_items() {
        let source = "a:\n  port: 8080\nb:\n  port: 8080\n'a.b': literal\nrows:\n  - name: first\n  - name: second\n";
        assert_eq!(
            edit(source, "$.b.port", "9090").unwrap(),
            source.replace("b:\n  port: 8080", "b:\n  port: 9090")
        );
        assert_eq!(
            edit(source, "$[\"a.b\"]", "changed").unwrap(),
            source.replace("literal", "changed")
        );
        assert_eq!(
            edit(source, "$.rows[1].name", "'changed'").unwrap(),
            source.replace("second", "'changed'")
        );
    }

    #[test]
    fn yaml_simple_literals_preserve_string_type_and_allow_null_values() {
        let source = "text: 'true'\nflag: true\nnumber: 123\nempty: null\n";
        assert!(edit(source, "$.text", "false")
            .unwrap_err()
            .contains("字符串"));
        assert_eq!(
            edit(source, "$.text", "\"false\"").unwrap(),
            source.replace("'true'", "\"false\"")
        );
        for value in [
            "false",
            "~",
            "null",
            "1.25",
            "0xFF",
            "'新值'",
            "\"\\u4e2d\"",
        ] {
            assert!(edit(source, "$.empty", value).is_ok(), "{value}");
        }
        assert_eq!(
            edit(source, "$.number", "1.25").unwrap(),
            source.replace("123", "1.25")
        );
    }

    #[test]
    fn yaml_value_input_cannot_add_fields_comments_documents_or_collections() {
        let source = "value: 1 # 原注释\nother: untouched\n";
        for value in [
            "",
            "2\nother: changed",
            "2 # new comment",
            "{x: 2}",
            "[2,3]",
            "--- 2",
            "&a 2",
            "!!int 2",
            "*missing",
            "'unterminated",
        ] {
            assert!(edit(source, "$.value", value).is_err(), "{value}");
        }
    }

    #[test]
    fn yaml_flow_context_rejects_value_that_changes_neighbouring_structure() {
        let source = "items: [one, two, three]\nmap: {left: first, right: second}\n";
        assert!(edit(source, "$.items[1]", "new, item").is_err());
        assert!(edit(source, "$.map.left", "new, injected: value").is_err());
        assert_eq!(
            edit(source, "$.items[1]", "'new, item'").unwrap(),
            source.replace("two", "'new, item'")
        );
        assert_eq!(
            edit(source, "$.map.left", "changed").unwrap(),
            source.replace("first", "changed")
        );
    }

    #[test]
    fn yaml_unsupported_nodes_keep_source_fallback_without_blocking_unrelated_values() {
        let source = "base: &base\n  title: anchored\ncopy: *base\ntagged: !custom value\nblock: |\n  multiline\nquoted: 'first\n  second'\nmerged:\n  <<: *base\n  title: override\nplain: safe\n";
        assert!(analyze_yaml_source(source).valid);
        for path in [
            "$.base.title",
            "$.tagged",
            "$.quoted",
            "$.merged.title",
        ] {
            let e = entry(source, path);
            assert!(!e.editable, "{path}");
            assert!(e.edit_unavailable_reason.is_some());
            assert!(replace_yaml_value_source(source, e.start, e.end, "changed").is_err());
        }
        assert_eq!(
            edit(source, "$.plain", "changed").unwrap(),
            source.replace("plain: safe", "plain: changed")
        );
        let multi = "value: 1\n---\nvalue: 2\n";
        assert!(analyze_yaml_source(multi)
            .outline
            .iter()
            .all(|e| !e.editable));
    }

    #[test]
    fn yaml_complex_key_descendants_and_implicit_empty_values_are_not_editable() {
        let source = "? [a, b]\n: value\nempty:\nnext: normal\n";
        let analysis = analyze_yaml_source(source);
        assert!(analysis.valid);
        assert!(!entry(source, "$.empty").editable);
        assert!(analysis
            .outline
            .iter()
            .filter(|e| e.label.starts_with("复杂键"))
            .all(|e| !e.editable));
        assert_eq!(
            edit(source, "$.next", "changed").unwrap(),
            source.replace("normal", "changed")
        );
    }

    #[test]
    fn yaml_long_key_paths_stay_distinct_and_stale_ranges_are_refused() {
        let key = "长".repeat(150);
        let source = format!("'{key}甲': one\n'{key}乙': two\n");
        let path = format!("$.{key}乙");
        assert_eq!(
            edit(&source, &path, "changed").unwrap(),
            source.replace("two", "changed")
        );
        assert!(replace_yaml_value_source(&source, 1, 2, "changed").is_err());
        assert!(replace_yaml_value_source("value: [broken", 0, 1, "changed").is_err());
    }

    #[test]
    fn analyzes_multidocument_yaml_with_positions_and_paths() {
        let source = "service:\n  name: LongEdit\n  ports: [80, 443]\n---\nenabled: true\n";
        let analysis = analyze_yaml_source(source);
        assert!(analysis.valid);
        assert_eq!(analysis.document_count, 2);
        assert!(analysis.node_count >= 7);
        assert!(analysis
            .outline
            .iter()
            .any(|entry| entry.path == "$.service.ports[1]" && entry.line == 3));
    }

    #[test]
    fn preserves_yaml_specific_constructs_in_analysis() {
        let source = include_str!("../../tests/fixtures/formats/yaml-valid.yaml");
        let analysis = analyze_yaml_source(source);
        assert!(analysis.valid);
        assert!(analysis.anchor_count >= 1);
        assert!(analysis.alias_count >= 1);
        assert!(analysis.tagged_node_count >= 1);
        assert!(analysis.block_scalar_count >= 1);
    }

    #[test]
    fn reports_syntax_error_with_stable_location() {
        let analysis = analyze_yaml_source(include_str!(
            "../../tests/fixtures/formats/yaml-invalid.yaml"
        ));
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "syntax-error");
        assert!(analysis.diagnostics[0].line >= 2);
    }

    #[test]
    fn rejects_oversized_source_before_parsing() {
        let source = "x".repeat(MAX_YAML_SOURCE_BYTES + 1);
        let analysis = analyze_yaml_source(&source);
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "source-too-large");
    }
}

#[cfg(test)]
#[path = "yaml_field_order_tests.rs"]
mod field_order_tests;
