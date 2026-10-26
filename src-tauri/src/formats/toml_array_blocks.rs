use super::*;

// Work on parser-owned raw literals. Separators belong to their slots, while
// a comment on a literal's closing line belongs to that item.
pub(super) fn copy(
    content: &str,
    doc: &Document<&str>,
    array: &Array,
    range: Range<usize>,
    selected: Range<usize>,
) -> Result<TomlKeyChange, String> {
    if !simple_array(content, array) || array.len() >= 2000 {
        return Err(FALLBACK.into());
    }
    let spans = array
        .iter()
        .map(Value::span)
        .collect::<Option<Vec<_>>>()
        .ok_or(FALLBACK)?;
    let index = spans
        .iter()
        .position(|r| *r == selected)
        .ok_or("条目位置已变化，请重新选择；草稿仍保留")?;
    let mut cursor = range.start + 1;
    let mut comments = false;
    for span in &spans {
        gap(&content[cursor..span.start])?;
        comments |= content[cursor..span.start].contains('#');
        cursor = span.end;
    }
    gap(&content[cursor..range.end - 1])?;
    comments |= content[cursor..range.end - 1].contains('#');
    let lines = spans
        .iter()
        .map(|r| move_line(content, r))
        .collect::<Result<Vec<_>, _>>();
    let physical = lines.as_ref().is_ok_and(|lines| {
        let mut cursor = range.start + 1;
        for line in lines {
            if cursor > line.start || !independent_move_gap(&content[cursor..line.start]) {
                return false;
            }
            cursor = line.finish;
        }
        cursor <= range.end - 1 && independent_move_gap(&content[cursor..range.end - 1])
    });
    let mut candidate = content.to_string();
    if physical {
        let line = &lines.as_ref().map_err(|_| FALLBACK)?[index];
        let indent = &content[line.start..selected.start];
        let eol = &content[line.body_end..line.finish];
        if eol.is_empty() {
            return Err(FALLBACK.into());
        }
        let separator = if line.separator.contains(',') {
            line.separator
        } else {
            ""
        };
        let clone = format!(
            "{indent}{}{separator}{}{eol}",
            &content[selected.clone()],
            line.comment
        );
        if candidate.len() + clone.len() + usize::from(separator.is_empty()) > MAX_TOML_SOURCE_BYTES
        {
            return Err("修改后源码超过分析上限；草稿仍保留".into());
        }
        candidate.insert_str(line.finish, &clone);
        if separator.is_empty() {
            candidate.insert(selected.end, ',');
        }
    } else {
        if comments {
            return Err(FALLBACK.into());
        }
        let clone = format!(", {}", &content[selected.clone()]);
        if candidate.len() + clone.len() > MAX_TOML_SOURCE_BYTES {
            return Err("修改后源码超过分析上限；草稿仍保留".into());
        }
        candidate.insert_str(selected.end, &clone);
    }
    let new_range = range.start..range.end + candidate.len() - content.len();
    let parsed = prepare(&candidate, &new_range)?;
    let changed = find_array(parsed.as_item(), &new_range).ok_or(FALLBACK)?;
    let mut expected = literals(content, array).ok_or(FALLBACK)?;
    expected.insert(index + 1, expected[index].clone());
    if literals(&candidate, changed).as_ref() != Some(&expected)
        || masked_tree(content, doc.as_item(), &range).ok_or(FALLBACK)?
            != masked_tree(&candidate, parsed.as_item(), &new_range).ok_or(FALLBACK)?
    {
        return Err("无法确认只复制当前数组项，请定位源码；草稿仍保留".into());
    }
    let selection = changed
        .get(index + 1)
        .and_then(Value::span)
        .ok_or(FALLBACK)?;
    Ok(TomlKeyChange {
        content: candidate,
        start: selection.start,
        end: selection.end,
        value_type: None,
    })
}

#[cfg(test)]
#[path = "toml_array_block_tests.rs"]
mod tests;
