use super::*;

pub(super) fn is_string(content: &str, value: &Value) -> bool {
    value.is_str()
        && value
            .span()
            .and_then(|r| content.get(r))
            .is_some_and(|raw| raw.starts_with("'''") || raw.starts_with("\"\"\""))
}

// Only the comment on a field's closing line is owned by that field.
// Do not guess whether an immediately adjacent separate comment annotates it.
pub(super) fn clear_before(content: &str, start: usize) -> bool {
    let before = content[..start]
        .strip_suffix('\n')
        .unwrap_or(&content[..start]);
    !before.rsplit('\n').next().is_some_and(|line| {
        line.trim_start_matches('\u{feff}')
            .trim_start()
            .starts_with('#')
    })
}

pub(super) fn clear_after(content: &str, finish: usize) -> bool {
    !content[finish..]
        .lines()
        .next()
        .is_some_and(|line| line.trim_start().starts_with('#'))
}

#[cfg(test)]
#[path = "toml_block_field_tests.rs"]
mod tests;
