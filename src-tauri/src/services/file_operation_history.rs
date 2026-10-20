//! Bounded, durable summaries; execution and recovery stay in the existing move transaction.
use super::{reliable_write, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

static RECORDS: Mutex<()> = Mutex::new(());
static PRUNE_TICK: AtomicU64 = AtomicU64::new(0);
const KEEP: usize = 300;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationRecord {
    pub id: String,
    pub time: u64,
    pub action: String,
    pub old_path: PathBuf,
    pub new_path: PathBuf,
    pub target_root: PathBuf,
    pub status: String,
    pub recovery_id: Option<String>,
    pub undo_of: Option<String>,
    pub note: String,
    #[serde(default)]
    proofs: Vec<(PathBuf, String)>,
}

pub(crate) fn id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "op-{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 160 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("操作记录编号无效".into());
    }
    WorkspaceGuard::new(root)?.resolve_for_write(format!(".longedit/file-operations/{id}.json"))
}
fn read(root: &Path, id: &str) -> Result<OperationRecord, String> {
    let file = path(root, id)?;
    let metadata = fs::symlink_metadata(&file).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 2 * 1024 * 1024
    {
        return Err("操作记录不可读取".into());
    }
    reliable_write::recover_interrupted_write(&file)?;
    let value: OperationRecord =
        serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|_| "操作记录损坏，请保留现有文件并核对位置")?;
    if value.id != id {
        return Err("操作记录编号不一致".into());
    }
    Ok(value)
}
fn save(root: &Path, record: &OperationRecord) -> Result<(), String> {
    let file = path(root, &record.id)?;
    let bytes = serde_json::to_vec(record).map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 { return Err("操作摘要过大，请保留原文件和核对记录".into()); }
    fs::create_dir_all(file.parent().ok_or("记录目录不可用")?).map_err(|e| e.to_string())?;
    reliable_write::write_bytes(file, &bytes)
}
fn list_unlocked(root: &Path) -> Result<Vec<OperationRecord>, String> {
    let directory = WorkspaceGuard::new(root)?.resolve_for_write(".longedit/file-operations")?;
    if !directory.try_exists().map_err(|e| e.to_string())? {
        return Ok(vec![]);
    }
    let mut records = vec![];
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let file = entry.map_err(|e| e.to_string())?.path();
        if file.extension().is_some_and(|e| e == "json") {
            records.push(read(
                root,
                file.file_stem()
                    .and_then(|s| s.to_str())
                    .ok_or("记录编号无效")?,
            )?);
        }
    }
    records.sort_by(|a, b| b.time.cmp(&a.time).then(b.id.cmp(&a.id)));
    Ok(records)
}
pub(crate) fn list(root: &Path) -> Result<Vec<OperationRecord>, String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    list_unlocked(root)
}
pub(crate) fn begin(
    root: &Path,
    id: &str,
    old: &Path,
    new: &Path,
    target_root: &Path,
    recovery_id: Option<String>,
    undo_of: Option<String>,
) -> Result<(), String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    let action = if undo_of.is_some() {
        "undo"
    } else if recovery_id.is_none() {
        "copy"
    } else if old.parent() == new.parent() {
        "rename"
    } else {
        "move"
    };
    save(
        root,
        &OperationRecord {
            id: id.into(),
            time: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            action: action.into(),
            old_path: old.into(),
            new_path: new.into(),
            target_root: target_root.into(),
            status: "needsReview".into(),
            recovery_id,
            undo_of,
            note: "尚未收到完整结果，请核对实际位置；不会自动重做".into(),
            proofs: vec![],
        },
    )?;
    // Unresolved transactions are never discarded by retention.
    if PRUNE_TICK.fetch_add(1, Ordering::Relaxed) % 32 == 0 {
        if let Ok(records) = list_unlocked(root) {
            let protected = records
                .iter()
                .filter(|r| r.status == "needsReview")
                .filter_map(|r| r.undo_of.as_ref())
                .collect::<Vec<_>>();
            for record in records
                .iter()
                .filter(|r| r.status != "needsReview" && !protected.contains(&&r.id))
                .skip(KEEP)
            {
                let _ = path(root, &record.id)
                    .and_then(|p| fs::remove_file(p).map_err(|e| e.to_string()));
            }
        }
    }
    Ok(())
}

// Stream file bytes, include directory shape/empty folders, and cap work for large libraries.
fn fingerprint(path: &Path) -> Result<String, String> {
    fn visit(
        path: &Path,
        digest: &mut Sha256,
        count: &mut usize,
        bytes: &mut u64,
    ) -> Result<(), String> {
        *count += 1;
        if *count > 20_000 {
            return Err("项目过多，仅保留位置记录".into());
        }
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Err("包含目录链接，仅保留位置记录".into());
        }
        if meta.is_dir() {
            digest.update(b"directory\0");
            let mut entries = fs::read_dir(path)
                .map_err(|e| e.to_string())?
                .map(|e| e.map(|e| e.path()).map_err(|e| e.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            entries.sort();
            for child in entries {
                let name = child.file_name().ok_or("文件名不可用")?.to_string_lossy();
                if name.eq_ignore_ascii_case(".longedit")
                    || name.eq_ignore_ascii_case(".misty_order.json")
                {
                    continue;
                }
                digest.update((name.len() as u64).to_le_bytes());
                digest.update(name.as_bytes());
                visit(&child, digest, count, bytes)?;
            }
            digest.update(b"end\0");
        } else if meta.is_file() {
            *bytes += meta.len();
            if *bytes > 64 * 1024 * 1024 {
                return Err("文件较大，仅保留位置记录".into());
            }
            digest.update(b"file\0");
            digest.update(meta.len().to_le_bytes());
            let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 65536];
            loop {
                let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                digest.update(&buffer[..n]);
            }
        } else {
            return Err("文件类型暂不支持自动还原".into());
        }
        Ok(())
    }
    let mut digest = Sha256::new();
    visit(path, &mut digest, &mut 0, &mut 0)?;
    Ok(format!("{:x}", digest.finalize()))
}
pub(crate) fn finish(
    root: &Path,
    id: &str,
    completed: bool,
    affected: &[PathBuf],
) -> Result<(), String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    let mut record = read(root, id)?;
    record.status = if completed {
        "completed"
    } else {
        "notExecuted"
    }
    .into();
    record.note.clear();
    record.proofs.clear();
    if completed && matches!(record.action.as_str(), "move" | "rename") {
        let mut paths = vec![record.new_path.clone()];
        paths.extend_from_slice(affected);
        paths.sort();
        paths.dedup();
        if paths.len() > 1000 {
            record.note = "关联文档较多，仅保留位置记录".into();
        } else {
            for p in paths {
                match fingerprint(&p) {
                    Ok(hash) => record.proofs.push((p, hash)),
                    Err(e) => {
                        record.proofs.clear();
                        record.note = e;
                        break;
                    }
                }
            }
        }
    }
    save(root, &record)?;
    if let Some(original_id) = &record.undo_of {
        if completed {
            let mut original = read(root, original_id)?;
            original.status = "restored".into();
            original.note = "已还原此项".into();
            save(root, &original)?;
        } else {
            let mut original = read(root, original_id)?;
            if original.status == "restored" {
                original.status = "completed".into();
                original.note.clear();
                save(root, &original)?;
            }
        }
    }
    Ok(())
}
pub(crate) fn ensure_record(
    root: &Path,
    id: &str,
    old: &Path,
    new: &Path,
    undo_of: Option<String>,
) -> Result<(), String> {
    if !path(root, id)?.try_exists().map_err(|e| e.to_string())? {
        begin(root, id, old, new, root, Some(id.into()), undo_of)?;
    }
    Ok(())
}
pub(crate) fn locate(root: &Path, id: &str) -> Result<PathBuf, String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    let record = read(root, id)?;
    let mut current = record.new_path.clone();
    let mut records = list_unlocked(&record.target_root)?;
    records.reverse();
    for later in records
        .iter()
        .filter(|r| r.time >= record.time && r.id != record.id && r.status != "notExecuted")
    {
        if matches!(later.action.as_str(), "move" | "rename" | "undo")
            && matches!(later.status.as_str(), "completed" | "restored")
        {
            if let Ok(suffix) = current.strip_prefix(&later.old_path) {
                current = if suffix.as_os_str().is_empty() {
                    later.new_path.clone()
                } else {
                    later.new_path.join(suffix)
                };
            }
        }
    }
    let guard = WorkspaceGuard::new(&record.target_root)?;
    if let Ok(actual) = guard.resolve_existing(&current) {
        return Ok(actual);
    }
    if record.status == "notExecuted" || record.status == "needsReview" && record.action != "copy" {
        if let Ok(actual) = WorkspaceGuard::new(root)?.resolve_existing(&record.old_path) {
            return Ok(actual);
        }
    }
    Err("记录中的文件已不在此位置；可能被其他程序移动或删除，请在资料库中查找".into())
}
pub(crate) fn check_restore(root: &Path, id: &str) -> Result<OperationRecord, String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    let record = read(root, id)?;
    if !restorable(&record) {
        return Err("此项当前不能自动还原；请查看文件位置或核对未完成操作".into());
    }
    let guard = WorkspaceGuard::new(root)?;
    guard.resolve_existing(&record.new_path)?;
    let original = guard.resolve_for_write(&record.old_path)?;
    if original.try_exists().map_err(|e| e.to_string())? {
        return Err("原位置已有同名项目，未覆盖；请先查看两侧文件".into());
    }
    for (path, expected) in &record.proofs {
        let path = guard.resolve_existing(path)?;
        if fingerprint(&path)? != *expected {
            return Err("文件或关联文档已有后续修改，已保留现状；请查看当前位置后手动整理".into());
        }
    }
    Ok(record)
}
pub(crate) fn restorable(record: &OperationRecord) -> bool {
    record.status == "completed"
        && matches!(record.action.as_str(), "move" | "rename")
        && !record.proofs.is_empty()
}
pub(crate) fn clear_completed(root: &Path) -> Result<(), String> {
    let _lock = RECORDS.lock().unwrap_or_else(|e| e.into_inner());
    let records = list_unlocked(root)?;
    let protected = records
        .iter()
        .filter(|r| r.status == "needsReview")
        .filter_map(|r| r.undo_of.as_ref())
        .collect::<Vec<_>>();
    for record in &records {
        if record.status != "needsReview" && !protected.contains(&&record.id) {
            fs::remove_file(path(root, &record.id)?).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
