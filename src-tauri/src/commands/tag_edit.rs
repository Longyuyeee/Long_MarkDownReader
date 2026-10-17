//! Main-window-only explicit tag body edits. Plans contain native-read originals,
//! never renderer-supplied replacement bodies. No config/collection rewrites.
use crate::services::{
    move_windows::{Notice, Protection},
    tag_edit::{Operation, Outcome, Plan, PreviewItem, Report},
    workspace_guard::WorkspaceGuard,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

struct Entry {
    closed: bool,
    created: Instant,
    requested_root: String,
    plan: Option<Plan>,
}
type Handle = Arc<Mutex<Entry>>;
fn registry() -> &'static Mutex<BTreeMap<String, Handle>> {
    static REGISTRY: OnceLock<Mutex<BTreeMap<String, Handle>>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}
fn main_only(label: &str) -> Result<(), String> {
    if label != "main" {
        return Err("只能在主工作台预览或确认标签正文修改".into());
    }
    Ok(())
}
fn configured(app: &tauri::AppHandle, requested: &str) -> Result<PathBuf, String> {
    let config = super::config::get_config(app.clone());
    let selected = super::index::search_pages::configured_page_scope(&config.libraries, requested)
        .map_err(|error| error.message)?;
    Ok(WorkspaceGuard::new(selected)?.root().to_path_buf())
}
fn reserve(root: String) -> Result<(String, Handle), String> {
    let mut entries = registry().lock().map_err(|_| "标签预览状态暂不可用")?;
    entries.retain(|_, handle| {
        handle.try_lock().map_or(true, |entry| {
            entry.created.elapsed() < Duration::from_secs(300)
        })
    });
    if entries.len() >= 4 {
        return Err("已有 4 个标签预览，请关闭旧预览后再操作".into());
    }
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let id = format!(
        "tags-{:x}-{:x}-{:x}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let handle = Arc::new(Mutex::new(Entry {
        closed: false,
        created: Instant::now(),
        requested_root: root,
        plan: None,
    }));
    entries.insert(id.clone(), handle.clone());
    Ok((id, handle))
}
fn get(id: &str) -> Result<Handle, String> {
    if id.len() > 160 {
        return Err("标签预览编号无效".into());
    }
    registry()
        .lock()
        .map_err(|_| "标签预览状态暂不可用")?
        .get(id)
        .cloned()
        .ok_or("标签预览已关闭或过期，请重新预览".into())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewRequest {
    library_root: String,
    operation: Operation,
    paths: Vec<String>,
    #[serde(default)]
    excluded_paths: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewResponse {
    plan_id: String,
    expires_in_seconds: u32,
    items: Vec<PreviewItem>,
}
#[tauri::command]
pub(crate) async fn preview_tag_edit(
    app: tauri::AppHandle,
    window: tauri::Window,
    request: PreviewRequest,
) -> Result<PreviewResponse, String> {
    main_only(window.label())?;
    // Reserve before reading so concurrent IPC cannot build unbounded plans.
    let root = configured(&app, &request.library_root)?;
    request.operation.validate()?;
    let (id, handle) = reserve(request.library_root)?;
    let owned_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let plan = Plan::prepare(
            &root,
            &request.operation,
            &request.paths,
            &request.excluded_paths,
        )?;
        let items = plan.preview().to_vec();
        let mut entry = handle.lock().map_err(|_| "标签预览状态暂不可用")?;
        if entry.closed {
            return Err("预览已关闭，本次未写入".into());
        }
        if entry.created.elapsed() >= Duration::from_secs(300) {
            return Err("预览准备已超时，请减少所选笔记".into());
        }
        entry.plan = Some(plan);
        Ok(PreviewResponse {
            plan_id: owned_id,
            expires_in_seconds: 300,
            items,
        })
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|result| result);
    if result.is_err() {
        if let Ok(mut entries) = registry().lock() {
            entries.remove(&id);
        }
    }
    result
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ApplyRequest {
    plan_id: String,
    selected: Vec<usize>,
    confirmed: bool,
}
#[tauri::command]
pub(crate) async fn apply_tag_edit(
    app: tauri::AppHandle,
    window: tauri::Window,
    request: ApplyRequest,
) -> Result<Report, String> {
    main_only(window.label())?;
    if !request.confirmed {
        return Err("请明确确认修改已保存笔记正文；本次未写入".into());
    }
    let handle = get(&request.plan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut entry = handle
            .try_lock()
            .map_err(|_| "此预览正在处理，请勿重复执行")?;
        if entry.closed {
            return Err("预览已关闭，本次未写入".into());
        }
        let root = configured(&app, &entry.requested_root)?;
        let plan = entry.plan.as_mut().ok_or("标签预览仍在准备，请稍后")?;
        if plan.root() != root {
            return Err("资料库位置自预览后已变化，请重新预览".into());
        }
        if let Some(report) = plan.receipt(&request.selected)? {
            return Ok(report);
        }
        if plan.expired() {
            return Err("预览已超过 5 分钟，请重新核对".into());
        }
        let paths = plan.paths(&request.selected)?;
        let mut protection = Protection::begin_content_edit(&app, &root, &paths)?;
        let cache = super::history::history_cache_root(&app)?;
        let history = super::history::history_lease(&app)?;
        let report = plan.apply(
            &request.selected,
            || protection.windows_unchanged(),
            |path, body| super::history::save_reference_snapshot(&cache, path, body),
        )?;
        // Leases are dropped before the release asks windows to read fresh bodies.
        drop(history);
        let documents = report
            .items
            .iter()
            .filter(|item| item.outcome != Outcome::NotExecuted)
            .map(|item| item.path.clone())
            .collect::<Vec<_>>();
        if !documents.is_empty() {
            let root = root.to_string_lossy().into_owned();
            protection.completed(Notice {
                root: root.clone(),
                old_path: root.clone(),
                new_path: root,
                documents,
                content_only: true,
            });
        }
        drop(protection);
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn close_tag_edit(window: tauri::Window, plan_id: String) -> Result<bool, String> {
    main_only(window.label())?;
    let handle = get(&plan_id)?;
    let mut idle = handle
        .try_lock()
        .map_err(|_| "预览正在执行，完成后才能关闭")?;
    idle.closed = true;
    Ok(registry()
        .lock()
        .map_err(|_| "标签预览状态暂不可用")?
        .remove(&plan_id)
        .is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v1110_tag_edit_commands_refuse_non_main_and_unknown_confirmation_fields() {
        for label in ["", "external-1", "library", "main-fake"] {
            assert!(main_only(label).is_err());
        }
        assert!(main_only("main").is_ok());
        assert!(serde_json::from_value::<ApplyRequest>(serde_json::json!({"planId":"id","selected":[0],"confirmed":true,"body":"renderer replacement"})).is_err());
        assert!(get(&"x".repeat(161)).is_err());
    }
}
