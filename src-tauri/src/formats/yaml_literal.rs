use super::*;

struct Layout {
    marker_start: usize,
    marker_end: usize,
    body_start: usize,
    body_end: usize,
    indent: usize,
    eol: &'static str,
}

// Scalar event spans begin at the first content character and may include the
// next field's indentation. Derive physical ownership from the proven key line.
fn layout(content: &str, field: &YamlField, end: usize) -> Option<Layout> {
    if field.rename_unavailable_reason.is_some() {
        return None;
    }
    let line_start = content[..field.start].rfind('\n').map_or(0, |n| n + 1);
    let prefix = content
        .get(line_start..field.start)?
        .trim_start_matches('\u{feff}');
    if !prefix.bytes().all(|b| b == b' ') && !prefix.trim_start().eq("- ") {
        return None;
    }
    let header_end = field.end + content.get(field.end..)?.find('\n')?;
    let eol = if content.as_bytes().get(header_end.wrapping_sub(1)) == Some(&b'\r') {
        "\r\n"
    } else {
        "\n"
    };
    let tail = content.get(field.end..header_end)?.trim_end_matches('\r');
    let after_colon = tail.strip_prefix(':')?;
    let white = after_colon.len() - after_colon.trim_start_matches(' ').len();
    let marker_start = field.end + 1 + white;
    let indicator = content
        .get(marker_start..header_end)?
        .split([' ', '\r', '\t', '#'])
        .next()?;
    if !indicator.starts_with('|') || indicator.len() > 3 {
        return None;
    }
    let flags = &indicator[1..];
    if flags.chars().any(|c| !matches!(c, '+' | '-' | '1'..='9'))
        || flags.chars().filter(|c| matches!(c, '+' | '-')).count() > 1
        || flags.chars().filter(char::is_ascii_digit).count() > 1
    {
        return None;
    }
    let suffix = content
        .get(marker_start + indicator.len()..header_end)?
        .trim_matches([' ', '\t', '\r']);
    if !suffix.is_empty() && !suffix.starts_with('#') {
        return None;
    }
    let body_start = header_end + 1;
    let mut body_end = end;
    if end < content.len() {
        let row = content[..end].rfind('\n').map_or(0, |n| n + 1);
        if content.get(row..end)?.bytes().all(|b| b == b' ') {
            body_end = row;
        }
    }
    let body = content.get(body_start..body_end)?;
    let key_indent = prefix.len();
    let explicit = flags
        .chars()
        .find_map(|c| c.to_digit(10))
        .map(|n| key_indent + n as usize);
    let detected = body.split_inclusive('\n').find_map(|line| {
        let line = line.trim_end_matches(['\r', '\n']);
        (!line.trim_matches(' ').is_empty())
            .then(|| line.bytes().take_while(|b| *b == b' ').count())
    });
    let indent = explicit.or(detected).unwrap_or(key_indent + 2);
    if indent <= key_indent || indent > 4096 {
        return None;
    }
    for line in body.split_inclusive('\n') {
        if line.ends_with('\n') && line.ends_with("\r\n") != (eol == "\r\n") {
            return None;
        }
        let raw = line.trim_end_matches(['\r', '\n']);
        if !raw.trim_matches(' ').is_empty() && !raw.starts_with(&" ".repeat(indent)) {
            return None;
        }
    }
    Some(Layout {
        marker_start,
        marker_end: marker_start + indicator.len(),
        body_start,
        body_end,
        indent,
        eol,
    })
}

pub(super) fn available(content: &str, field: Option<&YamlField>, end: usize) -> bool {
    field.is_some_and(|f| layout(content, f, end).is_some())
}

fn decoded(content: &str, start: usize, end: usize) -> Option<String> {
    let offsets = source_offsets(content);
    Parser::new_from_str(parser_source(content)).find_map(|event| match event.ok()? {
        (Event::Scalar(value, ScalarStyle::Literal, 0, None), span)
            if byte_offset(&offsets, span.start.index()) == start
                && byte_offset(&offsets, span.end.index()) == end =>
        {
            Some(value.into_owned())
        }
        _ => None,
    })
}

pub fn inspect_yaml_literal_source(
    content: &str,
    start: usize,
    end: usize,
) -> Result<String, String> {
    let analysis = analyze_yaml_source(content);
    if !analysis.valid {
        return Err("YAML 语法存在错误，请先在源码中修复".into());
    }
    if !analysis
        .outline
        .iter()
        .any(|e| e.start == start && e.end == end && e.literal && e.editable)
    {
        return Err("多行文字的位置或归属已变化，请重新选择；当前草稿仍保留".into());
    }
    decoded(content, start, end)
        .ok_or_else(|| "无法确认多行文字，请定位源码；当前草稿仍保留".into())
}

pub(super) fn replace(
    content: &str,
    entry: &YamlOutlineEntry,
    replacement: &str,
) -> Result<String, String> {
    let value = replacement.replace("\r\n", "\n");
    if value.len() > MAX_YAML_SOURCE_BYTES {
        return Err("文字超过编辑大小上限；输入与草稿仍保留".into());
    }
    if value.chars().any(|c| {
        (c.is_control() && c != '\n' && c != '\t')
            || matches!(c, '\u{85}' | '\u{2028}' | '\u{2029}')
    }) {
        return Err("文字包含不支持的控制字符，请移除后重试；输入与草稿仍保留".into());
    }
    let original = decoded(content, entry.start, entry.end).ok_or("文字位置已变化，请重新选择")?;
    if original == value {
        return Ok(content.into());
    }
    let owned = entry
        .field
        .as_ref()
        .and_then(|field| layout(content, field, entry.end))
        .ok_or("块文本归属无法确认，请定位源码；输入与草稿仍保留")?;
    let old_marker = &content[owned.marker_start..owned.marker_end];
    let trailing = value.bytes().rev().take_while(|b| *b == b'\n').count();
    let mode = if trailing == 0 {
        '-'
    } else if trailing > 1 || value.trim_matches('\n').is_empty() || old_marker.contains('+') {
        '+'
    } else {
        '\0'
    };
    let mut marker = old_marker
        .chars()
        .filter(|c| !matches!(c, '+' | '-'))
        .collect::<String>();
    if mode != '\0' {
        marker.push(mode);
    }
    // Keep the original header when its chomping already expresses the input.
    if (trailing == 0 && old_marker.contains('-'))
        || (trailing == 1 && !value.trim_matches('\n').is_empty() && !old_marker.contains('-'))
        || (trailing > 1 && old_marker.contains('+'))
    {
        marker = old_marker.into();
    }
    let indent = " ".repeat(owned.indent);
    let mut body = String::new();
    for line in value.split_inclusive('\n') {
        let text = line.strip_suffix('\n').unwrap_or(line);
        if body
            .len()
            .saturating_add(indent.len())
            .saturating_add(text.len())
            .saturating_add(2)
            > MAX_YAML_SOURCE_BYTES
        {
            return Err("缩进后的文字超过编辑大小上限；输入与草稿仍保留".into());
        }
        body.push_str(&indent);
        body.push_str(text);
        body.push_str(owned.eol);
    }
    if !old_marker.contains('+') && mode != '+' {
        let old_body = &content[owned.body_start..owned.body_end];
        let ignored = old_body
            .split_inclusive('\n')
            .rev()
            .take_while(|line| line.trim_matches([' ', '\t', '\r', '\n']).is_empty())
            .map(str::len)
            .sum::<usize>();
        body.push_str(&old_body[old_body.len() - ignored..]);
    }
    let mut expected = MarkedYamlOwned::load_from_str(parser_source(content))
        .map_err(|_| "源码已变化，请重新选择")?;
    let mut literal = MarkedYamlOwned::load_from_str("''")
        .map_err(|_| "无法准备文本值")?
        .remove(0);
    literal.data = YamlDataOwned::Value(ScalarOwned::String(value.clone()));
    if replace_value_node(
        &mut expected[0],
        content,
        &source_offsets(content),
        entry.start,
        entry.end,
        &literal,
    )? != 1
    {
        return Err("字段位置无法唯一确认，请定位源码；输入与草稿仍保留".into());
    }
    let candidate_with = |body: &str| {
        format!(
            "{}{marker}{}{body}{}",
            &content[..owned.marker_start],
            &content[owned.marker_end..owned.body_start],
            &content[owned.body_end..]
        )
    };
    // Preserve an existing EOF without a line ending whenever semantics permit.
    if owned.body_end == content.len() && !content.ends_with('\n') && body.ends_with(owned.eol) {
        let shorter = candidate_with(&body[..body.len() - owned.eol.len()]);
        if shorter.len() <= MAX_YAML_SOURCE_BYTES
            && MarkedYamlOwned::load_from_str(parser_source(&shorter))
                .is_ok_and(|parsed| parsed == expected)
            && analyze_yaml_source(&shorter).valid
        {
            return Ok(shorter);
        }
    }
    let candidate = candidate_with(&body);
    if candidate.len() > MAX_YAML_SOURCE_BYTES {
        return Err("修改后超过文档大小上限；输入与草稿仍保留".into());
    }
    let parsed = MarkedYamlOwned::load_from_str(parser_source(&candidate))
        .map_err(|_| "这些文字在当前块中无法可靠保存，请定位源码；输入与草稿仍保留")?;
    if parsed != expected || !analyze_yaml_source(&candidate).valid {
        return Err("这些文字会改变其他内容或结尾换行，请定位源码；输入与草稿仍保留".into());
    }
    Ok(candidate)
}
