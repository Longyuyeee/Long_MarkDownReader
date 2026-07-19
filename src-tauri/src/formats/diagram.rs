use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::LazyLock;

pub(crate) const MAX_DIAGRAM_BYTES: usize = 2 * 1024 * 1024;

static NODE_DEFINITION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)([A-Za-z_][A-Za-z0-9_-]*)\s*(\(\(|\[\[|\{\{|\[|\(|\{)([^\r\n]*?)(\)\)|\]\]|\}\}|\]|\)|\})").unwrap()
});
static EDGE_DEFINITION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\s*(?:\(\([^\r\n]*?\)\)|\[\[[^\r\n]*?\]\]|\{\{[^\r\n]*?\}\}|\[[^\r\n]*?\]|\([^\r\n]*?\)|\{[^\r\n]*?\}))?\s*(-->|-\.->|==>)\s*(?:\|([^|\r\n]*)\|\s*)?([A-Za-z_][A-Za-z0-9_-]*)").unwrap()
});

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagramStructure {
    pub supported: bool,
    pub diagram_type: String,
    pub nodes: Vec<DiagramNode>,
    pub edges: Vec<DiagramEdge>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagramNode {
    pub id: String,
    pub label: String,
    pub shape: String,
    pub line: usize,
    pub editable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagramEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
    pub arrow: String,
    pub line: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagramElementEdit {
    pub kind: String,
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub shape: Option<String>,
}

fn line_number(source: &str, byte: usize) -> usize {
    source[..byte]
        .bytes()
        .filter(|value| *value == b'\n')
        .count()
        + 1
}

fn shape_for(open: &str, close: &str) -> Option<&'static str> {
    match (open, close) {
        ("[", "]") => Some("rectangle"),
        ("(", ")") => Some("rounded"),
        ("{", "}") => Some("diamond"),
        ("((", "))") => Some("circle"),
        ("[[", "]]") => Some("subroutine"),
        ("{{", "}}") => Some("hexagon"),
        _ => None,
    }
}

fn delimiters(shape: &str) -> Option<(&'static str, &'static str)> {
    match shape {
        "rectangle" => Some(("[", "]")),
        "rounded" => Some(("(", ")")),
        "diamond" => Some(("{", "}")),
        "circle" => Some(("((", "))")),
        "subroutine" => Some(("[[", "]]")),
        "hexagon" => Some(("{{", "}}")),
        _ => None,
    }
}

fn diagram_declaration(source: &str) -> Option<&str> {
    let mut frontmatter = false;
    let mut first_content_seen = false;
    for line in source.lines().map(str::trim) {
        if line.is_empty() {
            continue;
        }
        if !first_content_seen && line == "---" {
            first_content_seen = true;
            frontmatter = true;
            continue;
        }
        first_content_seen = true;
        if frontmatter {
            if line == "---" {
                frontmatter = false;
            }
            continue;
        }
        if !line.starts_with("%%") {
            return Some(line);
        }
    }
    None
}

fn is_flowchart(source: &str) -> bool {
    diagram_declaration(source)
        .is_some_and(|line| line.starts_with("flowchart ") || line.starts_with("graph "))
}

pub(crate) fn analyze_mermaid_structure(source: &str) -> DiagramStructure {
    let supported = is_flowchart(source);
    if !supported {
        return DiagramStructure {
            supported: false,
            diagram_type: diagram_declaration(source)
                .unwrap_or("")
                .split_whitespace()
                .next()
                .unwrap_or("unknown")
                .into(),
            nodes: Vec::new(),
            edges: Vec::new(),
            warnings: vec![
                "结构化表单当前仅支持 flowchart / graph；源码与预览仍可正常使用。".into(),
            ],
        };
    }

    let mut nodes = BTreeMap::<String, DiagramNode>::new();
    for capture in NODE_DEFINITION.captures_iter(source) {
        let (Some(full), Some(id), Some(open), Some(label), Some(close)) = (
            capture.get(0),
            capture.get(1),
            capture.get(2),
            capture.get(3),
            capture.get(4),
        ) else {
            continue;
        };
        let Some(shape) = shape_for(open.as_str(), close.as_str()) else {
            continue;
        };
        nodes
            .entry(id.as_str().into())
            .or_insert_with(|| DiagramNode {
                id: id.as_str().into(),
                label: label.as_str().trim().into(),
                shape: shape.into(),
                line: line_number(source, full.start()),
                editable: true,
            });
    }

    let mut edges = Vec::new();
    for capture in EDGE_DEFINITION.captures_iter(source) {
        let (Some(full), Some(from), Some(arrow), Some(to)) = (
            capture.get(0),
            capture.get(1),
            capture.get(2),
            capture.get(4),
        ) else {
            continue;
        };
        let line = line_number(source, full.start());
        for id in [from.as_str(), to.as_str()] {
            nodes.entry(id.into()).or_insert_with(|| DiagramNode {
                id: id.into(),
                label: id.into(),
                shape: "implicit".into(),
                line,
                editable: false,
            });
        }
        edges.push(DiagramEdge {
            id: format!("{}-{}-{}", from.as_str(), to.as_str(), line),
            source: from.as_str().into(),
            target: to.as_str().into(),
            label: capture
                .get(3)
                .map(|value| value.as_str().trim())
                .unwrap_or("")
                .into(),
            arrow: arrow.as_str().into(),
            line,
        });
    }
    let mut warnings = Vec::new();
    if source.lines().any(|line| line.matches("-->").count() > 1) {
        warnings.push("一行包含多段链式连线时，结构面板只编辑第一段；源码不会被改写。".into());
    }
    DiagramStructure {
        supported: true,
        diagram_type: "flowchart".into(),
        nodes: nodes.into_values().collect(),
        edges,
        warnings,
    }
}

fn replace_ranges(source: &str, mut replacements: Vec<(usize, usize, String)>) -> String {
    replacements.sort_by_key(|item| std::cmp::Reverse(item.0));
    let mut output = source.to_string();
    for (start, end, value) in replacements {
        output.replace_range(start..end, &value);
    }
    output
}

pub(crate) fn update_mermaid_element(
    source: &str,
    edit: &DiagramElementEdit,
) -> Result<String, String> {
    validate_mermaid_source(source)?;
    if !is_flowchart(source) {
        return Err("结构化编辑当前仅支持 flowchart / graph".into());
    }
    if edit
        .label
        .chars()
        .any(|value| matches!(value, '\r' | '\n' | '|'))
        || edit.label.chars().count() > 500
    {
        return Err("标签不能包含换行或竖线，且不能超过 500 个字符".into());
    }
    if edit.kind == "node" {
        for capture in NODE_DEFINITION.captures_iter(source) {
            let (Some(id), Some(open), Some(label), Some(close)) = (
                capture.get(1),
                capture.get(2),
                capture.get(3),
                capture.get(4),
            ) else {
                continue;
            };
            if id.as_str() != edit.id || shape_for(open.as_str(), close.as_str()).is_none() {
                continue;
            }
            let shape = edit
                .shape
                .as_deref()
                .unwrap_or_else(|| shape_for(open.as_str(), close.as_str()).unwrap());
            let (next_open, next_close) = delimiters(shape).ok_or("节点形状不受支持")?;
            return Ok(replace_ranges(
                source,
                vec![
                    (open.start(), open.end(), next_open.into()),
                    (label.start(), label.end(), edit.label.clone()),
                    (close.start(), close.end(), next_close.into()),
                ],
            ));
        }
        return Err("未找到可编辑的节点定义；请先在源码中为节点添加标签和形状".into());
    }
    if edit.kind == "edge" {
        for capture in EDGE_DEFINITION.captures_iter(source) {
            let (Some(full), Some(from), Some(arrow), Some(to)) = (
                capture.get(0),
                capture.get(1),
                capture.get(2),
                capture.get(4),
            ) else {
                continue;
            };
            let id = format!(
                "{}-{}-{}",
                from.as_str(),
                to.as_str(),
                line_number(source, full.start())
            );
            if id != edit.id {
                continue;
            }
            if let Some(label) = capture.get(3) {
                return Ok(replace_ranges(
                    source,
                    vec![(label.start(), label.end(), edit.label.clone())],
                ));
            }
            if edit.label.is_empty() {
                return Ok(source.into());
            }
            return Ok(replace_ranges(
                source,
                vec![(arrow.end(), arrow.end(), format!("|{}|", edit.label))],
            ));
        }
        return Err("未找到可编辑的连线".into());
    }
    Err("结构化编辑类型无效".into())
}

pub(crate) fn validate_mermaid_source(source: &str) -> Result<(), String> {
    if source.len() > MAX_DIAGRAM_BYTES {
        return Err("Mermaid 源码不能超过 2 MB".into());
    }
    if source.contains('\0') {
        return Err("Mermaid 源码不能包含空字符".into());
    }
    if source.trim().is_empty() {
        return Err("Mermaid 源码不能为空".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_null_and_oversized_sources() {
        assert!(validate_mermaid_source("flowchart LR\n  A --> B\n").is_ok());
        assert!(validate_mermaid_source("  \n").is_err());
        assert!(validate_mermaid_source("flowchart LR\0A").is_err());
        assert!(validate_mermaid_source(&"x".repeat(MAX_DIAGRAM_BYTES + 1)).is_err());
    }

    #[test]
    fn analyzes_and_updates_flowchart_without_rewriting_advanced_syntax() {
        let source = "flowchart LR\n  A[开始] -->|原标签| B{判断}\n  classDef important fill:#f00\n  class A important\n";
        let structure = analyze_mermaid_structure(source);
        assert!(structure.supported);
        assert_eq!(structure.nodes.len(), 2);
        assert_eq!(structure.edges.len(), 1);
        let updated = update_mermaid_element(
            source,
            &DiagramElementEdit {
                kind: "node".into(),
                id: "B".into(),
                label: "是否继续".into(),
                shape: Some("rounded".into()),
            },
        )
        .unwrap();
        assert!(updated.contains("B(是否继续)"));
        assert!(updated.contains("classDef important fill:#f00"));
        let edge = &structure.edges[0];
        let updated = update_mermaid_element(
            &updated,
            &DiagramElementEdit {
                kind: "edge".into(),
                id: edge.id.clone(),
                label: "继续".into(),
                shape: None,
            },
        )
        .unwrap();
        assert!(updated.contains("-->|继续|"));
        assert!(updated.contains("class A important"));
    }

    #[test]
    fn leaves_non_flowchart_in_source_only_mode() {
        let structure = analyze_mermaid_structure("sequenceDiagram\n A->>B: Hello\n");
        assert!(!structure.supported);
        assert!(structure.nodes.is_empty());
    }

    #[test]
    fn supports_frontmatter_and_inserts_missing_edge_label() {
        let source =
            "---\ntitle: Preserved\n---\n%% comment\nflowchart TD\n  A[Start] --> B[Done]\n";
        let structure = analyze_mermaid_structure(source);
        assert!(structure.supported);
        assert_eq!(structure.edges.len(), 1);
        let updated = update_mermaid_element(
            source,
            &DiagramElementEdit {
                kind: "edge".into(),
                id: structure.edges[0].id.clone(),
                label: "next".into(),
                shape: None,
            },
        )
        .unwrap();
        assert!(updated.contains("title: Preserved"));
        assert!(updated.contains("-->|next| B[Done]"));
    }
}
