//! Fresh, short editing protection for the paths a relocation may change.
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Notice {
    pub root: String,
    pub old_path: String,
    pub new_path: String,
    pub documents: Vec<String>,
    pub content_only: bool,
}
struct Pending {
    waiting: BTreeSet<String>,
    sender: mpsc::Sender<Result<(), String>>,
    context: Option<DraftContext>,
}
#[derive(Clone)]
struct DraftContext {
    root: PathBuf,
    source: PathBuf,
    target: PathBuf,
}
#[derive(serde::Deserialize)]
pub struct DraftSnapshot {
    path: String,
    content: Option<String>,
}
#[derive(Default)]
struct Registry {
    pending: BTreeMap<String, Pending>,
    releasing: BTreeMap<String, Pending>,
    finished: BTreeMap<String, Option<Notice>>,
}
fn registry() -> &'static Mutex<Registry> {
    static R: OnceLock<Mutex<Registry>> = OnceLock::new();
    R.get_or_init(Mutex::default)
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    request_id: String,
    library_root: String,
    paths: Vec<String>,
    rewrite_paths: Vec<String>,
    source_paths: Vec<String>,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Release {
    request_id: String,
    notice: Option<Notice>,
}
pub(crate) struct Protection {
    app: tauri::AppHandle,
    id: String,
    notice: Option<Notice>,
    labels: BTreeSet<String>,
}
impl Protection {
    pub(crate) fn begin(
        app: &tauri::AppHandle,
        root: &std::path::Path,
        paths: &[PathBuf],
        rewrite_paths: &[PathBuf],
    ) -> Result<Self, String> {
        let context = DraftContext {
            root: root.to_owned(),
            source: paths.first().ok_or("缺少移动来源")?.clone(),
            target: paths.get(1).ok_or("缺少移动目标")?.clone(),
        };
        Self::begin_checked(app, root, paths, rewrite_paths, Some(context))
    }
    pub(crate) fn begin_content_edit(
        app: &tauri::AppHandle,
        root: &std::path::Path,
        paths: &[PathBuf],
    ) -> Result<Self, String> {
        if paths.is_empty() {
            return Err("尚未选择需要修改的笔记".into());
        }
        Self::begin_checked(app, root, paths, paths, None)
    }
    fn begin_checked(
        app: &tauri::AppHandle,
        root: &std::path::Path,
        paths: &[PathBuf],
        rewrite_paths: &[PathBuf],
        context: Option<DraftContext>,
    ) -> Result<Self, String> {
        let source_paths = context
            .as_ref()
            .map(|context| vec![context.source.to_string_lossy().into_owned()])
            .unwrap_or_default();
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let id = format!(
            "move-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let windows = app.webview_windows();
        if windows.is_empty() {
            return Err("没有可核对的编辑窗口，尚未移动".into());
        }
        let (sender, receiver) = mpsc::channel();
        registry()
            .lock()
            .map_err(|_| "无法核对编辑窗口")?
            .pending
            .insert(
                id.clone(),
                Pending {
                    waiting: windows.keys().cloned().collect(),
                    sender,
                    context,
                },
            );
        let protection = Self {
            app: app.clone(),
            id: id.clone(),
            notice: None,
            labels: windows.keys().cloned().collect(),
        };
        let request = Request {
            request_id: id,
            library_root: root.to_string_lossy().into_owned(),
            paths: paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
            rewrite_paths: rewrite_paths
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
            source_paths,
        };
        for window in windows.values() {
            window
                .emit("file-move-protect", &request)
                .map_err(|e| format!("无法保护编辑窗口：{e}"))?;
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        for _ in 0..windows.len() {
            receiver
                .recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
                .map_err(|_| "有编辑窗口暂未响应，未修改文件；请稍后重试")??;
        }
        if windows.keys().cloned().collect::<BTreeSet<_>>()
            != app.webview_windows().keys().cloned().collect()
        {
            return Err("编辑窗口已变化，尚未修改文件，请重试".into());
        }
        Ok(protection)
    }
    pub(crate) fn windows_unchanged(&self) -> Result<(), String> {
        if self.labels != self.app.webview_windows().keys().cloned().collect() {
            return Err("编辑窗口已变化，已暂停后续写入；请重新核对".into());
        }
        Ok(())
    }
    pub(crate) fn completed(&mut self, notice: Notice) {
        self.notice = Some(notice);
    }
}
impl Drop for Protection {
    fn drop(&mut self) {
        let (sender, receiver) = mpsc::channel();
        if let Ok(mut r) = registry().lock() {
            r.pending.remove(&self.id);
            if r.finished.len() >= 16 {
                if let Some(id) = r.finished.keys().next().cloned() {
                    r.finished.remove(&id);
                }
            }
            r.finished.insert(self.id.clone(), self.notice.clone());
            if self.notice.is_some() {
                r.releasing.insert(
                    self.id.clone(),
                    Pending {
                        waiting: self.labels.clone(),
                        sender,
                        context: None,
                    },
                );
            }
        }
        let _ = self.app.emit(
            "file-move-release",
            Release {
                request_id: self.id.clone(),
                notice: self.notice.clone(),
            },
        );
        // Finish the model/path refresh before starting the next item in a batch.
        // A closed or unresponsive window cannot keep a completed move blocked.
        if self.notice.is_some() {
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            for _ in &self.labels {
                if receiver
                    .recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
                    .is_err()
                {
                    break;
                }
            }
            if let Ok(mut r) = registry().lock() {
                r.releasing.remove(&self.id);
            }
        }
    }
}
#[tauri::command]
pub fn acknowledge_file_move_release(
    window: tauri::Window,
    request_id: String,
) -> Result<(), String> {
    let mut r = registry().lock().map_err(|_| "无法确认文件位置接续")?;
    if let Some(p) = r.releasing.get_mut(&request_id) {
        if p.waiting.remove(window.label()) {
            let _ = p.sender.send(Ok(()));
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn reply_file_move_protection(
    window: tauri::Window,
    request_id: String,
    ready: bool,
    dirty_paths: Vec<String>,
    drafts: Option<Vec<DraftSnapshot>>,
) -> Result<(), String> {
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let (sender, context) = {
            let mut r = registry().lock().map_err(|_| "无法核对编辑窗口")?;
            let p = r.pending.get_mut(&request_id).ok_or("文件整理确认已结束")?;
            if !p.waiting.remove(&label) {
                return Err("窗口回执重复或已失效".into());
            }
            (p.sender.clone(), p.context.clone())
        };
        let result = if !ready {
            Err("编辑窗口正在初始化或保存，尚未修改文件，请稍后重试".into())
        } else if !dirty_paths.is_empty() {
            Err(format!(
                "以下文档有未保存内容，本次未修改；请先自行保存或取消修改，再重新核对：{}",
                dirty_paths.join("、")
            ))
        } else {
            inspect_drafts(context.as_ref(), &drafts.unwrap_or_default())
        };
        sender
            .send(result)
            .map_err(|_| "文件整理确认已结束".to_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}
fn inspect_drafts(context: Option<&DraftContext>, drafts: &[DraftSnapshot]) -> Result<(), String> {
    let Some(context) = context else {
        return Ok(());
    };
    if drafts.len() > 512
        || drafts
            .iter()
            .map(|draft| draft.content.as_ref().map_or(0, String::len))
            .sum::<usize>()
            > 32 * 1024 * 1024
    {
        return Err("未保存正文较多，请先保存后再整理文件".into());
    }
    let names = if !drafts.is_empty() && context.source.exists() {
        Some(super::file_move_links::moved_names(&context.source)?)
    } else {
        None
    };
    for draft in drafts {
        let path = std::path::Path::new(&draft.path);
        let needs_save = match &draft.content {
            Some(content) if names.is_some() => {
                super::file_move_links::draft_requires_rewrite_with_names(
                    &context.root,
                    &context.source,
                    &context.target,
                    path,
                    content,
                    names.as_ref().unwrap(),
                )?
            }
            _ => true,
        };
        if needs_save {
            return Err(format!(
                "{} 中有尚未保存的链接，请先保存后再整理文件；正文已保留",
                path.file_name().unwrap_or_default().to_string_lossy()
            ));
        }
    }
    Ok(())
}
#[derive(serde::Serialize)]
pub struct ProtectionStatus {
    active: bool,
    notice: Option<Notice>,
}
#[tauri::command]
pub fn file_move_protection_status(request_id: String) -> Result<ProtectionStatus, String> {
    let r = registry().lock().map_err(|_| "无法读取整理状态")?;
    Ok(ProtectionStatus {
        active: r.pending.contains_key(&request_id),
        notice: r.finished.get(&request_id).cloned().flatten(),
    })
}
