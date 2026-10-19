//! Conflict actions never overwrite the original file. The UI applies a returned
//! disk snapshot only if its captured editor and draft still belong to the action.
use crate::formats::text::{
    encode_text_for_save, read_text_snapshot_with_options, verify_current_signature,
    TextDocumentSnapshot, TextReadOptions, TextSavePolicy,
};
use crate::services::{
    external_file_access::ExternalFileAccess, reliable_write::write_new_bytes,
    workspace_guard::WorkspaceGuard,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictResult {
    snapshot: TextDocumentSnapshot,
    copy_path: Option<String>,
}

fn resolve_in_dir(
    path: &Path,
    history: &Path,
    expected: &str,
    draft: &str,
    action: &str,
    read_options: Option<TextReadOptions>,
    save_policy: Option<TextSavePolicy>,
) -> Result<ConflictResult, String> {
    if draft.len() > 20 * 1024 * 1024
        || fs::metadata(path).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024
    {
        return Err("内容较大，未替换或保存任何内容；请先保留草稿".into());
    }
    let snapshot = read_text_snapshot_with_options(path, read_options).map_err(|e| e.message)?;
    if snapshot.signature != expected {
        return Err("磁盘内容再次变化，请重新比较。当前草稿仍保留。".into());
    }
    let copy_path = match action {
        "reload" => {
            // Fail closed if the draft cannot be retained, including an empty draft.
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs();
            super::history::save_history_in_dir(history, draft, u32::MAX, now)?;
            verify_current_signature(path, Some(expected)).map_err(|e| e.message)?;
            None
        }
        "copy" => {
            let policy = save_policy.unwrap_or(TextSavePolicy {
                expected_signature: None,
                encoding: None,
                bom: None,
                line_ending: None,
                has_final_newline: Some(draft.ends_with(['\n', '\r'])),
            });
            let encoded = encode_text_for_save(&snapshot, draft, policy).map_err(|e| e.message)?;
            Some(
                create_copy(path, &encoded.bytes)?
                    .to_string_lossy()
                    .into_owned(),
            )
        }
        _ => return Err("未知冲突操作，文件未修改".into()),
    };
    Ok(ConflictResult {
        snapshot,
        copy_path,
    })
}

fn create_copy(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("文件没有父目录")?;
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path.extension().unwrap_or_default().to_string_lossy();
    for index in 1..=1000 {
        let candidate = parent.join(format!("{stem}-当前副本{index}.{ext}"));
        if candidate.try_exists().map_err(|e| e.to_string())? {
            continue;
        }
        write_new_bytes(&candidate, bytes)
            .map_err(|e| format!("副本创建未确认完成，请先检查同目录文件：{e}"))?;
        return Ok(candidate);
    }
    Err("同名副本过多，请先整理副本".into())
}

#[tauri::command]
pub async fn resolve_text_conflict(
    app_handle: tauri::AppHandle,
    access: State<'_, ExternalFileAccess>,
    library_root: Option<String>,
    path: String,
    expected_signature: String,
    current_draft: String,
    action: String,
    read_options: Option<TextReadOptions>,
    save_policy: Option<TextSavePolicy>,
) -> Result<ConflictResult, String> {
    let external = library_root.is_none();
    let path = if let Some(root) = library_root {
        WorkspaceGuard::new(root)?.resolve_existing_file(path, &["md", "markdown", "txt", "json", "jsonc", "yaml", "yml", "xml", "svg", "toml"])?
    } else {
        access.resolve_editable(path)?
    };
    let format = crate::formats::file_registry::file_format_for_path(&path)?;
    if matches!(format.id.as_str(), "json" | "jsonc" | "yaml" | "xml" | "svg" | "toml") {
        let parent = path.parent().ok_or("文件目录不可用")?;
        let _document = crate::services::document_coordination::acquire(&[parent])?;
        let result = resolve_structured(&path, &expected_signature, &current_draft, &action, read_options)?;
        if external {
            if let Some(ref copy) = result.copy_path { access.authorize_editable(copy)?; }
        }
        return Ok(result);
    }
    if !matches!(format.id.as_str(), "markdown" | "plain-text") {
        return Err("此冲突处理适用于 Markdown 和 TXT".into());
    }
    let parent = path.parent().ok_or("文件目录不可用")?;
    let _document = crate::services::document_coordination::acquire(&[parent])?;
    let _history = super::history::history_lease(&app_handle)?;
    let history = super::history::history_dir(&app_handle, &path.to_string_lossy())?;
    let mut result = resolve_in_dir(
        &path,
        &history,
        &expected_signature,
        &current_draft,
        &action,
        read_options,
        save_policy,
    )?;
    // External editors have no library history browser. Keep the protected draft
    // discoverable next to the original rather than only in an app cache.
    if external && action == "reload" {
        result.copy_path = Some(
            create_copy(&path, current_draft.as_bytes())?
                .to_string_lossy()
                .into_owned(),
        );
    }
    if external {
        if let Some(ref copy) = result.copy_path {
            access.authorize_editable(copy)?;
        }
    }
    Ok(result)
}

// Structured editors have no text-history browser. Preserve the exact draft
// characters in a discoverable UTF-8 sibling, including invalid/empty drafts.
fn resolve_structured(path: &Path, expected: &str, draft: &str, action: &str, options: Option<TextReadOptions>) -> Result<ConflictResult, String> {
    if !matches!(action, "copy" | "reload") { return Err("未知冲突操作，文件未修改".into()); }
    if draft.len() > 20 * 1024 * 1024 || fs::metadata(path).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 {
        return Err("内容较大，未替换或保存任何内容；请先保留草稿".into());
    }
    let snapshot = read_text_snapshot_with_options(path, options).map_err(|e| e.message)?;
    if snapshot.signature != expected { return Err("磁盘内容再次变化，请重新比较。当前草稿仍保留。".into()); }
    let copy = create_copy(path, draft.as_bytes())?;
    verify_current_signature(path, Some(expected)).map_err(|e| e.message)?;
    Ok(ConflictResult { snapshot, copy_path: Some(copy.to_string_lossy().into_owned()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "longedit-conflict-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn structured_conflicts_keep_exact_drafts_and_never_overwrite_the_source() {
        let fixture = Fixture::new();
        for extension in ["json", "jsonc", "yaml", "xml", "toml", "svg"] {
            let path = fixture.path().join(format!("配置.{extension}"));
            let disk = "原件\r\n保持不变";
            fs::write(&path, disk).unwrap();
            let signature = read_text_snapshot_with_options(&path, None).unwrap().signature;
            for (draft, action) in [("未保存😀\nINVALID\n", "copy"), ("", "reload")] {
                let result = resolve_structured(&path, &signature, draft, action, None).unwrap();
                assert_eq!(result.snapshot.content, disk);
                assert_eq!(fs::read_to_string(result.copy_path.unwrap()).unwrap(), draft);
                assert_eq!(fs::read_to_string(&path).unwrap(), disk);
            }
        }
    }
    #[test]
    fn structured_conflicts_reject_stale_disk_and_unknown_actions_before_creating_a_copy() {
        let fixture = Fixture::new();
        let path = fixture.path().join("config.json");
        fs::write(&path, "{}").unwrap();
        let signature = read_text_snapshot_with_options(&path, None).unwrap().signature;
        fs::write(&path, "{\"peer\":true}").unwrap();
        assert!(resolve_structured(&path, &signature, "draft", "reload", None).is_err());
        assert!(resolve_structured(&path, &signature, "draft", "overwrite", None).is_err());
        assert_eq!(fs::read_dir(fixture.path()).unwrap().count(), 1);
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"peer\":true}");
    }
    #[test]
    fn structured_conflict_copy_keeps_existing_sibling_and_rejects_oversize_draft() {
        let fixture = Fixture::new();
        let path = fixture.path().join("config.toml");
        fs::write(&path, "value = 1").unwrap();
        fs::write(fixture.path().join("config-当前副本1.toml"), "keep").unwrap();
        let signature = read_text_snapshot_with_options(&path, None).unwrap().signature;
        let result = resolve_structured(&path, &signature, "value = 2", "copy", None).unwrap();
        assert!(result.copy_path.unwrap().ends_with("config-当前副本2.toml"));
        assert_eq!(fs::read_to_string(fixture.path().join("config-当前副本1.toml")).unwrap(), "keep");
        assert!(resolve_structured(&path, &signature, &"x".repeat(20 * 1024 * 1024 + 1), "copy", None).is_err());
        assert_eq!(fs::read_dir(fixture.path()).unwrap().count(), 3);
    }
    #[test]
    fn conflict_reload_protects_empty_and_unsaved_drafts_and_rejects_stale_disk() {
        let temp = Fixture::new();
        let path = temp.path().join("note.md");
        let history = temp.path().join("history");
        fs::write(&path, "disk").unwrap();
        let signature = read_text_snapshot_with_options(&path, None)
            .unwrap()
            .signature;
        let result = resolve_in_dir(&path, &history, &signature, "", "reload", None, None).unwrap();
        assert_eq!(result.snapshot.content, "disk");
        let saved: Vec<_> = fs::read_dir(&history)
            .unwrap()
            .map(|e| fs::read_to_string(e.unwrap().path()).unwrap())
            .collect();
        assert_eq!(saved, vec![""]);
        fs::write(&path, "newer").unwrap();
        assert!(
            resolve_in_dir(&path, &history, &signature, "draft", "reload", None, None).is_err()
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "newer");
    }
    #[test]
    fn copy_keeps_both_files_and_preserves_utf8_bom_crlf_and_extension() {
        let temp = Fixture::new();
        let path = temp.path().join("记录.txt");
        fs::write(&path, b"\xef\xbb\xbfdisk\r\n").unwrap();
        let signature = read_text_snapshot_with_options(&path, None)
            .unwrap()
            .signature;
        for _ in 0..2 {
            let result = resolve_in_dir(
                &path,
                &temp.path().join("history"),
                &signature,
                "draft\n",
                "copy",
                None,
                None,
            )
            .unwrap();
            let copy = result.copy_path.unwrap();
            assert!(copy.ends_with(".txt"));
            assert_eq!(fs::read(copy).unwrap(), b"\xef\xbb\xbfdraft\r\n");
        }
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfdisk\r\n");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 3);
    }
    #[test]
    fn failed_draft_protection_never_returns_replacement() {
        let temp = Fixture::new();
        let path = temp.path().join("note.md");
        let history = temp.path().join("history");
        fs::write(&path, "disk").unwrap();
        fs::write(&history, "blocked").unwrap();
        let signature = read_text_snapshot_with_options(&path, None)
            .unwrap()
            .signature;
        assert!(
            resolve_in_dir(&path, &history, &signature, "draft", "reload", None, None).is_err()
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "disk");
    }
}
