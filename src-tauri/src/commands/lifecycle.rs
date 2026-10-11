use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;

/// Diagnostic handshake only. This does not authorize file moves.
#[tauri::command]
pub fn begin_archive_window_confirmation(app: tauri::AppHandle) -> Result<String, String> {
    let windows = app.webview_windows();
    let state = app.state::<crate::services::archive_confirmation::WindowConfirmationState>();
    let id = {
        let mut registry = state.0.lock().map_err(|_| "无法核对窗口状态")?;
        registry.reconcile(&windows.keys().cloned().collect::<Vec<_>>())?;
        registry.begin(std::time::Instant::now(), std::time::Duration::from_secs(5))?
    };
    for window in windows.values() {
        if let Err(error) = window.emit("archive-confirm-window-state", id.to_string()) {
            state.0.lock().map_err(|_| "无法取消窗口确认")?.cancel(id);
            return Err(format!("无法请求窗口确认：{error}"));
        }
    }
    Ok(id.to_string())
}

#[tauri::command]
pub fn reply_archive_window_confirmation(
    window: tauri::Window,
    request_id: String,
    session: String,
    sequence: u32,
    ready: bool,
    dirty: bool,
) -> Result<(), String> {
    let id = request_id
        .parse::<u64>()
        .map_err(|_| "无效的窗口确认编号")?;
    window
        .state::<crate::services::archive_confirmation::WindowConfirmationState>()
        .0
        .lock()
        .map_err(|_| "无法核对窗口回执")?
        .reply_session(
            std::time::Instant::now(),
            id,
            window.label(),
            &session,
            sequence,
            ready,
            dirty,
        )?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveConfirmationStatus {
    ready: bool,
    can_execute: bool,
}

#[tauri::command]
pub fn archive_window_confirmation_status(
    app: tauri::AppHandle,
    request_id: String,
) -> Result<ArchiveConfirmationStatus, String> {
    let id = request_id
        .parse::<u64>()
        .map_err(|_| "无效的窗口确认编号")?;
    let state = app.state::<crate::services::archive_confirmation::WindowConfirmationState>();
    let mut registry = state.0.lock().map_err(|_| "无法读取窗口确认状态")?;
    registry.reconcile(&app.webview_windows().keys().cloned().collect::<Vec<_>>())?;
    let ready = registry.status(std::time::Instant::now(), id)?;
    Ok(ArchiveConfirmationStatus {
        ready,
        can_execute: false,
    })
}

#[derive(Default)]
pub struct WindowDrafts(pub Mutex<HashMap<String, bool>>);

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DraftObservation {
    pub window_label: String,
    pub status: &'static str,
}

fn observe(labels: Vec<String>, drafts: &HashMap<String, bool>) -> Vec<DraftObservation> {
    let mut labels = labels;
    labels.sort();
    labels.dedup();
    labels
        .into_iter()
        .map(|window_label| {
            let status = match drafts.get(&window_label) {
                Some(true) => "dirty",
                Some(false) => "reported_clean",
                None => "unknown",
            };
            DraftObservation {
                window_label,
                status,
            }
        })
        .collect()
}

/// Observation only: never focus a window, discard drafts or claim a fresh acknowledgement.
pub(crate) fn observe_archive_drafts(
    app: &tauri::AppHandle,
) -> Result<Vec<DraftObservation>, String> {
    let labels: Vec<String> = app.webview_windows().into_keys().collect();
    app.state::<crate::services::archive_confirmation::WindowConfirmationState>()
        .0
        .lock()
        .map_err(|_| "无法核对窗口确认登记")?
        .reconcile(&labels)?;
    let state = app.state::<WindowDrafts>();
    let drafts = state.0.lock().map_err(|_| "无法核对跨窗口草稿状态")?;
    Ok(observe(labels, &drafts))
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveDraftAudit {
    pub before: Vec<DraftObservation>,
    pub after: Vec<DraftObservation>,
    pub blockers: Vec<&'static str>,
}

pub(crate) fn audit_archive_drafts(
    before: Vec<DraftObservation>,
    after: Vec<DraftObservation>,
) -> ArchiveDraftAudit {
    let mut blockers = vec!["fresh_window_acknowledgement_required"];
    if before.is_empty() || after.is_empty() {
        blockers.push("window_inventory_empty");
    }
    if before != after {
        blockers.push("window_draft_observation_changed");
    }
    if before
        .iter()
        .chain(&after)
        .any(|item| item.status == "dirty")
    {
        blockers.push("window_has_unsaved_changes");
    }
    if before
        .iter()
        .chain(&after)
        .any(|item| item.status == "unknown")
    {
        blockers.push("window_draft_state_unknown");
    }
    ArchiveDraftAudit {
        before,
        after,
        blockers,
    }
}

#[cfg(test)]
mod archive_draft_tests {
    use super::*;
    #[test]
    fn archive_drafts_distinguish_unknown_and_ignore_closed_window_cache() {
        let drafts = HashMap::from([("main".into(), false), ("closed".into(), true)]);
        let rows = observe(vec!["new".into(), "main".into()], &drafts);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].status, "reported_clean");
        assert_eq!(rows[1].status, "unknown");
        let audit = audit_archive_drafts(observe(vec!["main".into()], &drafts), rows);
        assert!(audit.blockers.contains(&"window_draft_state_unknown"));
        assert!(audit.blockers.contains(&"window_draft_observation_changed"));
        assert!(!audit.blockers.contains(&"window_has_unsaved_changes"));
    }
    #[test]
    fn archive_drafts_never_treat_cached_clean_as_execution_confirmation() {
        let clean = HashMap::from([("main".into(), false)]);
        let audit = audit_archive_drafts(
            observe(vec!["main".into()], &clean),
            observe(vec!["main".into()], &clean),
        );
        assert_eq!(
            audit.blockers,
            vec!["fresh_window_acknowledgement_required"]
        );
        let dirty = HashMap::from([("main".into(), true)]);
        let audit = audit_archive_drafts(
            observe(vec!["main".into()], &dirty),
            observe(vec!["main".into()], &clean),
        );
        assert!(audit.blockers.contains(&"window_has_unsaved_changes"));
        assert!(audit_archive_drafts(vec![], vec![])
            .blockers
            .contains(&"window_inventory_empty"));
    }
}

#[tauri::command]
pub fn register_window_draft_session(window: tauri::Window) -> Result<String, String> {
    let state = window.state::<crate::services::archive_confirmation::WindowConfirmationState>();
    let mut registry = state.0.lock().map_err(|_| "无法登记窗口会话")?;
    let session = registry.new_session(window.label())?;
    window
        .state::<WindowDrafts>()
        .0
        .lock()
        .map_err(|_| "无法重置窗口草稿状态")?
        .remove(window.label());
    Ok(session)
}

#[tauri::command]
pub fn report_window_draft_session(
    window: tauri::Window,
    session: String,
    sequence: u32,
    dirty: bool,
) -> Result<(), String> {
    let state = window.state::<crate::services::archive_confirmation::WindowConfirmationState>();
    let mut registry = state.0.lock().map_err(|_| "无法更新窗口会话")?;
    registry.report_session(window.label(), &session, sequence, dirty)?;
    // Hold the registry lock until both records agree; rejected stale reports
    // must never reach the legacy close/update dirty map.
    window
        .state::<WindowDrafts>()
        .0
        .lock()
        .map_err(|_| "无法更新窗口草稿状态")?
        .insert(window.label().into(), dirty);
    Ok(())
}

#[tauri::command]
pub fn set_window_dirty(window: tauri::Window, dirty: bool) -> Result<(), String> {
    window
        .state::<crate::services::archive_confirmation::WindowConfirmationState>()
        .0
        .lock()
        .map_err(|_| "无法更新窗口确认登记")?
        .report(window.label(), dirty)?;
    window
        .state::<WindowDrafts>()
        .0
        .lock()
        .map_err(|_| "无法确认未保存状态")?
        .insert(window.label().to_string(), dirty);
    Ok(())
}

pub fn ensure_saved(app: &tauri::AppHandle, confirmed_window: Option<&str>) -> Result<(), String> {
    let state = app.state::<WindowDrafts>();
    let drafts = state
        .0
        .lock()
        .map_err(|_| "无法确认未保存状态，请稍后重试")?;
    for (label, window) in app.webview_windows() {
        if Some(label.as_str()) != confirmed_window && drafts.get(&label) != Some(&false) {
            let _ = window.show();
            let _ = window.set_focus();
            return Err("有窗口尚未就绪或包含未保存内容。请先保存或关闭该窗口，然后重试。".into());
        }
    }
    Ok(())
}
