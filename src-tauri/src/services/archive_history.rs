//! Read-only migration inventory. Execution must re-check it before changing either path.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_SNAPSHOTS: usize = 1000;
const MAX_BYTES: u64 = 64 * 1024 * 1024;

pub(crate) fn history_path(cache: &Path, document: &Path) -> PathBuf {
    cache.join(format!(
        "{:x}",
        md5::compute(document.to_string_lossy().as_bytes())
    ))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistorySnapshot {
    name: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveHistoryPlan {
    source_directory: String,
    target_directory: String,
    snapshots: Vec<HistorySnapshot>,
    strategy: &'static str,
}

pub(crate) fn inspect(
    cache: &Path,
    source: &Path,
    target: &Path,
) -> Result<ArchiveHistoryPlan, String> {
    let old = history_path(cache, source);
    let new = history_path(cache, target);
    if old == new {
        return Err("历史来源和目标相同".into());
    }
    // A linked cache directory could send the inventory outside the app cache.
    match fs::symlink_metadata(cache) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
            return Err("历史缓存目录类型异常".into())
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            return Err(format!("无法检查历史缓存: {e}"))
        }
        _ => {}
    }
    // Even an empty destination may belong to a previously deleted document.
    match fs::symlink_metadata(&new) {
        Ok(_) => return Err("目标路径已有历史记录目录，请更换名称；不会合并或覆盖历史".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("无法检查目标历史: {e}")),
    }
    let mut plan = ArchiveHistoryPlan {
        source_directory: old.to_string_lossy().into_owned(),
        target_directory: new.to_string_lossy().into_owned(),
        snapshots: vec![],
        strategy: "none",
    };
    match fs::symlink_metadata(&old) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(plan),
        Err(e) => return Err(format!("无法检查来源历史: {e}")),
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
            return Err("来源历史不是普通目录".into())
        }
        _ => {}
    }
    let mut total = 0u64;
    for entry in fs::read_dir(&old).map_err(|e| format!("无法读取来源历史: {e}"))? {
        let entry = entry.map_err(|e| format!("历史目录条目读取失败: {e}"))?;
        if plan.snapshots.len() >= MAX_SNAPSHOTS {
            return Err("历史快照超过预检上限，未完成检查".into());
        }
        let path = entry.path();
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "历史快照名称无法识别")?;
        if path.extension().and_then(|e| e.to_str()) != Some("md")
            || path
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(|s| s.parse::<u64>().ok())
                .is_none()
        {
            return Err(format!("历史目录包含非快照文件: {name}"));
        }
        let metadata =
            fs::symlink_metadata(&path).map_err(|e| format!("无法检查快照 {name}: {e}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!("快照不是普通文件: {name}"));
        }
        let remaining = MAX_BYTES.saturating_sub(total);
        if metadata.len() > remaining {
            return Err("历史快照超过 64 MiB 预检上限，未完成检查".into());
        }
        let mut reader = fs::File::open(&path)
            .map_err(|e| format!("无法读取快照 {name}: {e}"))?
            .take(remaining + 1);
        let mut hash = Sha256::new();
        let mut bytes = 0u64;
        let mut buffer = [0u8; 16 * 1024];
        loop {
            let count = reader
                .read(&mut buffer)
                .map_err(|e| format!("快照读取失败 {name}: {e}"))?;
            if count == 0 {
                break;
            }
            bytes += count as u64;
            if bytes > remaining {
                return Err("历史快照读取期间超过预检上限".into());
            }
            hash.update(&buffer[..count]);
        }
        if bytes != metadata.len() {
            return Err(format!("历史快照在检查期间发生变化: {name}"));
        }
        total += bytes;
        plan.snapshots.push(HistorySnapshot {
            name,
            bytes,
            sha256: format!("{:x}", hash.finalize()),
        });
    }
    plan.snapshots.sort_by(|a, b| a.name.cmp(&b.name));
    plan.strategy = "copy_verify_then_retire_source";
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let p = std::env::temp_dir().join(format!(
                "longedit-archive-history-{}-{nonce}-{}",
                std::process::id(),
                SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
        fn old(&self) -> PathBuf {
            history_path(&self.0, Path::new("old.md"))
        }
        fn new_path(&self) -> PathBuf {
            history_path(&self.0, Path::new("new.md"))
        }
        fn inspect(&self) -> Result<ArchiveHistoryPlan, String> {
            inspect(&self.0, Path::new("old.md"), Path::new("new.md"))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn missing_history_is_not_created() {
        let f = Fixture::new();
        assert_eq!(f.inspect().unwrap().strategy, "none");
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 0);
    }
    #[test]
    fn inventories_bytes_hashes_and_preserves_source() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("2.md"), "正文").unwrap();
        fs::write(f.old().join("1.md"), "abc").unwrap();
        let p = f.inspect().unwrap();
        assert_eq!(p.snapshots.len(), 2);
        assert_eq!(p.snapshots[0].name, "1.md");
        assert_eq!(p.snapshots[0].bytes, 3);
        assert_eq!(
            p.snapshots[0].sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(fs::read_to_string(f.old().join("2.md")).unwrap(), "正文");
        assert!(!f.new_path().exists());
        fs::write(f.old().join("1.md"), "abd").unwrap();
        assert_ne!(
            f.inspect().unwrap().snapshots[0].sha256,
            p.snapshots[0].sha256
        );
    }
    #[test]
    fn target_history_blocks_even_without_source_history() {
        let f = Fixture::new();
        fs::create_dir(f.new_path()).unwrap();
        assert!(f.inspect().is_err());
    }
    #[test]
    fn malformed_and_oversized_snapshots_are_not_silently_skipped() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("unknown.tmp"), "pending").unwrap();
        assert!(f.inspect().is_err());
        fs::remove_file(f.old().join("unknown.tmp")).unwrap();
        let file = fs::File::create(f.old().join("1.md")).unwrap();
        file.set_len(MAX_BYTES + 1).unwrap();
        assert!(f.inspect().is_err());
    }
    #[test]
    fn directory_disguised_as_snapshot_and_invalid_cache_fail() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::create_dir(f.old().join("1.md")).unwrap();
        assert!(f.inspect().is_err());
        let cache = f.0.join("file");
        fs::write(&cache, "not a directory").unwrap();
        assert!(inspect(&cache, Path::new("old.md"), Path::new("new.md")).is_err());
    }
}
