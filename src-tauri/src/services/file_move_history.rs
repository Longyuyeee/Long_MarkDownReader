//! History coordination for existing move/rename operations, not an archive UI.
//! Callers hold the application history lease. Persist intent before mutation;
//! retain uncertain states for review. No automatic replay or Markdown rewrite.
use super::{
    archive_history::{history_path, inspect, inspect_with_budget, ArchiveHistoryPlan},
    archive_move::rename_no_replace,
    file_move_journal::{self, HistoryIntent, Intent, Journal, MoveFailure, Outcome},
};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_ENTRIES: usize = 20_000;
const MAX_HISTORY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_HISTORY_SNAPSHOTS: usize = 20_000;
struct Entry {
    source: PathBuf,
    target: PathBuf,
    expected: ArchiveHistoryPlan,
    has_history: bool,
}
struct Migration {
    cache: PathBuf,
    source: PathBuf,
    target: PathBuf,
    entries: Vec<Entry>,
}

impl Migration {
    fn inspect(cache: &Path, source: &Path, target: &Path) -> Result<Self, MoveFailure> {
        file_move_journal::ensure_no_pending(cache, source, target)?;
        let mut entries = Vec::new();
        let mut pending = vec![source.to_path_buf()];
        let mut count = 0usize;
        let mut remaining_bytes = MAX_HISTORY_BYTES;
        let mut remaining_snapshots = MAX_HISTORY_SNAPSHOTS;
        while let Some(path) = pending.pop() {
            count += 1;
            if count > MAX_ENTRIES {
                return Err("目录超过 20000 项历史检查上限，尚未移动任何文件".into());
            }
            let metadata =
                fs::symlink_metadata(&path).map_err(|e| format!("无法完整检查目录历史：{e}"))?;
            // A link's referent is not moved with its containing directory.
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                for child in
                    fs::read_dir(&path).map_err(|e| format!("无法完整读取目录历史：{e}"))?
                {
                    let child = child.map_err(|e| format!("无法完整读取目录条目：{e}"))?;
                    if pending.len() + count >= MAX_ENTRIES {
                        return Err("目录超过 20000 项历史检查上限，尚未移动任何文件".into());
                    }
                    pending.push(child.path());
                }
            } else if metadata.is_file() {
                let next = if path == source {
                    target.to_path_buf()
                } else {
                    target.join(path.strip_prefix(source).map_err(|e| e.to_string())?)
                };
                let expected =
                    inspect_with_budget(cache, &path, &next, remaining_bytes).map_err(|e| {
                        format!(
                            "{} 的历史无法安全接续：{e}",
                            path.file_name().unwrap_or_default().to_string_lossy()
                        )
                    })?;
                remaining_bytes = remaining_bytes
                    .checked_sub(expected.snapshot_bytes())
                    .ok_or("目录历史超过 64 MiB 检查预算，尚未移动任何文件")?;
                remaining_snapshots = remaining_snapshots
                    .checked_sub(expected.snapshot_count())
                    .ok_or("目录历史超过 20000 份快照检查预算，尚未移动任何文件")?;
                let has_history = history_path(cache, &path)
                    .try_exists()
                    .map_err(|e| format!("无法核对来源历史：{e}"))?;
                entries.push(Entry {
                    source: path,
                    target: next,
                    expected,
                    has_history,
                });
            } else {
                return Err("目录包含非普通文件，尚未移动任何文件".into());
            }
        }
        entries.sort_by(|a, b| a.source.cmp(&b.source));
        Ok(Self {
            cache: cache.to_path_buf(),
            source: source.to_path_buf(),
            target: target.to_path_buf(),
            entries,
        })
    }
    fn execute(
        self,
        move_document: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), MoveFailure> {
        self.execute_with_hook(move_document, |_| {})
    }
    fn execute_with_hook(
        self,
        move_document: impl FnOnce() -> Result<(), String>,
        mut before_history: impl FnMut(usize),
    ) -> Result<(), MoveFailure> {
        // Verify every source snapshot and target before the first mutation.
        for entry in &self.entries {
            if inspect(&self.cache, &entry.source, &entry.target)? != entry.expected {
                return Err("历史清单在检查后变化，尚未移动任何文件，请重试".into());
            }
        }
        let journal = Journal::begin(
            &self.cache,
            &Intent {
                version: 1,
                source: self.source.clone(),
                target: self.target.clone(),
                histories: self
                    .entries
                    .iter()
                    .map(|entry| HistoryIntent {
                        source: entry.source.clone(),
                        target: entry.target.clone(),
                        expected: entry.expected.clone(),
                        had_history: entry.has_history,
                    })
                    .collect(),
            },
        )?;
        let mut moved = Vec::<&Entry>::new();
        for (index, entry) in self.entries.iter().enumerate() {
            match inspect(&self.cache, &entry.source, &entry.target) {
                Ok(current) if current == entry.expected => {}
                Ok(_) => {
                    return Err(rollback(
                        &self.cache,
                        &journal,
                        &moved,
                        "历史清单在执行期间变化，正文尚未移动".into(),
                    ))
                }
                Err(e) => {
                    return Err(rollback(
                        &self.cache,
                        &journal,
                        &moved,
                        format!("历史清单在执行期间无法确认，正文尚未移动：{e}"),
                    ))
                }
            }
            let old = history_path(&self.cache, &entry.source);
            let new = history_path(&self.cache, &entry.target);
            match old.try_exists() {
                Ok(exists) if exists == entry.has_history => {
                    if !exists {
                        continue;
                    }
                }
                Ok(_) => {
                    return Err(rollback(
                        &self.cache,
                        &journal,
                        &moved,
                        "来源历史在执行期间变化，正文尚未移动".into(),
                    ))
                }
                Err(e) => {
                    return Err(rollback(
                        &self.cache,
                        &journal,
                        &moved,
                        format!("无法核对来源历史，正文尚未移动：{e}"),
                    ))
                }
            }
            before_history(index);
            if let Err(error) = rename_no_replace(&old, &new) {
                return Err(rollback(
                    &self.cache,
                    &journal,
                    &moved,
                    format!("历史迁移失败，正文尚未移动：{error}"),
                ));
            }
            moved.push(entry);
        }
        match self.target.try_exists() {
            Ok(false) => {}
            Ok(true) => {
                return Err(rollback(
                    &self.cache,
                    &journal,
                    &moved,
                    "目标在执行期间被占用，正文尚未移动".into(),
                ))
            }
            Err(e) => {
                return Err(rollback(
                    &self.cache,
                    &journal,
                    &moved,
                    format!("无法核对目标，正文尚未移动：{e}"),
                ))
            }
        }
        match move_document() {
            Ok(()) => {
                if !matches!(self.source.try_exists(), Ok(false))
                    || !matches!(self.target.try_exists(), Ok(true))
                {
                    return Err(journal.needs_review("移动返回成功但文件位置需核对".into()));
                }
                for entry in &self.entries {
                    match inspect(&self.cache, &entry.target, &entry.source) {
                        Ok(observed) if entry.expected.same_snapshots(&observed) => {}
                        _ => {
                            return Err(journal.needs_review(
                                "文件已移动，但历史状态在执行期间变化，请核对".into(),
                            ))
                        }
                    }
                }
                journal.finish(Outcome::Completed)
            }
            Err(error) => {
                if matches!(self.source.try_exists(), Ok(true))
                    && matches!(self.target.try_exists(), Ok(false))
                {
                    Err(rollback(
                        &self.cache,
                        &journal,
                        &moved,
                        format!("文件移动失败：{error}"),
                    ))
                } else {
                    Err(journal.needs_review(format!("文件移动失败：{error}；文件位置状态需核对，已迁移历史保留在新位置，不推断原位置已恢复；请勿重复全量操作")))
                }
            }
        }
    }
}

fn rollback(cache: &Path, journal: &Journal, moved: &[&Entry], error: String) -> MoveFailure {
    let mut failures = Vec::new();
    for entry in moved.iter().rev() {
        let old = history_path(cache, &entry.source);
        let new = history_path(cache, &entry.target);
        // A different writer may have changed the moved snapshots. Never move
        // those bytes back and claim they are the verified original inventory.
        match inspect(cache, &entry.target, &entry.source) {
            Ok(observed) if entry.expected.same_snapshots(&observed) => {}
            _ => {
                failures.push(format!("{} 的历史位置或摘要已变化", entry.source.display()));
                continue;
            }
        }
        if let Err(e) = rename_no_replace(&new, &old) {
            failures.push(format!("{} → {}：{e}", new.display(), old.display()));
        }
    }
    if failures.is_empty() {
        if let Err(failure) = journal.finish(Outcome::RolledBack) {
            return failure;
        }
        format!("{error}；已恢复本次迁移的历史，未覆盖目标历史").into()
    } else {
        journal.needs_review(format!(
            "{error}；历史回退未全部完成，原记录仍保留，请核对，勿重复全量操作：{}",
            failures.join("；")
        ))
    }
}

pub(crate) fn with_history_move(
    cache: &Path,
    source: &Path,
    target: &Path,
    move_document: impl FnOnce() -> Result<(), String>,
) -> Result<(), MoveFailure> {
    Migration::inspect(cache, source, target)?.execute(move_document)
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
                    "longedit-move-history-{}-{}-{}",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&root) {
                    Ok(()) => {
                        fs::create_dir(root.join("cache")).unwrap();
                        return Self(root.canonicalize().unwrap());
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => panic!("{e}"),
                }
            }
        }
        fn cache(&self) -> PathBuf {
            self.0.join("cache")
        }
        fn history(&self, path: &Path, body: &str) -> PathBuf {
            let directory = super::super::archive_history::history_path(&self.cache(), path);
            fs::create_dir(&directory).unwrap();
            fs::write(directory.join("100.md"), body).unwrap();
            directory
        }
        fn move_file(&self, source: &Path, target: &Path) -> Result<(), MoveFailure> {
            with_history_move(&self.cache(), source, target, || {
                super::super::archive_move::rename_no_replace(source, target)
                    .map_err(|e| e.to_string())
            })
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn occupied_history_stops_move_without_adopting_unrelated_snapshots() {
        let f = Fixture::new();
        let source = f.0.join("原文.md");
        let target = f.0.join("新名称.md");
        fs::write(&source, "current").unwrap();
        let old = f.history(&source, "own history");
        let occupied = f.history(&target, "unrelated history");
        assert!(
            f.move_file(&source, &target).is_err(),
            "must not report a successful move when history cannot follow"
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "current");
        assert!(!target.exists());
        assert_eq!(
            fs::read_to_string(old.join("100.md")).unwrap(),
            "own history"
        );
        assert_eq!(
            fs::read_to_string(occupied.join("100.md")).unwrap(),
            "unrelated history"
        );
    }
    #[test]
    fn no_source_history_must_not_adopt_a_previous_documents_history() {
        let f = Fixture::new();
        let source = f.0.join("a.txt");
        let target = f.0.join("b.txt");
        fs::write(&source, "no previous history").unwrap();
        let occupied = f.history(&target, "other document");
        assert!(f.move_file(&source, &target).is_err());
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(
            fs::read_to_string(occupied.join("100.md")).unwrap(),
            "other document"
        );
    }
    #[test]
    fn nested_folder_history_conflict_leaves_all_documents_and_histories_in_place() {
        let f = Fixture::new();
        let source = f.0.join("原目录");
        let target = f.0.join("新目录");
        fs::create_dir_all(source.join("子目录")).unwrap();
        let a = source.join("a.md");
        let b = source.join("子目录").join("b.txt");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let old_a = f.history(&a, "history a");
        let old_b = f.history(&b, "history b");
        let occupied = f.history(&target.join("子目录").join("b.txt"), "other b");
        assert!(f.move_file(&source, &target).is_err());
        assert!(a.exists() && b.exists());
        assert!(!target.exists());
        assert!(old_a.exists() && old_b.exists());
        assert_eq!(
            fs::read_to_string(occupied.join("100.md")).unwrap(),
            "other b"
        );
    }
    #[test]
    fn successful_move_and_undo_keep_nested_history_bytes() {
        let f = Fixture::new();
        let source = f.0.join("目录");
        let target = f.0.join("移动后");
        fs::create_dir_all(source.join("nested")).unwrap();
        let file = source.join("nested").join("note.txt");
        fs::write(&file, "document").unwrap();
        let old = f.history(&file, "snapshot\r\nwith encoding preserved");
        let original = fs::read(old.join("100.md")).unwrap();
        let metadata = br#"{"100":{"pinned":true,"note":"milestone"}}"#;
        fs::write(old.join("metadata.json"), metadata).unwrap();
        f.move_file(&source, &target).unwrap();
        let new = super::super::archive_history::history_path(
            &f.cache(),
            &target.join("nested").join("note.txt"),
        );
        assert!(!old.exists());
        assert_eq!(fs::read(new.join("100.md")).unwrap(), original);
        assert_eq!(fs::read(new.join("metadata.json")).unwrap(), metadata);
        f.move_file(&target, &source).unwrap();
        assert!(file.exists());
        assert!(!new.exists());
        assert_eq!(fs::read(old.join("100.md")).unwrap(), original);
        assert_eq!(fs::read(old.join("metadata.json")).unwrap(), metadata);
    }
    #[test]
    fn failed_document_move_keeps_history_with_source() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "a").unwrap();
        let old = f.history(&source, "own");
        assert!(with_history_move(&f.cache(), &source, &target, || Err(
            "simulated relation write failure".into()
        ))
        .is_err());
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(fs::read_to_string(old.join("100.md")).unwrap(), "own");
    }

    #[test]
    fn target_history_appearing_during_migration_rolls_back_prior_items() {
        let f = Fixture::new();
        let source = f.0.join("folder");
        let target = f.0.join("renamed");
        fs::create_dir(&source).unwrap();
        let a = source.join("a.md");
        let b = source.join("b.md");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let old_a = f.history(&a, "history a");
        let old_b = f.history(&b, "history b");
        let new_a = super::super::archive_history::history_path(&f.cache(), &target.join("a.md"));
        let new_b = super::super::archive_history::history_path(&f.cache(), &target.join("b.md"));
        let plan = Migration::inspect(&f.cache(), &source, &target).unwrap();
        let result = plan.execute_with_hook(
            || panic!("document move must not run after a history failure"),
            |index| {
                if index == 1 {
                    fs::create_dir(&new_b).unwrap();
                    fs::write(new_b.join("100.md"), "new unrelated history").unwrap();
                }
            },
        );
        assert!(result.is_err());
        assert!(a.exists() && b.exists());
        assert!(!target.exists() && !new_a.exists());
        assert_eq!(
            fs::read_to_string(old_a.join("100.md")).unwrap(),
            "history a"
        );
        assert_eq!(
            fs::read_to_string(old_b.join("100.md")).unwrap(),
            "history b"
        );
        assert_eq!(
            fs::read_to_string(new_b.join("100.md")).unwrap(),
            "new unrelated history"
        );
    }
    #[test]
    fn rollback_does_not_replace_history_created_by_another_writer() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "current").unwrap();
        let old = f.history(&source, "own");
        let new = super::super::archive_history::history_path(&f.cache(), &target);
        let result = with_history_move(&f.cache(), &source, &target, || {
            fs::create_dir(&old).unwrap();
            fs::write(old.join("100.md"), "external writer").unwrap();
            Err("document move failed".into())
        });
        assert!(result.unwrap_err().message.contains("回退未全部完成"));
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(
            fs::read_to_string(old.join("100.md")).unwrap(),
            "external writer"
        );
        assert_eq!(fs::read_to_string(new.join("100.md")).unwrap(), "own");
    }
    #[test]
    fn changed_snapshot_after_plan_is_rejected_before_any_move() {
        let f = Fixture::new();
        let source = f.0.join("a.txt");
        let target = f.0.join("b.txt");
        fs::write(&source, "current").unwrap();
        let old = f.history(&source, "first");
        let plan = Migration::inspect(&f.cache(), &source, &target).unwrap();
        fs::write(old.join("100.md"), "external modification").unwrap();
        assert!(plan
            .execute(|| panic!("stale plan must never move the document"))
            .is_err());
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(
            fs::read_to_string(old.join("100.md")).unwrap(),
            "external modification"
        );
    }
    #[test]
    fn absent_cache_does_not_block_a_document_without_history() {
        let f = Fixture::new();
        fs::remove_dir(f.cache()).unwrap();
        let source = f.0.join("a.txt");
        let target = f.0.join("b.txt");
        fs::write(&source, "current").unwrap();
        f.move_file(&source, &target).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(&target).unwrap(), "current");
        assert!(file_move_journal::pending(&f.cache()).unwrap().is_empty());
    }
    #[test]
    fn history_cache_as_a_file_cannot_be_silently_ignored() {
        let f = Fixture::new();
        fs::remove_dir(f.cache()).unwrap();
        fs::write(f.cache(), "not a directory").unwrap();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "current").unwrap();
        assert!(f.move_file(&source, &target).is_err());
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(fs::read_to_string(f.cache()).unwrap(), "not a directory");
    }

    #[test]
    fn ambiguous_document_failure_retains_history_instead_of_claiming_rollback() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "own document").unwrap();
        let old = f.history(&source, "own history");
        let new = super::super::archive_history::history_path(&f.cache(), &target);
        let error = with_history_move(&f.cache(), &source, &target, || {
            super::super::archive_move::rename_no_replace(&source, &target).unwrap();
            Err("position rollback was blocked".into())
        })
        .unwrap_err();
        assert!(error.message.contains("位置状态需核对"));
        assert!(!source.exists() && !old.exists());
        assert_eq!(fs::read_to_string(&target).unwrap(), "own document");
        assert_eq!(
            fs::read_to_string(new.join("100.md")).unwrap(),
            "own history"
        );
    }
    #[test]
    fn bounded_inventory_rejects_history_larger_than_remaining_budget() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "document").unwrap();
        let old = f.history(&source, "12345");
        assert!(inspect_with_budget(&f.cache(), &source, &target, 4).is_err());
        assert!(source.exists());
        assert!(!target.exists());
        assert_eq!(fs::read_to_string(old.join("100.md")).unwrap(), "12345");
    }
    #[test]
    fn interrupted_history_move_leaves_durable_intent_and_blocks_blind_retry() {
        let f = Fixture::new();
        let source = f.0.join("folder");
        let target = f.0.join("renamed");
        fs::create_dir(&source).unwrap();
        let a = source.join("a.md");
        let b = source.join("b.md");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let old_a = f.history(&a, "history a");
        let old_b = f.history(&b, "history b");
        let plan = Migration::inspect(&f.cache(), &source, &target).unwrap();
        let result = std::panic::catch_unwind(|| {
            plan.execute_with_hook(
                || panic!("document must not move yet"),
                |index| {
                    if index == 1 {
                        panic!("simulated process interruption");
                    }
                },
            )
        });
        assert!(result.is_err());
        assert!(!old_a.exists() && old_b.exists());
        assert!(a.exists() && b.exists() && !target.exists());
        let stages: Vec<_> = fs::read_dir(f.cache().join(".file-moves"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with(".move-stage-")
            })
            .collect();
        assert_eq!(
            stages.len(),
            1,
            "an interrupted move needs a durable record, not just an in-memory vector"
        );
        let intent = fs::read_to_string(stages[0].join("intent.json")).unwrap();
        assert!(
            !intent.contains("history a"),
            "never put snapshot bodies in the journal"
        );
        assert!(intent.contains("sha256"));
        assert!(
            f.move_file(&source, &target).is_err(),
            "unknown state must not be blindly retried"
        );
        assert!(!old_a.exists() && old_b.exists());
    }
    #[test]
    fn changed_moved_history_is_not_blindly_rolled_back_or_marked_retryable() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "body").unwrap();
        let old = f.history(&source, "original history");
        let new = history_path(&f.cache(), &target);
        let failure = with_history_move(&f.cache(), &source, &target, || {
            fs::write(new.join("100.md"), "changed by another writer").unwrap();
            Err("body not moved".into())
        })
        .unwrap_err();
        assert_eq!(
            failure.disposition,
            file_move_journal::FailureDisposition::NeedsReview
        );
        assert!(failure.recovery_id.is_some());
        assert!(source.exists() && !target.exists() && !old.exists());
        assert_eq!(
            fs::read_to_string(new.join("100.md")).unwrap(),
            "changed by another writer"
        );
        assert_eq!(file_move_journal::pending(&f.cache()).unwrap().len(), 1);
        assert!(f.move_file(&source, &f.0.join("different.md")).is_err());
    }
    #[test]
    fn uncertain_body_error_and_failed_terminal_record_are_never_retryable() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "body").unwrap();
        let failure = with_history_move(&f.cache(), &source, &target, || {
            rename_no_replace(&source, &target).unwrap();
            let stage = fs::read_dir(f.cache().join(".file-moves"))
                .unwrap()
                .next()
                .unwrap()
                .unwrap()
                .path();
            fs::write(stage.join("terminal.json"), "another writer's record").unwrap();
            Ok(())
        })
        .unwrap_err();
        assert_eq!(
            failure.disposition,
            file_move_journal::FailureDisposition::NeedsReview
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "body");
        assert!(!source.exists());
        assert!(file_move_journal::pending(&f.cache()).is_err());
        assert!(f.move_file(&target, &source).is_err());
    }
    #[test]
    fn fully_rolled_back_failure_is_explicitly_not_executed_and_can_be_retried() {
        let f = Fixture::new();
        let source = f.0.join("a.md");
        let target = f.0.join("b.md");
        fs::write(&source, "body").unwrap();
        f.history(&source, "history");
        let failure = with_history_move(&f.cache(), &source, &target, || {
            Err("simulated move failure".into())
        })
        .unwrap_err();
        assert_eq!(
            failure.disposition,
            file_move_journal::FailureDisposition::NotExecuted
        );
        assert!(failure.recovery_id.is_none());
        assert!(file_move_journal::pending(&f.cache()).unwrap().is_empty());
        f.move_file(&source, &target).unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "body");
    }
}
