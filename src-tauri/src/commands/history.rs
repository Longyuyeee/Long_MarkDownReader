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
    let file_hash = format!("{:x}", md5::compute(path));
    Ok(cache_dir.join(file_hash))
}

#[tauri::command]
pub async fn save_history_version(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
    content: String,
    max_count: u32,
) -> Result<(), String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md"])?;
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
    if !file_history_dir.exists() {
        fs::create_dir_all(&file_history_dir).map_err(|error| error.to_string())?;
    }

    let entries: Vec<_> = fs::read_dir(&file_history_dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect();
    let normalized_content = normalize_line_endings(&content);
    for entry in &entries {
        if fs::read_to_string(entry.path())
            .map(|existing| normalize_line_endings(&existing) == normalized_content)
            .unwrap_or(false)
        {
            return Ok(());
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
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

    write_utf8(file_history_dir.join(format!("{timestamp}.md")), &content)?;
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

#[tauri::command]
pub async fn list_history(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
) -> Result<Vec<(u64, String)>, String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md"])?;
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
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md"])?;
    let file_path =
        history_dir(&app_handle, path.to_string_lossy().as_ref())?.join(format!("{timestamp}.md"));
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_all_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("history_v2");
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
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md"])?;
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
    fn history_deduplication_normalizes_line_endings() {
        assert_eq!(normalize_line_endings("a\r\nb\r"), "a\nb\n");
        assert_eq!(normalize_line_endings("a\nb\n"), "a\nb\n");
    }
}
