use serde::Serialize;
use std::str::FromStr;
use toml_edit::{DocumentMut, Item, Value};

const MAX_TOML_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_TOML_NODES: usize = 100_000;
const MAX_TOML_DEPTH: usize = 128;
const MAX_TOML_OUTLINE_ENTRIES: usize = 20_000;
const MAX_TOML_PREVIEW_CHARS: usize = 120;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TomlDiagnostic {
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
pub struct TomlOutlineEntry {
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
pub struct TomlSourceAnalysis {
    pub valid: bool,
    pub node_count: usize,
    pub table_count: usize,
    pub array_of_tables_count: usize,
    pub value_count: usize,
    pub max_depth: usize,
    pub outline: Vec<TomlOutlineEntry>,
    pub outline_truncated: bool,
    pub diagnostics: Vec<TomlDiagnostic>,
}

#[derive(Default)]
struct AnalysisState {
    nodes: usize,
    tables: usize,
    array_tables: usize,
    values: usize,
    max_depth: usize,
    truncated: bool,
    exceeded: bool,
    outline: Vec<TomlOutlineEntry>,
}

pub fn analyze_toml_source(content: &str) -> TomlSourceAnalysis {
    if content.len() > MAX_TOML_SOURCE_BYTES {
        return failed(diagnostic(
            content,
            "source-too-large",
            format!("TOML 源码超过 {MAX_TOML_SOURCE_BYTES} 字节分析上限"),
            0,
            0,
            None,
        ));
    }
    let document = match DocumentMut::from_str(content) {
        Ok(document) => document,
        Err(error) => {
            let span = error.span().unwrap_or(0..0);
            return failed(diagnostic(
                content,
                "syntax-error",
                error.message().to_string(),
                span.start,
                span.end,
                None,
            ));
        }
    };

    let mut state = AnalysisState::default();
    for (key, item) in document.iter() {
        inspect_item(content, item, key, key, 0, &mut state);
        if state.exceeded {
            break;
        }
    }
    let diagnostics = if state.exceeded {
        vec![diagnostic(
            content,
            "analysis-budget-exceeded",
            format!("TOML 结构超过 {MAX_TOML_NODES} 个节点或 {MAX_TOML_DEPTH} 层分析上限"),
            0,
            content.len(),
            None,
        )]
    } else {
        Vec::new()
    };
    TomlSourceAnalysis {
        valid: diagnostics.is_empty(),
        node_count: state.nodes,
        table_count: state.tables,
        array_of_tables_count: state.array_tables,
        value_count: state.values,
        max_depth: state.max_depth,
        outline: state.outline,
        outline_truncated: state.truncated,
        diagnostics,
    }
}

fn inspect_item(
    content: &str,
    item: &Item,
    path: &str,
    label: &str,
    depth: usize,
    state: &mut AnalysisState,
) {
    state.nodes += 1;
    state.max_depth = state.max_depth.max(depth);
    if state.nodes > MAX_TOML_NODES || depth > MAX_TOML_DEPTH {
        state.exceeded = true;
        return;
    }
    let span = item.span().unwrap_or(0..0);
    let (kind, child_count, preview) = match item {
        Item::Table(table) => {
            state.tables += 1;
            ("table", table.len(), String::new())
        }
        Item::ArrayOfTables(array) => {
            state.array_tables += 1;
            (
                "array-of-tables",
                array.len(),
                format!("{} 个表", array.len()),
            )
        }
        Item::Value(value) => {
            state.values += 1;
            ("value", value_child_count(value), value_preview(value))
        }
        Item::None => ("none", 0, String::new()),
    };
    if state.outline.len() < MAX_TOML_OUTLINE_ENTRIES {
        let (line, column) = line_column(content, span.start);
        state.outline.push(TomlOutlineEntry {
            path: path.into(),
            label: label.into(),
            kind: kind.into(),
            depth,
            child_count,
            start: span.start,
            end: span.end,
            line,
            column,
            preview,
        });
    } else {
        state.truncated = true;
    }

    match item {
        Item::Table(table) => {
            for (key, child) in table.iter() {
                inspect_item(
                    content,
                    child,
                    &format!("{path}.{key}"),
                    key,
                    depth + 1,
                    state,
                );
                if state.exceeded {
                    return;
                }
            }
        }
        Item::ArrayOfTables(array) => {
            for (index, table) in array.iter().enumerate() {
                for (key, child) in table.iter() {
                    inspect_item(
                        content,
                        child,
                        &format!("{path}[{index}].{key}"),
                        key,
                        depth + 1,
                        state,
                    );
                    if state.exceeded {
                        return;
                    }
                }
            }
        }
        _ => {}
    }
}

fn value_child_count(value: &Value) -> usize {
    match value {
        Value::Array(array) => array.len(),
        Value::InlineTable(table) => table.len(),
        _ => 0,
    }
}

fn value_preview(value: &Value) -> String {
    let rendered = value.to_string();
    let source = rendered.trim();
    let mut preview: String = source.chars().take(MAX_TOML_PREVIEW_CHARS).collect();
    if source.chars().count() > MAX_TOML_PREVIEW_CHARS {
        preview.push('…');
    }
    preview
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
    start: usize,
    end: usize,
    path: Option<String>,
) -> TomlDiagnostic {
    let (line, column) = line_column(content, start);
    TomlDiagnostic {
        severity: "error".into(),
        code: code.into(),
        message,
        start,
        end,
        line,
        column,
        path,
    }
}

fn failed(diagnostic: TomlDiagnostic) -> TomlSourceAnalysis {
    TomlSourceAnalysis {
        valid: false,
        node_count: 0,
        table_count: 0,
        array_of_tables_count: 0,
        value_count: 0,
        max_depth: 0,
        outline: Vec::new(),
        outline_truncated: false,
        diagnostics: vec![diagnostic],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyzes_tables_arrays_and_exact_key_paths() {
        let source = include_str!("../../tests/fixtures/formats/toml-valid.toml");
        let analysis = analyze_toml_source(source);
        assert!(analysis.valid, "{:?}", analysis.diagnostics);
        assert!(analysis.table_count >= 2);
        assert_eq!(analysis.array_of_tables_count, 1);
        assert!(analysis
            .outline
            .iter()
            .any(|entry| entry.path == "database.connection.port" && entry.preview == "5432"));
        assert!(analysis
            .outline
            .iter()
            .any(|entry| entry.path == "servers[1].host"));
    }

    #[test]
    fn reports_syntax_error_with_location() {
        let analysis = analyze_toml_source(include_str!(
            "../../tests/fixtures/formats/toml-invalid.toml"
        ));
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "syntax-error");
        assert!(analysis.diagnostics[0].line >= 2);
    }

    #[test]
    fn rejects_oversized_source_before_parsing() {
        let analysis = analyze_toml_source(&"x = 1\n".repeat(MAX_TOML_SOURCE_BYTES));
        assert!(!analysis.valid);
        assert_eq!(analysis.diagnostics[0].code, "source-too-large");
    }
}
