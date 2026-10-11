//! Content evidence, not a filesystem identity lock or automatic recovery.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
const MAX_DOCUMENT_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct Fingerprint {
    bytes: u64,
    sha256: String,
}

pub(crate) fn fingerprint(path: &Path) -> Result<Fingerprint, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_DOCUMENT_BYTES {
        return Err("归档正文不是普通文件或超过 256 MiB 检查上限".into());
    }
    let mut reader = fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(meta.len() + 1);
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = [0u8; 16384];
    loop {
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        bytes += n as u64;
        hash.update(&buffer[..n]);
    }
    if bytes != meta.len() {
        return Err("正文在读取期间变化".into());
    }
    Ok(Fingerprint {
        bytes,
        sha256: format!("{:x}", hash.finalize()),
    })
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DocumentIntent {
    pub version: u32,
    pub source: PathBuf,
    pub target: PathBuf,
    pub fingerprint: Fingerprint,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DocumentState {
    SourceMatches,
    TargetMatches,
    BothPresent,
    NeitherPresent,
}

#[allow(dead_code)]
pub(crate) fn inspect_document(
    root: &Path,
    cache: &Path,
    stage: &Path,
) -> Result<DocumentState, String> {
    let _lease = super::history_coordination::acquire(cache)?;
    let stage_meta = fs::symlink_metadata(stage).map_err(|e| e.to_string())?;
    if !stage_meta.is_dir() || stage_meta.file_type().is_symlink() {
        return Err("正文日志目录异常".into());
    }
    let stage = stage.canonicalize().map_err(|e| e.to_string())?;
    let cache = cache.canonicalize().map_err(|e| e.to_string())?;
    if stage.parent() != Some(cache.as_path())
        || !stage
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.starts_with(".archive-stage-"))
    {
        return Err("正文日志不在当前缓存内".into());
    }
    let path = stage.join("document-intent.json");
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 65536 {
        return Err("正文日志类型或大小异常".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 65536 {
        return Err("正文日志超限".into());
    }
    let intent: DocumentIntent =
        serde_json::from_slice(&bytes).map_err(|e| format!("正文日志无效或版本过旧: {e}"))?;
    if intent.version != 2
        || intent.fingerprint.bytes > MAX_DOCUMENT_BYTES
        || intent.fingerprint.sha256.len() != 64
        || !intent
            .fingerprint
            .sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
        || intent.source == intent.target
    {
        return Err("正文日志身份无效".into());
    }
    let guard = super::workspace_guard::WorkspaceGuard::new(root)?;
    // Validate scope, but inspect raw paths so a leaf symlink cannot be hidden.
    for path in [&intent.source, &intent.target] {
        if !path.is_absolute() {
            return Err("正文日志路径必须是绝对路径".into());
        }
        guard.resolve_for_write(path)?;
    }
    fn present(path: &Path) -> Result<bool, String> {
        match fs::symlink_metadata(path) {
            Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => Ok(true),
            Ok(_) => Err("正文路径类型异常".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.to_string()),
        }
    }
    match (present(&intent.source)?, present(&intent.target)?) {
        (true, true) => Ok(DocumentState::BothPresent),
        (false, false) => Ok(DocumentState::NeitherPresent),
        (source_present, _) => {
            let path = if source_present {
                &intent.source
            } else {
                &intent.target
            };
            if fingerprint(path)? != intent.fingerprint {
                return Err("正文与归档前内容不一致，不能确认移动状态".into());
            }
            Ok(if source_present {
                DocumentState::SourceMatches
            } else {
                DocumentState::TargetMatches
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "archive-document-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(root.join(".archive-stage-test")).unwrap();
            Self(root)
        }
        fn stage(&self) -> PathBuf {
            self.0.join(".archive-stage-test")
        }
        fn inspect(&self) -> Result<DocumentState, String> {
            inspect_document(&self.0, &self.0, &self.stage())
        }
        fn journal(&self) {
            let source = self.0.join("old.md");
            fs::write(&source, "before").unwrap();
            fs::write(
                self.stage().join("document-intent.json"),
                serde_json::to_vec(&DocumentIntent {
                    version: 2,
                    fingerprint: fingerprint(&source).unwrap(),
                    source,
                    target: self.0.join("new.md"),
                })
                .unwrap(),
            )
            .unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn archive_document_recovery_checks_contents_and_ambiguous_locations() {
        let f = Fixture::new();
        f.journal();
        assert_eq!(f.inspect().unwrap(), DocumentState::SourceMatches);
        fs::rename(f.0.join("old.md"), f.0.join("new.md")).unwrap();
        assert_eq!(f.inspect().unwrap(), DocumentState::TargetMatches);
        fs::write(f.0.join("new.md"), "after!").unwrap();
        assert!(f.inspect().is_err());
        fs::write(f.0.join("old.md"), "before").unwrap();
        assert_eq!(f.inspect().unwrap(), DocumentState::BothPresent);
        fs::remove_file(f.0.join("old.md")).unwrap();
        fs::remove_file(f.0.join("new.md")).unwrap();
        assert_eq!(f.inspect().unwrap(), DocumentState::NeitherPresent);
    }
    #[test]
    fn archive_document_rejects_old_or_outside_journal_without_changes() {
        let f = Fixture::new();
        f.journal();
        let journal = f.stage().join("document-intent.json");
        let mut intent: DocumentIntent =
            serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
        intent.target = f.0.parent().unwrap().join("outside.md");
        fs::write(&journal, serde_json::to_vec(&intent).unwrap()).unwrap();
        assert!(f.inspect().is_err());
        fs::write(
            &journal,
            r#"{"version":1,"source":"old.md","target":"new.md"}"#,
        )
        .unwrap();
        assert!(f.inspect().is_err());
        assert_eq!(fs::read_to_string(f.0.join("old.md")).unwrap(), "before");
    }
    #[test]
    fn archive_document_hash_detects_same_length_changes_and_rejects_large_files() {
        let f = Fixture::new();
        let path = f.0.join("file.md");
        fs::write(&path, "first").unwrap();
        let first = fingerprint(&path).unwrap();
        fs::write(&path, "other").unwrap();
        assert_ne!(first, fingerprint(&path).unwrap());
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_DOCUMENT_BYTES + 1)
            .unwrap();
        assert!(fingerprint(&path).is_err());
    }
}
