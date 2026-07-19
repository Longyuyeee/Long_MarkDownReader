use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn write_utf8(path: impl AsRef<Path>, content: &str) -> Result<(), String> {
    write_bytes(path, content.as_bytes())
}

pub fn write_bytes(path: impl AsRef<Path>, content: &[u8]) -> Result<(), String> {
    write_bytes_impl(path.as_ref(), content, false)
}

pub fn recover_interrupted_write(path: impl AsRef<Path>) -> Result<(), String> {
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    recover_locked(path.as_ref())
}

fn write_bytes_impl(path: &Path, content: &[u8], fail_after_backup: bool) -> Result<(), String> {
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let parent = path.parent().ok_or("写入目标没有父目录")?;
    if !parent.is_dir() {
        return Err("写入目标的父目录不存在".into());
    }
    recover_locked(path)?;

    let temp = sidecar_path(path, "longedit-tmp")?;
    let backup = sidecar_path(path, "longedit-bak")?;
    if temp.exists() {
        fs::remove_file(&temp).map_err(|e| format!("无法清理旧临时文件: {}", e))?;
    }

    let previous_permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|e| format!("无法创建同目录临时文件: {}", e))?;
    if let Some(permissions) = previous_permissions {
        fs::set_permissions(&temp, permissions).map_err(|e| format!("无法保留文件权限: {}", e))?;
    }
    if let Err(error) = file.write_all(content).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&temp);
        return Err(format!("临时文件写入或同步失败: {}", error));
    }
    drop(file);

    let had_target = path.exists();
    if had_target {
        if backup.exists() {
            fs::remove_file(&backup).map_err(|e| format!("无法清理旧恢复备份: {}", e))?;
        }
        fs::rename(path, &backup).map_err(|e| {
            let _ = fs::remove_file(&temp);
            format!("无法建立恢复备份: {}", e)
        })?;
    }

    if fail_after_backup {
        let _ = fs::remove_file(&temp);
        if had_target {
            let _ = fs::rename(&backup, path);
        }
        return Err("测试故障：新文件提升前中断".into());
    }

    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        if had_target {
            fs::rename(&backup, path).map_err(|restore_error| {
                format!("保存失败且恢复旧文件失败: {}; {}", error, restore_error)
            })?;
        }
        return Err(format!("无法将临时文件提升为目标文件: {}", error));
    }

    if let Ok(target) = OpenOptions::new().read(true).open(path) {
        let _ = target.sync_all();
    }
    sync_parent(parent);
    if backup.exists() {
        let _ = fs::remove_file(&backup);
    }
    sync_parent(parent);
    Ok(())
}

fn recover_locked(path: &Path) -> Result<(), String> {
    let temp = sidecar_path(path, "longedit-tmp")?;
    let backup = sidecar_path(path, "longedit-bak")?;
    match (path.exists(), backup.exists()) {
        (false, true) => {
            fs::rename(&backup, path).map_err(|e| format!("恢复中断写入失败: {}", e))?
        }
        (true, true) => fs::remove_file(&backup).map_err(|e| format!("清理恢复备份失败: {}", e))?,
        _ => {}
    }
    if temp.exists() {
        fs::remove_file(temp).map_err(|e| format!("清理中断临时文件失败: {}", e))?;
    }
    Ok(())
}

fn sidecar_path(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("目标文件没有父目录")?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("目标文件名无效")?;
    Ok(parent.join(format!(".{}.{}", name, suffix)))
}

#[cfg(unix)]
fn sync_parent(parent: &Path) {
    if let Ok(directory) = OpenOptions::new().read(true).open(parent) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "longedit-write-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn replaces_unicode_content_and_cleans_sidecars() {
        let root = fixture("success");
        let target = root.join("note.md");
        fs::write(&target, "旧内容").unwrap();
        write_utf8(&target, "新内容 ✓").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "新内容 ✓");
        assert!(!sidecar_path(&target, "longedit-tmp").unwrap().exists());
        assert!(!sidecar_path(&target, "longedit-bak").unwrap().exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restores_original_when_promotion_fails() {
        let root = fixture("failure");
        let target = root.join("note.md");
        fs::write(&target, "不可丢失的旧内容").unwrap();
        assert!(write_bytes_impl(&target, "未完成的新内容".as_bytes(), true).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "不可丢失的旧内容");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recovers_backup_left_by_interrupted_process() {
        let root = fixture("recovery");
        let target = root.join("note.canvas");
        let backup = sidecar_path(&target, "longedit-bak").unwrap();
        let temp = sidecar_path(&target, "longedit-tmp").unwrap();
        fs::write(&backup, "原始画布").unwrap();
        fs::write(&temp, "不完整画布").unwrap();
        recover_interrupted_write(&target).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "原始画布");
        assert!(!backup.exists() && !temp.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_writes_never_interleave_content() {
        let root = fixture("concurrent");
        let target = root.join("note.md");
        fs::write(&target, "initial").unwrap();
        let payloads: Vec<String> = (0..8)
            .map(|index| format!("payload-{}-{}", index, "x".repeat(4096)))
            .collect();
        let handles: Vec<_> = payloads
            .iter()
            .cloned()
            .map(|payload| {
                let target = target.clone();
                std::thread::spawn(move || write_utf8(target, &payload).unwrap())
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        let result = fs::read_to_string(&target).unwrap();
        assert!(payloads.contains(&result));
        fs::remove_dir_all(root).unwrap();
    }
}
