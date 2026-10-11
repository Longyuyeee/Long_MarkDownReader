//! History inventory, staging, publication and internal document/history sequencing.
//! No frontend execution permission, automatic recovery or source retirement.
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistorySnapshot {
    name: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveHistoryPlan {
    source_directory: String,
    target_directory: String,
    snapshots: Vec<HistorySnapshot>,
    strategy: String,
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
        strategy: "none".into(),
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
    plan.strategy = "copy_verify_then_retire_source".into();
    Ok(plan)
}

/// Prepared copy only: no document move, history publication or source retirement.
/// Caller must serialize history writers and revalidate again before committing.
#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct PreparedHistory {
    pub staging_directory: Option<PathBuf>,
    pub plan: ArchiveHistoryPlan,
}

#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct PrepareFailure {
    pub message: String,
    /// Partial copies are deliberately retained; never delete an unjournaled path.
    pub retained_staging_directory: Option<PathBuf>,
}

#[allow(dead_code)] // Not exposed before the archive coordinator is implemented.
pub(crate) fn prepare(
    cache: &Path,
    source: &Path,
    target: &Path,
    expected: &ArchiveHistoryPlan,
) -> Result<PreparedHistory, PrepareFailure> {
    prepare_with_hook(cache, source, target, expected, || {})
}

fn prepare_with_hook(
    cache: &Path,
    source: &Path,
    target: &Path,
    expected: &ArchiveHistoryPlan,
    after_copy: impl FnOnce(),
) -> Result<PreparedHistory, PrepareFailure> {
    let lease = super::history_coordination::acquire(cache).map_err(|message| PrepareFailure {
        message,
        retained_staging_directory: None,
    })?;
    prepare_locked(cache, source, target, expected, &lease, after_copy)
}

fn prepare_locked(
    cache: &Path,
    source: &Path,
    target: &Path,
    expected: &ArchiveHistoryPlan,
    lease: &super::history_coordination::HistoryLease,
    after_copy: impl FnOnce(),
) -> Result<PreparedHistory, PrepareFailure> {
    use std::io::Write;
    let fail = |message| PrepareFailure {
        message,
        retained_staging_directory: None,
    };
    lease.verify(cache).map_err(fail)?;
    let current = inspect(cache, source, target).map_err(fail)?;
    if &current != expected {
        return Err(fail("历史清单已变化，请重新预检".into()));
    }
    if current.strategy == "none" {
        return Ok(PreparedHistory {
            staging_directory: None,
            plan: current,
        });
    }
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| fail(e.to_string()))?
        .as_nanos();
    let stage = cache.join(format!(
        ".archive-stage-{}-{nonce}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    fs::create_dir(&stage).map_err(|e| fail(format!("无法创建历史暂存目录: {e}")))?;
    let copy_result = (|| -> Result<(), String> {
        // Persist intent before copying the first byte. No overwrite or cleanup.
        let journal = serde_json::to_vec(&serde_json::json!({
            "version": 1, "plan": current
        }))
        .map_err(|e| e.to_string())?;
        let mut intent = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("intent.json"))
            .map_err(|e| e.to_string())?;
        intent
            .write_all(&journal)
            .and_then(|_| intent.sync_all())
            .map_err(|e| e.to_string())?;
        drop(intent);
        for snapshot in &current.snapshots {
            let from = Path::new(&current.source_directory).join(&snapshot.name);
            let meta = fs::symlink_metadata(&from).map_err(|e| e.to_string())?;
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != snapshot.bytes {
                return Err(format!("历史快照类型或长度已变化: {}", snapshot.name));
            }
            let mut input = fs::File::open(&from)
                .map_err(|e| e.to_string())?
                .take(snapshot.bytes + 1);
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(stage.join(&snapshot.name))
                .map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 16 * 1024];
            let mut bytes = 0u64;
            let mut hash = Sha256::new();
            loop {
                let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                bytes += count as u64;
                if bytes > snapshot.bytes {
                    return Err("历史快照读取期间变大".into());
                }
                output
                    .write_all(&buffer[..count])
                    .map_err(|e| e.to_string())?;
                hash.update(&buffer[..count]);
            }
            output.sync_all().map_err(|e| e.to_string())?;
            if bytes != snapshot.bytes || format!("{:x}", hash.finalize()) != snapshot.sha256 {
                return Err(format!("历史快照摘要已变化: {}", snapshot.name));
            }
            // Verify the actual stored bytes, not only the buffer sent to write().
            let mut stored = fs::File::open(stage.join(&snapshot.name))
                .map_err(|e| e.to_string())?
                .take(snapshot.bytes + 1);
            let mut stored_hash = Sha256::new();
            let mut stored_bytes = 0u64;
            loop {
                let count = stored.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                stored_hash.update(&buffer[..count]);
                stored_bytes += count as u64;
            }
            if stored_bytes != snapshot.bytes
                || format!("{:x}", stored_hash.finalize()) != snapshot.sha256
            {
                return Err("暂存历史回读校验失败".into());
            }
        }
        after_copy();
        if inspect(cache, source, target)? != current {
            return Err("复制期间历史清单发生变化，请重新预检".into());
        }
        // Immutable completion marker binds to the exact intent; not a commit receipt.
        let digest = format!("{:x}", Sha256::digest(&journal));
        let mut marker = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("prepared.sha256"))
            .map_err(|e| e.to_string())?;
        marker
            .write_all(digest.as_bytes())
            .and_then(|_| marker.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
    })();
    match copy_result {
        Ok(()) => Ok(PreparedHistory {
            staging_directory: Some(stage),
            plan: current,
        }),
        Err(message) => Err(PrepareFailure {
            message,
            retained_staging_directory: Some(stage),
        }),
    }
}

#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct PublishedHistory {
    pub target_directory: PathBuf,
    // A marker error after rename must never be reported as "nothing moved".
    pub marker_error: Option<String>,
}

/// Internal history-only publication. Does NOT move the document or retire source.
/// Not exposed until the document/history coordinator and recovery are complete.
#[allow(dead_code)]
pub(crate) fn publish(
    cache: &Path,
    source: &Path,
    target: &Path,
    prepared: &PreparedHistory,
) -> Result<PublishedHistory, String> {
    publish_with_hook(cache, source, target, prepared, || {})
}

fn publish_with_hook(
    cache: &Path,
    source: &Path,
    target: &Path,
    prepared: &PreparedHistory,
    after_publish: impl FnOnce(),
) -> Result<PublishedHistory, String> {
    let lease = super::history_coordination::acquire(cache)?;
    publish_locked(cache, source, target, prepared, &lease, after_publish)
}

fn publish_locked(
    cache: &Path,
    source: &Path,
    target: &Path,
    prepared: &PreparedHistory,
    lease: &super::history_coordination::HistoryLease,
    after_publish: impl FnOnce(),
) -> Result<PublishedHistory, String> {
    use std::io::Write;
    fn record(path: &Path, bytes: &[u8]) -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())
    }
    lease.verify(cache)?;
    if inspect(cache, source, target)? != prepared.plan {
        return Err("发布前历史已变化，请重新预检".into());
    }
    let stage = prepared
        .staging_directory
        .as_ref()
        .ok_or("无历史副本，无需发布")?;
    if inspect_staging(cache, stage)? != StagingState::Prepared {
        return Err("历史暂存尚未准备完成".into());
    }
    let destination = history_path(cache, target);
    // Persist intent before making the target visible. A retry is deliberately
    // blocked by create_new until a recovery coordinator reconciles disk state.
    record(
        &stage.join("publish-intent.json"),
        &serde_json::to_vec(&serde_json::json!({
            "version": 1, "targetDirectory": destination, "plan": prepared.plan
        }))
        .map_err(|e| e.to_string())?,
    )?;
    let payload = stage.join("publish-payload");
    fs::create_dir(&payload).map_err(|e| e.to_string())?;
    for snapshot in &prepared.plan.snapshots {
        let from = stage.join(&snapshot.name);
        let meta = fs::symlink_metadata(&from).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != snapshot.bytes {
            return Err("发布副本类型或长度变化".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(from)
            .map_err(|e| e.to_string())?
            .take(snapshot.bytes + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 != snapshot.bytes
            || format!("{:x}", Sha256::digest(&bytes)) != snapshot.sha256
        {
            return Err("发布副本摘要与预检不一致".into());
        }
        record(&payload.join(&snapshot.name), &bytes)?;
        let mut stored = Vec::new();
        fs::File::open(payload.join(&snapshot.name))
            .map_err(|e| e.to_string())?
            .take(snapshot.bytes + 1)
            .read_to_end(&mut stored)
            .map_err(|e| e.to_string())?;
        if stored != bytes {
            return Err("发布副本回读不一致".into());
        }
    }
    if inspect(cache, source, target)? != prepared.plan {
        return Err("构建发布副本期间来源历史变化".into());
    }
    super::archive_move::rename_no_replace(&payload, &destination)
        .map_err(|e| format!("历史发布失败，保留暂存和源历史: {e}"))?;
    after_publish();
    let marker_error = record(&stage.join("published"), b"history-only-v1").err();
    Ok(PublishedHistory {
        target_directory: destination,
        marker_error,
    })
}

/// Internal disk sequence only. Not a frontend permission or complete archive.
#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct CoordinatedReceipt {
    pub stage: PathBuf,
    pub document_moved: bool,
    pub history_required: bool,
    pub history_published: bool,
    pub error: Option<String>,
}

#[allow(dead_code)]
pub(crate) fn move_with_history(
    root: &Path,
    cache: &Path,
    source: &Path,
    target: &Path,
) -> Result<CoordinatedReceipt, String> {
    move_with_history_hook(root, cache, source, target, || {})
}

fn move_with_history_hook(
    root: &Path,
    cache: &Path,
    source: &Path,
    target: &Path,
    after_move: impl FnOnce(),
) -> Result<CoordinatedReceipt, String> {
    use std::io::Write;
    let lease = super::history_coordination::acquire(cache)?;
    let guard = super::workspace_guard::WorkspaceGuard::new(root)?;
    let source_input = if source.is_absolute() {
        source.to_path_buf()
    } else {
        guard.root().join(source)
    };
    let meta = fs::symlink_metadata(&source_input).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err("来源必须是普通文件".into());
    }
    let source = guard.resolve_existing_file(source, &[])?;
    let name = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("非法目标名称")?;
    crate::commands::files::validate_item_name(name)?;
    let parent = guard.resolve_directory(target.parent().ok_or("缺少目标目录")?, false)?;
    let target = parent.join(name);
    match fs::symlink_metadata(&target) {
        Ok(_) => return Err("目标已存在，不移动".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    let expected = inspect(cache, &source, &target)?;
    let document_fingerprint = super::archive_document::fingerprint(&source)?;
    let prepared =
        prepare_locked(cache, &source, &target, &expected, &lease, || {}).map_err(|e| {
            format!(
                "{}；保留暂存: {:?}",
                e.message, e.retained_staging_directory
            )
        })?;
    let history_required = prepared.staging_directory.is_some();
    let stage = if let Some(stage) = &prepared.staging_directory {
        stage.clone()
    } else {
        // No history snapshots to copy, but the document still needs a journal.
        fs::create_dir_all(cache).map_err(|e| e.to_string())?;
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let stage = cache.join(format!(
            ".archive-stage-document-{}-{nonce}-{}",
            std::process::id(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&stage).map_err(|e| e.to_string())?;
        stage
    };
    let mut receipt = CoordinatedReceipt {
        stage: stage.clone(),
        document_moved: false,
        history_required,
        history_published: false,
        error: None,
    };
    let result = (|| -> Result<(), String> {
        // Persist the distinction between "not needed" and "not published".
        let mut policy = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("history-policy.json"))
            .map_err(|e| e.to_string())?;
        let policy_bytes = serde_json::to_vec(&serde_json::json!({"version":1,"historyRequired":history_required,"plan":prepared.plan})).map_err(|e| e.to_string())?;
        policy
            .write_all(&policy_bytes)
            .and_then(|_| policy.sync_all())
            .map_err(|e| e.to_string())?;
        drop(policy);
        let mut journal = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("document-intent.json"))
            .map_err(|e| e.to_string())?;
        let intent = super::archive_document::DocumentIntent {
            version: 2,
            source: source.clone(),
            target: target.clone(),
            fingerprint: document_fingerprint,
        };
        let bytes = serde_json::to_vec(&intent).map_err(|e| e.to_string())?;
        journal
            .write_all(&bytes)
            .and_then(|_| journal.sync_all())
            .map_err(|e| e.to_string())?;
        drop(journal);
        if super::archive_document::fingerprint(&source)? != intent.fingerprint {
            return Err("准备期间正文发生变化，未移动".into());
        }
        if inspect(cache, &source, &target)? != prepared.plan {
            return Err("移动前历史状态变化，未移动".into());
        }
        let moves = super::archive_move::move_batch(root, &[(source.clone(), target.clone())]);
        moves.into_iter().next().ok_or("缺少移动回执")?.result?;
        receipt.document_moved = true;
        after_move();
        if super::archive_document::fingerprint(&target)? != intent.fingerprint {
            return Err("正文已移动但内容发生变化，暂停历史发布".into());
        }
        if !history_required {
            if inspect(cache, &source, &target)? != prepared.plan {
                return Err("正文已移动但历史状态变化，需要恢复核对".into());
            }
            return Ok(());
        }
        let published = publish_locked(cache, &source, &target, &prepared, &lease, || {})?;
        receipt.history_published = true;
        if let Some(error) = published.marker_error {
            return Err(format!("历史已发布，但标记失败: {error}"));
        }
        Ok(())
    })();
    receipt.error = result.err();
    Ok(receipt)
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PublicationState {
    NotStarted,
    TargetAbsent,
    // Content matches, but this is NOT proof of ownership or document completion.
    TargetMatches,
}

/// Diagnose only. Never retry a move, delete a file, or trust a marker as success.
#[allow(dead_code)]
pub(crate) fn inspect_publication(
    cache: &Path,
    stage: &Path,
    source: &Path,
    target: &Path,
) -> Result<PublicationState, String> {
    let lease = super::history_coordination::acquire(cache)?;
    inspect_publication_locked(cache, stage, source, target, &lease)
}

fn inspect_publication_locked(
    cache: &Path,
    stage: &Path,
    source: &Path,
    target: &Path,
    lease: &super::history_coordination::HistoryLease,
) -> Result<PublicationState, String> {
    lease.verify(cache)?;
    if inspect_staging(cache, stage)? != StagingState::Prepared {
        return Err("历史暂存未完成，不能判断发布结果".into());
    }
    fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
            return Err("发布恢复文件类型或大小异常".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > limit {
            return Err("发布恢复文件超限".into());
        }
        Ok(bytes)
    }
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields, rename_all = "camelCase")]
    struct PublicationIntent {
        version: u32,
        target_directory: PathBuf,
        plan: ArchiveHistoryPlan,
    }
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct PreparationIntent {
        version: u32,
        plan: ArchiveHistoryPlan,
    }
    let marker_exists = match fs::symlink_metadata(stage.join("published")) {
        Ok(_) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
        Err(e) => return Err(e.to_string()),
    };
    let intent_path = stage.join("publish-intent.json");
    match fs::symlink_metadata(&intent_path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !marker_exists => {
            return Ok(PublicationState::NotStarted)
        }
        Err(e) => return Err(format!("发布日志缺失或不可读: {e}")),
        Ok(_) => {}
    }
    let intent: PublicationIntent =
        serde_json::from_slice(&read_bounded(&intent_path, 1024 * 1024)?)
            .map_err(|e| e.to_string())?;
    let original: PreparationIntent =
        serde_json::from_slice(&read_bounded(&stage.join("intent.json"), 1024 * 1024)?)
            .map_err(|e| e.to_string())?;
    let destination = history_path(cache, target);
    if intent.version != 1
        || original.version != 1
        || intent.plan != original.plan
        || intent.target_directory != destination
        || Path::new(&intent.plan.target_directory) != destination
        || Path::new(&intent.plan.source_directory) != history_path(cache, source)
    {
        return Err("发布日志与当前归档身份或准备清单不一致".into());
    }
    match fs::symlink_metadata(&destination) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !marker_exists => {
            return Ok(PublicationState::TargetAbsent)
        }
        Err(e) => return Err(format!("发布目标缺失或不可读，不能确认完成: {e}")),
        Ok(meta) if !meta.is_dir() || meta.file_type().is_symlink() => {
            return Err("发布目标不是普通目录".into())
        }
        Ok(_) => {}
    }
    let mut count = 0;
    for entry in fs::read_dir(&destination).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        count += 1;
        if count > intent.plan.snapshots.len()
            || !intent
                .plan
                .snapshots
                .iter()
                .any(|s| entry.file_name() == std::ffi::OsStr::new(&s.name))
        {
            return Err("发布目标包含额外历史，不能自动合并或覆盖".into());
        }
    }
    if count != intent.plan.snapshots.len() {
        return Err("发布目标快照不完整".into());
    }
    for snapshot in &intent.plan.snapshots {
        let bytes = read_bounded(&destination.join(&snapshot.name), snapshot.bytes)?;
        if bytes.len() as u64 != snapshot.bytes
            || format!("{:x}", Sha256::digest(bytes)) != snapshot.sha256
        {
            return Err("发布目标内容与历史清单不一致".into());
        }
    }
    Ok(PublicationState::TargetMatches)
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RecoveryHistory {
    NotRequired,
    Pending,
    TargetMatches,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct RecoveryAssessment {
    pub document: super::archive_document::DocumentState,
    pub history: RecoveryHistory,
    // No current combination authorizes cleanup, retry, or UI success.
    pub requires_review: bool,
}

#[allow(dead_code)]
pub(crate) fn inspect_recovery(
    root: &Path,
    cache: &Path,
    stage: &Path,
) -> Result<RecoveryAssessment, String> {
    use super::archive_document::DocumentState;
    let lease = super::history_coordination::acquire(cache)?;
    let (document, intent) =
        super::archive_document::inspect_document_locked(root, cache, stage, &lease)?;
    if matches!(
        document,
        DocumentState::BothPresent | DocumentState::NeitherPresent
    ) {
        return Err("正文位置有歧义，保留全部恢复材料并人工核对".into());
    }
    fn read_log<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 1024 * 1024 {
            return Err("恢复策略日志类型或大小异常".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 {
            return Err("恢复日志超限".into());
        }
        serde_json::from_slice(&bytes).map_err(|e| format!("恢复日志无效: {e}"))
    }
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields, rename_all = "camelCase")]
    struct Policy {
        version: u32,
        history_required: bool,
        plan: ArchiveHistoryPlan,
    }
    let policy: Policy = read_log(&stage.join("history-policy.json"))?;
    if policy.version != 1
        || Path::new(&policy.plan.source_directory) != history_path(cache, &intent.source)
        || Path::new(&policy.plan.target_directory) != history_path(cache, &intent.target)
    {
        return Err("正文与历史策略身份不一致".into());
    }
    let history = if !policy.history_required {
        if policy.plan.strategy != "none"
            || !policy.plan.snapshots.is_empty()
            || inspect(cache, &intent.source, &intent.target)? != policy.plan
        {
            return Err("无历史策略与当前磁盘不一致".into());
        }
        // A no-history transaction must not silently absorb publication evidence.
        for name in [
            "intent.json",
            "publish-intent.json",
            "published",
            "prepared.sha256",
            "publish-payload",
        ] {
            match fs::symlink_metadata(stage.join(name)) {
                Ok(_) => return Err("无历史策略包含冲突的历史发布材料".into()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        RecoveryHistory::NotRequired
    } else {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Preparation {
            version: u32,
            plan: ArchiveHistoryPlan,
        }
        let preparation: Preparation = read_log(&stage.join("intent.json"))?;
        if preparation.version != 1
            || preparation.plan != policy.plan
            || policy.plan.strategy != "copy_verify_then_retire_source"
        {
            return Err("历史策略与暂存清单不一致".into());
        }
        match inspect_publication_locked(cache, stage, &intent.source, &intent.target, &lease)? {
            PublicationState::TargetMatches => {
                if document != DocumentState::TargetMatches {
                    return Err("历史目标已匹配但正文仍在来源，需要人工核对".into());
                }
                RecoveryHistory::TargetMatches
            }
            PublicationState::NotStarted | PublicationState::TargetAbsent => {
                // NotStarted alone does not establish that the target is absent.
                if inspect(cache, &intent.source, &intent.target)? != policy.plan {
                    return Err("待发布历史来源已变化".into());
                }
                RecoveryHistory::Pending
            }
        }
    };
    Ok(RecoveryAssessment {
        document,
        history,
        requires_review: true,
    })
}

/// Read-only restart diagnosis. Even Prepared requires live source/target checks.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StagingState {
    Incomplete,
    Prepared,
}

#[allow(dead_code)] // Recovery UI/commit coordinator not wired yet.
pub(crate) fn inspect_staging(cache: &Path, stage: &Path) -> Result<StagingState, String> {
    fn read_regular(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
            return Err("恢复文件类型或大小不合法".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > limit {
            return Err("恢复文件读取超限".into());
        }
        Ok(bytes)
    }
    let meta = fs::symlink_metadata(stage).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("历史暂存位置不是普通目录".into());
    }
    let cache = cache.canonicalize().map_err(|e| e.to_string())?;
    let stage = stage.canonicalize().map_err(|e| e.to_string())?;
    if stage.parent() != Some(cache.as_path())
        || !stage
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with(".archive-stage-"))
    {
        return Err("恢复目录不在指定历史缓存内".into());
    }
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Intent {
        version: u32,
        plan: ArchiveHistoryPlan,
    }
    let bytes = read_regular(&stage.join("intent.json"), 1024 * 1024)?;
    let intent: Intent =
        serde_json::from_slice(&bytes).map_err(|e| format!("历史恢复日志损坏: {e}"))?;
    if intent.version != 1
        || intent.plan.strategy != "copy_verify_then_retire_source"
        || intent.plan.snapshots.len() > MAX_SNAPSHOTS
    {
        return Err("不支持的历史恢复日志".into());
    }
    let mut names = std::collections::HashSet::new();
    let mut total = 0u64;
    for snapshot in &intent.plan.snapshots {
        let stem = snapshot.name.strip_suffix(".md").ok_or("非法快照名称")?;
        if stem.is_empty()
            || !stem.bytes().all(|b| b.is_ascii_digit())
            || stem.parse::<u64>().is_err()
            || !names.insert(snapshot.name.as_str())
        {
            return Err("非法或重复快照名称".into());
        }
        total = total.checked_add(snapshot.bytes).ok_or("快照体积溢出")?;
        if total > MAX_BYTES {
            return Err("恢复历史超出体积上限".into());
        }
    }
    match fs::symlink_metadata(stage.join("prepared.sha256")) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(StagingState::Incomplete),
        Err(e) => return Err(e.to_string()),
        Ok(_) => {}
    }
    if read_regular(&stage.join("prepared.sha256"), 64)?
        != format!("{:x}", Sha256::digest(&bytes)).as_bytes()
    {
        return Err("历史暂存完成标记与日志不匹配".into());
    }
    for snapshot in &intent.plan.snapshots {
        let stored = read_regular(&stage.join(&snapshot.name), snapshot.bytes)?;
        if stored.len() as u64 != snapshot.bytes
            || format!("{:x}", Sha256::digest(&stored)) != snapshot.sha256
        {
            return Err("恢复历史快照校验失败".into());
        }
    }
    // Never follow the source/target paths from disk logs or mutate anything here.
    Ok(StagingState::Prepared)
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

    #[test]
    fn preparation_copies_verified_bytes_without_publishing_or_retiring() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "历史\r\n正文").unwrap();
        let plan = f.inspect().unwrap();
        let prepared = prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan).unwrap();
        assert_eq!(prepared.plan, plan);
        let stage = prepared.staging_directory.unwrap();
        assert_eq!(
            fs::read(stage.join("1.md")).unwrap(),
            fs::read(f.old().join("1.md")).unwrap()
        );
        assert!(!f.new_path().exists());
    }

    #[test]
    fn stale_preflight_is_rejected_without_creating_staging() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "old").unwrap();
        let plan = f.inspect().unwrap();
        fs::write(f.old().join("1.md"), "new").unwrap();
        let failure = prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan).unwrap_err();
        assert!(failure.message.contains("变化"));
        assert!(failure.retained_staging_directory.is_none());
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
    }

    #[test]
    fn concurrent_history_change_retains_copy_and_original_without_publication() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "old").unwrap();
        let plan = f.inspect().unwrap();
        let failure = prepare_with_hook(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &plan,
            || fs::write(f.old().join("2.md"), "new snapshot").unwrap(),
        )
        .unwrap_err();
        let stage = failure.retained_staging_directory.unwrap();
        assert_eq!(fs::read_to_string(stage.join("1.md")).unwrap(), "old");
        assert!(f.old().join("1.md").exists());
        assert!(f.old().join("2.md").exists());
        assert!(!f.new_path().exists());
    }

    #[test]
    fn absent_history_creates_nothing_and_new_target_conflict_blocks() {
        let f = Fixture::new();
        let plan = f.inspect().unwrap();
        assert!(
            prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan)
                .unwrap()
                .staging_directory
                .is_none()
        );
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 0);
        fs::create_dir(f.new_path()).unwrap();
        fs::write(f.new_path().join("1.md"), "unrelated").unwrap();
        assert!(prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan).is_err());
        assert_eq!(
            fs::read_to_string(f.new_path().join("1.md")).unwrap(),
            "unrelated"
        );
    }

    #[test]
    fn destination_appearing_during_copy_is_not_overwritten() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "original").unwrap();
        let plan = f.inspect().unwrap();
        let failure = prepare_with_hook(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &plan,
            || {
                fs::create_dir(f.new_path()).unwrap();
                fs::write(f.new_path().join("1.md"), "other history").unwrap();
            },
        )
        .unwrap_err();
        assert!(failure
            .retained_staging_directory
            .unwrap()
            .join("1.md")
            .exists());
        assert_eq!(
            fs::read_to_string(f.old().join("1.md")).unwrap(),
            "original"
        );
        assert_eq!(
            fs::read_to_string(f.new_path().join("1.md")).unwrap(),
            "other history"
        );
    }

    #[test]
    fn restart_diagnosis_rechecks_disk_and_rejects_corruption() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "original").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        let stage = prepared.staging_directory.unwrap();
        assert_eq!(
            inspect_staging(&f.0, &stage).unwrap(),
            StagingState::Prepared
        );
        fs::write(stage.join("1.md"), "tampered").unwrap();
        assert!(inspect_staging(&f.0, &stage).is_err());
        assert_eq!(
            fs::read_to_string(f.old().join("1.md")).unwrap(),
            "original"
        );
        assert!(!f.new_path().exists());
    }

    #[test]
    fn interrupted_copy_is_incomplete_and_never_resumed_automatically() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "original").unwrap();
        let failed = prepare_with_hook(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
            || {
                fs::write(f.old().join("2.md"), "changed").unwrap();
            },
        )
        .unwrap_err();
        let stage = failed.retained_staging_directory.unwrap();
        assert_eq!(
            inspect_staging(&f.0, &stage).unwrap(),
            StagingState::Incomplete
        );
        assert!(!stage.join("prepared.sha256").exists());
        assert!(!f.new_path().exists());
        fs::write(stage.join("intent.json"), "truncated {").unwrap();
        assert!(inspect_staging(&f.0, &stage).is_err());
    }

    #[test]
    fn recovery_rejects_outside_directory_and_traversal_in_manifest() {
        let f = Fixture::new();
        let stage = f.0.join(".archive-stage-test");
        fs::create_dir(&stage).unwrap();
        fs::write(stage.join("intent.json"), r#"{"version":1,"plan":{"sourceDirectory":"ignored","targetDirectory":"ignored","strategy":"copy_verify_then_retire_source","snapshots":[{"name":"../1.md","bytes":0,"sha256":""}]}}"#).unwrap();
        assert!(inspect_staging(&f.0, &stage).is_err());
        let other = Fixture::new();
        assert!(inspect_staging(&other.0, &stage).is_err());
        assert!(stage.join("intent.json").exists());
    }

    #[test]
    fn history_writer_lease_blocks_preparation_before_any_staging_write() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "keep").unwrap();
        let plan = f.inspect().unwrap();
        let lease = super::super::history_coordination::acquire(&f.0).unwrap();
        let failure = prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan).unwrap_err();
        assert!(failure.message.contains("稍后重试"));
        assert!(failure.retained_staging_directory.is_none());
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
        drop(lease);
        assert!(prepare(&f.0, Path::new("old.md"), Path::new("new.md"), &plan).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn history_publication_preserves_source_and_keeps_journal_out_of_target() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "history").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        let receipt = publish(&f.0, Path::new("old.md"), Path::new("new.md"), &prepared).unwrap();
        assert!(receipt.marker_error.is_none());
        assert_eq!(receipt.target_directory, f.new_path());
        assert_eq!(
            fs::read_to_string(f.new_path().join("1.md")).unwrap(),
            "history"
        );
        assert_eq!(fs::read_to_string(f.old().join("1.md")).unwrap(), "history");
        assert_eq!(fs::read_dir(f.new_path()).unwrap().count(), 1);
        assert!(publish(&f.0, Path::new("old.md"), Path::new("new.md"), &prepared).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn publication_marker_failure_reports_already_published_state() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "history").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        let stage = prepared.staging_directory.as_ref().unwrap();
        let receipt = publish_with_hook(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &prepared,
            || {
                fs::create_dir(stage.join("published")).unwrap();
            },
        )
        .unwrap();
        assert!(receipt.marker_error.is_some());
        assert_eq!(
            fs::read_to_string(receipt.target_directory.join("1.md")).unwrap(),
            "history"
        );
        assert!(stage.join("publish-intent.json").exists());
        assert!(f.old().join("1.md").exists());
    }

    #[test]
    fn publication_rejects_source_change_before_creating_target() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "before").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        fs::write(f.old().join("1.md"), "after!").unwrap();
        assert!(publish(&f.0, Path::new("old.md"), Path::new("new.md"), &prepared).is_err());
        assert!(!f.new_path().exists());
        assert_eq!(fs::read_to_string(f.old().join("1.md")).unwrap(), "after!");
    }

    #[cfg(windows)]
    #[test]
    fn publication_recovery_uses_target_bytes_without_completion_marker() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "history").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        let stage = prepared.staging_directory.as_ref().unwrap();
        assert_eq!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).unwrap(),
            PublicationState::NotStarted
        );
        publish(&f.0, Path::new("old.md"), Path::new("new.md"), &prepared).unwrap();
        fs::remove_file(stage.join("published")).unwrap();
        assert_eq!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).unwrap(),
            PublicationState::TargetMatches
        );
        assert!(
            inspect_publication(&f.0, stage, Path::new("wrong.md"), Path::new("new.md")).is_err()
        );
        fs::write(f.new_path().join("1.md"), "changed").unwrap();
        fs::write(stage.join("published"), "history-only-v1").unwrap();
        assert!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).is_err()
        );
        assert_eq!(
            fs::read_to_string(f.new_path().join("1.md")).unwrap(),
            "changed"
        );
    }

    #[cfg(windows)]
    #[test]
    fn publication_recovery_rejects_extra_files_and_missing_target_with_marker() {
        let f = Fixture::new();
        fs::create_dir(f.old()).unwrap();
        fs::write(f.old().join("1.md"), "history").unwrap();
        let prepared = prepare(
            &f.0,
            Path::new("old.md"),
            Path::new("new.md"),
            &f.inspect().unwrap(),
        )
        .unwrap();
        let stage = prepared.staging_directory.as_ref().unwrap();
        publish(&f.0, Path::new("old.md"), Path::new("new.md"), &prepared).unwrap();
        fs::write(f.new_path().join("2.md"), "extra").unwrap();
        assert!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).is_err()
        );
        fs::rename(f.new_path(), f.0.join("retained-target")).unwrap();
        assert!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).is_err()
        );
        fs::remove_file(stage.join("published")).unwrap();
        assert_eq!(
            inspect_publication(&f.0, stage, Path::new("old.md"), Path::new("new.md")).unwrap(),
            PublicationState::TargetAbsent
        );
        assert!(f.old().join("1.md").exists());
        assert!(f.0.join("retained-target/2.md").exists());
    }

    #[cfg(windows)]
    #[test]
    fn coordinated_move_preserves_document_history_and_holds_one_lease() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "document").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let old = history_path(&f.0, &source);
        fs::create_dir(&old).unwrap();
        fs::write(old.join("1.md"), "history").unwrap();
        let receipt = move_with_history_hook(&root, &f.0, &source, &target, || {
            assert!(super::super::history_coordination::acquire(&f.0).is_err());
        })
        .unwrap();
        assert!(receipt.document_moved && receipt.history_published && receipt.error.is_none());
        assert_eq!(fs::read_to_string(&target).unwrap(), "document");
        assert!(!source.exists());
        assert_eq!(
            fs::read_to_string(history_path(&f.0, &target).join("1.md")).unwrap(),
            "history"
        );
        assert!(old.join("1.md").exists());
        assert!(receipt.stage.join("document-intent.json").exists());
        assert!(super::super::history_coordination::acquire(&f.0).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn coordinated_partial_failure_reports_moved_document_and_retains_history() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "document").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let old = history_path(&f.0, &source);
        fs::create_dir(&old).unwrap();
        fs::write(old.join("1.md"), "history").unwrap();
        let receipt = move_with_history_hook(&root, &f.0, &source, &target, || {
            fs::create_dir(history_path(&f.0, &target)).unwrap();
            fs::write(history_path(&f.0, &target).join("2.md"), "conflict").unwrap();
        })
        .unwrap();
        assert!(receipt.document_moved && !receipt.history_published && receipt.error.is_some());
        assert_eq!(fs::read_to_string(&target).unwrap(), "document");
        assert_eq!(fs::read_to_string(old.join("1.md")).unwrap(), "history");
        assert_eq!(
            fs::read_to_string(history_path(&f.0, &target).join("2.md")).unwrap(),
            "conflict"
        );
        assert!(receipt.stage.join("1.md").exists());
    }

    #[test]
    fn coordinated_conflicting_target_never_moves_source() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "keep").unwrap();
        let source = root.join("old.md");
        let target = root.join("new.md");
        fs::write(&target, "other").unwrap();
        assert!(move_with_history(&root, &f.0, &source, &target).is_err());
        assert_eq!(fs::read_to_string(source).unwrap(), "keep");
        assert_eq!(fs::read_to_string(target).unwrap(), "other");
    }

    #[cfg(windows)]
    #[test]
    fn coordinated_no_history_creates_journal_not_fake_history() {
        let f = Fixture::new();
        let root = f.0.join("library");
        let cache = f.0.join("new-cache");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "fresh note").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let receipt = move_with_history(&root, &cache, &source, &target).unwrap();
        assert!(
            receipt.document_moved
                && !receipt.history_required
                && !receipt.history_published
                && receipt.error.is_none()
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "fresh note");
        assert!(!source.exists());
        assert!(!history_path(&cache, &source).exists());
        assert!(!history_path(&cache, &target).exists());
        assert!(receipt.stage.join("document-intent.json").exists());
        let policy: serde_json::Value =
            serde_json::from_slice(&fs::read(receipt.stage.join("history-policy.json")).unwrap())
                .unwrap();
        assert_eq!(policy["historyRequired"], false);
        assert_eq!(
            super::super::archive_document::inspect_document(&root, &cache, &receipt.stage)
                .unwrap(),
            super::super::archive_document::DocumentState::TargetMatches
        );
        assert!(super::super::history_coordination::ensure_clearable(&cache).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn coordinated_no_history_detects_late_history_without_deleting_it() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "fresh note").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let receipt = move_with_history_hook(&root, &f.0, &source, &target, || {
            fs::create_dir(history_path(&f.0, &source)).unwrap();
            fs::write(history_path(&f.0, &source).join("1.md"), "late history").unwrap();
        })
        .unwrap();
        assert!(
            receipt.document_moved
                && !receipt.history_required
                && !receipt.history_published
                && receipt.error.is_some()
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "fresh note");
        assert_eq!(
            fs::read_to_string(history_path(&f.0, &source).join("1.md")).unwrap(),
            "late history"
        );
        assert!(!history_path(&f.0, &target).exists());
    }

    #[cfg(windows)]
    #[test]
    fn unified_recovery_covers_both_history_policies_and_rejects_conflicting_policy() {
        for with_history in [false, true] {
            let f = Fixture::new();
            let root = f.0.join("library");
            fs::create_dir(&root).unwrap();
            fs::write(root.join("old.md"), "note").unwrap();
            let source = root.join("old.md").canonicalize().unwrap();
            let target = root.canonicalize().unwrap().join("new.md");
            if with_history {
                let old = history_path(&f.0, &source);
                fs::create_dir(&old).unwrap();
                fs::write(old.join("1.md"), "history").unwrap();
            }
            let receipt = move_with_history(&root, &f.0, &source, &target).unwrap();
            let assessment = inspect_recovery(&root, &f.0, &receipt.stage).unwrap();
            assert_eq!(
                assessment.document,
                super::super::archive_document::DocumentState::TargetMatches
            );
            assert_eq!(
                assessment.history,
                if with_history {
                    RecoveryHistory::TargetMatches
                } else {
                    RecoveryHistory::NotRequired
                }
            );
            assert!(assessment.requires_review);
            let policy_path = receipt.stage.join("history-policy.json");
            let mut policy: serde_json::Value =
                serde_json::from_slice(&fs::read(&policy_path).unwrap()).unwrap();
            policy["historyRequired"] = serde_json::json!(!with_history);
            fs::write(&policy_path, serde_json::to_vec(&policy).unwrap()).unwrap();
            assert!(inspect_recovery(&root, &f.0, &receipt.stage).is_err());
            assert_eq!(fs::read_to_string(&target).unwrap(), "note");
        }
    }

    #[cfg(windows)]
    #[test]
    fn unified_recovery_reports_pending_history_and_preserves_ambiguous_files() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "note").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let old = history_path(&f.0, &source);
        fs::create_dir(&old).unwrap();
        fs::write(old.join("1.md"), "history").unwrap();
        let receipt = move_with_history_hook(&root, &f.0, &source, &target, || {
            fs::create_dir(history_path(&f.0, &target)).unwrap();
        })
        .unwrap();
        assert!(receipt.document_moved && !receipt.history_published);
        assert!(inspect_recovery(&root, &f.0, &receipt.stage).is_err());
        fs::rename(history_path(&f.0, &target), f.0.join("retained-conflict")).unwrap();
        assert_eq!(
            inspect_recovery(&root, &f.0, &receipt.stage)
                .unwrap()
                .history,
            RecoveryHistory::Pending
        );
        fs::write(&source, "another note").unwrap();
        assert!(inspect_recovery(&root, &f.0, &receipt.stage).is_err());
        assert_eq!(fs::read_to_string(&source).unwrap(), "another note");
        assert_eq!(fs::read_to_string(&target).unwrap(), "note");
    }

    #[cfg(windows)]
    #[test]
    fn coordinated_target_change_stops_history_publication_without_rollback() {
        let f = Fixture::new();
        let root = f.0.join("library");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("old.md"), "before").unwrap();
        let source = root.join("old.md").canonicalize().unwrap();
        let target = root.canonicalize().unwrap().join("new.md");
        let old = history_path(&f.0, &source);
        fs::create_dir(&old).unwrap();
        fs::write(old.join("1.md"), "history").unwrap();
        let receipt = move_with_history_hook(&root, &f.0, &source, &target, || {
            fs::write(&target, "after!").unwrap()
        })
        .unwrap();
        assert!(receipt.document_moved && !receipt.history_published && receipt.error.is_some());
        assert_eq!(fs::read_to_string(&target).unwrap(), "after!");
        assert!(!history_path(&f.0, &target).exists());
        assert!(old.join("1.md").exists());
        assert!(
            super::super::archive_document::inspect_document(&root, &f.0, &receipt.stage).is_err()
        );
    }
}
