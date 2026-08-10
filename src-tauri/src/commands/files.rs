use crate::commands::history::history_dir;
use crate::formats::file_registry::{file_format_for_path, file_format_registry};
use crate::services::external_file_access::{ExternalFileAccess, PendingExternalOpenFiles};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use chardetng::EncodingDetector;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

static RE_MD_IMG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"!\[(?:[^\]]*)\]\(([^)\s]+)").unwrap());
static RE_HTML_IMG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<img[^>]*\ssrc\s*=\s*["']([^"']+)["']"#).unwrap());

pub(crate) fn validate_path_in_root(path: &Path, root: &Path) -> Result<PathBuf, String> {
    WorkspaceGuard::new(root)?.resolve_for_write(path)
}

fn reject_workspace_root(path: &Path, guard: &WorkspaceGuard) -> Result<(), String> {
    if path == guard.root() {
        Err("不能对知识库根目录执行此操作".into())
    } else {
        Ok(())
    }
}

pub(crate) fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|character| {
            !matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
        .collect()
}

fn validate_item_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("名称不能为空".into());
    }
    if name != name.trim() || name.ends_with('.') {
        return Err("名称不能以空格或句点开头或结尾".into());
    }
    if name == "." || name == ".." {
        return Err("名称不能是 . 或 ..".into());
    }
    if name.chars().any(|character| {
        matches!(
            character,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        ) || character.is_control()
    }) {
        return Err("名称包含 Windows 不允许的字符".into());
    }
    let reserved_stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if matches!(
        reserved_stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        return Err("名称使用了 Windows 保留名称".into());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderOrder {
    pub items: Vec<String>,
    #[serde(default)]
    pub pinned: Vec<String>,
}

#[derive(Serialize)]
pub struct FileStats {
    created: u64,
    modified: u64,
    size: u64,
}

#[tauri::command]
pub async fn create_new_file(
    library_root: String,
    target_dir: Option<String>,
    prefix: Option<String>,
) -> Result<String, String> {
    let library_path = PathBuf::from(&library_root);
    let root = if let Some(directory) = target_dir {
        validate_path_in_root(Path::new(&directory), &library_path)?
    } else {
        library_path.clone()
    };
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    }
    let base_name = sanitize_filename(&prefix.unwrap_or_else(|| "未命名".into()));
    if base_name.is_empty() {
        return Err("文件名不能为空".into());
    }
    let mut index = 0;
    let file_path = loop {
        let name = if index == 0 {
            format!("{base_name}.md")
        } else {
            format!("{base_name} {index}.md")
        };
        let candidate = root.join(name);
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    write_utf8(&file_path, "")?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_new_folder(
    library_root: String,
    parent_path: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let parent = guard.resolve_directory(parent_path, false)?;
    let mut index = 0;
    let folder_path = loop {
        let name = if index == 0 {
            "新建文件夹".into()
        } else {
            format!("新建文件夹 {index}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            break candidate;
        }
        index += 1;
    };
    fs::create_dir(&folder_path).map_err(|error| error.to_string())?;
    Ok(folder_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn rename_item(
    app_handle: tauri::AppHandle,
    library_root: String,
    old_path: String,
    new_name: String,
) -> Result<String, String> {
    validate_item_name(&new_name)?;
    let guard = WorkspaceGuard::new(&library_root)?;
    let old = guard.resolve_existing(&old_path)?;
    reject_workspace_root(&old, &guard)?;
    let parent = old.parent().ok_or("无效路径")?;
    let new_path = parent.join(&new_name);
    if new_path.parent() != Some(parent) {
        return Err("文件名包含非法字符".into());
    }
    let new_path = guard.resolve_for_write(&new_path)?;
    if new_path == old {
        return Ok(old.to_string_lossy().into_owned());
    }
    if new_path.exists() {
        return Err("目标目录已存在同名项目，请使用其他名称".into());
    }
    fs::rename(&old, &new_path).map_err(|error| format!("重命名失败: {error}"))?;
    let old_history = history_dir(&app_handle, &old_path)?;
    if old_history.exists() {
        let new_history = history_dir(&app_handle, &new_path.to_string_lossy())?;
        let _ = fs::rename(old_history, new_history);
    }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn move_item(
    app_handle: tauri::AppHandle,
    library_root: String,
    source_path: String,
    target_dir: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source = guard.resolve_existing(&source_path)?;
    reject_workspace_root(&source, &guard)?;
    let target = guard.resolve_directory(&target_dir, false)?;
    let file_name = source.file_name().ok_or("无效文件名")?;
    let new_path = target.join(file_name);
    if new_path.exists() {
        return Err("目标目录已存在同名项".into());
    }
    let new_path = guard.resolve_for_write(&new_path)?;
    fs::rename(&source, &new_path).map_err(|error| error.to_string())?;
    let old_history = history_dir(&app_handle, &source_path)?;
    if old_history.exists() {
        let new_history = history_dir(&app_handle, &new_path.to_string_lossy())?;
        let _ = fs::rename(old_history, new_history);
    }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn move_items(
    app_handle: tauri::AppHandle,
    library_root: String,
    source_paths: Vec<String>,
    target_dir: String,
) -> Result<(), String> {
    for source_path in source_paths {
        move_item(
            app_handle.clone(),
            library_root.clone(),
            source_path,
            target_dir.clone(),
        )
        .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_item(
    app_handle: tauri::AppHandle,
    library_root: String,
    path: String,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let target = guard.resolve_for_write(&path)?;
    reject_workspace_root(&target, &guard)?;
    if !target.exists() {
        return Ok(());
    }
    if target.is_file() && path.ends_with(".md") {
        delete_local_markdown_assets(&target)?;
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|error| format!("删除目录失败: {error}"))?;
    } else {
        fs::remove_file(&target).map_err(|error| format!("删除文件失败: {error}"))?;
    }
    let cached_history = history_dir(&app_handle, &path)?;
    if cached_history.exists() {
        let _ = fs::remove_dir_all(cached_history);
    }
    Ok(())
}

fn delete_local_markdown_assets(markdown_path: &Path) -> Result<(), String> {
    let Ok(content) = fs::read_to_string(markdown_path) else {
        return Ok(());
    };
    let parent = markdown_path.parent().ok_or("无效路径")?;
    for relative_path in referenced_assets(&content) {
        if relative_path.starts_with("http") || relative_path.starts_with("data:") {
            continue;
        }
        let clean_relative = relative_path
            .split('?')
            .next()
            .unwrap_or(&relative_path)
            .replace("%20", " ");
        if let Ok(asset_path) = validate_path_in_root(&parent.join(clean_relative), parent) {
            if asset_path.is_file() {
                let _ = fs::remove_file(asset_path);
            }
        }
    }
    Ok(())
}

fn referenced_assets(content: &str) -> HashSet<String> {
    RE_MD_IMG
        .captures_iter(content)
        .chain(RE_HTML_IMG.captures_iter(content))
        .map(|capture| capture[1].to_string())
        .collect()
}

#[tauri::command]
pub async fn delete_items(
    app_handle: tauri::AppHandle,
    library_root: String,
    paths: Vec<String>,
) -> Result<(), String> {
    for path in paths {
        delete_item(app_handle.clone(), library_root.clone(), path).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_markdown_file(library_root: String, path: String) -> Result<FileContent, String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &["md"])?;
    read_markdown(path)
}

#[tauri::command]
pub async fn write_markdown_file(
    library_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let path = WorkspaceGuard::new(library_root)?.resolve_file_for_write(path, &["md"])?;
    write_utf8(path, &content)
}

#[tauri::command]
pub async fn read_external_markdown_file(
    access: State<'_, ExternalFileAccess>,
    path: String,
) -> Result<FileContent, String> {
    let path = access.resolve_editable(path)?;
    if file_format_for_path(&path)?.id != "markdown" {
        return Err("外部 Markdown 命令只接受 .md 文件".into());
    }
    read_markdown(path)
}

#[tauri::command]
pub async fn write_external_markdown_file(
    access: State<'_, ExternalFileAccess>,
    path: String,
    content: String,
) -> Result<(), String> {
    let path = access.resolve_editable(path)?;
    if file_format_for_path(&path)?.id != "markdown" {
        return Err("外部 Markdown 命令只接受 .md 文件".into());
    }
    write_utf8(path, &content)
}

#[tauri::command]
pub async fn pick_external_openable_file(
    app_handle: tauri::AppHandle,
    access: State<'_, ExternalFileAccess>,
) -> Result<Option<String>, String> {
    let extensions: Vec<&str> = file_format_registry()?
        .formats
        .iter()
        .filter(|format| matches!(format.external_policy.as_str(), "edit" | "preview"))
        .flat_map(|format| {
            format
                .extensions
                .iter()
                .map(|extension| extension.trim_start_matches('.'))
        })
        .collect();
    let selected = app_handle
        .dialog()
        .file()
        .set_title("打开外部文件")
        .add_filter("可编辑文档与只读媒体", &extensions)
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("Invalid selected path: {error}"))?;
    let path = access.authorize_openable(path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn export_markdown_file(
    app_handle: tauri::AppHandle,
    suggested_name: String,
    content: String,
) -> Result<Option<String>, String> {
    let safe_name = sanitize_filename(&suggested_name);
    let selected = app_handle
        .dialog()
        .file()
        .set_title("Export Markdown file")
        .set_file_name(if safe_name.is_empty() {
            "document.md".to_string()
        } else if safe_name.to_lowercase().ends_with(".md") {
            safe_name
        } else {
            format!("{safe_name}.md")
        })
        .add_filter("Markdown", &["md"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let mut path = selected
        .into_path()
        .map_err(|error| format!("Invalid selected path: {error}"))?;
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        path.set_extension("md");
    }
    write_utf8(&path, &content)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn read_markdown(path: PathBuf) -> Result<FileContent, String> {
    recover_interrupted_write(&path)?;
    let bytes = fs::read(&path).map_err(|error| format!("读取文件失败: {error}"))?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Ok(FileContent {
        content: text.into_owned(),
        encoding: encoding.name().to_string(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn get_launch_args() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
pub fn take_pending_external_open_files(
    pending: State<'_, PendingExternalOpenFiles>,
) -> Result<Vec<String>, String> {
    pending.take_all()
}

#[tauri::command]
pub fn get_folder_order(library_root: String, path: String) -> Result<FolderOrder, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let directory = guard.resolve_directory(path, false)?;
    let order_path = directory.join(".misty_order.json");
    let _ = recover_interrupted_write(&order_path);
    if order_path.exists() {
        Ok(
            serde_json::from_str(&fs::read_to_string(order_path).unwrap_or_default())
                .unwrap_or_default(),
        )
    } else {
        Ok(FolderOrder::default())
    }
}

#[tauri::command]
pub fn save_folder_order(
    library_root: String,
    path: String,
    order: FolderOrder,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let directory = guard.resolve_directory(path, false)?;
    let order_path = directory.join(".misty_order.json");
    let content = serde_json::to_string_pretty(&order).map_err(|error| error.to_string())?;
    write_utf8(order_path, &content)
}

#[tauri::command]
pub async fn scan_directory(library_root: String, path: String) -> Result<Vec<FileEntry>, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let root = guard.resolve_directory(&path, false)?;
    let mut physical_entries = HashMap::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let item_path = entry.path();
            let name = item_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let hidden_resource_directory = item_path.is_dir()
                && matches!(
                    name.as_str(),
                    "public" | "assets" | "img" | "images" | "static"
                )
                || item_path.is_dir() && (name.starts_with('.') || name.ends_with(".assets"));
            if hidden_resource_directory {
                continue;
            }
            if item_path.is_dir() || is_workspace_file(&name) {
                physical_entries.insert(
                    name.clone(),
                    FileEntry {
                        name,
                        path: item_path.to_string_lossy().into_owned(),
                        is_dir: item_path.is_dir(),
                    },
                );
            }
        }
    }
    let order = get_folder_order(library_root, path)?;
    let mut sorted_entries = Vec::new();
    let mut visited = HashSet::new();
    for name in order.pinned.iter().chain(order.items.iter()) {
        if visited.insert(name.clone()) {
            if let Some(entry) = physical_entries.get(name) {
                sorted_entries.push(entry.clone());
            }
        }
    }
    let mut remaining: Vec<_> = physical_entries
        .values()
        .filter(|entry| !visited.contains(&entry.name))
        .cloned()
        .collect();
    remaining.sort_by(|left, right| {
        if left.is_dir != right.is_dir {
            right.is_dir.cmp(&left.is_dir)
        } else {
            left.name.to_lowercase().cmp(&right.name.to_lowercase())
        }
    });
    sorted_entries.extend(remaining);
    Ok(sorted_entries)
}

fn is_workspace_file(name: &str) -> bool {
    file_format_registry()
        .ok()
        .and_then(|registry| registry.by_path(name))
        .is_some()
}

#[tauri::command]
pub async fn get_image_base64(
    library_root: String,
    document_path: String,
    path: String,
) -> Result<String, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(document_path, &["md"])?;
    let image = guard.resolve_existing_file(path, IMAGE_EXTENSIONS)?;
    ensure_markdown_references_image(&document, &image)?;
    encode_image(&image)
}

#[tauri::command]
pub async fn get_external_image_base64(
    access: State<'_, ExternalFileAccess>,
    document_path: String,
    path: String,
) -> Result<String, String> {
    let document = access.resolve_markdown(document_path)?;
    let image = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("图片路径无效: {error}"))?;
    ensure_image_file(&image)?;
    ensure_markdown_references_image(&document, &image)?;
    encode_image(&image)
}

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico"];

fn ensure_image_file(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err("图片路径必须指向文件".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    {
        return Err("不支持的图片格式".into());
    }
    if path.metadata().map_err(|error| error.to_string())?.len() > 50 * 1024 * 1024 {
        return Err("图片不能超过 50 MB".into());
    }
    Ok(())
}

fn ensure_markdown_references_image(document: &Path, image: &Path) -> Result<(), String> {
    ensure_image_file(image)?;
    let image = image
        .canonicalize()
        .map_err(|error| format!("图片路径无效: {error}"))?;
    let content = fs::read_to_string(document).map_err(|error| error.to_string())?;
    let parent = document.parent().ok_or("Markdown 文件没有父目录")?;
    let referenced = referenced_assets(&content).into_iter().any(|reference| {
        if reference.starts_with("http")
            || reference.starts_with("data:")
            || reference.starts_with("misty-img:")
        {
            return false;
        }
        let clean = reference.split('?').next().unwrap_or(&reference);
        let decoded = urlencoding::decode(clean).unwrap_or_else(|_| clean.into());
        let candidate = Path::new(decoded.as_ref());
        let candidate = if candidate.is_absolute() {
            candidate.to_path_buf()
        } else {
            parent.join(candidate)
        };
        candidate
            .canonicalize()
            .map(|resolved| resolved == image)
            .unwrap_or(false)
    });
    if referenced {
        Ok(())
    } else {
        Err("图片未被当前 Markdown 文档引用".into())
    }
}

fn encode_image(path: &Path) -> Result<String, String> {
    ensure_image_file(path)?;
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("png");
    let mime = match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub async fn import_to_library(
    access: State<'_, ExternalFileAccess>,
    source_path: String,
    library_root: String,
    target_dir: String,
) -> Result<String, String> {
    let source = access.resolve_import(&source_path)?;
    let guard = WorkspaceGuard::new(&library_root)?;
    let destination = if target_dir.is_empty() {
        guard.root().to_path_buf()
    } else {
        guard.resolve_directory(&target_dir, false)?
    };
    if !destination.exists() {
        fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    }
    let item_name = source.file_name().ok_or("无效文件名")?;
    let target_path = destination.join(item_name);
    fs::copy(&source, &target_path).map_err(|error| error.to_string())?;
    if let Ok(content) = fs::read_to_string(&source) {
        let parent = source.parent().ok_or("无效路径")?;
        for relative_path in referenced_assets(&content) {
            if relative_path.starts_with("http") || relative_path.starts_with("data:") {
                continue;
            }
            let clean_relative = relative_path
                .split('?')
                .next()
                .unwrap_or(&relative_path)
                .replace("%20", " ");
            let Ok(source_asset) = validate_path_in_root(&parent.join(&clean_relative), parent)
            else {
                continue;
            };
            if source_asset.is_file() {
                let Ok(target_asset) =
                    validate_path_in_root(&destination.join(clean_relative), &destination)
                else {
                    continue;
                };
                if let Some(target_parent) = target_asset.parent() {
                    let _ = fs::create_dir_all(target_parent);
                }
                let _ = fs::copy(source_asset, target_asset);
            }
        }
    }
    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn export_to_html(
    library_root: String,
    path: String,
    html_content: String,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let mut html_path = guard.resolve_existing_file(path, &["md"])?;
    html_path.set_extension("html");
    let html_path = guard.resolve_file_for_write(html_path, &["html"])?;
    write_html(html_path, html_content)
}

#[tauri::command]
pub async fn export_external_to_html(
    access: State<'_, ExternalFileAccess>,
    path: String,
    html_content: String,
) -> Result<(), String> {
    let mut html_path = access.resolve_markdown(path)?;
    html_path.set_extension("html");
    write_html(html_path, html_content)
}

fn write_html(html_path: PathBuf, html_content: String) -> Result<(), String> {
    let document = format!(
        r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export</title><style>body{{padding:40px;max-width:800px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.6;color:#1d1d1f}}pre{{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}}code{{font-family:"Fira Code",monospace;font-size:0.9em}}blockquote{{border-left:3px solid #007aff;padding-left:16px;color:#666;margin:16px 0}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:8px 12px}}img{{max-width:100%}}h1,h2,h3,h4,h5,h6{{margin-top:24px;margin-bottom:12px}}p{{margin:12px 0}}</style></head><body><div class="vditor-reset">{html_content}</div></body></html>"#
    );
    write_utf8(html_path, &document)
}

#[tauri::command]
pub async fn get_file_stats(library_root: String, path: String) -> Result<FileStats, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let path = guard.resolve_existing(path)?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let now = std::time::SystemTime::now();
    let modified_time = metadata.modified().unwrap_or(now);
    let created = metadata
        .created()
        .unwrap_or(modified_time)
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let modified = modified_time
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(FileStats {
        created,
        modified,
        size: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_targets_reject_parent_traversal_and_sanitize_names() {
        let root = std::env::temp_dir().join(format!(
            "longedit-files-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        assert!(validate_path_in_root(&root.join("..").join("outside.md"), &root).is_err());
        assert_eq!(sanitize_filename("a/\\:*?\"<>|b"), "ab");
        assert!(validate_item_name("报告 2026.md").is_ok());
        assert!(validate_item_name("数据.table.json").is_ok());
        assert_eq!(
            validate_item_name("CON.txt").unwrap_err(),
            "名称使用了 Windows 保留名称"
        );
        assert!(validate_item_name("报告?.md").is_err());
        assert!(validate_item_name("尾部空格 ").is_err());
        assert!(validate_item_name("尾部句点.").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workspace_file_filter_rejects_disguised_extensions() {
        assert!(is_workspace_file("diagram.MERMAID"));
        assert!(is_workspace_file("data.table.json"));
        assert!(is_workspace_file("notes.txt"));
        assert!(!is_workspace_file("note.md.exe"));
    }

    #[test]
    fn referenced_assets_cover_markdown_and_html_without_duplicates() {
        let assets = referenced_assets("![a](.assets/x.png) <img src='.assets/x.png'>");
        assert_eq!(assets.len(), 1);
        assert!(assets.contains(".assets/x.png"));
    }

    #[test]
    fn attachment_targets_cannot_escape_import_directory() {
        let root = std::env::temp_dir().join(format!(
            "longedit-assets-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let escaped = root.join("..").join("outside.png");
        assert!(validate_path_in_root(&escaped, &root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn image_reads_require_an_exact_markdown_reference_and_safe_format() {
        let root = std::env::temp_dir().join(format!(
            "longedit-image-reference-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let assets = root.join("assets");
        fs::create_dir_all(&assets).unwrap();
        let document = root.join("note.md");
        let referenced = assets.join("referenced image.png");
        let unrelated = assets.join("unrelated.png");
        let svg = assets.join("active.svg");
        fs::write(&document, "![chart](assets/referenced%20image.png)").unwrap();
        fs::write(&referenced, [137, 80, 78, 71]).unwrap();
        fs::write(&unrelated, [137, 80, 78, 71]).unwrap();
        fs::write(&svg, "<svg/>").unwrap();

        assert!(ensure_markdown_references_image(&document, &referenced).is_ok());
        assert!(ensure_markdown_references_image(&document, &unrelated).is_err());
        assert!(ensure_image_file(&svg).is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn folder_metadata_access_stays_inside_workspace() {
        let base = std::env::temp_dir().join(format!(
            "longedit-folder-guard-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = base.join("workspace");
        let outside = base.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        assert!(get_folder_order(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned()
        )
        .is_err());
        let guard = WorkspaceGuard::new(&root).unwrap();
        assert!(reject_workspace_root(guard.root(), &guard).is_err());

        fs::remove_dir_all(base).unwrap();
    }
}
