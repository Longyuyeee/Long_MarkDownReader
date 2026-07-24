use jsonc_parser::ast::Value;
use jsonc_parser::common::Ranged;
use jsonc_parser::tokens::{Token, TokenAndRange};
use jsonc_parser::{parse_to_ast, CollectOptions, CommentCollectionStrategy, ParseOptions};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

const MAX_JSON_SOURCE_BYTES: usize = 16 * 1024 * 1024;
const MAX_JSON_NODES: usize = 200_000;
const MAX_JSON_PATH_ENTRIES: usize = 20_000;
const MAX_JSON_PATH_PREVIEW_CHARS: usize = 120;

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
pub struct JsonPathEntry {
    pub path: String,
    pub kind: String,
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
    pub preview: String,
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
    pub paths: Vec<JsonPathEntry>,
    pub paths_truncated: bool,
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

    let parse_options = parse_options(jsonc);
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
    let mut paths = Vec::new();
    inspect_value(
        root,
        "$",
        1,
        content,
        &mut counters,
        &mut diagnostics,
        &mut paths,
    );
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
        paths_truncated: counters.nodes > paths.len(),
        paths,
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
        paths: Vec::new(),
        paths_truncated: false,
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
    paths: &mut Vec<JsonPathEntry>,
) {
    counters.nodes += 1;
    counters.max_depth = counters.max_depth.max(depth);
    if paths.len() < MAX_JSON_PATH_ENTRIES {
        let range = value.range();
        let (line, column) = line_column(content, range.start);
        paths.push(JsonPathEntry {
            path: path.into(),
            kind: value_kind(value).into(),
            start: range.start,
            end: range.end,
            line,
            column,
            preview: source_preview(content, range.start, range.end),
        });
    }
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
                    paths,
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
                    paths,
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

fn parse_options(jsonc: bool) -> ParseOptions {
    ParseOptions {
        allow_comments: jsonc,
        allow_trailing_commas: jsonc,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
    }
}

fn source_preview(content: &str, start: usize, end: usize) -> String {
    let collapsed = content[start.min(content.len())..end.min(content.len())]
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let mut preview = collapsed
        .chars()
        .take(MAX_JSON_PATH_PREVIEW_CHARS)
        .collect::<String>();
    if collapsed.chars().count() > MAX_JSON_PATH_PREVIEW_CHARS {
        preview.push('…');
    }
    preview
}

pub fn transform_json_source(content: &str, jsonc: bool, mode: &str) -> Result<String, String> {
    if content.len() > MAX_JSON_SOURCE_BYTES {
        return Err("JSON 源码超过格式化大小上限".into());
    }
    if !analyze_json_source(content, jsonc).valid {
        return Err("JSON 源码存在语法错误，不能格式化或压缩".into());
    }
    let parsed = parse_to_ast(
        content,
        &CollectOptions {
            comments: CommentCollectionStrategy::AsTokens,
            tokens: true,
        },
        &parse_options(jsonc),
    )
    .map_err(|error| error.kind().to_string())?;
    let tokens = parsed.tokens.unwrap_or_default();
    match mode {
        "pretty" => Ok(render_pretty(content, &tokens)),
        "minify" => Ok(render_minified(content, &tokens)),
        _ => Err("不支持的 JSON 源码变换模式".into()),
    }
}

fn token_source<'a>(content: &'a str, token: &TokenAndRange<'_>) -> &'a str {
    &content[token.range.start..token.range.end]
}

fn is_close(token: &Token<'_>) -> bool {
    matches!(token, Token::CloseBrace | Token::CloseBracket)
}

fn append_indent(output: &mut String, indent: usize, line_start: &mut bool) {
    if *line_start {
        output.push_str(&"  ".repeat(indent));
        *line_start = false;
    }
}

fn newline(output: &mut String, line_start: &mut bool) {
    while output.ends_with([' ', '\t']) {
        output.pop();
    }
    if !output.ends_with('\n') {
        output.push('\n');
    }
    *line_start = true;
}

fn render_pretty(content: &str, tokens: &[TokenAndRange<'_>]) -> String {
    let mut output = String::with_capacity(content.len());
    let mut indent = 0usize;
    let mut line_start = true;

    for (index, item) in tokens.iter().enumerate() {
        let previous = index
            .checked_sub(1)
            .and_then(|index| tokens.get(index))
            .map(|item| &item.token);
        let next = tokens.get(index + 1).map(|item| &item.token);
        match &item.token {
            Token::OpenBrace | Token::OpenBracket => {
                append_indent(&mut output, indent, &mut line_start);
                output.push_str(token_source(content, item));
                indent += 1;
                if !next.is_some_and(is_close) {
                    newline(&mut output, &mut line_start);
                }
            }
            Token::CloseBrace | Token::CloseBracket => {
                indent = indent.saturating_sub(1);
                if !line_start && !matches!(previous, Some(Token::OpenBrace | Token::OpenBracket)) {
                    newline(&mut output, &mut line_start);
                }
                append_indent(&mut output, indent, &mut line_start);
                output.push_str(token_source(content, item));
            }
            Token::Comma => {
                output.push(',');
                if matches!(next, Some(Token::CommentLine(_) | Token::CommentBlock(_))) {
                    output.push(' ');
                } else {
                    newline(&mut output, &mut line_start);
                }
            }
            Token::Colon => output.push_str(": "),
            Token::CommentLine(_) => {
                append_indent(&mut output, indent, &mut line_start);
                if !output.ends_with([' ', '\n']) {
                    output.push(' ');
                }
                output.push_str(token_source(content, item).trim_end_matches(['\r', '\n']));
                newline(&mut output, &mut line_start);
            }
            Token::CommentBlock(_) => {
                append_indent(&mut output, indent, &mut line_start);
                if !output.ends_with([' ', '\n']) {
                    output.push(' ');
                }
                output.push_str(token_source(content, item));
                if matches!(
                    next,
                    Some(Token::Comma | Token::CloseBrace | Token::CloseBracket)
                ) {
                    // Keep delimiters attached to their preceding value.
                } else if next.is_some() {
                    output.push(' ');
                }
            }
            _ => {
                append_indent(&mut output, indent, &mut line_start);
                output.push_str(token_source(content, item));
            }
        }
    }
    newline(&mut output, &mut line_start);
    output
}

fn render_minified(content: &str, tokens: &[TokenAndRange<'_>]) -> String {
    let mut output = String::with_capacity(content.len());
    for item in tokens {
        output.push_str(token_source(content, item).trim_end_matches(['\r', '\n']));
        if matches!(item.token, Token::CommentLine(_)) {
            output.push('\n');
        }
    }
    output
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
    let mut characters = key.chars();
    let identifier = characters
        .next()
        .is_some_and(|character| character.is_ascii_alphabetic() || character == '_')
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_');
    if identifier {
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
        assert_eq!(analysis.paths[0].path, "$");
        assert_eq!(analysis.paths[2].path, "$.rows[0]");
        assert_eq!(analysis.paths[3].preview, "1.25");
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

    #[test]
    fn pretty_and_minify_preserve_source_literals_and_duplicate_keys() {
        let source = r#"{"id":9007199254740993,"id":-0,"escaped":"\u4e2d"}"#;
        let pretty = transform_json_source(source, false, "pretty").unwrap();
        assert!(pretty.contains("9007199254740993"));
        assert!(pretty.contains(r#""escaped": "\u4e2d""#));
        assert_eq!(pretty.matches(r#""id""#).count(), 2);
        assert!(analyze_json_source(&pretty, false).valid);

        let minified = transform_json_source(&pretty, false, "minify").unwrap();
        assert_eq!(minified, source);
    }

    #[test]
    fn jsonc_transform_preserves_comments_and_trailing_commas() {
        let source = "{\n  // identity\n  \"name\": \"LongEdit\", /* retained */\n}\n";
        let minified = transform_json_source(source, true, "minify").unwrap();
        assert!(minified.contains("// identity\n"));
        assert!(minified.contains("/* retained */"));
        assert!(minified.ends_with(",/* retained */}"));
        assert!(analyze_json_source(&minified, true).valid);

        let pretty = transform_json_source(&minified, true, "pretty").unwrap();
        assert!(pretty.contains("// identity"));
        assert!(pretty.contains("/* retained */"));
        assert!(analyze_json_source(&pretty, true).valid);
    }

    #[test]
    fn transform_rejects_invalid_source_and_unknown_modes() {
        assert!(transform_json_source("{", false, "pretty").is_err());
        assert!(transform_json_source("{}", false, "other").is_err());
    }

    #[test]
    fn pretty_keeps_nested_empty_containers_on_their_parent_indent() {
        let pretty =
            transform_json_source(r#"{"items":[{},[]],"tail":true}"#, false, "pretty").unwrap();
        assert_eq!(
            pretty,
            "{\n  \"items\": [\n    {},\n    []\n  ],\n  \"tail\": true\n}\n"
        );
    }

    #[test]
    fn json_paths_use_bracket_notation_for_non_identifier_keys() {
        let analysis = analyze_json_source(r#"{"safe_key":1,"a-b":2,"123":3}"#, false);
        let paths = analysis
            .paths
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert!(paths.contains(&"$.safe_key"));
        assert!(paths.contains(&"$[\"a-b\"]"));
        assert!(paths.contains(&"$[\"123\"]"));
    }
}
