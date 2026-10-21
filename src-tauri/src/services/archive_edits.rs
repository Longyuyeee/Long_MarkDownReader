//! Internal, in-memory preview only. No filesystem write or archive permission.
#![allow(dead_code)]
use super::archive_dependencies::DependencyReport;
use super::archive_dependencies::{mentions, DependencyEvidence};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Component, Path};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentPreview {
    pub document: String,
    pub content: Option<String>,
    pub blockers: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatchPreview {
    pub documents: Vec<DocumentPreview>,
    pub blockers: Vec<String>,
    pub can_execute: bool,
}

/// Aggregate every supplied report, including unresolved candidates. Current
/// texts are supplied by an internal caller; this helper never reads or writes disk.
pub(crate) fn batch_preview(
    reports: &[&DependencyReport],
    current_texts: &BTreeMap<String, String>,
) -> BatchPreview {
    let mut blockers = Vec::new();
    if reports.is_empty() {
        blockers.push("missing_dependency_reports".into());
    }
    let mut grouped: BTreeMap<String, (Vec<(DependencyEvidence, String)>, Vec<String>)> =
        BTreeMap::new();
    let hashes: BTreeMap<_, _> = current_texts
        .iter()
        .map(|(document, text)| (document, format!("{:x}", Sha256::digest(text.as_bytes()))))
        .collect();
    for report in reports {
        if !report.complete {
            blockers.push("dependency_inventory_incomplete".into());
        }
        blockers.extend(report.limitations.iter().map(|s| s.to_string()));
        for evidence in report.outgoing.iter().chain(&report.incoming_candidates) {
            let entry = grouped.entry(evidence.document.clone()).or_default();
            let hash_matches = hashes
                .get(&evidence.document)
                .is_some_and(|hash| *hash == evidence.snapshot_sha256);
            if !hash_matches {
                entry.1.push("source_snapshot_missing_or_changed".into());
            }
            // Full evidence equality keeps duplicate source ranges distinct while
            // allowing the same reference to occur in multiple batch reports.
            let impacts: Vec<_> = report
                .move_impacts
                .iter()
                .filter(|impact| &impact.evidence == evidence)
                .collect();
            if impacts.is_empty() {
                entry.1.push("candidate_without_impact".into());
            }
            for impact in impacts {
                match impact.status {
                    "same_destination" | "different_target" => {}
                    "rewrite_required" => match &impact.proposed_target {
                        Some(target) if evidence.destination_span.is_some() => {
                            entry.0.push((evidence.clone(), target.clone()))
                        }
                        _ => entry.1.push("rewrite_without_safe_proposal".into()),
                    },
                    _ => entry.1.push("unresolved_dependency".into()),
                }
            }
        }
    }
    let mut output_budget = 32 * 1024 * 1024usize;
    let documents = grouped
        .into_iter()
        .map(|(document, (proposals, mut issues))| {
            let content = if issues.is_empty() {
                match current_texts.get(&document) {
                    Some(text) => match preview(&document, text, &proposals) {
                        Ok(content) if content.len() <= output_budget => {
                            output_budget -= content.len();
                            Some(content)
                        }
                        Ok(_) => {
                            issues.push("edit_preview_output_limit".into());
                            None
                        }
                        Err(error) => {
                            issues.push(error);
                            None
                        }
                    },
                    None => {
                        issues.push("source_snapshot_missing_or_changed".into());
                        None
                    }
                }
            } else {
                None
            };
            issues.sort();
            issues.dedup();
            DocumentPreview {
                document,
                content,
                blockers: issues,
            }
        })
        .collect();
    blockers.sort();
    blockers.dedup();
    BatchPreview {
        documents,
        blockers,
        can_execute: false,
    }
}

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
    if super::chapter_links::is_chapter(&evidence.target) {
        return super::chapter_links::remap_to(root, intended, &evidence.target);
    }
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
    preview_parsed(document, current, proposals, mentions)
}
pub(crate) fn preview_move(
    document: &str,
    current: &str,
    proposals: &[(DependencyEvidence, String)],
) -> Result<String, String> {
    preview_parsed(
        document,
        current,
        proposals,
        super::archive_dependencies::move_mentions,
    )
}
fn preview_parsed(
    document: &str,
    current: &str,
    proposals: &[(DependencyEvidence, String)],
    parse: fn(&str, &str) -> Vec<DependencyEvidence>,
) -> Result<String, String> {
    if current.len() > 2 * 1024 * 1024 || proposals.len() > 20_000 {
        return Err("引用编辑预览超过检查上限".into());
    }
    let hash = format!("{:x}", Sha256::digest(current.as_bytes()));
    let actual = parse(document, current);
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
        let encoded = if super::chapter_links::is_chapter(&evidence.target) {
            super::chapter_links::parse(replacement).is_some()
                && replacement
                    .strip_prefix("longedit://chapter?")
                    .is_some_and(|tail| {
                        tail.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"-._~/%#?=&".contains(&b))
                    })
        } else {
            replacement
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._~/%#?=&".contains(&b))
        };
        if replacement.is_empty() || !encoded {
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
    let parsed = parse(document, &result);
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
    use super::super::archive_dependencies::MoveImpact;
    use super::*;

    fn report_for(text: &str, target: Option<&str>) -> DependencyReport {
        let evidence = mentions("note.md", text);
        let impacts = evidence
            .iter()
            .map(|e| MoveImpact {
                evidence: e.clone(),
                direction: "outgoing",
                status: "rewrite_required",
                intended_path: None,
                unchanged_link_path: None,
                proposed_target: target.map(str::to_owned),
            })
            .collect();
        DependencyReport {
            outgoing: evidence,
            incoming_candidates: vec![],
            complete: false,
            limitations: vec!["test_incomplete"],
            move_impacts: impacts,
        }
    }

    #[test]
    fn archive_batch_preview_deduplicates_shared_evidence_without_execution_permission() {
        let report = report_for("[a](a.md)", Some("new.md"));
        let texts = BTreeMap::from([("note.md".into(), "[a](a.md)".into())]);
        let batch = batch_preview(&[&report, &report], &texts);
        assert_eq!(batch.documents.len(), 1);
        assert_eq!(batch.documents[0].document, "note.md");
        assert_eq!(batch.documents[0].content.as_deref(), Some("[a](new.md)"));
        assert!(batch.documents[0].blockers.is_empty());
        assert!(batch
            .blockers
            .contains(&"dependency_inventory_incomplete".into()));
        assert!(!batch.can_execute);
    }

    #[test]
    fn archive_batch_preview_never_drops_unhandled_candidates_or_stale_sources() {
        let mut report = report_for("[a](a.md) [[unknown]]", Some("new.md"));
        let texts = BTreeMap::from([("note.md".into(), "[a](a.md) [[unknown]]".into())]);
        // A successful proposal beside an unsupported wiki must not yield a partial document.
        let wiki = report
            .move_impacts
            .iter_mut()
            .find(|i| i.evidence.kind == "wikilink")
            .unwrap();
        wiki.status = "needs_review";
        wiki.proposed_target = None;
        let batch = batch_preview(&[&report], &texts);
        assert!(batch.documents[0].content.is_none());
        assert!(batch.documents[0]
            .blockers
            .contains(&"unresolved_dependency".into()));
        report.move_impacts.clear();
        let batch = batch_preview(&[&report], &texts);
        assert!(batch.documents[0]
            .blockers
            .contains(&"candidate_without_impact".into()));
        let batch = batch_preview(&[&report], &BTreeMap::new());
        assert!(batch.documents[0]
            .blockers
            .contains(&"source_snapshot_missing_or_changed".into()));
        assert!(!batch.can_execute);
    }

    #[test]
    fn archive_batch_preview_blocks_conflicting_reports_and_missing_proposals() {
        let a = report_for("[a](a.md)", Some("one.md"));
        let b = report_for("[a](a.md)", Some("two.md"));
        let texts = BTreeMap::from([("note.md".into(), "[a](a.md)".into())]);
        let batch = batch_preview(&[&a, &b], &texts);
        assert!(batch.documents[0].content.is_none());
        assert!(!batch.documents[0].blockers.is_empty());
        let missing = report_for("[a](a.md)", None);
        let batch = batch_preview(&[&missing], &texts);
        assert!(batch.documents[0]
            .blockers
            .contains(&"rewrite_without_safe_proposal".into()));
        assert!(!batch_preview(&[], &texts).blockers.is_empty());
    }

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
