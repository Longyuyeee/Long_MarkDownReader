//! Conservative candidate inventory, not a complete link resolver or permission to move.
use crate::formats::markdown::{extract_pdf_reference_mentions, extract_wikilink_mentions};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::LazyLock,
};

static HTML: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?i)\b(?:src|href)\s*=\s*["']([^"']+)["']"#).unwrap());
static UNPARSED_DEFINITION: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?m)^[ \t]{0,3}\[[^\]\r\n]+\]:\s*<?([^\s>]+)"#).unwrap());

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DependencyEvidence {
    pub document: String,
    pub line: usize,
    pub target: String,
    pub kind: &'static str,
    pub resolution: Option<DependencyResolution>,
    pub destination_span: Option<DestinationSpan>,
    pub snapshot_sha256: String,
}

/// UTF-8 byte offsets into the scanned document, not a current write permission.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DestinationSpan {
    pub start: usize,
    pub end: usize,
    pub original: String,
}

// Deliberately narrow: inline destinations without titles or decoded escapes.
// The parser establishes link semantics; raw equality establishes source identity.
fn inline_destination_span(
    text: &str,
    range: std::ops::Range<usize>,
    destination: &str,
) -> Option<DestinationSpan> {
    let syntax = text.get(range.clone())?.strip_suffix(')')?;
    let (label, raw) = syntax.rsplit_once("](")?;
    let (raw, angle_offset) = match raw.strip_prefix('<') {
        Some(value) => (value.strip_suffix('>')?, 1),
        None => (raw, 0),
    };
    if raw.is_empty() || raw != destination {
        return None;
    }
    let start = range.start + label.len() + 2 + angle_offset;
    Some(DestinationSpan {
        start,
        end: start + raw.len(),
        original: raw.into(),
    })
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DependencyResolution {
    pub status: &'static str,
    pub path: Option<String>,
}

/// Resolve only ordinary relative file destinations. This is evidence, not permission.
pub(super) fn resolve_relative(root: &Path, evidence: &DependencyEvidence) -> DependencyResolution {
    let result = |status, path: Option<PathBuf>| DependencyResolution {
        status,
        path: path.map(|p| p.to_string_lossy().into_owned()),
    };
    if !["markdown", "reference_definition", "html_attribute"].contains(&evidence.kind) {
        return result("unsupported", None);
    }
    let raw = evidence.target.split(['#', '?']).next().unwrap_or("");
    let decoded = match urlencoding::decode(raw) {
        Ok(value) => value,
        Err(_) => return result("unsupported", None),
    };
    // Escapes/entities need a syntax-aware parser. Do not guess root/drive/URI semantics.
    if decoded.is_empty() || decoded.contains([':', '\\', '&', '\0']) || decoded.starts_with('/') {
        return result("unsupported", None);
    }
    let document = Path::new(&evidence.document);
    let mut path = match document.parent() {
        Some(p) if p.starts_with(root) => p.to_owned(),
        _ => return result("outside_library", None),
    };
    for part in decoded.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if path == root || !path.pop() {
                    return result("outside_library", None);
                }
            }
            name => path.push(name),
        }
    }
    if !path.starts_with(root) {
        return result("outside_library", None);
    }
    // Reject linked ancestors rather than silently resolve an alternate location.
    let mut cursor = root.to_owned();
    if let Ok(relative) = path.strip_prefix(root) {
        for component in relative.components() {
            cursor.push(component);
            match fs::symlink_metadata(&cursor) {
                Ok(meta) if meta.file_type().is_symlink() => return result("unsupported", None),
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return result("missing", Some(path))
                }
                Err(_) => return result("unreadable", Some(path)),
            }
        }
    }
    match fs::metadata(&path) {
        Ok(meta) if meta.is_file() => result("resolved_file", Some(path)),
        Ok(_) => result("unsupported", Some(path)),
        Err(_) => result("unreadable", Some(path)),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DependencyReport {
    pub outgoing: Vec<DependencyEvidence>,
    pub incoming_candidates: Vec<DependencyEvidence>,
    pub complete: bool,
    pub limitations: Vec<&'static str>,
    pub move_impacts: Vec<MoveImpact>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MoveImpact {
    pub evidence: DependencyEvidence,
    pub direction: &'static str,
    pub status: &'static str,
    pub intended_path: Option<String>,
    pub unchanged_link_path: Option<String>,
    pub proposed_target: Option<String>,
}

fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

pub(crate) struct Inventory {
    evidence: Vec<DependencyEvidence>,
}

fn local(value: &str) -> bool {
    let value = value.trim().to_ascii_lowercase();
    !value.is_empty()
        && !value.starts_with('#')
        && !["http:", "https:", "mailto:", "data:", "tel:"]
            .iter()
            .any(|prefix| value.starts_with(prefix))
}

pub(super) fn mentions(document: &str, text: &str) -> Vec<DependencyEvidence> {
    use pulldown_cmark::{Event, LinkType, Parser, Tag};
    let snapshot_sha256 = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut found = vec![];
    let mut add = |target: &str, offset: usize, kind, destination_span| {
        if local(target) && !target.starts_with("longedit://pdf?") {
            found.push(DependencyEvidence {
                document: document.into(),
                line: text[..offset].bytes().filter(|b| *b == b'\n').count() + 1,
                target: target.into(),
                kind,
                resolution: None,
                destination_span,
                snapshot_sha256: snapshot_sha256.clone(),
            });
        }
    };
    let parser = Parser::new(text);
    let mut definition_offsets = std::collections::HashSet::new();
    let mut code_ranges = Vec::new();
    // Keep unused definitions as conservative evidence as well as resolved uses.
    for (_, definition) in parser.reference_definitions().iter() {
        definition_offsets.insert(definition.span.start);
        add(
            &definition.dest,
            definition.span.start,
            "reference_definition",
            None,
        );
    }
    for (event, range) in parser.into_offset_iter() {
        match event {
            Event::Code(_) | Event::Start(Tag::CodeBlock(_)) => code_ranges.push(range),
            Event::Start(
                Tag::Link {
                    dest_url,
                    link_type,
                    ..
                }
                | Tag::Image {
                    dest_url,
                    link_type,
                    ..
                },
            ) => {
                let span = if link_type == LinkType::Inline {
                    inline_destination_span(text, range.clone(), &dest_url)
                } else {
                    None
                };
                add(&dest_url, range.start, "markdown", span);
            }
            Event::Html(_) | Event::InlineHtml(_) => {
                for capture in HTML.captures_iter(&text[range.clone()]) {
                    add(
                        &capture[1],
                        range.start + capture.get(0).unwrap().start(),
                        "html_attribute",
                        None,
                    );
                }
            }
            _ => {}
        }
    }
    for capture in UNPARSED_DEFINITION.captures_iter(text) {
        let offset = capture.get(0).unwrap().start();
        if !definition_offsets.contains(&offset)
            && !code_ranges.iter().any(|range| range.contains(&offset))
        {
            add(&capture[1], offset, "unparsed_reference_candidate", None);
        }
    }
    for (values, kind) in [
        (extract_wikilink_mentions(text), "wikilink"),
        (extract_pdf_reference_mentions(text), "pdf_reference"),
    ] {
        for mention in values {
            if local(&mention.target) {
                found.push(DependencyEvidence {
                    document: document.into(),
                    line: mention.line,
                    target: mention.target,
                    kind,
                    resolution: None,
                    destination_span: None,
                    snapshot_sha256: snapshot_sha256.clone(),
                });
            }
        }
    }
    found.sort_by(|a, b| (a.line, &a.target, a.kind).cmp(&(b.line, &b.target, b.kind)));
    found
}

fn basename(value: &str) -> String {
    // Split URL fragments BEFORE decoding: %23 may belong to the actual filename.
    let path = value.split(['#', '?']).next().unwrap_or(value);
    let decoded = urlencoding::decode(path).unwrap_or_else(|_| path.into());
    decoded
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_lowercase()
}

impl Inventory {
    /// Read-only evidence access; this does not establish exhaustive syntax support.
    pub(crate) fn evidence(&self) -> &[DependencyEvidence] { &self.evidence }
    #[cfg(test)]
    pub(crate) fn report_move(
        &self,
        root: &Path,
        source: &Path,
        destination: &Path,
    ) -> DependencyReport {
        self.report_batch(
            root,
            source,
            &[(source.to_path_buf(), destination.to_path_buf())],
        )
    }

    pub(crate) fn report_batch(
        &self,
        root: &Path,
        source: &Path,
        moves: &[(PathBuf, PathBuf)],
    ) -> DependencyReport {
        let mut report = self.report(source);
        let source_key = source.to_string_lossy();
        let mapped = |path: &str| {
            moves
                .iter()
                .find(|(from, _)| same_path(&from.to_string_lossy(), path))
                .map(|(_, to)| to.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_owned())
        };
        let destination_key = mapped(&source_key);
        report
            .limitations
            .push("batch_projection_assumes_all_planned_moves_succeed");
        for evidence in &report.outgoing {
            let mut impact = MoveImpact {
                evidence: evidence.clone(),
                direction: "outgoing",
                status: "needs_review",
                intended_path: None,
                unchanged_link_path: None,
                proposed_target: None,
            };
            if let Some(before) = &evidence.resolution {
                if before.status == "resolved_file" {
                    if let Some(before_path) = &before.path {
                        // Self references must follow the moving document too.
                        let intended = mapped(before_path);
                        let mut shifted = evidence.clone();
                        shifted.document = destination_key.to_string();
                        let after = resolve_relative(root, &shifted);
                        impact.status = match after.path.as_ref() {
                            Some(path)
                                if ["resolved_file", "missing"].contains(&after.status)
                                    && same_path(path, &intended) =>
                            {
                                "same_destination"
                            }
                            Some(_) if ["resolved_file", "missing"].contains(&after.status) => {
                                "rewrite_required"
                            }
                            _ => "needs_review",
                        };
                        impact.intended_path = Some(intended);
                        impact.unchanged_link_path = after.path;
                    }
                }
            }
            report.move_impacts.push(impact);
        }
        for evidence in &report.incoming_candidates {
            let mut impact = MoveImpact {
                evidence: evidence.clone(),
                direction: "incoming",
                status: "needs_review",
                intended_path: None,
                unchanged_link_path: None,
                proposed_target: None,
            };
            if let Some(resolution) = &evidence.resolution {
                if resolution.status == "resolved_file" {
                    if let Some(path) = &resolution.path {
                        let intended = mapped(path);
                        if same_path(path, &source_key) {
                            let mut shifted = evidence.clone();
                            shifted.document = mapped(&evidence.document);
                            let after = resolve_relative(root, &shifted);
                            impact.status = match after.path.as_ref() {
                                Some(path)
                                    if ["resolved_file", "missing"].contains(&after.status)
                                        && same_path(path, &intended) =>
                                {
                                    "same_destination"
                                }
                                Some(_) if ["resolved_file", "missing"].contains(&after.status) => {
                                    "rewrite_required"
                                }
                                _ => "needs_review",
                            };
                            impact.unchanged_link_path = after.path;
                        } else {
                            impact.status = "different_target";
                            impact.unchanged_link_path = Some(path.clone());
                        }
                        impact.intended_path = Some(intended);
                    }
                }
            }
            report.move_impacts.push(impact);
        }
        for impact in &mut report.move_impacts {
            if impact.status == "rewrite_required" && impact.evidence.destination_span.is_some() {
                if let Some(intended) = &impact.intended_path {
                    impact.proposed_target = super::archive_edits::relative_target(
                        root,
                        Path::new(&mapped(&impact.evidence.document)),
                        Path::new(intended),
                        &impact.evidence,
                    );
                }
            }
        }
        report
    }

    pub(crate) fn report(&self, source: &Path) -> DependencyReport {
        let source_key = source.to_string_lossy().to_lowercase();
        let name = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let stem = source
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        DependencyReport {
            outgoing: self
                .evidence
                .iter()
                .filter(|e| e.document.to_lowercase() == source_key)
                .cloned()
                .collect(),
            incoming_candidates: self
                .evidence
                .iter()
                .filter(|e| {
                    if e.document.to_lowercase() == source_key {
                        return false;
                    }
                    let candidate = basename(&e.target);
                    candidate == name || (e.kind == "wikilink" && candidate == stem)
                })
                .cloned()
                .collect(),
            complete: false,
            move_impacts: vec![],
            limitations: vec![
                "candidate_matching_not_resolution",
                "markdown_syntax_not_exhaustive",
                "non_markdown_incoming_not_scanned",
                "concurrent_changes_not_locked",
            ],
        }
    }
}

pub(crate) fn scan(root: &str) -> Result<Inventory, String> {
    scan_impl(root, false)
}

pub(crate) fn scan_visible(root: &str) -> Result<Inventory, String> {
    scan_impl(root, true)
}

fn scan_impl(root: &str, visible_only: bool) -> Result<Inventory, String> {
    let guard = WorkspaceGuard::new(root)?;
    let mut dirs: Vec<PathBuf> = vec![guard.root().to_path_buf()];
    let mut remaining = 32 * 1024 * 1024u64;
    let mut entries = 0usize;
    let mut evidence = vec![];
    while let Some(dir) = dirs.pop() {
        for entry in fs::read_dir(dir).map_err(|e| format!("依赖目录读取失败: {e}"))? {
            let entry = entry.map_err(|e| format!("依赖条目读取失败: {e}"))?;
            entries += 1;
            if entries > 20_000 {
                return Err("依赖扫描超过 20000 项上限，检查未完成".into());
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == ".git" || (visible_only && (name.starts_with('.') || name.ends_with(".assets"))) {
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err("依赖扫描遇到符号链接，未跟随且检查未完成".into());
            }
            let path = guard.resolve_existing(entry.path())?;
            if metadata.is_dir() {
                dirs.push(path);
                continue;
            }
            if !path
                .extension()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.eq_ignore_ascii_case("md") || s.eq_ignore_ascii_case("markdown"))
            {
                continue;
            }
            if metadata.len() > remaining || metadata.len() > 2 * 1024 * 1024 {
                return Err("Markdown 超过单文件 2 MiB 或总计 32 MiB 依赖扫描上限".into());
            }
            let mut bytes = vec![];
            fs::File::open(&path)
                .map_err(|e| e.to_string())?
                .take(metadata.len() + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 != metadata.len() {
                return Err("依赖文件在扫描期间改变，请重新检查".into());
            }
            remaining -= bytes.len() as u64;
            let text = std::str::from_utf8(&bytes)
                .map_err(|_| format!("非 UTF-8 Markdown，依赖检查未完成: {}", path.display()))?;
            evidence.extend(mentions(&path.to_string_lossy(), text));
            if evidence.len() > 20_000 {
                return Err("依赖候选超过上限，检查未完成".into());
            }
        }
    }
    for item in &mut evidence {
        item.resolution = Some(resolve_relative(guard.root(), item));
    }
    evidence
        .sort_by(|a, b| (&a.document, a.line, &a.target).cmp(&(&b.document, b.line, &b.target)));
    Ok(Inventory { evidence })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archive_destination_spans_preserve_unicode_duplicates_and_angle_syntax() {
        let text =
            "中文\r\n[甲](a.md#段落) ![图](<图 片.png>) [乙](a.md#段落) [嵌套](folder/a(b).md)";
        let found = mentions("note.md", text);
        assert_eq!(found.len(), 4);
        let mut ranges = vec![];
        for evidence in &found {
            let span = evidence
                .destination_span
                .as_ref()
                .expect("literal inline destination");
            assert_eq!(&text[span.start..span.end], evidence.target);
            assert_eq!(span.original, evidence.target);
            assert_eq!(evidence.line, 2);
            ranges.push(span.start);
        }
        ranges.sort();
        ranges.dedup();
        assert_eq!(ranges.len(), 4);
        let span = found
            .iter()
            .find(|e| e.target == "图 片.png")
            .unwrap()
            .destination_span
            .as_ref()
            .unwrap();
        let mut preview = text.to_string();
        preview.replace_range(span.start..span.end, "新图.png");
        assert_eq!(preview, text.replace("<图 片.png>", "<新图.png>"));
    }

    #[test]
    fn archive_destination_spans_do_not_guess_reference_title_or_decoded_syntax() {
        let text = "[ref][id]\n\n[id]: a.md\n\n[title](a.md \"说明\") [escaped](a\\(b\\).md) [entity](a&amp;b.md) ` [code](a.md) ` <a href=\"a.md\">a</a>";
        let found = mentions("note.md", text);
        assert!(found.len() >= 6);
        assert!(found.iter().all(|e| e.destination_span.is_none()));
        assert!(!found.iter().any(|e| e.line == 0));
    }

    struct Fixture(PathBuf);
    #[test]
    fn archive_proposed_target_roundtrips_encoded_filename_and_unicode_fragment() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("archive")).unwrap();
        let source = f.0.join("notes/a.md");
        let body = "中文 [附件](<图 #%.png?mode=1#章节>)";
        // A literal # in a URL is a fragment delimiter, so the source must encode it.
        let body = body.replace("图 #%.png", "图 %23%25.png");
        fs::write(&source, &body).unwrap();
        fs::write(f.0.join("notes/图 #%.png"), "image").unwrap();
        let report = scan(f.0.to_str().unwrap()).unwrap().report_move(
            &f.0,
            &source,
            &f.0.join("archive/a.md"),
        );
        let impact = &report.move_impacts[0];
        assert_eq!(impact.status, "rewrite_required");
        let proposed = impact.proposed_target.as_ref().unwrap();
        assert_eq!(
            proposed,
            "../notes/%E5%9B%BE%20%23%25.png?mode=1#%E7%AB%A0%E8%8A%82"
        );
        let preview = super::super::archive_edits::preview(
            source.to_str().unwrap(),
            &body,
            &[(impact.evidence.clone(), proposed.clone())],
        )
        .unwrap();
        assert_eq!(preview, format!("中文 [附件](<{proposed}>)"));
        assert_eq!(fs::read_to_string(&source).unwrap(), body);
        assert!(!f.0.join("archive/a.md").exists());
    }

    #[test]
    fn archive_proposed_target_follows_batch_rename_and_external_incoming() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("archive")).unwrap();
        let a = f.0.join("notes/a.md");
        let b = f.0.join("notes/b.md");
        fs::write(&a, "[b](b.md#part)").unwrap();
        fs::write(&b, "B").unwrap();
        fs::write(f.0.join("index.md"), "[a](notes/a.md)").unwrap();
        let report = scan(f.0.to_str().unwrap()).unwrap().report_batch(
            &f.0,
            &a,
            &[
                (a.clone(), f.0.join("archive/a.md")),
                (b, f.0.join("archive/new name.md")),
            ],
        );
        assert!(report.move_impacts.iter().any(|i| i.direction == "outgoing"
            && i.proposed_target.as_deref() == Some("new%20name.md#part")));
        assert!(report
            .move_impacts
            .iter()
            .any(|i| i.direction == "incoming"
                && i.proposed_target.as_deref() == Some("archive/a.md")));
        assert!(!report.complete);
    }

    #[test]
    fn archive_proposed_target_does_not_guess_unsupported_or_outside_paths() {
        let f = Fixture::new();
        let source = f.0.join("notes/a.md");
        fs::write(&source, "[b](b.md \"title\")").unwrap();
        fs::write(f.0.join("notes/b.md"), "B").unwrap();
        let report =
            scan(f.0.to_str().unwrap())
                .unwrap()
                .report_move(&f.0, &source, &f.0.join("a.md"));
        assert_eq!(report.move_impacts[0].status, "rewrite_required");
        assert!(report.move_impacts[0].proposed_target.is_none());
        let e = mentions(source.to_str().unwrap(), "[b](b.md#bad%)").remove(0);
        assert!(super::super::archive_edits::relative_target(
            &f.0,
            &source,
            &f.0.join("notes/b.md"),
            &e
        )
        .is_none());
        assert!(super::super::archive_edits::relative_target(
            &f.0,
            &source,
            &f.0.parent().unwrap().join("outside.md"),
            &e
        )
        .is_none());
    }

    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "archive-resolve-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(path.join("notes")).unwrap();
            Self(path.canonicalize().unwrap())
        }
        fn resolve(&self, target: &str) -> DependencyResolution {
            resolve_relative(
                &self.0,
                &DependencyEvidence {
                    document: self.0.join("notes/note.md").to_string_lossy().into_owned(),
                    line: 1,
                    target: target.into(),
                    kind: "markdown",
                    resolution: None,
                    destination_span: None,
                    snapshot_sha256: String::new(),
                },
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn archive_relative_resolution_respects_document_directory_and_encoded_hash() {
        let f = Fixture::new();
        fs::write(f.0.join("a#b.md"), "root").unwrap();
        fs::write(f.0.join("notes/a#b.md"), "local").unwrap();
        assert_eq!(
            f.resolve("../a%23b.md#heading").path.unwrap(),
            f.0.join("a#b.md").to_string_lossy()
        );
        assert_eq!(
            f.resolve("a%23b.md").path.unwrap(),
            f.0.join("notes/a#b.md").to_string_lossy()
        );
        assert_eq!(f.resolve("../a%23b.md").status, "resolved_file");
    }
    #[test]
    fn archive_relative_resolution_distinguishes_missing_outside_and_unsupported() {
        let f = Fixture::new();
        assert_eq!(f.resolve("../missing.md").status, "missing");
        assert_eq!(f.resolve("../../outside.md").status, "outside_library");
        assert_eq!(
            f.resolve("%2e%2e/%2e%2e/outside.md").status,
            "outside_library"
        );
        for target in [
            "C:/file.md",
            "/absolute.md",
            "file:///a.md",
            "a&amp;b.md",
            "../notes",
        ] {
            assert_eq!(f.resolve(target).status, "unsupported");
        }
    }
    #[test]
    fn archive_scan_attaches_resolution_without_claiming_complete_safety() {
        let f = Fixture::new();
        fs::write(f.0.join("target.md"), "target").unwrap();
        fs::write(
            f.0.join("notes/note.md"),
            "[target](../target.md)\n[[target]]",
        )
        .unwrap();
        let inventory = scan(f.0.to_str().unwrap()).unwrap();
        let report = inventory.report(&f.0.join("target.md"));
        assert_eq!(report.incoming_candidates.len(), 2);
        assert_eq!(
            report.incoming_candidates[0]
                .resolution
                .as_ref()
                .unwrap()
                .status,
            "resolved_file"
        );
        assert_eq!(
            report.incoming_candidates[1]
                .resolution
                .as_ref()
                .unwrap()
                .status,
            "unsupported"
        );
        assert!(!report.complete);
        assert_eq!(fs::read_to_string(f.0.join("target.md")).unwrap(), "target");
    }
    #[test]
    fn finds_images_reference_definitions_html_and_wiki_with_lines() {
        let e = mentions("note.md", "![图](assets/a.png)\n[doc]: ../other.md\n<img src='images/b.png'>\n[[计划|别名]]\n[web](https://example.com)\n[anchor](#part)");
        assert_eq!(e.len(), 4);
        assert_eq!(e[1].kind, "unparsed_reference_candidate");
        assert_eq!(e[2].line, 3);
        assert_eq!(e[3].target, "计划");
    }
    #[test]
    fn incoming_is_conservative_about_ambiguous_names_and_encoded_paths() {
        let inv = Inventory {
            evidence: mentions(
                "other.md",
                "[a](Inbox/%E8%AE%A1%E5%88%92.md#标题)\n[[计划]]\n[[else/计划.md|x]]",
            ),
        };
        let r = inv.report(Path::new("Inbox/计划.md"));
        assert_eq!(r.incoming_candidates.len(), 3);
        assert!(!r.complete);
    }
    #[test]
    fn recognizes_pdf_reference_and_does_not_confuse_fragment_encoding() {
        let e = mentions(
            "note.md",
            "[来源](longedit://pdf?path=files%2Fpaper.pdf&page=2)",
        );
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].kind, "pdf_reference");
        assert_eq!(e[0].target, "files/paper.pdf");
        assert_eq!(basename("folder/a%23b.md#section"), "a#b.md");
    }

    #[test]
    fn archive_markdown_parser_preserves_spaces_balanced_parentheses_and_references() {
        let evidence = mentions("note.md", "[space](<folder/my note.md>)\n![image](images/a(b).png)\n[used][ref]\n\n[ref]: <folder/reference note.md> \"Title\"");
        assert!(evidence
            .iter()
            .any(|e| e.target == "folder/my note.md" && e.line == 1));
        assert!(evidence
            .iter()
            .any(|e| e.target == "images/a(b).png" && e.line == 2));
        assert!(evidence
            .iter()
            .any(|e| e.target == "folder/reference note.md"
                && e.line == 3
                && e.kind == "markdown"));
        assert!(evidence
            .iter()
            .any(|e| e.target == "folder/reference note.md"
                && e.line == 5
                && e.kind == "reference_definition"));
    }

    #[test]
    fn archive_markdown_parser_ignores_standard_link_examples_in_code() {
        let evidence = mentions("note.md", "`[inline](fake.md)`\n\n```md\n[fence](fake2.md)\n<img src='fake.png'>\n```\n\n    [indent](fake3.md)\n\n[real](real.md)");
        assert_eq!(evidence.len(), 1);
        assert_eq!(evidence[0].target, "real.md");
        assert_eq!(evidence[0].line, 10);
        assert!(mentions(
            "note.md",
            "```md\n[ref]: fake.md\n```\n\n    [other]: fake2.md"
        )
        .is_empty());
    }

    #[test]
    fn archive_markdown_parser_handles_escaped_destination_and_html_line_number() {
        let evidence = mentions(
            "note.md",
            "[escaped](folder/a\\(b\\).md)\n\n<img\n src='image.png'>",
        );
        assert!(evidence.iter().any(|e| e.target == "folder/a(b).md"));
        assert!(evidence
            .iter()
            .any(|e| e.target == "image.png" && e.line == 4));
    }

    #[test]
    fn archive_move_impact_finds_changed_outgoing_and_exact_incoming_without_writes() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("project")).unwrap();
        fs::write(f.0.join("notes/image.png"), b"image").unwrap();
        let source = f.0.join("notes/note.md");
        fs::write(&source, "![image](image.png)\n[self](note.md)").unwrap();
        fs::write(f.0.join("index.md"), "[note](notes/note.md)").unwrap();
        let target = f.0.join("project/renamed.md");
        let report = scan(f.0.to_str().unwrap())
            .unwrap()
            .report_move(&f.0, &source, &target);
        assert_eq!(report.move_impacts.len(), 3);
        assert!(report
            .move_impacts
            .iter()
            .all(|impact| impact.status == "rewrite_required"));
        assert!(report
            .move_impacts
            .iter()
            .any(|impact| impact.direction == "incoming"
                && impact.intended_path.as_deref() == target.to_str()));
        assert!(!report.complete);
        assert!(!target.exists());
        assert_eq!(
            fs::read_to_string(source).unwrap(),
            "![image](image.png)\n[self](note.md)"
        );
    }

    #[test]
    fn archive_move_impact_preserves_shared_target_and_distinguishes_same_named_files() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("project")).unwrap();
        fs::write(f.0.join("shared.md"), "shared").unwrap();
        fs::write(f.0.join("project/note.md"), "different").unwrap();
        let source = f.0.join("notes/note.md");
        fs::write(&source, "[shared](../shared.md)\n[[unknown]]").unwrap();
        fs::write(f.0.join("index.md"), "[different](project/note.md)").unwrap();
        let report = scan(f.0.to_str().unwrap()).unwrap().report_move(
            &f.0,
            &source,
            &f.0.join("project/moved.md"),
        );
        assert!(report
            .move_impacts
            .iter()
            .any(|i| i.status == "same_destination"));
        assert!(report
            .move_impacts
            .iter()
            .any(|i| i.status == "different_target"));
        assert!(report
            .move_impacts
            .iter()
            .any(|i| i.status == "needs_review"));
        assert!(!report.complete);
    }

    #[test]
    fn archive_batch_keeps_relative_links_when_both_documents_move_together() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("project")).unwrap();
        let a = f.0.join("notes/a.md");
        let b = f.0.join("notes/b.md");
        fs::write(&a, "[b](b.md)").unwrap();
        fs::write(&b, "[a](a.md)").unwrap();
        let moves = vec![
            (a.clone(), f.0.join("project/a.md")),
            (b.clone(), f.0.join("project/b.md")),
        ];
        let inventory = scan(f.0.to_str().unwrap()).unwrap();
        let single = inventory.report_move(&f.0, &a, &moves[0].1);
        assert!(single
            .move_impacts
            .iter()
            .all(|i| i.status == "rewrite_required"));
        let batch = inventory.report_batch(&f.0, &a, &moves);
        assert_eq!(batch.move_impacts.len(), 2);
        assert!(batch
            .move_impacts
            .iter()
            .all(|i| i.status == "same_destination"));
        assert!(!batch.complete);
        assert!(batch
            .limitations
            .contains(&"batch_projection_assumes_all_planned_moves_succeed"));
        assert!(a.exists() && b.exists() && !moves[0].1.exists());
    }

    #[test]
    fn archive_batch_rename_and_unmoved_incoming_still_require_rewrites() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("project")).unwrap();
        let a = f.0.join("notes/a.md");
        let b = f.0.join("notes/b.md");
        fs::write(&a, "[b](b.md)").unwrap();
        fs::write(&b, "b").unwrap();
        fs::write(f.0.join("index.md"), "[a](notes/a.md)").unwrap();
        let moves = vec![
            (a.clone(), f.0.join("project/a.md")),
            (b, f.0.join("project/renamed.md")),
        ];
        let report = scan(f.0.to_str().unwrap())
            .unwrap()
            .report_batch(&f.0, &a, &moves);
        assert_eq!(report.move_impacts.len(), 2);
        assert!(report
            .move_impacts
            .iter()
            .all(|i| i.status == "rewrite_required"));
    }
}
