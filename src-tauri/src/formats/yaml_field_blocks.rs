use super::*;

const FALLBACK: &str = "此字段的缩进、注释或引用归属无法准确接续，请定位源码；输入与草稿仍保留";

fn body_end(source: &str, end: usize) -> usize {
    if source[..end].ends_with("\r\n") {
        end - 2
    } else if source[..end].ends_with('\n') {
        end - 1
    } else {
        end
    }
}

fn independent_gap(gap: &str) -> bool {
    let inner = gap
        .strip_prefix("\r\n")
        .or_else(|| gap.strip_prefix('\n'))
        .unwrap_or(gap);
    let lines: Vec<_> = inner.lines().collect();
    inner.trim().is_empty()
        || (lines.first().is_some_and(|s| s.trim().is_empty())
            && lines.last().is_some_and(|s| s.trim().is_empty())
            && lines
                .iter()
                .all(|s| s.trim().is_empty() || s.trim_start().starts_with('#')))
}

// Pair the same structural parent, then select the new parser-owned key range.
// The expected tree retains original spans even after insertion/reordering.
fn relocated(
    before: &MarkedYamlOwned,
    after: &MarkedYamlOwned,
    source: &str,
    offsets: &[usize],
    candidate: &str,
    next_offsets: &[usize],
    range: (usize, usize),
    index: usize,
) -> Option<(usize, usize)> {
    match (&before.data, &after.data) {
        (YamlDataOwned::Mapping(a), YamlDataOwned::Mapping(b)) => {
            if bounds(before, source, offsets) == range {
                return b
                    .keys()
                    .nth(index)
                    .map(|key| bounds(key, candidate, next_offsets));
            }
            a.values().zip(b.values()).find_map(|(a, b)| {
                relocated(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        (YamlDataOwned::Sequence(a), YamlDataOwned::Sequence(b)) => {
            a.iter().zip(b).find_map(|(a, b)| {
                relocated(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        _ => None,
    }
}

// Only handle a block field or a move across one. The established ordinary
// single-line and flow mapping operations keep their original behavior.
pub(super) fn change(
    source: &str,
    start: usize,
    end: usize,
    name: Option<&str>,
    direction: Option<&str>,
) -> Option<Result<YamlKeyChange, String>> {
    if !source.contains(['|', '>']) {
        return None;
    }
    let (docs, offsets, maps) = prepare(source).ok()?;
    let target = find_target(docs.first()?, source, &offsets, &maps, (start, end), false)?;
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        return None;
    };
    let pairs: Vec<_> = mapping.iter().collect();
    let index = pairs
        .iter()
        .position(|(k, _)| bounds(k, source, &offsets) == (start, end))?;
    let neighbor = direction.and_then(|d| {
        if d == "up" {
            index.checked_sub(1)
        } else {
            index.checked_add(1).filter(|i| *i < pairs.len())
        }
    });
    let analysis = analyze_yaml_source(source);
    let block_keys: HashSet<_> = analysis
        .outline
        .iter()
        .filter(|e| e.literal || e.folded)
        .filter_map(|e| e.field.as_ref().map(|f| (f.start, f.end)))
        .collect();
    if !block_keys.contains(&(start, end))
        && !neighbor.is_some_and(|i| block_keys.contains(&bounds(pairs[i].0, source, &offsets)))
    {
        return None;
    }
    Some(apply(source, start, end, name, direction, &analysis))
}

fn apply(
    source: &str,
    start: usize,
    end: usize,
    name: Option<&str>,
    direction: Option<&str>,
    analysis: &YamlSourceAnalysis,
) -> Result<YamlKeyChange, String> {
    let (mut docs, offsets, maps) = prepare(source)?;
    let target =
        find_target(&docs[0], source, &offsets, &maps, (start, end), false).ok_or(FALLBACK)?;
    let range = (target.start, target.end);
    if source[range.0..].starts_with('{') {
        return Err(FALLBACK.into());
    }
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        return Err(FALLBACK.into());
    };
    if name.is_some_and(|name| {
        mapping
            .keys()
            .any(|key| matches!(&key.data,YamlDataOwned::Value(ScalarOwned::String(s)) if s==name))
    }) {
        return Err("同一层级已有这个字段名，请换一个名称；输入与草稿仍保留".into());
    }
    let pairs: Vec<_> = mapping.iter().collect();
    let index = pairs
        .iter()
        .position(|(k, _)| bounds(k, source, &offsets) == (start, end))
        .ok_or(FALLBACK)?;
    let tokens = key_tokens(source, &offsets);
    let unit = |i: usize| -> Option<(usize, usize, usize)> {
        let (key, value) = pairs[i];
        let k = bounds(key, source, &offsets);
        let v = bounds(value, source, &offsets);
        if !matches!(value.data, YamlDataOwned::Value(_)) || !tokens.scalars.contains_key(&k) {
            return None;
        }
        let entry = analysis
            .outline
            .iter()
            .find(|e| e.field.as_ref().is_some_and(|f| (f.start, f.end) == k))?;
        if entry.literal || entry.folded {
            if !entry.editable {
                return None;
            }
            let u = literal::field_unit(source, entry.field.as_ref()?, v.1)?;
            return Some((u.0, body_end(source, u.1), u.2));
        }
        if !tokens.scalars.contains_key(&v)
            || source.get(k.0..v.1)?.contains(['\r', '\n'])
            || source.get(k.1..v.0)?.trim() != ":"
        {
            return None;
        }
        let line = source[..k.0]
            .rfind('\n')
            .map_or(usize::from(source.starts_with('\u{feff}')) * 3, |n| n + 1);
        if !source[line..k.0].bytes().all(|b| b == b' ') {
            return None;
        }
        let finish = source[v.1..]
            .find('\n')
            .map_or(source.len(), |n| v.1 + n + 1);
        let to = body_end(source, finish);
        let tail = &source[v.1..to];
        if !tail.trim().is_empty()
            && (!tail.starts_with([' ', '\t']) || !tail.trim_start().starts_with('#'))
        {
            return None;
        }
        Some((line, to, k.0 - line))
    };
    let unambiguous = |i: usize, u: (usize, usize, usize)| {
        let previous_end = body_end(source, u.0);
        let previous_start = source[..previous_end].rfind('\n').map_or(0, |n| n + 1);
        // Hash-prefixed lines inside the preceding block are actual text.
        if i > 0 && unit(i - 1).is_some_and(|p| previous_start >= p.0 && previous_end <= p.1) {
            return true;
        }
        !source[..previous_end].rsplit('\n').next().is_some_and(|s| {
            s.trim_start_matches('\u{feff}')
                .trim_start()
                .starts_with('#')
        })
    };
    let (candidate, next_index) = if let Some(direction) = direction {
        let neighbor = if direction == "up" {
            index.checked_sub(1)
        } else {
            index.checked_add(1).filter(|i| *i < pairs.len())
        }
        .ok_or("已经是第一个或最后一个字段；草稿仍保留")?;
        let left = index.min(neighbor);
        let a = unit(left).ok_or(FALLBACK)?;
        let b = unit(left + 1).ok_or(FALLBACK)?;
        if a.2 != b.2
            || a.1 > b.0
            || !unambiguous(left, a)
            || !unambiguous(left + 1, b)
            || !independent_gap(&source[a.1..b.0])
        {
            return Err(FALLBACK.into());
        }
        let candidate = format!(
            "{}{}{}{}{}",
            &source[..a.0],
            &source[b.0..b.1],
            &source[a.1..b.0],
            &source[a.0..a.1],
            &source[b.1..]
        );
        if swap_fields(&mut docs[0], source, &offsets, range, left) != 1 {
            return Err(FALLBACK.into());
        }
        (candidate, neighbor)
    } else {
        let name = name.ok_or(FALLBACK)?;
        let u = unit(index).ok_or(FALLBACK)?;
        if !unambiguous(index, u) {
            return Err(FALLBACK.into());
        }
        let style = *tokens.scalars.get(&(start, end)).ok_or(FALLBACK)?;
        let key = string_key_literal(name, style);
        let raw = format!("{}{}{}", &source[u.0..start], key, &source[end..u.1]);
        let eol = if source[u.0..]
            .split_inclusive('\n')
            .next()
            .is_some_and(|s| s.ends_with("\r\n"))
        {
            "\r\n"
        } else {
            "\n"
        };
        if source
            .len()
            .saturating_add(raw.len())
            .saturating_add(eol.len())
            > MAX_YAML_SOURCE_BYTES
        {
            return Err("复制后源码超过分析上限；输入与草稿仍保留".into());
        }
        let candidate = format!("{}{eol}{raw}{}", &source[..u.1], &source[u.1..]);
        let mut key_node = pairs[index].0.clone();
        key_node.data = YamlDataOwned::Value(ScalarOwned::String(name.into()));
        let pair = (key_node, pairs[index].1.clone());
        if insert_copy_expected(&mut docs[0], source, &offsets, range, (start, end), &pair) != 1 {
            return Err(FALLBACK.into());
        }
        (candidate, index + 1)
    };
    let (after, next_offsets, _) = prepare(&candidate)?;
    let (a, b) = relocated(
        &docs[0],
        &after[0],
        source,
        &offsets,
        &candidate,
        &next_offsets,
        range,
        next_index,
    )
    .ok_or(FALLBACK)?;
    checked(candidate, docs, a, b)
        .map_err(|_| "此位置无法保留原有文字及结尾换行，请定位源码；输入与草稿仍保留".into())
}
