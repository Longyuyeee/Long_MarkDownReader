//! Idempotent quick capture: one immutable operation id addresses one Markdown file.
use crate::services::{reliable_write::write_new_bytes, workspace_guard::WorkspaceGuard};
use std::{fs, io::ErrorKind, path::Path, sync::Mutex};
use tauri::Manager;

#[tauri::command]
pub async fn open_quick_note(app: tauri::AppHandle) -> Result<(), String> {
    open_quick_note_window(app)
}

pub fn open_quick_note_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-note") {
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "quick-note",
        tauri::WebviewUrl::App("#/quick-note".into()),
    )
    .title("快速笔记")
    .inner_size(560.0, 460.0)
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
}

static CAPTURE_LOCK: Mutex<()> = Mutex::new(());

fn matching_file(path: &Path, content: &str) -> Result<bool, String> {
    match fs::read(path) {
        Ok(bytes) if bytes == content.as_bytes() => Ok(true),
        Ok(_) => Err(format!("该记录已保存但内容不同；不会覆盖已有文件，请先检查：{}", path.display())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("无法核对已保存记录：{error}")),
    }
}

fn capture(
    root: &str,
    directory: &str,
    operation_id: &str,
    content: &str,
) -> Result<String, String> {
    if operation_id.len() != 32 || !operation_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("无效的快速笔记操作标识".into());
    }
    if content.trim().is_empty() || content.len() > 8 * 1024 * 1024 {
        return Err("笔记不能为空或超过 8 MiB".into());
    }
    let _lock = CAPTURE_LOCK.lock().map_err(|_| "快速笔记保存锁不可用")?;
    let guard = WorkspaceGuard::new(root)?;
    let directory = guard.resolve_for_write(directory)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = guard.resolve_for_write(directory.join(format!("快速笔记_{operation_id}.md")))?;
    if matching_file(&path, content)? {
        return Ok(path.to_string_lossy().into_owned());
    }
    if let Err(error) = write_new_bytes(&path, content.as_bytes()) {
        // Promotion may have succeeded even if sidecar cleanup / the receipt failed.
        if !matching_file(&path, content)? {
            return Err(error);
        }
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn save_quick_note(
    library_root: String,
    target_dir: String,
    operation_id: String,
    content: String,
) -> Result<String, String> {
    capture(&library_root, &target_dir, &operation_id, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "0123456789abcdef0123456789abcdef";
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn fixture() -> Fixture {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "longedit-quick-note-test-{}-{nonce}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Fixture(path)
    }
    #[test]
    fn lost_receipt_retry_returns_same_file_and_content() {
        let root = fixture();
        let r = root.path().to_str().unwrap();
        let first = capture(r, r, ID, "会议笔记").unwrap();
        assert_eq!(capture(r, r, ID, "会议笔记").unwrap(), first);
        assert_eq!(fs::read_to_string(first).unwrap(), "会议笔记");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[test]
    fn changed_content_never_overwrites_same_operation() {
        let root = fixture();
        let r = root.path().to_str().unwrap();
        let p = capture(r, r, ID, "original").unwrap();
        assert!(capture(r, r, ID, "changed").is_err());
        assert_eq!(fs::read_to_string(p).unwrap(), "original");
    }
    #[test]
    fn validates_id_and_workspace_boundary() {
        let root = fixture();
        let outside = fixture();
        let r = root.path().to_str().unwrap();
        assert!(capture(r, r, "../../escape", "body").is_err());
        assert!(capture(r, outside.path().to_str().unwrap(), ID, "body").is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }
    #[test]
    fn failed_destination_can_be_repaired_without_duplicate() {
        let root = fixture();
        let r = root.path().to_str().unwrap();
        let dir = root.path().join("Inbox");
        fs::write(&dir, "occupied").unwrap();
        assert!(capture(r, dir.to_str().unwrap(), ID, "body").is_err());
        fs::remove_file(&dir).unwrap();
        capture(r, dir.to_str().unwrap(), ID, "body").unwrap();
        capture(r, dir.to_str().unwrap(), ID, "body").unwrap();
        assert_eq!(fs::read_dir(dir).unwrap().count(), 1);
    }
    #[test]
    fn concurrent_same_operation_produces_one_file() {
        let root = fixture();
        let r = root.path().to_str().unwrap().to_owned();
        let tasks: Vec<_> = (0..4)
            .map(|_| {
                let r = r.clone();
                std::thread::spawn(move || capture(&r, &r, ID, "body").unwrap())
            })
            .collect();
        let paths: Vec<_> = tasks.into_iter().map(|t| t.join().unwrap()).collect();
        assert!(paths.iter().all(|p| p == &paths[0]));
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
}
