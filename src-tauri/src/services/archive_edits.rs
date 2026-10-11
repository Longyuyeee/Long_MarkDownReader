//! Internal, in-memory preview only. No filesystem write or archive permission.
#![allow(dead_code)]
use super::archive_dependencies::{mentions, DependencyEvidence};
use sha2::{Digest, Sha256};
use std::path::{Component, Path};

/// A predicted relative URL, not evidence that the destination already exists.
pub(crate) fn relative_target(
    root: &Path,
    future_document: &Path,
    intended: &Path,
    evidence: &DependencyEvidence,
) -> Option<String> {
    if !root.is_absolute() {
        return None;
    }
    let parent = future_document.parent()?.strip_prefix(root).ok()?;
    let target = intended.strip_prefix(root).ok()?;
    let components = |path: &Path| -> Option<Vec<String>> {
        path.components()
            .map(|c| match c {
                Component::Normal(name) => Some(name.to_str()?.to_owned()),
                _ => None,
            })
            .collect()
    };
    let from = components(parent)?;
    let to = components(target)?;
    if to.is_empty() {
        return None;
    }
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let encode = |text: &str| -> String {
        let mut encoded = String::new();
        for b in text.bytes() {
            if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                encoded.push(b as char);
            } else {
                encoded.push_str(&format!("%{b:02X}"));
            }
        }
        encoded
    };
    let mut parts = vec!["..".to_owned(); from.len() - common];
    parts.extend(to[common..].iter().map(|s| encode(s)));
    if parts.is_empty() {
        return None;
    }
    let mut replacement = parts.join("/");
    // Keep URL delimiters and valid existing escapes; encode other suffix bytes.
    let suffix = evidence
        .target
        .find(['?', '#'])
        .map(|i| &evidence.target[i..])
        .unwrap_or("");
    let bytes = suffix.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' {
            if i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit()
            {
                return None;
            }
            replacement.push_str(&suffix[i..i + 3]);
            i += 3;
            continue;
        }
        if b.is_ascii_alphanumeric() || b"-._~/#?=&".contains(&b) {
            replacement.push(b as char);
        } else {
            replacement.push_str(&format!("%{b:02X}"));
        }
        i += 1;
    }
    let mut shifted = evidence.clone();
    shifted.document = future_document.to_str()?.into();
    shifted.target = replacement.clone();
    let resolved = super::archive_dependencies::resolve_relative(root, &shifted);
    if !["resolved_file", "missing"].contains(&resolved.status)
        || resolved.path.as_deref().map(Path::new) != Some(intended)
    {
        return None;
    }
    Some(replacement)
}

/// Proposed destinations must already be URL-encoded by the caller. This does
/// not establish that they resolve to the intended file after a batch move.
pub(crate) fn preview(
    document: &str,
    current: &str,
    proposals: &[(DependencyEvidence, String)],
) -> Result<String, String> {
    if current.len() > 2 * 1024 * 1024 || proposals.len() > 20_000 {
        return Err("引用编辑预览超过检查上限".into());
    }
    let hash = format!("{:x}", Sha256::digest(current.as_bytes()));
    let actual = mentions(document, current);
    let mut edits = Vec::new();
    for (evidence, replacement) in proposals {
        if evidence.document != document || evidence.snapshot_sha256 != hash {
            return Err("引用来源或整文快照已变化，请重新预检".into());
        }
        let span = evidence
            .destination_span
            .as_ref()
            .ok_or("引用没有可校验的目标范围")?;
        if span.start >= span.end
            || current.get(span.start..span.end) != Some(span.original.as_str())
            || !actual.iter().any(|item| {
                item.target == evidence.target
                    && item.destination_span.as_ref().is_some_and(|s| {
                        s.start == span.start && s.end == span.end && s.original == span.original
                    })
            })
        {
            return Err("引用范围与当前解析结果不一致".into());
        }
        if replacement.is_empty()
            || !replacement
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._~/%#?=&".contains(&b))
        {
            return Err("替换目标必须先进行 URL 编码".into());
        }
        edits.push((span.start, span.end, replacement.as_str()));
    }
    edits.sort_unstable();
    edits.dedup();
    if edits.windows(2).any(|pair| pair[0].1 > pair[1].0) {
        return Err("引用编辑范围重叠或存在冲突替换".into());
    }
    let mut output_len = current.len();
    for (start, end, replacement) in &edits {
        output_len = output_len
            .checked_sub(end - start)
            .and_then(|n| n.checked_add(replacement.len()))
            .ok_or("引用编辑结果长度溢出")?;
    }
    if output_len > 2 * 1024 * 1024 {
        return Err("引用编辑结果超过检查上限".into());
    }
    let mut result = String::with_capacity(output_len);
    let mut cursor = 0;
    let mut expected = Vec::new();
    for (start, end, replacement) in edits {
        result.push_str(&current[cursor..start]);
        let output_start = result.len();
        result.push_str(replacement);
        expected.push((output_start, result.len(), replacement));
        cursor = end;
    }
    result.push_str(&current[cursor..]);
    if result.len() > 2 * 1024 * 1024 {
        return Err("引用编辑结果超过检查上限".into());
    }
    let parsed = mentions(document, &result);
    if expected.iter().any(|(start, end, replacement)| {
        !parsed.iter().any(|e| {
            e.target == *replacement
                && e.destination_span
                    .as_ref()
                    .is_some_and(|s| s.start == *start && s.end == *end)
        })
    }) {
        return Err("替换后语法回读不一致".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_edit_preview_preserves_prose_and_deduplicates_edits() {
        let text = "中文\r\n[一](a.md) 和 [二](a.md) ![图](<图 片.png>)";
        let evidence = mentions("note.md", text);
        let proposals: Vec<_> = evidence
            .iter()
            .map(|e| (e.clone(), "../archive/new%20file.md#part".into()))
            .collect();
        let mut duplicated = proposals.clone();
        duplicated.push(proposals[0].clone());
        assert_eq!(preview("note.md", text, &duplicated).unwrap(),
            "中文\r\n[一](../archive/new%20file.md#part) 和 [二](../archive/new%20file.md#part) ![图](<../archive/new%20file.md#part>)");
    }

    #[test]
    fn archive_edit_preview_rejects_stale_body_wrong_document_and_conflicts() {
        let text = "[a](a.md) 正文";
        let evidence = mentions("note.md", text).remove(0);
        let proposals = vec![(evidence.clone(), "b.md".into())];
        assert!(preview("note.md", "[a](a.md) 改文", &proposals).is_err());
        assert!(preview("other.md", text, &proposals).is_err());
        assert!(preview(
            "note.md",
            text,
            &[(evidence.clone(), "b.md".into()), (evidence, "c.md".into())]
        )
        .is_err());
    }

    #[test]
    fn archive_edit_preview_rejects_forged_ranges_and_syntax_changes() {
        let text = "中文 [a](a.md)";
        let evidence = mentions("note.md", text).remove(0);
        let mut forged = evidence.clone();
        forged.destination_span.as_mut().unwrap().start = 1;
        assert!(preview("note.md", text, &[(forged, "b.md".into())]).is_err());
        for replacement in ["b.md) bad", "图.png", "a&amp;b.md", "#anchor"] {
            assert!(preview("note.md", text, &[(evidence.clone(), replacement.into())]).is_err());
        }
        let reference = mentions("note.md", "[a][id]\n\n[id]: a.md").remove(0);
        assert!(preview(
            "note.md",
            "[a][id]\n\n[id]: a.md",
            &[(reference, "b.md".into())]
        )
        .is_err());
    }
}
