//! Process-local, fail-fast history coordination: shared readers, exclusive mutations.
//! Not a cross-process file lock.
use std::{
    collections::HashMap,
    path::Path,
    sync::{Mutex, OnceLock},
};

#[derive(Default)]
struct ActiveAccess {
    readers: usize,
    writing: bool,
}

fn active() -> &'static Mutex<HashMap<String, ActiveAccess>> {
    static ACTIVE: OnceLock<Mutex<HashMap<String, ActiveAccess>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) struct HistoryLease(String);
pub(crate) struct HistoryReadLease(String);

pub(crate) fn acquire_read(cache: &Path) -> Result<HistoryReadLease, String> {
    let key = cache_key(cache)?;
    let mut active = active().lock().map_err(|_| "历史操作协调状态异常")?;
    let access = active.entry(key.clone()).or_default();
    if access.writing {
        return Err("历史记录正在保存或整理，请稍后重试".into());
    }
    access.readers = access
        .readers
        .checked_add(1)
        .ok_or("历史读取请求过多，请稍后重试")?;
    Ok(HistoryReadLease(key))
}

impl Drop for HistoryReadLease {
    fn drop(&mut self) {
        if let Ok(mut active) = active().lock() {
            if let Some(access) = active.get_mut(&self.0) {
                access.readers -= 1;
                if access.readers == 0 {
                    active.remove(&self.0);
                }
            }
        }
    }
}
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
    let key = cache_key(cache)?;
    let mut active = active().lock().map_err(|_| "历史操作协调状态异常")?;
    if active.contains_key(&key) {
        return Err("历史记录正在读取、保存或整理，请稍后重试".into());
    }
    active.insert(
        key.clone(),
        ActiveAccess {
            readers: 0,
            writing: true,
        },
    );
    Ok(HistoryLease(key))
}

fn cache_key(cache: &Path) -> Result<String, String> {
    if !cache.is_absolute() {
        return Err("历史缓存必须是绝对路径".into());
    }
    // Cache may not exist yet. Callers use the same application cache root.
    let mut key = cache.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        key.make_ascii_lowercase();
    }
    Ok(key.trim_end_matches('/').to_owned())
}

/// Do not let ordinary history clearing erase unfinished archive evidence.
pub(crate) fn ensure_clearable(cache: &Path) -> Result<(), String> {
    super::file_move_transaction::ensure_clearable(cache)?;
    if !super::file_move_journal::pending(cache)?.is_empty() {
        return Err("存在待核对的文件移动记录，暂不能清空历史；请保留恢复材料".into());
    }
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
    fn read_fixture(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("history-read-{}-{name}", std::process::id()))
    }

    #[test]
    fn parallel_history_readers_share_cache_but_exclude_mutation() {
        let root = read_fixture("parallel");
        let first = acquire_read(&root).unwrap();
        let second = acquire_read(&root).expect("列表与备注同时读取不能互报忙");
        assert!(acquire(&root).is_err(), "读取中不能移动、清理或写历史");
        drop(first);
        assert!(acquire(&root).is_err(), "另一个读请求尚未结束");
        drop(second);
        assert!(acquire(&root).is_ok());
    }

    #[test]
    fn history_writer_excludes_reads_and_read_error_releases_guard() {
        let root = read_fixture("writer");
        let writer = acquire(&root).unwrap();
        assert!(acquire_read(&root).is_err());
        drop(writer);
        let failing_read = || -> Result<(), String> {
            let _read = acquire_read(&root)?;
            Err("模拟历史读取失败".into())
        };
        assert!(failing_read().is_err());
        assert!(acquire(&root).is_ok(), "读取失败后不能留下占用");
        assert!(acquire_read(Path::new("relative-cache")).is_err());
    }

    #[test]
    fn history_readers_in_different_threads_hold_protection_until_both_finish() {
        let root = read_fixture("threads");
        let first = acquire_read(&root).unwrap();
        std::thread::scope(|scope| {
            scope
                .spawn(|| {
                    let _second = acquire_read(&root).expect("另一窗口应能同时读取历史");
                    assert!(acquire(&root).is_err());
                })
                .join()
                .unwrap();
        });
        assert!(acquire(&root).is_err());
        drop(first);
        assert!(acquire(&root).is_ok());
    }

    #[test]
    fn history_readers_share_normalized_cache_identity_and_leave_other_caches_free() {
        let root = read_fixture("identity");
        let first = acquire_read(&root).unwrap();
        let alias = format!("{}/", root.to_string_lossy().replace('\\', "/"));
        let alias = if cfg!(windows) {
            alias.to_ascii_uppercase()
        } else {
            alias
        };
        let second = acquire_read(Path::new(&alias)).unwrap();
        assert!(acquire(Path::new(&alias)).is_err());
        assert!(acquire(&root.join("unrelated")).is_ok());
        drop(first);
        drop(second);
        assert!(acquire(&root).is_ok());
    }
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
