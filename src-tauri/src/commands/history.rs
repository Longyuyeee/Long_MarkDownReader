use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::write_utf8;
use crate::services::workspace_guard::WorkspaceGuard;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri::State;

pub(crate) fn history_dir(app_handle: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| format!("cache dir error: {error}"))?
        .join("history_v2");
    Ok(crate::services::archive_history::history_path(
        &cache_dir,
        std::path::Path::new(path),
    ))
}

pub(crate) fn history_lease(
    app: &tauri::AppHandle,
) -> Result<crate::services::history_coordination::HistoryLease, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("history_v2");
    crate::services::history_coordination::acquire(&cache)
}

#[tauri::command]
pub async fn save_history_version(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
    content: String,
    max_count: u32,
) -> Result<(), String> {
    let _lease = history_lease(&app_handle)?;
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    save_history(
        &app_handle,
        path.to_string_lossy().as_ref(),
        content,
        max_count,
    )
}

#[tauri::command]
pub async fn save_external_history_version(
    app_handle: tauri::AppHandle,
    access: State<'_, ExternalFileAccess>,
    path: String,
    content: String,
    max_count: u32,
) -> Result<(), String> {
    let _lease = history_lease(&app_handle)?;
    let path = access.resolve_markdown(path)?;
    save_history(
        &app_handle,
        path.to_string_lossy().as_ref(),
        content,
        max_count,
    )
}

fn save_history(
    app_handle: &tauri::AppHandle,
    path: &str,
    content: String,
    max_count: u32,
) -> Result<(), String> {
    let file_history_dir = history_dir(app_handle, path)?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    save_history_in_dir(&file_history_dir, &content, max_count, timestamp)
}

// Caller holds history lease, including path resolution. Timestamp remains seconds
// for compatibility; collisions advance monotonically rather than overwrite.
fn save_history_in_dir(
    file_history_dir: &std::path::Path,
    content: &str,
    max_count: u32,
    timestamp: u64,
) -> Result<(), String> {
    if !file_history_dir.exists() {
        fs::create_dir_all(&file_history_dir).map_err(|error| error.to_string())?;
    }

    let entries: Vec<_> = fs::read_dir(&file_history_dir)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("历史目录读取不完整: {error}"))?;
    let normalized_content = normalize_line_endings(&content);
    for entry in &entries {
        if fs::read_to_string(entry.path())
            .map(|existing| normalize_line_endings(&existing) == normalized_content)
            .unwrap_or(false)
        {
            return Ok(());
        }
    }

    let mut timestamps: Vec<u64> = entries
        .iter()
        .filter_map(|entry| {
            entry
                .path()
                .file_stem()
                .and_then(|stem| stem.to_str())
                .and_then(|stem| stem.parse().ok())
        })
        .collect();

    let timestamp = match timestamps.iter().max() {
        Some(latest) if *latest >= timestamp => latest
            .checked_add(1)
            .ok_or("历史快照编号已达上限，未覆盖原记录")?,
        _ => timestamp,
    };
    crate::services::reliable_write::write_new_bytes(
        file_history_dir.join(format!("{timestamp}.md")),
        content.as_bytes(),
    )?;
    timestamps.push(timestamp);
    if timestamps.len() > max_count as usize {
        timestamps.sort_unstable();
        let remove_count = timestamps.len() - max_count as usize;
        for old_timestamp in timestamps.iter().take(remove_count) {
            let _ = fs::remove_file(file_history_dir.join(format!("{old_timestamp}.md")));
        }
    }
    Ok(())
}

fn normalize_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryComparison {
    content: String,
    disk: String,
    disk_signature: String,
    history_signature: String,
}

fn read_comparison(path: &std::path::Path, history: &std::path::Path, timestamp: u64) -> Result<HistoryComparison, String> {
    fn bounded_read(path: &std::path::Path) -> Result<String, String> {
        use std::io::Read;
        let file = fs::File::open(path).map_err(|e| format!("无法读取对比文件：{e}"))?;
        let mut bytes = Vec::new();
        file.take(20 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if bytes.len() > 20 * 1024 * 1024 { return Err("文件超过 20 MiB，暂不支持完整历史对比".into()); }
        String::from_utf8(bytes).map_err(|_| "历史对比暂仅支持 UTF-8 Markdown".into())
    }
    let snapshot = crate::formats::text::read_text_snapshot(path).map_err(|error| error.message)?;
    let disk = snapshot.content;
    let content = bounded_read(&history.join(format!("{timestamp}.md")))?;
    Ok(HistoryComparison {
        disk_signature: snapshot.content_digest,
        history_signature: format!("{:x}", md5::compute(content.as_bytes())), disk, content,
    })
}

fn checked_comparison(path: &std::path::Path, history: &std::path::Path, timestamp: u64, disk_signature: &str, history_signature: &str) -> Result<HistoryComparison, String> {
    let comparison = read_comparison(path, history, timestamp)?;
    if comparison.disk_signature != disk_signature || comparison.history_signature != history_signature {
        return Err("磁盘文件或历史快照已变化，请重新打开比较后再恢复".into());
    }
    Ok(comparison)
}

#[tauri::command]
pub async fn compare_history_version(app_handle: tauri::AppHandle, library_root: String, path: String, timestamp: u64) -> Result<HistoryComparison, String> {
    let _lease = history_lease(&app_handle)?;
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    read_comparison(&path, &history_dir(&app_handle, &path.to_string_lossy())?, timestamp)
}

fn create_recovery_copy(path: &std::path::Path, content: &str, timestamp: u64) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("文件没有父目录")?;
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    for suffix in 1..=1000 {
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("md");
        let target = parent.join(format!("{stem}-恢复-{timestamp}-{suffix}.{extension}"));
        if target.exists() { continue; }
        match crate::services::reliable_write::write_new_bytes(&target, content.as_bytes()) {
            Ok(()) => return Ok(target),
            Err(error) => return Err(format!("副本创建未确认完成，请检查同目录是否已有该副本后重试：{error}")),
        }
    }
    Err("同名恢复副本过多，请先整理副本".into())
}

#[tauri::command]
pub async fn restore_history_copy(app_handle: tauri::AppHandle, library_root: String, path: String, timestamp: u64, disk_signature: String, history_signature: String) -> Result<String, String> {
    let _lease = history_lease(&app_handle)?;
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    let comparison = checked_comparison(&path, &history_dir(&app_handle, &path.to_string_lossy())?, timestamp, &disk_signature, &history_signature)?;
    Ok(create_recovery_copy(&path, &comparison.content, timestamp)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn prepare_history_restore(app_handle: tauri::AppHandle, library_root: String, path: String, timestamp: u64, disk_signature: String, history_signature: String, current_draft: String, max_count: u32) -> Result<String, String> {
    if current_draft.len() > 20 * 1024 * 1024 { return Err("当前草稿过大，未替换任何内容".into()); }
    let _lease = history_lease(&app_handle)?;
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    let history = history_dir(&app_handle, &path.to_string_lossy())?;
    let comparison = checked_comparison(&path, &history, timestamp, &disk_signature, &history_signature)?;
    // Protection must succeed before the frontend receives replacement content.
    save_history(&app_handle, &path.to_string_lossy(), current_draft, max_count.clamp(2, 1000))?;
    let disk = fs::read(&path).map_err(|e| e.to_string())?;
    if format!("{:x}", md5::compute(&disk)) != disk_signature { return Err("磁盘文件已变化；草稿已保护，但未替换，请重新比较".into()); }
    Ok(comparison.content)
}

#[tauri::command]
pub async fn list_history(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
) -> Result<Vec<(u64, String)>, String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    list_history_for_path(&app_handle, path.to_string_lossy().as_ref())
}

fn list_history_for_path(
    app_handle: &tauri::AppHandle,
    path: &str,
) -> Result<Vec<(u64, String)>, String> {
    let mut versions = Vec::new();
    if let Ok(entries) = fs::read_dir(history_dir(app_handle, path)?) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            let Some(timestamp) = file_path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .and_then(|stem| stem.parse::<u64>().ok())
            else {
                continue;
            };
            if let Ok(content) = fs::read_to_string(file_path) {
                versions.push((timestamp, content));
            }
        }
    }
    versions.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(versions)
}

#[tauri::command]
pub async fn delete_history_version(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
    timestamp: u64,
) -> Result<(), String> {
    let _lease = history_lease(&app_handle)?;
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    let file_path =
        history_dir(&app_handle, path.to_string_lossy().as_ref())?.join(format!("{timestamp}.md"));
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_all_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let _lease = history_lease(&app_handle)?;
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("history_v2");
    crate::services::history_coordination::ensure_clearable(&cache_dir)?;
    if cache_dir.exists() {
        fs::remove_dir_all(cache_dir).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_shadow_copy(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md", "txt"])?;
    let shadow_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("shadow_cache");
    if !shadow_dir.exists() {
        fs::create_dir_all(&shadow_dir).map_err(|error| error.to_string())?;
    }
    let hash = format!("{:x}", md5::compute(path.to_string_lossy().as_bytes()));
    write_utf8(shadow_dir.join(format!("{hash}.md")), &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn text_history_decodes_utf16_and_recovery_keeps_txt_extension() {
        let fixture = HistoryFixture::new();
        let file = fixture.0.join("记录.txt");
        let mut bytes = vec![0xff, 0xfe];
        for word in "今天的记录".encode_utf16() { bytes.extend_from_slice(&word.to_le_bytes()); }
        fs::write(&file, &bytes).unwrap();
        let history = fixture.0.join("history");
        fs::create_dir(&history).unwrap();
        fs::write(history.join("10.md"), "历史文字").unwrap();
        let comparison = read_comparison(&file, &history, 10).unwrap();
        assert_eq!(comparison.disk, "今天的记录");
        assert_eq!(comparison.disk_signature, format!("{:x}", md5::compute(&bytes)));
        let copy = create_recovery_copy(&file, &comparison.content, 10).unwrap();
        assert_eq!(copy.extension().unwrap(), "txt");
        assert_eq!(fs::read_to_string(copy).unwrap(), "历史文字");
        assert_eq!(fs::read(&file).unwrap(), bytes);
    }

    #[test]
    fn history_deduplication_normalizes_line_endings() {
        assert_eq!(normalize_line_endings("a\r\nb\r"), "a\nb\n");
        assert_eq!(normalize_line_endings("a\nb\n"), "a\nb\n");
    }

    struct HistoryFixture(PathBuf);
    impl HistoryFixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "longedit-history-save-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for HistoryFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn history_same_second_preserves_distinct_versions_and_clock_rollback() {
        let f = HistoryFixture::new();
        save_history_in_dir(&f.0, "first", 20, 100).unwrap();
        save_history_in_dir(&f.0, "second", 20, 100).unwrap();
        save_history_in_dir(&f.0, "third", 20, 90).unwrap();
        assert_eq!(fs::read_to_string(f.0.join("100.md")).unwrap(), "first");
        assert_eq!(fs::read_to_string(f.0.join("101.md")).unwrap(), "second");
        assert_eq!(fs::read_to_string(f.0.join("102.md")).unwrap(), "third");
    }

    #[test]
    fn recovery_copy_never_overwrites_original_or_existing_copy() {
        let f = HistoryFixture::new();
        let original = f.0.join("note.md");
        fs::write(&original, "current").unwrap();
        let first = create_recovery_copy(&original, "historical", 10).unwrap();
        let second = create_recovery_copy(&original, "other", 10).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read_to_string(&original).unwrap(), "current");
        assert_eq!(fs::read_to_string(first).unwrap(), "historical");
        assert_eq!(fs::read_to_string(second).unwrap(), "other");
    }

    #[test]
    fn comparison_rejects_changed_disk_and_history() {
        let f = HistoryFixture::new();
        let original = f.0.join("note.md");
        fs::write(&original, "current").unwrap();
        fs::write(f.0.join("10.md"), "historical").unwrap();
        let comparison = read_comparison(&original, &f.0, 10).unwrap();
        assert!(checked_comparison(&original, &f.0, 10, &comparison.disk_signature, &comparison.history_signature).is_ok());
        fs::write(&original, "external change").unwrap();
        assert!(checked_comparison(&original, &f.0, 10, &comparison.disk_signature, &comparison.history_signature).is_err());
        fs::write(&original, "current").unwrap();
        fs::write(f.0.join("10.md"), "changed snapshot").unwrap();
        assert!(checked_comparison(&original, &f.0, 10, &comparison.disk_signature, &comparison.history_signature).is_err());
    }

    #[test]
    fn history_dedup_and_retention_still_work_with_collisions() {
        let f = HistoryFixture::new();
        save_history_in_dir(&f.0, "first\r\n", 2, 100).unwrap();
        save_history_in_dir(&f.0, "first\n", 2, 100).unwrap();
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
        save_history_in_dir(&f.0, "second", 2, 100).unwrap();
        save_history_in_dir(&f.0, "third", 2, 100).unwrap();
        assert!(!f.0.join("100.md").exists());
        assert_eq!(fs::read_to_string(f.0.join("101.md")).unwrap(), "second");
        assert_eq!(fs::read_to_string(f.0.join("102.md")).unwrap(), "third");
    }

    #[test]
    fn history_timestamp_overflow_preserves_existing_snapshot() {
        let f = HistoryFixture::new();
        let existing = f.0.join(format!("{}.md", u64::MAX));
        fs::write(&existing, "keep").unwrap();
        assert!(save_history_in_dir(&f.0, "new", 20, 100).is_err());
        assert_eq!(fs::read_to_string(existing).unwrap(), "keep");
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
    }
}
