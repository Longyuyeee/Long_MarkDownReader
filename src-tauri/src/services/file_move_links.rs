//! Read-only impact plan for existing library moves. Not a command or write permit.
#![allow(dead_code)] // Guarded execution and UI review must be connected separately.
use super::{
    archive_dependencies::{self, DependencyEvidence},
    archive_edits,
    workspace_guard::WorkspaceGuard,
};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub(crate) struct DocumentEdit {
    pub source: PathBuf,
    pub target: PathBuf,
    pub snapshot_sha256: String,
    pub original: String,
    pub replacement: String,
    pub changed_references: usize,
}
#[derive(Debug)]
pub(crate) struct MoveLinkPlan {
    pub documents: Vec<DocumentEdit>,
    pub blockers: Vec<String>,
    pub can_execute: bool,
    pub limitations: [&'static str; 4],
}
fn key(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}
fn mapped(path: &Path, source: &Path, target: &Path) -> PathBuf {
    path.strip_prefix(source)
        .map(|suffix| {
            if suffix.as_os_str().is_empty() {
                target.to_path_buf()
            } else {
                target.join(suffix)
            }
        })
        .unwrap_or_else(|_| path.to_path_buf())
}
fn moved_names(source: &Path) -> Result<HashSet<String>, String> {
    let mut pending = vec![source.to_path_buf()];
    let mut names = HashSet::new();
    let mut count = 0;
    while let Some(path) = pending.pop() {
        count += 1;
        if count > 20_000 {
            return Err("移动目录超过引用检查上限，尚未写入文件".into());
        }
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("移动目录包含链接，引用检查未完成".into());
        }
        if metadata.is_dir() {
            for item in fs::read_dir(&path).map_err(|e| e.to_string())? {
                if pending.len() + count >= 20_000 {
                    return Err("移动目录超过引用检查上限，尚未写入文件".into());
                }
                pending.push(item.map_err(|e| e.to_string())?.path());
            }
        } else if metadata.is_file() {
            if let Some(name) = path.file_name() {
                names.insert(name.to_string_lossy().to_lowercase());
            }
            if let Some(stem) = path.file_stem() {
                names.insert(stem.to_string_lossy().to_lowercase());
            }
        }
    }
    Ok(names)
}
fn candidate_name(target: &str) -> String {
    let path = target.split(['#', '?', '|']).next().unwrap_or("");
    urlencoding::decode(path)
        .unwrap_or_else(|_| path.into())
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_lowercase()
}

pub(crate) fn plan(root: &str, source: &Path, target: &Path) -> Result<MoveLinkPlan, String> {
    let guard = WorkspaceGuard::new(root)?;
    let source = guard.resolve_existing(source)?;
    let target = guard.resolve_for_write(target)?;
    if source == guard.root()
        || target == guard.root()
        || key(&source) == key(&target)
        || target.starts_with(&source)
        || target.try_exists().map_err(|e| e.to_string())?
    {
        return Err("移动来源或目标无效、被占用或指向自身子目录；未写入文件".into());
    }
    for path in [&source, &target] {
        if path
            .strip_prefix(guard.root())
            .map_err(|e| e.to_string())?
            .components()
            .any(|part| {
                part.as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(".longedit")
            })
        {
            return Err("不能把资料库内部记录作为移动来源或目标".into());
        }
    }
    let names = moved_names(&source)?;
    let inventory = archive_dependencies::scan_visible(root)?;
    let mut proposals: BTreeMap<String, Vec<(DependencyEvidence, String)>> = BTreeMap::new();
    let mut blockers = Vec::new();
    for evidence in inventory.evidence() {
        let document = Path::new(&evidence.document);
        let next_document = mapped(document, &source, &target);
        let document_moved = key(document) != key(&next_document);
        let before = evidence.resolution.as_ref().ok_or("缺少引用解析证据")?;
        let resolved = before
            .path
            .as_deref()
            .map(Path::new)
            .and_then(|p| p.canonicalize().ok());
        let intended = resolved.as_deref().map(|p| mapped(p, &source, &target));
        let target_moved = resolved
            .as_ref()
            .zip(intended.as_ref())
            .is_some_and(|(a, b)| key(a) != key(b));
        if !document_moved && !target_moved {
            // Unsupported links are only potential incoming candidates, never
            // guessed replacements. An unrelated resolved same-name link is safe.
            if before.status != "resolved_file" && names.contains(&candidate_name(&evidence.target))
            {
                blockers.push(format!(
                    "{} 第 {} 行存在需核对的引用：{}",
                    evidence.document, evidence.line, evidence.target
                ));
            }
            continue;
        }
        let Some(intended) = intended.filter(|_| before.status == "resolved_file") else {
            blockers.push(format!(
                "{} 第 {} 行的本地引用失效或不支持，未猜测改写：{}",
                evidence.document, evidence.line, evidence.target
            ));
            continue;
        };
        let mut after = evidence.clone();
        after.document = next_document.to_string_lossy().into_owned();
        let unchanged = archive_dependencies::resolve_relative(guard.root(), &after);
        if unchanged
            .path
            .as_deref()
            .is_some_and(|p| key(Path::new(p)) == key(&intended))
            && ["resolved_file", "missing"].contains(&unchanged.status)
        {
            continue;
        }
        if evidence.destination_span.is_none() {
            blockers.push(format!(
                "{} 第 {} 行引用没有安全的源码范围，未改写：{}",
                evidence.document, evidence.line, evidence.target
            ));
            continue;
        }
        match archive_edits::relative_target(guard.root(), &next_document, &intended, evidence) {
            Some(replacement) => proposals
                .entry(evidence.document.clone())
                .or_default()
                .push((evidence.clone(), replacement)),
            None => blockers.push(format!(
                "{} 第 {} 行无法计算可靠的新引用",
                evidence.document, evidence.line
            )),
        }
    }
    let mut documents = Vec::new();
    for (document, changes) in proposals {
        let mut original = String::new();
        fs::File::open(&document)
            .map_err(|e| e.to_string())?
            .take(2 * 1024 * 1024 + 1)
            .read_to_string(&mut original)
            .map_err(|e| e.to_string())?;
        if original.len() > 2 * 1024 * 1024 {
            return Err("引用来源在规划期间超过 2 MiB 上限，未写入文件".into());
        }
        let replacement = archive_edits::preview(&document, &original, &changes)?;
        documents.push(DocumentEdit {
            source: PathBuf::from(&document),
            target: mapped(Path::new(&document), &source, &target),
            snapshot_sha256: changes[0].0.snapshot_sha256.clone(),
            original,
            replacement,
            changed_references: changes.len(),
        });
    }
    blockers.sort();
    blockers.dedup();
    // A syntactically valid plan is not permission to change other open drafts,
    // move files, touch resources or infer that a batch will wholly succeed.
    Ok(MoveLinkPlan {
        documents,
        blockers,
        can_execute: false,
        limitations: [
            "visible-utf8-markdown-only-2mib-per-file-32mib-total",
            "non-markdown-incoming-references-not-scanned",
            "draft-freeze-and-durable-recovery-required-before-execution",
            "single-move-projection-not-batch-success-evidence",
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            loop {
                let root = std::env::temp_dir().join(format!(
                    "longedit-link-plan-{}-{}-{}",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&root) {
                    Ok(()) => return Self(root.canonicalize().unwrap()),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => panic!("{e}"),
                }
            }
        }
        fn write(&self, relative: &str, body: &str) -> PathBuf {
            let path = relative
                .split('/')
                .fold(self.0.clone(), |path, part| path.join(part));
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, body).unwrap();
            path
        }
        fn plan(&self, from: &str, to: &str) -> MoveLinkPlan {
            let path = |relative: &str| {
                relative
                    .split('/')
                    .fold(self.0.clone(), |path, part| path.join(part))
            };
            plan(self.0.to_str().unwrap(), &path(from), &path(to)).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }
    #[test]
    fn moving_note_rebases_shared_picture_and_document_link_without_moving_resources() {
        let f = Fixture::new();
        let note = f.write(
            "note.md",
            "![图](shared/pic.png) [资料](reference.txt)\n`![示例](shared/pic.png)`\n",
        );
        let picture = f.write("shared/pic.png", "picture");
        let reference = f.write("reference.txt", "reference");
        let before = fs::read(&note).unwrap();
        let p = f.plan("note.md", "project/note.md");
        assert!(p.blockers.is_empty(), "{:?}", p.blockers);
        assert!(!p.can_execute);
        assert_eq!(p.documents.len(), 1);
        assert_eq!(p.documents[0].changed_references, 2);
        assert!(p.documents[0].replacement.contains("../shared/pic.png"));
        assert!(p.documents[0].replacement.contains("../reference.txt"));
        assert!(p.documents[0]
            .replacement
            .contains("`![示例](shared/pic.png)`"));
        assert_eq!(fs::read(note).unwrap(), before);
        assert_eq!(fs::read_to_string(picture).unwrap(), "picture");
        assert_eq!(fs::read_to_string(reference).unwrap(), "reference");
        assert!(!f.0.join("project").exists());
    }
    #[test]
    fn renaming_document_rewrites_only_resolved_incoming_target() {
        let f = Fixture::new();
        f.write("note.md", "body");
        f.write("other/note.md", "unrelated");
        f.write("index.md", "[本篇](note.md#标题) [另一篇](other/note.md)");
        let p = f.plan("note.md", "renamed.md");
        assert!(p.blockers.is_empty());
        assert_eq!(p.documents.len(), 1);
        assert_eq!(p.documents[0].changed_references, 1);
        assert!(p.documents[0]
            .replacement
            .contains("renamed.md#%E6%A0%87%E9%A2%98"));
        assert!(p.documents[0].replacement.contains("other/note.md"));
    }
    #[test]
    fn directory_move_keeps_internal_relative_links_and_repairs_external_incoming_and_outgoing() {
        let f = Fixture::new();
        f.write("folder/note.md", "![图](image.png) [共享](../shared.txt)");
        f.write("folder/image.png", "image");
        f.write("shared.txt", "shared");
        f.write("index.md", "[笔记](folder/note.md)");
        let p = f.plan("folder", "deep/moved");
        assert!(p.blockers.is_empty(), "{:?}", p.blockers);
        assert_eq!(p.documents.len(), 2);
        let note = p
            .documents
            .iter()
            .find(|d| d.source.ends_with("note.md"))
            .unwrap();
        assert_eq!(note.changed_references, 1);
        assert!(note.replacement.contains("![图](image.png)"));
        assert!(note.replacement.contains("../../shared.txt"));
        assert!(p
            .documents
            .iter()
            .any(|d| d.replacement.contains("deep/moved/note.md")));
        assert!(f.0.join("folder").exists());
        assert!(!f.0.join("deep").exists());
    }
    #[test]
    fn missing_and_unsupported_affected_links_block_without_guessing() {
        let f = Fixture::new();
        f.write(
            "note.md",
            "![缺图](missing.png) <img src=\"pic.png\"> [[target]]",
        );
        f.write("pic.png", "image");
        let p = f.plan("note.md", "folder/note.md");
        assert!(!p.can_execute);
        assert!(p.blockers.len() >= 2);
        assert!(fs::read_to_string(f.0.join("note.md"))
            .unwrap()
            .contains("missing.png"));
    }
    #[test]
    fn remote_data_and_anchor_references_are_not_downloaded_or_rewritten() {
        let f = Fixture::new();
        let body="[远端](https://example.invalid/a.md) ![图](data:image/png;base64,AAAA) [本节](#section)";
        f.write("note.md", body);
        let p = f.plan("note.md", "folder/note.md");
        assert!(p.documents.is_empty() && p.blockers.is_empty());
        assert!(!p.can_execute);
        assert_eq!(fs::read_to_string(f.0.join("note.md")).unwrap(), body);
    }
    #[test]
    fn encoded_filename_query_and_fragment_are_preserved_semantically() {
        let f = Fixture::new();
        f.write("note.md", "![图](%E5%9B%BE%20%E7%89%87.png?size=2#part)");
        f.write("图 片.png", "image");
        let p = f.plan("note.md", "folder/note.md");
        assert!(p.blockers.is_empty());
        assert!(p.documents[0]
            .replacement
            .contains("../%E5%9B%BE%20%E7%89%87.png?size=2#part"));
    }
    #[test]
    fn hidden_history_or_recycle_markdown_is_never_planned_for_editing() {
        let f = Fixture::new();
        f.write("note.md", "body");
        let hidden = f.write(".longedit/trash/old.md", "[旧引用](../../note.md)");
        f.write("index.md", "[引用](note.md)");
        let p = f.plan("note.md", "new.md");
        assert_eq!(p.documents.len(), 1);
        assert!(!p.documents[0].source.starts_with(f.0.join(".longedit")));
        assert_eq!(
            fs::read_to_string(hidden).unwrap(),
            "[旧引用](../../note.md)"
        );
    }
    #[test]
    fn occupied_or_outside_target_and_directory_cycles_are_rejected_without_writes() {
        let f = Fixture::new();
        let a = f.write("a.md", "a");
        let b = f.write("b.md", "b");
        assert!(plan(f.0.to_str().unwrap(), &a, &b).is_err());
        assert!(plan(
            f.0.to_str().unwrap(),
            &a,
            &f.0.parent().unwrap().join("outside.md")
        )
        .is_err());
        f.write("folder/note.md", "body");
        assert!(plan(
            f.0.to_str().unwrap(),
            &f.0.join("folder"),
            &f.0.join("folder").join("child")
        )
        .is_err());
        assert_eq!(fs::read_to_string(a).unwrap(), "a");
        assert_eq!(fs::read_to_string(b).unwrap(), "b");
    }

    #[test]
    fn ambiguous_wikilink_incoming_is_a_blocker_not_a_guessed_replacement() {
        let f = Fixture::new();
        f.write("note.md", "body");
        f.write("index.md", "[[note]]");
        let p = f.plan("note.md", "new.md");
        assert!(!p.can_execute);
        assert!(p.documents.is_empty());
        assert!(!p.blockers.is_empty());
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[[note]]"
        );
    }
    #[test]
    fn reference_definition_without_safe_edit_span_is_not_silently_changed() {
        let f = Fixture::new();
        f.write("note.md", "body");
        f.write("index.md", "[笔记][n]\n\n[n]: note.md\n");
        let p = f.plan("note.md", "new.md");
        assert!(!p.can_execute);
        assert!(p.documents.is_empty());
        assert!(!p.blockers.is_empty());
        assert_eq!(
            fs::read_to_string(f.0.join("index.md")).unwrap(),
            "[笔记][n]\n\n[n]: note.md\n"
        );
    }
    #[test]
    fn file_projection_has_no_directory_separator_suffix_and_fenced_examples_are_untouched() {
        let f = Fixture::new();
        f.write(
            "note.md",
            "[资料](target.txt)\n```md\n[例子](target.txt)\n```\n",
        );
        f.write("target.txt", "target");
        let p = f.plan("note.md", "sub/new.md");
        assert_eq!(p.documents.len(), 1);
        let d = &p.documents[0];
        assert_eq!(key(&d.target), key(&f.0.join("sub").join("new.md")));
        assert_eq!(d.changed_references, 1);
        assert!(d.replacement.contains("[资料](../target.txt)"));
        assert!(d.replacement.contains("```md\n[例子](target.txt)\n```"));
    }
}
