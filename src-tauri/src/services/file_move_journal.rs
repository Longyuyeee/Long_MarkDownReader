//! Durable evidence for the existing history/path move. No Markdown rewrite,
//! automatic replay, automatic rollback after restart, or execution permission.
use super::{archive_history::ArchiveHistoryPlan, archive_move::rename_no_replace};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const DIRECTORY: &str = ".file-moves";
const PREFIX: &str = ".move-stage-";
const MAX_RECORD_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PENDING: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FailureDisposition {
    NotExecuted,
    NeedsReview,
}

#[derive(Debug)]
pub(crate) struct MoveFailure {
    pub message: String,
    pub disposition: FailureDisposition,
    pub recovery_id: Option<String>,
}
impl From<String> for MoveFailure {
    fn from(message: String) -> Self {
        Self {
            message,
            disposition: FailureDisposition::NotExecuted,
            recovery_id: None,
        }
    }
}
impl From<&str> for MoveFailure {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}
impl MoveFailure {
    fn review(message: String, recovery_id: Option<String>) -> Self {
        Self {
            message,
            disposition: FailureDisposition::NeedsReview,
            recovery_id,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HistoryIntent {
    pub source: PathBuf,
    pub target: PathBuf,
    pub expected: ArchiveHistoryPlan,
    pub had_history: bool,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Intent {
    pub version: u32,
    pub source: PathBuf,
    pub target: PathBuf,
    pub histories: Vec<HistoryIntent>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Terminal {
    intent_sha256: String,
    outcome: Outcome,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Outcome {
    Completed,
    RolledBack,
}

pub(crate) struct Journal {
    stage: PathBuf,
    digest: String,
}
impl Journal {
    pub(crate) fn begin(cache: &Path, intent: &Intent) -> Result<Self, MoveFailure> {
        ensure_no_pending(cache, &intent.source, &intent.target)?;
        validate_intent(intent)?;
        let bytes = serde_json::to_vec(intent).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_RECORD_BYTES {
            return Err("移动记录超过 16 MiB 上限，尚未执行".into());
        }
        fs::create_dir_all(cache).map_err(|e| format!("无法建立移动记录缓存：{e}"))?;
        ordinary_directory(cache)?;
        let directory = cache.join(DIRECTORY);
        match fs::create_dir(&directory) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(format!("无法建立移动记录目录：{e}").into()),
        }
        ordinary_directory(&directory)?;
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let id = format!(
            "{PREFIX}{}-{}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let stage = directory.join(id);
        fs::create_dir(&stage).map_err(|e| format!("无法建立本次移动记录：{e}"))?;
        // Intent is created once and synced before the first history/path mutation.
        // A torn/unknown record is retained and blocks further moves, never replayed.
        if let Err(e) = write_new(&stage.join("intent.json"), &bytes) {
            return Err(MoveFailure::review(
                format!("移动尚未执行，但记录未完整写入，请保留核对：{e}"),
                stage.file_name().map(|n| n.to_string_lossy().into_owned()),
            ));
        }
        Ok(Self {
            stage,
            digest: hash(&bytes),
        })
    }
    pub(crate) fn needs_review(&self, message: String) -> MoveFailure {
        MoveFailure::review(
            format!("{message}；已保留移动核对记录，不自动重试或回放"),
            self.stage
                .file_name()
                .map(|n| n.to_string_lossy().into_owned()),
        )
    }
    pub(crate) fn finish(&self, outcome: Outcome) -> Result<(), MoveFailure> {
        let bytes = serde_json::to_vec(&Terminal {
            intent_sha256: self.digest.clone(),
            outcome,
        })
        .map_err(|e| self.needs_review(e.to_string()))?;
        write_new(&self.stage.join("terminal.json"), &bytes).map_err(|e| self.needs_review(e))?;
        // Retire the whole known record before best-effort cleanup. Never recursively
        // remove a directory: an unexpected third-party file must be preserved.
        let done =
            self.stage
                .with_file_name(self.stage.file_name().unwrap().to_string_lossy().replacen(
                    PREFIX,
                    ".move-done-",
                    1,
                ));
        if rename_no_replace(&self.stage, &done).is_ok() {
            let _ = fs::remove_file(done.join("intent.json"));
            let _ = fs::remove_file(done.join("terminal.json"));
            let _ = fs::remove_dir(done);
        }
        Ok(())
    }
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn ordinary_directory(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("移动记录目录不是普通目录".into());
    }
    Ok(())
}
fn read_record(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| format!("移动记录无法读取：{e}"))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_RECORD_BYTES {
        return Err("移动记录类型或大小异常，请保留核对".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 != meta.len() || bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err("移动记录在读取期间变化".into());
    }
    Ok(bytes)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("无法同步移动记录：{e}"))
}
fn validate_intent(intent: &Intent) -> Result<(), String> {
    use std::path::Component;
    if intent.version != 1
        || !intent.source.is_absolute()
        || !intent.target.is_absolute()
        || intent.source == intent.target
        || intent.target.starts_with(&intent.source)
        || intent.histories.len() > 20_000
        || [&intent.source, &intent.target].iter().any(|p| {
            p.components()
                .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        })
    {
        return Err("移动记录路径或版本无效".into());
    }
    let mut sources = std::collections::HashSet::new();
    for item in &intent.histories {
        let suffix = item
            .source
            .strip_prefix(&intent.source)
            .map_err(|_| "移动记录来源越界")?;
        let expected_target = if suffix.as_os_str().is_empty() {
            intent.target.clone()
        } else {
            intent.target.join(suffix)
        };
        if item.target != expected_target || !sources.insert(&item.source) {
            return Err("移动记录目标或条目重复异常".into());
        }
    }
    Ok(())
}
fn overlaps(a: &Path, b: &Path) -> bool {
    // Records are native absolute paths. On Windows comparison must match the
    // filesystem's case-insensitive path identity, including directory prefixes.
    fn key(path: &Path) -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(path.to_string_lossy().to_lowercase())
        } else {
            path.to_path_buf()
        }
    }
    let (a, b) = (key(a), key(b));
    a.starts_with(&b) || b.starts_with(&a)
}

/// Read only. Malformed records fail closed; valid completed markers are bound
/// to the exact intent bytes. Unrelated paths are not blocked by a known record.
pub(crate) fn ensure_no_pending(
    cache: &Path,
    source: &Path,
    target: &Path,
) -> Result<(), MoveFailure> {
    let records = pending(cache).map_err(|e| MoveFailure::review(e, None))?;
    for (id, intent) in records {
        if [&intent.source, &intent.target]
            .iter()
            .any(|path| overlaps(path, source) || overlaps(path, target))
        {
            return Err(MoveFailure::review(
                "此路径涉及尚未核对的移动记录，请勿重复操作；原记录已保留".into(),
                Some(id),
            ));
        }
    }
    Ok(())
}

// This is evidence inspection, not permission to restore a file or retry a move.
pub(crate) fn pending(cache: &Path) -> Result<Vec<(String, Intent)>, String> {
    match fs::symlink_metadata(cache) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
        Ok(_) => ordinary_directory(cache)?,
    }
    let directory = cache.join(DIRECTORY);
    match fs::symlink_metadata(&directory) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
        Ok(_) => ordinary_directory(&directory)?,
    }
    let mut records = vec![];
    let mut remaining_bytes = 32 * 1024 * 1024usize;
    for (count, entry) in fs::read_dir(&directory)
        .map_err(|e| e.to_string())?
        .enumerate()
    {
        if count >= 1024 {
            return Err("移动记录超过 1024 项检查上限，请保留核对".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "移动记录名称异常")?;
        if name.starts_with(".move-done-") {
            ordinary_directory(&entry.path())?;
            continue;
        }
        if !name.starts_with(PREFIX) {
            return Err("移动记录目录包含未知条目，请保留核对".into());
        }
        ordinary_directory(&entry.path())?;
        let bytes = read_record(&entry.path().join("intent.json"))?;
        remaining_bytes = remaining_bytes
            .checked_sub(bytes.len())
            .ok_or("移动记录超过 32 MiB 总读取上限，请保留核对")?;
        let intent: Intent =
            serde_json::from_slice(&bytes).map_err(|e| format!("移动记录格式异常：{e}"))?;
        validate_intent(&intent)?;
        let terminal = entry.path().join("terminal.json");
        match fs::symlink_metadata(&terminal) {
            Ok(_) => {
                let terminal_bytes = read_record(&terminal)?;
                remaining_bytes = remaining_bytes
                    .checked_sub(terminal_bytes.len())
                    .ok_or("移动记录超过 32 MiB 总读取上限，请保留核对")?;
                let terminal: Terminal = serde_json::from_slice(&terminal_bytes)
                    .map_err(|e| format!("移动完成记录异常：{e}"))?;
                if terminal.intent_sha256 != hash(&bytes) {
                    return Err("移动完成记录与原始意图不一致，请保留核对".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => records.push((name, intent)),
            Err(e) => return Err(e.to_string()),
        }
        if records.len() >= MAX_PENDING {
            return Err("未核对的移动记录达到 128 项上限，请先处理已有记录".into());
        }
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "longedit-move-record-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
        fn intent(&self) -> Intent {
            Intent {
                version: 1,
                source: self.0.join("notes"),
                target: self.0.join("moved"),
                histories: vec![],
            }
        }
        fn cache(&self) -> PathBuf {
            self.0.join("cache")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn pending_record_blocks_both_paths_children_parents_but_not_unrelated_files() {
        let f = Fixture::new();
        let intent = f.intent();
        let record = Journal::begin(&f.cache(), &intent).unwrap();
        for path in [
            &intent.source,
            &intent.target,
            &intent.source.join("a.md"),
            &f.0,
        ] {
            let failure = ensure_no_pending(&f.cache(), path, &f.0.join("other")).unwrap_err();
            assert_eq!(failure.disposition, FailureDisposition::NeedsReview);
            assert!(failure.recovery_id.unwrap().starts_with(PREFIX));
        }
        assert!(
            ensure_no_pending(&f.cache(), &f.0.join("notes-extra"), &f.0.join("other")).is_ok()
        );
        assert!(record.stage.join("intent.json").is_file());
        assert_eq!(pending(&f.cache()).unwrap().len(), 1);
    }
    #[test]
    fn restart_inspection_is_read_only_and_history_clear_preserves_pending_records() {
        let f = Fixture::new();
        let record = Journal::begin(&f.cache(), &f.intent()).unwrap();
        let original = fs::read(record.stage.join("intent.json")).unwrap();
        drop(record);
        assert_eq!(pending(&f.cache()).unwrap().len(), 1);
        assert!(super::super::history_coordination::ensure_clearable(&f.cache()).is_err());
        let stage = fs::read_dir(f.cache().join(DIRECTORY))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(stage.join("intent.json")).unwrap(), original);
        assert!(!f.intent().source.exists() && !f.intent().target.exists());
    }
    #[test]
    fn completed_and_rolled_back_records_do_not_block_future_moves() {
        for outcome in [Outcome::Completed, Outcome::RolledBack] {
            let f = Fixture::new();
            let record = Journal::begin(&f.cache(), &f.intent()).unwrap();
            record.finish(outcome).unwrap();
            assert!(pending(&f.cache()).unwrap().is_empty());
            assert!(super::super::history_coordination::ensure_clearable(&f.cache()).is_ok());
            assert!(Journal::begin(&f.cache(), &f.intent()).is_ok());
        }
    }
    #[test]
    fn damaged_record_blocks_moves_without_deleting_evidence_or_user_files() {
        let f = Fixture::new();
        let record = Journal::begin(&f.cache(), &f.intent()).unwrap();
        fs::write(record.stage.join("intent.json"), "{torn").unwrap();
        fs::write(f.intent().source, "user body").unwrap();
        assert!(ensure_no_pending(&f.cache(), &f.0.join("x"), &f.0.join("y")).is_err());
        assert_eq!(
            fs::read_to_string(record.stage.join("intent.json")).unwrap(),
            "{torn"
        );
        assert_eq!(fs::read_to_string(f.intent().source).unwrap(), "user body");
        assert!(super::super::history_coordination::ensure_clearable(&f.cache()).is_err());
    }
    #[test]
    fn terminal_marker_must_match_exact_intent_bytes() {
        let f = Fixture::new();
        let record = Journal::begin(&f.cache(), &f.intent()).unwrap();
        let bytes = serde_json::to_vec(&Terminal {
            intent_sha256: "not-the-original-hash".into(),
            outcome: Outcome::Completed,
        })
        .unwrap();
        write_new(&record.stage.join("terminal.json"), &bytes).unwrap();
        assert!(pending(&f.cache()).unwrap_err().contains("不一致"));
        assert!(record.stage.join("intent.json").exists());
    }
    #[test]
    fn completion_cleanup_never_recursively_deletes_unexpected_content() {
        let f = Fixture::new();
        let record = Journal::begin(&f.cache(), &f.intent()).unwrap();
        fs::write(record.stage.join("external.txt"), "keep me").unwrap();
        record.finish(Outcome::Completed).unwrap();
        let leftovers = fs::read_dir(f.cache().join(DIRECTORY))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(leftovers
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".move-done-"));
        assert_eq!(
            fs::read_to_string(leftovers.join("external.txt")).unwrap(),
            "keep me"
        );
        assert!(pending(&f.cache()).unwrap().is_empty());
    }
    #[test]
    fn invalid_record_paths_are_rejected_before_creating_cache() {
        let f = Fixture::new();
        let mut intent = f.intent();
        intent.target = intent.source.join("nested");
        assert!(Journal::begin(&f.cache(), &intent).is_err());
        assert!(!f.cache().exists());
        // Joining onto a verbatim Windows path normalizes `..` immediately;
        // construct raw persisted input so this actually tests traversal input.
        intent.target = PathBuf::from(format!(
            "{}{}x{}..{}elsewhere",
            f.0.display(),
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR
        ));
        assert!(Journal::begin(&f.cache(), &intent).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn windows_pending_paths_are_case_insensitive() {
        let f = Fixture::new();
        Journal::begin(&f.cache(), &f.intent()).unwrap();
        let source = PathBuf::from(f.intent().source.to_string_lossy().to_uppercase());
        assert!(ensure_no_pending(&f.cache(), &source, &f.0.join("elsewhere")).is_err());
    }
}
