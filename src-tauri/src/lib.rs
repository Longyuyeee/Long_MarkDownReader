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
use std::sync::LazyLock;
use std::io::Write;

static RE_MD_IMG: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"!\[(?:[^\]]*)\]\(([^)\s]+)").unwrap()
});
static RE_HTML_IMG: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<img[^>]*\ssrc\s*=\s*["']([^"']+)["']"#).unwrap()
});
static RE_TAG: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?:^|\s)#([^\s#`\[\]()]+)").unwrap()
});

// 路径安全验证：确保文件路径在允许的根目录范围内，防止路径穿越攻击
fn validate_path_in_root(path: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize()
        .or_else(|_| {
            // 如果文件不存在，尝试规范化父目录
            if let Some(parent) = path.parent() {
                let parent_canonical = parent.canonicalize()
                    .map_err(|e| format!("路径验证失败: {}", e))?;
                Ok(parent_canonical.join(path.file_name().ok_or("无效文件名")?))
            } else {
                Err(format!("无效路径: {}", path.display()))
            }
        })?;

    let canonical_root = root.canonicalize()
        .map_err(|e| format!("根目录不存在: {}", e))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!("安全错误：路径超出允许范围"));
    }

    Ok(canonical_path)
}

// 过滤文件名中的非法字符，防止注入攻击
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
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

fn default_git_branch() -> String { "main".into() }

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub git_enabled: bool,
    #[serde(default)]
    pub git_remote: String,
    #[serde(default = "default_git_branch")]
    pub git_branch: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
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
    pub is_autostart: bool,
    #[serde(default = "default_exit_strategy")]
    pub exit_strategy: String,
    #[serde(default = "default_visual_style")]
    pub visual_style: String,
    #[serde(default = "default_motion_speed")]
    pub motion_speed: String,
    pub ai_enabled: bool,
    #[serde(default = "default_ai_provider")]
    pub ai_provider: String,
    #[serde(default = "default_ai_endpoint")]
    pub ai_endpoint: String,
    #[serde(default)]
    pub ai_api_key: String,
    #[serde(default = "default_ai_model")]
    pub ai_model: String,
}

fn default_visual_style() -> String { "soft".into() }
fn default_motion_speed() -> String { "calm".into() }
fn default_ai_provider() -> String { "openai".into() }
fn default_ai_endpoint() -> String { "https://api.openai.com/v1".into() }
fn default_ai_model() -> String { "gpt-4o-mini".into() }

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
            visual_style: default_visual_style(),
            motion_speed: default_motion_speed(),
            ai_enabled: false,
            ai_provider: default_ai_provider(),
            ai_endpoint: default_ai_endpoint(),
            ai_api_key: String::new(),
            ai_model: default_ai_model(),
        }
    }
}

#[tauri::command]
fn get_config(app_handle: tauri::AppHandle) -> AppConfig {
    let config_dir = match app_handle.path().app_config_dir() {
        Ok(d) => d,
        Err(_) => return get_default_config(&app_handle),
    };
    let config_path = config_dir.join("config.json");
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
        libraries: vec![LibraryConfig { name: "默认知识库".into(), path: default_path.clone(), ..Default::default() }],
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
        visual_style: default_visual_style(),
        motion_speed: default_motion_speed(),
        ai_enabled: false,
        ai_provider: default_ai_provider(),
        ai_endpoint: default_ai_endpoint(),
        ai_api_key: String::new(),
        ai_model: default_ai_model(),
    }
}

#[tauri::command]
fn save_config(app_handle: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let config_dir = app_handle.path().app_config_dir().map_err(|e| format!("config dir error: {}", e))?;
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
    let library_path = PathBuf::from(&library_root);
    let root = if let Some(dir) = target_dir {
        let target_path = PathBuf::from(&dir);
        validate_path_in_root(&target_path, &library_path)?
    } else {
        library_path.clone()
    };

    if !root.exists() { fs::create_dir_all(&root).map_err(|e| e.to_string())?; }
    let mut index = 0;
    let base_name = sanitize_filename(&prefix.unwrap_or_else(|| "未命名".to_string()));
    if base_name.is_empty() {
        return Err("文件名不能为空".into());
    }

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
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("文件名包含非法字符".into());
    }
    let old = Path::new(&old_path);
    let parent = old.parent().ok_or("无效路径")?;
    let new_path = parent.join(&new_name);
    // 防止路径穿越：确保 new_path 的父目录与原 parent 一致
    if new_path.parent() != Some(parent) {
        return Err("文件名包含非法字符".into());
    }
    fs::rename(old, &new_path).map_err(|e| e.to_string())?;
    let old_history = get_history_dir(&app_handle, &old_path)?;
    if old_history.exists() { let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy())?; let _ = fs::rename(old_history, new_history); }
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
    let old_history = get_history_dir(&app_handle, &source_path)?;
    if old_history.exists() { let new_history = get_history_dir(&app_handle, &new_path.to_string_lossy())?; let _ = fs::rename(old_history, new_history); }
    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn delete_item(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() { return Ok(()); }
    if p.is_file() && path.ends_with(".md") {
        if let Ok(content) = fs::read_to_string(p) {
            let parent = p.parent().ok_or_else(|| "invalid parent path".to_string())?;
            let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
            for cap in RE_MD_IMG.captures_iter(&content) { paths.insert(cap[1].to_string()); }
            for cap in RE_HTML_IMG.captures_iter(&content) { paths.insert(cap[1].to_string()); }
            for rel_path in paths {
                if rel_path.starts_with("http") || rel_path.starts_with("data:") { continue; }
                let clean_rel = rel_path.split('?').next().unwrap_or(&rel_path).replace("%20", " ");
                let img_path = parent.join(&clean_rel);
                if img_path.exists() && img_path.is_file() && img_path.starts_with(parent) { let _ = fs::remove_file(img_path); }
            }
        }
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        fs::remove_file(p).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    let history_dir = get_history_dir(&app_handle, &path)?;
    if history_dir.exists() { let _ = fs::remove_dir_all(history_dir); }
    Ok(())
}

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<FileContent, String> {
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let mut detector = EncodingDetector::new();
    detector.feed(&bytes, true);
    let encoding = detector.guess(None, true);
    let (text, _, _) = encoding.decode(&bytes);
    Ok(FileContent { content: text.into_owned(), encoding: encoding.name().to_string(), path })
}

#[tauri::command]
async fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    // 原子写入：先写临时文件，再原子重命名
    let file_path = Path::new(&path);
    let temp_path = file_path.with_extension("md.tmp");

    let mut temp_file = fs::File::create(&temp_path).map_err(|e| format!("创建临时文件失败: {}", e))?;
    temp_file.write_all(content.as_bytes()).map_err(|e| format!("写入失败: {}", e))?;
    temp_file.sync_all().map_err(|e| format!("同步失败: {}", e))?;
    drop(temp_file);

    fs::rename(&temp_path, file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("保存失败: {}", e)
    })?;

    Ok(())
}

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
async fn scan_directory(path: String) -> Result<Vec<FileEntry>, String> {
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
        let parent = source.parent().ok_or_else(|| "invalid parent path".to_string())?;
        let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        for cap in RE_MD_IMG.captures_iter(&content) { paths.insert(cap[1].to_string()); }
        for cap in RE_HTML_IMG.captures_iter(&content) { paths.insert(cap[1].to_string()); }
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

#[tauri::command]
async fn save_image(md_path: String, image_name: String, image_data: Vec<u8>) -> Result<String, String> {
    let md_file = Path::new(&md_path);
    let parent = md_file.parent().ok_or("无效路径")?;

    // 统一存入该目录下的 .assets 隐藏文件夹
    let assets_dir = parent.join(".assets");
    if !assets_dir.exists() { fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?; }

    // 路径穿越防护：剥离目录组件，仅保留文件名
    let image_name = Path::new(&image_name)
        .file_name()
        .ok_or_else(|| "invalid image name".to_string())?
        .to_string_lossy()
        .to_string();

    let img_path = assets_dir.join(&image_name);
    fs::write(&img_path, image_data).map_err(|e| e.to_string())?;

    // 返回标准相对路径
    Ok(format!(".assets/{}", image_name))
}

fn get_history_dir(app_handle: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let cache_dir = app_handle.path().app_cache_dir().map_err(|e| format!("cache dir error: {}", e))?.join("history_v2");
    let file_hash = format!("{:x}", md5::compute(path)); Ok(cache_dir.join(file_hash))
}

fn check_and_migrate_data(app: &tauri::AppHandle) -> Result<(), String> {
    let old_product_name = "Long编辑";
    let new_product_name = "Long编辑";
    let old_identifier = "com.mistyedit.mdhelper";
    let new_identifier = app.config().identifier.clone();

    let resolver = app.path();

    // 1. 处理 identifier 导致的路径差异 (macOS 主要影响)
    if old_identifier != new_identifier {
        let current_config = resolver.app_config_dir().map_err(|e| format!("config dir error: {}", e))?;
        let old_config = PathBuf::from(current_config.to_string_lossy().replace(&new_identifier, old_identifier));
        let current_cache = resolver.app_cache_dir().map_err(|e| format!("cache dir error: {}", e))?;
        let old_cache = PathBuf::from(current_cache.to_string_lossy().replace(&new_identifier, old_identifier));

        if old_config.exists() && !current_config.exists() { let _ = fs::create_dir_all(current_config.parent().ok_or_else(|| "invalid parent path".to_string())?); let _ = fs::rename(&old_config, &current_config); }
        if old_cache.exists() && !current_cache.exists() { let _ = fs::create_dir_all(current_cache.parent().ok_or_else(|| "invalid parent path".to_string())?); let _ = fs::rename(&old_cache, &current_cache); }
    }

    // 2. 处理 productName 导致的路径差异 (Windows 主要影响)
    if cfg!(target_os = "windows") {
        let current_config = resolver.app_config_dir().map_err(|e| format!("config dir error: {}", e))?; // 这应该是 .../Long编辑
        let old_config = PathBuf::from(current_config.to_string_lossy().replace(new_product_name, old_product_name));
        let current_cache = resolver.app_cache_dir().map_err(|e| format!("cache dir error: {}", e))?;
        let old_cache = PathBuf::from(current_cache.to_string_lossy().replace(new_product_name, old_product_name));

        if old_config.exists() && !current_config.exists() {
            let _ = fs::create_dir_all(current_config.parent().ok_or_else(|| "invalid parent path".to_string())?);
            let _ = fs::rename(&old_config, &current_config);
        }
        if old_cache.exists() && !current_cache.exists() {
            let _ = fs::create_dir_all(current_cache.parent().ok_or_else(|| "invalid parent path".to_string())?);
            let _ = fs::rename(&old_cache, &current_cache);
        }
    }
    Ok(())
}

#[tauri::command]
async fn save_history_version(app_handle: tauri::AppHandle, path: String, content: String, max_count: u32) -> Result<(), String> {
    let file_history_dir = get_history_dir(&app_handle, &path)?;
    if !file_history_dir.exists() {
        fs::create_dir_all(&file_history_dir).map_err(|e| e.to_string())?;
    }

    // 读取一次目录条目
    let entries: Vec<_> = fs::read_dir(&file_history_dir).map_err(|e| e.to_string())?
        .filter_map(|res| res.ok())
        .collect();

    let content_normalized = content.replace("\r\n", "\n").replace("\r", "\n");

    // 检查 ALL 条目是否存在重复内容
    for entry in &entries {
        if let Ok(entry_content) = fs::read_to_string(entry.path()) {
            let entry_normalized = entry_content.replace("\r\n", "\n").replace("\r", "\n");
            if entry_normalized == content_normalized {
                return Ok(());
            }
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 使用文件名中的时间戳排序（而非 filesystem metadata）
    let mut timestamps: Vec<u64> = entries
        .iter()
        .filter_map(|e| {
            e.path()
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(|s| s.parse::<u64>().ok())
        })
        .collect();

    // 写入新历史版本
    let history_file = file_history_dir.join(format!("{}.md", timestamp));
    fs::write(&history_file, &content).map_err(|e| e.to_string())?;
    timestamps.push(timestamp);

    // 裁剪多余条目
    if timestamps.len() > max_count as usize {
        timestamps.sort();
        let to_remove = timestamps.len() - max_count as usize;
        for ts in timestamps.iter().take(to_remove) {
            let old_file = file_history_dir.join(format!("{}.md", ts));
            let _ = fs::remove_file(old_file);
        }
    }

    Ok(())
}

#[tauri::command]
async fn list_history(app_handle: tauri::AppHandle, path: String) -> Result<Vec<(u64, String)>, String> {
    let file_history_dir = get_history_dir(&app_handle, &path)?;
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
    let file_path = get_history_dir(&app_handle, &path)?.join(format!("{}.md", timestamp));
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
    let mut shadow_file = shadow_dir; shadow_file.push(format!("{}.md", hash));
    fs::write(shadow_file, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_url_title(url: String) -> Result<String, String> {
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;
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
    search_recursive_impl(dir, query, results, &mut std::collections::HashSet::new())
}

fn search_recursive_impl(dir: &Path, query: &str, results: &mut Vec<FileEntry>, visited: &mut std::collections::HashSet<PathBuf>) {
    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        let query_lower = query.to_lowercase();
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if path.is_dir() { search_recursive_impl(&path, query, results, visited); }
            else if name.ends_with(".md") {
                let name_matches = name.to_lowercase().contains(&query_lower);
                let content_matches = if !name_matches { fs::read_to_string(&path).map(|c| c.to_lowercase().contains(&query_lower)).unwrap_or(false) } else { false };
                if name_matches || content_matches { results.push(FileEntry { name: name.into_owned(), path: path.to_string_lossy().into_owned(), is_dir: false }); }
            }
        }
    }
}

#[tauri::command]
async fn search_all_libraries(app_handle: tauri::AppHandle, query: String) -> Result<Vec<FileEntry>, String> {
    let config = get_config(app_handle);
    let mut results = Vec::new();
    for lib in &config.libraries {
        let root = Path::new(&lib.path);
        if root.exists() { search_recursive(root, &query, &mut results); }
    }
    Ok(results)
}

#[derive(Serialize)]
struct TagEntry {
    tag: String,
    count: usize,
}

#[tauri::command]
async fn get_all_tags(library_root: String) -> Result<Vec<TagEntry>, String> {
    let mut tag_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let root = Path::new(&library_root);
    if root.exists() { collect_tags(root, &mut tag_counts); }
    let mut entries: Vec<TagEntry> = tag_counts.into_iter().map(|(tag, count)| TagEntry { tag, count }).collect();
    entries.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    Ok(entries)
}

#[tauri::command]
async fn search_by_tag(library_root: String, tag: String) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    let root = Path::new(&library_root);
    if root.exists() { search_tag_recursive(root, &tag, &mut results); }
    Ok(results)
}

fn collect_tags(dir: &Path, tag_counts: &mut std::collections::HashMap<String, usize>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() { collect_tags(&p, tag_counts); }
            else if name.ends_with(".md") {
                if let Ok(content) = fs::read_to_string(&p) {
                    for cap in RE_TAG.captures_iter(&content) {
                        let tag = cap[1].to_string();
                        if !tag.is_empty() && !tag.starts_with('#') {
                            *tag_counts.entry(tag).or_insert(0) += 1;
                        }
                    }
                }
            }
        }
    }
}

fn search_tag_recursive(dir: &Path, tag: &str, results: &mut Vec<FileEntry>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() { search_tag_recursive(&p, tag, results); }
            else if name.ends_with(".md") {
                if let Ok(content) = fs::read_to_string(&p) {
                    let tag_pattern = format!(r"(?:^|\s)#{}(?:$|\s|[.,;:!\[\](){{}}])", regex::escape(tag));
                    if let Ok(tag_re) = regex::Regex::new(&tag_pattern) {
                        if tag_re.is_match(&content) {
                            results.push(FileEntry { name: name.into_owned(), path: p.to_string_lossy().into_owned(), is_dir: false });
                        }
                    }
                }
            }
        }
    }
}

#[derive(Serialize)]
struct GraphData {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
}

#[derive(Serialize)]
struct GraphNode {
    id: String,
    title: String,
    path: String,
    size: f64,
}

#[derive(Serialize)]
struct GraphEdge {
    source: String,
    target: String,
}

#[tauri::command]
async fn build_link_graph(library_root: String) -> Result<GraphData, String> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut node_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    let root = Path::new(&library_root);
    if !root.exists() { return Ok(GraphData { nodes, edges }); }

    // 第一次遍历：构建全局文件名索引
    let mut name_to_paths: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    build_filename_index(root, &mut name_to_paths);

    // 第二次遍历：构建节点和边
    build_graph_recursive(root, &mut nodes, &mut edges, &mut node_ids, &name_to_paths);
    Ok(GraphData { nodes, edges })
}

// 构建全局文件名索引
fn build_filename_index(dir: &Path, index: &mut std::collections::HashMap<String, Vec<String>>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() {
                build_filename_index(&p, index);
            } else if name.ends_with(".md") {
                let stem = name.trim_end_matches(".md").to_string();
                let full_path = p.to_string_lossy().to_string();
                index.entry(stem).or_insert_with(Vec::new).push(full_path);
            }
        }
    }
}

fn build_graph_recursive(
    dir: &Path,
    nodes: &mut Vec<GraphNode>,
    edges: &mut Vec<GraphEdge>,
    node_ids: &mut std::collections::HashSet<String>,
    name_to_paths: &std::collections::HashMap<String, Vec<String>>,
) {
    static RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap());
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() {
                build_graph_recursive(&p, nodes, edges, node_ids, name_to_paths);
            } else if name.ends_with(".md") {
                let path_str = p.to_string_lossy().to_string();
                let title = name.trim_end_matches(".md").to_string();
                let id = path_str.clone();
                if node_ids.insert(id.clone()) {
                    let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0) as f64;
                    nodes.push(GraphNode { id: id.clone(), title, path: path_str.clone(), size: (size / 100.0).clamp(5.0, 30.0) });
                }
                if let Ok(content) = fs::read_to_string(&p) {
                    for cap in RE.captures_iter(&content) {
                        let target_title = cap[1].trim().to_string();
                        let target_id = resolve_wikilink(&target_title, name_to_paths, dir);
                        edges.push(GraphEdge { source: id.clone(), target: target_id });
                    }
                }
            }
        }
    }
}

// 解析 wikilink 到实际文件路径
fn resolve_wikilink(link: &str, name_to_paths: &std::collections::HashMap<String, Vec<String>>, current_dir: &Path) -> String {
    // 处理绝对路径（Windows 盘符或 Unix 根路径）
    if link.contains(':') || link.starts_with('/') || link.starts_with('\\') {
        return link.to_string();
    }

    // 处理带路径分隔符的链接（如 "子目录/文件名"）
    if link.contains('/') || link.contains('\\') {
        let normalized = link.replace('\\', "/");
        let file_name = normalized.split('/').last().unwrap_or(link);

        if let Some(paths) = name_to_paths.get(file_name) {
            // 查找路径中包含完整链接路径的文件
            for p in paths {
                let normalized_path = p.replace('\\', "/");
                if normalized_path.ends_with(&format!("/{}.md", normalized)) || normalized_path.ends_with(&format!("\\{}.md", link)) {
                    return p.clone();
                }
            }
            // 降级：返回第一个同名文件
            return paths[0].clone();
        }
        // 未找到，返回猜测路径（向后兼容）
        return format!("{}.md", link);
    }

    // 纯文件名链接（最常见情况）
    if let Some(paths) = name_to_paths.get(link) {
        if paths.len() == 1 {
            // 唯一匹配，直接返回
            return paths[0].clone();
        }

        // 多个同名文件：优先选择同目录下的文件
        let current_dir_str = current_dir.to_string_lossy();
        for p in paths {
            if p.starts_with(current_dir_str.as_ref()) {
                return p.clone();
            }
        }

        // 无同目录匹配，返回第一个（按字典序最早的）
        return paths[0].clone();
    }

    // 未找到任何匹配，返回相对路径猜测（向后兼容旧行为）
    format!("{}/{}.md", current_dir.to_string_lossy(), link)
}

#[derive(Serialize, Clone)]
struct Backlink {
    title: String,
    path: String,
    context: String,
}

#[tauri::command]
async fn extract_wikilinks(content: String) -> Result<Vec<String>, String> {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").map_err(|e| format!("regex error: {}", e))?;
    let links: Vec<String> = re.captures_iter(&content).map(|c| c[1].trim().to_string()).collect();
    Ok(links)
}

#[tauri::command]
async fn find_backlinks(file_path: String, library_root: String) -> Result<Vec<Backlink>, String> {
    let target_stem = Path::new(&file_path).file_stem().unwrap_or_default().to_string_lossy().to_string();
    let mut results = Vec::new();
    let root = Path::new(&library_root);
    if root.exists() { find_backlinks_recursive(root, &target_stem, &mut results); }
    Ok(results)
}

fn find_backlinks_recursive(dir: &Path, target: &str, results: &mut Vec<Backlink>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() { find_backlinks_recursive(&p, target, results); }
            else if name.ends_with(".md") {
                if let Ok(content) = fs::read_to_string(&p) {
                    if content.contains(&format!("[[{}", target)) || content.contains(&format!("[[{}|", target)) {
                        let Ok(re) = regex::Regex::new(&format!(r"\[\[{}[\]|]", regex::escape(target))) else { continue; };
                        let snippet = re.find(&content).map(|m| {
                            let start = m.start().saturating_sub(20);
                            let end = (m.end() + 30).min(content.len());
                            content[start..end].replace('\n', " ")
                        }).unwrap_or_default();
                        let display = name.trim_end_matches(".md").to_string();
                        results.push(Backlink { title: display, path: p.to_string_lossy().into_owned(), context: snippet });
                    }
                }
            }
        }
    }
}

#[derive(Serialize)]
struct LibraryStats {
    file_count: usize,
    total_chars: usize,
    total_words: usize,
}

#[tauri::command]
async fn get_library_stats(path: String) -> Result<LibraryStats, String> {
    let root = Path::new(&path);
    if !root.exists() { return Ok(LibraryStats { file_count: 0, total_chars: 0, total_words: 0 }); }
    let mut stats = LibraryStats { file_count: 0, total_chars: 0, total_words: 0 };
    count_stats(root, &mut stats);
    Ok(stats)
}

fn count_stats(dir: &Path, stats: &mut LibraryStats) {
    count_stats_impl(dir, stats, &mut std::collections::HashSet::new())
}

fn count_stats_impl(dir: &Path, stats: &mut LibraryStats, visited: &mut std::collections::HashSet<PathBuf>) {
    let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name.ends_with(".assets") { continue; }
            if p.is_dir() { count_stats_impl(&p, stats, visited); }
            else if name.ends_with(".md") {
                stats.file_count += 1;
                if let Ok(content) = fs::read_to_string(&p) {
                    stats.total_chars += content.chars().count();
                    stats.total_words += content.split_whitespace().count();
                }
            }
        }
    }
}

#[tauri::command]
async fn export_to_html(path: String, html_content: String) -> Result<(), String> {
    let mut html_path = PathBuf::from(&path); html_path.set_extension("html");
    let full_html = format!(r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Export</title><style>body{{padding:40px;max-width:800px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.6;color:#1d1d1f}}pre{{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}}code{{font-family:"Fira Code",monospace;font-size:0.9em}}blockquote{{border-left:3px solid #007aff;padding-left:16px;color:#666;margin:16px 0}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:8px 12px}}img{{max-width:100%}}h1,h2,h3,h4,h5,h6{{margin-top:24px;margin-bottom:12px}}p{{margin:12px 0}}</style></head><body><div class="vditor-reset">{}</div></body></html>"#, html_content);
    fs::write(html_path, full_html).map_err(|e| e.to_string())
}

#[tauri::command]
async fn move_items(app_handle: tauri::AppHandle, source_paths: Vec<String>, target_dir: String) -> Result<(), String> { for source_path in source_paths { let _ = move_item(app_handle.clone(), source_path, target_dir.clone()).await?; } Ok(()) }

#[tauri::command]
async fn delete_items(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> { for path in paths { delete_item(app_handle.clone(), path).await?; } Ok(()) }

#[derive(Serialize, Deserialize, Clone)]
struct AiChatMessage { role: String, content: String }

#[derive(Serialize)]
struct AiChatRequest { model: String, messages: Vec<AiChatMessage>, stream: bool }

#[derive(Deserialize)]
struct AiChatResponse { choices: Vec<AiChatChoice> }

#[derive(Deserialize)]
struct AiChatChoice { message: AiChatMessage }

#[tauri::command]
async fn ai_chat_completion(
    api_key: String,
    endpoint: String,
    model: String,
    system_prompt: String,
    user_content: String,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let body = AiChatRequest {
        model,
        messages: vec![
            AiChatMessage { role: "system".into(), content: system_prompt },
            AiChatMessage { role: "user".into(), content: user_content },
        ],
        stream: false,
    };
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build().map_err(|e| format!("客户端创建失败: {}", e))?;
    let resp = client.post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await.map_err(|e| format!("请求失败: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("API 错误 ({}): {}", status, err_text));
    }
    let completion: AiChatResponse = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    completion.choices.into_iter().next().map(|c| c.message.content).ok_or_else(|| "API 未返回有效结果".into())
}

#[derive(Serialize)]
struct GitStatus { initialized: bool, branch: String, remote: String, ahead: i32, behind: i32, dirty_count: i32, last_commit: String }

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.args(args).current_dir(path);
    #[cfg(target_os = "windows")] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    let output = cmd.output().map_err(|e| format!("git 命令失败: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn git_status(library_path: String) -> GitStatus {
    let path = library_path.as_str();
    let initialized = run_git(path, &["rev-parse", "--is-inside-work-tree"]).is_ok();
    if !initialized { return GitStatus { initialized: false, branch: String::new(), remote: String::new(), ahead: 0, behind: 0, dirty_count: 0, last_commit: String::new() }; }
    let branch = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let remote = run_git(path, &["remote", "get-url", "origin"]).unwrap_or_default();
    let behind = run_git(path, &["rev-list", "--count", &format!("HEAD..origin/{}", branch)]).ok().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ahead = run_git(path, &["rev-list", "--count", &format!("origin/{}..HEAD", branch)]).ok().and_then(|v| v.parse().ok()).unwrap_or(0);
    let dirty = run_git(path, &["status", "--porcelain"]).map(|s| s.lines().count() as i32).unwrap_or(0);
    let last = run_git(path, &["log", "-1", "--format=%s"]).unwrap_or_default();
    GitStatus { initialized: true, branch, remote, ahead, behind, dirty_count: dirty, last_commit: last }
}

#[tauri::command]
fn git_init(library_path: String, remote: String, branch: String) -> Result<String, String> {
    run_git(&library_path, &["init"])?;
    run_git(&library_path, &["checkout", "-b", &branch])?;
    if !remote.is_empty() { run_git(&library_path, &["remote", "add", "origin", &remote])?; }
    Ok("仓库已初始化".into())
}

#[tauri::command]
fn git_commit(library_path: String, message: String) -> Result<String, String> {
    run_git(&library_path, &["add", "-A"])?;
    run_git(&library_path, &["commit", "-m", &message])?;
    Ok("已提交".into())
}

#[tauri::command]
fn git_push(library_path: String) -> Result<String, String> {
    let branch = run_git(&library_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    run_git(&library_path, &["push", "-u", "origin", &branch])?;
    Ok("推送成功".into())
}

#[tauri::command]
fn git_pull(library_path: String) -> Result<String, String> {
    run_git(&library_path, &["pull", "--rebase"])?;
    Ok("拉取成功".into())
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) { app_handle.exit(0); }

#[derive(Serialize)]
struct FileStats {
    created: u64,
    modified: u64,
    size: u64,
}

#[tauri::command]
async fn get_file_stats(path: String) -> Result<FileStats, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let created = metadata.created().unwrap_or(metadata.modified().unwrap_or(std::time::SystemTime::now()))
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let modified = metadata.modified().unwrap_or(std::time::SystemTime::now())
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    Ok(FileStats { created, modified, size: metadata.len() })
}

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
                        let response = tauri::http::Response::builder().header("Content-Type", mime).header("Access-Control-Allow-Origin", "*").body(data)
                            .unwrap_or_else(|_| tauri::http::Response::builder().status(500).body(Vec::<u8>::new()).unwrap());
                        responder.respond(response);
                    }
                    Err(_) => responder.respond(tauri::http::Response::builder().status(404).body(Vec::<u8>::new())
                        .unwrap_or_else(|_| tauri::http::Response::builder().status(500).body(Vec::<u8>::new()).unwrap())),
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
            let _ = check_and_migrate_data(app.handle());
            let window = app.get_webview_window("main").ok_or_else(|| "main window not found".to_string())?;

            // 根据启动参数控制窗口显示：手动启动则显示窗口，自启参数 --minimized 则保持隐藏
            let args: Vec<String> = std::env::args().collect();
            if !args.contains(&"--minimized".to_string()) {
                let _ = window.show();
                let _ = window.set_focus();
            }

            #[cfg(target_os = "windows")] { if apply_mica(&window, None).is_err() { let _ = apply_blur(&window, Some((0, 0, 0, 0))); } }
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quick_i = MenuItem::with_id(app, "quick", "快速笔记", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quick_i, &show_i, &quit_i])?;
            let default_icon = app.default_window_icon().ok_or_else(|| "no default icon".to_string())?.clone();
            let _tray = TrayIconBuilder::new()
                .icon(default_icon)
                .tooltip("Long编辑 · MD助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        let Some(win) = app.get_webview_window("main") else { return; };
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                    "quick" => {
                        let _ = tauri::WebviewWindowBuilder::new(
                            app,
                            "quick-note",
                            tauri::WebviewUrl::App("#/quick-note".into()),
                        )
                        .title("快速笔记")
                        .inner_size(400.0, 300.0)
                        .always_on_top(true)
                        .decorations(false)
                        .transparent(true)
                        .build();
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let Some(win) = tray.app_handle().get_webview_window("main") else { return; };
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ read_markdown_file, write_markdown_file, get_launch_args, scan_directory, get_folder_order, save_folder_order, import_to_library, save_image, save_shadow_copy, get_url_title, search_library, export_to_html, get_config, save_config, create_new_file, create_new_folder, rename_item, delete_item, delete_items, move_item, move_items, set_as_default_handler, check_association_status, save_history_version, list_history, delete_history_version, clear_all_history, exit_app, ai_chat_completion, git_status, git_init, git_commit, git_push, git_pull, get_image_base64, get_file_stats, search_all_libraries, get_library_stats, extract_wikilinks, find_backlinks, get_all_tags, search_by_tag, build_link_graph ])
        .run(tauri::generate_context!()).expect("error");
}
