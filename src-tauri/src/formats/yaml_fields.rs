use super::*;

#[derive(Clone)]
struct Target<'a> {
    node: &'a MarkedYamlOwned,
    start: usize,
    end: usize,
}

// Event ranges distinguish real mappings from expanded aliases and collections
// whose anchors/tags would make a local edit change other references.
fn ordinary_maps(content: &str, offsets: &[usize]) -> HashSet<(usize, usize)> {
    let mut stack: Vec<(bool, usize, bool)> = Vec::new();
    let mut maps = HashSet::new();
    for event in Parser::new_from_str(parser_source(content)) {
        let Ok((event, span)) = event else {
            return HashSet::new();
        };
        let is_mapping = matches!(&event, Event::MappingStart(..));
        match event {
            Event::MappingStart(anchor, tag) | Event::SequenceStart(anchor, tag) => {
                let blocked = stack.last().is_some_and(|v| v.2) || anchor > 0 || tag.is_some();
                stack.push((
                    is_mapping,
                    byte_offset(offsets, span.start.index()),
                    blocked,
                ));
            }
            Event::MappingEnd | Event::SequenceEnd => {
                if let Some((true, start, false)) = stack.pop() {
                    // Saphyr's loader closes collection nodes at span.start,
                    // which is the closing brace itself for flow mappings.
                    maps.insert((start, byte_offset(offsets, span.start.index())));
                }
            }
            _ => {}
        }
    }
    maps
}

fn bounds(node: &MarkedYamlOwned, content: &str, offsets: &[usize]) -> (usize, usize) {
    let start = byte_offset(offsets, node.span.start.index());
    let end = byte_offset(offsets, node.span.end.index());
    (
        start,
        if matches!(
            node.data,
            YamlDataOwned::Value(_) | YamlDataOwned::Representation(..)
        ) {
            scalar_end(content, start, end)
        } else {
            end
        },
    )
}

fn find_target<'a>(
    node: &'a MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    maps: &HashSet<(usize, usize)>,
    selected: (usize, usize),
    inside: bool,
) -> Option<Target<'a>> {
    let range = bounds(node, content, offsets);
    match &node.data {
        YamlDataOwned::Mapping(mapping) => {
            if !maps.contains(&range) || mapping.keys().any(|key| !matches!(&key.data, YamlDataOwned::Value(ScalarOwned::String(s)) if s != "<<")) { return None; }
            if (inside && range == selected)
                || (!inside
                    && mapping
                        .keys()
                        .any(|key| bounds(key, content, offsets) == selected))
            {
                return Some(Target {
                    node,
                    start: range.0,
                    end: range.1,
                });
            }
            mapping
                .values()
                .find_map(|value| find_target(value, content, offsets, maps, selected, inside))
        }
        YamlDataOwned::Sequence(items) => items
            .iter()
            .find_map(|value| find_target(value, content, offsets, maps, selected, inside)),
        _ => None,
    }
}

fn prepare(
    content: &str,
) -> Result<(Vec<MarkedYamlOwned>, Vec<usize>, HashSet<(usize, usize)>), String> {
    let analysis = analyze_yaml_source(content);
    if !analysis.valid {
        return Err("请先修复 YAML 语法；输入与草稿仍保留".into());
    }
    if analysis.document_count > 1 || has_duplicate_string_keys(content) {
        return Err("多文档或同级重复字段请先在源码中整理；输入与草稿仍保留".into());
    }
    let docs = MarkedYamlOwned::load_from_str(parser_source(content))
        .map_err(|_| "源码已变化，请重新选择")?;
    let offsets = source_offsets(content);
    let maps = ordinary_maps(content, &offsets);
    Ok((docs, offsets, maps))
}

fn apply_expected(
    node: &mut MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    target: (usize, usize),
    remove: Option<(usize, usize)>,
    pair: Option<&(MarkedYamlOwned, MarkedYamlOwned)>,
) -> usize {
    if bounds(node, content, offsets) == target {
        if let YamlDataOwned::Mapping(mapping) = &mut node.data {
            if let Some((key, value)) = pair {
                mapping.insert(key.clone(), value.clone());
            }
            if let Some(selected) = remove {
                let original = std::mem::take(mapping);
                for (key, value) in original {
                    if bounds(&key, content, offsets) != selected {
                        mapping.insert(key, value);
                    }
                }
            }
            return 1;
        }
    }
    match &mut node.data {
        YamlDataOwned::Mapping(mapping) => mapping
            .values_mut()
            .map(|value| apply_expected(value, content, offsets, target, remove, pair))
            .sum(),
        YamlDataOwned::Sequence(items) => items
            .iter_mut()
            .map(|value| apply_expected(value, content, offsets, target, remove, pair))
            .sum(),
        _ => 0,
    }
}

fn checked(
    candidate: String,
    expected: Vec<MarkedYamlOwned>,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, String> {
    let parsed = MarkedYamlOwned::load_from_str(parser_source(&candidate))
        .map_err(|_| "此处无法准确修改，请定位源码；输入与草稿仍保留")?;
    if parsed != expected
        || !analyze_yaml_source(&candidate).valid
        || has_duplicate_string_keys(&candidate)
    {
        return Err("无法确认只改变当前字段，请定位源码；输入与草稿仍保留".into());
    }
    Ok(YamlKeyChange {
        content: candidate,
        start,
        end,
        value_type: None,
    })
}

fn empty_document(content: &str) -> bool {
    parser_source(content)
        .lines()
        .all(|line| line.trim().is_empty() || line.trim_start().starts_with('#'))
}

pub fn add_yaml_field_source(
    content: &str,
    start: usize,
    end: usize,
    inside: bool,
    name: &str,
    value: &str,
) -> Result<YamlKeyChange, String> {
    let (mut docs, offsets, maps) = prepare(content)?;
    if name.is_empty() || name.len() > 4096 || name.contains(['\r', '\n']) || name == "<<" {
        return Err("请输入单行字段名（最多 4096 字节）；合并键请在源码中修改".into());
    }
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_YAML_SOURCE_BYTES || value.contains(['\r', '\n']) {
        return Err("请输入单行值；空值用 null，空字符串用引号".into());
    }
    let values = MarkedYamlOwned::load_from_str(value)
        .map_err(|_| "请输入合法的字符串、数字、布尔或 null")?;
    let mut counters = AnalysisCounters::default();
    let spans = inspect_events(value, &mut counters, &source_offsets(value));
    if values.len() != 1
        || !matches!(values[0].data, YamlDataOwned::Value(_))
        || !spans.contains(&(0, value.len()))
        || counters.anchors + counters.aliases + counters.tagged_nodes > 0
    {
        return Err("只添加一个简单值，请勿加入其他字段、注释、列表、标签或锚点".into());
    }
    let value_type = match &values[0].data {
        YamlDataOwned::Value(ScalarOwned::String(_)) => "文本",
        YamlDataOwned::Value(ScalarOwned::Boolean(_)) => "布尔",
        YamlDataOwned::Value(ScalarOwned::Null) => "空值",
        _ => "数字",
    };
    let typed = |mut result: YamlKeyChange| {
        result.value_type = Some(value_type.into());
        result
    };
    let key = string_key_literal(name, ScalarStyle::Plain);
    let pair_source = format!("{key}: {value}\n");
    let literal = MarkedYamlOwned::load_from_str(&pair_source)
        .map_err(|_| "字段名或值无法在这里表示，请调整输入")?;
    let YamlDataOwned::Mapping(literal_map) = &literal[0].data else {
        return Err("字段输入无效".into());
    };
    let pair = literal_map
        .iter()
        .next()
        .map(|(k, v)| (k.clone(), v.clone()))
        .ok_or("字段输入无效")?;
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    if start == 0 && end == 0 && empty_document(content) {
        let prefix = if content.is_empty() || content.ends_with('\n') || content == "\u{feff}" {
            ""
        } else {
            eol
        };
        let point = content.len() + prefix.len();
        return checked(
            format!("{content}{prefix}{key}: {value}{eol}"),
            literal,
            point,
            point + key.len(),
        )
        .map(typed);
    }
    let target = docs
        .first()
        .and_then(|doc| find_target(doc, content, &offsets, &maps, (start, end), inside))
        .ok_or("此处的映射归属不明确，锚点、别名、复杂键或标签请在源码中修改；输入仍保留")?;
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        unreachable!()
    };
    if mapping
        .keys()
        .any(|k| matches!(&k.data,YamlDataOwned::Value(ScalarOwned::String(s)) if s==name))
    {
        return Err("同一层级已有这个字段名，请换一个名称；输入与草稿仍保留".into());
    }
    let target_range = (target.start, target.end);
    let (at, insert, key_offset) = if content
        .get(target.start..)
        .is_some_and(|s| s.starts_with('{'))
    {
        let at = flow_close(content, target.end).ok_or("无法确认映射结束位置，请定位源码")?;
        let comma = if mapping.is_empty() {
            ""
        } else {
            let last = mapping.values().last().unwrap();
            let tail = &content[bounds(last, content, &offsets).1..at];
            if separator(tail).is_some() {
                " "
            } else {
                ", "
            }
        };
        (at, format!("{comma}{key}: {value}"), comma.len())
    } else {
        let first = mapping
            .keys()
            .next()
            .ok_or("空映射请使用 {} 后再添加字段")?;
        let first_start = bounds(first, content, &offsets).0;
        let line_start = content[..first_start]
            .rfind('\n')
            .map_or(usize::from(content.starts_with('\u{feff}')) * 3, |i| i + 1);
        let prefix = &content[line_start..first_start];
        if !prefix.chars().all(|c| c == ' ')
            && !(prefix.ends_with("- ") && prefix[..prefix.len() - 2].chars().all(|c| c == ' '))
        {
            return Err("此映射缩进无法准确接续，请定位源码；输入仍保留".into());
        }
        let indent = " ".repeat(prefix.len());
        let mut at = target.end;
        let line_start = content[..at].rfind('\n').map_or(0, |i| i + 1);
        if content[line_start..at]
            .chars()
            .all(|c| c == ' ' || c == '\t')
        {
            at = line_start;
        }
        let newline = if at == 0 || content[..at].ends_with('\n') {
            ""
        } else {
            eol
        };
        (
            at,
            format!("{newline}{indent}{key}: {value}{eol}"),
            newline.len() + indent.len(),
        )
    };
    if content.len() + insert.len() > MAX_YAML_SOURCE_BYTES {
        return Err("修改后源码超过分析上限；草稿仍保留".into());
    }
    let candidate = format!("{}{}{}", &content[..at], insert, &content[at..]);
    if apply_expected(
        &mut docs[0],
        content,
        &offsets,
        target_range,
        None,
        Some(&pair),
    ) != 1
    {
        return Err("字段归属无法唯一确认，请定位源码".into());
    }
    checked(
        candidate,
        docs,
        at + key_offset,
        at + key_offset + key.len(),
    )
    .map(typed)
}

// Return the sole structural comma, ignoring comments. Other non-whitespace
// tokens cannot be removed as if they were a separator.
fn separator(raw: &str) -> Option<usize> {
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
        if c == '#' {
            comment = true;
        } else if c == ',' && comma.is_none() {
            comma = Some(i);
        } else if !c.is_whitespace() {
            return None;
        }
    }
    comma
}

// With a trailing comma Saphyr marks MappingEnd at that separator. Consume
// only closing trivia from the parser boundary, never another field or value.
fn flow_close(content: &str, from: usize) -> Option<usize> {
    let mut comment = false;
    let mut comma = false;
    for (offset, c) in content.get(from..)?.char_indices() {
        if c == '\n' {
            comment = false;
            continue;
        }
        if comment {
            continue;
        }
        match c {
            '#' => comment = true,
            ',' if !comma => comma = true,
            '}' => return Some(from + offset),
            c if c.is_whitespace() => {}
            _ => return None,
        }
    }
    None
}

pub fn remove_yaml_field_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, String> {
    let (mut docs, offsets, maps) = prepare(content)?;
    let target = docs
        .first()
        .and_then(|doc| find_target(doc, content, &offsets, &maps, (start, end), false))
        .ok_or("此字段归属不明确，锚点、别名、复杂键或标签请在源码中修改；草稿仍保留")?;
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        unreachable!()
    };
    let pairs = mapping.iter().collect::<Vec<_>>();
    let index = pairs
        .iter()
        .position(|(key, _)| bounds(key, content, &offsets) == (start, end))
        .ok_or("字段位置已过期，请重新选择")?;
    let (_, value) = pairs[index];
    let (value_start, value_end) = bounds(value, content, &offsets);
    let mut counters = AnalysisCounters::default();
    if !inspect_events(content, &mut counters, &offsets).contains(&(value_start, value_end))
        || !matches!(value.data, YamlDataOwned::Value(_))
        || content[start..value_end].contains(['\r', '\n'])
        || content
            .get(end..value_start)
            .is_none_or(|between| between.trim() != ":")
    {
        return Err("多行值、集合、锚点和引用请在源码中删除，避免影响其他字段；草稿仍保留".into());
    }
    let range = (target.start, target.end);
    let (candidate, point) = if content
        .get(target.start..)
        .is_some_and(|s| s.starts_with('{'))
    {
        let comma = if pairs.len() == 1 {
            let close =
                flow_close(content, target.end).ok_or("无法确认映射结束位置，请定位源码")?;
            separator(&content[value_end..close]).map(|point| value_end + point)
        } else if index + 1 < pairs.len() {
            let next = bounds(pairs[index + 1].0, content, &offsets).0;
            Some(
                value_end
                    + separator(&content[value_end..next])
                        .ok_or("无法确认字段分隔符，请定位源码")?,
            )
        } else {
            let previous = bounds(pairs[index - 1].1, content, &offsets).1;
            Some(
                previous
                    + separator(&content[previous..start])
                        .ok_or("无法确认字段分隔符，请定位源码")?,
            )
        };
        let mut changes = vec![(start, value_end)];
        if let Some(comma) = comma {
            changes.push((comma, comma + 1));
        }
        changes.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        let mut candidate = content.to_string();
        for (from, to) in changes {
            candidate.replace_range(from..to, "");
        }
        (candidate, target.start)
    } else if pairs.len() == 1 {
        (
            format!("{}{{}}{}", &content[..start], &content[value_end..]),
            start,
        )
    } else {
        let line_start = content[..start]
            .rfind('\n')
            .map_or(usize::from(content.starts_with('\u{feff}')) * 3, |i| i + 1);
        if !content[line_start..start].chars().all(|c| c == ' ') {
            return Err("此字段与列表起始符共用一行，请在源码中删除；草稿仍保留".into());
        }
        let line_end = content[value_end..]
            .find('\n')
            .map_or(content.len(), |i| value_end + i + 1);
        let tail = &content[value_end..line_end];
        if !tail.trim().is_empty() && !tail.trim_start().starts_with('#') {
            return Err("字段结束位置不明确，请定位源码".into());
        }
        if tail.trim_start().starts_with('#') {
            let comment = value_end + tail.find('#').expect("comment checked");
            (
                format!("{}{}", &content[..start], &content[comment..]),
                start,
            )
        } else {
            (
                format!("{}{}", &content[..line_start], &content[line_end..]),
                line_start,
            )
        }
    };
    if apply_expected(
        &mut docs[0],
        content,
        &offsets,
        range,
        Some((start, end)),
        None,
    ) != 1
    {
        return Err("字段归属无法唯一确认，请定位源码".into());
    }
    checked(candidate, docs, point, point)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn add(source: &str, path: &str, name: &str, value: &str) -> Result<YamlKeyChange, String> {
        let entry = analyze_yaml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path);
        let (start, end, inside) = entry
            .map(|e| {
                if e.kind == "mapping" {
                    (e.start, e.end, true)
                } else {
                    let f = e.field.unwrap();
                    (f.start, f.end, false)
                }
            })
            .unwrap_or((0, 0, true));
        add_yaml_field_source(source, start, end, inside, name, value)
    }
    fn remove(source: &str, path: &str) -> Result<YamlKeyChange, String> {
        let field = analyze_yaml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap()
            .field
            .unwrap();
        remove_yaml_field_source(source, field.start, field.end)
    }
    #[test]
    fn add_retains_bom_crlf_comments_numbers_and_parent_ownership() {
        let source="\u{feff}# 中文😀\r\nroot:\r\n  old: 0xFF # 保留\r\nother:\r\n  old: 9007199254740993123456789\r\n";
        let result = add(source, "$.root.old", "new", "42").unwrap();
        assert_eq!(
            result.content,
            source.replace("other:\r\n", "  new: 42\r\nother:\r\n")
        );
        assert_eq!(&result.content[result.start..result.end], "new");
        assert_eq!(result.value_type.as_deref(), Some("数字"));
        assert_eq!(
            add(source, "$.root", "new", "42").unwrap().content,
            result.content
        );
    }
    #[test]
    fn add_flow_empty_mappings_and_comment_only_empty_documents() {
        for (source, path, expected) in [
            ("root: {old: 1}\n", "$.root", "root: {old: 1, new: true}\n"),
            ("root: {} # keep\n", "$.root", "root: {new: true} # keep\n"),
            ("{}\n", "$", "{new: true}\n"),
            ("# keep\n", "$", "# keep\nnew: true\n"),
            ("", "$", "new: true\n"),
            ("root: {old: 1,}\n", "$.root", "root: {old: 1, new: true}\n"),
        ] {
            assert_eq!(add(source, path, "new", "true").unwrap().content, expected);
        }
    }
    #[test]
    fn add_validates_key_string_type_sibling_duplicates_and_single_literal() {
        let source = "root: {old: 'value'}\n";
        assert_eq!(
            add(source, "$.root", "true", "null").unwrap().content,
            "root: {old: 'value', \"true\": null}\n"
        );
        assert!(add(source, "$.root", "old", "2").is_err());
        for value in [
            "",
            "1 # comment",
            "1\nnext: 2",
            "{x: 1}",
            "[1,2]",
            "&x 2",
            "!tag value",
            "---\n1",
        ] {
            assert!(add(source, "$.root", "new", value).is_err(), "{value}");
        }
        for name in ["", "<<", "a\nb"] {
            assert!(add(source, "$.root", name, "1").is_err());
        }
        assert!(add("old: 1\nold: 2\n", "$", "new", "1").is_err());
    }
    #[test]
    fn remove_block_fields_preserves_comments_bom_and_empty_mapping_identity() {
        let source="\u{feff}# document\r\nroot:\r\n  old: '我的草稿' # keep this\r\n  next: 1_234\r\nother: 2\r\n";
        let removed = remove(source, "$.root.old").unwrap();
        assert_eq!(removed.content, source.replace("old: '我的草稿' ", ""));
        assert_eq!(
            remove(&removed.content, "$.root.next").unwrap().content,
            removed.content.replace("next: 1_234", "{}")
        );
        assert_eq!(remove("old: 1\n", "$.old").unwrap().content, "{}\n");
        assert_eq!(
            remove("old: 1\nnext: 2\n", "$.old").unwrap().content,
            "next: 2\n"
        );
    }
    #[test]
    fn remove_flow_first_middle_last_and_only_pair_preserves_separators_and_comments() {
        let source = "root: {first: 1, middle: '内容', last: true}\n";
        for (path, expected) in [
            ("$.root.first", "root: { middle: '内容', last: true}\n"),
            ("$.root.middle", "root: {first: 1,  last: true}\n"),
            ("$.root.last", "root: {first: 1, middle: '内容' }\n"),
        ] {
            assert_eq!(remove(source, path).unwrap().content, expected);
        }
        assert_eq!(
            remove("root: {old: 1} # keep\n", "$.root.old")
                .unwrap()
                .content,
            "root: {} # keep\n"
        );
        let source = "root: {old: 1, # keep\n  next: 2}\n";
        assert_eq!(
            remove(source, "$.root.old").unwrap().content,
            "root: { # keep\n  next: 2}\n"
        );
    }
    #[test]
    fn references_tags_complex_keys_and_multiple_documents_keep_local_source_fallback() {
        for (source, path) in [
            ("root: &anchor {old: 1}\nref: *anchor\n", "$.root.old"),
            ("root: !tag {old: 1}\n", "$.root.old"),
            ("base: &x 1\nold: *x\n", "$.old"),
            ("old: |\n  text\n", "$.old"),
            ("old: [1,2]\n", "$.old"),
            ("old: 1\n---\nnext: 2\n", "$.old"),
        ] {
            assert!(remove(source, path).is_err(), "{source}");
        }
        assert!(add("root: &x {old: 1}\nref: *x\n", "$.root", "new", "1").is_err());
        let source = "base: &x {keep: 1}\nref: *x\nold: 2\n";
        assert!(remove(source, "$.old").is_ok());
        assert!(add(source, "$", "new", "1").is_ok());
    }
    #[test]
    fn stale_value_offsets_invalid_source_and_wrong_parent_are_rejected() {
        let source = "root: {old: 1}\nother: {old: 2}\n";
        let entry = analyze_yaml_source(source)
            .outline
            .into_iter()
            .find(|e| e.path == "$.root.old")
            .unwrap();
        assert!(remove_yaml_field_source(source, entry.start, entry.end).is_err());
        assert!(add_yaml_field_source(source, usize::MAX, usize::MAX, true, "new", "1").is_err());
        assert!(add_yaml_field_source("root: [\n", 0, 0, true, "new", "1").is_err());
        assert_eq!(
            remove(source, "$.other.old").unwrap().content,
            "root: {old: 1}\nother: {}\n"
        );
    }
    #[test]
    fn consecutive_changes_refresh_key_spans_and_keep_ordinary_values_editable() {
        let source = "root:\n  old: 原稿\nother: 0xFF\n";
        let added = add(source, "$.root", "字段", "'我的草稿'").unwrap();
        let field = analyze_yaml_source(&added.content)
            .outline
            .into_iter()
            .find(|e| e.path == "$.root.字段")
            .unwrap()
            .field
            .unwrap();
        let renamed = rename_yaml_key_source(&added.content, field.start, field.end, "next");
        let renamed = renamed.unwrap();
        assert_eq!(
            remove(&renamed.content, "$.root.next").unwrap().content,
            source
        );
        let empty = remove("root: {old: 1}\n", "$.root.old").unwrap();
        assert_eq!(
            add(&empty.content, "$.root", "again", "false")
                .unwrap()
                .content,
            "root: {again: false}\n"
        );
    }
}
