use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct WindowDrafts(pub Mutex<HashMap<String, bool>>);

#[tauri::command]
pub fn set_window_dirty(window: tauri::Window, dirty: bool) -> Result<(), String> {
    window.state::<WindowDrafts>().0.lock().map_err(|_| "无法确认未保存状态")?
        .insert(window.label().to_string(), dirty);
    Ok(())
}

pub fn ensure_saved(app: &tauri::AppHandle, confirmed_window: Option<&str>) -> Result<(), String> {
    let state = app.state::<WindowDrafts>();
    let drafts = state.0.lock().map_err(|_| "无法确认未保存状态，请稍后重试")?;
    for (label, window) in app.webview_windows() {
        if Some(label.as_str()) != confirmed_window && drafts.get(&label) != Some(&false) {
            let _ = window.show();
            let _ = window.set_focus();
            return Err("有窗口尚未就绪或包含未保存内容。请先保存或关闭该窗口，然后重试。".into());
        }
    }
    Ok(())
}
