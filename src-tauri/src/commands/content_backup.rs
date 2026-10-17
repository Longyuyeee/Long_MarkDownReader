//! Native plans are short-lived, main-window-only and never supplied by renderer.
use crate::services::{
    content_backup::{self as service, Control, Options, Receipt, Summary, TargetCheck},
    workspace_guard::WorkspaceGuard,
};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
#[derive(Clone)]
enum Plan {
    Export(service::ExportPlan),
    Restore(service::RestorePlan),
}
struct Ticket {
    created: Instant,
    plan: Plan,
}
fn plans() -> &'static Mutex<BTreeMap<String, Ticket>> {
    static VALUE: OnceLock<Mutex<BTreeMap<String, Ticket>>> = OnceLock::new();
    VALUE.get_or_init(Mutex::default)
}
fn operations() -> &'static Mutex<BTreeMap<String, Control>> {
    static VALUE: OnceLock<Mutex<BTreeMap<String, Control>>> = OnceLock::new();
    VALUE.get_or_init(Mutex::default)
}
fn main_only(label: &str) -> Result<(), String> {
    if label != "main" {
        Err("只能在主工作台备份或恢复资料内容".into())
    } else {
        Ok(())
    }
}
fn reserve(plan: Plan) -> Result<String, String> {
    let mut map = plans().lock().map_err(|_| "内容备份预检状态异常")?;
    map.retain(|_, v| v.created.elapsed() < Duration::from_secs(600));
    if map.len() >= 8 {
        let oldest = map
            .iter()
            .min_by_key(|(_, v)| v.created)
            .map(|(k, _)| k.clone())
            .unwrap();
        map.remove(&oldest);
    }
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let id = format!(
        "content-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    map.insert(
        id.clone(),
        Ticket {
            created: Instant::now(),
            plan,
        },
    );
    Ok(id)
}
fn ticket(id: &str) -> Result<Plan, String> {
    let map = plans().lock().map_err(|_| "内容预检状态异常")?;
    let t = map.get(id).ok_or("内容预检已关闭或过期，请重新预检")?;
    if t.created.elapsed() > Duration::from_secs(600) {
        return Err("内容预检超过 10 分钟，请重新预检".into());
    }
    Ok(t.plan.clone())
}
struct Operation {
    pub control: Control,
    id: String,
}
impl Operation {
    fn new(id: String) -> Result<Self, String> {
        if id.is_empty()
            || id.len() > 100
            || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("内容任务编号无效".into());
        }
        let mut map = operations().lock().map_err(|_| "内容任务状态异常")?;
        if !map.is_empty() {
            return Err("已有内容备份或恢复在处理，请等待或取消后重试".into());
        }
        let control = Control::default();
        map.insert(id.clone(), control.clone());
        Ok(Self { control, id })
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if let Ok(mut m) = operations().lock() {
            m.remove(&self.id);
        }
    }
}
fn configured(app: &tauri::AppHandle, root: &str) -> Result<PathBuf, String> {
    let config = super::config::get_config(app.clone());
    let selected = super::index::search_pages::configured_page_scope(&config.libraries, root)
        .map_err(|e| e.message)?;
    Ok(WorkspaceGuard::new(selected)?.root().to_owned())
}
fn target_outside_libraries(app: &tauri::AppHandle, target: &str) -> Result<(), String> {
    use tauri::Manager;
    let path = Path::new(target);
    if !path.is_absolute() {
        return Err("恢复目标需要绝对路径".into());
    }
    let parent = path
        .parent()
        .ok_or("恢复目标缺少父目录")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let name = path.file_name().ok_or("恢复目标名称无效")?;
    let target = parent.join(name);
    let key = |p: &Path| p.to_string_lossy().replace('\\', "/").to_lowercase();
    let wanted = key(&target);
    let config = super::config::get_config(app.clone());
    for lib in config.libraries {
        let path = Path::new(&lib.path);
        let root = path.canonicalize().unwrap_or_else(|_| path.to_owned());
        let root = key(&root);
        if wanted == root || wanted.starts_with(&format!("{root}/")) {
            return Err("请在所有现有资料库以外恢复到新目录，原资料库不改变".into());
        }
    }
    for root in [
        app.path().app_config_dir().map_err(|e| e.to_string())?,
        app.path().app_cache_dir().map_err(|e| e.to_string())?,
    ] {
        let root = key(&root.canonicalize().unwrap_or(root));
        let wanted = wanted.trim_start_matches("//?/");
        let root = root.trim_start_matches("//?/");
        if wanted == root || wanted.starts_with(&format!("{root}/")) {
            return Err("不能将资料恢复到应用配置或缓存目录".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn preview_content_backup(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    library_root: String,
    options: Options,
    operation_id: String,
) -> Result<Summary, String> {
    main_only(window.label())?;
    let root = configured(&app, &library_root)?;
    let cache = super::history::history_cache_root(&app)?;
    let operation = Operation::new(operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let plan = service::preview(&root, &cache, options, &operation.control)?;
        let id = reserve(Plan::Export(plan.clone()))?;
        Ok(plan.manifest.summary(id, None))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn export_content_backup(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    plan_id: String,
    target_path: String,
    operation_id: String,
) -> Result<Receipt, String> {
    main_only(window.label())?;
    let Plan::Export(plan) = ticket(&plan_id)? else {
        return Err("请先进行内容导出预检".into());
    };
    configured(&app, &plan.root.to_string_lossy())?;
    let operation = Operation::new(operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        service::export(&plan, Path::new(&target_path), &operation.control)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn preflight_content_restore(
    window: tauri::WebviewWindow,
    backup_path: String,
    operation_id: String,
) -> Result<Summary, String> {
    main_only(window.label())?;
    let operation = Operation::new(operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let plan = service::inspect_archive(Path::new(&backup_path), &operation.control)?;
        let id = reserve(Plan::Restore(plan.clone()))?;
        Ok(plan.manifest.summary(id, Some(plan.sha256.clone())))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn check_content_restore_target(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    plan_id: String,
    target_directory: String,
) -> Result<TargetCheck, String> {
    main_only(window.label())?;
    target_outside_libraries(&app, &target_directory)?;
    let Plan::Restore(plan) = ticket(&plan_id)? else {
        return Err("请先校验内容包".into());
    };
    let cache = super::history::history_cache_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        service::check_restore_target(&plan, &cache, Path::new(&target_directory))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn restore_content_backup(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    plan_id: String,
    target_directory: String,
    operation_id: String,
) -> Result<Receipt, String> {
    main_only(window.label())?;
    target_outside_libraries(&app, &target_directory)?;
    let Plan::Restore(plan) = ticket(&plan_id)? else {
        return Err("请先校验内容包".into());
    };
    let cache = super::history::history_cache_root(&app)?;
    let operation = Operation::new(operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        service::restore(
            &plan,
            &cache,
            Path::new(&target_directory),
            &operation.control,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_content_backup(
    window: tauri::WebviewWindow,
    operation_id: String,
) -> Result<bool, String> {
    main_only(window.label())?;
    let map = operations().lock().map_err(|_| "内容任务状态异常")?;
    Ok(map.get(&operation_id).is_some_and(|c| c.cancel()))
}
#[tauri::command]
pub fn discard_content_backup_plan(
    window: tauri::WebviewWindow,
    plan_id: String,
) -> Result<(), String> {
    main_only(window.label())?;
    plans()
        .lock()
        .map_err(|_| "内容预检状态异常")?
        .remove(&plan_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn content_backup_commands_are_main_window_only() {
        assert!(main_only("main").is_ok());
        for label in ["", "quick-note", "external-1", "main-fake"] {
            assert!(main_only(label).is_err())
        }
    }
    #[test]
    fn content_jobs_are_exclusive_and_cancellable_without_acknowledging_commit() {
        let op = Operation::new("native-content-test".into()).unwrap();
        assert!(Operation::new("another-content-test".into()).is_err());
        assert!(op.control.cancel());
        assert!(op.control.check().is_err());
        drop(op);
        assert!(Operation::new("another-content-test".into()).is_ok());
    }
}
