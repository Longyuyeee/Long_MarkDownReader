//! Internal disk primitive, NOT an archive transaction or a frontend command.
//! Callers must coordinate drafts, dependencies, history and file identity first.
//! Path validation is not protection against concurrent replacement of ancestors.
#![allow(dead_code)] // Deliberately not exposed until archive consistency is implemented.
use super::workspace_guard::WorkspaceGuard;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub(crate) struct MoveReceipt {
    pub source: PathBuf,
    pub target: PathBuf,
    /// Success means the OS rename succeeded, not that history/links were migrated.
    pub result: Result<(), String>,
}

/// Independent operations, in order. No rollback and no automatic retry.
/// On failure, preserve the error rather than infer success from a missing source.
pub(crate) fn move_batch(root: &Path, items: &[(PathBuf, PathBuf)]) -> Vec<MoveReceipt> {
    let guard = WorkspaceGuard::new(root);
    items
        .iter()
        .map(|(source, target)| MoveReceipt {
            source: source.clone(),
            target: target.clone(),
            result: guard
                .as_ref()
                .map_err(Clone::clone)
                .and_then(|guard| move_one(guard, source, target)),
        })
        .collect()
}

fn move_one(guard: &WorkspaceGuard, source: &Path, target: &Path) -> Result<(), String> {
    let source_input = if source.is_absolute() {
        source.to_owned()
    } else {
        guard.root().join(source)
    };
    let metadata = fs::symlink_metadata(&source_input).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("归档来源必须是普通文件，不能是目录或符号链接".into());
    }
    let source = guard.resolve_existing_file(&source_input, &[])?;
    let name = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("无效目标文件名")?;
    crate::commands::files::validate_item_name(name)?;
    let parent = guard.resolve_directory(target.parent().ok_or("缺少目标目录")?, false)?;
    let target = parent.join(name);
    if source
        .to_string_lossy()
        .eq_ignore_ascii_case(&target.to_string_lossy())
    {
        return Err("来源与目标相同，未执行归档".into());
    }
    if !source
        .extension()
        .unwrap_or_default()
        .eq_ignore_ascii_case(target.extension().unwrap_or_default())
    {
        return Err("归档不能更改文件扩展名".into());
    }
    // Do not canonicalize the final target: even a dangling symlink is a conflict.
    // No exists()+rename race: the OS operation itself refuses replacement.
    rename_no_replace(&source, &target).map_err(|e| format!("移动失败，未执行覆盖或复制回退: {e}"))
}

#[cfg(windows)]
pub(crate) fn rename_no_replace(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    fn wide(path: &Path) -> io::Result<Vec<u16>> {
        let mut value: Vec<u16> = path.as_os_str().encode_wide().collect();
        if value.contains(&0) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "路径包含 NUL"));
        }
        value.push(0);
        Ok(value)
    }
    let source = wide(source)?;
    let target = wide(target)?;
    // SAFETY: both buffers are NUL-terminated and live for the synchronous call.
    // Flags 0: no REPLACE_EXISTING, COPY_ALLOWED or deferred reboot operation.
    if unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), 0) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub(crate) fn rename_no_replace(_: &Path, _: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "此平台尚未实现无覆盖归档移动",
    ))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "longedit-archive-move-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("归档")).unwrap();
        root
    }
    #[test]
    fn partial_batch_reports_every_item_and_preserves_conflict() {
        let root = fixture();
        for name in ["甲.md", "乙.md", "丙.md"] {
            fs::write(root.join(name), name).unwrap();
        }
        fs::write(root.join("归档/乙.md"), "原有内容").unwrap();
        let items: Vec<_> = ["甲.md", "乙.md", "丙.md", "missing.md"]
            .iter()
            .map(|name| (root.join(name), root.join("归档").join(name)))
            .collect();
        let receipts = move_batch(&root, &items);
        assert_eq!(
            receipts
                .iter()
                .map(|r| r.result.is_ok())
                .collect::<Vec<_>>(),
            [true, false, true, false]
        );
        for (receipt, (source, target)) in receipts.iter().zip(&items) {
            assert_eq!((&receipt.source, &receipt.target), (source, target));
        }
        assert!(!root.join("甲.md").exists());
        assert!(!root.join("丙.md").exists());
        assert_eq!(
            fs::read_to_string(root.join("归档/甲.md")).unwrap(),
            "甲.md"
        );
        assert_eq!(
            fs::read_to_string(root.join("归档/丙.md")).unwrap(),
            "丙.md"
        );
        assert_eq!(fs::read_to_string(root.join("乙.md")).unwrap(), "乙.md");
        assert_eq!(
            fs::read_to_string(root.join("归档/乙.md")).unwrap(),
            "原有内容"
        );
        assert!(move_batch(&root, &items)[0].result.is_err()); // not fake idempotence
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_directory_extension_change_outside_and_same_path() {
        let root = fixture();
        fs::write(root.join("a.md"), "keep").unwrap();
        for (source, target) in [
            (root.join("a.md"), root.join("a.md")),
            (root.join("a.md"), root.join("归档/a.txt")),
            (root.join("归档"), root.join("nested")),
            (root.join("a.md"), root.parent().unwrap().join("escape.md")),
        ] {
            assert!(move_batch(&root, &[(source, target)])[0].result.is_err());
        }
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "keep");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn primitive_moves_directories_without_replacing_existing_content() {
        let root = fixture();
        let source = root.join("源目录");
        let occupied = root.join("占用目录");
        let destination = root.join("移动后");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&occupied).unwrap();
        fs::write(source.join("记录.md"), "source").unwrap();
        fs::write(occupied.join("记录.md"), "keep").unwrap();
        assert!(rename_no_replace(&source, &occupied).is_err());
        assert_eq!(fs::read_to_string(source.join("记录.md")).unwrap(), "source");
        assert_eq!(fs::read_to_string(occupied.join("记录.md")).unwrap(), "keep");
        rename_no_replace(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(destination.join("记录.md")).unwrap(), "source");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_destination_has_exactly_one_winner() {
        let root = fixture();
        let gate = std::sync::Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = ["one.md", "two.md"]
            .into_iter()
            .map(|name| {
                fs::write(root.join(name), name).unwrap();
                let root = root.clone();
                let gate = gate.clone();
                std::thread::spawn(move || {
                    gate.wait();
                    (
                        name,
                        move_batch(&root, &[(root.join(name), root.join("归档/result.md"))])[0]
                            .result
                            .is_ok(),
                    )
                })
            })
            .collect();
        let outcomes: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(outcomes.iter().filter(|(_, ok)| *ok).count(), 1);
        for (name, ok) in outcomes {
            assert_eq!(root.join(name).exists(), !ok);
            if ok {
                assert_eq!(
                    fs::read_to_string(root.join("归档/result.md")).unwrap(),
                    name
                );
            }
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn locked_source_failure_keeps_both_paths_unchanged() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = fixture();
        let source = root.join("locked.md");
        let target = root.join("归档/locked.md");
        fs::write(&source, "unsaved elsewhere").unwrap();
        let lock = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&source)
            .unwrap();
        assert!(move_batch(&root, &[(source.clone(), target.clone())])[0]
            .result
            .is_err());
        assert!(source.exists());
        assert!(!target.exists());
        drop(lock);
        assert_eq!(fs::read_to_string(&source).unwrap(), "unsaved elsewhere");
        assert!(move_batch(&root, &[(source, target.clone())])[0]
            .result
            .is_ok());
        assert_eq!(fs::read_to_string(target).unwrap(), "unsaved elsewhere");
        fs::remove_dir_all(root).unwrap();
    }
}
