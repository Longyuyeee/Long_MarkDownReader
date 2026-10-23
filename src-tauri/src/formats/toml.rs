use serde::Serialize;
use toml_edit::{Document, Item, Value};

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
    pub editable: bool,
    pub edit_unavailable_reason: Option<String>,
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
    let document = match Document::parse(content) {
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
        inspect_item(content, item, &key_path("", key), key, 0, &mut state);
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
            (
                "value",
                value_child_count(value),
                value_preview(content, value),
            )
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
            editable: item.as_value().is_some_and(simple_value) && span.start < span.end,
            edit_unavailable_reason: item
                .as_value()
                .filter(|v| !simple_value(v))
                .map(|_| "数组、内联表和日期时间请在源码中修改，其他内容会保留".into()),
        });
    } else {
        state.truncated = true;
    }

    match item {
        Item::Table(table) => {
            for (key, child) in table.iter() {
                inspect_item(content, child, &key_path(path, key), key, depth + 1, state);
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
                        &key_path(&format!("{path}[{index}]"), key),
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

fn key_path(parent: &str, key: &str) -> String {
    if !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        if parent.is_empty() {
            key.to_string()
        } else {
            format!("{parent}.{key}")
        }
    } else {
        format!(
            "{parent}[{}]",
            serde_json::to_string(key).expect("string encoding")
        )
    }
}

fn simple_value(value: &Value) -> bool {
    matches!(
        value,
        Value::String(_) | Value::Integer(_) | Value::Float(_) | Value::Boolean(_)
    )
}

pub fn replace_toml_value_source(
    content: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<String, String> {
    let analysis = analyze_toml_source(content);
    if !analysis.valid {
        return Err("TOML 语法存在错误，请先在源码中修复".into());
    }
    let entry = analysis
        .outline
        .iter()
        .find(|v| v.start == start && v.end == end && v.kind == "value")
        .ok_or_else(|| "字段位置已过期，请重新选择".to_string())?;
    if !entry.editable {
        return Err(entry
            .edit_unavailable_reason
            .clone()
            .unwrap_or_else(|| "当前字段请在源码中修改".into()));
    }
    let value = replacement.trim();
    if value.len() > MAX_TOML_SOURCE_BYTES {
        return Err("输入值超过编辑大小上限".into());
    }
    let prefix = "__value__ = ";
    let wrapper = format!("{prefix}{value}");
    let parsed = Document::parse(wrapper.as_str())
        .map_err(|_| "请输入合法的 TOML 字符串、布尔或数字字面量；字符串需要引号".to_string())?;
    let valid = parsed.len() == 1
        && parsed
            .get("__value__")
            .and_then(Item::as_value)
            .is_some_and(|v| simple_value(v) && v.span() == Some(prefix.len()..wrapper.len()));
    if !valid {
        return Err("只修改当前字段值，请勿加入其他字段、注释、数组或表结构".into());
    }
    let candidate = format!("{}{value}{}", &content[..start], &content[end..]);
    if !analyze_toml_source(&candidate).valid {
        return Err("修改未通过完整 TOML 校验，当前草稿未变".into());
    }
    Ok(candidate)
}

fn value_preview(content: &str, value: &Value) -> String {
    let source = value
        .span()
        .and_then(|s| content.get(s))
        .unwrap_or("")
        .trim();
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

    fn edit(source: &str, path: &str, value: &str) -> Result<String, String> {
        let entry = analyze_toml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap();
        replace_toml_value_source(source, entry.start, entry.end, value)
    }

    #[test]
    fn immutable_analysis_preserves_exact_values_and_locations() {
        let s = "# 中文\r\nname = '原稿' # 保留\r\n[server]\r\nport = 8_080\r\n";
        let a = analyze_toml_source(s);
        assert!(a.valid);
        for e in a.outline.iter().filter(|e| e.kind == "value") {
            assert!(e.start < e.end);
            assert_eq!(&s[e.start..e.end], e.preview);
            assert!(e.editable);
        }
        assert_eq!(
            a.outline
                .iter()
                .find(|e| e.path == "server.port")
                .unwrap()
                .line,
            4
        );
        assert_eq!(
            edit(s, "server.port", "9_090").unwrap(),
            s.replace("8_080", "9_090")
        );
    }

    #[test]
    fn edits_only_the_selected_table_and_array_table_field() {
        let s = "[a]\nname='same'\n[b]\nname='same'\n[[servers]]\nname='same'\n[[servers]]\nname='same'\n";
        let e = edit(s, "b.name", "'new'").unwrap();
        assert_eq!(e, s.replacen("[b]\nname='same'", "[b]\nname='new'", 1));
        assert_eq!(
            edit(&e, "servers[1].name", "'last'").unwrap(),
            e.replacen(
                "[[servers]]\nname='same'\n[[servers]]\nname='same'",
                "[[servers]]\nname='same'\n[[servers]]\nname='last'",
                1
            )
        );
    }

    #[test]
    fn quoted_dotted_unicode_and_bracket_keys_have_distinct_paths() {
        let s = "\"a.b\" = 'literal'\na.b = 'nested'\n\"中文\".\"[x]\" = true\n";
        assert_eq!(
            edit(s, "[\"a.b\"]", "'copy'").unwrap(),
            s.replace("'literal'", "'copy'")
        );
        assert_eq!(
            edit(s, "a.b", "'other'").unwrap(),
            s.replace("'nested'", "'other'")
        );
        assert_eq!(
            edit(s, "[\"中文\"][\"[x]\"]", "false").unwrap(),
            s.replace("true", "false")
        );
    }

    #[test]
    fn retains_unrelated_raw_literals_comments_and_current_draft() {
        let s = "# 未保存草稿\r\nx = 0xFF # 数字\r\nn = 9_223_372_036_854_775_807\r\ns = \"\\u4E2D\\\\\"\r\nflag = true\r\n";
        assert_eq!(
            edit(s, "flag", "false").unwrap(),
            s.replace("flag = true", "flag = false")
        );
        for value in [
            "42",
            "0xAB",
            "1_234",
            "-0.5",
            "+inf",
            "nan",
            "'text'",
            "\"escaped\\nline\"",
            "true",
        ] {
            assert!(edit(s, "x", value).is_ok(), "{value}");
        }
    }

    #[test]
    fn accepts_complete_multiline_string_without_touching_following_field() {
        let s = "text = '''line\none''' # note\nnext = 2\n";
        assert_eq!(
            edit(s, "text", "'''新\n内容'''").unwrap(),
            "text = '''新\n内容''' # note\nnext = 2\n"
        );
    }

    #[test]
    fn refuses_extra_fields_trailing_comment_or_complex_replacements() {
        for v in [
            "",
            "bare text",
            "1\nx=2",
            "1 # other",
            "[1,2]",
            "{x=1}",
            "1979-05-27",
            "'x'\n[t]\ny=1",
        ] {
            assert!(edit("x=1\n", "x", v).is_err(), "{v}");
        }
    }

    #[test]
    fn complex_values_keep_source_fallback_and_are_never_replaced() {
        let s = "array=[1,2]\ninline={x=1}\ndate=1979-05-27T07:32:00Z\n";
        for e in analyze_toml_source(s).outline {
            assert!(!e.editable);
            assert!(e.edit_unavailable_reason.is_some());
            assert!(replace_toml_value_source(s, e.start, e.end, "2").is_err());
        }
    }

    #[test]
    fn rejects_stale_or_invalid_ranges_and_invalid_source() {
        for (s, start, end) in [
            ("x=1\n", 0, 1),
            ("x=1\n", 3, 4),
            ("x=1\n", usize::MAX, usize::MAX),
            ("x=\n", 2, 3),
        ] {
            assert!(replace_toml_value_source(s, start, end, "2").is_err());
        }
    }

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
