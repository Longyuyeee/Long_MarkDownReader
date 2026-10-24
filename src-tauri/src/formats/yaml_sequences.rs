use super::fields::{bounds, checked, prepare, separator};
use super::*;

const FALLBACK: &str = "此列表的缩进、注释或引用关系无法可靠接续，请定位源码；输入与草稿仍保留";

fn ordinary_sequences(content: &str, offsets: &[usize]) -> HashSet<(usize, usize)> {
    let mut stack = Vec::new();
    let mut ranges = HashSet::new();
    for event in Parser::new_from_str(parser_source(content)) {
        let Ok((event, span)) = event else {
            return HashSet::new();
        };
        let sequence = matches!(&event, Event::SequenceStart(..));
        match event {
            Event::SequenceStart(anchor, tag) | Event::MappingStart(anchor, tag) => {
                let blocked = stack.last().is_some_and(|v: &(bool, usize, bool)| v.2)
                    || anchor > 0
                    || tag.is_some();
                stack.push((sequence, byte_offset(offsets, span.start.index()), blocked));
            }
            Event::SequenceEnd | Event::MappingEnd => {
                if let Some((true, start, false)) = stack.pop() {
                    ranges.insert((start, byte_offset(offsets, span.start.index())));
                }
            }
            _ => {}
        }
    }
    ranges
}

fn target<'a>(
    node: &'a MarkedYamlOwned,
    content: &str,
    offsets: &[usize],
    ranges: &HashSet<(usize, usize)>,
    selected: (usize, usize),
    after: bool,
) -> Option<&'a MarkedYamlOwned> {
    match &node.data {
        YamlDataOwned::Sequence(items) => {
            if !ranges.contains(&bounds(node, content, offsets)) {
                return None;
            }
            if (!after && bounds(node, content, offsets) == selected)
                || (after
                    && items
                        .iter()
                        .any(|v| bounds(v, content, offsets) == selected))
            {
                return Some(node);
            }
            items
                .iter()
                .find_map(|v| target(v, content, offsets, ranges, selected, after))
        }
        YamlDataOwned::Mapping(map) => {
            if map.keys().any(
                |k| !matches!(&k.data, YamlDataOwned::Value(ScalarOwned::String(s)) if s != "<<"),
            ) {
                return None;
            }
            map.values()
                .find_map(|v| target(v, content, offsets, ranges, selected, after))
        }
        _ => None,
    }
}

fn mutate(
    node: &mut MarkedYamlOwned,
    source: &str,
    offsets: &[usize],
    range: (usize, usize),
    index: usize,
    value: Option<&MarkedYamlOwned>,
) -> usize {
    if bounds(node, source, offsets) == range {
        if let YamlDataOwned::Sequence(items) = &mut node.data {
            if let Some(value) = value {
                items.insert(index, value.clone());
            } else {
                items.remove(index);
            }
            return 1;
        }
    }
    match &mut node.data {
        YamlDataOwned::Sequence(items) => items
            .iter_mut()
            .map(|v| mutate(v, source, offsets, range, index, value))
            .sum(),
        YamlDataOwned::Mapping(map) => map
            .values_mut()
            .map(|v| mutate(v, source, offsets, range, index, value))
            .sum(),
        _ => 0,
    }
}

fn close(source: &str, from: usize) -> Option<usize> {
    let mut comment = false;
    let mut comma = false;
    for (i, c) in source.get(from..)?.char_indices() {
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
            ']' => return Some(from + i),
            c if c.is_whitespace() => {}
            _ => return None,
        }
    }
    None
}

// Only a scalar token on its own block item line is eligible. Compact nested
// sequences and multiline scalars deliberately keep their source-only workflow.
fn block_line(source: &str, start: usize, end: usize) -> Result<(usize, usize, usize), String> {
    let line = source[..start]
        .rfind('\n')
        .map_or(usize::from(source.starts_with('\u{feff}')) * 3, |i| i + 1);
    let prefix = &source[line..start];
    let indent = prefix.bytes().take_while(|c| *c == b' ').count();
    let rest = &prefix[indent..];
    if !rest.starts_with('-') || rest.len() < 2 || !rest[1..].chars().all(|c| c == ' ') {
        return Err(FALLBACK.into());
    }
    let finish = source[end..]
        .find('\n')
        .map_or(source.len(), |i| end + i + 1);
    let tail = &source[end..finish];
    if !tail.trim().is_empty() && !tail.trim_start().starts_with('#') {
        return Err(FALLBACK.into());
    }
    Ok((line, finish, indent))
}

fn change(
    source: &str,
    start: usize,
    end: usize,
    after: bool,
    value: Option<&str>,
) -> Result<YamlKeyChange, String> {
    let (mut docs, offsets, _) = prepare(source)?;
    let ranges = ordinary_sequences(source, &offsets);
    let selected = (start, end);
    let node = docs
        .first()
        .and_then(|d| target(d, source, &offsets, &ranges, selected, after))
        .ok_or(FALLBACK)?;
    let YamlDataOwned::Sequence(items) = &node.data else {
        unreachable!()
    };
    let range = bounds(node, source, &offsets);
    let mut counters = AnalysisCounters::default();
    let scalar_ranges = inspect_events(source, &mut counters, &offsets);
    if items.iter().any(|v| {
        let r = bounds(v, source, &offsets);
        !matches!(v.data, YamlDataOwned::Value(_)) || r.0 >= r.1 || !scalar_ranges.contains(&r)
    }) {
        return Err(FALLBACK.into());
    }
    let index = if after {
        items
            .iter()
            .position(|v| bounds(v, source, &offsets) == selected)
            .ok_or(FALLBACK)?
    } else {
        items.len()
    };
    let insert_at = if after { index + 1 } else { index };
    let (literal, value_type) = if let Some(value) = value {
        let value = value.trim();
        if value.is_empty() || value.len() > MAX_YAML_SOURCE_BYTES || value.contains(['\r', '\n']) {
            return Err("请输入单行值；空值用 null，空字符串用引号".into());
        }
        let parsed = MarkedYamlOwned::load_from_str(value)
            .map_err(|_| "请输入合法的字符串、数字、布尔或 null")?;
        let mut counters = AnalysisCounters::default();
        let spans = inspect_events(value, &mut counters, &source_offsets(value));
        if parsed.len() != 1
            || !matches!(parsed[0].data, YamlDataOwned::Value(_))
            || !spans.contains(&(0, value.len()))
            || counters.anchors + counters.aliases + counters.tagged_nodes > 0
        {
            return Err("只添加一个简单值，请勿加入注释、集合、标签或锚点；输入仍保留".into());
        }
        let kind = match &parsed[0].data {
            YamlDataOwned::Value(ScalarOwned::String(_)) => "文本",
            YamlDataOwned::Value(ScalarOwned::Boolean(_)) => "布尔",
            YamlDataOwned::Value(ScalarOwned::Null) => "空值",
            _ => "数字",
        };
        (Some((value, parsed[0].clone())), Some(kind.to_string()))
    } else {
        (None, None)
    };
    let flow = source[range.0..].starts_with('[');
    let (candidate, point, length) = if let Some((raw, _)) = &literal {
        let (at, text, leading) = if flow {
            let closing = close(source, range.1).ok_or(FALLBACK)?;
            if items.is_empty() {
                (closing, raw.to_string(), 0)
            } else {
                let previous = bounds(&items[insert_at - 1], source, &offsets).1;
                let next = if insert_at < items.len() {
                    bounds(&items[insert_at], source, &offsets).0
                } else {
                    closing
                };
                if source[previous..next].contains('#') {
                    return Err(FALLBACK.into());
                }
                (previous, format!(", {raw}"), 2)
            }
        } else {
            let previous = bounds(&items[insert_at - 1], source, &offsets);
            let (_, finish, indent) = block_line(source, previous.0, previous.1)?;
            for item in items {
                let r = bounds(item, source, &offsets);
                if block_line(source, r.0, r.1)?.2 != indent {
                    return Err(FALLBACK.into());
                }
            }
            let eol = if source.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            let newline = if source[..finish].ends_with('\n') {
                ""
            } else {
                eol
            };
            (
                finish,
                format!("{newline}{}- {raw}{eol}", " ".repeat(indent)),
                newline.len() + indent + 2,
            )
        };
        if source.len() + text.len() > MAX_YAML_SOURCE_BYTES {
            return Err("修改后源码超过分析上限；输入与草稿仍保留".into());
        }
        (
            format!("{}{}{}", &source[..at], text, &source[at..]),
            at + leading,
            raw.len(),
        )
    } else if flow {
        let (from, to) = bounds(&items[index], source, &offsets);
        let closing = close(source, range.1).ok_or(FALLBACK)?;
        let separator_range = if items.len() == 1 {
            separator(&source[to..closing]).map(|i| to + i)
        } else if index + 1 < items.len() {
            Some(
                to + separator(&source[to..bounds(&items[index + 1], source, &offsets).0])
                    .ok_or(FALLBACK)?,
            )
        } else {
            let previous = bounds(&items[index - 1], source, &offsets).1;
            Some(previous + separator(&source[previous..from]).ok_or(FALLBACK)?)
        };
        let mut edits = vec![(from, to)];
        if let Some(at) = separator_range {
            edits.push((at, at + 1));
        }
        edits.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        let mut candidate = source.to_string();
        for (a, b) in edits {
            candidate.replace_range(a..b, "");
        }
        (candidate, range.0, 0)
    } else {
        let (from, to) = bounds(&items[index], source, &offsets);
        let (line, finish, indent) = block_line(source, from, to)?;
        let hyphen = line + indent;
        if items.len() == 1 {
            (
                format!("{}[]{}", &source[..hyphen], &source[to..]),
                hyphen,
                0,
            )
        } else if let Some(comment) = source[to..finish].find('#') {
            (
                format!("{}{}", &source[..hyphen], &source[to + comment..]),
                hyphen,
                0,
            )
        } else {
            (format!("{}{}", &source[..line], &source[finish..]), line, 0)
        }
    };
    if mutate(
        &mut docs[0],
        source,
        &offsets,
        range,
        if literal.is_some() { insert_at } else { index },
        literal.as_ref().map(|v| &v.1),
    ) != 1
    {
        return Err(FALLBACK.into());
    }
    let mut result =
        checked(candidate, docs, point, point + length).map_err(|_| FALLBACK.to_string())?;
    result.value_type = value_type;
    Ok(result)
}

pub fn add_yaml_sequence_item_source(
    content: &str,
    start: usize,
    end: usize,
    after: bool,
    value: &str,
) -> Result<YamlKeyChange, String> {
    change(content, start, end, after, Some(value))
}
pub fn remove_yaml_sequence_item_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, String> {
    change(content, start, end, true, None)
}

pub fn copy_yaml_sequence_item_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<YamlKeyChange, String> {
    let literal = content
        .get(start..end)
        .ok_or("条目位置已变化，请重新选择；草稿仍保留")?;
    // Existing insertion checks prove this is one ordinary scalar sequence
    // item and keep independent comments in place, without copying comments.
    change(content, start, end, true, Some(literal))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn edit(s: &str, path: &str, after: bool, v: Option<&str>) -> Result<YamlKeyChange, String> {
        let n = analyze_yaml_source(s)
            .outline
            .into_iter()
            .find(|e| e.path == path)
            .unwrap();
        change(s, n.start, n.end, after, v)
    }
    #[test]
    fn append_block_preserves_bom_crlf_literals_comments_and_parent() {
        let s="\u{feff}# 中文😀\r\nroot:\r\n  - 0xFF # keep\r\n  - '内容'\r\n# independent\r\nother: 8_080\r\n";
        let r = edit(s, "$.root", false, Some("true")).unwrap();
        assert_eq!(
            r.content,
            s.replace("# independent", "  - true\r\n# independent")
        );
        assert_eq!(r.value_type.as_deref(), Some("布尔"));
        assert_eq!(&r.content[r.start..r.end], "true");
    }
    #[test]
    fn insert_after_item_and_append_without_final_newline() {
        let s = "root:\n  - one # attached\n  # next\n  - two\nother: 3\n";
        assert_eq!(
            edit(s, "$.root[0]", true, Some("42")).unwrap().content,
            s.replace("  # next", "  - 42\n  # next")
        );
        assert_eq!(
            edit("- one", "$", false, Some("null")).unwrap().content,
            "- one\n- null\n"
        );
    }
    #[test]
    fn flow_first_middle_last_and_trailing_comma() {
        for (s, p, after, expected) in [
            (
                "root: [1, 'two', 3,]\n",
                "$.root[0]",
                true,
                "root: [1, true, 'two', 3,]\n",
            ),
            ("root: [1, 2]\n", "$.root", false, "root: [1, 2, true]\n"),
            ("[] # keep\n", "$", false, "[true] # keep\n"),
        ] {
            assert_eq!(edit(s, p, after, Some("true")).unwrap().content, expected);
        }
    }
    #[test]
    fn remove_flow_preserves_unrelated_tokens_and_comments() {
        for (s, p, want) in [
            ("x: [1, 2, 3]\n", "$.x[0]", "x: [ 2, 3]\n"),
            ("x: [1, 2, 3]\n", "$.x[1]", "x: [1,  3]\n"),
            ("x: [1, 2, 3,]\n", "$.x[2]", "x: [1, 2 ,]\n"),
            ("x: [1, # keep\n 2]\n", "$.x[0]", "x: [ # keep\n 2]\n"),
        ] {
            assert_eq!(edit(s, p, true, None).unwrap().content, want);
        }
    }
    #[test]
    fn remove_block_retains_comments_and_empty_sequence_identity() {
        let s = "root:\n  - one # keep\n  # independent\n  - two\nother: 1\n";
        let r = edit(s, "$.root[0]", true, None).unwrap();
        assert_eq!(r.content, s.replace("- one ", ""));
        let r = edit(&r.content, "$.root[0]", true, None).unwrap();
        assert!(r.content.contains("  []\nother"));
        assert_eq!(
            edit("- one\n- two\n", "$[0]", true, None).unwrap().content,
            "- two\n"
        );
        assert_eq!(
            edit("[1,] # keep\n", "$[0]", true, None).unwrap().content,
            "[] # keep\n"
        );
    }
    #[test]
    fn reject_complex_anchored_aliased_tagged_merge_multidoc_and_stale() {
        for (s, p) in [
            ("x: &a [1]\n", "$.x"),
            ("base: &a [1]\nx: *a\n", "$.x"),
            ("x: !tag [1]\n", "$.x"),
            ("x: [1, &a 2]\n", "$.x"),
            ("x: [[1]]\n", "$.x"),
            ("x:\n - |\n   line\n", "$.x"),
            ("<<: {a: 1}\nx: [1]\n", "$.x"),
            ("x: [1]\n---\nx: [2]\n", "$.x"),
        ] {
            assert!(edit(s, p, false, Some("true")).is_err(), "{s}");
        }
        assert!(change("x: [1]\n", 999, 1000, false, Some("1")).is_err());
        assert!(change("x: [1,\n", 0, 0, false, Some("1")).is_err());
    }
    #[test]
    fn reject_ambiguous_comments_and_compact_block_with_input_unchanged() {
        for (s, p) in [
            ("x: [1, # attached\n 2]\n", "$.x[0]"),
            ("x: [1 # attached\n]\n", "$.x[0]"),
            ("- - one\n  - two\n", "$[0][0]"),
        ] {
            assert!(edit(s, p, true, Some("42")).is_err(), "{s}");
        }
    }
    #[test]
    fn validate_single_scalar_type_and_source_size_budget() {
        for v in [
            "",
            "1 # comment",
            "1\n2",
            "[1]",
            "{a: 1}",
            "&a 1",
            "!tag 1",
            "---\n1",
        ] {
            assert!(edit("[]", "$", false, Some(v)).is_err(), "{v}");
        }
        for (v, t) in [
            ("'文本😀'", "文本"),
            ("42", "数字"),
            ("false", "布尔"),
            ("null", "空值"),
        ] {
            let r = edit("[]", "$", false, Some(v)).unwrap();
            assert_eq!(r.value_type.as_deref(), Some(t));
        }
        assert!(change(
            &" ".repeat(MAX_YAML_SOURCE_BYTES + 1),
            0,
            0,
            false,
            Some("1")
        )
        .is_err());
    }

    fn copy_item(s: &str, p: &str) -> Result<YamlKeyChange, String> {
        let e = analyze_yaml_source(s)
            .outline
            .into_iter()
            .find(|e| e.path == p)
            .unwrap();
        copy_yaml_sequence_item_source(s, e.start, e.end)
    }
    #[test]
    fn copy_block_raw_tokens_bom_crlf_and_independent_comments() {
        let s="\u{feff}# 中文😀\r\nroot:\r\n  - 0xFF # attached\r\n  # next item\r\n  - '字'\r\nother: 8_080\r\n";
        let r = copy_item(s, "$.root[0]").unwrap();
        assert_eq!(
            r.content,
            s.replace("  # next item", "  - 0xFF\r\n  # next item")
        );
        assert_eq!(&r.content[r.start..r.end], "0xFF");
        let r = copy_item(s, "$.root[1]").unwrap();
        assert_eq!(r.content, s.replace("other:", "  - '字'\r\nother:"));
        assert_eq!(
            copy_item("- null", "$[0]").unwrap().content,
            "- null\n- null\n"
        );
    }
    #[test]
    fn copy_flow_first_middle_last_and_exact_selected_literals() {
        for raw in [
            "0xFF",
            "8_080",
            "1.20",
            "false",
            "null",
            "~",
            "'字😀'",
            "\"a\\nb\"",
        ] {
            let s = format!("root: [1, {raw}, true,]\nother: [9]\n");
            let r = copy_item(&s, "$.root[1]").unwrap();
            assert_eq!(
                r.content,
                s.replacen(&format!("{raw}, true"), &format!("{raw}, {raw}, true"), 1)
            );
            assert_eq!(&r.content[r.start..r.end], raw);
        }
        assert_eq!(copy_item("[1, 2,]", "$[0]").unwrap().content, "[1, 1, 2,]");
        assert_eq!(copy_item("[1, 2,]", "$[1]").unwrap().content, "[1, 2, 2,]");
    }
    #[test]
    fn copy_rejects_ranges_fields_complex_references_and_ambiguous_comments() {
        for (s, p) in [
            ("x: 1", "$.x"),
            ("x: [[1]]", "$.x[0]"),
            ("x: [{a: 1}]", "$.x[0]"),
            ("x: &a [1]", "$.x[0]"),
            ("x: [!tag 1]", "$.x[0]"),
            ("base: &a 1\nx: [*a]", "$.x[0]"),
            ("<<: {a: 1}\nx: [1]", "$.x[0]"),
            ("x: [1]\n---\nx: [2]", "$.x[0]"),
            ("x: [1, # attached\n 2]", "$.x[0]"),
            ("x:\n - |\n   text\n", "$.x[0]"),
        ] {
            assert!(copy_item(s, p).is_err(), "{s}");
        }
        let s = "['😀']";
        for (a, b) in [(2, 5), (1, 6), (99, 100), (5, 1)] {
            assert!(copy_yaml_sequence_item_source(s, a, b).is_err());
        }
        assert!(
            copy_yaml_sequence_item_source(&" ".repeat(MAX_YAML_SOURCE_BYTES + 1), 0, 0).is_err()
        );
    }
    #[test]
    fn copy_then_remove_or_copy_again_preserves_siblings_and_source() {
        let s = "root:\n  - '字' # keep\n  - false\nother: 0xFF\n";
        let a = copy_item(s, "$.root[0]").unwrap();
        assert_eq!(
            remove_yaml_sequence_item_source(&a.content, a.start, a.end)
                .unwrap()
                .content,
            s
        );
        assert_eq!(
            copy_item(&a.content, "$.root[1]").unwrap().content,
            s.replace("  - false", "  - '字'\n  - '字'\n  - false")
        );
    }
}
