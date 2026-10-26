use super::*;

// Like ordinary item deletion, retain all comments and whitespace outside
// the selected literal. A closing-line comment becomes a standalone comment;
// never attach it to a surviving item by joining two physical lines.
pub(super) fn remove(
    content: &str,
    doc: &Document<&str>,
    array: &Array,
    range: Range<usize>,
    selected: Range<usize>,
) -> Result<TomlKeyChange, String> {
    if !simple_array(content, array) {
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
    if comments {
        // Shared-line values cannot release their comment without changing
        // its ownership. Own-line comments remain exactly in their slots,
        // including on subsequent deletions from the current draft.
        move_line(content, &selected)?;
    }
    let next = spans.get(index + 1).map_or(range.end - 1, |r| r.start);
    let following = gap(&content[selected.end..next])?.map(|i| selected.end + i);
    let comma = if index + 1 < spans.len() {
        Some(following.ok_or(FALLBACK)?)
    } else if following.is_some() || index == 0 {
        following
    } else {
        let previous = spans[index - 1].end;
        Some(previous + gap(&content[previous..selected.start])?.ok_or(FALLBACK)?)
    };
    let mut cuts = vec![selected.clone()];
    if let Some(i) = comma {
        cuts.push(i..i + 1);
    }
    cuts.sort_unstable_by(|a, b| b.start.cmp(&a.start));
    let mut candidate = content.to_string();
    for cut in cuts {
        candidate.replace_range(cut, "");
    }
    let new_range = range.start..range.end - (content.len() - candidate.len());
    let parsed = prepare(&candidate, &new_range)?;
    let changed = find_array(parsed.as_item(), &new_range).ok_or(FALLBACK)?;
    let mut expected = literals(content, array).ok_or(FALLBACK)?;
    expected.remove(index);
    if literals(&candidate, changed).as_ref() != Some(&expected)
        || masked_tree(content, doc.as_item(), &range).ok_or(FALLBACK)?
            != masked_tree(&candidate, parsed.as_item(), &new_range).ok_or(FALLBACK)?
    {
        return Err("无法确认只删除当前数组项，请定位源码；草稿仍保留".into());
    }
    let selection = changed
        .get(index.min(changed.len().saturating_sub(1)))
        .and_then(Value::span)
        .unwrap_or(new_range);
    Ok(TomlKeyChange {
        content: candidate,
        start: selection.start,
        end: selection.end,
        value_type: None,
    })
}

#[cfg(test)]
#[path = "toml_array_delete_tests.rs"]
mod tests;
