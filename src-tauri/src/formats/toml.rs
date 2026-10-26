use serde::Serialize;
use toml_edit::{Document, Item, Key, Table, Value};

#[path = "toml_literal.rs"]
mod literal;
pub use literal::{inspect_toml_literal_source, replace_toml_literal_source};
#[cfg(test)]
#[path = "toml_literal_tests.rs"]
mod literal_tests;
#[cfg(test)]
#[path = "toml_basic_tests.rs"]
mod basic_tests;

#[path = "toml_fields.rs"]
mod fields;
pub use fields::{add_toml_field_source, remove_toml_field_source, copy_toml_field_source, move_toml_field_source};

#[path = "toml_arrays.rs"]
mod arrays;
pub use arrays::{add_toml_array_item_source, inspect_toml_array_items_source, remove_toml_array_item_source, copy_toml_array_item_source, move_toml_array_item_source, replace_toml_array_item_source, TomlArrayItem};

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
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub multiline_basic: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub literal: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub array: bool,
    pub field: Option<TomlField>,
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
pub struct TomlField {
    pub name: String,
    pub start: usize,
    pub end: usize,
    pub rename_unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TomlKeyChange {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<String>,
    pub content: String,
    pub start: usize,
    pub end: usize,
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
        inspect_item(
            content,
            item,
            &key_path("", key),
            key,
            0,
            document.as_table(),
            false,
            &mut state,
        );
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
    parent: &Table,
    in_array_table: bool,
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
            multiline_basic: item.as_value().is_some_and(|v| v.is_str() && v.span().and_then(|s| content.get(s)).is_some_and(|s| s.starts_with("\"\"\""))),
            literal: item.as_value().is_some_and(|v| v.is_str() && v.span().and_then(|s| content.get(s)).is_some_and(|s| s.starts_with("'''"))),
            array: item.as_value().is_some_and(Value::is_array),
            field: parent.key(label).and_then(|key| {
                field_info(content, key, item, parent.is_dotted() || in_array_table)
            }),
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
                .map(|_| "数组可展开后修改，内联表请定位源码；当前内容会保留".into()),
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
                    &key_path(path, key),
                    key,
                    depth + 1,
                    table,
                    in_array_table,
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
                        &key_path(&format!("{path}[{index}]"), key),
                        key,
                        depth + 1,
                        table,
                        true,
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

// A key's parser span is distinct from its value/table span. Only an entire
// single-key assignment can be changed without rewriting table ownership.
fn field_info(content: &str, key: &Key, item: &Item, restricted: bool) -> Option<TomlField> {
    let span = key.span()?;
    let raw = content.get(span.clone())?;
    let line_prefix = content[..span.start]
        .rsplit('\n')
        .next()?
        .trim_start_matches('\u{feff}');
    let assignment = item
        .as_value()
        .and_then(Value::span)
        .and_then(|value| content.get(span.end..value.start))
        .is_some_and(|between| between.trim() == "=");
    let standalone = line_prefix.chars().all(|c| c == ' ' || c == '\t');
    let reason = if restricted || !assignment || !standalone || raw.is_empty() {
        Some("点键、表头和数组表请在源码中修改；当前字段名输入与草稿仍保留".into())
    } else {
        None
    };
    Some(TomlField {
        name: key.get().into(),
        start: span.start,
        end: span.end,
        rename_unavailable_reason: reason,
    })
}

// Compare the complete parser-owned tree, with precisely one renamed key.
// Values use their exact source bytes, including arrays, inline tables and dates.
// This representation is validation only; output is never re-serialized.
fn source_tree(
    content: &str,
    item: &Item,
    rename: Option<(usize, usize, &str)>,
) -> Option<serde_json::Value> {
    Some(match item {
        Item::Value(value) => serde_json::json!(["value", content.get(value.span()?)?]),
        Item::Table(table) => {
            let mut fields = serde_json::Map::new();
            for (name, child) in table.iter() {
                let key = table.key(name)?;
                let name = match (rename, key.span()) {
                    (Some((start, end, name)), Some(span)) if span == (start..end) => name,
                    _ => name,
                };
                if fields
                    .insert(name.into(), source_tree(content, child, rename)?)
                    .is_some()
                {
                    return None;
                }
            }
            serde_json::json!(["table", fields])
        }
        Item::ArrayOfTables(array) => serde_json::json!([
            "array-of-tables",
            array
                .iter()
                .map(|table| source_tree(content, &Item::Table(table.clone()), rename))
                .collect::<Option<Vec<_>>>()?
        ]),
        Item::None => serde_json::Value::Null,
    })
}

pub fn rename_toml_key_source(
    content: &str,
    start: usize,
    end: usize,
    name: &str,
) -> Result<TomlKeyChange, String> {
    let analysis = analyze_toml_source(content);
    if !analysis.valid {
        return Err("TOML 语法存在错误，请先在源码中修复；草稿仍保留".into());
    }
    let field = analysis
        .outline
        .iter()
        .filter_map(|entry| entry.field.as_ref())
        .find(|field| field.start == start && field.end == end)
        .ok_or_else(|| "字段名位置已过期，请重新选择字段".to_string())?;
    if let Some(reason) = &field.rename_unavailable_reason {
        return Err(reason.clone());
    }
    if name.is_empty() {
        return Err("请输入字段名；当前草稿未变".into());
    }
    if name.len() > MAX_TOML_SOURCE_BYTES {
        return Err("字段名超过编辑大小上限".into());
    }
    let raw = &content[start..end];
    if name == field.name {
        return Ok(TomlKeyChange {
            value_type: None,
            content: content.into(),
            start,
            end,
        });
    }
    let bare = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    let quoted = || serde_json::to_string(name).expect("string encoding");
    let replacement =
        if raw.starts_with('\'') && !name.contains('\'') && !name.chars().any(char::is_control) {
            format!("'{name}'")
        } else if raw.starts_with('"') || raw.starts_with('\'') || !bare {
            quoted()
        } else {
            name.into()
        };
    let candidate = format!("{}{}{}", &content[..start], replacement, &content[end..]);
    if candidate.len() > MAX_TOML_SOURCE_BYTES {
        return Err("修改后源码超过分析大小上限；草稿仍保留".into());
    }
    let before = Document::parse(content).map_err(|_| "当前 TOML 已变化，请重新选择字段")?;
    let after = Document::parse(candidate.as_str())
        .map_err(|_| "字段名已存在或与表路径冲突，请调整名称；输入与草稿仍保留")?;
    let expected = source_tree(content, before.as_item(), Some((start, end, name)))
        .ok_or("字段名与同级字段或表路径冲突；输入与草稿仍保留")?;
    if source_tree(&candidate, after.as_item(), None).as_ref() != Some(&expected) {
        return Err("无法确认只改变当前字段，请定位源码修改；输入与草稿仍保留".into());
    }
    Ok(TomlKeyChange {
        value_type: None,
        content: candidate,
        start,
        end: start + replacement.len(),
    })
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
        Value::String(_) | Value::Integer(_) | Value::Float(_) | Value::Boolean(_) | Value::Datetime(_)
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
        .map_err(|_| "值的格式不正确：字符串需要引号；日期如 2026-10-25，时间如 14:30:00，日期时间如 2026-10-25T14:30:00+08:00。请检查日期、时间和时区；输入与草稿已保留".to_string())?;
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
#[path = "toml_datetime_tests.rs"]
mod datetime_tests;

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
            "'x'\n[t]\ny=1",
        ] {
            assert!(edit("x=1\n", "x", v).is_err(), "{v}");
        }
    }

    #[test]
    fn complex_values_keep_source_fallback_and_are_never_replaced() {
        let s = "array=[1,2]\ninline={x=1}\n";
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

    fn rename(source: &str, path: &str, name: &str) -> Result<TomlKeyChange, String> {
        let field = analyze_toml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap()
            .field
            .unwrap();
        rename_toml_key_source(source, field.start, field.end, name)
    }

    #[test]
    fn rename_exact_key_span_preserves_bom_crlf_comments_values_and_other_tables() {
        let source = "\u{feff}# 中文😀\r\nold = 0xFF # old unchanged\r\ndate=1979-05-27T07:32:00Z\r\n[server]\r\n  old = '我的草稿'\r\n[other]\r\nold = 1_024\r\n";
        let a = analyze_toml_source(source);
        assert!(a.valid, "{:?}", a.diagnostics);
        for e in a.outline.iter().filter(|e| e.kind == "value") {
            let f = e.field.as_ref().unwrap();
            assert_eq!(&source[f.start..f.end], f.name);
            assert!(f.end <= e.start);
            assert!(f.rename_unavailable_reason.is_none());
        }
        let changed = rename(source, "server.old", "字段").unwrap();
        assert_eq!(
            changed.content,
            source.replacen("  old =", "  \"字段\" =", 1)
        );
        assert_eq!(&changed.content[changed.start..changed.end], "\"字段\"");
        assert_eq!(
            rename(source, "old", "new").unwrap().content,
            source.replacen("old =", "new =", 1)
        );
    }

    #[test]
    fn rename_preserves_quote_style_and_quotes_literal_names_without_new_paths() {
        let source = "bare = true\n'single' = 1\n\"double\" = 2\n";
        for (path, name, expected) in [
            ("bare", "a.b", "\"a.b\" = true"),
            ("bare", "true", "true = true"),
            ("bare", " spaced ", "\" spaced \" = true"),
            ("single", "next", "'next' = 1"),
            ("single", "it's new", "\"it's new\" = 1"),
            ("double", "next", "\"next\" = 2"),
            ("double", "引号\"\\\n", "\"引号\\\"\\\\\\n\" = 2"),
        ] {
            let changed = rename(source, path, name).unwrap();
            assert!(changed.content.contains(expected), "{changed:?}");
            assert!(analyze_toml_source(&changed.content).valid);
        }
    }

    #[test]
    fn rename_rejects_sibling_duplicates_and_table_conflicts_but_other_tables_are_independent() {
        for source in [
            "old=1\nother=2\n",
            "old=1\n[other]\nx=2\n",
            "old=1\nother.x=2\n",
            "old=1\n[[other]]\nx=2\n",
        ] {
            assert!(rename(source, "old", "other").is_err(), "{source}");
        }
        let source = "[one]\nold=1\n[two]\nother=2\n";
        assert_eq!(
            rename(source, "one.old", "other").unwrap().content,
            "[one]\nother=1\n[two]\nother=2\n"
        );
    }

    #[test]
    fn rename_complex_value_outer_keys_without_rewriting_contents_and_fallback_for_ownership() {
        let source="array=[1, 0xFF, {keep='old'}]\ninline={ old=1, next=2 }\ndate=1979-05-27\na.b=3\n[table]\nold=4\n[[servers]]\nold=5\n[servers.nested]\nold=6\n";
        for path in ["array", "inline", "date"] {
            assert_eq!(
                rename(source, path, "next").unwrap().content,
                source.replacen(&format!("{path}="), "next=", 1)
            );
        }
        for path in [
            "a.b",
            "table",
            "servers",
            "servers[0].old",
            "servers[0].nested.old",
        ] {
            let e = analyze_toml_source(source)
                .outline
                .into_iter()
                .find(|e| e.path == path)
                .unwrap();
            if let Some(f) = e.field {
                assert!(f.rename_unavailable_reason.is_some(), "{path}");
                assert!(rename_toml_key_source(source, f.start, f.end, "next").is_err());
            }
        }
        assert!(rename(source, "table.old", "next").is_ok());
        assert_eq!(
            edit(source, "a.b", "9").unwrap(),
            source.replace("a.b=3", "a.b=9")
        );
    }

    #[test]
    fn rename_rejects_value_offsets_stale_keys_invalid_source_and_empty_names() {
        let source = "\"中文😀\" = 1\n";
        let e = analyze_toml_source(source).outline.remove(0);
        let f = e.field.unwrap();
        for (start, end) in [
            (e.start, e.end),
            (f.start + 1, f.end),
            (usize::MAX, usize::MAX),
        ] {
            assert!(rename_toml_key_source(source, start, end, "next").is_err());
        }
        assert!(rename_toml_key_source(source, f.start, f.end, "").is_err());
        assert!(rename_toml_key_source("old=\n", 0, 3, "next").is_err());
        assert_eq!(
            rename_toml_key_source(source, f.start, f.end, &f.name)
                .unwrap()
                .content,
            source
        );
    }

    #[test]
    fn rename_refreshes_path_and_value_editing_for_consecutive_draft_changes() {
        let source = "[server]\nold=8_080 # keep\n\"a.b\"={x=1}\n";
        let first = rename(source, "server.old", "字段").unwrap();
        let second = rename(&first.content, "server[\"字段\"]", "port").unwrap();
        assert_eq!(second.content, source.replace("old=", "\"port\"="));
        assert_eq!(
            edit(&second.content, "server.port", "9_090").unwrap(),
            source.replace("old=8_080", "\"port\"=9_090")
        );
        assert_eq!(
            rename(source, "server[\"a.b\"]", "c.d").unwrap().content,
            source.replace("\"a.b\"=", "\"c.d\"=")
        );
    }
}

#[cfg(test)]
#[path = "toml_field_copy_tests.rs"]
mod field_copy_tests;

#[cfg(test)]
#[path = "toml_field_order_tests.rs"]
mod field_order_tests;
