#[cfg(any(target_os = "android", test))]
mod metadata;
#[cfg(target_os = "android")]
mod android {
use super::metadata::MetadataStore;
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex};
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, AppHandle, Manager, Runtime};
struct Storage<R: Runtime> { handle: PluginHandle<R>, metadata: Mutex<Option<MetadataStore>> }
#[tauri::command]
async fn execute<R: Runtime>(app: AppHandle<R>, payload: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Storage<R>>();
        if MetadataStore::handles(payload.get("op").and_then(Value::as_str).unwrap_or("")) {
            let mut metadata = state.metadata.lock().map_err(|_| "READ_FAILED: 本机记录正在关闭，请重新打开后重试。".to_string())?;
            if metadata.is_none() {
                let directory: Value = state.handle.run_mobile_plugin("execute", serde_json::json!({"op":"metadataDirectory"})).map_err(|e| e.to_string())?;
                let path = directory.get("path").and_then(Value::as_str).ok_or("READ_FAILED: 本机记录目录无法核对。")?;
                *metadata = Some(MetadataStore::new(PathBuf::from(path))?);
            }
            return metadata.as_mut().expect("initialized").execute(payload);
        }
        state.handle.run_mobile_plugin("execute", payload).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile-storage").invoke_handler(tauri::generate_handler![execute])
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.longyuye.longedit.storage", "StoragePlugin")?;
            app.manage(Storage { handle, metadata: Mutex::new(None) });
            Ok(())
        }).build()
}
}
#[cfg(target_os = "android")]
pub use android::init;
