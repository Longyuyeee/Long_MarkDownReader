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
}

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
    path.push("MistyLibrary");
    let default_path = path.to_string_lossy().into_owned();
    AppConfig {
        libraries: vec![LibraryConfig { name: "默认文件库".into(), path: default_path.clone() }],
        active_library_path: default_path,
        theme: "system".into(),
        code_theme: "github".into(),
        editor_mode: "wysiwyg".into(),
        editor_bg_color: "".into(),
        hero_icon: "BookOpen".into(),
        auto_save_interval: 3,
        max_history_count: 10,
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
        "$regPath = 'Registry::HKEY_CLASSES_ROOT\\.md'; \
         if (-not (Test-Path $regPath)) {{ New-Item -Path $regPath -Force }}; \
         Set-ItemProperty -Path $regPath -Name '' -Value 'MistyEdit.MD'; \
         $shellPath = 'Registry::HKEY_CLASSES_ROOT\\MistyEdit.MD\\shell\\open\\command'; \
         if (-not (Test-Path $shellPath)) {{ New-Item -Path $shellPath -Force }}; \
         Set-ItemProperty -Path $shellPath -Name '' -Value '\"{}\" \"%1\"'",
        exe_str
    );
    Command::new("powershell").args(["-Command", &script]).output().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_new_file(library_root: String, target_dir: Option<String>) -> Result<String, String> {
    let root = if let Some(dir) = target_dir { PathBuf::from(dir) } else { PathBuf::from(&library_root) };
    if !root.exists() { fs::create_dir_all(&root).map_err(|e| e.to_string())?; }
    let mut index = 0;
    let mut file_path;
    loop {
        let name = if index == 0 { "未命名.md".to_string() } else { format!("未命名 {}.md", index) };
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
    
    // 同步迁移历史记录文件夹
    let old_history = get_history_dir(&app_handle, &old_path);
    if old_history.exists() {
        let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy());
        let _ = fs::rename(old_history, new_history);
    }
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

    // 同步迁移历史记录文件夹
    let old_history = get_history_dir(&app_handle, &source_path);
    if old_history.exists() {
        let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy());
        let _ = fs::rename(old_history, new_history);
    }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn delete_item(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() { fs::remove_dir_all(p).map_err(|e| e.to_string())?; }
    else { fs::remove_file(p).map_err(|e| e.to_string())?; }

    // 同步清理历史记录
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
async fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_launch_args() -> Vec<String> { std::env::args().collect() }

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.exists() || !root.is_dir() { return Err("目录不存在".into()); }
    let mut entries = Vec::new();
    if let Ok(dir_entries) = fs::read_dir(root) {
        for entry in dir_entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if path.is_dir() || name.ends_with(".md") {
                entries.push(FileEntry { name, path: path.to_string_lossy().into_owned(), is_dir: path.is_dir() });
            }
        }
    }
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir { b.is_dir.cmp(&a.is_dir) } 
        else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) }
    });
    Ok(entries)
}

#[tauri::command]
async fn import_to_library(source_path: String, library_root: String, target_dir: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    // 如果 target_dir 是绝对路径且在库内，则直接使用；否则使用 library_root
    let final_target_dir = if !target_dir.is_empty() { PathBuf::from(&target_dir) } else { PathBuf::from(&library_root) };
    
    if !final_target_dir.exists() { fs::create_dir_all(&final_target_dir).map_err(|e| e.to_string())?; }
    
    let item_name = source.file_name().ok_or("无效的文件名")?;
    let target_item_path = final_target_dir.join(item_name);

    if source.is_dir() {
        // 如果是文件夹，递归拷贝整个结构
        copy_dir_recursive(source, &target_item_path)?;
    } else {
        // 如果是文件，直接拷贝
        fs::copy(source, &target_item_path).map_err(|e| e.to_string())?;
        
        // 处理关联的 .assets 资源文件夹 (Markdown 常见约定)
        let mut assets_name = source.file_stem().unwrap().to_os_string();
        assets_name.push(".assets");
        let source_assets = source.parent().unwrap().join(&assets_name);
        if source_assets.exists() && source_assets.is_dir() {
            let target_assets = final_target_dir.join(&assets_name);
            let _ = copy_dir_recursive(&source_assets, &target_assets);
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
    let file_stem = md_file.file_stem().ok_or("无效文件名")?;
    let mut assets_name = file_stem.to_os_string();
    assets_name.push(".assets");
    let assets_dir = parent.join(assets_name);
    if !assets_dir.exists() { fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?; }
    let img_path = assets_dir.join(&image_name);
    fs::write(&img_path, image_data).map_err(|e| e.to_string())?;
    let mut rel_path = file_stem.to_os_string();
    rel_path.push(".assets/");
    rel_path.push(image_name);
    Ok(rel_path.to_string_lossy().into_owned())
}

fn get_history_dir(app_handle: &tauri::AppHandle, path: &str) -> PathBuf {
    let cache_dir = app_handle.path().app_cache_dir().unwrap().join("history_v2");
    let file_hash = format!("{:x}", md5::compute(path));
    cache_dir.join(file_hash)
}

#[tauri::command]
async fn save_history_version(app_handle: tauri::AppHandle, path: String, content: String, max_count: u32) -> Result<(), String> {
    let file_history_dir = get_history_dir(&app_handle, &path);
    if !file_history_dir.exists() { fs::create_dir_all(&file_history_dir).map_err(|e| e.to_string())?; }

    // 检查最近的一个版本是否内容相同
    let mut entries: Vec<_> = fs::read_dir(&file_history_dir).map_err(|e| e.to_string())?
        .filter_map(|res| res.ok()).collect();
    if !entries.is_empty() {
        entries.sort_by_key(|e| e.metadata().unwrap().modified().unwrap());
        if let Some(last) = entries.last() {
            if let Ok(last_content) = fs::read_to_string(last.path()) {
                // 统一去掉 \r 进行纯内容比对，防止 Windows 换行符干扰
                if last_content.replace("\r", "") == content.replace("\r", "") { return Ok(()); }
            }
        }
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
            if let Some(ts_str) = p.file_stem().and_then(|s| s.to_str()) {
                if let Ok(ts) = ts_str.parse::<u64>() { if let Ok(content) = fs::read_to_string(p) { list.push((ts, content)); } }
            }
        }
    }
    list.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(list)
}

#[tauri::command]
async fn delete_history_version(app_handle: tauri::AppHandle, path: String, timestamp: u64) -> Result<(), String> {
    let file_path = get_history_dir(&app_handle, &path).join(format!("{}.md", timestamp));
    if file_path.exists() { fs::remove_file(file_path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
async fn clear_all_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("history_v2");
    if cache_dir.exists() { fs::remove_dir_all(cache_dir).map_err(|e| e.to_string())?; }
    Ok(())
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
    if let Some(title_element) = fragment.select(&selector).next() {
        Ok(title_element.inner_html().trim().to_string())
    } else { Ok(url) }
}

#[tauri::command]
async fn search_library(library_root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    let root = Path::new(&library_root);
    if !root.exists() { return Ok(results); }
    search_recursive(root, &query, &mut results);
    Ok(results)
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<FileEntry>) {
    if let Ok(entries) = fs::read_dir(dir) {
        let query_lower = query.to_lowercase();
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            
            if path.is_dir() { 
                search_recursive(&path, query, results); 
            } else if name.ends_with(".md") {
                let name_matches = name.to_lowercase().contains(&query_lower);
                let content_matches = if !name_matches {
                    fs::read_to_string(&path)
                        .map(|c| c.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
                } else {
                    false
                };

                if name_matches || content_matches {
                    results.push(FileEntry { 
                        name: name.into_owned(), 
                        path: path.to_string_lossy().into_owned(), 
                        is_dir: false 
                    });
                }
            }
        }
    }
}

#[tauri::command]
async fn export_to_html(path: String, html_content: String) -> Result<(), String> {
    let mut html_path = PathBuf::from(&path);
    html_path.set_extension("html");
    let full_html = format!(r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vditor/dist/index.css" /><style>body {{ padding: 40px; max-width: 800px; margin: 0 auto; font-family: sans-serif; }}</style></head><body><div class="vditor-reset">{}</div></body></html>"#, html_content);
    fs::write(html_path, full_html).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.len() > 1 { let _ = app.emit("open-file", args[1].clone()); }
        }))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "windows")]
            { if let Err(_) = apply_mica(&window, None) { let _ = apply_blur(&window, Some((0, 0, 0, 0))); } }
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quick_i = MenuItem::with_id(app, "quick", "快速笔记", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quick_i, &show_i, &quit_i])?;
            let _tray = TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).menu(&menu)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "quit" => { app.exit(0); }
                    "show" => { let win = app.get_webview_window("main").unwrap(); let _ = win.show(); let _ = win.set_focus(); }
                    "quick" => { 
                        let _ = tauri::WebviewWindowBuilder::new(app, "quick-note", tauri::WebviewUrl::App("#/quick-note".into()))
                            .title("快速笔记").inner_size(400.0, 300.0).always_on_top(true).decorations(false).transparent(true).build();
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
                    if let TrayIconEvent::Click { .. } = event {
                        let win = tray.app_handle().get_webview_window("main").unwrap();
                        let _ = win.show(); let _ = win.set_focus();
                    }
                }).build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown_file, write_markdown_file, get_launch_args, scan_directory, 
            import_to_library, save_image, save_shadow_copy, get_url_title, search_library, 
            export_to_html, get_config, save_config, create_new_file, create_new_folder,
            rename_item, delete_item, move_item, set_as_default_handler,
            save_history_version, list_history, delete_history_version, clear_all_history
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
