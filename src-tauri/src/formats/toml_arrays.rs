use super::*;
use std::ops::Range;
use toml_edit::Array;

const FALLBACK: &str = "此数组的结构或注释归属无法可靠修改，请定位源码；输入与草稿仍保留";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TomlArrayItem {
    pub index: usize,
    pub start: usize,
    pub end: usize,
    pub preview: String,
    pub editable: bool,
}

fn find_array<'a>(item: &'a Item, range: &Range<usize>) -> Option<&'a Array> {
    if item.span().as_ref() == Some(range) {
        return item.as_array();
    }
    item.as_table()?
        .iter()
        .find_map(|(_, v)| find_array(v, range))
}

fn prepare<'a>(content: &'a str, range: &Range<usize>) -> Result<Document<&'a str>, String> {
    let analysis = analyze_toml_source(content);
    if !analysis.valid {
        return Err("请先修复 TOML 语法；输入与草稿仍保留".into());
    }
    if !analysis.outline.iter().any(|e| {
        e.array
            && e.start == range.start
            && e.end == range.end
            && e.field
                .as_ref()
                .is_some_and(|f| f.rename_unavailable_reason.is_none())
    }) {
        return Err(
            "数组位置已变化，或属于点键／数组表，请重新选择或定位源码；输入与草稿仍保留".into(),
        );
    }
    Document::parse(content).map_err(|_| FALLBACK.into())
}

fn scalar(content: &str, v: &Value) -> bool {
    !matches!(v, Value::Array(_) | Value::InlineTable(_))
        && v.span().and_then(|r| content.get(r)).is_some_and(|s| {
            !s.contains(['\r', '\n']) && !s.starts_with("\"\"\"") && !s.starts_with("'''")
        })
}

pub fn inspect_toml_array_items_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<Vec<TomlArrayItem>, String> {
    let range = start..end;
    let doc = prepare(content, &range)?;
    let array = find_array(doc.as_item(), &range).ok_or(FALLBACK)?;
    if array.len() > 2000 {
        return Err("数组超过 2000 项，请定位源码查看；草稿仍保留".into());
    }
    array
        .iter()
        .enumerate()
        .map(|(index, v)| {
            let r = v.span().ok_or(FALLBACK)?;
            Ok(TomlArrayItem {
                index,
                start: r.start,
                end: r.end,
                preview: value_preview(content, v),
                editable: scalar(content, v),
            })
        })
        .collect()
}

// Validate all other values by their literal source. The selected array is
// checked separately item by item, so no serializer is involved in output.
fn masked_tree(content: &str, item: &Item, target: &Range<usize>) -> Option<serde_json::Value> {
    if item.span().as_ref() == Some(target) && item.is_array() {
        return Some(serde_json::json!(["selected-array"]));
    }
    Some(match item {
        Item::Value(v) => serde_json::json!(["value", content.get(v.span()?)?]),
        Item::Table(t) => {
            let mut values = serde_json::Map::new();
            for (k, v) in t.iter() {
                values.insert(k.into(), masked_tree(content, v, target)?);
            }
            serde_json::json!(["table", values])
        }
        Item::ArrayOfTables(a) => serde_json::json!([
            "array-of-tables",
            a.iter()
                .map(|t| masked_tree(content, &Item::Table(t.clone()), target))
                .collect::<Option<Vec<_>>>()?
        ]),
        Item::None => serde_json::Value::Null,
    })
}

fn literals(content: &str, array: &Array) -> Option<Vec<String>> {
    array
        .iter()
        .map(|v| Some(content.get(v.span()?)?.to_string()))
        .collect()
}

// A gap may contain only whitespace, comments and at most one comma. Parser
// scalar ranges keep quoted commas and # characters outside these gaps.
fn gap(raw: &str) -> Result<Option<usize>, String> {
    let mut comment = false;
    let mut comma = None;
    for (i, c) in raw.char_indices() {
        if c == '\n' {
            comment = false;
            continue;
        }
        if comment {
            continue;
        }
        match c {
            '#' => comment = true,
            ',' if comma.is_none() => comma = Some(i),
            c if c.is_whitespace() => {}
            _ => return Err(FALLBACK.into()),
        }
    }
    Ok(comma)
}

fn change(
    content: &str,
    start: usize,
    end: usize,
    after: Option<(usize, usize)>,
    value: Option<&str>,
) -> Result<TomlKeyChange, String> {
    let range = start..end;
    let doc = prepare(content, &range)?;
    let array = find_array(doc.as_item(), &range).ok_or(FALLBACK)?;
    if array.len() > 2000 || (value.is_some() && array.len() == 2000) {
        return Err("数组已达到 2000 项上限，请定位源码修改；输入与草稿仍保留".into());
    }
    if array.iter().any(|v| !scalar(content, v)) {
        return Err("嵌套数组、内联表和多行值请定位源码；输入与草稿仍保留".into());
    }
    let index = if let Some((a, b)) = after {
        array
            .iter()
            .position(|v| v.span() == Some(a..b))
            .ok_or("条目位置已变化，请重新选择；输入仍保留")?
    } else {
        array.len()
    };
    let mut expected = literals(content, array).ok_or(FALLBACK)?;
    let mut candidate = content.to_string();
    let (point, length, value_type);
    if let Some(value) = value {
        let value = value.trim();
        if value.is_empty() || value.len() > MAX_TOML_SOURCE_BYTES || value.contains(['\r', '\n']) {
            return Err("请输入单行 TOML 值；字符串需要引号，输入仍保留".into());
        }
        let prefix = "__item__ = ";
        let wrapper = format!("{prefix}{value}");
        let parsed = Document::parse(wrapper.as_str())
            .map_err(|_| "请输入文本、数字、布尔或日期时间；字符串需要引号，输入仍保留")?;
        let literal = parsed
            .get("__item__")
            .and_then(Item::as_value)
            .filter(|v| {
                parsed.len() == 1
                    && v.span() == Some(prefix.len()..wrapper.len())
                    && scalar(&wrapper, v)
            })
            .ok_or("只新增一个单行标量，请勿加入集合、注释或其他字段；输入仍保留")?;
        let kind = match literal {
            Value::String(_) => "文本",
            Value::Integer(_) | Value::Float(_) => "数字",
            Value::Boolean(_) => "布尔",
            Value::Datetime(_) => "日期时间",
            _ => unreachable!(),
        };
        let insert_index = if after.is_some() { index + 1 } else { index };
        let (at, insertion, leading) = if array.is_empty() {
            let at = end
                .checked_sub(1)
                .filter(|&i| content.get(i..end) == Some("]"))
                .ok_or(FALLBACK)?;
            if content[start + 1..at].contains('#') {
                return Err(FALLBACK.into());
            }
            (at, value.to_string(), 0)
        } else {
            let previous = array
                .get(insert_index - 1)
                .and_then(Value::span)
                .ok_or(FALLBACK)?;
            let next = if insert_index < array.len() {
                array
                    .get(insert_index)
                    .and_then(Value::span)
                    .ok_or(FALLBACK)?
                    .start
            } else {
                end - 1
            };
            let tail = &content[previous.end..next];
            gap(tail)?;
            if tail.contains('#') {
                return Err(FALLBACK.into());
            }
            (previous.end, format!(", {value}"), 2)
        };
        if content.len() + insertion.len() > MAX_TOML_SOURCE_BYTES {
            return Err("修改后源码超过分析上限；输入与草稿仍保留".into());
        }
        candidate.insert_str(at, &insertion);
        point = at + leading;
        length = value.len();
        value_type = Some(kind.into());
        expected.insert(insert_index, value.to_string());
    } else {
        if after.is_none() {
            return Err("请先选择要删除的数组项".into());
        }
        let selected = array.get(index).and_then(Value::span).ok_or(FALLBACK)?;
        let comma = if array.len() == 1 {
            gap(&content[selected.end..end - 1])?.map(|i| selected.end + i)
        } else if index + 1 < array.len() {
            Some(
                selected.end
                    + gap(&content[selected.end
                        ..array
                            .get(index + 1)
                            .and_then(Value::span)
                            .ok_or(FALLBACK)?
                            .start])?
                    .ok_or(FALLBACK)?,
            )
        } else {
            let previous = array
                .get(index - 1)
                .and_then(Value::span)
                .ok_or(FALLBACK)?
                .end;
            Some(previous + gap(&content[previous..selected.start])?.ok_or(FALLBACK)?)
        };
        let mut cuts = vec![selected.clone()];
        if let Some(i) = comma {
            cuts.push(i..i + 1);
        }
        cuts.sort_unstable_by(|a, b| b.start.cmp(&a.start));
        for r in cuts {
            candidate.replace_range(r, "");
        }
        expected.remove(index);
        point = start;
        length = 0;
        value_type = None;
    }
    let new_end = end
        .checked_add_signed(candidate.len() as isize - content.len() as isize)
        .ok_or(FALLBACK)?;
    let parsed = prepare(&candidate, &(start..new_end))?;
    let changed = find_array(parsed.as_item(), &(start..new_end)).ok_or(FALLBACK)?;
    let before_tree = masked_tree(content, doc.as_item(), &range).ok_or(FALLBACK)?;
    let after_tree =
        masked_tree(&candidate, parsed.as_item(), &(start..new_end)).ok_or(FALLBACK)?;
    if literals(&candidate, changed).as_ref() != Some(&expected) || before_tree != after_tree {
        return Err("无法确认只改变当前数组项，请定位源码；输入与草稿仍保留".into());
    }
    Ok(TomlKeyChange {
        content: candidate,
        start: point,
        end: point + length,
        value_type,
    })
}

pub fn add_toml_array_item_source(
    content: &str,
    start: usize,
    end: usize,
    after_start: Option<usize>,
    after_end: Option<usize>,
    value: &str,
) -> Result<TomlKeyChange, String> {
    let after = match (after_start, after_end) {
        (Some(a), Some(b)) => Some((a, b)),
        (None, None) => None,
        _ => return Err("条目位置不完整，请重新选择".into()),
    };
    change(content, start, end, after, Some(value))
}
pub fn remove_toml_array_item_source(
    content: &str,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
) -> Result<TomlKeyChange, String> {
    change(content, start, end, Some((item_start, item_end)), None)
}

pub fn copy_toml_array_item_source(
    content: &str,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
) -> Result<TomlKeyChange, String> {
    let literal = content
        .get(item_start..item_end)
        .ok_or("条目位置已变化，请重新选择；草稿仍保留")?;
    // Reuse exact item ownership, insertion and full-document checks. Copy the
    // original token rather than serializing its value (hex, quotes and dates).
    change(
        content,
        start,
        end,
        Some((item_start, item_end)),
        Some(literal),
    )
}

pub fn replace_toml_array_item_source(
    content: &str,
    start: usize,
    end: usize,
    item_start: usize,
    item_end: usize,
    replacement: &str,
) -> Result<TomlKeyChange, String> {
    let range = start..end;
    let doc = prepare(content, &range)?;
    let array = find_array(doc.as_item(), &range).ok_or(FALLBACK)?;
    if array.len() > 2000 {
        return Err("数组超过 2000 项，请定位源码修改；输入与草稿仍保留".into());
    }
    if array.iter().any(|v| !scalar(content, v)) {
        return Err("嵌套数组、内联表和多行值请定位源码；输入与草稿仍保留".into());
    }
    let index = array
        .iter()
        .position(|v| v.span() == Some(item_start..item_end))
        .ok_or("条目位置已变化，请重新选择；输入与草稿仍保留")?;
    let value = replacement.trim();
    if value.is_empty() || value.len() > MAX_TOML_SOURCE_BYTES || value.contains(['\r', '\n']) {
        return Err("请输入单行 TOML 值；字符串需要引号，输入仍保留".into());
    }
    let prefix = "__item__ = ";
    let wrapper = format!("{prefix}{value}");
    let parsed = Document::parse(wrapper.as_str())
        .map_err(|_| "请输入文本、数字、布尔或日期时间；字符串需要引号，输入仍保留")?;
    let literal = parsed
        .get("__item__")
        .and_then(Item::as_value)
        .filter(|v| {
            parsed.len() == 1
                && v.span() == Some(prefix.len()..wrapper.len())
                && scalar(&wrapper, v)
        })
        .ok_or("只修改一个单行标量，请勿加入集合、注释或其他字段；输入仍保留")?;
    let kind = match literal {
        Value::String(_) => "文本",
        Value::Integer(_) | Value::Float(_) => "数字",
        Value::Boolean(_) => "布尔",
        Value::Datetime(_) => "日期时间",
        _ => unreachable!(),
    };
    let mut expected = literals(content, array).ok_or(FALLBACK)?;
    expected[index] = value.into();
    let mut candidate = content.to_string();
    candidate.replace_range(item_start..item_end, value);
    if candidate.len() > MAX_TOML_SOURCE_BYTES {
        return Err("修改后源码超过分析上限；输入与草稿仍保留".into());
    }
    let new_end = end
        .checked_add_signed(candidate.len() as isize - content.len() as isize)
        .ok_or(FALLBACK)?;
    let changed_doc = prepare(&candidate, &(start..new_end))?;
    let changed = find_array(changed_doc.as_item(), &(start..new_end)).ok_or(FALLBACK)?;
    if literals(&candidate, changed).as_ref() != Some(&expected)
        || masked_tree(content, doc.as_item(), &range).ok_or(FALLBACK)?
            != masked_tree(&candidate, changed_doc.as_item(), &(start..new_end)).ok_or(FALLBACK)?
    {
        return Err("无法确认只改变当前数组项，请定位源码；输入与草稿仍保留".into());
    }
    Ok(TomlKeyChange {
        content: candidate,
        start: item_start,
        end: item_start + value.len(),
        value_type: Some(kind.into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(s: &str, p: &str) -> TomlOutlineEntry {
        analyze_toml_source(s)
            .outline
            .into_iter()
            .find(|e| e.path == p)
            .unwrap()
    }
    fn edit(
        s: &str,
        p: &str,
        index: Option<usize>,
        v: Option<&str>,
    ) -> Result<TomlKeyChange, String> {
        let e = entry(s, p);
        let a = if let Some(i) = index {
            let item = inspect_toml_array_items_source(s, e.start, e.end)?.remove(i);
            Some((item.start, item.end))
        } else {
            None
        };
        change(s, e.start, e.end, a, v)
    }
    #[test]
    fn array_outline_is_lazy_and_item_ranges_keep_bom_unicode() {
        let s = "\u{feff}# 中文😀\r\n\"a.b\" = [0xFF, '文本😀', true]\r\n";
        let e = entry(s, "[\"a.b\"]");
        assert!(e.array);
        assert_eq!(analyze_toml_source(s).outline.len(), 1);
        let items = inspect_toml_array_items_source(s, e.start, e.end).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(&s[items[1].start..items[1].end], "'文本😀'");
        assert_eq!(items[1].index, 1);
    }
    #[test]
    fn append_insert_and_trailing_comma_preserve_other_tables_and_literals() {
        let s =
            "\u{feff}# keep\r\n[root]\r\nitems = [0xFF, '内容',]\r\n[other]\r\nitems = [8_080]\r\n";
        let r = edit(s, "root.items", None, Some("true")).unwrap();
        assert_eq!(r.content, s.replace("'内容',]", "'内容', true,]"));
        assert_eq!(r.value_type.as_deref(), Some("布尔"));
        assert_eq!(&r.content[r.start..r.end], "true");
        assert_eq!(
            edit(s, "root.items", Some(0), Some("42")).unwrap().content,
            s.replace("0xFF,", "0xFF, 42,")
        );
    }
    #[test]
    fn empty_first_last_roundtrip_and_multiline_array_keeps_trivia() {
        let s = "items = [] # keep\n";
        let r = edit(s, "items", None, Some("'first'")).unwrap();
        assert_eq!(edit(&r.content, "items", Some(0), None).unwrap().content, s);
        let s = "items = [\r\n  1,\r\n  2,\r\n]\r\nother = 0xFF\r\n";
        assert_eq!(
            edit(s, "items", None, Some("3")).unwrap().content,
            s.replace("2,", "2, 3,")
        );
        assert_eq!(
            edit("items = [1,]", "items", Some(0), None)
                .unwrap()
                .content,
            "items = []"
        );
    }
    #[test]
    fn remove_first_middle_last_preserves_comments_and_raw_siblings() {
        for (s, i, want) in [
            ("x = [1, 2, 3]\n", 0, "x = [ 2, 3]\n"),
            ("x = [1, 2, 3]\n", 1, "x = [1,  3]\n"),
            ("x = [1, 2, 3,]\n", 2, "x = [1, 2 ,]\n"),
            ("x = [1, # keep\n 2]\n", 0, "x = [ # keep\n 2]\n"),
        ] {
            assert_eq!(edit(s, "x", Some(i), None).unwrap().content, want);
        }
    }
    #[test]
    fn scalar_types_dates_quotes_and_escaped_separators_are_exact() {
        for (v, kind) in [
            ("'文本,#😀'", "文本"),
            ("42", "数字"),
            ("-1.2e3", "数字"),
            ("false", "布尔"),
            ("2026-10-24T10:20:30Z", "日期时间"),
            ("2026-10-24", "日期时间"),
            ("07:32:00", "日期时间"),
        ] {
            let r = edit("x = []", "x", None, Some(v)).unwrap();
            assert_eq!(r.value_type.as_deref(), Some(kind));
            assert_eq!(r.content, format!("x = [{v}]"));
        }
    }
    #[test]
    fn reject_collections_multiline_dotted_array_tables_invalid_and_stale_ranges() {
        for (s, p) in [
            ("x = [[1]]", "x"),
            ("x = [{a=1}]", "x"),
            ("x = [\"\"\"text\"\"\"]", "x"),
            ("a.b = [1]", "a.b"),
            ("[[a]]\nx = [1]\n", "a[0].x"),
        ] {
            assert!(edit(s, p, None, Some("true")).is_err(), "{s}");
        }
        assert!(change("x = [1]", 999, 1000, None, Some("1")).is_err());
        assert!(change("x = [1,", 4, 7, None, Some("1")).is_err());
        let s = "x = [1,2]";
        let e = entry(s, "x");
        assert!(change(s, e.start, e.end, Some((999, 1000)), None).is_err());
    }
    #[test]
    fn uncertain_comment_ownership_and_invalid_input_keep_source_fallback() {
        for (s, index) in [
            ("x = [1, # attached\n 2]", Some(0)),
            ("x = [1 # attached\n]", None),
            ("x = [# empty\n]", None),
        ] {
            assert!(edit(s, "x", index, Some("true")).is_err(), "{s}");
        }
        assert_eq!(
            edit("x = [1, # attached\n 2]", "x", None, Some("true"))
                .unwrap()
                .content,
            "x = [1, # attached\n 2, true]"
        );
        for v in [
            "",
            "null",
            "1 # comment",
            "1\ny = 2",
            "[1]",
            "{a=1}",
            "'''text'''",
            "\"\"\"text\"\"\"",
        ] {
            assert!(edit("x = []", "x", None, Some(v)).is_err(), "{v}");
        }
    }
    #[test]
    fn analysis_and_edit_budgets_are_bounded_without_exposing_all_items() {
        let s = format!("x = [{}]", vec!["1"; 2001].join(","));
        let e = entry(&s, "x");
        assert_eq!(analyze_toml_source(&s).outline.len(), 1);
        assert!(inspect_toml_array_items_source(&s, e.start, e.end).is_err());
        assert!(change(
            &" ".repeat(MAX_TOML_SOURCE_BYTES + 1),
            0,
            0,
            None,
            Some("1")
        )
        .is_err());
    }

    fn replace_item(s: &str, p: &str, i: usize, value: &str) -> Result<TomlKeyChange, String> {
        let e = entry(s, p);
        let item = inspect_toml_array_items_source(s, e.start, e.end)?.remove(i);
        replace_toml_array_item_source(s, e.start, e.end, item.start, item.end, value)
    }
    #[test]
    fn replace_item_supports_scalar_types_and_exact_selection() {
        for (value, kind) in [
            ("'内容,#😀'", "文本"),
            ("0xFF", "数字"),
            ("9_223_372_036_854_775_807", "数字"),
            ("-1.25e3", "数字"),
            ("false", "布尔"),
            ("2026-10-24T10:20:30Z", "日期时间"),
            ("07:32:00", "日期时间"),
        ] {
            let r = replace_item("items = [1, 'keep',]\n", "items", 0, value).unwrap();
            assert_eq!(r.content, format!("items = [{value}, 'keep',]\n"));
            assert_eq!(&r.content[r.start..r.end], value);
            assert_eq!(r.value_type.as_deref(), Some(kind));
        }
    }
    #[test]
    fn replace_item_preserves_bom_crlf_comments_quoted_keys_and_siblings() {
        let s = "\u{feff}# 中文😀\r\n[root]\r\n\"a.b\" = [\r\n 0xFF, # first\r\n '文本😀', # selected\r\n 2026-10-24,\r\n]\r\n[other]\r\nitems = [8_080]\r\n";
        for (i, old) in ["0xFF", "'文本😀'", "2026-10-24"].iter().enumerate() {
            let r = replace_item(s, "root[\"a.b\"]", i, "true").unwrap();
            assert_eq!(r.content, s.replacen(old, "true", 1));
        }
    }
    #[test]
    fn replace_item_rejects_complex_ownership_and_values_without_changing_source() {
        for (s, p) in [
            ("items = [1, [2]]", "items"),
            ("items = [1, {a=2}]", "items"),
            ("items = [1, '''text''']", "items"),
            ("a.b = [1]", "a.b"),
            ("[[a]]\nitems = [1]", "a[0].items"),
        ] {
            assert!(replace_item(s, p, 0, "true").is_err(), "{s}");
        }
    }
    #[test]
    fn replace_item_rejects_stale_partial_unicode_and_budget_ranges() {
        let s = "items = ['中文😀', 2]";
        let e = entry(s, "items");
        for (a, b) in [(999, 1000), (e.start, e.end), (11, 12), (19, 10)] {
            assert!(replace_toml_array_item_source(s, e.start, e.end, a, b, "true").is_err());
        }
        let huge = format!("items = [{}]", vec!["1"; 2001].join(","));
        let e = entry(&huge, "items");
        assert!(replace_toml_array_item_source(
            &huge,
            e.start,
            e.end,
            e.start + 1,
            e.start + 2,
            "2"
        )
        .is_err());
        assert!(replace_item(
            "items = [1]",
            "items",
            0,
            &"1".repeat(MAX_TOML_SOURCE_BYTES + 1)
        )
        .is_err());
    }
    #[test]
    fn replace_item_rejects_injection_comments_multiline_and_invalid_literals() {
        for value in [
            "",
            "null",
            "1 # comment",
            "1\ny = 2",
            "[1]",
            "{a=1}",
            "'''text'''",
            "\"\"\"text\"\"\"",
            "1, 2",
            "true]\nother = 2",
        ] {
            assert!(
                replace_item("items = [1, 2] # keep\n", "items", 0, value).is_err(),
                "{value}"
            );
        }
    }
    #[test]
    fn replace_item_continues_by_new_ranges_and_never_rewrites_other_literals() {
        let s = "__v_raw = [0xFF, 'old', true,]\nother = 8_080\n";
        let a = replace_item(s, "__v_raw", 1, "2026-10-24").unwrap();
        let b = replace_item(&a.content, "__v_raw", 1, "'longer 😀'").unwrap();
        assert_eq!(b.content, s.replace("'old'", "'longer 😀'"));
        assert_eq!(
            replace_item(&b.content, "__v_raw", 1, "'old'")
                .unwrap()
                .content,
            s
        );
    }

    fn copy_item(s: &str, p: &str, index: usize) -> Result<TomlKeyChange, String> {
        let e = entry(s, p);
        let item = inspect_toml_array_items_source(s, e.start, e.end)?.remove(index);
        copy_toml_array_item_source(s, e.start, e.end, item.start, item.end)
    }
    #[test]
    fn copy_preserves_raw_types_quotes_unicode_and_selection() {
        for raw in [
            "0xFF",
            "8_080",
            "1.20e+2",
            "true",
            "1979-05-27",
            "'文本😀'",
            "\"a\\nb\"",
        ] {
            let s = format!("items = [1, {raw}, false,]\nother = 8_080\n");
            let r = copy_item(&s, "items", 1).unwrap();
            assert_eq!(
                r.content,
                s.replacen(&format!("{raw}, false"), &format!("{raw}, {raw}, false"), 1)
            );
            assert_eq!(&r.content[r.start..r.end], raw);
        }
    }
    #[test]
    fn copy_first_last_bom_crlf_parent_and_comments_stay_in_place() {
        let s = "\u{feff}# 中文😀\r\n[root]\r\nitems = [\r\n  0xFF,\r\n  '字',\r\n]\r\n# independent\r\n[other]\r\nitems = [8_080]\r\n";
        for (i, raw) in [(0, "0xFF"), (1, "'字'")] {
            let r = copy_item(s, "root.items", i).unwrap();
            assert_eq!(r.content, s.replacen(raw, &format!("{raw}, {raw}"), 1));
        }
        let s = "items = [1, # attached\n 2]\n";
        assert!(copy_item(s, "items", 0).is_err());
    }
    #[test]
    fn copy_rejects_stale_partial_complex_scopes_and_item_budget() {
        let s = "items = ['😀']";
        let e = entry(s, "items");
        let i = inspect_toml_array_items_source(s, e.start, e.end)
            .unwrap()
            .remove(0);
        for (a, b) in [
            (i.start + 2, i.end),
            (i.start, i.end - 1),
            (usize::MAX, usize::MAX),
            (i.end, i.start),
        ] {
            assert!(copy_toml_array_item_source(s, e.start, e.end, a, b).is_err());
        }
        for (s, p) in [
            ("items = [[1]]", "items"),
            ("items = [{x=1}]", "items"),
            ("x.items = [1]", "x.items"),
            ("[[x]]\nitems = [1]", "x[0].items"),
            ("items = ['''text''']", "items"),
        ] {
            assert!(copy_item(s, p, 0).is_err(), "{s}");
        }
        let huge = format!("items = [{}]", vec!["1"; 2000].join(","));
        assert!(copy_item(&huge, "items", 0).is_err());
    }
    #[test]
    fn copy_then_edit_or_remove_uses_new_ranges_without_reformatting() {
        let s = "__v_raw = [0xFF, '字', true,]\nother = 8_080\n";
        let a = copy_item(s, "__v_raw", 1).unwrap();
        let b = replace_item(&a.content, "__v_raw", 2, "false").unwrap();
        assert_eq!(b.content, s.replace("'字', true", "'字', false, true"));
        let e = entry(&a.content, "__v_raw");
        assert_eq!(
            remove_toml_array_item_source(&a.content, e.start, e.end, a.start, a.end)
                .unwrap()
                .content,
            s.replace("'字', true", "'字',  true")
        );
        let c = copy_item(&a.content, "__v_raw", 2).unwrap();
        assert!(c.content.contains("'字', '字', '字'"));
    }
}
