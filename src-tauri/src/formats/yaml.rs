use saphyr::{LoadableYamlNode, MarkedYamlOwned, ScalarOwned, YamlDataOwned};
use saphyr_parser::{Event, Parser, ScalarStyle};
use serde::Serialize;

const MAX_YAML_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_YAML_NODES: usize = 100_000;
const MAX_YAML_OUTLINE_ENTRIES: usize = 20_000;
const MAX_YAML_DEPTH: usize = 128;
const MAX_YAML_PREVIEW_CHARS: usize = 120;

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

    let documents = match MarkedYamlOwned::load_from_str(content) {
        Ok(documents) => documents,
        Err(error) => {
            let marker = error.marker();
            return failed_analysis(YamlDiagnostic {
                severity: "error".into(),
                code: "syntax-error".into(),
                message: error.info().to_string(),
                start: marker.index(),
                end: marker.index(),
                line: marker.line().max(1),
                column: marker.col().saturating_add(1),
                path: None,
            });
        }
    };

    let mut counters = AnalysisCounters::default();
    inspect_events(content, &mut counters);
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
        );
        if counters.limit_exceeded {
            break;
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
) {
    counters.nodes = counters.nodes.saturating_add(1);
    counters.max_depth = counters.max_depth.max(depth);
    if counters.nodes > MAX_YAML_NODES || depth > MAX_YAML_DEPTH {
        counters.limit_exceeded = true;
        return;
    }

    if outline.len() < MAX_YAML_OUTLINE_ENTRIES {
        outline.push(YamlOutlineEntry {
            document_index,
            path: path.to_string(),
            label: truncate(label),
            kind: node_kind(node).into(),
            depth,
            child_count: child_count(node),
            start: node.span.start.index(),
            end: node.span.end.index(),
            line: node.span.start.line().max(1),
            column: node.span.start.col().saturating_add(1),
            preview: node_preview(node),
        });
    }

    match &node.data {
        YamlDataOwned::Mapping(mapping) => {
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
        ),
        _ => {}
    }
}

fn inspect_events(content: &str, counters: &mut AnalysisCounters) {
    for event in Parser::new_from_str(content) {
        let Ok((event, _)) = event else {
            return;
        };
        match event {
            Event::Alias(_) => counters.aliases += 1,
            Event::Scalar(_, style, anchor, tag) => {
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
                if anchor > 0 {
                    counters.anchors += 1;
                }
                if tag.is_some() {
                    counters.tagged_nodes += 1;
                }
            }
            _ => {}
        }
    }
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
        YamlDataOwned::Representation(value, _, _) => Some(truncate(value)),
        YamlDataOwned::Value(value) => Some(truncate(&scalar_preview(value))),
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
        let escaped = key.replace('\\', "\\\\").replace('"', "\\\"");
        format!("{parent}[\"{escaped}\"]")
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
