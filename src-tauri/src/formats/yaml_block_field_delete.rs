use super::*;

const FALLBACK: &str = "此字段的结构或缩进无法准确删除，请定位源码；草稿仍保留";

// A block scalar's event starts in its body. Delete the physically proven
// header/body unit, rather than treating that event range as an entire field.
pub(super) fn remove(
    source: &str,
    start: usize,
    end: usize,
) -> Option<Result<YamlKeyChange, String>> {
    if !source.contains(['|', '>']) {
        return None;
    }
    let (docs, offsets, maps) = prepare(source).ok()?;
    let target = find_target(docs.first()?, source, &offsets, &maps, (start, end), false)?;
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        return None;
    };
    let value = mapping
        .iter()
        .find(|(key, _)| bounds(key, source, &offsets) == (start, end))?
        .1;
    let value_range = bounds(value, source, &offsets);
    let ordinary_block = Parser::new_from_str(parser_source(source)).any(|event| {
        matches!(event, Ok((Event::Scalar(_, ScalarStyle::Literal | ScalarStyle::Folded, 0, None), span))
            if (byte_offset(&offsets, span.start.index()), byte_offset(&offsets, span.end.index())) == value_range)
    });
    if !ordinary_block {
        return None;
    }
    let range = (target.start, target.end);
    Some(apply(source, start, end, docs, offsets, maps, range))
}

fn apply(
    source: &str,
    start: usize,
    end: usize,
    mut docs: Vec<MarkedYamlOwned>,
    offsets: Vec<usize>,
    maps: HashSet<(usize, usize)>,
    range: (usize, usize),
) -> Result<YamlKeyChange, String> {
    let target =
        find_target(&docs[0], source, &offsets, &maps, (start, end), false).ok_or(FALLBACK)?;
    let YamlDataOwned::Mapping(mapping) = &target.node.data else {
        return Err(FALLBACK.into());
    };
    let pairs: Vec<_> = mapping.iter().collect();
    let index = pairs
        .iter()
        .position(|(key, _)| bounds(key, source, &offsets) == (start, end))
        .ok_or(FALLBACK)?;
    let analysis = analyze_yaml_source(source);
    let field = analysis
        .outline
        .iter()
        .find_map(|entry| {
            entry
                .field
                .as_ref()
                .filter(|field| (field.start, field.end) == (start, end))
        })
        .ok_or(FALLBACK)?;
    if field.rename_unavailable_reason.is_some() {
        return Err(FALLBACK.into());
    }
    let value_end = bounds(pairs[index].1, source, &offsets).1;
    let from = source[..start]
        .rfind('\n')
        .map_or(usize::from(source.starts_with('\u{feff}')) * 3, |n| n + 1);
    if !source[from..start].bytes().all(|b| b == b' ') {
        return Err(FALLBACK.into());
    }
    let header_end = source[end..].find('\n').map_or(source.len(), |n| end + n);
    let header = source
        .get(end..header_end)
        .ok_or(FALLBACK)?
        .trim_end_matches('\r');
    let marker = header
        .strip_prefix(':')
        .ok_or(FALLBACK)?
        .trim_start_matches([' ', '\t']);
    if !marker.starts_with(['|', '>']) {
        return Err(FALLBACK.into());
    }
    let (_, finish, indent) = literal::field_unit(source, field, value_end)
        // A valid empty block can end immediately after its header, without
        // a newline. There is no body or following line to accidentally own.
        .or_else(|| (header_end == source.len()).then_some((from, source.len(), start - from)))
        .ok_or(FALLBACK)?;
    let comment = header.find('#').map(|at| &header[at..]);
    let eol = if source[..finish].ends_with("\r\n") {
        "\r\n"
    } else if source[..finish].ends_with('\n') {
        "\n"
    } else {
        ""
    };
    let replacement = if pairs.len() == 1 {
        format!(
            "{}{{}}{}{eol}",
            " ".repeat(indent),
            comment.map_or(String::new(), |c| format!(" {c}"))
        )
    } else {
        comment.map_or(String::new(), |c| format!("{}{c}{eol}", " ".repeat(indent)))
    };
    let candidate = format!("{}{}{}", &source[..from], replacement, &source[finish..]);
    if apply_expected(
        &mut docs[0],
        source,
        &offsets,
        range,
        Some((start, end)),
        None,
    ) != 1
    {
        return Err(FALLBACK.into());
    }
    let (after, next_offsets, _) = prepare(&candidate)?;
    let (a, b) = next_range(
        &docs[0],
        &after[0],
        source,
        &offsets,
        &candidate,
        &next_offsets,
        range,
        index,
    )
    .ok_or(FALLBACK)?;
    checked(candidate, docs, a, b).map_err(|_| FALLBACK.into())
}

// Pair unchanged ancestors and select the next sibling (or the previous last
// sibling). An empty mapping remains an explicit {}, selected as the parent.
fn next_range(
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
                    .nth(index.min(b.len().saturating_sub(1)))
                    .map(|key| bounds(key, candidate, next_offsets))
                    .or_else(|| {
                        let (start, end) = bounds(after, candidate, next_offsets);
                        // The loader's flow-mapping end excludes its closing
                        // brace. Select the whole explicit empty mapping.
                        Some((start, flow_close(candidate, end)? + 1))
                    });
            }
            a.values().zip(b.values()).find_map(|(a, b)| {
                next_range(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        (YamlDataOwned::Sequence(a), YamlDataOwned::Sequence(b)) => {
            a.iter().zip(b).find_map(|(a, b)| {
                next_range(a, b, source, offsets, candidate, next_offsets, range, index)
            })
        }
        _ => None,
    }
}
