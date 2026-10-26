use super::*;

struct Layout {
    marker_start: usize,
    marker_end: usize,
    body_start: usize,
    body_end: usize,
    indent: usize,
    key_indent: usize,
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
    let tail = content.get(field.end..header_end)?.trim_end_matches('\r');
    let after_colon = tail.strip_prefix(':')?;
    let white = after_colon.len() - after_colon.trim_start_matches(' ').len();
    block_layout(content, field.end + 1 + white, prefix.len(), end)
}

// A standalone sequence block owns the nearest preceding nonblank header.
// Parser spans start in the body (or at the following boundary for empty
// blocks); only whitespace may occur between that header and the span start.
// Compact nested dashes and mapping headers cannot pass this physical check.
fn sequence_layout(content: &str, start: usize, end: usize) -> Option<Layout> {
    // For an empty final block Saphyr points at the indicator itself.
    let point = start + usize::from(content.get(start..)?.starts_with(['|', '>']));
    let before = content
        .get(..point)?
        .trim_end_matches([' ', '\t', '\r', '\n']);
    let line = before.rfind('\n').map_or(0, |n| n + 1);
    let header = content
        .get(line..before.len())?
        .trim_start_matches('\u{feff}');
    let indent = header.bytes().take_while(|b| *b == b' ').count();
    let rest = header.get(indent..)?.strip_prefix('-')?;
    if !rest.starts_with(' ') {
        return None;
    }
    let white = rest.len() - rest.trim_start_matches(' ').len();
    let marker =
        line + (content.get(line..)?.starts_with('\u{feff}') as usize * 3) + indent + 1 + white;
    let owned = block_layout(content, marker, indent, end)?;
    if start != marker
        && (start < owned.body_start
            || !content
                .get(owned.body_start..start)?
                .chars()
                .all(char::is_whitespace))
    {
        return None;
    }
    Some(owned)
}

fn block_layout(
    content: &str,
    marker_start: usize,
    key_indent: usize,
    end: usize,
) -> Option<Layout> {
    let header_end = marker_start + content.get(marker_start..)?.find('\n')?;
    let eol = if content.as_bytes().get(header_end.wrapping_sub(1)) == Some(&b'\r') {
        "\r\n"
    } else {
        "\n"
    };
    let indicator = content
        .get(marker_start..header_end)?
        .split([' ', '\r', '\t', '#'])
        .next()?;
    if !indicator.starts_with(['|', '>']) || indicator.len() > 3 {
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
        key_indent,
        eol,
    })
}

pub(super) fn available(
    content: &str,
    field: Option<&YamlField>,
    start: usize,
    end: usize,
    sequence_item: bool,
) -> bool {
    if let Some(field) = field {
        layout(content, field, end).is_some()
    } else {
        sequence_item && sequence_layout(content, start, end).is_some()
    }
}

// Shared physical ownership for existing sequence copy/order operations. Keep
// meaningful trailing empty lines with `+`; other trailing blanks stay in the
// separator slot. The final parse-tree check still proves exact scalar values.
pub(super) fn sequence_unit(content: &str, start: usize, end: usize) -> Option<(usize, usize, usize)> {
    let owned = sequence_layout(content, start, end)?;
    physical_unit(content, owned)
}

// A mapping field owns its proven key header and full block body. Compact
// sequence/mapping headers remain source-only for field copy and ordering.
pub(super) fn field_unit(content: &str, field: &YamlField, end: usize) -> Option<(usize, usize, usize)> {
    let owned = layout(content, field, end)?;
    let from = content[..field.start].rfind('\n').map_or(
        usize::from(content.starts_with('\u{feff}')) * 3,
        |n| n + 1,
    );
    if !content[from..field.start].bytes().all(|b| b == b' ') {
        return None;
    }
    physical_unit(content, owned)
}

fn physical_unit(content: &str, owned: Layout) -> Option<(usize, usize, usize)> {
    let from = content[..owned.marker_start].rfind('\n').map_or(
        usize::from(content.starts_with('\u{feff}')) * 3,
        |n| n + 1,
    );
    let mut finish = owned.body_end;
    if !content[owned.marker_start..owned.marker_end].contains('+') {
        let body = &content[owned.body_start..finish];
        let blanks = body.split_inclusive('\n').rev()
            .take_while(|line| line.trim_matches([' ', '\t', '\r', '\n']).is_empty())
            .map(str::len).sum::<usize>();
        finish -= blanks;
    }
    Some((from, finish.max(owned.body_start), owned.key_indent))
}

fn decoded(content: &str, start: usize, end: usize) -> Option<String> {
    let offsets = source_offsets(content);
    Parser::new_from_str(parser_source(content)).find_map(|event| match event.ok()? {
        (Event::Scalar(value, ScalarStyle::Literal | ScalarStyle::Folded, 0, None), span)
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
        .any(|e| e.start == start && e.end == end && (e.literal || e.folded) && e.editable)
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
    let owned = if let Some(field) = entry.field.as_ref() {
        layout(content, field, entry.end)
    } else {
        sequence_layout(content, entry.start, entry.end)
    }
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
    // Both block styles keep their form. An explicit indent is required
    // when the first nonempty content line itself starts with whitespace;
    // otherwise YAML would absorb that whitespace into its auto indentation.
    if !marker.chars().any(|c| c.is_ascii_digit())
        && value
            .split('\n')
            .find(|line| !line.is_empty())
            .is_some_and(|line| line.starts_with([' ', '\t']))
    {
        let width = owned.indent - owned.key_indent;
        if !(1..=9).contains(&width) {
            return Err("这些文字的缩进无法沿当前块表达，请定位源码；输入与草稿仍保留".into());
        }
        marker.insert(1, char::from_digit(width as u32, 10).unwrap());
    }
    let indent = " ".repeat(owned.indent);
    let mut body = String::new();
    let encoded = if entry.folded {
        folded_lines(&value)
    } else {
        value.clone()
    };
    for line in encoded.split_inclusive('\n') {
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

// A physical break between ordinary lines folds to a space. Between two
// ordinary paragraphs, insert one additional empty physical line; breaks
// adjacent to more-indented lines and leading/trailing breaks already survive.
// Full parsed-tree comparison remains the authority for every encoded result.
fn folded_lines(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    let mut previous_normal = false;
    for line in value.split_inclusive('\n') {
        let text = line.strip_suffix('\n').unwrap_or(line);
        if !text.is_empty() {
            let normal = !text.starts_with([' ', '\t']);
            if normal && previous_normal {
                encoded.push('\n');
            }
            previous_normal = normal;
        }
        encoded.push_str(line);
    }
    encoded
}
