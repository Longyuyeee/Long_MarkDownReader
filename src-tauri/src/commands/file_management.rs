use crate::services::{reliable_write::write_utf8, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub(super) static OPERATIONS: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathChange {
    pub old_path: String,
    pub new_path: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationError {
    pub path: String,
    pub message: String,
}
#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub items: Vec<PathChange>,
    pub errors: Vec<OperationError>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub id: String,
    pub original_path: String,
    pub name: String,
    pub deleted_at: u64,
    pub is_dir: bool,
}

pub(super) fn visible_item(guard: &WorkspaceGuard, input: &str, existing: bool) -> Result<PathBuf, String> {
    let path = if existing {
        guard.resolve_existing(input)?
    } else {
        guard.resolve_for_write(input)?
    };
    let relative = path.strip_prefix(guard.root()).map_err(|e| e.to_string())?;
    if relative.as_os_str().is_empty()
        || relative.components().any(|c| {
            let name = c.as_os_str().to_string_lossy();
            name.eq_ignore_ascii_case(".longedit") || name.eq_ignore_ascii_case(".misty_order.json")
        })
    {
        return Err("不能操作资料库根目录或内部配置文件".into());
    }
    Ok(path)
}

fn selected_sources(guard: &WorkspaceGuard, paths: &[String]) -> Result<Vec<PathBuf>, String> {
    let mut all = Vec::new();
    for path in paths {
        let path = visible_item(guard, path, true)?;
        if !all.contains(&path) {
            all.push(path);
        }
    }
    Ok(all
        .iter()
        .filter(|path| {
            !all.iter()
                .any(|parent| *path != parent && path.starts_with(parent))
        })
        .cloned()
        .collect())
}

fn available_copy_name(target: &Path, source: &Path) -> Result<PathBuf, String> {
    let name = source.file_name().ok_or("文件名不可用")?.to_string_lossy();
    // Compound extensions (e.g. .table.json) must retain their format identity.
    let suffix = if source.is_dir() {
        String::new()
    } else {
        crate::formats::file_registry::file_format_for_path(source)
            .ok()
            .and_then(|format| {
                format
                    .extensions
                    .iter()
                    .filter(|extension| name.to_lowercase().ends_with(extension.as_str()))
                    .max_by_key(|extension| extension.len())
                    .cloned()
            })
            .or_else(|| {
                source
                    .extension()
                    .map(|ext| format!(".{}", ext.to_string_lossy()))
            })
            .unwrap_or_default()
    };
    let stem = &name[..name.len() - suffix.len()];
    for n in 1..=10000 {
        let counter = if n == 1 {
            String::new()
        } else {
            format!(" {n}")
        };
        let candidate = target.join(format!("{stem} - 副本{counter}{suffix}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("同名副本过多，请选择其他目录".into())
}

fn copy_tree(source: &Path, target: &Path, created: &mut bool) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("此项是目录链接，请复制实际文件夹".into());
    }
    if metadata.is_dir() {
        fs::create_dir(target).map_err(|e| e.to_string())?;
        *created = true;
        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(".longedit")
            {
                continue;
            }
            copy_tree(&entry.path(), &target.join(entry.file_name()), &mut false)?;
        }
    } else {
        let mut input = fs::File::open(source).map_err(|e| e.to_string())?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(|e| e.to_string())?;
        *created = true;
        std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn history_files(path: &Path) -> Vec<PathBuf> {
    if path.is_file() {
        return vec![path.to_path_buf()];
    }
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|kind| !kind.is_symlink()) {
                files.extend(history_files(&entry.path()));
            }
        }
    }
    files
}

pub(super) fn move_to(
    app: Option<&tauri::AppHandle>,
    guard: &WorkspaceGuard,
    old: &Path,
    new: &Path,
) -> Result<(), String> {
    if new.exists() {
        return Err("目标位置已有同名项，请先移开后再恢复或撤销".into());
    }
    if new.starts_with(old) {
        return Err("不能移动到自身或子文件夹".into());
    }
    let files = if app.is_some() {
        history_files(old)
    } else {
        Vec::new()
    };
    super::file_relations::rename_with_relations(guard.root(), old, new)?;
    if let Some(app) = app {
        for file in files {
            let next = if file == old {
                new.to_path_buf()
            } else {
                new.join(file.strip_prefix(old).map_err(|e| e.to_string())?)
            };
            if let (Ok(history), Ok(destination)) = (
                super::history::history_dir(app, &file.to_string_lossy()),
                super::history::history_dir(app, &next.to_string_lossy()),
            ) {
                if history.exists() {
                    let _ = fs::rename(history, destination);
                }
            }
        }
    }
    Ok(())
}

fn transfer(
    app: Option<&tauri::AppHandle>,
    library_root: &str,
    paths: &[String],
    target_dir: Option<&str>,
    operation: &str,
) -> Result<OperationResult, String> {
    if !matches!(operation, "move" | "copy") {
        return Err("未知文件操作".into());
    }
    let guard = WorkspaceGuard::new(library_root)?;
    let sources = selected_sources(&guard, paths)?;
    let target = target_dir
        .map(|path| guard.resolve_directory(path, true))
        .transpose()?;
    if let Some(target) = &target {
        if target
            .strip_prefix(guard.root())
            .map_err(|e| e.to_string())?
            .components()
            .any(|c| {
                c.as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(".longedit")
            })
        {
            return Err("请选择普通文件夹".into());
        }
        if sources
            .iter()
            .any(|source| source.is_dir() && target.starts_with(source))
        {
            return Err("不能放到自身或子文件夹中".into());
        }
        fs::create_dir_all(target).map_err(|e| format!("无法创建目标目录：{e}"))?;
    }
    let mut result = OperationResult::default();
    for source in sources {
        let attempt = (|| {
            let directory = target
                .as_deref()
                .unwrap_or_else(|| source.parent().unwrap());
            let mut destination = directory.join(source.file_name().ok_or("文件名不可用")?);
            if operation == "move" && destination == source {
                return Ok(None);
            }
            if destination.exists() {
                destination = available_copy_name(directory, &source)?;
            }
            if operation == "copy" {
                let mut created = false;
                if let Err(error) = copy_tree(&source, &destination, &mut created) {
                    // Remove only the newly created candidate, never an existing user item.
                    if created {
                        if destination.is_dir() {
                            let _ = fs::remove_dir_all(&destination);
                        } else {
                            let _ = fs::remove_file(&destination);
                        }
                    }
                    return Err(error);
                }
            } else {
                move_to(app, &guard, &source, &destination)?;
            }
            Ok(Some(PathChange {
                old_path: source.to_string_lossy().into_owned(),
                new_path: destination.to_string_lossy().into_owned(),
            }))
        })();
        match attempt {
            Ok(Some(item)) => result.items.push(item),
            Ok(None) => {}
            Err(message) => result.errors.push(OperationError {
                path: source.to_string_lossy().into_owned(),
                message,
            }),
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn transfer_library_items(
    app_handle: tauri::AppHandle,
    library_root: String,
    paths: Vec<String>,
    target_dir: Option<String>,
    operation: String,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let _history = super::history::history_lease(&app_handle)?;
        transfer(
            Some(&app_handle),
            &library_root,
            &paths,
            target_dir.as_deref(),
            &operation,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn undo_library_moves(
    app_handle: tauri::AppHandle,
    library_root: String,
    items: Vec<PathChange>,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let _history = super::history::history_lease(&app_handle)?;
        let guard = WorkspaceGuard::new(&library_root)?;
        let mut result = OperationResult::default();
        for item in items.into_iter().rev() {
            let attempt = (|| {
                let current = visible_item(&guard, &item.new_path, true)?;
                let original = visible_item(&guard, &item.old_path, false)?;
                fs::create_dir_all(original.parent().ok_or("原目录不可用")?)
                    .map_err(|e| e.to_string())?;
                move_to(Some(&app_handle), &guard, &current, &original)?;
                Ok(PathChange {
                    old_path: item.new_path.clone(),
                    new_path: item.old_path.clone(),
                })
            })();
            match attempt {
                Ok(change) => result.items.push(change),
                Err(message) => result.errors.push(OperationError {
                    path: item.new_path,
                    message,
                }),
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn trash_root(guard: &WorkspaceGuard) -> Result<PathBuf, String> {
    guard.resolve_directory(".longedit/trash", true)
}
fn trash_slot(guard: &WorkspaceGuard, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("回收项标识无效".into());
    }
    guard.resolve_directory(trash_root(guard)?.join(id), true)
}
fn trash_items(library_root: &str, paths: &[String]) -> Result<OperationResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let sources = selected_sources(&guard, paths)?;
    let mut result = OperationResult::default();
    for (index, source) in sources.iter().enumerate() {
        let attempt = (|| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?;
            let id = format!("{}-{}-{index}", now.as_nanos(), std::process::id());
            let slot = trash_slot(&guard, &id)?;
            fs::create_dir_all(&slot).map_err(|e| e.to_string())?;
            let entry = TrashEntry {
                id,
                original_path: source
                    .strip_prefix(guard.root())
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/"),
                name: source.file_name().unwrap().to_string_lossy().into_owned(),
                deleted_at: now.as_secs(),
                is_dir: source.is_dir(),
            };
            write_utf8(
                slot.join("entry.json"),
                &serde_json::to_string(&entry).map_err(|e| e.to_string())?,
            )?;
            let payload = slot.join("content");
            // Preserve links, display preferences and history at the original identity.
            fs::rename(source, &payload).map_err(|e| e.to_string())?;
            Ok(PathChange {
                old_path: source.to_string_lossy().into_owned(),
                new_path: entry.id,
            })
        })();
        match attempt {
            Ok(item) => result.items.push(item),
            Err(message) => result.errors.push(OperationError {
                path: source.to_string_lossy().into_owned(),
                message,
            }),
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn trash_library_items(
    library_root: String,
    paths: Vec<String>,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        trash_items(&library_root, &paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_library_trash(library_root: String) -> Result<Vec<TrashEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(library_root)?;
        let root = trash_root(&guard)?;
        if !root.exists() {
            return Ok(Vec::new());
        }
        let mut items = Vec::new();
        for directory in fs::read_dir(root).map_err(|e| e.to_string())? {
            let directory = directory.map_err(|e| e.to_string())?;
            let id = directory.file_name().to_string_lossy().into_owned();
            let slot = trash_slot(&guard, &id)?;
            if !slot.join("content").exists() {
                continue;
            }
            let entry: TrashEntry = serde_json::from_str(
                &fs::read_to_string(slot.join("entry.json"))
                    .map_err(|e| format!("回收项无法读取：{e}"))?,
            )
            .map_err(|e| e.to_string())?;
            if entry.id != id {
                return Err("回收项信息不匹配".into());
            }
            items.push(entry);
        }
        items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn restore_items(library_root: &str, ids: &[String]) -> Result<OperationResult, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let mut result = OperationResult::default();
    for id in ids {
        let attempt = (|| {
            let slot = trash_slot(&guard, id)?;
            let entry: TrashEntry = serde_json::from_str(
                &fs::read_to_string(slot.join("entry.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let original = visible_item(&guard, &entry.original_path, false)?;
            if original.exists() {
                return Err("原位置已有同名项，请先移开后再恢复".into());
            }
            fs::create_dir_all(original.parent().ok_or("原目录不可用")?)
                .map_err(|e| e.to_string())?;
            let payload = guard.resolve_existing(slot.join("content"))?;
            fs::rename(payload, &original).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(slot.join("entry.json"));
            let _ = fs::remove_dir(slot);
            Ok(PathChange {
                old_path: id.clone(),
                new_path: original.to_string_lossy().into_owned(),
            })
        })();
        match attempt {
            Ok(item) => result.items.push(item),
            Err(message) => result.errors.push(OperationError {
                path: id.clone(),
                message,
            }),
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn restore_library_trash(
    library_root: String,
    ids: Vec<String>,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        restore_items(&library_root, &ids)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn purge_library_trash(library_root: String, ids: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(library_root)?;
        for id in ids {
            let slot = trash_slot(&guard, &id)?;
            if slot.exists() {
                fs::remove_dir_all(slot).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let root = std::env::temp_dir().join(format!(
            "longedit-file-manager-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn copies_keep_source_compound_extensions_and_existing_destinations() {
        let root = fixture();
        fs::write(root.join("数据.table.json"), "original").unwrap();
        let result = transfer(
            None,
            root.to_str().unwrap(),
            &["数据.table.json".into()],
            None,
            "copy",
        )
        .unwrap();
        assert!(result.errors.is_empty());
        assert!(result.items[0].new_path.ends_with("数据 - 副本.table.json"));
        assert_eq!(
            fs::read(root.join("数据.table.json")).unwrap(),
            fs::read(&result.items[0].new_path).unwrap()
        );
        let copied = transfer(
            None,
            root.to_str().unwrap(),
            &["数据.table.json".into()],
            Some("新目录/子目录"),
            "copy",
        )
        .unwrap();
        assert!(copied.errors.is_empty());
        let again = transfer(
            None,
            root.to_str().unwrap(),
            &["数据.table.json".into()],
            Some("新目录/子目录"),
            "copy",
        )
        .unwrap();
        assert!(again.items[0].new_path.ends_with("数据 - 副本.table.json"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn folders_copy_once_and_cannot_copy_into_themselves() {
        let root = fixture();
        fs::create_dir(root.join("资料")).unwrap();
        fs::write(root.join("资料/笔记.md"), "note").unwrap();
        let result = transfer(
            None,
            root.to_str().unwrap(),
            &["资料".into(), "资料/笔记.md".into()],
            Some("目标"),
            "copy",
        )
        .unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(
            fs::read_to_string(root.join("目标/资料/笔记.md")).unwrap(),
            "note"
        );
        assert!(transfer(
            None,
            root.to_str().unwrap(),
            &["资料".into()],
            Some("资料/内部"),
            "copy"
        )
        .is_err());
        assert!(!root.join("资料/内部").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn recycle_and_restore_keep_shared_assets_and_survive_reopening() {
        let root = fixture();
        fs::write(root.join("笔记.md"), "![shared](image.png)").unwrap();
        fs::write(root.join("image.png"), b"shared").unwrap();
        let result = trash_items(root.to_str().unwrap(), &["笔记.md".into()]).unwrap();
        assert!(!root.join("笔记.md").exists());
        assert!(root.join("image.png").exists());
        let id = result.items[0].new_path.clone();
        fs::write(root.join("笔记.md"), "replacement").unwrap();
        let blocked = restore_items(root.to_str().unwrap(), &[id.clone()]).unwrap();
        assert_eq!(blocked.errors.len(), 1);
        assert_eq!(
            fs::read_to_string(root.join("笔记.md")).unwrap(),
            "replacement"
        );
        fs::remove_file(root.join("笔记.md")).unwrap();
        let restored = restore_items(root.to_str().unwrap(), &[id]).unwrap();
        assert!(restored.errors.is_empty());
        assert_eq!(
            fs::read_to_string(root.join("笔记.md")).unwrap(),
            "![shared](image.png)"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn moves_keep_existing_targets_and_undo_destinations_are_checked() {
        let root = fixture();
        fs::create_dir(root.join("目标")).unwrap();
        fs::write(root.join("目标/a.md"), "old").unwrap();
        fs::write(root.join("a.md"), "new").unwrap();
        let result = transfer(
            None,
            root.to_str().unwrap(),
            &["a.md".into()],
            Some("目标"),
            "move",
        )
        .unwrap();
        assert!(result.errors.is_empty());
        assert!(result.items[0].new_path.ends_with("a - 副本.md"));
        assert_eq!(fs::read_to_string(root.join("目标/a.md")).unwrap(), "old");
        let guard = WorkspaceGuard::new(&root).unwrap();
        move_to(
            None,
            &guard,
            Path::new(&result.items[0].new_path),
            &guard.resolve_for_write("a.md").unwrap(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "new");
        assert!(transfer(
            None,
            root.to_str().unwrap(),
            &[".longedit".into()],
            None,
            "copy"
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn move_recycle_and_restore_preserve_cross_format_relations() {
        let root = fixture();
        let library = root.to_string_lossy().into_owned();
        fs::write(root.join("依据.pdf"), b"pdf").unwrap();
        fs::write(root.join("数据.csv"), b"csv").unwrap();
        tauri::async_runtime::block_on(super::super::file_relations::save_file_relation(
            library.clone(),
            "依据.pdf".into(),
            "数据.csv".into(),
            "related".into(),
            "参考".into(),
        ))
        .unwrap();
        let moved = transfer(None, &library, &["依据.pdf".into()], Some("项目"), "move").unwrap();
        assert_eq!(
            tauri::async_runtime::block_on(super::super::file_relations::list_file_relations(
                library.clone(),
                moved.items[0].new_path.clone()
            ))
            .unwrap()
            .len(),
            1
        );
        let deleted = trash_items(&library, &[moved.items[0].new_path.clone()]).unwrap();
        let listed = tauri::async_runtime::block_on(list_library_trash(library.clone())).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].original_path, "项目/依据.pdf");
        let restored = restore_items(&library, &[deleted.items[0].new_path.clone()]).unwrap();
        assert!(restored.errors.is_empty());
        assert_eq!(
            tauri::async_runtime::block_on(super::super::file_relations::list_file_relations(
                library,
                restored.items[0].new_path.clone()
            ))
            .unwrap()
            .len(),
            1
        );
        assert_eq!(fs::read(root.join("项目/依据.pdf")).unwrap(), b"pdf");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn purging_only_removes_the_selected_recycle_entry() {
        let root = fixture();
        let library = root.to_string_lossy().into_owned();
        fs::write(root.join("a.md"), "a").unwrap();
        fs::write(root.join("b.md"), "b").unwrap();
        let recycled = trash_items(&library, &["a.md".into()]).unwrap();
        tauri::async_runtime::block_on(purge_library_trash(
            library.clone(),
            vec![recycled.items[0].new_path.clone()],
        ))
        .unwrap();
        assert!(tauri::async_runtime::block_on(list_library_trash(library))
            .unwrap()
            .is_empty());
        assert!(!root.join("a.md").exists());
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "b");
        fs::remove_dir_all(root).unwrap();
    }
}
