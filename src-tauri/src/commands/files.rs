use crate::commands::history::history_dir;
use crate::services::reliable_write::{recover_interrupted_write, write_bytes, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use chardetng::EncodingDetector;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static RE_MD_IMG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"!\[(?:[^\]]*)\]\(([^)\s]+)").unwrap());
static RE_HTML_IMG: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"<img[^>]*\ssrc\s*=\s*["']([^"']+)["']"#).unwrap());

pub(crate) fn validate_path_in_root(path: &Path, root: &Path) -> Result<PathBuf, String> {
    WorkspaceGuard::new(root)?.resolve_for_write(path)
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
pub async fn create_new_folder(parent_path: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    if !parent.exists() {
        return Err("父目录不存在".into());
    }
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
    old_path: String,
    new_name: String,
) -> Result<String, String> {
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("文件名包含非法字符".into());
    }
    let old = Path::new(&old_path);
    let parent = old.parent().ok_or("无效路径")?;
    let new_path = parent.join(&new_name);
    if new_path.parent() != Some(parent) {
        return Err("文件名包含非法字符".into());
    }
    fs::rename(old, &new_path).map_err(|error| error.to_string())?;
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
    source_path: String,
    target_dir: String,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_dir);
    if !target.is_dir() {
        return Err("目标必须是一个文件夹".into());
    }
    let file_name = source.file_name().ok_or("无效文件名")?;
    let new_path = target.join(file_name);
    if new_path.exists() {
        return Err("目标目录已存在同名项".into());
    }
    fs::rename(source, &new_path).map_err(|error| error.to_string())?;
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
    source_paths: Vec<String>,
    target_dir: String,
) -> Result<(), String> {
    for source_path in source_paths {
        move_item(app_handle.clone(), source_path, target_dir.clone()).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_item(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Ok(());
    }
    if target.is_file() && path.ends_with(".md") {
        delete_local_markdown_assets(target)?;
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|error| format!("删除目录失败: {error}"))?;
    } else {
        fs::remove_file(target).map_err(|error| format!("删除文件失败: {error}"))?;
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
pub async fn delete_items(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        delete_item(app_handle.clone(), path).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<FileContent, String> {
    recover_interrupted_write(&path)?;
    let bytes = fs::read(&path).map_err(|error| format!("读取文件失败: {error}"))?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Ok(FileContent {
        content: text.into_owned(),
        encoding: encoding.name().to_string(),
        path,
    })
}

#[tauri::command]
pub async fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    write_utf8(path, &content)
}

#[tauri::command]
pub fn get_launch_args() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
pub fn get_folder_order(path: String) -> FolderOrder {
    let order_path = Path::new(&path).join(".misty_order.json");
    let _ = recover_interrupted_write(&order_path);
    if order_path.exists() {
        serde_json::from_str(&fs::read_to_string(order_path).unwrap_or_default())
            .unwrap_or_default()
    } else {
        FolderOrder::default()
    }
}

#[tauri::command]
pub fn save_folder_order(path: String, order: FolderOrder) -> Result<(), String> {
    let order_path = Path::new(&path).join(".misty_order.json");
    let content = serde_json::to_string_pretty(&order).map_err(|error| error.to_string())?;
    write_utf8(order_path, &content)
}

#[tauri::command]
pub async fn scan_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err("目录不存在".into());
    }
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
    let order = get_folder_order(path);
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
    let name = name.to_lowercase();
    [
        ".md",
        ".canvas",
        ".mmd",
        ".mermaid",
        ".pdf",
        ".csv",
        ".tsv",
        ".xlsx",
        ".table.json",
    ]
    .iter()
    .any(|extension| name.ends_with(extension))
}

#[tauri::command]
pub async fn get_image_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let extension = Path::new(&path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("png");
    let mime = match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub async fn import_to_library(
    source_path: String,
    library_root: String,
    target_dir: String,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    let destination = if target_dir.is_empty() {
        PathBuf::from(&library_root)
    } else {
        validate_path_in_root(Path::new(&target_dir), Path::new(&library_root))?
    };
    if !destination.exists() {
        fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    }
    let item_name = source.file_name().ok_or("无效文件名")?;
    let target_path = destination.join(item_name);
    fs::copy(source, &target_path).map_err(|error| error.to_string())?;
    if let Ok(content) = fs::read_to_string(source) {
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
pub async fn save_image(
    md_path: String,
    image_name: String,
    image_data: Vec<u8>,
) -> Result<String, String> {
    let parent = Path::new(&md_path).parent().ok_or("无效路径")?;
    let assets_dir = parent.join(".assets");
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;
    }
    let image_name = Path::new(&image_name)
        .file_name()
        .ok_or("无效图片名称")?
        .to_string_lossy()
        .to_string();
    write_bytes(assets_dir.join(&image_name), &image_data)?;
    Ok(format!(".assets/{image_name}"))
}

#[tauri::command]
pub async fn export_to_html(path: String, html_content: String) -> Result<(), String> {
    let mut html_path = PathBuf::from(path);
    html_path.set_extension("html");
    let document = format!(
        r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export</title><style>body{{padding:40px;max-width:800px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.6;color:#1d1d1f}}pre{{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}}code{{font-family:"Fira Code",monospace;font-size:0.9em}}blockquote{{border-left:3px solid #007aff;padding-left:16px;color:#666;margin:16px 0}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:8px 12px}}img{{max-width:100%}}h1,h2,h3,h4,h5,h6{{margin-top:24px;margin-bottom:12px}}p{{margin:12px 0}}</style></head><body><div class="vditor-reset">{html_content}</div></body></html>"#
    );
    write_utf8(html_path, &document)
}

#[tauri::command]
pub async fn get_file_stats(path: String) -> Result<FileStats, String> {
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
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workspace_file_filter_rejects_disguised_extensions() {
        assert!(is_workspace_file("diagram.MERMAID"));
        assert!(is_workspace_file("data.table.json"));
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
}
