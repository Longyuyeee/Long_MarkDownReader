//! Conservative candidate inventory, not a complete link resolver or permission to move.
use crate::formats::markdown::{extract_pdf_reference_mentions, extract_wikilink_mentions};
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::LazyLock,
};

static INLINE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"!?\[[^\]\r\n]*\]\(\s*<?([^\s)>]+)"#).unwrap());
static REFERENCE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?m)^\s{0,3}\[[^\]\r\n]+\]:\s*<?([^\s>]+)"#).unwrap());
static HTML: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"(?i)\b(?:src|href)\s*=\s*["']([^"']+)["']"#).unwrap());

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DependencyEvidence {
    pub document: String,
    pub line: usize,
    pub target: String,
    pub kind: &'static str,
    pub resolution: Option<DependencyResolution>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DependencyResolution {
    pub status: &'static str,
    pub path: Option<String>,
}

/// Resolve only ordinary relative file destinations. This is evidence, not permission.
fn resolve_relative(root: &Path, evidence: &DependencyEvidence) -> DependencyResolution {
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

fn mentions(document: &str, text: &str) -> Vec<DependencyEvidence> {
    let mut found = vec![];
    for (pattern, kind) in [
        (&*INLINE, "markdown"),
        (&*REFERENCE, "reference_definition"),
        (&*HTML, "html_attribute"),
    ] {
        for capture in pattern.captures_iter(text) {
            let target = &capture[1];
            if local(target) && !target.starts_with("longedit://pdf?") {
                found.push(DependencyEvidence {
                    document: document.into(),
                    line: text[..capture.get(0).unwrap().start()]
                        .bytes()
                        .filter(|b| *b == b'\n')
                        .count()
                        + 1,
                    target: target.into(),
                    kind,
                    resolution: None,
                });
            }
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
            if entry.file_name() == ".git" {
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
    struct Fixture(PathBuf);
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
}
