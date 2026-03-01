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

#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub library_path: String,
    pub theme: String, 
}

#[tauri::command]
fn get_config(app_handle: tauri::AppHandle) -> AppConfig {
    let config_path = app_handle.path().app_config_dir().unwrap().join("config.json");
    if config_path.exists() {
        let content = fs::read_to_string(config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| get_default_config(&app_handle))
    } else {
        get_default_config(&app_handle)
    }
}

fn get_default_config(app_handle: &tauri::AppHandle) -> AppConfig {
    let mut path = app_handle.path().document_dir().unwrap_or_else(|_| PathBuf::from("C:\\"));
    path.push("MistyLibrary");
    AppConfig {
        library_path: path.to_string_lossy().into_owned(),
        theme: "system".into(),
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
async fn rename_item(old_path: String, new_name: String) -> Result<String, String> {
    let old = Path::new(&old_path);
    let parent = old.parent().ok_or("无效路径")?;
    let new_path = parent.join(new_name);
    fs::rename(old, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn move_item(source_path: String, target_dir: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_dir);
    if !target.is_dir() { return Err("目标必须是一个文件夹".into()); }
    let file_name = source.file_name().ok_or("无效文件名")?;
    let new_path = target.join(file_name);
    if new_path.exists() { return Err("目标目录已存在同名项".into()); }
    fs::rename(source, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn delete_item(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() { fs::remove_dir_all(p).map_err(|e| e.to_string()) }
    else { fs::remove_file(p).map_err(|e| e.to_string()) }
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
async fn import_to_library(source_path: String, library_root: String, target_subdir: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let mut target_dir = PathBuf::from(&library_root);
    if !target_subdir.is_empty() { target_dir.push(target_subdir); }
    if !target_dir.exists() { fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?; }
    let file_name = source.file_name().ok_or("无效文件名")?;
    let mut target_file_path = target_dir.clone();
    target_file_path.push(file_name);
    fs::copy(source, &target_file_path).map_err(|e| e.to_string())?;
    let mut assets_dir_name = source.file_stem().unwrap().to_os_string();
    assets_dir_name.push(".assets");
    let mut source_assets = source.parent().unwrap().to_path_buf();
    source_assets.push(&assets_dir_name);
    if source_assets.exists() && source_assets.is_dir() {
        let mut target_assets = target_dir.clone();
        target_assets.push(&assets_dir_name);
        let _ = copy_dir_recursive(&source_assets, &target_assets);
    }
    Ok(target_file_path.to_string_lossy().into_owned())
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
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if path.is_dir() { search_recursive(&path, query, results); }
            else if name.ends_with(".md") {
                if name.to_lowercase().contains(&query.to_lowercase()) {
                    results.push(FileEntry { name: name.into_owned(), path: path.to_string_lossy().into_owned(), is_dir: false });
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
            rename_item, delete_item, move_item, set_as_default_handler
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
