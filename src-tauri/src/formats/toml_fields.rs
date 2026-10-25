use super::*;

fn prepare(content: &str) -> Result<Document<&str>, String> {
    if !analyze_toml_source(content).valid {
        return Err("TOML 语法或分析范围暂不支持此操作，请定位源码；草稿仍保留".into());
    }
    Document::parse(content).map_err(|_| "当前 TOML 已变化，请重新选择字段".into())
}

// Paths consist of parser-owned key segments, never a dotted display string.
fn target(
    table: &Table,
    start: usize,
    end: usize,
    inside: bool,
    path: &mut Vec<String>,
) -> Option<Vec<String>> {
    for (name, item) in table.iter() {
        if !inside && table.key(name).and_then(Key::span) == Some(start..end) {
            return Some(path.clone());
        }
        if let Item::Table(child) = item {
            if inside
                && child.span() == Some(start..end)
                && !child.is_implicit()
                && !child.is_dotted()
            {
                let mut found = path.clone();
                found.push(name.into());
                return Some(found);
            }
            if !child.is_dotted() {
                path.push(name.into());
                let found = target(child, start, end, inside, path);
                path.pop();
                if found.is_some() {
                    return found;
                }
            }
        }
    }
    None
}

fn table_at<'a>(mut table: &'a Table, path: &[String]) -> Option<&'a Table> {
    for name in path {
        table = table.get(name)?.as_table()?;
    }
    Some(table)
}

fn fields_at<'a>(
    tree: &'a mut serde_json::Value,
    path: &[String],
) -> Option<&'a mut serde_json::Map<String, serde_json::Value>> {
    let mut tree = tree;
    for name in path {
        tree = tree.get_mut(1)?.as_object_mut()?.get_mut(name)?;
    }
    tree.get_mut(1)?.as_object_mut()
}

fn checked(
    content: &str,
    expected: &serde_json::Value,
    start: usize,
    end: usize,
    value_type: Option<String>,
) -> Result<TomlKeyChange, String> {
    let after = prepare(content)?;
    if source_tree(content, after.as_item(), None).as_ref() != Some(expected) {
        return Err("无法确认只改变当前字段，请定位源码；输入与草稿仍保留".into());
    }
    Ok(TomlKeyChange {
        content: content.into(),
        start,
        end,
        value_type,
    })
}

fn line_start(content: &str, at: usize) -> usize {
    content[..at].rfind('\n').map_or(0, |n| n + 1)
}
fn line_end(content: &str, at: usize) -> usize {
    content[at..]
        .find('\n')
        .map_or(content.len(), |n| at + n + 1)
}

/// Swap the exact assignment bodies, keeping line endings and independent comments in place.
pub fn move_toml_field_source(
    content: &str,
    start: usize,
    end: usize,
    direction: &str,
) -> Result<TomlKeyChange, String> {
    let fallback =
        "此字段的结构或注释归属无法准确移动，点键、数组表、集合和多行值请定位源码；草稿仍保留";
    if !matches!(direction, "up" | "down") {
        return Err("请选择上移或下移；草稿仍保留".into());
    }
    let doc = prepare(content)?;
    let path = target(doc.as_table(), start, end, false, &mut vec![]).ok_or(fallback)?;
    let table = table_at(doc.as_table(), &path).ok_or(fallback)?;
    if table.is_dotted() || (!path.is_empty() && table.is_implicit()) {
        return Err(fallback.into());
    }
    // Table.iter also contains descendant tables; only direct assignments are siblings.
    let fields: Vec<_> = table.iter().filter(|(_, item)| item.is_value()).collect();
    let index = fields
        .iter()
        .position(|(name, _)| table.key(name).and_then(Key::span) == Some(start..end))
        .ok_or(fallback)?;
    let neighbor = if direction == "up" {
        index.checked_sub(1)
    } else {
        index.checked_add(1).filter(|i| *i < fields.len())
    }
    .ok_or("已经是第一个或最后一个字段；草稿仍保留")?;
    let left = index.min(neighbor);
    let unit = |i: usize| -> Result<(usize, usize, usize), String> {
        let (name, item) = fields[i];
        let f =
            field_info(content, table.key(name).ok_or(fallback)?, item, false).ok_or(fallback)?;
        let v = item.as_value().ok_or(fallback)?;
        let span = v.span().ok_or(fallback)?;
        if f.rename_unavailable_reason.is_some()
            || matches!(v, Value::Array(_) | Value::InlineTable(_))
            || content
                .get(f.start..span.end)
                .is_none_or(|s| s.contains(['\r', '\n']))
        {
            return Err(fallback.into());
        }
        let from =
            line_start(content, f.start).max(usize::from(content.starts_with('\u{feff}')) * 3);
        let newline = content[span.end..]
            .find('\n')
            .map_or(content.len(), |i| span.end + i);
        let to = if content.as_bytes().get(newline.wrapping_sub(1)) == Some(&b'\r') {
            newline - 1
        } else {
            newline
        };
        let tail = &content[span.end..to];
        if !content[from..f.start]
            .chars()
            .all(|c| c == ' ' || c == '\t')
            || (!tail.trim().is_empty()
                && (!tail.starts_with([' ', '\t']) || !tail.trim_start().starts_with('#')))
        {
            return Err(fallback.into());
        }
        Ok((from, to, f.start))
    };
    let a = unit(left)?;
    let b = unit(left + 1)?;
    if a.1 > b.0 {
        return Err(fallback.into());
    }
    let gap = &content[a.1..b.0];
    let inner = gap
        .strip_prefix("\r\n")
        .or_else(|| gap.strip_prefix('\n'))
        .unwrap_or(gap);
    let lines: Vec<_> = inner.lines().collect();
    if !inner.trim().is_empty()
        && !(lines.first().is_some_and(|s| s.trim().is_empty())
            && lines.last().is_some_and(|s| s.trim().is_empty())
            && lines
                .iter()
                .all(|s| s.trim().is_empty() || s.trim_start().starts_with('#')))
    {
        return Err(fallback.into());
    }
    let before = content[..a.0].strip_suffix('\n').unwrap_or(&content[..a.0]);
    if before.rsplit('\n').next().is_some_and(|s| {
        s.trim_start_matches('\u{feff}')
            .trim_start()
            .starts_with('#')
    }) {
        return Err(fallback.into());
    }
    let raw_a = &content[a.0..a.1];
    let raw_b = &content[b.0..b.1];
    let candidate = format!(
        "{}{}{}{}{}",
        &content[..a.0],
        raw_b,
        gap,
        raw_a,
        &content[b.1..]
    );
    let after = prepare(&candidate)?;
    let expected = source_tree(content, doc.as_item(), None).ok_or(fallback)?;
    if source_tree(&candidate, after.as_item(), None).as_ref() != Some(&expected) {
        return Err(fallback.into());
    }
    let mut order: Vec<_> = fields.iter().map(|(name, _)| *name).collect();
    order.swap(left, left + 1);
    let actual: Vec<_> = table_at(after.as_table(), &path)
        .ok_or(fallback)?
        .iter()
        .filter(|(_, item)| item.is_value())
        .map(|(name, _)| name)
        .collect();
    if actual != order {
        return Err(fallback.into());
    }
    let point = if direction == "up" {
        a.0 + b.2 - b.0
    } else {
        a.0 + raw_b.len() + gap.len() + a.2 - a.0
    };
    Ok(TomlKeyChange {
        content: candidate,
        start: point,
        end: point + end - start,
        value_type: None,
    })
}

pub fn copy_toml_field_source(
    content: &str,
    start: usize,
    end: usize,
    name: &str,
) -> Result<TomlKeyChange, String> {
    let doc = prepare(content)?;
    let fallback =
        "此字段的结构无法准确复制，点键、数组表、集合和多行值请定位源码；名称与草稿仍保留";
    let path = target(doc.as_table(), start, end, false, &mut vec![]).ok_or(fallback)?;
    let table = table_at(doc.as_table(), &path).ok_or(fallback)?;
    let (original, item) = table
        .iter()
        .find(|(key, _)| table.key(key).and_then(Key::span) == Some(start..end))
        .ok_or(fallback)?;
    let field = field_info(
        content,
        table.key(original).ok_or(fallback)?,
        item,
        table.is_dotted(),
    )
    .ok_or(fallback)?;
    if field.rename_unavailable_reason.is_some() || (!path.is_empty() && table.is_implicit()) {
        return Err(fallback.into());
    }
    if name.is_empty() || name.len() > 4096 || name.chars().any(char::is_control) {
        return Err("请输入单行字段名（最多 4096 字节）；名称与草稿仍保留".into());
    }
    if table.contains_key(name) {
        return Err("同一层级已有这个字段名或表路径，请换一个名称；名称与草稿仍保留".into());
    }
    let value = item.as_value().ok_or(fallback)?;
    if matches!(value, Value::Array(_) | Value::InlineTable(_)) {
        return Err(fallback.into());
    }
    let span = value.span().ok_or(fallback)?;
    if content[start..span.end].contains(['\r', '\n']) {
        return Err(fallback.into());
    }
    let key = if name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        name.to_string()
    } else if content[start..end].starts_with('\'') && !name.contains('\'') {
        format!("'{name}'")
    } else {
        serde_json::to_string(name).map_err(|_| fallback)?
    };
    let from = line_start(content, start).max(usize::from(content.starts_with('\u{feff}')) * 3);
    let at = line_end(content, span.end);
    let tail = &content[span.end..at];
    if !tail.trim().is_empty() && !tail.trim_start_matches([' ', '\t']).starts_with('#') {
        return Err(fallback.into());
    }
    let separator = if content[..at].ends_with('\n') {
        ""
    } else if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let insertion = format!(
        "{separator}{}{key}{}{tail}",
        &content[from..start],
        &content[end..span.end]
    );
    if content
        .len()
        .checked_add(insertion.len())
        .is_none_or(|n| n > MAX_TOML_SOURCE_BYTES)
    {
        return Err("复制后源码超过分析上限；名称与草稿仍保留".into());
    }
    let mut expected = source_tree(content, doc.as_item(), None).ok_or(fallback)?;
    fields_at(&mut expected, &path)
        .ok_or(fallback)?
        .insert(name.into(), serde_json::json!(["value", &content[span]]));
    let point = at + separator.len() + start - from;
    checked(
        &format!("{}{}{}", &content[..at], insertion, &content[at..]),
        &expected,
        point,
        point + key.len(),
        None,
    )
}

pub fn add_toml_field_source(
    content: &str,
    start: usize,
    end: usize,
    inside: bool,
    name: &str,
    value: &str,
) -> Result<TomlKeyChange, String> {
    let doc = prepare(content)?;
    let path = if inside && start == 0 && end == 0 {
        vec![]
    } else {
        target(doc.as_table(), start, end, inside, &mut vec![])
            .ok_or("请从根部或已有普通表新增；点键与数组表请定位源码")?
    };
    let table = table_at(doc.as_table(), &path).ok_or("字段归属已变化，请重新选择")?;
    if table.is_dotted() || (!path.is_empty() && table.is_implicit()) {
        return Err("隐式表和点键请在源码中修改；输入与草稿仍保留".into());
    }
    if name.is_empty() || name.len() > 4096 || name.chars().any(char::is_control) {
        return Err("请输入单行字段名（最多 4096 字节）；输入与草稿仍保留".into());
    }
    if table.contains_key(name) {
        return Err("字段名已存在或与表路径冲突；输入与草稿仍保留".into());
    }
    let value = value.trim();
    if value.len() > MAX_TOML_SOURCE_BYTES || value.contains(['\r', '\n']) {
        return Err("请使用单行 TOML 值，多行内容请定位源码；输入与草稿仍保留".into());
    }
    let prefix = "__value__ = ";
    let wrapper = format!("{prefix}{value}");
    let parsed = Document::parse(wrapper.as_str())
        .map_err(|_| "请输入合法的 TOML 值；字符串需要引号，输入与草稿仍保留")?;
    let literal = parsed
        .get("__value__")
        .and_then(Item::as_value)
        .filter(|v| parsed.len() == 1 && v.span() == Some(prefix.len()..wrapper.len()))
        .ok_or("只新增当前字段，请勿加入注释、其他字段或表头；输入与草稿仍保留")?;
    let kind = match literal {
        Value::String(_) => "文本",
        Value::Integer(_) | Value::Float(_) => "数字",
        Value::Boolean(_) => "布尔",
        Value::Datetime(_) => "日期时间",
        Value::Array(_) => "数组",
        Value::InlineTable(_) => "内联表",
    };
    // JSON quoting is also valid TOML basic-key quoting. A dot remains one key.
    let key = if name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        name.to_string()
    } else {
        serde_json::to_string(name).map_err(|_| "无法编码字段名")?
    };
    let bom = usize::from(content.starts_with('\u{feff}')) * 3;
    let mut at = if path.is_empty() {
        bom
    } else {
        line_end(
            content,
            table.span().ok_or("表头位置不明确，请定位源码")?.end,
        )
    };
    // Only direct assignments belong to this table; a descendant header does not.
    for (name, item) in table.iter().filter(|(_, item)| item.is_value()) {
        let key_info = field_info(
            content,
            table.key(name).ok_or("字段位置不明确")?,
            item,
            false,
        )
        .ok_or("字段位置不明确")?;
        if key_info.rename_unavailable_reason.is_some() {
            return Err("表中包含无法确认归属的字段，请定位源码；输入仍保留".into());
        }
        at = at.max(line_end(content, item.span().ok_or("字段位置不明确")?.end));
    }
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let separator = if at > bom && !content[..at].ends_with('\n') {
        eol
    } else {
        ""
    };
    let insertion = format!("{separator}{key} = {value}{eol}");
    let candidate = format!("{}{}{}", &content[..at], insertion, &content[at..]);
    let mut expected =
        source_tree(content, doc.as_item(), None).ok_or("无法确认当前结构，请定位源码")?;
    fields_at(&mut expected, &path)
        .ok_or("无法确认表归属")?
        .insert(name.into(), serde_json::json!(["value", value]));
    let point = at + separator.len();
    checked(
        &candidate,
        &expected,
        point,
        point + key.len(),
        Some(kind.into()),
    )
}

pub fn remove_toml_field_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<TomlKeyChange, String> {
    let doc = prepare(content)?;
    let path = target(doc.as_table(), start, end, false, &mut vec![])
        .ok_or("请从普通键值字段删除；点键、表头和数组表请定位源码")?;
    let table = table_at(doc.as_table(), &path).ok_or("字段归属已变化")?;
    let (name, item) = table
        .iter()
        .find(|(name, _)| table.key(name).and_then(Key::span) == Some(start..end))
        .ok_or("字段位置已过期")?;
    let field = field_info(
        content,
        table.key(name).ok_or("字段位置不明确")?,
        item,
        table.is_dotted(),
    )
    .ok_or("字段位置不明确")?;
    if let Some(reason) = field.rename_unavailable_reason {
        return Err(reason);
    }
    let span = item
        .as_value()
        .and_then(Value::span)
        .ok_or("表头请在源码中修改；草稿仍保留")?;
    if content[start..span.end].contains(['\r', '\n']) {
        return Err("多行字段请在源码中删除；当前草稿仍保留".into());
    }
    let first = line_start(content, start);
    let from = first.max(usize::from(content.starts_with('\u{feff}')) * 3);
    let to = line_end(content, span.end);
    let suffix = &content[span.end..to];
    let replacement =
        if let Some(comment) = suffix.trim_start_matches([' ', '\t']).strip_prefix('#') {
            format!("{}#{}", &content[from..start], comment)
        } else if suffix.trim().is_empty() {
            String::new()
        } else {
            return Err("字段后缀无法确认，请定位源码；草稿仍保留".into());
        };
    let candidate = format!("{}{}{}", &content[..from], replacement, &content[to..]);
    let mut expected = source_tree(content, doc.as_item(), None).ok_or("无法确认当前结构")?;
    fields_at(&mut expected, &path)
        .ok_or("无法确认表归属")?
        .remove(name);
    checked(&candidate, &expected, from, from, None)
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
    fn add(s: &str, p: &str, k: &str, v: &str) -> Result<TomlKeyChange, String> {
        if p == "$" {
            return add_toml_field_source(s, 0, 0, true, k, v);
        }
        let e = entry(s, p);
        let inside = e.kind == "table";
        let (a, b) = if inside {
            (e.start, e.end)
        } else {
            let f = e.field.unwrap();
            (f.start, f.end)
        };
        add_toml_field_source(s, a, b, inside, k, v)
    }
    fn remove(s: &str, p: &str) -> Result<TomlKeyChange, String> {
        let f = entry(s, p).field.unwrap();
        remove_toml_field_source(s, f.start, f.end)
    }
    #[test]
    fn inserts_only_into_selected_table_before_next_header() {
        let s = "# 中文😀\nroot = 1\n[a]\nold=0xFF # 保留\n# 后续说明\n[b]\nold=2\n";
        let c = add(s, "a.old", "a.b", "true").unwrap();
        assert_eq!(
            c.content,
            s.replace("# 后续说明", "\"a.b\" = true\n# 后续说明")
        );
        assert_eq!(&c.content[c.start..c.end], "\"a.b\"");
        assert_eq!(c.value_type.as_deref(), Some("布尔"));
        assert_eq!(
            add(s, "$", "new", "[1, 2]").unwrap().content,
            s.replace("[a]", "new = [1, 2]\n[a]")
        );
    }
    #[test]
    fn empty_root_empty_table_and_no_final_newline() {
        assert_eq!(add("", "$", "first", "''").unwrap().content, "first = ''\n");
        assert_eq!(
            add("# 保留", "$", "first", "1").unwrap().content,
            "first = 1\n# 保留"
        );
        assert_eq!(
            add("[a] # 说明", "a", "x", "1").unwrap().content,
            "[a] # 说明\nx = 1\n"
        );
        let s = "[a]\nx=1\n[b]\ny=2";
        assert_eq!(
            add(s, "a", "z", "false").unwrap().content,
            s.replace("[b]", "z = false\n[b]")
        );
    }
    #[test]
    fn preserves_bom_crlf_unicode_comments_and_empty_table() {
        let s = "\u{feff}# 中文😀\r\n[a]\r\n  x = 8_080 # 保留\r\n[b]\r\nx=2\r\n";
        assert_eq!(
            add(s, "a", "中文", "'值'").unwrap().content,
            s.replace("[b]", "\"中文\" = '值'\r\n[b]")
        );
        assert_eq!(
            remove(s, "a.x").unwrap().content,
            s.replace("  x = 8_080 # 保留", "  # 保留")
        );
        assert_eq!(remove("\u{feff}x=1", "x").unwrap().content, "\u{feff}");
        assert_eq!(
            remove("[a]\nx=1\n[b]\nx=2\n", "a.x").unwrap().content,
            "[a]\n[b]\nx=2\n"
        );
    }
    #[test]
    fn literal_key_and_whole_single_line_values_roundtrip() {
        for v in [
            "'值'",
            "42",
            "false",
            "1979-05-27T07:32:00Z",
            "[1, 2]",
            "{ first = 1, second = 'x' }",
        ] {
            let c = add("[a]\n", "a", "a.b", v).unwrap();
            assert_eq!(remove(&c.content, "a[\"a.b\"]").unwrap().content, "[a]\n");
        }
    }
    #[test]
    fn rejects_duplicate_path_conflicts_injections_and_old_positions() {
        let s = "x=1\n[a]\ny=2\n";
        for k in ["x", "a"] {
            assert!(add(s, "$", k, "1").is_err());
        }
        for v in ["1 # injected", "1\nz=2", "[a]", "null", ""] {
            assert!(add(s, "$", "new", v).is_err());
        }
        assert!(add(s, "$", "bad\nkey", "1").is_err());
        assert!(add_toml_field_source(s, 99, 100, false, "x", "1").is_err());
    }
    #[test]
    fn keeps_dotted_and_array_table_operations_local_to_source() {
        for (s, p) in [("a.b=1\n", "a.b"), ("[[a]]\nx=1\n", "a[0].x")] {
            assert!(add(s, p, "new", "1").is_err());
            assert!(remove(s, p).is_err());
        }
        let s = "[a.b]\nx=1\n[a]\ny=2\n";
        assert_eq!(
            add(s, "a", "z", "1").unwrap().content,
            s.to_owned() + "z = 1\n"
        );
        assert!(add("[a.b]\nx=1\n", "a", "z", "1").is_err());
    }
    #[test]
    fn multiline_values_untouched_and_table_ownership_is_parser_proven() {
        let s = "title='''line\n[a]\n'''\n[a]\nx=[\n 1,\n 2\n]\n[a.child]\ny=3\n";
        assert_eq!(
            add(s, "a", "z", "2").unwrap().content,
            s.replace("[a.child]", "z = 2\n[a.child]")
        );
        assert!(remove(s, "a.x").is_err());
        assert!(remove(s, "title").is_err());
    }
    #[test]
    fn delete_keeps_independent_comments_and_unselected_values_exact() {
        let s = "# before\n[a]\nx = 1 # x note\n# neighbor\ny = {hex=0xFF, date=1979-05-27}\n";
        assert_eq!(
            remove(s, "a.x").unwrap().content,
            s.replace("x = 1 # x note", "# x note")
        );
        assert_eq!(
            remove(s, "a.y").unwrap().content,
            "# before\n[a]\nx = 1 # x note\n# neighbor\n"
        );
    }
}
