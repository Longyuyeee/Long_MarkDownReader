//! Process-local, fail-fast history mutation lease. Not a cross-process file lock.
use std::{
    collections::HashSet,
    path::Path,
    sync::{Mutex, OnceLock},
};

fn active() -> &'static Mutex<HashSet<String>> {
    static ACTIVE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) struct HistoryLease(String);
impl HistoryLease {
    pub(crate) fn verify(&self, cache: &Path) -> Result<(), String> {
        let mut key = cache.to_string_lossy().replace('\\', "/");
        if cfg!(windows) {
            key.make_ascii_lowercase();
        }
        if self.0 != key.trim_end_matches('/') {
            return Err("历史锁与缓存不匹配".into());
        }
        Ok(())
    }
}
impl Drop for HistoryLease {
    fn drop(&mut self) {
        if let Ok(mut active) = active().lock() {
            active.remove(&self.0);
        }
    }
}

pub(crate) fn acquire(cache: &Path) -> Result<HistoryLease, String> {
    if !cache.is_absolute() {
        return Err("历史缓存必须是绝对路径".into());
    }
    // Cache may not exist yet. Callers use the same application cache root.
    let mut key = cache.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        key.make_ascii_lowercase();
    }
    let key = key.trim_end_matches('/').to_owned();
    let mut active = active().lock().map_err(|_| "历史操作协调状态异常")?;
    if !active.insert(key.clone()) {
        return Err("历史记录正在保存或归档，请稍后重试".into());
    }
    Ok(HistoryLease(key))
}

/// Do not let ordinary history clearing erase unfinished archive evidence.
pub(crate) fn ensure_clearable(cache: &Path) -> Result<(), String> {
    let entries = match std::fs::read_dir(cache) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(".archive-stage-")
        {
            return Err("存在待处理的归档暂存记录，暂不能清空历史；请保留恢复材料".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_coordination_excludes_same_cache_and_releases_on_drop() {
        let root = std::env::temp_dir().join(format!("history-lease-{}", std::process::id()));
        let lease = acquire(&root).unwrap();
        assert!(acquire(&root).is_err());
        let other = acquire(&root.join("other")).unwrap();
        drop(lease);
        assert!(acquire(&root).is_ok());
        drop(other);
    }
    #[test]
    fn history_coordination_preserves_incomplete_staging_on_clear() {
        let root = std::env::temp_dir().join(format!(
            "history-clear-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        assert!(ensure_clearable(&root).is_ok());
        std::fs::create_dir(root.join(".archive-stage-interrupted")).unwrap();
        assert!(ensure_clearable(&root).is_err());
        assert!(root.join(".archive-stage-interrupted").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
