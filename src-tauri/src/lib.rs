use tauri::Manager;
use tauri::Emitter;
use window_vibrancy::{apply_blur, apply_mica};
use std::fs;
use std::path::{Path, PathBuf};
use chardetng::EncodingDetector;
use scraper::{Html, Selector};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use serde::{Serialize, Deserialize};
use std::process::Command;
use base64::{Engine as _, engine::general_purpose};

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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub libraries: Vec<LibraryConfig>,
    pub active_library_path: String,
    pub theme: String, 
    pub code_theme: String,
    pub editor_mode: String,
    pub editor_bg_color: String,
    pub hero_icon: String,
    pub auto_save_interval: u32,
    pub max_history_count: u32,
    #[serde(default)]
    pub is_autostart: bool,
    #[serde(default = "default_exit_strategy")]
    pub exit_strategy: String,
}

fn default_exit_strategy() -> String { "ask".into() }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            libraries: vec![],
            active_library_path: "".into(),
            theme: "system".into(),
            code_theme: "github".into(),
            editor_mode: "wysiwyg".into(),
            editor_bg_color: "".into(),
            hero_icon: "BookOpen".into(),
            auto_save_interval: 3,
            max_history_count: 10,
            is_autostart: false,
            exit_strategy: "ask".into(),
        }
    }
}

#[tauri::command]
fn get_config(app_handle: tauri::AppHandle) -> AppConfig {
    let config_path = app_handle.path().app_config_dir().unwrap().join("config.json");
    if config_path.exists() {
        let content = fs::read_to_string(config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|e| {
            eprintln!("Config parse error: {}, using default", e);
            get_default_config(&app_handle)
        })
    } else {
        get_default_config(&app_handle)
    }
}

fn get_default_config(app_handle: &tauri::AppHandle) -> AppConfig {
    let mut path = app_handle.path().document_dir().unwrap_or_else(|_| PathBuf::from("C:\\"));
    path.push("Long编辑知识库");
    let default_path = path.to_string_lossy().into_owned();
    AppConfig {
        libraries: vec![LibraryConfig { name: "默认知识库".into(), path: default_path.clone() }],
        active_library_path: default_path,
        theme: "system".into(),
        code_theme: "github".into(),
        editor_mode: "wysiwyg".into(),
        editor_bg_color: "".into(),
        hero_icon: "BookOpen".into(),
        auto_save_interval: 3,
        max_history_count: 10,
        is_autostart: false,
        exit_strategy: "ask".into(),
    }
}

#[tauri::command]
fn save_config(app_handle: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let config_dir = app_handle.path().app_config_dir().unwrap();
    if !config_dir.exists() { fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?; }
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_dir.join("config.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_as_default_handler() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_string_lossy().to_string();
    let script = format!(
        "$classesPath = 'Registry::HKEY_CURRENT_USER\\Software\\Classes'; \
         $mdPath = \"$classesPath\\.md\"; \
         $progId = 'Long编辑.MD'; \
         $progIdPath = \"$classesPath\\$progId\"; \
         if (-not (Test-Path $mdPath)) {{ New-Item -Path $mdPath -Force | Out-Null }}; \
         Set-Item -Path $mdPath -Value $progId; \
         if (-not (Test-Path \"$progIdPath\\shell\\open\\command\")) {{ New-Item -Path \"$progIdPath\\shell\\open\\command\" -Force | Out-Null }}; \
         Set-Item -Path $progIdPath -Value 'Markdown 文本文件'; \
         Set-ItemProperty -Path $progIdPath -Name 'FriendlyAppName' -Value 'Long编辑'; \
         Set-Item -Path \"$progIdPath\\shell\\open\\command\" -Value '\"{}\" \"%1\"'",
        exe_str
    );
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    let output = cmd.args(["-Command", &script]).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
    Ok(())
}

#[tauri::command]
fn check_association_status() -> bool {
    let script = "(Get-Item -Path 'Registry::HKEY_CURRENT_USER\\Software\\Classes\\.md' -ErrorAction SilentlyContinue).'(default)'";
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    let output = cmd.args(["-Command", script]).output();
    if let Ok(out) = output {
        let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return val == "Long编辑.MD";
    }
    false
}

#[tauri::command]
async fn create_new_file(library_root: String, target_dir: Option<String>, prefix: Option<String>) -> Result<String, String> {
    let root = if let Some(dir) = target_dir { PathBuf::from(dir) } else { PathBuf::from(&library_root) };
    if !root.exists() { fs::create_dir_all(&root).map_err(|e| e.to_string())?; }
    let mut index = 0;
    let base_name = prefix.unwrap_or_else(|| "未命名".to_string());
    let mut file_path;
    loop {
        let name = if index == 0 { format!("{}.md", base_name) } else { format!("{} {}.md", base_name, index) };
        file_path = root.join(name);
        if !file_path.exists() { break; }
        index += 1;
    }
    fs::write(&file_path, "").map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn create_new_folder(parent_path: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    if !parent.exists() { return Err("父目录不存在".into()); }
    let mut index = 0;
    let mut folder_path;
    loop {
        let name = if index == 0 { "新建文件夹".to_string() } else { format!("新建文件夹 {}", index) };
        folder_path = parent.join(name);
        if !folder_path.exists() { break; }
        index += 1;
    }
    fs::create_dir(&folder_path).map_err(|e| e.to_string())?;
    Ok(folder_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn rename_item(app_handle: tauri::AppHandle, old_path: String, new_name: String) -> Result<String, String> {
    let old = Path::new(&old_path);
    let parent = old.parent().ok_or("无效路径")?;
    let new_path = parent.join(new_name);
    fs::rename(old, &new_path).map_err(|e| e.to_string())?;
    let old_history = get_history_dir(&app_handle, &old_path);
    if old_history.exists() { let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy()); let _ = fs::rename(old_history, new_history); }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn move_item(app_handle: tauri::AppHandle, source_path: String, target_dir: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_dir);
    if !target.is_dir() { return Err("目标必须是一个文件夹".into()); }
    let file_name = source.file_name().ok_or("无效文件名")?;
    let new_path = target.join(file_name);
    if new_path.exists() { return Err("目标目录已存在同名项".into()); }
    fs::rename(source, &new_path).map_err(|e| e.to_string())?;
    let old_history = get_history_dir(&app_handle, &source_path);
    if old_history.exists() { let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy()); let _ = fs::rename(old_history, new_history); }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn delete_item(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() { return Ok(()); }
    if p.is_file() && path.ends_with(".md") {
        if let Ok(content) = fs::read_to_string(p) {
            let parent = p.parent().unwrap();
            let re_md = regex::Regex::new(r"!\[.*?\]\((.*?)\)").unwrap();
            let re_html = regex::Regex::new(r#"<img [^>]*src=["'](.*?)["']"#).unwrap();
            let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
            for cap in re_md.captures_iter(&content) { paths.insert(cap[1].to_string()); }
            for cap in re_html.captures_iter(&content) { paths.insert(cap[1].to_string()); }
            for rel_path in paths {
                if rel_path.starts_with("http") || rel_path.starts_with("data:") { continue; }
                let clean_rel = rel_path.split('?').next().unwrap_or(&rel_path).replace("%20", " ");
                let img_path = parent.join(&clean_rel);
                if img_path.exists() && img_path.is_file() && img_path.starts_with(parent) { let _ = fs::remove_file(img_path); }
            }
        }
    }
    if p.is_dir() { fs::remove_dir_all(p).map_err(|e| e.to_string())?; } else { fs::remove_file(p).map_err(|e| e.to_string())?; }
    let history_dir = get_history_dir(&app_handle, &path);
    if history_dir.exists() { let _ = fs::remove_dir_all(history_dir); }
    Ok(())
}

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<FileContent, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Ok(FileContent { content: text.into_owned(), encoding: encoding.name().to_string(), path })
}

#[tauri::command]
async fn write_markdown_file(path: String, content: String) -> Result<(), String> { fs::write(path, content).map_err(|e| e.to_string()) }

#[tauri::command]
fn get_launch_args() -> Vec<String> { std::env::args().collect() }

#[tauri::command]
fn get_folder_order(path: String) -> FolderOrder {
    let order_path = Path::new(&path).join(".misty_order.json");
    if order_path.exists() {
        let content = fs::read_to_string(order_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        FolderOrder::default()
    }
}

#[tauri::command]
fn save_folder_order(path: String, order: FolderOrder) -> Result<(), String> {
    let order_path = Path::new(&path).join(".misty_order.json");
    let content = serde_json::to_string_pretty(&order).map_err(|e| e.to_string())?;
    fs::write(order_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.exists() || !root.is_dir() { return Err("目录不存在".into()); }
    
    // 1. 物理扫描
    let mut physical_entries = std::collections::HashMap::new();
    if let Ok(dir_entries) = fs::read_dir(root) {
        for entry in dir_entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
            
            let is_resource_folder = p.is_dir() && (
                name == "public" || 
                name == "assets" || 
                name == "img" || 
                name == "images" || 
                name == "static" ||
                name.starts_with('.') || 
                name.ends_with(".assets")
            );

            if is_resource_folder { continue; }
            if p.is_dir() || name.ends_with(".md") {
                physical_entries.insert(name.clone(), FileEntry { 
                    name, 
                    path: p.to_string_lossy().into_owned(), 
                    is_dir: p.is_dir() 
                });
            }
        }
    }

    // 2. 读取逻辑顺序
    let order = get_folder_order(path);
    let mut sorted_entries = Vec::new();
    let mut visited = std::collections::HashSet::new();

    // 优先处理置顶项
    for name in &order.pinned {
        if let Some(entry) = physical_entries.get(name) {
            sorted_entries.push(entry.clone());
            visited.insert(name.clone());
        }
    }

    // 处理排序项
    for name in &order.items {
        if !visited.contains(name) {
            if let Some(entry) = physical_entries.get(name) {
                sorted_entries.push(entry.clone());
                visited.insert(name.clone());
            }
        }
    }

    // 处理剩余的物理文件（按默认排序：文件夹在前，字母顺序）
    let mut remaining: Vec<_> = physical_entries.values()
        .filter(|e| !visited.contains(&e.name))
        .cloned()
        .collect();
    
    remaining.sort_by(|a, b| {
        if a.is_dir != b.is_dir { b.is_dir.cmp(&a.is_dir) } 
        else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) }
    });

    sorted_entries.extend(remaining);
    Ok(sorted_entries)
}

#[tauri::command]
async fn get_image_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let extension = Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("png");
    let mime = match extension.to_lowercase().as_str() { "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "svg" => "image/svg+xml", _ => "image/png" };
    Ok(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
async fn import_to_library(source_path: String, library_root: String, target_dir: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let final_target_dir = if !target_dir.is_empty() { PathBuf::from(&target_dir) } else { PathBuf::from(&library_root) };
    if !final_target_dir.exists() { fs::create_dir_all(&final_target_dir).map_err(|e| e.to_string())?; }
    let item_name = source.file_name().ok_or("无效文件名")?;
    let target_item_path = final_target_dir.join(item_name);
    fs::copy(source, &target_item_path).map_err(|e| e.to_string())?;
    if let Ok(content) = fs::read_to_string(source) {
        let parent = source.parent().unwrap();
        let re_md = regex::Regex::new(r"!\[.*?\]\((.*?)\)").unwrap();
        let re_html = regex::Regex::new(r#"<img [^>]*src=["'](.*?)["']"#).unwrap();
        let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        for cap in re_md.captures_iter(&content) { paths.insert(cap[1].to_string()); }
        for cap in re_html.captures_iter(&content) { paths.insert(cap[1].to_string()); }
        for rel_path in paths {
            if rel_path.starts_with("http") || rel_path.starts_with("data:") { continue; }
            let clean_rel = rel_path.split('?').next().unwrap_or(&rel_path).replace("%20", " ");
            let source_img = parent.join(&clean_rel);
            if source_img.exists() && source_img.is_file() {
                let target_img = final_target_dir.join(&clean_rel);
                if let Some(target_img_parent) = target_img.parent() { let _ = fs::create_dir_all(target_img_parent); }
                let _ = fs::copy(source_img, target_img);
            }
        }
    }
    Ok(target_item_path.to_string_lossy().into_owned())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() { copy_dir_recursive(&entry.path(), &dst.join(entry.file_name()))?; }
        else { fs::copy(entry.path(), dst.join(entry.file_name())).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

#[tauri::command]
async fn save_image(md_path: String, image_name: String, image_data: Vec<u8>) -> Result<String, String> {
    let md_file = Path::new(&md_path);
    let parent = md_file.parent().ok_or("无效路径")?;

    // 统一存入该目录下的 .assets 隐藏文件夹
    let assets_dir = parent.join(".assets");
    if !assets_dir.exists() { fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?; }

    let img_path = assets_dir.join(&image_name);
    fs::write(&img_path, image_data).map_err(|e| e.to_string())?;

    // 返回标准相对路径
    Ok(format!(".assets/{}", image_name))
}

fn get_history_dir(app_handle: &tauri::AppHandle, path: &str) -> PathBuf {
    let cache_dir = app_handle.path().app_cache_dir().unwrap().join("history_v2");
    let file_hash = format!("{:x}", md5::compute(path)); cache_dir.join(file_hash)
}

fn check_and_migrate_data(app: &tauri::AppHandle) {
    let old_product_name = "Long编辑";
    let new_product_name = "Long编辑";
    let old_identifier = "com.mistyedit.mdhelper";
    let new_identifier = app.config().identifier.clone();
    
    let resolver = app.path();
    
    // 1. 处理 identifier 导致的路径差异 (macOS 主要影响)
    if old_identifier != new_identifier {
        let current_config = resolver.app_config_dir().unwrap();
        let old_config = PathBuf::from(current_config.to_string_lossy().replace(&new_identifier, old_identifier));
        let current_cache = resolver.app_cache_dir().unwrap();
        let old_cache = PathBuf::from(current_cache.to_string_lossy().replace(&new_identifier, old_identifier));
        
        if old_config.exists() && !current_config.exists() { let _ = fs::create_dir_all(current_config.parent().unwrap()); let _ = fs::rename(&old_config, &current_config); }
        if old_cache.exists() && !current_cache.exists() { let _ = fs::create_dir_all(current_cache.parent().unwrap()); let _ = fs::rename(&old_cache, &current_cache); }
    }

    // 2. 处理 productName 导致的路径差异 (Windows 主要影响)
    if cfg!(target_os = "windows") {
        let current_config = resolver.app_config_dir().unwrap(); // 这应该是 .../Long编辑
        let old_config = PathBuf::from(current_config.to_string_lossy().replace(new_product_name, old_product_name));
        let current_cache = resolver.app_cache_dir().unwrap();
        let old_cache = PathBuf::from(current_cache.to_string_lossy().replace(new_product_name, old_product_name));

        if old_config.exists() && !current_config.exists() {
            let _ = fs::create_dir_all(current_config.parent().unwrap());
            let _ = fs::rename(&old_config, &current_config);
        }
        if old_cache.exists() && !current_cache.exists() {
            let _ = fs::create_dir_all(current_cache.parent().unwrap());
            let _ = fs::rename(&old_cache, &current_cache);
        }
    }
}

#[tauri::command]
async fn save_history_version(app_handle: tauri::AppHandle, path: String, content: String, max_count: u32) -> Result<(), String> {
    let file_history_dir = get_history_dir(&app_handle, &path);
    if !file_history_dir.exists() { fs::create_dir_all(&file_history_dir).map_err(|e| e.to_string())?; }
    let mut entries: Vec<_> = fs::read_dir(&file_history_dir).map_err(|e| e.to_string())?.filter_map(|res| res.ok()).collect();
    if !entries.is_empty() {
        entries.sort_by_key(|e| e.metadata().unwrap().modified().unwrap());
        if let Some(last) = entries.last() { if let Ok(last_content) = fs::read_to_string(last.path()) { if last_content.replace("\r", "") == content.replace("\r", "") { return Ok(()); } } }
    }
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let history_file = file_history_dir.join(format!("{}.md", timestamp));
    fs::write(history_file, content).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = fs::read_dir(&file_history_dir).map_err(|e| e.to_string())?.filter_map(|res| res.ok()).collect();
    if entries.len() > max_count as usize {
        entries.sort_by_key(|e| e.metadata().unwrap().modified().unwrap());
        for i in 0..(entries.len() - max_count as usize) { let _ = fs::remove_file(entries[i].path()); }
    }
    Ok(())
}

#[tauri::command]
async fn list_history(app_handle: tauri::AppHandle, path: String) -> Result<Vec<(u64, String)>, String> {
    let file_history_dir = get_history_dir(&app_handle, &path);
    if !file_history_dir.exists() { return Ok(vec![]); }
    let mut list = vec![];
    if let Ok(entries) = fs::read_dir(file_history_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ts_str) = p.file_stem().and_then(|s| s.to_str()) { if let Ok(ts) = ts_str.parse::<u64>() { if let Ok(content) = fs::read_to_string(p) { list.push((ts, content)); } } }
        }
    }
    list.sort_by(|a, b| b.0.cmp(&a.0)); Ok(list)
}

#[tauri::command]
async fn delete_history_version(app_handle: tauri::AppHandle, path: String, timestamp: u64) -> Result<(), String> {
    let file_path = get_history_dir(&app_handle, &path).join(format!("{}.md", timestamp));
    if file_path.exists() { fs::remove_file(file_path).map_err(|e| e.to_string())?; } Ok(())
}

#[tauri::command]
async fn clear_all_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("history_v2");
    if cache_dir.exists() { fs::remove_dir_all(cache_dir).map_err(|e| e.to_string())?; } Ok(())
}

#[tauri::command]
async fn save_shadow_copy(app_handle: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?;
    let mut shadow_dir = cache_dir; shadow_dir.push("shadow_cache");
    if !shadow_dir.exists() { fs::create_dir_all(&shadow_dir).map_err(|e| e.to_string())?; }
    let hash = format!("{:x}", md5::compute(path));
    let mut shadow_file = shadow_dir; shadow_file.push(format!("{}.md.tmp", hash));
    fs::write(shadow_file, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_url_title(url: String) -> Result<String, String> {
    let resp = reqwest::blocking::get(&url).map_err(|e| e.to_string())?;
    let body = resp.text().map_err(|e| e.to_string())?;
    let fragment = Html::parse_document(&body);
    let selector = Selector::parse("title").map_err(|_| "解析失败")?;
    if let Some(title_element) = fragment.select(&selector).next() { Ok(title_element.inner_html().trim().to_string()) } else { Ok(url) }
}

#[tauri::command]
async fn search_library(library_root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new(); let root = Path::new(&library_root); if !root.exists() { return Ok(results); }
    search_recursive(root, &query, &mut results); Ok(results)
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<FileEntry>) {
    if let Ok(entries) = fs::read_dir(dir) {
        let query_lower = query.to_lowercase();
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if path.is_dir() { search_recursive(&path, query, results); } 
            else if name.ends_with(".md") {
                let name_matches = name.to_lowercase().contains(&query_lower);
                let content_matches = if !name_matches { fs::read_to_string(&path).map(|c| c.to_lowercase().contains(&query_lower)).unwrap_or(false) } else { false };
                if name_matches || content_matches { results.push(FileEntry { name: name.into_owned(), path: path.to_string_lossy().into_owned(), is_dir: false }); }
            }
        }
    }
}

#[tauri::command]
async fn export_to_html(path: String, html_content: String) -> Result<(), String> {
    let mut html_path = PathBuf::from(&path); html_path.set_extension("html");
    let full_html = format!(r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vditor/dist/index.css" /><style>body {{ padding: 40px; max-width: 800px; margin: 0 auto; font-family: sans-serif; }}</style></head><body><div class="vditor-reset">{}</div></body></html>"#, html_content);
    fs::write(html_path, full_html).map_err(|e| e.to_string())
}

#[tauri::command]
async fn move_items(app_handle: tauri::AppHandle, source_paths: Vec<String>, target_dir: String) -> Result<(), String> { for source_path in source_paths { let _ = move_item(app_handle.clone(), source_path, target_dir.clone()).await?; } Ok(()) }

#[tauri::command]
async fn delete_items(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> { for path in paths { let _ = delete_item(app_handle.clone(), path).await?; } Ok(()) }

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) { app_handle.exit(0); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("misty-img", move |_app, request, responder| {
            let uri = request.uri().to_string();
            let path_part = uri.strip_prefix("misty-img://localhost").unwrap_or(&uri);
            let path_part = path_part.strip_prefix("misty-img:").unwrap_or(path_part);
            let decoded_path = urlencoding::decode(path_part).unwrap_or(std::borrow::Cow::Borrowed(path_part)).into_owned();
            let clean_path = if cfg!(windows) { decoded_path.trim_start_matches('/').to_string() } else { decoded_path };
            std::thread::spawn(move || {
                match fs::read(&clean_path) {
                    Ok(data) => {
                        let extension = Path::new(&clean_path).extension().and_then(|s| s.to_str()).unwrap_or("");
                        let mime = match extension.to_lowercase().as_str() { "jpg" | "jpeg" => "image/jpeg", "png" => "image/png", "gif" => "image/gif", "webp" => "image/webp", "svg" => "image/svg+xml", _ => "application/octet-stream" };
                        let response = tauri::http::Response::builder().header("Content-Type", mime).header("Access-Control-Allow-Origin", "*").body(data).unwrap();
                        responder.respond(response);
                    }
                    Err(_) => responder.respond(tauri::http::Response::builder().status(404).body(Vec::<u8>::new()).unwrap()),
                }
            });
        })
        .plugin(tauri_plugin_fs::init()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_os::init()).plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"]))).plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            if args.len() > 1 {
                let _ = app.emit("open-file", args[1].clone());
            }
        }))
        .on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { if window.label() == "main" { api.prevent_close(); let _ = window.hide(); } } })
        .setup(|app| {
            check_and_migrate_data(app.handle());
            let window = app.get_webview_window("main").unwrap();

            // 根据启动参数控制窗口显示：手动启动则显示窗口，自启参数 --minimized 则保持隐藏
            let args: Vec<String> = std::env::args().collect();
            if !args.contains(&"--minimized".to_string()) {
                let _ = window.show();
                let _ = window.set_focus();
            }

            #[cfg(target_os = "windows")] { if let Err(_) = apply_mica(&window, None) { let _ = apply_blur(&window, Some((0, 0, 0, 0))); } }
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quick_i = MenuItem::with_id(app, "quick", "快速笔记", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quick_i, &show_i, &quit_i])?;
            let _tray = TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Long编辑 · MD助手").menu(&menu)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() { "quit" => { app.exit(0); } "show" => { let win = app.get_webview_window("main").unwrap(); let _ = win.show(); let _ = win.set_focus(); } "quick" => { let _ = tauri::WebviewWindowBuilder::new(app, "quick-note", tauri::WebviewUrl::App("#/quick-note".into())).title("快速笔记").inner_size(400.0, 300.0).always_on_top(true).decorations(false).transparent(true).build(); } _ => {} })
                .on_tray_icon_event(|tray, event| { if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event { let win = tray.app_handle().get_webview_window("main").unwrap(); let _ = win.show(); let _ = win.set_focus(); } }).build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ read_markdown_file, write_markdown_file, get_launch_args, scan_directory, get_folder_order, save_folder_order, import_to_library, save_image, save_shadow_copy, get_url_title, search_library, export_to_html, get_config, save_config, create_new_file, create_new_folder, rename_item, delete_item, delete_items, move_item, move_items, set_as_default_handler, check_association_status, save_history_version, list_history, delete_history_version, clear_all_history, exit_app, get_image_base64 ])
        .run(tauri::generate_context!()).expect("error");
}
