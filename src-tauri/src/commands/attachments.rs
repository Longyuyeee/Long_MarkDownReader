//! Attachment inspection and draft-only reference edits. Existing file transactions
//! continue to own moves, renames, recovery and unsaved-window protection.
use crate::services::{
    archive_dependencies as links, archive_edits, file_activity, library_visibility,
    workspace_guard::WorkspaceGuard,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri_plugin_dialog::DialogExt;

const MAX_TEXT: usize = 2 * 1024 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    target: String,
    path: Option<String>,
    status: String,
    line: usize,
    count: usize,
    can_replace: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentReport {
    document: String,
    markdown: bool,
    references: Vec<Attachment>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentUse {
    document: String,
    line: usize,
    count: usize,
    source: &'static str,
}
#[derive(Deserialize)]
pub struct AttachmentDraft {
    document: String,
    content: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    content: String,
    count: usize,
    target: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedAttachment {
    path: String,
    imported: bool,
    note: String,
}

fn user_file(guard: &WorkspaceGuard, input: &str) -> Result<PathBuf, String> {
    let path = guard.resolve_existing(input)?;
    if !path.is_file() {
        return Err("请选择资料库中的文件".into());
    }
    if path
        .strip_prefix(guard.root())
        .map_err(|e| e.to_string())?
        .components()
        .any(|part| library_visibility::hidden_name(&part.as_os_str().to_string_lossy()))
    {
        return Err("内部记录不作为文档附件处理".into());
    }
    Ok(path)
}
fn markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}
fn text(path: &Path, draft: Option<String>) -> Result<String, String> {
    let value = match draft {
        Some(s) => s,
        None => {
            let mut s = String::new();
            fs::File::open(path)
                .map_err(|e| e.to_string())?
                .take(MAX_TEXT as u64 + 1)
                .read_to_string(&mut s)
                .map_err(|_| "正文暂时无法读取，请使用 UTF-8 笔记")?;
            s
        }
    };
    if value.len() > MAX_TEXT {
        return Err("这篇笔记超过 2 MiB，请在编辑区手动处理引用；原文未改动".into());
    }
    Ok(value)
}
fn inspect(root: &str, document: &str, draft: Option<String>) -> Result<AttachmentReport, String> {
    let guard = WorkspaceGuard::new(root)?;
    let path = user_file(&guard, document)?;
    let mut references: BTreeMap<String, Attachment> = BTreeMap::new();
    if markdown(&path) {
        let content = text(&path, draft)?;
        let mut spans = std::collections::HashSet::new();
        for evidence in links::move_mentions(&path.to_string_lossy(), &content) {
            // Reference-style uses and their definition share one editable destination.
            let span = evidence.destination_span.as_ref().map(|s| (s.start, s.end));
            if span.is_some_and(|s| !spans.insert(s)) {
                continue;
            }
            let resolution = links::resolve_relative(guard.root(), &evidence);
            let internal = resolution
                .path
                .as_deref()
                .and_then(|p| Path::new(p).strip_prefix(guard.root()).ok())
                .is_some_and(|p| {
                    p.components().any(|part| {
                        library_visibility::hidden_name(&part.as_os_str().to_string_lossy())
                    })
                });
            let status = if internal {
                "internal"
            } else {
                resolution.status
            };
            let item = references
                .entry(evidence.target.clone())
                .or_insert(Attachment {
                    target: evidence.target,
                    path: if internal { None } else { resolution.path },
                    status: status.into(),
                    line: evidence.line,
                    count: 0,
                    can_replace: span.is_some()
                        && !internal
                        && ["resolved_file", "missing", "unreadable"].contains(&status),
                });
            item.count += 1;
            item.can_replace &= span.is_some();
            if references.len() > 2000 {
                return Err("引用超过 2000 项，请分篇整理，原文未改动".into());
            }
        }
    }
    Ok(AttachmentReport {
        document: path.to_string_lossy().into_owned(),
        markdown: markdown(&path),
        references: references.into_values().collect(),
    })
}
#[cfg(test)]
fn incoming(root: &str, target: &str) -> Result<Vec<AttachmentUse>, String> {
    incoming_with_drafts(root, target, vec![])
}
fn incoming_with_drafts(
    root: &str,
    target: &str,
    drafts: Vec<AttachmentDraft>,
) -> Result<Vec<AttachmentUse>, String> {
    let guard = WorkspaceGuard::new(root)?;
    let target = user_file(&guard, target)?;
    let mut overlays = BTreeMap::new();
    let mut total = 0usize;
    for draft in drafts {
        let document = user_file(&guard, &draft.document)?;
        if !markdown(&document) {
            return Err("仅支持 Markdown 草稿引用检查".into());
        }
        let content = text(&document, Some(draft.content))?;
        total += content.len();
        if total > 32 * 1024 * 1024 {
            return Err("当前草稿超过 32 MiB，引用检查未完成；草稿未改动".into());
        }
        if let Some(previous) = overlays.insert(document, content.clone()) {
            if previous != content {
                return Err("同一篇笔记存在不同草稿，请核对后再试；草稿均未改动".into());
            }
        }
    }
    let inventory = links::scan_for_move_with_drafts(root, &overlays)?;
    let mut uses: BTreeMap<String, AttachmentUse> = BTreeMap::new();
    for evidence in inventory.evidence() {
        let resolution = evidence.resolution.as_ref().ok_or("引用检查未完成")?;
        if resolution.status != "resolved_file"
            || resolution
                .path
                .as_deref()
                .and_then(|p| Path::new(p).canonicalize().ok())
                .as_deref()
                != Some(target.as_path())
        {
            continue;
        }
        let item = uses
            .entry(evidence.document.clone())
            .or_insert(AttachmentUse {
                document: evidence.document.clone(),
                line: evidence.line,
                count: 0,
                source: if overlays.contains_key(Path::new(&evidence.document)) {
                    "draft"
                } else {
                    "saved"
                },
            });
        item.count += 1;
    }
    Ok(uses.into_values().collect())
}
fn replace(
    root: &str,
    document: &str,
    content: String,
    old_target: &str,
    replacement: &str,
) -> Result<Replacement, String> {
    let guard = WorkspaceGuard::new(root)?;
    let document = user_file(&guard, document)?;
    if !markdown(&document) {
        return Err("请在 Markdown 笔记中修改附件引用".into());
    }
    let content = text(&document, Some(content))?;
    let replacement = user_file(&guard, replacement)?;
    let mut proposals = Vec::new();
    for evidence in links::move_mentions(&document.to_string_lossy(), &content)
        .into_iter()
        .filter(|e| e.target == old_target)
    {
        if evidence.destination_span.is_none() {
            return Err("这处引用暂不能可靠改写，请在正文中手动修改".into());
        }
        let target =
            archive_edits::relative_target(guard.root(), &document, &replacement, &evidence)
                .ok_or("无法计算新的相对引用")?;
        proposals.push((evidence, target));
    }
    if proposals.is_empty() {
        return Err("正文中的引用已变化，请刷新附件列表".into());
    }
    let count = proposals
        .iter()
        .filter_map(|(e, _)| e.destination_span.as_ref().map(|s| (s.start, s.end)))
        .collect::<std::collections::HashSet<_>>()
        .len();
    let target = proposals[0].1.clone();
    let content = archive_edits::preview_move(&document.to_string_lossy(), &content, &proposals)?;
    Ok(Replacement {
        content,
        count,
        target,
    })
}
#[tauri::command]
pub async fn inspect_library_attachments(
    library_root: String,
    document_path: String,
    draft: Option<String>,
) -> Result<AttachmentReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let _io = file_activity::read_write(&[guard.root()])?;
        inspect(&library_root, &document_path, draft)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn list_library_attachment_uses(
    library_root: String,
    path: String,
    drafts: Option<Vec<AttachmentDraft>>,
) -> Result<Vec<AttachmentUse>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let _io = file_activity::read_write(&[guard.root()])?;
        incoming_with_drafts(&library_root, &path, drafts.unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn preview_attachment_reference(
    library_root: String,
    document_path: String,
    content: String,
    old_target: String,
    replacement_path: String,
) -> Result<Replacement, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = WorkspaceGuard::new(&library_root)?;
        let _io = file_activity::read_write(&[guard.root()])?;
        replace(
            &library_root,
            &document_path,
            content,
            &old_target,
            &replacement_path,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn pick_library_attachment(
    window: tauri::WebviewWindow,
    app_handle: tauri::AppHandle,
    library_root: String,
    document_path: String,
) -> Result<Option<PickedAttachment>, String> {
    if window.label() != "main" {
        return Err("请从主窗口选择附件".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app_handle
            .dialog()
            .file()
            .set_title("选择替换文件（库外文件将保留原件并复制到附件目录）")
            .set_directory(&library_root)
            .blocking_pick_file();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let source = picked
            .into_path()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !source.is_file()
            || fs::metadata(&source).map_err(|e| e.to_string())?.len() > 64 * 1024 * 1024
        {
            return Err("请选择不超过 64 MiB 的附件文件".into());
        }
        let _lock = super::file_management::OPERATIONS
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let guard = WorkspaceGuard::new(&library_root)?;
        let document = user_file(&guard, &document_path)?;
        if source.starts_with(guard.root()) {
            return Ok(Some(PickedAttachment {
                path: user_file(&guard, &source.to_string_lossy())?
                    .to_string_lossy()
                    .into_owned(),
                imported: false,
                note: String::new(),
            }));
        }
        let _io = file_activity::read_write(&[guard.root()])?;
        let directory = guard.resolve_directory(
            document.parent().ok_or("文档目录不可用")?.join(".assets"),
            true,
        )?;
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let copied = crate::services::external_import::import_file(&source, &directory)?;
        let history = || -> Result<(), String> {
            let id = crate::services::file_operation_history::id();
            crate::services::file_operation_history::begin(
                guard.root(),
                &id,
                &source,
                &copied,
                guard.root(),
                None,
                None,
            )?;
            crate::services::file_operation_history::finish(guard.root(), &id, true, &[])
        };
        let note = history()
            .err()
            .map(|e| format!("附件副本已保留，但整理记录未写完：{e}"))
            .unwrap_or_default();
        Ok(Some(PickedAttachment {
            path: copied.to_string_lossy().into_owned(),
            imported: true,
            note,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{
        file_move_transaction, file_operation_history, test_workspace::TestWorkspace,
    };
    #[test]
    fn incoming_drafts_replace_disk_references_including_empty_and_new_uses() {
        let f = TestWorkspace::new();
        fs::create_dir(f.0.join(".assets")).unwrap();
        fs::write(f.0.join(".assets/图 片.png"), b"unchanged").unwrap();
        for (name, text) in [
            ("删除.md", "![旧](<.assets/图 片.png>)"),
            ("新增.markdown", "磁盘未引用"),
            ("保留.md", "![保存](<.assets/图 片.png>)"),
        ] {
            fs::write(f.0.join(name), text).unwrap();
        }
        let draft = "自己的补写\r\n\r\n![新增](<.assets/图 片.png>)\r\n[文件](<.assets/图 片.png#片段>)\r\n`![示例](<.assets/图 片.png>)`\r\n";
        let r = incoming_with_drafts(
            f.0.to_str().unwrap(),
            ".assets/图 片.png",
            vec![
                AttachmentDraft {
                    document: "删除.md".into(),
                    content: String::new(),
                },
                AttachmentDraft {
                    document: "新增.markdown".into(),
                    content: draft.into(),
                },
            ],
        )
        .unwrap();
        assert_eq!(r.len(), 2);
        let new = r
            .iter()
            .find(|r| r.document.ends_with("新增.markdown"))
            .unwrap();
        assert_eq!((new.line, new.count, new.source), (3, 2, "draft"));
        assert_eq!(
            r.iter()
                .find(|r| r.document.ends_with("保留.md"))
                .unwrap()
                .source,
            "saved"
        );
        assert_eq!(
            fs::read_to_string(f.0.join("新增.markdown")).unwrap(),
            "磁盘未引用"
        );
        assert_eq!(
            fs::read(f.0.join(".assets/图 片.png")).unwrap(),
            b"unchanged"
        );
    }
    #[test]
    fn incoming_draft_identity_conflict_and_unreadable_limits_are_local_errors() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("note.md"), [0xff, 0xfe]).unwrap();
        fs::write(f.0.join("image.png"), b"image").unwrap();
        let run = |drafts| incoming_with_drafts(f.0.to_str().unwrap(), "image.png", drafts);
        let d = |text: &str| AttachmentDraft {
            document: "note.md".into(),
            content: text.into(),
        };
        assert_eq!(run(vec![d("![图](image.png)")]).unwrap()[0].source, "draft");
        assert!(run(vec![]).is_err());
        assert!(run(vec![d("a"), d("b")]).is_err());
        assert!(run(vec![d(&"a".repeat(MAX_TEXT + 1))]).is_err());
        assert!(run(vec![AttachmentDraft {
            document: "../outside.md".into(),
            content: "".into()
        }])
        .is_err());
        assert_eq!(fs::read(f.0.join("note.md")).unwrap(), [0xff, 0xfe]);
    }
    #[test]
    fn user_attachment_folders_are_visible_searchable_and_private_metadata_stays_hidden() {
        let f = TestWorkspace::new();
        let folders = [
            "images",
            "assets",
            "img",
            "public",
            "static",
            ".assets",
            "note.assets",
        ];
        for folder in folders {
            fs::create_dir(f.0.join(folder)).unwrap();
            fs::write(f.0.join(folder).join("visible.md"), "# 可查附件笔记").unwrap();
        }
        fs::create_dir(f.0.join(".longedit")).unwrap();
        fs::write(f.0.join(".longedit/private.md"), "内部材料").unwrap();
        fs::write(f.0.join(".misty_order.json"), r#"{"items":[],"pinned":[]}"#).unwrap();
        let root = f.0.to_string_lossy().into_owned();
        let entries =
            tauri::async_runtime::block_on(super::super::files::scan_directory(root.clone(), root))
                .unwrap();
        assert_eq!(entries.len(), folders.len());
        assert!(folders
            .iter()
            .all(|name| entries.iter().any(|e| e.name == *name)));
        let sources = crate::services::knowledge_index::collect_index_sources(&f.0);
        assert_eq!(sources.len(), folders.len());
        assert!(sources.iter().all(|s| s.path.ends_with("visible.md")));
        assert!(crate::services::knowledge_index::relevant_search_path(
            &f.0,
            &f.0.join(".assets/visible.md")
        ));
        assert!(!crate::services::knowledge_index::relevant_search_path(
            &f.0,
            &f.0.join(".longedit/private.md")
        ));
    }
    #[test]
    fn draft_inspection_and_replacement_preserve_disk_shared_file_and_syntax() {
        let f = TestWorkspace::new();
        fs::create_dir_all(f.0.join(".assets")).unwrap();
        fs::write(f.0.join("note.md"), "disk original\r\n").unwrap();
        fs::write(f.0.join(".assets/a.png"), b"shared").unwrap();
        fs::write(f.0.join(".assets/new 图.png"), b"new").unwrap();
        let draft="需要保留的草稿\r\n![a](.assets/a.png)\r\n[文件](.assets/a.png#part)\r\n`![code](none.png)`\r\n";
        let r = inspect(f.0.to_str().unwrap(), "note.md", Some(draft.into())).unwrap();
        assert_eq!(r.references.len(), 2);
        assert!(r
            .references
            .iter()
            .all(|a| a.can_replace && a.status == "resolved_file"));
        let r = replace(
            f.0.to_str().unwrap(),
            "note.md",
            draft.into(),
            ".assets/a.png",
            ".assets/new 图.png",
        )
        .unwrap();
        assert_eq!(r.count, 1);
        assert!(r.content.starts_with("需要保留的草稿\r\n"));
        assert!(r.content.contains(".assets/new%20%E5%9B%BE.png"));
        assert!(r.content.contains(".assets/a.png#part"));
        assert!(r.content.contains("`![code](none.png)`"));
        assert_eq!(
            fs::read_to_string(f.0.join("note.md")).unwrap(),
            "disk original\r\n"
        );
        assert_eq!(fs::read(f.0.join(".assets/a.png")).unwrap(), b"shared");
    }
    #[test]
    #[cfg(windows)]
    fn incoming_uses_actual_windows_file_identity_for_case_variant_paths() {
        let f = TestWorkspace::new();
        fs::create_dir(f.0.join(".assets")).unwrap();
        fs::write(f.0.join(".assets/图.png"), b"shared").unwrap();
        fs::write(f.0.join("note.md"), "![图片](.ASSETS/图.PNG)\n").unwrap();
        let uses = incoming(f.0.to_str().unwrap(), ".assets/图.png").unwrap();
        assert_eq!(uses.len(), 1);
        assert_eq!(uses[0].line, 1);
        assert_eq!(fs::read(f.0.join(".assets/图.png")).unwrap(), b"shared");
    }
    #[test]
    fn missing_link_is_repairable_but_private_and_ambiguous_links_are_not_opened() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("note.md"),"![lost](images/lost.png)\n[private](.longedit/config.json)\n[[unknown]]\n[net](https://example.com/a.png)\n").unwrap();
        let r = inspect(f.0.to_str().unwrap(), "note.md", None).unwrap();
        let lost = r
            .references
            .iter()
            .find(|a| a.target == "images/lost.png")
            .unwrap();
        assert_eq!(lost.status, "missing");
        assert!(lost.can_replace);
        let private = r
            .references
            .iter()
            .find(|a| a.target.contains("config.json"))
            .unwrap();
        assert_eq!(private.status, "internal");
        assert!(private.path.is_none());
        assert!(!private.can_replace);
        assert!(r.references.iter().all(|a| !a.target.starts_with("https:")));
    }
    #[test]
    fn reference_definition_is_replaced_once_and_title_fragment_survive() {
        let f = TestWorkspace::new();
        fs::write(f.0.join("note.md"), "").unwrap();
        fs::write(f.0.join("new.pdf"), b"pdf").unwrap();
        let draft = "[a][ref]\r\n[b][ref]\r\n\r\n[ref]: old.pdf#page=2 \"标题\"\r\n";
        let r = replace(
            f.0.to_str().unwrap(),
            "note.md",
            draft.into(),
            "old.pdf#page=2",
            "new.pdf",
        )
        .unwrap();
        assert_eq!(r.count, 1);
        assert_eq!(r.content, draft.replace("old.pdf", "new.pdf"));
        assert!(replace(
            f.0.to_str().unwrap(),
            "note.md",
            draft.into(),
            "outdated.pdf",
            "new.pdf"
        )
        .is_err());
    }
    #[test]
    fn attachment_folder_move_and_restore_update_references_inside_attachment_folders() {
        let f = TestWorkspace::new();
        fs::create_dir(f.0.join(".assets")).unwrap();
        fs::create_dir(f.0.join("images")).unwrap();
        fs::write(f.0.join(".assets/reading.md"), "![pic](../images/a.png)\n").unwrap();
        fs::write(f.0.join("images/a.png"), b"shared").unwrap();
        let root = f.0.to_str().unwrap();
        let r = incoming(root, "images/a.png").unwrap();
        assert_eq!(r.len(), 1);
        let guard = WorkspaceGuard::new(&f.0).unwrap();
        file_move_transaction::execute(None, &guard, &f.0.join("images"), &f.0.join("photos"))
            .unwrap();
        assert!(fs::read_to_string(f.0.join(".assets/reading.md"))
            .unwrap()
            .contains("../photos/a.png"));
        let id = file_operation_history::list(guard.root()).unwrap()[0]
            .id
            .clone();
        super::super::file_operation_history::restore(None, &guard, &id).unwrap();
        assert_eq!(
            fs::read_to_string(f.0.join(".assets/reading.md")).unwrap(),
            "![pic](../images/a.png)\n"
        );
        assert_eq!(fs::read(f.0.join("images/a.png")).unwrap(), b"shared");
    }
}
