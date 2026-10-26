use super::*;

// Find the same structural parent in the checked candidate, then use the new
// parser span. Block scalar spans can include the next line's indentation;
// moving byte offsets arithmetically would select a neighboring item.
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
        (YamlDataOwned::Sequence(a), YamlDataOwned::Sequence(b)) => {
            if bounds(before, source, offsets) == range {
                return b.get(index).map(|v| bounds(v, candidate, next_offsets));
            }
            a.iter().zip(b).find_map(|(a, b)| {
                relocated(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        (YamlDataOwned::Mapping(a), YamlDataOwned::Mapping(b)) => {
            a.values().zip(b.values()).find_map(|(a, b)| {
                relocated(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        _ => None,
    }
}

// Only take over lists containing an already supported literal/folded block.
// Existing single-line and flow-list behavior remains in its original path.
pub(super) fn change(
    source: &str,
    start: usize,
    end: usize,
    direction: Option<&str>,
) -> Option<Result<YamlKeyChange, String>> {
    if !source.contains(['|', '>']) {
        return None;
    }
    let analysis = analyze_yaml_source(source);
    let selected = analysis
        .outline
        .iter()
        .find(|e| e.start == start && e.end == end)?;
    let parent_path = selected.path.rsplit_once('[')?.0;
    let has_block = analysis.outline.iter().any(|e| {
        e.path
            .rsplit_once('[')
            .is_some_and(|(p, _)| p == parent_path)
            && e.document_index == selected.document_index
            && (e.literal || e.folded)
    });
    if !has_block {
        return None;
    }
    Some(apply(source, start, end, direction, &analysis))
}

fn apply(
    source: &str,
    start: usize,
    end: usize,
    direction: Option<&str>,
    analysis: &YamlSourceAnalysis,
) -> Result<YamlKeyChange, String> {
    let (mut docs, offsets, _) = prepare(source)?;
    let ranges = ordinary_sequences(source, &offsets);
    let node = target(&docs[0], source, &offsets, &ranges, (start, end), true).ok_or(FALLBACK)?;
    let YamlDataOwned::Sequence(items) = &node.data else {
        return Err(FALLBACK.into());
    };
    let range = bounds(node, source, &offsets);
    if source[range.0..].starts_with('[') {
        return Err(FALLBACK.into());
    }
    let index = items
        .iter()
        .position(|v| bounds(v, source, &offsets) == (start, end))
        .ok_or(FALLBACK)?;
    let mut counters = AnalysisCounters::default();
    let scalars = inspect_events(source, &mut counters, &offsets);
    let blocks: HashSet<_> = analysis
        .outline
        .iter()
        .filter(|e| e.editable && (e.literal || e.folded))
        .map(|e| (e.start, e.end))
        .collect();
    let units = items
        .iter()
        .map(|v| {
            let (a, b) = bounds(v, source, &offsets);
            if !matches!(v.data, YamlDataOwned::Value(_)) || !scalars.contains(&(a, b)) {
                return Err(FALLBACK);
            }
            let block = blocks.contains(&(a, b));
            let (line, finish, indent) = if block {
                literal::sequence_unit(source, a, b).ok_or(FALLBACK)?
            } else {
                if source[a..b].contains(['\r', '\n']) {
                    return Err(FALLBACK);
                }
                block_line(source, a, b).map_err(|_| FALLBACK)?
            };
            Ok((line, body_end(source, finish), indent))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if units.iter().any(|u| u.2 != units[0].2) {
        return Err(FALLBACK.into());
    }
    let unambiguous = |i: usize| {
        let from = units[i].0;
        let previous_end = body_end(source, from);
        let previous_start = source[..previous_end].rfind('\n').map_or(0, |n| n + 1);
        // A hash line inside the preceding block is text, not a standalone
        // comment attached to this item.
        if i > 0 && previous_start >= units[i - 1].0 && previous_end <= units[i - 1].1 {
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
            index.checked_add(1).filter(|i| *i < items.len())
        }
        .ok_or("已经是第一项或最后一项；草稿仍保留")?;
        let left = index.min(neighbor);
        let a = units[left];
        let b = units[left + 1];
        if a.1 > b.0
            || !unambiguous(left)
            || !unambiguous(left + 1)
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
        if candidate == source {
            return Err("相邻两项内容相同，无需移动；草稿仍保留".into());
        }
        if swap_items(&mut docs[0], source, &offsets, range, left) != 1 {
            return Err(FALLBACK.into());
        }
        (candidate, neighbor)
    } else {
        let u = units[index];
        if !unambiguous(index) {
            return Err(FALLBACK.into());
        }
        let raw = &source[u.0..u.1];
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
            return Err("复制后源码超过分析上限；草稿仍保留".into());
        }
        let candidate = format!("{}{eol}{raw}{}", &source[..u.1], &source[u.1..]);
        let value = items[index].clone();
        if mutate(
            &mut docs[0],
            source,
            &offsets,
            range,
            index + 1,
            Some(&value),
        ) != 1
        {
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
        .map_err(|_| "此位置无法保留原有文字及结尾换行，请定位源码；草稿仍保留".into())
}
