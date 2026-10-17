//! Portable work-session metadata. Never reads document bodies or writes a vault.
use crate::services::{reliable_write::write_new_bytes, workspace_guard::WorkspaceGuard};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, io::Read, path::Path};
use tauri::Manager;

const MAX_BYTES: u64 = 256 * 1024;
const MAX_FILES: usize = 128;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableView {
    scroll_top: f64,
    scroll_left: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    zoom: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frozen_columns: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pan_x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pan_y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fit_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sidebar_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    panel_open: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    section: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sidebar_tab: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableFile {
    relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    view: Option<PortableView>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableSearch {
    query: String,
    types: Vec<String>,
    scroll: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    loaded_files: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableReference {
    relative_path: String,
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    annotation_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableWorkSession {
    kind: String,
    schema_version: u32,
    name: String,
    saved_at: u64,
    files: Vec<PortableFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    search: Option<PortableSearch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference: Option<PortableReference>,
}
fn text(value: &str, max: usize, empty: bool) -> Result<(), String> {
    if value.chars().count() > max
        || (!empty && value.trim().is_empty())
        || value.chars().any(char::is_control)
    {
        return Err("现场文字为空、过长或含控制字符".into());
    }
    Ok(())
}
fn relative(value: &str) -> Result<(), String> {
    text(value, 1024, false)?;
    for part in value.split('/') {
        let lower = part.to_lowercase();
        let stem = lower.split('.').next().unwrap_or("");
        let device = matches!(stem, "con" | "prn" | "aux" | "nul")
            || ["com", "lpt"].iter().any(|prefix| {
                stem.strip_prefix(prefix).is_some_and(|suffix| {
                    suffix.chars().count() == 1 && "123456789¹²³".contains(suffix)
                })
            });
        if part.is_empty()
            || matches!(part, "." | "..")
            || part.contains(['\\', ':', '*', '?', '"', '<', '>', '|'])
            || part.ends_with([' ', '.'])
            || device
            || matches!(
                lower.as_str(),
                ".longedit" | ".git" | ".misty" | ".history" | ".misty_order.json"
            )
        {
            return Err("文件位置必须是库内普通相对路径，不能越界或指向私有目录".into());
        }
    }
    Ok(())
}
fn range(value: f64, min: f64, max: f64) -> Result<(), String> {
    if value.is_finite() && value >= min && value <= max {
        Ok(())
    } else {
        Err("现场阅读位置超出有效范围".into())
    }
}
fn validate(bundle: &PortableWorkSession) -> Result<(), String> {
    if bundle.kind != "longedit-work-session" || bundle.schema_version != 1 {
        return Err("这不是支持的 Long编辑工作现场文件".into());
    }
    text(&bundle.name, 60, false)?;
    if bundle.saved_at > 9_007_199_254_740_991
        || bundle.files.is_empty()
        || bundle.files.len() > MAX_FILES
    {
        return Err("现场需包含 1–128 份文件及有效保存时间".into());
    }
    let mut seen = HashSet::new();
    for file in &bundle.files {
        relative(&file.relative_path)?;
        if !seen.insert(file.relative_path.to_lowercase()) {
            return Err("现场含重复文件位置".into());
        }
        if let Some(view) = &file.view {
            range(view.scroll_top, 0., 1e9)?;
            range(view.scroll_left, 0., 1e9)?;
            if let Some(value) = view.zoom {
                range(value, 0.05, 16.)?;
            }
            if let Some(value) = view.frozen_columns {
                range(value, 0., 1000.)?;
            }
            for value in [view.pan_x, view.pan_y].into_iter().flatten() {
                range(value, -1e7, 1e7)?;
            }
            for value in [&view.section, &view.sidebar_tab, &view.mode]
                .into_iter()
                .flatten()
            {
                text(value, 200, true)?;
                let normalized = value.replace('\\', "/");
                let drive = value.as_bytes().get(1) == Some(&b':')
                    && value
                        .as_bytes()
                        .first()
                        .is_some_and(u8::is_ascii_alphabetic);
                if normalized.starts_with('/')
                    || drive
                    || value.contains("://")
                    || normalized.split('/').any(|part| part == "..")
                {
                    return Err("视图位置不能包含文件系统路径".into());
                }
            }
        }
    }
    if let Some(active) = &bundle.active_path {
        relative(active)?;
        if !seen.contains(&active.to_lowercase()) {
            return Err("活动文件不在现场清单中".into());
        }
    }
    if let Some(search) = &bundle.search {
        text(&search.query, 500, true)?;
        range(search.scroll, 0., 1e9)?;
        if search.types.len() > 8
            || search.types.iter().any(|kind| {
                kind.is_empty()
                    || kind.len() > 40
                    || !kind.as_bytes()[0].is_ascii_lowercase()
                    || !kind
                        .bytes()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            })
            || search.loaded_files.is_some_and(|n| n > 10000)
            || search
                .sort
                .as_ref()
                .is_some_and(|s| s != "relevance" && s != "modified")
        {
            return Err("搜索条件格式无效".into());
        }
    }
    if let Some(reference) = &bundle.reference {
        relative(&reference.relative_path)?;
        text(&reference.query, 500, true)?;
        if reference.page.is_some_and(|n| n == 0 || n > 100000) {
            return Err("参考页码无效".into());
        }
        if let Some(id) = &reference.annotation_id {
            text(id, 200, false)?;
        }
    }
    if serde_json::to_vec(bundle).map_err(|e| e.to_string())?.len() as u64 > MAX_BYTES {
        return Err("现场文件超过 256 KiB".into());
    }
    Ok(())
}
fn bundle_path(value: &str) -> Result<&Path, String> {
    text(value, 32760, false)?;
    let path = Path::new(value);
    if !path.is_absolute()
        || !path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|name| name.to_lowercase().ends_with(".longedit-session.json"))
    {
        return Err("请选择绝对位置的 .longedit-session.json 现场文件".into());
    }
    // A suffixed name is not sufficient on Windows: ADS and DOS devices must
    // not turn a metadata export into a hidden write on an existing document.
    relative(
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    )?;
    Ok(path)
}
fn export_bundle(target: &str, bundle: &PortableWorkSession) -> Result<(), String> {
    let path = bundle_path(target)?;
    validate(bundle)?;
    let bytes = serde_json::to_vec_pretty(bundle).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("现场文件超过 256 KiB".into());
    }
    // A new target only: never overwrite a document or an earlier export.
    write_new_bytes(path, &bytes)
}
fn read_bundle(source: &str) -> Result<PortableWorkSession, String> {
    let path = bundle_path(source)?;
    if !fs::metadata(path).is_ok_and(|metadata| metadata.is_file()) {
        return Err("请选择可读取的普通现场文件".into());
    }
    let file =
        fs::File::open(path).map_err(|_| "无法读取现场文件，请核对位置和访问权限".to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "读取现场文件失败".to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("现场文件超过 256 KiB".into());
    }
    let content =
        std::str::from_utf8(&bytes).map_err(|_| "现场文件需要使用 UTF-8 编码".to_string())?;
    let bundle = serde_json::from_str(content.trim_start_matches('\u{feff}'))
        .map_err(|_| "现场结构无效或含不支持的字段，原记录未改变".to_string())?;
    validate(&bundle)?;
    Ok(bundle)
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFileCheck {
    relative_path: String,
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPreflight {
    library_root: String,
    files: Vec<SessionFileCheck>,
}
fn configured_guard(root: &str, libraries: &[String]) -> Result<WorkspaceGuard, String> {
    let guard = WorkspaceGuard::new(root)?;
    if !libraries
        .iter()
        .any(|entry| fs::canonicalize(entry).is_ok_and(|path| path == guard.root()))
    {
        return Err("目标必须是已配置的资料库".into());
    }
    Ok(guard)
}
fn checked_file(guard: &WorkspaceGuard, requested_root: &str, value: &str) -> SessionFileCheck {
    let fail = |state, reason: &str| SessionFileCheck {
        relative_path: value.into(),
        state,
        path: None,
        reason: Some(reason.into()),
    };
    let logical = Path::new(requested_root).join(value);
    let resolved = match fs::canonicalize(&logical) {
        Ok(path) => path,
        Err(error) => {
            return if error.kind() == std::io::ErrorKind::NotFound {
                fail("missing", "未找到文件")
            } else {
                fail("unavailable", "文件无法访问，请核对权限或连接")
            }
        }
    };
    let path = match super::file_management::visible_item(guard, &resolved.to_string_lossy(), true)
    {
        Ok(path) => path,
        Err(_) => return fail("unavailable", "文件超出资料库范围或属于内部配置"),
    };
    let rel = match path.strip_prefix(guard.root()) {
        Ok(path) => path.to_string_lossy().replace('\\', "/"),
        Err(_) => return fail("unavailable", "文件位置无效"),
    };
    if relative(&rel).is_err()
        || crate::formats::file_registry::is_sensitive_path(&path)
        || crate::formats::file_registry::is_sensitive_path(&logical)
    {
        return fail("unavailable", "内部配置或敏感文件不能恢复到工作区");
    }
    let meta = match fs::metadata(&path) {
        Ok(meta) if meta.is_file() => meta,
        _ => return fail("unavailable", "此位置不是可用的普通文件"),
    };
    let format = match crate::formats::file_registry::file_format_for_path(&path) {
        Ok(format) => format,
        Err(_) => return fail("unsupported", "当前版本不支持此文件类型"),
    };
    if !crate::formats::file_registry::file_format_for_path(&logical)
        .is_ok_and(|source| source.id == format.id)
    {
        return fail("unsupported", "文件别名与真实文件类型不一致，请重新定位");
    }
    if meta.len() > format.max_bytes {
        return fail("unsupported", "文件超过当前格式的打开上限");
    }
    if fs::File::open(&path).is_err() {
        return fail("unavailable", "文件暂时无法读取");
    }
    // Keep the configured-root spelling so local persistence keys do not migrate
    // merely because Windows canonicalize adds an extended/8.3 resolved prefix.
    SessionFileCheck {
        relative_path: value.into(),
        state: "ready",
        path: Some(logical.to_string_lossy().into_owned()),
        reason: None,
    }
}
fn preflight(
    root: &str,
    paths: &[String],
    libraries: &[String],
) -> Result<SessionPreflight, String> {
    if paths.is_empty() || paths.len() > MAX_FILES + 1 {
        return Err("预检需包含 1–129 个文件位置".into());
    }
    let mut seen = HashSet::new();
    for value in paths {
        relative(value)?;
        if !seen.insert(value.to_lowercase()) {
            return Err("预检文件位置重复".into());
        }
    }
    let guard = configured_guard(root, libraries)?;
    Ok(SessionPreflight {
        library_root: root.into(),
        files: paths
            .iter()
            .map(|value| checked_file(&guard, root, value))
            .collect(),
    })
}
fn locate(root: &str, selected: &str, libraries: &[String]) -> Result<SessionFileCheck, String> {
    let guard = configured_guard(root, libraries)?;
    let path = guard.resolve_existing(selected)?;
    let rel = path
        .strip_prefix(guard.root())
        .map_err(|_| "目标不属于所选资料库".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    relative(&rel)?;
    let result = checked_file(&guard, root, &rel);
    if result.state != "ready" {
        return Err(result.reason.unwrap_or_else(|| "无法使用所选文件".into()));
    }
    Ok(result)
}
fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只能在主工作台管理工作现场".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn export_work_session_bundle(
    window: tauri::WebviewWindow,
    target_path: String,
    bundle: PortableWorkSession,
) -> Result<(), String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || export_bundle(&target_path, &bundle))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_work_session_bundle(
    window: tauri::WebviewWindow,
    source_path: String,
) -> Result<PortableWorkSession, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || read_bundle(&source_path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn preflight_work_session(
    window: tauri::WebviewWindow,
    library_root: String,
    relative_paths: Vec<String>,
) -> Result<SessionPreflight, String> {
    main_window(&window)?;
    let libraries = super::config::get_config(window.app_handle().clone())
        .libraries
        .into_iter()
        .map(|lib| lib.path)
        .collect::<Vec<_>>();
    tauri::async_runtime::spawn_blocking(move || {
        preflight(&library_root, &relative_paths, &libraries)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn locate_work_session_file(
    window: tauri::WebviewWindow,
    library_root: String,
    path: String,
) -> Result<SessionFileCheck, String> {
    main_window(&window)?;
    let libraries = super::config::get_config(window.app_handle().clone())
        .libraries
        .into_iter()
        .map(|lib| lib.path)
        .collect::<Vec<_>>();
    tauri::async_runtime::spawn_blocking(move || locate(&library_root, &path, &libraries))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::test_workspace::TestWorkspace;
    fn sample() -> PortableWorkSession {
        serde_json::from_value(serde_json::json!({"kind":"longedit-work-session","schemaVersion":1,"name":"周五交付","savedAt":100,"files":[{"relativePath":"纪要.md","pinned":true,"view":{"scrollTop":12,"scrollLeft":0,"section":"7"}},{"relativePath":"缺失.pdf"}],"activePath":"纪要.md","search":{"query":"预算 -旧版","types":["markdown"],"scroll":123,"loadedFiles":80,"sort":"modified"},"reference":{"relativePath":"缺失.pdf","query":"预算","page":7}})).unwrap()
    }
    #[test]
    fn bundle_roundtrip_bom_and_new_target_never_overwrite_files() {
        let temp = TestWorkspace::new();
        let target = temp.0.join("现场.longedit-session.json");
        export_bundle(target.to_str().unwrap(), &sample()).unwrap();
        let before = fs::read(&target).unwrap();
        assert_eq!(
            read_bundle(target.to_str().unwrap()).unwrap().files.len(),
            2
        );
        assert!(export_bundle(target.to_str().unwrap(), &sample()).is_err());
        assert_eq!(fs::read(&target).unwrap(), before);
        let bom = temp.0.join("bom.longedit-session.json");
        fs::write(
            &bom,
            format!("\u{feff}{}", String::from_utf8(before).unwrap()),
        )
        .unwrap();
        assert!(read_bundle(bom.to_str().unwrap()).is_ok());
        assert!(export_bundle(temp.0.join("original.md").to_str().unwrap(), &sample()).is_err());
        assert!(!temp.0.join("original.md").exists());
    }
    #[test]
    fn rejects_injected_content_private_roots_bad_schema_duplicates_and_ranges() {
        let temp = TestWorkspace::new();
        let target = temp.0.join("bad.longedit-session.json");
        for (field, value) in [
            ("content", serde_json::json!("PRIVATE")),
            ("libraryRoot", serde_json::json!("C:/private")),
            ("schemaVersion", serde_json::json!(2)),
        ] {
            let mut input = serde_json::to_value(sample()).unwrap();
            input[field] = value;
            fs::write(&target, input.to_string()).unwrap();
            assert!(read_bundle(target.to_str().unwrap()).is_err());
        }
        let mut b = sample();
        b.files.push(b.files[0].clone());
        assert!(validate(&b).is_err());
        b = sample();
        b.search.as_mut().unwrap().scroll = -1.;
        assert!(validate(&b).is_err());
        b = sample();
        b.files[0].view.as_mut().unwrap().section = Some("C:/private".into());
        assert!(validate(&b).is_err());
        fs::File::create(&target)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(read_bundle(target.to_str().unwrap())
            .unwrap_err()
            .contains("256 KiB"));
    }
    #[test]
    fn rejects_absolute_traversal_windows_devices_private_metadata_and_controls() {
        for value in [
            "../secret.md",
            "C:/note.md",
            "/note.md",
            "a\\b.md",
            "a//b.md",
            "a/./b.md",
            "a/../b.md",
            "a/.longedit/config.json",
            ".git/index",
            "con.md",
            "NUL.txt",
            "COM¹.txt",
            "a/COM1.json",
            "a/file.",
            "a /b.md",
            "a/b:stream",
            "a\0b.md",
        ] {
            assert!(relative(value).is_err(), "{value}");
        }
        assert!(relative("中文 & #/会议纪要.md").is_ok());
    }
    #[test]
    fn preflight_readable_missing_unsupported_and_private_without_reading_document_bodies() {
        let temp = TestWorkspace::new();
        fs::write(temp.0.join("纪要.md"), "PRIVATE BODY").unwrap();
        fs::write(temp.0.join("program.exe"), "NOT EXECUTABLE").unwrap();
        fs::write(temp.0.join("secrets.json"), "PRIVATE KEY").unwrap();
        let paths = vec![
            "纪要.md".into(),
            "缺失.pdf".into(),
            "program.exe".into(),
            "secrets.json".into(),
        ];
        let result = preflight(&temp.root(), &paths, &[temp.root()]).unwrap();
        assert_eq!(
            result.files.iter().map(|f| f.state).collect::<Vec<_>>(),
            ["ready", "missing", "unsupported", "unavailable"]
        );
        let raw = serde_json::to_string(&result).unwrap();
        assert!(!raw.contains("PRIVATE"));
        assert_eq!(
            fs::read_to_string(temp.0.join("纪要.md")).unwrap(),
            "PRIVATE BODY"
        );
        assert!(preflight(&temp.root(), &paths, &[]).is_err());
    }
    #[test]
    fn relocation_accepts_only_a_real_readable_file_inside_the_configured_library() {
        let temp = TestWorkspace::new();
        let inside = temp.0.join("纪要.md");
        fs::write(&inside, "KEEP").unwrap();
        let other = TestWorkspace::new();
        fs::write(other.0.join("outside.md"), "OUTSIDE").unwrap();
        assert_eq!(
            locate(&temp.root(), inside.to_str().unwrap(), &[temp.root()])
                .unwrap()
                .relative_path,
            "纪要.md"
        );
        assert!(locate(
            &temp.root(),
            other.0.join("outside.md").to_str().unwrap(),
            &[temp.root()]
        )
        .is_err());
        assert!(locate(&temp.root(), &temp.root(), &[temp.root()]).is_err());
    }
    #[test]
    fn bounded_preflight_accepts_128_files_plus_a_reference_but_rejects_extra_duplicates_and_traversal(
    ) {
        let temp = TestWorkspace::new();
        let mut paths = (0..129).map(|n| format!("缺失-{n}.md")).collect::<Vec<_>>();
        assert_eq!(
            preflight(&temp.root(), &paths, &[temp.root()])
                .unwrap()
                .files
                .len(),
            129
        );
        paths.push("额外.md".into());
        assert!(preflight(&temp.root(), &paths, &[temp.root()]).is_err());
        assert!(preflight(&temp.root(), &[], &[temp.root()]).is_err());
        assert!(preflight(
            &temp.root(),
            &["note.md".into(), "NOTE.MD".into()],
            &[temp.root()]
        )
        .is_err());
        assert!(preflight(&temp.root(), &["../outside.md".into()], &[temp.root()]).is_err());
        let mut bundle = sample();
        bundle.files = (0..128)
            .map(|n| PortableFile {
                relative_path: format!("文件-{n}.md"),
                pinned: None,
                view: None,
            })
            .collect();
        bundle.active_path = None;
        assert!(validate(&bundle).is_ok());
        bundle.files.push(PortableFile {
            relative_path: "额外.md".into(),
            pinned: None,
            view: None,
        });
        assert!(validate(&bundle).is_err());
    }
    #[test]
    fn unavailable_directories_oversize_files_and_invalid_utf8_never_change_original_data() {
        let temp = TestWorkspace::new();
        fs::create_dir(temp.0.join("目录.md")).unwrap();
        let huge = temp.0.join("超限.md");
        let limit = crate::formats::file_registry::file_format_for_path(&huge)
            .unwrap()
            .max_bytes;
        fs::File::create(&huge).unwrap().set_len(limit + 1).unwrap();
        let result = preflight(
            &temp.root(),
            &["目录.md".into(), "超限.md".into()],
            &[temp.root()],
        )
        .unwrap();
        assert_eq!(
            result.files.iter().map(|f| f.state).collect::<Vec<_>>(),
            ["unavailable", "unsupported"]
        );
        assert!(result.files.iter().all(|f| f.path.is_none()));
        assert_eq!(fs::metadata(huge).unwrap().len(), limit + 1);
        let invalid = temp.0.join("坏编码.longedit-session.json");
        let bytes = [0xff, 0xfe, 0, 1];
        fs::write(&invalid, bytes).unwrap();
        assert!(read_bundle(invalid.to_str().unwrap())
            .unwrap_err()
            .contains("UTF-8"));
        assert_eq!(fs::read(invalid).unwrap(), bytes);
    }
    #[test]
    fn import_rejects_nested_body_fields_nulls_unsupported_references_and_non_finite_view_values() {
        let temp = TestWorkspace::new();
        let path = temp.0.join("invalid.longedit-session.json");
        let mut nested = serde_json::to_value(sample()).unwrap();
        nested["files"][0]["view"]["draft"] = serde_json::json!("PRIVATE BODY");
        fs::write(&path, nested.to_string()).unwrap();
        let before = fs::read(&path).unwrap();
        assert!(read_bundle(path.to_str().unwrap()).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::write(&path, "null").unwrap();
        assert!(read_bundle(path.to_str().unwrap()).is_err());
        let mut bundle = sample();
        bundle.reference.as_mut().unwrap().page = Some(0);
        assert!(validate(&bundle).is_err());
        bundle = sample();
        bundle.files[0].view.as_mut().unwrap().scroll_top = f64::NAN;
        assert!(validate(&bundle).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn bundle_names_cannot_address_windows_streams_devices_or_directories() {
        let temp = TestWorkspace::new();
        for name in [
            "original.md:secret.longedit-session.json",
            "CON.longedit-session.json",
            "nul.longedit-session.json",
            "LPT¹.longedit-session.json",
        ] {
            assert!(
                bundle_path(temp.0.join(name).to_str().unwrap()).is_err(),
                "{name}"
            );
        }
        let directory = temp.0.join("目录.longedit-session.json");
        fs::create_dir(&directory).unwrap();
        assert!(read_bundle(directory.to_str().unwrap()).is_err());
        assert!(!temp.0.join("original.md").exists());
    }
    #[test]
    fn internal_view_identifiers_allow_page_separators_but_not_absolute_or_escaping_paths() {
        let mut bundle = sample();
        bundle.files[0].view.as_mut().unwrap().section = Some("diagram/page:review".into());
        assert!(validate(&bundle).is_ok());
        for section in [
            "C:/private",
            "C:private",
            "/home/private",
            "\\\\server\\private",
            "file:///C:/private",
            "../private",
        ] {
            bundle.files[0].view.as_mut().unwrap().section = Some(section.into());
            assert!(validate(&bundle).is_err(), "{section}");
        }
    }
    #[cfg(windows)]
    #[test]
    fn directory_alias_escape_is_reported_unavailable_and_never_exposes_an_outside_path() {
        let temp = TestWorkspace::new();
        let other = TestWorkspace::new();
        fs::write(other.0.join("outside.md"), "OUTSIDE PRIVATE").unwrap();
        let output = std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                temp.0.join("alias").to_str().unwrap(),
                other.0.to_str().unwrap(),
            ])
            .output()
            .unwrap();
        assert!(output.status.success());
        let result = preflight(&temp.root(), &["alias/outside.md".into()], &[temp.root()]).unwrap();
        assert_eq!(result.files[0].state, "unavailable");
        assert!(result.files[0].path.is_none());
        // Remove the owned junction itself before TestWorkspace cleanup.
        fs::remove_dir(temp.0.join("alias")).unwrap();
        assert_eq!(
            fs::read_to_string(other.0.join("outside.md")).unwrap(),
            "OUTSIDE PRIVATE"
        );
    }
    #[cfg(windows)]
    #[test]
    fn an_in_library_directory_alias_cannot_reveal_private_metadata() {
        let temp = TestWorkspace::new();
        let private = temp.0.join(".longedit");
        fs::create_dir(&private).unwrap();
        fs::write(private.join("config.json"), "PRIVATE CONFIG").unwrap();
        let alias = temp.0.join("普通文件夹");
        let output = std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                alias.to_str().unwrap(),
                private.to_str().unwrap(),
            ])
            .output()
            .unwrap();
        assert!(output.status.success());
        let result = preflight(
            &temp.root(),
            &["普通文件夹/config.json".into()],
            &[temp.root()],
        )
        .unwrap();
        assert_eq!(result.files[0].state, "unavailable");
        assert!(result.files[0].path.is_none());
        assert!(locate(
            &temp.root(),
            alias.join("config.json").to_str().unwrap(),
            &[temp.root()]
        )
        .is_err());
        fs::remove_dir(alias).unwrap();
        assert_eq!(
            fs::read_to_string(private.join("config.json")).unwrap(),
            "PRIVATE CONFIG"
        );
    }
}
