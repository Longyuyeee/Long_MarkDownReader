use super::{analyze_toml_source, Document, Item, Value, MAX_TOML_SOURCE_BYTES};
use serde_json::{json, Value as Json};

fn selected(content: &str, start: usize, end: usize) -> Result<Document<&str>, String> {
    let analysis = analyze_toml_source(content);
    if !analysis.valid {
        return Err("TOML 语法存在错误，请先在源码中修复；草稿仍保留".into());
    }
    if !analysis
        .outline
        .iter()
        .any(|e| (e.literal || e.multiline_basic) && e.start == start && e.end == end)
    {
        return Err("多行文字的位置已变化，请重新选择字段；输入与草稿仍保留".into());
    }
    Document::parse(content).map_err(|_| "无法读取多行文字；草稿仍保留".into())
}

fn find(item: &Item, start: usize, end: usize) -> Option<&str> {
    match item {
        Item::Value(v) if v.span() == Some(start..end) => v.as_str(),
        Item::Table(t) => t.iter().find_map(|(_, v)| find(v, start, end)),
        Item::ArrayOfTables(a) => a
            .iter()
            .find_map(|t| t.iter().find_map(|(_, v)| find(v, start, end))),
        _ => None,
    }
}

pub fn inspect_toml_literal_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<String, String> {
    let doc = selected(content, start, end)?;
    find(doc.as_item(), start, end)
        .map(|s| s.replace("\r\n", "\n"))
        .ok_or_else(|| "无法确认多行文字的归属，请定位源码；草稿仍保留".into())
}

// A validation tree only: no output is ever serialized. Non-string scalar bytes
// also distinguish dates, NaN, numeric spellings, etc. without lossy coercion.
fn tree(source: &str, item: &Item, target: Option<(usize, usize, &str)>) -> Option<Json> {
    fn value(source: &str, v: &Value, target: Option<(usize, usize, &str)>) -> Option<Json> {
        Some(match v {
            Value::String(s) => {
                let text = match target {
                    Some((start, end, text)) if v.span() == Some(start..end) => text,
                    _ => s.value(),
                };
                json!(["string", text.replace("\r\n", "\n")])
            }
            Value::Array(a) => json!([
                "array",
                a.iter()
                    .map(|v| value(source, v, target))
                    .collect::<Option<Vec<_>>>()?
            ]),
            Value::InlineTable(t) => {
                let mut fields = serde_json::Map::new();
                for (k, v) in t.iter() {
                    fields.insert(k.into(), value(source, v, target)?);
                }
                json!(["inline-table", fields])
            }
            _ => json!(["scalar", source.get(v.span()?)?]),
        })
    }
    Some(match item {
        Item::Value(v) => value(source, v, target)?,
        Item::Table(t) => {
            let mut fields = serde_json::Map::new();
            for (k, v) in t.iter() {
                fields.insert(k.into(), tree(source, v, target)?);
            }
            json!(["table", fields])
        }
        Item::ArrayOfTables(a) => json!([
            "array-of-tables",
            a.iter()
                .map(|t| tree(source, &Item::Table(t.clone()), target))
                .collect::<Option<Vec<_>>>()?
        ]),
        Item::None => Json::Null,
    })
}

pub fn replace_toml_literal_source(
    content: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> Result<String, String> {
    let before = selected(content, start, end)?;
    let original = find(before.as_item(), start, end)
        .ok_or("无法确认多行文字的归属，请定位源码；草稿仍保留")?;
    if replacement.len() > MAX_TOML_SOURCE_BYTES {
        return Err("文字超过编辑大小上限；输入与草稿仍保留".into());
    }
    let text = replacement.replace("\r\n", "\n");
    let raw = &content[start..end];
    let basic = raw.starts_with("\"\"\"");
    if !basic && text.contains("'''") {
        return Err(
            "文字包含连续三个单引号，无法沿用当前格式；请定位源码修改，输入与草稿仍保留".into(),
        );
    }
    if !basic
        && text
            .chars()
            .any(|c| matches!(c, '\u{0}'..='\u{8}' | '\u{b}'..='\u{1f}' | '\u{7f}'))
    {
        return Err("文字包含不支持的控制字符，请移除后重试；输入与草稿仍保留".into());
    }
    if original.replace("\r\n", "\n") == text {
        return Ok(content.into());
    }
    let newline = raw
        .find('\n')
        .map(|n| n > 0 && raw.as_bytes()[n - 1] == b'\r')
        .or_else(|| {
            content
                .find('\n')
                .map(|n| n > 0 && content.as_bytes()[n - 1] == b'\r')
        })
        .unwrap_or(false);
    let eol = if newline { "\r\n" } else { "\n" };
    let delimiter = if basic { "\"\"\"" } else { "'''" };
    // Both multiline forms trim the first opening newline. Preserve the source
    // form and add that trimmed newline when the actual text starts with LF.
    let opening =
        if raw[3..].starts_with("\r\n") || raw[3..].starts_with('\n') || text.starts_with('\n') {
            eol
        } else {
            ""
        };
    let body = if basic {
        encode_basic(&text)
    } else {
        text.clone()
    };
    let token = format!("{delimiter}{opening}{}{delimiter}", body.replace('\n', eol));
    let candidate = format!("{}{token}{}", &content[..start], &content[end..]);
    if candidate.len() > MAX_TOML_SOURCE_BYTES || !analyze_toml_source(&candidate).valid {
        return Err("当前文字无法沿用原格式，请定位源码修改；输入与草稿仍保留".into());
    }
    let after =
        Document::parse(candidate.as_str()).map_err(|_| "多行文字格式不正确；草稿仍保留")?;
    let expected = tree(content, before.as_item(), Some((start, end, &text)))
        .ok_or("无法确认字段归属；草稿仍保留")?;
    if tree(&candidate, after.as_item(), None).as_ref() != Some(&expected) {
        return Err("无法确认只修改当前文字，请定位源码修改；输入与草稿仍保留".into());
    }
    Ok(candidate)
}

// Do not interpret user text as TOML escapes. Escape every quote/backslash,
// including closing delimiter runs and a backslash just before a newline.
// LF stays readable; other controls have lossless TOML Unicode escapes.
fn encode_basic(text: &str) -> String {
    let mut body = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '"' => body.push_str("\\\""),
            '\\' => body.push_str("\\\\"),
            '\n' | '\t' => body.push(c),
            '\u{0}'..='\u{1f}' | '\u{7f}' => {
                use std::fmt::Write;
                write!(body, "\\u{:04X}", c as u32).expect("writing a string cannot fail");
            }
            _ => body.push(c),
        }
    }
    body
}
