//! Process-local fail-fast exclusion, not a draft registry or cross-process lock.
use std::{
    collections::HashSet,
    path::Path,
    sync::{Mutex, OnceLock},
};

fn active() -> &'static Mutex<HashSet<String>> {
    static ACTIVE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashSet::new()))
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
    if paths.is_empty() {
        return Err("缺少待协调文档路径".into());
    }
    let mut keys = Vec::new();
    for path in paths {
        if !path.is_absolute() {
            return Err("文档协调需要绝对路径".into());
        }
        // Canonicalize the parent, not the leaf: retain the same key after move
        // and reserve not-yet-existing destinations without creating them.
        let parent = path
            .parent()
            .ok_or("缺少文档目录")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let name = path.file_name().ok_or("缺少文档文件名")?;
        let mut key = parent.join(name).to_string_lossy().replace('\\', "/");
        if cfg!(windows) {
            key.make_ascii_lowercase();
        }
        keys.push(key);
    }
    keys.sort();
    keys.dedup();
    let mut active = active().lock().map_err(|_| "文档协调状态异常")?;
    if keys.iter().any(|key| active.contains(key)) {
        return Err("文档正在保存或归档，请保留修改并稍后重试".into());
    }
    active.extend(keys.iter().cloned());
    Ok(DocumentLease(keys))
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
}
