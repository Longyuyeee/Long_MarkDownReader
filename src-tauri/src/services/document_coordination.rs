//! Process-local, fail-fast path/subtree exclusion for participating writers and
//! path mutations. Not a draft registry, UI freeze or cross-process file lock.
use std::{
    collections::BTreeSet,
    path::{Component, Path},
    sync::{Mutex, OnceLock},
};

const MAX_PATHS: usize = 20_000;
const MAX_ACTIVE: usize = 40_000;

fn active() -> &'static Mutex<BTreeSet<String>> {
    static ACTIVE: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(BTreeSet::new()))
}
pub(crate) struct DocumentLease(Vec<String>);
impl Drop for DocumentLease {
    fn drop(&mut self) {
        if let Ok(mut active) = active().lock() {
            for key in &self.0 {
                active.remove(key);
            }
        }
    }
}
pub(crate) fn acquire(paths: &[&Path]) -> Result<DocumentLease, String> {
    if paths.is_empty() || paths.len() > MAX_PATHS {
        return Err("文档协调路径数量须为 1 至 20000 项".into());
    }
    let mut keys = Vec::new();
    for path in paths {
        if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err("文档协调需要不含父目录跳转的绝对路径".into());
        }
        // Canonicalize the closest existing parent, not the leaf. Preserve the
        // same key before/after a move and reserve future descendants without
        // creating directories. Inaccessible parents fail closed, not as absent.
        let mut parent = path.parent().ok_or("缺少文档目录")?;
        loop {
            match std::fs::metadata(parent) {
                Ok(meta) if meta.is_dir() => break,
                Ok(_) => return Err("文档协调路径的父项不是目录".into()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    parent = parent.parent().ok_or("文档协调路径没有有效父目录")?;
                }
                Err(e) => return Err(format!("无法核对文档协调目录：{e}")),
            }
        }
        let canonical = parent.canonicalize().map_err(|e| e.to_string())?;
        let suffix = path.strip_prefix(parent).map_err(|e| e.to_string())?;
        let mut key = canonical.join(suffix).to_string_lossy().replace('\\', "/");
        if cfg!(windows) {
            key = key.to_lowercase();
        }
        keys.push(key.trim_end_matches('/').to_owned());
    }
    keys.sort();
    keys.dedup();
    let mut active = active().lock().map_err(|_| "文档协调状态异常")?;
    if active.len().saturating_add(keys.len()) > MAX_ACTIVE {
        return Err("同时协调的文档过多，请保留修改并稍后重试".into());
    }
    if keys.iter().any(|key| conflicts(&active, key)) {
        return Err("文档正在保存或整理，请保留修改并稍后重试".into());
    }
    active.extend(keys.iter().cloned());
    Ok(DocumentLease(keys))
}

fn conflicts(active: &BTreeSet<String>, key: &str) -> bool {
    if active.contains(key) {
        return true;
    }
    // Ordered lookup avoids comparing every candidate with every active path.
    // Separators are required: `folder-extra` is not a child of `folder`.
    let prefix = format!("{key}/");
    if active
        .range(prefix.clone()..)
        .next()
        .is_some_and(|candidate| candidate.starts_with(&prefix))
    {
        return true;
    }
    key.match_indices('/')
        .any(|(index, _)| active.contains(&key[..index]))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn archive_document_lease_reserves_all_paths_atomically_and_releases() {
        let root = std::env::temp_dir();
        let prefix = format!(
            "lease-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let a = root.join(format!("{prefix}-a.md"));
        let b = root.join(format!("{prefix}-b.md"));
        let c = root.join(format!("{prefix}-c.md"));
        let lease = acquire(&[&a, &b, &a]).unwrap();
        assert!(acquire(&[&b, &c]).is_err());
        assert!(acquire(&[&c]).is_ok());
        assert!(acquire(&[&a]).is_err());
        drop(lease);
        assert!(acquire(&[&a, &b]).is_ok());
        assert!(!a.exists() && !b.exists());
    }

    #[test]
    fn directory_lease_excludes_descendant_saves_without_blocking_siblings() {
        let root = std::env::temp_dir().join(format!(
            "move-scope-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(root.join("folder")).unwrap();
        let directory = root.join("folder");
        let child = directory.join("a.md");
        let unrelated = root.join("folder-extra.md");
        let lease = acquire(&[&directory]).unwrap();
        assert!(
            acquire(&[&child]).is_err(),
            "a directory move must exclude a child text save"
        );
        assert!(
            acquire(&[&unrelated]).is_ok(),
            "path boundaries must not lock similarly named siblings"
        );
        drop(lease);
        let saving = acquire(&[&child]).unwrap();
        assert!(
            acquire(&[&directory]).is_err(),
            "a child save must also exclude moving its parent"
        );
        drop(saving);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn future_descendant_lease_uses_existing_ancestor_without_creating_directories() {
        let root = std::env::temp_dir().join(format!(
            "move-future-scope-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let destination = root.join("future");
        let child = destination.join("nested").join("note.md");
        let lease = acquire(&[&child])
            .expect("future paths must share the same canonical ancestor identity");
        assert!(!destination.exists());
        assert!(acquire(&[&destination]).is_err());
        drop(lease);
        assert!(acquire(&[&destination]).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn subtree_conflict_is_atomic_and_rejects_raw_traversal() {
        let root = std::env::temp_dir().join(format!(
            "move-atomic-scope-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let directory = root.join("parent");
        let child = directory.join("a.md");
        let sibling = root.join("other.md");
        let saving = acquire(&[&child]).unwrap();
        assert!(acquire(&[&sibling, &directory]).is_err());
        assert!(
            acquire(&[&sibling]).is_ok(),
            "failure must not partially reserve unrelated paths"
        );
        let traversal = std::path::PathBuf::from(format!(
            "{}{}x{}..{}other.md",
            root.display(),
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR
        ));
        assert!(acquire(&[&traversal]).is_err());
        drop(saving);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_case_aliases_share_subtree_ownership() {
        let root = std::env::temp_dir().join(format!(
            "move-case-scope-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let directory = root.join("Folder");
        let lease = acquire(&[&directory]).unwrap();
        let child =
            std::path::PathBuf::from(directory.join("a.md").to_string_lossy().to_uppercase());
        assert!(acquire(&[&child]).is_err());
        drop(lease);
        std::fs::remove_dir_all(root).unwrap();
    }
}
