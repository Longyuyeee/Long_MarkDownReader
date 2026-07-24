use jsonc_parser::ast::Value;
use jsonc_parser::common::Ranged;
use jsonc_parser::{parse_to_ast, CollectOptions, CommentCollectionStrategy, ParseOptions};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

const MAX_JSON_SOURCE_BYTES: usize = 16 * 1024 * 1024;
const MAX_JSON_NODES: usize = 200_000;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JsonDiagnostic {
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
pub struct JsonSourceAnalysis {
    pub valid: bool,
    pub mode: String,
    pub root_kind: Option<String>,
    pub node_count: usize,
    pub property_count: usize,
    pub max_depth: usize,
    pub comment_count: usize,
    pub duplicate_key_count: usize,
    pub precision_sensitive_number_count: usize,
    pub structure_edit_candidate: bool,
    pub diagnostics: Vec<JsonDiagnostic>,
}

#[derive(Default)]
struct AnalysisCounters {
    nodes: usize,
    properties: usize,
    max_depth: usize,
    duplicate_keys: usize,
    precision_sensitive_numbers: usize,
}

pub fn analyze_json_source(content: &str, jsonc: bool) -> JsonSourceAnalysis {
    let mode = if jsonc { "jsonc" } else { "json" }.to_string();
    if content.len() > MAX_JSON_SOURCE_BYTES {
        return failed_analysis(
            mode,
            JsonDiagnostic {
                severity: "error".into(),
                code: "source-too-large".into(),
                message: format!("JSON 源码超过 {} 字节分析上限", MAX_JSON_SOURCE_BYTES),
                start: 0,
                end: 0,
                line: 1,
                column: 1,
                path: None,
            },
        );
    }

    let parse_options = ParseOptions {
        allow_comments: jsonc,
        allow_trailing_commas: jsonc,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
    };
    let parsed = match parse_to_ast(
        content,
        &CollectOptions {
            comments: CommentCollectionStrategy::Separate,
            tokens: false,
        },
        &parse_options,
    ) {
        Ok(parsed) => parsed,
        Err(error) => {
            let range = error.range();
            return failed_analysis(
                mode,
                JsonDiagnostic {
                    severity: "error".into(),
                    code: "syntax-error".into(),
                    message: error.kind().to_string(),
                    start: range.start,
                    end: range.end,
                    line: error.line_display(),
                    column: error.column_display(),
                    path: None,
                },
            );
        }
    };

    let comment_count = parsed
        .comments
        .as_ref()
        .map(|comments| {
            comments
                .values()
                .flat_map(|items| items.iter())
                .map(|comment| {
                    let range = comment.range();
                    (range.start, range.end)
                })
                .collect::<HashSet<_>>()
                .len()
        })
        .unwrap_or(0);
    let Some(root) = parsed.value.as_ref() else {
        return failed_analysis(
            mode,
            JsonDiagnostic {
                severity: "error".into(),
                code: "empty-document".into(),
                message: "JSON 文档不能为空".into(),
                start: 0,
                end: 0,
                line: 1,
                column: 1,
                path: None,
            },
        );
    };

    let mut counters = AnalysisCounters::default();
    let mut diagnostics = Vec::new();
    inspect_value(root, "$", 1, content, &mut counters, &mut diagnostics);
    if counters.nodes > MAX_JSON_NODES {
        diagnostics.push(JsonDiagnostic {
            severity: "error".into(),
            code: "node-budget-exceeded".into(),
            message: format!("JSON 节点数超过 {MAX_JSON_NODES} 个分析上限"),
            start: 0,
            end: content.len(),
            line: 1,
            column: 1,
            path: Some("$".into()),
        });
    }
    let valid = diagnostics
        .iter()
        .all(|diagnostic| diagnostic.severity != "error");
    JsonSourceAnalysis {
        valid,
        mode,
        root_kind: Some(value_kind(root).into()),
        node_count: counters.nodes,
        property_count: counters.properties,
        max_depth: counters.max_depth,
        comment_count,
        duplicate_key_count: counters.duplicate_keys,
        precision_sensitive_number_count: counters.precision_sensitive_numbers,
        structure_edit_candidate: valid
            && counters.duplicate_keys == 0
            && counters.precision_sensitive_numbers == 0,
        diagnostics,
    }
}

fn failed_analysis(mode: String, diagnostic: JsonDiagnostic) -> JsonSourceAnalysis {
    JsonSourceAnalysis {
        valid: false,
        mode,
        root_kind: None,
        node_count: 0,
        property_count: 0,
        max_depth: 0,
        comment_count: 0,
        duplicate_key_count: 0,
        precision_sensitive_number_count: 0,
        structure_edit_candidate: false,
        diagnostics: vec![diagnostic],
    }
}

fn inspect_value(
    value: &Value<'_>,
    path: &str,
    depth: usize,
    content: &str,
    counters: &mut AnalysisCounters,
    diagnostics: &mut Vec<JsonDiagnostic>,
) {
    counters.nodes += 1;
    counters.max_depth = counters.max_depth.max(depth);
    match value {
        Value::Object(object) => {
            let mut keys = HashMap::new();
            for property in &object.properties {
                counters.properties += 1;
                let key = property.name.as_str();
                let escaped_key = escape_path_key(key);
                let property_path = if escaped_key.starts_with('[') {
                    format!("{path}{escaped_key}")
                } else {
                    format!("{path}.{escaped_key}")
                };
                if keys.insert(key, property.name.range()).is_some() {
                    counters.duplicate_keys += 1;
                    let range = property.name.range();
                    let (line, column) = line_column(content, range.start);
                    diagnostics.push(JsonDiagnostic {
                        severity: "warning".into(),
                        code: "duplicate-key".into(),
                        message: format!("对象键“{key}”重复，结构化写回可能改变语义"),
                        start: range.start,
                        end: range.end,
                        line,
                        column,
                        path: Some(property_path.clone()),
                    });
                }
                inspect_value(
                    &property.value,
                    &property_path,
                    depth + 1,
                    content,
                    counters,
                    diagnostics,
                );
            }
        }
        Value::Array(array) => {
            for (index, element) in array.elements.iter().enumerate() {
                inspect_value(
                    element,
                    &format!("{path}[{index}]"),
                    depth + 1,
                    content,
                    counters,
                    diagnostics,
                );
            }
        }
        Value::NumberLit(number) if precision_sensitive(number.value) => {
            counters.precision_sensitive_numbers += 1;
            let range = number.range;
            let (line, column) = line_column(content, range.start);
            diagnostics.push(JsonDiagnostic {
                severity: "warning".into(),
                code: "precision-sensitive-number".into(),
                message: "该数字超出 JavaScript 安全整数或包含超过 15 位有效数字，结构视图必须保留原始字面量".into(),
                start: range.start,
                end: range.end,
                line,
                column,
                path: Some(path.into()),
            });
        }
        _ => {}
    }
}

fn precision_sensitive(value: &str) -> bool {
    let mantissa = value
        .trim_start_matches(['-', '+'])
        .split(['e', 'E'])
        .next()
        .unwrap_or(value);
    let significant_digits = mantissa
        .chars()
        .filter(|character| character.is_ascii_digit())
        .skip_while(|character| *character == '0')
        .count();
    if significant_digits > 15 {
        return true;
    }
    if value.contains(['.', 'e', 'E']) {
        return value
            .parse::<f64>()
            .map(|number| {
                !number.is_finite()
                    || (number.fract() == 0.0 && number.abs() > 9_007_199_254_740_991.0)
            })
            .unwrap_or(true);
    }
    value
        .parse::<i128>()
        .map(|number| number.unsigned_abs() > 9_007_199_254_740_991)
        .unwrap_or(true)
}

fn escape_path_key(key: &str) -> String {
    if key
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-')
    {
        key.into()
    } else {
        format!("[\"{}\"]", key.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

fn line_column(content: &str, byte_offset: usize) -> (usize, usize) {
    let prefix = &content[..byte_offset.min(content.len())];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix
        .rsplit_once('\n')
        .map(|(_, tail)| tail.chars().count() + 1)
        .unwrap_or_else(|| prefix.chars().count() + 1);
    (line, column)
}

fn value_kind(value: &Value<'_>) -> &'static str {
    match value {
        Value::Object(_) => "object",
        Value::Array(_) => "array",
        Value::StringLit(_) => "string",
        Value::NumberLit(_) => "number",
        Value::BooleanLit(_) => "boolean",
        Value::NullKeyword(_) => "null",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_json_rejects_comments_while_jsonc_accepts_comments_and_trailing_commas() {
        let source = "{\n  // retained\n  \"name\": \"LongEdit\",\n}\n";
        assert!(!analyze_json_source(source, false).valid);
        let jsonc = analyze_json_source(source, true);
        assert!(jsonc.valid);
        assert_eq!(jsonc.comment_count, 1);
        assert_eq!(jsonc.root_kind.as_deref(), Some("object"));
    }

    #[test]
    fn duplicate_keys_and_precision_sensitive_numbers_block_structure_candidate() {
        let analysis =
            analyze_json_source(r#"{"id": 1, "id": 2, "large": 9007199254740993}"#, false);
        assert!(analysis.valid);
        assert_eq!(analysis.duplicate_key_count, 1);
        assert_eq!(analysis.precision_sensitive_number_count, 1);
        assert!(!analysis.structure_edit_candidate);
        assert_eq!(analysis.diagnostics.len(), 2);
    }

    #[test]
    fn reports_nested_shape_without_converting_number_literals() {
        let analysis = analyze_json_source(r#"{"rows":[{"value":1.25},null,true]}"#, false);
        assert!(analysis.valid);
        assert_eq!(analysis.node_count, 6);
        assert_eq!(analysis.property_count, 2);
        assert_eq!(analysis.max_depth, 4);
        assert!(analysis.structure_edit_candidate);
    }

    #[test]
    fn flags_unsafe_exponents_but_allows_negative_zero_and_small_exponents() {
        let analysis = analyze_json_source(r#"[-0, 1e2, 1e16]"#, false);
        assert!(analysis.valid);
        assert_eq!(analysis.precision_sensitive_number_count, 1);
        assert_eq!(analysis.diagnostics[0].path.as_deref(), Some("$[2]"));
    }

    #[test]
    fn unicode_duplicate_keys_report_character_based_columns() {
        let analysis = analyze_json_source("{\"键\": 1,\n \"键\": 2}", false);
        let duplicate = analysis
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "duplicate-key")
            .unwrap();
        assert_eq!((duplicate.line, duplicate.column), (2, 2));
        assert_eq!(duplicate.path.as_deref(), Some("$[\"键\"]"));
    }
}
