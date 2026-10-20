use super::file_management::{OperationResult, PathChange, OPERATIONS};
use crate::services::file_move_journal::MoveFailure;
use crate::services::{file_operation_history as history, workspace_guard::WorkspaceGuard};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    id: String,
    time: u64,
    action: String,
    old_path: String,
    new_path: String,
    target_root: String,
    status: String,
    recovery_id: Option<String>,
    note: String,
    can_restore: bool,
}
#[tauri::command]
pub async fn list_library_file_operations(
    library_root: String,
) -> Result<Vec<HistoryItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        history::list(guard.root()).map(|records| {
            records
                .into_iter()
                .map(|r| HistoryItem {
                    can_restore: history::restorable(&r),
                    id: r.id,
                    time: r.time,
                    action: r.action,
                    old_path: r.old_path.to_string_lossy().into_owned(),
                    new_path: r.new_path.to_string_lossy().into_owned(),
                    target_root: r.target_root.to_string_lossy().into_owned(),
                    status: r.status,
                    recovery_id: r.recovery_id,
                    note: r.note,
                })
                .collect()
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
pub(super) fn restore(
    app: Option<&tauri::AppHandle>,
    guard: &WorkspaceGuard,
    id: &str,
) -> Result<PathChange, MoveFailure> {
    let record = history::check_restore(guard.root(), id)?;
    crate::services::file_move_transaction::execute_recorded(
        app,
        guard,
        &record.new_path,
        &record.old_path,
        Some(record.id),
    )?;
    Ok(PathChange {
        old_path: record.new_path.to_string_lossy().into_owned(),
        new_path: record.old_path.to_string_lossy().into_owned(),
    })
}
#[tauri::command]
pub async fn restore_library_file_operation(
    app_handle: tauri::AppHandle,
    library_root: String,
    operation_id: String,
) -> Result<OperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let _history = super::history::history_lease(&app_handle)?;
        let guard = WorkspaceGuard::new(&library_root)?;
        Ok(OperationResult {
            items: vec![restore(Some(&app_handle), &guard, &operation_id).map_err(|e| e.message)?],
            errors: vec![],
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn clear_library_file_operations(library_root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATIONS.lock().unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(&library_root)?;
        history::clear_completed(guard.root())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn locate_library_file_operation(
    library_root: String,
    operation_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        history::locate(guard.root(), &operation_id).map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{file_move_transaction, test_workspace::TestWorkspace};
    use std::fs;
    fn moved() -> (TestWorkspace, WorkspaceGuard, String) {
        let f = TestWorkspace::new();
        fs::write(f.0.join("原笔记.md"), "# 原文\n").unwrap();
        fs::create_dir(f.0.join("整理")).unwrap();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        file_move_transaction::execute(
            None,
            &guard,
            &f.0.join("原笔记.md"),
            &f.0.join("整理/笔记.md"),
        )
        .unwrap();
        let records = history::list(guard.root()).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].status, "completed");
        (f, guard, records[0].id.clone())
    }
    #[test]
    fn completed_move_survives_reload_and_restore_is_idempotent() {
        let (f, guard, id) = moved();
        let reloaded = WorkspaceGuard::new(&f.0).unwrap();
        assert_eq!(
            history::locate(reloaded.root(), &id).unwrap(),
            f.0.join("整理/笔记.md")
        );
        restore(None, &guard, &id).unwrap();
        assert_eq!(
            fs::read_to_string(f.0.join("原笔记.md")).unwrap(),
            "# 原文\n"
        );
        assert!(!f.0.join("整理/笔记.md").exists());
        assert!(restore(None, &guard, &id).is_err());
        assert_eq!(
            history::list(guard.root())
                .unwrap()
                .iter()
                .find(|r| r.id == id)
                .unwrap()
                .status,
            "restored"
        );
        assert_eq!(
            history::locate(guard.root(), &id).unwrap(),
            f.0.join("原笔记.md")
        );
    }
    #[test]
    fn later_content_and_occupied_original_are_never_overwritten() {
        let (f, guard, id) = moved();
        fs::write(f.0.join("整理/笔记.md"), "后来写的正文").unwrap();
        assert!(restore(None, &guard, &id)
            .unwrap_err()
            .message
            .contains("后续修改"));
        assert_eq!(
            fs::read_to_string(f.0.join("整理/笔记.md")).unwrap(),
            "后来写的正文"
        );
        fs::write(f.0.join("整理/笔记.md"), "# 原文\n").unwrap();
        fs::write(f.0.join("原笔记.md"), "新建的同名笔记").unwrap();
        assert!(restore(None, &guard, &id)
            .unwrap_err()
            .message
            .contains("同名"));
        assert_eq!(
            fs::read_to_string(f.0.join("原笔记.md")).unwrap(),
            "新建的同名笔记"
        );
    }
    #[test]
    fn renamed_folder_keeps_links_and_refuses_to_erase_later_reference_edits() {
        let f = TestWorkspace::new();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        fs::create_dir(f.0.join("附件")).unwrap();
        fs::write(f.0.join("附件/图.png"), b"png").unwrap();
        fs::write(f.0.join("阅读.md"), "![图](附件/图.png)\n").unwrap();
        file_move_transaction::execute(None, &guard, &f.0.join("附件"), &f.0.join("素材")).unwrap();
        let id = history::list(guard.root()).unwrap()[0].id.clone();
        let rewritten = fs::read_to_string(f.0.join("阅读.md")).unwrap();
        assert!(rewritten.contains("%E7%B4%A0%E6%9D%90/%E5%9B%BE.png"));
        fs::write(f.0.join("阅读.md"), format!("{rewritten}后来补充\n")).unwrap();
        assert!(restore(None, &guard, &id)
            .unwrap_err()
            .message
            .contains("后续修改"));
        assert!(fs::read_to_string(f.0.join("阅读.md"))
            .unwrap()
            .contains("后来补充"));
    }
    #[test]
    fn restore_rewrites_current_links_instead_of_restoring_old_document_bytes() {
        let f = TestWorkspace::new();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        fs::write(f.0.join("a.md"), "正文\n").unwrap();
        file_move_transaction::execute(None, &guard, &f.0.join("a.md"), &f.0.join("b.md")).unwrap();
        let id = history::list(guard.root()).unwrap()[0].id.clone();
        fs::write(f.0.join("后来.md"), "后来新增 [参考](b.md)\n").unwrap();
        restore(None, &guard, &id).unwrap();
        assert_eq!(
            fs::read_to_string(f.0.join("后来.md")).unwrap(),
            "后来新增 [参考](a.md)\n"
        );
    }
    #[test]
    fn each_item_restores_independently_and_location_follows_later_moves() {
        let (f, guard, id) = moved();
        fs::write(f.0.join("another.md"), "另一个").unwrap();
        file_move_transaction::execute(
            None,
            &guard,
            &f.0.join("another.md"),
            &f.0.join("second.md"),
        )
        .unwrap();
        let second = history::list(guard.root())
            .unwrap()
            .into_iter()
            .find(|r| r.old_path.ends_with("another.md"))
            .unwrap()
            .id;
        restore(None, &guard, &id).unwrap();
        assert!(history::check_restore(guard.root(), &second).is_ok());
        file_move_transaction::execute(None, &guard, &f.0.join("second.md"), &f.0.join("third.md"))
            .unwrap();
        assert_eq!(
            history::locate(guard.root(), &second).unwrap(),
            f.0.join("third.md")
        );
        assert!(restore(None, &guard, &second).is_err());
        assert!(f.0.join("third.md").exists());
    }
    #[test]
    fn clear_preserves_pending_records_and_never_removes_files() {
        let (f, guard, id) = moved();
        history::begin(
            guard.root(),
            "pending-test",
            &f.0.join("整理/笔记.md"),
            &f.0.join("待核对.md"),
            guard.root(),
            Some("links-test".into()),
            Some(id.clone()),
        )
        .unwrap();
        history::clear_completed(guard.root()).unwrap();
        let records = history::list(guard.root()).unwrap();
        assert!(records.iter().any(|r| r.id == "pending-test"));
        assert!(records.iter().any(|r| r.id == id));
        assert!(f.0.join("整理/笔记.md").exists());
    }
    #[test]
    fn copy_is_view_only_and_locates_target_library_after_restart() {
        let f = TestWorkspace::new();
        let t = TestWorkspace::new();
        fs::write(f.0.join("a.md"), "source").unwrap();
        fs::write(t.0.join("copy.md"), "copy").unwrap();
        history::begin(
            &f.0,
            "copy-test",
            &f.0.join("a.md"),
            &t.0.join("copy.md"),
            &t.0,
            None,
            None,
        )
        .unwrap();
        history::finish(&f.0, "copy-test", true, &[]).unwrap();
        assert!(!history::restorable(&history::list(&f.0).unwrap()[0]));
        assert!(history::check_restore(&f.0, "copy-test").is_err());
        assert_eq!(
            history::locate(&f.0, "copy-test").unwrap(),
            t.0.join("copy.md")
        );
        history::clear_completed(&f.0).unwrap();
        assert!(t.0.join("copy.md").exists());
        assert!(f.0.join("a.md").exists());
    }
    #[test]
    fn unchanged_folder_restore_keeps_image_bytes_and_reconnects_references() {
        let f = TestWorkspace::new();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        fs::create_dir(f.0.join("assets-original")).unwrap();
        fs::write(f.0.join("assets-original/image.png"), b"exact image bytes").unwrap();
        fs::write(
            f.0.join("note.md"),
            "![image](assets-original/image.png)\r\n",
        )
        .unwrap();
        file_move_transaction::execute(
            None,
            &guard,
            &f.0.join("assets-original"),
            &f.0.join("assets-new"),
        )
        .unwrap();
        let id = history::list(guard.root()).unwrap()[0].id.clone();
        restore(None, &guard, &id).unwrap();
        assert_eq!(
            fs::read(f.0.join("assets-original/image.png")).unwrap(),
            b"exact image bytes"
        );
        assert_eq!(
            fs::read_to_string(f.0.join("note.md")).unwrap(),
            "![image](assets-original/image.png)\r\n"
        );
    }
    #[test]
    fn new_folder_children_block_restore_without_removing_them() {
        let f = TestWorkspace::new();
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        fs::create_dir(f.0.join("old-folder")).unwrap();
        file_move_transaction::execute(
            None,
            &guard,
            &f.0.join("old-folder"),
            &f.0.join("new-folder"),
        )
        .unwrap();
        let id = history::list(guard.root()).unwrap()[0].id.clone();
        fs::write(f.0.join("new-folder/later.txt"), "later bytes").unwrap();
        assert!(restore(None, &guard, &id)
            .unwrap_err()
            .message
            .contains("后续修改"));
        assert_eq!(
            fs::read_to_string(f.0.join("new-folder/later.txt")).unwrap(),
            "later bytes"
        );
    }
    #[test]
    fn restore_recreates_missing_original_parent_without_extra_user_steps() {
        let f = TestWorkspace::new(); let guard = WorkspaceGuard::new(&f.0).unwrap();
        fs::create_dir(f.0.join("before")).unwrap();
        fs::create_dir(f.0.join("after")).unwrap();
        fs::write(f.0.join("before/note.txt"), "preserved bytes").unwrap();
        file_move_transaction::execute(None, &guard, &f.0.join("before/note.txt"), &f.0.join("after/note.txt")).unwrap();
        let id = history::list(guard.root()).unwrap()[0].id.clone();
        fs::remove_dir(f.0.join("before")).unwrap();
        restore(None, &guard, &id).unwrap();
        assert_eq!(fs::read_to_string(f.0.join("before/note.txt")).unwrap(), "preserved bytes");
        assert!(!f.0.join("after/note.txt").exists());
    }
}
